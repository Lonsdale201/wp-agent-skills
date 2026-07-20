---
name: wc-stripe-future-payments
description: Design or audit WooCommerce Stripe payment flows that save a reusable method and charge it later. Covers SetupIntent versus PaymentIntent, charge-now-and-save, deposits and installment series, `setup_future_usage=off_session`, Stripe Customer ownership, explicit consent/mandates, later off-session PaymentIntents, SCA recovery, idempotent scheduling, Woo token projection, guest/account policy, official Woo Stripe Gateway reuse versus a custom Stripe-backed gateway, Blocks/classic checkout, Link polymorphism, webhooks, accounting, and tests. Use for installments, deposits, subscriptions outside WCS, merchant-initiated charges, future payments, saved cards, or claims that a SetupIntent also takes the first payment.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-gateway-stripe"
  wp-skills-plugin-version-tested: "10.8.4"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce Stripe future payments

Saving a payment method, charging now, and charging later are three distinct operations. Assign each operation one owner and an explicit state machine.

## Choose the correct Stripe object

| Required outcome | Stripe flow |
|---|---|
| Save now, charge nothing | Confirm a `SetupIntent` with `usage=off_session` |
| Charge now and prepare the same method for later | Confirm a `PaymentIntent` associated with the Customer and set `setup_future_usage=off_session` |
| Charge an already saved method without the shopper present | Create a new `PaymentIntent` with the Customer, PaymentMethod, `off_session=true`, and `confirm=true` |
| First amount is zero, later amounts are scheduled | SetupIntent first; create a separate PaymentIntent for every due charge |

A SetupIntent never creates a charge. Do not describe “SetupIntent saves the card and deducts the first installment” as one operation. Use a PaymentIntent for charge-now-and-save, or use a SetupIntent followed by a separate PaymentIntent when the product flow genuinely needs two operations.

`setup_future_usage` improves authentication/optimization for later use; it does not make every payment-method type reusable and does not guarantee that every future off-session attempt succeeds without authentication.

## Do not conflate merchant installments with BNPL

In a merchant-managed installment plan, the merchant saves an eligible method and initiates later charges. Third-party BNPL methods such as Affirm, Afterpay/Clearpay, or Klarna commonly use provider approval/redirect flows: the merchant receives the purchase amount under the BNPL settlement contract, while the shopper repays the BNPL provider. That is not the same as saving a merchant-owned card for later PaymentIntents. A subscription gateway may use cards, debits, wallets, hosted checkout, or mandates; there is no universal “every serious gateway does this” implementation.

## Decide who owns Stripe checkout

### Extend the official `stripe` gateway when it owns the payment

If checkout already uses WooCommerce Stripe Gateway, keep the selected Woo gateway as `stripe` and model the plan/deposit choice as separate cart/order data. Let the official gateway own Payment Element, PaymentIntent/SetupIntent creation, SCA, token creation, and its webhooks.

This is usually safer than displaying a second Stripe card form under a fictional installment gateway. The installed plugin already supports charge-and-save for reusable methods and both classic and Checkout Block flows.

Important boundaries:

- The official gateway charges the authoritative Woo order total. Do not patch a private request array to charge a smaller hidden amount.
- Direct Stripe gateway classes and service methods are plugin internals. Prefer documented filters/actions; version-guard and integration-test any unavoidable direct use.
- A plan-specific payment method must still be reusable and enabled. Link, card-through-Link, cards, bank redirects, and debits do not all have the same token or reuse behavior.

### Build a separate Stripe-backed gateway only when it owns the whole payment contract

A separate gateway must implement Stripe Elements/Payment Element, Customer and intent creation, confirmation/redirect handling, token projection, signed webhooks, idempotency, refunds, recovery, classic checkout, and Checkout Block integration. Do not reuse raw DOM or JavaScript internals from the official gateway.

Use `wc-checkout-block-payment-method` for the Blocks adapter. Link support is an additional payment-method/token concern, not a substitute for that adapter.

## Force saving through Woo Stripe carefully

Woo Stripe 10.8.4 exposes:

```php
add_filter(
    'wc_stripe_force_save_payment_method',
    static function ( bool $force, $order_id ): bool {
        if ( ! is_user_logged_in() ) {
            return $force;
        }

        return myplugin_future_payment_is_selected( $order_id ) ? true : $force;
    },
    10,
    2
);
```

Use it only after the shopper has explicitly accepted the future-payment terms. Scope the predicate to the exact plan/order and preserve another integration's `true` value.

The plugin also calls this filter without an order ID while preparing checkout JavaScript. For Blocks and confirmation-token flows, the pre-order cart/session decision and final order decision must agree. A callback that returns true only after an order exists can prepare the client flow incorrectly.

The helper refuses force-save for logged-out users. Saving also remains disabled when saved cards are off or the selected Stripe method is not reusable. Require login/account creation for long-lived plans, or design and test a deliberate durable guest-to-Customer ownership/recovery model.

A shopper selecting “create account” during final checkout is still logged out when the Block payment UI is initially configured. Therefore the force-save filter alone does not solve a first-purchase guest flow. If first-time shoppers must qualify, authenticate/create the durable account before mounting the payment step, use a recurring system whose gateway integration explicitly owns that lifecycle, or implement the complete custom Customer/intent/token flow. Test this path with a shopper who has no prior Woo token or Stripe Customer.

Do not use `wc_stripe_display_save_payment_method_checkbox` merely as a cosmetic hide. In the classic Stripe path, hiding an otherwise available checkbox is also interpreted as a forced-save situation. Consent must not be inferred from a missing control.

## Consent and mandate are part of the payment contract

Before saving for off-session use, obtain explicit agreement covering at least:

- permission to initiate the future payment or series;
- expected timing/frequency;
- the amount or an objective method for determining it;
- cancellation/refund terms where applicable.

Store a durable consent snapshot: plan/version, displayed terms version, time, customer/order, schedule, currency, and amount rule. Never set `setup_future_usage=off_session` silently because it improves conversion.

The Customer/PaymentMethod relationship is also mandatory. On every later attempt, resolve the server-owned plan, Customer, and PaymentMethod; verify that the method belongs to the expected Customer and is still allowed. Never accept a browser-supplied `pm_...` identifier as ownership proof.

## Model the Woo accounting before charging

The immediate Stripe amount, Woo order total, taxes, refunds, fulfillment state, and remaining liability must tell the same story.

Choose an explicit model, for example:

1. A full-value parent/order plus auditable child payment/renewal orders for each installment.
2. An initial order whose total is the immediate amount plus an owned plan entity that creates later installment orders.
3. WooCommerce Subscriptions when its recurring-product and lifecycle semantics actually match the product.

Do not charge only a deposit against a full-value order and call `payment_complete()` as if the full balance was captured. Do not create later Stripe charges with no Woo-side auditable payment/order/refund record. Define cancellation, partial/full refund allocation, failed installment, chargeback, tax document, fulfillment, and over/underpayment behavior before implementation.

## Create every later charge as a new operation

For a due installment, create a new server-side PaymentIntent with:

```text
amount=<authoritative due amount in Stripe minor units>
currency=<plan currency>
customer=<owned Stripe Customer>
payment_method=<owned reusable PaymentMethod>
off_session=true
confirm=true
```

Use an idempotency key derived from an immutable installment/payment-record ID and attempt policy, not from the current timestamp. Persist the PaymentIntent ID before considering the attempt dispatched. Reconcile timeouts by retrieving provider state before retrying.

Scheduling is delivery, not exactly-once execution. Action Scheduler jobs may be delayed, repeated, or fail after Stripe succeeded. Make the remote charge idempotent and make local settlement safe under duplicate and out-of-order webhooks.

## Handle SCA and failure as normal states

Upfront off-session setup reduces later authentication friction but cannot remove it. Model at least:

```text
scheduled -> attempting -> processing/succeeded
                       -> requires_customer_action
                       -> declined/retryable
                       -> terminal_failed/cancelled
```

When Stripe requires authentication, do not retry the same off-session request indefinitely. Notify the customer through a signed, expiring return flow, bring them on-session, confirm/replace the method, and resume only after verified success. Webhooks or active reconciliation, not the browser return alone, own final settlement.

## Woo token boundary

A `WC_Payment_Token` is a local, user-owned projection of a provider method. Create/update it only after Stripe confirms a reusable method and the expected Customer relationship. Validate local token ownership before resolving its provider ID.

Do not assume every reusable Stripe method is `WC_Payment_Token_CC`:

- native Link is `type=link` and uses a Link token class;
- a card funded through the Link wallet can remain `type=card` with `wallet.type=link`;
- some redirect methods save a different reusable debit method;
- some enabled methods cannot be reused at all.

Use provider object type/capabilities, not an ID prefix or checkout label, to classify the method.

## Review checklist

1. Verify SetupIntent versus PaymentIntent choice and that exactly one operation owns the initial charge.
2. Verify Customer association, reusable method capability, explicit off-session consent, and durable shopper identity.
3. Compare Stripe amount/currency with the authoritative Woo payment record on initial and later attempts.
4. Verify provider idempotency, unique local installment records, signed webhooks, event deduplication, and timeout reconciliation.
5. Test first-time shopper with no Customer/token, saved method, guest rejection/account creation, classic checkout, Checkout Block, Link/card, SCA now, SCA later, decline, async processing, duplicate job, duplicate webhook, refund, cancellation, and method replacement.
6. Redact secrets, client secrets, payment identifiers where unnecessary, raw provider bodies, and billing data from logs.

## Cross-references

- `wc-stripe-add-payment-method` for the no-charge My Account SetupIntent flow.
- `wc-checkout-block-payment-method` for a custom gateway's Blocks adapter.
- `wc-payment-tokens` for local saved-method ownership.
- `wc-stripe-link-payments` for Link-specific representations and consent.
- `wc-stripe-webhooks` for verified asynchronous settlement.
- `wc-action-scheduler-jobs` for delivery, retries, and remote idempotency.
- `wc-stripe-subscriptions` and `wcs-renewal-scheduler` when WooCommerce Subscriptions owns the recurring contract.
- See [references/stripe-future-payment-lifecycle.md](references/stripe-future-payment-lifecycle.md) for intent parameters, installed gateway contracts, and state/recovery details.

## References

- Stripe SetupIntents: <https://docs.stripe.com/payments/setup-intents>
- Stripe save-during-payment: <https://docs.stripe.com/payments/save-during-payment?payment-ui=elements>
- Stripe BNPL model: <https://docs.stripe.com/payments/buy-now-pay-later>
- Verified source paths:
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-intent-controller.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-helper.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-blocks-support.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-gateway.php`
