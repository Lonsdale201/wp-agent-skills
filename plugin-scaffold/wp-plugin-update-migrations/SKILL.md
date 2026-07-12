---
name: wp-plugin-update-migrations
description: >-
  Designs and reviews WordPress plugin update-time version
  migrations: stored schema/data version options, version_compare or
  integer schema versions, idempotent v1->v2->v3 migrators, dbDelta inside
  migrations, locks, partial reruns, multisite handling, and safe use of
  upgrader_process_complete. Use when code mentions plugin updates,
  upgrade migrations, schema version, database version, data migration,
  upgrader_process_complete, Plugin_Upgrader, dbDelta after activation,
  or when activation hooks are being used to handle updates.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-12"
docs:
  - https://developer.wordpress.org/reference/hooks/upgrader_process_complete/
  - https://developer.wordpress.org/reference/functions/dbDelta/
  - https://developer.wordpress.org/reference/functions/get_option/
source-refs:
  - wp-settings.php
  - wp-admin/update.php
  - wp-admin/includes/class-wp-upgrader.php
  - wp-admin/includes/class-plugin-upgrader.php
  - wp-admin/includes/plugin.php
  - wp-admin/includes/admin-filters.php
  - wp-admin/includes/upgrade.php
---

# WordPress plugin: update migrations

Use this for code that must change stored plugin data when the installed code version advances. This is not activation/deactivation/uninstall; use `wp-plugin-lifecycle` for those boundaries. Update migrations must be idempotent, stepwise, and safe to re-run after a partial failure.

## Why this is separate from activation

Activation does not fire on normal plugin update. WordPress also performs update internals in ways that make activation/deactivation hooks the wrong surface:

- `register_activation_hook()` runs when the plugin is activated or reactivated, not when files are replaced by an update.
- `Plugin_Upgrader::deactivate_plugin_before_upgrade()` silently deactivates active plugins in browser updates; silent deactivation prevents deactivation hooks from firing.
- Active plugins are loaded in `wp-settings.php` before `wp-admin/update.php` creates `Plugin_Upgrader`. An `upgrader_process_complete` callback registered by the plugin is usually old code already loaded in memory. Do not assume that callback can call new migration classes.
- Inactive plugins do not load, so their `upgrader_process_complete` callbacks are not registered at all.

The reliable pattern is: store a schema/data version in an option, compare it to the current code's schema version on normal plugin boot, and run missing steps with the new code loaded.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin has a custom table, stored option shape, meta key, CPT data shape, cache key format, capability name, or scheduled job format that changes between releases.
- Code says "run this on plugin update", "migrate from old version", "stored version < code version", "schema version", "DB version", or "upgrade routine".
- You see update work inside `register_activation_hook()` and it needs to run for existing active installs.
- Code hooks `upgrader_process_complete` and tries to run the full migration there.

## Core pattern

Use a separate schema/data version, not necessarily the plugin marketing version. An integer is easiest for ordered migrations:

```php
const MYPLUGIN_SCHEMA_VERSION = 3;
const MYPLUGIN_SCHEMA_OPTION  = 'myplugin_schema_version';
const MYPLUGIN_SOFT_LOCK_TRANSIENT = 'myplugin_migration_lock';

add_action( 'plugins_loaded', 'myplugin_maybe_run_migrations', 5 );

function myplugin_maybe_run_migrations(): void {
    if ( wp_installing() ) {
        return;
    }

    $stored = (int) get_option( MYPLUGIN_SCHEMA_OPTION, 0 );

    if ( $stored >= MYPLUGIN_SCHEMA_VERSION ) {
        return;
    }

    if ( get_transient( MYPLUGIN_SOFT_LOCK_TRANSIENT ) ) {
        return;
    }

    // Stampede reduction only; this get/set pair is not an atomic lock.
    set_transient( MYPLUGIN_SOFT_LOCK_TRANSIENT, 1, 5 * MINUTE_IN_SECONDS );

    try {
        myplugin_run_migrations( $stored );
    } finally {
        delete_transient( MYPLUGIN_SOFT_LOCK_TRANSIENT );
    }
}
```

Run ordered steps and write the version after each successful step:

```php
function myplugin_run_migrations( int $from ): void {
    if ( $from < 1 ) {
        myplugin_migrate_to_1();
        update_option( MYPLUGIN_SCHEMA_OPTION, 1, false );
        $from = 1;
    }

    if ( $from < 2 ) {
        myplugin_migrate_to_2();
        update_option( MYPLUGIN_SCHEMA_OPTION, 2, false );
        $from = 2;
    }

    if ( $from < 3 ) {
        myplugin_migrate_to_3();
        update_option( MYPLUGIN_SCHEMA_OPTION, 3, false );
    }
}
```

Each `myplugin_migrate_to_N()` must tolerate being re-run. Check before adding columns, options, caps, cron events, or meta transformations. Never set the stored version before the step succeeds.

The transient above reduces ordinary duplicate boot work; it does not provide
mutual exclusion because get-then-set is not atomic and transients can disappear.
Correctness must come from idempotent steps and advancing the version only after
success. If concurrent execution can corrupt data, use a custom-table unique
lease/insert or a deliberately managed database advisory lock. Do not substitute
`add_option()` as an assumed atomic gate: current core uses an
`ON DUPLICATE KEY UPDATE` statement, so that API is not a compare-and-set lock.
Apply `wp-batch-mutation-audit` to long-running or destructive migrations.

## dbDelta inside migrations

It is fine to call `dbDelta()` from a migration step, not only activation. Always load it explicitly:

```php
function myplugin_migrate_to_1(): void {
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    global $wpdb;

    $charset = $wpdb->get_charset_collate();

    dbDelta( "CREATE TABLE {$wpdb->prefix}myplugin_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        created_at datetime NOT NULL,
        message text NOT NULL,
        PRIMARY KEY  (id),
        KEY created_at (created_at)
    ) {$charset};" );
}
```

`dbDelta()` is idempotent for creating/updating many table definitions, but it is not a general data migration engine. Dropping columns, renaming columns, backfilling rows, changing serialized option shapes, or splitting one option into several needs explicit code and careful rerun guards.

## Semver plugin-version option

If you truly need to compare plugin release versions, use `version_compare()`, never string or numeric comparison:

```php
const MYPLUGIN_VERSION = '1.4.0';

$stored = (string) get_option( 'myplugin_version', '0.0.0' );

if ( version_compare( $stored, MYPLUGIN_VERSION, '<' ) ) {
    myplugin_maybe_run_migrations();
    update_option( 'myplugin_version', MYPLUGIN_VERSION, false );
}
```

Prefer the integer schema option for migration ordering and keep the semver option for diagnostics/support screens. A release can change PHP code without changing stored data; do not force a data migration for every plugin version bump.

## Safe use of `upgrader_process_complete`

Use `upgrader_process_complete` only as a hint, cache clear, or scheduler. Do not put the canonical migration logic only here.

Define `MYPLUGIN_FILE` as the absolute path to the main plugin file before using this pattern.

```php
add_action( 'upgrader_process_complete', static function ( $upgrader, array $extra ): void {
    if ( 'plugin' !== ( $extra['type'] ?? '' ) || 'update' !== ( $extra['action'] ?? '' ) ) {
        return;
    }

    $self    = plugin_basename( MYPLUGIN_FILE );
    $plugins = isset( $extra['plugins'] ) ? (array) $extra['plugins'] : array( $extra['plugin'] ?? '' );

    if ( ! in_array( $self, $plugins, true ) ) {
        return;
    }

    delete_transient( 'myplugin_runtime_schema_cache' );
    update_option( 'myplugin_update_detected_at', time(), false );
}, 10, 2 );
```

Guard for both shapes:

| Update mode | `$hook_extra` shape |
|---|---|
| Single plugin update | `type = plugin`, `action = update`, `plugin = vendor/plugin.php` |
| Bulk plugin update | `type = plugin`, `action = update`, `bulk = true`, `plugins = array(...)` |

Remember: for an active plugin, the callback may be old code; for an inactive plugin, it may not be registered. The normal boot-time version check is still required.

## Long-running migrations

Do not run a huge backfill synchronously on a frontend request. Split the migration:

- Run minimal schema creation/option-shape compatibility synchronously if current code cannot operate without it.
- Store progress in a non-autoload option such as `myplugin_migration_3_cursor`.
- Schedule a one-shot WP-Cron or Action Scheduler job for row backfills.
- Keep runtime code backward-compatible while the background migration is pending.
- Advance `MYPLUGIN_SCHEMA_OPTION` only when the step's required durable state is complete, or use a separate `myplugin_migration_3_status` if the step has an async phase.

## Multisite

Decide whether the version is per-site or network-wide:

| Data scope | Version option |
|---|---|
| Per-site tables/options/meta | `get_option( 'myplugin_schema_version' )` inside each blog |
| Network-wide table/site option | `get_site_option( 'myplugin_network_schema_version' )` |

For network-active plugins, the plugin loads in each site context, so a cheap per-site boot check can lazily migrate each site when it receives traffic/admin requests. Do not loop thousands of sites in a normal web request. For eager network migrations, use WP-CLI or a background queue that processes blog IDs in batches with `switch_to_blog()` and `restore_current_blog()`.

Activation after an inactive update should call the same migration runner. The activation hook can seed defaults and then call `myplugin_maybe_run_migrations()` or `myplugin_run_migrations( (int) get_option(...) )`; do not keep a second activation-only schema path.

## Common mistakes

```php
// WRONG: activation does not run on update for existing active installs.
register_activation_hook( __FILE__, 'myplugin_upgrade_database' );

// WRONG: string comparison treats "1.10.0" as lower than "1.2.0".
if ( get_option( 'myplugin_version' ) < '1.10.0' ) {
    myplugin_migrate();
}

// WRONG: sets version before the destructive/backfill work succeeds.
update_option( MYPLUGIN_SCHEMA_OPTION, MYPLUGIN_SCHEMA_VERSION, false );
myplugin_rewrite_all_rows();

// WRONG: full migration lives only in upgrader_process_complete.
add_action( 'upgrader_process_complete', 'myplugin_run_new_migration_code' );
```

## Cross-references

- Use `wp-plugin-lifecycle` for activation defaults, deactivation cleanup, uninstall deletion, and multisite activation/deactivation callbacks.
- Use `wp-plugin-options-storage` when deciding where to store schema version, migration progress, and large data.
- Use `wp-plugin-cron` or `wp-action-scheduler` for background/batched migration work.
