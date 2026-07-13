---
name: classic-theme-customizer
description: Add or audit WordPress Customizer options for classic PHP themes on WP 7.0. Covers `customize_register`, `WP_Customize_Manager`, settings, sections, controls, `theme_mod` vs `option`, option-backed Customizer autoload, multidimensional setting IDs, `sanitize_callback`, `validate_callback`, `WP_Customize_Color_Control`, allowlisted select values, `postMessage`, `customize_preview_init`, selective refresh partials, escaping `get_theme_mod()` output in templates, and common bugs such as raw Customizer values, missing sanitization, or `postMessage` without preview JavaScript.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-09"
---

# Classic Theme Customizer

Use this when adding or reviewing Customizer settings for a classic PHP theme. This is for theme presentation choices such as colors, layout toggles, logo-adjacent display settings, and small design options.

Do not use theme Customizer settings for plugin-like business data, payment credentials, complex content models, or cross-theme application state.

## When to Use This Skill

- Adding `customize_register` code to a classic theme.
- Creating a color, select, checkbox, text, image, or layout option.
- Reviewing `get_theme_mod()` output in templates.
- Adding live preview with `postMessage` or selective refresh.
- Fixing unsanitized Customizer settings or controls registered outside the correct hook.

## Registration Hook

Register settings, sections, and controls on `customize_register`.

```php
add_action( 'customize_register', 'mytheme_customize_register' );

function mytheme_customize_register( WP_Customize_Manager $wp_customize ) {
	$wp_customize->add_section(
		'mytheme_layout',
		array(
			'title'    => __( 'Layout', 'textdomain' ),
			'priority' => 160,
		)
	);
}
```

Rules:

- Use the `WP_Customize_Manager` instance passed to the hook.
- Prefix setting IDs with the theme slug.
- Keep Customizer setup in `inc/customizer.php` or a similarly scoped include, loaded from `functions.php`.
- Do not register controls during normal template rendering.

## Settings Must Sanitize

Every custom setting needs a `sanitize_callback`.

```php
$wp_customize->add_setting(
	'mytheme_accent_color',
	array(
		'default'           => '#0a7a75',
		'type'              => 'theme_mod',
		'capability'        => 'edit_theme_options',
		'transport'         => 'refresh',
		'sanitize_callback' => 'sanitize_hex_color',
	)
);
```

Rules:

- Prefer `type => 'theme_mod'` for theme design settings.
- Use `type => 'option'` only when the value is intentionally shared beyond the active theme.
- When using `type => 'option'`, set `autoload => false` for values that are not needed on most requests; core's multidimensional option save defaults to autoloading unless an autoload arg is supplied.
- The default capability is `edit_theme_options`; set it explicitly when clarity helps.
- Use `transport => 'refresh'` unless live preview is actually implemented.
- Add `validate_callback` when a value can be syntactically valid but semantically unacceptable.

Common sanitizers:

| Value | Sanitizer |
|---|---|
| Hex color | `sanitize_hex_color` |
| Plain text | `sanitize_text_field` |
| Textarea | `sanitize_textarea_field` |
| URL | `esc_url_raw` |
| Checkbox | Custom boolean sanitizer |
| Select/radio | Custom allowlist sanitizer |
| Integer | `absint` |

## Controls

Use core controls where they fit.

```php
$wp_customize->add_control(
	new WP_Customize_Color_Control(
		$wp_customize,
		'mytheme_accent_color',
		array(
			'label'   => __( 'Accent color', 'textdomain' ),
			'section' => 'mytheme_layout',
		)
	)
);
```

Select controls must pair with an allowlist sanitizer:

```php
function mytheme_sanitize_layout( $value ) {
	$allowed = array( 'full', 'boxed', 'narrow' );

	if ( in_array( $value, $allowed, true ) ) {
		return $value;
	}

	return 'full';
}
```

```php
$wp_customize->add_setting(
	'mytheme_site_layout',
	array(
		'default'           => 'full',
		'sanitize_callback' => 'mytheme_sanitize_layout',
	)
);

$wp_customize->add_control(
	'mytheme_site_layout',
	array(
		'label'   => __( 'Site layout', 'textdomain' ),
		'section' => 'mytheme_layout',
		'type'    => 'select',
		'choices' => array(
			'full'   => __( 'Full width', 'textdomain' ),
			'boxed'  => __( 'Boxed', 'textdomain' ),
			'narrow' => __( 'Narrow', 'textdomain' ),
		),
	)
);
```

## Reading Values in Templates

Customizer values are stored data. Sanitize on save and escape on output.

```php
$layout = get_theme_mod( 'mytheme_site_layout', 'full' );

if ( in_array( $layout, array( 'full', 'boxed', 'narrow' ), true ) ) {
	printf(
		'<div class="site-layout site-layout-%s">',
		esc_attr( $layout )
	);
}
```

Rules:

- Always pass a default to `get_theme_mod()`.
- Escape by output context: `esc_html()`, `esc_attr()`, `esc_url()`, or controlled KSES.
- Do not echo raw Customizer values into HTML, attributes, CSS, or JavaScript.
- For CSS variables or inline CSS, validate allowed formats tightly before output.
- Multidimensional setting IDs such as `mytheme_options[color]` are one root value plus subkeys. Keep the root option array small and typed; do not use it as a dumping ground for unrelated data.

## Live Preview with postMessage

Use `postMessage` only when preview JavaScript is registered.

```php
$wp_customize->get_setting( 'blogname' )->transport = 'postMessage';

add_action( 'customize_preview_init', 'mytheme_customize_preview_js' );

function mytheme_customize_preview_js() {
	wp_enqueue_script(
		'mytheme-customize-preview',
		get_theme_file_uri( 'assets/js/customize-preview.js' ),
		array( 'customize-preview' ),
		mytheme_asset_version( 'assets/js/customize-preview.js' ),
		array( 'in_footer' => true )
	);
}
```

Preview script:

```js
( function ( wp ) {
	wp.customize( 'blogname', function ( value ) {
		value.bind( function ( nextValue ) {
			var siteTitle = document.querySelector( '.site-title a' );

			if ( siteTitle ) {
				siteTitle.textContent = nextValue;
			}
		} );
	} );
}( window.wp ) );
```

Rules:

- Preview JS depends on `customize-preview`.
- Controls-pane JS belongs on `customize_controls_enqueue_scripts`.
- If there is no preview JS, leave `transport` as `refresh`.

## Selective Refresh

Use selective refresh when a small server-rendered fragment can be updated without refreshing the whole preview.

```php
if ( isset( $wp_customize->selective_refresh ) ) {
	$wp_customize->selective_refresh->add_partial(
		'blogname',
		array(
			'selector'        => '.site-title a',
			'render_callback' => 'mytheme_render_site_title',
		)
	);
}

function mytheme_render_site_title() {
	echo esc_html( get_bloginfo( 'name' ) );
}
```

Rules:

- The `selector` must match stable frontend markup.
- The render callback must output or return safe, escaped markup.
- Do not use selective refresh for large, fragile page sections unless the markup is stable and tested.

## Theme Boundary

Good Customizer settings:

- Accent color.
- Header layout.
- Sidebar position.
- Footer text when it is purely theme presentation.
- Archive excerpt length when it is theme display behavior.

Bad Customizer settings:

- API keys and secrets.
- Checkout/business rules.
- CPT data models.
- Email templates owned by a plugin.
- Anything that should survive theme switching as application state.

## Review Checklist

- Settings are registered on `customize_register`.
- Every custom setting has `sanitize_callback`.
- Select/radio values are allowlisted.
- `theme_mod` is used for theme-specific presentation settings.
- Templates escape `get_theme_mod()` output by context.
- `postMessage` settings have preview JS.
- Preview JS uses `customize_preview_init` and depends on `customize-preview`.
- Controls JS/CSS uses `customize_controls_enqueue_scripts`.
- Selective refresh partials use stable selectors and safe render callbacks.
- Theme does not store plugin-like data in Customizer settings.
- Option-backed settings have an intentional autoload value.

## Common Mistakes

- Adding controls without sanitizers because the UI "only has safe choices".
- Using `postMessage` but not enqueueing preview JavaScript.
- Echoing `get_theme_mod()` raw inside a class attribute or style attribute.
- Registering Customizer objects on `init`.
- Using `option` storage for values that should be theme-specific.
- Letting a Customizer control write arbitrary CSS without validation.

## Cross-References

- Use `wp-settings-storage-audit` to review the broader persistence contract: theme_mod vs option, array shape, defaults, autoload, REST exposure, and migration.
- Use `wp-plugin-options-storage` when the value is plugin-owned or should survive theme switching.

## References

- Official documentation: <https://developer.wordpress.org/themes/customize-api/>
- Official documentation: <https://developer.wordpress.org/themes/customize-api/customizer-objects/>
- Official documentation: <https://developer.wordpress.org/themes/customize-api/the-customizer-javascript-api/>
- Verified source paths:
  - `wp-includes/class-wp-customize-manager.php`
  - `wp-includes/class-wp-customize-setting.php`
  - `wp-includes/class-wp-customize-control.php`
  - `wp-includes/customize/class-wp-customize-selective-refresh.php`
  - `wp-includes/theme.php`
  - `wp-content/themes/storefront/inc/customizer/`
  - `wp-content/themes/generatepress/inc/customizer.php`
