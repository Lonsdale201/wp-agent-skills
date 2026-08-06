---
name: wcs-cart-checkout-coupons
description: Implement or audit WooCommerce Subscriptions 9.1 cart, classic checkout, Checkout block, Store API, recurring totals, sign-up fees, subscription coupon types, limited-payment coupons, renewal payment carts, and internal pseudo coupons. Use when code touches WC_Subscriptions_Cart, recurring_carts, recurring_fee, recurring_percent, sign_up_fee, _wcs_number_payments, renewal_fee, renewal_percent, renewal_cart, subscriptions_cart_meta, manual renewal checkout, due-today display, or subscription fee/coupon calculations.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.1.0"
  wp-skills-woocommerce-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# WooCommerce Subscriptions cart, checkout, and coupons

Treat the initial charge and every recurring schedule as separate totals calculations. Let WCS build those calculations; extend them through Woo/WCS hooks instead of copying product meta into custom price arithmetic.

## Start with the correct layer

| Need | Correct layer |
|---|---|
| Change a product's subscription schedule or plan | Product/APFS APIs; use `wcs-subscription-plans-apfs`. |
| Discount recurring product amounts | Persisted `recurring_fee` or `recurring_percent` coupon. |
| Discount only the sign-up fee | `sign_up_fee` or `sign_up_fee_percent` coupon. |
| Preserve an existing renewal order's historical discount while paying it | WCS renewal-cart reconstruction and its internal pseudo coupon. |
| Add a recurring fee | Add a normal Woo fee, then classify the exact fee through `woocommerce_subscriptions_is_recurring_fee`. |
| Show headless recurring totals | Read WCS's Store API extension; do not calculate schedules in JavaScript. |
| Add an unrelated Woo coupon type or virtual entitlement | Use `wc-coupon-types-rules` or `wc-coupon-dynamic`. |

## Respect the two-level cart model

The master `WC_Cart` calculates the amount due now. WCS groups subscription items by recurring schedule and stores cloned, calculated carts in `WC()->cart->recurring_carts`.

- `WC_Subscriptions_Cart::get_calculation_type()` is `none` for the initial cart and `recurring_total` while a recurring clone is being calculated.
- A cart can contain multiple recurring carts when products have different billing interval, period, trial, length, or first-payment dates.
- Recurring carts are derived runtime projections. Do not persist or mutate them as business records.
- Do not assume they exist before `calculate_totals()` has completed.
- Totals callbacks can run many times and recursively for cloned carts. Keep callbacks deterministic, scoped, and idempotent.

For a read-only integration, consume calculated values. For a pricing integration, hook the normal Woo calculation pipeline and explicitly decide whether the rule applies to the initial calculation, recurring calculations, or both.

## Use WCS coupon types deliberately

Merchant-facing WCS types are:

| Type | Applies to |
|---|---|
| `recurring_fee` | Fixed product discount on recurring amounts. |
| `recurring_percent` | Percentage product discount on recurring amounts. |
| `sign_up_fee` | Fixed discount against subscription sign-up fees. |
| `sign_up_fee_percent` | Percentage discount against subscription sign-up fees. |

Recurring coupons can affect the first recurring charge when it is due immediately. A free trial can make that initial recurring amount zero. Sign-up-fee coupons do not become recurring discounts.

WCS also uses `renewal_fee`, `renewal_percent`, `renewal_cart`, and `initial_cart` internally while reconstructing pay-for-order carts. These are virtual transport types, not merchant-authored coupon types. Do not add them to an admin selector, persist new coupons with them, expose them as public headless choices, or use their generated codes as durable identifiers.

Read [references/cart-checkout-contract.md](references/cart-checkout-contract.md) when implementing coupon calculations, renewal-cart behavior, recurring fees, or Store API clients.

## Extend eligibility without bypassing WCS

Keep native coupon restrictions active. Add a narrow rule through Woo coupon validation hooks and return the incoming result when the coupon is outside your scope.

Do not globally return `true` from `woocommerce_coupon_is_valid`: that can override expiration, usage, product/category, customer, and WCS renewal/new-subscription boundaries.

`woocommerce_subscriptions_validate_coupon_type` controls whether WCS performs its subscription-specific type validation. Returning `false` means “skip WCS type validation and preserve the incoming Woo result”; it is not a generic “coupon is valid” switch. Use it only for a deliberately compatible custom type with its own complete contract.

## Handle limited recurring coupons as payment limits

The coupon meta key `_wcs_number_payments` limits a recurring coupon by successful discounted payments. The initial subscription payment counts when it actually contains that discount.

Use `WCS_Limited_Recurring_Coupon_Manager::get_coupon_limit()` for reads. WCS counts paid, non-fully-refunded related orders with a non-zero matching coupon discount and removes the coupon from the subscription after the limit is reached.

Consequences:

- Do not increment a custom counter at checkout or scheduled-payment dispatch time.
- A zero-discount order does not consume a use.
- An unpaid or fully refunded order does not consume a use.
- Limited recurring coupons require gateways supporting subscription amount changes; do not re-enable an incompatible gateway merely to keep it visible.
- If external accounting needs an audit trail, derive it from paid order coupon items and immutable order IDs, not from the current subscription coupon list alone.

## Preserve renewal payment carts

Manual payment of an existing renewal is a reconstruction of that order, not a new-customer coupon application.

WCS can map stored recurring coupon lines to virtual `renewal_fee`/`renewal_percent` coupons. If the original coupon no longer exists or the order contains a manual aggregate discount, WCS creates a `renewal_cart` pseudo coupon so the amount charged still matches the renewal order.

Never regenerate this by applying the current live coupon definition blindly. Coupon amount, restrictions, tax settings, or existence may have changed since the renewal order was created.

In WCS 9.1, manual-discount detection compares coupon-line totals at Woo calculation precision with a one-minor-unit tolerance. Raw float equality can incorrectly classify a tax-inclusive recurring percentage discount as manual. Do not replace this with `!==` or an arbitrary epsilon.

## Support classic and block checkout separately

Classic templates render WCS recurring totals and coupon rows in PHP. Cart and Checkout blocks receive WCS projections under Store API `extensions`.

For headless/block clients:

- Treat `extensions.subscriptions` as an array of recurring schedules, not as the amount due now.
- Monetary values inside each recurring cart's `totals` are smallest-unit strings; use its currency metadata.
- Use `extensions.subscriptions_cart_meta.hidden_coupon_codes` to hide recurring coupons from the initial-order summary when every subscription item is on a free trial.
- Do not show WCS internal renewal pseudo coupons as customer-entered discounts.
- Apply/remove real customer coupons through Store API endpoints so Woo session, validation, totals, and Cart-Token/Nonce handling remain authoritative.

WCS 9.1 fixes Checkout-block payment of renewal orders so the reconstructed coupon discount is included in the amount charged. Test the payment request amount, not only the visible order summary.

## Follow the WCS 9.1 subtotal contract

For classic cart/checkout, WCS now builds “due today” item subtotals from calculated cart line totals on `woocommerce_cart_item_subtotal` at priority `1`.

- `WC_Subscriptions_Cart::get_formatted_product_subtotal()` is deprecated in 9.1.
- `WC_Subscriptions_Cart::get_due_today_subtotal()` is deprecated in 9.1.
- WCS no longer filters `woocommerce_cart_product_subtotal`; direct `WC()->cart->get_product_subtotal()` returns standard Woo output.
- Third-party subtotal markup should filter `woocommerce_cart_item_subtotal` after priority `1` and compose with the incoming markup.
- Do not recompute due-today amounts from `_subscription_*` meta. Switches, synchronized products, resubscribes, trials, taxes, and APFS plans can alter the calculated line.

## Safe implementation workflow

1. Identify initial purchase, delayed initial payment, renewal payment, resubscribe, or switch.
2. Identify classic checkout, Store API/Blocks, or trusted server/admin flow.
3. Load actual `WC_Product`, `WC_Coupon`, `WC_Cart`, and order/subscription objects.
4. Preserve WCS's calculation context and relation markers.
5. Add rules through Woo/WCS filters; never rewrite stored totals from request data.
6. Recalculate using the normal cart/order API.
7. Verify displayed initial total, charged initial total, every recurring schedule, tax, coupon lines, and renewal order total independently.
8. Test HPOS and legacy order storage when order reconstruction or coupon lines are involved.

## Common mistakes

```php
// WRONG: only the first recurring cart is considered.
$recurring_total = reset( WC()->cart->recurring_carts )->get_total( 'edit' );

// WRONG: internal transport type persisted as a merchant coupon.
$coupon->set_discount_type( 'renewal_percent' );

// WRONG: treats displayed summary as proof of the captured amount.
assert_checkout_text_contains_discount();

// RIGHT: assert every calculated schedule and the resulting order/payment amount.
```

## Regression matrix

Test at minimum:

1. Classic cart/checkout and Cart/Checkout blocks.
2. No trial, full free trial, sign-up fee, and deferred synchronized first payment.
3. All four public WCS coupon types, product restrictions, tax-exclusive, and tax-inclusive prices.
4. One and multiple recurring schedule groups.
5. Limited recurring coupon across initial payment, successful renewal, failed/unpaid renewal, and full refund.
6. Manual renewal checkout with the original coupon present, deleted, changed, and with a manual order discount.
7. Recurring percentage coupon with sub-cent tax rounding.
8. Switch/resubscribe with prorated and zero-due-today cases.
9. APFS plan on a normal simple/variable product.
10. Payment request/capture amount equals the final order total.

For WCS 9.1 compatibility, include a subscription originally purchased through resubscribe in switch tests. An upgrade must credit the recurring amount paid for the current period, while sign-up-fee proration must not invent credit for a sign-up fee that the resubscribe order never charged.

## Cross-references

- Use `wc-coupon-types-rules` for the general persisted custom coupon contract.
- Use `wc-coupon-dynamic` for externally resolved virtual coupons.
- Use `wc-store-api` for Store API authentication, Cart-Tokens, Nonces, and extension data.
- Use `wcs-subscription-plans-apfs` for APFS plan selection and headless cart input.
- Use `wcs-renewal-scheduler` for scheduled renewal creation and payment success/failure.
- Use `wcs-data-model-switching-gifting` for switch/resubscribe payloads.

## Verified sources

- `wp-content/plugins/woocommerce-subscriptions/changelog.txt`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-cart.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-coupon.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/class-wcs-limited-recurring-coupon-manager.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wcs-cart-renewal.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wcs-cart-initial-payment.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-extend-store-endpoint.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-checkout.php`
