---
name: wpml-string-translation
description: Register and translate a WordPress plugin's dynamic strings with WPML — option values, admin-entered labels, and other free-form text that is NOT a static gettext string. Register via do_action('wpml_register_single_string', $domain, $name, $value) and read back via apply_filters('wpml_translate_single_string', $value, $domain, $name[, $lang]); legacy equivalents are icl_register_string( $context, $name, $value) and icl_t(). CRITICAL — these handlers live in the WPML String Translation add-on, NOT the base plugin — the base only FIRES the hooks, so without ST the translate filter returns the original (safe) and register is a silent no-op, while raw unguarded icl_register_string / icl_t calls FATAL. Covers detecting ST (defined('WPML_ST_VERSION'), class_exists('WPML_String_Translation'), function_exists('icl_register_string')), the function_exists fallback wrapper pattern, and when to use wpml-config admin-texts instead. Use for translatable settings, dynamic labels, or any registered string.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sitepress-multilingual-cms"
  wp-skills-plugin-version-tested: "4.9.5"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-03"
---

# WPML: string registration & translation

For **free-form / dynamic strings** your plugin emits that WPML can't reach otherwise — option values entered in your settings, admin-defined labels, messages built at runtime. Static UI text stays on normal WordPress i18n (`__()`, `_e()` + `.po`/`.mo`); this skill is only for strings that live in the database or are generated dynamically.

## Read this first — it needs the String Translation add-on

The **base plugin only FIRES** the string hooks; the handlers that actually store and translate strings ship with the separate **WPML String Translation** add-on. Verified: there is no `add_action('wpml_register_single_string', …)` or `add_filter('wpml_translate_single_string', …)` anywhere in `sitepress-multilingual-cms`, and `icl_register_string` / `icl_t` / `icl_gettext` are **not defined** in the base plugin.

Standard WordPress hook semantics then give you a safe default **only for the hook form**:

- `apply_filters('wpml_translate_single_string', $value, …)` with no handler → **returns `$value` unchanged** (original text; safe fallback).
- `do_action('wpml_register_single_string', …)` with no handler → **silent no-op**.
- `icl_register_string()` / `icl_t()` called directly with ST inactive → **fatal `undefined function`** unless guarded.

So: prefer the hook form (degrades safely), and if you use the legacy `icl_*` functions, guard every call with `function_exists()`.

## Detecting String Translation

```php
// Preferred:
if ( defined( 'WPML_ST_VERSION' ) ) { /* ST active */ }

// Base ships a helper that does exactly this:
if ( function_exists( 'wpml_is_st_loaded' ) && wpml_is_st_loaded() ) { /* ST active */ }

// Also used internally:
class_exists( 'WPML_String_Translation' );

// Feature-detect the legacy API before calling it:
function_exists( 'icl_register_string' );
```

`wpml_is_st_loaded()` returns `defined('WPML_ST_VERSION')` ([inc/functions.php:922-924](functions.php)); `class_exists('WPML_String_Translation')` is used at [inc/translation-management/translation-management.class.php:1742](translation-management.class.php).

## Register and translate — the hook form (recommended)

Register the string once (typically when you save the option that holds it), then translate it on output:

```php
$domain = 'my-plugin';               // WPML "context" that groups your strings
$name   = 'welcome_heading';         // stable, unique per string within the domain
$value  = get_option( 'my_plugin_welcome' );

// 1) Register (no-op if ST inactive):
do_action( 'wpml_register_single_string', $domain, $name, $value );

// 2) Translate on output (returns $value unchanged if ST inactive or untranslated):
echo esc_html( apply_filters( 'wpml_translate_single_string', $value, $domain, $name ) );
```

Verified signatures in the base plugin's own call sites:
- Register (simple form) `do_action('wpml_register_single_string', $domain, $name, $value)` — [class-wpml-ls-settings-strings.php:81-86](class-wpml-ls-settings-strings.php).
- Translate `apply_filters('wpml_translate_single_string', $value, $domain, $name)` (3-arg) — [class-wpml-ls-settings-strings.php:108](class-wpml-ls-settings-strings.php); 4-arg form with an explicit target language `apply_filters('wpml_translate_single_string', $value, $domain, $name, $language_code)` — [class-wpml-endpoints-support.php:72](class-wpml-endpoints-support.php). Omit the 4th arg to let ST use the current language.

(There is also a heavier package form `do_action('wpml_register_string', $value, $name, $package, $title, $type)` used by page-builder integrations — for ordinary plugin strings use the `_single_string` form above.)

## Legacy `icl_*` form — guard it

`icl_register_string( $context, $name, $value )` and `icl_t( $context, $name, $value )` are the older API (provided by ST). They **fatal if ST is inactive**, so wrap them — this is exactly the pattern WPML ships in its theme-integration example ([docs/theme-integration/wpml-integration.php:130-142](wpml-integration.php)):

```php
function my_plugin_register_string( $context, $name, $value ) {
    if ( function_exists( 'icl_register_string' ) && trim( $value ) ) {
        icl_register_string( $context, $name, $value );
    }
}

function my_plugin_t( $context, $name, $original_value ) {
    return function_exists( 'icl_t' )
        ? icl_t( $context, $name, $original_value )
        : $original_value;   // graceful fallback
}
```

The hook form above needs no such guard (the hooks simply don't fire without ST), which is why it's preferred for new code.

## When to use `<admin-texts>` in `wpml-config.xml` instead

For **option values stored in `wp_options`**, the cleaner path is often the declarative `<admin-texts>` section in `wpml-config.xml` — WPML String Translation reads it and exposes those options for translation automatically, no `do_action('wpml_register_single_string', …)` needed:

```xml
<admin-texts>
    <key name="my_plugin_options">
        <key name="welcome_heading" />
    </key>
</admin-texts>
```

Both paths require String Translation. Use `<admin-texts>` for settings that live in an option; use runtime registration for strings built dynamically (loops, per-item labels) that don't map to a fixed option key. See `wpml-config` for the `<admin-texts>` shape.

## Critical rules

- **String registration/translation requires WPML String Translation.** Detect with `defined('WPML_ST_VERSION')` and design so your plugin still works (untranslated) without it.
- **Prefer the hook form** (`wpml_register_single_string` / `wpml_translate_single_string`) — it degrades to a no-op / passthrough with ST absent. Raw `icl_register_string` / `icl_t` fatal unguarded.
- **Guard every legacy `icl_*` call** with `function_exists()`.
- **`$domain` + `$name` must be stable.** Changing them orphans existing translations (WPML keys strings by context + name). Namespace the domain to your plugin.
- **Register before you translate.** A string that's never registered has no translation to return — the filter returns the original.
- **Don't register a static gettext string here.** Use `__()/_e()` + a `.pot` for fixed UI text; reserve this for DB/dynamic values.
- **Escape on output** as usual (`esc_html`, etc.) — the translated string is untrusted output like any other.

## Common mistakes

```php
// WRONG — direct legacy call; fatal if String Translation isn't active
echo icl_t( 'my-plugin', 'welcome', $value );

// RIGHT — hook form, safe without ST
do_action( 'wpml_register_single_string', 'my-plugin', 'welcome', $value );
echo esc_html( apply_filters( 'wpml_translate_single_string', $value, 'my-plugin', 'welcome' ) );

// WRONG — assuming translation "works" on base WPML with no ST add-on
// (the filter returns the ORIGINAL string, silently — verify WPML_ST_VERSION if you depend on it)

// WRONG — unstable name breaks saved translations on every save
do_action( 'wpml_register_single_string', 'my-plugin', 'welcome_' . time(), $value );
// RIGHT — stable name
do_action( 'wpml_register_single_string', 'my-plugin', 'welcome_heading', $value );
```

## Cross-references

- **`wpml-config`** — `<admin-texts>` for translating options declaratively (also needs ST).
- **`wpml-overview`** — the base-vs-add-on split and when strings are even the right tool.
- **`wpml-language-api`** — resolving translated object IDs (a different concern from translating strings).

## What this skill does NOT cover

- **The String Translation admin UI / scanning** — end-user workflow, not developer API.
- **`.po`/`.mo` gettext translation** of static strings — that's core WordPress i18n; `wpml-config.xml` has no `<gettext-domains>` section (see `wpml-config` reference).
- **The page-builder package form** (`wpml_register_string` with a `$package`) beyond a mention — that's for builder integrations.
- **WPML's own internal string storage schema** — interact via the hooks.

## References

- Base FIRES the hooks (handlers are in ST): register [class-wpml-ls-settings-strings.php:81-86](class-wpml-ls-settings-strings.php), translate [:108](class-wpml-ls-settings-strings.php); 4-arg translate with language [class-wpml-endpoints-support.php:72](class-wpml-endpoints-support.php).
- Graceful `function_exists` wrapper pattern: [docs/theme-integration/wpml-integration.php:130-142](wpml-integration.php).
- ST detection helper `wpml_is_st_loaded()`: [inc/functions.php:922-924](functions.php); `class_exists('WPML_String_Translation')`: [inc/translation-management/translation-management.class.php:1742](translation-management.class.php).
- WPML coding API docs: <https://wpml.org/documentation/support/wpml-coding-api/>.
- Official documentation: <https://wpml.org/documentation/support/translate-texts-in-admin-screens-with-wpml-string-translation/>
