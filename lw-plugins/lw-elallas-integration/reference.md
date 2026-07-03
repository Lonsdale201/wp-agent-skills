# lw-elallas-integration — reference

Full extension surface of **Elállás for WooCommerce** (`elallas-for-woo` 1.0.11, `LightweightPlugins\Elallas`). Integrate by consuming these hooks / reading these tables — never by editing the plugin.

## All `elallas_*` hooks

| Hook | Type | Signature | Fires / purpose | Source |
|---|---|---|---|---|
| `elallas_boot` | action | `($plugin)` | After the plugin boots — wire your integration here | Plugin.php:63 |
| `elallas_is_order_eligible` | filter | `(bool $eligible, \WC_Order $order)` | Final gate on whether an order may start a withdrawal | EligibilityChecker.php:67 |
| `elallas_deadline_days` | filter | `(int $days, \WC_Order $order)` | The withdrawal window in days (default `deadline_days` option = 14) | EligibilityChecker.php:119 |
| `elallas_is_order_b2b` | filter | `(bool $is_b2b, \WC_Order $order)` | B2B/B2C classification (default: company OR VAT present) | B2BDetector.php:40 |
| `elallas_delivery_date` | filter | `(mixed $delivery, \WC_Order $order)` | Delivery date used as a deadline basis | Woo/OrderAdapter.php:121 |
| `elallas_case_created` | action | `(int $case_id, int $order_id)` | A withdrawal case was created (status `received`) | Domain/CaseService.php:75 |
| `elallas_case_confirmed` | action | `(int $case_id)` | Customer confirmed (two-step); status now `auto_confirmed` or `manual_review` | Domain/CaseService.php:105 |
| `elallas_case_status_changed` | action | `(int $case_id, string $old_status, string $new_status)` | Any status transition (admin/system) | Domain/CaseService.php:152 |
| `elallas_invoicing_case_created` | action | `(int $case_id, int $order_id)` | Invoicing-integration entry point | Integrations/Invoicing.php:63 |
| `elallas_pdf_html` | filter | `(string $html, array $context)` | Withdrawal PDF HTML before dompdf render | Pdf/PdfRenderer.php:37 |

It also fires the standard WooCommerce email hooks (`woocommerce_email_header` / `woocommerce_email_footer` / `_footer_text`) and uses WPML's `wpml_register_single_string` / `wpml_translate_single_string` for its strings.

## Case lifecycle (CaseStatus)

Values (`includes/Models/CaseStatus.php:17-26`) — validate with `CaseStatus::is_valid()`, label with `CaseStatus::label()`:

```
received          # created
auto_confirmed    # confirmed while deadline is 'within'
manual_review     # confirmed while deadline is expired/unknown
accepted          # admin
rejected          # admin
awaiting_return   # admin — waiting for goods back
goods_received    # admin
refund_pending    # admin — refund due
closed            # admin — terminal
cancelled         # admin/customer — terminal
```

Flow: `received` → (`auto_confirmed` | `manual_review`) → admin moves to any of `accepted`/`rejected`/`awaiting_return`/`goods_received`/`refund_pending`/`closed`/`cancelled`. `DeadlineStatus` (separate, `includes/Models/DeadlineStatus.php:17-19`): `within` / `expired` / `unknown`.

## Order meta the plugin writes (read-only for integrators)

Set in `CaseService::update_order_meta()` (CaseService.php:165-174). Read to discover cases from an order; do not write these yourself.

| Meta key | Value |
|---|---|
| `_lw_elallas_has_case` | `'yes'` once a case exists |
| `_lw_elallas_case_ids` | array of case IDs (ints) |
| `_lw_elallas_deadline_status` | `within` / `expired` / `unknown` |

## Custom tables (schema from includes/Database/Schema.php)

All prefixed `{$wpdb->prefix}lw_elallas_`. `case_id` is a row id in `..._cases`, **not** a post id.

### `lw_elallas_cases` (Schema.php:66-97)
`id`, `case_number` (UNIQUE), `order_id`, `order_number`, `customer_id`, `customer_email_hash` CHAR(64), `customer_email_encrypted` TEXT, `status` (default `received`), `withdrawal_type` (`full`/…), `submitted_at`, `confirmed_at`, `deadline_status` (default `unknown`), `order_created_at`, `order_completed_at`, `delivery_date`, `ip_hash`, `user_agent_hash`, `source_url`, `language`, `assigned_admin_id`, `customer_note` TEXT, `bank_account_encrypted` TEXT, `created_at`, `updated_at`. Keys on `order_id`, `customer_id`, `status`, `deadline_status`.

**Privacy:** email, bank account, IP and user-agent are **hashed/encrypted at rest** — there is no plaintext email column (`customer_email_hash` + `customer_email_encrypted`). Don't expect to `SELECT` a readable email; go through the plugin's data layer if it exposes decryption, or match on the hash.

### `lw_elallas_case_items` (Schema.php:109-126)
`id`, `case_id`, `order_item_id`, `product_id`, `variation_id`, `product_name_snapshot`, `sku_snapshot`, `qty_ordered`, `qty_withdrawn`, `line_total_snapshot` DECIMAL(19,4), `tax_total_snapshot`, `eligibility_flag` (default `eligible`), `eligibility_note`. Snapshots are captured at case creation — they don't change if the product later changes.

### `lw_elallas_events` (audit log, Schema.php:137-149)
`id`, `case_id`, `event_type` (e.g. `case_created`, `case_confirmed`, `status_changed`), `actor_type` (`system`/`admin`/`customer`), `actor_id`, `message` TEXT, `metadata_json` LONGTEXT, `created_at`. Every lifecycle step logs a row here (`EventRepository::log`).

### `lw_elallas_documents` (Schema.php:160-170)
`id`, `case_id`, `document_type` (default `withdrawal_statement`), `file_path`, `file_hash` CHAR(64), `token`, `created_at`.

## LW Site Manager abilities (category `elallas`)

Registered in `includes/SiteManager/Integration.php:34-39` on `lw_site_manager_register_categories` + `lw_site_manager_register_abilities`, with a fallback direct registration on `wp_abilities_api_init` (priority 20) so the abilities exist even if Site Manager's own hooks didn't fire:

- `elallas/get-case`
- `elallas/list-cases`
- `elallas/update-case-status`
- `elallas/get-audit-log`

Prefer these (via LW Site Manager / the WP Abilities API — see `lw-site-manager-overview`, `wp-abilities-api`) over direct table access when you need to read or drive cases programmatically.

## Built-in eligibility (so your `elallas_is_order_eligible` filter composes correctly)

From `EligibilityChecker::check()` (EligibilityChecker.php:32-72), an order is denied by default when any of these hold — your filter runs last and can only be trusted to *narrow* if you `&&` your condition:

- Order status not in `eligible_statuses` option (default `['processing','completed']`).
- An open case already exists for the order.
- A logged-in user is acting on an order that isn't theirs (guests must match the order email).
- Deadline `expired` AND `expired_handling` option = `'block'` (otherwise expiry only flags manual review, never hard-blocks).

## Detection & requirements

- `defined( 'ELALLAS_FOR_WOO_VERSION' )` — active check (constant `'1.0.11'`, `elallas-for-woo.php:31`).
- Namespace `LightweightPlugins\Elallas`; requires WooCommerce 8.0+, PHP 8.0+, WP 6.4+.
- HPOS-safe — hooks hand you a `\WC_Order`; use getters, not post meta.
