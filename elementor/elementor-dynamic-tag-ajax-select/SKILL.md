---
name: elementor-dynamic-tag-ajax-select
description: Let an Elementor control (in a Dynamic Tag or a widget)
  pick one item from a large dataset — products, posts, terms, users —
  without freezing the editor. A plain Controls_Manager::SELECT2 with
  options preloaded upfront (e.g. all 20k products) hangs the panel;
  the fix is Elementor Pro's AJAX query control —
  'type' => QueryControlModule::QUERY_CONTROL_ID with an 'autocomplete'
  => [ 'object' => QUERY_OBJECT_POST|TAX|AUTHOR|USER|ATTACHMENT, 'query'
  => [...], 'display' => 'minimal'|'detailed' ] config. It is
  search-scoped server-side (no query runs until the user types), so
  catalog size is irrelevant. The query control is Pro-only, so
  feature-detect class_exists( QueryControlModule::class ) and degrade
  to a manual ID Controls_Manager::TEXT field when Pro is absent. Use
  when a tag/widget setting must reference a specific post/product, on
  large stores, or when the editor freezes opening a SELECT2.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elementor-pro
plugin-version-tested: "4.0.7 (free) / 4.0.4 (pro)"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://developers.elementor.com/docs/dynamic-tags/
source-refs:
  - wp-content/plugins/elementor-pro/modules/query-control/module.php
  - wp-content/plugins/elementor-pro/modules/query-control/controls/query.php
  - wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/internal-url.php
  - wp-content/plugins/dynamic-elementor-extension-main/modules/widgets/dynamic/DynamicAddToCartWidget.php
  - wp-content/plugins/dynamic-elementor-extension-main/dynamic-tags/woo-tags/ProductAttributes.php
---

# Elementor: AJAX item picker for tags & widgets (large datasets)

When a Dynamic Tag or widget setting must point at **one specific record** out of many — "this product", "that landing page", "this author" — you need a searchable picker. On a small set a preloaded `SELECT2` is fine. On a 20k-product store it is a trap: Elementor renders every option into the panel on load and the editor hangs. This skill is the AJAX-search alternative and how to degrade it when Elementor Pro is absent.

## The misconception (and why the editor freezes)

> "I'll list the products in a `SELECT2` so the user can search them."

```php
// ANTI-PATTERN at scale — every product becomes a preloaded <option>
$options = [];
foreach ( wc_get_products( [ 'limit' => -1 ] ) as $p ) {
    $options[ $p->get_id() ] = $p->get_name();   // <-- 20k entries in the panel
}
$this->add_control( 'product_id', [
    'type'    => \Elementor\Controls_Manager::SELECT2,
    'options' => $options,
] );
```

A preloaded `SELECT2` ships all options to the editor up front. That is exactly what the reference plugin's `ProductAttributes` tag does — but only because attribute taxonomies are a handful ([ProductAttributes.php:62-74](ProductAttributes.php)). The same shape over products/posts is what locks the panel. **Preloaded `SELECT2` is correct only for small, bounded option sets** (a dozen statuses, a few taxonomies).

## The fix — Elementor Pro's AJAX query control

The query control is a `SELECT2` whose options are fetched **on demand, by search term**, over AJAX. Catalog size is irrelevant because nothing is queried until the user types.

```php
use ElementorPro\Modules\QueryControl\Module as QueryControlModule;

$this->add_control( 'product_id', [
    'label'        => esc_html__( 'Product', 'myplugin' ),
    'type'         => QueryControlModule::QUERY_CONTROL_ID,   // 'query'
    'options'      => [],            // empty — filled by AJAX
    'label_block'  => true,
    'autocomplete' => [
        'object'  => QueryControlModule::QUERY_OBJECT_POST,   // what to search
        'query'   => [ 'post_type' => 'product' ],            // scope (search term is added server-side)
        'display' => 'minimal',                               // or 'detailed'
    ],
] );
```

Verified contract:

- `QUERY_CONTROL_ID = 'query'`; the control class `Query extends Control_Select2` ([controls/query.php:12-16](query.php)).
- `'autocomplete'['object']` is one of ([module.php:34-39](module.php)): `QUERY_OBJECT_POST` (`'post'`), `QUERY_OBJECT_TAX` (`'tax'`), `QUERY_OBJECT_AUTHOR` (`'author'` — users who authored content), `QUERY_OBJECT_USER` (`'user'` — all users), `QUERY_OBJECT_ATTACHMENT` (`'attachment'`), `QUERY_OBJECT_LIBRARY_TEMPLATE`.
- `'query'` is merged into the WP query scope; `'display'` is `'minimal'` or `'detailed'`; `'by_field' => 'ID'` stores the chosen post ID.
- The server-side AJAX handler is **entirely Pro's** — registered on `elementor/ajax/register_actions` (`pro_panel_posts_control_filter_autocomplete`, `query_control_value_titles`). Your code writes **no** `wp_ajax_` handler; you only declare the `autocomplete` config and Pro does the search and the saved-value label resolution.

### Why it doesn't freeze (verified)

The autocomplete handler **returns early with a `WP_Error` when the search term is empty** ([module.php:211](module.php)) — so nothing runs until the user types. When they do, `autocomplete_query_for_post()` sets `$query['s'] = $data['q']` ([module.php:242](module.php)); the `'posts_per_page' => -1` alongside it ([module.php:241](module.php)) is harmless because the `s` search term bounds the result set. This is the inverse of the preloaded `SELECT2`: the query is small and on-demand, not large and upfront.

## Using it inside a Dynamic Tag

The query control works in a `Tag`/`Data_Tag` exactly as in a widget — store the chosen ID in a setting and resolve it in `render()` / `get_value()`. Pro's `Internal_URL` data tag is the canonical example: a `type` selector plus per-type query controls (`post_id`, `taxonomy_id`, `attachment_id`, `author_id`), each with its own `autocomplete['object']` and a `condition` ([internal-url.php:72-142](internal-url.php)):

```php
$this->add_control( 'post_id', [
    'label'        => esc_html__( 'Search & Select', 'myplugin' ),
    'type'         => QueryModule::QUERY_CONTROL_ID,
    'options'      => [],
    'label_block'  => true,
    'autocomplete' => [
        'object'  => QueryModule::QUERY_OBJECT_POST,
        'display' => 'detailed',
        'query'   => [ 'post_type' => 'any' ],
    ],
    'condition'    => [ 'type' => 'post' ],
] );

// …then resolve in get_value()/render():
$url = get_permalink( (int) $this->get_settings( 'post_id' ) );
```

Note: in the bundled reference plugin, **no dynamic tag uses the AJAX query control** — every `SELECT2` tag (`ProductAttributes`, membership-plan tags) preloads a small, bounded set. The AJAX pattern there lives in the **`DynamicAddToCartWidget`**. For a tag, Pro's `Internal_URL` is the reference.

## Graceful degradation when Pro is absent (required)

`QueryControlModule` only exists with Pro. Feature-detect and fall back to a manual ID field — the exact pattern in `DynamicAddToCartWidget`:

```php
use Elementor\Controls_Manager;
use ElementorPro\Modules\QueryControl\Module as QueryControlModule;

private function has_query_control_support(): bool {
    return class_exists( QueryControlModule::class );   // Pro present?
}

private function product_control_type(): string {
    return $this->has_query_control_support()
        ? QueryControlModule::QUERY_CONTROL_ID
        : Controls_Manager::TEXT;                        // manual ID entry
}

// …building the control:
$control = [ 'label' => esc_html__( 'Product', 'myplugin' ), 'type' => $this->product_control_type() ];

if ( $this->has_query_control_support() ) {
    $control['autocomplete'] = [
        'object'   => QueryControlModule::QUERY_OBJECT_POST,
        'query'    => [ 'post_type' => 'product' ],
        'display'  => 'minimal',
        'by_field' => 'ID',
    ];
} else {
    $control['description'] = esc_html__( 'Enter the product ID manually. Activate Elementor Pro for the search picker.', 'myplugin' );
}
$this->add_control( 'product_id', $control );
```

Verified at [DynamicAddToCartWidget.php:43-53,181-198](DynamicAddToCartWidget.php). Either way the stored value is a post ID, so `render()`/`get_value()` resolves it identically regardless of which control produced it.

## Critical rules

- **Never preload a `SELECT2` from an unbounded query** (products/posts/users). Preloaded options are for small, fixed sets only.
- **Use `QUERY_CONTROL_ID` + `autocomplete` for large datasets.** It is search-scoped server-side; size doesn't matter.
- **The query control is Pro-only.** Always `class_exists( QueryControlModule::class )` and degrade to a `Controls_Manager::TEXT` manual-ID field (or a deliberately bounded `SELECT2`).
- **Write no AJAX handler.** Pro owns `pro_panel_posts_control_filter_autocomplete` / `query_control_value_titles`; you only declare `autocomplete`.
- **`'options' => []`** for a query control — options arrive via AJAX; preloading defeats the purpose.
- **Pick the right `object`**: `author` = users who authored content, `user` = all users; `post` needs a `query.post_type` scope; `tax` searches terms.
- **The stored value is an ID** — cast and resolve it (`get_permalink( (int) $id )`, `wc_get_product( (int) $id )`) and handle a missing/invalid ID.

## Common mistakes

```php
// WRONG — query control but options preloaded (pointless + slow)
$this->add_control( 'id', [
    'type'    => QueryControlModule::QUERY_CONTROL_ID,
    'options' => $all_products,           // <-- defeats the AJAX control
] );

// WRONG — hard-requiring Pro; control silently missing on free → no way to set a product
$this->add_control( 'id', [ 'type' => QueryControlModule::QUERY_CONTROL_ID, /* … */ ] );
// (no class_exists guard → fatal/empty when Pro inactive)

// WRONG — writing your own ajax handler for it
add_action( 'wp_ajax_my_product_search', /* … */ );   // <-- unnecessary; Pro handles query control AJAX

// RIGHT — feature-detect, degrade, let Pro do the AJAX
$type = class_exists( QueryControlModule::class )
    ? QueryControlModule::QUERY_CONTROL_ID
    : \Elementor\Controls_Manager::TEXT;
```

## Cross-references

- Run **`elementor-dynamic-tag-fields`** for the control types, `Tag` vs `Data_Tag`, and reading settings back.
- Run **`elementor-dynamic-tag-register`** for registering the tag and the Pro-feature reality.
- Run **`wc-product-search-select`** for the WooCommerce-native product search/select control (a non-Elementor alternative for product pickers).

## What this skill does NOT cover

- **The query control's full option surface** (custom `query` args per object type, `include_type`, sorting) — read [module.php](module.php) `autocomplete_query_for_*`.
- **Building a bespoke AJAX select without Pro** — possible via a custom control + `wp_ajax_`, but out of scope; prefer the manual-ID degrade.
- **Query-control *filtering* for loop/posts widgets** (the `Group_Control` query side) — this skill is about single-item pickers.
- **Caching/transients for the search results** — Pro's handler runs uncached per keystroke; debounce/min-length is Pro's select2 default.

## References

- Query control module: [wp-content/plugins/elementor-pro/modules/query-control/module.php](module.php) — `QUERY_CONTROL_ID`/`QUERY_OBJECT_*` (29,34-39), empty-term early return (211), `autocomplete_query_for_post` sets `s` (233-242), AJAX action registration (~1012-1024).
- Query control class: [wp-content/plugins/elementor-pro/modules/query-control/controls/query.php:12-16](query.php) — `class Query extends Control_Select2`.
- AJAX query control in a dynamic tag: [wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/internal-url.php:72-142](internal-url.php).
- Graceful-degradation widget: [wp-content/plugins/dynamic-elementor-extension-main/modules/widgets/dynamic/DynamicAddToCartWidget.php:43-53,181-198](DynamicAddToCartWidget.php).
- Bounded preloaded SELECT2 (correct small-set use): [wp-content/plugins/dynamic-elementor-extension-main/dynamic-tags/woo-tags/ProductAttributes.php:62-74](ProductAttributes.php).
