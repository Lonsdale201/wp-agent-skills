---
name: wc-stripe-subscriptions
description: Integrate WooCommerce Stripe Gateway 10.8+ with WooCommerce Subscriptions 9.0. Covers gateway feature support, automatic renewal charges, Stripe customer/payment-method metadata, failed-renewal recovery, SCA, change-payment SetupIntents, update-all behavior, Express Checkout on the change-payment page, detached tokens, and safe test cases. Use when Stripe is a subscription gateway or code touches scheduled_subscription_payment_stripe, _stripe_source_id on WC_Subscription, change_payment_method, renewal authentication, or Stripe token migration.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-gateway-stripe + woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "woocommerce-gateway-stripe 10.8.3; woocommerce-subscriptions 9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# Stripe and WooCommerce Subscriptions

Use this for the boundary between Stripe's token/intent model and WCS's subscription, renewal-order, and payment-method-change model. A Woo token alone is not enough: renewals also depend on the subscription gateway and Stripe metadata.

## Runtime contract

Stripe initializes Subscriptions support only when `WC_Subscriptions` and `WC_Subscription` are loaded. The main `stripe` gateway advertises:

- `subscriptions`, cancellation, suspension, reactivation
- amount/date changes
- customer/admin payment-method changes
- multiple subscriptions

It does **not** advertise `gateway_scheduled_payments`. Therefore WCS schedules renewals, creates renewal orders, and dispatches the Stripe gateway hook. Do not create a second Stripe renewal cron.

Reusable Stripe sub-gateways may have different IDs and capabilities. Ask the actual gateway object:

```php
$gateway = wc_get_payment_gateway_by_order( $subscription );

if ( $gateway && $subscription->payment_method_supports( 'subscriptions' ) ) {
    // The stored gateway is available for automatic WCS renewals.
}
```

Do not infer support from a `stripe_` prefix alone.

## Automatic renewal flow

1. WCS runs `woocommerce_scheduled_subscription_payment` for the subscription.
2. WCS creates a renewal order and copies the recurring payment context.
3. WCS dispatches `woocommerce_scheduled_subscription_payment_{gateway_id}` with amount and renewal order.
4. Stripe registers `scheduled_subscription_payment()` for each supported Stripe gateway and charges off-session.
5. Success completes the renewal order; WCS records renewal success and reactivates/advances the subscription.
6. Failure follows WCS failure/retry handling; SCA can require customer authentication.

Observe Stripe renewals without replacing the gateway callback:

```php
add_action(
    'woocommerce_subscription_renewal_payment_complete',
    function ( WC_Subscription $subscription, WC_Order $renewal_order ): void {
        if ( 0 !== strpos( $renewal_order->get_payment_method(), 'stripe' ) ) {
            return;
        }

        myplugin_sync_paid_renewal( $subscription, $renewal_order );
    },
    10,
    2
);
```

Do not provision on `woocommerce_scheduled_subscription_payment_stripe`; the charge has not necessarily succeeded there.

## Stripe metadata on subscriptions

Stripe stores provider context on the `WC_Subscription` object, principally:

- `_stripe_customer_id`: Stripe `cus_...` owning the reusable method.
- `_stripe_source_id`: current reusable `pm_...`, legacy `src_...`, or `card_...` identifier.

Treat these as implementation storage, not the write API. Read/write via `WC_Subscription` CRUD and the installed gateway/order-helper methods. Do not use `update_post_meta()` because subscriptions can use HPOS and because a payment-method change must also fire WCS/gateway side effects.

Renewal-order cleanup deliberately removes old Stripe fee/net and PaymentIntent data while retaining the customer/payment method needed for the new charge. Never copy `_stripe_intent_id`, charge IDs, or payment locks from one renewal order to another.

## Change payment method

The customer flow is the WCS change-payment page identified by `change_payment_method=<subscription_id>`. WCS owns authorization, capability checks, form handling, update-all behavior, and gateway-change hooks. Stripe owns Payment Element/SetupIntent confirmation and Stripe metadata.

For a new UPE method:

1. WCS verifies that the customer may edit the subscription payment method.
2. Stripe creates/confirms a SetupIntent for the customer's Stripe customer.
3. Stripe validates the selected type and disallows unsupported/prepaid cases where configured.
4. Stripe creates/updates the Woo token.
5. `WC_Subscriptions_Change_Payment_Gateway::update_payment_method()` changes the WCS gateway and fires its hooks.
6. Stripe writes customer/payment method IDs through its subscription helpers.
7. Redirect/SCA completion performs the update only after confirmation succeeds.

Never implement this as:

```php
// WRONG: no WCS hooks, no SCA, no remote validation.
$subscription->update_meta_data( '_stripe_source_id', $payment_method_id );
$subscription->save();
```

For trusted server code, use the WCS change-payment service as the orchestration model and version-guard calls into Stripe internals. For customer requests, keep WCS's built-in page unless you reproduce nonce, ownership, token/customer matching, SetupIntent, and update-all semantics.

## Express Checkout change-payment support

Stripe 10.8 adds Apple Pay, Google Pay, and Link on the WCS Change payment method page.

- Setting location key: `change_payment_method` inside `express_checkout_button_locations`.
- Availability filter: `wc_stripe_show_express_checkout_on_change_payment_method`.
- Detection still requires a valid WCS subscription, connected account, SSL outside test mode, available `stripe` gateway, and enabled Express Checkout method/location.
- Optimized Checkout remains disabled on this page; Express Checkout is rendered separately before the WCS pay form.
- Stripe links the generated Woo token to the subscription and preserves the wallet title, including after a 3DS redirect.

Do not force the filter to `true` as a substitute for enabling/connecting Stripe; the filter only changes the final location decision.

The Express Checkout flow unsets automatic “update all subscriptions” consent because confirmation occurs before that checkbox is shown. A custom clone must not interpret a hidden/default checkbox as consent.

## Add method and update all

On My Account Add payment method, Stripe can show “Update the payment method for all of my current subscriptions”. After `woocommerce_stripe_add_payment_method`, it iterates eligible subscriptions and calls `WC_Subscriptions_Change_Payment_Gateway::update_payment_method()` with Stripe payment meta.

Relevant filters include:

- `wc_stripe_display_update_subs_payment_method_card_checkbox`
- `wc_stripe_update_subs_payment_method_card_statuses`
- `wc_stripe_save_to_subs_text`
- `wc_stripe_save_to_subs_checked`

Keep the default unchecked unless the product explicitly requires a well-explained bulk update.

## Failed renewals and SCA

For a customer-paid failed renewal, WCS fires:

```text
woocommerce_subscription_failing_payment_method_updated_{gateway_id}
```

Stripe listens to the exact stored gateway ID, for example `woocommerce_subscription_failing_payment_method_updated_stripe`, and copies the successful renewal order's Stripe customer/payment method back to the subscription.

Since WCS 8.8, same-gateway failed-renewal retries do not fire ordinary `woocommerce_subscription_payment_method_updated*` hooks. Put retry-recovery behavior on the failing-payment hook; keep actual gateway migration behavior on ordinary payment-method-updated hooks.

Stripe handles off-session SCA by leaving the renewal unpaid, sending Stripe-specific authentication email(s), and letting the customer authenticate/pay. Do not mark the subscription active or call `payment_complete()` merely because an intent exists or is `requires_action`.

Stripe 10.7+ also detects Radar-blocked renewals, puts the subscription on hold, and cancels the pending WCS retry so repeated retries do not reproduce the same block.

## Token deletion and detached subscriptions

Deleting a Woo Stripe token triggers Stripe's `woocommerce_payment_token_deleted` listener and remote detach. It does not safely migrate every subscription that used the token. Before a customer-facing delete, detect affected active subscriptions and either block deletion with a replacement workflow or clearly accept detached-subscription remediation.

Stripe includes a detached-subscription admin detector/bulk action. Treat it as recovery tooling, not normal payment-method migration.

## Legacy SEPA

Legacy SEPA subscriptions can use gateway `stripe_sepa` and source IDs. Current PaymentMethods-based SEPA uses `stripe_sepa_debit`. Stripe includes migration/repair code for legacy SEPA tokens. Do not bulk-rewrite gateway IDs or `src_` values without running the installed migration logic and verifying the remote `pm_` mapping.

## Test matrix

Test at minimum:

1. Initial paid subscription and zero-upfront free trial.
2. Successful automatic renewal with the stored Stripe method.
3. Decline, WCS retry, Radar block, and SCA-required renewal.
4. Change payment with an existing token and with a new UPE method.
5. 3DS redirect completion and cancellation.
6. Express Checkout change-payment enabled/disabled and update-all consent.
7. Delete/default token with one and multiple active subscriptions.
8. HPOS enabled; verify subscription and renewal metadata through CRUD.

## Cross-references

- Use `wc-stripe-add-payment-method` for My Account form and token creation contracts.
- Use `wcs-renewal-scheduler` for WCS schedule/order creation and retry timing.
- Use `wcs-subscription-hooks` for generic gateway-change hook signatures.
- Use `wc-stripe-webhooks` for asynchronous Stripe settlement and webhook order locking.

## References

- Verified source paths:
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/compat/trait-wc-stripe-subscriptions.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/compat/trait-wc-stripe-subscriptions-utilities.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/compat/class-wc-stripe-subscriptions-helper.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-gateway.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-express-checkout-element.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-express-checkout-helper.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gateways/class-wc-subscriptions-payment-gateways.php`
