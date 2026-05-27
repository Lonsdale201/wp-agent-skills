---
name: wc-action-scheduler-jobs
description: Queue and run WooCommerce background jobs with Action Scheduler. Covers `as_enqueue_async_action`, `as_schedule_single_action`, `as_schedule_recurring_action`, `as_schedule_cron_action`, `as_has_scheduled_action`, `as_next_scheduled_action`, `as_unschedule_action`, `as_unschedule_all_actions`, groups, scalar args, WP-CLI runner, activation/deactivation scheduling, batching, idempotency, and the important WC 10.8 DB-store gotcha that `$unique` prevents another pending/running action with the same hook and group, not one per argument set. Use when moving slow order/product/customer work out of requests or status hooks.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.0"
php-min: "7.4"
last-updated: "2026-05-27"
docs:
  - https://actionscheduler.org/
source-refs:
  - wp-content/plugins/woocommerce/packages/action-scheduler/functions.php
  - wp-content/plugins/woocommerce/packages/action-scheduler/classes/ActionScheduler_ActionFactory.php
  - wp-content/plugins/woocommerce/packages/action-scheduler/classes/data-stores/ActionScheduler_DBStore.php
  - wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/ActionScheduler_WPCLI_Scheduler_command.php
  - wp-content/plugins/woocommerce/packages/action-scheduler/classes/WP_CLI/Action_Command.php
---

# WooCommerce Action Scheduler jobs

Action Scheduler is bundled with WooCommerce and is the right tool for background work: order sync, product imports, webhooks, retries, batch recalculation, export jobs, and recurring maintenance.

Use it instead of doing slow work during checkout, order status hooks, admin saves, or frontend requests.

## Misconception this skill corrects

> "I will pass `$unique = true` so there is only one job per order ID."

In WooCommerce 10.8's DB store, unique inserts guard by pending/running `hook + group`. They do not include args in the SQL uniqueness check. If you schedule `myplugin_sync_order` with group `myplugin` and `$unique = true`, a pending job for order 10 can block scheduling order 11.

For per-order uniqueness, check `as_has_scheduled_action( $hook, $args, $group )` with the exact args, then schedule normally.

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

        // Make this idempotent: if the remote sync already happened, exit.
        if ( $order->get_meta( '_myplugin_synced_at' ) ) {
            return;
        }

        myplugin_sync_order_to_remote_system( $order );

        $order->update_meta_data( '_myplugin_synced_at', current_time( 'mysql', true ) );
        $order->save();
    },
    10,
    1
);
```

Action args are serialized. Pass scalar IDs and small arrays, not `WC_Order`, `WC_Product`, closures, HTTP clients, or service objects. Load fresh objects inside the callback.

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

## Recurring job on activation/deactivation

Guard for sites where WooCommerce or Action Scheduler is unavailable.

```php
register_activation_hook(
    MYPLUGIN_FILE,
    static function (): void {
        if ( ! function_exists( 'as_has_scheduled_action' ) ) {
            return;
        }

        if ( ! as_has_scheduled_action( 'myplugin_hourly_maintenance', array(), 'myplugin' ) ) {
            as_schedule_recurring_action(
                time() + 5 * MINUTE_IN_SECONDS,
                HOUR_IN_SECONDS,
                'myplugin_hourly_maintenance',
                array(),
                'myplugin'
            );
        }
    }
);

register_deactivation_hook(
    MYPLUGIN_FILE,
    static function (): void {
        if ( function_exists( 'as_unschedule_all_actions' ) ) {
            as_unschedule_all_actions( 'myplugin_hourly_maintenance', array(), 'myplugin' );
        }
    }
);
```

Keep recurring callbacks small. If one run may need to process thousands of rows, split it into batches.

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

## CLI operations

WooCommerce's bundled Action Scheduler registers WP-CLI commands. Useful smoke/debug commands:

```bash
wp action-scheduler run --group=myplugin --batch-size=25 --path=/path/to/site
wp action-scheduler action list --group=myplugin --status=pending --path=/path/to/site
wp action-scheduler action get 123 --path=/path/to/site
```

Use the CLI runner for deterministic local tests and production maintenance windows. It accepts `--hooks`, `--group`, `--exclude-groups`, `--batch-size`, `--batches`, and `--force`.

## Common mistakes

- Using `$unique = true` for per-order/per-product jobs. In WC 10.8 DB store, that is hook+group uniqueness, not args-level uniqueness.
- Omitting the group and later being unable to isolate your jobs.
- Passing objects or closures as args.
- Doing slow external API calls directly in WooCommerce hooks instead of queueing.
- Assuming a job can run only once. Crashes, timeouts, manual CLI runs, or duplicate scheduling can happen; callbacks must be idempotent.
- Scheduling a recurring action on every page load without checking for an existing pending/running one.
- Forgetting to unschedule recurring plugin jobs on deactivation.

## Cross-skill routing

- Order lifecycle hooks that enqueue jobs: `wc-order-lifecycle-and-items`
- Subscription renewal scheduler: `wcs-renewal-scheduler`
- HPOS-safe order reads/writes inside jobs: `wc-hpos-compatibility`
- Store API/block cart updates that need async follow-up: `wc-store-api`
