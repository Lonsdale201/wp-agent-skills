---
name: wc-product-attribute-swatches
description: Build or audit WooCommerce 10.9+ product attribute swatch integrations around the experimental `wc-visual` attribute type. Covers feature-flag gating, global `pa_*` attribute taxonomy type, color/image term meta, Store API `__experimental_visual` / `__experimentalVisual`, classic variation dropdown fallbacks, and safe plugin/theme rendering. Use when code or requests mention variation swatches, visual attributes, `wc-visual`, `wc_visual_attribute_type`, `term_color`, `term_image`, `__experimental_visual`, `ProductAttributeTerms`, or custom swatch UI.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.1"
php-min: "7.4"
last-updated: "2026-06-29"
docs:
  - https://woocommerce.com/document/variable-product/
  - https://developer.woocommerce.com/docs/apis/store-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/wc-attribute-functions.php
  - wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php
  - wp-content/plugins/woocommerce/src/Internal/ProductAttributes/VisualAttributeTermMeta.php
  - wp-content/plugins/woocommerce/src/Internal/ProductAttributes/VisualAttributeTermAdmin.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/ProductAttributeTerms.php
  - wp-content/plugins/woocommerce/src/StoreApi/Schemas/V1/ProductAttributeTermSchema.php
  - wp-content/plugins/woocommerce/src/Blocks/BlockTypes/AddToCartWithOptions/VariationSelectorAttribute.php
  - wp-content/plugins/woocommerce/src/Blocks/BlockTypes/ProductFilterAttribute.php
  - wp-content/plugins/woocommerce/includes/admin/meta-boxes/views/html-product-attribute-inner.php
  - wp-content/plugins/woocommerce/includes/wc-template-functions.php
  - wp-content/plugins/woocommerce/templates/single-product/add-to-cart/variable.php
---

# WooCommerce product attribute swatches

Use this skill when a plugin or theme needs to read, write, render, or audit WooCommerce visual product attributes. In WooCommerce 10.9.1 this is not a mature "classic variation swatches" template API. It is an experimental `wc-visual` product attribute type with color/image term metadata, consumed by selected block UI and optionally exposed by Store API.

## Source-verified status in 10.9.1

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

Do not force-create visual attributes on classic-theme stores just to get swatches. In 10.9.1 WooCommerce intentionally hides the feature setting UI outside block themes unless a visual attribute already exists.

## Admin integration points

Core adds visual fields only for `wc-visual` attribute taxonomies: `wc_visual_attribute_type` radio values `color` / `image`, `term_color`, and `term_image`. The product edit "Create value" modal uses the same fields, and admin scripts enqueue media plus `visual-attribute-color-picker` on product and visual attribute term screens. Extend those screens without duplicating these field names for non-visual attributes.

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

## Classic theme rendering

For classic templates, keep the core select in place. The variation form JS reads `.variations select`, the `attribute_pa_*` field names, and `change` events. Swatch buttons should drive the select, not replace the submission contract.

Append swatches through `woocommerce_dropdown_variation_attribute_options_html`:

```php
add_filter(
    'woocommerce_dropdown_variation_attribute_options_html',
    function ( string $html, array $args ): string {
        $product   = $args['product'] ?? null;
        $taxonomy  = isset( $args['attribute'] ) ? (string) $args['attribute'] : '';
        $options   = isset( $args['options'] ) && is_array( $args['options'] ) ? $args['options'] : array();
        $selected  = isset( $args['selected'] ) ? (string) $args['selected'] : '';

        if ( ! $product instanceof WC_Product || ! taxonomy_exists( $taxonomy ) ) {
            return $html;
        }

        if ( ! myplugin_is_wc_visual_attribute_taxonomy( $taxonomy ) ) {
            return $html;
        }

        $terms = wc_get_product_terms( $product->get_id(), $taxonomy, array( 'fields' => 'all' ) );
        if ( empty( $terms ) || is_wp_error( $terms ) ) {
            return $html;
        }

        $out = '<div class="myplugin-wc-swatches" role="group" aria-label="' . esc_attr( wc_attribute_label( $taxonomy ) ) . '">';

        foreach ( $terms as $term ) {
            if ( ! in_array( $term->slug, $options, true ) ) {
                continue;
            }

            $visual = myplugin_get_wc_term_visual( (int) $term->term_id );
            $style  = '';

            if ( 'color' === $visual['type'] ) {
                $style = 'background-color:' . esc_attr( $visual['value'] );
            } elseif ( 'image' === $visual['type'] ) {
                $style = "background-image:url('" . esc_url( $visual['value'] ) . "')";
            }

            $out .= sprintf(
                '<button type="button" class="myplugin-wc-swatch" data-value="%1$s" aria-pressed="%2$s" aria-label="%3$s"><span class="myplugin-wc-swatch__visual" style="%4$s" aria-hidden="true"></span><span class="screen-reader-text">%5$s</span></button>',
                esc_attr( $term->slug ),
                $selected === $term->slug ? 'true' : 'false',
                esc_attr( sprintf( '%s: %s', wc_attribute_label( $taxonomy ), $term->name ) ),
                esc_attr( $style ),
                esc_html( $term->name )
            );
        }

        $out .= '</div>';

        return $html . $out;
    },
    20,
    2
);
```

Then sync button clicks to the native select:

```js
jQuery( function ( $ ) {
    $( document ).on( 'click', '.myplugin-wc-swatch', function () {
        var $button = $( this );
        var $wrap = $button.closest( '.value' );
        var $select = $wrap.find( 'select' );

        $select.val( $button.data( 'value' ) ).trigger( 'change' );
        $wrap.find( '.myplugin-wc-swatch' ).attr( 'aria-pressed', 'false' );
        $button.attr( 'aria-pressed', 'true' );
    } );

    $( '.variations_form' ).on( 'woocommerce_update_variation_values reset_data', function () {
        $( this ).find( '.value' ).each( function () {
            var $wrap = $( this );
            var $select = $wrap.find( 'select' );

            $wrap.find( '.myplugin-wc-swatch' ).each( function () {
                var value = String( $( this ).data( 'value' ) );
                var enabled = $select.find( 'option' ).filter( function () {
                    return this.value === value && ! this.disabled;
                } ).length > 0;

                $( this ).prop( 'disabled', ! enabled );
            } );
        } );
    } );
} );
```

Keep accessibility boring: use real `<button type="button">`, clear `aria-label`, `aria-pressed`, visible focus styles, disabled states that mirror the select options, and a native select fallback.

## Common mistakes

- Calling this "variation swatches" and storing data on `product_variation` posts. In core 10.9.1 the swatch data belongs to attribute terms, not variations.
- Removing the select from classic variation forms. Core JS and POST handling expect `attribute_pa_*` select values.
- Creating `wc-visual` attributes on classic-theme stores and assuming the feature is supported. The 10.9.1 UI gate is deliberate.
- Importing internal Woo classes as if they were stable public APIs.
- Assuming Store API visual data is returned by default. It requires `__experimental_visual=true`.
- Treating image swatches as attachment arrays in Store API. The value is a URL string.
- Hardcoding Woo admin CSS classes such as `wc-admin-color-swatch` for frontend contracts.
- Confusing this with native variation gallery support. Variation gallery is a separate WooCommerce 10.9 feature for per-variation image sets.

## Cross-references

Use `wc-variations-data` for real variation CRUD/sync, `wc-variation-gallery` for per-variation image sets, `wc-store-api` for headless reads, and `wc-variations-pricing-filters` when selection affects price/availability display.
