# FluentCart 1.6.0 order event map

EventDispatcher runs internal listeners before firing the public hook. Event
payloads are generally one associative array, not separate positional objects.
Confirm accepted arguments against the event's toArray() method.

## Main order events

| Hook | Core payload |
|---|---|
| fluent_cart/order_created | order, prev_order, customer, transaction |
| fluent_cart/order_paid | order, customer, transaction |
| fluent_cart/order_paid_done | order, transaction, customer; subscription when resolved |
| fluent_cart/order_payment_failed | inspect event source before use |
| fluent_cart/order_refunded | order plus refund data from OrderRefund |
| fluent_cart/order_fully_refunded | same refund event family |
| fluent_cart/order_partially_refunded | same refund event family |
| fluent_cart/order_updated | order/change context from event |

## Status events

OrderStatusUpdated does not fire its generic order_status_updated hook
automatically. It emits according to its type:

- fluent_cart/payment_status_changed_to_{new_status}
- fluent_cart/payment_status_changed
- fluent_cart/shipping_status_changed_to_{new_status}
- fluent_cart/shipping_status_changed
- fluent_cart/order_status_changed_to_{new_status}
- fluent_cart/order_status_changed

Payload: order, old_status, new_status, manageStock, activity.

## Paid sequence

~~~text
successful transaction(s)
  -> StatusHelper::syncOrderStatuses()
  -> atomic pending-to-paid claim
  -> OrderPaid (initial order, not renewal)
  -> receipt number
  -> internal recount/user listener
  -> fluent_cart/order_paid
  -> private Action Scheduler action
  -> reload paid order and delete queue marker
  -> fluent_cart/order_paid_done
~~~

Renewal invoices intentionally do not repeat this initial-order sequence.
Gateway-managed renewal and store-managed renewal paths converge on
SubscriptionRenewed, while fluent_cart/renewal_paid is limited to a
store-managed invoice's unpaid-to-paid transition.

## Refund sequence

Refund::processRefund():

1. validates positive amount and order/transaction refundable ceilings;
2. creates a refund transaction linked to the parent in meta;
3. updates parent refunded_total;
4. invokes the registered gateway unless marked manual;
5. stores the provider refund ID when returned;
6. dispatches OrderRefund, which synchronizes totals/status and emits full or
   partial hooks.

Do not grant stock restoration or access revocation twice when a provider
webhook later confirms the same refund.
