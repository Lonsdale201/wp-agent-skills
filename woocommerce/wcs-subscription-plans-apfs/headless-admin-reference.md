# APFS headless and admin reference

## JSON Store API bridge

`/wc/store/v1/cart/add-item` builds cart item data through `woocommerce_store_api_add_to_cart_data`, while bundled APFS reads classic request keys. Bridge JSON explicitly:

```php
add_filter( 'woocommerce_store_api_add_to_cart_data', function ( array $data, WP_REST_Request $request ): array {
    if ( ! class_exists( 'WCS_ATT_Product_Schemes' ) ) {
        return $data;
    }

    $product_id = absint( $data['id'] ?? 0 );
    $raw_key    = $request->get_param( 'convert_to_sub_' . $product_id );

    if ( null === $raw_key ) {
        $raw_key = $request->get_param( 'convert_to_sub' );
    }

    if ( null !== $raw_key ) {
        $data['cart_item_data']['wcsatt_data']['active_subscription_scheme'] =
            WCS_ATT_Product_Schemes::parse_subscription_scheme_key( wc_clean( (string) $raw_key ) );
    }

    return $data;
}, 10, 2 );
```

The client must still send the Store API Nonce or Cart-Token and preserve the returned cart/session token. Server validation rejects plans removed or no longer applicable after add-to-cart.

## Product admin fields

- `_wcsatt_schemes_status`: purchase mode.
- `_wcsatt_allow_one_off`: UI input mapped to `_wcsatt_force_subscription`.
- `_wcsatt_storewide_selection_mode`: all/specific.
- `_wcsatt_selected_storewide_plans`: selected storewide UUIDs.
- `_wcsatt_subscription_plan_gifting`: UI input mapped to `_subscription_gifting`.

Do not save these hidden inputs from an unrelated form without reproducing the product editor nonce/capability checks and APFS normalization.

## Bulk edit

- `_wcsatt_bulk_purchase_option`: `inherit`, `override`, or `disable`.
- `_wcsatt_bulk_allow_one_off`: updates `_wcsatt_force_subscription`.
- Override is skipped if the product has no custom plans.
- The handler saves each product because Woo's normal bulk save already ran.

## Extension hooks

| Hook/filter | Use |
|---|---|
| `wcsatt_supported_product_types` | Add a compatible product type. |
| `woocommerce_subscriptions_default_product_subscription_scheme_mode` | Default unconfigured product mode. |
| `wcsatt_product_subscription_schemes` | Filter resolved product plans. |
| `wcsatt_cart_item_subscription_schemes` | Filter plans for one cart item. |
| `wcsatt_set_product_subscription_scheme` | Observe runtime scheme changes. |
| `wcsatt_cart_product_price` | Filter cart price HTML. |
| `wcsatt_cart_item` | Adjust cart item after scheme application. |
| `wcsatt_processed_cart_scheme_data` | Add storewide plan fields before save. |
| `wcsatt_processed_scheme_data` | Add product plan fields before save. |
| `wcsatt_restore_subscription_scheme_from_subscription_args` | Control fallback matching for old line items. |

Frontend display filters live under `includes/apfs/display/` and include `wcsatt_show_single_product_options`, `wcsatt_subscription_options_layout`, and `wcsatt_add_to_cart_text`.
