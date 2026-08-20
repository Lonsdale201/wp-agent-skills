# Always-iframed editor migration patterns

## DOM lookup

```js
// Wrong when the target is block content: parent editor document.
const target = document.querySelector( '.myplugin-card' );

// Better: scope from an element rendered in the target document.
const target = element.ownerDocument.querySelector( '.myplugin-card' );

// Best where possible: hold a ref to the target itself and avoid a document query.
```

## Selection and computed style

```js
const ownerWindow = element.ownerDocument.defaultView;
const selection = ownerWindow?.getSelection();
const computed = ownerWindow?.getComputedStyle( element );
```

Do not combine a parent-window selection or viewport measurement with a canvas element rectangle.

## Observers and realm-sensitive constructors

```js
const OwnerResizeObserver = element.ownerDocument.defaultView?.ResizeObserver;
if ( OwnerResizeObserver ) {
    const observer = new OwnerResizeObserver( callback );
    observer.observe( element );
    // Disconnect during ref/effect cleanup.
}
```

This avoids cross-realm assumptions and makes teardown explicit.

## Asset placement

| Need | Preferred mechanism |
|---|---|
| Shared block content CSS | `block.json` `style` |
| Canvas-only block CSS | `block.json` `editorStyle` |
| Sidebar/toolbar JavaScript | `enqueue_block_editor_assets` |
| General frontend and canvas block asset | `enqueue_block_assets`, with screen/feature gating as needed |
| Dynamic per-instance visual value | block attributes/style engine or scoped inline style tied to owned canvas element |

## Common failures

- Listener added to the parent `document`, so canvas keyboard/pointer events never arrive.
- CSS appended to the parent head, so blocks appear unstyled in the iframe.
- Portal rendered into the parent body while positioned with iframe-relative coordinates.
- Cached `contentDocument` survives an editor remount and points at a detached document.
- `window.getSelection()` reads the editor shell selection instead of the canvas selection.
- fixed positioning assumes the admin toolbar is absent.

## Source/release checks

Test against the built editor shipped by the target WordPress release. The public contract is the separate canvas document; iframe markup, private class names, and package-private exports are not extension APIs.
