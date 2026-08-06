---
name: fluentcart-subscriptions-renewals
description: >-
  Implements and audits FluentCart recurring plans, Subscription models,
  automatic, manual, and system collection methods, gateway-managed versus
  store-managed billing, renewal invoices, off-session retries, pause/resume/
  cancel/reactivate operations, and subscription lifecycle hooks. Use when
  extending subscription_activated, subscription_renewed, renewal_paid,
  SystemChargeService, RenewalService, next billing dates, saved payment
  methods, installments, dunning, or access tied to recurring validity.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart subscriptions and renewals

Model both who creates renewal invoices and who charges them. Do not treat every
recurring plan as a remote provider subscription.

Read [subscription-lifecycle.md](references/subscription-lifecycle.md) before
adding access, billing, gateway, reminder, or dunning behavior.

## Distinguish billing modes

The store setting chooses gateway_managed or store_managed for new
subscriptions and stamps management_mode into the subscription config.
Changing the store setting later must not silently change existing contracts.

| collection_method | Owner of renewal |
|---|---|
| automatic | Gateway owns recurring schedule/charge |
| manual | FluentCart creates invoices; customer pays |
| system | FluentCart creates invoices and charges a saved method off-session |

Use SubscriptionManagementMode helpers. Never infer mode only from the current
global setting or from vendor_subscription_id.

## Use lifecycle methods

Use Subscription methods/services for pause, resume, cancel, reactivate,
payment-method changes, remote re-sync, date updates, and renewal recording.
Directly changing status or next_billing_date can leave a provider subscription,
scheduled invoice, system-charge action, retry state, and lifecycle hooks out of
sync.

Keep recurring_total and setup/renewal amounts in integer minor units. Treat
next_billing_date, expire_at, canceled_at, bill_count, and bill_times as one
contract. Use FluentCart's GMT-aware DateTime utilities.

## Select canonical hooks

- fluent_cart/subscription_activated: initial activation.
- fluent_cart/subscription_renewed: canonical settled renewal across billing
  models.
- fluent_cart/subscription_canceled, paused, resumed, reactivated, updated.
- fluent_cart/subscription_eot: reached contract term.
- fluent_cart/subscription_expired_validity: access validity expired.
- fluent_cart/subscription_period_skipped: store-managed period skip.

Use fluent_cart/renewal_paid only for a store-managed renewal invoice that
transitions from unpaid to paid. It does not represent gateway-managed renewals.
Do not use initial fluent_cart/order_paid_done as a renewal hook.

## Integrate access and provisioning

1. Key the operation by subscription plus lifecycle occurrence/renewal order.
2. Grant only after verified activation/renewal.
3. Revoke or suspend according to the product's explicit access policy, not
   merely any intermediate payment failure.
4. Handle grace/past_due, cancellation-at-period-end, EOT, expiry, refund, and
   reactivation distinctly.
5. Make callbacks replay-safe and reconcile current Subscription state before
   acting.

## Support system collection safely

A gateway advertising system_subscription must store a reusable provider token,
support the zero-charge setup case it admits, charge renewal PaymentInstance
off-session, and reconcile processing charges.

SystemChargeService:

- schedules the due-date charge in Action Scheduler group fluent-cart;
- reads the current token at execution time;
- uses bounded retry offsets within the interval grace period;
- can return to manual dunning after exhaustion;
- rechecks processing charges daily, at most seven checks by default;
- cancels queued work when the invoice is otherwise paid.

Use fluent_cart/subscriptions/system_billing_enabled as a staging-clone kill
switch. Do not copy live tokens or scheduled charge actions into staging.

## Free/Pro boundary

Free 1.6.0 contains recurring products, Subscription, gateway-managed billing,
store-managed manual/system renewal services, retries, and lifecycle events.
Pro adds installments and selected advanced/gateway features. Feature-detect
the exact capability; do not label the complete subscription engine Pro-only.

## Test matrix

Test automatic/manual/system; paid, free trial, zero setup, first charge
failure, duplicate webhook, due invoice, retry, processing reconciliation,
payment-method replacement, pause/resume, skip, cancellation, expiry, EOT,
reactivation, refund, gateway capability loss, and a staging clone.

## Cross-references

- Use fluentcart-payment-gateways for recurring provider capabilities.
- Use fluentcart-orders-transactions for renewal-order settlement.
- Use fluentcart-downloads-storage for subscription-gated files.

## References

- Official subscription documentation: <https://dev.fluentcart.com/subscriptions/>
- Verified Free source paths:
  - fluent-cart/app/Models/Subscription.php
  - fluent-cart/app/Modules/Subscriptions/Services/SubscriptionManagementMode.php
  - fluent-cart/app/Modules/Subscriptions/Services/SubscriptionService.php
  - fluent-cart/app/Modules/Subscriptions/Services/SystemChargeService.php
  - fluent-cart/app/Modules/StoreManagedRenewal/Services/RenewalService.php
  - fluent-cart/app/Modules/StoreManagedRenewal/Services/RenewalScheduler.php
  - fluent-cart/app/Events/Subscription/
  - fluent-cart/app/Helpers/StatusHelper.php
- Verified Pro source areas:
  - fluent-cart-pro/app/Modules/PaymentMethods/
  - fluent-cart-pro/app/Hooks/Handlers/EarlyInstallmentPaymentHandler.php
  - fluent-cart-pro/app/Hooks/Handlers/SubscriptionRenewalHandler.php
