---
name: wp-plugin-lifecycle
description: Designs and reviews the three lifecycle events of a WordPress
  plugin — activation (one-shot setup, dbDelta, add_option seeding, cron
  schedule, cap seeding), deactivation (reversible cleanup, cron clear
  via wp_unschedule_hook, never delete user data), and uninstall.php
  (standalone file, WP_UNINSTALL_PLUGIN guard, no autoloader, full
  data removal). Multisite-aware patterns using the $network_wide /
  $network_deactivating callback args, plus the recommendation
  against register_uninstall_hook in favor of uninstall.php. Use when
  scaffolding a plugin or debugging ghost cron events / orphan options.
  Triggers on register_activation_hook, register_deactivation_hook,
  uninstall.php, WP_UNINSTALL_PLUGIN, dbDelta, wp_unschedule_hook,
  switch_to_blog.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.5 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/plugins/plugin-basics/uninstall-methods/
  - https://developer.wordpress.org/reference/functions/register_activation_hook/
  - https://developer.wordpress.org/reference/functions/register_deactivation_hook/
  - https://developer.wordpress.org/reference/functions/wp_unschedule_hook/
  - https://developer.wordpress.org/reference/functions/dbDelta/
---

# WordPress plugin: lifecycle (activate / deactivate / uninstall)

The three events that frame a plugin's existence on a site. Each has a different scope, different runtime context, and different non-negotiable rules. Get the contract wrong and you ship plugins that:

- Activate "successfully" but leave the site in a broken state.
- Leave behind cron events that fire forever after deactivation.
- Leave 50 orphan options + 100k orphan meta rows after uninstall.

This skill assumes the plugin already has a clean bootstrap (see `wp-plugin-bootstrap`). It covers ONLY what happens at the three lifecycle boundaries.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a new plugin and writing the activation / deactivation / uninstall logic.
- Reviewing a PR that touches `register_activation_hook`, `register_deactivation_hook`, or `uninstall.php`.
- Debugging "ghost cron events still firing after my plugin is deactivated", or "I deleted the plugin but options are still in `wp_options`".
- Adding a "Preserve data on uninstall" toggle / a clean removal toggle for site owners.
- Adapting an existing plugin to be multisite-aware (per-site activation, network-wide uninstall).

The diff or file most likely contains: `register_activation_hook`, `register_deactivation_hook`, `register_uninstall_hook` (anti-pattern, see below), `uninstall.php`, `WP_UNINSTALL_PLUGIN`, `dbDelta`, `wp_unschedule_hook`, `wp_clear_scheduled_hook`, `delete_option`, `delete_site_option`, or `switch_to_blog`.

## The three events at a glance

| Event | Hook / file | When it fires | Runtime context |
|---|---|---|---|
| **Activate** | `register_activation_hook( __FILE__, $cb )` → `activate_<basename>` | User clicks "Activate" in `/wp-admin/plugins.php`. Also re-fires on reactivation. NOT on plugin update. | Full WP loaded, user logged in, plugin's main file already loaded. Classes via autoloader available. |
| **Deactivate** | `register_deactivation_hook( __FILE__, $cb )` → `deactivate_<basename>` | User clicks "Deactivate". | Full WP loaded, plugin loaded. |
| **Uninstall** | `uninstall.php` at plugin root | User clicks "Delete" on a deactivated plugin. | Full WP loaded, BUT plugin's main file NOT loaded — `uninstall.php` runs in isolation with only the WP API available. `WP_UNINSTALL_PLUGIN` constant is defined ([wp-admin/includes/plugin.php:1324](wp-admin/includes/plugin.php)). |

That third row is the unintuitive one. WP includes `uninstall.php` at the top of `uninstall_plugin()` — your namespaced classes, your `Plugin::instance()`, your composer autoload — none of it is loaded. Only the WP global functions and the `$wpdb` global are available.

## Activation — one-shot setup

```php
register_activation_hook( __FILE__, static function (): void {
    // 1. Requirements re-check (the bootstrap-time check may have been bypassed
    //    by direct DB activation). Bail loud if anything is missing.
    if ( ! function_exists( 'jet_form_builder' ) ) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        deactivate_plugins( plugin_basename( __FILE__ ) );
        wp_die( esc_html( 'JetFormBuilder must be active.' ), '', array( 'back_link' => true ) );
    }

    // 2. Seed default options — add_option respects existing values, so
    //    reactivation after a deactivate-without-uninstall preserves user
    //    preferences. NEVER use update_option here.
    add_option( 'myplugin_settings', array(
        'log_level'   => 'errors',
        'cache_ttl'   => 3600,
    ) );

    // 3. Schema migration via dbDelta. Note the explicit require_once —
    //    dbDelta is in wp-admin/includes/upgrade.php, NOT loaded by default.
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    // dbDelta is finicky — follow the canonical style EXACTLY:
    //   - one column per line, two spaces after column name
    //   - PRIMARY KEY on its own line at the end
    //   - lowercase types ('bigint(20)', 'datetime'), as WP itself uses
    //   - no IF NOT EXISTS (dbDelta diff-applies)
    dbDelta( "CREATE TABLE {$wpdb->prefix}myplugin_log (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        created_at datetime NOT NULL,
        message text NOT NULL,
        PRIMARY KEY  (id),
        KEY created_at (created_at)
    ) {$charset};" );

    // 4. Schedule recurring cron events (the schedule constant must already
    //    be registered on the 'cron_schedules' filter in your runtime code).
    if ( ! wp_next_scheduled( 'myplugin_daily_cleanup' ) ) {
        wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', 'myplugin_daily_cleanup' );
    }

    // 5. Capability seeding (only if you genuinely need plugin-specific caps).
    $editor = get_role( 'editor' );
    if ( $editor && ! $editor->has_cap( 'manage_myplugin' ) ) {
        $editor->add_cap( 'manage_myplugin' );
    }
} );
```

Rules for the activation callback:

- **Run the requirements check again.** The plugin file might have been activated through `activate_plugin()` programmatically, bypassing the wp-admin UI's pre-checks. Belt and suspenders.
- **Use `add_option`, NOT `update_option`** for default seeding. `update_option` overwrites existing values, destroying user preferences if the plugin is reactivated.
- **Always `require_once 'wp-admin/includes/upgrade.php'` before `dbDelta()`** — the file is not auto-loaded outside the admin context.
- **Don't register hooks** (`add_action`, `add_filter`) here. Activation is one-shot; runtime hooks belong in `plugins_loaded`.
- **Don't perform expensive work synchronously.** A long-running activation hook that blocks the request shows up as "site is taking too long to respond" in the admin. Schedule a one-shot cron event with `wp_schedule_single_event` instead.

### Activation in multisite

WP passes `$network_wide` as the **first argument** to your activation hook callback ([wp-admin/includes/plugin.php](wp-admin/includes/plugin.php), `do_action( "activate_{$plugin}", $network_wide )`). It's `true` if the user clicked "Network Activate", `false` (or unset on single-site) otherwise. Use this — don't reconstruct it from `is_network_admin()` or `is_plugin_active_for_network()`, both of which are less reliable in WP-CLI and during the activation event itself (the sitewide active option hasn't been written yet at the moment the hook fires).

```php
register_activation_hook( __FILE__, static function ( bool $network_wide = false ): void {
    if ( $network_wide ) {
        // Network activation: seed every site's per-site state.
        foreach ( get_sites( array( 'fields' => 'ids' ) ) as $site_id ) {
            switch_to_blog( $site_id );
            myplugin_setup_site();
            restore_current_blog();
        }
        // Plus any network-wide options.
        add_site_option( 'myplugin_network_settings', myplugin_network_defaults() );
    } else {
        myplugin_setup_site();
    }
} );
```

The same pattern applies to `register_deactivation_hook`, which receives `$network_deactivating`.

## Deactivation — reversible cleanup

```php
register_deactivation_hook( __FILE__, static function (): void {
    // Clear ALL scheduled events for our hooks, regardless of $args.
    // wp_unschedule_hook (since WP 4.9) is more robust than
    // wp_clear_scheduled_hook because it doesn't require remembering
    // the exact $args that were passed at schedule time.
    wp_unschedule_hook( 'myplugin_daily_cleanup' );
    wp_unschedule_hook( 'myplugin_token_refresh' );

    // OPTIONAL: clear active-state transients that are meaningless when
    // the plugin is off. Most TTL-bearing transients can self-expire.
    delete_transient( 'myplugin_api_status' );
} );
```

The hard rule: **deactivation is REVERSIBLE.** The user clicked "Deactivate", not "Delete". They might activate again tomorrow and expect their settings, custom tables, post meta, and capabilities to still be intact.

So the deactivate callback does:
- Clear cron events (otherwise WP keeps firing them; the hook has no listener but the cron table grows ghost entries).
- Clear active-state transients ("API is reachable", "license is valid this hour", etc.).
- Maybe clear flush rewrite rules if the plugin registered CPTs / custom rewrites.

It does NOT do:
- Delete options.
- Delete custom tables.
- Delete CPT posts or post meta.
- Remove capabilities. (Optional, gray area — see below.)

### Cron clearing in multisite

Cron is **per-blog** in multisite — each site has its own scheduled events. `wp_unschedule_hook` only affects the current blog. The deactivation callback receives `$network_deactivating` as its first argument; use it to decide whether to loop:

```php
register_deactivation_hook( __FILE__, static function ( bool $network_deactivating = false ): void {
    if ( $network_deactivating ) {
        foreach ( get_sites( array( 'fields' => 'ids' ) ) as $site_id ) {
            switch_to_blog( $site_id );
            wp_unschedule_hook( 'myplugin_daily_cleanup' );
            restore_current_blog();
        }
    } else {
        wp_unschedule_hook( 'myplugin_daily_cleanup' );
    }
} );
```

## Uninstall — full removal via `uninstall.php`

```php
<?php
// uninstall.php — at the plugin root.
//
// WP defines WP_UNINSTALL_PLUGIN before include_once'ing this file.
// Bail if it's missing — some misconfiguration is loading us directly.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

global $wpdb;

if ( is_multisite() ) {
    // For a network-wide preserve toggle, store + read it as a site option:
    //     get_site_option( 'myplugin_preserve_on_uninstall' )
    // For a per-site toggle, check INSIDE the loop after switch_to_blog().
    // Below we honor a per-site toggle so different sites can choose differently.
    foreach ( get_sites( array( 'fields' => 'ids' ) ) as $site_id ) {
        switch_to_blog( $site_id );

        $opts = (array) get_option( 'myplugin_settings', array() );
        if ( empty( $opts['preserve_data_on_uninstall'] ) ) {
            myplugin_cleanup_site_data( $wpdb );
        }

        restore_current_blog();
    }
    delete_site_option( 'myplugin_network_settings' );
} else {
    $opts = (array) get_option( 'myplugin_settings', array() );
    if ( empty( $opts['preserve_data_on_uninstall'] ) ) {
        myplugin_cleanup_site_data( $wpdb );
    }
}

function myplugin_cleanup_site_data( $wpdb ): void {
    // 1. Options
    delete_option( 'myplugin_settings' );
    delete_option( 'myplugin_version' );

    // 2. Per-user meta the plugin set
    delete_metadata( 'user', 0, 'myplugin_dismissed_notice', '', true );

    // 3. CPT posts + their meta (optional — destructive)
    $post_ids = get_posts( array(
        'post_type'      => 'myplugin_log',
        'posts_per_page' => -1,
        'fields'         => 'ids',
        'post_status'    => 'any',
    ) );
    foreach ( $post_ids as $post_id ) {
        wp_delete_post( $post_id, true );
    }

    // 4. Custom table
    $wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}myplugin_log" );

    // 5. Transients (pattern-delete, since names may include dynamic IDs)
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '\\_transient\\_myplugin\\_%'
            OR option_name LIKE '\\_transient\\_timeout\\_myplugin\\_%'"
    );

    // 6. Cron events
    wp_unschedule_hook( 'myplugin_daily_cleanup' );
    wp_unschedule_hook( 'myplugin_token_refresh' );

    // 7. Capabilities
    foreach ( wp_roles()->roles as $role_slug => $role_data ) {
        $role = get_role( $role_slug );
        if ( $role ) {
            $role->remove_cap( 'manage_myplugin' );
        }
    }
}
```

Constraints `uninstall.php` has to live with:

- **Plugin classes are NOT autoloaded.** The composer / spl_autoload_register in your bootstrap file is not running here. Don't `use MyPlugin\Schema;` or `MyPlugin\Plugin::instance()`. Either inline the meta key strings, or `require` your `Schema.php` constants file manually.
- **`WP_UNINSTALL_PLUGIN` is your guard.** WP defines it ([wp-admin/includes/plugin.php:1324](wp-admin/includes/plugin.php)). If it's not defined, bail — something's loading the file directly.
- **Be multisite-aware.** Single-site `delete_option` doesn't reach other sites. Wrap per-site cleanup in a `get_sites()` loop, and use `delete_site_option` for any network-level options.
- **Honor a `preserve_data_on_uninstall` toggle** if you offer one. Some users delete + reinstall to fix issues and want data preserved.
- **The "wp_options" table cleanup** for transients uses LIKE pattern matching with escaped underscores — `\\_transient\\_myplugin\\_%`. The escape (`\\_`) prevents `_` from being a single-char wildcard.

### `register_uninstall_hook` — explicitly avoid

WP itself recommends `uninstall.php` over `register_uninstall_hook` ([wp-includes/plugin.php docblock](wp-includes/plugin.php) for `register_uninstall_hook`):

> *"If the plugin can not be written without running code within the plugin, then the plugin should create a file named 'uninstall.php' in the base plugin folder. This file will be called, if it exists, during the uninstallation process."*

Reasons:
- `register_uninstall_hook` requires the callback to be a static function or function name (not a closure, not an instance method) — already a code-smell constraint.
- It also requires the plugin's main file to be `include`-ed at uninstall time, which means your bootstrap code runs during uninstall — fragile when classes might fail to autoload, dependencies might be inactive, etc.
- `uninstall.php` runs in isolation with only WP available, which is exactly what you want for a destructive cleanup.

## Critical rules

- **Activation is one-shot setup, NOT runtime configuration.** No `add_action` here.
- **Deactivation is REVERSIBLE.** Clear cron + active-state transients. Nothing destructive.
- **Uninstall is DESTRUCTIVE.** Clear everything the plugin owns, in `uninstall.php`, multisite-aware.
- **`uninstall.php` runs without your classes.** Use raw WP functions and inline strings (or manually `require` a constants file).
- **`wp_unschedule_hook($hook)` over `wp_clear_scheduled_hook($hook, $args)`** — args-mismatch means orphaned events. The former clears all events for a hook regardless of args (since WP 4.9, [wp-includes/cron.php](wp-includes/cron.php)).
- **`add_option` for activation seeding, never `update_option`** — preserves existing user preferences across reactivation.
- **`require_once 'wp-admin/includes/upgrade.php'` before any `dbDelta()` call.**
- **Multisite cron is per-blog; multisite options are per-site OR network-wide.** Use `delete_site_option` for network-level data, loop sites for per-site cleanup.
- **Offer a `preserve_data_on_uninstall` toggle.** Some users reinstall; uninstall ≠ "I want to lose everything".

## Common mistakes

```php
// WRONG — overwrites user's existing settings on reactivation
register_activation_hook( __FILE__, function () {
    update_option( 'myplugin_settings', $defaults );
} );

// WRONG — args mismatch leaves the cron event dangling
wp_clear_scheduled_hook( 'myplugin_cleanup', array( 'mode' => 'fast' ) );
// scheduled with array( 'mode' => 'aggressive' ) earlier — never matches

// WRONG — uninstall.php using plugin classes (autoloader not running)
require __DIR__ . '/uninstall.php';
use MyPlugin\Schema;          // fatal: class not found
delete_option( Schema::OPTION_KEY );

// WRONG — register_uninstall_hook to do anything non-trivial
register_uninstall_hook( __FILE__, array( 'MyPlugin\\Plugin', 'uninstall' ) );
// callback can't be a closure or instance method, plus the plugin main
// file gets re-included at uninstall time

// WRONG — deletes user data on deactivation
register_deactivation_hook( __FILE__, function () {
    delete_option( 'myplugin_settings' );  // user re-activates -> loses preferences
} );
```

## Cross-references

- Run **`wp-plugin-bootstrap`** first — it covers the main plugin file (header, constants, autoload, requirements check at activation entry).
- Run **`wp-security-audit`** on the activation handler — it's a write endpoint with admin context.
- Run **`wp-i18n-audit`** if the lifecycle handlers emit translated strings (admin notices, `wp_die` messages).

## What this skill does NOT cover

- Custom cron interval registration (`cron_schedules` filter), Action Scheduler integration — adjacent topic, separate skill (`wp-plugin-cron`, planned).
- Database schema migrations beyond the initial `dbDelta` — versioned migrations need their own pattern (track schema version in an option, run pending migrations on plugin update via `upgrader_process_complete`).
- WP-CLI `wp plugin activate` / `wp plugin deactivate` semantics — same hooks fire, but the multisite detection (`is_network_admin()`) is different.
- Theme uninstall — themes don't have a `uninstall.php` equivalent; theme cleanup is generally less mechanized.

## References

- Uninstall methods: [Plugin Handbook](https://developer.wordpress.org/plugins/plugin-basics/uninstall-methods/)
- `register_activation_hook` / `register_deactivation_hook` / `register_uninstall_hook`: [wp-includes/plugin.php](wp-includes/plugin.php)
- `uninstall_plugin()` (the function that includes `uninstall.php`): [wp-admin/includes/plugin.php:1302-1330](wp-admin/includes/plugin.php)
- `wp_unschedule_hook` (since 4.9): [wp-includes/cron.php](wp-includes/cron.php)
- `dbDelta`: [wp-admin/includes/upgrade.php](wp-admin/includes/upgrade.php)
- Multisite blog switching: [wp-includes/ms-blogs.php](wp-includes/ms-blogs.php)
