---
name: fluentcart-orders-transactions
description: >-
  Implements and audits FluentCart order, order-item, transaction, status,
  payment-settlement, refund, renewal-order, and lifecycle-hook behavior. Use
  when reading or mutating fct_orders or fct_order_transactions, selecting
  order_created, order_paid, order_paid_done, order_payment_failed,
  order_refunded, or dynamic status hooks, marking an order paid, reconciling a
  webhook, refunding money, or preventing duplicate fulfillment and incorrect
  status transitions.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart orders and transactions

Drive order state from verified transactions and FluentCart lifecycle services.
Do not equate order creation, successful payment, fulfillment, and subscription
renewal.

Read [order-event-map.md](references/order-event-map.md) before attaching an
irreversible side effect or updating any status.

## Keep state dimensions separate

An order independently carries:

- status: commercial/fulfillment progression;
- payment_status: money progression;
- shipping_status: physical delivery progression;
- type: payment, subscription, renewal, and related variants;
- mode: test or live.

Use Status, StatusHelper, OrderResource, Orders, PaymentInstance, and Refund as
appropriate. A direct update to payment_status does not create/reconcile a
transaction, recount totals, complete the cart, reserve/release stock, activate
a subscription, or dispatch the normal events.

## Choose the event by guarantee

| Requirement | Use |
|---|---|
| Durable order aggregate created/updated for checkout | fluent_cart/order_created |
| Initial order transitioned to paid | fluent_cart/order_paid |
| Deferred normal post-payment processing point | fluent_cart/order_paid_done |
| Payment attempt became failed | fluent_cart/order_payment_failed |
| Refund recorded and totals/status synchronized | fluent_cart/order_refunded |
| Any subscription renewal settled | fluent_cart/subscription_renewed |
| Store-managed renewal invoice transitioned to paid | fluent_cart/renewal_paid |
| One status dimension changed | fluent_cart/{dimension}_status_changed |

order_created does not mean paid. order_paid is synchronous and its internal
listener recounts order/customer state and may create a WP user.
order_paid_done is emitted later by Action Scheduler after a valid paid order is
reloaded. Use it for third-party fulfillment/integration work that belongs after
the standard deferred path.

Never hook business logic to
fluent_cart/order_paid_async_private_handle. Core labels it private. The legacy
misspelled ansyc variant exists only to drain old queued jobs.

## Make event callbacks replay-safe

~~~php
add_action('fluent_cart/order_paid_done', static function (array $data): void {
    $order = $data['order'] ?? null;
    if (!$order || $order->mode !== 'live') {
        return;
    }

    // Atomically claim an addon-owned idempotency record keyed by order ID
    // and operation before sending or granting anything.
});
~~~

StatusHelper atomically claims the pending-to-paid transition to reduce webhook
and browser-confirmation races. That does not make downstream callbacks
exactly-once. Store an addon-owned operation key and make retries converge.

## Handle transactions and refunds

- Use transaction IDs/UUIDs in the correct namespace; do not use an invoice
  number as a provider idempotency key.
- Verify provider object, signature, currency, amount, mode, order/customer
  reference, and prior processed state.
- Reconcile through StatusHelper instead of announcing paid from a browser
  redirect.
- Use Refund::processRefund() for a local/admin initiated refund and the
  gateway's processRefund implementation for the provider operation.
- Use Refund::createOrRecordRefund() for webhook reconciliation; it deduplicates
  by provider refund ID and can match a pending local refund.
- Keep all amounts integer minor units and enforce both order and transaction
  refundable ceilings.
- Test partial, full, repeated, and out-of-order refund notifications.

## Query and authorize

- Scope customer-facing queries by the resolved customer, not UUID alone.
- Treat Order.uuid as an opaque lookup value but not a guaranteed database
  unique key; legacy rows and the current schema use a non-unique index.
- Eager-load only the relationships needed by the job.
- Bound report/admin queries and preserve mode/currency distinctions.
- Redact provider payloads, customer PII, and payment tokens from logs.

## Cross-references

- Use fluentcart-payment-gateways for provider confirmation and webhooks.
- Use fluentcart-subscriptions-renewals for renewal semantics.
- Use fluentcart-integrations-jobs for outbound feeds and queues.

## References

- Official order hooks: <https://dev.fluentcart.com/hooks/actions/orders/>
- Verified Free source paths:
  - fluent-cart/app/Models/Order.php
  - fluent-cart/app/Models/OrderItem.php
  - fluent-cart/app/Models/OrderTransaction.php
  - fluent-cart/api/Resource/OrderResource.php
  - fluent-cart/app/Helpers/Status.php
  - fluent-cart/app/Helpers/StatusHelper.php
  - fluent-cart/app/Events/Order/
  - fluent-cart/app/Services/Payments/Refund.php
  - fluent-cart/app/Hooks/actions.php
