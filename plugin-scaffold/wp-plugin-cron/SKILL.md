---
name: wp-plugin-cron
description: Designs and reviews scheduled/background work in WordPress
  plugins: wp_schedule_event, wp_schedule_single_event, cron_schedules,
  wp_next_scheduled guards, activation scheduling, deactivation cleanup,
  WP-Cron pseudo-cron timing, DISABLE_WP_CRON/system cron, multisite
  per-blog cron, idempotent callbacks, chunking, and Action Scheduler
  graduation. Use when adding scheduled jobs, debugging late/duplicate
  cron events, or deciding between WP cron and Action Scheduler.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.5 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/plugins/cron/
  - https://developer.wordpress.org/reference/functions/wp_schedule_event/
  - https://developer.wordpress.org/reference/functions/wp_schedule_single_event/
  - https://developer.wordpress.org/reference/hooks/cron_schedules/
  - https://actionscheduler.org
---

# WordPress plugin: cron & background jobs

Scheduled work — daily cleanup, periodic API sync, deferred email send, retry on failed webhook delivery — is a normal part of plugin life. WordPress ships its own cron primitive (`wp_schedule_event`), and the WooCommerce-bundled Action Scheduler library extends the model into a proper queue. Picking between them and using the chosen one correctly is what this skill covers.

## When to use this skill

Trigger when ANY of the following is true:

- Scheduling a periodic task (daily option cleanup, hourly token refresh, weekly digest email).
- Deferring work off the request thread (e.g. send email after the form submission returns).
- Debugging "my cron event was registered but never fires" or "fires multiple times" or "fires hours late".
- Deciding between native WP cron and Action Scheduler for a non-trivial background workload.
- Reviewing a plugin's activation / deactivation hooks for cron schedule + clear correctness.

## Mental model — WP cron is pseudo-cron, not real cron

WordPress cron does NOT run on a system schedule. There is no `cron` daemon waking WP up. Instead:

1. Page request comes in.
2. On `init`, WordPress calls `wp_cron()` (`wp-includes/default-filters.php`).
3. Since WP 6.9, `wp_cron()` registers `_wp_cron()` on `shutdown` for normal requests, so the cron spawn does not hurt TTFB as much. With `ALTERNATE_WP_CRON`, it still uses `wp_loaded`.
4. `_wp_cron()` checks for due events and makes a non-blocking loopback request to `/wp-cron.php`, which actually runs the due events.

Implications:

- **No traffic = no cron.** A site with 5 visitors/day fires cron events 5 times/day, max. A "daily" event on a low-traffic site might run every 3 days.
- **Late firing is normal.** An "hourly" event scheduled at noon may fire at 12:47 if that's when the next visitor lands.
- **Concurrent visitors can race.** WP has internal locking but it's best-effort; on a busy site, two requests may both attempt to spawn the same event before the lock takes effect.
- **Long-running events block the loopback.** If your `daily_cleanup` callback runs 90 seconds, the wp-cron.php request takes 90 seconds. Other due events in that batch wait.

For real-time precision OR predictable timing, set `DISABLE_WP_CRON` in `wp-config.php` and configure system cron to call `wp-cron.php` every minute:

```
define( 'DISABLE_WP_CRON', true );
```
```cron
* * * * * curl -s https://example.com/wp-cron.php > /dev/null 2>&1
```

This is host-level setup, NOT the plugin's responsibility — but the plugin's docs should mention it for users with timing-sensitive workloads.

## Native WP cron — the basic API

```php
// 1. Register a custom interval (only needed for non-default recurrences).
add_filter( 'cron_schedules', static function ( array $schedules ): array {
    $schedules['every_six_hours'] = array(
        'interval' => 6 * HOUR_IN_SECONDS,
        'display'  => __( 'Every 6 Hours', 'myplugin' ),
    );
    return $schedules;
} );

// 2. Schedule on activation (idempotently — see below).
register_activation_hook( __FILE__, static function (): void {
    if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
        wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
    }
} );

// 3. Wire the callback at runtime (in a 'plugins_loaded' callback or top-level).
add_action( 'myplugin_daily_cleanup', static function (): void {
    // The actual work.
    myplugin_purge_old_logs();
} );

// 4. Clear on deactivation. wp_unschedule_hook clears ALL events for the hook
//    regardless of $args; safer than wp_clear_scheduled_hook($hook, $args)
//    which requires the exact args used at schedule time.
register_deactivation_hook( __FILE__, static function (): void {
    wp_unschedule_hook( 'myplugin_daily_cleanup' );
} );
```

The `cron_schedules` filter returns an array; each schedule has `interval` (seconds) and `display` (translated label). WP defaults: `'hourly'` (3600), `'twicedaily'` (43200), `'daily'` (86400), `'weekly'` (604800).

If you schedule a custom recurrence during activation, the `cron_schedules`
filter must already be registered before the activation callback calls
`wp_schedule_event()`. A filter hidden inside a runtime object that only boots on
`plugins_loaded` can be missing during activation flows.

For critical scheduling, pass `$wp_error=true` and log or surface failures:

```php
$result = wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup', array(), true );
if ( is_wp_error( $result ) ) {
    error_log( 'MyPlugin cron schedule failed: ' . $result->get_error_message() );
}
```

### Idempotent scheduling

The `wp_next_scheduled` guard is non-negotiable. Without it, every plugin reactivation creates a duplicate event:

```php
// WRONG — creates a new event every time activation fires
register_activation_hook( __FILE__, function () {
    wp_schedule_event( time(), 'daily', 'myplugin_daily_cleanup' );
} );
// After 5 reactivations: 5 events, the callback runs 5 times daily.

// RIGHT
if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
    wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
}
```

`wp_next_scheduled( $hook, $args )` returns the timestamp of the next pending event matching the hook + args, or `false` if none exists. **Args matter** — events with different `$args` are distinct events under the same hook. Schedule with the same args you'll check.

### One-shot deferred work

For "do this once, soon" (e.g. send a notification after a form submit, defer a heavy compute off the request):

```php
wp_schedule_single_event( time() + 30, 'myplugin_send_followup', array( $user_id, $form_id ) );
```

Use `time() + N` for a delay; use `time()` (or `time() + 1`) to fire as soon as possible. WP de-duplicates: scheduling the same hook + args within the duplicate window around an existing pending event returns `false` (or `WP_Error` when `$wp_error=true`). This is verified in `wp_schedule_single_event()`.

## Multisite — cron is per-blog

Each site in a multisite network has its own scheduled events. `wp_schedule_event` writes to the current blog's `cron` option; `wp_unschedule_hook` reads from the current blog only. Treat cron as a per-site primitive.

For a network-wide periodic task, two options:

1. **Schedule per site at activation** (network activation iterates sites, see `wp-plugin-lifecycle`):
   ```php
   foreach ( get_sites( array( 'fields' => 'ids' ) ) as $site_id ) {
       switch_to_blog( $site_id );
       if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
           wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
       }
       restore_current_blog();
   }
   ```
2. **Schedule once on the main blog** if the work is genuinely site-wide (writes to network options, not per-blog data). Document the choice — future maintainers will assume per-site otherwise.

Multisite cron caveat: this skill's authoring environment is single-site. The above is source-derived from `wp-includes/cron.php` but not end-to-end tested in a real network. Verify before relying.

## Action Scheduler — when WP cron is not enough

[Action Scheduler](https://actionscheduler.org) is a queue-style background-job library bundled with WooCommerce (and standalone available via Composer). It uses its own DB tables instead of `wp_options` and adds capabilities WP cron doesn't have.

When to graduate from WP cron to Action Scheduler:

| Need | WP cron | Action Scheduler |
|---|---|---|
| Scheduling 5-10 plugins' worth of events | OK | OK |
| 10,000+ scheduled actions (e.g. one per order) | **slow / breaks** — `cron` option grows huge in `wp_options`, all autoloaded | designed for it |
| Per-action status tracking (pending / running / completed / failed) | none | built-in |
| Built-in retry on failure | manual | built-in |
| Duplicate guards | partial (single-event 10-min de-dup by hook+args) | `$unique` for hook+group singletons, or exact-args guards with `as_has_scheduled_action()` |
| Admin UI to inspect queue / re-run failures | none | yes (`Tools → Scheduled Actions`) |
| Logical grouping of related actions | none | `group` parameter |
| Graceful concurrency (multiple workers) | no | yes |

Detection in code:

```php
if ( function_exists( 'as_schedule_recurring_action' ) ) {
    $supports_unique = ( new ReflectionFunction( 'as_schedule_recurring_action' ) )->getNumberOfParameters() >= 6;

    if ( $supports_unique ) {
        as_schedule_recurring_action(
            time() + DAY_IN_SECONDS,    // first run
            DAY_IN_SECONDS,              // interval
            'myplugin_daily_cleanup',
            array(),                     // args
            'myplugin',                  // group (logical bucket)
            true                         // unique in modern Action Scheduler
        );
    } elseif ( ! as_next_scheduled_action( 'myplugin_daily_cleanup', array(), 'myplugin' ) ) {
        as_schedule_recurring_action(
            time() + DAY_IN_SECONDS,
            DAY_IN_SECONDS,
            'myplugin_daily_cleanup',
            array(),
            'myplugin'
        );
    }
} else {
    // Fall back to native WP cron.
    if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
        wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
    }
}
```

The corresponding clear:

```php
if ( function_exists( 'as_unschedule_all_actions' ) ) {
    as_unschedule_all_actions( 'myplugin_daily_cleanup', array(), 'myplugin' );
} else {
    wp_unschedule_hook( 'myplugin_daily_cleanup' );
}
```

For one-shot deferred work, the parallel pair is `as_schedule_single_action()` / `wp_schedule_single_event()`. Modern Action Scheduler's `$unique` flag handles hook+group singleton de-duplication explicitly; per-entity jobs should use exact-args guards plus idempotent callbacks.

The cost of Action Scheduler: it's a hard dependency. For a small plugin with 1-2 daily events on a low-traffic site, native WP cron is fine. Don't pull in WooCommerce or vendor Action Scheduler for a single hourly cleanup.

## Long-running work and idempotency

Cron callbacks run inline. A 60-second `daily_cleanup` ties up the whole cron batch for that minute. Two patterns to avoid blocking:

- **Chunk and re-schedule**: process N rows, then `wp_schedule_single_event( time() + 1, 'myplugin_daily_cleanup' )` if more remain.
- **Defer per-item to single events**: `wp_schedule_single_event( time(), 'myplugin_process_item', array( $id ) )` per row. Parallelizes well with Action Scheduler; overkill for native WP cron.

Even with `wp_next_scheduled` guards at schedule time, the **callback must be idempotent** — manual triggers (`spawn_cron`), restored backups, WP-CLI `wp cron event run`, and Action Scheduler retries can all replay events. Two minimal patterns:

```php
// Gate by data state — preferred when the work is per-entity.
add_action( 'myplugin_send_invoice', static function ( int $order_id ): void {
    if ( get_post_meta( $order_id, '_invoice_sent', true ) ) return;
    myplugin_send( $order_id );
    update_post_meta( $order_id, '_invoice_sent', time() );
} );

// Soft lock + last-success gate — for global periodic jobs.
add_action( 'myplugin_daily_cleanup', static function (): void {
    $last = (int) get_option( 'myplugin_cleanup_last_success', 0 );
    if ( time() - $last < HOUR_IN_SECONDS ) return;

    if ( get_transient( 'myplugin_cleanup_lock' ) ) return;
    set_transient( 'myplugin_cleanup_lock', 1, 15 * MINUTE_IN_SECONDS );

    try {
        myplugin_run_cleanup();
        update_option( 'myplugin_cleanup_last_success', time(), false );
    } finally {
        delete_transient( 'myplugin_cleanup_lock' );
    }
} );
```

The transient lock and `get_option`+`update_option` pattern is non-atomic (TOCTOU race) but good enough for soft idempotency. For a global singleton, modern Action Scheduler's `$unique` support can help; for per-entity hard idempotency, use a unique-key insert into a custom table as the gate.

## Critical rules

- **WP cron is pseudo-cron.** WordPress calls `wp_cron()` on `init`; since WP 6.9 the normal spawn runs on `shutdown` (`wp_loaded` for `ALTERNATE_WP_CRON`). No traffic = no cron. Use `DISABLE_WP_CRON` + system cron for timing-critical work.
- **Always guard schedule with `wp_next_scheduled`** to prevent duplicate events on reactivation.
- **Check scheduling failures** for custom intervals or important jobs by passing `$wp_error=true`.
- **Always pair schedule (activation) with clear (deactivation)** using `wp_unschedule_hook` (since WP 4.9, hook+args agnostic).
- **Custom intervals via `cron_schedules` filter** — return an array with `interval` (seconds) + `display` (label).
- **Cron is per-blog in multisite** — schedule per-site if the work is per-site.
- **Make callbacks idempotent.** Data-state check, soft lock, or `last_success` timestamp gate.
- **Long-running work goes in chunks** (re-schedule a single event after a batch) — don't block the worker.
- **Graduate to Action Scheduler** when you need queue semantics: 10k+ actions, status tracking, retry, duplicate guards, admin UI. Don't pull it in for one-off uses.

## Common mistakes

```php
// WRONG — duplicate events on every reactivation
register_activation_hook( __FILE__, function () {
    wp_schedule_event( time(), 'daily', 'myplugin_cleanup' );
} );

// WRONG — args mismatch, deactivation fails to clear the event
register_activation_hook( __FILE__, function () {
    wp_schedule_event( time(), 'daily', 'myplugin_cleanup', array( 'mode' => 'fast' ) );
} );
register_deactivation_hook( __FILE__, function () {
    wp_clear_scheduled_hook( 'myplugin_cleanup' ); // missing args
} );
// Use wp_unschedule_hook instead.

// WRONG — assumes cron fires at the registered time
wp_schedule_event( time() + 60, 'hourly', 'myplugin_send_invoices_at_4pm' );
// On a low-traffic site this might run at 5:13 PM, 6:48 PM, 9:02 PM...

// WRONG — non-idempotent callback fires twice on retry
add_action( 'myplugin_charge_card', function ( $order_id ) {
    stripe_charge( $order_id ); // bills user twice on retry
} );

// RIGHT — gate by data state
add_action( 'myplugin_charge_card', function ( $order_id ) {
    if ( get_post_meta( $order_id, '_charged', true ) ) return;
    stripe_charge( $order_id );
    update_post_meta( $order_id, '_charged', time() );
} );

// WRONG — registering 10,000 actions in wp-cron
foreach ( $orders as $order ) {
    wp_schedule_single_event( time(), 'myplugin_process', array( $order->id ) );
}
// 10k events bloats the autoloaded 'cron' option; site grinds.
// Use Action Scheduler for this scale.
```

## Cross-references

- Run **`wp-plugin-lifecycle`** for the activation-schedule / deactivation-clear pattern in full lifecycle context — including multisite-aware `$network_wide` callback args.
- Run **`wp-plugin-options-storage`** for the warning about the autoloaded `cron` option — at scale (10k+ events) it becomes the autoload bottleneck.
- Run **`wp-security-audit`** on cron callbacks — they run with no current user, so capability checks based on a "logged in user" don't work. Treat persisted args / IDs as untrusted input.
- Run **`wp-action-scheduler`** once the design graduates to Action Scheduler — this skill only covers the decision point and minimal fallback pattern.

## What this skill does NOT cover

- Action Scheduler internal architecture, queue tables, runner process, WP-CLI commands, and 3.9.x API details — covered by `wp-action-scheduler`.
- WP-CLI cron commands (`wp cron event list`, `wp cron event run`, `wp cron schedule list`) — adjacent topic, useful for debugging but separate skill scope.
- External queue systems (Redis Queue, AWS SQS, Beanstalkd) integrated into WP — viable for ultra-high-throughput plugins but out of WP-native scope.
- Server-side cron daemon configuration.

## References

- WP Cron Handbook: [developer.wordpress.org/plugins/cron/](https://developer.wordpress.org/plugins/cron/)
- `wp_schedule_event` / `wp_schedule_single_event` / `wp_next_scheduled` / `wp_unschedule_hook`: `wp-includes/cron.php`
- `cron_schedules` filter: [developer.wordpress.org/reference/hooks/cron_schedules/](https://developer.wordpress.org/reference/hooks/cron_schedules/)
- WP 6.9 cron change (`_wp_cron` moved to `shutdown`): `wp-includes/cron.php` `wp_cron()` docblock
- Action Scheduler: [actionscheduler.org](https://actionscheduler.org), [bundled in WooCommerce](https://github.com/woocommerce/action-scheduler)
