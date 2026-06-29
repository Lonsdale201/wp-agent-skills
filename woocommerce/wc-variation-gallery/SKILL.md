---
name: wc-variation-gallery
description: Build or audit WooCommerce 10.9+ native variation gallery integrations. Covers the experimental `variation_gallery` feature flag, variation `image` vs `gallery_image_ids`, `_product_image_gallery` storage, REST v3 variation payloads, classic product gallery replacement/reset behavior, theme override compatibility, and Additional Variation Images legacy migration. Use when code mentions variation galleries, multiple variation images, `set_gallery_image_ids`, `gallery_images_html`, `gallery_image_ids`, `wc_feature_woocommerce_additional_variation_images_enabled`, `_wc_additional_variation_images`, or `wc-product-gallery-before-destroy`.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.1"
php-min: "7.4"
last-updated: "2026-06-29"
docs:
  - https://woocommerce.com/document/managing-product-variations/
source-refs:
  - wp-content/plugins/woocommerce/src/Internal/VariationGallery/Package.php
  - wp-content/plugins/woocommerce/src/Internal/VariationGallery/ClassicVariationGalleryAdmin.php
  - wp-content/plugins/woocommerce/src/Internal/VariationGallery/LegacyVariationGalleryCompatibility.php
  - wp-content/plugins/woocommerce/src/Internal/VariationGallery/Migration.php
  - wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php
  - wp-content/plugins/woocommerce/includes/class-wc-product-variable.php
  - wp-content/plugins/woocommerce/includes/rest-api/Controllers/Version3/class-wc-rest-product-variations-controller.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variation-data-store-cpt.php
  - wp-content/plugins/woocommerce/includes/wc-template-functions.php
  - wp-content/plugins/woocommerce/templates/single-product/add-to-cart/variable.php
  - wp-content/plugins/woocommerce/assets/js/frontend/add-to-cart-variation.js
---

# WooCommerce variation gallery

Use this skill when a plugin or theme needs to read, write, render, or audit WooCommerce native variation gallery images. This is separate from attribute swatches: swatches choose an attribute value; variation gallery controls the images shown after a variation is selected.

## Source-verified status in 10.9.1

- Feature ID: `variation_gallery`.
- Feature option: `wc_feature_woocommerce_additional_variation_images_enabled`.
- Default: experimental and disabled by default.
- Merged package slug: `woocommerce-additional-variation-images`.
- Native storage: variation `gallery_image_ids` prop, stored in `_product_image_gallery` on the `product_variation` post.
- Primary image: still the variation image/thumbnail (`set_image_id()`, `_thumbnail_id`, REST `image`).
- Additional gallery images: `set_gallery_image_ids()` / REST `gallery_image_ids`; these exclude the primary image.
- Classic frontend data: `WC_Product_Variable::get_available_variation()` returns `gallery_image_ids` and `gallery_images_html` when the feature is enabled.
- Legacy Additional Variation Images meta: `_wc_additional_variation_images`; fallback is disabled by `_wc_variation_gallery_legacy_fallback_disabled`.
- Migration completion option: `wc_variation_gallery_migration_completed_at`.

## Mental model

The admin UI shows one ordered gallery list for a variation, but storage is split:

```text
Displayed ordered list: [ 101, 102, 103 ]
Primary image:          101 -> variation image (`_thumbnail_id`)
Gallery image IDs:      102,103 -> `_product_image_gallery`
```

Do not store the primary image again in `gallery_image_ids`. WooCommerce REST v3 removes the featured image from `gallery_image_ids` before saving.

## Feature gate

Use the feature option to decide whether storefront behavior should expect variation gallery swapping:

```php
function myplugin_wc_variation_gallery_enabled(): bool {
    return 'yes' === get_option( 'wc_feature_woocommerce_additional_variation_images_enabled', 'no' );
}
```

CRUD and REST can write gallery data even when the feature is off, but core classic frontend will not generate `gallery_images_html`, the admin gallery UI will not load, and legacy fallback hooks will not be registered until the feature package initializes.

## Read variation gallery data

Use CRUD, not raw post meta. Use default `view` context for display. Use `edit` context when you need the canonical core storage without display filters.

```php
function myplugin_get_variation_gallery_ordered_ids( int $variation_id, string $context = 'view' ): array {
    $variation = wc_get_product( $variation_id );

    if ( ! $variation instanceof WC_Product_Variation ) {
        return array();
    }

    $ids = array_merge(
        array( (int) $variation->get_image_id( $context ) ),
        array_map( 'intval', $variation->get_gallery_image_ids( $context ) )
    );

    return array_values( array_unique( array_filter( $ids ) ) );
}
```

For custom rendering, validate attachments before output:

```php
$image_ids = array_values( array_filter(
    myplugin_get_variation_gallery_ordered_ids( $variation_id ),
    'wp_attachment_is_image'
) );
```

## Write variation gallery data

Accept an ordered list from your UI/importer, put the first valid image into `set_image_id()`, and put the rest into `set_gallery_image_ids()`.

```php
function myplugin_set_variation_gallery_ordered_ids( int $variation_id, array $ordered_ids ): bool {
    $variation = wc_get_product( $variation_id );

    if ( ! $variation instanceof WC_Product_Variation ) {
        return false;
    }

    $ordered_ids = array_values( array_filter( wp_parse_id_list( $ordered_ids ), 'wp_attachment_is_image' ) );
    $primary_id  = (int) ( $ordered_ids[0] ?? 0 );
    $gallery_ids = array_values( array_unique( array_diff( $ordered_ids, array( $primary_id ) ) ) );

    $variation->set_image_id( $primary_id );
    $variation->set_gallery_image_ids( $gallery_ids );
    $variation->save();

    return true;
}
```

For bulk imports, collect parent IDs and run `wc_delete_product_transients( $parent_id )` plus `WC_Product_Variable::sync( $parent_id )` once per touched parent after the batch, as with other variation writes.

## REST v3 payload

Variation REST responses include `gallery_image_ids`. Writes must set the primary image separately:

```http
PUT /wp-json/wc/v3/products/123/variations/456
Content-Type: application/json

{
  "image": { "id": 101 },
  "gallery_image_ids": [102, 103]
}
```

Rules:

- `gallery_image_ids` is an array of attachment IDs, not image objects.
- It excludes the primary image. If the request includes the current primary image in `gallery_image_ids`, Woo removes it before saving.
- REST writes call `set_gallery_image_ids()` and mark legacy fallback disabled when legacy meta exists.
- The response's `image` field remains the primary variation image.

## Classic frontend compatibility

Classic variable products still render `templates/single-product/add-to-cart/variable.php`. When the feature is enabled:

- `woocommerce_variable_add_to_cart()` enqueues `wc-add-to-cart-variation` and attaches `window.wc_variation_gallery_defaults[product_id]` with the parent gallery HTML.
- The 10.9.0 `variable.php` template includes a per-form `<script type="text/template" class="wc-product-gallery-default-template">` reset snapshot.
- `get_available_variation()` includes `gallery_images_html`; the frontend JS replaces `.woocommerce-product-gallery` with that HTML.
- On reset or a variation without gallery HTML, the JS restores the parent gallery from the snapshot.

Theme/plugin compatibility rules:

- If overriding `single-product/add-to-cart/variable.php`, keep the reset snapshot block from WooCommerce 10.9.0+.
- Keep a standard `.woocommerce-product-gallery` root inside the `.product` container; the JS searches for that node and replaces it.
- Do not remove `wc-add-to-cart-variation` events or `.variations_form` data attributes.
- If a custom gallery binds JS to the gallery DOM, listen for `wc-product-gallery-before-destroy`, `wc-product-gallery-before-init`, and `wc-product-gallery-after-init`.
- Do not strip `gallery_images_html` in the `woocommerce_available_variation` filter unless you intentionally disable gallery swapping.

## Admin integration points

When enabled, Woo adds the classic editor UI after the old single image field with `woocommerce_variation_after_upload_image`. It persists on `woocommerce_admin_process_variation_object`.

Admin form fields:

- Unified ordered IDs input: `variable_gallery_image_ids[<loop>]`.
- Legacy primary image input kept in sync: `upload_image_id[<loop>]`.
- Admin script handle: `wc-admin-variation-gallery`.
- Admin style handle: `wc-admin-variation-gallery-styles`.

If adding custom admin controls, update the same model: first ordered image is primary; remaining images are gallery IDs. Do not write `_product_image_gallery` directly from `$_POST`.

## Legacy Additional Variation Images

The native feature preserves old data safely:

- Reads legacy `_wc_additional_variation_images` only when the core gallery is empty and the variation is not marked core-managed.
- Migrates legacy IDs into `_product_image_gallery` in batches of 250 through Action Scheduler group `woocommerce-db-updates`.
- Keeps legacy meta for third-party readers; it sets `_wc_variation_gallery_legacy_fallback_disabled` to stop fallback once core owns the variation.

Do not delete legacy meta as part of your integration. If your plugin imports or edits native gallery data on a variation that has legacy meta, save through CRUD/REST so Woo can mark fallback disabled.

## Common mistakes

- Treating variation gallery as swatches. It is image-gallery data for selected variations, not an attribute selector UI.
- Saving all ordered IDs into `_product_image_gallery`; the first ID belongs in `image` / `_thumbnail_id`.
- Directly updating `_product_image_gallery` and missing CRUD validation, cache invalidation, and legacy fallback handling.
- Assuming frontend gallery swapping works while `variation_gallery` is disabled.
- Overriding `variable.php` without the default-gallery reset snapshot.
- Replacing `.woocommerce-product-gallery` with custom markup that lacks the expected root class.
- Deleting `_wc_additional_variation_images` during migration; Woo intentionally keeps it.

## Cross-references

Use `wc-variations-data` for variation CRUD/sync, `wc-product-attribute-swatches` for color/image attribute swatches, and `wc-rest-api-v4` only when working with WooCommerce's newer admin REST surfaces rather than classic `wc/v3` variation endpoints.
