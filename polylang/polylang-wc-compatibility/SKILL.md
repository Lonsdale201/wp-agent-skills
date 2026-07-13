---
name: polylang-wc-compatibility
description: "Build WooCommerce plugins and themes that are compatible with Polylang for WooCommerce 2.2.2. Covers product and variation language data stores, product/order translation groups, cart and Store API language behavior, HPOS order filtering, lang query behavior, SKU/global unique ID per-language checks, product property and attribute translation, stock/reserved stock sync, Woo REST lang/translations fields, batch create language queues, translated Woo strings/options, and hooks such as pllwc_copy_post_metas, pllwc_translate_product_meta, pllwc_translate_product_prop, pllwc_enable_cart_translation, pllwc_language_for_unique_sku, pllwc_get_order_types, and pllwc_copy_product. Use when extending Woo products, variations, orders, Store/REST integrations, stock, attributes, gateways, shipping, or emails on a Polylang multilingual shop."
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "polylang-wc"
  wp-skills-plugin-version-tested: "Polylang for WooCommerce 2.2.2 + Polylang 3.8.5 + WooCommerce 10.9.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-01"
---

# Polylang for WooCommerce Compatibility

Use this skill when WooCommerce code must work correctly on a shop using Polylang for WooCommerce.

Polylang WC is not just "Polylang applied to products". It adds Woo-specific data stores, variation sync, stock sync, SKU checks, order language behavior, HPOS handling, Woo REST integration, and Woo settings string translation.

## Detect and guard

```php
if ( ! class_exists( 'PLLWC_Data_Store' ) || ! function_exists( 'pll_current_language' ) ) {
    return;
}
```

Local source checked: Polylang for WooCommerce `2.2.2`, minimum Polylang `3.7`, WooCommerce required, Woo REST module requires Polylang Pro 3.8+.

## Product language store

Use the Woo-aware language store for products and variations:

```php
$store = PLLWC_Data_Store::load( 'product_language' );

$lang = $store->get_language( $product_id );
$fr_id = $store->get( $product_id, 'fr' );
$translations = $store->get_translations( $product_id );
```

The product store wraps Polylang's post model, but centralizes Woo-specific behavior. Prefer it in Woo integration code.

When creating products programmatically:

```php
$product = new WC_Product_Simple();
$product->set_name( 'Coffee' );
$product->set_regular_price( '12.00' );
$product_id = $product->save();

$store = PLLWC_Data_Store::load( 'product_language' );
$store->set_language( $product_id, 'en' );
```

After creating a translation, save the group:

```php
$store->set_language( $fr_product_id, 'fr' );
$store->save_translations( array(
    'en' => $product_id,
    'fr' => $fr_product_id,
) );
```

`product` and `product_variation` are added to translated post types but hidden from Polylang settings. Do not let users toggle these manually from your plugin.

## Product queries and lang

Polylang filters Woo product queries by current language unless `lang` is explicitly set.

Use:

```php
$products = wc_get_products( array(
    'status' => 'publish',
    'lang'   => 'fr',
) );
```

For all languages, pass an explicit empty string:

```php
$products = wc_get_products( array(
    'limit' => -1,
    'lang'  => '',
) );
```

Polylang WC restores `lang => ''` after WooCommerce removes empty values in `WC_Data_Store_WP::get_wp_query_args()`. Missing `lang` means current language; explicit empty `lang` means all languages.

## Variations and attributes

Polylang WC synchronizes variation language from the parent product and copies/synchronizes variations across translated variable products.

Important behavior:

- `woocommerce_variable_children_args` is forced to `lang => ''` so a variable product can see all child variations.
- Variation data store is decorated to read attribute terms in the variation's language.
- Attribute slugs are translated when copied between languages.
- Product attributes lookup queries are temporarily filtered to the product language.

Do not manually clone variation posts without setting language and linking translations. Use Woo product objects and let Polylang WC hooks run, or call the product language store explicitly.

For custom product properties that store translated post/term IDs, use `pllwc_translate_product_prop`. Translate only your property, map product IDs through `PLLWC_Data_Store::load( 'product_language' )->get( $id, $lang )`, and return the original value for unknown properties.

## Product meta copy/sync

Polylang WC maps legacy product meta keys to Woo product properties and decides which fields to copy or synchronize.

Customize with `pllwc_copy_post_metas( array $keys, bool $sync, int $from, int $to, string $lang )`: remove runtime/cache keys, add shared keys that must travel to translations, and guard by product type.

Translate copied product meta values with `pllwc_translate_product_meta( $value, string $key, string $lang, int $from, int $to )`. Use it for attachment, product, term, or page IDs stored in custom meta.

Avoid raw `update_post_meta()` loops that bypass Woo product setters. Woo lookup tables and cache invalidation matter.

## Stock and reserved stock

Polylang WC synchronizes stock across product translations by filtering Woo's stock update SQL:

- `woocommerce_update_product_stock_query`
- `woocommerce_updated_product_stock`
- `woocommerce_query_for_reserved_stock`

Do not update `_stock`, `_stock_status`, or reserved stock SQL manually for one translation. Use Woo stock APIs:

```php
$product = wc_get_product( $product_id );
if ( $product ) {
    wc_update_product_stock( $product, 5, 'set' );
}
```

The plugin updates lookup tables and clears caches for translated products after stock changes.

## Cart, checkout, and Store API

Polylang WC translates cart contents by product language when cart translation is enabled. Relevant hooks:

- `pllwc_enable_cart_translation` can disable cart translation for incompatible third-party cart data.
- `pllwc_translated_cart_item` fires after a cart item key/product has been translated.
- `pllwc_translate_cart_contents` filters the translated cart contents.

Do not store untranslatable product IDs in opaque cart item data. If custom cart data contains product, variation, term, or attachment IDs, translate those IDs when Polylang WC translates the cart.

`PLLWC_Store_Blocks` adds `lang` to `/wc/store/v1` cart and checkout requests, prehydrates `/wc/store/v1/cart?lang={current}` and checkout data, translates product IDs in reviews-by-product blocks, and ensures the order language on `woocommerce_store_api_checkout_order_processed`.

For custom Store API calls, preserve the `lang` parameter or add it from `pll_current_language()` when calling `/wc/store/v1/*`. Do not assume Store API checkout orders will inherit the right language if your code bypasses Woo's Store API processing hooks.

## SKU and global unique ID

Polylang WC makes SKU/global unique ID uniqueness language-aware:

- `wc_product_has_unique_sku`
- `wc_product_pre_lock_on_sku`
- `wc_product_has_global_unique_id`

Dynamic language filters include:

- `pllwc_language_for_unique_sku`
- `pllwc_language_for_lock_on_sku`
- `pllwc_language_for_global_unique_id`

Do not run your own global SKU uniqueness query without considering language. You may block valid translated products that intentionally share SKU.

## Orders and HPOS

Order language uses the order language data store:

```php
$orders = wc_get_orders( array(
    'type' => 'shop_order',
    'lang' => 'fr',
) );
```

Polylang WC translates `shop_order` and, internally, `shop_order_placehold`. It removes order post types from bulk translate actions.

Custom order types can opt in:

```php
add_filter( 'pllwc_get_order_types', static function ( array $types, string $context ): array {
    $types[] = 'shop_order_mytype';
    return $types;
}, 10, 2 );
```

For HPOS, `PLLWC_HPOS_Orders_Query` filters `woocommerce_orders_table_query_clauses` by joining term relationships on the orders table alias. If your code builds custom HPOS SQL, you must add equivalent language filtering or use Woo order query APIs with `lang`.

## Woo REST

With Polylang Pro 3.8+, Polylang WC owns Woo REST handling for products, variations, orders, product categories/tags/brands, and product attribute terms.

Product REST supports `lang` and `translations`; batch create routes read each create item's `lang` into a FIFO queue because a new product or term has no language yet. Order REST filtering accepts URLs such as `/wp-json/wc/v3/orders?lang=fr`.

Do not rely on generic Polylang Pro REST post handling for Woo products/orders. Polylang WC removes those types from generic Pro handlers and registers Woo-aware handlers.

## Woo strings and options

Polylang WC registers and translates Woo email copy, store notices, checkout privacy/terms text, gateway/shipping titles, pickup location text, and checkout block payment method option strings.

If your Woo extension stores customer-facing settings in a `WC_Settings_API` object, expose stable option keys and sanitize text. Polylang WC can translate known shipping/gateway settings through `PLL_Translate_Option` and string registration.

## Common mistakes

- Treating products as ordinary posts in import/sync code.
- Querying all products without `lang => ''` and then missing translations.
- Cloning variations without language and translation groups.
- Blocking shared SKUs globally instead of per language.
- Updating stock meta directly on one translation.
- Writing custom HPOS SQL without language joins.
- Assuming Polylang core REST fields apply to Woo REST without Polylang Pro and Polylang WC.

## Cross-references

- Use `polylang-object-translations` for generic post/term linking.
- Use `polylang-rest-headless` for REST `lang` and `translations` semantics.
- Use `wc-hpos-compatibility` for general Woo HPOS plugin rules.
- Use `wc-store-api` for shopper-facing Store API rules.

## Verification

Local source checked against `src/data-store.php`, `src/product-language-cpt.php`, `src/order-language-cpt.php`, `src/products.php`, `src/frontend/frontend-cart.php`, `src/store-blocks.php`, `src/variation-data-store-cpt.php`, `src/stock.php`, `src/hpos-orders-query.php`, and `src/modules/REST/*`.

## References

- Official documentation: <https://polylang.pro/doc/polylang-for-woocommerce/>
- Official documentation: <https://polylang.pro/doc/function-reference/>
- Verified source paths:
  - `wp-content/plugins/polylang-wc/polylang-wc.php`
  - `wp-content/plugins/polylang-wc/src/data-store.php`
  - `wp-content/plugins/polylang-wc/src/object-language.php`
  - `wp-content/plugins/polylang-wc/src/translated-object-language.php`
  - `wp-content/plugins/polylang-wc/src/product-language-cpt.php`
  - `wp-content/plugins/polylang-wc/src/order-language-cpt.php`
  - `wp-content/plugins/polylang-wc/src/products.php`
  - `wp-content/plugins/polylang-wc/src/frontend/frontend-cart.php`
  - `wp-content/plugins/polylang-wc/src/store-blocks.php`
  - `wp-content/plugins/polylang-wc/src/stock.php`
  - `wp-content/plugins/polylang-wc/src/variation-data-store-cpt.php`
  - `wp-content/plugins/polylang-wc/src/hpos-orders-query.php`
  - `wp-content/plugins/polylang-wc/src/strings.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Module.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Translated/Product.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Translated/Batch.php`
  - `wp-content/plugins/polylang-wc/src/modules/REST/Filtered/Order.php`
