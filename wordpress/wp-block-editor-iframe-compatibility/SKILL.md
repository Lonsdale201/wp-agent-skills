---
name: wp-block-editor-iframe-compatibility
description: Implement or audit WordPress block editor extensions for the always-iframed post editor in WordPress 7.1. Covers parent UI versus editor-canvas documents, ownerDocument/defaultView, @wordpress/compose useRefEffect, DOM events and observers, block and editor asset placement, block metadata styles, portals/popovers, iframe-safe selections and measurements, persistent admin toolbar effects, classic-theme behavior, Document-Isolation-Policy interaction, and migration testing. Use when editor JavaScript queries document/window, injects styles, listens globally, measures blocks, renders overlays, manipulates selection, adds metabox/editor UI, or breaks after upgrading to WP 7.1.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-19"
---

# WordPress Block Editor Iframe Compatibility

In WordPress 7.1, the post editor's content canvas is always rendered in an iframe. This no longer depends on the active theme, the current content, or whether every inserted block declares API version 3. Editor-shell controls and block content therefore live in different documents.

## Identify the target surface first

| Surface | Typical code | Asset/API choice |
|---|---|---|
| Editor shell/sidebar/toolbar | Plugin sidebar, notices, inspector panels | `enqueue_block_editor_assets`, WordPress components/data APIs |
| Canvas content | Block markup and content-facing styles | block metadata `style`/`editorStyle`, `enqueue_block_assets` where appropriate |
| Frontend | Saved/dynamic block output | block metadata `style`, `render.php`/callback, frontend enqueue |

Do not solve a canvas problem by globally injecting assets into the parent admin document, or a sidebar problem by loading code into every block content context.

## Stop treating global `document` as the canvas

In an editor extension bundle, `window` and `document` normally refer to the parent editor shell. Derive the correct browsing context from the element you own:

```js
import { useRefEffect } from '@wordpress/compose';

export function CanvasAwareControl() {
    const ref = useRefEffect( ( element ) => {
        const canvasDocument = element.ownerDocument;
        const canvasWindow = canvasDocument.defaultView;

        const handlePointerDown = ( event ) => {
            // Handle only events for this canvas document.
        };

        canvasDocument.addEventListener( 'pointerdown', handlePointerDown );
        canvasWindow?.addEventListener( 'resize', handlePointerDown );

        return () => {
            canvasDocument.removeEventListener( 'pointerdown', handlePointerDown );
            canvasWindow?.removeEventListener( 'resize', handlePointerDown );
        };
    }, [] );

    return <div ref={ ref } />;
}
```

Use the same rule for `getSelection()`, `getComputedStyle()`, `ResizeObserver`, `MutationObserver`, `Range`, element creation, and event constructors. Resolve constructors from `element.ownerDocument.defaultView` when realm identity matters.

Avoid locating `iframe[name="editor-canvas"]` and reaching through `contentDocument`. That couples code to editor markup and timing. A ref to the relevant rendered element is the durable boundary.

## Prefer editor APIs over DOM scraping

Use `@wordpress/data`, block-editor hooks/components, and block attributes for editor state. DOM queries such as `.block-editor-block-list__block`, parent-document key listeners, and private class names are fragile even when pointed at the correct document.

When direct DOM integration is unavoidable:

- scope selectors to the owned element or its `ownerDocument`;
- attach and remove listeners through a ref lifecycle;
- tolerate remounts and document replacement;
- never store a canvas document/element globally across editor navigation;
- avoid mutation observers over the whole document when a component ref suffices.

## Put styles in the correct document

For registered blocks, declare assets in `block.json`:

```json
{
    "apiVersion": 3,
    "name": "myplugin/card",
    "style": "file:./style-index.css",
    "editorStyle": "file:./index.css"
}
```

Use `style` for content that must look correct in both saved output and editor canvas. Use `editorStyle` only for editor-specific canvas presentation. Use `enqueue_block_editor_assets` for editor-shell UI code/styles, not for frontend content CSS.

Do not append `<style>` to global `document.head` and expect it to style the canvas. If a runtime style truly belongs to the canvas, insert it through a component/ref tied to `ownerDocument` and clean it up, or generate a stable stylesheet through WordPress' block/style APIs.

## Popovers, dialogs, and overlays

Prefer WordPress component primitives and provided slot/fill systems. Hand-built portals to `document.body` render in the parent shell and can misalign with canvas elements. If custom positioning is unavoidable, keep both the anchor measurements and overlay document explicit; do not mix coordinate systems from parent and iframe windows.

Keyboard/focus handling must also stay within the right document. Test Tab, Escape, focus return, scroll, zoom, and RTL in both post and site editors.

## Account for the persistent admin toolbar

WordPress 7.1 shows the admin toolbar consistently in the Post and Site Editors. Avoid hardcoded viewport offsets and CSS that assumes the editor starts at `top: 0`. Use layout primitives and measured geometry. When conditionally hiding or altering admin-bar nodes, gate by `get_current_screen()->is_block_editor()` or the relevant screen ID instead of inferring from URL fragments.

## Account for media isolation

The WP 7.1 client media pipeline can add `Document-Isolation-Policy: isolate-and-credentialless` on supported block-editor requests. External scripts/styles/media used in the editor need compatible CORS behavior, and strict CSPs may need worker support. Use `wp-client-side-media-processing` for the full isolation checklist.

## Migration audit

Search editor code for:

```text
document.querySelector
document.body
document.head
window.getSelection
window.getComputedStyle
window.addEventListener
new ResizeObserver
new MutationObserver
contentDocument
contentWindow
editor-canvas
createPortal
```

Each occurrence is not automatically wrong. Classify whether it targets the shell or canvas, then derive the intended document explicitly.

## Test matrix

1. post and page editors;
2. custom post type with REST/block-editor support;
3. classic and block themes;
4. empty content and content containing legacy/API-v2 blocks;
5. sidebar/toolbar UI and canvas interaction together;
6. selection, keyboard, overlay positioning, scroll, zoom, RTL;
7. editor navigation/remount without duplicate listeners;
8. production CORS/CSP with media processing enabled.

## Critical rules

- Treat editor shell and canvas as separate documents.
- Derive canvas DOM APIs from an owned element's `ownerDocument` and `defaultView`.
- Clean up every document/window observer and listener on ref teardown.
- Use block metadata and editor hooks for assets; do not spray styles into `document.head`.
- Prefer stable WordPress editor APIs over private DOM classes.
- Never use a hardcoded iframe selector as the integration contract.

## Cross-references

- Use **`wp-plugin-assets-loading`** for PHP enqueue contracts.
- Use **`wp-client-side-media-processing`** for DIP, CORS, CSP, and WASM effects.
- Use **`wp-accessibility-audit`** for focus, keyboard, and dialog behavior.
- Use **`wp-admin-postbox-sortable`** for classic metabox/postbox behavior outside the canvas contract.

## References

- Read `references/migration-patterns.md` for before/after DOM patterns and asset placement.
- Iframed editor changes dev note: <https://make.wordpress.org/core/2026/08/03/iframed-editor-changes-in-wordpress-7-1/>
- Persistent toolbar dev note: <https://make.wordpress.org/core/2026/07/13/consistent-navigation-in-wordpress-7-1-with-persistent-toolbar/>
- Core sources: `wp-includes/script-loader.php`, block editor package builds, and block metadata asset registration.
