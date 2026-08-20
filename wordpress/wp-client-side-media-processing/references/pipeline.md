# WP 7.1 client-side media pipeline reference

Read this when implementing or debugging an upload integration rather than only auditing one.

## End-to-end phases

1. The client creates an attachment with `POST /wp/v2/media` and may send `generate_sub_sizes=false` and `convert_format=false`.
2. Core preserves the original metadata while avoiding conflicting server derivatives, EXIF rotation, and big-image scaling for that request.
3. The browser processes the source with the WordPress upload/media packages and libvips/WASM where supported.
4. The client sends each produced file to `POST /wp/v2/media/{id}/sideload` with an allowed `image_size`.
5. Core records server-generated filenames as attachment-scoped provenance.
6. The client submits collected metadata to `POST /wp/v2/media/{id}/finalize`.
7. Core validates size names, dimensions, file ownership/provenance, and metadata shape before updating attachment metadata.
8. Core applies `wp_generate_attachment_metadata` with context `update`, persists metadata, and removes consumed provenance rows.

The flow is retryable. Plugin callbacks must not assume each phase occurs exactly once.

## Hook portability

| Hook/API | Client path | Server path | Guidance |
|---|---:|---:|---|
| `wp_generate_attachment_metadata` | Yes, including finalize update | Yes | Keep idempotent; inspect `$context`. |
| `wp_update_attachment_metadata` | Yes | Yes | Suitable for observing persisted metadata; still avoid duplicate side effects. |
| `big_image_size_threshold` | Reflected in client behavior | Yes | Use for policy, not side effects. |
| `image_editor_output_format` | Reflected in client behavior and REST response | Yes | Return deterministic MIME mappings. |
| `wp_editor_set_quality`, `jpeg_quality` | Reflected in client behavior | Yes | Keep values bounded and deterministic. |
| `wp_image_maybe_exif_rotate` | Reflected in client behavior | Yes | Do not assume the PHP rotate callback runs. |
| `wp_image_editors` | No | Yes | Server implementation detail; never the only enforcement point. |
| `image_memory_limit` | No | Yes | Not a universal upload limit. |
| `image_make_intermediate_size` | No | Yes | Not a completion signal. |

## REST additions

Create parameters:

- `generate_sub_sizes: boolean`, default `true`;
- `convert_format: boolean`, default `true`;
- `url: uri` for server-side external-image sideloading.

Attachment response additions:

- `missing_image_sizes: string[]`, edit context;
- `filename: string`;
- `filesize: integer|null`;
- `exif_orientation: integer`, edit context.

Do not depend on private metadata keys used for sideload provenance. They are core implementation details.

## Isolation checklist

- Confirm every external script, stylesheet, audio/video source, and poster used in the block editor sends usable CORS headers.
- Confirm anonymous cross-origin requests do not require cookies or HTTP authentication.
- Permit required workers in CSP. Test `worker-src 'self' blob:` only as broadly as the application needs.
- Avoid page-builder/editor code that reaches across iframe/document boundaries by global `document` assumptions.
- Test on a current Chromium browser because Document-Isolation-Policy activation is user-agent dependent.

## Source verification paths

- `wp-includes/media.php`: enablement, Chromium detection, DIP response transformation, media settings.
- `wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`: route schemas, create, sideload, provenance, finalize.
- `wp-includes/js/dist/upload-media.js`: staged browser upload orchestration.
- `wp-includes/js/dist/media-utils.js`: media helpers and processing decisions.
- `wp-includes/js/dist/vips.js`: browser image processing implementation.

Verify these against the exact target release when accepting client-produced files or depending on route schemas.
