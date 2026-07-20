# Admin Form Controls Reference Examples

## Autocomplete Source Shapes

```js
$( '#product' ).autocomplete( {
    source: [ 'apples', 'bananas', 'cherries' ],
    minLength: 1,
} );
```

```js
$( '#product' ).autocomplete( {
    source: function ( request, response ) {
        wp.apiFetch( {
            path: `/myplugin/v1/products/search?q=${ encodeURIComponent( request.term ) }`,
        } ).then( ( results ) => {
            response( results.map( ( item ) => ( {
                label: item.name,
                value: item.slug,
                id: item.id,
            } ) ) );
        } ).catch( () => response( [] ) );
    },
    minLength: 2,
    select: function ( event, ui ) {
        $( '#product_id' ).val( ui.item.id );
    },
} );
```

```js
$( '#tag' ).autocomplete( {
    source: function ( request, response ) {
        const matches = window.MyPluginTags.filter( ( tag ) =>
            tag.toLowerCase().includes( request.term.toLowerCase() )
        );
        response( matches );
    },
} );
```

## Pointer Dismissal

```php
add_action( 'admin_enqueue_scripts', static function (): void {
    $slug      = 'myplugin_new_dashboard';
    $dismissed = explode( ',', (string) get_user_meta( get_current_user_id(), 'dismissed_wp_pointers', true ) );

    if ( in_array( $slug, $dismissed, true ) ) {
        return;
    }

    wp_enqueue_script( 'wp-pointer' );
    wp_enqueue_style( 'wp-pointer' );

    wp_enqueue_script(
        'myplugin-pointer',
        plugins_url( 'assets/pointer.js', MYPLUGIN_FILE ),
        array( 'wp-pointer', 'wp-i18n' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );

    wp_add_inline_script(
        'myplugin-pointer',
        'window.MyPluginPointer = ' . wp_json_encode( array(
            'slug'    => $slug,
            'target'  => '#toplevel_page_myplugin',
            'title'   => __( 'New dashboard', 'myplugin' ),
            'content' => __( 'Check out the new analytics view in the Dashboard tab.', 'myplugin' ),
        ) ) . ';',
        'before'
    );
} );
```

```js
jQuery( function ( $ ) {
    const cfg = window.MyPluginPointer;
    if ( ! cfg ) {
        return;
    }

    const $target = $( cfg.target );
    if ( ! $target.length ) {
        return;
    }

    const content = $( '<div>' ).append(
        $( '<h3>' ).text( cfg.title ),
        $( '<p>' ).text( cfg.content )
    ).html();

    $target.pointer( {
        content: content,
        position: { edge: 'left', align: 'center' },
        close: function () {
            $.post( window.ajaxurl, {
                action: 'dismiss-wp-pointer',
                pointer: cfg.slug,
            } );
        },
    } ).pointer( 'open' );
} );
```

## Common Mistakes

```php
// WRONG: script without CSS.
wp_enqueue_script( 'wp-color-picker' );

// RIGHT.
wp_enqueue_script( 'wp-color-picker' );
wp_enqueue_style( 'wp-color-picker' );
```

```php
// WRONG: datepicker with no stylesheet.
wp_enqueue_script( 'jquery-ui-datepicker' );

// RIGHT.
wp_enqueue_script( 'jquery-ui-datepicker' );
wp_enqueue_style( 'myplugin-datepicker', plugins_url( 'assets/datepicker.css', MYPLUGIN_FILE ) );
```

```js
// WRONG: PHP date() format in jQuery UI.
$( '#date' ).datepicker( { dateFormat: 'Y-m-d' } );

// RIGHT.
$( '#date' ).datepicker( { dateFormat: 'yy-mm-dd' } );
```

```js
// WRONG: returns data instead of calling response().
$( '#x' ).autocomplete( { source: ( request ) => fetchTags( request.term ) } );

// RIGHT.
$( '#x' ).autocomplete( {
    source: ( request, response ) => fetchTags( request.term ).then( response ),
} );
```

```js
// WRONG: no dismissal persistence.
$( '#myplugin-menu' ).pointer( { content: '<h3>New!</h3>' } ).pointer( 'open' );

// RIGHT.
$( '#myplugin-menu' ).pointer( {
    content: '<h3>New!</h3>',
    close: () => $.post( window.ajaxurl, { action: 'dismiss-wp-pointer', pointer: 'myplugin_new_menu' } ),
} ).pointer( 'open' );
```
