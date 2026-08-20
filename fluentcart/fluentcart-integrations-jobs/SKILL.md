---
name: fluentcart-integrations-jobs
description: >-
  Builds and audits FluentCart product/global integration feeds, CRM/LMS/
  webhook automations, BaseIntegrationManager providers, lifecycle-triggered
  provisioning, fct_scheduled_actions, Action Scheduler dispatch, retries,
  replay protection, logs, and maintenance jobs. Use when registering
  fluent_cart/integration/order_integrations, integration/run/* handlers,
  asynchronous order actions, background notifications, external API calls,
  order_paid_done provisioning, revoke events, scheduled cleanup, or debugging
  pending/running integration jobs.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart integrations and background jobs

Choose between an integration feed, a direct lifecycle listener, and an
addon-owned job based on configurability and durability. Every external side
effect must tolerate delayed delivery, duplicate delivery, and partial failure.

Read [integration-queue-map.md](references/integration-queue-map.md) before
adding a provider or diagnosing the queue.

## Use the feed framework for configurable providers

Extend BaseIntegrationManager when store administrators need global/product
feeds, event selection, conditional routing, provider credentials, smartcodes,
priority, and background execution. Register the manager after FluentCart has
loaded and implement:

- a stable, addon-owned integrationKey;
- getIntegrationDefaults() and getSettingsFields();
- validateFeedData() with server-side normalization and secret handling;
- processAction() for one resolved order/event/feed;
- isConfigured()/API settings that never expose credentials to public output.

BaseIntegrationManager registers dynamic
fluent_cart/integration/run/{integrationKey} execution. Do not dispatch that
hook with browser-supplied feed/order data.

## Choose lifecycle triggers precisely

IntegrationEventListener maps order_paid_done, cancellation/full refund,
subscription activation/reactivation/cancellation/renewal/EOT/validity expiry,
and shipped/delivered events. Revoke behavior is feed-configurable for the
defined revoke hooks.

Use order_paid_done for canonical initial paid-order provisioning. Use
subscription_renewed for all settled renewals. Do not hook or manually fire the
internal fluent_cart/order_paid_async_private_handle action; its name marks an
implementation detail and its payload/ordering may change.

## Understand the two queue layers

FluentCart stores integration work and state in fct_scheduled_actions. Action
Scheduler is then used as the dispatch/runner transport for parts of that work.
An Action Scheduler row is therefore not always the complete business job.
Inspect both stores, the order log, and provider response when debugging.

Core uses Action Scheduler group fluent-cart. Addons should use a unique group
such as my-addon-fluentcart so cleanup, cancellation, support tools, and tests
do not collide with core jobs.

If an addon needs durable custom work, own its schema/payload contract or use
Action Scheduler directly. Do not insert arbitrary rows into
fct_scheduled_actions and assume core will route them.

## Make handlers replay-safe

1. Build a stable operation key from provider, feed, event, and durable object.
2. Re-read the current order/subscription before acting.
3. Atomically claim or record the operation in addon-owned state.
4. Use provider idempotency keys where available.
5. Store sanitized outcome/reference and distinguish retryable from terminal
   failure.
6. Throw or return failure in the way the selected runner actually observes;
   never mark complete in a finally block after a failed call.

The in-request pushed-feed cache only suppresses repeats in one PHP request. It
is not durable deduplication.

The receipt fallback also exposes a nopriv
fluent_cart_run_order_actions AJAX handler keyed by order_hash. It can trigger
pending post-payment work for the resolved order. Treat the hash as a bearer
trigger, never trust that request as a new authorization/settlement signal, and
ensure every effect independently verifies current paid state and idempotency.

## Audit queue lifecycle

Monitor pending age, running age, retry count, dead/failed volume, action/group,
object existence, and Action Scheduler health. The 1.6.0 integration runner has
early-return paths after setting a row to running or before completion; support
tools should detect stale states rather than assuming every missing callback is
a provider outage.

Do not assume plugin deactivation removed every scheduled action. Inventory
Action Scheduler and WordPress-Cron recurrence after activation, deactivation,
and reactivation, and unschedule only addon-owned hooks/groups.

## Test matrix

Test global/product feeds, variation restriction, priority, disabled provider,
all supported event and revoke hooks, initial versus renewal order, async and
real-time mode, public receipt-trigger replay, duplicate event, worker crash before/after provider success,
missing/deleted feed, missing order, exception, rate limit, credential rotation,
retry exhaustion, stale running recovery, Action Scheduler unavailable, WP-Cron
disabled, multisite, deactivation/reactivation, and redacted logs.

## Cross-references

- Use fluentcart-orders-transactions for event payload and settlement timing.
- Use fluentcart-subscriptions-renewals for recurring triggers.
- Use the wc-action-scheduler-jobs skill for Action Scheduler mechanics.

## References

- Official modules overview: <https://dev.fluentcart.com/modules/>
- Verified Free source paths:
  - fluent-cart/app/Modules/Integrations/BaseIntegrationManager.php
  - fluent-cart/app/Modules/Integrations/GlobalIntegrationSettings.php
  - fluent-cart/app/Modules/Integrations/GlobalNotificationHandler.php
  - fluent-cart/app/Listeners/IntegrationEventListener.php
  - fluent-cart/app/Models/ScheduledAction.php
  - fluent-cart/app/Hooks/Scheduler/
  - fluent-cart/app/Events/
- Verified Pro integrations:
  - fluent-cart-pro/app/Modules/Integrations/
