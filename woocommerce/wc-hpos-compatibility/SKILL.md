---
name: wc-hpos-compatibility
description: Make WooCommerce order integrations compatible with High-Performance Order Storage. Covers compatibility declaration, order CRUD and queries, authoritative storage, sync mode, HPOS-aware admin list/meta-box hooks, cache-safe metadata access, migrations, and dual-mode testing. Use when a plugin reads or writes orders, queries order metadata, adds order admin UI, runs SQL, or declares `custom_order_tables` compatibility.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce HPOS compatibility

HPOS is the default order storage for new WooCommerce installs. An order ID is a WooCommerce entity ID, not a promise that a matching `shop_order` post or postmeta row exists.

## Storage model

HPOS uses four primary tables:

```text
wp_wc_orders
wp_wc_order_addresses
wp_wc_order_operational_data
wp_wc_orders_meta
```

Compatibility/synchronization mode can maintain data in both HPOS and legacy posts, and placeholder posts may exist. Neither is permission to read or write both stores directly. WooCommerce CRUD owns the authoritative store and synchronization.

## Declare compatibility

Only declare after the plugin actually passes HPOS tests:

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

add_action( 'before_woocommerce_init', static function (): void {
    if ( class_exists( FeaturesUtil::class ) ) {
        FeaturesUtil::declare_compatibility( 'custom_order_tables', MYPLUGIN_FILE, true );
    }
} );
```

The third argument means compatible, not "enable HPOS". Do not declare `true` to hide an incompatibility warning while direct order post/meta code remains.

## Read and write through CRUD

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order ) {
    $external_id = (string) $order->get_meta( '_myplugin_external_id' );

    $order->update_meta_data( '_myplugin_external_id', $new_external_id );
    $order->save();
}
```

Use object getters/setters for first-class properties such as status, billing address, transaction ID, dates, totals, currency, customer, and payment method. Use order meta only for extension-owned data.

Do not use these for order data:

```php
get_post_meta( $order_id, '_billing_email', true );
update_post_meta( $order_id, '_myplugin_external_id', $value );
get_post( $order_id );
WP_Query( array( 'post_type' => 'shop_order' ) );
```

## Query orders

```php
$result = wc_get_orders( array(
    'status'     => array( 'processing', 'completed' ),
    'meta_query' => array(
        array(
            'key'     => '_myplugin_exported',
            'compare' => 'NOT EXISTS',
        ),
    ),
    'limit'      => 100,
    'page'       => 1,
    'paginate'   => true,
    'return'     => 'objects',
) );

foreach ( $result->orders as $order ) {
    // WC_Order objects from the active data store.
}
```

Use documented `wc_get_orders()`/`WC_Order_Query` fields. Raw SQL against either legacy or HPOS tables couples code to one backend, misses cache invalidation, and often mishandles refunds or date/status formats.

For large jobs, paginate and process asynchronously. Do not request every order in one frontend/admin request.

## Runtime mode checks

Most code should not branch: CRUD is mode-neutral. Branch only for storage-specific admin hooks, diagnostics, or migration tools.

```php
use Automattic\WooCommerce\Utilities\OrderUtil;

$hpos_active = class_exists( OrderUtil::class )
    && OrderUtil::custom_orders_table_usage_is_enabled();
```

`OrderUtil::get_order_admin_screen()` returns the active order edit/list screen ID for admin screen checks and meta boxes. It is admin-only and throws outside admin context; never call it from frontend, REST, cron, or WP-CLI code. `OrderUtil::init_theorder_object()` can normalize the post-or-order object passed into legacy-compatible meta-box code.

Do not infer active storage from table existence or a class name: both stores can exist during synchronization.

## Order list columns

The hooks and callback arguments differ:

| Mode | Columns filter | Render action | Second render argument |
|---|---|---|---|
| HPOS | `manage_woocommerce_page_wc-orders_columns` | `manage_woocommerce_page_wc-orders_custom_column` | `WC_Order` |
| Legacy | `manage_edit-shop_order_columns` | `manage_shop_order_posts_custom_column` | order/post ID |

```php
add_action( 'admin_init', static function (): void {
    if ( OrderUtil::custom_orders_table_usage_is_enabled() ) {
        add_filter( 'manage_woocommerce_page_wc-orders_columns', 'myplugin_order_columns' );
        add_action( 'manage_woocommerce_page_wc-orders_custom_column', 'myplugin_hpos_column', 10, 2 );
    } else {
        add_filter( 'manage_edit-shop_order_columns', 'myplugin_order_columns' );
        add_action( 'manage_shop_order_posts_custom_column', 'myplugin_legacy_column', 10, 2 );
    }
} );

function myplugin_order_columns( array $columns ): array {
    $columns['myplugin_ref'] = __( 'External reference', 'myplugin' );
    return $columns;
}

function myplugin_hpos_column( string $column, $order ): void {
    if ( 'myplugin_ref' === $column && $order instanceof WC_Order ) {
        echo esc_html( (string) $order->get_meta( '_myplugin_external_id' ) );
    }
}

function myplugin_legacy_column( string $column, int $order_id ): void {
    myplugin_hpos_column( $column, wc_get_order( $order_id ) );
}
```

Do not construct legacy hook names from the HPOS screen ID; their naming schemes differ.

## Meta boxes

```php
add_action( 'add_meta_boxes', static function (): void {
    $screen = OrderUtil::custom_orders_table_usage_is_enabled()
        ? OrderUtil::get_order_admin_screen()
        : 'shop_order';

    add_meta_box( 'myplugin-order', __( 'Integration', 'myplugin' ), 'myplugin_render_order_box', $screen, 'side' );
} );
```

Render callbacks should normalize their input to `WC_Order`, then use a nonce, capability check, CRUD setter/meta update, and `$order->save()` for writes.

## Synchronization mode

Synchronization is transitional compatibility, not a second public write API.

- Reads come from the configured authoritative store.
- CRUD writes can be queued/synchronized to the backup store.
- Sync-on-read is disabled by default in current WooCommerce.
- Direct writes can diverge the two stores and are invisible to Woo caches.
- Never assume a backup row is immediately present after a CRUD write.

Use WooCommerce's scheduled/CLI synchronization tools for diagnostics and migrations rather than custom table-copy SQL.

## Test matrix

Before declaring compatibility, test at least:

1. HPOS enabled, compatibility mode off.
2. Legacy storage authoritative.
3. HPOS with synchronization enabled.
4. Order CRUD, metadata, refunds, queries, admin list columns, meta boxes, bulk actions, REST/webhooks, and uninstall/migration paths.

Run tests on a new order and an existing migrated order. Check that no code reads `shop_order` posts or order postmeta as the source of truth.

## Audit search

```bash
rg -n "shop_order|WP_Query|get_posts|get_post_meta|update_post_meta|delete_post_meta|wp_postmeta|wc_orders" src
```

Every hit is not automatically wrong, but every order-related hit requires review.

## Critical rules

- Declare `custom_order_tables` compatibility only after dual-mode testing.
- Treat `WC_Order` CRUD and `wc_get_orders()` as the public contract.
- Never write both HPOS and legacy stores yourself.
- Branch only where Woo admin hook contracts genuinely differ.
- Keep long migrations and backfills idempotent and asynchronous.
- Products, coupons, and variations are not moved by HPOS; do not over-apply order rules to them.

## References

- Compatibility declaration: `src/Utilities/FeaturesUtil.php`.
- Runtime/admin helpers: `src/Utilities/OrderUtil.php`.
- HPOS data store: `src/Internal/DataStores/Orders/OrdersTableDataStore.php`.
- Official documentation: <https://developer.woocommerce.com/docs/features/high-performance-order-storage/extension-recipe-book/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/src/Internal/DataStores/Orders/CustomOrdersTableController.php`
  - `wp-content/plugins/woocommerce/includes/wc-order-functions.php`
