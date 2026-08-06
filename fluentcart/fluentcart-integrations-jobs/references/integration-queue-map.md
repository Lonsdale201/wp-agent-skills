# FluentCart 1.6.0 integration and queue map

## Feed lifecycle

~~~text
order/subscription lifecycle event
  -> select enabled integration providers
  -> load product and global feeds
  -> event, revoke and variation matching
  -> sort by priority and suppress same-request duplicate UUID
  -> run synchronously or create fct_scheduled_actions row
  -> Action Scheduler dispatch
  -> reload feed/order/customer/subscription
  -> fluent_cart/integration/run/{provider}
  -> provider side effect and outcome/log
~~~

For order_paid_done, IntegrationEventListener selects real-time actions in the
tested source. Do not infer all events have identical background behavior.

## Data stores and responsibilities

| Layer | Responsibility |
|---|---|
| ProductMeta | Product-scoped feed configuration |
| Meta | Global order-integration configuration |
| fct_scheduled_actions | FluentCart business queue payload/status |
| Action Scheduler | Dispatch and recurring/async execution |
| Order logs | Operator-facing contextual failure evidence |
| Addon idempotency state | Durable exactly-once effect approximation |

There is no true exactly-once network delivery. Combine at-least-once-safe
handlers with provider idempotency and reconciliation.

## Core mapped triggers

- order_paid_done
- order_status_changed_to_canceled
- order_fully_refunded
- subscription_activated
- subscription_reactivated
- subscription_canceled
- subscription_renewed
- subscription_eot
- subscription_expired_validity
- shipping_status_changed_to_shipped
- shipping_status_changed_to_delivered

The integration feed framework does not automatically map every FluentCart
hook. A new trigger requires source-confirmed event availability and explicit
feed-framework support or a direct listener.

## Retry classification

Retry transient DNS/connect/timeouts, 408, 429 honoring Retry-After, and
selected 5xx responses with bounded exponential backoff and jitter. Do not
blindly retry invalid credentials, invalid payloads, access denial, or a
provider-side permanent validation error. Reconciliation is safer than a new
create call after an ambiguous timeout.

## Operational query checklist

For a stuck integration, correlate:

1. FluentCart scheduled row action/status/retry/object/feed payload.
2. Matching Action Scheduler action/hook/group/log.
3. Current feed enabled/configured state.
4. Order/subscription current status and type.
5. Addon operation/idempotency record.
6. Provider request ID and redacted response.

Treat long-running status without a live runner as stale. Recovery must be
explicit and idempotent, never a bulk status flip followed by uncontrolled
replay.

## Receipt fallback boundary

IntegrationEventListener registers both authenticated and nopriv
fluent_cart_run_order_actions AJAX callbacks. The handler resolves the first
order by submitted order_hash, may fire core private paid handling for a
non-renewal order, and may run a pending integration queue row. This is a
receipt-delivery fallback, not proof that the caller owns or paid the order.
Keep order UUIDs confidential and make downstream work depend on current
server state plus durable deduplication.
