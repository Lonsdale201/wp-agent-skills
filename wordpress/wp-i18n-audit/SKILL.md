---
name: wp-i18n-audit
description: Audits WordPress plugin or theme PHP code for
  internationalization (i18n) correctness — text-domain consistency,
  use of escaped translation helpers (esc_html__, esc_attr__,
  esc_html_e), correct placeholder helpers (sprintf with translator
  comments, _n for plurals, _x for context), no variable text-domains,
  no concatenation inside __() calls, correct custom translation-path loading
  when needed, and matching declared Text Domain in the
  plugin/theme header. Use before plugin/theme release, when reviewing
  contributor PRs, when adding new strings, when migrating to a new
  text domain, or when a translator reports issues with the .pot file.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress i18n audit

A focused review of translation correctness in WP plugin or theme PHP. Catches the boring mistakes that cause `.pot` extraction to break, translators to ship wrong files, or strings to silently fail to translate at runtime.

## When to use this skill

Trigger when:

- The user is preparing a plugin or theme for release, especially for wp.org.
- A translator has reported missing or broken strings.
- The user is adding new user-facing strings.
- The user is migrating from one text-domain to another.
- The diff contains: `__(`, `_e(`, `_n(`, `_x(`, `_nx(`, `_ex(`, `esc_html__(`, `esc_html_e(`, `esc_attr__(`, `esc_attr_e(`, `translate(`, `load_plugin_textdomain`, `load_theme_textdomain`, `Text Domain:`.

## How to run the audit

Work through the checks below. For each finding, produce:

1. File and line.
2. The offending code (1–3 lines).
3. The fix.
4. Severity: **HIGH** (translation broken), **MEDIUM** (will break .pot extraction or one locale), **LOW** (best practice).

Do NOT silently rewrite. Produce a report; only edit on user request.

## Determine the canonical text-domain first

Before any other check, find the project's declared text-domain:

1. Open the main plugin file or `style.css` (theme).
2. Read the header — look for `Text Domain: <slug>`.
3. If absent, **derive the expected domain from the plugin folder
   slug** — since WP 4.6 wp.org-distributed plugins auto-load
   translations using the folder slug as the domain, and a missing
   header is not by itself a runtime breakage. Severity for the
   missing header alone:
   - LOW (or no finding) when the strings consistently use the folder
     slug as the domain — runtime works.
   - MEDIUM when wp.org distribution is intended (the header is still
     recommended for clarity and tooling).
   - HIGH only when the header is missing AND the strings use a
     different domain than the folder slug — runtime translation will
     not work.
4. Use the derived/declared slug as the **expected domain** for every subsequent check.

If the codebase contains multiple plugins/themes, repeat per project — do NOT mix domains across folders.

## Audit checks

### 1. Text-domain consistency

Every translation call must pass the expected domain as the last argument.

```php
// WRONG — wrong domain
__( 'Save', 'some-other-plugin' )

// WRONG — missing domain (defaults to WP core, broken extraction)
__( 'Save' )

// RIGHT
__( 'Save', 'myplugin' )
```

Flag any call where the domain literal does not match the project domain. **HIGH** if the wrong domain is used (string lands in another project's `.pot`); **MEDIUM** if missing.

### 2. No variable text-domains

```php
// WRONG — wp i18n tools cannot extract this
$d = 'myplugin';
__( 'Save', $d );
__( 'Save', MY_TEXTDOMAIN );
```

Tools like `wp i18n make-pot` parse statically. The domain MUST be a string literal. Constants and variables are skipped. **HIGH**.

### 3. No variable strings

```php
// WRONG — extractor cannot follow
__( $message, 'myplugin' )
__( "Hello $name", 'myplugin' )       // double quotes with interpolation
__( 'Hello ' . $name, 'myplugin' )    // concatenation
```

The first argument must be a static string literal. For dynamic content use `sprintf` with placeholders (check 5). **HIGH** — string never appears in `.pot`.

### 4. Use the escaped helper at the point of output

If the translated string is echoed into HTML, escape AT translation time using the right helper:

```php
// WRONG
echo __( 'Save', 'myplugin' );

// RIGHT — HTML body
echo esc_html__( 'Save', 'myplugin' );
esc_html_e( 'Save', 'myplugin' );

// RIGHT — HTML attribute
echo '<button title="' . esc_attr__( 'Save', 'myplugin' ) . '">';
```

Map:
- `__()` → builds string only, no escape (use when passing to a function that escapes later, or in non-HTML contexts).
- `_e()` → echoes unescaped (rarely correct in HTML — flag as **MEDIUM** unless context is non-HTML or escape is applied around it).
- `esc_html__` / `esc_html_e` → for HTML body.
- `esc_attr__` / `esc_attr_e` → for HTML attributes.
- For URLs in `href`/`src`, translate with `__()` then wrap with `esc_url()`.

### 5. Placeholders: sprintf, not concatenation

```php
// WRONG — translators cannot reorder, can break grammar
echo __( 'Hello, ', 'myplugin' ) . $name . __( '!', 'myplugin' );

// RIGHT
printf(
    /* translators: %s: user display name */
    esc_html__( 'Hello, %s!', 'myplugin' ),
    esc_html( $name )
);
```

Rules:
- Single placeholder: `%s` (string), `%d` (int), `%1$s` `%2$s` for ordered.
- Multiple placeholders MUST be numbered (`%1$s`, `%2$s`) so translators can reorder.
- Always add a `/* translators: %1$s: ..., %2$s: ... */` comment immediately above the call. wp i18n tools surface this in the `.pot`.
- The placeholder VALUE still needs escaping (`esc_html( $name )`) — the translation helper escapes the template, not the inserted value.

### 6. Plurals: `_n` and `_nx`

```php
// WRONG — English-centric, breaks in languages with multiple plural forms
echo $count . ' items';
printf( __( '%d items', 'myplugin' ), $count );

// RIGHT
printf(
    /* translators: %s: number of items */
    esc_html( _n( '%s item', '%s items', $count, 'myplugin' ) ),
    number_format_i18n( $count )
);
```

Use `_n` for plurals, `_nx` when context is needed. Flag any `if ( $n === 1 ) ... else ...` pattern around translated strings — that's English plural logic, doesn't generalize.

### 7. Context: `_x` and `_ex`

When a single English word has multiple meanings (e.g. "Post" = noun vs. verb), use `_x` to disambiguate for translators:

```php
$label_noun = _x( 'Post', 'noun: a blog post',  'myplugin' );
$label_verb = _x( 'Post', 'verb: to publish',   'myplugin' );
```

Flag short, ambiguous strings (`'Post'`, `'View'`, `'Order'`, `'Address'`, `'Read'`) using `__` without context — **LOW** unless the project clearly mixes meanings, then **MEDIUM**.

### 8. `load_plugin_textdomain` / `load_theme_textdomain`

Plugins distributed via wp.org since WP 4.6 have translations
auto-loaded — an explicit `load_plugin_textdomain()` call is
**recommended for self-hosted .mo files** but not strictly required
for wp.org-distributed plugins. Do not treat its absence as a HIGH
finding without first establishing whether the plugin is shipped via
wp.org.

When a self-hosted plugin needs a custom language path, registering it on
`init` is a clear, safe lifecycle choice. Do not claim that calling
`load_plugin_textdomain()` itself on `plugins_loaded` triggers the WordPress
6.7 warning: the warning occurs when a translation is actually loaded too
early, before `after_setup_theme`. The underlying bug is usually translating
user-facing strings at plugin file load. Themes load their domain on
`after_setup_theme`.

```php
add_action( 'init', function () {
    load_plugin_textdomain(
        'myplugin',
        false,
        dirname( plugin_basename( __FILE__ ) ) . '/languages/'
    );
} );
```

Check:
- Domain string matches the expected domain (header or folder slug).
  **HIGH** mismatch.
- Custom path registration is on a suitable lifecycle hook and no translation
  call executes during plugin bootstrap. Flag the actual early translation,
  not a `load_plugin_textdomain()` call in isolation.
- Path points to a real directory in the package. **MEDIUM** if
  missing on a self-hosted plugin; **LOW** for wp.org plugins where
  auto-loading covers it.

### 9. Header consistency

Plugin header (main file) or theme header (style.css) must declare `Text Domain` and ideally `Domain Path`:

```
Plugin Name: My Plugin
Text Domain: myplugin
Domain Path: /languages
```

Severity of a missing `Text Domain` header depends on whether
strings still resolve at runtime — see the rule in *Determine the
canonical text-domain first* at the top of this skill. Missing
`Domain Path` is **LOW** if the directory is the default `/languages`.

### 10. JavaScript translations

If the plugin localizes strings to JS via `wp_set_script_translations`:

```php
wp_set_script_translations( 'myplugin-script', 'myplugin', plugin_dir_path( __FILE__ ) . 'languages' );
```

In JS:
```js
import { __, _n, sprintf } from '@wordpress/i18n';
const label = __( 'Save', 'myplugin' );
```

Flag mismatched domain between PHP and JS calls. Out of scope: deep JS audit (different skill).

## Severity guide

- **HIGH:** inconsistent/wrong text-domain that breaks runtime lookup, variable
  text-domain, or dynamic first argument that extraction tools cannot find.
- **MEDIUM:** unescaped `_e` in HTML, missing translator comment on `sprintf`,
  concatenation across translated strings, an actual pre-`after_setup_theme`
  translation load, or plural handled with an English-only `if`.
- **LOW:** missing optional `Domain Path`, ambiguous short strings without `_x`
  context, or header/tooling metadata that does not break runtime lookup.
  Absence of `load_plugin_textdomain()` is no finding for a normal
  wp.org-distributed plugin.

## Report format

```
# i18n audit: <plugin/theme name>
Declared text-domain: <slug>
Header location: <file>:<line>
Date: <YYYY-MM-DD>

## HIGH
1. <file>:<line> — <issue>
   <code>
   Fix: <code>

## MEDIUM
...

## LOW
...

## Out of scope
- JS string audit (run separately if needed).
- .po / .mo file content (this skill only audits source code).
```

## Cross-references

- **`wp-security-audit`** — covers escape correctness in non-translation contexts; complementary, not redundant.
- For a release-readiness review, run `wp-security-audit`, `wp-security-secrets`, and this skill in sequence before submission.

## References

- WP Plugin i18n handbook: https://developer.wordpress.org/plugins/internationalization/
- WP Theme i18n handbook: https://developer.wordpress.org/themes/functionality/internationalization/
- `wp i18n make-pot`: https://developer.wordpress.org/cli/commands/i18n/make-pot/
- Official documentation: <https://developer.wordpress.org/plugins/internationalization/how-to-internationalize-your-plugin/>
