---
name: wcs-subscription-plans-apfs
description: Build or audit WooCommerce Subscriptions 9.0+ All Products for Subscriptions / Subscription Plans integrations. Covers the bundled APFS loader, standalone-plugin bypass, storewide and product plans, `_wcsatt_schemes_status`, `_wcsatt_schemes`, `wcsatt_subscribe_to_cart_schemes`, `wcsatt_data.active_subscription_scheme`, `_wcsatt_scheme`, plan REST endpoints, `woocommerce_is_subscription`, Store API validation, gifting support, bulk edit, and safe extension hooks. Use when any Woo product can be sold one-time, subscription, or both without being a `subscription` product type.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce Subscriptions: APFS subscription plans

Use this when integrating with WooCommerce Subscriptions 9.0+ Subscription Plans, formerly the separate All Products for Subscriptions plugin.

## Misconception this skill corrects

> "All Products for Subscriptions was merged into WooCommerce core, so normal products are now subscription products."

Incorrect. In 9.0.0 the feature is bundled into **WooCommerce Subscriptions**, not WooCommerce core. WCS loads the APFS subsystem from `includes/apfs` and exposes the legacy `WCS_ATT()` global for compatibility. If the standalone All Products for Subscriptions plugin is active or being activated, WCS does not load the bundled subsystem.

## When to use this skill

Trigger when ANY of the following is true:

- The task mentions All Products for Subscriptions, APFS, SATT, Subscription Plans, storewide plans, product plans, purchase options, or "sell any product as subscription".
- Code reads or writes `_wcsatt_schemes_status`, `_wcsatt_schemes`, `_wcsatt_storewide_selection_mode`, `_wcsatt_selected_storewide_plans`, `_wcsatt_force_subscription`, `_wcsatt_disabled`, `_wcsatt_scheme`, or `wcsatt_subscribe_to_cart_schemes`.
- A simple/variable/variation product must behave like a subscription without using the `subscription` or `variable-subscription` product type.
- A headless/cart integration must preserve the selected subscription plan.
- You see `WCS_ATT`, `WCS_ATT_Product`, `WCS_ATT_Product_Schemes`, `WCS_ATT_Cart`, `WCS_ATT_Order`, `wcsatt_`, `convert_to_sub`, or `woocommerce_is_subscription`.

## Runtime loader

WCS initializes APFS from `WC_Subscriptions_Plugin::init_apfs()`:

- It runs after plugins load and checks for the standalone APFS plugin.
- If standalone APFS is active, WCS skips bundled APFS loading to avoid duplicate classes/functions.
- If standalone APFS is not active, WCS requires `includes/apfs/wcs-att-global-function.php`.
- The global instance is stored as `$GLOBALS['woocommerce_subscribe_all_the_things'] = WCS_ATT();`.

Compatibility rule: integrations may check `function_exists( 'WCS_ATT' )`, but do not manually include APFS files.

## Product mode vs pricing mode

Do not confuse these two concepts:

| Concept | Values | Storage / source |
|---|---|---|
| Product purchase mode | `disable`, `override`, `inherit` | `_wcsatt_schemes_status`, via `WCS_ATT_Product::get_subscription_scheme_mode()` |
| Plan pricing mode | `inherit`, `override`, `fixed_discount` | Each `WCS_ATT_Scheme` plan array, key `subscription_pricing_method` |

`fixed_discount` is valid as a plan pricing mode, not as a product purchase mode. `WCS_ATT_Scheme::is_valid_mode()` accepts only `disable`, `override`, and `inherit`.

## Storage map

| Layer | Key | Meaning |
|---|---|---|
| Storewide plans | `wcsatt_subscribe_to_cart_schemes` option | Plans available to products using storewide mode. |
| Product mode | `_wcsatt_schemes_status` | Authoritative purchase mode: sell one-time only, custom plans, or storewide plans. |
| Product custom plans | `_wcsatt_schemes` | Product-specific plan array used in override mode. |
| Storewide selection | `_wcsatt_storewide_selection_mode` | `all` or `specific` when product uses storewide plans. |
| Storewide selected IDs | `_wcsatt_selected_storewide_plans` | Plan IDs allowed for this product when selection mode is `specific`. |
| Force subscription | `_wcsatt_force_subscription` | `yes` disables one-time purchase for products with plans. |
| Legacy disabled flag | `_wcsatt_disabled` | Back-compat marker maintained by `set_subscription_scheme_mode()`. |
| Product gifting override | `_subscription_gifting` | `enabled`, `disabled`, or empty for global gifting behavior. |
| Cart item | `wcsatt_data.active_subscription_scheme` | Selected plan key; `false` means one-time purchase, `null` means undefined. |
| Order/subscription item | `_wcsatt_scheme` | Purchased plan key saved on line items; legacy key is `_wcsatt_scheme_id`. |

Do not write these with raw `update_post_meta()` in new code unless you are doing a controlled migration. Prefer the APFS helper APIs and save the product/order object.

## Product detection rules

APFS hooks `woocommerce_is_subscription` so an ordinary product with an active plan can be treated as a subscription by WCS.

Safe checks:

```php
$product = wc_get_product( $product_id );

if ( $product && WCS_ATT_Product::has_subscription_config( $product ) ) {
    $mode = WCS_ATT_Product::get_subscription_scheme_mode( $product );
}

if ( $product && WCS_ATT_Product_Schemes::has_subscription_schemes( $product ) ) {
    $schemes = WCS_ATT_Product_Schemes::get_subscription_schemes( $product );
}
```

Bad checks:

- Do not check only `$product->is_type( 'subscription' )`.
- Do not assume `WC_Subscriptions_Product::is_subscription( $product )` only means a subscription product type.
- Do not read `_subscription_*` product meta to discover APFS plans. APFS injects subscription runtime meta onto product objects when a scheme is active.

Supported product types are supplied by `WCS_ATT()->get_supported_product_types()` and filter `wcsatt_supported_product_types`. The default list includes simple, variable, variation, bundle, composite, and mix-and-match product types when those integrations exist.

## Managing product mode

Use the helper and save:

```php
$product = wc_get_product( $product_id );

if ( $product instanceof WC_Product && WCS_ATT_Product::supports_feature( $product, 'subscription_schemes' ) ) {
    WCS_ATT_Product::set_subscription_scheme_mode( $product, WCS_ATT_Scheme::MODE_INHERIT );
    $product->update_meta_data( '_wcsatt_force_subscription', 'no' ); // keep one-time purchase enabled
    $product->save();
}
```

Mode meanings:

| Mode | Meaning |
|---|---|
| `WCS_ATT_Scheme::MODE_DISABLE` | Sell one-time only. |
| `WCS_ATT_Scheme::MODE_OVERRIDE` | Use product-specific custom plans from `_wcsatt_schemes`. |
| `WCS_ATT_Scheme::MODE_INHERIT` | Use storewide plans from `wcsatt_subscribe_to_cart_schemes`. |

`set_subscription_scheme_mode()` does not save the product. Forgetting `$product->save()` loses the change.

## Plan CRUD APIs

WCS 9.0 adds manager/controller classes for plan CRUD:

| Need | API |
|---|---|
| Storewide plan storage | `new WCS_ATT_Plans_Manager( 'storewide' )` |
| Product plan storage | `new WCS_ATT_Plans_Manager( 'product' )`; pass product ID to each `read/create/update/delete/reorder` call |
| Storewide REST | `/wp-json/wc/v3/subscriptions/storewide-plans` |
| Product REST | `/wp-json/wc/v3/products/<product_id>/subscription-plans` |
| Reorder storewide | `PUT /wc/v3/subscriptions/storewide-plans/reorder` |
| Reorder product | `PUT /wc/v3/products/<product_id>/subscription-plans/reorder` |

Permission model:

- Storewide plan routes require `wc_rest_check_manager_permissions( 'settings' )`.
- Product plan routes require `wc_rest_check_post_permissions( 'product', 'edit', $product_id )`.

Core plan fields:

```json
{
  "subscription_period": "month",
  "subscription_period_interval": 1,
  "subscription_length": 0,
  "subscription_trial_period": "day",
  "subscription_trial_length": 14,
  "subscription_signup_fee": "9.99",
  "subscription_pricing_method": "inherit",
  "subscription_discount": "10",
  "subscription_payment_sync_date": { "day": 0 }
}
```

Product plans also support `subscription_pricing_method: "override"` with `subscription_regular_price` and `subscription_sale_price`. Storewide plans support `inherit` and `fixed_discount`, not `override`.

The manager constructor accepts only the plan type. This is the correct product call shape:

```php
$manager = new WCS_ATT_Plans_Manager( 'product' );
$plans   = $manager->read( $product_id );
$created = $manager->create( $plan_data, $product_id );
```

Do not pass a product ID to `__construct()`; a single product manager can operate on multiple products.

## Cart and checkout behavior

On add to cart, APFS reads `convert_to_sub_<product_id>` or `convert_to_sub` from the request and stores the parsed plan key in:

```php
$cart_item['wcsatt_data']['active_subscription_scheme'];
```

Use helpers instead of unpacking this everywhere:

```php
$scheme_key = WCS_ATT_Cart::get_subscription_scheme( $cart_item );
$schemes    = WCS_ATT_Cart::get_subscription_schemes( $cart_item );
```

`active_subscription_scheme` has three important states:

| Value | Meaning |
|---|---|
| string plan key | The cart item is being purchased as a subscription. |
| `false` | The shopper chose one-time purchase. |
| `null` | No explicit state; APFS may apply the default/forced scheme. |

APFS applies the selected scheme to the cart product object through `WCS_ATT_Product_Schemes::set_subscription_scheme()`. That sets runtime WCS meta such as `subscription_period`, `subscription_period_interval`, `subscription_trial_length`, `subscription_trial_period`, and `subscription_sign_up_fee`.

## Order item behavior

APFS stores the selected plan on line items during checkout:

```php
$scheme_key = WCS_ATT_Order::get_subscription_scheme( $order_item );
```

The persisted line-item meta is `_wcsatt_scheme`; `_wcsatt_scheme_id` is legacy. APFS hides this meta in normal order item displays.

For trial plans, APFS can add `_has_trial` at line-item creation time if the WCS core trial detector missed the runtime APFS scheme meta. Do not reimplement sign-up fee or trial math from raw line totals.

## Store API and headless flows

APFS does not create a public Store API management surface for plans. Plan management is WC REST `wc/v3`, not `/wc/store/v1`.

What APFS does add to Store API:

- `woocommerce_store_api_validate_cart_item` validates that a cart item's selected plan is still valid.
- `woocommerce_store_api_checkout_update_order_meta` validates the draft/checkout order against current cart contents.
- Invalid plans throw `woocommerce_store_api_subscription_plan_invalid`.

Headless clients must preserve the selected plan when adding to cart. Use the same request shape the frontend expects: `convert_to_sub_<product_id>` on product add-to-cart or `convert_to_sub` for cart item updates. Then read the Store API cart response and keep the returned cart key/token flow intact.

For JSON Store API clients, add an explicit `woocommerce_store_api_add_to_cart_data` bridge because APFS itself reads classic `$_REQUEST` keys. The bridge must parse the key with `WCS_ATT_Product_Schemes::parse_subscription_scheme_key()` and set `cart_item_data.wcsatt_data.active_subscription_scheme`. See [headless-admin-reference.md](headless-admin-reference.md) for the complete example.

If the client posts form/query params, the classic `convert_to_sub_<product_id>` path can still work through `$_REQUEST`; explicit cart item data is the robust JSON contract.

For checkout order meta, remember WC 10.8+ deferred draft order creation: `woocommerce_store_api_checkout_update_order_meta` runs when the real order exists during POST checkout, not on every checkout PATCH.

## Admin, bulk edit, and hooks

The product screen adds a Subscriptions tab to supported ordinary products and stores plan/mode fields through its save handler. Bulk edit uses `_wcsatt_bulk_purchase_option` (`inherit`, `override`, `disable`) and `_wcsatt_bulk_allow_one_off`; it skips override without custom plans and saves the product itself.

Use APFS filters rather than replacing its admin save path. High-value hooks include `wcsatt_supported_product_types`, `wcsatt_product_subscription_schemes`, `wcsatt_cart_item_subscription_schemes`, `wcsatt_set_product_subscription_scheme`, `wcsatt_cart_item`, `wcsatt_processed_cart_scheme_data`, and `wcsatt_processed_scheme_data`. Exact fields and the extended hook map are in [headless-admin-reference.md](headless-admin-reference.md).

## Gifting

WCS 9.0 supports gifting for products sold via APFS plans. Product-level gifting still uses `_subscription_gifting`; the APFS product panel can save it as `_wcsatt_subscription_plan_gifting` from the UI. When extending gifting logic, combine this skill with `wcs-data-model-switching-gifting`.

## Common mistakes

```php
// WRONG: misses simple products sold as subscription plans.
if ( $product->is_type( 'subscription' ) ) {
    grant_subscription_feature();
}

// RIGHT: allow APFS to make ordinary products subscription-like.
if ( WC_Subscriptions_Product::is_subscription( $product ) ) {
    grant_subscription_feature();
}

// WRONG: set mode but never persist it.
WCS_ATT_Product::set_subscription_scheme_mode( $product, WCS_ATT_Scheme::MODE_INHERIT );

// RIGHT:
WCS_ATT_Product::set_subscription_scheme_mode( $product, WCS_ATT_Scheme::MODE_INHERIT );
$product->save();

// WRONG: plan pricing mode used as product purchase mode.
WCS_ATT_Product::set_subscription_scheme_mode( $product, WCS_ATT_Scheme::MODE_FIXED_DISCOUNT );

// RIGHT: fixed_discount belongs inside the plan data.
$plan_data['subscription_pricing_method'] = WCS_ATT_Scheme::MODE_FIXED_DISCOUNT;
```

## Cross-references

- Run `wcs-subscription-hooks` when choosing lifecycle, renewal, switch, gift, Store API, or status hooks around subscriptions created from APFS plans.
- Run `wcs-data-model-switching-gifting` when exact switch/gift storage and recipient behavior matters.
- Run `wc-store-api` for Store API nonce/token/session/deferred checkout rules.
- Run `wc-hpos-compatibility` before querying orders, subscriptions, renewal orders, switch orders, or resubscribe orders.

## References

- Official documentation: <https://woocommerce.com/document/all-products-for-woocommerce-subscriptions/>
- Verified source paths:
  - `wp-content/plugins/woocommerce-subscriptions/includes/class-wc-subscriptions-plugin.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/woocommerce-all-products-for-subscriptions.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-scheme.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-product.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/product/class-wcs-att-product-schemes.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-cart.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-order.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/api/class-wcs-att-store-api.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/admin/class-wcs-att-plans-manager.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/admin/class-wcs-att-rest-plans-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/admin/class-wcs-att-rest-product-plans-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-extend-store-endpoint.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/CartAddItem.php`
  - `wp-content/plugins/woocommerce-subscriptions/src/Internal/Products/BulkActions.php`
