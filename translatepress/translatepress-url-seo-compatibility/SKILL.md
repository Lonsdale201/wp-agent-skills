---
name: translatepress-url-seo-compatibility
description: Audit or implement TranslatePress-compatible URLs, routing, slugs, SEO metadata, sitemaps, hreflang, canonical links, redirects, AJAX URLs, REST routes, WooCommerce permalinks, and Different Domain per Language behavior. Use when plugin/theme code builds links, parses REQUEST_URI, registers CPT/taxonomy rewrites, emits SEO tags or sitemaps, caches absolute URLs, handles forms on translated URLs, or must work with the TranslatePress SEO Pack and Multiple Domains add-ons.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "translatepress-multilingual + translatepress-business"
  wp-skills-plugin-version-tested: "TranslatePress Multilingual 3.2.1 + Business 1.8.2"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-17"
---

# TranslatePress URL, SEO, And Domain Compatibility

TranslatePress rewrites internal URLs for the active language. The Business SEO Pack can translate slugs and extend sitemaps; Different Domain per Language can map each language to another host. Plugin/theme code must use WordPress URL APIs, avoid manual language-prefix logic, and vary caches by language and host.

## When to use this skill

Trigger when ANY of the following is true:

- Code calls `home_url()`, `site_url()`, `get_permalink()`, `get_term_link()`, `post_type_link`, `term_link`, `rest_url()`, `admin_url()`, or manually builds absolute links.
- Code parses `$_SERVER['REQUEST_URI']`, performs redirects, registers rewrites, or handles forms on translated pages.
- The task mentions TranslatePress SEO Pack, URL Slug Translation, `trp_get_url_for_language`, `trp_translate_slugs_on_internal_links`, `trp_hreflang`, Different Domain per Language, multilingual sitemap, translated WooCommerce slugs, CORS, canonical, or hreflang.

## Generate URLs safely

Prefer WordPress URL functions and let TranslatePress filter them:

```php
$url = get_permalink( $post_id );
```

When a URL is output in an unusual place or must target a specific language, use the documented URL converter:

```php
if ( class_exists( 'TRP_Translate_Press' ) ) {
    $trp = TRP_Translate_Press::get_trp_instance();
    $url_converter = $trp->get_component( 'url_converter' );
    $url = $url_converter->get_url_for_language( 'de_DE', $source_url, '' );
}
```

Keep the third parameter as an empty string unless you have source-confirmed reasons to do otherwise.

Never manually prepend `/en/`, strip the first path segment, or concatenate language slugs from settings. That breaks translated slugs, default-language subdirectory mode, unpublished languages, and domain mapping.

## External links

TranslatePress can inspect external links for URL translation. If an external link must never be rewritten, mark it explicitly:

```php
echo '<a href="https://facebook.com/example" data-no-translation-href>Facebook</a>';
```

For JS-generated external links, use `trp_skip_strings_from_dynamic_translation_for_substrings` to exclude URL substrings from dynamic href translation.

## SEO Pack behavior

The SEO Pack source wires these behaviors:

- adds SEO node accessors for image alt, meta description/open graph/Twitter tags, page title, and selected schema.org JSON-LD keys;
- registers String Translation types for taxonomy, term, post slug, post type base slug, and WooCommerce slug translation;
- hooks `plugins_loaded` priority `3` to translate `REQUEST_URI` back to default-language slugs so WordPress can resolve the request;
- filters internal link hooks such as `post_type_link`, `page_link`, `post_link`, `post_type_archive_link`, `term_link`, `get_pagenum_link`, `attachment_link`, and WooCommerce URL hooks;
- filters `trp_get_url_for_language` through slug translation;
- extends Yoast, Rank Math, SEOPress, AIOSEO, and related sitemap output with alternate language URLs;
- checks public post/term slug uniqueness against TranslatePress slug tables.

Audit plugin/theme code against this behavior. If code bypasses WordPress link APIs or parses original slugs directly, it can fail on translated slugs.

## CPT and taxonomy rules

Register public post types and taxonomies early and deterministically:

```php
register_post_type( 'event', array(
    'public'             => true,
    'publicly_queryable' => true,
    'rewrite'            => array( 'slug' => 'events' ),
    'has_archive'        => true,
) );
```

Do not change rewrite slugs per language in your plugin/theme. SEO Pack owns translated slugs. After changing CPT/taxonomy rewrite definitions, flush permalinks through normal deployment/admin activation flow, not on every request.

Private/non-public post types should stay non-public. SEO Pack skips slug uniqueness changes for non-public post types because modifying private editor/template slugs can break WordPress internals.

## Request parsing and redirects

Avoid direct `$_SERVER['REQUEST_URI']` routing. TranslatePress SEO Pack may temporarily rewrite it so WordPress resolves translated slug requests.

Use WP conditionals and query vars:

```php
add_action( 'template_redirect', static function (): void {
    if ( ! is_singular( 'event' ) ) {
        return;
    }
    // Safe page-specific logic here.
} );
```

If your plugin has a custom front-end endpoint that SEO Pack misidentifies as a translatable slug path, use source-confirmed filters:

- `trp_is_rest_api` for REST-like/custom API requests.
- `trp_is_admin_link` for admin/login-like URLs.
- `trp_is_form_for_request_uri` for POST/form requests that should not redirect.
- `trp_allow_redirect_to_translated_url` to stop a translated-slug redirect for a specific URL.
- `trp_redirect_status` or `trp_redirect_to_translated_slug_url` only when changing redirect behavior intentionally.

Do not add broad filters that disable slug translation sitewide.

## WooCommerce URL details

SEO Pack has special handling for WooCommerce gettext slugs:

- `product`
- `product-category`
- `product-tag`

It reads actual WooCommerce permalink settings, handles custom bases, and avoids unsafe replacement of composite bases such as `%product_cat%` paths. If your WooCommerce extension builds product/category/tag links, use WooCommerce and WordPress URL APIs, not hardcoded `/product/` paths.

For account/reset-password flows, test translated My Account URLs. SEO Pack adjusts reset password cookie paths for translated account URLs.

## Different Domain per Language

Different Domain per Language is Business/Developer-only and, in Business 1.8.2, requires main TranslatePress `3.0.3+`.

Source behavior to account for:

- domain mappings are stored in `trp_settings['trp-multiple-domains']`;
- mapped domains are normalized to protocol + host;
- default-language subdirectory mode is disabled while domain mapping is active;
- current language is set from host on `plugins_loaded` priority `2`;
- language-slug URLs redirect to mapped domains on priority `3`;
- admin/login requests on secondary domains redirect to the main domain on priority `4`;
- WordPress URL, asset URL, upload, srcset, AJAX, sitemap, and some builder/font URLs are filtered to the current host;
- Yoast and Rank Math sitemap caching is disabled when mapped domains are active because sitemap output must vary by hostname.

Do not bake the main domain into cached CSS, JS config, sitemap XML, schema JSON, canonical tags, or REST responses. Vary by host or generate late.

## AJAX, REST, and CORS

For public front-end endpoints:

- Prefer same-origin REST URLs generated at render time.
- Do not assume `admin_url( 'admin-ajax.php' )` is valid from every language domain.
- Avoid absolute asset URLs in static CSS generated on the main domain; use relative URLs where possible.
- If you must cache endpoint URLs in JS config, vary by host and language.

Different Domain per Language includes specific fixes for Elementor fonts/CSS, Breakdance fonts, file blocks, srcset, upload URLs, and Automatic Language Detection AJAX URLs. Your plugin does not automatically get that coverage for custom hardcoded URLs.

## Sitemaps, canonical, and hreflang

If your plugin emits SEO output:

- Use the final translated URL for canonical and `og:url`.
- Include all published language alternates when generating a sitemap-like feed.
- Do not cache sitemap output without varying by hostname and language/domain mapping.
- Respect `trp_disable_languages_sitemap`, `trp_add_language_url_to_sitemap`, `trp_hreflang`, `trp_add_country_hreflang_tags`, and `trp_add_region_independent_hreflang_tags` when integrating with SEO Pack.

If your plugin registers its own sitemap provider, test with SEO Pack active and translated slugs enabled.

## Critical rules

- Do not manually build language-prefixed URLs.
- Do not parse translated slugs as stable identifiers.
- Do not redirect POST requests because a slug looks untranslated.
- Do not cache absolute URLs, canonical tags, sitemap XML, or JSON-LD globally across languages/domains.
- Do not assume wp-admin works on secondary language domains.
- Do not overwrite SEO Pack sitemap filters unless you fully preserve alternate URLs and hreflang.

## Cross-references

- Run **`translatepress-output-compatibility`** for visible text, dynamic fragments, exclusions, and language-aware HTML caches.
- Run **`translatepress-language-ui-navigation`** for language switchers, per-language menus, translator roles, and language detection UI.
- Run **`translatepress-email-notification-compatibility`** for translated links inside emails and recipient-language notification flows.
- Run **`wc-store-api`** when translated WooCommerce front-end endpoints or checkout/account URLs are involved.

## References

- SEO Pack source: `add-ons-advanced/seo-pack/class-seo-pack.php`
- Core URL converter source: `wp-content/plugins/translatepress-multilingual/includes/class-url-converter.php`
- Slug manager source: `add-ons-advanced/seo-pack/includes/class-slug-manager.php`
- WooCommerce gettext slug source: `add-ons-advanced/seo-pack/includes/class-gettext-slugs.php`
- Multiple Domains source: `add-ons-pro/multiple-domains/class-multiple-domains.php`
- TranslatePress URL conversion docs: <https://translatepress.com/docs/developers/translating-an-internal-url/>
- Different Domain per Language docs: <https://translatepress.com/docs/developers/different-domain-per-language/>
- SEO Pack docs: <https://translatepress.com/docs/addons/seo-pack/>
- Official documentation: <https://translatepress.com/docs/developers/excluding-translation-of-external-domain-links/>
- Verified source paths:
  - `wp-content/plugins/translatepress-multilingual/index.php`
  - `wp-content/plugins/translatepress-multilingual/readme.txt`
  - `wp-content/plugins/translatepress-multilingual/includes/class-translation-render.php`
  - `wp-content/plugins/translatepress-business/readme.txt`
  - `wp-content/plugins/translatepress-business/add-ons-advanced/seo-pack/includes/class-slug-query.php`
  - `wp-content/plugins/translatepress-business/add-ons-pro/multiple-domains/class-trp-language-domains-sso.php`
