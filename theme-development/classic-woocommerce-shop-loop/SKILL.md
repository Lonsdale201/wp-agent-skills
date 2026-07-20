---
name: classic-woocommerce-shop-loop
description: Build or audit WooCommerce shop/archive loops and product cards in a classic PHP theme. Covers `archive-product.php`, `content-product.php`, product taxonomy templates, `woocommerce_product_loop()`, `woocommerce_product_loop_start/end()`, `wc_get_loop_prop()`, `wc_get_template_part( 'content', 'product' )`, `wc_product_class()`, loop hooks, product cards, sale flash, thumbnails, ratings, price, add-to-cart ARIA, result count, ordering, pagination, no-products state, grid columns, and avoiding raw `WP_Query`/postmeta product loops.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.8.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-14"
---

# Classic WooCommerce Shop Loop

Use this when building or reviewing shop archives, product category/tag/attribute archives, product grids, related product grids, and product cards in a classic WooCommerce theme.

## When to Use This Skill

- Editing `woocommerce/archive-product.php`.
- Editing `woocommerce/content-product.php`.
- Changing product card markup, image size, title, price, rating, sale badge, or add-to-cart output.
- Adjusting result count, ordering, pagination, no-products state, rows, or columns.
- Reviewing custom product loops in templates.

## Archive Skeleton

Keep Woo's archive loop contract.

```php
do_action( 'woocommerce_before_main_content' );
do_action( 'woocommerce_shop_loop_header' );

if ( woocommerce_product_loop() ) {
	do_action( 'woocommerce_before_shop_loop' );

	woocommerce_product_loop_start();

	if ( wc_get_loop_prop( 'total' ) ) {
		while ( have_posts() ) {
			the_post();
			do_action( 'woocommerce_shop_loop' );
			wc_get_template_part( 'content', 'product' );
		}
	}

	woocommerce_product_loop_end();

	do_action( 'woocommerce_after_shop_loop' );
} else {
	do_action( 'woocommerce_no_products_found' );
}

do_action( 'woocommerce_after_main_content' );
```

Rules:

- Use `woocommerce_product_loop()` instead of only checking `have_posts()`.
- Use `woocommerce_product_loop_start()` and `woocommerce_product_loop_end()` so loop wrappers and subcategories work.
- Use `wc_get_loop_prop( 'total' )` before rendering products.
- Preserve `woocommerce_before_shop_loop`, `woocommerce_after_shop_loop`, and `woocommerce_no_products_found`.
- Do not build shop archives with a raw `WP_Query` unless this is a deliberate secondary product section.

## Product Card Contract

`content-product.php` must preserve the product object guard and visibility check.

```php
global $product;

if ( ! is_a( $product, WC_Product::class ) || ! $product->is_visible() ) {
	return;
}
?>
<li <?php wc_product_class( '', $product ); ?>>
	<?php
	do_action( 'woocommerce_before_shop_loop_item' );
	do_action( 'woocommerce_before_shop_loop_item_title' );
	do_action( 'woocommerce_shop_loop_item_title' );
	do_action( 'woocommerce_after_shop_loop_item_title' );
	do_action( 'woocommerce_after_shop_loop_item' );
	?>
</li>
```

Rules:

- Keep `wc_product_class( '', $product )`.
- Preserve default hook positions unless intentionally replacing output.
- Do not echo product title, price, image, or add-to-cart from raw postmeta.
- Use Woo template functions or `WC_Product` methods.
- Product cards should remain valid list items when inside `woocommerce_product_loop_start()`.

## Hook Map for Cards

Default product card hooks:

- `woocommerce_before_shop_loop_item`: product link open.
- `woocommerce_before_shop_loop_item_title`: sale flash and thumbnail.
- `woocommerce_shop_loop_item_title`: product title.
- `woocommerce_after_shop_loop_item_title`: rating and price.
- `woocommerce_after_shop_loop_item`: product link close and add-to-cart.

Example: move rating below add-to-cart.

```php
add_action( 'after_setup_theme', 'mytheme_product_card_hooks' );

function mytheme_product_card_hooks() {
	remove_action( 'woocommerce_after_shop_loop_item_title', 'woocommerce_template_loop_rating', 5 );
	add_action( 'woocommerce_after_shop_loop_item', 'woocommerce_template_loop_rating', 15 );
}
```

Rules:

- Use exact priorities from `wc-template-hooks.php`.
- Prefer hook changes over copying `content-product.php`.
- Test simple, variable, external, grouped, out-of-stock, sale, and hidden products.

## Add-to-Cart Accessibility

Woo 10.x loop add-to-cart provides:

- `aria-label` from `$product->add_to_cart_description()`.
- optional `aria-describedby` screen-reader text.
- `role="button"` for AJAX add-to-cart links when configured.
- `data-success_message` for simple products.

Rules:

- Do not remove `aria-label`, `aria-describedby`, or screen-reader text from `loop/add-to-cart.php`.
- If filtering `woocommerce_loop_add_to_cart_link`, preserve product-specific accessible names.
- Do not replace add-to-cart with a generic "Buy" link for all products.
- Variable/external/grouped products often need a view/select-options flow, not AJAX add-to-cart.

## Images and Grid

Rules:

- Product card images should use `woocommerce_thumbnail`.
- Control catalog image width through Woo theme support or Woo image settings.
- Do not use full-size images in product grids.
- Preserve responsive image attributes generated by Woo/WP.
- Set CSS grid/flex rules so `columns-N` classes do not create overflow.

## Result Count, Ordering, Pagination

Default hooks:

- `woocommerce_before_shop_loop`: notices at 10, result count at 20, ordering at 30.
- `woocommerce_after_shop_loop`: pagination at 10.

Rules:

- Preserve result count and ordering unless the design has a replacement.
- Preserve `woocommerce_output_all_notices` on archives.
- Use Woo pagination; do not manually build `paged` links.
- The pagination template has an accessible `aria-label`.

## Custom Product Sections

For secondary product grids, use Woo product queries carefully.

Rules:

- Prefer Woo shortcodes/blocks only when the theme is intentionally using them.
- For PHP sections, use `wc_get_products()` for product objects or `WP_Query` only when WordPress loop behavior is required.
- If using `WP_Query`, call `wp_reset_postdata()` after the loop.
- Render each product with `wc_get_template_part( 'content', 'product' )` when you want standard card behavior.
- Set loop props such as columns only for the local section and restore expectations afterward.

## Review Checklist

- Archive templates keep Woo wrapper hooks.
- Product loops use Woo loop helpers.
- Product cards preserve product guard, visibility, and `wc_product_class()`.
- Hook changes are preferred over template copies.
- Add-to-cart accessibility attributes are preserved.
- Product images use Woo image sizes.
- Result count, ordering, notices, pagination, and no-products states work.
- Product categories/tags/attributes use Woo taxonomy archive flow.
- No raw price/stock/meta output bypasses `WC_Product` methods.

## Common Mistakes

- Replacing `woocommerce_product_loop_start()` with a custom `<div>` and breaking subcategories/plugins.
- Removing `woocommerce_output_all_notices` from archives.
- Rendering hidden products because the `is_visible()` guard was deleted.
- Losing AJAX add-to-cart classes/data attributes.
- Hardcoding "Add to cart" without product-specific ARIA.
- Using `WP_Query` and forgetting `wp_reset_postdata()`.

## References

- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/template-structure/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/conditional-tags/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/image-sizes/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/theme-design-ux-guidelines/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/templates/archive-product.php`
  - `wp-content/plugins/woocommerce/templates/content-product.php`
  - `wp-content/plugins/woocommerce/templates/loop/add-to-cart.php`
  - `wp-content/plugins/woocommerce/templates/loop/loop-start.php`
  - `wp-content/plugins/woocommerce/templates/loop/pagination.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-hooks.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-functions.php`
  - `wp-content/plugins/woocommerce/includes/wc-product-functions.php`
