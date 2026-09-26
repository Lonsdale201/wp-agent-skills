---
name: lw-img-operations-integration
description: >-
  Operate, integrate, or diagnose LW Image 2.0.x image optimization for
  WordPress. Covers the HelloImg upload pipeline, WebP and AVIF conversion,
  bulk jobs, backups and restore, smart crop, WP-CLI, environment checks,
  pattern rules, public PHP hooks, admin REST boundaries, WordPress 7.1
  browser uploads, old-image redirects, and safe rollout or rollback. Use when
  working with lw-img, wp lw-img, lw_img_options, lw_img_* hooks, Media Library
  optimization, conversion credits, or uploads/lw-img-backups.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-img"
  wp-skills-plugin-version-tested: "2.0.2"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW Image 2.0: operations and integration

Use LW Image's admin screen, WP-CLI commands, and public hooks. Preserve originals, API credits, attachment metadata, and content URLs when changing an existing library.

## Binding requirements and current surface

Read the installed plugin header before applying this reference:

| Contract | Version 2.0.2 |
|---|---|
| WordPress | 6.6 or newer |
| PHP | 8.0 or newer |
| Main option | `lw_img_options` |
| Admin screen | **LW Plugins -> Image** |
| WP-CLI namespace | `wp lw-img` |
| Admin REST namespace | `lw-img/v1` |
| Backup root | `wp-content/uploads/lw-img-backups/` |
| External service | HelloImg API |

The React admin needs WordPress 6.6's `react-jsx-runtime` registration. On an older WordPress release the settings page can be blank, so do not treat the declared minimum as a cosmetic header value.

Version 2.0.2 does not register WordPress Abilities or LW Site Manager abilities. Automate it through WP-CLI or a purpose-built integration using its public hooks. The `lw-img/v1/admin/*` routes belong to the cookie-authenticated admin application and all require `manage_options`.

## Start with read-only checks

Run these before changing settings or processing media:

```bash
wp plugin list --name=lw-img --fields=name,status,version,update,update_version
wp lw-img status
wp lw-img doctor --format=json
wp lw-img leftovers --format=json
```

`status` reports the current queue, outcomes, savings, and backup size. `doctor` checks database engines, PHP, cURL, the image editor, output-format support, writable directories, disk space, cron loopback, old-image redirects, and API reachability. It exits non-zero when a critical check fails, so capture both output and exit status.

Version 2.0.2 has one machine-output edge case: when no competitor leftovers are found, `wp lw-img leftovers --format=json` prints a human `Success: No leftovers found...` line and exits zero instead of returning `[]`. Accept either form in 2.0.2 automation, and remove the workaround after the command is fixed upstream.

Treat these conditions as rollout blockers:

- no valid HelloImg API key;
- no WebP or selected AVIF support in the active WordPress image editor;
- unwritable uploads or backup directories;
- insufficient disk for originals plus converted files;
- failed old-image redirect probe before a bulk conversion;
- a competing optimizer that can process the same files concurrently.

A missing key is safe but inactive: uploads remain unchanged and bulk processing cannot start. Never print the key in logs or issue reports.

## Understand the upload pipeline

For a supported upload, LW Image runs before WordPress creates sub-sizes:

1. Apply API-key, MIME, size, pattern, animated-GIF, and already-modern-format gates.
2. Let `lw_img_should_convert` veto an otherwise eligible file.
3. Send the main file to HelloImg once.
4. Keep the original when the request fails or the returned file is not smaller.
5. Save an original backup when backups are enabled.
6. Replace the main file and let WordPress generate thumbnails from the optimized source.
7. Record status, byte counts, log entry, and public actions.

Supported inputs are JPEG, PNG, GIF, HEIC/HEIF, TIFF, and BMP. The selected output is WebP or AVIF. Already-WebP and AVIF files are normally skipped. Animated GIF conversion preserves animation unless the skip toggle is enabled.

Pattern rules apply to uploads and bulk processing. Their actions are `exclude`, `keep_size`, `level`, and `keep_exif`; every matching rule participates, `exclude` wins, and the first matching level wins. An excluded image is also outside smart crop.

## Configure through the supported surface

Prefer the admin screen. It validates enums, ranges, MIME names, pattern rules, and dependent fields before saving the single `lw_img_options` array.

Important defaults are:

| Setting | Default | Accepted behavior |
|---|---|---|
| `auto_convert` | `true` | Master upload switch |
| `level` | `normal` | `lossless`, `normal`, `aggressive`, `ultra` |
| `output_format` | `webp` | `webp` or `avif` |
| `keep_exif` | `false` | Retaining it can preserve camera and location data |
| `max_width`, `max_height` | `0`, `0` | Zero means no limit; resize never upscales |
| `max_filesize_mb` | `10` | Valid range 1-10 |
| `min_filesize_kb` | `0` | Valid range 0-10240 |
| `backup_enabled` | `true` | Required for later restore |
| `backup_retention_days` | `30` | Zero keeps backups indefinitely |
| `bulk_speed` | `normal` | `gentle`, `normal`, `fast` |
| `smartcrop_enabled` | `false` | Uses one API call per selected crop size |
| `delete_on_uninstall` | `false` | Controls settings, log, and table cleanup |

Do not update `lw_img_options` with a partial `wp option update` command: that replaces the whole array and bypasses field validation. If configuration must live outside the database, define only the API key:

```php
define( 'LW_IMG_API_KEY', getenv( 'HELLOIMG_API_KEY' ) );
```

The constant overrides the stored key and is never copied into the database by a settings save. Keep the environment variable and `wp-config.php` out of public output.

## Roll out bulk optimization safely

Start with a representative sample and verify the generated files, thumbnails, attachment URLs, page-builder content, and restore path. Then preview the queue:

```bash
wp lw-img optimize --all --limit=25 --dry-run
```

The dry run lists attachments and spends no API credit. When the sample is approved, process a bounded batch before draining the whole queue:

```bash
wp lw-img optimize --all --limit=25 --speed=gentle
wp lw-img status
wp lw-img list --status=failed --format=json
wp lw-img list --status=skipped --format=json
```

Bulk conversion rewrites old file URLs in post content, page-builder data, options, and serialized metadata, then serves a 301 from the old uploads URL. The rewrite is serialization-aware. If the web server answers missing image paths before WordPress receives them, the redirect cannot work and the bulk gate refuses to start.

On nginx, use the exact location block shown by the current Tester or `doctor` output. Its path accounts for custom uploads locations and its precedence matters. After a server fix, purge cached 404 responses at the CDN and rerun `doctor`. Use `--skip-redirect-check` only when the user has explicitly accepted that old image URLs may return 404.

Queue claiming is concurrency-safe: cron and several `wp lw-img optimize --all` workers can cooperate. Speed profiles also back off under server load. A rejected key or exhausted quota halts the run and leaves unclaimed images pending instead of stamping them skipped.

## Restore, retry, and reprocess deliberately

These commands mutate media or queue state:

```bash
wp lw-img restore 123 456
wp lw-img requeue --failed
wp lw-img requeue --failed --skipped
wp lw-img optimize 123 --level=lossless
```

Restore copies the original back, regenerates thumbnails, and reverses URL rewrites. Confirm that a usable backup exists before promising reversibility.

Requeue clears outcome stamps; it does not process the image immediately. Requeue skipped images only after changing the reason they were skipped, otherwise the next run produces the same result and can spend unnecessary work.

Changing the global output format does not convert already-optimized images again. Reprocessing is explicit through the Media Library action, a requeue, or a targeted CLI command.

## Handle smart crop as a separate cost surface

Smart crop makes one API call for every selected hard-cropped size that needs a subject-aware crop. Preview exact work first:

```bash
wp lw-img smartcrop 123 456 --dry-run
wp lw-img smartcrop --all --sizes=thumbnail,medium --dry-run
```

Run a whole-library crop only after reviewing the reported call count:

```bash
wp lw-img smartcrop --all --sizes=thumbnail --yes
```

The CLI command intentionally works even when the upload-time smart-crop toggle is off. Square sources can produce no jobs because their ratio already matches a square size. Bulk optimization and generic thumbnail regeneration do not reapply smart crop.

On WordPress 7.1 browser uploads, the browser can generate sub-sizes and sideload them separately. LW Image converts the primary file once, maps browser thumbnail output to the configured format, and skips those sub-size sideloads. If the browser never sends its best-effort finalize request, use the explicit `smartcrop` command for the affected attachment.

## Integrate through public PHP hooks

Veto a conversion after built-in eligibility checks:

```php
add_filter(
	'lw_img_should_convert',
	static function ( bool $convert, string $file_path, string $mime_type ): bool {
		if ( str_contains( wp_normalize_path( $file_path ), '/protected-art/' ) ) {
			return false;
		}

		return $convert;
	},
	10,
	3
);
```

This filter can stop conversion; it cannot force a file past the API-key, MIME, size, pattern, or animation gates.

Adjust the API payload narrowly and preserve unknown keys:

```php
add_filter(
	'lw_img_optimize_request_args',
	static function ( array $args, string $file_path ): array {
		if ( str_ends_with( strtolower( $file_path ), '.png' ) ) {
			$args['level'] = 'lossless';
		}

		return $args;
	},
	10,
	2
);
```

The documented payload keys are `level`, `keep_exif`, `convert`, `max_width`, and `max_height`. Do not put credentials, URLs, or arbitrary request options into this filter.

Observe outcomes without assuming every event has an attachment:

```php
add_action(
	'lw_img_upload_converted',
	static function ( string $original_path, string $new_path, array $context ): void {
		$attachment_id = isset( $context['attachment_id'] ) ? (int) $context['attachment_id'] : 0;
		$percent       = isset( $context['percent'] ) ? (float) $context['percent'] : 0.0;

		do_action( 'my_plugin_image_optimized', $attachment_id, basename( $new_path ), $percent );
	},
	10,
	3
);
```

The upload path fires before an attachment exists, while bulk and on-demand conversion include `attachment_id` in version 2.0.2. The public actions are:

- `lw_img_upload_converted( $original_path, $new_path, $context )`;
- `lw_img_upload_skipped( $file_path, $reason, $context )`;
- `lw_img_upload_failed( $file_path, $error, $context )`;
- `lw_img_restored( $attachment_id, $restored_path )`.

Smart-crop failures use `lw_img_upload_failed`, pass the size file path, and prefix the error with `smart crop: `. Log basenames or attachment IDs where possible instead of exposing full server paths.

Additional filters are:

- `lw_img_dashboard_url` for a branded HelloImg dashboard URL;
- `lw_img_site_host` for the `X-HIMG-Site` host on multisite or reverse-proxy installations;
- `lw_img_competitor_plugins` for optimizer detection entries containing optional `name`, `plugin`, and `meta_keys` values.

## Respect backup and deletion semantics

Only the main original is backed up; thumbnails are regenerated during restore. Retention cleanup can remove backups after the configured number of days, so a successful conversion is not permanently reversible unless the retention policy and external backups preserve the original.

Deleting an attachment removes its LW Image backup. Deactivating the plugin unschedules workers but keeps data. Deleting the plugin always clears volatile jobs and caches. When `delete_on_uninstall` is enabled it also removes settings, the stored API key, event log, version options, and the per-image table. Original files under `uploads/lw-img-backups/` are deliberately kept in every uninstall mode.

The plugin writes `index.php` and `.htaccess` guards in the backup directory. Apache honors the access rule; nginx does not read `.htaccess`, so protect that URL path in server configuration when direct access to original images is unacceptable.

## Diagnose by layer

When an image is unchanged, separate these states:

1. **Not eligible:** MIME, file size, pattern, existing WebP/AVIF, animation, or competitor marker stopped it.
2. **Not connected:** key is absent, rejected, bound to another host, or out of credit.
3. **Conversion skipped:** the API result was not smaller, so the size guard kept the original.
4. **Conversion failed:** request, polling, file swap, or thumbnail generation failed.
5. **Converted but stale:** a CDN, page cache, generated CSS, or builder data still references an old URL.
6. **Bulk blocked:** the old-image redirect probe, cron, filesystem, or environment gate failed.

Use the Log tab and `wp lw-img list --status=...` to distinguish a deliberate skip from a failure. Reproduce with one attachment before changing global settings.

## Verification checklist

1. Record LW Image, WordPress, PHP, image-editor, web-server, CDN, and competing-optimizer versions.
2. Run `status` and `doctor`; retain sanitized output and exit codes.
3. Verify one JPEG, transparent PNG, animated GIF policy, large image, and one pattern-rule match.
4. Confirm generated thumbnail MIME types and attachment metadata.
5. Check a converted image in post content and page-builder data, including the old URL's 301.
6. Restore the sample and confirm main file, thumbnails, URLs, and front-end rendering.
7. Test cron continuation or the intended WP-CLI worker process.
8. Review failures, skips, storage saved, backup growth, and API credit use after each bounded batch.
9. Never attach API keys, full filesystem paths, private media, or database dumps to a public issue.

## References

- Plugin repository: <https://github.com/lwplugins/lw-img>
- Usage guide: <https://github.com/lwplugins/lw-img/blob/main/docs/usage.md>
- Admin guide: <https://github.com/lwplugins/lw-img/blob/main/docs/admin.md>
- WP-CLI guide: <https://github.com/lwplugins/lw-img/blob/main/docs/cli.md>
- Verified source paths:
  - `lw-img.php`
  - `includes/DefaultOptions.php`
  - `includes/Hooks.php`
  - `includes/Options.php`
  - `includes/Plugin.php`
  - `includes/CLI/Commands.php`
  - `includes/CLI/DoctorCommand.php`
  - `includes/CLI/ListCommand.php`
  - `includes/CLI/SmartCropCommand.php`
  - `includes/Rest/Admin/Routes.php`
  - `includes/Uninstall/DataPolicy.php`
  - `includes/Uninstall/Uninstaller.php`
