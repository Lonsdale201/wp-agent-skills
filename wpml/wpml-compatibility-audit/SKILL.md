---
name: wpml-compatibility-audit
description: >-
  Audit whether a WordPress plugin or classic theme is WPML-compatible end to
  end. Use when asked "is this plugin WPML compatible?", "why does this
  shortcode/string/page not translate?", or when code has wpml-config.xml,
  stored page/product/term IDs, get_permalink/home_url, shortcode attributes,
  get_option option strings, custom tables, WooCommerce order/product data,
  emails/PDFs/background jobs, wpml_register_single_string,
  wpml_translate_single_string, wpml_object_id, wpml_permalink, or
  wpml_switch_language.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sitepress-multilingual-cms"
  wp-skills-plugin-version-tested: "4.9.5"
  wp-skills-wpml-string-translation-version-tested: "3.5.3"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-07"
---

# WPML compatibility audit

Use this to produce a verdict on a plugin/theme's WPML compatibility. This is a
workflow skill: it tells you what to inspect and how to classify problems. Use
the narrower WPML skills for implementation details once a failing area is
identified.

## Compatibility verdicts

Report one of these:

- **Compatible**: static gettext, dynamic strings, stored IDs, queries, URLs,
  and background render paths work in the current language or deliberately
  snapshot original data.
- **Partially compatible**: most static strings work, but one or more dynamic
  strings, stored IDs, shortcodes, emails/PDFs, or custom tables need fixes.
- **Not WPML-compatible**: core user-facing flows hard-code one language or one
  object ID, or rely on direct meta/option strings with no translation path.
- **Not testable**: required WPML add-ons or plugin runtime dependencies are
  missing; still report source-level risks.

## Audit workflow

1. Identify the multilingual surface:
   - Is WPML core active/installed? `defined( 'ICL_SITEPRESS_VERSION' )`.
   - Is String Translation installed? `defined( 'WPML_ST_VERSION' )` or
     `wpml_is_st_loaded()`.
   - If String Translation is missing, dynamic option/admin strings are not
     runtime-testable; the hook form still degrades to original text.
   - Is WooCommerce Multilingual relevant for products/orders?
   - Does the plugin also claim Polylang/TranslatePress compatibility?
2. Separate static gettext from dynamic strings:
   - Static UI strings using `__()`, `_e()`, `esc_html__()`, etc. are normal
     WordPress i18n. Check text domain, load timing, `.pot`, `.po/.mo`, and
     JS translations.
   - DB/admin-entered strings need WPML String Translation. They must be
     registered and translated on every output path.
3. Inventory stored object IDs:
   - Options/meta/custom tables holding page, post, product, variation, term,
     attachment, menu, or form IDs need runtime resolution with
     `wpml_object_id` or a correct `wpml-config.xml` declaration.
   - URLs derived from those IDs need `get_permalink( $translated_id )` or
     `wpml_permalink`.
4. Inspect shortcode/block behavior:
   - A shortcode's PHP-generated output still needs runtime string/ID handling.
   - Shortcode attributes/content stored inside page content need
     `wpml-config.xml` `<shortcode-list>` or rich `<shortcodes>` config when
     WPML should expose them to translators.
   - Block attributes need `<gutenberg-blocks>` config when not covered by
     normal block translation.
5. Inspect queries:
   - Default WP queries usually follow the current WPML language.
   - Queries for another language need `do_action( 'wpml_switch_language', $lang )`
     and restore with `null`.
   - Custom SQL/custom tables are not language-filtered by WPML; they need an
     explicit language column, translated joins, or deliberate snapshot logic.
6. Inspect WooCommerce paths:
   - Historical order item snapshots should usually stay as purchased.
   - Current product/category/tag links or settings should resolve translated
     IDs before display.
   - Product/category/tag meta compatibility belongs in `wpml-config.xml`
     custom-field/custom-term-field declarations.
7. Inspect async/non-page rendering:
   - Emails, PDFs, cron, REST, exports, and webhooks do not automatically have
     the same language context as the frontend request.
   - Store the request language when creating records, then switch language
     while rendering language-sensitive output and restore afterward.

## Dynamic string checklist

Find option reads/writes, settings textareas, admin-entered labels, and template
data that comes from the database.

WPML core exposes `wpml_is_st_loaded()` as `defined( 'WPML_ST_VERSION' )`.
The actual handlers are in the String Translation add-on: ST 3.5.3 registers
`wpml_register_single_string` in `inc/functions.php` and filters
`wpml_translate_single_string` with a 5-argument callback.

Correct pattern:

```php
do_action( 'wpml_register_single_string', 'my-plugin', 'button_label', $value );

$label = apply_filters(
    'wpml_translate_single_string',
    $value,
    'my-plugin',
    'button_label',
    $language_code // optional; omit for current language
);
```

Rules:

- Registering alone is not enough; output must call
  `wpml_translate_single_string`.
- Passing an explicit language is useful for emails, PDFs, exports, and jobs
  rendered outside the original frontend request.
- The hook form degrades safely when String Translation is absent.
- Legacy `icl_register_string()` / `icl_t()` must be guarded with
  `function_exists()`.
- Keep context and names stable. Changing them orphans existing translations.
- Prefer `<admin-texts>` in `wpml-config.xml` for fixed option keys, but remember
  it needs String Translation.

## Stored ID checklist

Flag every stored ID and decide whether it is a snapshot or a live reference:

- Live page/post/term/product ID for display: resolve with `wpml_object_id`.
- Live URL: use translated ID or `wpml_permalink`.
- Admin edit links and historical order/case snapshots can usually stay in the
  original object/language.
- Asset enqueueing based on `is_page( $stored_page_id )` must also account for
  the translated page ID.

Typical page-option pattern:

```php
$page_id = (int) get_option( 'my_page_id' );
$page_id = (int) apply_filters( 'wpml_object_id', $page_id, 'page', true );
$url     = $page_id > 0 ? get_permalink( $page_id ) : '';
```

## `wpml-config.xml` checklist

Check whether the plugin ships `wpml-config.xml` in the plugin root. If absent,
decide whether it needs one.

String Translation parses config through `wpml_parse_config_file` /
`wpml_parse_custom_config`. `<admin-texts>` entries are imported by ST and can
attach `option_{$option}` filters for translated option values and nested ID
translation. Without ST, `<admin-texts>` does not provide translated output.

Usually declare:

- CPTs/taxonomies the plugin owns: `<custom-types>` / `<taxonomies>`.
- Product/page/post/term meta that must copy/translate:
  `<custom-fields>` / `<custom-term-fields>`.
- Option strings: `<admin-texts>` with nested keys.
- Option IDs: `<key type="post-ids" sub-type="page" name="...">` or the
  relevant post type.
- Shortcodes: `<shortcode-list>` or `<shortcodes>` when translators must edit
  shortcode content/attributes.

Validate config values strictly: `translate`, `display-as-translated`, and
`automatic` are `0|1`; custom-field `action` is exactly
`translate|copy|copy-once|ignore`.

## Common findings

- **High**: user-facing shortcode/form output reads DB option strings but never
  calls `wpml_translate_single_string`.
- **High**: stored `withdrawal_page_id`, product ID, term ID, or attachment ID
  is used directly on translated pages.
- **High**: e-mail/PDF generation ignores the language used when the case/order
  was submitted.
- **Medium**: no `wpml-config.xml` for plugin options/meta/shortcodes.
- **Medium**: `<admin-texts>` exists, but the audit/test environment has WPML
  core without String Translation, so option-string behavior is not testable.
- **Medium**: custom table has no language column even though rows are
  language-sensitive.
- **Medium**: JS editor strings use `@wordpress/i18n` but the script never calls
  `wp_set_script_translations()`.
- **Low**: admin-only labels are gettext-ready but no translation file exists.

## Report format

Return:

- **Verdict**: Compatible / Partially compatible / Not compatible / Not testable.
- **Environment**: WPML core version, String Translation version/presence, WCML
  presence, plugin version, active competing multilingual plugins if relevant.
- **Findings**: severity, file/line, what breaks, and why.
- **Fix plan**: minimal code/config changes, grouped by string, ID/URL, query,
  shortcode/block, Woo, and async rendering.
- **Residual risk**: what still needs browser/WPML admin verification.

## Cross-references

- Use `wpml-overview` for the WPML copy/translation mental model.
- Use `wpml-config` when creating or validating `wpml-config.xml`.
- Use `wpml-string-translation` for dynamic option/admin-entered strings.
- Use `wpml-language-api` for current language, object IDs, permalinks, and
  language switching.
- Use `wp-i18n-audit` for core WordPress gettext and Loco/PO/MO issues.

## References

Validated against WPML Multilingual CMS 4.9.5 and WPML String Translation 3.5.3
local source:

- API hook registration: `sitepress.class.php`
- Runtime callbacks: `inc/template-functions.php`
- Config parsing: `classes/xml-config/class-wpml-config.php`
- String hook call sites:
  `classes/language-switcher/class-wpml-ls-settings-strings.php`
- Explicit-language string translate example:
  `classes/url-handling/class-wpml-endpoints-support.php`
- Config schema: `res/xsd/wpml-config.xsd`
- String Translation bootstrap/version: `wpml-string-translation/plugin.php`
- `wpml_register_single_string` / `wpml_translate_single_string` handlers:
  `wpml-string-translation/inc/functions.php`
- Admin text config parsing and option filters:
  `wpml-string-translation/inc/private-actions.php` and
  `wpml-string-translation/inc/admin-texts/wpml-admin-texts.class.php`
- Official documentation: <https://wpml.org/documentation/support/wpml-coding-api/>
- Official documentation: <https://wpml.org/documentation/support/language-configuration-files/>
- Official documentation: <https://wpml.org/documentation/getting-started-guide/string-translation/>
- Verified source paths:
  - `wp-content/plugins/sitepress-multilingual-cms/sitepress.php`
  - `wp-content/plugins/wpml-string-translation/inc/admin-texts/wpml-admin-text-configuration.php`
