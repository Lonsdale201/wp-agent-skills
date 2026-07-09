---
name: szamlazzhu-vat-checkout-compatibility
description: Make WooCommerce checkout, B2B, VAT/tax-number, address, and headless checkout code compatible with Integration for Szamlazz.hu & WooCommerce. Covers the classic checkout field `wc_szamlazz_adoszam`, order meta `_billing_wc_szamlazz_adoszam` and `_wc_szamlazz_adoszam_data`, user meta `wc_szamlazz_adoszam`, Checkout Block/Store API extension namespace `wc-szamlazz-vat-number`, the cart `vat_number` vs checkout `billing_vat_number` payload split, NAV/VIES validation filters, EU VAT exemption, company billing rules, admin/customer address display, and how another plugin should map its own VAT fields into Szamlazz.hu invoice XML without creating duplicate checkout state.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: integration-for-szamlazzhu-woocommerce
plugin-version-tested: "6.2.2 on WooCommerce 10.9.4"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://wordpress.org/plugins/integration-for-szamlazzhu-woocommerce/
  - https://docs.szamlazz.hu/hu/agent/querying_taxpayer/xml
  - https://ec.europa.eu/taxation_customs/vies/
source-refs:
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/class-vat-number.php
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/block/vat-number-block.php
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/block/vat-number-block-endpoints.php
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/block/vat-number-block-integration.php
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/index.php
  - wp-content/plugins/integration-for-szamlazzhu-woocommerce/includes/compatibility/modules/class-wc-szamlazz-subscriptions.php
license: GPLv3
---

# Szamlazz.hu VAT/Checkout Compatibility

Use this skill when a plugin/theme must cooperate with the Szamlazz.hu WooCommerce VAT/tax-number workflow. The goal is one source of truth for company billing and VAT data, so invoices, checkout validation, customer addresses, subscription renewals, admin orders, and Store API checkout all agree.

The plugin's VAT feature loads only when its `vat_number_type` option is not `no`. Guard your integration for sites where the Szamlazz.hu VAT UI is disabled.

Version 6.2 added the "VAT number for all countries" path and made `wc_szamlazz_vat_number_validation_results` run for invalid VAT results too. Version 6.2.2 further adjusts EU VAT validation behavior. This skill was rechecked against the local 6.2.2 source and WooCommerce 10.9.4.

## When to use this skill

Trigger when ANY of these are true:

- Adding or auditing a WooCommerce B2B/company billing field.
- Mapping another plugin's VAT number into Szamlazz.hu invoices.
- Supporting classic checkout and Checkout Blocks/Store API with the same VAT state.
- Debugging required VAT/company validation, EU VAT exemption, or VIES/NAV validation.
- The code touches `wc_szamlazz_adoszam`, `_billing_wc_szamlazz_adoszam`, `_wc_szamlazz_adoszam_data`, `wc-szamlazz-vat-number`, `wc_szamlazz_xml_adoszam`, `wc_szamlazz_vat_number_validation_results`, or `woocommerce_store_api_checkout_update_order_from_request`.

## Canonical data contract

| Surface | Key/namespace | Meaning |
|---|---|---|
| Classic checkout POST field | `wc_szamlazz_adoszam` | Shopper-entered HU tax number or EU VAT number. |
| Company toggle field | `wc_szamlazz_company_toggle` | Checkbox mode, when configured. |
| Company radio field | `wc_szamlazz_company_toggle_radio` | `individual` or `company`, when configured. |
| Order meta | `_billing_wc_szamlazz_adoszam` | Canonical order VAT/tax number used for invoices. |
| Legacy order meta | `wc_szamlazz_adoszam` | Backward compatibility; plugin migrates/read-falls back. |
| Order meta | `_wc_szamlazz_adoszam_data` | Validation payload from NAV/VIES. |
| User meta | `wc_szamlazz_adoszam` | Saved billing VAT number for logged-in customers. |
| Store API namespace | `wc-szamlazz-vat-number` | Checkout Blocks/cart extension state. |
| Cart extensions update data | `vat_number` | `POST /wc/store/v1/cart/extensions` update callback input. |
| Checkout extension data | `customer_type`, `billing_vat_number`, `billing_vat_number_info` | Final checkout payload saved to order meta. |
| WC session | `vat-number-data` | Current Store API/classic AJAX validation state. |

Do not create a second permanent VAT meta key and expect Szamlazz.hu invoices to see it. Either populate the canonical meta at checkout/order creation, or map your custom field through invoice filters.

## Read the VAT number

Use the plugin helper when available because it handles the legacy key.

```php
function myplugin_get_szamlazz_vat_number( WC_Order $order ): string {
    if ( class_exists( 'WC_Szamlazz_Vat_Number_Field' ) ) {
        return (string) WC_Szamlazz_Vat_Number_Field::get_order_vat_number( $order );
    }

    return (string) ( $order->get_meta( '_billing_wc_szamlazz_adoszam' ) ?: $order->get_meta( 'wc_szamlazz_adoszam' ) );
}
```

Use `WC_Order::get_meta()` and `update_meta_data()`. Do not query `wp_postmeta`; HPOS may store orders in WooCommerce order tables.

## Map another VAT field into invoices

If another plugin already owns the checkout VAT field, do not duplicate UI. Feed Szamlazz.hu invoice XML with the two dedicated filters.

```php
add_filter(
    'wc_szamlazz_xml_adoszam',
    static function ( string $tax_number, WC_Order $order ): string {
        if ( $tax_number ) {
            return $tax_number;
        }

        $custom = (string) $order->get_meta( '_myplugin_hu_tax_number' );
        return $custom ?: $tax_number;
    },
    10,
    2
);

add_filter(
    'wc_szamlazz_xml_adoszam_eu',
    static function ( string $eu_vat, WC_Order $order ): string {
        if ( $eu_vat ) {
            return $eu_vat;
        }

        $custom = strtoupper( preg_replace( '/[^A-Z0-9]/', '', (string) $order->get_meta( '_myplugin_eu_vat_number' ) ) );
        return preg_match( '/^[A-Z]{2}/', $custom ) ? $custom : $eu_vat;
    },
    10,
    2
);
```

The invoice builder automatically moves a two-letter-prefixed value from Hungarian `adoszam` to EU `adoszamEU` when needed, and removes tax numbers for non-EU countries. Still map HU and EU fields explicitly when your plugin can distinguish them.

## Populate canonical meta at checkout

When your plugin replaces the Szamlazz.hu visible field, save the canonical order meta once, before invoice generation.

```php
add_action(
    'woocommerce_checkout_create_order',
    static function ( WC_Order $order, array $data ): void {
        if ( empty( $_POST['myplugin_vat_number'] ) ) {
            return;
        }

        $vat_number = sanitize_text_field( wp_unslash( $_POST['myplugin_vat_number'] ) );
        $order->update_meta_data( '_billing_wc_szamlazz_adoszam', $vat_number );

        if ( class_exists( 'WC_Szamlazz_Vat_Number_Field' ) ) {
            $validation = preg_match( '/^[A-Z]{2}/', $vat_number )
                ? WC_Szamlazz_Vat_Number_Field::get_eu_vat_number_data( $vat_number )
                : WC_Szamlazz_Vat_Number_Field::get_vat_number_data( $vat_number );

            if ( $validation ) {
                $order->update_meta_data( '_wc_szamlazz_adoszam_data', $validation );
            }
        }
    },
    20,
    2
);
```

Sanitize with `wp_unslash()` + `sanitize_text_field()`. Do not call the validation API repeatedly on every keypress from your own JS; the plugin already has checkout AJAX/Store API flows and VIES caching.

## Classic checkout behavior

The plugin adds `wc_szamlazz_adoszam` through `woocommerce_billing_fields`, aligns it through `woocommerce_checkout_fields`, validates on `woocommerce_after_checkout_validation`, saves order meta on `woocommerce_checkout_update_order_meta`, saves user meta on `woocommerce_checkout_update_user_meta`, and displays it in admin/customer billing addresses.

Validation rules include:

- Hungarian tax number format and Számlázz.hu taxpayer XML lookup.
- Optional EU VAT format and VIES lookup.
- Company name required when VAT is present, depending on UI mode.
- VAT required when company billing is selected or company name is entered for configured countries.
- Optional global VAT requirement for non-HU/non-EU company customers.

Customize messages with the message filters. Do not remove validation by unhooking the whole class unless you own every invoice path.

Useful validation/message filters:

- `wc_szamlazz_tax_validation_nav_message`
- `wc_szamlazz_tax_validation_format_message`
- `wc_szamlazz_tax_validation_required_message`
- `wc_szamlazz_company_validation_required_message`
- `wc_szamlazz_company_billing_validation_required_message`
- `wc_szamlazz_eu_vat_number_validation_country_mismatch_message`
- `wc_szamlazz_vat_number_validation_failed_message`

## Validation result filters

The plugin exposes NAV/VIES validation results through `wc_szamlazz_vat_number_validation_results`. Return the same array shape. Hungarian NAV validation passes two accepted arguments (`$result`, `$vat_number`); EU VIES validation passes a third `$raw_response` argument for cache hits, service failures, invalid responses, and successful VIES payloads.

```php
add_filter(
    'wc_szamlazz_vat_number_validation_results',
    static function ( array $result, string $vat_number, $raw_response = null ): array {
        if ( myplugin_is_trusted_internal_customer_vat( $vat_number ) ) {
            $result['valid'] = true;
            $result['note']  = 'Trusted internal customer override';
        }

        return $result;
    },
    10,
    3
);
```

Classic checkout blocks false EU validation results by default through `wc_szamlazz_should_fail_eu_vat_validation`. Return `false` only when you intentionally want to fail open for invalid VIES results:

```php
add_filter( 'wc_szamlazz_should_fail_eu_vat_validation', '__return_false' );
```

That filter does not make VIES outages fail closed by itself. Transport errors, non-2xx responses, empty bodies, invalid JSON, and VIES `MS_MAX_CONCURRENT_REQ` are converted to `valid => true` before checkout validation so the checkout does not stall on an upstream outage. If your B2B workflow must fail closed on those service-error branches, use `wc_szamlazz_vat_number_validation_results` and turn responses with an outage `note` or empty raw response back to `valid => false`.

## Store API / Checkout Blocks contract

The plugin registers Store API data after `woocommerce_blocks_loaded` under namespace `wc-szamlazz-vat-number` for cart and checkout. There are two related but different payload surfaces:

- Cart extension update: `POST /wp-json/wc/store/v1/cart/extensions` calls the plugin's update callback with `data.vat_number` and stores validation output in `WC()->session['vat-number-data']`.
- Final checkout: `POST /wp-json/wc/store/v1/checkout` sends extension data created by `setExtensionData()`: `customer_type`, `billing_vat_number`, and optional `billing_vat_number_info`.

Do not send only `billing_vat_number` to `/cart/extensions`; the update callback checks `vat_number`. Do not send only `vat_number` to `/checkout`; the save callback reads `billing_vat_number`.

Its registered schema includes:

| Field | Values |
|---|---|
| `customer_type` | `individual` or `company` |
| `billing_vat_number` | string |
| `billing_vat_number_info` | object |

Its update callback writes `vat-number-data` into the WooCommerce session and may set `WC()->customer->set_is_vat_exempt( true )` for valid non-HU EU VAT numbers.

Headless/block checkout should first validate/update the cart extension:

```json
{
  "namespace": "wc-szamlazz-vat-number",
  "data": {
    "vat_number": "12345678-1-12"
  }
}
```

Then submit the final extension data with the checkout request:

```json
{
  "billing_address": {
    "company": "Example Kft.",
    "country": "HU"
  },
  "extensions": {
    "wc-szamlazz-vat-number": {
      "customer_type": "company",
      "billing_vat_number": "12345678-1-12"
    }
  }
}
```

If your own Store API extension collects VAT, prefer writing the same `wc-szamlazz-vat-number` extension namespace before checkout. If you cannot do that, copy your data to `_billing_wc_szamlazz_adoszam` in `woocommerce_store_api_checkout_update_order_from_request` before any invoice automation can run.

```php
add_action(
    'woocommerce_store_api_checkout_update_order_from_request',
    static function ( WC_Order $order, WP_REST_Request $request ): void {
        $extensions = (array) $request->get_param( 'extensions' );
        $data       = (array) ( $extensions['myplugin-b2b'] ?? array() );

        if ( empty( $data['vat_number'] ) || $order->get_meta( '_billing_wc_szamlazz_adoszam' ) ) {
            return;
        }

        $order->update_meta_data( '_billing_wc_szamlazz_adoszam', sanitize_text_field( $data['vat_number'] ) );
    },
    5,
    2
);
```

The Szamlazz.hu checkout-save callback runs on `woocommerce_store_api_checkout_update_order_from_request` at priority 10 and assumes the `wc-szamlazz-vat-number` namespace is present when its block is active. Use an earlier priority than 10 if your data must be available to its validation. Test both `POST /wp-json/wc/store/v1/cart/extensions` and `POST /wp-json/wc/store/v1/checkout`.

## EU VAT exemption

The plugin can set the current Woo customer VAT-exempt during checkout:

- `vat_exempt_abroad` for virtual company orders outside EU countries.
- `vat_exempt_eu_vat` for valid non-HU EU VAT numbers.
- Store API update callback for `wc-szamlazz-vat-number`.

Extension points are `wc_szamlazz_should_set_eu_vat_exempt` to override the decision and `wc_szamlazz_after_set_vat_exempt` to run follow-up cart logic.

Do not set VAT exemption permanently on the user for a single cart decision. This is checkout/session state.

## Admin orders and renewals

The plugin adds the VAT number to admin billing fields and migrates legacy order meta when an admin order screen renders. In Subscriptions flows, the compatibility module excludes generated Szamlazz.hu document meta from renewal copies, but it does not exclude `_billing_wc_szamlazz_adoszam`; it also updates active/on-hold subscription VAT meta when the customer saves billing address changes with "update all subscriptions".

For custom admin order creation:

- Save `_billing_wc_szamlazz_adoszam` on the order object before saving.
- Save `_wc_szamlazz_adoszam_data` if you already validated the number.
- For renewal/subscription flows, keep `_billing_wc_szamlazz_adoszam` on the subscription or parent order so WooCommerce Subscriptions renewal meta copying can carry it forward. The Szamlazz.hu compatibility module explicitly excludes generated document meta from renewals, not VAT meta.

Copy with `$renewal->update_meta_data( '_billing_wc_szamlazz_adoszam', $source_order->get_meta( '_billing_wc_szamlazz_adoszam' ) )` and save the order object.

## Security and privacy

VAT numbers are personal/business identifiers. Treat them like billing data:

- Use WooCommerce checkout nonces or Store API nonce/cart token flows.
- Sanitize input and escape output.
- Do not log full VAT numbers unless debug logging is explicitly enabled and access-controlled.
- Do not expose validation payloads through public REST endpoints without current-customer authorization.
- Do not cache VIES/NAV responses in public page caches.

## Critical rules

- Do not render a second VAT field unless you intentionally replace and map to the Szamlazz.hu contract.
- Do not save only user meta; invoices read order meta.
- Do not assume classic checkout hooks run for Checkout Blocks or headless Store API.
- Do not assume Store API extension data appears as top-level checkout fields; it lives under `extensions['wc-szamlazz-vat-number']`.
- Do not block all non-HU customers with HU tax-number rules; EU and global VAT paths differ.
- Do not use direct postmeta queries; HPOS-safe order APIs are required.

## Smoke test checklist

- Classic checkout, logged-out HU company VAT.
- Checkout Blocks/Store API company VAT with `extensions['wc-szamlazz-vat-number']`.
- EU VAT with matching billing country, including `GR`/`EL` prefix handling.
- Individual customer with company name but no VAT, under each configured UI mode.
- Subscription renewal or copied order retaining VAT meta.
- Generated invoice XML contains `adoszam` for HU and `adoszamEU` for EU numbers.

## Cross-references

- Use `szamlazzhu-document-xml-compatibility` when VAT data must affect the final XML or document creation timing.
- Use `wc-store-api` for nonce/cart-token, `/cart/extensions`, and headless checkout request details.
- Use `wc-cart-checkout-classic` for classic checkout field placement and validation.
- Use `wc-hpos-compatibility` for order meta persistence.
- Use `wcs-subscription-hooks` and `wcs-renewal-scheduler` when VAT must survive subscription renewals.
