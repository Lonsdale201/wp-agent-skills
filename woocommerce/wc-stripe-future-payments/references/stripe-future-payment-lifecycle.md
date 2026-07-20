# Stripe future-payment lifecycle reference

Load this reference when implementing charge-and-save, deposits, installments, or later off-session collection.

This reference describes merchant-initiated future collection. A third-party BNPL provider usually owns the shopper's repayment plan and pays the merchant according to its own settlement contract; it is not a saved-card/off-session plan owned by the merchant. See <https://docs.stripe.com/payments/buy-now-pay-later>.

## Intent decision matrix

### Save without charging

Create/confirm a SetupIntent with:

```text
customer=cus_...
usage=off_session
payment_method=pm_... or collect through Stripe.js
```

Success means the method is prepared for the declared usage. It does not mean money moved.

### Charge now and save

Create/confirm a PaymentIntent with:

```text
amount=<server amount>
currency=<server currency>
customer=cus_...
payment_method=pm_...
setup_future_usage=off_session
confirm=true or confirm through Stripe.js
```

For an integration offering reusable and non-reusable types together, apply future usage only to a compatible type, such as `payment_method_options[card][setup_future_usage]=off_session`, rather than assuming every automatic method is reusable.

The method becomes reusable only after the relevant provider flow succeeds. Persist local token/state from verified provider results, not from the mere creation of an intent.

### Charge later off-session

Create a new PaymentIntent for each due payment:

```text
amount=<due amount>
currency=<plan currency>
customer=cus_...
payment_method=pm_...
off_session=true
confirm=true
```

Never reuse the first successful PaymentIntent as the next installment. It represents one payment lifecycle and one amount/state history.

## Installed Woo Stripe Gateway 10.8.4 contract

The installed gateway's behavior is source-verified as follows:

- `WC_Stripe_Intent_Controller::create_and_confirm_setup_intent()` creates a SetupIntent with a Customer, PaymentMethod, confirmation, return URL when needed, and mandate options. It has no amount and creates no charge.
- Its PaymentIntent request sets `setup_future_usage=off_session` when the shopper saves a reusable method or an automatic-renewal subscription needs it, with confirmation-token/manual-renewal exceptions.
- `WC_Stripe_UPE_Payment_Gateway::should_save_payment_method_from_request()` rejects unknown/non-reusable types and already-saved methods; automatic subscriptions save when supported; ordinary checkout requires saved cards plus checkbox or force-save.
- Classic save-checkbox values are `true`; Checkout Block values are `1`.
- `WC_Stripe_Helper::should_force_save_payment_method()` returns false when logged out and applies `wc_stripe_force_save_payment_method` for logged-in users.
- The force-save filter is evaluated both before an order exists for checkout JavaScript and later with an order ID. Keep the result consistent across those phases.
- Selecting account creation during checkout does not make the shopper logged in when the payment UI is first configured. Do not present the filter alone as a first-purchase guest solution.
- The deprecated `wc_stripe_force_save_source` filter is still bridged, but new integrations must use `wc_stripe_force_save_payment_method`.
- `handle_saving_payment_method()` classifies the provider object, rejects non-reusable types, reconciles duplicates, creates/updates the appropriate Woo token, and updates relevant order/subscription data.

Treat these as version-pinned integration contracts. Test again when the Stripe Gateway version changes.

## Official-gateway extension pattern

Use this pattern only when the official `stripe` gateway should own the initial checkout payment:

1. Store the selected plan in validated cart/session state and copy an immutable snapshot to the order.
2. Make the Woo order/payment record's payable amount match the immediate Stripe charge through a deliberate accounting design.
3. Require account/login if the plan needs a local saved token and recovery UI.
4. Enable saved cards and ensure the chosen provider method is reusable.
5. Force save only for the selected/accepted plan, with the same predicate before and after order creation.
6. After verified initial payment success, create the schedule and immutable installment records.
7. Resolve the saved Customer/PaymentMethod from server-owned state for every later charge.

Do not register a second card gateway solely to get a separate radio button. If a distinct payment method is a business requirement, it must own a complete provider integration rather than parasitize the official gateway's private markup or JavaScript state.

## Schedule and idempotency model

Recommended owned records:

```text
plan_id
customer/user/order relationship
currency and immutable amount rule
consent snapshot/version/time
installment_id and sequence
due_at
amount
status
provider_payment_intent_id
attempt counter and last safe error category
paid_at / cancelled_at
```

Enforce a unique key on the logical installment identity. Use a provider idempotency key such as:

```text
myplugin:installment:<immutable-installment-id>:charge
```

Do not append a random timestamp to retries of the same logical charge. Use a new operation/key only when product policy deliberately creates a new charge attempt after the previous provider operation is known terminal.

Action Scheduler delivery sequence:

1. Atomically claim a due installment or observe that it is already owned/complete.
2. If a provider intent ID exists, retrieve/reconcile it before creating anything.
3. Create/confirm with the stable idempotency key.
4. Store the provider ID and observed state.
5. Let signed webhooks/reconciliation transition final state idempotently.
6. Schedule a bounded retry or customer-action workflow according to categorized failure.

## Authentication recovery

A future PaymentIntent can require customer action even after correct off-session setup. Record a recoverable state and send the customer to a signed, expiring, order/plan-bound page. On-session recovery must:

- authenticate/authorize the shopper;
- retrieve the exact server-owned PaymentIntent or create a deliberate replacement;
- use Stripe.js with a scoped client secret;
- verify final state on the server;
- update the reusable method only with explicit consent if replacement is offered;
- avoid leaking the client secret through logs, analytics, referrers, or cache.

Differentiate insufficient funds, expired/detached method, authentication required, transient API failure, and permanent plan cancellation. They do not share a retry policy.

## Webhook settlement

Verify the Stripe signature against the exact raw body. Resolve the local payment/installment through a stored provider ID and compare Customer, amount, currency, and allowed transition. Atomically deduplicate event IDs, while keeping the state transition itself idempotent because distinct Stripe events can describe the same final state.

Do not mark an installment paid from:

- a successful browser redirect alone;
- a client-provided PaymentIntent status;
- a SetupIntent success;
- a queued Action Scheduler job finishing without verified provider state.

## Test scenarios

Use Stripe test methods to cover:

- initial payment succeeds and later reuse succeeds;
- initial authentication is required;
- later off-session authentication is required despite setup;
- setup/initial charge decline;
- later insufficient funds and expired/detached method;
- delayed/asynchronous payment types if allowed;
- browser response loss after provider success;
- duplicate checkout, duplicate job, duplicate webhook, and out-of-order webhook;
- changed plan amount, cancellation race, refund, chargeback, and payment-method replacement;
- logged-out shopper, new account, existing saved method, native Link, and card-through-Link.

## Primary documentation

- SetupIntent lifecycle and off-session consent: <https://docs.stripe.com/payments/setup-intents>
- Save during a PaymentIntent and charge later: <https://docs.stripe.com/payments/save-during-payment?payment-ui=elements>
- PaymentIntent API: <https://docs.stripe.com/api/payment_intents>
- SetupIntent API: <https://docs.stripe.com/api/setup_intents>
