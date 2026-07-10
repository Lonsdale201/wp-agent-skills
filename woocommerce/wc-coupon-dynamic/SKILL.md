---
name: wc-coupon-dynamic
description: Implement dynamic or virtual WooCommerce coupons without creating `shop_coupon` posts. Covers `woocommerce_get_shop_coupon_data`, the `read_manual_coupon` field contract, precedence, validation, custom discount types, exact usage-limit behavior, idempotent usage accounting, performance, and security. Use for generated loyalty, partner, campaign, or entitlement codes resolved from an owned table or service.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.github.io/code-reference/classes/WC-Coupon.html
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-coupon.php
  - wp-content/plugins/woocommerce/includes/class-wc-discounts.php
  - wp-content/plugins/woocommerce/includes/wc-coupon-functions.php
---

# WooCommerce dynamic coupons

Use a virtual coupon when the code is generated/resolved from another source and creating one `shop_coupon` post per code would create unnecessary data or synchronization work.

## Resolution contract

`WC_Coupon::__construct()` applies:

```php
$coupon = apply_filters( 'woocommerce_get_shop_coupon_data', false, $data, $this );
```

If the result is truthy, WooCommerce calls `read_manual_coupon()` and skips the database coupon lookup. A non-empty array therefore creates a coupon object with no database ID.

The second filter argument can be an integer or string. Do not type it as `string`; narrow it before matching a code.

## Safe resolver pattern

```php
add_filter(
    'woocommerce_get_shop_coupon_data',
    static function ( $resolved, $input ) {
        if ( false !== $resolved ) {
            return $resolved; // preserve an earlier resolver
        }

        if ( ! is_string( $input ) ) {
            return false;
        }

        $code = wc_strtolower( wc_format_coupon_code( $input ) );
        if ( 0 !== strpos( $code, 'loyalty-' ) ) {
            return false;
        }

        $entitlement = myplugin_find_active_entitlement( $code );
        if ( ! $entitlement || (int) $entitlement->user_id !== get_current_user_id() ) {
            return false;
        }

        return array(
            'discount_type'  => 'percent',
            'amount'         => '10',
            'individual_use' => true,
            'usage_limit'    => 1,
            'usage_count'    => (int) $entitlement->usage_count,
            'expiry_date'    => $entitlement->expires_at,
            'description'    => __( 'Loyalty discount', 'myplugin' ),
        );
    },
    10,
    2
);
```

Match a cheap, namespaced prefix before a database or HTTP lookup. Cache repeated resolution within the request. Checkout can instantiate the same code multiple times.

Returning `false` means "not resolved here" and lets WooCommerce continue to another filter/database lookup. Never return a malformed non-empty array merely to reject a code.

## Manual coupon fields

`read_manual_coupon()` accepts these canonical keys:

| Key | Value |
|---|---|
| `discount_type` | `percent`, `fixed_cart`, `fixed_product`, or registered custom type |
| `amount` | decimal-compatible numeric value |
| `individual_use` | boolean |
| `product_ids`, `excluded_product_ids` | arrays of product IDs |
| `product_categories`, `excluded_product_categories` | arrays of `product_cat` term IDs |
| `exclude_sale_items` | boolean |
| `usage_limit`, `usage_limit_per_user`, `limit_usage_to_x_items` | integers |
| `usage_count` | current authoritative total usage |
| `expiry_date` | parseable date or `WC_DateTime` |
| `email_restrictions` | array of allowed billing emails |
| `free_shipping` | boolean |
| `minimum_amount`, `maximum_amount` | decimal-compatible values |
| `description` | string |

Use booleans, not `'yes'`/`'no'`, and arrays of integers, not comma-separated IDs. Legacy key aliases can emit `wc_doing_it_wrong()` notices.

## Usage limits: exact behavior

Virtual does not mean all usage validation is disabled:

- Global `usage_limit` validation compares `usage_count` against `usage_limit`, even for a virtual coupon.
- WooCommerce cannot automatically increment/decrement virtual usage because `WC_Coupon::increase_usage_count()` requires a persisted coupon ID/data store.
- Core per-user usage lookup also requires a persisted coupon ID/data store, so `usage_limit_per_user` is not automatically enforced for a virtual coupon.

Therefore the resolver must supply a fresh authoritative `usage_count`, and your integration must atomically account for redemption. Enforce per-user limits in `woocommerce_coupon_is_valid` or in the resolver's own entitlement check.

Do not use one WordPress option per code with `get_option()` then `update_option( $count + 1 )`: it races under concurrent checkout, can double-count repeated status transitions, and bloats the options table.

Preferred accounting model:

1. Owned table with a unique key such as `(order_id, normalized_coupon_code)`.
2. Insert the redemption idempotently when the chosen paid/order lifecycle event occurs.
3. Increment entitlement usage in the same transaction/atomic statement where supported.
4. Define reversal rules for cancellation/refund explicitly.
5. Treat duplicate provider/order events as success without incrementing again.

## Additional validation

```php
add_filter(
    'woocommerce_coupon_is_valid',
    static function ( bool $valid, WC_Coupon $coupon, WC_Discounts $discounts ): bool {
        if ( 0 !== strpos( $coupon->get_code(), 'loyalty-' ) ) {
            return $valid;
        }

        if ( ! is_user_logged_in() ) {
            throw new Exception( __( 'This discount requires an account.', 'myplugin' ) );
        }

        if ( ! myplugin_user_can_redeem( get_current_user_id(), $coupon->get_code() ) ) {
            throw new Exception( __( 'This discount is no longer available.', 'myplugin' ) );
        }

        return $valid;
    },
    10,
    3
);
```

Use `woocommerce_coupon_is_valid_for_cart` for cart-wide conditions and `woocommerce_coupon_is_valid_for_product` for item eligibility. Validation runs repeatedly; it must be deterministic and side-effect free. Account usage only after an order lifecycle event, never during validation.

## Custom discount type

Registering a label does not implement the calculation:

```php
add_filter( 'woocommerce_coupon_discount_types', static function ( array $types ): array {
    $types['myplugin_tiered'] = __( 'Tiered discount', 'myplugin' );
    return $types;
} );

add_filter(
    'woocommerce_coupon_get_discount_amount',
    static function ( $discount, $price, $cart_item, $single, WC_Coupon $coupon ) {
        if ( 'myplugin_tiered' !== $coupon->get_discount_type() ) {
            return $discount;
        }

        // Return the discount amount, not the discounted final price.
        return myplugin_discount_for_item( (float) $price, $cart_item );
    },
    10,
    5
);
```

Keep returned discounts bounded to valid item/cart values and test tax-inclusive/exclusive, quantity, rounding, and refund behavior.

## Security and lifecycle rules

- Normalize codes with WooCommerce helpers before lookup and comparison.
- Bind user-specific codes to the server-side current user, not a submitted user ID.
- Do not expose entitlement existence through detailed errors unless intended.
- Do not call `$coupon->save()` on a virtual coupon; that creates a persistent coupon and changes the model.
- Test classic cart, Store API cart/checkout, admin order coupon actions, retries, refunds, and concurrent redemption.
- Scope every resolver by prefix; this hook runs for real database coupons too.

## Common mistakes

```php
// WRONG: overwrites another plugin's resolved coupon.
return array( 'discount_type' => 'percent', 'amount' => 10 );

// RIGHT: preserve precedence and only claim your namespace.
if ( false !== $resolved ) {
    return $resolved;
}
if ( ! is_string( $input ) || 0 !== strpos( $input, 'LOYALTY-' ) ) {
    return false;
}
```

## Cross-references

- `wc-cart-checkout-classic` for coupon/cart recalculation behavior.
- `wc-store-api` for shopper API writes.
- `wc-order-lifecycle-and-items` for idempotent redemption lifecycle events.

## References

- Resolution and `read_manual_coupon()`: `includes/class-wc-coupon.php`.
- Usage and product/cart validation: `includes/class-wc-discounts.php`.
- Core discount type registry: `includes/wc-coupon-functions.php`.
