# FluentCart 1.6.0 subscription lifecycle

## Initial order

~~~text
subscription-priced variation
  -> checkout validates gateway/mode
  -> subscription row pending
  -> PaymentInstance
  -> intended before gateway submission
  -> verified transaction
  -> initial OrderPaid
  -> SubscriptionActivated
~~~

Confirm precise timing for the selected gateway. Never grant recurring access
from the cart or unverified browser confirmation.

## Gateway-managed renewal

The provider creates/settles the remote renewal. Its webhook calls
SubscriptionService::recordRenewalPayment(), creates the local child order and
transaction, updates bill count/dates/status, and dispatches
SubscriptionRenewed. The local child may be born paid, so renewal_paid is not
part of this path.

## Store-managed renewal

RenewalScheduler runs from fluent_cart/scheduler/hourly_tasks:

1. creates due renewal invoices in bounded batches;
2. marks manual invoices pending and system invoices scheduled;
3. handles overdue/past-due/expired progression;
4. SystemChargeService schedules and charges system invoices;
5. any supported payment path converges on the invoice unpaid-to-paid
   transition;
6. renewal_paid lets RenewalService finalize;
7. SubscriptionRenewed is dispatched as the canonical cross-path event.

## Lifecycle payloads

Read each event class toArray() at the installed version. Common keys include
subscription, order, main_order, customer, old_status, and meta. Do not assume
all hooks share argument shape.

## Access policy decisions

Define and test:

- whether cancel is immediate or period-end;
- whether past_due retains access during grace;
- whether a failed attempt alone suspends access;
- whether a partial refund changes access;
- what EOT means for installments;
- whether reactivation restores prior entitlement or creates a new grant.

Keep these decisions in the addon; do not distort FluentCart status values to
encode external access state.
