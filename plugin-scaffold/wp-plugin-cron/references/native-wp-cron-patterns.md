# Native WordPress cron patterns

Use these patterns after the main skill establishes when native WP-Cron is the right primitive.

## Recurring event lifecycle

```php
// Register a custom interval before code attempts to schedule it.
add_filter( 'cron_schedules', static function ( array $schedules ): array {
    $schedules['every_six_hours'] = array(
        'interval' => 6 * HOUR_IN_SECONDS,
        'display'  => __( 'Every 6 Hours', 'myplugin' ),
    );
    return $schedules;
} );

register_activation_hook( __FILE__, static function (): void {
    if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
        wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
    }
} );

// Register callbacks on every runtime request, not only during activation/admin.
add_action( 'myplugin_daily_cleanup', static function (): void {
    myplugin_purge_old_logs();
} );

register_deactivation_hook( __FILE__, static function (): void {
    // Clears all events for this owned hook, regardless of args.
    wp_unschedule_hook( 'myplugin_daily_cleanup' );
} );
```

Each `cron_schedules` entry has `interval` in seconds and a translated `display`. WordPress defaults include `hourly`, `twicedaily`, `daily`, and `weekly`. A custom recurrence filter hidden in an object that boots only later can be absent during activation, making scheduling fail.

## Check failures

Pass `$wp_error = true` when scheduling is operationally important:

```php
$result = wp_schedule_event(
    time() + DAY_IN_SECONDS,
    'daily',
    'myplugin_daily_cleanup',
    array(),
    true
);

if ( is_wp_error( $result ) ) {
    error_log( 'MyPlugin cron schedule failed: ' . $result->get_error_message() );
}
```

Do not log sensitive args or payloads with the failure.

## Argument-sensitive idempotency

`wp_next_scheduled( $hook, $args )` returns the next matching timestamp or `false`. Args are part of identity: use the exact same ordered values at schedule, query, and clear boundaries.

```php
$args = array( $site_id );

if ( ! wp_next_scheduled( 'myplugin_daily_cleanup', $args ) ) {
    wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup', $args );
}
```

This prevents ordinary duplicate scheduling but is not an exactly-once execution guarantee. Keep the callback idempotent.

## One-shot deferred work

```php
wp_schedule_single_event(
    time() + 30,
    'myplugin_send_followup',
    array( $user_id, $form_id )
);
```

WordPress rejects the same hook+args within its duplicate window around an existing single event. Check `false`/`WP_Error` and remember that due time is not a delivery guarantee; traffic or a system-cron runner still has to trigger WP-Cron.
