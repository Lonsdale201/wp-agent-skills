# WooCommerce coupon extension contract

Version scope: WooCommerce 10.9.4, PHP 7.4+. Use this reference for custom coupon types, rule engines, admin/REST fields, concurrency, or historical order recalculation.

## Contents

1. [Core object and storage](#core-object-and-storage)
2. [Custom type pipeline](#custom-type-pipeline)
3. [Native validation order](#native-validation-order)
4. [Classification and exclusion semantics](#classification-and-exclusion-semantics)
5. [Hook contracts](#hook-contracts)
6. [Usage accounting and concurrency](#usage-accounting-and-concurrency)
7. [Order snapshots and deterministic recalculation](#order-snapshots-and-deterministic-recalculation)
8. [Admin, REST, Store API, and Blocks](#admin-rest-store-api-and-blocks)
9. [Custom rule fields](#custom-rule-fields)
10. [Regression matrix](#regression-matrix)

## Core object and storage

`WC_Coupon` is the public data object. Persisted coupons currently use the `shop_coupon` post type and `WC_Coupon_Data_Store_CPT`; HPOS changes orders, not coupon storage.

Important properties include code, status, type, amount, expiry, product/category inclusions and exclusions, sale-item exclusion, spend limits, email restrictions, free shipping, individual use, three usage limits, usage count, and `used_by`.

Use getters/setters and `save()`. The setter order matters:

- register and set `discount_type` before `amount`, because built-in percentage validation caps only the literal `percent` type at 100;
- set `minimum_amount` before `maximum_amount`, because the maximum setter compares them;
- set ID lists as arrays and flags as booleans;
- use `date_expires`, not the legacy `expiry_date` name, in data arrays;
- use `update_meta_data()` for custom properties, not direct post meta.

Coupon codes are sanitized through the default `woocommerce_coupon_code` filter behind `wc_format_coupon_code()`. Lookup and `wc_is_same_coupon()` are case-insensitive. Check `wc_get_coupon_id_by_code()` before creation; the admin can warn about duplicates, but extension code should prevent them deterministically.

## Custom type pipeline

### 1. Registry

`woocommerce_coupon_discount_types` filters `slug => label` from `wc_get_coupon_types()`.

This registry controls:

- the classic coupon editor selector;
- `WC_Coupon::set_discount_type()` validation since WC 10.3;
- WC REST v3 coupon schema enum;
- coupon totals-report type enumeration.

Register globally and early. An admin-only registration lets a coupon save but later frontend/REST/cron hydration can fail after the type disappears.

### 2. Eligibility family

Add the slug to exactly one:

- `woocommerce_product_coupon_types`: per-product rules determine which lines receive discounts;
- `woocommerce_cart_coupon_types`: the coupon applies cart-wide and prohibited items invalidate the coupon.

Neither list means both `WC_Coupon::is_valid_for_product()` and `is_valid_for_cart()` default false, so an unrestricted coupon can validate but `WC_Discounts::get_items_to_apply_coupon()` returns no items. Because core treats every non-product type through the cart-style exclusion-validation path, adding native exclusions can make the unclassified coupon fail earlier instead. Classification is therefore required, not a cosmetic label.

### 3. Calculation

Unknown/custom types reach `WC_Discounts::apply_coupon_custom()`. It:

1. sorts eligible items from highest unit price;
2. respects `limit_usage_to_x_items` and `woocommerce_coupon_get_apply_quantity`;
3. calls `$coupon->get_discount_amount( $per_unit_price, $item_object, true )`;
4. multiplies the returned per-unit discount by quantity;
5. rounds/clamps to the currently undiscounted line amount;
6. stores allocation per coupon and item.

`WC_Coupon::get_discount_amount()` delegates custom math through `woocommerce_coupon_get_discount_amount`. The filter also participates in core type calculations, especially cart calculations, so exact slug scoping is mandatory.

`$cart_item` is an array in cart context and a `WC_Order_Item_Product` in order context. Do not type it as only one of those.

`woocommerce_coupon_custom_discounts_array` receives the final allocation array in Woo's internal price precision, keyed by item key. Use it only for a required final balancing algorithm; ordinary decimal return values are wrong at that layer.

### 4. Sort/stacking

`WC_Cart_Totals` defaults custom types to sort `0`, before:

- fixed product `1`;
- percent `2`;
- fixed cart `3`.

Use `woocommerce_coupon_sort` when the custom type should behave like one of those families. The fallback compares usage-item limit, amount, and ID. Virtual coupon ID is zero, so explicit sort is especially important for predictable stacking.

`woocommerce_calc_discounts_sequentially=yes` uses each line's remaining price as the next calculation basis. With `no`, the calculation basis is the original line price, but Woo still clamps total allocation to the remaining value.

## Native validation order

`WC_Discounts::is_coupon_valid()` runs these checks before the final custom filter:

1. coupon exists, is virtual, and is not trashed;
2. global usage plus tentative holds;
3. per-user persisted usage;
4. expiry;
5. minimum spend;
6. maximum spend;
7. included products;
8. included categories;
9. exclusion/eligible-item semantics;
10. allowed current-user/cart/order billing emails;
11. `woocommerce_coupon_is_valid`.

Native failure codes cover filtered invalid, missing, exhausted, expired, min/max, not applicable, sale-item exclusion, product exclusion, category exclusion, and held/stuck usages. `woocommerce_coupon_error` changes only the message returned after validation catches an exception.

Some `woocommerce_coupon_validate_*` hooks filter a failure predicate, not a validity predicate. For example, returning true from `woocommerce_coupon_validate_minimum_amount` means reject when the surrounding minimum exists. Prefer the clear final/per-product validity hooks unless intentionally replacing a native predicate.

Email restrictions can include wildcards and compare current account email plus cart/order billing email. Persisted per-user usage uses user IDs for logged-in users and billing email for guests, with additional alias checks in checkout/Store API.

## Classification and exclusion semantics

Product-style coupon:

- allowed product/category lists select lines;
- excluded product/category/sale lines are skipped;
- the coupon stays valid when at least one qualifying line remains;
- `limit_usage_to_x_items` caps qualifying units.

Cart-style coupon:

- included product/category lists require at least one match;
- an excluded product, excluded category, or sale item anywhere in the cart invalidates the whole coupon;
- classification changes validity semantics only: built-in `fixed_cart` uses its cart allocator, while a custom cart-classified type still uses `apply_coupon_custom()` and its own per-unit calculation filter.

These semantics come from `validate_coupon_excluded_items()`, `validate_coupon_eligible_items()`, and `WC_Coupon::is_valid_for_product()/is_valid_for_cart()`. Do not decide classification only from the UI label.

Variations compare both variation ID and parent ID for product restrictions. Category resolution includes parent categories where relevant. Test both.

## Hook contracts

| Hook | Arguments | Use |
|---|---|---|
| `woocommerce_coupon_discount_types` | types | Add global slug/label. |
| `woocommerce_product_coupon_types` | slugs | Choose per-line rule semantics. |
| `woocommerce_cart_coupon_types` | slugs | Choose cart-wide rule semantics. |
| `woocommerce_coupon_get_discount_amount` | discount, discounting amount, cart/order item, single, coupon | Calculate per-unit custom discount. |
| `woocommerce_coupon_sort` | sort, coupon | Define stacking order. |
| `woocommerce_coupon_is_valid` | valid, coupon, discounts | Add whole-coupon rule. Return boolean; do not throw for ordinary denial unless a deliberate custom message is required. |
| `woocommerce_coupon_is_valid_for_product` | valid, product, coupon, values | Add per-line rule. Four arguments. |
| `woocommerce_coupon_is_valid_for_cart` | valid, coupon | Override low-level cart-family applicability. Prefer final validity for ordinary rules; forcing true can bypass per-item selection. |
| `woocommerce_coupon_get_items_to_validate` | items, discounts | Narrow validation universe only with a documented policy. |
| `woocommerce_coupon_get_items_to_apply` | eligible items, coupon, discounts | Final allocation set. Prefer removal, not addition. |
| `woocommerce_coupon_get_apply_quantity` | quantity, normalized item, coupon, discounts | Cap discounted quantity. |
| `woocommerce_apply_individual_use_coupon` | coupons to keep, new coupon, applied codes | Permit selected existing coupons to remain. |
| `woocommerce_apply_with_individual_use_coupon` | allow, new coupon, existing individual coupon, applied codes | Permit a new code beside an individual-use code. |
| `woocommerce_checkout_create_order_coupon_item` | coupon item, code, coupon, order | Store a separate immutable custom snapshot. |
| `woocommerce_order_recalculate_coupons_coupon_object` | coupon, code, coupon item, order | Restore custom order-only snapshot before recalculation. |
| `woocommerce_coupon_options_usage_restriction` | coupon ID, coupon | Render custom classic-admin restriction fields. |
| `woocommerce_coupon_options_save` | coupon ID, coupon | Sanitize and persist custom fields through coupon CRUD. |

Callbacks must preserve other plugins' values and avoid global session assumptions. Validation/calculation can run against either a cart or an order.

## Usage accounting and concurrency

Persistent coupon global usage is stored as coupon meta `usage_count`; per-user records are repeated `_used_by` meta values.

Checkout calls `WC_Order::hold_applied_coupons()` for limited coupons. The coupon data store creates expiring tentative meta keys:

- `_coupon_held_<expiry>_<random>` for global slots;
- `_maybe_used_by_<expiry>_<random>` for customer slots.

The hold duration follows the stock-hold setting with at least one minute and is filterable by `woocommerce_coupon_hold_minutes`. SQL conditionally inserts a hold only below the limit and retries expected deadlocks up to three times.

`wc_update_coupon_usage_counts()` is hooked to pending, processing, on-hold, completed, cancelled, failed, and trash transitions. It uses the order's `recorded_coupon_usage_counts` property to make repeated transitions idempotent:

- any status not in the invalid list counts;
- default invalid statuses are cancelled, failed, and trash;
- `woocommerce_update_coupon_usage_invalid_statuses` can change the list;
- counts and one `_used_by` row are decreased when moving into invalid state;
- holds are released when converted or abandoned.

Refund objects do not automatically imply coupon usage restoration. Decide whether a full/partial refund should release usage and implement it once, idempotently, if merchant policy requires it.

Do not directly edit `usage_count` or `_used_by` under concurrency. Do not add a second counter around core persistent coupons.

## Order snapshots and deterministic recalculation

Checkout creates a `WC_Order_Item_Coupon` containing code, realized discount, discount tax, and `coupon_info`.

Since WC 8.7, `coupon_info` is a compact JSON array containing only:

1. coupon ID;
2. code;
3. type (`null` means fixed cart);
4. nominal amount;
5. optional free-shipping flag.

Do not extend or change this format. Add separate namespaced order-item metadata for custom rule inputs/outcomes.

When an order recalculates:

- an existing persisted coupon is reloaded with its current definition;
- if missing/virtual, Woo reconstructs a temporary coupon from `coupon_info`;
- `woocommerce_order_recalculate_coupons_coupon_object` can restore a separately stored immutable snapshot;
- the custom calculation plugin still needs to be active, otherwise the custom type yields no intended calculation.

This means mutable coupon definitions and external rule state can change historical recalculation. Choose and document one policy:

- live policy: recalculation intentionally uses today's coupon/rules;
- snapshot policy: capture custom rate/tier/eligibility inputs on the coupon line and restore them for order recalculation.

Avoid using current user/session or an unbounded remote call when recalculating an old order.

## Admin, REST, Store API, and Blocks

The classic coupon editor gets registered type labels from `wc_get_coupon_types()`. Unknown custom percentage-like types use price-style amount UI and are not automatically capped at 100; validate custom ranges yourself.

Add custom panels/fields with:

- `woocommerce_coupon_data_tabs` and `woocommerce_coupon_data_panels` for a full tab;
- `woocommerce_coupon_options`, `_usage_restriction`, or `_usage_limit` for smaller fields;
- `woocommerce_coupon_options_save` for sanitized CRUD persistence.

WC REST v3 `/wc/v3/coupons` uses `wc_get_coupon_types()` for the `discount_type` enum and supports `meta_data`. Registration must run during REST requests. This is the administrative coupon API, not the shopper cart API.

The Store API applies coupons through server-side `WC_Coupon` and `WC_Discounts`, so globally registered custom types and validation/calculation hooks work for Cart/Checkout Blocks. Apply with `POST /wc/store/v1/cart/apply-coupon` or the coupons collection under the correct Nonce/Cart-Token session contract. The legacy by-code route regex is more restrictive than the apply-coupon body, so prefer simple namespaced codes using letters, digits, underscores, and hyphens.

Classic and Store API individual-use paths both invoke the same two stacking filters, but they use different controller code. Test both.

## Custom rule fields

Keep the admin field, storage, validation, and snapshot layers explicit:

```php
add_action( 'woocommerce_coupon_options_usage_restriction', function ( $coupon_id, WC_Coupon $coupon ) {
	woocommerce_wp_text_input(
		array(
			'id'          => '_myplugin_required_tier',
			'label'       => __( 'Required tier', 'myplugin' ),
			'value'       => $coupon->get_meta( '_myplugin_required_tier', true ),
			'description' => __( 'Internal membership tier slug.', 'myplugin' ),
			'desc_tip'    => true,
		)
	);
}, 10, 2 );

add_action( 'woocommerce_coupon_options_save', function ( $coupon_id, WC_Coupon $coupon ) {
	// Core has already checked the coupon editor request; still sanitize your field.
	$value = isset( $_POST['_myplugin_required_tier'] )
		? sanitize_key( wp_unslash( $_POST['_myplugin_required_tier'] ) )
		: '';

	$coupon->update_meta_data( '_myplugin_required_tier', $value );
	$coupon->save();
}, 10, 2 );
```

For a custom public REST field, register a schema/callback or use `meta_data` with an explicit authorization policy. Never accept customer-submitted eligibility facts at checkout.

## Regression matrix

At minimum test:

- type registry present and absent during admin, REST, frontend, CLI, cron;
- label-only registration produces no discount, then correct product/cart classification;
- product-style mixed eligible/excluded cart;
- cart-style prohibited item invalidates the entire coupon;
- parent product versus variation IDs and categories;
- sale-price products and already-zero lines;
- quantity limits and fractional/custom unit math;
- prices including/excluding tax, tax classes, zero-decimal and multi-decimal currencies;
- custom amount `0`, negative attempt, over-item value, and percent-like value over 100;
- min/max subtotal, allowed email wildcard, guest/user identity, expiry boundary/timezone;
- individual use and stacking with sequential calculation on/off;
- classic cart/checkout and Blocks/Store API;
- REST v3 create/read/update of custom type;
- existing-order apply, cancellation/failure, pending recovery, partial/full refund policy;
- concurrent final usage slot with tentative holds;
- historical recalculation after coupon edit/delete and after plugin deactivation;
- custom metadata snapshot and redaction in REST/logs.
