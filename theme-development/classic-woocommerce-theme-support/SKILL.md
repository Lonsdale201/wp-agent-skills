---
name: classic-woocommerce-theme-support
description: Build or audit WooCommerce support in a classic PHP WordPress theme. Covers `add_theme_support( 'woocommerce' )`, `wc_current_theme_supports_woocommerce_or_fse()`, supported vs unsupported theme rendering, shop/single wrappers, `woocommerce_before_main_content` and `woocommerce_after_main_content`, product image widths, `product_grid`, gallery zoom/lightbox/slider support, Woo body/post classes, conditional asset loading with `is_woocommerce()`/`is_shop()`/`is_product()`, and the classic-theme boundary versus Woo block templates.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.8.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-14"
---

# Classic WooCommerce Theme Support

Use this when creating or reviewing a classic PHP theme that must support WooCommerce shop, taxonomy, product, cart, checkout, and account screens.

This is not a block-theme skill. If the theme uses HTML block templates or the Site Editor as its primary rendering model, use Woo block-theme documentation instead.

## When to Use This Skill

- Adding WooCommerce compatibility to a classic theme.
- Fixing a shop page that renders through unsupported shortcode/content fallback.
- Aligning Woo wrappers with the theme's `page.php`/`single.php` structure.
- Setting Woo image sizes, product grid defaults, or gallery features.
- Loading frontend assets only on Woo screens.
- Reviewing whether a theme should override Woo templates at all.

## Declare Support

Declare WooCommerce support on `after_setup_theme`.

```php
add_action( 'after_setup_theme', 'mytheme_woocommerce_support' );

function mytheme_woocommerce_support() {
	add_theme_support(
		'woocommerce',
		array(
			'thumbnail_image_width' => 360,
			'single_image_width'    => 720,
			'product_grid'          => array(
				'default_rows'    => 4,
				'min_rows'        => 2,
				'max_rows'        => 6,
				'default_columns' => 3,
				'min_columns'     => 2,
				'max_columns'     => 4,
			),
		)
	);
}
```

Rules:

- A classic theme that ships Woo template overrides must declare Woo support.
- Without support, Woo treats the theme as unsupported and uses fallback content rendering for shop/product pages.
- `wc_current_theme_supports_woocommerce_or_fse()` returns true when the classic theme supports Woo or when the active theme is a block theme.
- Do not declare support from a plugin unless the plugin truly owns the active theme.

## Image Sizes

Woo reads theme support values through `wc_get_theme_support()` and `wc_get_image_size()`.

Supported keys:

- `thumbnail_image_width` for catalog/grid images.
- `single_image_width` for single product main images.
- `gallery_thumbnail_image_width` for gallery thumbnails.

Rules:

- If the theme defines image widths, Woo hides the matching Customizer controls from users.
- If the theme does not define widths, store owners can control image sizes from Woo settings/Customizer.
- After changing sizes, existing uploads may need thumbnail regeneration.
- Do not register separate conflicting product image sizes unless the design genuinely needs them.

## Product Grid Defaults

`product_grid` controls default/min/max rows and columns for classic catalogs.

Rules:

- Use grid defaults that match the theme's responsive layout.
- Set min/max values to prevent broken designs at extremes.
- Woo resets catalog rows/columns on theme switch via `wc_reset_product_grid_settings()`.
- Do not hardcode product counts in templates when Woo loop props/settings already control the loop.

## Gallery Feature Support

Declare only features the theme CSS/JS can support.

```php
add_action( 'after_setup_theme', 'mytheme_woocommerce_gallery_support' );

function mytheme_woocommerce_gallery_support() {
	add_theme_support( 'wc-product-gallery-zoom' );
	add_theme_support( 'wc-product-gallery-lightbox' );
	add_theme_support( 'wc-product-gallery-slider' );
}
```

Rules:

- Test simple, variable, grouped, and external products.
- Do not declare gallery support if the theme hides thumbnails or breaks gallery focus/keyboard behavior.
- Product gallery templates changed in Woo 10.x; avoid overriding them unless necessary.

## Main Content Wrappers

Woo's default wrappers are hooked to:

- `woocommerce_before_main_content` -> `woocommerce_output_content_wrapper` at priority 10.
- `woocommerce_after_main_content` -> `woocommerce_output_content_wrapper_end` at priority 10.

If default wrappers do not match the theme, replace them with theme-specific wrappers.

```php
add_action( 'wp', 'mytheme_woocommerce_wrappers' );

function mytheme_woocommerce_wrappers() {
	remove_action( 'woocommerce_before_main_content', 'woocommerce_output_content_wrapper', 10 );
	remove_action( 'woocommerce_after_main_content', 'woocommerce_output_content_wrapper_end', 10 );

	add_action( 'woocommerce_before_main_content', 'mytheme_woocommerce_wrapper_start', 10 );
	add_action( 'woocommerce_after_main_content', 'mytheme_woocommerce_wrapper_end', 10 );
}

function mytheme_woocommerce_wrapper_start() {
	echo '<main id="main" class="site-main">';
}

function mytheme_woocommerce_wrapper_end() {
	echo '</main>';
}
```

Rules:

- Match the structure used by the theme's normal content templates.
- Do not create nested `<main>` landmarks.
- Keep `woocommerce_before_main_content` and `woocommerce_after_main_content` in overridden Woo templates.
- Do not fix wrapper problems by copying every Woo template.

## Body and Product Classes

Woo adds body and post/product classes through:

- `wc_body_class` on `body_class`.
- `wc_product_post_class` on `post_class`.
- `wc_product_class()` in product templates.

Rules:

- Do not replace `body_class()` or `post_class()` output in the theme.
- In product loop overrides, preserve `wc_product_class( '', $product )`.
- CSS should target Woo classes instead of brittle URL or page-title selectors.

## Conditional Assets

Use Woo conditionals after query setup, such as on `wp_enqueue_scripts`.

```php
add_action( 'wp_enqueue_scripts', 'mytheme_woocommerce_assets' );

function mytheme_woocommerce_assets() {
	if ( is_woocommerce() || is_cart() || is_checkout() || is_account_page() ) {
		wp_enqueue_style(
			'mytheme-woocommerce',
			get_theme_file_uri( 'assets/css/woocommerce.css' ),
			array(),
			wp_get_theme()->get( 'Version' )
		);
	}
}
```

Rules:

- Do not call Woo conditional tags at file load time in `functions.php`.
- Woo docs note that conditionals work after query setup; `wp` is the earliest safe general hook.
- Cart, checkout, and account pages are not always covered by `is_woocommerce()`.
- Avoid loading shop-only scripts on the whole site.

## Block Boundary

This skill is for classic PHP templates. Still be aware:

- Woo 10.x includes block template compatibility layers.
- Classic themes should not add `/templates/*.html` Woo block templates unless intentionally moving into block-theme territory.
- Checkout/Cart blocks may appear on pages even in classic themes; theme CSS should not assume only shortcode checkout exists.
- Do not edit Woo block internals from classic PHP theme templates.

## Review Checklist

- `add_theme_support( 'woocommerce' )` runs on `after_setup_theme`.
- Product image widths and grid settings are intentional.
- Gallery supports are declared only when tested.
- Woo wrappers match the theme's content structure.
- No duplicate `<main>` or landmark conflicts.
- Woo body/product classes are preserved.
- Assets are conditionally enqueued on Woo screens.
- The theme does not copy Woo templates just to change wrappers.
- Block-theme and classic-template assumptions are not mixed.

## Common Mistakes

- Shipping `woocommerce/` template overrides without declaring Woo support.
- Using unsupported-theme fallback as if it were the normal integration path.
- Calling `is_shop()` in the body of `functions.php`.
- Replacing `wc_product_class()` with plain `post_class()`.
- Hardcoding `full` product images in archives.
- Declaring gallery slider/lightbox support without keyboard/focus testing.

## References

- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/classic-theme-developer-handbook/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/template-structure/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/image-sizes/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/conditional-tags/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/woocommerce.php`
  - `wp-content/plugins/woocommerce/includes/class-wc-template-loader.php`
  - `wp-content/plugins/woocommerce/includes/wc-conditional-functions.php`
  - `wp-content/plugins/woocommerce/includes/wc-core-functions.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-functions.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-hooks.php`
  - `wp-content/plugins/woocommerce/templates/global/wrapper-start.php`
  - `wp-content/plugins/woocommerce/templates/global/wrapper-end.php`
