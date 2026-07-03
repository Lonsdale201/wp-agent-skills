---
name: lw-elallas-integration
description: Integrate with or extend "Elállás for WooCommerce"
  (elallas-for-woo) — the EU/HU right-of-withdrawal (elállás)
  case-management plugin for WooCommerce. An LW-family plugin (namespace
  LightweightPlugins\Elallas, wp_lw_elallas_* tables) — integrate by
  CONSUMING its hooks, never editing it. Covers the eligibility/deadline
  /B2B filters (elallas_is_order_eligible, elallas_deadline_days,
  elallas_is_order_b2b, elallas_delivery_date), the case lifecycle actions
  (elallas_case_created, elallas_case_confirmed, elallas_case_status_changed,
  elallas_invoicing_case_created), the elallas_pdf_html and elallas_boot
  hooks, the CaseStatus lifecycle (received → auto_confirmed/manual_review
  → admin states), the 4 custom tables + order meta, and the LW Site
  Manager abilities it exposes (elallas/get-case, list-cases,
  update-case-status). Detect with defined('ELALLAS_FOR_WOO_VERSION').
  Use when building withdrawal-case compatibility, syncing cases to a CRM
  or invoicing, or customizing its PDF.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elallas-for-woo
plugin-version-tested: "1.0.11"
php-min: "8.0"
last-updated: "2026-07-03"
docs:
  - https://developer.woocommerce.com/docs/features/high-performance-order-storage/
source-refs:
  - wp-content/plugins/elallas-for-woo/includes/Domain/EligibilityChecker.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/CaseService.php
  - wp-content/plugins/elallas-for-woo/includes/Domain/B2BDetector.php
  - wp-content/plugins/elallas-for-woo/includes/Models/CaseStatus.php
  - wp-content/plugins/elallas-for-woo/includes/SiteManager/Integration.php
---

# Elállás for WooCommerce — integration & extension

For developers making a plugin/theme work with **Elállás for WooCommerce** (`elallas-for-woo`, by uptools.io) — the online right-of-withdrawal (elállási jog) button + case-management plugin for WooCommerce, built for EU Directive 2023/2673 and 415/2025. (XII. 23.) Korm. rendelet. It manages a **withdrawal "case"** per order in its own tables and fires a small, clean set of `elallas_*` hooks for integrators.

## This is an LW-family plugin — consume hooks, don't edit it

Namespace `LightweightPlugins\Elallas`, tables `wp_lw_elallas_*`, and it integrates with LW Site Manager — it's part of the LightweightPlugins family. **Integrate by consuming its `elallas_*` hooks and reading its data; never patch the plugin.** If you need an extension point that doesn't exist, request it upstream rather than editing.

Detect it:

```php
if ( defined( 'ELALLAS_FOR_WOO_VERSION' ) ) { /* Elállás for WooCommerce active (1.0.11 tested) */ }
```

It requires WooCommerce 8.0+ and is HPOS-safe — every hook hands you a real `\WC_Order`, so use `$order->get_*()` (never post meta) — see `wc-hpos-compatibility`.

## Extension point 1 — eligibility, deadline & B2B (the ones you'll actually use)

These filters decide **whether an order may start a withdrawal** and how the deadline is computed. All receive the `\WC_Order`.

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
```

Verified: `elallas_is_order_eligible` at [EligibilityChecker.php:67](EligibilityChecker.php); `elallas_deadline_days` at [:119](EligibilityChecker.php) (default from `Options::get('deadline_days', 14)`); `elallas_is_order_b2b` at [B2BDetector.php:40](B2BDetector.php) (heuristic: company OR VAT filled); `elallas_delivery_date` at [OrderAdapter.php:121](OrderAdapter.php).

Good to know about the built-in eligibility (so your filter composes correctly): by default only orders whose status is in `eligible_statuses` (default `['processing','completed']`) qualify; an order with an already-open case is refused; logged-in users may only act on their own orders (guests fall back to an email match); and **an expired deadline does NOT hard-block by default** — it's flagged for manual review unless the `expired_handling` option is set to `'block'` ([EligibilityChecker.php:32-72](EligibilityChecker.php)). Your `elallas_is_order_eligible` filter is the final gate, so returning `true` can re-allow something the built-in checks denied — return `$eligible && your_condition` to only ever narrow.

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
add_action( 'elallas_case_status_changed', function ( int $case_id, string $old, string $new ): void {
    if ( 'refund_pending' === $new ) { my_queue_refund( $case_id ); }
}, 10, 3 );

// Fired specifically for invoicing integrations.
add_action( 'elallas_invoicing_case_created', function ( int $case_id, int $order_id ): void { /* ... */ }, 10, 2 );
```

Verified: `elallas_case_created($case_id, $order_id)` at [CaseService.php:75](CaseService.php); `elallas_case_confirmed($case_id)` at [:105](CaseService.php); `elallas_case_status_changed($case_id, $old_status, $new_status)` at [:152](CaseService.php); `elallas_invoicing_case_created` at [Integrations/Invoicing.php:63](Invoicing.php).

**`$case_id` is a row ID in the custom `wp_lw_elallas_cases` table — NOT a post ID.** Don't call `get_post()`/`get_post_meta()` on it. Read case data through the plugin's repositories/data or the tables (see reference.md). To find cases from an order, read the order meta the plugin writes: `_lw_elallas_has_case` (`'yes'`), `_lw_elallas_case_ids` (array of case IDs), `_lw_elallas_deadline_status` ([CaseService.php:165-174](CaseService.php)). Treat that meta as read-only — let the plugin write it.

### Case statuses (the `CaseStatus` set)

`received` → (`auto_confirmed` if the deadline is `within`, else `manual_review`) → admin moves it to `accepted` / `rejected` / `awaiting_return` / `goods_received` / `refund_pending` / `closed` / `cancelled`. All ten are the valid values `elallas_case_status_changed` will report; validate against them with the plugin's `CaseStatus::is_valid()`. Verified at [CaseStatus.php:17-26](CaseStatus.php). (Separately, `DeadlineStatus` is `within` / `expired` / `unknown`.)

## Extension point 3 — customize the PDF & emails

```php
// Filter the withdrawal PDF HTML before rendering (dompdf).
add_filter( 'elallas_pdf_html', function ( string $html, array $context ): string {
    return str_replace( '{{my_token}}', esc_html( my_value() ), $html );
}, 10, 2 );
```

Verified at [PdfRenderer.php:37](PdfRenderer.php). The plugin's emails render through the standard `woocommerce_email_header` / `woocommerce_email_footer` hooks, so your existing WC email customizations apply — see `wc-emails-classic`. Its user-facing strings are registered for WPML via `wpml_register_single_string` / `wpml_translate_single_string` (see `wpml-string-translation`).

## Extension point 4 — `elallas_boot`

```php
add_action( 'elallas_boot', function ( $plugin ): void {
    // Runs once the plugin has booted — safe place to wire your integration.
}, 10, 1 );
```

Verified at [Plugin.php:63](Plugin.php).

## LW Site Manager abilities it exposes

If LW Site Manager is active, the plugin registers a `elallas` ability category with `elallas/get-case`, `elallas/list-cases`, `elallas/update-case-status`, and `elallas/get-audit-log` (via `lw_site_manager_register_abilities` / `lw_site_manager_register_categories`, with a fallback direct registration on `wp_abilities_api_init`). So agents/automation can read and drive cases through Site Manager without touching the tables. Verified at [SiteManager/Integration.php:34-39](Integration.php). See `lw-site-manager-overview` and `wp-abilities-api`.

## Critical rules

- **Never edit the plugin.** Consume `elallas_*` hooks; request missing extension points upstream. (LW-family rule.)
- **Detect with `defined('ELALLAS_FOR_WOO_VERSION')`** and degrade gracefully when absent.
- **`$case_id` is a custom-table row ID, not a post.** Use the plugin's data layer / tables, not `get_post_meta`.
- **`elallas_is_order_eligible` is the final gate** — compose with `$eligible && your_condition` to narrow; returning bare `true` can re-enable orders the built-in checks (status, open case, ownership, expired-blocked) denied.
- **Order meta (`_lw_elallas_*`) is read-only for you** — the plugin owns those writes; read to discover cases, don't set them.
- **HPOS-safe**: work with the passed `\WC_Order` via getters, never post meta.
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
```

## Cross-references

- **`wc-hpos-compatibility`** — the plugin is HPOS-safe; keep your integration HPOS-safe too.
- **`wc-order-lifecycle-and-items`** — for reacting to the underlying WooCommerce order/refund side.
- **`lw-site-manager-overview`** / **`wp-abilities-api`** — the `elallas/*` abilities it exposes.
- **`wpml-string-translation`** — its strings are WPML-registered; translate accordingly.
- See `reference.md` for the full hook table, the 4-table schema, the order meta keys, and the status/options enums.

## What this skill does NOT cover

- **The plugin's admin UI / case workflow as an end user** — this is a developer-integration skill.
- **The legal/compliance interpretation** of Directive 2023/2673 or 415/2025 Korm. rendelet — that's the plugin's domain, not this skill's.
- **Editing the plugin's internals** — out of scope by design (consume hooks).
- **The withdrawal-form Gutenberg block internals** (`blocks/withdrawal-form`) — beyond noting it exists.

## References

- Eligibility/deadline: [includes/Domain/EligibilityChecker.php](EligibilityChecker.php) (`elallas_is_order_eligible` 67, `elallas_deadline_days` 119, default eligible statuses 81).
- B2B: [includes/Domain/B2BDetector.php:40](B2BDetector.php).
- Case lifecycle + order meta: [includes/Domain/CaseService.php](CaseService.php) (created 75, confirmed 105, status_changed 152, order meta 165-174).
- Case statuses: [includes/Models/CaseStatus.php:17-26](CaseStatus.php); deadline statuses: `includes/Models/DeadlineStatus.php:17-19`.
- PDF filter: [includes/Pdf/PdfRenderer.php:37](PdfRenderer.php); invoicing: [includes/Integrations/Invoicing.php:63](Invoicing.php); boot: [includes/Plugin.php:63](Plugin.php).
- Tables + Site Manager abilities: [includes/Database/Schema.php](Schema.php), [includes/SiteManager/Integration.php:34-39](Integration.php).
