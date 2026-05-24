# wp.media Reference Examples

## Frame Types

| `frame` | Purpose | When a plugin uses it |
|---|---|---|
| `'select'` | Basic picker; pick existing attachment or upload | Most plugin scenarios |
| `'post'` | Classic editor Add Media frame with editor sidebars | Re-creating classic-editor media flow |
| `'image'` / `'audio'` / `'video'` | Edit details of an existing attachment of that type | Rare |
| `'edit-attachments'` | Bulk-edit a list of attachments | Internal core use |
| `'manage'` | Media Library grid view | Internal core use |

## Event Table

| Event | When it fires | Common use |
|---|---|---|
| `open` | After modal is rendered and visible | Pre-select existing item, set library state |
| `select` | User clicked the Select button | Read selection, save attachment ID |
| `close` | Modal closed for any reason | Cleanup, refocus trigger button |
| `escape` | User pressed Esc | Rarely needed; `close` covers most cases |
| `ready` | Frame finished initial render | Customize internal views before user sees them |

The toolbar Select button dispatches `select`. Do not listen to `close` for "user picked something"; `close` fires on cancellation too.

## Saving and Rendering Server-Side

```php
$sanitize_logo_id = static function ( $value ): int {
    $id = absint( $value );
    return ( $id && 'attachment' === get_post_type( $id ) ) ? $id : 0;
};
```

```php
if ( ! empty( $options['logo_id'] ) ) {
    echo wp_get_attachment_image(
        (int) $options['logo_id'],
        'medium',
        false,
        array( 'class' => 'myplugin-logo' )
    );
}

$logo_url = wp_get_attachment_image_url( (int) $options['logo_id'], 'full' );
```

## Per-Row Picker in a Repeater

```js
jQuery( function ( $ ) {
    let frame, $activeRow;

    $( '#myplugin-rows' ).on( 'click', '.row-pick-image', function ( e ) {
        e.preventDefault();
        $activeRow = $( this ).closest( '.myplugin-row' );

        if ( ! frame ) {
            frame = wp.media( {
                title:    wp.i18n.__( 'Choose row image', 'myplugin' ),
                library:  { type: 'image' },
                multiple: false,
            } );

            frame.on( 'select', function () {
                if ( ! $activeRow ) {
                    return;
                }

                const attachment = frame.state().get( 'selection' ).first().toJSON();
                const thumb = attachment.sizes && attachment.sizes.thumbnail
                    ? attachment.sizes.thumbnail.url
                    : attachment.url;

                $activeRow.find( '.row-image-id' ).val( attachment.id );
                $activeRow.find( '.row-image-preview' )
                    .empty()
                    .append( $( '<img>', { src: thumb, alt: '' } ) );
            } );

            frame.on( 'close', function () {
                $activeRow = null;
            } );
        }

        frame.open();
    } );
} );
```

## Common Mistakes

```js
// WRONG: relies on implicit defaults and opens an unconstrained library.
const frame = wp.media();

// RIGHT: be explicit.
const frame = wp.media( { frame: 'select', library: { type: 'image' }, multiple: false } );
```

```js
// WRONG: saves the URL; breaks on site move.
$( '#logo_url' ).val( attachment.url );

// RIGHT: save the ID.
$( '#logo_id' ).val( attachment.id );
```

```js
// WRONG: wp.media is undefined because wp_enqueue_media() was not called.
$( '.pick-image' ).on( 'click', () => wp.media().open() );

// RIGHT: guard, and enqueue media on this screen.
if ( ! window.wp || ! wp.media ) {
    return;
}
```

```js
// WRONG: fresh frame every click; selection state is lost.
$( '.pick-image' ).on( 'click', function () {
    wp.media( { library: { type: 'image' } } ).on( 'select', handleSelect ).open();
} );

// RIGHT: close over a frame variable.
let frame;
$( '.pick-image' ).on( 'click', function () {
    if ( ! frame ) {
        frame = wp.media( { library: { type: 'image' } } );
        frame.on( 'select', handleSelect );
    }
    frame.open();
} );
```

```js
// WRONG: assumes thumbnail always exists.
$preview.html( `<img src="${ attachment.sizes.thumbnail.url }">` );

// RIGHT: fall back through sizes.
const src = ( attachment.sizes && attachment.sizes.thumbnail && attachment.sizes.thumbnail.url )
    || ( attachment.sizes && attachment.sizes.medium && attachment.sizes.medium.url )
    || attachment.url;
```
