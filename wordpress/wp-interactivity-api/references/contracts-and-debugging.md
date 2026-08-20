# Interactivity API contracts and debugging

## Server/client ownership

| Concern | Server | Client |
|---|---|---|
| Shared initial data | `wp_interactivity_state()` | `state` from `store()` |
| Per-element data | `data-wp-context` helper | `getContext()` |
| Immutable settings | `wp_interactivity_config()` | `getConfig()` |
| DOM behavior declaration | `data-wp-*` attributes | runtime directive processors |
| Actions/callbacks | reference only | `store( namespace, { actions, callbacks } )` |

State and configuration are serialized to the page. Treat both as public output.

## Directive value expectations

- `data-wp-text` is for text, not trusted HTML.
- `data-wp-class--name` and `data-wp-style--property` are focused boolean/value bindings.
- `data-wp-bind--attribute` must resolve to a value meaningful as one HTML attribute.
- `null` represents no bound attribute value.
- WordPress 7.1 rejects non-scalar and non-finite attribute-binding results instead of letting PHP stringify them unpredictably.

For complex class or style maps, use multiple class/style directives or a deliberate serialized scalar; do not bind an arbitrary array.

## Lifecycle choice

- Use `data-wp-init` for initialization tied to an element's presence.
- Use `data-wp-watch` when the callback intentionally reads reactive values and must rerun when those values change.
- Use event directives for user/browser events.
- Keep side effects out of derived state getters; a getter may be evaluated more than once.
- Scope external callbacks with `withScope()` when they later call `getContext()` or `getElement()`.

## Failure diagnosis

| Symptom | Check |
|---|---|
| No interaction | `supports.interactivity`, `viewScriptModule`, module asset metadata, exact namespace |
| Correct after click but wrong initially | PHP state/context and server directive processing |
| One instance updates another | shared store state used where per-instance context was needed |
| Context undefined in timer | missing `withScope()` |
| 7.1 `_doing_it_wrong()` from bind processor | array/object/non-finite result bound to an attribute |
| Works on first load only | module-global lifecycle assumption under client-side navigation |
| Markup breaks with quotes or `<` | hand-built JSON attribute instead of the context helper/tag processor |

## Compatibility gates

The Interactivity API entered Core in WordPress 6.5 and evolved afterward. If supporting older Core:

```php
if ( ! function_exists( 'wp_interactivity_state' ) ) {
    // Render a non-interactive fallback or load a separately maintained implementation.
    return;
}
```

Feature-detect the exact PHP function or JS export you use. A broad version comparison is less reliable when Gutenberg may provide newer editor packages than Core.
