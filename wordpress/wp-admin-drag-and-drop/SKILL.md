---
name: wp-admin-drag-and-drop
description: Build WordPress admin drag-and-drop UI with core's bundled
  jQuery UI Sortable, Draggable, Droppable, optional `jquery-touch-punch`,
  `wp-api-fetch`, and `wp-a11y.speak()`. Covers flat reorder lists,
  connected lists / kanban columns, palette-to-dropzone clones,
  hierarchical tree indentation, REST order persistence, and keyboard
  reorder controls. Use when plugin admin pages need repeater row order,
  builder blocks, rule priority, kanban moves, custom field arrangers,
  pricing tiers, taxonomy term sort, or any non-React draggable admin UI.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress Admin Drag-and-Drop

WP ships a complete jQuery UI drag-and-drop toolkit and the WAI-ARIA helper core itself uses to announce moves. You do not need SortableJS, dnd-kit, or Dragula for an admin UI. The blocker isn't the API — it's that nobody documents **which primitive matches which UX a plugin developer actually wants to build**. This skill is that mapping.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin admin page needs drag-to-reorder for ANY list of items — repeater rows, custom builder cards, rule-priority lists, sortable form fields, custom taxonomy term order, FAQ entries, pricing tiers, notification levels.
- The user wants a palette of available items that get dragged into a drop zone — block-library-like UIs, condition builders, action chains.
- The user wants a kanban-style board, or any "move card between columns" UX.
- The user asks for "menu-style" or "parent/child" drag — nested trees with indentation.
- The user is reaching for an external D&D library for admin UI when WP's bundled primitives would do.
- Code references `jquery-ui-sortable`, `jquery-ui-draggable`, `jquery-ui-droppable`, `jquery-touch-punch`, `connectWith`, `connectToSortable`.

## Proof this is reusable: where core itself runs these primitives

Same three jQuery UI plugins, four wildly different UXes. If your plugin scenario looks like ANY of these, the same toolkit works for you.

| Core surface | Pattern used | What you can build with the same primitive |
|---|---|---|
| Postbox on post edit screens | Flat sortable + connected sortables (between context columns) | Repeater rows, FAQ list, rule list |
| Dashboard widgets | Same postbox engine | Plugin dashboard cards, status panels |
| Pre-Gutenberg widget admin (`Appearance → Widgets`) | Palette → drop zone, with cloned helper | Block library, action library, condition builder |
| Nav menus admin (`Appearance → Menus`) | Hierarchical sortable with depth math | Any tree UI (term reorder with nesting, page tree, file/folder tree) |
| Admin gallery in media | Flat sortable on attachment thumbs | Image carousel order, slider order |

This isn't theoretical — these are stable, production WP features, all built on the **same three handles**: `jquery-ui-sortable`, `jquery-ui-draggable`, `jquery-ui-droppable`.

## What you enqueue
The handles are pre-registered in `wp-includes/script-loader.php`. Declare them as deps:

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_script(
        'myplugin-builder',
        plugins_url( 'assets/builder.js', MYPLUGIN_FILE ),
        array(
            'jquery-ui-sortable',     // pick whichever you actually need
            'jquery-ui-draggable',    // — leave the rest out
            'jquery-ui-droppable',
            'jquery-touch-punch',     // optional: touch device support
            'wp-a11y',                // for wp.a11y.speak()
            'wp-i18n',                // for wp.i18n translations in announcements
            'wp-api-fetch',           // for persisting order via REST
        ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );
} );
```

| Handle | Version | When you need it |
|---|---|---|
| `jquery-ui-sortable` | 1.13.3 | Any reorderable list |
| `jquery-ui-draggable` | 1.13.3 | Palette items / freely-dragged elements |
| `jquery-ui-droppable` | 1.13.3 | Drop targets that aren't sortable lists (trash zone, status bucket) |
| `jquery-touch-punch` | n/a | Touch device support for any of the above |
| `wp-a11y` | n/a | `wp.a11y.speak()` for screen reader announcements |

## Decision tree

| You want… | Use |
|---|---|
| Reorder a single list of plugin items | `.sortable()` on the list |
| Move items between multiple lists (kanban, settings columns) | `.sortable({ connectWith })` on each list |
| A library/palette of templates dragged INTO a builder area | Palette: `.draggable({ connectToSortable, helper: 'clone' })`. Target: `.sortable()` |
| A drop target that is NOT a sortable list (delete zone, "send to status X" bucket, favorites) | `.droppable({ accept, drop })` |
| Hierarchical tree with parent/child indentation | `.sortable()` + depth-aware `sort` / `stop` handlers (see Pattern 4) |
| Anything above, on phones/tablets | Add `jquery-touch-punch` as a dep |

## Pattern 1 — flat sortable list

The most common plugin scenario. Repeater rows in a settings page, FAQ items, rule lists, pricing tiers, anything where order matters but there's no hierarchy.

```js
jQuery( function ( $ ) {
    $( '#myplugin-rules' ).sortable( {
        items: '> .rule-row',
        handle: '.rule-handle',
        placeholder: 'rule-placeholder',
        cursor: 'move',
        tolerance: 'pointer',
        forcePlaceholderSize: true,
        update: function () {
            const $list = $( this );
            const order = $( this ).sortable( 'toArray', { attribute: 'data-rule-id' } );
            $list.sortable( 'disable' );
            wp.apiFetch( {
                path: '/myplugin/v1/rules/order',
                method: 'POST',
                data: { order },
            } ).then( () => {
                wp.a11y.speak( wp.i18n.__( 'Order saved.', 'myplugin' ) );
            } ).catch( () => {
                wp.a11y.speak( wp.i18n.__( 'Order was not saved. Reloading.', 'myplugin' ) );
                window.location.reload(); // Restore canonical server order.
            } ).finally( () => $list.sortable( 'enable' ) );
        },
    } );
} );
```

Why `toArray({ attribute: 'data-rule-id' })` instead of DOM `id`: in repeater rows cloned from a template, DOM ids tend to collide. Use `data-*` attributes — that's what production builders do.

For metabox-style flat lists (with collapse + Screen Options), see **`wp-admin-postbox-sortable`** — that's the special-case skill for the postbox-specific chrome.

## Pattern 2 — connected lists (kanban / move between zones)

When you have multiple lists and items can move between them. Plugin use cases: kanban board for membership states, two-column "available / enabled" toggles, status-bucket UIs, multi-tier rule sets where rules can be promoted/demoted.

```js
const $columns = $( '.builder-column' );

$columns.sortable( {
    connectWith: '.builder-column',
    items: '> .builder-card',
    handle: '.card-handle',
    placeholder: 'card-placeholder',
    forcePlaceholderSize: true,
    update: function ( event, ui ) {
        if ( ui.sender ) {
            return; // The sender list also fires update; only persist once.
        }
        const payload = {};
        $columns.each( function () {
            payload[ this.id ] = $( this ).sortable( 'toArray', { attribute: 'data-card-id' } );
        } );
        wp.apiFetch( {
            path: '/myplugin/v1/cards/order',
            method: 'POST',
            data: payload,
        } ).then( () => {
            wp.a11y.speak( wp.i18n.__( 'Board updated.', 'myplugin' ) );
        } ).catch( () => {
            wp.a11y.speak( wp.i18n.__( 'Board was not saved. Reloading.', 'myplugin' ) );
            window.location.reload();
        } );
    },
} );
```

The critical gotcha: a cross-list move fires `update` on **both** the sender and the receiver. Dedupe on `ui.sender` (truthy only on the receiving list), or you'll double-save.

## Pattern 3 — palette + drop zones

When you have a fixed library of items on one side, drop zones on the other. The palette item stays put (it clones); a new item lands in the drop zone. Plugin use cases: block library, action library for a logic builder, available-tags panel, condition builder.

```js
// Draggable owns connectToSortable; the palette remains because helper is a clone.
$paletteItems.draggable( { connectToSortable: '.dropzone', helper: 'clone' } );
$dropzones.sortable( { receive: convertCloneToPersistedItem } );
```

`connectToSortable` belongs to Draggable, and `helper: 'clone'` keeps the source
item. `receive` must persist the new item, replace the temporary clone only on
success, and remove it on failure. The complete async example is in
`reference.md`.

## Pattern 4 — hierarchical / nested (parent + child indentation)

When you need tree behavior with depth indentation that updates *while dragging*. Plugin use cases: hierarchical taxonomy term reorder with nesting, page-tree style site map, file/folder tree, parent/child rule grouping.

The algorithm:

- Depth is rendered as `margin-left: depth * STEP_PX` (or as a `.item-depth-N` class). NOT as nested `<ul>` markup.
- During drag: read the helper's x-offset and clamp not only to
  `[0, MAX_DEPTH]`, but also to the structural limit: at most one level deeper
  than the previous visible row. Account for the dragged subtree so no child
  exceeds `MAX_DEPTH`.
- Children = following siblings whose depth is greater than the dragged item. At drag-start, detach them into a transport element so the placeholder sizes correctly; at drag-stop, re-insert them after the parent and shift their depth classes by the same delta.

When persisting: walk the DOM in order, each item's parent is "the previous item with depth = current depth − 1". Server side this collapses to a flat list with `parent_id` per row.

See `reference.md` for a compact implementation. For a battle-tested implementation, read `wp-admin/js/nav-menu.js:885`; it includes RTL handling, accessibility hooks, and menu-specific bits most plugins don't need.

## Pattern 5 — droppable trash / status bucket

When the target isn't a sortable list — a delete zone, a "send to archive" bucket, a star/favorite area, a "test now" tray.

```js
$( '#trash-zone' ).droppable( {
    accept: '.tree-item, .rule, .placed-item',
    activeClass: 'trash-zone-active',  // while ANY draggable is being dragged
    hoverClass:  'trash-zone-hover',   // while a valid item is over us
    tolerance: 'pointer',
    drop: function ( event, ui ) {
        const id = ui.draggable.data( 'item-id' );
        ui.draggable.addClass( 'is-pending' ).attr( 'aria-disabled', 'true' );
        wp.apiFetch( {
            path: `/myplugin/v1/items/${ id }`,
            method: 'DELETE',
        } ).then( () => {
            ui.draggable.fadeOut( 150, () => ui.draggable.remove() );
            wp.a11y.speak( wp.i18n.__( 'Item deleted.', 'myplugin' ) );
        } ).catch( () => {
            ui.draggable.removeClass( 'is-pending' ).removeAttr( 'aria-disabled' );
            wp.a11y.speak( wp.i18n.__( 'Item could not be deleted.', 'myplugin' ) );
        } );
    },
} );
```

Useful even when you don't need a "trash" — same pattern works for "click-drag a campaign onto a date in a mini-calendar", "drag a user onto a role bucket", "drop a product onto a category preview". Any target that isn't itself a sortable list.

## Persisting order — REST, not admin-ajax

Don't reach for `admin-ajax.php` for new endpoints. Use REST with a real
`permission_callback`, validation plus sanitization (`order` as a positive
integer array), and `wp-api-fetch` on the client. Server-side, verify that the
submitted IDs are the complete allowed set for that user/container: an args
schema cannot detect omitted, foreign, or duplicate business objects.
`wp-api-fetch` attaches `X-WP-Nonce` for the standard cookie-authenticated
WordPress setup when its nonce middleware is configured by core.

## Accessibility — match the postbox keyboard pattern

Pointer-only drag is a WCAG fail. The pattern WP itself ships: a pair of "move up / move down" buttons per item alongside the drag handle, with `wp.a11y.speak()` announcements. Match it.

Use real buttons, not only a draggable handle. The click handler moves the row in the DOM, calls the same persistence routine as drag-drop, and announces with `wp.a11y.speak()`. See `reference.md` for the snippet and `postbox.handleOrder()` in `wp-admin/js/postbox.js:98` for core's pattern.

## Touch support

jQuery UI 1.13's drag handlers are mouse-only. For touch devices, add `jquery-touch-punch` as a dep — it patches jQuery UI mouse interactions to also accept touch events. It's already registered in core (loaded by Iris, the color picker thumb), so declaring it as a dep is enough.

## Critical rules

- **Prefer core's jQuery UI handles for conventional PHP-rendered admin UI**.
  Complex pointer/touch interactions or React-rendered surfaces may justify a
  maintained external library; account for its bundle, accessibility, and
  lifecycle costs explicitly.
- **Always provide a keyboard reorder path**. Pointer-only D&D fails WCAG. Postbox-style move-up / move-down buttons + `wp.a11y.speak` is the WP pattern; match it.
- **`update` fires on both the sender and the receiver** during a cross-list move. Dedupe on `ui.sender` or you'll double-save.
- **`receive` runs BEFORE `update` on the receiving list**. Convert palette stubs into real items in `receive`, persist final order in `update`.
- **Don't initialize a sortable on a collection you'll re-render server-side**. After an AJAX HTML swap, call `$container.sortable( 'destroy' )` before re-initializing — otherwise items get duplicate event bindings.
- **Hierarchical depth is geometry, not DOM nesting**. The nav-menu / Pattern 4 approach uses a flat sibling list with depth classes, NOT nested `<ul>` containers. This is what lets items move across parents — there are no nested containers to "leave".
- **Don't track item position in client-side state**. Read from the DOM (`sortable('toArray')`) at persist time. The DOM IS the model.
- **Persist on `update`, not on `change` or `sort`**. `change` / `sort` fire continuously during drag; `update` fires once on drop. AJAX storms are the result of confusing them.

## Common AI mistakes

See `reference.md` for before/after snippets: flat sortable used for trees, `connectToSortable` placed on the wrong primitive, persisting on `change`, missing `wp.a11y.speak()`, and adding new admin-ajax handlers instead of REST routes.

## Cross-references

- See **`wp-admin-postbox-sortable`** for the metabox special case (collapse + Screen Options + the two nonce fields plugins forget).
- See **`wp-plugin-assets-loading`** for the canonical way to declare these jQuery UI handles as deps without globally bloating admin.
- See **`wp-rest-api`** for the order-persistence endpoint shape (permission_callback, args schema, capability checks).

## What this skill does NOT cover

- React / Gutenberg drag-and-drop. Inside the block editor or any React island, `@dnd-kit/core` is the idiomatic choice. jQuery UI doesn't fit there.
- Extending the existing nav-menus admin (the menu builder you see in `Appearance → Menus`). That's a separate topic — `wp_setup_nav_menu_item` filter, `walker_nav_menu_edit`.
- File drag-and-drop into the media library. Media uses `wp-plupload` (HTML5 file drop), which is a different primitive.

## Where to look in core for proof / reference

You don't need to read these to use the patterns above — they're listed for when you want a battle-tested implementation to copy from.

- `wp-admin/js/postbox.js` — flat sortable (init at line 369), keyboard reorder buttons (line 98).
- `wp-admin/js/widgets.js:195` and `:271` — palette + drop-zone pattern.
- `wp-admin/js/nav-menu.js:885` — hierarchical sortable with depth math.
- `wp-includes/script-loader.php:955-959` — the `jquery-ui-draggable`, `jquery-ui-droppable`, `jquery-ui-sortable` registrations.
- `reference.md` — hierarchical tree snippet, keyboard reorder snippet, and common mistakes.

## References

- Official documentation: <https://api.jqueryui.com/sortable/>
- Official documentation: <https://api.jqueryui.com/draggable/>
- Official documentation: <https://api.jqueryui.com/droppable/>
