---
name: wc-product-attribute-swatches
description: Build or audit WooCommerce product attribute swatch integrations around the experimental `wc-visual` attribute type. Covers feature gating, global `pa_*` attribute taxonomies, the WooCommerce 11 slug byte limit, color/image term meta, visual admin search results, Store API `__experimental_visual` / `__experimentalVisual`, classic dropdown fallbacks, and safe rendering. Use for variation swatches, visual attributes, `wc-visual`, `term_color`, `term_image`, `woocommerce_json_search_found_product_attribute_terms`, or custom swatch UI.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-05"
---

# WooCommerce product attribute swatches

Use this skill when a plugin or theme needs to read, write, render, or audit WooCommerce visual product attributes. In WooCommerce 11.0 this is not a mature "classic variation swatches" template API. It is an experimental `wc-visual` product attribute type with color/image term metadata, consumed by selected block UI and optionally exposed by Store API.

## Source-verified status in 11.0.0

- Feature ID: `wc-visual-attribute`.
- Feature option: `woocommerce_feature_wc_visual_attribute_enabled`.
- Default: experimental and disabled by default.
- Admin UI gating: the feature setting UI is disabled on non-block themes; `wc_get_attribute_types()` only exposes `wc-visual` when the site is a block theme with the feature enabled, or when the store already has an existing `wc-visual` attribute.
- Attribute type slug: `wc-visual`.
- Admin label: `Color / image`.
- Visual term value types: `color`, `image`, `none`.
- Supported core term meta: `color` hex string and `image` attachment ID. Image wins over color when both exist; core save logic deletes the other key.
- Classic single-product variable template still renders `wc_dropdown_variation_attribute_options()` selects. It does not output swatch buttons by itself.
- Store API visual data is opt-in and experimental: request `__experimental_visual=true`; response property is `__experimentalVisual`.

## Data model

Only global product attributes can be visual attributes. A visual attribute is still a WooCommerce attribute taxonomy:

```text
woocommerce_attribute_taxonomies.attribute_name = color
woocommerce_attribute_taxonomies.attribute_type = wc-visual
taxonomy slug                                  = pa_color
term meta color                               = #2271b1
term meta image                               = attachment ID
```

Do not treat custom per-product text attributes as swatch sources. They have no term IDs, no `color` or `image` term meta, and no Store API visual payload.

## Safe read helper

Avoid importing `Automattic\WooCommerce\Internal\ProductAttributes\VisualAttributeTermMeta` in plugin code unless there is no alternative; it is marked `@internal`. Mirror the storage contract through public WP/Woo APIs instead.

```php
function myplugin_is_wc_visual_attribute_taxonomy( string $taxonomy ): bool {
    if ( ! function_exists( 'wc_get_attribute_taxonomies' ) || ! function_exists( 'wc_attribute_taxonomy_name' ) ) {
        return false;
    }

    foreach ( wc_get_attribute_taxonomies() as $attribute ) {
        if (
            isset( $attribute->attribute_type, $attribute->attribute_name ) &&
            'wc-visual' === $attribute->attribute_type &&
            wc_attribute_taxonomy_name( $attribute->attribute_name ) === $taxonomy
        ) {
            return true;
        }
    }

    return false;
}

function myplugin_get_wc_term_visual( int $term_id, string $image_size = 'thumbnail' ): array {
    $image_id = absint( get_term_meta( $term_id, 'image', true ) );

    if ( $image_id && wp_attachment_is_image( $image_id ) ) {
        $image_url = wp_get_attachment_image_url( $image_id, $image_size );

        if ( $image_url ) {
            return array(
                'type'  => 'image',
                'value' => $image_url,
            );
        }
    }

    $color = sanitize_hex_color( get_term_meta( $term_id, 'color', true ) );

    if ( $color ) {
        return array(
            'type'  => 'color',
            'value' => $color,
        );
    }

    return array(
        'type'  => 'none',
        'value' => '',
    );
}
```

For lists, call `update_meta_cache( 'term', $term_ids )` before looping terms. If image swatches are common and the page renders many terms, collect attachment IDs from term meta and prime post caches before calling `wp_get_attachment_image_url()`.

## Safe write helper

Write mutually exclusive term meta. Validate capability and nonce in the caller; this helper only normalizes storage.

```php
function myplugin_set_wc_term_visual( int $term_id, string $color = '', int $image_id = 0 ): void {
    if ( $image_id && wp_attachment_is_image( $image_id ) ) {
        update_term_meta( $term_id, 'image', absint( $image_id ) );
        delete_term_meta( $term_id, 'color' );
        return;
    }

    $color = sanitize_hex_color( $color );

    if ( $color ) {
        update_term_meta( $term_id, 'color', $color );
        delete_term_meta( $term_id, 'image' );
        return;
    }

    delete_term_meta( $term_id, 'color' );
    delete_term_meta( $term_id, 'image' );
}
```

When creating an attribute programmatically, verify that `wc_get_attribute_types()` currently contains `wc-visual`. `wc_create_attribute()` validates the type against that function and silently falls back to `select` when `wc-visual` is not available.

```php
if ( array_key_exists( 'wc-visual', wc_get_attribute_types() ) ) {
    $attribute_id = wc_create_attribute( array(
        'name'     => 'Color',
        'slug'     => 'color',
        'type'     => 'wc-visual',
        'order_by' => 'menu_order',
    ) );
}
```

Do not force-create visual attributes on classic-theme stores just to get swatches. In 11.0 WooCommerce intentionally hides the feature setting UI outside block themes unless a visual attribute already exists.

### Attribute slug byte limit in WooCommerce 11.0

WordPress limits taxonomy names to 32 bytes and Woo prefixes global product attributes with `pa_`. WooCommerce 11.0 exposes `wc_get_attribute_slug_max_byte_length()`, currently 29 bytes, and validates with `strlen()` rather than a character count.

Use the helper when validating/importing attribute slugs and return the `WP_Error` from `wc_create_attribute()` instead of truncating blindly. A 29-character multibyte slug can exceed 29 bytes; truncating by characters can still create an invalid taxonomy or collide with another normalized slug.

## Store API

Use Store API only for shopper-facing reads. Fetch attribute IDs first, then opt into experimental visual data for terms:

```http
GET /wp-json/wc/store/v1/products/attributes
GET /wp-json/wc/store/v1/products/attributes/12/terms?__experimental_visual=true
```

Returned term objects may include:

```json
{
  "id": 34,
  "name": "Blue",
  "slug": "blue",
  "__experimentalVisual": {
    "type": "color",
    "value": "#2271b1"
  }
}
```

Rules:

- The property appears only when `__experimental_visual` is true and the term belongs to a `wc-visual` taxonomy.
- `type=image` returns an image URL, not an attachment object.
- `type=color` returns a sanitized hex color.
- `type=none` means no valid visual value.
- Do not rely on this field as a stable non-experimental API until WooCommerce removes the experimental prefix.
- WC REST `/wc/v3/products/attributes` exposes the attribute `type`, but do not assume the classic REST attribute-term endpoints expose the visual payload.

## Admin AJAX term-search shape in WooCommerce 11.0

For a visual taxonomy, WooCommerce enriches valid term objects returned through `woocommerce_json_search_found_product_attribute_terms` with a dynamic `visual` property shaped as `{ type, value }`. Types are `color`, `image`, or `none`; image values are thumbnail URLs.

Treat the property defensively: the core enrichment callback is internal, non-visual taxonomies do not receive it, earlier Woo versions omit it, and another filter may return an error or nonstandard entries. Do not mutate the public filter's results into a different base shape that breaks Woo's admin selector.

## Classic theme rendering

Keep the native `.variations select` and `attribute_pa_*` field as the authoritative submission/accessibility contract. Swatch buttons are progressive enhancement: drive the select, trigger `change`, and synchronize selection and disabled states after Woo's `woocommerce_update_variation_values` and `reset_data` events.

Use `type="button"`, accessible names, synchronized `aria-pressed`, visible focus, and disabled states matching the select. If the design removes the select, implement a complete accessible radio-group including keyboard behavior. See [references/classic-rendering.md](references/classic-rendering.md) for the PHP filter and JavaScript synchronization pattern.

## Common mistakes
- Calling this "variation swatches" and storing data on `product_variation` posts. In core 11.0 the swatch data belongs to attribute terms, not variations.
- Removing the select from classic variation forms. Core JS and POST handling expect `attribute_pa_*` select values.
- Creating `wc-visual` attributes on classic-theme stores and assuming the feature is supported. The 11.0 UI gate is deliberate.
- Counting attribute slug characters instead of UTF-8 bytes or hardcoding a limit instead of calling `wc_get_attribute_slug_max_byte_length()`.
- Importing internal Woo classes as if they were stable public APIs.
- Assuming Store API visual data is returned by default. It requires `__experimental_visual=true`.
- Treating image swatches as attachment arrays in Store API. The value is a URL string.
- Do not hardcode Woo admin CSS classes as frontend contracts or confuse term swatches with per-variation galleries.

Use `wc-variations-data` for real variation CRUD/sync, `wc-variation-gallery` for per-variation image sets, `wc-store-api` for headless reads, and `wc-variations-pricing-filters` when selection affects price/availability display.

## References

- Official documentation: <https://woocommerce.com/document/variable-product/>
- Official documentation: <https://developer.woocommerce.com/docs/apis/store-api/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/includes/wc-attribute-functions.php`
  - `wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php`
  - `wp-content/plugins/woocommerce/src/Internal/ProductAttributes/VisualAttributeTermMeta.php`
  - `wp-content/plugins/woocommerce/src/Internal/ProductAttributes/VisualAttributeTermAdmin.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/ProductAttributeTerms.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Schemas/V1/ProductAttributeTermSchema.php`
  - `wp-content/plugins/woocommerce/includes/admin/meta-boxes/views/html-product-attribute-inner.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-functions.php`
  - `wp-content/plugins/woocommerce/templates/single-product/add-to-cart/variable.php`
