# Virtual coupons on existing orders

Source and runtime scope: WooCommerce 11.1.1. Use this only for a virtual coupon applied by trusted code to an existing order. Authorize the caller and validate the order customer's entitlement before mutation. The caller is not necessarily the customer.

## Protect the first recalculation

`WC_Abstract_Order::apply_coupon()` creates coupon items, saves, calls `recalculate_coupons()`, then updates usage. Its coupon-item creation looks up the code's persisted ID. For an ID-zero virtual coupon it can store an empty fixed-cart snapshot, losing the original percentage/type and restrictions. A patch after the call cannot protect that first replay.

Wrap the call with a temporary filter scoped to the exact order object and code. This example snapshots property-driven rules; snapshot custom policy inputs separately if calculation hooks require them.

```php
$policy = array(
	'discount_type'               => $virtual_coupon->get_discount_type(),
	'amount'                      => $virtual_coupon->get_amount(),
	'product_ids'                 => $virtual_coupon->get_product_ids(),
	'excluded_product_ids'        => $virtual_coupon->get_excluded_product_ids(),
	'product_categories'          => $virtual_coupon->get_product_categories(),
	'excluded_product_categories' => $virtual_coupon->get_excluded_product_categories(),
	'exclude_sale_items'          => $virtual_coupon->get_exclude_sale_items(),
	'limit_usage_to_x_items'       => $virtual_coupon->get_limit_usage_to_x_items(),
);

$restore = static function ( $candidate, $code, $item, $context ) use ( $order, $virtual_coupon, $policy ) {
	if ( $context !== $order || ! wc_is_same_coupon( $code, $virtual_coupon->get_code() ) ) {
		return $candidate;
	}

	$item->update_meta_data( 'coupon_info', $virtual_coupon->get_short_info() );
	$item->update_meta_data( '_myplugin_coupon_policy_v1', $policy );
	$item->save();
	return $virtual_coupon;
};

add_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore, 10, 4 );
try {
	$result = $order->apply_coupon( $virtual_coupon );
} finally {
	remove_filter( 'woocommerce_order_recalculate_coupons_coupon_object', $restore, 10 );
}

if ( is_wp_error( $result ) ) {
	// Return a customer-safe error; do not consume an external entitlement.
	return $result;
}
```

The core `coupon_info` value above is the original, unmodified `get_short_info()` result. Keep extensions in separate namespaced metadata. Reserve an external entitlement atomically according to your checkout/order policy; compensate on failure. `finally` removes the filter but is not a database transaction or business rollback.

## Restore saved policy on later requests

The temporary filter is gone on subsequent requests. Register a permanent restoration filter that recognizes only your owned code namespace and versioned, server-written metadata. Validate its shape and allowlist property names before passing data to `set_props()`; do not trust arbitrary request/REST metadata. Use the saved policy rather than re-querying current customer tiers or coupon definitions.

In that callback:

1. Preserve the incoming object for unrelated coupon lines.
2. Read `_myplugin_coupon_policy_v1`; fail the operation explicitly if an owned historical policy is missing or invalid and deterministic replay is required.
3. Restore the allowlisted properties and check the `set_props()` result for `WP_Error`.
4. Return the restored coupon. Keep custom type/calculation callbacks loaded on admin, CLI and background requests too.

Core replay calls the discount engine with coupon-wide validation disabled. It does not enforce a new redemption's expiry, membership or usage-limit checks. The property snapshot still governs line selection; any external per-product/calculation filter needs a historical policy too. This mechanism does not freeze tax rates, product taxability or every other integration's behavior.

## Regression fixture

Use two untaxed products costing 100 each and a virtual 10% coupon restricted to the first product. Assert **90 / 100** line totals and a **190** order total immediately after `apply_coupon()`, then after reloading and recalculating with the resolver absent. Checking only 190 can miss an incorrect **95 / 95** allocation.

Also test actor A / order customer B / entitlement B, CLI actor 0, a denied entitlement, a missing snapshot, and fee-only orders. The [smoke plugin example](../../wcs-upgrade-compatibility/examples/woo-skills-smoke/woo-skills-smoke.php) demonstrates positive restoration and customer-identity assertions.

## Sources

- `woocommerce/includes/abstracts/abstract-wc-order.php`: `apply_coupon()`, `set_coupon_discount_amounts()`, `recalculate_coupons()`.
- `woocommerce/includes/class-wc-coupon.php`: `get_short_info()`, `set_props()` via `WC_Data`.
- [WooCommerce 11.1.1 source](https://github.com/woocommerce/woocommerce/tree/11.1.1/plugins/woocommerce).
