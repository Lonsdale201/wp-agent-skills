---
name: wc-hpos-compatibility
description: Make a WooCommerce plugin HPOS-compatible (High-Performance
  Order Storage, default-on in WC 10.x) — declare via
  FeaturesUtil::declare_compatibility on before_woocommerce_init, replace
  $wpdb->postmeta / WP_Query order code with wc_get_orders +
  WC_Order::get_meta / update_meta_data, gate runtime branches on
  OrderUtil::custom_orders_table_usage_is_enabled, build admin hook
  names dynamically with OrderUtil::get_order_admin_screen (HPOS =
  woocommerce_page_wc-orders, legacy = shop_order). Use when scaffolding
  an order-touching plugin, auditing existing code for HPOS readiness,
  or fixing post-WC-10 silent breakage. Triggers on shop_order,
  get_post_meta with order context, FeaturesUtil, OrderUtil,
  custom_order_tables, before_woocommerce_init.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.x"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.woocommerce.com/docs/hpos/
  - https://github.com/woocommerce/woocommerce/wiki/High-Performance-Order-Storage-Upgrade-Recipe-Book
---

# WooCommerce HPOS compatibility

High-Performance Order Storage moves WooCommerce orders out of `wp_posts` / `wp_postmeta` into dedicated tables. **In WC 10.x, HPOS is the default for new installs.** A plugin written to the pre-HPOS world that does not declare HPOS compatibility either silently produces wrong results (queries find nothing) or gets flagged "HPOS Incompatible" on the WooCommerce → Settings → Advanced → Features tab, blocking site owners from enabling HPOS while the plugin is active.

This skill covers what the plugin author has to do to declare and actually be compatible.

## Misconception this skill corrects

> "Orders are posts with `post_type = shop_order`, so I'll just `WP_Query` them and `get_post_meta` for the data."

That worked through WC 7.x. In WC 8.0+ HPOS exists; in WC 10.x **HPOS is the default**. The post / postmeta path is empty for new orders on a default install. Your plugin returns no results, and unless you actually test on a default WC 10.x install you won't notice — the legacy install you developed against probably has CPT-stored orders.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a plugin that creates, reads, updates, or queries WooCommerce orders.
- Reviewing or auditing an existing WC plugin for HPOS readiness.
- The diff or file contains: `'shop_order'`, `WP_Query` over orders, `get_post_meta( $order_id, ... )`, `$wpdb->postmeta` joined to `$wpdb->posts` with order context.
- Debugging "my plugin worked on dev but finds no orders on prod" / "my custom column on the orders screen disappeared after upgrading WC".
- The user mentions HPOS, `OrderUtil`, `FeaturesUtil`, `wc-orders` screen.

## The four data tables (where orders actually live in HPOS mode)

| Table | Purpose |
|---|---|
| `wp_wc_orders` | Main order row (id, status, currency, type, total, customer_id, …). |
| `wp_wc_order_addresses` | Billing + shipping addresses (one row each). |
| `wp_wc_order_operational_data` | Status timestamps, payment state, version, recorded sales flags. |
| `wp_wc_orders_meta` | Order meta (replaces `wp_postmeta` for orders). |

`wp_postmeta` no longer holds order data on default WC 10.x installs (unless sync-mode is on — see below). Direct SQL joining `wp_postmeta` with order IDs returns nothing.

## Step 1 — Declare compatibility

Without this declaration the WC admin flags your plugin as "HPOS Incompatible" on the Features tab, preventing HPOS toggle while it's active. Declaration is just a single hook callback in your main plugin file:

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

add_action( 'before_woocommerce_init', static function (): void {
    if ( class_exists( FeaturesUtil::class ) ) {
        FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true // positive_compatibility — your plugin works with HPOS
        );
    }
} );
```

Verified in [src/Utilities/FeaturesUtil.php:87](FeaturesUtil.php) — `declare_compatibility( string $feature_id, string $plugin_file, bool $positive_compatibility = true )`. Docblock notes:

> *This method MUST be executed from inside a handler for the 'before_woocommerce_init' hook and SHOULD be executed from the main plugin file passing __FILE__.*

If your plugin genuinely is incompatible (e.g. third-party order-list plugin you can't update), pass `false` as the third argument — at least the warning becomes accurate and admins can make an informed choice.

Other feature IDs you may also want to declare (mostly orthogonal to HPOS but tested on the same screen):
- `'cart_checkout_blocks'` — Cart / Checkout blocks compatibility
- `'product_block_editor'` — new product editor

The declaration ITSELF is just a flag for the admin UI. It doesn't make your code work — the actual code changes below do.

## Step 2 — Use the abstraction layer for CRUD

The single pattern that works across HPOS, legacy CPT, and sync-mode:

```php
// READ
$order = wc_get_order( $order_id );             // never get_post( $order_id )
$value = $order->get_meta( '_custom_field' );   // never get_post_meta
$status = $order->get_status();
$customer_id = $order->get_customer_id();

// WRITE
$order = wc_get_order( $order_id );
$order->update_meta_data( '_custom_field', $value );
$order->save();                                  // critical — meta isn't persisted until save()
```

`WC_Order` extends `WC_Data` which holds the meta in memory until `save()`. The `update_meta_data` + `save` pair replaces both `update_post_meta` AND any direct `$wpdb` writes.

For listing / querying:

```php
// QUERY — works in all modes
$orders = wc_get_orders( array(
    'status'         => array( 'wc-processing', 'wc-on-hold' ),
    'meta_key'       => '_custom_field',
    'meta_value'     => $value,
    'limit'          => 50,
    'date_created'   => '>' . ( time() - DAY_IN_SECONDS ),
) );
```

`wc_get_orders` is the canonical query API. It accepts `meta_query`, date filters, status filters, customer filters, and translates them into the right backend (HPOS or CPT) automatically. Avoid `WP_Query` for orders; it works on legacy and not on HPOS.

## Step 3 — Detect mode at runtime when you need to

For code paths that genuinely have to branch (e.g. you maintain a custom SQL query for legacy and want to skip it on HPOS):

```php
use Automattic\WooCommerce\Utilities\OrderUtil;

if ( OrderUtil::custom_orders_table_usage_is_enabled() ) {
    // HPOS path — use $wpdb on wc_orders / wc_orders_meta tables, OR
    // (better) refactor to wc_get_orders().
} else {
    // Legacy CPT path — old code can stay if it must.
}
```

`OrderUtil::custom_orders_table_usage_is_enabled(): bool` ([src/Utilities/OrderUtil.php:39](OrderUtil.php)) is the canonical check. Don't use a `class_exists` hack against the table itself — that breaks when sync-mode is on and both backends exist simultaneously.

Other useful `OrderUtil` helpers:

- `OrderUtil::is_custom_order_tables_in_sync(): bool` — sync-mode detection (legacy + HPOS both written to)
- `OrderUtil::get_order_admin_screen(): string` — screen ID for admin hooks (see Step 4)
- `OrderUtil::init_theorder_object( $post_or_order )` — bridges meta-box rendering between modes
- `OrderUtil::get_post_or_object_meta( $post, $data, $key, $single )` — unified meta read for backward-compatible code

## Step 4 — Admin screen hooks: branch by mode, hook names differ

The orders list table has different `screen->id` values AND different hook NAMES — you cannot use a single dynamic prefix for both. Verified by WC's own Fulfillments code ([FulfillmentsRenderer.php:30-41](FulfillmentsRenderer.php)) which branches explicitly:

| Mode | Columns filter | Custom column action | Bulk-actions filter |
|---|---|---|---|
| **HPOS** | `manage_woocommerce_page_wc-orders_columns` | `manage_woocommerce_page_wc-orders_custom_column` | `bulk_actions-woocommerce_page_wc-orders` |
| **Legacy CPT** | `manage_edit-shop_order_columns` (note: `edit-` prefix) | `manage_shop_order_posts_custom_column` (note: `_posts_custom_column`) | `bulk_actions-edit-shop_order` |

The legacy hook names use `edit-shop_order` for columns and `shop_order_posts_custom_column` for the rendering action — neither follows the `manage_<screen_id>_columns` convention naively. **Building a hook name from `OrderUtil::get_order_admin_screen()` works for the HPOS branch but breaks on legacy.**

Correct pattern: branch with `OrderUtil::custom_orders_table_usage_is_enabled()` and register both hook sets, mirroring WC core:

```php
add_action( 'admin_init', static function (): void {
    if ( OrderUtil::custom_orders_table_usage_is_enabled() ) {
        add_filter( 'manage_woocommerce_page_wc-orders_columns', 'myplugin_add_column' );
        add_action( 'manage_woocommerce_page_wc-orders_custom_column', 'myplugin_render_column_hpos', 10, 2 );
    } else {
        add_filter( 'manage_edit-shop_order_columns', 'myplugin_add_column' );
        // Legacy action signature is ($column, $post_id) — the second arg is the post ID, not a WC_Order
        add_action( 'manage_shop_order_posts_custom_column', 'myplugin_render_column_legacy', 10, 2 );
    }
} );

function myplugin_add_column( array $columns ): array {
    $columns['my_column'] = __( 'My column', 'myplugin' );
    return $columns;
}

// HPOS path — second arg is a WC_Order
function myplugin_render_column_hpos( string $column_id, $order ): void {
    if ( $column_id !== 'my_column' ) return;
    if ( $order instanceof WC_Order ) {
        echo esc_html( (string) $order->get_meta( '_my_field' ) );
    }
}

// Legacy path — second arg is a post ID
function myplugin_render_column_legacy( string $column_id, $post_id ): void {
    if ( $column_id !== 'my_column' ) return;
    $order = wc_get_order( $post_id );
    if ( $order instanceof WC_Order ) {
        echo esc_html( (string) $order->get_meta( '_my_field' ) );
    }
}
```

Notes:

- The two `custom_column` action signatures differ: HPOS passes `(string $column, WC_Order $order)`, legacy passes `(string $column, int $post_id)`. Either branch your render functions, or normalize both via `OrderUtil::init_theorder_object()` after fetching the order.
- The `OrderUtil::get_order_admin_screen()` helper IS still useful — for `current_screen` checks, asset enqueueing, anywhere you need to know the screen ID. It's the **hook NAMES** that don't follow a single template, not the screen ID itself.

For **meta boxes**, the registration is similar:

```php
add_action( 'add_meta_boxes', static function (): void {
    $screen = OrderUtil::custom_orders_table_usage_is_enabled()
        ? wc_get_page_screen_id( 'shop-order' )  // 'woocommerce_page_wc-orders'
        : 'shop_order';                           // legacy post type

    add_meta_box( 'myplugin_box', __( 'My box', 'myplugin' ), 'myplugin_render_box', $screen, 'side' );
} );
```

The `add_meta_box` API takes a screen ID and works the same way in both modes — that's where the dynamic-screen-ID pattern from `OrderUtil::get_order_admin_screen()` does cleanly apply.

## Step 5 — Sync mode (transitional, mostly transparent)

On a site that previously used CPT-stored orders and is migrating to HPOS, the admin can enable "Compatibility mode (synchronization between posts and orders tables enabled)". In this mode:

- New orders write to BOTH `wp_wc_orders*` AND `wp_posts` / `wp_postmeta`.
- Legacy code reading `get_post_meta` still works (data is mirrored).
- Performance is worst of both worlds (double writes).

Sync mode exists so admins can A/B test without losing legacy plugin support. Detection:

```php
if ( OrderUtil::is_custom_order_tables_in_sync() ) {
    // Both backends have data. Legacy queries still see results.
}
```

You generally don't need to branch on this in plugin code — the abstraction layer (`wc_get_orders`, `wc_get_order`, `WC_Order::*`) does the right thing in all three modes (HPOS-only, sync, legacy).

### WC 10.7 default change — sync-on-read is OFF by default

In WooCommerce 10.7 (April 2026) the `woocommerce_hpos_enable_sync_on_read` filter default flipped to `false` ([src/Internal/DataStores/Orders/OrdersTableDataStore.php:1308](OrdersTableDataStore.php) — `apply_filters( 'woocommerce_hpos_enable_sync_on_read', false )`). Previously, sites in sync-mode would also pull post data into HPOS reads as a fallback when the HPOS row looked stale.

The official rationale (in the source comment above the filter): *"sync-on-read can be dangerous when HPOS is authoritative and running correctly, as it allows the posts data store to override HPOS data."* — i.e. a stale CPT meta could clobber a fresh HPOS write on the next read.

Practical implications:

- **`OrderUtil::is_custom_order_tables_in_sync()` still returns the configured "is sync enabled" flag** — but reads no longer cross-check posts. Code that quietly relied on sync-on-read pulling missing meta from `wp_postmeta` may surface bugs after 10.7 that previously hid behind the auto-fallback.
- **WC 10.7 admin notice** points affected sites (those running with sync-mode enabled and unmigrated post data) at the change.
- **To restore old behavior on a specific site**: re-enable via the filter — `add_filter( 'woocommerce_hpos_enable_sync_on_read', '__return_true' )`. Only do this as a temporary bridge; the long-term fix is migrating post data fully and turning sync off.

If your plugin reads order meta and the data only exists in `wp_postmeta` (never written through `WC_Order::update_meta_data + save`), it WILL break on a default WC 10.7 install. Audit pattern: any `wc_get_order( $id )->get_meta( '_legacy_key' )` returning empty after a 10.7 upgrade is the smoking gun — the meta exists in `wp_postmeta` but not in `wp_wc_orders_meta`, and 10.7 no longer fills the gap.

## Critical rules

- **Declare compatibility on `before_woocommerce_init`** with feature_id `'custom_order_tables'`. Without it, your plugin shows up as "HPOS Incompatible" and blocks the toggle.
- **`wc_get_order` + `$order->get_meta` / `update_meta_data` + `save`** for all order CRUD. Never `get_post`, never `get_post_meta` against an order ID.
- **`wc_get_orders` for queries.** Never `WP_Query` for orders, never raw `$wpdb` joins on `wp_postmeta` against order IDs.
- **`OrderUtil::custom_orders_table_usage_is_enabled()` for runtime detection** when you genuinely have to branch.
- **`OrderUtil::get_order_admin_screen()` for admin hook names** — dynamic, works in both modes.
- **`init_theorder_object()` to normalize the meta-box `$post_or_order` parameter** across modes.
- **Test on a fresh WC 10.x install** (HPOS default) before shipping. Don't assume your dev environment matches real-world.
- **Be aware of the WC 10.7 sync-on-read default-off change.** Code that quietly relied on sync-on-read pulling missing legacy postmeta into HPOS reads will surface as empty-meta bugs after upgrade.
- **Do not directly query `wp_wc_orders*` tables.** They're internal — schema can change in minor releases. Use the abstraction.

## Common mistakes

```php
// WRONG — direct CPT query, returns 0 rows on HPOS
$orders = get_posts( array(
    'post_type'   => 'shop_order',
    'post_status' => 'wc-processing',
    'numberposts' => -1,
) );

// RIGHT
$orders = wc_get_orders( array(
    'status' => 'wc-processing',
    'limit'  => -1,
) );

// WRONG — direct postmeta read on order, returns empty on HPOS
$value = get_post_meta( $order_id, '_my_field', true );

// RIGHT
$order = wc_get_order( $order_id );
$value = $order ? $order->get_meta( '_my_field' ) : '';

// WRONG — hooking only the legacy admin screen; column doesn't appear on HPOS
add_filter( 'manage_edit-shop_order_columns', $cb );

// RIGHT — dynamic screen ID
$screen = OrderUtil::get_order_admin_screen();
add_filter( "manage_{$screen}_columns", $cb );

// WRONG — raw SQL join on wp_postmeta, broken on HPOS, brittle on sync
$wpdb->get_results( "
    SELECT p.ID FROM {$wpdb->posts} p
    JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
    WHERE p.post_type = 'shop_order' AND pm.meta_key = '_my_field'
" );

// RIGHT — abstraction handles both backends
$orders = wc_get_orders( array(
    'meta_key' => '_my_field',
    'limit'    => -1,
    'return'   => 'ids',
) );

// WRONG — checking "is HPOS" by class-existence on the table
if ( $wpdb->get_var( "SHOW TABLES LIKE '{$wpdb->prefix}wc_orders'" ) ) {
    // HPOS is on
}
// Misleading on sync-mode (both tables exist).

// RIGHT
if ( OrderUtil::custom_orders_table_usage_is_enabled() ) {
    // HPOS is the source of truth
}

// WRONG — declaring incompatibility because you didn't audit
FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, false );
// Should only do this if you actually verified the plugin doesn't work.

// WRONG — running declare_compatibility outside the before_woocommerce_init hook
add_action( 'plugins_loaded', function () {
    FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__ );
} );
// Returns false, declaration is ignored — verified in the FeaturesUtil docblock.
```

## Audit a plugin for HPOS readiness — quick grep

```bash
# Direct CPT references (fix all of these)
grep -rn "'shop_order'\|\"shop_order\"" --include="*.php" src/

# Direct postmeta on orders (fix all of these)
grep -rn "get_post_meta\|update_post_meta\|delete_post_meta" --include="*.php" src/ \
    | grep -i "order"

# WP_Query for orders (replace with wc_get_orders)
grep -rn "post_type.*shop_order\|post_type.*=.*shop_order" --include="*.php" src/

# Old admin column hook (use OrderUtil::get_order_admin_screen)
grep -rn "manage_edit-shop_order\|manage_shop_order_posts" --include="*.php" src/
```

The four greps catch ~90% of HPOS regressions in a typical legacy plugin.

## Cross-references

- Run **`wp-plugin-options-storage`** for the broader "where does plugin data live" decision matrix — the HPOS migration is a specific case of "use the abstraction, not the storage layer".
- Run **`wp-security-audit`** on any custom SQL the plugin runs against `wp_wc_orders*` tables (you shouldn't, but if you do, prepare statements correctly).

## What this skill does NOT cover

- The site-owner's decision on when to enable HPOS / migrate. That's an admin / ops topic, not a plugin author's concern.
- Custom data store implementation (`WC_Data_Store::register`) — niche, separate skill territory if it grows.
- Order CRUD performance tuning beyond "use the abstraction".
- WC subscriptions / memberships specific HPOS quirks — those plugins have their own compatibility layers.
- Schema details of `wp_wc_orders*` tables for direct read access. The official guidance is "don't"; if you must, read the source under [src/Internal/DataStores/Orders/](Orders/).
- The Cart / Checkout blocks compatibility (`'cart_checkout_blocks'` feature) — adjacent topic, separate skill if needed.

## References

- [WooCommerce HPOS docs](https://developer.woocommerce.com/docs/hpos/) — official docs portal.
- [HPOS Upgrade Recipe Book](https://github.com/woocommerce/woocommerce/wiki/High-Performance-Order-Storage-Upgrade-Recipe-Book) — practical migration patterns.
- `OrderUtil::custom_orders_table_usage_is_enabled` and friends: [wp-content/plugins/woocommerce/src/Utilities/OrderUtil.php](OrderUtil.php).
- `FeaturesUtil::declare_compatibility`: [wp-content/plugins/woocommerce/src/Utilities/FeaturesUtil.php:87](FeaturesUtil.php).
- HPOS data store implementations: [wp-content/plugins/woocommerce/src/Internal/DataStores/Orders/](Orders/).
- `COTMigrationUtil::get_order_admin_screen`: [wp-content/plugins/woocommerce/src/Internal/Utilities/COTMigrationUtil.php:53](COTMigrationUtil.php) — confirms `'shop_order'` (legacy) vs `'woocommerce_page_wc-orders'` (HPOS) screen IDs.
