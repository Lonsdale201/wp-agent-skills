---
name: wp-filesystem-api
description: Read, write, copy, delete, chmod files from a WordPress
  plugin via the `WP_Filesystem` abstraction instead of bare PHP. Covers
  the bootstrap sequence from loading `wp-admin/includes/file.php` through
  `request_filesystem_credentials()` and `WP_Filesystem()` to filesystem
  method calls, the four transports (direct, ssh2,
  ftpext, ftpsockets) selected by `get_filesystem_method()`, the
  `FS_METHOD` / `FS_CHMOD_FILE` / `FS_CHMOD_DIR` constants, the
  credentials form flow, and when to use `wp_handle_upload()` /
  `wp_upload_dir()` instead. Use for plugin writes outside
  `wp-content/uploads`, generated CSS/cache files outside uploads, log
  output, bundled-asset extraction, and any FS op that must work on
  FTP-only shared hosts.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
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
$remote_context = $wp_filesystem->find_folder( $context );
if ( false === $remote_context ) {
    return;
}

if ( ! $wp_filesystem->put_contents(
    trailingslashit( $remote_context ) . 'generated.css',
    $css,
    FS_CHMOD_FILE
) ) {
    return;
}
```

The `$context` arg is a directory you are about to write to. It controls writability detection (`get_filesystem_method` writes a temp file there to confirm permissions) and determines whether `direct` is safe.

`$context` is a local WordPress path used for method detection. Filesystem
methods need paths in the selected transport's namespace. With `direct` they
look identical; with FTP/SSH they may not. Convert with `find_folder()` or use
base mappings such as `$wp_filesystem->wp_content_dir()`,
`wp_plugins_dir()`, or `abspath()` before appending a relative path.

## What `request_filesystem_credentials()` returns

Verified in `request_filesystem_credentials()` in `wp-admin/includes/file.php`:

| Return | Meaning | What you do |
|---|---|---|
| `true` | No credentials needed — `direct` available on this host | Proceed to `WP_Filesystem()` |
| `array` | User entered FTP/SSH credentials | Pass to `WP_Filesystem( $creds )` |
| `false` | Form was rendered AND no submission yet | `return` — wait for the form post |

The function ALSO ECHOES the form when no creds are present and `$_POST` is empty. Don't render your own output before calling it on an admin POST handler — the form must reach the screen.

## The four transports

`get_filesystem_method()` picks in this order:

| Priority | Method | Condition |
|---|---|---|
| 1 | `direct` | PHP can write as the same owner as WP files (or `$allow_relaxed_file_ownership` set + dir already writable) |
| 2 | `ssh2` | PHP `ssh2` extension loaded AND user picked SSH in the form |
| 3 | `ftpext` | PHP `ftp` extension loaded |
| 4 | `ftpsockets` | PHP `sockets` extension OR `fsockopen()` available |

Only the host operator should force a specific method in `wp-config.php`,
after checking ownership and write permissions:

```php
define( 'FS_METHOD', 'direct' ); // Operator-controlled; never set by a plugin.
```

Defaults established by `WP_Filesystem()` initialization:

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

## WordPress 7.1 transport hardening

WordPress 7.1 tightened the concrete filesystem transports. This mostly turns
warnings, invalid coercions, and ambiguous results into explicit failure
values, so callers that already check every result continue to work:

- path mapping helpers such as `abspath()`, `wp_content_dir()`,
  `wp_plugins_dir()`, and `wp_themes_dir()` are explicitly `string|false`;
- `get_contents_array()` returns `string[]|false`, including on disconnected
  FTP transports;
- FTP/SSH constructors accept missing options defensively and connection calls
  stop on constructor configuration errors;
- disconnected FTP/SSH methods and failed directory listings return `false`
  more consistently;
- owner/group may be a name, a positive numeric ID, or `false`;
- recursive `chgrp()` / `chown()` in the direct transport now traverse the
  actual listing names, and default `chmod()` preserves the detected mode
  instead of forcibly OR-ing file bits.

Do not branch on transport-specific warning behavior. Check `false` from path,
read, listing, stat, and mutation methods on every supported WordPress version.
Do not instantiate `WP_Filesystem_FTPext`, `WP_Filesystem_ftpsockets`, or
`WP_Filesystem_SSH2` directly; let `WP_Filesystem()` validate and connect them.

## When NOT to use `WP_Filesystem`

| Need | Right tool |
|---|---|
| Writing a user-uploaded file to `wp-content/uploads/` | `wp_handle_upload()` or `media_handle_upload()` |
| Reading any existing file (where you don't need write capability) | Plain PHP `file_get_contents()` is fine — read access doesn't need FS abstraction |
| Touching a local file that you just got back from `wp_handle_upload` | Plain PHP, after checking every return value; storage-offload plugins may change the lifecycle |
| Anything in PHP `tempnam()` / `sys_get_temp_dir()` | Plain PHP |

`WP_Filesystem` is overkill for `wp-content/uploads`. It's the right tool for `wp-content/`, `wp-content/plugins/<self>/cache/`, `wp-content/mu-plugins/`, or anywhere ELSE that needs the credentials dance on restricted hosts.

## Usage patterns

Read `references/patterns-and-mistakes.md` for checked examples covering local
uploads, bundled-file reads, admin credential flows, and REST-safe failure.

## Critical rules

- **`require_once ABSPATH . 'wp-admin/includes/file.php'`** before any of the API. Not autoloaded. Frontend, REST, and cron contexts don't include it.
- **Always pass `FS_CHMOD_FILE` / `FS_CHMOD_DIR`** to `put_contents` / `mkdir` / `copy`. Skipping them means permissions are left to whatever the transport's defaults are — often too-open on direct, too-locked on FTP.
- **Pass the same `$context` to `request_filesystem_credentials()` and `WP_Filesystem()`**. Calling `WP_Filesystem()` with no context defaults detection to `WP_CONTENT_DIR`, which can be wrong when you're targeting a deeper plugin/cache directory.
- **`request_filesystem_credentials()` ECHOES a form when no creds are stored**. Don't call it from a page that's already streamed HTML, and don't call it from REST / AJAX — it's not designed for those contexts.
- **The credentials prompt is admin-interactive, not the filesystem object itself**. Cron, REST, and CLI cannot render that form. They may initialize `WP_Filesystem()` when `direct` is available or credentials were supplied through trusted host configuration; otherwise fail cleanly and require an admin setup step.
- **Don't reach for `WP_Filesystem` to write inside `wp-content/uploads`** — `wp_handle_upload` or plain PHP suffices. Reserve it for paths that might NOT be web-user-writable.
- **`$wp_filesystem->delete( $path )` does NOT recurse by default**. Pass `$recursive = true` when deleting non-empty directories, and pass `$type` (`'f'` or `'d'`) when the type is known — saves a stat call.
- **Never prescribe `FS_METHOD = 'direct'` as a generic plugin fix**. It is a host-operator override after ownership and permissions are verified. Forcing it on a mismatched host can fail or create files with ownership that later blocks core updates. Never define it from a plugin.
- **Don't store FTP credentials**. WP intentionally does NOT persist the password — the user re-enters it each session. Don't add your own "save FTP password" UI.

## Common mistakes

Read `references/patterns-and-mistakes.md` before moving a filesystem mutation
into REST, AJAX, cron, or CLI; the credentials form is admin-interactive.

## Cross-references

- See **`wp-plugin-options-storage`** for storing config — most "I need to write a file" needs are better served by an option / transient.
- See **`wp-security-deep`** for path traversal checks (`realpath()`, `wp_normalize_path()`) — `WP_Filesystem` doesn't validate paths for you.
- See **`wp-plugin-cron`** when an FS-touching task moves to background — note the `'direct'` requirement.

## What this skill does NOT cover

- WP's update / upgrader APIs (`WP_Upgrader`, `Plugin_Upgrader`, `Theme_Upgrader`) which use `WP_Filesystem` internally. Different abstraction layer for the install/update flow.
- WP-CLI's `\WP_CLI\Utils\http_request` for downloading files. WP-CLI commands typically use plain PHP for FS — see the `wp-cli-extending` skill.
- The `wp-content/uploads/` upload pipeline (`wp_handle_upload`, `media_handle_upload`, `wp_handle_sideload`). Adjacent topic — different bootstrap.

## References

- Detailed patterns and failure cases: `references/patterns-and-mistakes.md`.
- `wp-admin/includes/file.php:2169` — `WP_Filesystem()` initializer (sets `$wp_filesystem` global, defines FS_CHMOD_* constants).
- `wp-admin/includes/file.php:2260` — `get_filesystem_method()` with the transport priority and writability detection.
- `wp-admin/includes/file.php:2364` — `request_filesystem_credentials()` (returns `true|false|array`, echoes form when needed).
- `wp-admin/includes/class-wp-filesystem-base.php` — the base class method surface (lines 487-861 cover the public methods listed above).
- `wp-admin/includes/file.php:1097` — `wp_handle_upload()` for the uploads/ pipeline.
- Official documentation: <https://developer.wordpress.org/reference/classes/wp_filesystem_base/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_filesystem/>
- Official documentation: <https://developer.wordpress.org/reference/functions/request_filesystem_credentials/>
- Official documentation: <https://developer.wordpress.org/advanced-administration/wordpress/wp-config/>
