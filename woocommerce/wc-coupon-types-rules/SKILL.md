---
name: wc-coupon-types-rules
description: Implement, extend, or audit WooCommerce coupon types, persisted coupon CRUD, eligibility rules, inclusions/exclusions, stacking, usage limits, and order lifecycle behavior. Covers the complete custom discount-type contract (`woocommerce_coupon_discount_types`, product-vs-cart classification, calculation, and sort order), `WC_Coupon` setters, `WC_Discounts`, native product/category/sale/email/spend restrictions, custom validation hooks, admin fields, Store API and REST compatibility, concurrency holds, order snapshots, refunds/cancellations, taxes, and deterministic recalculation. Use when a plugin adds a coupon type or rule engine, changes which products/users qualify, creates coupons programmatically, auto-applies coupons, or produces incorrect/zero/duplicated discounts.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce coupon types and rules

Keep coupon definition, eligibility, calculation, and usage accounting separate. Let `WC_Discounts` allocate discounts and let Woo totals calculate tax; do not rewrite cart item prices or totals to imitate a coupon.

## Choose the coupon model

| Need | Model |
|---|---|
| Merchant-managed reusable code, native limits/reporting | Persisted `WC_Coupon` (`shop_coupon`) |
| Generated code resolved from your own entitlement/table/service | Use `wc-coupon-dynamic` for a virtual coupon |
| A new mathematical discount behavior visible in the type selector | Custom coupon type from this skill |
| Surcharge or positive adjustment | Use the Woo fee API, not a negative/creative coupon |
| Silent customer-specific product price | Use a pricing rule only when it should not be represented as a coupon/order coupon line |

## Create persisted coupons with CRUD

Register custom types before loading or setting them. HPOS does not move coupons into order tables; they remain `shop_coupon` objects, but integrations should still use `WC_Coupon` CRUD.

```php
$code = wc_format_coupon_code( 'PARTNER-2026' );

if ( wc_get_coupon_id_by_code( $code ) ) {
	throw new RuntimeException( 'Coupon code already exists.' );
}

$coupon = new WC_Coupon();
$coupon->set_code( $code );
$coupon->set_status( 'publish' );
$coupon->set_discount_type( 'percent' ); // Set before amount validation.
$coupon->set_amount( '15' );
$coupon->set_product_ids( array( 101, 102 ) );
$coupon->set_excluded_product_ids( array( 103 ) );
$coupon->set_exclude_sale_items( true );
$coupon->set_minimum_amount( '50' ); // Set before maximum.
$coupon->set_maximum_amount( '500' );
$coupon->set_usage_limit( 100 );
$coupon->set_usage_limit_per_user( 1 );
$coupon->set_date_expires( '2026-12-31 23:59:59' );
$coupon->save();
```

Use arrays of IDs and real booleans. Coupon-code comparison is case-insensitive; use `wc_is_same_coupon()` where available instead of raw `===`.

## Register a complete custom type

A functional type needs at least three layers. A label alone only makes the slug visible and acceptable to `set_discount_type()`.

```php
const MYPLUGIN_COUPON_TYPE = 'myplugin_member_percent';

// 1. Register globally: admin selector, WC_Coupon validation, and REST enum.
add_filter( 'woocommerce_coupon_discount_types', function ( array $types ): array {
	$types[ MYPLUGIN_COUPON_TYPE ] = __( 'Member percentage', 'myplugin' );
	return $types;
} );

// 2. Choose exactly one eligibility family. This is product-style.
add_filter( 'woocommerce_product_coupon_types', function ( array $types ): array {
	$types[] = MYPLUGIN_COUPON_TYPE;
	return array_values( array_unique( $types ) );
} );

// 3. Return a per-unit discount amount for the custom branch.
add_filter(
	'woocommerce_coupon_get_discount_amount',
	function ( $discount, $discounting_amount, $cart_item, $single, $coupon ) {
		if ( ! $coupon instanceof WC_Coupon || ! $coupon->is_type( MYPLUGIN_COUPON_TYPE ) ) {
			return $discount;
		}

		$price = max( 0.0, (float) $discounting_amount );
		$rate  = min( 100.0, max( 0.0, (float) $coupon->get_amount() ) );

		return min( $price, $price * $rate / 100 );
	},
	10,
	5
);
```

For the custom branch, Woo calls `get_discount_amount()` per unit with `$single = true`, then multiplies by the applicable quantity. Return the discount, not the final price and not the entire line discount. The same filter also fires for core types, so always return the original value unless the exact custom slug matches.

### Product-style versus cart-style

Choose exactly one:

```php
// Product-style: inclusions/exclusions decide which items receive a discount.
add_filter( 'woocommerce_product_coupon_types', $register_type );

// Cart-style eligibility: a prohibited item invalidates the whole coupon.
add_filter( 'woocommerce_cart_coupon_types', $register_type );
```

Classification controls eligibility, not the custom type's math branch. A custom cart-style type still reaches `apply_coupon_custom()` rather than inheriting `fixed_cart` calculation. If the slug is in neither list, an unrestricted coupon normally validates but finds zero applicable items; native exclusions can instead reject it under the non-product path. Putting it in both makes rule semantics ambiguous and can cause cart validity to bypass per-item selection.

Custom types sort before built-in types by default. Define stacking order deliberately when it affects the result:

```php
add_filter( 'woocommerce_coupon_sort', function ( $sort, WC_Coupon $coupon ) {
	return $coupon->is_type( MYPLUGIN_COUPON_TYPE ) ? 2 : $sort; // Percent-like position.
}, 10, 2 );
```

Test both values of `woocommerce_calc_discounts_sequentially`.

## Use native rules before custom rules

| Rule | `WC_Coupon` API |
|---|---|
| Include products/variations or parents | `set_product_ids()` |
| Exclude products/variations or parents | `set_excluded_product_ids()` |
| Include/exclude product categories | `set_product_categories()`, `set_excluded_product_categories()` |
| Exclude sale items | `set_exclude_sale_items()` |
| Cart subtotal window | `set_minimum_amount()`, `set_maximum_amount()` |
| Allowed billing emails, including wildcard matching at validation | `set_email_restrictions()` |
| Cannot normally stack | `set_individual_use()` |
| Maximum qualifying quantity | `set_limit_usage_to_x_items()` |
| Global/per-customer usage | `set_usage_limit()`, `set_usage_limit_per_user()` |
| Expiry/free-shipping flag | `set_date_expires()`, `set_free_shipping()` |

`free_shipping` does not manufacture a rate; configure a compatible free-shipping method. Product restrictions behave differently according to product/cart classification, so regression-test mixed eligible and excluded carts.

## Add deterministic custom rules

Use the narrowest hook:

```php
add_filter(
	'woocommerce_coupon_is_valid',
	function ( bool $valid, WC_Coupon $coupon, WC_Discounts $discounts ): bool {
		if ( ! $coupon->is_type( MYPLUGIN_COUPON_TYPE ) ) {
			return $valid;
		}

		return $valid && myplugin_customer_is_member( $discounts->get_object() );
	},
	10,
	3
);
```

- `woocommerce_coupon_is_valid`: coupon/order-wide eligibility after native validation.
- `woocommerce_coupon_is_valid_for_product`: per-item eligibility; signature is valid, product, coupon, values.
- `woocommerce_coupon_is_valid_for_cart`: low-level cart-family applicability; prefer the final validity filter for ordinary whole-coupon rules, because forcing this true can bypass per-item selection.
- `woocommerce_coupon_get_items_to_apply`: final item list; prefer removing items, because adding previously rejected items can bypass restrictions.
- `woocommerce_coupon_get_apply_quantity`: cap qualifying quantity without changing cart quantity.
- `woocommerce_coupon_error`: presentation only, not authorization.

Validation runs many times in classic checkout, Blocks/Store API, order creation, and recalculation. Make it side-effect free, bounded, and usable with either `WC_Cart` or `WC_Order`. Avoid network requests in calculation/validation; prefetch/cache authoritative state or fail closed with a short timeout outside the hot calculation loop.

Do not base historical order recalculation on mutable membership tiers, time, external prices, or the current session. Store custom checkout facts as separate coupon-line metadata through `woocommerce_checkout_create_order_coupon_item`; never extend Woo's `coupon_info` JSON format. Load [references/coupon-contract.md](references/coupon-contract.md) for hook signatures, order snapshots, admin fields, usage holds, and the complete validation matrix.

## Respect core usage accounting

Persisted coupon usage is not just `usage_count`:

- checkout tentatively holds global and per-user slots to reduce concurrent over-redemption;
- pending, processing, on-hold, and completed orders count as usage;
- cancelled, failed, and trashed orders release/reduce usage;
- `_used_by` records customer ID or guest billing email;
- the order's recorded-usage flag makes status retries idempotent.

Do not increment counts from validation, `woocommerce_applied_coupon`, or every payment webhook. A refund alone does not necessarily change the order into an invalid usage status, so define the merchant's refund/restoration policy explicitly.

## Apply and auto-apply through Woo

```php
if ( WC()->cart && ! WC()->cart->has_discount( $code ) ) {
	WC()->cart->apply_coupon( $code );
}
```

Guard repeated hooks because carts recalculate frequently. Use `remove_coupon()` when eligibility disappears. Do not mutate `WC()->cart->applied_coupons` directly, and do not assume classic form handlers cover Store API requests.

For an existing order, use `$order->apply_coupon( $coupon_or_code )` and inspect `WP_Error`; it recalculates coupon/item/tax totals and usage state. Never add only a `WC_Order_Item_Coupon` row and assume the product totals were discounted.

## Compatibility and security checklist

1. Register the type on every frontend, REST, CLI, cron, and admin request before coupon hydration.
2. Namespace the slug; preserve other plugins' filter values.
3. Test product and variation inclusion/exclusion, categories, sale items, empty/free items, quantities, min/max, email, guest/user, expiry, and timezone. Include an unclassified-type regression: no restrictions yields zero allocation, while exclusions can reject it earlier.
4. Test tax-inclusive/exclusive prices, multiple tax classes, currency decimals, rounding, and discounts larger than the item.
5. Test stacking, individual-use behavior, both sequential settings, and deterministic sort.
6. Test classic cart/checkout, Cart and Checkout Blocks, Store API, REST v3 coupon CRUD, admin order application/recalculation, refunds, cancellations, and plugin deactivation.
7. Keep custom rule secrets and customer entitlements server-side; error text must not leak hidden eligibility data.
8. Define migration/uninstall behavior: persisted custom-type coupons become unloadable or recalculate incorrectly when registration/calculation disappears.

## Cross-references

- Use `wc-coupon-dynamic` for virtual/non-`shop_coupon` codes and external usage accounting.
- Use `wc-cart-checkout-classic` for classic cart state and order-item transfer.
- Use `wc-store-api` for Blocks/headless cart mutation and Cart-Token/Nonce behavior.
- Use `wc-order-lifecycle-and-items` for order status and refund side effects.

## Verified sources

- `wp-content/plugins/woocommerce/includes/class-wc-coupon.php`
- `wp-content/plugins/woocommerce/includes/class-wc-discounts.php`
- `wp-content/plugins/woocommerce/includes/class-wc-cart.php`
- `wp-content/plugins/woocommerce/includes/class-wc-cart-totals.php`
- `wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-order.php`
- `wp-content/plugins/woocommerce/includes/wc-coupon-functions.php`
- `wp-content/plugins/woocommerce/includes/wc-order-functions.php`
- `wp-content/plugins/woocommerce/includes/data-stores/class-wc-coupon-data-store-cpt.php`
- `wp-content/plugins/woocommerce/src/StoreApi/Utilities/CartController.php`
