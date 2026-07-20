---
name: wc-coupon-dynamic
description: Build or audit WooCommerce virtual coupons resolved at runtime without a `shop_coupon` row. Covers `woocommerce_get_shop_coupon_data`, the `read_manual_coupon()` data contract, reserved code namespaces and resolver precedence, database-fallback collisions, request caching, Store API and classic checkout behavior, validation, external atomic usage accounting, order coupon snapshots, direct order application, deterministic recalculation, and security. Use for generated loyalty, referral, partner, campaign, or entitlement codes backed by an owned table/service, or when code calls these APIs. For persisted coupons, new discount-type math, or general coupon rules use `wc-coupon-types-rules`.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce virtual coupons

WooCommerce calls these **virtual coupons**. “Pseudo coupon” is an informal description, not the core term. Use one when a code is generated or resolved from another authoritative store and creating a `shop_coupon` post per code would cause unnecessary synchronization.

## Choose the right model

| Need | Model |
|---|---|
| Merchant edits the code; core reporting, holds, and usage limits should work | Persisted `WC_Coupon`; use `wc-coupon-types-rules` |
| A namespaced code maps to an external entitlement | Virtual coupon from this skill |
| A new discount formula appears in the coupon type selector | Register a complete custom type with `wc-coupon-types-rules`; it may also be used by a virtual coupon |
| A surcharge or positive adjustment | WooCommerce fee API, not a negative coupon |

A virtual coupon is not automatically safer or faster. Its resolver and usage ledger replace storage and concurrency behavior that core normally supplies.

## Understand the resolution contract

`WC_Coupon::__construct()` filters the unresolved value before database lookup:

```php
$coupon = apply_filters( 'woocommerce_get_shop_coupon_data', false, $data, $this );
```

A truthy result is passed to `read_manual_coupon()`, which sets ID `0`, marks the object virtual, and skips persisted lookup. Returning `false` means “not resolved by this filter” and lets later filters or the database handle the input.

The input may be an integer ID or a string code. Do not type it as `string`. The filter can run on frontend, Store API, REST-adjacent order operations, admin, CLI, cron, and repeated calculation paths.

## Use an owned namespace and one request snapshot

```php
final class MyPlugin_Virtual_Coupons {
	private const PREFIX = 'loyalty-';

	/** @var array<string,object|null> */
	private static $entitlements = array();

	public static function normalize( $input ): ?string {
		if ( ! is_string( $input ) ) {
			return null;
		}

		$code = wc_strtolower( wc_format_coupon_code( $input ) );
		return 0 === strpos( $code, self::PREFIX ) ? $code : null;
	}

	public static function entitlement( string $code ) {
		if ( ! array_key_exists( $code, self::$entitlements ) ) {
			self::$entitlements[ $code ] = myplugin_find_entitlement( $code );
		}

		return self::$entitlements[ $code ];
	}

	public static function resolve( $resolved, $input ) {
		if ( false !== $resolved ) {
			return $resolved; // Preserve a resolver that ran earlier.
		}

		$code = self::normalize( $input );
		if ( null === $code ) {
			return false;
		}

		$entitlement = self::entitlement( $code );

		// Keep every owned-prefix code virtual, including denied/unknown ones.
		// Validation below rejects this inert marker without database fallback.
		if ( ! $entitlement ) {
			return array(
				'discount_type' => 'fixed_cart',
				'amount'        => '0',
				'description'   => __( 'Unavailable virtual coupon', 'myplugin' ),
			);
		}

		return array(
			'discount_type'       => 'percent',
			'amount'              => '10',
			'individual_use'      => true,
			'usage_limit'         => 1,
			'usage_count'         => (int) $entitlement->usage_count,
			'date_expires'        => $entitlement->expires_at,
			'exclude_sale_items'  => true,
			'description'         => __( 'Loyalty discount', 'myplugin' ),
		);
	}
}

add_filter(
	'woocommerce_get_shop_coupon_data',
	array( MyPlugin_Virtual_Coupons::class, 'resolve' ),
	10,
	2
);
```

Claim only a cheap, namespaced prefix before database or HTTP work. A request cache is not merely an optimization: it keeps repeated validation/calculation within one request on the same entitlement snapshot.

### Prevent fallback collisions

If an invalid owned-prefix code returns `false`, Woo may load a persisted coupon with the same normalized code. Choose and enforce one of these policies:

1. prohibit persisted coupons in the reserved namespace; or
2. return an inert virtual marker for every owned-prefix code and reject unknown/unauthorized markers in validation, as above.

Do not return a malformed array. The marker must be a valid, harmless coupon object and must fail closed in the validation layer.

## Validate without side effects

```php
add_filter(
	'woocommerce_coupon_is_valid',
	static function ( bool $valid, WC_Coupon $coupon, WC_Discounts $discounts ): bool {
		$code = MyPlugin_Virtual_Coupons::normalize( $coupon->get_code() );
		if ( null === $code ) {
			return $valid;
		}

		$entitlement = MyPlugin_Virtual_Coupons::entitlement( $code );
		if ( ! $entitlement || ! is_user_logged_in() ) {
			return false;
		}

		return $valid
			&& (int) $entitlement->user_id === get_current_user_id()
			&& myplugin_user_can_redeem( get_current_user_id(), $code );
	},
	10,
	3
);
```

Use `woocommerce_coupon_is_valid_for_product` for per-line eligibility and `woocommerce_coupon_is_valid` for coupon-wide rules. Validation may run repeatedly against a `WC_Cart` or `WC_Order`; keep it deterministic, bounded, and side-effect free. Never consume entitlement during validation or calculation.

Returning `false` gives core's filtered-invalid error. A callback may deliberately throw an `Exception` for a customer-safe custom denial message because `WC_Discounts` catches it, but do not leak whether another user's entitlement exists.

## Supply canonical manual data

`read_manual_coupon()` accepts the same property names used by `WC_Coupon::set_props()`:

| Key | Expected value |
|---|---|
| `discount_type`, `amount` | registered type; decimal-compatible amount |
| `individual_use`, `exclude_sale_items`, `free_shipping` | booleans |
| `product_ids`, `excluded_product_ids` | arrays of product IDs |
| `product_categories`, `excluded_product_categories` | arrays of `product_cat` term IDs |
| `minimum_amount`, `maximum_amount` | decimal-compatible values |
| `usage_limit`, `usage_limit_per_user`, `limit_usage_to_x_items`, `usage_count` | integers |
| `date_expires` | parseable date, timestamp, or `WC_DateTime` |
| `email_restrictions` | array of billing email patterns |
| `description` | string |

Use the canonical `date_expires`; `expiry_date` is only a compatibility alias. Use booleans rather than `'yes'`/`'no'`, and integer arrays rather than comma-separated IDs. Do not call `save()` on an ID-zero virtual coupon; that changes the storage model.

## Own atomic usage accounting

Virtual does not disable all native validation:

- global `usage_limit` is compared with the supplied `usage_count`;
- a filter-resolved virtual object has no coupon data store, so checkout skips native tentative holds and core cannot increment/decrement it;
- native per-user history and tentative checkout holds require a persisted coupon ID, so `usage_limit_per_user` is not sufficient for a virtual coupon;
- there is no core concurrency reservation for an external entitlement.

Use an owned ledger/table with a unique key such as `(order_id, normalized_coupon_code)`. Atomically reserve or consume a slot at one documented lifecycle boundary, record repeated callbacks idempotently, and define cancellation, failed-payment, expiry, and refund reversal policy. Do not implement a counter as `get_option()` followed by `update_option( $count + 1 )`.

If strict single-use protection is required before payment, create an expiring reservation tied to the checkout/order and finalize it after the chosen success event. Release abandoned reservations. Treat resolver `usage_count` as display/validation input, not as the concurrency lock.

## Preserve order snapshots

Normal checkout creates a coupon order item and writes Woo's compact `coupon_info` snapshot. It contains ID, code, type, nominal amount, and optional free-shipping flag. Do not extend that JSON array; store custom immutable facts as separate namespaced coupon-line metadata through `woocommerce_checkout_create_order_coupon_item`.

Historical recalculation may reconstruct an ID-zero/missing coupon from `coupon_info`. Your custom discount-type registration and calculation must still be loaded. If the result depends on mutable external state, snapshot the required rate/tier/rule outcome and restore it through `woocommerce_order_recalculate_coupons_coupon_object` rather than calling today's entitlement service.

### Direct application to an existing order

`WC_Order::apply_coupon()` recalculates item and tax totals, but the direct virtual-object path has a snapshot trap: core later performs an ID lookup and may construct `new WC_Coupon( 0 )`, losing the original virtual type/amount before it stores `coupon_info`.

After a successful direct apply, repair only the matching coupon item's core snapshot with the original object's unmodified `get_short_info()` result, and save custom facts separately:

```php
$result = $order->apply_coupon( $virtual_coupon );

if ( ! is_wp_error( $result ) ) {
	foreach ( $order->get_items( 'coupon' ) as $coupon_item ) {
		if ( wc_is_same_coupon( $coupon_item->get_code(), $virtual_coupon->get_code() ) ) {
			$coupon_item->update_meta_data( 'coupon_info', $virtual_coupon->get_short_info() );
			$coupon_item->update_meta_data( '_myplugin_rule_snapshot', $immutable_snapshot );
			$coupon_item->save();
			break;
		}
	}
}
```

Guard this workaround with a regression test against the supported WooCommerce version; internal order-application behavior can change.

## Support every shopper surface

Cart and Checkout Blocks/Store API still construct server-side `WC_Coupon` and use `WC_Discounts`, so a globally loaded resolver and validation filters work there. Do not limit hooks to classic form requests. Test:

- classic cart and checkout;
- Cart and Checkout Blocks / Store API apply and remove;
- guest and authenticated identity changes;
- repeated totals calculation and checkout retries;
- admin order application and recalculation;
- concurrent last-slot redemption;
- cancellation, failed payment, full/partial refund policy;
- code collision with a persisted coupon;
- custom type plugin deactivation and historical recalculation.

Prefer simple normalized code characters. The Store API's coupon endpoints and older/by-code route patterns do not all accept identical arbitrary characters.

## Cross-references

- `wc-coupon-types-rules`: persisted coupon CRUD, complete custom discount types, native/custom rules, stacking, holds, and the full regression matrix.
- `wc-store-api`: Cart/Checkout Blocks, Nonce/Cart-Token behavior, and headless shopper writes.
- `wc-order-lifecycle-and-items`: safe idempotent order status and refund side effects.
- `wc-cart-checkout-classic`: classic cart calculation and checkout transfer.

## Verified sources

- `wp-content/plugins/woocommerce/includes/class-wc-coupon.php`
- `wp-content/plugins/woocommerce/includes/class-wc-discounts.php`
- `wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-order.php`
- `wp-content/plugins/woocommerce/includes/class-wc-order.php`
- `wp-content/plugins/woocommerce/includes/wc-coupon-functions.php`
- `wp-content/plugins/woocommerce/src/StoreApi/Utilities/CartController.php`
