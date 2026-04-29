# Action Scheduler API patterns

These examples target Action Scheduler 3.9.3 and use the public procedural API.
Keep hook names and groups plugin-prefixed.

## Async one-shot

Use for "do this soon, off the current request".

```php
final class MyPlugin_Order_Jobs {
    public const GROUP = 'myplugin';
    public const HOOK_PROCESS_ORDER = 'myplugin/process_order';

    public static function register(): void {
        add_action( self::HOOK_PROCESS_ORDER, array( self::class, 'process_order' ), 10, 1 );
    }

    public static function enqueue_process_order( int $order_id ): int {
        if ( ! function_exists( 'as_enqueue_async_action' ) ) {
            return 0;
        }

        $args = array( 'order_id' => $order_id );
        if ( function_exists( 'as_has_scheduled_action' ) && as_has_scheduled_action( self::HOOK_PROCESS_ORDER, $args, self::GROUP ) ) {
            return 0;
        }

        return as_enqueue_async_action(
            self::HOOK_PROCESS_ORDER,
            $args,
            self::GROUP
        );
    }

    public static function process_order( int $order_id ): void {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }

        if ( 'yes' === $order->get_meta( '_myplugin_processed', true ) ) {
            return;
        }

        myplugin_process_order_now( $order );

        $order->update_meta_data( '_myplugin_processed', 'yes' );
        $order->save();
    }
}
```

Call `MyPlugin_Order_Jobs::register()` on every request, e.g. during plugin
bootstrap.

## Single scheduled action

Use for "run once at/after this timestamp".

```php
$action_id = as_schedule_single_action(
    strtotime( '+15 minutes' ),
    'myplugin/send_followup_email',
    array( 'user_id' => $user_id ),
    'myplugin'
);

if ( 0 === $action_id ) {
    error_log( 'MyPlugin failed to schedule followup email.' );
}
```

## Recurring action with activation/deactivation

```php
final class MyPlugin_Sync_Schedule {
    private const GROUP = 'myplugin';
    private const HOOK = 'myplugin/hourly_sync';

    public static function register(): void {
        add_action( self::HOOK, array( self::class, 'run' ) );
        add_action( 'action_scheduler_init', array( self::class, 'ensure_scheduled' ) );
        add_action( 'action_scheduler_ensure_recurring_actions', array( self::class, 'ensure_scheduled' ) );
    }

    public static function activate(): void {
        if ( function_exists( 'as_schedule_recurring_action' ) ) {
            self::ensure_scheduled();
        }
    }

    public static function deactivate(): void {
        if ( function_exists( 'as_unschedule_all_actions' ) ) {
            as_unschedule_all_actions( self::HOOK, array(), self::GROUP );
        }
    }

    public static function ensure_scheduled(): void {
        if ( ! function_exists( 'as_has_scheduled_action' ) ) {
            return;
        }

        if ( as_has_scheduled_action( self::HOOK, array(), self::GROUP ) ) {
            return;
        }

        as_schedule_recurring_action(
            time() + HOUR_IN_SECONDS,
            HOUR_IN_SECONDS,
            self::HOOK,
            array(),
            self::GROUP,
            true
        );
    }

    public static function run(): void {
        myplugin_run_hourly_sync();
    }
}
```

If using `register_activation_hook()`, call `MyPlugin_Sync_Schedule::activate`.
If using `register_deactivation_hook()`, call
`MyPlugin_Sync_Schedule::deactivate`.

## Cron-expression action

Use for calendar-like recurrence that fixed intervals cannot express.

```php
as_schedule_cron_action(
    time(),
    '5 4 * * *',
    'myplugin/daily_report',
    array(),
    'myplugin',
    true
);
```

The first `$timestamp` delays the first eligible cron-expression match. The
cron expression itself decides later recurrences.

## Chunked workload with cursor

Use when there may be thousands of records. Do not enqueue one gigantic action.

```php
add_action( 'myplugin/import_batch', 'myplugin_import_batch', 10, 2 );

function myplugin_start_import( string $source_id ): int {
    return as_enqueue_async_action(
        'myplugin/import_batch',
        array(
            'source_id' => $source_id,
            'cursor'    => 0,
        ),
        'myplugin-import',
        true
    );
}

function myplugin_import_batch( string $source_id, int $cursor ): void {
    $result = myplugin_import_next_rows( $source_id, $cursor, 100 );

    if ( $result->has_more() ) {
        as_enqueue_async_action(
            'myplugin/import_batch',
            array(
                'source_id' => $source_id,
                'cursor'    => $result->next_cursor(),
            ),
            'myplugin-import'
        );
    }
}
```

## Unscheduling

Cancel one exact pending action:

```php
as_unschedule_action(
    'myplugin/process_order',
    array( 'order_id' => $order_id ),
    'myplugin'
);
```

Cancel all pending empty-arg actions under one hook and group, such as a
plugin-owned recurring sync:

```php
as_unschedule_all_actions( 'myplugin/hourly_sync', array(), 'myplugin' );
```

Cancel all pending plugin actions in a group:

```php
as_unschedule_all_actions( '', array(), 'myplugin' );
```

Use broad group cancellation only on deactivation or destructive admin actions,
and only if the group is uniquely owned by the plugin.

There is no procedural helper for "cancel all actions under this hook and group
regardless of args". For per-entity actions, pass exact args. For deactivation,
use an exclusive group and cancel by group.

## Querying actions

```php
$pending_ids = as_get_scheduled_actions(
    array(
        'hook'     => 'myplugin/process_order',
        'group'    => 'myplugin',
        'status'   => ActionScheduler_Store::STATUS_PENDING,
        'per_page' => 50,
        'orderby'  => 'date',
        'order'    => 'ASC',
    ),
    'ids'
);
```

Prefer `as_has_scheduled_action()` for existence checks. Use
`as_get_scheduled_actions()` when building debug/admin views or migration tools.

## Global unique action compatibility

Use this only for global hook+group uniqueness, not for per-entity jobs whose
args differ.

```php
function myplugin_enqueue_unique( string $hook, array $args, string $group ): int {
    if ( ! function_exists( 'as_enqueue_async_action' ) ) {
        return 0;
    }

    $ref = new ReflectionFunction( 'as_enqueue_async_action' );
    if ( $ref->getNumberOfParameters() >= 4 ) {
        return as_enqueue_async_action( $hook, $args, $group, true );
    }

    if ( function_exists( 'as_has_scheduled_action' ) && as_has_scheduled_action( $hook, $args, $group ) ) {
        return 0;
    }

    return as_enqueue_async_action( $hook, $args, $group );
}
```

For plugins that require Action Scheduler 3.9.3+, skip the reflection branch
and call the modern signature directly.
