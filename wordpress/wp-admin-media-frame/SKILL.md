---
name: wp-admin-media-frame
description: Open the standard WordPress Media Library picker from plugin
  admin UI with `wp_enqueue_media()` and `wp.media()`. Covers the screen-gated
  enqueue, `media-editor` dependency, `wp.media( { frame, title, button,
  library, multiple } )`, `library` filters for type / MIME / uploadedTo /
  author, `multiple` values `true` and `'add'`, `select` and `open` events,
  `frame.state().get( 'selection' ).first().toJSON()`, attachment `sizes`,
  frame caching, pre-selecting existing attachments, and saving attachment
  IDs instead of URLs. Use for image, file, gallery, logo, avatar, cover,
  or per-row icon pickers in settings pages, metaboxes, and repeaters.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://developer.wordpress.org/reference/functions/wp_enqueue_media/
  - https://developer.wordpress.org/reference/functions/wp_prepare_attachment_for_js/
  - https://codex.wordpress.org/Javascript_Reference/wp.media
---

# WordPress Admin Media Picker (`wp.media`)

The Media Library modal is the same Backbone-driven UI WP uses for "Add Media" on the post editor. Plugins reuse it for logo pickers, avatar fields, gallery builders, per-row icon selectors — anything that wants "open the WP media library, let the user pick or upload, hand me back an attachment". The blocker is almost always the bootstrap, not the API.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin admin page needs to pick an image / file / video / audio from the WP Media Library.
- The user is adding a "Choose image", "Upload logo", "Select gallery", "Pick avatar", "Browse media" button to a settings page, metabox, or repeater row.
- Code references `wp.media`, `wp.media.frame`, `wp_enqueue_media`, `wp_prepare_attachment_for_js`, `frame.state().get( 'selection' )`, `library: { type: ... }`, `multiple: 'add'`, or the `MediaFrame.Select` / `MediaFrame.Post` types.
- The user has a textarea / hidden input for an attachment ID and needs the UI around it.
- The user complains: "wp.media is undefined", "the modal opens but the Select button does nothing", "I get the URL but not the right size".

## The bootstrap — three pieces

Like every other WP admin JS API, the media frame needs (1) a PHP enqueue, (2) the right asset deps in your JS, (3) the JS init at DOM-ready. Miss any one and you get `wp.media is undefined` or a silent no-op.

### 1. PHP — call `wp_enqueue_media()` on YOUR screen only

`wp_enqueue_media()` is idempotent (it guards on `did_action( 'wp_enqueue_media' )`), but it enqueues ~12 scripts and a stylesheet. Don't call it globally.

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }

    wp_enqueue_media();

    wp_enqueue_script(
        'myplugin-media-picker',
        plugins_url( 'assets/media-picker.js', MYPLUGIN_FILE ),
        array( 'jquery', 'media-editor', 'wp-i18n' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );
} );
```

Declare `media-editor` as a dependency because it supplies the editor-facing
media API and depends on the underlying `media-views` stack. It is not a
lightweight alternative to that stack; `wp_enqueue_media()` loads the media
models, views, settings, templates, and styles required by the frame.

### 2. The HTML scaffold

The picker needs a trigger button, a hidden input to store the attachment ID, and a preview spot. Keep the input as the source of truth — server-side you save the ID, not the URL.

```php
<div class="myplugin-image-field" data-target="logo">
    <input
        type="hidden"
        id="myplugin_logo_id"
        name="myplugin_options[logo_id]"
        value="<?php echo esc_attr( $options['logo_id'] ?? '' ); ?>"
    />
    <div class="myplugin-image-preview">
        <?php
        if ( ! empty( $options['logo_id'] ) ) {
            echo wp_get_attachment_image( (int) $options['logo_id'], 'thumbnail' );
        }
        ?>
    </div>
    <button type="button" class="button myplugin-image-pick">
        <?php esc_html_e( 'Choose image', 'myplugin' ); ?>
    </button>
    <button type="button" class="button myplugin-image-remove">
        <?php esc_html_e( 'Remove', 'myplugin' ); ?>
    </button>
</div>
```

### 3. JS — open the frame on click

```js
jQuery( function ( $ ) {
    let frame;

    $( '.myplugin-image-pick' ).on( 'click', function ( e ) {
        e.preventDefault();

        // Cache the frame — opening a new one every click is wasteful and
        // loses the "previously selected" state.
        if ( frame ) {
            frame.open();
            return;
        }

        frame = wp.media( {
            title:    wp.i18n.__( 'Choose image', 'myplugin' ),
            button:   { text: wp.i18n.__( 'Use this image', 'myplugin' ) },
            library:  { type: 'image' },
            multiple: false,
        } );

        frame.on( 'select', function () {
            const attachment = frame.state().get( 'selection' ).first().toJSON();

            // Store the ID — the source of truth.
            $( '#myplugin_logo_id' ).val( attachment.id );

            // Render a thumbnail preview. CRITICAL: pick the right size — see below.
            const thumb = attachment.sizes && attachment.sizes.thumbnail
                ? attachment.sizes.thumbnail.url
                : attachment.url;
            $( '.myplugin-image-preview' )
                .empty()
                .append( $( '<img>', { src: thumb, alt: '' } ) );
        } );

        frame.open();
    } );

    $( '.myplugin-image-remove' ).on( 'click', function ( e ) {
        e.preventDefault();
        $( '#myplugin_logo_id' ).val( '' );
        $( '.myplugin-image-preview' ).empty();
    } );
} );
```

## Picking the right frame type

`wp.media( { frame: 'select', ... } )` is the default and covers almost every plugin picker. Use `'post'` only when re-creating the classic-editor Add Media flow, and avoid internal frames such as `'manage'` / `'edit-attachments'` in normal plugin settings screens.

## Filtering the library

The `library` attribute is a `wp.media.query` filter. Common shapes:

Common shapes: `library: { type: 'image' }`, `library: { type: [ 'image', 'video' ] }`, `library: { type: 'application/pdf' }`, `library: { uploadedTo: postId }`, and `library: { author: MyPluginMedia.currentUserId }`.

Localize `MyPluginMedia.currentUserId` from PHP with `get_current_user_id()` if you need an author filter. Do not read it from `wp.media.view.settings.post.featuredImageId` — that value is an attachment/post ID, not a user ID.

The client-side media query layer recognizes a curated set of props (`search`, `type`, `perPage`, `menuOrder`, `uploadedTo`, `status`, `include`, `exclude`, `author`) and maps some of them to query vars such as `s`. Do not assume arbitrary `WP_Query` attachment args will work from `library`.

## Single vs multi-select

```js
// Single. The default.
multiple: false

// Multi-select with normal toggle behavior (re-clicking deselects).
multiple: true

// Multi-select where re-clicking does NOT deselect — useful for "add to gallery".
multiple: 'add'
```

For multi-select, iterate the selection collection:

```js
frame.on( 'select', function () {
    const attachments = frame.state().get( 'selection' ).toJSON();
    attachments.forEach( function ( attachment ) {
        // attachment.id, attachment.url, attachment.title, attachment.sizes, ...
    } );
} );
```

## Pre-selecting an existing attachment on reopen

When the user already picked an image and reopens the picker, you want that image highlighted in the library — not a blank grid. Hook into `open` and add the attachment to the selection:

```js
frame.on( 'open', function () {
    const selection = frame.state().get( 'selection' );
    selection.reset();

    const currentId = parseInt( $( '#myplugin_logo_id' ).val(), 10 );
    if ( ! currentId ) {
        return;
    }
    const attachment = wp.media.attachment( currentId );
    attachment.fetch();           // hydrate through core's get-attachment AJAX action if not in cache
    selection.add( attachment );
} );
```

`wp.media.attachment( id )` returns a Backbone model; `.fetch()` pulls the data through core's `get-attachment` admin-ajax action (cached after first call).

## What you get from `selection.first().toJSON()`

The same shape `wp_prepare_attachment_for_js()` returns server-side
(`wp-includes/media.php:4541` in WP 7.0.1). Useful fields for plugin code:

| Field | What it is |
|---|---|
| `id` | Attachment post ID — the value you save |
| `url` | URL of the ORIGINAL file (full resolution) |
| `title` / `alt` / `caption` / `description` | User-facing metadata |
| `mime` / `type` / `subtype` | `'image/png'` / `'image'` / `'png'` |
| `filename` | File basename |
| `filesizeInBytes` / `filesizeHumanReadable` | Size info |
| `width` / `height` | Dimensions of the original (images/videos only) |
| `sizes` | Map of exposed image sizes → `{ url, width, height, orientation, ... }`. Core exposes `thumbnail`, `medium`, `large`, and `full` when metadata exists; custom sizes only appear if they are exposed through `image_size_names_choose` |
| `link` | Public attachment page URL |
| `uploadedTo` | Parent post ID (if attached to a post) |
| `author` | User ID who uploaded |

The pitfall: `attachment.url` is ALWAYS the full-size URL. To get a thumbnail, dig into `attachment.sizes.thumbnail.url`. Production preview code should fall back gracefully (some attachments, especially non-images or SVGs without thumbnails, don't have all sizes registered).

```js
function getDisplayUrl( attachment, sizeName = 'thumbnail' ) {
    if ( attachment.sizes && attachment.sizes[ sizeName ] ) {
        return attachment.sizes[ sizeName ].url;
    }
    if ( attachment.sizes && attachment.sizes.medium ) {
        return attachment.sizes.medium.url;
    }
    return attachment.url; // fallback to original
}
```

## The Backbone events you can hook

Use `select` for actual picks, `open` for preselecting an existing attachment, and `close` only for cleanup or refocusing. Do not save on `close`; cancellation fires it too. See `reference.md` for the event table.

## Saving and rendering server-side

Save the **ID**, never the URL. Sanitize with `absint()`, verify that it is an
attachment of the allowed MIME/type, and enforce the authorization appropriate
to the setting (for example, whether the current user may use or edit that
attachment). A `post_type = attachment` check alone does not establish access
or image-ness. Render with `wp_get_attachment_image()` and use
`wp_get_attachment_image_url( $id, $size )` only when you truly need a raw URL.
See `reference.md` for the snippets.

## Critical rules

- **Always call `wp_enqueue_media()` before any code that touches `wp.media`**. The cause of 90% of "wp.media is undefined" reports.
- **Save the ID, not the URL**. The URL rots with site moves, CDNs, and uploads-folder relocations. The ID is immutable.
- **Cache the frame instance**. Re-creating a new frame on every button click creates ~12 Backbone views per click, loses the previous selection, and visibly stutters.
- **`attachment.url` is the FULL-size URL**. Use `attachment.sizes.<size>.url` for any other size, with a fallback for attachments that don't have that size registered.
- **Listen to `select`, not `close`**. `close` fires on cancel too — you'll save a phantom value.
- **`multiple: 'add'` is NOT a typo for `true`**. They're three distinct modes — `false` (single), `true` (multi with deselect), `'add'` (multi without deselect, the gallery builder mode).
- **Don't open a frame before `DOMContentLoaded`**. Translations and modal containers may not be ready.
- **Don't reach inside `wp.media.view.*` to build a custom frame** unless you've read media-views.js. The Backbone architecture is undocumented in places and changes between WP versions. For 95% of plugin needs, `wp.media( { frame, library, multiple } )` is enough.

## Common AI mistakes

See `reference.md` for before/after snippets covering implicit `wp.media()` defaults, saving URLs instead of IDs, missing `wp_enqueue_media()`, recreating frames on every click, and assuming `attachment.sizes.thumbnail` always exists.

## Pattern: a per-row picker in a repeater

Use one cached frame, but track the active row before opening it. On `select`, write the chosen attachment ID into that row's hidden input. See `reference.md` for the full delegated-click example.

## Cross-references

- See **`wp-plugin-assets-loading`** for the `$hook_suffix` enqueue gate.
- See **`wp-admin-settings-api`** when the picker lives inside an options page; the hidden input goes through the `sanitize_callback`.
- See **`wp-admin-drag-and-drop`** when building a gallery with reorderable thumbnails — `wp.media` gives you the IDs, sortable gives you the order.

## What this skill does NOT cover

- Custom Backbone frames extending `wp.media.view.MediaFrame.Select`. Doable but undocumented; almost never needed.
- The Customizer's media controls (`wp.customize.MediaControl`). Different abstraction layer.
- Programmatic uploads (`wp_handle_upload`, `media_handle_upload`). That's a PHP-side topic.
- The block editor's media handling. Blocks use `<MediaUpload>` from `@wordpress/media-utils` — that wraps the same Backbone frame but exposes a React-ergonomic API. Out of scope for classic admin pages.

## References

- `wp-includes/media.php:4812` — `wp_enqueue_media()` source.
- `wp-includes/media.php:4541` — `wp_prepare_attachment_for_js()`, the source of the JSON shape you receive.
- `wp-includes/js/media-models.js:1412` — `wp.media = function( attributes )` entry point; the frame-type switch starts here.
- `wp-includes/js/media-views.js` — the Backbone views; useful when you actually need to subclass.
- `wp-includes/script-loader.php` — `media-editor`, `media-views`, `media-models` handle registrations.
- `reference.md` — server render snippets, event table, per-row picker, and common mistakes.
