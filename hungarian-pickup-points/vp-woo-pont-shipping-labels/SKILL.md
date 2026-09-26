---
name: vp-woo-pont-shipping-labels
description: Integrate with the shipping-label workflow in Csomagpontok és Címkék WooCommerce-hez. Covers the PRO boundary, normalized label payload, `generate_label()` and idempotency, HPOS-safe parcel meta, payload filters, label-created/error/removed actions, provider selection, PDF links, permissions, remote voiding versus local clearing, Számlázz.hu invoice references, and safe external side effects. Use when another WooCommerce plugin must add label fields, trigger generation, sync tracking numbers, expose a label link, or react to carrier-label lifecycle events.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "hungarian-pickup-points-for-woocommerce"
  wp-skills-plugin-version-tested: "4.2.8"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-27"
---

# Shipping-label integration

Let the plugin own carrier authentication, provider requests, PDFs, parcel metadata, and duplicate prevention. A companion plugin should modify the normalized payload or react to lifecycle hooks.

## PRO and side-effect boundary

Ordinary Foxpost, Packeta, GLS, DPD, MPL/Posta, Sameday, Express One, Trans-Sped, Csomagpiac, and custom label generation is a **PRO** feature. Kvikk follows a separately configured path in 4.2.8 and is exempt from the generic PRO gate in `generate_label()`.

Generating or voiding a label calls an external carrier service and may create a chargeable shipment. Require explicit user authorization immediately before a companion UI, REST route, CLI command, or automation performs that call.

## Normalized data pipeline

`VP_Woo_Pont()->labels->prepare_order_data( $order )` creates a carrier-neutral array:

| Key | Meaning |
|---|---|
| `order_id`, `order_number` | Internal ID and display order number. |
| `reference_number`, `cod_reference_number` | Setting-selected references; may come from order number, order ID, invoice number, or custom order meta. |
| `invoice_number` | Számlázz.hu or Woo Billingo invoice number when present. |
| `customer` | Shipping identity, billing fallbacks, phone, and email. |
| `package` | Total, insurance total, weight, COD flag, currency, quantity, and resolved package size. |
| `point_id`, `provider` | Canonical order metadata. |
| `options` | Manual package count, pickup date, contents, weight, extra services, or packaging overrides. |
| `source` | Usually `orders_table` or `metabox`. |

Filter timing matters:

1. `vp_woo_pont_prepare_label_data( $data, $order )` runs at the end of the neutral builder.
2. `vp_woo_pont_prepare_order_data_for_label( $data, $order, $provider )` runs immediately before provider dispatch.
3. A provider-specific filter such as `vp_woo_pont_gls_label` or `vp_woo_pont_packeta_label` may then change the provider request.

Prefer the neutral filters when the change applies to multiple carriers:

```php
add_filter(
	'vp_woo_pont_prepare_order_data_for_label',
	static function ( array $data, WC_Order $order, string $provider ): array {
		$contents = (string) $order->get_meta( '_myplugin_package_contents' );
		if ( '' !== $contents ) {
			$data['options']['package_contents'] = $contents;
		}

		return $data;
	},
	10,
	3
);
```

Preserve `order` as the `WC_Order` object. Do not put secrets in the payload because debug logs and provider error handling may include request context.

## Trigger generation deliberately

```php
$order = wc_get_order( $order_id );
if ( ! $order instanceof WC_Order ) {
	return new WP_Error( 'missing_order', 'Order not found.' );
}

if ( VP_Woo_Pont()->labels->is_label_generated( $order ) ) {
	return new WP_Error( 'label_exists', 'A label already exists.' );
}

$result = VP_Woo_Pont()->labels->generate_label( $order->get_id() );
if ( ! empty( $result['error'] ) ) {
	return new WP_Error( 'label_failed', implode( ' ', $result['messages'] ?? array() ) );
}
```

`generate_label()` itself does not check the current user's capability or a nonce. The plugin's admin AJAX wrappers do. Any new entry point must enforce authentication, a CSRF token where applicable, and `edit_shop_orders` before calling it.

The provider is resolved through `VP_Woo_Pont_Helpers::get_carrier_from_order()` unless passed explicitly. Do not pass a point subtype such as `gls_locker` where a carrier class key such as `gls` is required.

## Stored result

After success, the plugin writes through `WC_Order`:

| Meta | Meaning |
|---|---|
| `_vp_woo_pont_parcel_id` | Provider shipment/parcel identifier. |
| `_vp_woo_pont_parcel_pdf` | Stored PDF filename relative to the plugin label directory. |
| `_vp_woo_pont_parcel_number` | Tracking/parcel number. |
| `_vp_woo_pont_parcel_count` | Present for multi-package generation. |
| `_vp_woo_pont_closed` / `_vp_woo_pont_mpl_closed` | Shipment-closing state where supported. |
| `_vp_woo_pont_kvikk_accounting` | Kvikk-specific accounting response. |

Use `VP_Woo_Pont()->labels->generate_download_link( $order )` for a URL. Do not request its absolute-path mode in user-facing or remote output.

Lifecycle hooks:

| Hook | Arguments | Timing |
|---|---:|---|
| `vp_woo_pont_label_generate_error` | 3 | Duplicate label or provider error. The second argument can be a string code or `WP_Error`. |
| `vp_woo_pont_label_created` | 3 | Parcel metadata has been saved; status automation may run next. |
| `vp_woo_pont_target_order_status_after_label_generated` | 4 | Choose or suppress the post-generation order status. |
| `vp_woo_pont_label_removed` | 3 | Remote void succeeded or the provider reported local-only deletion. |
| `vp_woo_pont_new_label` | 2 | Existing local label metadata was cleared for replacement. |

Keep `vp_woo_pont_label_created` handlers idempotent. A retry in your own integration must not create a second shipment.

## Void and replace are different

- `void_label( $order_id, $provider )` calls the provider's void API, then clears parcel metadata when successful.
- `new_label( $order_id )` only clears local metadata. It explicitly does **not** cancel the old shipment at the carrier.

Never use `new_label()` as a cancellation operation. Show that distinction in any UI or automation.

## Számlázz.hu interoperability

The label builder recognizes `_wc_szamlazz_invoice` for invoice-number references and `{invoice_number}` label-content placeholders. When both plugins are active with Csomagpontok PRO enabled, the bundled compatibility module also adds pickup-point data to Számlázz.hu notes and can send invoice information through the Kvikk payload.

Use the dedicated Számlázz.hu hooks when changing invoice XML. Do not mutate `_wc_szamlazz_invoice` to influence label generation.

## Critical rules

- Check capability and request authenticity in every new generation/void endpoint.
- Confirm the order needs shipping and has a configured carrier before external calls.
- Use `is_label_generated()` as a guard, but also design automation retries to be idempotent.
- Never write parcel-success meta before the carrier confirms success.
- Never expose carrier credentials, webhook URLs, raw request bodies, or local PDF paths.
- Treat `messages` as display text, not a stable machine error code.

## Smoke checklist

- Build label data without calling a carrier and inspect provider, point, customer, totals, weight, and options.
- With an authorized sandbox carrier account, test success, provider error, duplicate generation, remote void, and local clear separately.
- Verify parcel meta and PDF link through `WC_Order` with HPOS enabled.
- Verify the `vp_woo_pont_label_created` consumer does not run twice on retry.
- If Számlázz.hu supplies the reference, test both an invoiced and a not-yet-invoiced order.

## Cross-references

- Use `wc-hpos-compatibility` for order metadata.
- Use `wc-action-scheduler-jobs` when queuing bulk generation.
- Use `szamlazzhu-document-xml-compatibility` for invoice-side changes.

## References

- Official plugin page: <https://wordpress.org/plugins/hungarian-pickup-points-for-woocommerce/>
- WooCommerce HPOS documentation: <https://woocommerce.com/document/high-performance-order-storage/>
- Verified source paths:
  - `includes/class-labels.php`
  - `includes/class-helpers.php`
  - `includes/class-pro.php`
  - `includes/providers/`
  - `includes/compatibility/modules/class-vp-woo-pont-szamlazz.php`
