# FluentCart 1.6.0 coupon pipeline

## Storefront application

~~~text
requested codes plus existing cart codes
  -> query fct_coupons
  -> fluent_cart/coupon/resolve_coupons
  -> format in requested order
  -> status/date/spend/usage validation
  -> can_use_coupon
  -> stackability and priority sort
  -> reset prior coupon allocations
  -> pre_apply
  -> will_skip_item and native conditions
  -> fixed/percentage allocation and rounding correction
  -> recurring allocation where eligible
  -> save cart items, codes, per-coupon amounts
~~~

The pipeline can invalidate some codes while applying others. Inspect
coupon_results rather than assuming a non-error response applied every request.

## Native conditions

- min_purchase_amount
- min_amount_basis: subtotal or total
- max_purchase_amount
- max_discount_amount
- max_uses
- max_per_customer
- included_products / excluded_products
- included_categories / excluded_categories
- email_restrictions
- is_recurring
- apply_to_whole_cart / apply_to_quantity and related type data

Confirm whether the active calculator consumes a condition before relying on it.
The admin/request schema can contain planned or path-specific values.

## Amount conventions

- Coupon amount: fixed is minor units; percentage is percentage points.
- min_purchase_amount and max_discount_amount are converted by CouponResource.
- Cart totals and line allocations are integer minor units.
- Display/edit clients may send decimal currency values to Resource formatting
  code; direct model creation must not skip conversion.

## Virtual redemption design

For wallet/store credit or a single-use generated code:

1. keep the external entitlement in an addon-owned table;
2. resolve it into an in-memory Coupon for calculation;
3. atomically reserve/claim at order creation or payment according to policy;
4. finalize at verified payment;
5. release safely on failed/expired order;
6. store an addon-owned order allocation/idempotency record;
7. reconcile refunds explicitly.

The resolve filter alone does not provide redemption accounting.
