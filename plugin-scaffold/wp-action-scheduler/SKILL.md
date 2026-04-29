---
name: wp-action-scheduler
description: Design and review Action Scheduler jobs in WordPress plugins
  using Action Scheduler 3.9.x public APIs - async, single, recurring, and
  cron-expression actions; action_scheduler_init load timing; hook/args/group
  naming; unique and priority parameters; idempotent callbacks; chunked
  workloads; activation/deactivation cleanup; WooCommerce-bundled or
  standalone dependency usage; admin and WP-CLI debugging; queue runner limits;
  and safe operational troubleshooting. Use when a plugin schedules background
  jobs with as_enqueue_async_action, as_schedule_single_action,
  as_schedule_recurring_action, as_schedule_cron_action,
  as_get_scheduled_actions, or integrates with WooCommerce background queues.
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: action-scheduler
plugin-version-tested: "3.9.3"
php-min: "7.2"
last-updated: "2026-04-29"
docs:
  - https://actionscheduler.org
  - https://actionscheduler.org/api/
  - https://github.com/woocommerce/action-scheduler
---

# WordPress plugin: Action Scheduler

Action Scheduler is a WordPress-native job queue used by WooCommerce and many
high-volume plugins. It is not just a nicer `wp_schedule_event()` wrapper: it
stores actions in queue tables, tracks status, claims batches, logs attempts,
supports groups, and can run through WP-Cron, async loopback requests, admin
tools, and WP-CLI.

Use `wp-plugin-cron` first when the main question is "native WP-Cron or Action
Scheduler?". Use this skill once the answer is Action Scheduler or the plugin
already depends on it.

## When to load references

- Need copy-ready scheduling/callback patterns for async, single, recurring,
  cron-expression, unique, chunked, and activation/deactivation flows: read
  [references/api-patterns.md](references/api-patterns.md).
- Debugging stuck queues, failed actions, duplicate jobs, table/schema problems,
  or WP-CLI/admin operations: read
  [references/operational-debugging.md](references/operational-debugging.md).

## Misconception this skill corrects

> "Action Scheduler means the callback will run once, soon, and in order."

Wrong mental model. Action Scheduler is an at-least-once background queue. Jobs
can run late, fail, be retried manually, be re-created by recurring schedules,
or be triggered by WP-CLI/admin tools. Callbacks must be idempotent and should
advance durable state, not rely on "this hook only fires once".

## When to use this skill

Trigger when ANY of the following is true:

- Scheduling with `as_enqueue_async_action()`, `as_schedule_single_action()`,
  `as_schedule_recurring_action()`, or `as_schedule_cron_action()`.
- Replacing many WP-Cron single events with a real queue.
- Building WooCommerce order/customer/subscription/membership background work.
- Reviewing duplicate actions, stuck `pending` actions, `failed` actions, or
  oversized queue tables.
- Adding WP-CLI or admin debugging instructions for queued jobs.
- Deciding whether to use `$unique`, `as_has_scheduled_action()`, or
  `as_next_scheduled_action()` guards.

## Dependency and load timing

Action Scheduler can be present as:

- WooCommerce bundled package.
- Standalone plugin.
- Composer package bundled by another plugin.

Do not assume your plugin owns the loaded version. Action Scheduler registers
available versions and initializes the latest registered version. In local
3.9.3, registration happens on `plugins_loaded` priority `0`, initialization
loads the procedural API, and `action_scheduler_init` fires when the store,
logger, runner, admin view, and recurring scheduler are ready.

Rules:

- Register your job callbacks on every request, early enough for runners:
  `add_action( 'myplugin/process_order', ... )` should not be hidden behind an
  admin-only screen load.
- Schedule actions on or after `action_scheduler_init` when scheduling at
  runtime.
- In activation hooks, guard with `function_exists( 'as_schedule_single_action' )`
  before calling the API. If Action Scheduler is an optional dependency, fall
  back to WP-Cron or show an admin notice.
- Never schedule at plugin file top-level before WordPress and dependencies
  load.

```php
add_action( 'action_scheduler_init', static function (): void {
    if ( ! as_has_scheduled_action( 'myplugin/hourly_sync', array(), 'myplugin' ) ) {
        as_schedule_recurring_action(
            time() + HOUR_IN_SECONDS,
            HOUR_IN_SECONDS,
            'myplugin/hourly_sync',
            array(),
            'myplugin',
            true
        );
    }
} );
```

## Public API in Action Scheduler 3.9.3

Scheduling functions return an action ID as `int`; `0` means scheduling failed.

| Function | Use |
|---|---|
| `as_enqueue_async_action( $hook, $args = array(), $group = '', $unique = false, $priority = 10 )` | Run once as soon as possible. |
| `as_schedule_single_action( $timestamp, $hook, $args = array(), $group = '', $unique = false, $priority = 10 )` | Run once at/after a Unix timestamp. |
| `as_schedule_recurring_action( $timestamp, $interval_in_seconds, $hook, $args = array(), $group = '', $unique = false, $priority = 10 )` | Fixed interval recurrence in seconds. |
| `as_schedule_cron_action( $timestamp, $schedule, $hook, $args = array(), $group = '', $unique = false, $priority = 10 )` | Cron-expression recurrence. |
| `as_unschedule_action( $hook, $args = array(), $group = '' )` | Cancel the next pending matching action. |
| `as_unschedule_all_actions( $hook, $args = array(), $group = '' )` | Cancel all pending matching actions. |
| `as_next_scheduled_action( $hook, $args = null, $group = '' )` | Return next timestamp, `true` for async/running, or `false`. |
| `as_has_scheduled_action( $hook, $args = null, $group = '' )` | Efficient boolean check for pending/running actions. |
| `as_get_scheduled_actions( $args = array(), $return_format = OBJECT )` | Query actions by hook, group, status, date, etc. |
| `as_get_datetime_object( $date_string = null, $timezone = 'UTC' )` | Build AS DateTime object for queries. |
| `as_supports( $feature )` | Feature detection. In 3.9.3 it supports `ensure_recurring_actions_hook`. |

The `$priority` parameter is queue priority, not callback priority. Lower
numbers run first; 3.9.3 expects `0-255` and defaults to `10`.

## Hook, args, and group rules

- Use namespaced hook names: `myplugin/process_order`, not `process_order`.
- Use one stable group per plugin or feature: `myplugin`, `myplugin-import`,
  `myplugin-webhooks`.
- Keep action args small and JSON-serializable. The 3.9.3 DB store can keep
  larger encoded args in `extended_args`, but validates against an 8000-character
  encoded limit and still hashes/indexes args for lookup.
- Pass identifiers, not large DTOs, `WC_Order` objects, full API payloads, or
  secrets. Reload current state inside the callback.
- Callback args are passed positionally with `do_action_ref_array( $hook,
  array_values( $args ) )`. Associative keys are for storage/query readability,
  not named parameter delivery.
- Unscheduling matches the hook/args/group combination you pass. For per-entity
  jobs, pass the exact args. For deactivation, prefer canceling a plugin-owned
  group with an empty hook if the group is exclusive to your plugin.

```php
as_enqueue_async_action(
    'myplugin/process_order',
    array( 'order_id' => 123 ),
    'myplugin'
);

add_action(
    'myplugin/process_order',
    static function ( int $order_id ): void {
        myplugin_process_order( $order_id );
    },
    10,
    1
);
```

## Unique actions

In 3.9.3, the scheduling functions support `$unique`. The public docs in the
local source say a unique action is not scheduled when another pending or
running action has the same hook and group parameters. The 3.9.3 DB store
matches pending/running uniqueness by hook and group, not by args.

Use `$unique = true` only for "only one pending/running copy of this hook+group
should exist", such as a global reindex, import coordinator, or recurring sync.
Do not use it for per-order or per-user jobs under one hook/group unless only
one outstanding job for the whole group is intended.

For per-entity duplicate suppression, check the exact args with
`as_has_scheduled_action()` and still make the callback idempotent. That guard is
not a substitute for durable state because it is not a hard business lock.

```php
if ( function_exists( 'as_enqueue_async_action' ) ) {
    $ref = new ReflectionFunction( 'as_enqueue_async_action' );

    if ( $ref->getNumberOfParameters() >= 4 ) {
        as_enqueue_async_action( 'myplugin/reindex', array(), 'myplugin', true );
    } elseif ( ! as_has_scheduled_action( 'myplugin/reindex', array(), 'myplugin' ) ) {
        as_enqueue_async_action( 'myplugin/reindex', array(), 'myplugin' );
    }
}
```

Do not use uniqueness as the only safety mechanism for payment capture,
inventory mutation, email send, or external API side effects. The callback must
still check durable state.

```php
$args = array( 'order_id' => $order_id );

if ( ! as_has_scheduled_action( 'myplugin/process_order', $args, 'myplugin' ) ) {
    as_enqueue_async_action( 'myplugin/process_order', $args, 'myplugin' );
}
```

## Idempotent callback pattern

```php
add_action(
    'myplugin/capture_payment',
    static function ( int $order_id ): void {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        if ( 'yes' === $order->get_meta( '_myplugin_payment_captured', true ) ) {
            return;
        }

        myplugin_capture_payment_for_order( $order );

        $order->update_meta_data( '_myplugin_payment_captured', 'yes' );
        $order->save();
    },
    10,
    1
);
```

For failures that should be retried or surfaced, throw an exception. For
permanent no-op cases, return cleanly. Swallowing all exceptions makes failures
look complete and hides broken jobs from the admin UI and logs.

## Recurring actions

For plugin-owned recurring actions:

- Register the callback on every request.
- Schedule idempotently on activation and/or `action_scheduler_init`.
- Clear on deactivation with exact hook, args, and group.
- Use `action_scheduler_ensure_recurring_actions` in AS 3.9.3+ when you need a
  repair hook for recurring actions that may have been deleted manually.

```php
add_action( 'action_scheduler_ensure_recurring_actions', static function (): void {
    if ( ! function_exists( 'as_supports' ) || ! as_supports( 'ensure_recurring_actions_hook' ) ) {
        return;
    }

    if ( ! as_has_scheduled_action( 'myplugin/hourly_sync', array(), 'myplugin' ) ) {
        as_schedule_recurring_action(
            time() + HOUR_IN_SECONDS,
            HOUR_IN_SECONDS,
            'myplugin/hourly_sync',
            array(),
            'myplugin',
            true
        );
    }
} );
```

## Statuses, tables, and runner model

Core statuses in 3.9.3:

- `pending`
- `in-progress`
- `complete`
- `failed`
- `canceled`

The DB store uses prefixed tables based on these base names:

- `actionscheduler_actions`
- `actionscheduler_claims`
- `actionscheduler_groups`
- `actionscheduler_logs`

Do not write direct SQL for normal plugin behavior. Use the public API, admin
UI, or WP-CLI. Direct SQL is acceptable only for emergency diagnostics with a
backup and site-specific approval.

The default queue runner schedules WP-Cron hook `action_scheduler_run_queue`
every minute and can dispatch async admin-context requests on shutdown. Default
web runner batch size is filterable through
`action_scheduler_queue_runner_batch_size` and defaults to `25`.

## WP-CLI and admin debugging

Admin UI: Tools -> Scheduled Actions.

Common WP-CLI commands in 3.9.3:

```bash
wp action-scheduler action list --group=myplugin --status=pending
wp action-scheduler action next myplugin/process_order --group=myplugin
wp action-scheduler action get 123 --format=json
wp action-scheduler action logs 123
wp action-scheduler action run 123
wp action-scheduler run --group=myplugin --batch-size=25 --batches=1
wp action-scheduler clean --status=complete,canceled --before='31 days ago'
wp action-scheduler fix-schema
```

Use WP-CLI for deterministic local/dev runs and for production debugging when
the web runner is too slow or loopback requests are blocked.

## Critical rules

- Use `action_scheduler_init` as the safe runtime scheduling point.
- Register callbacks on every request, not only inside admin pages or AJAX
  handlers.
- Keep args small, scalar/array, JSON-serializable, and non-sensitive.
- Treat args as positional callback params; array keys are not named params.
- Prefer plugin-prefixed hook names and stable group names.
- Use `$unique = true` only for hook+group singleton suppression; still make
  callbacks idempotent.
- Use `as_has_scheduled_action()` for a boolean guard; use
  `as_next_scheduled_action()` only when you need the timestamp.
- Throw for real job failures; return for permanent no-op cases.
- Do not mutate AS tables directly in normal plugin code.
- For large workloads, enqueue chunks/cursors instead of one massive action.

## Common mistakes

```php
// WRONG - callback hidden in an admin screen, runner cannot find it from WP-Cron.
if ( is_admin() && isset( $_GET['page'] ) && 'myplugin' === $_GET['page'] ) {
    add_action( 'myplugin/process_order', 'myplugin_process_order' );
}

// WRONG - passes a large payload and secrets through queued args.
as_enqueue_async_action( 'myplugin/send_payload', $full_api_payload, 'myplugin' );

// WRONG - associative args treated as named callback parameters.
add_action( 'myplugin/process_order', static function ( array $args ): void {
    myplugin_process_order( $args['order_id'] );
}, 10, 1 );

// RIGHT - pass ID, reload state, receive positional callback arg.
as_enqueue_async_action(
    'myplugin/process_order',
    array( 'order_id' => $order_id ),
    'myplugin'
);

add_action( 'myplugin/process_order', 'myplugin_process_order', 10, 1 );

// WRONG - this only matches empty-arg actions for this hook+group. It will not
// clear per-order jobs scheduled with array( 'order_id' => $order_id ).
as_unschedule_all_actions( 'myplugin/process_order', array(), 'myplugin' );

// RIGHT - exact hook + args + group for one per-entity job.
as_unschedule_all_actions(
    'myplugin/process_order',
    array( 'order_id' => $order_id ),
    'myplugin'
);

// RIGHT - on deactivation, clear all pending actions in an exclusive
// plugin-owned group.
as_unschedule_all_actions( '', array(), 'myplugin' );
```

## Cross-references

- Run `wp-plugin-cron` before this when choosing between WP-Cron and Action
  Scheduler.
- Run `wp-plugin-lifecycle` for activation/deactivation structure and multisite
  activation behavior.
- Run `wp-plugin-dto` when queued args should hydrate a stable input object
  inside the callback.
- Run `wp-plugin-presenter` when an action produces admin/REST/email output.
- Run `wp-security-audit` for callbacks processing persisted IDs, external API
  payloads, or user-supplied data.

## What this skill does NOT cover

- Building an external queue on Redis, SQS, RabbitMQ, or Beanstalkd.
- Forking or replacing Action Scheduler internals.
- Native WP-Cron basics; use `wp-plugin-cron`.
- WooCommerce-specific business rules for orders/subscriptions/memberships;
  combine this with the relevant WooCommerce skill.

## Source notes

Validated against the local Action Scheduler 3.9.3 plugin installed at
`wp-content/plugins/action-scheduler` on 2026-04-29:

- `functions.php` public API signatures.
- `ActionScheduler::init()` and `action_scheduler_init` timing.
- `ActionScheduler_Action::execute()` positional arg delivery.
- `ActionScheduler_Store` statuses and DB store args length behavior.
- `ActionScheduler_QueueRunner` runner hook and batch size.
- WP-CLI command classes under `classes/WP_CLI`.
