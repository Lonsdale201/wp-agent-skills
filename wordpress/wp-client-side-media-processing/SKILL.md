---
name: wp-client-side-media-processing
description: Implement or audit compatibility with the WordPress 7.1 browser-side media pipeline. Covers wp_is_client_side_media_processing_enabled, wp_client_side_media_processing_enabled, REST media create/sideload/finalize, generate_sub_sizes, convert_format, client-side image resizing and conversion, metadata finalization, duplicate wp_generate_attachment_metadata calls, server-only image hooks, Document-Isolation-Policy, crossorigin behavior, WASM/CSP requirements, external-image sideloading, fallback behavior, and safe upload extension points. Use when a plugin processes uploads, generates image sizes, filters attachment metadata, embeds editor scripts, reads media REST responses, or breaks only in the block editor on WordPress 7.1.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-19"
---

# WordPress Client-side Media Processing

WordPress 7.1 can resize, compress, rotate, convert, and create image derivatives in the browser before files are finalized on the server. Treat this as a second execution path, not as a transparent optimization: server image-editor hooks may not run, attachment metadata can be generated in stages, and the block editor may receive a Document-Isolation-Policy header.

## When to use this skill

- A plugin filters image quality, formats, EXIF rotation, sub-size generation, or attachment metadata.
- Code hooks `wp_generate_attachment_metadata`, `intermediate_image_sizes_advanced`, `image_editor_output_format`, `wp_image_editors`, or `image_make_intermediate_size`.
- An editor asset, CDN, analytics script, page builder, or media workflow fails only on WP 7.1.
- Code calls `/wp/v2/media`, reads attachment REST fields, uploads external images, or replaces attachment files.
- A CSP blocks `blob:` workers or a cross-origin editor dependency stops loading.

## Model both processing paths

| Path | Processing location | Important consequence |
|---|---|---|
| Server fallback | GD/Imagick on the server | Traditional server image hooks run. |
| WP 7.1 client path | Browser, then REST sideload/finalize | Some server-only hooks never run; metadata arrives in stages. |

Do not feature-detect by version alone:

```php
$client_media_available = function_exists( 'wp_is_client_side_media_processing_enabled' )
    && wp_is_client_side_media_processing_enabled();
```

The core function defaults to enabled only in a secure context: HTTPS, `localhost`, or a `.localhost` host. The `wp_client_side_media_processing_enabled` filter can override it. A browser can still fall back because of unsupported capabilities or a failed client operation.

## Keep upload integrations path-independent

Prefer hooks that describe the completed attachment contract rather than a particular editor implementation. Make metadata filters deterministic and idempotent:

```php
add_filter(
    'wp_generate_attachment_metadata',
    static function ( array $metadata, int $attachment_id, string $context ): array {
        $metadata['myplugin'] = array(
            'version' => 1,
            'source'  => wp_get_attachment_url( $attachment_id ),
        );

        return $metadata;
    },
    10,
    3
);
```

On the client path, the filter can run once for the initial create and again with `$context === 'update'` when `/finalize` applies the browser-produced files. Never bill, send a webhook, enqueue a unique job, or append duplicate data merely because this filter fired. Guard side effects with durable state and make retries safe.

Hooks tied to server image editing, including `wp_image_editors`, `image_memory_limit`, and `image_make_intermediate_size`, do not describe the client path and may not fire. Do not use them as the only place to enforce a security policy or business invariant.

## Respect the REST workflow

The standard create route accepts these WP 7.1 parameters:

- `generate_sub_sizes`: whether the server creates derivatives;
- `convert_format`: whether server-side format conversion runs;
- `url`: server-side sideload of an external image.

When client processing is enabled, core also registers:

- `POST /wp/v2/media/{id}/sideload` for a generated file;
- `POST /wp/v2/media/{id}/finalize` for the collected sub-size metadata.

These are authenticated core endpoints with attachment edit/upload checks, bounded schemas, size-name validation, upload-directory pinning, and file provenance validation. Do not reproduce the flow with a permissive custom endpoint. Do not trust client-supplied filenames, dimensions, MIME types, or metadata in your own routes.

New response fields include `missing_image_sizes`, `filename`, `filesize`, and edit-context `exif_orientation`. Request only the fields needed and handle `filesize: null`.

## Preserve core image filters

The browser pipeline maps core policy into client behavior. Continue to use the established filters when they express the desired rule:

- `big_image_size_threshold`;
- `image_editor_output_format`;
- `image_save_progressive`;
- `wp_image_maybe_exif_rotate`;
- `wp_editor_set_quality` and `jpeg_quality`.

Test both paths. A PHP filter that accepts a filename or MIME type may be evaluated at a different stage, and a filter with hidden side effects is unsafe.

## Handle editor isolation deliberately

For supported Chromium versions, the block editor can send:

```text
Document-Isolation-Policy: isolate-and-credentialless
```

Core adds `crossorigin="anonymous"` to relevant cross-origin media/script/style tags in the isolated editor response. Consequences:

- third-party resources must send compatible CORS headers;
- credentials are not available to anonymous cross-origin requests;
- a strict CSP must permit the required WebAssembly worker path, including `worker-src blob:` when applicable;
- code must not assume the editor canvas and all third-party frames can share DOM state.

Do not globally disable client processing to hide one incompatible asset. First make the asset CORS/CSP-safe or load it only where needed. Use the enablement filter only as a deliberate site compatibility escape hatch.

## External media and replacement

Do not fetch arbitrary remote images in the isolated browser. Use the `url` parameter on the core media create endpoint so WordPress performs a server-side, SSRF-checked HTTP request. For plugin-owned remote imports, apply the same URL validation, capability, MIME, size, timeout, and provenance controls described in `wp-file-upload-security` and `wp-http-api-client`.

When an API exposes file replacement, treat it as an update of the attachment's complete file/metadata graph. Do not overwrite a path directly and leave stale derivatives or cache entries.

## Test matrix

Run at least:

1. HTTPS client path and forced server fallback;
2. JPEG/PNG plus HEIC/HEIF where the browser supports it;
3. EXIF-oriented image and big-image downscaling;
4. custom registered image sizes and output-format filters;
5. failed/interrupted sideload followed by retry/finalize;
6. metadata filters firing more than once without duplicate side effects;
7. external image URL, invalid/private URL, and CORS-restricted asset;
8. block editor with the production CSP and third-party scripts.

## Critical rules

- Support client and server paths; never make correctness depend on one image editor hook.
- Make metadata callbacks idempotent and retry-safe.
- Keep authorization, schema validation, MIME checks, and filename provenance server-side.
- Use core REST media routes instead of cloning the sideload/finalize protocol.
- Audit CORS and CSP before disabling the feature.
- Do not treat browser-produced dimensions, files, or MIME data as trusted.

## Cross-references

- Use **`wp-file-upload-security`** for the upload trust boundary.
- Use **`wp-rest-api`** for custom endpoint authorization and schemas.
- Use **`wp-admin-media-frame`** for media modal selection behavior.
- Use **`wp-block-editor-iframe-compatibility`** for canvas DOM and asset placement.

## References

- Read `references/pipeline.md` for the exact REST phases, hook portability matrix, isolation effects, and source paths.
- Client-side media processing dev note: <https://make.wordpress.org/core/2026/07/22/client-side-media-processing-in-wordpress-7-1/>
- Core sources: `wp-includes/media.php`, `wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`, `wp-includes/js/dist/upload-media.js`, `wp-includes/js/dist/media-utils.js`.
