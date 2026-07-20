---
name: wc-action-scheduler-jobs
description: Queue and run WooCommerce background jobs with Action Scheduler. Covers async, single, recurring and cron actions, exact-argument checks, groups, JSON args and `array_values()` invocation, the delivery contract (due is not run; no exactly-once or FIFO), remote idempotency keys, bounded retries with backoff and failure telemetry, the AS 3.9.3 `action_scheduler_ensure_recurring_actions` daily repair hook behind `as_supports()`, WP-CLI diagnostics, lifecycle scheduling, batching, and the WC 10.9.4 DB-store rule that `$unique` guards pending/running actions by hook and group rather than argument set. Use when moving slow order/product/customer work out of requests or status hooks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-13"
---

# WooCommerce Action Scheduler jobs

Action Scheduler is bundled with WooCommerce and is the right tool for background work: order sync, product imports, webhooks, retries, batch recalculation, export jobs, and recurring maintenance.

Use it instead of doing slow work during checkout, order status hooks, admin saves, or frontend requests.

## Misconception this skill corrects

> "I will pass `$unique = true` so there is only one job per order ID."

In WooCommerce 10.9.4's DB store, unique inserts guard by pending/running `hook + group`. They do not include args in the SQL uniqueness check. If you schedule `myplugin_sync_order` with group `myplugin` and `$unique = true`, a pending job for order 10 can block scheduling order 11.

For per-order deduplication, check `as_has_scheduled_action( $hook, $args, $group )` with the exact args, then schedule normally. This check-and-schedule pair is best-effort and can race under concurrent requests; the callback must still be idempotent. Strict uniqueness needs an owned atomic claim/unique key.

Treat the `$unique` behavior as active-store-specific, not as a portable business guarantee. Confirm the loaded Action Scheduler version, source, and data store when another plugin can bundle its own copy.

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

        if ( as_has_scheduled_action( $hook, $args, $group ) ) {
            return;
        }

        as_enqueue_async_action( $hook, $args, $group );
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

if ( ! as_has_scheduled_action( $hook, $args, $group ) ) {
    as_schedule_single_action( time() + HOUR_IN_SECONDS, $hook, $args, $group );
}
```

`as_next_scheduled_action()` returns a timestamp for a pending scheduled action, `true` for running/async, and `false` for no match. Use `as_has_scheduled_action()` when you only need a boolean.

## Recurring job initialization, repair, and deactivation

Do not call the procedural API directly from plugin activation: Action Scheduler may not be loaded then. Store bootstrap state on activation, schedule after `action_scheduler_init`, and use the Action Scheduler 3.9.3 ensure hook to repair a missing recurring action daily. Fall back to an idempotent readiness check on older active copies.

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

A failed one-off action is marked failed and is not retried automatically. A recurring action normally schedules its next instance even after a failure, but Action Scheduler 3.9.3 stops rescheduling after consistently failing recent runs; the default threshold is five actions with the same hook. The daily ensure hook can restore a disappeared recurring action, but it does not fix the underlying failure.

## Explicit retries and failure telemetry

Implement bounded retries deliberately. Carry an attempt number, use exponential backoff with optional jitter, and preserve remote idempotency across every attempt. Rethrow the original error after scheduling the retry so the failed attempt remains visible.

```php
add_action(
    'myplugin_import_order',
    static function ( int $order_id, int $attempt = 1 ): void {
        try {
            myplugin_import_order_from_remote( $order_id );
        } catch ( Throwable $error ) {
            if ( $attempt < 5 ) {
                $delay = min( 15 * ( 2 ** max( 0, $attempt - 1 ) ), 15 * MINUTE_IN_SECONDS );
                $delay += wp_rand( 0, 30 ); // Intentional jitter prevents synchronized retries.

                as_schedule_single_action(
                    time() + $delay,
                    'myplugin_import_order',
                    array(
                        'order_id' => $order_id,
                        'attempt'  => $attempt + 1,
                    ),
                    'myplugin'
                );
            }

            throw $error;
        }
    },
    10,
    2
);

add_action(
    'action_scheduler_failed_execution',
    static function ( int $action_id, Throwable $error, string $context ): void {
        wc_get_logger()->error(
            'Action Scheduler action failed.',
            array(
                'source'    => 'myplugin',
                'action_id' => $action_id,
                'context'   => $context,
                'exception' => $error,
            )
        );
    },
    10,
    3
);
```

Use retry jitter only when varied timing is acceptable. For deterministic tests, inject or filter the delay calculation instead of asserting an exact randomized timestamp.

## Batch pattern

```php
add_action(
    'myplugin_rebuild_product_cache',
    static function ( int $offset = 0 ): void {
        $product_ids = myplugin_get_product_ids_for_rebuild( $offset, 100 );

        foreach ( $product_ids as $product_id ) {
            myplugin_rebuild_one_product_cache( (int) $product_id );
        }

        if ( count( $product_ids ) === 100 ) {
            as_schedule_single_action(
                time() + 30,
                'myplugin_rebuild_product_cache',
                array( 'offset' => $offset + 100 ),
                'myplugin'
            );
        }
    },
    10,
    1
);
```

For imports that can change while the batch runs, prefer a cursor based on IDs or timestamps instead of an offset.

## Groups, ordering, and concurrency

Use a group as an operational namespace for filtering, cleanup, and runner selection. A group is not a mutex, a per-resource lock, a dependency graph, or a FIFO queue. Action claims coordinate individual queue entries, but separate actions for the same order or customer can still overlap through web, cron, CLI, or multiple workers.

When overlap would corrupt state, acquire an owned atomic claim in durable storage and release it only if the current worker still owns it. Prefer a database unique key or conditional update over a check-then-set option. Make the callback safe if a worker dies while holding the claim, and design a stale-claim recovery rule.

## CLI diagnostics and operations

The active Action Scheduler copy registers WP-CLI commands. Multiple plugins can bundle it, so do not assume WooCommerce's physical copy won version selection. Inspect the runtime before diagnosing source-specific behavior:

```bash
wp action-scheduler version --all --path=/path/to/site
wp action-scheduler source --path=/path/to/site
wp action-scheduler source --all --path=/path/to/site
wp action-scheduler data-store --path=/path/to/site
wp action-scheduler runner --path=/path/to/site
wp action-scheduler status --path=/path/to/site
wp action-scheduler run --group=myplugin --batch-size=25 --path=/path/to/site
wp action-scheduler action list --group=myplugin --status=pending --path=/path/to/site
wp action-scheduler action get 123 --path=/path/to/site
wp action-scheduler action run 123 --path=/path/to/site
```

Use the CLI runner for controlled local tests and production workers. It accepts `--hooks`, `--group`, `--exclude-groups`, `--batch-size`, and `--batches`. Use `--force` only intentionally: it bypasses the maximum-concurrent-batches guard and can increase overlap.

Use plain `source` for the selected runtime source. `source --all` shows the registry, but it can omit duplicate physical copies registered under the same version; treat that list as supporting evidence, not a complete filesystem inventory.

## Common mistakes

- Using `$unique = true` for per-order/per-product jobs. In the current DB store, that is hook+group uniqueness, not args-level uniqueness.
- Omitting the group and later being unable to isolate your jobs.
- Treating a group as a lock, FIFO queue, or per-resource serialization boundary.
- Passing objects or closures as args, or using large payloads instead of durable IDs.
- Reordering associative args or changing scalar types, then expecting exact-match queries to find the action.
- Treating associative arg keys as PHP named arguments; only values are passed, in insertion order.
- Doing slow external API calls directly in WooCommerce hooks instead of queueing.
- Assuming `as_enqueue_async_action()` runs immediately or in the same request.
- Assuming a one-off failure retries automatically.
- Writing a local success marker after a remote call and calling that exactly-once behavior.
- Assuming a job can run only once. Crashes, timeouts, manual CLI runs, or duplicate scheduling can happen; callbacks must be replay-safe.
- Scheduling or querying a recurring action on every page load when the active version supports the daily ensure hook.
- Assuming recurring actions continue forever despite repeated failures.
- Running critical queues only through traffic-driven WP-Cron without latency/failure monitoring.
- Forgetting to unschedule recurring plugin jobs on deactivation.

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
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/ActionScheduler_WPCLI_Scheduler_command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/Action_Command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/System_Command.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/abstracts/ActionScheduler_Abstract_QueueRunner.php`
  - `wp-content/plugins/woocommerce/packages/action-scheduler/classes/ActionScheduler_RecurringActionScheduler.php`
