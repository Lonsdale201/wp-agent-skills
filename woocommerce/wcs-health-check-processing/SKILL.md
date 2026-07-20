---
name: wcs-health-check-processing
description: WooCommerce Subscriptions 8.8+ Health Check and Processing Reliability playbook for missing renewal schedules, automatic-renewal candidates, guarded Resolve actions, dedicated Action Scheduler processing, web cron, health-check tables, logs, AJAX nonces, and queue filters. Use for WCS Health Check, wcs_health_check_candidates, wcs_health_check_runs, Processing reliability, subscriptions/job-queue, or renewal remediation.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce Subscriptions: Health Check and processing reliability

Use this when debugging WCS 8.8+ subscription processing, missing renewal orders, stuck manual renewals, Health Check scan results, or low-traffic stores where Action Scheduler is not reliably processing subscription work.

## Misconception this skill corrects

> "If renewals are missing, create Action Scheduler rows or write `_schedule_next_payment` directly."

That can duplicate or desync WCS state. WCS 8.8 ships a Health Check scanner and Processing Reliability settings. Use the subscription object APIs, built-in Health Check tooling, and Action Scheduler configuration before inventing custom queue runners.

## When to use this skill

Trigger when ANY of the following is true:

- The user mentions WooCommerce > Status > Subscriptions, Health Check, Resolve, missing renewals, automatic-renewal candidates, or scan/cancel scan.
- Code contains `wcs_health_check_candidates`, `wcs_health_check_runs`, `wcs-health-check`, `RemediationAdvisor`, `ToolRunner`, `CandidateStore`, `ScheduleManager`, or `StatusTab`.
- The store has renewal delays, `DISABLE_WP_CRON`, low traffic, or asks about Dedicated processing / Web cron support.
- Code contains `wcs_dedicated_queue_enabled`, `woocommerce_subscriptions_queue_rotation`, `wcs_external_trigger_rate_limit_window`, or `/subscriptions/job-queue`.

## Health Check surface

WCS registers the Health Check tab from `Automattic\WooCommerce_Subscriptions\Internal\HealthCheck\Bootstrap` during plugin init.

| Surface | Location / name | Notes |
|---|---|---|
| Admin tab | WooCommerce > Status > Subscriptions | `StatusTab::TAB_SLUG` is `wcs-health-check`. |
| Candidate table | `{$wpdb->prefix}wcs_health_check_candidates` | Detected subscriptions per scan run. |
| Run table | `{$wpdb->prefix}wcs_health_check_runs` | Scan run metadata and progress. |
| Log source | `wcs-health-check` | Used for scan/remediation/table failures. |
| AJAX suggest | `wp_ajax_wcs_health_check_suggest_remediation` | Nonce action `wcs_health_check_suggest_remediation`. |
| AJAX tool call | `wp_ajax_wcs_health_check_tool_call` | Nonce action `wcs_health_check_tool_call`. |
| AJAX scan status | `wp_ajax_wcs_health_check_scan_status` | Nonce action `wcs_health_check_scan_status`. |

The tables are owned by WCS. Do not insert candidate rows from your plugin. For support/debugging, read them to understand what the scanner saw, then fix the subscription through WCS APIs or admin UI.

## Candidate signals and Resolve actions

The Health Check scanner classifies subscriptions into two broad signal groups:

| Signal | Typical issue | Built-in direction |
|---|---|---|
| `supports_auto_renewal` | Subscription is manual but has a saved token/gateway setup that can support automatic renewal. | Suggest switching the billing mode to automatic renewal. |
| `missing_renewal` | Next payment date is missing or past due without a matching renewal order. | Suggest rescheduling/processing the missed renewal depending on state. |

`RemediationAdvisor` exposes two internal action constants:

- `switch_to_automatic_renewal`
- `process_renewal_now`

Treat `Automattic\WooCommerce_Subscriptions\Internal\HealthCheck\*` classes as internal implementation. Do not call `ToolRunner` or `RemediationAdvisor` from normal plugin features. If you need similar behavior, use public WCS APIs:

```php
$subscription = wcs_get_subscription( $subscription_id );

if ( $subscription instanceof WC_Subscription ) {
    $subscription->update_dates( array( 'next_payment' => '2026-06-20 00:00:00' ), 'gmt' );
}
```

For "process renewal now", prefer the built-in Resolve action. Do **not** translate it to a bare `do_action( 'woocommerce_scheduled_subscription_payment', $id )`: that path has no caller-level recent-renewal/running-action guard and can race an Action Scheduler worker into a duplicate order or charge.

The WCS 9.0 Resolve implementation first checks for a recent renewal, accepts only `active`/`on-hold`, checks for a running canonical scheduled action, calls `WC_Subscriptions_Manager::process_renewal()` with the current status, unschedules the pending canonical action only after a renewal order exists, and then calls `WC_Subscriptions_Payment_Gateways::gateway_scheduled_subscription_payment()`. These classes form a source-verified implementation model, but `Internal\HealthCheck\*` itself is not a public service API. Custom programmatic renewal needs equivalent idempotency and locking; see `wcs-renewal-scheduler`.

## Failed-renewal retry hook change

WCS 8.8 changed same-gateway failed-renewal handling. When the retry/payment uses the same gateway already stored on the subscription, WCS does not call `WC_Subscriptions_Change_Payment_Gateway::update_payment_method()` just to rewrite the same gateway.

These hooks do not fire for that same-gateway retry case:

- `woocommerce_subscriptions_pre_update_payment_method`
- `woocommerce_subscription_payment_method_updated`
- `woocommerce_subscription_payment_method_updated_to_{gateway_id}`

Use `woocommerce_subscription_failing_payment_method_updated` or `woocommerce_subscription_failing_payment_method_updated_{gateway_id}` for failed-renewal recovery side effects.

## Processing reliability settings

WCS 8.8 adds "Processing reliability" under WooCommerce > Settings > Subscriptions.

| Setting | What it does | Integration guidance |
|---|---|---|
| Dedicated processing | Adds WCS-managed Action Scheduler queue scoping for subscription work. | Prefer this over a custom renewal runner. |
| Web cron support | Exposes a tokenized queue trigger for external cron services. | Use the generated URL; do not hardcode or guess the token. |

The external route is:

```text
/wp-json/wc/v3/subscriptions/job-queue?wcs_token=<token>
```

It accepts `GET`, `POST`, and `PUT`. On a valid, non-rate-limited request, it returns `{"status":"dispatched"}` and dispatches the queue on `shutdown`. If the subscription Action Scheduler group does not exist yet, it returns `{"status":"not_dispatched","hint":"..."}` instead of trying to claim a non-existent group.

The route has a public REST permission callback because authentication happens through the generated `wcs_token` in the handler. Treat the full URL as a secret: do not expose it in frontend markup, analytics, support screenshots, or shared logs.

## Queue components

| Class | Role |
|---|---|
| `Manager` | Registers settings and wires queue features when enabled. |
| `Dedicated_Queue` | On every Nth queue run, sets a `group` claim filter for subscription groups. Default rotation is `3`. |
| `Queue_Isolator` | On normal runs, can set `exclude-groups` so regular Action Scheduler batches skip subscription work. |
| `External_Trigger_Endpoint` | Tokenized REST endpoint that dispatches a subscription-scoped queue run. |
| `Concurrent_Batches_Booster` | Raises Action Scheduler concurrent batches from default `1` to `2` when dedicated processing is on and no earlier override exists. |

These classes use Action Scheduler DBStore claim filters when available. Alternative Action Scheduler stores may degrade to less-scoped behavior.

## Tuning filters

| Filter | Default | Use |
|---|---|---|
| `woocommerce_subscriptions_queue_rotation` | `3` | Override how often a dedicated WCS focus turn happens. WCS clamps to `2..6`. |
| `wcs_dedicated_queue_enabled` | `false` | Code-level enablement. WCS flips this for its own scope when merchant settings are on. |
| `wcs_external_trigger_rate_limit_window` | `60` | Seconds between accepted external trigger requests. |
| `wcs_external_trigger_rate_limit_bypass` | `false` | Per-request bypass for the external trigger rate limit. Use only for trusted diagnostics. |
| `action_scheduler_queue_runner_concurrent_batches` | AS default `1` | WCS booster bumps only the still-default value to `2`. |

## Diagnostics

Check logs by source:

| Source | Meaning |
|---|---|
| `wcs-health-check` | Scan, candidate, remediation, table, and lock issues. |
| `woocommerce-subscriptions-dedicated-queue` | Dedicated queue applied/skipped/blocked. |
| `woocommerce-subscriptions-queue-isolator` | Regular queue isolation applied/skipped/deferred. |
| `woocommerce-subscriptions-external-trigger` | External trigger dispatched, invalid token, disabled, rate limited, or group absent. |
| `woocommerce-subscriptions` | Shared WCS warnings, including queue group lookup failures. |

Useful local checks:

```bash
wp action-scheduler list --group=wc_subscription_scheduled_event --status=pending
wp option get woocommerce_subscriptions_version
wp db query "SELECT status, signal_type, COUNT(*) FROM wp_wcs_health_check_candidates GROUP BY status, signal_type"
```

Adjust the table prefix in SQL. Prefer WP-CLI and admin tools before raw SQL.

## Common mistakes

```php
// WRONG: inserts a renewal action that WCS may not be able to find/unschedule later.
as_schedule_single_action( time() + HOUR_IN_SECONDS, 'woocommerce_scheduled_subscription_payment', array( $subscription_id ) );

// RIGHT: update the subscription date and let WCS reschedule.
$subscription->update_dates( array( 'next_payment' => gmdate( 'Y-m-d H:i:s', time() + HOUR_IN_SECONDS ) ), 'gmt' );

// WRONG: same-gateway failed-renewal retry cleanup on payment-method update.
add_action( 'woocommerce_subscription_payment_method_updated', 'my_clear_retry_state', 10, 3 );

// RIGHT:
add_action( 'woocommerce_subscription_failing_payment_method_updated', 'my_clear_retry_state_after_failed_renewal', 10, 2 );

// WRONG: call internal Health Check remediation from plugin code.
( new Automattic\WooCommerce_Subscriptions\Internal\HealthCheck\ToolRunner() )->run( 'process_renewal_now', $subscription_id );

// RIGHT for merchant remediation: use the built-in Health Check Resolve action.
// Programmatic code must reproduce its recent-order, running-action, status,
// creation, unschedule-after-success, and gateway-dispatch guards.
```

## Cross-references

- Use `wcs-renewal-scheduler` for date changes, renewal order creation, scheduled payment flow, and retry timing.
- Use `wcs-subscription-hooks` for broader WCS hook selection.
- Use `wc-action-scheduler-jobs` for general Action Scheduler debugging outside WCS-specific queue management.

## References

- Official documentation: <https://woocommerce.com/document/subscriptions/develop/>
- Verified source paths:
  - `wp-content/plugins/woocommerce-subscriptions/changelog.txt`
  - `wp-content/plugins/woocommerce-subscriptions/includes/class-wc-subscriptions-plugin.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/health-check/class-wcs-health-check-table-maker.php`
  - `wp-content/plugins/woocommerce-subscriptions/src/Internal/HealthCheck/`
  - `wp-content/plugins/woocommerce-subscriptions/src/Internal/Queue_Management/`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php`
