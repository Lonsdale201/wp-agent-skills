# WP Filesystem patterns and mistakes

## Write generated CSS into uploads

The ordinary uploads directory normally uses its own pipeline rather than the
interactive credentials abstraction:

```php
add_action( 'update_option_myplugin_options', static function ( $old, $new ): void {
    if ( $old === $new ) {
        return;
    }

    $upload = wp_upload_dir();
    $dir    = $upload['basedir'] . '/myplugin';
    $file   = $dir . '/style.css';
    $css    = ':root { --brand: ' . sanitize_hex_color( $new['brand_color'] ?? '#000' ) . '; }';

    if ( ! empty( $upload['error'] ) || ! wp_mkdir_p( $dir ) ) {
        return;
    }

    if ( false === file_put_contents( $file, $css, LOCK_EX ) ) {
        return;
    }
}, 10, 2 );
```

Every directory/write result is checked. Object-storage or stream-wrapper
plugins can alter the upload lifecycle, so do not assume a permanent local file
after third-party offload hooks run.

## Read a bundled JSON file

Reading a file shipped inside the plugin does not need write credentials:

```php
$json = file_get_contents( MYPLUGIN_DIR . '/config/defaults.json' );
if ( false === $json ) {
    return new WP_Error( 'myplugin_config_read', 'Config is not readable.' );
}

$config = json_decode( $json, true, 32, JSON_THROW_ON_ERROR );
```

Use a compatible non-throwing JSON error path when the plugin supports PHP
versions where that design is not appropriate.

## Admin-interactive write outside uploads

```php
require_once ABSPATH . 'wp-admin/includes/file.php';

$form_url = wp_nonce_url( admin_url( 'admin.php?page=myplugin' ), 'myplugin_write_cache' );
$context  = WP_CONTENT_DIR;
$creds    = request_filesystem_credentials( $form_url, '', false, $context );

if ( false === $creds ) {
    return;
}

if ( ! WP_Filesystem( $creds, $context ) ) {
    request_filesystem_credentials( $form_url, '', true, $context );
    return;
}

global $wp_filesystem;
$remote_content = $wp_filesystem->wp_content_dir();
if ( ! $remote_content
    || ! $wp_filesystem->put_contents(
        trailingslashit( $remote_content ) . 'myplugin-cache.json',
        $data,
        FS_CHMOD_FILE
    ) ) {
    return;
}
```

Do not replace this with `file_put_contents( WP_CONTENT_DIR . ... )`; that fails
where the web user and file owner differ.

## REST, AJAX, cron, and CLI

Never call `request_filesystem_credentials()` in a REST/AJAX response or a
background process. It can echo an HTML form and cannot complete interactively.
In a non-interactive context, either use already-provisioned trusted host
credentials, require the direct method, or fail cleanly:

```php
require_once ABSPATH . 'wp-admin/includes/file.php';

if ( 'direct' !== get_filesystem_method() ) {
    return new WP_Error( 'fs_unavailable', 'Server requires admin filesystem access.' );
}

if ( ! WP_Filesystem() ) {
    return new WP_Error( 'fs_unavailable', 'Filesystem initialization failed.' );
}
```

Do not turn `FS_METHOD=direct` into a plugin recommendation. Host ownership and
permissions determine whether that override is safe.
