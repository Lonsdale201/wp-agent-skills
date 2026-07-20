# Admin Drag-and-Drop Reference Examples

## Hierarchical Tree

Use a flat sibling list with depth classes. Persist by walking rows in order; each item's parent is the previous row whose depth is one less than the current row.

```js
const STEP_PX = 30;
const MAX_DEPTH = 5;
let originalDepth = 0, currentDepth = 0, subtreeDepthSpan = 0, transport;

const depthOf = ( $item ) => Math.floor(
    ( parseInt( $item.css( 'margin-left' ), 10 ) || 0 ) / STEP_PX
);

const childrenOf = ( $item ) => {
    const rows = [];
    const depth = depthOf( $item );
    let $next = $item.next( '.tree-item' );

    while ( $next.length && depthOf( $next ) > depth ) {
        rows.push( $next[0] );
        $next = $next.next( '.tree-item' );
    }

    return jQuery( rows );
};

jQuery( '#tree' ).sortable( {
    items: '> .tree-item',
    handle: '.tree-handle',
    placeholder: 'tree-placeholder',
    forcePlaceholderSize: true,
    start: function ( event, ui ) {
        originalDepth = currentDepth = depthOf( ui.item );
        const $children = childrenOf( ui.item );
        subtreeDepthSpan = 0;
        $children.each( function () {
            subtreeDepthSpan = Math.max(
                subtreeDepthSpan,
                depthOf( jQuery( this ) ) - originalDepth
            );
        } );
        transport = jQuery( '<div class="transport"></div>' ).appendTo( ui.item );
        transport.append( $children );
    },
    sort: function ( event, ui ) {
        const rootLeft = jQuery( '#tree' ).offset().left;
        const $previous = ui.placeholder
            .prevAll( '.tree-item' )
            .not( ui.item )
            .first();
        const parentLimit = $previous.length ? depthOf( $previous ) + 1 : 0;
        const subtreeLimit = MAX_DEPTH - subtreeDepthSpan;
        const wanted = Math.max( 0, Math.min(
            MAX_DEPTH,
            parentLimit,
            subtreeLimit,
            Math.floor( ( ui.helper.offset().left - rootLeft ) / STEP_PX )
        ) );

        if ( wanted !== currentDepth ) {
            ui.item
                .removeClass( 'tree-item-depth-' + currentDepth )
                .addClass( 'tree-item-depth-' + wanted );
            currentDepth = wanted;
        }
    },
    stop: function ( event, ui ) {
        transport.children().insertAfter( ui.item );
        transport.remove();

        const delta = currentDepth - originalDepth;
        if ( delta ) {
            childrenOf( ui.item ).each( function () {
                const $child = jQuery( this );
                const oldDepth = depthOf( $child );
                const newDepth = Math.max( 0, Math.min( MAX_DEPTH, oldDepth + delta ) );

                $child
                    .removeClass( 'tree-item-depth-' + oldDepth )
                    .addClass( 'tree-item-depth-' + newDepth );
            } );
        }

        wp.a11y.speak( wp.i18n.sprintf( wp.i18n.__( 'Moved to depth %d.', 'myplugin' ), currentDepth ) );
        persistTree();
    },
} );
```

```css
.tree-item-depth-0 { margin-left: 0; }
.tree-item-depth-1 { margin-left: 30px; }
.tree-item-depth-2 { margin-left: 60px; }
.tree-item-depth-3 { margin-left: 90px; }
.tree-item-depth-4 { margin-left: 120px; }
.tree-item-depth-5 { margin-left: 150px; }
```

## Palette to Sortable

```js
$( '#myplugin-palette' ).children( '.palette-item' ).draggable( {
    connectToSortable: '.dropzone',
    helper: 'clone',
    containment: '#wpwrap',
    refreshPositions: true,
} );

$( '.dropzone' ).sortable( {
    items: '> .placed-item, > .palette-item',
    receive: function ( event, ui ) {
        const paletteId = ui.item.data( 'palette-id' );
        ui.item.addClass( 'is-loading' );
        wp.apiFetch( {
            path: '/myplugin/v1/items',
            method: 'POST',
            data: { palette_id: paletteId, zone_id: this.id },
        } ).then( ( placed ) => {
            const $item = $( '<div>', {
                class: 'placed-item',
                'data-item-id': placed.id,
            } ).append( $( '<span>', {
                class: 'placed-item-title',
                text: placed.title,
            } ) );
            ui.item.replaceWith( $item );
            wp.a11y.speak( wp.i18n.__( 'Item added.', 'myplugin' ) );
        } ).catch( () => {
            ui.item.remove();
            wp.a11y.speak( wp.i18n.__( 'Item could not be added.', 'myplugin' ) );
        } );
    },
} );
```

## Keyboard Reorder

```html
<li class="rule-row" data-rule-id="42">
    <button type="button" class="rule-handle" aria-label="<?php esc_attr_e( 'Drag to reorder', 'myplugin' ); ?>">Drag</button>
    <button type="button" class="move-up" aria-label="<?php esc_attr_e( 'Move up', 'myplugin' ); ?>">Up</button>
    <button type="button" class="move-down" aria-label="<?php esc_attr_e( 'Move down', 'myplugin' ); ?>">Down</button>
</li>
```

```js
$( '#myplugin-rules' ).on( 'click', '.move-up', function () {
    const $row = $( this ).closest( '.rule-row' );
    const $previous = $row.prev( '.rule-row' );
    if ( ! $previous.length ) {
        return;
    }
    $previous.before( $row );
    persistOrder().then( () => {
        wp.a11y.speak( wp.i18n.__( 'Moved up.', 'myplugin' ) );
    } ).catch( () => {
        $previous.after( $row );
        wp.a11y.speak( wp.i18n.__( 'Move was not saved.', 'myplugin' ) );
    } );
} );
```

## REST Persistence Endpoint

```php
register_rest_route( 'myplugin/v1', '/rules/order', array(
    'methods'             => WP_REST_Server::EDITABLE,
    'permission_callback' => static fn () => current_user_can( 'manage_options' ),
    'args'                => array(
        'order' => array(
            'type'              => 'array',
            'required'          => true,
            'items'             => array( 'type' => 'integer' ),
            'validate_callback' => 'rest_validate_request_arg',
            'sanitize_callback' => 'wp_parse_id_list',
        ),
    ),
    'callback'            => static function ( WP_REST_Request $request ) {
        $order    = $request->get_param( 'order' );
        $expected = myplugin_get_manageable_rule_ids();

        $submitted_set = $order;
        $expected_set  = array_map( 'absint', $expected );
        sort( $submitted_set );
        sort( $expected_set );

        if ( count( $order ) !== count( array_unique( $order ) )
             || $submitted_set !== $expected_set ) {
            return new WP_Error(
                'invalid_rule_order',
                'Order must contain every manageable rule exactly once.',
                array( 'status' => 400 )
            );
        }

        update_option( 'myplugin_rule_order', $order );
        return rest_ensure_response( array( 'ok' => true ) );
    },
) );
```

## Common Mistakes

```js
// WRONG: flat sortable used for a tree; indentation never updates.
$tree.sortable( { items: '.tree-item' } );

// RIGHT: use depth math in sort/stop.
```

```js
// WRONG: connectToSortable belongs to Draggable, not Sortable.
$dropzone.sortable( { connectToSortable: '#palette' } );

// RIGHT.
$palette.children().draggable( { connectToSortable: '.dropzone', helper: 'clone' } );
```

```js
// WRONG: persists on every drag-over.
$( '.list' ).sortable( { change: persistOrder } );

// RIGHT: persists once on drop.
$( '.list' ).sortable( { update: persistOrder } );
```

```js
// WRONG: screen-reader users get no feedback.
$( '.list' ).sortable( { update: persistOrder } );

// RIGHT: speak only after persistence succeeds.
$( '.list' ).sortable( {
    update: function () {
        persistOrder().then( () => {
            wp.a11y.speak( wp.i18n.__( 'Order updated.', 'myplugin' ) );
        } ).catch( () => {
            wp.a11y.speak( wp.i18n.__( 'Order was not saved.', 'myplugin' ) );
        } );
    },
} );
```

```php
// WRONG: admin-ajax for a brand-new endpoint.
add_action( 'wp_ajax_myplugin_save_order', 'myplugin_save_order' );

// RIGHT: REST.
register_rest_route( 'myplugin/v1', '/rules/order', array( /* ... */ ) );
```
