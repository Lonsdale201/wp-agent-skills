---
name: wc-action-scheduler-jobs
description: Queue and run WooCommerce background jobs with Action Scheduler 4.0. Covers async, single, recurring and cron actions, args-aware `$unique` identity, exact-argument checks, groups, JSON args and positional callback delivery, at-least-once execution, remote idempotency, bounded retries, failed-action retention, the recurring-action repair hook, WP-CLI diagnostics, lifecycle scheduling, and batching. Use for `as_enqueue_async_action`, `as_schedule_single_action`, duplicate jobs, failed queues, or slow work moved out of WooCommerce requests and status hooks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-05"
---

# WooCommerce Action Scheduler jobs

Action Scheduler is bundled with WooCommerce and is the right tool for background work: order sync, product imports, webhooks, retries, batch recalculation, export jobs, and recurring maintenance.

Use it instead of doing slow work during checkout, order status hooks, admin saves, or frontend requests.

## Misconception this skill corrects

> "I will pass `$unique = true`, so this side effect can happen exactly once."

WooCommerce 11.0 bundles Action Scheduler 4.0. Its DB store suppresses a unique insert only when a pending/running action has the same `hook + group + encoded args`. Jobs for order 10 and order 11 no longer block each other merely because they share a hook and group.

This is queue-entry deduplication, not exactly-once execution. A job can be manually re-created, retried, replayed after a restored backup, or finish its remote side effect before its local state is saved. Keep the callback idempotent and use a durable owned claim/provider idempotency key when duplicate business effects are unacceptable.

Treat `$unique` identity as active-version/store-specific. Action Scheduler 3.x DBStore used only hook and group; 4.0 adds args. Confirm the loaded version, source, and data store when another plugin can bundle its own copy. For a plugin supporting mixed 3.x/4.x runtimes, use exact `as_has_scheduled_action()` checks as a compatibility guard and still rely on callback idempotency for correctness.

"Exact args" means the same JSON representation. Associative key insertion order and scalar types matter: `array( 'id' => 1, 'mode' => 'full' )` does not match reversed keys, and integer `1` does not match string `'1'`.

## When to use this skill

Trigger when ANY of the following is true:

- Moving slow work out of checkout, webhooks, admin saves, or order status hooks.
- Scheduling order/customer/product sync jobs.
- Running imports, exports, cleanup, reindexing, or recurring maintenance.
- Avoiding duplicate background jobs.
- The diff contains `as_enqueue_async_action`, `as_schedule_single_action`, `as_schedule_recurring_action`, `as_schedule_cron_action`, `as_has_scheduled_action`, `as_next_scheduled_action`, `as_unschedule_action`, or `ActionScheduler`.

## API map

| Need | Function |
|---|---|
| Run as soon as possible | `as_enqueue_async_action( $hook, $args, $group, $unique, $priority )` |
| Run once at a timestamp | `as_schedule_single_action( $timestamp, $hook, $args, $group, $unique, $priority )` |
| Run repeatedly by interval | `as_schedule_recurring_action( $timestamp, $interval, $hook, $args, $group, $unique, $priority )` |
| Run repeatedly by cron expression | `as_schedule_cron_action( $timestamp, $schedule, $hook, $args, $group, $unique, $priority )` |
| Check pending/running action efficiently | `as_has_scheduled_action( $hook, $args, $group )` |
| Get next timestamp or running/async `true` | `as_next_scheduled_action( $hook, $args, $group )` |
| Cancel next matching pending action | `as_unschedule_action( $hook, $args, $group )` |
| Cancel all matching actions | `as_unschedule_all_actions( $hook, $args, $group )` |

Always set a plugin-specific group, for example `myplugin`. It makes admin filtering, CLI runs, and cleanup safer.

Lower numeric priority runs before higher numeric priority among otherwise eligible actions. Priority influences claiming; it does not guarantee completion order.

## Queue from an order hook

```php
add_action(
    'woocommerce_order_status_processing',
    static function ( int $order_id ): void {
        $hook  = 'myplugin_sync_order';
        $args  = array( 'order_id' => $order_id );
        $group = 'myplugin';

        as_enqueue_async_action( $hook, $args, $group, true );
    }
);

add_action(
    'myplugin_sync_order',
    static function ( int $order_id ): void {
        $order = wc_get_order( $order_id );
        if ( ! $order instanceof WC_Order ) {
            return;
        }

        // A local marker avoids unnecessary calls, but is not the idempotency boundary.
        if ( $order->get_meta( '_myplugin_synced_at' ) ) {
            return;
        }

        // Identify this logical operation deterministically. The remote system must
        // enforce this key, for example as an Idempotency-Key or unique operation ID.
        $operation_key = 'myplugin:order-processing-sync:' . $order->get_id() . ':v1';
        myplugin_sync_order_to_remote_system( $order, $operation_key );

        $order->update_meta_data( '_myplugin_synced_at', current_time( 'mysql', true ) );
        $order->save();
    },
    10,
    1
);
```

Action args are persisted as JSON. Pass scalar IDs and small data-only arrays, not `WC_Order`, `WC_Product`, closures, HTTP clients, or service objects. The current store rejects oversized JSON args; keep payload data in domain storage and queue its ID. Load fresh objects inside the callback.

Action Scheduler calls the hook with `array_values( $args )`. Associative keys help querying and readability, but they are not PHP named arguments: callback parameters receive values in insertion order. Keep scheduling arrays in one canonical order and keep scalar types stable.

The local `_myplugin_synced_at` write happens after the remote side effect. A crash between those operations can replay the call. Require the remote system to enforce the deterministic operation key; if it cannot, use a durable outbox, reconciliation process, or storage-level state machine. A post-success local marker alone is not exactly-once delivery.

## Execution and delivery contract

`as_enqueue_async_action()` makes an action due immediately; it does not run it immediately or in the same request. Normal execution depends on the Action Scheduler runner, WP-Cron, traffic, and working loopback requests. Low traffic, disabled WP-Cron, or loopback failures can delay due actions indefinitely.

Do not promise exactly-once execution, strict FIFO order, or a maximum start time. Make callbacks replay-safe and monitor queue age and failures. For production-critical queues, run the WP-CLI queue runner from a real system cron and alert on overdue pending or failed actions.

## Single delayed job

```php
$hook  = 'myplugin_follow_up_order';
$args  = array( 'order_id' => $order_id );
$group = 'myplugin';

as_schedule_single_action( time() + HOUR_IN_SECONDS, $hook, $args, $group, true );
```

On Action Scheduler 4.0, the unique insert is atomic at the DBStore insert boundary for the exact encoded args and returns `0` when a matching pending/running action already exists. `as_next_scheduled_action()` returns a timestamp for a pending scheduled action, `true` for running/async, and `false` for no match. Use `as_has_scheduled_action()` when you only need a boolean or must support older active copies.

## Recurring job initialization, repair, and deactivation

Do not call the procedural API directly from plugin activation: Action Scheduler may not be loaded then. Store bootstrap state on activation, schedule after `action_scheduler_init`, and use the `action_scheduler_ensure_recurring_actions` hook to repair a missing recurring action daily when `as_supports( 'ensure_recurring_actions_hook' )` reports support. Fall back to an idempotent readiness check on older active copies.

```php
function myplugin_ensure_hourly_maintenance(): bool {
    $hook  = 'myplugin_hourly_maintenance';
    $args  = array();
    $group = 'myplugin';

    if ( as_has_scheduled_action( $hook, $args, $group ) ) {
        return true;
    }

    $action_id = as_schedule_recurring_action(
        time() + 5 * MINUTE_IN_SECONDS,
        HOUR_IN_SECONDS,
        $hook,
        $args,
        $group
    );

    if ( ! $action_id ) {
        wc_get_logger()->error( 'Could not schedule maintenance action.', array( 'source' => 'myplugin' ) );
        return false;
    }

    return true;
}

register_activation_hook(
    MYPLUGIN_FILE,
    static function (): void {
        update_option( 'myplugin_schedule_bootstrap_version', '0', false );
    }
);

add_action(
    'action_scheduler_init',
    static function (): void {
        $supports_ensure_hook = function_exists( 'as_supports' )
            && as_supports( 'ensure_recurring_actions_hook' );

        if ( $supports_ensure_hook ) {
            add_action( 'action_scheduler_ensure_recurring_actions', 'myplugin_ensure_hourly_maintenance' );
        }

        $needs_bootstrap = '1' !== get_option( 'myplugin_schedule_bootstrap_version' );

        if ( ( $needs_bootstrap || ! $supports_ensure_hook ) && myplugin_ensure_hourly_maintenance() ) {
            update_option( 'myplugin_schedule_bootstrap_version', '1', false );
        }
    }
);

register_deactivation_hook(
    MYPLUGIN_FILE,
    static function (): void {
        if ( function_exists( 'as_unschedule_all_actions' ) ) {
            as_unschedule_all_actions( 'myplugin_hourly_maintenance', array(), 'myplugin' );
        }

        delete_option( 'myplugin_schedule_bootstrap_version' );
    }
);
```

Increment the bootstrap version when a release changes the recurring schedule. Keep recurring callbacks small. If one run may need to process thousands of rows, split it into batches.

A failed one-off action is marked failed and is not retried automatically. A recurring action normally schedules its next instance even after a failure, but current Action Scheduler stops rescheduling after consistently failing recent runs; the default threshold is five actions with the same hook. The daily ensure hook can restore a disappeared recurring action, but it does not fix the underlying failure.

## Action Scheduler 4.0 cleanup and evidence retention

Action Scheduler 4.0 moved old-action deletion to a dedicated daily scheduled action, normally around 03:00 in the site's local timezone, with bounded batches and continuation actions. The cleaner hooks/classes are internal; do not call or replace them from a distributed plugin.

Default retention is:

- completed and canceled actions: 31 days via `action_scheduler_retention_period`;
- failed actions: three 31-day months via `action_scheduler_retention_period_for_failed`;
- failed cleanup enabled via `action_scheduler_enable_failed_action_cleanup`.

Failed rows and their logs are therefore temporary diagnostics, not durable audit/business records. Export required incident/accounting data to owned storage before retention expires. Site-specific operational code may adjust the documented filters, but a distributed plugin should not globally disable cleanup or impose longer retention without an explicit reason.

## Table ownership and uninstall

Action Scheduler is a shared library. A plugin that happens to load or bundle it does not automatically own the four queue tables, because other active plugins may be using the same store. On WooCommerce 11.0 uninstall, Action Scheduler tables are deliberately preserved by default. WooCommerce removes them only when the site owner has explicitly defined `WC_REMOVE_ACTION_SCHEDULER` as `true` in addition to requesting WooCommerce data removal.

Do not define that constant from an extension and do not drop Action Scheduler tables in a plugin uninstaller. Deactivation should cancel only your plugin's pending actions—prefer an exclusive plugin-owned group—and remove only your own bootstrap/options. Full queue-table deletion is a site-owner operation that requires confirming no other plugin relies on the shared queue.

## Retries, batches, and operations

Failed one-offs do not retry automatically. Implement a bounded attempt counter, backoff, optional jitter, and the same durable idempotency key across attempts; rethrow so each failed attempt remains visible. Split large work into bounded cursor/ID batches rather than one action or an unstable offset over changing data.

Read [references/retries-batches-cli.md](references/retries-batches-cli.md) for copy-ready retry/failure telemetry, batching, and the verified Action Scheduler 4.0 WP-CLI command tree.

## Groups, ordering, and concurrency

Use a group as an operational namespace for filtering, cleanup, and runner selection. A group is not a mutex, a per-resource lock, a dependency graph, or a FIFO queue. Action claims coordinate individual queue entries, but separate actions for the same order or customer can still overlap through web, cron, CLI, or multiple workers.

When overlap would corrupt state, acquire an owned atomic claim in durable storage and release it only if the current worker still owns it. Prefer a database unique key or conditional update over a check-then-set option. Make the callback safe if a worker dies while holding the claim, and design a stale-claim recovery rule.

## Common mistakes

- Assuming `$unique = true` makes the callback or its side effect exactly once. It only suppresses a matching pending/running queue row.
- Assuming one `$unique` identity across AS 3.x and 4.x. The bundled AS 4.0 DBStore includes encoded args; older DBStore versions did not.
- Omitting the group and later being unable to isolate your jobs.
- Treating a group as a lock, FIFO queue, or per-resource serialization boundary.
- Passing objects or closures as args, or using large payloads instead of durable IDs.
- Reordering associative args or changing scalar types, then expecting exact-match queries to find the action.
- Treating associative arg keys as PHP named arguments; only values are passed, in insertion order.
- Doing slow external API calls directly in WooCommerce hooks instead of queueing.
- Assuming `as_enqueue_async_action()` runs immediately or in the same request.
- Assuming a one-off failure retries automatically.
- Treating failed rows/logs as permanent evidence even though AS 4.0 purges them after roughly three months by default.
- Writing a local success marker after a remote call and calling that exactly-once behavior.
- Assuming a job can run only once. Crashes, timeouts, manual CLI runs, or duplicate scheduling can happen; callbacks must be replay-safe.
- Scheduling or querying a recurring action on every page load when the active version supports the daily ensure hook.
- Assuming recurring actions continue forever despite repeated failures.
- Running critical queues only through traffic-driven WP-Cron without latency/failure monitoring.
- Forgetting to unschedule recurring plugin jobs on deactivation.
- Treating shared Action Scheduler tables as plugin-owned uninstall data.

## Cross-skill routing

- Order lifecycle hooks that enqueue jobs: `wc-order-lifecycle-and-items`
- HPOS-safe order reads/writes inside jobs: `wc-hpos-compatibility`
- Store API/block cart updates that need async follow-up: `wc-store-api`

## References

- Official documentation: <https://actionscheduler.org/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/packages/action-scheduler/functions.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/ActionScheduler_ActionFactory.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/data-stores/ActionScheduler_DBStore.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/ActionScheduler_QueueCleaner.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/ActionScheduler_WPCLI_Scheduler_command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/Action_Command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/System_Command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/abstracts/ActionScheduler_Abstract_QueueRunner.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/ActionScheduler_RecurringActionScheduler.php`
