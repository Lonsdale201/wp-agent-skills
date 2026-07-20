# WP_List_Table Reference Examples

## Production-Style Subclass

```php
final class MyPlugin_License_Table extends WP_List_Table {
    public function __construct() {
        parent::__construct( array(
            'singular' => 'license',
            'plural'   => 'licenses',
            'ajax'     => false,
        ) );
    }

    public function get_columns(): array {
        return array(
            'cb'      => '<input type="checkbox" />',
            'key'     => __( 'License key', 'myplugin' ),
            'product' => __( 'Product', 'myplugin' ),
            'user'    => __( 'User', 'myplugin' ),
            'status'  => __( 'Status', 'myplugin' ),
            'expires' => __( 'Expires', 'myplugin' ),
        );
    }

    protected function get_sortable_columns(): array {
        return array(
            'product' => array( 'product', false ),
            'expires' => array( 'expires', true ),
        );
    }

    protected function get_bulk_actions(): array {
        return array(
            'revoke'     => __( 'Revoke', 'myplugin' ),
            'deactivate' => __( 'Deactivate', 'myplugin' ),
        );
    }

    public function prepare_items(): void {
        $per_page     = $this->get_items_per_page( 'myplugin_licenses_per_page', 20 );
        $current_page = $this->get_pagenum();
        $orderby_raw  = isset( $_GET['orderby'] )
            ? sanitize_key( wp_unslash( $_GET['orderby'] ) )
            : 'expires';
        $allowed_sort = array( 'product', 'expires' );
        $orderby      = in_array( $orderby_raw, $allowed_sort, true )
            ? $orderby_raw
            : 'expires';
        $order_raw    = isset( $_GET['order'] )
            ? strtolower( sanitize_key( wp_unslash( $_GET['order'] ) ) )
            : '';
        $order        = in_array( $order_raw, array( 'asc', 'desc' ), true )
            ? strtoupper( $order_raw )
            : 'DESC';
        $search       = isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['s'] ) ) : '';

        $this->process_bulk_action();

        [ $items, $total_items ] = MyPlugin_License_Repo::find_paginated(
            $current_page,
            $per_page,
            $orderby,
            $order,
            $search
        );

        $this->items = $items;
        $this->_column_headers = array(
            $this->get_columns(),
            array(),
            $this->get_sortable_columns(),
            'key',
        );

        $this->set_pagination_args( array(
            'total_items' => $total_items,
            'per_page'    => $per_page,
            'total_pages' => (int) ceil( $total_items / $per_page ),
        ) );
    }

    protected function column_cb( $item ): string {
        return sprintf( '<input type="checkbox" name="license[]" value="%d" />', (int) $item['id'] );
    }

    protected function column_default( $item, $column_name ): string {
        return esc_html( (string) ( $item[ $column_name ] ?? '' ) );
    }

    protected function column_key( array $item ): string {
        $actions = array(
            'revoke' => sprintf(
                '<a href="%s" class="submitdelete">%s</a>',
                esc_url( wp_nonce_url(
                    add_query_arg(
                        array( 'page' => 'myplugin-licenses', 'action' => 'revoke', 'id' => $item['id'] ),
                        admin_url( 'admin.php' )
                    ),
                    'revoke-license-' . $item['id']
                ) ),
                esc_html__( 'Revoke', 'myplugin' )
            ),
        );

        return sprintf( '<strong>%s</strong> %s', esc_html( $item['key'] ), $this->row_actions( $actions ) );
    }

    protected function process_bulk_action(): void {
        $action = $this->current_action();
        if ( ! $action ) {
            return;
        }

        check_admin_referer( 'bulk-' . $this->_args['plural'] );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( __( 'You are not allowed to do that.', 'myplugin' ), 403 );
        }

        $ids = array_filter( array_map( 'absint', (array) ( $_REQUEST['license'] ?? array() ) ) );
        if ( ! $ids ) {
            return;
        }

        if ( 'revoke' === $action ) {
            MyPlugin_License_Repo::bulk_revoke( $ids );
        }
    }

    public function no_items(): void {
        esc_html_e( 'No licenses found.', 'myplugin' );
    }
}
```

## View and Filter Snippets

```php
protected function get_views(): array {
    $base   = admin_url( 'admin.php?page=myplugin-licenses' );
    $status = sanitize_key( $_GET['status'] ?? 'all' );
    $counts = MyPlugin_License_Repo::status_counts();
    $views  = array();

    foreach ( array( 'all' => __( 'All', 'myplugin' ), 'active' => __( 'Active', 'myplugin' ), 'expired' => __( 'Expired', 'myplugin' ) ) as $key => $label ) {
        $url   = 'all' === $key ? $base : add_query_arg( 'status', $key, $base );
        $class = $status === $key ? ' class="current"' : '';
        $views[ $key ] = sprintf(
            '<a href="%s"%s>%s <span class="count">(%d)</span></a>',
            esc_url( $url ),
            $class,
            esc_html( $label ),
            (int) ( $counts[ $key ] ?? 0 )
        );
    }

    return $views;
}
```

```php
protected function extra_tablenav( $which ): void {
    if ( 'top' !== $which ) {
        return;
    }

    $current  = sanitize_key( $_GET['product'] ?? '' );
    $products = MyPlugin_Product_Repo::all();
    ?>
    <div class="alignleft actions">
        <label class="screen-reader-text" for="filter-by-product"><?php esc_html_e( 'Filter by product', 'myplugin' ); ?></label>
        <select name="product" id="filter-by-product">
            <option value=""><?php esc_html_e( 'All products', 'myplugin' ); ?></option>
            <?php foreach ( $products as $product ) : ?>
                <option value="<?php echo esc_attr( $product['slug'] ); ?>" <?php selected( $current, $product['slug'] ); ?>>
                    <?php echo esc_html( $product['name'] ); ?>
                </option>
            <?php endforeach; ?>
        </select>
        <?php submit_button( __( 'Filter', 'myplugin' ), '', 'filter_action', false ); ?>
    </div>
    <?php
}
```

## Common Mistakes

```php
// WRONG: missing require.
class My_Table extends WP_List_Table {}

// RIGHT.
if ( ! class_exists( 'WP_List_Table' ) ) {
    require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
}
class My_Table extends WP_List_Table {}
```

```php
// WRONG: no nonce and no capability check.
protected function process_bulk_action(): void {
    if ( 'delete' === $this->current_action() ) {
        $this->repo->delete( $_REQUEST['id'] );
    }
}

// RIGHT.
protected function process_bulk_action(): void {
    if ( ! $this->current_action() ) {
        return;
    }
    check_admin_referer( 'bulk-' . $this->_args['plural'] );
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Not allowed.', 403 );
    }
}
```

```php
// WRONG: raw orderby into SQL.
$orderby = $_GET['orderby'];
$sql     = "SELECT * FROM ... ORDER BY {$orderby}";

// RIGHT: whitelist.
$allowed = array( 'created', 'expires', 'product' );
$orderby = in_array( $_GET['orderby'] ?? '', $allowed, true ) ? $_GET['orderby'] : 'created';
```

```php
// WRONG: one query per row.
protected function column_user( array $item ): string {
    $user = get_user_by( 'id', $item['user_id'] );
    return esc_html( $user->display_name );
}

// RIGHT: prefetch in prepare_items().
public function prepare_items(): void {
    $rows = $this->repo->find_paginated();
    cache_users( array_column( $rows, 'user_id' ) );
    $this->items = $rows;
}
```
