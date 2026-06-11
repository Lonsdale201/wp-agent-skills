---
name: classic-theme-i18n-textdomain
description: Build or audit internationalization in classic WordPress themes on WP 7.0. Covers `style.css` `Text Domain` and `Domain Path`, slug-matching domains, `load_theme_textdomain()` and `load_child_theme_textdomain()` on `after_setup_theme`, WP 6.7+ early translation warnings, escaped translation functions, `_x`, `_n`, translator comments, placeholders, JavaScript translation setup, and common mistakes such as variable text domains, string concatenation, missing domains, raw translated output, or wrongly named theme `.mo` files.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-04"
docs:
  - https://developer.wordpress.org/themes/advanced-topics/internationalization/
  - https://developer.wordpress.org/themes/classic-themes/functionality/internationalization/
  - https://developer.wordpress.org/reference/functions/load_theme_textdomain/
source-refs:
  - wp-includes/l10n.php
  - wp-includes/class-wp-theme.php
  - wp-includes/link-template.php
  - wp-content/themes/storefront/style.css
  - wp-content/themes/storefront/inc/class-storefront.php
  - wp-content/themes/generatepress/style.css
---

# Classic Theme Internationalization and Text Domain

Use this when adding or reviewing translation readiness in a classic PHP theme: text domain headers, PHP strings, plural strings, context, translator comments, local `.mo` files, and JavaScript translations.

## When to Use This Skill

- Creating or reviewing a theme `style.css` header.
- Adding visible text to templates, `functions.php`, Customizer controls, menus, widgets, or comments.
- Loading bundled theme translations.
- Fixing WP 6.7+ "translations loaded too early" notices.
- Auditing text domains before release.

## Text Domain Header

Set the text domain in `style.css`.

```css
/*
Theme Name: My Theme
Text Domain: my-theme
Domain Path: /languages
*/
```

Rules:

- The text domain should match the theme slug.
- Use lowercase kebab-case, not underscores.
- Use the same literal domain in every translation call.
- `Domain Path` is relative to the theme root and starts with `/`.
- Use `/languages` unless the project has a clear reason for another directory.

## Loading Translations

For themes distributed through WordPress.org language packs, WordPress can load translations from `wp-content/languages/themes/`.

If the theme bundles its own translations, register the path on `after_setup_theme`.

```php
add_action( 'after_setup_theme', 'mytheme_load_textdomain' );

function mytheme_load_textdomain() {
	load_theme_textdomain(
		'my-theme',
		get_template_directory() . '/languages'
	);
}
```

For a child theme:

```php
add_action( 'after_setup_theme', 'mytheme_child_load_textdomain' );

function mytheme_child_load_textdomain() {
	load_child_theme_textdomain(
		'my-theme',
		get_stylesheet_directory() . '/languages'
	);
}
```

Rules:

- Load theme translations no earlier than `after_setup_theme`.
- Do not translate strings at file load time before `after_setup_theme`.
- WP 6.7+ warns when just-in-time translation loading is triggered too early.
- Theme-bundled `.mo` files are named by locale, for example `de_DE.mo`.
- Language-pack `.mo` files under `wp-content/languages/themes/` are named `my-theme-de_DE.mo`.

## Escaped Translation Functions

Prefer translate-and-escape helpers at output time.

```php
esc_html_e( 'Read more', 'my-theme' );
```

```php
printf(
	'<a href="%1$s">%2$s</a>',
	esc_url( get_permalink() ),
	esc_html__( 'Continue reading', 'my-theme' )
);
```

Use by context:

| Output context | Function |
|---|---|
| HTML text | `esc_html__()` / `esc_html_e()` |
| Attribute | `esc_attr__()` / `esc_attr_e()` |
| URL | Translate label separately; escape URL with `esc_url()` |
| Controlled inline HTML | `wp_kses()` after translation |

Rules:

- Do not echo `__()` directly into HTML unless it is escaped afterward.
- Do not use `esc_html__()` for attribute values; use `esc_attr__()`.
- Keep URLs out of translatable strings when possible.

## Context, Plurals, and Placeholders

Use context when the same English word has different meanings.

```php
echo esc_html_x( 'Post', 'noun: blog post', 'my-theme' );
echo esc_html_x( 'Post', 'verb: submit form', 'my-theme' );
```

Use plural functions for counts.

```php
$count = get_comments_number();

printf(
	esc_html(
		_n(
			'%s comment',
			'%s comments',
			$count,
			'my-theme'
		)
	),
	esc_html( number_format_i18n( $count ) )
);
```

Use numbered placeholders when translators may reorder words.

```php
printf(
	/* translators: 1: post title, 2: author name. */
	esc_html__( '%1$s by %2$s', 'my-theme' ),
	esc_html( get_the_title() ),
	esc_html( get_the_author() )
);
```

Rules:

- Add translator comments immediately before strings with placeholders.
- Do not concatenate sentence fragments.
- Do not translate dynamic values such as post titles, usernames, or option values.
- Use `number_format_i18n()` for numbers shown to users.

## JavaScript Strings

For WordPress-registered scripts that use `@wordpress/i18n`, set script translations.

```php
wp_enqueue_script(
	'mytheme-navigation',
	get_theme_file_uri( 'assets/js/navigation.js' ),
	array( 'wp-i18n' ),
	mytheme_asset_version( 'assets/js/navigation.js' ),
	array( 'in_footer' => true )
);

wp_set_script_translations(
	'mytheme-navigation',
	'my-theme',
	get_theme_file_path( 'languages' )
);
```

Rules:

- Register script translations after registering/enqueueing the script handle.
- JavaScript translations need the same text domain.
- Do not pass already-translated PHP strings into JS just to avoid JS i18n.

## Text Domain Audit

Search patterns:

```bash
rg "__\\(|_e\\(|_x\\(|_n\\(|esc_html__|esc_attr__|esc_html_e|esc_attr_e" .
```

Check:

- Every theme string has the literal theme text domain.
- No `$text_domain` variable is used in translation calls.
- No plugin text domain is used in theme-owned strings.
- No missing second argument.
- No hardcoded visible English strings remain in templates.

## Review Checklist

- `style.css` has `Text Domain` matching the theme slug.
- `Domain Path` matches bundled translation location.
- Translation loading runs on `after_setup_theme` when needed.
- No translation calls run too early at file load time.
- Output uses escaped translation functions by context.
- Plural strings use `_n()` or related helpers.
- Ambiguous strings use `_x()`/`esc_html_x()`.
- Placeholders are numbered and documented with translator comments.
- JavaScript translation setup uses `wp_set_script_translations()` when needed.

## Common Mistakes

- Using underscores in the text domain.
- Using a variable text domain, which extraction tools cannot reliably parse.
- Concatenating translatable sentence fragments.
- Echoing raw `__()` output.
- Translating dynamic user/content values.
- Naming bundled theme files `my-theme-de_DE.mo` inside the theme directory instead of `de_DE.mo`.
