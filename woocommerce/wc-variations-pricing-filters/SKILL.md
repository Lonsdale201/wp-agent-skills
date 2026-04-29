---
name: wc-variations-pricing-filters
description: Mutate WooCommerce variation prices via filters — pick the
  right layer (woocommerce_product_get_price for simple/non-variation products,
  woocommerce_product_variation_get_price for variations, the
  woocommerce_variation_prices_* family for the parent min/max
  aggregation that feeds the catalog "From X to Y" range), and the
  critical step of filtering woocommerce_get_variation_prices_hash whenever your price
  logic depends on context outside the default cache key (user role,
  custom toggle, time of day) — otherwise one user's filtered price
  gets cached and served to everyone. Use for role-based pricing,
  time-based discounts, or "filter variation prices but the min/max
  range doesn't update" debugging. Triggers on
  woocommerce_product_get_price,
  woocommerce_product_variation_get_price,
  woocommerce_variation_prices_*, woocommerce_get_variation_prices_hash,
  wc_var_prices.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.x"
php-min: "7.4"
last-updated: "2026-04-29"
docs:
  - https://woocommerce.com/document/woocommerce-pricing-functions/
  - https://github.com/woocommerce/woocommerce/wiki/Product-Variations
---

# WooCommerce: variation pricing filter chain

For plugin code that **modifies variation prices via filters** without rewriting the stored data — role-based pricing, time-based discounts, B2B tier overrides, currency-conversion display, "X% off when feature flag Y" experiments. The CRUD side (programmatic create/update of stored prices) is sibling skill `wc-variations-data`.

This is the topic with the most "I added the filter, why doesn't the catalog update" tickets. The reason is almost always: you filtered the wrong layer, or you didn't bust the cache, or you didn't add to the hash.

## Misconception this skill corrects

> "I'll add a `woocommerce_product_get_price` filter and variations will update everywhere."

`woocommerce_product_get_price` does not fire for `WC_Product_Variation`; variations use the type-specific `woocommerce_product_variation_get_price` hook. Even that single-variation hook **does NOT cover the parent variable product's min/max price range** — the range is built by iterating variations through the `woocommerce_variation_prices_*` chain, then cached in `wc_var_prices_<parent_id>`. If you only filter the single-product getter layer, the catalog "From €X to €Y" range stays at the unfiltered values until cache expires or until you also filter the aggregation layer.

## When to use this skill

Trigger when ANY of the following is true:

- Adding role-based, time-based, currency-based, or feature-flag-based pricing for variations.
- Reviewing a `woocommerce_product_*get_price` filter — verify it covers all the layers it needs to.
- Debugging "my variation price filter works on the variation page but the catalog still shows old prices".
- Debugging "my filter works for one user but caches incorrectly for everyone else".
- The diff or file contains: `woocommerce_product_get_price`, `woocommerce_product_variation_get_price`, `woocommerce_variation_prices_*`, `woocommerce_get_variation_prices_hash`, `wc_var_prices_`.

## The chain — top to bottom

```
                         Single product getter layer:
                  ┌──────────────────────────┐
                  │  $variation->get_price() │   WC_Product_Variation
                  └──────────────────────────┘
                                │
                                ▼
                woocommerce_product_variation_get_price

                  ┌──────────────────────────────┐
                  │  $simple->get_price()        │   simple/non-variation product
                  └──────────────────────────────┘
                                │
                                ▼
                woocommerce_product_get_price


                  ┌──────────────────────────────────────┐
                  │  $variable->get_variation_prices()   │   parent's min/max aggregation
                  └──────────────────────────────────────┘
                                │
                                ▼
                  Iterates each variation, calling:
                woocommerce_variation_prices_price            (variation->get_price( 'edit' ) raw active price)
                woocommerce_variation_prices_regular_price    (variation->get_regular_price( 'edit' ))
                woocommerce_variation_prices_sale_price       (variation->get_sale_price( 'edit' ))
                                │
                                ▼
                Accumulating price arrays:
                woocommerce_variation_prices_array            ({price, regular_price, sale_price} keyed by variation ID)
                                │
                                ▼
                Aggregated, sorted, cached as wc_var_prices_<parent_id>:
                woocommerce_variation_prices                  (final array used by get_price_html, range, etc.)


                  ┌─────────────────────────────────────────┐
                  │  Cache-key control                      │
                  │  woocommerce_get_variation_prices_hash  │   (CRITICAL when filter depends on
                  └─────────────────────────────────────────┘       context outside the default hash)
```

Source-verified in [wp-content/plugins/woocommerce/includes/data-stores/class-wc-product-variable-data-store-cpt.php](class-wc-product-variable-data-store-cpt.php) — lines 383, 401, 414, 490, 540, 653.

## Choosing the right filter for the job

| Goal | Filter to use |
|---|---|
| Change a single variation's price when displayed on the variation page (AJAX swap) | `woocommerce_product_variation_get_price` |
| Change a single variation's price for any `$variation->get_price()` call | Same as above |
| Change a simple / non-variation product's price | `woocommerce_product_get_price` |
| Change all product prices including variations | Hook both `woocommerce_product_get_price` and `woocommerce_product_variation_get_price`; they are different getter prefixes. |
| Make the parent's min/max RANGE reflect your override | `woocommerce_variation_prices_price` (+ `_regular_price`, `_sale_price` if you change those too) |
| Modify the FINAL aggregated array (sorting, removing entries, etc.) | `woocommerce_variation_prices` |
| Modify the accumulating aggregation arrays during each variation iteration | `woocommerce_variation_prices_array` |

The common composition: **filter both `woocommerce_product_variation_get_price` AND `woocommerce_variation_prices_price`** with the same logic. The first covers ad-hoc reads (variation page, cart, REST), the second covers the parent's aggregated range cache.

## The cache-key trap

`get_variation_prices( $for_display )` caches results in `wc_var_prices_<parent_id>` keyed by:

- A transient version (busted by `wc_delete_product_transients`).
- A price hash built from the default inputs: `$for_display` setting, current tax rate table, customer VAT-exempt status.
- Active callbacks on `woocommerce_variation_prices_price`, `woocommerce_variation_prices_regular_price`, and `woocommerce_variation_prices_sale_price` are also folded into the hash. WC 10.5+ has `woocommerce_use_legacy_get_variations_price_hash` to switch the callback-signature algorithm.

**If your filter depends on anything outside that hash** — current user's role, B2B group membership, a feature flag, the time of day, an A/B test bucket — your filtered result gets cached under the default-hash key. The first user to hit the page warms the cache with their variant; everyone else gets the same cached value. You'll see "the wrong user's price". This is the second-most-common bug after "filter doesn't fire on the parent range".

The fix is `woocommerce_get_variation_prices_hash`:

```php
add_filter( 'woocommerce_get_variation_prices_hash', static function (
    array $hash,
    WC_Product $product,
    bool $for_display
): array {
    // Add user role to the hash so each role gets its own cached entry.
    $user = wp_get_current_user();
    $hash['_role'] = $user->roles ? array_values( $user->roles ) : array( 'guest' );
    return $hash;
}, 10, 3 );
```

Anything you read in your price filters that varies per request → must be reflected in the hash.

## Concrete example — role-based 10% discount on variations

```php
// 1. Per-variation reads (variation page AJAX, cart, REST)
add_filter( 'woocommerce_product_variation_get_price', 'myplugin_apply_role_discount', 10, 2 );

// 2. Per-variation values inside the parent's aggregation
add_filter( 'woocommerce_variation_prices_price',         'myplugin_apply_role_discount_to_aggregation', 10, 3 );
add_filter( 'woocommerce_variation_prices_regular_price', 'myplugin_apply_role_discount_to_aggregation', 10, 3 );
add_filter( 'woocommerce_variation_prices_sale_price',    'myplugin_apply_role_discount_to_aggregation', 10, 3 );

// 3. CRITICAL — add user role to the cache key
add_filter( 'woocommerce_get_variation_prices_hash', 'myplugin_add_role_to_price_hash', 10, 3 );

function myplugin_should_discount(): bool {
    return current_user_can( 'wholesale_customer' );
}

function myplugin_apply_role_discount( $price, $product ) {
    if ( '' === $price || ! myplugin_should_discount() ) {
        return $price;
    }
    return (float) $price * 0.9; // 10% off
}

function myplugin_apply_role_discount_to_aggregation( $price, $variation, $product ) {
    if ( '' === $price || ! myplugin_should_discount() ) {
        return $price;
    }
    return (float) $price * 0.9;
}

function myplugin_add_role_to_price_hash( array $hash, $product, $for_display ): array {
    $user = wp_get_current_user();
    $hash['_myplugin_wholesale'] = current_user_can( 'wholesale_customer' ) ? 'yes' : 'no';
    return $hash;
}
```

The three layers all carry the same pricing logic, and the hash filter ensures the discounted result is cached under a separate key for wholesale users so guest visitors don't see (or get cached) the wholesale price.

## Cache busting — when the price logic itself changes

The hash mechanism handles per-request variation. But if the **rule itself** changes (you flip a "discount campaign active" option from off to on), you need to invalidate everything that was cached under the old rule:

```php
add_action( 'update_option_myplugin_discount_active', static function ( $old, $new ): void {
    if ( $old !== $new ) {
        // Bust ALL product transients site-wide. Granular invalidation isn't
        // straightforward — the version-key approach below is the WC-native way.
        WC_Cache_Helper::get_transient_version( 'product', true ); // true = regenerate
    }
}, 10, 2 );
```

`WC_Cache_Helper::get_transient_version( 'product', true )` regenerates the product transient version used by the variation-price cache validation, so the next `get_variation_prices()` read recomputes instead of trusting old `wc_var_prices_<id>` entries.

For per-product invalidation:

```php
wc_delete_product_transients( $parent_id ); // clears wc_var_prices_<id> and related product transients
```

## Critical rules

- **Apply pricing to BOTH the ad-hoc layer (`*_get_price`) AND the aggregation layer (`woocommerce_variation_prices_*`)** if you want catalog ranges to reflect the change. One layer alone leaves visible inconsistencies.
- **Add to `woocommerce_get_variation_prices_hash`** any input your filter reads that's not already in the default hash. Otherwise everyone gets the first user's cached result.
- **Use `woocommerce_product_variation_get_price` for variation changes**, `woocommerce_product_get_price` for simple/non-variation products. If the rule truly applies to both simple products and variations, register both hooks; the same product read will not hit both prefixes.
- **Filter `regular_price` and `sale_price` if you also filter `price`** in the aggregation chain. The active `_price` is the current effective price (sale price when an active sale exists, otherwise regular). In the aggregation data store, a sale price only counts as a sale when filtered `sale_price === price` and differs from `regular_price`; filtering only `price` can make sale state and range HTML inconsistent.
- **Bust caches when the RULE changes**, not when individual products change. Use `WC_Cache_Helper::get_transient_version( 'product', true )` for sweeping invalidation.
- **Test with WP_DEBUG and a fresh site cache.** "Works on my machine" means "works against a warm cache that already has my user's hash". Try as a guest, then as the role you're targeting; both should show the right price.
- **Don't try to filter `woocommerce_variation_prices_array` AND the individual `woocommerce_variation_prices_price` / `woocommerce_variation_prices_regular_price` / `woocommerce_variation_prices_sale_price` filters at the same time** with the same logic — double-application bugs. Pick one entry point per concern.

## Common mistakes

```php
// WRONG — single layer, parent range doesn't update
add_filter( 'woocommerce_product_variation_get_price', 'discount', 10, 2 );
// Variation page shows €18 (€20 - 10%)
// Catalog still shows "From €20 to €30" — wrong.

// RIGHT — both layers
add_filter( 'woocommerce_product_variation_get_price', 'discount', 10, 2 );
add_filter( 'woocommerce_variation_prices_price',      'discount_aggregation', 10, 3 );
add_filter( 'woocommerce_variation_prices_regular_price', 'discount_aggregation', 10, 3 );
add_filter( 'woocommerce_variation_prices_sale_price',    'discount_aggregation', 10, 3 );

// WRONG — context-dependent filter without hash modification
add_filter( 'woocommerce_variation_prices_price', function ( $price, $variation, $product ) {
    if ( current_user_can( 'wholesale' ) ) {
        return (float) $price * 0.9;
    }
    return $price;
}, 10, 3 );
// First wholesale user warms the cache → ALL subsequent users (including guests)
// see the wholesale price until cache invalidates.

// RIGHT — also filter the hash
add_filter( 'woocommerce_get_variation_prices_hash', function ( $hash, $product, $for_display ) {
    $hash['_role'] = current_user_can( 'wholesale' ) ? 'wholesale' : 'retail';
    return $hash;
}, 10, 3 );

// WRONG — filtering only _price, not regular/sale; "Sale!" badge breaks
add_filter( 'woocommerce_variation_prices_price', 'apply_discount', 10, 3 );
// In aggregation, sale_price only counts as a sale when filtered sale_price === price
// and differs from regular_price. Filtering only price can make sale state inconsistent.

// WRONG — filtering 'woocommerce_product_get_price' for variation-only logic
add_filter( 'woocommerce_product_get_price', function ( $price, $product ) {
    if ( $product->is_type( 'variation' ) ) {
        return /* discount */;
    }
    return $price;
} );
// This does not run for WC_Product_Variation. Variations use
// woocommerce_product_variation_get_price.

// WRONG — busting cache on every product save (overkill)
add_action( 'save_post_product', static function (): void {
    WC_Cache_Helper::get_transient_version( 'product', true );
} );
// Use wc_delete_product_transients( $product_id ) for per-product invalidation.
// Sweeping invalidation only when the RULE itself changes.

// WRONG — assuming get_variation_prices reads stored prices unfiltered
$prices = $variable->get_variation_prices( false );
// This array reflects ALL active filters. For "what was actually stored", read
// each variation's get_regular_price( 'edit' ) one by one (the 'edit' context
// bypasses the display filters).
```

## When you don't actually need a filter

Two scenarios where filters are the wrong tool:

1. **Permanent, store-wide price change.** Update the stored prices via CRUD (`wc-variations-data`). Filters are for context-dependent overrides.
2. **Time-bounded sale that's the same for everyone.** Use WC's built-in sale_price + sale_price_dates_from / _to. WC's existing logic handles the cache and display. Don't reinvent.

Filters are right for: per-user / per-role / per-currency / per-feature-flag overrides where the underlying stored price stays the canonical default.

## Cross-references

- Run **`wc-variations-data`** for the CRUD side — programmatic create/update of stored variation prices, when filters are not the right tool.
- Run **`wp-plugin-options-storage`** for the rule-storage option (where the "discount campaign active" toggle lives) — autoload tradeoffs apply.
- Run **`wp-security-audit`** if your filter reads admin-controllable input — capability checks should gate write paths, but filters that READ context (like role) are usually fine without explicit checks.

## What this skill does NOT cover

- The CRUD side of variation prices — see `wc-variations-data`.
- Currency / multi-currency plugins. They typically hook the same chain plus their own conversion layer; the principles here apply but the cache hash gets one more entry.
- Frontend variation switching JS (the `found_variation` event) — frontend territory, not server-side filters.
- WC Subscriptions / membership pricing layers — they apply their own filters on top; investigate per-plugin.
- Coupon-driven discounts — those run later in the cart pipeline, not on `get_price` reads.
- Product-level discounts on simple (non-variable) products — `woocommerce_product_get_price` covers them; the variation-specific chain doesn't apply.

## References

- Per-variation read: [class-wc-product-variation.php](class-wc-product-variation.php) overrides `get_hook_prefix()` to `woocommerce_product_variation_get_`; [abstract-wc-data.php](abstract-wc-data.php) applies that prefix in view context.
- Aggregation chain in the variable data store: [includes/data-stores/class-wc-product-variable-data-store-cpt.php](class-wc-product-variable-data-store-cpt.php) — lines 383 (`woocommerce_variation_prices_price`), 401 (`_regular_price`), 414 (`_sale_price`), 490 (`woocommerce_variation_prices_array`), 540 (`woocommerce_variation_prices`).
- Cache-key control: [class-wc-product-variable-data-store-cpt.php:653](class-wc-product-variable-data-store-cpt.php) — `woocommerce_get_variation_prices_hash`.
- `WC_Cache_Helper::get_transient_version`: [includes/class-wc-cache-helper.php](class-wc-cache-helper.php) — sweeping invalidation primitive.
- `wc_delete_product_transients`: [includes/wc-product-functions.php](wc-product-functions.php) — per-product invalidation.
