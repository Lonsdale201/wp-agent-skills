---
name: wpml-language-api
description: Use WPML's runtime language hook API from plugin/theme code
  — read the current/active/default language, resolve the translated
  ID of a post/term, switch language around a query, and build
  language-aware URLs. Covers apply_filters('wpml_current_language','')
  and the ICL_LANGUAGE_CODE constant, apply_filters('wpml_active_languages',
  null, $args), apply_filters('wpml_default_language', null),
  apply_filters('wpml_object_id', $id, $type, $return_original_if_missing,
  $lang), do_action('wpml_switch_language', $lang) with restore via null,
  apply_filters('wpml_permalink', $url, $lang), apply_filters('wpml_home_url',''),
  apply_filters('wpml_post_language_details', null, $post_id), and
  apply_filters('wpml_element_language_details', null, $args). All are
  registered in SitePress::api_hooks(); the legacy icl_* functions
  (icl_object_id, icl_get_current_language) are deprecated since 3.2.
  Use when code must behave per-language, show the right translation,
  run a query in a specific language, or link across translations.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sitepress-multilingual-cms"
  wp-skills-plugin-version-tested: "4.9.5"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-03"
---

# WPML: the runtime language API

For plugin/theme code that must behave **per language** — know the current language, show the correct translation of a post/term, query in a specific language, or build language-aware URLs. WPML exposes this as a set of `wpml_*` **hooks** (not global functions), all registered in `SitePress::api_hooks()` ([sitepress.class.php:316-407](sitepress.class.php)). The legacy `icl_*` global functions still exist but are deprecated since 3.2 in favour of these hooks.

## Why hooks, not function calls

WPML deliberately exposes its API as filters/actions so your code works whether or not WPML is active: `apply_filters('wpml_current_language','')` returns your passed default (`''`) when WPML is absent, instead of a fatal `undefined function`. Always call through the hook, and treat the WPML-absent return as the graceful fallback.

## Current / active / default language

```php
// Current language code (2-letter). Pass '' — it's the ignored default.
$current = apply_filters( 'wpml_current_language', '' );          // e.g. 'hu'

// Or the constant (defined once per request at sitepress.class.php:485-487):
$current = defined( 'ICL_LANGUAGE_CODE' ) ? ICL_LANGUAGE_CODE : '';

// Default (site) language:
$default = apply_filters( 'wpml_default_language', null );        // e.g. 'en'

// All active languages, keyed by code:
$langs = apply_filters( 'wpml_active_languages', null, [ 'skip_missing' => 0, 'orderby' => 'code' ] );
// $langs['hu'] => [ 'code','native_name','translated_name','url','flag','active', ... ]
```

Verified registrations: `wpml_current_language` [sitepress.class.php:341](sitepress.class.php), `wpml_default_language` [:380](sitepress.class.php), `wpml_active_languages` [:374](sitepress.class.php) (callback `wpml_get_active_languages_filter`, [inc/template-functions.php:124](template-functions.php)).

## `wpml_object_id` — resolve the translation of a post/term

The workhorse. Given an ID in one language, return its counterpart in another (default: current) language. Use it whenever you have a hardcoded/stored ID and must show the right translation.

```php
$translated_id = apply_filters(
    'wpml_object_id',
    $element_id,                 // post_id or term_id
    'post',                      // 'post' | 'page' | CPT slug | 'category' | 'post_tag' | taxonomy | 'nav_menu' | 'any'
    true,                        // $return_original_if_missing: true → original id when no translation; false → null
    null                         // target language (null = current)
);
```

Verified at [sitepress.class.php:378](sitepress.class.php) (callback `wpml_object_id_filter`, [inc/template-functions.php:381](template-functions.php); underlying `SitePress::get_object_id()` [sitepress.class.php:4644](sitepress.class.php)). Legacy `icl_object_id()` ([template-functions.php:353](template-functions.php)) is deprecated 3.2 and just wraps this filter.

**Rule:** pass `$return_original_if_missing = true` for display (so you never render a blank when a translation is missing), `false` when you specifically need "is there a translation?".

## `wpml_switch_language` — run code in a specific language

To query or render as another language, switch, do the work, then **restore by passing `null`**:

```php
do_action( 'wpml_switch_language', 'de' );   // switch to German

$posts = get_posts( [ 'post_type' => 'product', 'numberposts' => 5 ] ); // now returns German posts

do_action( 'wpml_switch_language', null );   // ALWAYS restore
```

Verified at [sitepress.class.php:406](sitepress.class.php) → `wpml_switch_language_action` ([template-functions.php:1380](template-functions.php)) → `SitePress::switch_lang()` ([sitepress.class.php:1203](sitepress.class.php)); `null` restores the cached `original_language` ([:1214-1219](sitepress.class.php)). Passing `'all'` widens queries to every active language. WPML fires `do_action('wpml_language_has_switched', $code, $cookie_lang, $original)` after each switch ([:1234](sitepress.class.php)) if you need to react.

**Rule:** every switch must be paired with a restore (`null`), even on early return / exception — otherwise the rest of the request runs in the wrong language.

## Language-aware URLs

```php
// Home URL in the current language:
$home = apply_filters( 'wpml_home_url', '' );

// Convert any URL to a target language (null = current):
$url = apply_filters( 'wpml_permalink', $url, $lang_code );
// 3rd arg $absolute_url = true resolves the object behind the URL and finds the
// matching translation's URL — heavier; use only when you don't already know the language.

// Ready-made <a> link to the translation of an element:
$link = apply_filters( 'wpml_element_link', $element_id, 'post' );
```

`wpml_home_url` [sitepress.class.php:373](sitepress.class.php); `wpml_permalink` is registered in a class action ([classes/API/Hooks/class-wpml-api-hook-permalink.php:17,29](class-wpml-api-hook-permalink.php)) and runs the result through `esc_url_raw()`; `wpml_element_link` [sitepress.class.php:377](sitepress.class.php). WPML emits `hreflang`, canonical, and the switcher itself — you don't build those.

## Language details of a post / element

```php
// Post: array with language_code, locale, text_direction, display_name, native_name, different_language (or WP_Error)
$info = apply_filters( 'wpml_post_language_details', null, $post_id );

// Any element (post or term): object with trid, language_code, source_language_code
$details = apply_filters( 'wpml_element_language_details', null, [
    'element_id'   => $term_taxonomy_id,   // post_id for posts, term_taxonomy_id for terms
    'element_type' => 'post_product',      // WPML element type — see wpml_element_type
] );

// Translate a WP type to a WPML element type ('post_{cpt}' / 'tax_{taxonomy}'):
$wpml_type = apply_filters( 'wpml_element_type', 'product' );  // 'post_product'
```

`wpml_post_language_details` [sitepress.class.php:381](sitepress.class.php) (callback returns keys at [template-functions.php:817-824](template-functions.php)); `wpml_element_language_details` [:401](sitepress.class.php); `wpml_element_type` [:391](sitepress.class.php).

## Critical rules

- **Call through the hook, not the `icl_*` function.** `wpml_current_language` / `wpml_object_id` / etc. are the supported API; `icl_get_current_language` / `icl_object_id` are `@deprecated 3.2`. The hooks also no-op safely when WPML is absent.
- **Never store or cache a cross-language ID / URL.** They are per-language; resolve with `wpml_object_id` / `wpml_permalink` at the point of use.
- **Always restore after `wpml_switch_language`** by calling it with `null` — wrap in try/finally if the work can throw.
- **`wpml_object_id` for display uses `$return_original_if_missing = true`** so a missing translation falls back to the original instead of vanishing.
- **`wpml_active_languages` returns an array keyed by language code**, not a list — iterate keys or `array_keys()`.
- **Don't read `ICL_LANGUAGE_CODE` before WPML initialises it** ([sitepress.class.php:485](sitepress.class.php), set during WPML init). In early hooks prefer `apply_filters('wpml_current_language','')`.

## Common mistakes

```php
// WRONG — hardcoded ID renders the wrong language's object
echo get_the_title( 123 );

// RIGHT — resolve to the current language first
$id = apply_filters( 'wpml_object_id', 123, 'post', true );
echo get_the_title( $id );

// WRONG — switch without restore leaves the request in 'de'
do_action( 'wpml_switch_language', 'de' );
return $this->build_feed(); // rest of request now German

// RIGHT — restore, even on the early-return path
do_action( 'wpml_switch_language', 'de' );
try { return $this->build_feed(); }
finally { do_action( 'wpml_switch_language', null ); }

// WRONG — calling the deprecated function directly (fatals if WPML inactive)
$lang = icl_get_current_language();
// RIGHT
$lang = apply_filters( 'wpml_current_language', '' );
```

## Cross-references

- **`wpml-overview`** — the "WPML translates copies" model that makes `wpml_object_id` necessary.
- **`wpml-config`** — declare which content types are translatable in the first place.
- **`wpml-string-translation`** — translate dynamic strings (a different concern from resolving object IDs).

## What this skill does NOT cover

- **String / option translation** — `wpml-string-translation`.
- **Declaring translatable content** — `wpml-config`.
- **Building language switchers / hreflang / sitemaps** — WPML generates these; the SEO/URL internals are out of scope here.
- **The `icl_translations` table schema** — interact via the hooks, not the tables.

## References

- Hook registration hub: [sitepress.class.php:316-407](sitepress.class.php) — current(341), active(374), default(380), object_id(378), home_url(373), element_link(377), post_language_details(381), element_language_details(401), element_type(391), switch_language(406).
- `switch_lang()` + restore + `wpml_language_has_switched`: [sitepress.class.php:1203-1234](sitepress.class.php).
- `ICL_LANGUAGE_CODE` define: [sitepress.class.php:485-487](sitepress.class.php).
- Callbacks + deprecated `icl_*` wrappers: [inc/template-functions.php](template-functions.php).
- `wpml_permalink` class action: [classes/API/Hooks/class-wpml-api-hook-permalink.php:17-40](class-wpml-api-hook-permalink.php).
- Official documentation: <https://wpml.org/documentation/support/wpml-coding-api/>
