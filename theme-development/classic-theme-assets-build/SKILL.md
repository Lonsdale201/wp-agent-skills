---
name: classic-theme-assets-build
description: Build or audit frontend asset loading for classic PHP WordPress themes on WP 7.0. Covers `wp_enqueue_scripts`, child-theme-safe `get_theme_file_uri()` and `get_theme_file_path()`, cache-busting with `filemtime()`, script args with `strategy` and `in_footer`, conditional enqueues, `comment-reply`, RTL style data, inline data with `wp_json_encode()` and `wp_add_inline_script()`, build output folders, preload/resource hints, and common mistakes such as hardcoded tags, enqueues inside templates, and invalid file paths.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Assets and Build Output

Use this when adding or reviewing CSS, JavaScript, fonts, images, build artifacts, cache busting, or conditional frontend assets in a classic PHP theme.

This skill is for the frontend theme layer. Admin, editor, and block-specific asset loading are separate concerns.

## When to Use This Skill

- Adding `assets/css/*.css`, `assets/js/*.js`, build output, or a bundler manifest.
- Replacing hardcoded `<link>` or `<script>` tags in `header.php` or `footer.php`.
- Adding conditional CSS/JS for navigation, comments, templates, sliders, galleries, maps, or page-specific UI.
- Reviewing cache busting, defer/async, RTL styles, inline data, or asset paths in a classic theme.

## Hook and Path Rules

Frontend theme assets load on `wp_enqueue_scripts`.

```php
add_action( 'wp_enqueue_scripts', 'mytheme_enqueue_assets' );

function mytheme_enqueue_assets() {
	$theme = wp_get_theme();

	wp_enqueue_style(
		'mytheme-style',
		get_stylesheet_uri(),
		array(),
		$theme->get( 'Version' )
	);
}
```

Rules:

- Use `wp_enqueue_scripts` for public frontend CSS/JS.
- Use `admin_enqueue_scripts` only for admin screens.
- Use `customize_controls_enqueue_scripts` and `customize_preview_init` for Customizer-specific assets.
- Use `get_theme_file_uri()` and `get_theme_file_path()` for theme files that may be overridden by a child theme.
- Use `get_stylesheet_uri()` for the active theme's root `style.css`.
- Do not hardcode theme URLs or filesystem paths.
- Do not enqueue assets inside `header.php`, `footer.php`, template parts, or loops.

## Cache Busting

Use `filemtime()` for local built files when the file exists. Fall back to the theme version.

```php
function mytheme_asset_version( $relative_path ) {
	$path = get_theme_file_path( $relative_path );

	if ( file_exists( $path ) ) {
		return (string) filemtime( $path );
	}

	return wp_get_theme()->get( 'Version' );
}
```

Example:

```php
wp_enqueue_style(
	'mytheme-main',
	get_theme_file_uri( 'assets/css/main.css' ),
	array(),
	mytheme_asset_version( 'assets/css/main.css' )
);
```

Rules:

- Call `filemtime()` on filesystem paths, never URLs.
- Keep version values deterministic. Do not use `time()` for production cache busting.
- If a bundler writes a manifest, parse it once and fail gracefully when an entry is missing.

## JavaScript Loading

WP 7.0 supports the modern `$args` array for `wp_enqueue_script()`.

```php
wp_enqueue_script(
	'mytheme-navigation',
	get_theme_file_uri( 'assets/js/navigation.js' ),
	array(),
	mytheme_asset_version( 'assets/js/navigation.js' ),
	array(
		'strategy'  => 'defer',
		'in_footer' => true,
	)
);
```

Rules:

- Use `strategy => 'defer'` when the script does not need to block parsing.
- Use `strategy => 'async'` only for scripts that are order-independent.
- Keep dependencies accurate. WordPress may adjust strategies to preserve dependency order.
- Prefer small, focused frontend scripts over one global file that runs on every page.
- Do not pass the old boolean footer parameter in new code unless maintaining legacy style.

## Inline Data

Use `wp_add_inline_script()` for boot data and encode PHP data with `wp_json_encode()`.

```php
$data = array(
	'ajaxUrl' => admin_url( 'admin-ajax.php' ),
	'nonce'   => wp_create_nonce( 'mytheme_public_action' ),
);

wp_add_inline_script(
	'mytheme-navigation',
	'window.MyTheme = ' . wp_json_encode( $data ) . ';',
	'before'
);
```

Rules:

- Do not include `<script>` tags in `wp_add_inline_script()`; core strips/warns about them.
- Do not use `wp_localize_script()` for arbitrary config objects. Use it for translation-style localization.
- Do not expose privileged data or long-lived secrets to frontend JavaScript.
- Any nonce exposed to the frontend must still be paired with capability checks server-side where permissions matter.

## Conditional Enqueues

Load assets only where they are needed.

```php
if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
	wp_enqueue_script( 'comment-reply' );
}

if ( is_page_template( 'page-templates/landing.php' ) ) {
	wp_enqueue_style(
		'mytheme-landing',
		get_theme_file_uri( 'assets/css/landing.css' ),
		array( 'mytheme-main' ),
		mytheme_asset_version( 'assets/css/landing.css' )
	);
}
```

Good gating signals:

- `is_singular()`, `is_archive()`, `is_search()`, `is_front_page()`, `is_home()`.
- `is_page_template( 'page-templates/example.php' )`.
- `has_nav_menu( 'primary' )` for navigation behavior.
- `comments_open()` and `get_option( 'thread_comments' )` for `comment-reply`.

Avoid running expensive queries just to decide whether to enqueue a file.

## RTL, Preload, and Resource Hints

If the theme ships an RTL replacement stylesheet, register it with style data:

```php
wp_style_add_data( 'mytheme-main', 'rtl', 'replace' );
```

Use resource hints sparingly:

- `wp_resource_hints` can add DNS-prefetch/preconnect URLs.
- `wp_preload_resources` can add preload links for critical resources.
- Do not preload everything. Preload only resources needed very early.

For fonts:

- Prefer self-hosted fonts when licensing allows.
- Declare `font-display` deliberately.
- Avoid loading multiple remote font families and weights by default.

## Build Output Layout

A practical classic theme layout:

```text
mytheme/
|-- assets/
|   |-- src/
|   |   |-- js/
|   |   `-- css/
|   |-- css/
|   |   `-- main.css
|   |-- js/
|   |   `-- navigation.js
|   `-- manifest.json
```

Rules:

- Public files enqueued by WordPress must exist in predictable paths.
- Source files may live under `assets/src/`, but templates should reference built public files.
- Do not require Node, Vite, webpack, or npm at runtime.
- Keep source maps out of production packages unless the project explicitly allows them.

## Review Checklist

- Frontend assets are hooked to `wp_enqueue_scripts`.
- No hardcoded asset tags in `header.php`/`footer.php`.
- Handles are unique and prefixed with the theme slug.
- Local asset versions use `filemtime()` on paths or the theme version.
- Script dependencies and loading strategy are explicit.
- `comment-reply` loads only when needed.
- RTL style data is registered when RTL files exist.
- Inline data uses `wp_json_encode()` and `wp_add_inline_script()`.
- Conditional enqueues do not run heavy database work.
- Build output paths exist and are child-theme-safe when override support is intended.

## Common Mistakes

- `filemtime( get_theme_file_uri( ... ) )`, which passes a URL to a filesystem function.
- Adding `<script>` inside `wp_add_inline_script()`.
- Enqueueing every page-specific asset globally.
- Using `time()` as a version in production.
- Loading `comment-reply` on every page.
- Forgetting that `get_template_directory_uri()` always points to the parent theme.
- Breaking child theme overrides by using parent-only path helpers for overridable files.

## References

- Official documentation: <https://developer.wordpress.org/themes/core-concepts/including-assets/>
- Official documentation: <https://developer.wordpress.org/reference/hooks/wp_enqueue_scripts/>
- Verified source paths:
  - `wp-includes/script-loader.php`
  - `wp-includes/functions.wp-scripts.php`
  - `wp-includes/functions.wp-styles.php`
  - `wp-includes/class-wp-scripts.php`
  - `wp-includes/class-wp-styles.php`
  - `wp-includes/link-template.php`
  - `wp-includes/general-template.php`
  - `wp-content/themes/storefront/inc/class-storefront.php`
  - `wp-content/themes/generatepress/inc/general.php`
