---
name: polylang-compatibility-audit
description: "Audit whether a WordPress plugin or classic theme is compatible with Polylang, Polylang Pro, and Polylang for WooCommerce. Use when asked whether code is Polylang-compatible, why a shortcode/option/page/product does not translate, or when code contains stored post/page/product/term IDs, get_permalink/home_url calls, pll_* calls, pll_register_string, PLL_Translate_Option, custom post types/taxonomies, custom tables, REST lang parameters, shortcode/block output, translated slugs, ACF/sync logic, WooCommerce products/orders/cart/Store API, emails, PDFs, cron jobs, exports, or webhooks."
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: polylang + polylang-pro + polylang-wc
plugin-version-tested: "Polylang 3.8.5 + Polylang Pro 3.8.5 + Polylang for WooCommerce 2.2.2"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://polylang.pro/doc/function-reference/
  - https://polylang.pro/doc/developpers-how-to/
  - https://polylang.pro/doc/rest-api/
  - https://polylang.pro/doc/polylang-for-woocommerce/
source-refs:
  - wp-content/plugins/polylang/polylang.php
  - wp-content/plugins/polylang/src/api.php
  - wp-content/plugins/polylang/src/translate-option.php
  - wp-content/plugins/polylang/src/query.php
  - wp-content/plugins/polylang/src/translated-post.php
  - wp-content/plugins/polylang/src/translated-term.php
  - wp-content/plugins/polylang/src/filter-rest-routes.php
  - wp-content/plugins/polylang/src/modules/REST/Request.php
  - wp-content/plugins/polylang-pro/polylang.php
  - wp-content/plugins/polylang-pro/src/modules/rest/rest-api.php
  - wp-content/plugins/polylang-pro/src/modules/sync-post/sync-post-model.php
  - wp-content/plugins/polylang-pro/src/modules/translate-slugs/translate-slugs-model.php
  - wp-content/plugins/polylang-pro/src/integrations/ACF/Main.php
  - wp-content/plugins/polylang-wc/polylang-wc.php
  - wp-content/plugins/polylang-wc/src/data-store.php
  - wp-content/plugins/polylang-wc/src/products.php
  - wp-content/plugins/polylang-wc/src/store-blocks.php
  - wp-content/plugins/polylang-wc/src/hpos-orders-query.php
  - wp-content/plugins/polylang-wc/src/modules/REST/Module.php
---

# Polylang Compatibility Audit

Use this skill to decide whether an existing plugin or classic theme is safe on a Polylang multilingual site, and to produce concrete fixes when it is not.

Polylang compatibility is not the same as WPML compatibility. Polylang stores translations as separate posts/terms connected by language and translation taxonomies, exposes public `pll_*` APIs, translates registered strings/options, and relies on runtime language context. Do not invent a `wpml-config.xml` equivalent for Polylang.

## Verdicts

Use one of these audit verdicts:

| Verdict | Meaning |
|---|---|
| Compatible | Static UI text, dynamic strings/options, stored object IDs, URLs, queries, REST/headless, WooCommerce paths, and async output all resolve in the intended language or are deliberately language-neutral snapshots. |
| Partially compatible | Core pages work, but one or more surfaces leak the default/source language, mixed-language IDs, untranslated options, wrong REST results, or wrong async output. |
| Not Polylang-compatible | The plugin/theme assumes one language globally, stores translated content as a single unregistered value, queries direct SQL without a language model, or writes Polylang private taxonomy relationships manually. |
| Not testable | The required Polylang stack, languages, translated content, Woo integration, or execution path is missing, so only static risks can be reported. |

## Audit Workflow

### 1. Identify the stack

Check which Polylang layer is relevant before judging the code:

```php
$has_polylang = function_exists( 'pll_current_language' ) || defined( 'POLYLANG_VERSION' );
$has_pro      = defined( 'POLYLANG_PRO' ) && POLYLANG_PRO;
$has_pll_wc   = defined( 'PLLWC_VERSION' ) || class_exists( 'PLLWC_Data_Store' );
```

Also record configured languages/default language, URL mode, translated post types/taxonomies, media translation state, WooCommerce HPOS/checkout-blocks/Store API/custom-order-type involvement, and whether another multilingual plugin is active.

`pll_current_language()` can return `false` in admin screens, all-language filters, CLI, cron, and other non-frontend contexts. Any code outside a normal frontend request must choose an explicit language from the object being rendered, the order/customer/request language, a saved setting, or `pll_default_language()`.

### 2. Separate static text from dynamic strings

Static strings in PHP/JS templates stay normal WordPress i18n:

```php
esc_html_e( 'Settings saved.', 'my-plugin' );
```

Audit for a valid text domain, loaded translations, `.pot` coverage, JS translations, and escaping. Do not replace all gettext calls with `pll__()`.

Admin-entered strings are different. Any option, field label, legal text, email body, popup copy, shortcode heading, or builder setting that the merchant edits in WordPress must be registered and translated through Polylang:

```php
add_action( 'admin_init', static function (): void {
    if ( function_exists( 'pll_register_string' ) ) {
        pll_register_string( 'myplugin_cta_label', get_option( 'myplugin_cta_label', '' ), 'My Plugin' );
    }
} );

$label = get_option( 'myplugin_cta_label', '' );
echo esc_html( function_exists( 'pll__' ) ? pll__( $label ) : $label );
```

`pll_register_string()` is an admin-side registration API in Polylang core. Register strings where the admin runtime can see them; frontend-only registration is a common reason strings never appear in Languages > Translations.

### 3. Audit stored object IDs and URLs

Find every stored post, page, term, product, variation, attachment, menu, form, template, and category ID. For live frontend display, translate IDs before use:

```php
$page_id = (int) get_option( 'myplugin_landing_page_id' );

if ( function_exists( 'pll_get_post' ) ) {
    $translated_id = pll_get_post( $page_id, pll_current_language() ?: pll_default_language() );
    $page_id       = $translated_id ?: $page_id;
}

$url = get_permalink( $page_id );
```

Important Polylang details:

- `pll_get_post()` and `pll_get_term()` return `0` when no translation is found; do not only check for `false`.
- Do not concatenate language slugs into URLs. Use `pll_home_url( $lang )`, translated permalinks, or the translated object ID.
- `get_permalink( $source_id )`, `is_page( $source_id )`, menu IDs, and template IDs are not automatically corrected when the ID came from your own option or custom table.
- For historical snapshots such as invoices, order line names, audit logs, and sent emails, keeping the original language can be correct. Document the intent.

### 4. Check custom post types and taxonomies

If the plugin registers content that authors translate, verify it opts in:

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

Do not mark operational records as translatable just because they are posts. Logs, queue jobs, API tokens, payment records, and internal caches should usually stay language-neutral or store a language snapshot.

Audit timing: these filters must run early enough for Polylang's model and settings UI. Late filters added after Polylang has built its object-type list may not affect admin behavior, REST fields, or query filtering.

### 5. Check object creation, import, and sync

Programmatic creation must assign language and translation relationships with public APIs:

```php
$en_id = pll_insert_post( array( 'post_type' => 'book', 'post_title' => 'Coffee Guide' ), 'en' );
$fr_id = pll_insert_post( array( 'post_type' => 'book', 'post_title' => 'Guide du cafe' ), 'fr' );
pll_save_post_translations( array(
    'en' => $en_id,
    'fr' => $fr_id,
) );
```

For existing posts/terms use `pll_set_post_language()`, `pll_set_term_language()`, `pll_save_post_translations()`, and `pll_save_term_translations()`.

Never write directly to Polylang's private language or translation taxonomies. Direct `wp_set_object_terms()` calls against internal language taxonomies can corrupt language state, miss caches, and bypass future changes.

### 6. Audit queries and custom storage

Normal `WP_Query`, taxonomy queries, and archive requests are filtered by Polylang when a current language exists. Custom code still needs review:

- `WP_Query`, `get_posts()`, `get_terms()`, and REST collections should pass the intended `lang` when running outside normal frontend context.
- Use `lang => ''` only when the code intentionally needs all languages, such as admin reports, sync screens, migrations, and cross-language selectors.
- Direct SQL against `wp_posts`, `wp_terms`, lookup tables, or custom tables is not automatically language-filtered.
- A custom table that references content needs a language model: stored translated object IDs, a `lang` column, or a documented snapshot policy.
- Cache keys must vary by language for rendered fragments, REST responses, transient HTML, and AJAX payloads.

### 7. Audit REST, AJAX, and headless flows

For REST/headless use the `polylang-rest-headless` skill for implementation details. At audit level, check:

- clients pass and preserve `lang`;
- custom REST controllers read `pll_current_language()` after Polylang REST request handling;
- custom collection routes are registered through `pll_filtered_rest_routes` only when they truly support language filtering;
- custom controllers that Polylang cannot infer identify their object type with `pll_rest_request_object_type`;
- Pro `lang` and `translations` fields are not stripped by custom response formatting;
- AJAX endpoints, admin-ajax handlers, and Store API extensions do not rely on page URL context only;
- HTTP caches and CDN rules vary by language URL, language cookie, `lang` parameter, or domain mode as appropriate.

### 8. Audit Polylang Pro assumptions

Guard all Pro-only behavior:

```php
if ( defined( 'POLYLANG_PRO' ) && POLYLANG_PRO ) {
    // Translated slugs, shared slugs, Pro REST fields, sync modules, ACF integration.
}
```

Common Pro-sensitive areas:

- translated or shared slugs mean slugs are not a stable global identifier;
- sync modules may copy selected custom fields, terms, and metas between translations;
- ACF field groups, field labels, relationship fields, and option pages may need explicit translation or ID mapping;
- block and shortcode content may be parsed/synced by Pro modules, but plugin-defined nested data still needs audit.

If a plugin stores IDs inside serialized block attributes, ACF fields, page-builder JSON, or shortcode attributes, check whether Pro sync translates them. If not, add a plugin-level mapping routine.

### 9. Audit WooCommerce separately

For WooCommerce code, use the `polylang-wc-compatibility` skill. At audit level, verify product/variation language via `PLLWC_Data_Store::load( 'product_language' )`, Woo-aware order language, HPOS `wc_get_orders()` queries with `lang`, Store API calls preserving `lang`, cart item data translating embedded IDs, language-aware SKU/global unique ID checks, and explicit language sources for emails, invoices, shipping documents, and webhooks.

Do not treat Woo products and orders as ordinary posts once Polylang for WooCommerce is active. Polylang WC owns Woo-specific product, variation, order, REST, Store API, stock, and SKU behavior.

### 10. Audit async and non-page output

The highest-risk leaks are not normal pages; they are cron tasks, Action Scheduler jobs, webhooks, admin exports, PDFs, emails, invoice generation, feed builders, and CLI commands.

For each non-page flow, answer which language should be used, where it is stored or derived, whether strings use `pll_translate_string( $string, $lang )`, whether object IDs use an explicit `$lang`, whether missing-translation fallback is deliberate, and whether output is cached or persisted per language.

## Dynamic String Checklist

For every admin-entered string, require a stable name/context, admin/settings-time `pll_register_string()`, output through `pll__()`, `pll_esc_html__()`, `pll_esc_attr__()`, or `pll_translate_string( $string, $lang )`, context escaping after translation, no registration for non-human values, `PLL_Translate_Option` for translated options/arrays, and raw option preservation during save/update.

`PLL_Translate_Option` registers option strings, translates `option_{$name}` reads, guards raw values during updates, and supports sanitize callbacks through `pll_sanitize_string_translation`. If a plugin instantiates it only in admin, frontend reads may remain untranslated; if it only runs on frontend, strings may not be registered for translators.

## Stored ID Checklist

For each stored ID, classify it:

| Stored value | Audit rule |
|---|---|
| Page/post shown on current frontend page | Translate with `pll_get_post( $id, $lang )` before permalink, title, content, or conditional checks. |
| Term/category used for query/filter UI | Translate with `pll_get_term( $id, $lang )` or query by translated term. |
| Product/variation in Woo flow | Use Polylang WC product language store or Woo-aware hooks. |
| Attachment/media | Respect Polylang media translation settings; translate only when media translation is enabled and a translated attachment exists. |
| Order/invoice/email snapshot | Usually keep saved value, but translate live labels and template strings with explicit language. |
| Admin global selector | Either show all languages with labels or store one source-language ID and map per request. |
| Custom table foreign key | Add `lang`, store per-language IDs, or document language-neutral behavior. |

## Common Findings

High severity:

- shortcode output uses one saved option string without `pll_register_string()` and `pll__()`;
- stored source-language page/product/term ID is used directly in frontend links, queries, or conditions;
- custom REST route returns mixed-language content and ignores `lang`;
- email/PDF/webhook output has no explicit language source;
- code writes directly to Polylang language/translation taxonomies;
- Woo product/order logic bypasses Polylang for WooCommerce data stores.

Medium severity:

- dynamic strings are registered only on frontend, so translators cannot edit them;
- `PLL_Translate_Option` is loaded only in one runtime and misses admin registration or frontend translation;
- translated CPT/taxonomy filters run too late;
- custom tables or direct SQL have no language column/filter;
- Pro-only features are used without `POLYLANG_PRO` guards;
- fragment caches/transients are shared across languages.

Low severity:

- `pll_e()` output is not escaped for the target context;
- code guesses language from locale or URL strings instead of Polylang APIs;
- language switcher HTML is rebuilt manually instead of `pll_the_languages()`;
- JS UI has PHP translations but no `wp_set_script_translations()` or localized translated strings.

## Report Format

When reporting an audit, use this structure:

1. Verdict: compatible, partially compatible, not compatible, or not testable.
2. Environment: Polylang core/Pro/Woo versions, languages, URL mode, Woo HPOS/Store API state if relevant.
3. Findings: severity, file/line, exact behavior, why it breaks under Polylang.
4. Fix plan: group by strings/options, stored IDs/URLs, CPT/taxonomies, queries/storage, REST/AJAX, Pro, Woo, and async output.
5. Validation: pages, languages, REST URLs, admin settings, checkout/order/email flows, and cache cases tested.
6. Residual risk: missing translations, missing Pro/Woo plugin, unavailable live languages, or untested third-party flows.

## Cross-References

Use narrower skills for implementation:

- `polylang-language-api` for current/default languages, switchers, home URLs, and public API guards.
- `polylang-strings-options` for registered strings and `PLL_Translate_Option`.
- `polylang-object-translations` for translated posts/terms, translation groups, and imports.
- `polylang-rest-headless` for REST `lang`, Pro fields, and custom controllers.
- `polylang-pro-slugs-sync-acf` for translated slugs, sync modules, and ACF behavior.
- `polylang-wc-compatibility` for Woo products, variations, orders, cart, Store API, HPOS, stock, SKU, and Woo REST.
- `wp-i18n-audit` for general WordPress gettext and JavaScript i18n.
