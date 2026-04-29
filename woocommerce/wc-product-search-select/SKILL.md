---
name: wc-product-search-select
description: Builds a WooCommerce-style AJAX product search select (the
  selectWoo / wooselect dropdown) — class="wc-product-search" + the
  data-action attribute pointing to woocommerce_json_search_products
  (products only) or woocommerce_json_search_products_and_variations
  (products AND variations, often the right choice). Pre-selected items
  rendered server-side as <option selected> via wc_get_product() +
  get_formatted_name(); WC's wc-enhanced-select script auto-enqueued on
  WC admin screens, explicit enqueue required on non-WC pages. Solves
  the "load 20k products into a select" antipattern AI assistants
  commonly emit. Use when adding a product picker meta box, a custom
  WC admin page selector, or any UI where the user must search and
  pick from many products. Triggers on wc-product-search,
  woocommerce_json_search_products, woocommerce_json_search_products_and_variations,
  selectWoo, wc-enhanced-select, "select2 products in WooCommerce", or
  product-picker meta box scaffolding.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.x"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://github.com/woocommerce/selectWoo
  - https://woocommerce.com/document/woocommerce-json-search/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-ajax.php
  - wp-content/plugins/woocommerce/includes/admin/class-wc-admin-assets.php
  - wp-content/plugins/woocommerce/assets/js/admin/wc-enhanced-select.js
---

# WooCommerce: AJAX product search select (wooselect / selectWoo)

For UIs where the user picks from products (and optionally variations) — meta boxes, settings pages, dashboard widgets. The mistake AI assistants consistently make is loading the entire product catalog into a static `<select>` upfront. WC has a built-in AJAX endpoint for exactly this, with proper variation support, and the wiring is two HTML attributes plus a server-side pre-render of the saved options.

## Misconception this skill corrects

> "I'll query all products with `posts_per_page = -1` and feed them into a `<select>` for the user to pick from."

A WC store can have 20,000+ products plus 10× that in variations. Loading them all server-side is a hard timeout on render and a hard browser-freeze on render-into-DOM. WC ships an AJAX search endpoint for exactly this case — and it has a separate variant that includes variations.

## When to use this skill

Trigger when ANY of the following is true:

- Building a product picker in any plugin admin UI (meta box, settings page, dashboard widget, modal, custom column inline editor).
- The user mentions "select2 with products", "product autocomplete", "dropdown of products" in WC context.
- Reviewing code where you see `<select>` populated by a `WP_Query`/`get_posts` over `product` post type — replace that pattern.
- The diff contains `wc-product-search`, `selectWoo`, `wc-enhanced-select`, or `data-action="woocommerce_json_search_*"`.

## The two AJAX endpoints

WC ships two product-search AJAX actions ([wp-content/plugins/woocommerce/includes/class-wc-ajax.php:1768, 1844](class-wc-ajax.php)):

| Action name | What it returns |
|---|---|
| `woocommerce_json_search_products` | Products only (no variations). |
| `woocommerce_json_search_products_and_variations` | Products **AND** variations. |

The `_and_variations` variant is what you want **most of the time** for store-side features (related products, upsell/cross-sell, stock-rule targets, etc.) — variations are independently priced, stocked, and SKU'd, so a UI that can't pick variations is incomplete.

The variations endpoint is a one-line wrapper around the products one (`self::json_search_products( '', true )` — `$include_variations = true`); same nonce, same data shape, the only difference is the result set.

## Minimal scaffold — meta box on the product edit screen

```php
const MYPLUGIN_META = '_myplugin_related_products';

add_action( 'add_meta_boxes_product', static function (): void {
    add_meta_box(
        'myplugin-related-products',
        __( 'Related products', 'myplugin' ),
        'myplugin_render_related_products_box',
        'product',
        'side',
        'default'
    );
} );

function myplugin_render_related_products_box( WP_Post $post ): void {
    $saved_ids = (array) get_post_meta( $post->ID, MYPLUGIN_META, true );
    $saved_ids = array_filter( array_map( 'absint', $saved_ids ) );

    wp_nonce_field( 'myplugin_save_related', 'myplugin_nonce' );
    ?>
    <select
        id="myplugin-related-products"
        name="<?php echo esc_attr( MYPLUGIN_META ); ?>[]"
        class="wc-product-search"
        multiple="multiple"
        style="width: 100%;"
        data-placeholder="<?php esc_attr_e( 'Search products and variations…', 'myplugin' ); ?>"
        data-action="woocommerce_json_search_products_and_variations"
        data-exclude="<?php echo intval( $post->ID ); ?>"
        data-sortable="true"
    >
        <?php
        // SERVER-SIDE pre-render of the saved options. The AJAX endpoint
        // only fires on user typing — without this loop, the select renders
        // empty even when meta has saved IDs.
        foreach ( $saved_ids as $product_id ) {
            $product = wc_get_product( $product_id );
            if ( $product instanceof WC_Product ) {
                echo '<option value="' . esc_attr( (string) $product_id ) . '" selected="selected">'
                    . esc_html( wp_strip_all_tags( $product->get_formatted_name() ) )
                    . '</option>';
            }
        }
        ?>
    </select>
    <?php
}

add_action( 'save_post_product', static function ( int $post_id, WP_Post $post ): void {
    if ( ! isset( $_POST['myplugin_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['myplugin_nonce'] ) ), 'myplugin_save_related' ) ) return;
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
    if ( ! current_user_can( 'edit_product', $post_id ) ) return;

    $raw = isset( $_POST[ MYPLUGIN_META ] ) ? (array) wp_unslash( $_POST[ MYPLUGIN_META ] ) : array();
    $ids = array_values( array_filter( array_map( 'absint', $raw ) ) );

    if ( empty( $ids ) ) {
        delete_post_meta( $post_id, MYPLUGIN_META );
        return;
    }
    update_post_meta( $post_id, MYPLUGIN_META, $ids );
}, 10, 2 );
```

That's the whole pattern. WC's `wc-enhanced-select` JS picks up the `wc-product-search` class on DOM-ready and turns the plain `<select>` into a selectWoo (a WC fork of select2) with AJAX search wired to the action you specified.

## Critical rules

### 1. `class="wc-product-search"` is the trigger

The WC enhanced-select script ([wp-content/plugins/woocommerce/assets/js/admin/wc-enhanced-select.js](wc-enhanced-select.js)) auto-initializes any `<select>` with this class. Without the class, your select stays a plain HTML control.

### 2. `data-action` controls products-only vs products+variations

```html
<!-- Products only -->
data-action="woocommerce_json_search_products"

<!-- Products AND variations (most common) -->
data-action="woocommerce_json_search_products_and_variations"
```

If you omit `data-action` entirely, the JS defaults to `woocommerce_json_search_products_and_variations` (verified in `wc-enhanced-select.js`'s ajax `data` handler). Be explicit anyway; readers shouldn't have to chase JS defaults.

### 3. ALWAYS pre-render selected options server-side

The AJAX search runs only on user input (with `minimumInputLength: 3` by default). It does not run on initial render. Without server-side pre-rendered `<option selected>` tags, the select shows empty even when meta is populated — the IDs are in the DB but the select doesn't know how to label them.

Pattern: `wc_get_product( $id )->get_formatted_name()` returns the WC-styled label including SKU, attributes, and parent product for variations (e.g. `T-Shirt - Color: Red, Size: M (#42)`). Use it.

### 4. Useful `data-*` attributes

| Attribute | Purpose | Example |
|---|---|---|
| `data-placeholder` | Empty-state placeholder | `Search products…` |
| `data-action` | Which AJAX action to call | `woocommerce_json_search_products_and_variations` |
| `data-exclude` | Single ID or comma-list to exclude from results | Current post's ID, to prevent self-reference |
| `data-include` | Restrict results to this ID list | Filter to a curated subset |
| `data-limit` | Max results returned (server caps) | `100` (default 30, filter `woocommerce_json_search_limit`) |
| `data-exclude_type` | Comma-list of product types to skip | `external,grouped` |
| `data-display_stock` | Append " — Stock: N" to labels for managed-stock items | `1` |
| `data-allow_clear` | Show ✕ to clear single-value selects | `1` |
| `data-minimum_input_length` | Override default 3-char minimum | `2` |
| `data-sortable="true"` | Enable drag-sort on multi-select chips | `true` |

### 5. Nonce is internal — don't reinvent

WC's AJAX handler verifies `check_ajax_referer( 'search-products', 'security' )` ([class-wc-ajax.php:1769](class-wc-ajax.php)). The nonce is auto-attached by `wc-enhanced-select.js` from the `wc_enhanced_select_params.search_products_nonce` PHP-localized variable. Don't try to add your own nonce to the AJAX request — WC handles it.

### 6. `wc-enhanced-select` is auto-enqueued on WC admin screens

WC enqueues `wc-enhanced-select` (plus `selectWoo`, plus the matching styles) on every screen returned by `wc_get_screen_ids()` ([wp-content/plugins/woocommerce/includes/admin/class-wc-admin-assets.php:412-415](class-wc-admin-assets.php)). That covers: product edit / new screens, orders, coupons, shipping, settings, etc. **You do not need to manually enqueue on those.**

For the same `<select>` markup on a **non-WC admin page** (your plugin's settings page, a dashboard widget, a modal in the post-type editor of another CPT), explicit enqueue IS needed:

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( $hook_suffix !== 'my-plugin_page_my-settings' ) return; // gate to your screen

    wp_enqueue_script( 'wc-enhanced-select' );
    wp_enqueue_style( 'woocommerce_admin_styles' );
} );
```

The handles are stable: `wc-enhanced-select` (JS) and `woocommerce_admin_styles` (CSS). The dependency on selectWoo is declared internally by the WC handle; you don't need to enqueue selectWoo separately.

### 7. Save handler treats input as untrusted

The `<select multiple>` posts as an array of strings. Always `array_map( 'absint', $raw )` and `array_filter` to drop empties. Never trust the IDs back from the form — a user can craft a `<option value="9999999">` and submit it. If the ID space matters (the picked products must be readable to the current user), revalidate with `wc_get_product( $id )` and `current_user_can( 'read_product', $id )` before storing.

## Common mistakes

```php
// WRONG — load all products upfront, freeze the page on stores with > a few hundred
$products = get_posts( array( 'post_type' => 'product', 'posts_per_page' => -1 ) );
echo '<select multiple>';
foreach ( $products as $p ) {
    echo '<option value="' . $p->ID . '">' . $p->post_title . '</option>';
}
echo '</select>';

// WRONG — missing pre-render of saved values; on edit the select shows empty
echo '<select class="wc-product-search" name="related_products[]"
        multiple="multiple"
        data-action="woocommerce_json_search_products_and_variations"></select>';
// Saved IDs are in DB but invisible in the UI; user thinks the data is lost.

// WRONG — products only when variations are needed
data-action="woocommerce_json_search_products"
// Cross-sell-style features almost always need to target specific variations.

// WRONG — manually enqueueing on the product edit screen (redundant)
add_action( 'admin_enqueue_scripts', function () {
    wp_enqueue_script( 'wc-enhanced-select' ); // already loaded by WC here
} );
// Harmless but adds noise. Only enqueue manually on NON-WC admin screens.

// WRONG — saving raw $_POST without sanitization
update_post_meta( $post_id, '_related_products', $_POST['related_products'] );
// Allows attacker to inject arbitrary IDs / strings.

// RIGHT — sanitize-then-save
$ids = array_values( array_filter( array_map( 'absint', (array) wp_unslash( $_POST['related_products'] ?? array() ) ) ) );
update_post_meta( $post_id, '_related_products', $ids );
```

## Reading the saved IDs at runtime

```php
$ids = (array) get_post_meta( $post_id, '_myplugin_related_products', true );
foreach ( $ids as $id ) {
    $product = wc_get_product( (int) $id );
    if ( ! $product instanceof WC_Product ) {
        continue; // product was deleted
    }

    if ( $product->is_type( 'variation' ) ) {
        // Variation-specific handling: $product->get_parent_id(), get_attributes()
    } else {
        // Regular / variable / grouped / external
    }

    // For frontend display:
    echo esc_html( $product->get_name() );
    echo wc_price( (float) $product->get_price() );
}
```

The IDs returned by the search endpoint are post IDs that may belong to either `product` or `product_variation` post types. `wc_get_product()` handles both transparently.

## Cross-references

- Run **`wc-shipping-method`** if the broader plugin context is shipping — the shipping zones admin uses the same Backbone-modal pattern with PHP-rendered HTML; nothing in WC admin is React-only.
- Run **`wp-plugin-architecture`** for the broader question of how to organize the meta box class file alongside other plugin code.
- Run **`wp-security-audit`** on the save handler — it's an admin-context write endpoint with attacker-controlled input.

## What this skill does NOT cover

- Building a product picker for the **block editor / Gutenberg** product fields. Those use a different React-based component (`wc/product-control` from `@woocommerce/components`); not the same wiring.
- The frontend product search (the customer-facing search bar). Different endpoint, different scope.
- WC REST API product search (`/wc/v3/products` with `?search=`). That's for external integrations, not admin UI; this skill is admin-UI-specific.
- Customizing the result label rendering beyond what `get_formatted_name()` returns. The endpoint returns plain text labels via `wp_strip_all_tags`; richer renderings require a custom AJAX handler or a per-result formatter, both out of scope here.
- Variation-attribute filtering (e.g. "show only red variations") at search time. The endpoint matches on title / SKU / ID, not attribute values.

## References

- `WC_AJAX::json_search_products` and `json_search_products_and_variations`: [wp-content/plugins/woocommerce/includes/class-wc-ajax.php](class-wc-ajax.php) (lines ~1768 and 1844).
- `wc-enhanced-select.js` — the JS that turns `class="wc-product-search"` into selectWoo with AJAX wiring: [wp-content/plugins/woocommerce/assets/js/admin/wc-enhanced-select.js](wc-enhanced-select.js).
- WC auto-enqueue on admin screens: [wp-content/plugins/woocommerce/includes/admin/class-wc-admin-assets.php:412-415](class-wc-admin-assets.php).
- `WC_Data_Store::load( 'product' )->search_products()` — the underlying query method called by the AJAX handler. Worth reading if you need a programmatic equivalent of the AJAX search (e.g. WP-CLI command).
- selectWoo (WooCommerce's select2 fork): [github.com/woocommerce/selectWoo](https://github.com/woocommerce/selectWoo).
