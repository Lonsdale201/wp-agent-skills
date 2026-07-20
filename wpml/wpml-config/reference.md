# wpml-config — reference

Complete honored-section map for `wpml-config.xml`, from the XSD (`res/xsd/wpml-config.xsd`) cross-checked against the parser (`classes/xml-config/class-wpml-config.php`, `merge_with()` / `parse_config_index()`). "Consumer" = which component actually acts on the section: **base** = sitepress core, **ST** = WPML String Translation add-on, **PB** = bundled page-builders add-on.

## All honored `<wpml-config>` child sections

| Section | Child element | Key attributes / values | Consumer | Parser ref |
|---|---|---|---|---|
| `custom-fields` | `custom-field` | `action` = `translate\|copy\|copy-once\|ignore`; `encoding` (e.g. `json`); `style` (`line\|textarea\|visual`); `label`; `group`; `translate_link_target` (0/1); `convert_to_sticky` (0/1); `type`; `sub-type` | base | class-wpml-custom-field-xml-settings-import.php:32-98 |
| `custom-term-fields` | `custom-term-field` | same as `custom-field` | base | class-wpml-custom-field-xml-settings-import.php:40-72 |
| `custom-fields-texts` | `key` | `name` (req), `label`, `type`, `sub-type`, `encoding=json`, `search-method` (`wildcards\|regex`); nestable; `name="*"` = any | base | class-wpml-custom-field-xml-settings-import.php:112-156 |
| `custom-types` | `custom-type` | `translate` (req, 0/1); `display-as-translated` (0/1); `automatic` (0/1) | base | class-wpml-tm-settings-update.php:60; Automatic.php:19-30 |
| `taxonomies` | `taxonomy` | `translate` (req, 0/1); `display-as-translated` (`automatic` is XSD-valid but only honored on `custom-type`) | base | class-wpml-config.php:88-90 |
| `admin-texts` | `key` | `name` (req); nestable for serialized options; `type="post-ids" sub-type="attachment"` for ID conversion; `encoding=json`; `search-method` | **ST** | XSD:203-209 (no base consumer) |
| `shortcode-list` | (CSV text) | comma-separated shortcode tags; content registered for translation | base | class-wpml-config.php:432-434 |
| `shortcodes` | `shortcode` → `tag` + `attributes`/`attribute` | tag: `encoding`, `encoding-condition`, `raw-html`, `label`, `ignore-content` (0/1), `type=media-url`; attribute: `type`, `sub-type`, `encoding`, `label` | **PB** | class-wpml-pb-config-import-shortcode.php:36-180 |
| `built-with-page-builder` | (CDATA regex) | marks builder-generated content | base | class-wpml-config.php:436-438 |
| `gutenberg-blocks` | `gutenberg-block` | `type` (req), `translate` (req 0/1), `label`; children `<xpath>` (opt `type=link`, `sub-type`, `label`) and/or `<key>` | **PB** (bundled; block *content* translation also needs ST) | class-wpml-config.php:412 (merge); addons/wpml-page-builders/classes/Integrations/Gutenberg/class-wpml-gutenberg-config-option.php:22-27 |
| `elementor-widgets` | `widget` | `name`; children `conditions`, `fields` (`field` with `type`/`sub-type`/`editor_type=LINE\|AREA\|VISUAL\|LINK`), `fields-in-item`, `integration-classes` | **PB** | class-wpml-config.php:414; Elementor/Config/* |
| `beaver-builder-widgets` | `widget` | same as elementor-widgets | **PB** | class-wpml-config.php:415 |
| `cornerstone-widgets` | `widget` | same | **PB** | class-wpml-config.php:416 |
| `siteorigin-widgets` | `widget` | same | **PB** | class-wpml-config.php:417 |
| `language-switcher-settings` | `key` | nested `name` tree of LS options | base | class-wpml-config.php:422-430, :83 |
| `allow-translatable-job-fields` | `allow-translatable-job-field` | `type` (req, regex), `value` (req, regex) — whitelists otherwise-untranslatable job fields | base (TM is bundled in core) | class-allow-translatable-job-fields.php:27-68 |
| `notices` | `notice` | `id` (req), `type`, `dismissible`; children `conditions` (theme/plugin, `relation=AND\|OR`), `locations`/`screenId`, `content` | base | class-wpml-config.php:419; RemoteNotices/Hooks.php |

`wpml-integer-boolean` (used by every `translate` / `display-as-translated` / `automatic` / `dismissible` / `ignore-content`) accepts **only `0` or `1`** (XSD:133-138).

## Custom-field `action` → internal status constant

`inc/constants.php:129-132`: `translate` → `WPML_TRANSLATE_CUSTOM_FIELD (2)`, `copy` → `WPML_COPY_CUSTOM_FIELD (1)`, `ignore`/unknown → `WPML_IGNORE_CUSTOM_FIELD (0)`, `copy-once` → `WPML_COPY_ONCE_CUSTOM_FIELD (3)`.

## CPT/taxonomy `translate` → mode constant

`inc/constants.php:161-163`: `0` → `WPML_CONTENT_TYPE_DONT_TRANSLATE`, `1` → `WPML_CONTENT_TYPE_TRANSLATE`, and `display-as-translated="1"` rewrites `1` → `WPML_CONTENT_TYPE_DISPLAY_AS_IF_TRANSLATED (2)`.

## File discovery order (class-wpml-config.php)

1. Active plugins → `WPML_PLUGINS_DIR/<plugin-dir>/wpml-config.xml` (:152), plus must-use plugins (:185-191).
2. Child theme (:262) then parent/template theme (:268) root.
3. Global (remote notices) config (:293-303).
4. Custom XML option (`wpml-tm-custom-xml`) — the **only** XSD-validated path (:358-395).
5. Remote override index (`wpml_config_index`) when `override_local` set or no local file (:198-248).

Extension filters: `wpml_config_array` (:345, primary), `icl_wpml_config_array` (:344), actions `wpml_parse_config_file` (:335), `wpml_parse_custom_config` (:388).

## Sections WPML does NOT honor (don't invent these)

Verified absent from XSD, parser, and the whole plugin tree:

- `<gettext-domains>` — not a config section. Static gettext strings are handled at runtime by String Translation's gettext hooks + your normal `.po`/`.mo` files, not declared here.
- `<custom-css>` — not honored.
- `<pages>` — no such section.
- `<post-types>` / `<posts>` — no such sections; automatic-translation control is the `automatic` attribute on `<custom-type>`.
- `<custom-c2c-relationships>` — not a WPML-core section.
- `<display-as-translated>` as a standalone section — it is only the `display-as-translated="1"` **attribute** on `<custom-type>`/`<taxonomy>`.

## Validating before shipping

The XSD is not enforced at parse time, so validate manually:

```bash
xmllint --noout --schema \
  wp-content/plugins/sitepress-multilingual-cms/res/xsd/wpml-config.xsd \
  your-plugin/wpml-config.xml
```
