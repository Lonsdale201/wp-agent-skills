---
name: wc-variations-pricing-filters
description: Customize WooCommerce variation prices without stale or cross-user parent price caches. Covers direct variation getter filters, parent aggregation filters, the `woocommerce_get_variation_prices_hash` cache contract, bounded pricing contexts, role checks, tax/display separation, cache invalidation, and when stored CRUD prices are preferable. Use for B2B, role, segment, campaign, or context-dependent variation pricing.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-product-variable.php
  - wp-content/plugins/woocommerce/includes/class-wc-product-variation.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variable-data-store-cpt.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-data.php
---

# WooCommerce variation pricing filters

A selected `WC_Product_Variation` price and a parent variable product's min/max price range use different filter paths. Implementing only one produces inconsistent catalog and variation UI.

## Filter chain

### Direct variation object

In view context, variation getters use:

```text
woocommerce_product_variation_get_price
woocommerce_product_variation_get_regular_price
woocommerce_product_variation_get_sale_price
```

These affect `$variation->get_price()` but do not by themselves rebuild a parent variable product's cached price range.

### Parent aggregation

`WC_Product_Variable::get_variation_prices()` loads raw child values and applies:

```text
woocommerce_variation_prices_price
woocommerce_variation_prices_regular_price
woocommerce_variation_prices_sale_price
```

Each receives `( $price, WC_Product_Variation $variation, WC_Product_Variable $parent )`. The resulting arrays are cached in the parent's `wc_var_prices_<id>` transient by a context hash.

### Display/tax edge

`get_variation_prices( false )` is raw business data. `get_variation_prices( true )` adapts for shop tax display. Do not use display-adjusted values for authorization, thresholds, or stored calculations.

## Role-based example

```php
function myplugin_is_wholesale_request(): bool {
    if ( ! is_user_logged_in() ) {
        return false;
    }

    return in_array( 'wholesale_customer', wp_get_current_user()->roles, true );
}

function myplugin_apply_wholesale_price( $price ) {
    if ( '' === $price || ! myplugin_is_wholesale_request() ) {
        return $price;
    }

    return wc_format_decimal( (float) $price * 0.90, wc_get_price_decimals() );
}

add_filter(
    'woocommerce_product_variation_get_price',
    static function ( $price, WC_Product_Variation $variation ) {
        return myplugin_apply_wholesale_price( $price );
    },
    20,
    2
);

add_filter(
    'woocommerce_variation_prices_price',
    static function ( $price, WC_Product_Variation $variation, WC_Product_Variable $parent ) {
        return myplugin_apply_wholesale_price( $price );
    },
    20,
    3
);

add_filter(
    'woocommerce_get_variation_prices_hash',
    static function ( array $hash, WC_Product_Variable $product, bool $for_display ): array {
        $hash['myplugin_pricing_context'] = myplugin_is_wholesale_request() ? 'wholesale' : 'retail';
        $hash['myplugin_rules_version']   = (int) get_option( 'myplugin_pricing_rules_version', 1 );
        return $hash;
    },
    20,
    3
);
```

Do not call `current_user_can( 'wholesale_customer' )` when `wholesale_customer` is merely a role slug. Roles and capabilities are different. Prefer a real custom capability when the pricing entitlement is security-sensitive; otherwise check the user's roles explicitly.

## Cache context is mandatory

The default variation-price hash includes tax display/customer tax context and active variation pricing callbacks. It cannot infer values read inside your callback, such as:

- user role or B2B group;
- currency/price list;
- region not represented by Woo tax context;
- A/B bucket;
- pricing rule version;
- bounded campaign period.

Add every output-changing context to `woocommerce_get_variation_prices_hash`. Keep dimensions bounded. Never append current timestamps, random values, raw user IDs, session IDs, or arbitrary request parameters: each unique hash creates another cached price array and can cause transient bloat.

For time-based pricing, use a finite campaign ID or coarse period key and increment a rule version on configuration changes.

## Which values to filter

Price semantics must remain coherent:

- `price` is the effective current value.
- `regular_price` is the non-sale reference.
- `sale_price` is the sale value or empty.

A permanent role discount usually changes effective `price` only; decide whether it should appear as a WooCommerce sale. If you also filter sale/regular values, ensure `sale_price < regular_price`, empty sale values remain empty, and parent range/on-sale badges match the selected variation.

Do not return formatted HTML or currency strings from numeric price filters. Return decimal-compatible numeric strings.

## Avoid recursion and global state leaks

Inside a variation price getter filter, do not call the same getter on the same object:

```php
// WRONG: recursive.
add_filter( 'woocommerce_product_variation_get_price', static function ( $price, $variation ) {
    return $variation->get_price() * 0.9;
}, 10, 2 );
```

Use the `$price` argument. If a rule needs stored unfiltered data, read with edit context deliberately and document that this bypasses view filters:

```php
$stored_regular = $variation->get_regular_price( 'edit' );
```

Do not mutate and save products from a price read filter. Filters can execute many times and during cache generation.

## Invalidation when rules change

Changing callback code does not necessarily invalidate existing parent price arrays. Use one of these strategies:

1. Add a bounded rules version to the variation price hash and increment it on settings migration/update.
2. For known affected parents, call `wc_delete_product_transients( $parent_id )` after the rule changes.
3. For a true store-wide semantic change, invalidate the WooCommerce product transient version deliberately, understanding the broad cache impact.

Do not clear product transients on every frontend price read.

## When filters are the wrong model

Use product CRUD and stored prices when the value is canonical for all shoppers and should drive reports, exports, REST responses, indexing, and admin screens. Use filters only for request-context pricing where every relevant read path is controlled.

Cart/order totals capture prices at the transaction boundary. Revalidate entitlement during add-to-cart/checkout; a display filter alone is not protection against crafted requests or stale sessions.

## Test matrix

Test simple and variable product displays, selected variation, cart, checkout, Store API, taxes inclusive/exclusive, VAT exemption, guest/each role, cache warm order (retail then wholesale and reverse), sale prices, currency context, and rule version changes.

Inspect both:

```php
$variation->get_price();
$parent->get_variation_prices( false );
$parent->get_variation_prices( true );
```

## Critical rules

- Cover direct variation and parent aggregation paths.
- Add all bounded pricing contexts to the hash.
- Never use role names as capabilities accidentally.
- Never use unbounded user/session/time data in the hash.
- Return numeric values, not formatted HTML.
- Keep filters side-effect free and non-recursive.
- Revalidate price entitlement when creating cart/order values.

## Cross-references

- `wc-variations-data` for stored variation CRUD and deferred parent sync.
- `wc-cart-checkout-classic` for captured cart prices.
- `wc-store-api` for shopper API price responses.

## References

- Parent aggregation/cache hash: `includes/data-stores/class-wc-product-variable-data-store-cpt.php`.
- Variation getter prefix: `includes/class-wc-product-variation.php` and `includes/abstracts/abstract-wc-data.php`.
