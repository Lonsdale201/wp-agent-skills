---
name: wp-style-engine
description: >-
  Generate and audit block-style CSS with WordPress's public Style Engine
  functions. Covers wp_style_engine_get_styles,
  wp_style_engine_get_stylesheet_from_css_rules,
  wp_style_engine_get_stylesheet_from_context, style objects, preset tokens,
  selectors, rule groups, request-local contexts, optimized output,
  WP_Style_Engine_CSS_Declarations, WordPress 7.1 declaration options and
  !important support, and the security boundary around selector and at-rule
  input. Use when a block, theme, or plugin turns structured style data into
  CSS or must share generated rules without hand-building declarations.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.1 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Style Engine

Use the Style Engine when input already follows WordPress's structured block
style shape or when several selector/declaration pairs must become one
stylesheet. It reduces hand-built CSS and preserves preset-token conventions,
but it is not a general CSS parser and it does not make arbitrary selectors or
at-rules trustworthy.

## Choose the public entry point

| Need | Function |
|---|---|
| Convert one block/theme style object to declarations, CSS, and class names | `wp_style_engine_get_styles()` |
| Compile multiple selector/declaration rules | `wp_style_engine_get_stylesheet_from_css_rules()` |
| Compile rules accumulated under a request-local context | `wp_style_engine_get_stylesheet_from_context()` |

Core explicitly marks `WP_Style_Engine` itself as internal and directs
extenders to `wp_style_engine_get_styles()`. Do not call its parsing,
compilation, or store methods directly merely because they are public PHP
methods.

## Generate styles for one block

```php
$generated = wp_style_engine_get_styles(
	array(
		'color'      => array( 'text' => 'var:preset|color|contrast' ),
		'dimensions' => array( 'minWidth' => '18rem' ),
	),
	array(
		'selector' => '.acme-card',
		'context'  => 'acme-card',
	)
);

$class_names = $generated['classnames'] ?? '';
$css         = $generated['css'] ?? '';
```

The return keys are conditional; do not assume `css`, `declarations`, or
`classnames` always exists. Preset strings can become CSS variables and class
names. When outputting a dynamic block, combine plugin-owned classes with
`get_block_wrapper_attributes()` and escape any additional attribute values.

WordPress 7.1 adds Style Engine support relevant to
`background.gradient` and `dimensions.minWidth`. The registered block and
theme settings still determine whether editor controls are offered; generating
CSS does not grant support to a block by itself.

## Compile a stylesheet

```php
$css = wp_style_engine_get_stylesheet_from_css_rules(
	array(
		array(
			'selector'     => '.acme-card',
			'declarations' => array(
				'color'   => '#222',
				'padding' => '1rem',
			),
		),
		array(
			'rules_group'  => '@media (max-width: 48rem)',
			'selector'     => '.acme-card',
			'declarations' => array( 'padding' => '0.75rem' ),
		),
	),
	array(
		'optimize' => true,
		'prettify' => defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG,
	)
);

if ( '' !== $css ) {
	wp_add_inline_style( 'acme-card', $css );
}
```

Rules without a non-empty selector or declarations are skipped. `rules_group`
supports parent selectors and nested at-rules, but both it and `selector` are
structural input owned by the caller. Never interpolate request data, database
labels, post content, or remote values into either field.

Declaration properties are normalized and values pass through WordPress safe
CSS filtering during compilation. That is not enough to make attacker-chosen
rule structure safe.

## WordPress 7.1 declaration objects

In WordPress 7.1, a stylesheet rule may receive a
`WP_Style_Engine_CSS_Declarations` object and retain per-declaration options.
This is the supported way to request `!important` from this API:

```php
$declarations = new WP_Style_Engine_CSS_Declarations();
$declarations->add_declaration(
	'display',
	'none',
	array( 'important' => true )
);

$css = wp_style_engine_get_stylesheet_from_css_rules(
	array(
		array(
			'selector'     => '.acme-is-hidden',
			'declarations' => $declarations,
		),
	)
);
```

Use `!important` only for a measured cascade requirement, not as a default.
The option is appended only when the filtered result is one valid declaration.
Feature-detect the WordPress version before passing the object when supporting
7.0 or older; prior versions documented declarations as arrays.

## Contexts are runtime aggregation, not persistence

Passing the same non-empty `context` and selectors stores rules in the Style
Engine registry for the current PHP request. Later,
`wp_style_engine_get_stylesheet_from_context( 'acme-card' )` compiles that
store. It does not save rules to the database or carry them into another
request.

Use a namespaced context, emit the result once, and avoid mixing unrelated
frontend/admin/editor policies into the same store. A context is an aggregation
key, not a CSS scoping boundary or an authorization mechanism.

## Security and correctness rules

- Allowlist selector patterns and rule groups; never accept raw user CSS here.
- Keep untrusted style values within a deliberately supported property map.
- Do not mistake declaration sanitization for complete CSS-policy validation.
- Do not emit the same context repeatedly or combine inline output with a
  second hand-built copy of the same rule.
- Treat empty output as valid; malformed or filtered declarations can vanish.
- Use stable plugin-owned selectors rather than generated editor class names.
- Test editor canvas and frontend separately, including WordPress 7.1's always
  iframed post editor.
- Test RTL, preset changes, user Global Styles, responsive groups, and CSS
  source order before adding specificity or `!important`.

Read `references/output-and-testing.md` for context and security probes.

## Related skills

- `wp-block-registration-and-assets` for block metadata and wrapper output.
- `block-theme-global-styles` for WordPress 7.1 theme.json responsive states.
- `wp-block-editor-iframe-compatibility` for editor asset placement.
- `wp-plugin-assets-loading` for registering and printing the target stylesheet.

## References

- WordPress core: `wp-includes/style-engine.php`.
- WordPress core: `wp-includes/style-engine/class-wp-style-engine.php`.
- WordPress core: `wp-includes/style-engine/class-wp-style-engine-css-declarations.php`.
- <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-style-engine/>
- <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
