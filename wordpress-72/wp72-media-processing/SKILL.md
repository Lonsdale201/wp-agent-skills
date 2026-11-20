---
name: wp72-media-processing
description: >-
  Audits WordPress 7.2 media uploads and cross-origin isolation. Use for wp.media/wp.Uploader integrations, REST sideload/finalize, upload hooks, Document-Isolation-Policy, deprecated crossorigin rewriting, animated GIF/WebP sub-sizes or multisite storage quota regressions.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 media processing

The browser pipeline now reaches Media Library grid, Add New Media File and
eligible media frames, beyond the block editor. Test the route that actually
runs; the visible uploader can look unchanged.

## Eligibility and fallback

- The tested core recognizes Chromium 137+ for Document-Isolation-Policy.
  Device memory/capability gates and compatible security settings also apply.
  Firefox/Safari use the classic server path in this candidate.
- Core's server-side secure-context gate accepts HTTPS or localhost/.localhost;
  plain HTTP on 127.0.0.1 does not enable it, even when the browser itself treats
  that address as secure. Use a localhost site URL for this local pipeline test.
- Core must send the isolation header itself. A plugin-added header alone does
  not mark the request isolated for core's media-frame integration.
- Customizer, Site Icon and classic-editor frames stay on the classic path.
  Non-image/unsupported uploads, custom uploader destinations and some plupload
  resize configurations also bypass the client pipeline.
- Record User-Agent, `window.crossOriginIsolated`, response headers, memory gate
  and request URLs. A true isolation flag alone does not prove processing ran.

## Hooks and trust boundaries

The original image uses POST /wp/v2/media; client-generated sizes use /sideload,
followed by /finalize. The original runs upload prefilters; sub-sizes run
`wp_handle_sideload_prefilter`. Code relying on DOING_AJAX or
`$_POST['action'] === 'upload-attachment'` can miss this path.

Extra multipart params are forwarded, except action, _wpnonce and post_id; the
parent is sent as post. Keep server-side authentication, capability, MIME, size,
filename and attachment ownership checks. Browser-generated files are input.

## Isolation migration

Use `wp_send_document_isolation_policy_header()` before headers are sent and
before `wp_enqueue_media()` when deliberately opting a custom screen in.
It returns whether the header was sent.

`wp_start_cross_origin_isolation_output_buffer()` is deprecated and now only
sends the header. `wp_add_crossorigin_attributes()` is deprecated and returns
HTML unchanged. `wp_set_up_cross_origin_isolation()` now returns a boolean.
Core no longer buffers/reparses the document to inject crossorigin attributes.
Do not reintroduce that rewrite to fix a CDN problem; inspect actual credentials,
CORS headers and embedded-frame isolation.

Useful diagnostics: `wp_is_document_isolation_policy_supported()`,
`wp_is_cross_origin_isolated_request()`, `wp_get_media_library_mode()` and
`wp_get_media_library_upload_settings()`.

## Animated sizes and multisite

- The client path can preserve animation in GIF/WebP sizes. Use
  `wp_generate_animated_image_subsizes` to disable this deliberately.
  Do not assume the server path or every codec preserves animation.
- On quota-limited multisite, each sideloaded size counts against available
  space. An original fitting does not guarantee all sizes fit.
- Partial sizes can be missing without a complete user-facing explanation;
  total size failure can delete the attachment. Inspect resulting metadata.
- The attachment output format is temporarily allowed during its sideload, but
  a format removed by `upload_mimes` stays blocked.

## Verify

Upload a normal large image, an animated image and a denied type. Capture original,
size and finalize requests, stored metadata and frontend srcset. Repeat with
processing disabled, an unsupported browser and a near-quota multisite site.
Cancel/navigate away during processing and check cleanup. Report any path not run.

## References

- [7.2 media dev note](https://make.wordpress.org/core/2026/11/17/media-changes-in-wordpress-7-2/)
- [Pipeline requirements](https://developer.wordpress.org/block-editor/how-to-guides/client-side-media/)
- Verified source: `wp-admin/includes/media.php`, `wp-includes/media.php`,
  `wp-includes/script-loader.php`, `wp-admin/includes/deprecated.php`,
  `wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`.
- Related stable skill: `wp-client-side-media-processing`.

