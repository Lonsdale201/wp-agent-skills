# Isolated uninstall and multisite cleanup

## Standalone uninstall pattern

`uninstall.php` runs with WordPress loaded but without the plugin's main file:

```php
<?php

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

function myplugin_cleanup_site_data(): void {
    global $wpdb;

    delete_option( 'myplugin_settings' );
    delete_option( 'myplugin_version' );
    delete_metadata( 'user', 0, 'myplugin_dismissed_notice', '', true );

    $post_ids = get_posts(
        array(
            'post_type'      => 'myplugin_log',
            'posts_per_page' => -1,
            'fields'         => 'ids',
            'post_status'    => 'any',
        )
    );
    foreach ( $post_ids as $post_id ) {
        wp_delete_post( $post_id, true );
    }

    // Controlled identifier derived only from WordPress's table prefix.
    $table = $wpdb->prefix . 'myplugin_log';
    $wpdb->query( "DROP TABLE IF EXISTS `{$table}`" );

    wp_unschedule_hook( 'myplugin_daily_cleanup' );
    wp_unschedule_hook( 'myplugin_token_refresh' );

    foreach ( array_keys( wp_roles()->roles ) as $role_slug ) {
        $role = get_role( $role_slug );
        if ( $role ) {
            $role->remove_cap( 'manage_myplugin' );
        }
    }
}
```

When deleting dynamic transient names with SQL, escape `LIKE` wildcards and
prepare the patterns. Do not copy a raw prefix into interpolated query text:

```php
$value_pattern   = $wpdb->esc_like( '_transient_myplugin_' ) . '%';
$timeout_pattern = $wpdb->esc_like( '_transient_timeout_myplugin_' ) . '%';

$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
        $value_pattern,
        $timeout_pattern
    )
);
```

## Preserve-data policy

Read a per-site preserve toggle after switching into that site. Store a truly
network-wide policy in a site option and read it once before looping. Make the
choice explicit in product UI; do not silently preserve half the schema.

```php
if ( is_multisite() ) {
    foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $site_id ) {
        switch_to_blog( $site_id );

        $options = (array) get_option( 'myplugin_settings', array() );
        if ( empty( $options['preserve_data_on_uninstall'] ) ) {
            myplugin_cleanup_site_data();
        }

        restore_current_blog();
    }

    delete_site_option( 'myplugin_network_settings' );
} else {
    $options = (array) get_option( 'myplugin_settings', array() );
    if ( empty( $options['preserve_data_on_uninstall'] ) ) {
        myplugin_cleanup_site_data();
    }
}
```

Large networks need an operationally bounded deletion design; an unbounded
site loop can time out. Document whether deletion is synchronous, resumable,
or intentionally requires an administrator/CLI batch before removing files.

## Review failures

- `update_option()` in activation overwrites saved preferences on reactivation;
  seed with `add_option()`.
- `wp_clear_scheduled_hook( $hook, $wrong_args )` leaves other scheduled
  argument variants; use `wp_unschedule_hook( $hook )` when all belong to the
  plugin.
- Namespaced plugin classes are unavailable unless `uninstall.php` explicitly
  loads a dependency-free file. Do not bootstrap the entire plugin to delete it.
- `register_uninstall_hook()` requires a static callable and reloads the plugin
  file during uninstall. Prefer the isolated file for non-trivial cleanup.
- Deactivation must not delete user data. It is reversible pause, not removal.
- A single-site `delete_option()` does not clean other blogs in a network.
- User tables/meta are shared across multisite; do not repeat shared-user
  deletion blindly for every site.
