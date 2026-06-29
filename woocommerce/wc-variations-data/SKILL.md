---
name: wc-variations-data
description: Read, query, and write WooCommerce product variations correctly —
  the WC_Product_Variable (parent) vs WC_Product_Variation (child) class
  split, the parent's get_variation_prices( $for_display ) cached
  aggregation and how to bust the wc_var_prices_<id> transient,
  programmatic variation creation via WC_Product_Variation + set_parent_id
  + set_attributes + save followed by WC_Product_Variable::sync, the
  inherited-vs-own variation stock model (parent flag, variation flag, derived
  stock_status), get_available_variations for frontend variation data, and the
  $for_display tax-handling parameter that breaks display logic when
  forgotten. Use when scaffolding plugin code that creates / queries /
  modifies variations or when debugging stale variation data after
  programmatic writes. Triggers on WC_Product_Variation,
  WC_Product_Variable, get_variation_prices, get_available_variations,
  product_variation post type, wc_var_prices, sync_variation, or
  programmatic variation creation context.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.x"
php-min: "7.4"
last-updated: "2026-06-29"
docs:
  - https://github.com/woocommerce/woocommerce/wiki/Product-Variations
  - https://woocommerce.com/document/managing-product-variations/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-product-variable.php
  - wp-content/plugins/woocommerce/includes/class-wc-product-variation.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variable-data-store-cpt.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variation-data-store-cpt.php
  - wp-content/plugins/woocommerce/includes/wc-product-functions.php
---

# WooCommerce: variations data layer (CRUD + cache)

For plugin code that **reads, queries, or programmatically writes** product variations. The pricing/display side (filter chain, sale-price overrides, frontend "Variation X is selected" hooks) is sibling skill `wc-variations-pricing-filters` — this one stops at the data layer.

## Misconception this skill corrects

> "A variation is just a product. I'll `wp_insert_post( 'product_variation', ... )` and `update_post_meta` for price."

Variations work that way at the database level, but the data layer caches aggressively at the parent level. A raw post-insert leaves the parent's stored `_price` values, lookup table row, child-list transient, and `wc_var_prices_<id>` transient stale — your variation exists but the catalog shows the OLD price range, "Out of stock" stays on a re-stocked variable product, and frontend variation data may not see the new child until caches are rebuilt.

## When to use this skill

Trigger when ANY of the following is true:

- Programmatically creating, updating, or deleting variations (import scripts, sync from external system, CLI tools).
- Reading variation prices for catalog display, custom listings, or reports.
- Debugging "I added a variation programmatically and the parent's price range / stock didn't update".
- Reviewing code where variations are touched via `wp_insert_post`, `wp_update_post`, `update_post_meta`, or raw `$wpdb` writes against `product_variation` post type.
- The diff or file contains: `WC_Product_Variation`, `WC_Product_Variable`, `get_variation_prices`, `get_available_variations`, `wc_var_prices_`, `sync_variation_names`, or `'product_variation'` post type references.

## Mental model — two classes, one tree

```
Variable product (parent)
  post_type     = 'product'
  class         = WC_Product_Variable
  WP post id    = 100
  Holds:        product attributes (Color: Red, Blue; Size: S, M, L)
                cached min/max prices, derived stock status

  └── Variation (child)
      post_type   = 'product_variation'
      class       = WC_Product_Variation
      post_parent = 100
      WP post id  = 101, 102, 103, ...
      Holds:      attribute values (attribute_pa_color = red, attribute_pa_size = m)
                  own price, own stock, own SKU
```

The parent stores aggregated / derived data; each child variation stores its own concrete values. Almost every "stale data" bug comes from writing to a child without telling the parent to re-aggregate.

## The price aggregation cache — `wc_var_prices_<id>`

`WC_Product_Variable::get_variation_prices( $for_display )` ([includes/class-wc-product-variable.php:99](class-wc-product-variable.php)) returns an array shaped:

```php
array(
    'price'         => array( 101 => '15.00', 102 => '18.00', 103 => '20.00' ), // sorted
    'regular_price' => array( ... ),
    'sale_price'    => array( ... ),
)
```

The aggregation is backed by a transient named `wc_var_prices_<parent_id>` ([includes/data-stores/class-wc-product-variable-data-store-cpt.php](class-wc-product-variable-data-store-cpt.php)). The transient stores entries keyed by:

- A **transient version** from `WC_Cache_Helper::get_transient_version( 'product' )` (busted by `wc_delete_product_transients()`)
- A **price hash** built from current tax display settings, customer VAT-exempt status, rate table, and the active `woocommerce_variation_prices_*` callbacks — different hashes for "include tax" vs "exclude tax", different for VAT-exempt vs not, etc.

The `$for_display` parameter matters:
- `false` (default): RAW prices, before any tax adjustment. Use for storage / comparison / programmatic logic.
- `true`: prices adapted for the `woocommerce_tax_display_shop` setting (include / exclude tax). Use ONLY when rendering UI.

A common bug: read with `$for_display = true` then do business logic on the result — the value drifts depending on tax settings. Always read raw for logic, display-mode only at the render edge.

## Programmatic variation creation — the right sequence

```php
$parent_id = 100; // an existing WC_Product_Variable

$variation = new WC_Product_Variation();
$variation->set_parent_id( $parent_id );

// Attributes — keys are attribute slugs (taxonomy or custom), values are
// the chosen term slug. Both must already exist on the parent.
$variation->set_attributes( array(
    'pa_color' => 'red',
    'pa_size'  => 'm',
) );

$variation->set_regular_price( '20.00' );
$variation->set_price( '20.00' );           // current price (= sale or regular)
$variation->set_manage_stock( true );
$variation->set_stock_quantity( 50 );
$variation->set_stock_status( 'instock' );
$variation->set_sku( 'TSHIRT-RED-M' );

$variation_id = $variation->save();  // returns the new variation post ID; clears parent product transients in WC 10.7

// CRITICAL — invalidate the parent's caches and re-aggregate.
wc_delete_product_transients( $parent_id );
WC_Product_Variable::sync( $parent_id );
```

`wc_delete_product_transients( $parent_id )` clears product-specific transients such as `wc_product_children_<id>`, `wc_var_prices_<id>`, `wc_child_has_weight_<id>`, and `wc_child_has_dimensions_<id>`. `WC_Product_Variable::sync( $parent_id )` recomputes the parent from its children: it rewrites the parent's stored `_price` meta values, updates `wc_product_meta_lookup`, refreshes derived stock status, syncs legacy attributes, then saves the parent.

Skip the sync and raw cache invalidation after direct writes and: catalog shows old price range, parent shows "out of stock" until next manual save, or frontend variation data is built from stale child/transient data.

## Querying variations

```php
// CHILDREN OF A PARENT — use $variable->get_children() (returns IDs)
$variable = wc_get_product( $parent_id );
if ( $variable instanceof WC_Product_Variable ) {
    foreach ( $variable->get_children() as $variation_id ) {
        $variation = wc_get_product( $variation_id );
        // $variation is a WC_Product_Variation
    }
}

// FRONTEND DISPLAY DATA — JSON-shaped for swatch / dropdown UIs
$available = $variable->get_available_variations(); // array of arrays

// Each entry has: variation_id, attributes, display_price, display_regular_price,
// is_in_stock, max_qty, min_qty, image, sku, weight_html, dimensions_html, etc.
```

`get_available_variations()` is what the classic variable-product template embeds inline when the variation count is below `woocommerce_ajax_variation_threshold` (default 30). Above that threshold, WC AJAX resolves one matching variation and calls `get_available_variation()` for that variation. The default array mode is heavy; if you only need objects, use `$variable->get_available_variations( 'objects' )`, or use `get_children()` and read only the properties you need.

## The variation stock inheritance model

| Setting on | What it does |
|---|---|
| Parent `manage_stock = 'yes'`, variation `manage_stock = 'no'` | Variation inherits the parent's stock quantity / backorders / stock status. Internally `WC_Product_Variation::get_manage_stock()` returns `'parent'`. |
| Variation `manage_stock = 'yes'` | Per-variation stock. The variation has its own `stock_quantity` and is managed by its own ID even if the parent also manages stock. **This is the common case for size/color inventory.** |
| Parent `manage_stock = 'no'`, variation `manage_stock = 'no'` | Variation has only `stock_status` (`instock` / `outofstock` / `onbackorder`) without a quantity counter. |

Reading the effective stock status:

```php
// Variation's own stock status (already accounts for managed-quantity rollover)
$variation->get_stock_status(); // 'instock' / 'outofstock' / 'onbackorder'

// Parent's display status — derived from children, set by sync()
$variable->get_stock_status();
```

After programmatic stock changes, `WC_Product_Variable::sync( $parent_id )` recomputes the parent's display status from the children. Without the sync the parent shows stale.

## When parent must be re-synced — checklist

Call `wc_delete_product_transients( $parent_id )` + `WC_Product_Variable::sync( $parent_id )` whenever you:

- Add a new variation
- Delete a variation
- Change a variation's regular_price / sale_price / price
- Change a variation's stock_quantity / stock_status / manage_stock
- Change a variation's enabled / disabled flag (post_status)
- Bulk update attributes that affect availability

In WC 10.7, `$variation->save()` clears product transients for the variation and its parent, but it does not replace the parent aggregation sync. For cron jobs, REST imports, CLI scripts, and any cross-request flow, collect touched parent IDs and call `WC_Product_Variable::sync()` once per parent after the batch.

## Hook checkpoints for variation data

Use these when a plugin needs to observe or extend variation data without taking over pricing filters:

| Hook | Use |
|---|---|
| `woocommerce_new_product_variation` | A variation was created through CRUD. Args: variation ID, `WC_Product_Variation`. |
| `woocommerce_update_product_variation` | A variation was updated through CRUD. Good for external index refreshes. |
| `woocommerce_new_product_variation_data` | Last chance to alter the post array before `wp_insert_post()` creates a variation. |
| `woocommerce_available_variation` | Modify the frontend variation data array returned by `get_available_variation()`. |
| `woocommerce_hide_invisible_variations` | Decide whether disabled / empty-price variations are hidden from `get_available_variations()`. |
| `woocommerce_show_variation_price` | Decide whether selected variation price HTML is included in the frontend data array. |
| `woocommerce_variable_product_sync_data` | Parent variable product has just re-synced from children. Use for dependent caches. |

## Reading variation prices for display

```php
$variable = wc_get_product( $parent_id );

// "From €X to €Y" range string — handles all the formatting + tax display
echo wp_kses_post( $variable->get_price_html() );

// Manually if you need the raw values:
$prices = $variable->get_variation_prices( true );  // for_display = true for UI
$min    = current( $prices['price'] );
$max    = end( $prices['price'] );
```

For non-display logic (filtering, sorting in custom listings), pass `$for_display = false` — raw prices, no tax adjustment.

## Critical rules

- **`WC_Product_Variation` is the right class** for programmatic create/update of a single variation. Don't `wp_insert_post( 'product_variation', ... )` directly.
- **`set_parent_id` + `set_attributes` + `save()`** is the minimum sequence; attributes MUST match the parent's available attribute terms.
- **After every programmatic mutation**, call `wc_delete_product_transients( $parent_id )` AND `WC_Product_Variable::sync( $parent_id )`; for bulk CRUD, sync each touched parent once after the loop. The latter is a static method on `WC_Product_Variable`, not an instance method.
- **`get_variation_prices( $for_display )` — always be explicit about `$for_display`.** Default is `false` (raw); pass `true` only at the render edge.
- **`get_children()` for cheap iteration**, `get_available_variations()` for full UI-ready data — different costs.
- **Parent stock vs variation stock are independent flags.** Most stores want variation-level (`manage_stock` on the variation, `manage_stock = no` on the parent).
- **Don't query variations via `WP_Query` / `get_posts` for hot-path code.** Use `$variable->get_children()` and `wc_get_product()` per ID — the data store handles visible-child rules and cached child lists.
- **HPOS doesn't affect variations.** Products and variations stay in `wp_posts` / `wp_postmeta` even with HPOS on (HPOS is order-table only). Variation reads / writes don't change between HPOS and legacy modes.

## Common mistakes

```php
// WRONG — raw post insert leaves parent caches stale
$variation_id = wp_insert_post( array(
    'post_type'   => 'product_variation',
    'post_parent' => $parent_id,
    'post_status' => 'publish',
) );
update_post_meta( $variation_id, '_price', '20.00' );
// Catalog shows old price range; frontend variation data may be stale.

// RIGHT
$variation = new WC_Product_Variation();
$variation->set_parent_id( $parent_id );
$variation->set_attributes( array( 'pa_color' => 'red' ) );
$variation->set_regular_price( '20.00' );
$variation->set_price( '20.00' );
$variation->save();
wc_delete_product_transients( $parent_id );
WC_Product_Variable::sync( $parent_id );

// WRONG — passing $for_display = true and then doing logic on the value
$prices = $variable->get_variation_prices( true );
if ( current( $prices['price'] ) < 10 ) { /* ... */ }
// On a tax-inclusive store, current('price') is post-tax — your < 10 threshold is wrong.

// RIGHT — read raw for logic, display-mode only at the render edge
$prices = $variable->get_variation_prices( false );
if ( (float) current( $prices['price'] ) < 10 ) { /* ... */ }

// RIGHT — in bulk imports, sync each parent once after the loop
$touched_parents = array();
foreach ( $rows as $row ) {
    $v = new WC_Product_Variation();
    $v->set_parent_id( $row['parent_id'] );
    $v->set_regular_price( $row['price'] );
    $v->save();
    $touched_parents[ $row['parent_id'] ] = true;
}
foreach ( array_keys( $touched_parents ) as $parent_id ) {
    wc_delete_product_transients( $parent_id );
    WC_Product_Variable::sync( $parent_id );
}
```

Also avoid: assuming parent stock applies to variation-managed stock, and querying child variations via `WP_Query` / `get_posts` in hot paths instead of `$variable->get_children()`.

## Cross-references

- Run **`wc-variations-pricing-filters`** for the price filter chain (`woocommerce_product_variation_get_price`, `woocommerce_variation_prices_price`, etc.) — when a plugin needs to mutate variation prices via filters rather than direct CRUD.
- Run **`wc-variation-gallery`** for WooCommerce 10.9+ native variation gallery data (`gallery_image_ids`, `gallery_images_html`, REST v3 gallery payloads, and Additional Variation Images migration).
- Run **`wc-product-search-select`** when the UI needs an admin product picker — `woocommerce_json_search_products_and_variations` returns variation IDs alongside parent products.
- Run **`wp-plugin-cron`** for batch imports — cron callbacks scheduled idempotently are the right place for bulk variation operations.

## What this skill does NOT cover

- The price filter chain. Mutating variation prices via filters (without changing stored data) is a separate topic — see `wc-variations-pricing-filters`.
- The frontend variation switching UX (`found_variation` JS event, AJAX swatch / dropdown logic). That's frontend territory; this skill is data-layer.
- Variation image handling beyond `set_image_id()`. Native variation galleries are covered by `wc-variation-gallery`.
- Grouped products and external products — different post types, different rules.
- WC subscriptions variations (subscription products + variation pricing) — covered by the WC Subscriptions plugin, not core.
- Product attributes registration / management — orthogonal topic; variations consume already-existing attributes.

## References

- `WC_Product_Variable::get_variation_prices` and the cache: [wp-content/plugins/woocommerce/includes/class-wc-product-variable.php:99](class-wc-product-variable.php).
- `WC_Product_Variable::sync()` (static): [wp-content/plugins/woocommerce/includes/class-wc-product-variable.php](class-wc-product-variable.php).
- Variation data store, transient name `wc_var_prices_`, price hash inputs: [wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variable-data-store-cpt.php](class-wc-product-variable-data-store-cpt.php).
- `WC_Product_Variation`: [wp-content/plugins/woocommerce/includes/class-wc-product-variation.php](class-wc-product-variation.php).
- `wc_delete_product_transients()` for cache invalidation: [wp-content/plugins/woocommerce/includes/wc-product-functions.php](wc-product-functions.php).
