---
name: wpml-config
description: Make a WordPress plugin/theme translatable with WPML by shipping a wpml-config.xml file. Covers the sections WPML honors — custom-fields/custom-field action="translate|copy|copy-once|ignore" (post meta), custom-term-fields (term meta), custom-fields-texts (translatable sub-keys inside serialized/JSON meta), custom-types /custom-type translate="0|1" with display-as-translated and automatic attributes, taxonomies/taxonomy translate="0|1", admin-texts /key name for options, shortcode-list (CSV) vs shortcodes (rich), built-with-page-builder, and gutenberg-blocks. Explains file discovery (plugin root, theme root, the wpml_config_array filter), the exact 0/1 boolean and action-enum values, that a typo'd action silently means "ignore", that the XSD is NOT enforced during normal parsing, and that admin-texts needs the String Translation add-on while gutenberg-blocks is handled by WPML's bundled page-builders add-on. Use when adding, auditing, or debugging a wpml-config.xml.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sitepress-multilingual-cms"
  wp-skills-plugin-version-tested: "4.9.5"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-03"
---

# WPML: the `wpml-config.xml` compatibility file

`wpml-config.xml` is the **declarative** way to tell WPML what in your plugin/theme is translatable — custom fields, custom post types, taxonomies, options, and shortcodes. It needs zero runtime code: WPML reads it and configures itself. This is the first (and often only) compatibility step for most plugins. For runtime language logic see `wpml-language-api`; for dynamic strings see `wpml-string-translation`.

## Where the file goes and when it's read

- **Plugin:** `wp-content/plugins/<your-plugin>/wpml-config.xml` (plugin root). Verified discovery at [class-wpml-config.php:152,169](class-wpml-config.php).
- **Theme:** child then parent theme root ([class-wpml-config.php:262,268](class-wpml-config.php)).
- WPML re-reads config files **in admin only**, on a whitelist of pages (`plugins.php`, `themes.php`, WPML's own pages, `string-translation.php` when ST is active), filterable via `wpml_config_white_list_pages` ([class-wpml-config.php:16-41](class-wpml-config.php)). So after editing the file, visit `Plugins` or a WPML settings page to make WPML re-parse it — it is not re-read on every front-end request.

## Skeleton (illustrative — plugin-specific keys)

```xml
<wpml-config>
    <custom-fields>
        <custom-field action="translate">subtitle</custom-field>
        <custom-field action="copy">_my_related_ids</custom-field>
        <custom-field action="copy-once">_my_layout</custom-field>
        <custom-field action="ignore">_my_cache</custom-field>
        <custom-field action="translate" encoding="json">footnotes</custom-field>
    </custom-fields>

    <custom-types>
        <custom-type translate="1">my_book</custom-type>
        <custom-type translate="0">my_log</custom-type>
    </custom-types>

    <taxonomies>
        <taxonomy translate="1">my_genre</taxonomy>
        <taxonomy translate="0">my_internal_tax</taxonomy>
    </taxonomies>

    <admin-texts>
        <key name="my_plugin_options">
            <key name="welcome_message" />
            <key name="footer_note" />
        </key>
    </admin-texts>

    <shortcode-list>my_cta,my_button</shortcode-list>
</wpml-config>
```

## The sections you'll actually use

### `<custom-fields>` — post meta (base plugin)

Each `<custom-field action="...">meta_key</custom-field>` sets how a meta key behaves across translations. The **four `action` values** are the enum honored by the parser ([class-wpml-custom-field-xml-settings-import.php:78-96](class-wpml-custom-field-xml-settings-import.php)):

| `action` | Behaviour |
|---|---|
| `translate` | Field is offered for translation; each language has its own value. |
| `copy` | Value is copied from original to every translation and kept in sync. |
| `copy-once` | Copied when the translation is first created; editable independently after. |
| `ignore` | Not touched — translations keep whatever they have (default for anything). |

Add `encoding="json"` for meta whose value is JSON (e.g. `footnotes` in WPML's own config, [wpml-config.xml:24](wpml-config.xml)). Term meta uses the identical `<custom-term-fields>/<custom-term-field action="...">` section.

**Gotcha — a typo'd `action` silently becomes "ignore".** The parser's `switch` has no validation branch; `translate`/`copy`/`copy-once` hit their cases and **everything else falls to `default` → do nothing** ([:93-95](class-wpml-custom-field-xml-settings-import.php)). `action="translated"` or `action="Translate"` therefore silently leaves the field untranslated. There is no error — see "XSD not enforced" below.

### `<custom-fields-texts>` — sub-keys inside a serialized/JSON meta

When a single meta key holds an array/JSON of many strings, declare exactly which inner keys are translatable with a nested `<key name="...">` tree (`name="*"` = any key):

```xml
<custom-fields-texts>
    <key name="footnotes">
        <key name="*"><key name="content" label="Footnote" /></key>
    </key>
</custom-fields-texts>
```

Verified shape at [wpml-config.xml:26-32](wpml-config.xml), parsed by [class-wpml-custom-field-xml-settings-import.php:112-156](class-wpml-custom-field-xml-settings-import.php).

### `<custom-types>` / `<taxonomies>` — make CPTs & taxonomies translatable

`<custom-type translate="1">slug</custom-type>` and `<taxonomy translate="1">slug</taxonomy>`. `translate` is **required** and accepts **only `0` or `1`** (the `wpml-integer-boolean` type — not `yes`/`no`/`true`). Read as `(int) $c['attr']['translate']` ([class-wpml-tm-settings-update.php:60](class-wpml-tm-settings-update.php)).

Two optional attributes on both:

- `display-as-translated="1"` — with `translate="1"`, upgrades the mode to "display as translated" (fall back to the original language when no translation exists). It's rewritten to the internal mode 2 before processing ([class-wpml-config-display-as-translated.php:21-40](class-wpml-config-display-as-translated.php)). It is an **attribute**, not a `<display-as-translated>` section.
- `automatic="1|0"` — flags the type for automatic translation ([vendor/wpml/core-api/core/settings/Automatic.php:19-30](Automatic.php)).

### `<admin-texts>` — plugin options (needs String Translation)

Declares option names (and nested keys for serialized/array options) as translatable:

```xml
<admin-texts>
    <key name="my_plugin_options">
        <key name="welcome_message" />
    </key>
    <key type="post-ids" sub-type="attachment" name="my_logo_id" />
</admin-texts>
```

`name` is the `wp_options` name; nested `<key>` are keys inside a serialized/array option. `type="post-ids" sub-type="attachment"` marks a value as an object ID to convert to the translation rather than a string to translate.

**Source-verified caveat:** the base plugin **declares** `admin-texts` in its XSD but does **not consume** it — option translation is registered by **WPML String Translation** (which hooks `wpml_config_array`). On a base-only install this section does nothing. Confirmed: `class-wpml-config.php` initialises `'admin-texts' => array()` but `merge_with()` never dispatches it, and no consumer exists in the base plugin. Gate any expectation on `defined('WPML_ST_VERSION')`.

### Shortcodes — two mechanisms

- **`<shortcode-list>tag1,tag2</shortcode-list>`** (base) — a comma-separated list of shortcode tags whose **content** WPML registers for translation. Exploded on commas at [class-wpml-config.php:432-434](class-wpml-config.php), stored via `WPML_Config_Shortcode_List`.
- **`<shortcodes><shortcode><tag>…</tag><attributes><attribute>…</attribute></attributes></shortcode></shortcodes>`** (rich) — per-tag control over content and translatable attributes; consumed by the bundled **page-builders** add-on, not core. Use `<shortcode-list>` for the simple "translate this shortcode's inner text" case.

`<built-with-page-builder><![CDATA[/<!-- wp:/]]></built-with-page-builder>` marks builder-generated content via a regex; `<gutenberg-blocks>` declares per-block translatable parts — its config is parsed by WPML's **bundled page-builders add-on** (loaded unconditionally at [sitepress.php:512](sitepress.php), so it works on a base install), though translating the block *content* additionally needs String Translation. Full section reference in `reference.md`.

## Programmatic config — the `wpml_config_array` filter

To add/modify config without a file (or for dynamically-registered post types), hook the main extension point ([class-wpml-config.php:345](class-wpml-config.php)):

```php
add_filter( 'wpml_config_array', function ( $config ) {
    $config['wpml-config']['custom-types']['custom-type'][] = [
        'value' => 'my_dynamic_cpt',
        'attr'  => [ 'translate' => 1 ],
    ];
    return $config;
} );
```

Every parsed element has the `[ 'value' => ..., 'attr' => [...] ]` shape; a single entry is that array, multiple entries are a list of them.

## Critical rules

- **`translate` / `display-as-translated` / `automatic` are `0` or `1`** — never `yes`/`no`/`true`/`false`.
- **`action` is exactly `translate` / `copy` / `copy-once` / `ignore`.** Anything else silently means "ignore" (no error).
- **The XSD is NOT enforced during normal file parsing** ([class-wpml-config.php:324](class-wpml-config.php) — validated with no XSD). Malformed elements, typo'd attributes, and wrong nesting are silently skipped, not reported. Validate your file against `res/xsd/wpml-config.xsd` yourself before shipping.
- **`admin-texts` requires String Translation** — declaring options does nothing without ST active. **`gutenberg-blocks` is handled by WPML's bundled page-builders add-on** (parsed on a base install); only translating the block *content* additionally needs ST.
- **Re-parse is admin-and-whitelisted-page only** — edit the file, then load `Plugins`/`Themes`/a WPML settings page to apply it; don't expect front-end reloads.
- **Place the file in the plugin/theme ROOT.** Subfolders are not scanned.
- **Ship the file; don't rely on WPML.org's remote config** for your own plugin — remote config is a fallback for plugins that don't ship one.

## Common mistakes

```xml
<!-- WRONG — boolean/action values WPML doesn't recognise (silently ignored) -->
<custom-type translate="yes">my_book</custom-type>
<custom-field action="translated">subtitle</custom-field>

<!-- RIGHT -->
<custom-type translate="1">my_book</custom-type>
<custom-field action="translate">subtitle</custom-field>
```

```xml
<!-- WRONG — expecting <admin-texts> to translate options on base WPML -->
<admin-texts><key name="my_option"/></admin-texts>
<!-- ...with no String Translation active → nothing happens. Gate on WPML_ST_VERSION. -->
```

## Cross-references

- **`wpml-string-translation`** — for options/dynamic strings when `admin-texts` isn't enough, and the ST dependency.
- **`wpml-language-api`** — runtime behaviour once your content is translatable.
- **`wpml-overview`** — the base-vs-add-on split and decision matrix.
- See `reference.md` for the complete honored-section table + the sections WPML does NOT support.

## What this skill does NOT cover

- **`<gutenberg-blocks>` / page-builder widget sections in depth** — declared in base XSD but consumed by ST / the page-builders add-on; see `reference.md` for the shape.
- **Options/string translation runtime** — `wpml-string-translation`.
- **Sections WPML does NOT honor** (`gettext-domains`, `custom-css`, `pages`, `post-types`, `custom-c2c-relationships`) — listed in `reference.md` so you don't invent them.

## References

- Real-world example: [wpml-config.xml](wpml-config.xml) (WPML's own).
- Schema: [res/xsd/wpml-config.xsd](wpml-config.xsd) (462 lines — every element/attribute).
- Loader/discovery + filters: [classes/xml-config/class-wpml-config.php](class-wpml-config.php) — discovery (142-274), `wpml_config_array` (345), XSD-not-enforced (324), section merge (403-444).
- Custom-field `action` parser: [classes/settings/class-wpml-custom-field-xml-settings-import.php:78-96](class-wpml-custom-field-xml-settings-import.php).
- CPT/taxonomy `translate` parser: [classes/settings/class-wpml-tm-settings-update.php:60](class-wpml-tm-settings-update.php).
- Official documentation: <https://wpml.org/documentation/support/language-configuration-files/>
