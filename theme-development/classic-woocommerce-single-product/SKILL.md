---
name: classic-woocommerce-single-product
description: Build or audit WooCommerce single product templates in a classic PHP theme. Covers `single-product.php`, `content-single-product.php`, `woocommerce_before_single_product`, product gallery hooks, `woocommerce_single_product_summary`, add-to-cart templates for simple/variable/grouped/external products, variation form accessibility, tabs, upsells, related products, structured data hook preservation, `WC_Product` CRUD methods, image gallery support, reviews/comments, and avoiding fragile overrides of `product-image.php` and `variable.php`.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.1"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-14"
docs:
  - https://developer.woocommerce.com/docs/theming/theme-development/template-structure/
  - https://developer.woocommerce.com/docs/theming/theme-development/image-sizes/
  - https://developer.woocommerce.com/docs/theming/theme-development/theme-design-ux-guidelines/
source-refs:
  - wp-content/plugins/woocommerce/templates/single-product.php
  - wp-content/plugins/woocommerce/templates/content-single-product.php
  - wp-content/plugins/woocommerce/templates/single-product/product-image.php
  - wp-content/plugins/woocommerce/templates/single-product/add-to-cart/variable.php
  - wp-content/plugins/woocommerce/includes/wc-template-hooks.php
  - wp-content/plugins/woocommerce/includes/wc-template-functions.php
  - wp-content/plugins/woocommerce/includes/wc-product-functions.php
---

# Classic WooCommerce Single Product

Use this when building or reviewing single product pages in a classic WooCommerce theme: product gallery, summary order, add-to-cart forms, variable products, tabs, upsells, related products, reviews, and structured data.

## When to Use This Skill

- Editing `woocommerce/single-product.php`.
- Editing `woocommerce/content-single-product.php`.
- Moving title, price, rating, excerpt, add-to-cart, meta, or sharing.
- Customizing product gallery layout.
- Customizing variable product forms or add-to-cart UI.
- Changing tabs, upsells, related products, or reviews.

## Single Product Skeleton

Keep the top-level `single-product.php` simple.

```php
get_header( 'shop' );

do_action( 'woocommerce_before_main_content' );

while ( have_posts() ) {
	the_post();
	wc_get_template_part( 'content', 'single-product' );
}

do_action( 'woocommerce_after_main_content' );
do_action( 'woocommerce_sidebar' );

get_footer( 'shop' );
```

Rules:

- Preserve `get_header( 'shop' )` and `get_footer( 'shop' )` unless the theme has a deliberate header/footer strategy.
- Preserve wrapper hooks.
- Do not manually query products inside `single-product.php`.
- Do not remove `woocommerce_sidebar` without replacing sidebar behavior intentionally.

## Content Single Product Contract

`content-single-product.php` handles notices, password protection, product classes, gallery, summary, tabs, upsells, related products, and after-product hooks.

Must preserve:

- `do_action( 'woocommerce_before_single_product' )` for notices.
- `post_password_required()` guard.
- `<div id="product-<?php the_ID(); ?>" <?php wc_product_class( '', $product ); ?>>`.
- `woocommerce_before_single_product_summary`.
- `woocommerce_single_product_summary`.
- `woocommerce_after_single_product_summary`.
- `woocommerce_after_single_product`.

Rules:

- Do not remove `WC_Structured_Data::generate_product_data()` by deleting the summary hook.
- Preserve `wc_product_class()` for schema/state/CSS classes.
- Use hooks to reorder summary items instead of overriding the template.

## Summary Hook Map

Default `woocommerce_single_product_summary` callbacks:

- title at 5.
- rating at 10.
- price at 10.
- excerpt at 20.
- add-to-cart at 30.
- meta at 40.
- sharing at 50.
- structured data at 60.

Example: move price below excerpt.

```php
add_action( 'after_setup_theme', 'mytheme_single_summary_order' );

function mytheme_single_summary_order() {
	remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 10 );
	add_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 25 );
}
```

Rules:

- Use exact callbacks/priorities from `wc-template-hooks.php`.
- Do not echo raw `_price`, `_stock`, or `_sku` meta.
- Use `WC_Product` methods and Woo template functions.

## Product Gallery

Default gallery output:

- `woocommerce_before_single_product_summary` -> sale flash at 10.
- `woocommerce_before_single_product_summary` -> `woocommerce_show_product_images` at 20.
- `woocommerce_product_thumbnails` -> thumbnails at 20.

Rules:

- Prefer CSS and gallery support flags before overriding `single-product/product-image.php`.
- Keep `wc_get_gallery_image_html()` behavior when overriding gallery markup.
- Preserve placeholder behavior for products without images.
- Test variable products, because variation image switching depends on gallery structure.
- Do not remove focusable/lightbox controls without replacement.

## Add-to-Cart Forms

Woo routes add-to-cart by product type:

- `woocommerce_simple_add_to_cart`.
- `woocommerce_grouped_add_to_cart`.
- `woocommerce_variable_add_to_cart`.
- `woocommerce_external_add_to_cart`.

Rules:

- Do not replace all product types with one custom form.
- Preserve quantity inputs, hidden variation/product fields, form action, method, and enctype.
- Keep nonce/validation behavior from Woo forms.
- For product-type-specific layout, hook around the relevant add-to-cart action or override the smallest add-to-cart template.

## Variable Products

The Woo 10.x `single-product/add-to-cart/variable.php` template includes:

- JSON-encoded variations in `data-product_variations`.
- `wc_dropdown_variation_attribute_options()`.
- labels for each attribute select.
- reset link with `aria-label`.
- `.reset_variations_alert.screen-reader-text` live region.
- `woocommerce_single_variation` hooks.

Rules:

- Avoid overriding `variable.php` unless absolutely necessary.
- Preserve `data-product_id` and `data-product_variations`.
- Preserve labels and reset/live-region accessibility.
- Do not load all variation objects manually in the theme.
- Test in-stock, out-of-stock, backorder, and unavailable variation states.

## Tabs, Upsells, Related Products

Default hooks:

- `woocommerce_after_single_product_summary` -> tabs at 10.
- upsells at 15.
- related products at 20.

Examples:

```php
add_filter( 'woocommerce_output_related_products_args', 'mytheme_related_products_args' );

function mytheme_related_products_args( $args ) {
	$args['posts_per_page'] = 3;
	$args['columns']        = 3;

	return $args;
}
```

Rules:

- Use `woocommerce_product_tabs` to rename, remove, or reorder tabs.
- Use `woocommerce_output_related_products_args` for related product count/columns.
- Keep reviews accessible if reviews are enabled.
- Do not hide product attributes that customers need for purchase decisions.

## Reviews and Comments

Product reviews use the comments system when reviews are enabled.

Rules:

- Do not globally disable comments template behavior for products unless the store does not use reviews.
- Preserve rating display and review text hooks in custom review templates.
- Use accessible labels and validation on review forms.

## Review Checklist

- `single-product.php` keeps Woo wrapper and sidebar hooks.
- `content-single-product.php` keeps notices and password protection.
- Product wrapper uses `wc_product_class()`.
- Summary changes use hooks when possible.
- Structured data hook remains reachable.
- Gallery overrides preserve variation image behavior.
- Add-to-cart forms remain product-type-specific.
- Variable product form keeps labels, data attributes, reset link, and live region.
- Tabs/related/upsells use filters/hooks before template copies.
- Product data comes from `WC_Product` methods, not raw postmeta.

## Common Mistakes

- Removing `woocommerce_before_single_product` and losing notices.
- Rebuilding the variable product form from scratch.
- Moving add-to-cart outside the product form contract.
- Deleting structured-data callbacks while reordering summary output.
- Breaking variation image switching with gallery markup changes.
- Hardcoding a simple product purchase flow for all product types.
