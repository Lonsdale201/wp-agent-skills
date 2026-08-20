---
name: wp-interactivity-api
description: "Build or audit interactive WordPress blocks with the Interactivity API: block.json interactivity support, viewScriptModule, PHP state/config/context helpers, data-wp-* directives, @wordpress/interactivity stores, hydration, async actions, and WordPress 7.1 binding rules. Use for reactive frontend blocks, shared block state, server-rendered interactive markup, client-side navigation compatibility, or debugging server/client mismatches."
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.5 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Interactivity API

Use WordPress's block-oriented reactive runtime when frontend elements need shared state, declarative DOM updates, or server-rendered markup that hydrates without changing. Do not use it merely to enqueue an unrelated JavaScript widget.

## Choose the right mechanism

| Requirement | Prefer |
|---|---|
| One isolated click handler with no block integration | A small `viewScript` or `viewScriptModule` |
| Reactive state, directives, or communication between blocks | Interactivity API |
| Editor inspector/sidebar UI | `@wordpress/data` and Block Editor packages |
| Data persistence or privileged work | REST API with authorization; Interactivity API is only the UI/runtime layer |

## Minimal block contract

Declare support and load a script module through block metadata:

```json
{
  "apiVersion": 3,
  "name": "acme/counter",
  "supports": { "interactivity": true },
  "render": "file:./render.php",
  "viewScriptModule": "file:./view.js"
}
```

In `render.php`, initialize public state and emit directives safely:

```php
<?php
wp_interactivity_state(
    'acme/counter',
    array( 'total' => 0 )
);

$context = array( 'count' => (int) ( $attributes['start'] ?? 0 ) );
?>
<div
    data-wp-interactive="acme/counter"
    <?php echo wp_interactivity_data_wp_context( $context ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core returns a complete escaped attribute. ?>
>
    <output data-wp-text="context.count"></output>
    <button type="button" data-wp-on--click="actions.increment">
        <?php esc_html_e( 'Increase', 'acme' ); ?>
    </button>
</div>
```

In `view.js`:

```js
import { getContext, store } from '@wordpress/interactivity';

store( 'acme/counter', {
	actions: {
		increment() {
			const context = getContext();
			context.count += 1;
		},
	},
} );
```

Use `wp_register_script_module()` only for modules not already registered through `block.json`. Do not enqueue the module as a classic script.

## State, context, and config

- `wp_interactivity_state( $namespace, $state )` defines store state shared by that namespace and recursively merges later calls.
- `data-wp-context` is local to an element subtree; use `wp_interactivity_data_wp_context()` instead of hand-building JSON attributes.
- `wp_interactivity_config( $namespace, $config )` supplies immutable client configuration.
- `wp_interactivity_get_context()` and `wp_interactivity_get_element()` are meaningful only while the server is processing directives.
- State, context, and config reach the browser. Never place credentials, private tokens, capability-only data, or unfiltered personal data in them.

## Directive rules

Common directives are:

- `data-wp-interactive="namespace"` establishes the store namespace.
- `data-wp-on--click="actions.name"` attaches an event action.
- `data-wp-bind--hidden="state.isHidden"` binds an HTML attribute.
- `data-wp-class--is-open="context.isOpen"` toggles a class.
- `data-wp-style--width="state.width"` updates one style property.
- `data-wp-text="state.label"` updates text content.
- `data-wp-init` runs at element initialization; `data-wp-watch` reacts to accessed state.
- Explicit cross-store references use `namespace::state.path` or `namespace::actions.name`.

Do not invent directive names or duplicate an attribute on the same element. When generating or modifying markup, prefer `WP_HTML_Tag_Processor` over regex or concatenation.

## WordPress 7.1 behavior to audit

Server-side `data-wp-bind` now aligns more closely with the value sent to the client:

- strings and booleans remain scalar;
- numbers are JSON-formatted;
- an object is resolved through its JSON representation;
- arrays, non-scalar object results, and non-finite numbers are rejected with `_doing_it_wrong()` and the binding is treated as `null`.

Therefore, derived state used by an attribute binding must resolve to a finite scalar or `null`. Do not bind an array to `class`, `style`, or another attribute and rely on PHP coercion.

Malformed directive names and missing namespaces are also handled more defensively in 7.1. Treat notices under `WP_DEBUG` as contract failures, not harmless noise.

## Async and external callbacks

Actions invoked by the runtime receive the correct scope. If an action continues in a timer, subscription, or other external callback, preserve scope with `withScope()`. Follow the package's generator-based async-action pattern where the installed WordPress version requires it; do not replace it blindly with an unscoped Promise callback.

## Security and performance checklist

- Keep authorization in the REST/AJAX endpoint. A hidden button or action name is not access control.
- Escape ordinary PHP output and use the context helper for JSON attributes.
- Keep state serializable and minimal; large repeated payloads increase HTML and hydration cost.
- Use context for per-instance state and store state for genuinely shared data.
- Make initial PHP output match the first client render to avoid hydration flicker.
- Avoid global DOM queries when `getElement()` gives the scoped element.
- Test with multiple instances of the block and with a full-page cache.
- If client-side navigation is enabled, test mount, navigation, and teardown; do not assume a full page load resets module globals.

## Verification

1. Inspect the rendered page for the `data-wp-*` attributes and the script module.
2. Enable `WP_DEBUG` and `SCRIPT_DEBUG`; resolve `_doing_it_wrong()` and console warnings.
3. Confirm the server-rendered value equals the hydrated value before interaction.
4. Exercise keyboard behavior and ARIA state, not only pointer clicks.
5. Test two block instances to expose accidental global state.
6. Test the oldest supported WordPress version; guard the feature if it predates 6.5.

Read [references/contracts-and-debugging.md](references/contracts-and-debugging.md) for directive value semantics, lifecycle choices, and failure modes.

## Related skills

- `wordpress/wp-rest-api` for authenticated persistence and endpoint contracts.
- `wordpress/wp-html-api` for safe server-side directive mutation.
- `wordpress/wp-block-editor-iframe-compatibility` for editor-canvas code.
- `plugin-scaffold/wp-plugin-assets-loading` for script-module and asset loading.

## References

- Read `references/contracts-and-debugging.md` for the directive table, store contract and hydration-mismatch debugging.
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
