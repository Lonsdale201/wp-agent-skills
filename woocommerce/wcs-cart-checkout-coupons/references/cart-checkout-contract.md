# WCS cart, checkout, and coupon contract

Read this reference when code changes totals, recurring fees, coupon eligibility, renewal payment carts, or Store API presentation.

## Calculation contexts

| Context | Detection | Meaning |
|---|---|---|
| Initial/current cart | `WC_Subscriptions_Cart::get_calculation_type() === 'none'` | Amount due now. |
| Recurring schedule clone | `WC_Subscriptions_Cart::get_calculation_type() === 'recurring_total'` and the cart has `recurring_cart_key` | Future recurring amount for one schedule group. |
| Renewal payment cart | `wcs_cart_contains_renewal()` | Existing renewal order reconstructed for payment. |
| Resubscribe cart | `wcs_cart_contains_resubscribe()` | New subscription based on an ended subscription. |
| Switch cart | `wcs_cart_contains_switches()` or `subscription_switch` cart data | Existing subscription change through the switch flow. |

`WC()->cart->recurring_carts` is populated after WCS groups and calculates the cart. Keys are implementation grouping values, not public schedule IDs. Never parse a recurring cart key into business data.

## Coupon type matrix

| Type | Merchant-facing | Product-style | Initial calculation | Recurring calculation | Renewal cart |
|---|---:|---:|---|---|---|
| `recurring_fee` | Yes | Yes | Applies to a recurring amount due immediately; excluded from a fully free-trial initial charge. | Fixed recurring product discount. | Reconstructed as `renewal_fee`. |
| `recurring_percent` | Yes | Yes | Applies to a recurring amount due immediately; excluded from a fully free-trial initial charge. | Percentage recurring product discount. | Reconstructed as `renewal_percent`. |
| `sign_up_fee` | Yes | Yes | Fixed sign-up-fee discount. | No. | No. |
| `sign_up_fee_percent` | Yes | Yes | Percentage sign-up-fee discount. | No. | No. |
| `renewal_fee` | No | Internal | No. | No. | Fixed pseudo renewal product discount. |
| `renewal_percent` | No | Internal | No. | No. | Percentage pseudo renewal product discount. |
| `renewal_cart` | No | Internal | No. | No. | Aggregate pseudo renewal discount. |
| `initial_cart` | No | Internal | Aggregate delayed-initial-payment reconstruction. | No. | No. |

The internal types are registered outside the coupon edit screen so order/cart reconstruction can instantiate them. Their presence in `woocommerce_coupon_discount_types` at runtime does not make them supported persisted coupon choices.

## High-value hooks

| Need | Hook | Contract |
|---|---|---|
| Register a public custom coupon type | `woocommerce_coupon_discount_types` | Add the label and implement the full Woo calculation/eligibility contract. |
| Mark product-style coupon | `woocommerce_product_coupon_types` | Required for per-product restrictions/calculation. |
| Calculate discount | `woocommerce_coupon_get_discount_amount` | Return per-unit or line amount according to Woo's `$single` contract. |
| Add narrow eligibility rule | `woocommerce_coupon_is_valid` / `woocommerce_coupon_is_valid_for_product` | Preserve prior failures and throw/return false only for the targeted rule. |
| Bypass WCS type validation | `woocommerce_subscriptions_validate_coupon_type` | Return false only if custom code replaces the relevant WCS type boundary. |
| Keep a coupon in a recurring calculation | `wcs_bypass_coupon_removal` | Five args: bypass, coupon, type, calculation type, cart. Avoid globally retaining sign-up-only/core coupons. |
| Add a normal fee | `woocommerce_cart_calculate_fees` | Add it deterministically to the master cart. |
| Classify that fee as recurring | `woocommerce_subscriptions_is_recurring_fee` | Three args: bool, fee object, recurring cart. Match a stable marker; do not classify every fee. |
| Read/alter grouping | `woocommerce_subscriptions_recurring_cart_key` | Filter the full WCS grouping key; collisions merge incompatible schedules. |
| Observe grouping | `woocommerce_subscription_cart_before_grouping`, `woocommerce_subscription_cart_after_grouping` | Observation/controlled preparation, not fulfillment events. |
| Filter computed total | `woocommerce_subscriptions_calculated_total` | Last-resort display/calculation integration; validate tax, order persistence, and gateway amount. |

Recurring-fee pattern:

```php
add_action( 'woocommerce_cart_calculate_fees', function ( WC_Cart $cart ): void {
    if ( ! WC_Subscriptions_Cart::cart_contains_subscription() ) {
        return;
    }

    $cart->add_fee( 'My recurring service fee', 5.00, false );
} );

add_filter(
    'woocommerce_subscriptions_is_recurring_fee',
    function ( bool $recurs, $fee, WC_Cart $recurring_cart ): bool {
        return 'My recurring service fee' === $fee->name ? true : $recurs;
    },
    10,
    3
);
```

In production, use a collision-resistant marker rather than a translated display name if the fee object or your integration provides one. Test repeated `calculate_totals()` calls to ensure the fee is not duplicated.

## Limited recurring coupons

`_wcs_number_payments` is read only for `recurring_fee` and `recurring_percent`. `0` means unlimited.

`WCS_Limited_Recurring_Coupon_Manager::check_coupon_usages()` runs on `woocommerce_subscription_payment_complete`. It counts related orders only when:

- the order no longer needs payment;
- the order is not fully refunded;
- the order has a non-zero total discount;
- a coupon order item with the same code has a non-zero discount.

When the count reaches the limit, WCS removes the coupon from the subscription and adds an order note. The current subscription object therefore describes future renewals, not the entire historical discount record.

## Renewal-order coupon reconstruction

`WCS_Cart_Renewal::setup_discounts()` treats the renewal order as the amount authority.

1. Load coupon line items and the stored order discount.
2. Compare their aggregate discount, including discount tax when prices include tax.
3. Use calculation precision and a one-price-decimal-unit tolerance to identify a genuinely manual difference.
4. Convert existing `recurring_fee`/`recurring_percent` coupons to renewal pseudo types.
5. Preserve free-shipping coupon behavior.
6. Create an aggregate pseudo coupon if the original coupon is missing or a manual discount remains.

The session key `wcs_renewal_coupons` and generated pseudo codes are request transport. Do not use them as external idempotency keys or persist them as entitlement records.

## Store API projection

WCS registers two cart extension namespaces:

```text
extensions.subscriptions
extensions.subscriptions_cart_meta
```

`extensions.subscriptions` is an array. Each entry includes a grouping `key`, human-readable `next_payment_date`, billing period/interval/length, customer-facing recurring `coupons`, recurring `totals`, and recurring shipping data.

The totals object uses smallest-unit strings and includes currency metadata. Do not parse `next_payment_date` as an authoritative machine timestamp; it is formatted for display. Schedule authority remains the server-side WCS product/cart/subscription data.

`extensions.subscriptions_cart_meta.hidden_coupon_codes` tells Blocks clients which recurring coupon codes should not appear in the initial summary when all subscription items have a free trial. It is presentation metadata, not permission to remove those coupons from recurring calculations.

Internal `renewal_cart`, `renewal_fee`, and `renewal_percent` coupons are excluded from recurring-cart customer projections.

## WCS 9.1 regression assertions

1. Paying an existing discounted renewal through Checkout block charges the discounted order total.
2. A tax-inclusive recurring-percent renewal with sub-cent intermediate values is not replaced by an aggregate manual pseudo coupon.
3. Classic switch, sync, and resubscribe lines with deferred first payment show the calculated due-today amount.
4. Callbacks on `woocommerce_cart_item_subtotal` at priority `2+` receive and retain WCS's priority-1 markup.
5. Code no longer calls deprecated `get_formatted_product_subtotal()` or `get_due_today_subtotal()`.

## Source anchors

- `includes/core/class-wc-subscriptions-cart.php`
- `includes/core/class-wc-subscriptions-coupon.php`
- `includes/class-wcs-limited-recurring-coupon-manager.php`
- `includes/core/class-wcs-cart-renewal.php`
- `includes/core/class-wc-subscriptions-extend-store-endpoint.php`
- `includes/core/class-wc-subscriptions-checkout.php`
- `includes/switching/class-wc-subscriptions-switcher.php`
