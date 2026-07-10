---
name: wp-file-upload-security
description: Implement or audit secure WordPress file uploads and sideloads
  with media_handle_upload, wp_handle_upload, wp_check_filetype_and_ext,
  strict MIME/extension allowlists, capability and nonce checks, size limits,
  attachment cleanup, SVG/archive policy, remote download cleanup, and private
  file storage. Use when code handles $_FILES, multipart forms, REST uploads,
  Media Library attachments, imported remote files, ZIP extraction, or custom
  download endpoints.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://developer.wordpress.org/reference/functions/media_handle_upload/
  - https://developer.wordpress.org/reference/functions/wp_handle_upload/
  - https://developer.wordpress.org/reference/functions/wp_check_filetype_and_ext/
---

# WordPress File Upload Security

Treat an upload as untrusted bytes plus attacker-controlled metadata. Use the
core upload pipeline, then apply a narrower product policy; extension/MIME
matching alone is not malware scanning or content safety.

## Choose the flow

| Need | API |
|---|---|
| Create a normal Media Library attachment | `media_handle_upload()` |
| Store a local upload without an attachment post | `wp_handle_upload()` |
| Sideload a remote file | `download_url()` then `media_handle_sideload()` |
| Let a REST client create media | Core `/wp/v2/media` when its contract fits |
| Store a genuinely private document | Protected storage + authorized download controller, not a public uploads URL |

Do not manually combine `move_uploaded_file()`, a client MIME, and the original
name when core already provides unique naming, upload checks, and hooks.

## Browser-to-Media-Library pattern

The form needs `method="post"` and `enctype="multipart/form-data"`. The handler
owns authorization and request intent before touching `$_FILES`.

```php
function myplugin_handle_document_upload() {
    if ( ! current_user_can( 'upload_files' ) ) {
        return new WP_Error( 'myplugin_forbidden', __( 'Upload not allowed.', 'myplugin' ) );
    }
    check_admin_referer( 'myplugin_upload_document' );

    if ( empty( $_FILES['myplugin_document'] )
         || ! is_array( $_FILES['myplugin_document'] ) ) {
        return new WP_Error( 'myplugin_missing_upload', __( 'Choose a file.', 'myplugin' ) );
    }

    $file = $_FILES['myplugin_document'];
    if ( UPLOAD_ERR_OK !== (int) ( $file['error'] ?? UPLOAD_ERR_NO_FILE ) ) {
        return new WP_Error( 'myplugin_upload_error', __( 'Upload failed.', 'myplugin' ) );
    }

    $max = min( wp_max_upload_size(), 5 * MB_IN_BYTES );
    if ( (int) ( $file['size'] ?? 0 ) < 1 || (int) $file['size'] > $max ) {
        return new WP_Error( 'myplugin_upload_size', __( 'Invalid file size.', 'myplugin' ) );
    }

    $mimes = array(
        'pdf' => 'application/pdf',
        'jpg|jpeg' => 'image/jpeg',
        'png' => 'image/png',
    );
    $checked = wp_check_filetype_and_ext(
        (string) $file['tmp_name'],
        (string) $file['name'],
        $mimes
    );

    // Enforce this feature's policy even for users with unfiltered_upload.
    if ( empty( $checked['ext'] ) || empty( $checked['type'] ) ) {
        return new WP_Error( 'myplugin_upload_type', __( 'File type not allowed.', 'myplugin' ) );
    }

    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $attachment_id = media_handle_upload(
        'myplugin_document',
        0,
        array(),
        array( 'test_form' => false, 'mimes' => $mimes )
    );

    if ( is_wp_error( $attachment_id ) ) {
        return $attachment_id;
    }

    return (int) $attachment_id;
}
```

`media_handle_upload()` defaults `test_form` to false, so the preceding nonce
is not optional. If attaching to a post, also authorize that object (for
example `current_user_can( 'edit_post', $post_id )`) before passing its ID.

## Strict type policy

Never trust `$_FILES['type']`; it is client-supplied. The original filename is
also untrusted. `wp_handle_upload()` calls `wp_check_filetype_and_ext()`, but
pre-checking with the feature's own narrow `$mimes` array lets the plugin reject
unknown types regardless of `unfiltered_upload` capability.

Important limits:

- `wp_check_filetype_and_ext()` performs deeper content checks where core knows
  how, especially images, and uses `fileinfo` for other types when available.
- A matching PDF/ZIP/office MIME does not prove the document is harmless.
- If the product accepts risky formats, add format-specific parsing/scanning,
  resource limits, and operational quarantine before publishing the file.
- Do not disable `test_type` or broaden global `upload_mimes` for one feature;
  pass a local allowlist to that upload call.

## SVG and active content

SVG is XML that can contain scripts, external references, event handlers, and
hostile complexity. Core does not allow SVG uploads by default. Do not add SVG
to `upload_mimes` and call it finished. Use a maintained SVG sanitizer with a
documented element/attribute/URL policy, cap complexity/size, rasterize when
possible, and serve with safe headers. The same active-content concern applies
to HTML and other browser-executable formats.

## Archives

An allowed ZIP MIME is not permission to call `ZipArchive::extractTo()`.
Archives need:

- compressed/uncompressed byte and entry-count limits;
- path traversal, absolute path, symlink/hardlink/device-node rejection;
- an extension/content allowlist for every extracted entry;
- a fresh staging directory outside public execution paths;
- cleanup on every failure.

For WordPress ZIP flows, initialize `WP_Filesystem()` and prefer `unzip_file()`;
it validates entry paths and returns `true|WP_Error`. It still does not enforce
your content policy or make arbitrary executable files safe.

## Remote sideloads

`download_url()` uses the safe HTTP API and returns a temporary file. Validate
the final bytes exactly like a browser upload and always delete leftovers.

```php
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$tmp = download_url( $url, 30 );
if ( is_wp_error( $tmp ) ) {
    return $tmp;
}

$name = sanitize_file_name( wp_basename( (string) wp_parse_url( $url, PHP_URL_PATH ) ) );
if ( '' === $name ) {
    $name = sanitize_file_name( wp_basename( $tmp ) );
}
$file = array(
    'name'     => $name,
    'tmp_name' => $tmp,
);

try {
    $checked = wp_check_filetype_and_ext( $tmp, $file['name'], $mimes );
    if ( empty( $checked['ext'] ) || empty( $checked['type'] ) ) {
        return new WP_Error( 'myplugin_sideload_type', 'Downloaded file type not allowed.' );
    }

    // media_handle_sideload() has no MIME-overrides argument; enforce the
    // feature allowlist above, then let core apply the site's allowed mimes.
    $id = media_handle_sideload( $file, 0 );
    if ( is_wp_error( $id ) ) {
        return $id;
    }
    $tmp = ''; // Core moved the file.
    return (int) $id;
} finally {
    if ( $tmp && file_exists( $tmp ) ) {
        wp_delete_file( $tmp );
    }
}
```

Do not trust remote `Content-Type`, `Content-Disposition`, or URL extension.
Apply an exact host policy and the outbound HTTP skill as well.

## Public versus private files

The normal uploads directory is designed for publicly addressable media. An
attachment marked private does not automatically protect its underlying URL.
For contracts, medical records, exports, or licensed downloads:

- store outside the web root or behind server-level deny rules;
- authorize every download with object ownership/capability checks;
- stream through a controller or issue a short-lived server/object-store URL;
- set `Content-Disposition`, a fixed safe `Content-Type`, `nosniff`, and cache
  policy appropriate to the data;
- never rely only on `.htaccess` because the site may run Nginx or another
  server that ignores it.

## Failure cleanup and lifecycle

- Check every `array|WP_Error|bool` result.
- If post-processing fails after attachment creation, delete the attachment
  with `wp_delete_attachment( $id, true )` unless a retry workflow owns it.
- Remove temporary files, partial derivatives, staging directories, and queue
  payloads on both exceptions and normal errors.
- Apply site/multisite quotas via `wp_max_upload_size()` plus a narrower feature
  limit; browser `MAX_FILE_SIZE` is UX only, not a security boundary.
- Store attachment IDs rather than URLs and render through attachment helpers.

## Tests

Cover empty/partial/oversized files, double extensions, mismatched real MIME,
uppercase extensions, polyglots appropriate to supported formats, SVG/HTML,
archive traversal/bombs, duplicate names, low-privilege users, nonce failure,
post ownership, sideload timeout/redirect, cleanup failure, and multisite quota.
Run tests with and without `fileinfo`, and with a user that has
`unfiltered_upload` to ensure the feature allowlist still wins.

## Critical rules

- Capability and nonce checks happen before reading/processing the upload.
- Use a narrow local extension/MIME allowlist and verify actual bytes.
- Core type checks are not malware or active-content sanitization.
- Never extract untrusted archives directly into a public/plugin directory.
- Public uploads are not private storage.
- Clean temporary files and partial attachments on every failure path.

## Cross-references

- Use **`wp-security-audit`** for handler authorization and traversal review.
- Use **`wp-filesystem-api`** for non-upload filesystem transports.
- Use **`wp-http-api-client`** for remote URLs and downloads.
- Use **`wp-privacy-personal-data`** for personal documents and retention.

## Core references

- `wp-admin/includes/file.php`: `_wp_handle_upload()`, `wp_handle_upload()`,
  `download_url()`, and `unzip_file()`.
- `wp-admin/includes/media.php`: `media_handle_upload()` and sideload handling.
- `wp-includes/functions.php`: `wp_check_filetype_and_ext()` and allowed mimes.
