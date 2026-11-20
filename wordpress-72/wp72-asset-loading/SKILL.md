---
name: wp72-asset-loading
description: >-
  Migrates WordPress 7.2 asset integrations away from load-scripts.php, load-styles.php and retired concatenation/compression settings. Use for broken admin previews, hardcoded asset endpoints, script_concat_settings, COMPRESS_SCRIPTS, COMPRESS_CSS, ENFORCE_GZIP or jQuery Migrate warnings. Covers the jQuery 3 to future jQuery 4 preparation boundary.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 asset loading

The old concatenation endpoints return HTTP 410. Restore assets through the
enqueue/dependency system, then test the document in which they are used.

## Find and replace affected integrations

Inspect PHP URL assembly, JavaScript iframe/srcDoc creation, cached HTML, CSS
imports and proxy rules for `load-scripts.php` or `load-styles.php`. Also inspect
`script_concat_settings()`, `CONCATENATE_SCRIPTS`, `COMPRESS_SCRIPTS`,
`COMPRESS_CSS`, `ENFORCE_GZIP`, `compression_test()`,
`wp_ajax_wp_compression_test()` and the old `can_compress_scripts` option.

- Register/enqueue scripts and styles with explicit dependencies on the proper
  admin/frontend/editor hook. Preserve inline data, translations and footer
  placement; do not copy core asset bundles into the plugin.
- For editor iframes use the supported editor asset path. For a custom document,
  provide its required assets deliberately; parent-document enqueues do not
  style an independent iframe automatically.
- Do not replace a removed endpoint with a guessed root-relative path. A
  subdirectory or multisite installation may have a different admin/content URL.
- Retired compression constants do not enable transport compression.
  `compression_test()` and `wp_ajax_wp_compression_test()` are deprecated no-ops;
  the Ajax action is no longer registered. `script_concat_settings()` is also
  deprecated.
- Remove obsolete configuration only after checking whether another component
  reads it. Do not delete site/network options as part of an asset-only repair.

## Prepare for a future jQuery major

WordPress 7.2 still bundles jQuery 3. Its jQuery Migrate update to 3.6.0 helps
expose deprecated behavior ahead of a future jQuery 4 transition.

1. Enable `SCRIPT_DEBUG` in a test environment and exercise plugin interactions.
2. Capture Migrate messages with their call stacks, including those from bundled
   dependencies. Check the exact loaded URL/version, not an npm lockfile alone.
3. Update the actual deprecated call and recheck event propagation, Ajax,
   selectors, deferreds, plugins and teardown.
4. Keep dependency handles correct. Removing `jquery-migrate` or replacing core
   jQuery from a CDN is not a 7.2 migration.
5. Treat the upstream 7.3/7.5/7.6 roadmap as tentative. Do not claim jQuery 4
   already ships in 7.2.

## Smoke expectations

- Both old URLs return 410 with their query strings.
- Required standalone assets return 200; the admin page/iframe remains usable.
- The browser has no missing dependency or new Migrate warnings on the tested
  paths. A clean PHP request alone cannot establish this.

## References

- [Concatenation retirement](https://core.trac.wordpress.org/ticket/57548)
- [Changeset implementing retirement](https://core.trac.wordpress.org/changeset/64585)
- [Compression cleanup](https://make.wordpress.org/core/2026/11/19/miscellaneous-developer-changes-in-wordpress-7-2/#script-loader)
- [jQuery preparation](https://make.wordpress.org/core/2026/11/17/preparing-for-jquery-4-with-wordpress-7-2/)
- Verified source: `wp-admin/load-scripts.php`, `wp-admin/load-styles.php`,
  `wp-includes/script-loader.php`, `wp-includes/deprecated.php`,
  `wp-admin/includes/deprecated.php`, `wp-includes/js/jquery/jquery-migrate.js`.
