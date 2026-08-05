---
name: wc-product-crud-cache
description: Read and write WooCommerce products safely through `WC_Product` CRUD while accounting for the WooCommerce 11.0 `product_instance_caching` request cache. Covers view versus edit context, save and invalidation boundaries, direct WordPress meta writes, raw SQL hazards, variation-parent synchronization, taxonomy recount filtering, bulk jobs, and tests with the feature both enabled and disabled. Use when code calls `wc_get_product()`, mutates product or variation data, imports catalogs, changes product term counts, reports stale values, or depends on repeated product loads returning fresh objects.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-05"
---

# WooCommerce product CRUD and request cache

Use this skill for products and variations whenever an extension reads, changes, imports, or caches catalog data. WooCommerce 11.0 enables product instance caching for newly installed stores; existing stores preserve their previous opt-in state. Correct code must work in both modes.

## Public contract

Load and persist through WooCommerce CRUD:

```php
$product = wc_get_product( $product_id );

if ( ! $product instanceof WC_Product ) {
    return;
}

$product->set_regular_price( wc_format_decimal( $price ) );
$product->set_name( sanitize_text_field( $name ) );
$product->save();
```

Use `view` getters for customer-facing output and `edit` getters for canonical stored values:

```php
$display_name = $product->get_name( 'view' );
$stored_name  = $product->get_name( 'edit' );
```

Filters can alter `view` results. Do not use display-filtered values as storage input or as a concurrency token.

## WooCommerce 11.0 product instance cache

The public feature check is:

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

$enabled = FeaturesUtil::feature_is_enabled( 'product_instance_caching' );
```

When enabled, `WC_Product_Factory` caches loaded `WC_Product` objects in the `product_objects` WordPress object-cache group. WooCommerce marks that group non-persistent, so the optimization is request-local even when Redis or Memcached is installed. The cache saves repeated hydration work; it is not a durable catalog cache.

WordPress object cache returns object clones. Do not depend on object identity across repeated `wc_get_product( $id )` calls, and do not assume mutating one loaded object changes another. A setter changes only that object until `save()` persists it.

Do not import `Automattic\WooCommerce\Internal\Caches\ProductCache` or its controller. They are internal implementation APIs. Use CRUD and WooCommerce's public feature check.

## Invalidation boundaries

WooCommerce 11.0 invalidates request-cached product instances on:

- normal product/variation CRUD saves;
- `clean_post_cache` for product posts;
- WordPress `added_post_meta`, `updated_post_meta`, and `deleted_post_meta` operations;
- WooCommerce direct stock and sales update hooks.

Therefore `update_post_meta()` is still discouraged for domain writes, but it does trigger instance-cache invalidation. Raw SQL triggers none of those hooks and can leave the request cache, product transients, lookup tables, and parent aggregates stale.

```php
// Wrong: bypasses the product data store and all hook-driven invalidation.
$wpdb->update( $wpdb->postmeta, array( 'meta_value' => $price ), array( 'post_id' => $product_id, 'meta_key' => '_price' ) );
```

If a legacy integration cannot avoid a direct database write, it owns every affected lookup-table update, cache invalidation, parent synchronization, and concurrent-write rule. Replacing the write with CRUD is normally safer than reproducing that contract.

## Variations and same-request reads

Variation CRUD clears affected product caches and queues the parent for deduplicated synchronization at shutdown. This is efficient for imports:

```php
foreach ( $rows as $row ) {
    $variation = wc_get_product( (int) $row['variation_id'] );
    if ( $variation instanceof WC_Product_Variation ) {
        $variation->set_regular_price( wc_format_decimal( $row['price'] ) );
        $variation->save();
    }
}
```

If later code in the same request must observe rebuilt parent price/stock aggregates immediately, call `WC_Product_Variable::sync( $parent_id )` once after the final child write. Do not synchronize once per row.

## Product taxonomy recounts in WooCommerce 11.0

`_wc_term_recount()` now applies `woocommerce_term_recount_product_count( $count, $term_id, $taxonomy )` immediately before storing the taxonomy-specific product count in term meta. Use it only when an extension owns a deliberate alternative visibility/counting rule:

```php
add_filter(
    'woocommerce_term_recount_product_count',
    static function ( int $count, int $term_id, WP_Taxonomy $taxonomy ): int {
        return max( 0, $count );
    },
    10,
    3
);
```

The filter runs during recount work and can execute for many terms. Keep it deterministic, bounded, and free of product hydration loops or remote calls. It changes Woo's stored count projection, not term relationships; trigger normal Woo recount/invalidation paths after the underlying catalog rule changes instead of writing `product_count_*` meta directly.

## Bulk and concurrent jobs

- Process bounded batches and resume with Action Scheduler; do not hydrate an entire catalog in one request.
- Reload before making a decision that depends on current database state. A previously loaded object is not a lock.
- Make jobs idempotent and include the source version/hash in job arguments.
- Use product CRUD for writes and let WooCommerce invalidate caches.
- Never serialize `WC_Product` objects into scheduled-action arguments, options, or sessions; pass IDs and reload.

## Test matrix

Run integration tests twice: with `product_instance_caching` explicitly disabled and enabled. In each mode verify:

1. repeated `wc_get_product()` reads return the same data without relying on `===` identity;
2. a CRUD save is visible to a fresh load in the same request;
3. `update_post_meta()` invalidates a previously loaded instance;
4. variation writes update the parent after shutdown or explicit one-time sync;
5. raw-SQL paths are absent, or have explicit regression tests for every invalidation obligation.

## Cross-references

- `wc-variations-data` for variation parent/child storage and price caches.
- `wc-action-scheduler-jobs` for bounded catalog jobs.
- `wc-product-attribute-swatches` and `wc-variation-gallery` for specialized product data.
- `wc-extension-upgrade-audit` when moving an extension between WooCommerce versions.

## References

- `includes/class-wc-product-factory.php`
- `src/Internal/Caches/ProductCache.php`
- `src/Internal/Caches/ProductCacheController.php`
- `includes/data-stores/class-wc-product-data-store-cpt.php`
- `includes/class-wc-install.php`
- Public feature API: `src/Utilities/FeaturesUtil.php`
