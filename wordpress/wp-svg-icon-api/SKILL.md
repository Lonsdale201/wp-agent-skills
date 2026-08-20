---
name: wp-svg-icon-api
description: Register, discover, render, and audit SVG icons with the public WordPress 7.1 Icons API. Covers wp_register_icon_collection, wp_register_icon, wp_get_icon, unregistering icons and collections, collection/name rules, inline content versus file_path, core SVG sanitization limits, accessible labels versus decorative output, sizing/classes, lazy file reads, authenticated REST icon and collection routes, duplicate handling, and compatibility fallbacks. Use when a plugin or theme needs reusable SVG icons in PHP or the editor, exposes an icon picker, replaces Dashicons, or reviews custom SVG output.
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

# WordPress SVG Icon API

WordPress 7.1 provides public collection, registration, discovery, and rendering helpers for SVG icons. Use them instead of duplicating inline SVG strings across screens or inventing a second icon registry.

## Register a collection before its icons

Register during `init`. Use a plugin-owned collection; `core` is reserved:

```php
add_action( 'init', static function (): void {
    wp_register_icon_collection(
        'myplugin',
        array(
            'label'       => __( 'My Plugin', 'myplugin' ),
            'description' => __( 'Icons supplied by My Plugin.', 'myplugin' ),
        )
    );

    wp_register_icon(
        'myplugin/report',
        array(
            'label'   => __( 'Report', 'myplugin' ),
            'content' => '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M4 3h16v18H4z" /></svg>',
        )
    );
} );
```

Collection slugs and icon names must start/end with a lowercase letter or digit and may contain lowercase letters, digits, `_`, and `-`. An icon has the `collection/icon-name` form. Duplicate registration fails; do not silently take over another collection.

## Choose `content` or `file_path`

Provide exactly one:

- `content`: sanitized at registration and best for a small static set;
- `file_path`: an absolute path to a readable `.svg`, loaded and sanitized lazily on first access.

```php
wp_register_icon(
    'myplugin/chart',
    array(
        'label'     => __( 'Chart', 'myplugin' ),
        'file_path' => plugin_dir_path( MYPLUGIN_FILE ) . 'assets/icons/chart.svg',
    )
);
```

A bad file path can register successfully because reading is lazy, then render as an empty string with an error later. Validate shipped paths in tests and deployment packages.

Core's WP 7.1 sanitizer intentionally supports a small vocabulary: `svg`, `path`, and `polygon`, with a limited attribute allowlist. Elements such as `circle`, `rect`, `defs`, `use`, filters, styles, scripts, and event attributes are removed. Inspect the sanitized output; successful registration does not mean the result retains every visual feature.

## Render with explicit accessibility intent

```php
echo wp_get_icon(
    'myplugin/report',
    array(
        'size'  => 20,
        'class' => 'myplugin-report-icon',
        'label' => __( 'Report', 'myplugin' ),
    )
);
```

- Default size is `24`; `null` preserves intrinsic SVG dimensions.
- Classes are added to the root SVG.
- A non-empty `label` yields `role="img"` and `aria-label`.
- Without a label, core yields `aria-hidden="true"` and `focusable="false"` for a decorative icon.

If adjacent visible text already names the control, leave the icon decorative. If the SVG is the only content conveying meaning, provide a translated label or a screen-reader name on the parent control. `wp_get_icon()` returns an empty string for a missing or unreadable icon, so UI must not depend on the image alone.

## Unregister deliberately

```php
wp_unregister_icon( 'myplugin/report' );
wp_unregister_icon_collection( 'myplugin' );
```

Unregistering a collection also unregisters every icon inside it. Only unregister identifiers your plugin owns, normally during a runtime replacement/test—not during deactivation merely to "clean up" an in-memory registry.

## REST discovery is not public-anonymous

Core exposes read-only routes under `wp/v2` for editors:

- `/icons` and `/icons/{collection}`;
- `/icons/{collection}/{icon}`;
- `/icon-collections` and `/icon-collections/{slug}`.

Access requires `edit_posts` or the edit capability of a REST-exposed post type. Do not document these as anonymous public endpoints. The icon response includes sanitized SVG content, so do not register secrets or user-specific data in labels/content.

## Compatibility

Feature-detect all public helpers when supporting WP below 7.1:

```php
if ( ! function_exists( 'wp_register_icon_collection' ) || ! function_exists( 'wp_get_icon' ) ) {
    // Load a plugin-owned fallback renderer or omit the optional icon UI.
    return;
}
```

Do not call the singleton registry directly for normal plugin code. The helper API is the stable integration surface.

## Audit checklist

- Collection registered before icons on a deterministic hook.
- Plugin-owned namespace; no `core/*` registration.
- Exactly one of `content`/`file_path`, plus required translated label.
- Sanitized output still renders; no reliance on stripped SVG features.
- File paths are absolute, readable, `.svg`, and included in release artifacts.
- Decorative versus meaningful icon behavior is correct.
- Empty-string fallback does not remove a control's accessible name.
- REST consumers authenticate and do not assume anonymous availability.

## Cross-references

- Use **`wp-accessibility-audit`** for icon-only controls and labeling.
- Use **`wp-file-upload-security`** if users can provide SVG files; this registry does not make arbitrary SVG uploads safe.
- Use **`wp-rest-api`** for REST client authentication and error handling.

## References

- Read `references/api-contract.md` for validation rules, sanitizer surface, REST routes, and failure behavior.
- Icons API dev note: <https://make.wordpress.org/core/2026/07/24/registering-and-rendering-svg-icons-in-wordpress-7-1/>
- Core sources: `wp-includes/icons.php`, `wp-includes/class-wp-icons-registry.php`, `wp-includes/class-wp-icon-collections-registry.php`, and the two REST icon controllers.
