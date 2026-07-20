---
name: polylang-rest-headless
description: "Build or audit REST and headless integrations with Polylang 3.8.5, Polylang Pro 3.8.5, and Polylang for WooCommerce 2.2.2. Covers REST lang parameter behavior, pll/v1 languages, filterable REST routes, Pro lang/translations REST fields, pll_rest_api_post_types and pll_rest_api_taxonomies 3.8 format, pll/v1/translation and pll/v1/untranslated-posts, custom REST object-type detection, collection filtering, write permissions, and Woo REST product/order language behavior. Use when creating headless frontends, mobile clients, custom WP REST routes, or REST imports/updates for translated content."
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "polylang + polylang-pro + polylang-wc"
  wp-skills-plugin-version-tested: "Polylang 3.8.5 + Polylang Pro 3.8.5 + Polylang for WooCommerce 2.2.2"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-01"
---

# Polylang REST and Headless

Use this skill when a client, plugin, or importer talks to WordPress REST and expects language-aware content.

Core Polylang and Polylang Pro behave differently:

| Stack | REST behavior |
|---|---|
| Polylang core | Defines current language from `lang`; exposes `pll/v1/languages` and settings controllers. |
| Polylang Pro | Adds `lang` and `translations` REST fields to translated posts/terms; filters collections by `lang`; adds translation endpoints. |
| Polylang for WooCommerce | Replaces generic Pro handling for products/orders/product taxonomies with Woo-aware handlers. |

## Current language in REST

Polylang core reads a `lang` request parameter during REST dispatch:

```http
GET /wp-json/wp/v2/posts?lang=fr
```

If `lang` is valid, `pll_current_language()` returns that language during the request. If an invalid `lang` is sent and a default language exists, Polylang falls back to the default language.

Do not rely on URL prefixes alone in custom REST routes. Read the language through Polylang:

```php
register_rest_route( 'myplugin/v1', '/cards', array(
    'methods'             => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback'            => static function ( WP_REST_Request $request ) {
        $lang = function_exists( 'pll_current_language' ) ? pll_current_language() : false;

        if ( ! $lang && function_exists( 'pll_default_language' ) ) {
            $lang = pll_default_language();
        }

        return rest_ensure_response( array(
            'lang' => $lang ?: get_locale(),
        ) );
    },
) );
```

For state-changing custom routes, still use normal REST permissions and nonces/auth. Language is not authorization.

## Languages endpoint

Polylang core registers:

- `GET /wp-json/pll/v1/languages`
- `POST /wp-json/pll/v1/languages`
- `GET|PUT|PATCH|DELETE /wp-json/pll/v1/languages/<term_id>`
- `GET /wp-json/pll/v1/languages/<slug>`

The response schema includes fields such as `term_id`, `name`, `slug`, `locale`, `w3c`, `is_rtl`, `flag_url`, `is_default`, `active`, `home_url`, `search_url`, `page_on_front`, `page_for_posts`, `fallbacks`, and `term_props`.

Use this endpoint for language selector bootstrapping in headless clients. Do not hardcode language lists in JS.

## Filterable REST routes

Core Polylang detects REST routes for translated `show_in_rest` post types and taxonomies, plus `wp/v2/search`. It exposes the filter list to editor scripts and can add query parameters to preload paths.

The filter is:

```php
add_filter( 'pll_filtered_rest_routes', static function ( array $routes ): array {
    $routes['myplugin_item'] = 'myplugin/v1/items';
    return $routes;
} );
```

Use this only for collection routes that accept a `lang` parameter and return language-filterable objects. Do not mark single-object routes ending with an ID as collection filters.

## Polylang Pro fields

Polylang Pro 3.8 registers REST fields on translated REST-enabled post types and taxonomies:

```json
{
  "lang": "en",
  "translations": {
    "en": 123,
    "fr": 456
  }
}
```

The `lang` field is a string enum of language slugs. The `translations` field is an object whose keys are slugs and values are IDs.

Write pattern:

```http
PUT /wp-json/wp/v2/book/456
Content-Type: application/json
X-WP-Nonce: ...

{
  "lang": "fr",
  "translations": {
    "en": 123
  }
}
```

The Pro update callback checks language validity and translation capabilities. Invalid language returns `rest_invalid_language_code`; insufficient translation permission returns `rest_cannot_set_language`.

## REST type filters in 3.8

Polylang Pro filters the REST-enabled object types it manages:

```php
add_filter( 'pll_rest_api_post_types', static function ( array $post_types ): array {
    $post_types[] = 'book';
    return array_values( array_unique( $post_types ) );
} );

add_filter( 'pll_rest_api_taxonomies', static function ( array $taxonomies ): array {
    $taxonomies[] = 'genre';
    return array_values( array_unique( $taxonomies ) );
} );
```

In 3.8 the legacy format with options arrays is deprecated. Return a simple indexed array of post type or taxonomy names. The Pro source sanitizes legacy formats but calls `_deprecated_argument()`.

## Custom REST controllers

Polylang's request helper can infer object type from `WP_REST_Posts_Controller` or `WP_REST_Terms_Controller`. For a custom controller that does not extend those, identify the object type:

```php
add_filter(
    'pll_rest_request_object_type',
    static function ( $type, array $handler, WP_REST_Request $request ) {
        if ( str_starts_with( $request->get_route(), '/myplugin/v1/books' ) ) {
            return 'post';
        }

        return $type;
    },
    10,
    3
);
```

Accepted return values are `post`, `term`, or `null`.

## Pro translation endpoints

Polylang Pro 3.8 adds:

```http
POST /wp-json/pll/v1/translation
```

Required body:

```json
{
  "from_post": 123,
  "lang": "fr",
  "action": "duplicate"
}
```

It duplicates a translatable post to the target language through Pro's sync model. Permissions require `edit_posts`, `read_post` on the source, and the ability to translate into the requested language.

Untranslated posts endpoint:

```http
GET /wp-json/pll/v1/untranslated-posts?type=book&lang=en&untranslated_in=fr&search=foo
```

Required query params are `type`, `lang`, and `untranslated_in`. This endpoint is useful for editor UIs and headless translation management.

Its permission check allows view-context reads and only enforces the post type edit capability for `context=edit`. Do not proxy it as a private management endpoint without your own permission layer.

## WooCommerce REST

Polylang for WooCommerce 2.2.2 requires Polylang Pro 3.8+ for its REST module.

It removes generic Pro handling for:

- `product`
- `product_variation`
- `shop_order`
- `product_cat`
- `product_tag`
- `product_brand`
- `product_attribute_term`

Then it registers Woo-aware handlers. For products:

- `lang` and `translations` are exposed on Woo REST product objects.
- SKU and global unique ID checks are language-aware during REST writes.
- Batch product create reads `lang` from each `create` item through an internal FIFO queue.

Example:

```http
POST /wp-json/wc/v3/products
Content-Type: application/json
Authorization: Basic ...

{
  "name": "Blue shirt",
  "type": "simple",
  "lang": "en",
  "translations": {
    "fr": 456
  }
}
```

For orders, Polylang WC adds `lang` to Woo order REST object queries:

```http
GET /wp-json/wc/v3/orders?lang=fr
```

When HPOS is enabled, its HPOS query filter adds language JOIN/WHERE clauses for translated order types.

## Headless rules

- Always pass `lang` explicitly in REST collection reads.
- Treat empty `lang` differently from missing `lang`: Polylang WC restores explicit `lang => ''` in Woo queries to mean all languages.
- Use language endpoint data for switchers and route generation.
- For writes, send both `lang` and `translations` only when the user has translation capability.
- Do not use `lang` to bypass object permissions. Keep normal REST permission checks.
- Do not return cached REST HTML/JSON without varying by language, user, and auth state where applicable.

## Common mistakes

- Expecting core Polylang alone to add `lang` and `translations` fields to posts. That is Pro behavior.
- Returning legacy option arrays from `pll_rest_api_post_types` or `pll_rest_api_taxonomies` on 3.8+.
- Filtering single-object routes by language as if they were collections.
- Creating Woo products through REST without `lang`, then trying to repair language from SKU later.
- Assuming Woo batch update/delete need language queue. Polylang WC's queue is for batch create items because those objects do not exist yet.

## Cross-references

- Use `wp-rest-api` for generic route security, nonce, schema, and permission rules.
- Use `polylang-object-translations` for PHP-side linking after imports.
- Use `polylang-wc-compatibility` for product/order language data store behavior.

## Verification

Local source checked against:

- REST language definition: `wp-content/plugins/polylang/src/rest-request.php`
- REST request helper and `pll_rest_request_object_type`: `src/modules/REST/Request.php`
- Languages endpoint schema/routes: `src/modules/REST/V1/Languages.php`
- Pro REST fields and filters: `polylang-pro/src/modules/rest/*`
- Woo REST module and batch queue: `polylang-wc/src/modules/REST/*`

## References

- Official documentation: <https://polylang.pro/doc/rest-api/>
- Official documentation: <https://polylang.pro/doc/function-reference/>
- Verified source paths:
  - `wp-content/plugins/polylang/src/rest-request.php`
  - `wp-content/plugins/polylang/src/modules/REST/Request.php`
  - `wp-content/plugins/polylang/src/modules/REST/API.php`
  - `wp-content/plugins/polylang/src/modules/REST/V1/Languages.php`
  - `wp-content/plugins/polylang/src/filter-rest-routes.php`
  - `wp-content/plugins/polylang-pro/src/modules/rest/rest-api.php`
  - `wp-content/plugins/polylang-pro/src/modules/rest/Translatable/Abstract_object.php`
  - `wp-content/plugins/polylang-pro/src/modules/rest/Translated/Abstract_Object.php`
  - `wp-content/plugins/polylang-pro/src/modules/rest/V1/Translation.php`
  - `wp-content/plugins/polylang-pro/src/modules/rest/V1/Untranslated_Posts.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Module.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Translated/Product.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Translated/Batch.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Filtered/Order.php`
