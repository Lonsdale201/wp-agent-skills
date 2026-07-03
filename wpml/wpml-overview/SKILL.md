---
name: wpml-overview
description: Orient a developer making a WordPress plugin or theme
  compatible with WPML (sitepress-multilingual-cms). Explains WPML's
  mental model — it translates COPIES (each translation is a separate
  post/term with its own ID, linked by a trid in icl_translations),
  unlike live-translation plugins — and the three compatibility
  mechanisms — (1) a declarative wpml-config.xml, (2) the runtime
  language hook API (wpml_current_language, wpml_object_id,
  wpml_switch_language, wpml_permalink), (3) string registration
  /translation (wpml_register_string / wpml_translate_single_string).
  Covers detecting WPML with defined('ICL_SITEPRESS_VERSION'), the
  add-on split (String Translation WPML_ST_VERSION, Translation
  Management WPML_TM_VERSION, Media WPML_MEDIA_VERSION) and which
  features need which add-on, plus a decision matrix mapping intent to
  mechanism. Use when starting WPML compatibility, deciding config vs
  API vs strings, or detecting WPML / its add-ons.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: sitepress-multilingual-cms
plugin-version-tested: "4.9.5"
php-min: "7.4"
last-updated: "2026-07-03"
docs:
  - https://wpml.org/documentation/support/wpml-coding-api/
  - https://wpml.org/documentation/support/language-configuration-files/
source-refs:
  - wp-content/plugins/sitepress-multilingual-cms/sitepress.php
  - wp-content/plugins/sitepress-multilingual-cms/sitepress.class.php
  - wp-content/plugins/sitepress-multilingual-cms/inc/functions.php
  - wp-content/plugins/sitepress-multilingual-cms/compatibility/
---

# WPML: compatibility overview (orient)

For developers making a plugin or theme work correctly with **WPML** (the `sitepress-multilingual-cms` base plugin). This skill orients you — the mental model, how to detect WPML and its add-ons, and which of the three compatibility mechanisms to reach for. The mechanics of each live in dedicated skills (`wpml-config`, `wpml-language-api`, `wpml-string-translation`).

## Mental model — WPML translates COPIES

The single most important thing to internalise: **WPML creates a separate post/term for each language.** A page in English (ID 10) and its Hungarian translation (ID 42) are two distinct WP objects, linked by a shared `trid` (translation group ID) in the `icl_translations` table. WPML sets the current language, and WordPress queries return the objects **in that language**.

This is the opposite of live-translation plugins (e.g. TranslatePress) that translate one page's output on the fly. Consequences for your code:

- To display "the translation of object X in the current language", **resolve the translated ID** with `wpml_object_id` — never assume ID 10 is valid in every language.
- IDs, permalinks, and menu items are **per-language**. Don't cache an absolute URL or an object ID across a request that may switch language.
- Free-form strings your plugin outputs (option values, labels not in a `.po` file) aren't "copied" — they must be **registered** for translation (String Translation).

## Detecting WPML and its add-ons

WPML is not one plugin — the base handles languages and content copies (and bundles the Translation Management workflow); separately-installed add-ons add string/option translation (String Translation) and media (Media Translation).

```php
// Base plugin active? (defines the version constant in its bootstrap)
if ( defined( 'ICL_SITEPRESS_VERSION' ) ) { /* WPML core is active */ }

// Separately-installed add-ons (each defines its own version constant):
defined( 'WPML_ST_VERSION' );     // String Translation — string & option translation
defined( 'WPML_MEDIA_VERSION' );  // Media Translation

// Translation Management: BUNDLED in core WPML (defined in tm.php, loaded via
// Plugins::loadEmbeddedTM) — NOT a separate download. Present whenever core is,
// once enabled in setup. Detect the feature, not a "plugin":
defined( 'WPML_TM_VERSION' );
```

Verified: `ICL_SITEPRESS_VERSION` is defined in [sitepress.php:35](sitepress.php) (`'4.9.5'`) and WPML's own bootstrap guards on it ([sitepress.php:26](sitepress.php)). `WPML_TM_VERSION` is defined inside core at [tm.php:9](tm.php) (loaded via `Plugins::loadEmbeddedTM()`, [classes/plugins/Plugins.php:86](Plugins.php)) — TM ships with the base download, unlike ST/Media. The base ships a helper for the ST check — `wpml_is_st_loaded()` returns `defined( 'WPML_ST_VERSION' )` ([inc/functions.php:922-924](functions.php)); `class_exists( 'WPML_String_Translation' )` is also used internally.

**Why this matters:** option translation (`admin-texts`) and all string registration are **consumed by String Translation, not base runtime** — declaring them does nothing without the ST add-on. Gutenberg-block config, by contrast, is handled by WPML's **bundled page-builders add-on** (parsed on a base install; only translating block *content* additionally needs ST). Detect before you depend.

## The three compatibility mechanisms

| Mechanism | What it's for | Needs | Skill |
|---|---|---|---|
| **`wpml-config.xml`** | Declare which custom fields, CPTs, taxonomies, options, shortcodes are translatable/copied | base (custom fields / CPT / taxonomy); **ST** for `admin-texts`; bundled page-builders add-on for `gutenberg-blocks` | `wpml-config` |
| **Runtime language API** | Behave per-language: current/active language, resolve translated IDs, switch language, build language URLs | base | `wpml-language-api` |
| **String registration / translation** | Translate free-form strings your plugin emits (settings values, dynamic labels) | **String Translation** add-on | `wpml-string-translation` |

### Decision matrix — intent → mechanism

- "My CPT / taxonomy should be translatable" → **`wpml-config.xml`** `<custom-types>` / `<taxonomies>` (base — TM is only for the translation *workflow*, not for marking a type translatable).
- "This post meta should copy / translate / stay put across translations" → **`wpml-config.xml`** `<custom-fields action="...">` (base).
- "My plugin's option (a string in `wp_options`) should be translatable" → **`wpml-config.xml`** `<admin-texts>` **and** String Translation active.
- "I output a dynamic label / message that isn't a gettext string" → **register it** via `wpml_register_string` + translate via `wpml_translate_single_string` (ST). Static UI strings → normal WordPress i18n (`__()`), no WPML needed.
- "I need to know the current language / show content in it / link to the translation" → **runtime API** (`wpml_current_language`, `wpml_object_id`, `wpml_permalink`).
- "I query posts and want them in a specific language" → **`wpml_switch_language`** around the query, then restore.

## Where WPML ships its own compatibility

The base plugin bundles integrations for popular plugins/themes under [compatibility/](compatibility/) (`gutenberg`, `jetpack`, `Flatsome`, `GoogleSiteKit`, `disqus`, `google-sitemap-generator`, `tiny-compress-images`, `twentyseventeen`, …), wired via `compatibility/wpml-compatibility-factory.php`. When integrating a well-known plugin, check there first — the pattern may already exist. WPML also hosts remote config for many plugins (the `wpml_config_index` mechanism), so a plugin can be translatable via WPML.org's hosted `wpml-config.xml` even without shipping one.

## Critical rules

- **Detect the right layer.** `defined('ICL_SITEPRESS_VERSION')` for the base; `WPML_ST_VERSION` / `class_exists('WPML_String_Translation')` before anything string/option-translation related.
- **Prefer declarative config** (`wpml-config.xml`) over code for custom fields / CPTs / taxonomies / shortcodes — it's what WPML expects and needs no runtime hooks.
- **Never hardcode a cross-language ID or URL.** Resolve with `wpml_object_id` / `wpml_permalink` at render time.
- **Static translatable UI text is plain WordPress i18n** (`__()`, `_e()`), not WPML. WPML enters only for content copies, options, and dynamic/registered strings.
- **Degrade gracefully.** Your plugin must work with WPML absent and with the base present but an add-on missing.

## Cross-references

- **`wpml-config`** — the `wpml-config.xml` file: custom fields, CPTs, taxonomies, admin-texts, shortcodes.
- **`wpml-language-api`** — runtime language hooks: current/active language, `wpml_object_id`, `wpml_switch_language`, permalinks.
- **`wpml-string-translation`** — registering & translating dynamic strings (needs the ST add-on).

## What this skill does NOT cover

- **Mechanics of each mechanism** — see the three dedicated skills.
- **WPML's admin UI / translation editor workflow** — this is a developer-compatibility family, not an end-user guide.
- **Building a language switcher UI** — WPML provides `[wpml_language_switcher]` / the LS API; custom switchers are a separate topic.
- **The internal `icl_translations` schema** — you interact via the hook API, not the tables directly.
- **WooCommerce Multilingual (WCML)** — a separate WPML add-on with its own hooks.

## References

- Version constant + active-guard: [sitepress.php:26,35](sitepress.php).
- Public hook registration hub `SitePress::api_hooks()`: [sitepress.class.php:316-407](sitepress.class.php).
- ST-detection helper `wpml_is_st_loaded()`: [inc/functions.php:922-924](functions.php).
- Bundled compatibility integrations: [compatibility/](compatibility/) + `compatibility/wpml-compatibility-factory.php`.
- WPML coding API docs: <https://wpml.org/documentation/support/wpml-coding-api/>.
