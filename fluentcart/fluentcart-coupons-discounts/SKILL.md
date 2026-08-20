---
name: fluentcart-coupons-discounts
description: >-
  Implements and audits FluentCart coupon creation, fixed/percentage
  calculation, eligibility conditions, stacking/priority, usage limits,
  recurring discounts, order snapshots, and virtual coupon resolution. Use
  when working with CouponResource, DiscountService, fct_coupons,
  fct_applied_coupons, fluent_cart/coupon/resolve_coupons, can_use_coupon,
  will_skip_item, discount/pre_apply, custom promotion codes, or investigating
  rounding, double application, and per-customer usage errors.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart coupons and discounts

Extend the calculation pipeline instead of altering displayed totals. Revalidate
every coupon against current server-owned cart data.

Read [coupon-pipeline.md](references/coupon-pipeline.md) before implementing a
virtual coupon, new rule, custom type, or recurring discount.

## Use the canonical model

Coupon stores code, type, amount, priority, status, stackable,
show_on_checkout, dates, use_count, and JSON conditions. AppliedCoupon stores
the order-time snapshot. Never reconstruct historical discounts from the
currently editable Coupon.

Use CouponResource for admin CRUD because it validates and converts fixed
amounts/limits. In 1.6.0:

- fixed amount uses integer minor units after formatting;
- percentage amount is a percentage value from 0 through 100;
- lower numeric priority applies first;
- multiple coupons survive together only under the stackability rules.

## Extend eligibility

- fluent_cart/coupon/can_use_coupon: reject the whole coupon with false or
  WP_Error.
- fluent_cart/coupon/will_skip_item: exclude one item.
- fluent_cart/discount/pre_apply: transform candidate cart items before
  application; preserve complete shape and avoid price trust.
- fluent_cart/coupon/per_customer_usage_query: add legitimate usage scoping.
- fluent_cart/coupon/validating_coupon: normalize/admin-order validation code.

Keep eligibility callbacks pure. Coupon recalculation runs after cart/address/
shipping/tax changes and may run repeatedly.

## Implement virtual coupons carefully

fluent_cart/coupon/resolve_coupons receives the database-found collection,
requested codes, and cart context. Append an unsaved Coupon model for an
addon-owned code only after server-side lookup and authorization.

~~~php
add_filter(
    'fluent_cart/coupon/resolve_coupons',
    static function ($coupons, array $codes, array $context) {
        // Resolve only this addon's opaque code from server-owned state.
        // Append a fully populated unsaved Coupon model.
        return $coupons;
    },
    10,
    3
);
~~~

Give the virtual coupon a stable normalized code, supported type, integer amount
where applicable, status, priority, stackable flag, and full conditions. It is
not persisted in fct_coupons, so build separate atomic redemption accounting if
it represents a finite balance or single-use right.

## Do not assume every accepted type is calculated

CouponRequest 1.6.0 accepts fixed, percentage, free_shipping, and buy_x_get_y.
The active DiscountService calculation path is source-confirmed for fixed and
percentage; it does not contain equivalent type branches for free_shipping or
buy_x_get_y. Do not ship those types, or a new custom type, based only on the
request enum. Implement and test all validation, allocation, recurring, order
snapshot, refund, reporting, and UI behavior or keep the type unavailable.

## Preserve calculation invariants

- Recalculate from item subtotal/server price; never discount a browser total.
- Apply included/excluded product variation IDs and product-category term IDs
  in their correct namespaces.
- Treat email wildcards and per-customer limits as authorization-sensitive.
- Respect min_amount_basis: new coupons default to subtotal, while legacy
  missing values preserve total behavior.
- Cap line discount at the eligible line amount.
- Correct fixed-discount rounding deterministically across eligible items.
- Record per-coupon allocation so removal, tax, refund, and order snapshots
  remain explainable.
- Treat recurring discount separately from initial/trial/signup amounts.

## Test matrix

Test case-normalized duplicate code, schedule boundaries in GMT, fixed and
percentage rounding, 0/100 percent, min/max spend basis, category/product
include/exclude, locked line, anonymous/email restriction, per-customer/global
limits under concurrency, stacking order, remove/reapply, tax-inclusive cart,
shipping/fee change, trial/setup/renewal, virtual redemption replay, refund, and
manual order editing.

## Cross-references

- Use fluentcart-cart-checkout for cart revalidation.
- Use fluentcart-orders-transactions for immutable order snapshots/refunds.
- Use fluentcart-subscriptions-renewals for recurring discounts.

## References

- Official product/coupon hooks: <https://dev.fluentcart.com/hooks/actions/products-coupons/>
- Verified Free source paths:
  - fluent-cart/app/Models/Coupon.php
  - fluent-cart/app/Models/AppliedCoupon.php
  - fluent-cart/api/Resource/CouponResource.php
  - fluent-cart/app/Http/Requests/CouponRequest.php
  - fluent-cart/app/Services/Coupon/DiscountService.php
  - fluent-cart/app/Services/Coupon/Concerns/
  - fluent-cart/app/Models/Cart.php
