---
name: vp-woo-pont-checkout-order-data
description: Integrate a WooCommerce plugin or checkout with Csomagpontok és Címkék WooCommerce-hez pickup-point selection and order data. Covers classic checkout and Checkout Blocks, Store API namespace `vp-woo-pont-picker`, session state, HPOS-safe order meta, provider versus carrier IDs, shipping-address replacement, pricing filters, custom checkout compatibility, and safe programmatic point assignment. Use when reading the selected point, changing checkout UI, adding a provider, synchronizing an order, or making another shipping/payment plugin cooperate with `vp_pont`.
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

# Pickup-point checkout and order data

Use the plugin's point resolver, WooCommerce session, order object, and public hooks. Do not invent a second pickup-point field or infer the courier from a shipping label.

## Edition boundary

Pickup-point import, map/search UI, the `vp_pont` shipping method, conditional pricing, classic checkout, Checkout Blocks, and canonical order storage are available without PRO. Carrier label generation and tracking are separate PRO workflows.

The 4.2.8 package requires WordPress 6.0 or newer and declares WooCommerce as a required plugin. Its Composer platform is PHP 7.4. The checkout/order contract was runtime-smoked on WordPress 7.1.2 and WooCommerce 11.1.2.

## Canonical state

| Scope | Key | Shape and purpose |
|---|---|---|
| Woo session | `selected_vp_pont` | Full selected-point array during cart/checkout. Treat it as ephemeral. |
| User meta | `_vp_woo_pont_point_id` | Last preference as `provider|point_id`; it is not the order record. |
| Order meta | `_vp_woo_pont_provider` | Point-provider ID such as `gls_locker`, or a paired home-delivery carrier such as `gls`. |
| Order meta | `_vp_woo_pont_point_id` | Provider-specific pickup-point ID. Its presence distinguishes point delivery from paired home delivery. |
| Order meta | `_vp_woo_pont_point_name` | Display name captured at checkout. |
| Order meta | `_vp_woo_pont_point_coordinates` | `latitude;longitude`. Parse defensively; do not treat it as an address. |

When a point is selected, `update_order_with_selected_point()` also replaces the WooCommerce shipping address with the point address. The point name becomes shipping company, while the shopper's name and phone remain on the order. Code that exports orders should therefore read both the point meta and the normal shipping address.

Use `WC_Order` methods so the integration remains HPOS-safe:

```php
$order = wc_get_order( $order_id );
if ( ! $order instanceof WC_Order ) {
	return;
}

$provider = VP_Woo_Pont_Helpers::get_provider_from_order( $order );
$carrier  = VP_Woo_Pont_Helpers::get_carrier_from_order( $order );
$point_id = (string) $order->get_meta( '_vp_woo_pont_point_id' );
```

`provider` and `carrier` are not synonyms. `gls_locker` is a point provider; its carrier is `gls`. The helper also normalizes Postapont IDs to the `posta` carrier. Do not reproduce this with `explode( '_', ... )` in another plugin.

## Assign a real point

Resolve the submitted ID against the plugin's imported point data before changing the order:

```php
$order = wc_get_order( $order_id );
$point = VP_Woo_Pont()->find_point_info( $provider_id, $point_id, $country_code );

if ( $order instanceof WC_Order && is_array( $point ) ) {
	VP_Woo_Pont()->update_order_with_selected_point( $order, $point );
}
```

The update method saves the order, updates the shipping address and four canonical meta keys, then fires:

```php
do_action( 'vp_woo_pont_update_order_with_selected_point', $order, $point );
```

It also removes saved shipping-address fields from customer user meta for customer accounts. Use it only when that plugin-owned behavior is intended. For a read-only integration, never call it.

## Classic checkout and Checkout Blocks

Classic checkout selects a point through the WooCommerce AJAX action `vp_woo_pont_select`, stores the resolved array in `selected_vp_pont`, and persists it during `woocommerce_checkout_update_order_meta`.

Checkout Blocks uses the Store API extension namespace `vp-woo-pont-picker`:

- Cart response data: `extensions["vp-woo-pont-picker"].shipping_costs` and `.selected_pont`.
- Update callback inputs: `payment_method`, `country`, or `selected_point` with `provider`, `id`, and `country`.
- Reset input: `selected_point.reset`.
- Order persistence: `woocommerce_store_api_checkout_update_order_from_request`.

Send block updates through WooCommerce's Store API extension mechanism. Posting classic checkout fields into a block checkout does not populate the plugin session.

Both surfaces fire `vp_woo_pont_point_selected` with the resolved point array after session state changes. Keep handlers idempotent because cart recalculation can repeat.

## Extend checkout without replacing it

Useful extension points:

| Hook | Arguments | Use |
|---|---:|---|
| `vp_woo_pont_is_vp_pont_selected_checkout_ui` | 1 | Recognize a compatible custom shipping method as a point-selection surface. |
| `vp_woo_pont_load_pont_map` | 1 | Load the map on an additional frontend screen. |
| `vp_woo_pont_frontend_params` | 1 | Add safe frontend configuration without exposing credentials. |
| `vp_woo_pont_required_pont_message` | 1 | Customize the missing-point validation message. |
| `vp_woo_pont_update_order_shipping_address` | 3 | Adjust the point-derived address before `WC_Order::set_address()`. |
| `vp_woo_pont_get_provider_from_order` | 2 | Override provider resolution for an integration-owned order. |
| `vp_woo_pont_get_carrier_from_order` | 2 | Override normalized carrier resolution. |

Do not disable missing-point validation merely to make a custom checkout submit. Ensure that the custom UI writes `selected_vp_pont` through the supported classic or Store API path.

## Pricing contract

`VP_Woo_Pont_Helpers::calculate_shipping_costs()` returns entries keyed by point provider. Each entry contains `net`, `tax`, `gross`, formatted values, label, and whether the default price supplied it.

Use the narrowest filter:

```php
add_filter(
	'vp_woo_pont_shipping_cost',
	static function ( float $cost, array $matched_prices, string $provider_id ): float {
		if ( 'gls_locker' === $provider_id && my_plugin_customer_has_contract_rate() ) {
			return 990.0;
		}

		return $cost;
	},
	10,
	3
);
```

`vp_woo_pont_provider_costs` filters the completed provider map and receives the cart-details array as its second argument. Preserve the expected entry shape and provider ordering. Negative costs hide a provider; zero means free shipping.

## Critical rules

- Read and write order data through `WC_Order`; do not query `wp_postmeta`.
- Treat point IDs as provider-scoped strings, not integers.
- Use helper resolution for provider/carrier names and IDs.
- Do not store the full point database on orders; save the canonical snapshot fields.
- Do not expose imported point-file paths, carrier credentials, or webhook tokens.
- Test classic checkout and Checkout Blocks separately; they use different transport paths.

## Smoke checklist

- Select, replace, and reset a point in classic checkout and Checkout Blocks.
- Confirm `_vp_woo_pont_provider`, point ID, name, coordinates, and shipping address on the resulting order.
- Test a paired home-delivery shipping method; it should have provider meta without point meta.
- Verify logged-in user preference does not overwrite an already selected checkout point.
- Repeat with HPOS enabled.

## Cross-references

- Use `wc-hpos-compatibility` for order storage.
- Use `wc-cart-checkout-classic` for classic checkout lifecycle work.
- Use `wc-shipping-method` when registering a separate WooCommerce shipping method.

## References

- Official plugin page: <https://wordpress.org/plugins/hungarian-pickup-points-for-woocommerce/>
- WooCommerce Store API extension guide: <https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/extend-store-api-add-data/>
- WooCommerce HPOS documentation: <https://woocommerce.com/document/high-performance-order-storage/>
- Verified source paths:
  - `index.php`
  - `includes/class-helpers.php`
  - `includes/class-wc-shipping-pont.php`
  - `includes/block/pont-picker-block.php`
  - `includes/block/pont-picker-block-endpoints.php`
