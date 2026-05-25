---
name: wp-filesystem-api
description: Read, write, copy, delete, chmod files from a WordPress
  plugin via the `WP_Filesystem` abstraction instead of bare PHP. Covers
  the bootstrap (`require_once ABSPATH . 'wp-admin/includes/file.php'`
  → `request_filesystem_credentials()` → `WP_Filesystem()` →
  `$wp_filesystem->*` methods), the four transports (direct, ssh2,
  ftpext, ftpsockets) selected by `get_filesystem_method()`, the
  `FS_METHOD` / `FS_CHMOD_FILE` / `FS_CHMOD_DIR` constants, the
  credentials form flow, and when to use `wp_handle_upload()` /
  `wp_upload_dir()` instead. Use for plugin writes outside
  `wp-content/uploads`, generated CSS/cache files outside uploads, log
  output, bundled-asset extraction, and any FS op that must work on
  FTP-only shared hosts.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0"
php-min: "7.4"
last-updated: "2026-05-24"
docs:
  - https://developer.wordpress.org/reference/classes/wp_filesystem_base/
  - https://developer.wordpress.org/reference/functions/wp_filesystem/
  - https://developer.wordpress.org/reference/functions/request_filesystem_credentials/
  - https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
---

# WordPress Filesystem API

WP abstracts filesystem access because on shared hosts the web user often can't write plugin/theme/core paths directly — FTP/SSH credentials are required. `WP_Filesystem` picks the right transport (`direct` when PHP can write as the file owner, otherwise `ssh2` / `ftpext` / `ftpsockets`) and exposes a uniform method set. Plugins that call `file_put_contents()` directly outside writable uploads fail on those hosts; plugins that use `WP_Filesystem` work across more hosting setups.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin needs to write files outside `wp-content/uploads/` — generated CSS, bundled asset extraction, log files, exported reports, cache, mu-plugins install.
- Code references `WP_Filesystem`, `request_filesystem_credentials`, `get_filesystem_method`, `FS_METHOD`, `FS_CHMOD_FILE`, `FS_CHMOD_DIR`, `$wp_filesystem`, `WP_Filesystem_Direct`, `WP_Filesystem_SSH2`, `WP_Filesystem_FTPext`, `WP_Filesystem_ftpsockets`.
- Code uses `file_put_contents` / `fwrite` / `fopen` / `unlink` / `mkdir` / `rmdir` for plugin-owned files outside uploads.
- The user reports: "works on my localhost, fails on the shared host", "the file doesn't write", "users see an FTP prompt out of nowhere".

## The bootstrap — five lines, in this exact order

```php
// 1. Load the API. NOT autoloaded.
require_once ABSPATH . 'wp-admin/includes/file.php';

// 2. Request creds (returns true for direct, an array for FTP/SSH, false if form was shown).
$creds = request_filesystem_credentials( $form_url, '', false, $context );
if ( false === $creds ) {
    return; // Form was rendered; wait for the next request.
}

// 3. Initialize (returns true|false|null).
if ( ! WP_Filesystem( $creds, $context ) ) {
    // Bad creds — re-render the form with an error.
    request_filesystem_credentials( $form_url, '', true, $context );
    return;
}

// 4. Use the global instance.
global $wp_filesystem;
$wp_filesystem->put_contents( $context . '/generated.css', $css, FS_CHMOD_FILE );
```

The `$context` arg is "a directory you're about to write to" — `wp-admin/includes/file.php:2364`. It controls writability detection (`get_filesystem_method` writes a temp file there to confirm permissions) and determines whether `direct` is safe.

## What `request_filesystem_credentials()` returns

Verified at `wp-admin/includes/file.php:2364-2393`:

| Return | Meaning | What you do |
|---|---|---|
| `true` | No credentials needed — `direct` available on this host | Proceed to `WP_Filesystem()` |
| `array` | User entered FTP/SSH credentials | Pass to `WP_Filesystem( $creds )` |
| `false` | Form was rendered AND no submission yet | `return` — wait for the form post |

The function ALSO ECHOES the form when no creds are present and `$_POST` is empty. Don't render your own output before calling it on an admin POST handler — the form must reach the screen.

## The four transports

`get_filesystem_method()` (`file.php:2260`) picks in this order:

| Priority | Method | Condition |
|---|---|---|
| 1 | `direct` | PHP can write as the same owner as WP files (or `$allow_relaxed_file_ownership` set + dir already writable) |
| 2 | `ssh2` | PHP `ssh2` extension loaded AND user picked SSH in the form |
| 3 | `ftpext` | PHP `ftp` extension loaded |
| 4 | `ftpsockets` | PHP `sockets` extension OR `fsockopen()` available |

Force a specific method in `wp-config.php`:

```php
define( 'FS_METHOD', 'direct' );      // skip the credentials prompt
```

Defaults set on first successful `WP_Filesystem()` call (`file.php:2208-2228`):

- `FS_CONNECT_TIMEOUT = 30`
- `FS_TIMEOUT = 30`
- `FS_CHMOD_DIR  = (fileperms(ABSPATH) & 0777) | 0755`
- `FS_CHMOD_FILE = (fileperms(ABSPATH . 'index.php') & 0777) | 0644`

Always pass `FS_CHMOD_FILE` / `FS_CHMOD_DIR` to write/mkdir operations so permissions match WP's own.

## The methods you'll actually use

From `WP_Filesystem_Base` (`wp-admin/includes/class-wp-filesystem-base.php`):

```php
global $wp_filesystem;

// Read.
$wp_filesystem->exists( $path );                  // bool
$wp_filesystem->is_file( $path );                 // bool
$wp_filesystem->is_dir( $path );                  // bool
$wp_filesystem->is_readable( $path );             // bool
$wp_filesystem->is_writable( $path );             // bool
$wp_filesystem->size( $path );                    // int bytes
$wp_filesystem->mtime( $path );                   // int unix ts
$wp_filesystem->get_contents( $path );            // string|false
$wp_filesystem->get_contents_array( $path );      // array|false (one line per element)
$wp_filesystem->dirlist( $path, $hidden = true, $recursive = false );

// Write.
$wp_filesystem->put_contents( $path, $content, FS_CHMOD_FILE );  // bool
$wp_filesystem->touch( $path );                                  // bool
$wp_filesystem->mkdir( $path, FS_CHMOD_DIR );                    // bool
$wp_filesystem->chmod( $path, $mode, $recursive = false );       // bool
$wp_filesystem->copy( $source, $dest, $overwrite = false, FS_CHMOD_FILE );
$wp_filesystem->move( $source, $dest, $overwrite = false );

// Delete.
$wp_filesystem->delete( $path, $recursive = false, $type = false );  // $type: 'f' | 'd' | false
$wp_filesystem->rmdir( $path, $recursive = false );
```

`put_contents` returns `true` on success — always check.

## When NOT to use `WP_Filesystem`

| Need | Right tool |
|---|---|
| Writing a user-uploaded file to `wp-content/uploads/` | `wp_handle_upload()` or `media_handle_upload()` (`wp-admin/includes/file.php:1097`) |
| Reading any existing file (where you don't need write capability) | Plain PHP `file_get_contents()` is fine — read access doesn't need FS abstraction |
| Touching a file in `wp-content/uploads/` that you JUST got back from `wp_handle_upload` | Plain PHP — uploads dir is by definition writable as web user (otherwise `wp_handle_upload` would have failed) |
| Anything in PHP `tempnam()` / `sys_get_temp_dir()` | Plain PHP |

`WP_Filesystem` is overkill for `wp-content/uploads`. It's the right tool for `wp-content/`, `wp-content/plugins/<self>/cache/`, `wp-content/mu-plugins/`, or anywhere ELSE that needs the credentials dance on restricted hosts.

## Pattern: write generated CSS into uploads on settings save

```php
add_action( 'update_option_myplugin_options', static function ( $old, $new ): void {
    if ( $old === $new ) {
        return;
    }

    $upload  = wp_upload_dir();
    $dir     = $upload['basedir'] . '/myplugin';
    $file    = $dir . '/style.css';
    $css     = ':root { --brand: ' . sanitize_hex_color( $new['brand_color'] ?? '#000' ) . '; }';

    if ( ! empty( $upload['error'] ) ) {
        return;
    }

    if ( ! wp_mkdir_p( $dir ) ) {
        return;
    }

    if ( false === file_put_contents( $file, $css, LOCK_EX ) ) {
        return;
    }
}, 10, 2 );
```

This is intentionally plain PHP: `wp-content/uploads` is web-user-writable or `wp_upload_dir()` / `wp_mkdir_p()` fails. Use `WP_Filesystem` when writing outside uploads, where an admin page can show the credentials form.

## Pattern: read a JSON config the plugin ships

For READING bundled assets, just use PHP — no credentials needed:

```php
$config = json_decode( file_get_contents( MYPLUGIN_DIR . '/config/defaults.json' ), true );
```

`WP_Filesystem` for reads is unnecessary indirection. The abstraction exists for WRITES on hosts where the web user lacks privileges.

## Critical rules

- **`require_once ABSPATH . 'wp-admin/includes/file.php'`** before any of the API. Not autoloaded. Frontend, REST, and cron contexts don't include it.
- **Always pass `FS_CHMOD_FILE` / `FS_CHMOD_DIR`** to `put_contents` / `mkdir` / `copy`. Skipping them means permissions are left to whatever the transport's defaults are — often too-open on direct, too-locked on FTP.
- **Pass the same `$context` to `request_filesystem_credentials()` and `WP_Filesystem()`**. Calling `WP_Filesystem()` with no context defaults detection to `WP_CONTENT_DIR`, which can be wrong when you're targeting a deeper plugin/cache directory.
- **`request_filesystem_credentials()` ECHOES a form when no creds are stored**. Don't call it from a page that's already streamed HTML, and don't call it from REST / AJAX — it's not designed for those contexts.
- **`WP_Filesystem` is admin-only by design**. The credentials prompt makes no sense in cron or REST. If a cron task needs FS writes, gate writes on `direct` being available (`'direct' === get_filesystem_method()`).
- **Don't reach for `WP_Filesystem` to write inside `wp-content/uploads`** — `wp_handle_upload` or plain PHP suffices. Reserve it for paths that might NOT be web-user-writable.
- **`$wp_filesystem->delete( $path )` does NOT recurse by default**. Pass `$recursive = true` when deleting non-empty directories, and pass `$type` (`'f'` or `'d'`) when the type is known — saves a stat call.
- **`FS_METHOD = 'direct'` in `wp-config.php` is the standard "this host is fine, skip the form" override**. Recommend it in your docs for users who report seeing FTP prompts. Don't define it from your plugin — that's the host operator's call.
- **Don't store FTP credentials**. WP intentionally does NOT persist the password — the user re-enters it each session. Don't add your own "save FTP password" UI.

## Common AI mistakes

```php
// WRONG — fails on hosts where web user != file owner
file_put_contents( WP_CONTENT_DIR . '/myplugin-cache.json', $data );

// RIGHT — on an admin page, request creds, then initialize WP_Filesystem
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
$wp_filesystem->put_contents( WP_CONTENT_DIR . '/myplugin-cache.json', $data, FS_CHMOD_FILE );
```

```php
// WRONG — credentials form leaks into REST / AJAX response
add_action( 'rest_api_init', static function (): void {
    register_rest_route( 'myplugin/v1', '/clear-cache', array(
        'callback' => static function () {
            request_filesystem_credentials( '' );        // echoes <form>; corrupts JSON response
            // ...
        }
    ) );
} );

// RIGHT — only request creds in admin page contexts; gate by transport availability elsewhere
require_once ABSPATH . 'wp-admin/includes/file.php';
if ( 'direct' !== get_filesystem_method() ) {
    return new WP_Error( 'fs_unavailable', 'Server requires admin filesystem access.' );
}
if ( ! WP_Filesystem() ) {
    return new WP_Error( 'fs_unavailable', 'Filesystem initialization failed.' );
}
```

```php
// WRONG — overkill for an upload coming out of wp_handle_upload (it's already in writable uploads/)
require_once ABSPATH . 'wp-admin/includes/file.php';
WP_Filesystem();
$wp_filesystem->put_contents( $uploaded['file'], $modified );

// RIGHT — uploads/ is web-user-writable by definition
file_put_contents( $uploaded['file'], $modified );
```

```php
// WRONG — no chmod; permission set by transport defaults
$wp_filesystem->put_contents( $path, $data );

// RIGHT — match WP's own permission convention
$wp_filesystem->put_contents( $path, $data, FS_CHMOD_FILE );
```

## Cross-references

- See **`wp-plugin-options-storage`** for storing config — most "I need to write a file" needs are better served by an option / transient.
- See **`wp-security-deep`** for path traversal checks (`realpath()`, `wp_normalize_path()`) — `WP_Filesystem` doesn't validate paths for you.
- See **`wp-plugin-cron`** when an FS-touching task moves to background — note the `'direct'` requirement.

## What this skill does NOT cover

- WP's update / upgrader APIs (`WP_Upgrader`, `Plugin_Upgrader`, `Theme_Upgrader`) which use `WP_Filesystem` internally. Different abstraction layer for the install/update flow.
- WP-CLI's `\WP_CLI\Utils\http_request` for downloading files. WP-CLI commands typically use plain PHP for FS — see the `wp-cli-extending` skill.
- The `wp-content/uploads/` upload pipeline (`wp_handle_upload`, `media_handle_upload`, `wp_handle_sideload`). Adjacent topic — different bootstrap.

## References

- `wp-admin/includes/file.php:2169` — `WP_Filesystem()` initializer (sets `$wp_filesystem` global, defines FS_CHMOD_* constants).
- `wp-admin/includes/file.php:2260` — `get_filesystem_method()` with the transport priority and writability detection.
- `wp-admin/includes/file.php:2364` — `request_filesystem_credentials()` (returns `true|false|array`, echoes form when needed).
- `wp-admin/includes/class-wp-filesystem-base.php` — the base class method surface (lines 487-861 cover the public methods listed above).
- `wp-admin/includes/file.php:1097` — `wp_handle_upload()` for the uploads/ pipeline.
