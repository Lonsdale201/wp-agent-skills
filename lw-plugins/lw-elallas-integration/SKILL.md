---
name: lw-elallas-integration
description: Integrate with or extend "Elállás for WooCommerce"
  (elallas-for-woo), the LW-family EU/HU withdrawal case-management plugin
  for WooCommerce. Covers its elallas_* hooks, eligibility/deadline/B2B
  /delivery/order-number filters (including elallas_resolve_order_number),
  the 4-arg elallas_case_status_changed lifecycle action, PDF/email hooks,
  multilingual WPML/Polylang output, custom tables/order meta, WooCommerce
  logging, and LW Site Manager abilities. Use when building withdrawal-case
  compatibility, syncing cases to CRM/invoicing, supporting custom order
  numbers, or customizing its PDF/emails without editing the plugin.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elallas-for-woo
plugin-version-tested: "1.0.12"
php-min: "8.0"
last-updated: "2026-07-09"
docs:
  - https://developer.woocommerce.com/docs/features/high-performance-order-storage/
source-refs:
  - wp-content/plugins/elallas-for-woo/elallas-for-woo.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/EligibilityChecker.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/CaseService.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/B2BDetector.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/ProductExclusion.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/OrderSnapshotBuilder.php
  - wp-content/plugins/elallas-for-woo/includes/Woo/OrderAdapter.php
  - wp-content/plugins/elallas-for-woo/includes/Woo/Hooks.php
  - wp-content/plugins/elallas-for-woo/includes/Admin/ProductFields.php
  - wp-content/plugins/elallas-for-woo/includes/Admin/TermFields.php
  - wp-content/plugins/elallas-for-woo/includes/Frontend/Shortcodes.php
  - wp-content/plugins/elallas-for-woo/includes/Frontend/SubmissionContext.php
  - wp-content/plugins/elallas-for-woo/includes/Integrations/Multilingual.php
  - wp-content/plugins/elallas-for-woo/includes/Integrations/Invoicing.php
  - wp-content/plugins/elallas-for-woo/includes/Pdf/PdfRenderer.php
  - wp-content/plugins/elallas-for-woo/includes/Emails/EmailManager.php
  - wp-content/plugins/elallas-for-woo/includes/Support/Logger.php
  - wp-content/plugins/elallas-for-woo/includes/Plugin.php
  - wp-content/plugins/elallas-for-woo/includes/Database/Schema.php
  - wp-content/plugins/elallas-for-woo/includes/Models/CaseStatus.php
  - wp-content/plugins/elallas-for-woo/includes/SiteManager/Integration.php
  - wp-content/plugins/elallas-for-woo/wpml-config.xml
---

# Elállás for WooCommerce — integration & extension

For developers making a plugin/theme work with **Elállás for WooCommerce** (`elallas-for-woo`, by uptools.io) — the online right-of-withdrawal (elállási jog) button + case-management plugin for WooCommerce, built for EU Directive 2023/2673 and 415/2025. (XII. 23.) Korm. rendelet. It manages a **withdrawal "case"** per order in its own tables and fires a small, clean set of `elallas_*` hooks for integrators.

## This is an LW-family plugin — consume hooks, don't edit it

Namespace `LightweightPlugins\Elallas`, tables `wp_lw_elallas_*`, and it integrates with LW Site Manager — it's part of the LightweightPlugins family. **Integrate by consuming its `elallas_*` hooks and reading its data; never patch the plugin.** If you need an extension point that doesn't exist, request it upstream rather than editing.

Detect it:

```php
if ( defined( 'ELALLAS_FOR_WOO_VERSION' ) ) { /* Elállás for WooCommerce active (1.0.12 tested) */ }
```

It requires WooCommerce 8.0+ and is HPOS-safe — every hook hands you a real `\WC_Order`, so use `$order->get_*()` (never post meta) — see `wc-hpos-compatibility`.

## Extension point 1 — eligibility, deadline, B2B & order numbers

The first four filters decide **whether an order may start a withdrawal** and how the deadline is computed; they receive the `\WC_Order`. `elallas_resolve_order_number` runs earlier, before the order exists, and maps the customer-entered display order number to a WooCommerce order ID.

```php
// Final say on eligibility (runs after the built-in checks).
add_filter( 'elallas_is_order_eligible', function ( bool $eligible, \WC_Order $order ): bool {
    // e.g. never allow withdrawal for a "digital-only" order:
    return $eligible && ! my_order_is_digital_only( $order );
}, 10, 2 );

// Override the withdrawal window (default: option 'deadline_days', 14).
add_filter( 'elallas_deadline_days', function ( int $days, \WC_Order $order ): int {
    return my_is_extended_returns_member( $order ) ? 30 : $days;
}, 10, 2 );

// Override the B2B/B2C heuristic (default: true if company name OR VAT number is set).
add_filter( 'elallas_is_order_b2b', function ( bool $is_b2b, \WC_Order $order ): bool {
    return $is_b2b || my_customer_is_business( $order->get_customer_id() );
}, 10, 2 );

// Override the delivery date used as a deadline basis.
add_filter( 'elallas_delivery_date', function ( $delivery, \WC_Order $order ) {
    return my_carrier_delivered_at( $order ) ?: $delivery;
}, 10, 2 );

// Resolve a customer-entered/display order number from another numbering plugin.
add_filter( 'elallas_resolve_order_number', function ( int $order_id, string $number ): int {
    if ( $order_id > 0 ) {
        return $order_id;
    }

    return my_numbering_plugin_find_order_id( $number ) ?: 0; // 0 = let Elállás fall through.
}, 10, 2 );
```

Verified: `elallas_is_order_eligible` at [EligibilityChecker.php:67](EligibilityChecker.php); `elallas_deadline_days` at [:119](EligibilityChecker.php) (default from `Options::get('deadline_days', 14)`); `elallas_is_order_b2b` at [B2BDetector.php:40](B2BDetector.php) (heuristic: company OR VAT filled); `elallas_delivery_date` at [OrderAdapter.php:166](OrderAdapter.php); `elallas_resolve_order_number` at [OrderAdapter.php:65](OrderAdapter.php).

Good to know about the built-in eligibility (so your filter composes correctly): by default only orders whose status is in `eligible_statuses` (default `['processing','completed']`) qualify; an order with an already-open case is refused; logged-in users may only act on their own orders (guests fall back to an email match); and **an expired deadline does NOT hard-block by default** — it's flagged for manual review unless the `expired_handling` option is set to `'block'` ([EligibilityChecker.php:32-72](EligibilityChecker.php)). Your `elallas_is_order_eligible` filter is the final gate, so returning `true` can re-allow something the built-in checks denied — return `$eligible && your_condition` to only ever narrow.

Order identification uses the customer-visible order number, not always the internal WooCommerce order ID. In 1.0.12 the plugin first runs `elallas_resolve_order_number`, then supports WooCommerce Sequential Order Numbers Pro/free via `find_order_by_order_number()`, and only finally falls back to treating the entered value as the native order ID. The order details button passes `$order->get_order_number()` and the prefill keeps non-numeric prefixes/suffixes, so compatibility code must not cast the form value with `absint()`.

## Extension point 2 — react to the case lifecycle

A withdrawal **case** is created, optionally confirmed (two-step flow), then moved through admin statuses. Hook these to sync to a CRM, notify, or trigger invoicing/refund workflows.

```php
// A new withdrawal case was submitted.
add_action( 'elallas_case_created', function ( int $case_id, int $order_id ): void {
    my_crm_open_return_ticket( $case_id, $order_id );
}, 10, 2 );

// The customer confirmed (two-step flow). Status is now auto_confirmed or manual_review.
add_action( 'elallas_case_confirmed', function ( int $case_id ): void { /* ... */ } );

// Any status transition (admin or system).
add_action( 'elallas_case_status_changed', function ( int $case_id, string $old, string $new, string $message ): void {
    if ( 'refund_pending' === $new ) { my_queue_refund( $case_id ); }

    if ( '' !== $message ) {
        my_crm_add_customer_visible_note( $case_id, $message );
    }
}, 10, 4 );

// Fired specifically for invoicing integrations.
add_action( 'elallas_invoicing_case_created', function ( int $case_id, int $order_id ): void { /* ... */ }, 10, 2 );
```

Verified: `elallas_case_created($case_id, $order_id)` at [CaseService.php:83](CaseService.php); `elallas_case_confirmed($case_id)` at [:124](CaseService.php); `elallas_case_status_changed($case_id, $old_status, $new_status, $message)` at [:182](CaseService.php); `elallas_invoicing_case_created` at [Integrations/Invoicing.php:63](Invoicing.php).

The fourth `$message` argument is the optional admin note sent to the customer in the status-update e-mail. It is populated by the admin case detail form; REST and LW Site Manager status updates currently call `change_status()` without that message, so expect an empty string in automation-triggered transitions.

**`$case_id` is a row ID in the custom `wp_lw_elallas_cases` table — NOT a post ID.** Don't call `get_post()`/`get_post_meta()` on it. Read case data through the plugin's repositories/data or the tables (see reference.md). To find cases from an order, read the order meta the plugin writes: `_lw_elallas_has_case` (`'yes'`), `_lw_elallas_case_ids` (array of case IDs), `_lw_elallas_deadline_status` ([CaseService.php:205-213](CaseService.php)). Treat that meta as read-only — let the plugin write it.

### Case statuses (the `CaseStatus` set)

`received` → (`auto_confirmed` if the deadline is `within`, else `manual_review`) → admin moves it to `accepted` / `rejected` / `awaiting_return` / `goods_received` / `refund_pending` / `closed` / `cancelled`. All ten are the valid values `elallas_case_status_changed` will report; validate against them with the plugin's `CaseStatus::is_valid()`. Verified at [CaseStatus.php:17-26](CaseStatus.php). (Separately, `DeadlineStatus` is `within` / `expired` / `unknown`.)

## Product/category/tag withdrawal exceptions

The plugin can mark products, product categories and product tags as excluded from withdrawal using `_lw_elallas_excluded` (`'yes'` / `'no'`) and `_lw_elallas_exclusion_reason` (reason key). Product-level meta wins first; otherwise `ProductExclusion::evaluate()` checks `product_cat` and `product_tag` term meta. Valid reason keys are `unsealed`, `custom`, `digital`, `service`, `hygiene`, `perishable`, `sealed`.

This does **not** auto-block the withdrawal flow. `OrderSnapshotBuilder` writes `eligibility_flag = 'excepted'` and `eligibility_note = <reason label>` into the case-item snapshot so the admin notification, case detail and order panel can flag it for manual review. If your integration imports products or bulk-edits exclusions, use the same meta keys via normal WP meta APIs, keep reason keys in the known set, and let the plugin build the snapshot.

## Extension point 3 — customize the PDF & emails

```php
// Filter the withdrawal PDF HTML before rendering (dompdf).
add_filter( 'elallas_pdf_html', function ( string $html, array $context ): string {
    return str_replace( '{{my_token}}', esc_html( my_value() ), $html );
}, 10, 2 );
```

Verified at [PdfRenderer.php:40](PdfRenderer.php). The plugin's emails render through the standard `woocommerce_email_header` / `woocommerce_email_footer` hooks, so your existing WC email customizations apply — see `wc-emails-classic`.

PDF rendering uses the scoped `LightweightPlugins\Elallas\Vendor\Dompdf\Dompdf` class in release builds and falls back to global `\Dompdf\Dompdf` only for Composer-dependency installs. A PDF failure is logged and returns an empty string; it should not break case creation or e-mail sending.

## Extension point 4 — multilingual output paths

The plugin detects WPML, Polylang and TranslatePress, but the important integration detail is **runtime translation**, not raw option reads. Admin-entered user-facing strings (`button_label`, `confirm_label`, `legal_declaration`, `legal_confirmation`, `email_customer_extra`) are explicitly registered/looked up for WPML and Polylang under the `elallas-for-woo` string context and printed through `Multilingual::translate_option_string()` / `translate_string()` on every output path; TranslatePress can translate the rendered output.

Do not add those option keys as WPML `<admin-texts>` in a compatibility layer. The plugin's `wpml-config.xml` intentionally declares only the withdrawal-exception product/term meta as `copy` and the `[elallas_button]` `label` shortcode attribute as translatable. Declaring the options too would double-register strings and fight the runtime translation path.

The stored `withdrawal_page_id` is resolved through `Multilingual::object_id()` so `[elallas_button]`, the WooCommerce order button and front-end asset loading target the translated withdrawal page. Case submissions store the WPML/Polylang language code, and customer e-mails / status e-mails / PDFs switch to that case language while rendering; admin notifications switch to the shop default language.

## Extension point 5 — `elallas_boot`

```php
add_action( 'elallas_boot', function ( $plugin ): void {
    // Runs once the plugin has booted — safe place to wire your integration.
}, 10, 1 );
```

Verified at [Plugin.php:64](Plugin.php).

## LW Site Manager abilities it exposes

If LW Site Manager is active, the plugin registers a `elallas` ability category with `elallas/get-case`, `elallas/list-cases`, `elallas/update-case-status`, and `elallas/get-audit-log` (via `lw_site_manager_register_abilities` / `lw_site_manager_register_categories`, with a fallback direct registration on `wp_abilities_api_init`). So agents/automation can read and drive cases through Site Manager without touching the tables. Verified at [SiteManager/Integration.php:34-39](Integration.php). See `lw-site-manager-overview` and `wp-abilities-api`.

## WooCommerce logging

The plugin writes to WooCommerce -> Status -> Logs with source `elallas-for-woo`. `warning`/`error` are always written; `notice`/`info`/`debug` require the "Debug logging" option. Context is scrubbed for common PII keys, so integration code should log only identifiers (`case_id`, `order_id`, display `order_number`, status, exception class), never email, IP, user-agent, names, notes or bank-account data.

## Critical rules

- **Never edit the plugin.** Consume `elallas_*` hooks; request missing extension points upstream. (LW-family rule.)
- **Detect with `defined('ELALLAS_FOR_WOO_VERSION')`** and degrade gracefully when absent.
- **Customer-entered order numbers are display numbers.** Support custom order numbering through `elallas_resolve_order_number`; never `absint()` the public form value.
- **`elallas_case_status_changed` has 4 args in 1.0.12+** — register accepted args as `4` if you need the customer-visible status note.
- **`$case_id` is a custom-table row ID, not a post.** Use the plugin's data layer / tables, not `get_post_meta`.
- **`elallas_is_order_eligible` is the final gate** — compose with `$eligible && your_condition` to narrow; returning bare `true` can re-enable orders the built-in checks (status, open case, ownership, expired-blocked) denied.
- **Order meta (`_lw_elallas_*`) is read-only for you** — the plugin owns those writes; read to discover cases, don't set them.
- **Withdrawal-exception product/term meta is configuration, not a denial decision** — it flags case items as `excepted`; final decision remains in the case workflow.
- **HPOS-safe**: work with the passed `\WC_Order` via getters, never post meta.
- **Multilingual strings are runtime-translated** — do not read/store raw option strings for customer output and do not duplicate them as WPML admin-texts.
- **Case statuses are the `CaseStatus` enum** (ten values) — don't invent statuses; validate with `CaseStatus::is_valid()`.
- **B2B detection is a heuristic** (company/VAT presence) the merchant overrides per case — treat `elallas_is_order_b2b` as advisory, not authoritative legal classification.

## Common mistakes

```php
// WRONG — treating the case id as a post
$note = get_post_meta( $case_id, 'note', true );   // case_id is a wp_lw_elallas_cases row id, not a post

// WRONG — re-allowing everything (ignores built-in eligibility)
add_filter( 'elallas_is_order_eligible', '__return_true' );   // bypasses status/deadline/ownership checks

// RIGHT — only narrow
add_filter( 'elallas_is_order_eligible', fn( $ok, $order ) => $ok && my_extra_check( $order ), 10, 2 );

// WRONG — writing the plugin's order meta yourself
$order->update_meta_data( '_lw_elallas_has_case', 'yes' );   // the plugin owns this write

// WRONG — breaking stores with custom/sequential order numbers
$order_id = absint( $_POST['order_number'] ?? 0 );            // customer sees display number, not always WC ID

// RIGHT — let Elállás or your filter resolve the display number
add_filter( 'elallas_resolve_order_number', 'my_resolve_display_order_number', 10, 2 );
```

## Cross-references

- **`wc-hpos-compatibility`** — the plugin is HPOS-safe; keep your integration HPOS-safe too.
- **`wc-sequential-order-numbers-pro`** — display order numbers must resolve before the withdrawal flow can identify an order.
- **`wc-order-lifecycle-and-items`** — for reacting to the underlying WooCommerce order/refund side.
- **`lw-site-manager-overview`** / **`wp-abilities-api`** — the `elallas/*` abilities it exposes.
- **`wpml-string-translation`** / **`wpml-config`** — understand the runtime string registration and the intentional `wpml-config.xml` scope.
- See `reference.md` for the full hook table, the 4-table schema, the order meta keys, and the status/options enums.

## What this skill does NOT cover

- **The plugin's admin UI / case workflow as an end user** — this is a developer-integration skill.
- **The legal/compliance interpretation** of Directive 2023/2673 or 415/2025 Korm. rendelet — that's the plugin's domain, not this skill's.
- **Editing the plugin's internals** — out of scope by design (consume hooks).
- **The withdrawal-form Gutenberg block internals** (`blocks/withdrawal-form`) — beyond noting it exists.

## References

- Eligibility/deadline: [includes/Domain/EligibilityChecker.php](EligibilityChecker.php) (`elallas_is_order_eligible` 67, `elallas_deadline_days` 119, default eligible statuses 81).
- B2B: [includes/Domain/B2BDetector.php:40](B2BDetector.php).
- Product/category/tag exceptions: [includes/Admin/ProductFields.php](ProductFields.php), [includes/Admin/TermFields.php](TermFields.php), [includes/Domain/ProductExclusion.php](ProductExclusion.php), [includes/Domain/OrderSnapshotBuilder.php](OrderSnapshotBuilder.php).
- Order numbers/delivery: [includes/Woo/OrderAdapter.php](OrderAdapter.php) (`elallas_resolve_order_number` 65, Sequential helper lookup 74-85, `elallas_delivery_date` 166).
- Case lifecycle + order meta: [includes/Domain/CaseService.php](CaseService.php) (created 83, confirmed 124, status_changed 182, order meta 205-213).
- Case statuses: [includes/Models/CaseStatus.php:17-26](CaseStatus.php); deadline statuses: `includes/Models/DeadlineStatus.php:17-19`.
- Multilingual: [includes/Integrations/Multilingual.php](Multilingual.php), [wpml-config.xml](wpml-config.xml), [includes/Frontend/Shortcodes.php](Shortcodes.php), [includes/Frontend/SubmissionContext.php](SubmissionContext.php), [includes/Emails/EmailManager.php](EmailManager.php).
- PDF filter/logging: [includes/Pdf/PdfRenderer.php:40](PdfRenderer.php), [includes/Support/Logger.php](Logger.php); invoicing: [includes/Integrations/Invoicing.php:63](Invoicing.php); boot: [includes/Plugin.php:64](Plugin.php).
- Tables + Site Manager abilities: [includes/Database/Schema.php](Schema.php), [includes/SiteManager/Integration.php:34-39](Integration.php).
