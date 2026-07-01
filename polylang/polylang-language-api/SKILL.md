---
name: polylang-language-api
description: "Use Polylang 3.8.5 safely from WordPress plugins or classic themes. Covers guards, current/default language lookup, language fields and objects, language lists, localized home URLs, language switchers, translated post type/taxonomy registration, and common mistakes such as reading $_GET['lang'], assuming a current language exists in admin/REST/CLI, or hardcoding language URL prefixes. Use when code calls pll_current_language, pll_default_language, pll_languages_list, pll_the_languages, pll_home_url, pll_is_translated_post_type, pll_is_translated_taxonomy, pll_get_post_types, or pll_get_taxonomies."
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: polylang
plugin-version-tested: "Polylang 3.8.5"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-01"
docs:
  - https://polylang.pro/doc/function-reference/
  - https://polylang.pro/doc/developpers-how-to/
source-refs:
  - wp-content/plugins/polylang/polylang.php
  - wp-content/plugins/polylang/src/api.php
  - wp-content/plugins/polylang/src/switcher.php
  - wp-content/plugins/polylang/src/translated-post.php
  - wp-content/plugins/polylang/src/translated-term.php
  - wp-content/plugins/polylang/src/filter-rest-routes.php
  - wp-content/plugins/polylang/src/frontend/choose-lang.php
---

# Polylang Language API

Use this skill when plugin or classic theme code needs to detect, list, switch, or route by Polylang languages.

Polylang's public API lives in `wp-content/plugins/polylang/src/api.php`. Prefer those functions over `PLL()->...` internals. The `PLL()` accessor exists, but the source itself says API functions are preferred because internals may change.

## Load and guard

Polylang may be inactive, may not have languages yet, or may be running in admin/REST/CLI without a current language. Always guard public API use:

```php
if ( ! function_exists( 'pll_current_language' ) ) {
    return;
}

$lang = pll_current_language();
if ( ! $lang ) {
    $lang = pll_default_language();
}

if ( ! $lang ) {
    return;
}
```

Do not read `$_GET['lang']` directly as your language model. Let Polylang define the current language, then read it through `pll_current_language()`.

## Current and default language

`pll_current_language( $field = 'slug' )` returns the current language on frontend, the admin language filter in admin, and `false` if no current language exists. Useful fields include:

```php
$slug   = pll_current_language();          // e.g. "en"
$locale = pll_current_language( 'locale' ); // e.g. "en_US"
$name   = pll_current_language( 'name' );
$lang   = pll_current_language( \OBJECT ); // PLL_Language object.
```

`pll_default_language( $field = 'slug' )` has the same field behavior and returns `false` if no default language exists yet.

Since Polylang 3.4, composite language term properties are accepted:

```php
$term_taxonomy_id = pll_current_language( 'language:term_taxonomy_id' );
$term_language_tt = pll_default_language( 'term_language:term_taxonomy_id' );
```

Use composite fields only when you need SQL joins or taxonomy term IDs. For most code, use slugs.

## List languages

Use `pll_languages_list()` for language lists:

```php
$slugs = pll_languages_list();

$locales = pll_languages_list( array(
    'fields' => 'locale',
) );

$active_slugs = pll_languages_list( array(
    'fields'     => 'slug',
    'hide_empty' => true,
) );
```

`hide_empty` removes languages without posts. `hide_default` is also accepted by the implementation even though it is not documented in the short API block.

Do not derive languages from installed `.mo` files or locales. Polylang languages are stored as language terms and carry URL, flag, ordering, active/default, and term property data.

## URLs and switchers

Use `pll_home_url( $lang )` for localized home URLs:

```php
$url = pll_home_url( 'fr' );
```

If no language or links model is available, the function falls back to `home_url( '/' )`. Do not build URLs by concatenating `/$lang/`; Polylang supports query-arg, directory, subdomain, and domain modes.

For a rendered switcher:

```php
if ( function_exists( 'pll_the_languages' ) ) {
    pll_the_languages( array(
        'show_flags' => 1,
        'show_names' => 1,
    ) );
}
```

For custom markup, ask for raw data and escape output yourself:

```php
$items = pll_the_languages( array(
    'raw'  => 1,
    'echo' => 0,
) );

foreach ( $items as $item ) {
    printf(
        '<a href="%s" lang="%s"%s>%s</a>',
        esc_url( $item['url'] ),
        esc_attr( $item['locale'] ),
        ! empty( $item['current_lang'] ) ? ' aria-current="true"' : '',
        esc_html( $item['name'] )
    );
}
```

`pll_the_languages()` returns an empty string or empty array outside the frontend if the links model is not available.

## Translated post types and taxonomies

Check whether Polylang manages a type before adding language-dependent logic:

```php
if ( function_exists( 'pll_is_translated_post_type' ) && pll_is_translated_post_type( 'book' ) ) {
    // Language-aware code for the book CPT.
}

if ( function_exists( 'pll_is_translated_taxonomy' ) && pll_is_translated_taxonomy( 'genre' ) ) {
    // Language-aware taxonomy code.
}
```

To opt in programmatically, hook early:

```php
add_filter( 'pll_get_post_types', static function ( array $types, bool $is_settings ): array {
    $types['book'] = 'book';
    return $types;
}, 10, 2 );

add_filter( 'pll_get_taxonomies', static function ( array $taxonomies, bool $is_settings ): array {
    $taxonomies['genre'] = 'genre';
    return $taxonomies;
}, 10, 2 );
```

The source comments explicitly say these filters must be added early: in `plugins_loaded` for plugins or directly in `functions.php` for themes. Polylang caches the translated type lists after `after_setup_theme`, so late filters can appear to work in settings but fail at runtime.

Use `$is_settings` if you want a type forced on but hidden from the Polylang settings UI:

```php
add_filter( 'pll_get_post_types', static function ( array $types, bool $is_settings ): array {
    if ( ! $is_settings ) {
        $types['internal_doc'] = 'internal_doc';
    }
    return $types;
}, 10, 2 );
```

## Admin, REST, and CLI caveats

- In admin, `pll_current_language()` can be the admin language filter or `false` when "all languages" is selected.
- In REST, Polylang sets the current language from the `lang` request parameter if present.
- In cron/CLI/background jobs, there may be no current language. Pass an explicit language slug to downstream APIs instead of relying on current language.
- Invalid or missing language setup returns `false` or safe fallbacks. Treat that as a real state, not an exceptional edge case.

## Common mistakes

- Do not call `PLL()->curlang->slug` without checking that `PLL()->curlang` is a language object.
- Do not concatenate language slugs into URLs.
- Do not use flag codes as locales or locale strings as language slugs.
- Do not translate all public CPTs/taxonomies blindly. Some post types are operational data, not content.
- Do not assume `pll_current_language()` returns a string. It can return `false`, `int`, array values, or a `PLL_Language` object depending on `$field`.
- In namespaced PHP, pass `\OBJECT` when requesting a `PLL_Language` object.

## Cross-references

- Use `polylang-object-translations` to resolve translated post/term IDs or save translation groups.
- Use `polylang-rest-headless` for REST `lang` parameters and Pro REST fields.
- Use `polylang-wc-compatibility` for products, variations, orders, SKU uniqueness, and Woo REST.

## Verification

Local source checked against:

- Polylang public API: `wp-content/plugins/polylang/src/api.php`
- Type opt-in filters: `wp-content/plugins/polylang/src/translated-post.php` and `translated-term.php`
- Switcher filters and raw output: `wp-content/plugins/polylang/src/switcher.php`
- REST language detection: `wp-content/plugins/polylang/src/rest-request.php`
