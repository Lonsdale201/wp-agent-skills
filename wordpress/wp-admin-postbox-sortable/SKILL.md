---
name: wp-admin-postbox-sortable
description: Wire up WordPress postboxes on custom plugin admin pages with
  collapse, drag sorting, Screen Options visibility, and core persistence.
  Covers `add_meta_box()`, `do_meta_boxes()`, the `postbox` script,
  `postboxes.add_postbox_toggles( pageId )`, the `.meta-box-sortables`
  / `.postbox` / `.hndle` DOM contract, and the two nonce fields plugins
  forget, `closedpostboxesnonce` and `meta-box-order-nonce`. Use when adding
  collapsible admin boxes, draggable metabox layouts, or Screen Options
  show/hide behavior to a custom plugin admin screen; use raw
  `jquery-ui-sortable` instead for non-postbox repeater rows.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0"
php-min: "7.4"
last-updated: "2026-05-24"
docs:
  - https://developer.wordpress.org/reference/functions/add_meta_box/
  - https://developer.wordpress.org/reference/functions/do_meta_boxes/
  - https://developer.wordpress.org/reference/functions/wp_nonce_field/
  - https://api.jqueryui.com/sortable/
---

# WordPress Admin Postboxes & Sortable

Use this skill when you need the familiar collapsible / draggable / Screen-Options-toggleable boxes that WordPress core uses on post edit and Dashboard, but on **your own admin page** or in **your own draggable list**. The most common failure mode is wiring up the HTML correctly, then watching the box collapse fine but never persist — because the nonce field is missing and the AJAX call silently fails.

## When to use this skill

Trigger when ANY of the following is true:

- The user is calling `add_meta_box()` on a custom screen (not just the regular post edit), or registering a custom screen and wants postbox behavior.
- The user wants drag-and-drop reordering for a list of items in `wp-admin` (option rows, repeater fields, custom panels).
- Code references `postboxes.add_postbox_toggles`, `.meta-box-sortables`, `.postbox`, `.hndle`, `closedpostboxesnonce`, `meta-box-order-nonce`, `closedpostboxes_*`, `metaboxhidden_*`, or `meta-box-order_*`.
- The user says "the collapse/expand works but doesn't save" or "drag works but order doesn't persist" or "Screen Options checkboxes don't appear on my page".

## The four pieces that MUST be in place

The postbox UI looks like a single component but it's actually four things wired together. Miss one and the behavior degrades silently. None of this is automatic on a custom admin page.

| Piece | Owner | Failure mode if missing |
|---|---|---|
| 1. `postbox` script enqueued | Your `admin_enqueue_scripts` callback | No collapse, no drag |
| 2. Correct DOM (`.meta-box-sortables` > `.postbox` > `.hndle`) | Your view template | Sortable doesn't init, collapse classes don't bind |
| 3. The two nonce fields in the form | Your view template | AJAX persistence fails; state is not stored |
| 4. `postboxes.add_postbox_toggles( pageId )` called on DOM ready | Your admin JS | No postbox behavior binds; sortable / collapse / Screen Options handlers never start |

### 1. Enqueue the `postbox` script

`postbox` is registered with `jquery-ui-sortable` and `wp-a11y` as deps (`wp-includes/script-loader.php:1439`), and it lives in the footer. Enqueue it on your screen only — never globally.

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'toplevel_page_myplugin' !== $hook_suffix ) {
        return;
    }

    wp_enqueue_script( 'postbox' );

    // Your bootstrap JS that calls postboxes.add_postbox_toggles().
    wp_enqueue_script(
        'myplugin-admin',
        plugins_url( 'assets/admin.js', MYPLUGIN_FILE ),
        array( 'postbox' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true, 'strategy' => 'defer' )
    );
} );
```

### 2. The DOM contract

`wp-admin/js/postbox.js` initializes jQuery UI Sortable with `items: '.postbox'`, `handle: '.hndle'`, and `connectWith: '.meta-box-sortables'`. Your markup MUST follow these class names exactly, even if you style them away.

```php
<div class="wrap">
    <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

    <form method="post" action="">
        <?php
        // Both nonces MUST be present — see piece 3 below.
        wp_nonce_field( 'closedpostboxes', 'closedpostboxesnonce', false );
        wp_nonce_field( 'meta-box-order', 'meta-box-order-nonce', false );
        ?>

        <div id="poststuff">
            <div id="post-body" class="metabox-holder columns-2">
                <div id="post-body-content"><!-- main column content --></div>

                <div id="postbox-container-1" class="postbox-container">
                    <?php do_meta_boxes( 'myplugin_page', 'side', $data_object ); ?>
                </div>

                <div id="postbox-container-2" class="postbox-container">
                    <?php do_meta_boxes( 'myplugin_page', 'normal', $data_object ); ?>
                    <?php do_meta_boxes( 'myplugin_page', 'advanced', $data_object ); ?>
                </div>
            </div>
            <br class="clear">
        </div>
    </form>
</div>
```

`do_meta_boxes()` outputs the `.meta-box-sortables` containers and reads the user's saved order from `meta-box-order_myplugin_page` automatically.

### 3. The two nonce fields — the most-forgotten step

Without these, `wp_ajax_closed_postboxes()` (`wp-admin/includes/ajax-actions.php:1803`) calls `check_ajax_referer( 'closedpostboxes', 'closedpostboxesnonce' )` and dies. The request fails (usually visible in Network as `-1` / 403), no user meta is written. The collapse toggles visibly, refresh the page, state is gone, and the developer blames "WordPress weirdness".

```php
wp_nonce_field( 'closedpostboxes',  'closedpostboxesnonce',   false );
wp_nonce_field( 'meta-box-order',   'meta-box-order-nonce',   false );
```

These are emitted in core by `wp-admin/edit-form-advanced.php`, `edit-form-comment.php`, `edit-link-form.php`, `nav-menus.php`, and `wp-admin/includes/dashboard.php`. On YOUR custom page, you emit them — the page that contains the `.postbox` elements.

### 4. Initialize on DOM ready

The screen identifier you pass — `pageId` — is what gets sanitize_key'd server-side and used as the user-meta suffix. Pick something stable; never `document.title` or anything localized.

```js
jQuery( function ( $ ) {
    postboxes.add_postbox_toggles( 'myplugin_page', {
        pbshow: function ( id ) { /* optional: called when a box opens */ },
        pbhide: function ( id ) { /* optional: called when a box closes */ },
    } );
} );
```

After this call, the user gets: click-to-collapse, drag-to-reorder, the move-up / move-down accessibility buttons, the Screen Options checkboxes (if you also register Screen Options — see "Screen Options" below), and all three states persist to user meta.

## Per-user persistence — the three storage keys

Replace `$page` with the sanitize_key'd page id you passed to `add_postbox_toggles()`.

| User meta key | Contents | Set by |
|---|---|---|
| `closedpostboxes_$page` | Array of postbox IDs that are currently collapsed | AJAX `closed-postboxes` action |
| `metaboxhidden_$page` | Array of postbox IDs hidden via Screen Options | Same AJAX action; ALWAYS exempts `submitdiv`, `linksubmitdiv`, `manage-menu`, `create-menu` |
| `meta-box-order_$page` | Map of `context => csv of postbox ids in order` | AJAX `meta-box-order` action |

`do_meta_boxes()` reads `meta-box-order_$page` and re-injects boxes in the user's saved order — you do nothing extra to make ordering "take effect" on next page load.

To reset a user's preferences (e.g. an "Reset layout" button on your page), `delete_user_meta()` on these three keys.

## Screen Options registration (the hide/show checkboxes)

Postboxes appear in Screen Options automatically if your screen has registered itself via `get_current_screen()`. For an `add_menu_page` / `add_submenu_page` page, this happens automatically. The Screen Options pane lists every registered meta box for that screen — users can hide ones they don't need, and the hidden set lands in `metaboxhidden_$page`.

If you want a custom "Layout" or "Show on screen" panel in Screen Options, use `add_screen_option()` from the `load-{$hook_suffix}` hook (covered separately by the WP-List-Table skill since it overlaps).

## jQuery events you can hook

`postbox.js` triggers three events on `document`. Useful for syncing your own UI to the postbox state without polling.

```js
jQuery( document )
    .on( 'postbox-toggled', function ( e, $postbox ) {
        // Fires after open/close. $postbox is a jQuery object.
    } )
    .on( 'postbox-moved', function ( e, $postbox ) {
        // Fires after a drag moves a box between sortable areas.
    } )
    .on( 'postboxes-columnchange', function () {
        // Fires when the user switches 1-column / 2-column layout via Screen Options.
    } );
```

## Pattern: drag-reorderable list without postbox chrome

When the user wants drag-to-reorder for a list of plugin-specific rows (rules, repeater entries) WITHOUT the postbox look, skip `postboxes.*` and use jQuery UI Sortable directly. `jquery-ui-sortable` is registered in core; no enqueue magic needed beyond declaring it as a dep.

```php
wp_enqueue_script(
    'myplugin-rules',
    plugins_url( 'assets/rules.js', MYPLUGIN_FILE ),
    array( 'jquery-ui-sortable', 'wp-a11y' ),
    MYPLUGIN_VERSION,
    array( 'in_footer' => true )
);

wp_localize_script( 'myplugin-rules', 'MyPluginRules', array(
    'restUrl' => esc_url_raw( rest_url( 'myplugin/v1/rules/order' ) ),
    'nonce'   => wp_create_nonce( 'wp_rest' ),
) );
```

```js
jQuery( function ( $ ) {
    $( '#myplugin-rules-list' ).sortable( {
        handle: '.rule-handle',
        placeholder: 'rule-placeholder',
        update: function () {
            const order = $( this ).sortable( 'toArray', { attribute: 'data-rule-id' } );
            wp.apiFetch( {
                url: MyPluginRules.restUrl,
                method: 'POST',
                headers: { 'X-WP-Nonce': MyPluginRules.nonce },
                data: { order },
            } ).then( () => wp.a11y.speak( wp.i18n.__( 'Order saved.', 'myplugin' ) ) );
        },
    } );
} );
```

Two non-obvious bits worth keeping:

- `wp.a11y.speak()` announces drag completion to screen readers. Core does this in `postbox.js` (`save_state` and `save_order`). Match the pattern.
- Use `data-*` attributes on each row plus `toArray({ attribute: 'data-rule-id' })` instead of relying on DOM ids — IDs collide more often than you'd think (especially in repeaters cloned from a template).

## Critical rules

- **Emit both nonces when using core postbox persistence**. If you emit only `closedpostboxesnonce`, drag-and-drop saves fail. If you emit only `meta-box-order-nonce`, collapse state saves fail. They're independent endpoints with independent nonces.
- **Never enqueue `postbox` globally**. It binds click handlers on `.postbox .hndle` and `.handlediv` globally; if another plugin's UI happens to have a `.postbox` element, you'll bind their elements too.
- **The `$page` argument must be sanitize_key-safe**. Core does `sanitize_key( $page )` and `wp_die(0)` if it doesn't match — see `ajax-actions.php:1813`. Use `myplugin_settings`, never `MyPlugin Settings`.
- **Don't write your own AJAX handlers for these**. Core already handles AJAX actions `closed-postboxes` and `meta-box-order` through `wp_ajax_closed_postboxes()` and `wp_ajax_meta_box_order()`. Reusing them is the whole point.
- **`metaboxhidden_$page` has a hardcoded exemption list**. `submitdiv`, `linksubmitdiv`, `manage-menu`, `create-menu` cannot be hidden via Screen Options — see `ajax-actions.php:1828`. If you need an always-visible box on a custom screen, name it accordingly OR accept that Screen Options can hide it.
- **Postbox JS uses `ajaxurl`**, the global injected by core on admin pages. If you're enqueueing on a screen where `ajaxurl` isn't defined (rare — really only the frontend), localize it yourself.

## Common mistakes

```js
// WRONG — runs before postbox.js loads (when postbox is in_footer, defer, or strategy=defer)
postboxes.add_postbox_toggles( 'myplugin_page' );

// RIGHT — wait for DOM ready
jQuery( function () {
    postboxes.add_postbox_toggles( 'myplugin_page' );
} );
```

```php
// WRONG — wp_create_nonce returns the nonce string, not a hidden field
echo wp_create_nonce( 'closedpostboxes' );

// RIGHT — wp_nonce_field renders the <input type="hidden" id="closedpostboxesnonce" ...>
//        which is what postbox.js looks for via jQuery('#closedpostboxesnonce').val()
wp_nonce_field( 'closedpostboxes', 'closedpostboxesnonce', false );
```

```php
// WRONG — enqueues on every admin page, binds handlers to other plugins' .postbox elements
add_action( 'admin_enqueue_scripts', static fn() => wp_enqueue_script( 'postbox' ) );

// RIGHT — only on your screen
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'toplevel_page_myplugin' === $hook_suffix ) {
        wp_enqueue_script( 'postbox' );
    }
} );
```

## Cross-references

- See **`wp-plugin-assets-loading`** for the canonical pattern for conditional enqueueing on a specific `$hook_suffix`.
- See **`wp-admin-list-table`** for Screen Options + per-user pagination preferences (overlapping user-meta storage pattern).
- See **`wp-admin-form-controls`** when the metabox body itself contains color pickers, date pickers, or `wp.codeEditor` instances.

## What this skill does NOT cover

- The block-editor metaboxes (`__back_compat_meta_box`) compatibility layer. The whole "Gutenberg shoves metaboxes into a iframe" rabbit hole is its own topic.
- Saving the content of a metabox on post save (`save_post` hook, nonce + capability check). Standard CPT scaffolding territory.
- `wp.media` frame triggered from inside a metabox body — covered by `wp-admin-media-frame`.

## References

- `wp-admin/js/postbox.js` — the canonical client-side implementation; read it before guessing behavior.
- `wp-admin/includes/ajax-actions.php` — `wp_ajax_closed_postboxes()` at line 1803 and `wp_ajax_meta_box_order()` at line 1988.
- `wp-admin/includes/template.php` — `add_meta_box()` at line 1080, `do_meta_boxes()` at line 1304.
- `wp-includes/script-loader.php:1439` — the `postbox` script registration with its dep array.
