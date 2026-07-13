---
name: szamlazzhu-document-xml-compatibility
description: Integrate another WooCommerce plugin with Integration for Szamlazz.hu & WooCommerce document generation. Covers `WC_Szamlazz()->generate_invoice()`, `wc_szamlazz_xml`, `wc_szamlazz_invoice_line_item`, `wc_szamlazz_before_generate_invoice_check`, document meta, Action Scheduler deferral, Pro webhooks/IPN including HPOS-safe custom order-number mapping, PDF links, HUF rounding, VAT labels, multilingual line text, and HPOS-safe order access. Use when a plugin must add invoice notes/lines/accounting data, block or trigger invoices, react after document creation, expose Szamlazz.hu documents, or avoid breaking invoices from custom products, fees, discounts, subscriptions, bundles, shipping, order numbers, or payment workflows.
license: GPLv3
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "integration-for-szamlazzhu-woocommerce"
  wp-skills-plugin-version-tested: "6.2.2 on WooCommerce 10.9.4"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-09"
---

# Szamlazz.hu Document/XML Compatibility

Use this skill when a WooCommerce extension must cooperate with **Integration for Szamlazz.hu & WooCommerce** instead of sending its own invoice to Számlázz.hu. The plugin already owns the Számlázz.hu Agent request, PDF storage, order meta, admin actions, automations, IPN, and Woo webhooks. A crossover plugin should hook that contract, not duplicate it.

The validated plugin version is 6.2.2. The installed source declares HPOS, Cart/Checkout Blocks, and product block editor compatibility, while the plugin header says WC tested up to 10.7.0; this skill was checked locally against WooCommerce 10.9.4. The plugin header/readme are 6.2.2, but `WC_Szamlazz::$version` is still `6.2.1` in the main class and is used as an asset version; do not use that static property for feature detection.

## When to use this skill

Trigger when ANY of these are true:

- A plugin changes WooCommerce order items, fees, discounts, bundles, subscriptions, shipping, payment method names, order numbers, language, or VAT labels and the invoice must match.
- You need to add invoice XML data, line comments, accounting data, custom buyer data, or custom notes.
- You need to prevent or defer automatic invoice generation.
- You need to react after a Szamlazz.hu document is created, expose a document URL, or sync document numbers to another system.
- The code touches `_wc_szamlazz_*` order meta, `wc_szamlazz_xml`, `wc_szamlazz_invoice_line_item`, `wc_szamlazz_document_created`, or `WC_Szamlazz()->generate_invoice()`.

## Mental model

`WC_Szamlazz()->generate_invoice( $order_id, $type, $options )` builds a `WCSzamlazzSimpleXMLElement`, sends it to Számlázz.hu through the plugin XML generator, saves the returned PDF under `wp-content/uploads/wc_szamlazz/`, writes HPOS-safe order meta, and fires success/error hooks.

Common document types:

| Type | Main order meta | PDF meta |
|---|---|---|
| `invoice` | `_wc_szamlazz_invoice` | `_wc_szamlazz_invoice_pdf` |
| `proform` | `_wc_szamlazz_proform` | `_wc_szamlazz_proform_pdf` |
| `deposit` | `_wc_szamlazz_deposit` | `_wc_szamlazz_deposit_pdf` |
| `delivery` | `_wc_szamlazz_delivery` | `_wc_szamlazz_delivery_pdf` |
| `corrected` | `_wc_szamlazz_corrected` | `_wc_szamlazz_corrected_pdf` |
| `void` | `_wc_szamlazz_void` | `_wc_szamlazz_void_pdf` |
| `receipt` | `_wc_szamlazz_receipt` | `_wc_szamlazz_receipt_pdf` |
| `void_receipt` | `_wc_szamlazz_void_receipt` | `_wc_szamlazz_void_receipt_pdf` |

Read these through `WC_Order::get_meta()` or plugin helpers. Do not query `wp_postmeta` directly; HPOS can store orders outside post tables.

## Extension points by timing

| Timing | Hook/API | Use |
|---|---|---|
| Before generation | `wc_szamlazz_before_generate_invoice` | Prepare request-local state, switch language, collect diagnostics. |
| Hard guard | `wc_szamlazz_before_generate_invoice_check` | Abort generation before XML is built. |
| Product/shipping/fee/refund line | `wc_szamlazz_invoice_line_item` | Modify or remove one generated `<tetel>`. |
| Separate coupon line | `wc_szamlazz_invoice_line_item_discount` | Modify coupon line when separate-coupon mode is enabled. |
| Final invoice XML | `wc_szamlazz_xml` | Modify the complete invoice/proform/deposit/delivery/corrected XML. |
| Paid-marker XML | `wc_szamlazz_xml_kifiz` | Modify payment-complete XML. |
| Void/proform delete/receipt XML | `wc_szamlazz_xml_void`, `wc_szamlazz_xml_proform_delete`, `wc_szamlazz_xml_receipt`, `wc_szamlazz_xml_void_receipt`, `wc_szamlazz_xml_receipt_send` | Specialized document XML. |
| Success | `wc_szamlazz_after_invoice_success`, `wc_szamlazz_document_created` | Sync document number, enqueue follow-up, notify another system. |
| Failure | `wc_szamlazz_after_invoice_error` | Log/retry/alert without mutating document meta. |

After `wc_szamlazz_after_invoice_success`, the XML is already sent. Do not try to "fix" an invoice there; use `wc_szamlazz_xml` or `wc_szamlazz_invoice_line_item`.

## Block generation safely

Return an array with `error => true` from `wc_szamlazz_before_generate_invoice_check` when your plugin must stop a document. Keep the message human-readable because it can land in admin responses.

```php
add_filter(
    'wc_szamlazz_before_generate_invoice_check',
    static function ( $result, $order_id, string $type, array $options ) {
        $order = wc_get_order( is_array( $order_id ) ? reset( $order_id ) : $order_id );

        if ( ! $order instanceof WC_Order ) {
            return $result;
        }

        if ( 'invoice' === $type && $order->get_meta( '_myplugin_invoice_hold' ) ) {
            return array(
                'error'    => true,
                'messages' => array( __( 'Invoice is blocked until manual review finishes.', 'myplugin' ) ),
            );
        }

        return $result;
    },
    10,
    4
);
```

Use this for hard compliance/business-state blocks. For ordinary auto-generation opt-out, prefer `wc_szamlazz_should_generate_auto_invoice` so manual generation can still work.

## Modify line items

The plugin has already calculated net, VAT, gross, quantity, SKU, tax label, and notes before `wc_szamlazz_invoice_line_item` fires. Keep Számlázz.hu Agent arithmetic intact unless you recalculate every related field.

```php
add_filter(
    'wc_szamlazz_invoice_line_item',
    static function ( $line, $order_item, WC_Order $order, $invoice ) {
        if ( ! $line ) {
            return $line;
        }

        if ( $order_item instanceof WC_Order_Item_Product ) {
            $license = $order_item->get_meta( '_myplugin_license_code', true );
            if ( $license ) {
                $line->megjegyzes = trim( (string) $line->megjegyzes . "\n" . 'License: ' . $license );
            }
        }

        return $line;
    },
    10,
    4
);
```

To hide a line, return `false`. Only do that when totals remain legally correct. If you hide a free bundle child, verify the parent line still carries the correct price and VAT. The bundled compatibility module uses this same hook.

## Modify final XML

Use `wc_szamlazz_xml` when you need buyer/header-level changes, custom notes, or account-specific XML fields.

```php
add_filter(
    'wc_szamlazz_xml',
    static function ( $xml, WC_Order $order, string $type, array $options ) {
        if ( 'invoice' !== $type ) {
            return $xml;
        }

        $po_number = $order->get_meta( '_myplugin_po_number' );
        if ( $po_number ) {
            $xml->fejlec->megjegyzes = trim( (string) $xml->fejlec->megjegyzes . "\nPO: " . $po_number );
        }

        return $xml;
    },
    10,
    4
);
```

The official Számlázz.hu Agent XML order is strict: settings, header, seller, buyer, and items must be valid for the selected XML namespace. Prefer changing existing nodes over appending unknown top-level nodes.

## VAT, rounding, and totals

Számlázz.hu requires line values that add up. The plugin calculates:

- HUF document rounding with `0` decimal places for gross totals.
- Foreign currency rounding with `wc_get_price_decimals()`.
- Net unit, net value, VAT value, and gross value through `calculate_item_prices()`.
- VAT labels through helper logic and optional VAT overrides.

Do not change only `bruttoErtek`, `nettoErtek`, `afaErtek`, or `nettoEgysegar` in isolation. If you must alter pricing, adjust the WooCommerce order item before invoicing, or recalculate all four XML values consistently.

For VAT labels, prefer Szamlazz.hu's supported labels and the plugin's extension points, especially `wc_szamlazz_check_vat_override_line_item` when a custom fee/product class must match a VAT override rule.

## Generate documents intentionally

Manual generation from another plugin is allowed, but it is an external API side effect. Check `WC_Szamlazz()->is_invoice_generated( $order_id, 'invoice' )` first, then call `WC_Szamlazz()->generate_invoice( $order_id, 'invoice', $options )` with scalar options such as `completed_date`, `deadline_date`, `paid`, `lang`, or `account`.

For slow or bulk flows, enqueue the plugin's own async hook or your own Action Scheduler job. The plugin uses WooCommerce Action Scheduler group `wc-szamlazz` and hooks:

- `wc_szamlazz_generate_document_async`
- `wc_szamlazz_mark_as_paid_async`

When filtering bulk behavior, keep deferral enabled for large batches:

```php
add_filter( 'wc_szamlazz_defer_invoice_in_bulk_action', '__return_true' );
```

## Automatic generation gates

Use these filters instead of editing settings or meta directly:

```php
add_filter(
    'wc_szamlazz_should_generate_auto_invoice',
    static function ( bool $should_generate, int $order_id ): bool {
        $order = wc_get_order( $order_id );
        if ( $order instanceof WC_Order && $order->get_meta( '_myplugin_waiting_for_external_clearance' ) ) {
            return false;
        }

        return $should_generate;
    },
    10,
    2
);
```

Other automation hooks:

- `wc_szamlazz_need_delivery_note` changes whether an invoice also creates a delivery note.
- `wc_szamlazz_deposit_negative_lines` controls negative deposit lines on final invoices.
- `wc_szamlazz_get_order_statuses` extends status choices for Pro automations.

## React after creation

Use `wc_szamlazz_document_created` for webhook-style sync. It receives an array with `order_id` and `document_type`.

```php
add_action(
    'wc_szamlazz_document_created',
    static function ( array $document ): void {
        $order = wc_get_order( $document['order_id'] ?? 0 );
        if ( ! $order instanceof WC_Order ) {
            return;
        }

        $type   = sanitize_key( $document['document_type'] ?? 'invoice' );
        $number = (string) $order->get_meta( '_wc_szamlazz_' . $type );
        $url    = WC_Szamlazz()->generate_download_link( $order, $type );

        myplugin_queue_document_sync( $order->get_id(), $type, $number, $url );
    }
);
```

The Pro webhook resource `wc_szamlazz.created` is built from this same action and returns `order_id`, `document_type`, `document_url`, and `document_number`. Do not expose the local upload path; use the generated URL helper.

## IPN and order-number compatibility

The Pro IPN endpoint is a secret-token query URL (`?wc_szamlazz_ipn_url=...`) and expects POST fields such as `szlahu_fizetesmod`, `szlahu_szamlaszam`, and `szlahu_rendelesszam`. The plugin applies `wc_szamlazz_ipn_request_parameters` before `wc_get_order( $order_number )`, so this is the safe place to map public order numbers back to internal order IDs.

Version 6.2.2 ships built-in compatibility for **Custom Order Numbers for WooCommerce** (`_alg_wc_full_custom_order_number`) and **Sequential Order Numbers** (`WT_SEQUENCIAL_ORDNUMBER_VERSION`, `_order_number`) through HPOS-safe `wc_get_orders()`. If your plugin has a different public order-number meta key or custom table, add your own mapping here:

```php
add_filter(
    'wc_szamlazz_ipn_request_parameters',
    static function ( array $params ): array {
        if ( ! empty( $params['order_number'] ) ) {
            $internal_id = myplugin_find_order_id_by_public_number( $params['order_number'] );
            if ( $internal_id ) {
                $params['order_number'] = (string) $internal_id;
            }
        }

        return $params;
    }
);
```

Never log or expose the IPN token. If you add logging around IPN, redact the full request URL and Szamlazz.hu Agent key.

Other IPN hooks:

- `wc_szamlazz_before_ipn_process` / `wc_szamlazz_after_ipn_process` wrap the resolved order update.
- `wc_szamlazz_ipn_document_type` changes the stored document type when IPN downloads a PDF.
- `wc_szamlazz_ipn_should_change_order_status` and `wc_szamlazz_ipn_target_order_status` control status changes after payment detection.

Keep all lookups HPOS-safe. Use `wc_get_orders()` or your plugin's own order-number API; do not query `wp_postmeta` directly.

## Multilingual invoices

The plugin's language option supports `hu`, `de`, `en`, `it`, `fr`, `hr`, `ro`, `sk`, `si`, `es`, `pl`, and `cz`. Built-in order-language detection and the TranslatePress/Polylang compatibility modules currently allow only `hu`, `de`, `en`, `it`, `fr`, `hr`, `ro`, `sk`, `es`, `pl`, and `cz`; `si` is present in the option list but omitted from those auto-detection allowlists. If Slovenian invoice language must be derived from order language, set it explicitly through `wc_szamlazz_get_order_language`, `wc_szamlazz_xml`, or `generate_invoice()` options.

The plugin has built-in TranslatePress and Polylang compatibility that filters invoice language and line names. WPML is handled more lightly through the `wpml_language` order meta lookup in `WC_Szamlazz_Helpers::get_order_language()`.

For another language plugin, use:

- `wc_szamlazz_get_order_language` for the two-letter invoice language.
- `wc_szamlazz_before_generate_invoice` if you must temporarily switch language context.
- `wc_szamlazz_invoice_line_item` if product/variation names need translation before sending XML.

Do not translate invoice numbers, tax numbers, order IDs, SKU identifiers, or Szamlazz.hu Agent keys.

## Critical rules

- Do not call the Számlázz.hu Agent endpoint directly for orders already managed by this plugin.
- Do not write `_wc_szamlazz_invoice`, `_wc_szamlazz_*_pdf`, or `_wc_szamlazz_completed` directly for normal generation; let the plugin save them after a successful Agent response.
- Do not mutate sent XML from success hooks. Use pre-send filters.
- Do not change invoice arithmetic unless all related net/VAT/gross/unit fields stay consistent.
- Do not use `get_post_meta()` or SQL against order meta; use `WC_Order` methods.
- Do not expose Agent keys, debug XML, cookie files, IPN secret URLs, or local PDF paths.
- Do not assume Pro-only hooks/classes are loaded; guard IPN/webhook/automation-specific code.

## Smoke test checklist

- Generate invoice preview and inspect XML without sending a live invoice.
- Test one paid order, one unpaid order, one discounted order, one shipping-fee order, and one refund/correction scenario.
- Test HUF rounding and at least one non-HUF currency.
- Test HPOS enabled and legacy order storage if the site supports both.
- Test automatic generation on status change and manual admin generation separately.
- If multilingual, test the order language stored by the language plugin.
- If Pro/IPN is involved, test order-number mapping and duplicate IPN delivery.

## Cross-references

- Use `wc-hpos-compatibility` for all order/meta reads and writes.
- Use `wc-action-scheduler-jobs` when your integration queues sync after document creation.
- Use `wc-order-lifecycle-and-items` when invoice timing depends on status, payment, refunds, or item totals.
- Use `wc-store-api` for Checkout Block/headless checkout flows that must provide data before invoice generation.
- Use `translatepress-output-compatibility` when invoice language or translated line names depend on TranslatePress state.

## References

- Official documentation: <https://wordpress.org/plugins/integration-for-szamlazzhu-woocommerce/>
- Official documentation: <https://docs.szamlazz.hu/hu/agent/generating_invoice/xml>
- Official documentation: <https://docs.szamlazz.hu/hu/agent/generating_invoice/rounding>
- Official documentation: <https://docs.szamlazz.hu/hu/agent/generating_invoice/vat-rates>
- Verified source paths:
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/index.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-xml-generator.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-helpers.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-automations.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-ipn.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-webhooks.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/compatibility/class-compatibility.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/compatibility/modules/class-wc-szamlazz-custom-order-numbers.php`
  - `wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/compatibility/modules/class-wc-szamlazz-translatepress.php`
