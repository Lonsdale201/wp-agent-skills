---
name: jfb-action-item-decorator
description: Wraps every action item in the JetFormBuilder action editor with
  custom UI via the 'jet.fb.action.item' wp.hooks filter — the wrapper renders
  on top of (or alongside) the original action editor for each action and can
  read/write that action's settings and events array. Use to add quick toggles
  or panels to every action without modifying each action's own editor — e.g.
  a TRUE/FALSE/Always button group that drives which custom event the action
  responds to, a "run once per session" toggle, an inline label override,
  any visual shortcut over the action's persisted state. Triggers on mentions
  of "jet.fb.action.item", "useLoopedAction", "useActionsEdit", "useActions",
  "ActionItemWrapper", "ActionItemBody", "decorate every action", "per-action
  toggle", or "visual control over action events".
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jetformbuilder"
  wp-skills-plugin-version-tested: "3.5.6"
  wp-skills-php-min: "7.4"
  wp-skills-api-stable-since: "3.0"
  wp-skills-last-updated: "2026-04-28"
---

# JetFormBuilder: per-action UI decorator (`jet.fb.action.item` filter)

JFB's action editor renders each configured action as an "action item" — a small panel showing the action's name, settings, and events. A plugin can **wrap every action item with extra UI** through the `jet.fb.action.item` wp.hooks filter. The wrapper component receives the original action item as a child and can render anything around or instead of it: a button group, a per-action toggle, an inline label override, an info badge, a quick configuration shortcut.

This skill is **not** about adding a new action type — that's `jfb-form-action`. It's about decorating actions that already exist on the form, *without modifying their own editor components*. A common use case (and the canonical pattern in the wild) is a button group that visually drives which custom event the action responds to: "Always / If TRUE / If FALSE" buttons that mutate the action's `events` array under the hood. The user sees three buttons; behind the scenes the wrapper writes `[CHATGPT.TRUE]`, `[CHATGPT.FALSE]`, or `[DEFAULT.PROCESS]` into the action's `events`.

The decorator pattern is **purely visual sugar over real JFB state** — it doesn't introduce a parallel storage system. Whatever the wrapper writes goes into the same `_jf_actions` post meta as the standard "Conditions → Events match" multi-select. Both UIs read and write the same array.

## API stability note

The `jet.fb.action.item` filter, the `JetFBHooks` (`useLoopedAction`, `useActionsEdit`, `useActions`), and the `JetFBComponents` (`ActionItemWrapper`, `ActionItemBody`) used by this pattern have been stable across the JFB 3.x line in source observed. They are not extensively documented in the public docs but appear in production usage (e.g. `chatgpt-for-jetformbuilder`) and are part of the global `window.JetFBHooks` / `window.JetFBComponents` export contract. The `plugin-version-tested` value records last end-to-end verification.

## When to use this skill

- Add a per-action toggle / button group / panel that should appear **on every action**, conditionally based on form state (e.g. only when a specific "trigger" action is also on the form).
- Provide a visual shortcut for a common configuration that would otherwise require the user to click into Conditions → Events match.
- Surface action-cross-cutting state (e.g. "this action will run TRUE branch of decision X") inline.
- The diff/files contain `jet.fb.action.item`, `useLoopedAction`, `useActionsEdit`, `ActionItemWrapper`, `addFilter` against the action editor.

## When NOT to use it

- Adding settings to your *own* action — those go in the action's editor component (see `jfb-form-action`), not in a global decorator.
- Adding new event types — see `jfb-action-events`.
- Adding new condition operators — see the conditional block skill.
- Decorating fields / blocks — different filter (`jet.fb.field.*`-family), out of scope here.

## Architecture in one paragraph

JFB renders the action list by mapping each action to a default "action item" component. Before each render, JFB applies the `jet.fb.action.item` wp.hooks filter to the component itself, passing the original component to your callback; your callback returns a NEW component (a higher-order component, HOC) which receives no props but uses JFB's React hooks (`useLoopedAction()`, `useActionsEdit()`, `useActions()`) to read the current action being rendered, the editor's update function, and the full actions list. Your HOC renders the original component as a child (so the action's normal editor is preserved) and adds whatever extra UI you need around it. State is mutated through `updateActionObj(actionId, partialObject)` which patches that action's stored config — including its `events` array, its `settings` object, or any other top-level field.

## Step 1 — declare what you're wrapping

Before touching anything, decide exactly what your decorator does, because it runs on **every action on the form**, on every render. Performance matters; complex logic must be guarded.

Three clear intents:

| Intent | Pattern |
|---|---|
| Show UI only when a specific "controller" action is also on the form | Read `useActions()`, look for the controller's type, render original if absent |
| Show UI only on actions of certain types (whitelist) | Read `useLoopedAction()`, check `action.type`, render original otherwise |
| Show UI for ALL actions unconditionally | Render UI directly — but be sure this is what you want |

Mixing these (e.g. "show controller-driven UI but skip the controller itself") is common; that's what the ChatGPT plugin does — show TRUE/FALSE buttons on every NON-decision action, but only when a decision action exists on the form.

## Step 2 — JS structure: HOC via the filter

The pattern is a higher-order component (HOC) — your callback receives the `Original` action item component and returns a new component that wraps it.

```js
( function registerActionItemDecorator( wp, jfb ) {
    if ( ! wp ) {
        return;
    }

    const { addFilter } = wp.hooks || {};
    const { createElement, Fragment } = wp.element || {};
    const { Button, ButtonGroup, Flex, CardFooter } = wp.components || {};
    const { __ } = wp.i18n || { __: ( s ) => s };

    const JetFBHooks      = window.JetFBHooks || {};
    const JetFBComponents = window.JetFBComponents || {};

    const { useLoopedAction, useActionsEdit, useActions } = JetFBHooks;
    const { ActionItemWrapper, ActionItemBody } = JetFBComponents;

    // Bail if any required dependency is missing — older JFB versions
    // may not export the same hooks/components, and the editor must
    // continue to work without our decorator.
    if (
        ! addFilter
        || ! createElement
        || typeof useLoopedAction !== 'function'
        || typeof useActionsEdit !== 'function'
        || typeof useActions !== 'function'
        || ! ActionItemWrapper
        || ! ActionItemBody
    ) {
        return;
    }

    addFilter(
        'jet.fb.action.item',
        'myplugin/per-action-decorator',
        ( Original ) =>
            function MyPluginDecoratorWrapper() {
                const { action } = useLoopedAction();
                const { updateActionObj } = useActionsEdit();
                const [ actions ] = useActions();

                if ( ! action ) {
                    return createElement( Original, null );
                }

                // Step 3: condition → render
                const shouldDecorate = /* see Step 3 patterns */;
                if ( ! shouldDecorate ) {
                    return createElement( Original, null );
                }

                // Step 4: read current state
                const currentEvents = Array.isArray( action.events ) ? action.events : [];
                const mode          = deriveMode( currentEvents );

                // Step 5: build setter
                const setMode = ( nextMode ) => {
                    updateActionObj( action.id, {
                        events: computeNextEvents( currentEvents, nextMode ),
                    } );
                };

                // Step 6: render decorated
                const controls = createElement(
                    CardFooter || 'div',
                    null,
                    createElement(
                        Flex,
                        { justify: 'space-between', align: 'center' },
                        createElement( 'span', null, __( 'My toggle', 'myplugin' ) ),
                        createElement(
                            ButtonGroup || Fragment,
                            null,
                            createElement( Button, {
                                variant: mode === 'a' ? 'primary' : 'tertiary',
                                onClick: () => setMode( 'a' ),
                                size:    'small',
                            }, __( 'Mode A', 'myplugin' ) ),
                            createElement( Button, {
                                variant: mode === 'b' ? 'primary' : 'tertiary',
                                onClick: () => setMode( 'b' ),
                                size:    'small',
                            }, __( 'Mode B', 'myplugin' ) )
                        )
                    )
                );

                return createElement(
                    ActionItemWrapper,
                    null,
                    createElement( ActionItemBody, null, createElement( Original, null ) ),
                    controls
                );
            }
    );
}( window.wp || false, window.jfb || {} ) );
```

The HOC pattern is critical: **never replace the original action item component** — always render it as a child. If you don't, the user loses access to that action's normal settings, events match panel, conditions, etc.

## Step 3 — render gating: when to decorate vs pass-through

Three ready-to-paste gates. Pick one and put it where Step 2 says `/* see Step 3 patterns */`:

### A) Only when a specific controller action is on the form

Use this when your decorator is a "responder UI" for some other action on the form. Example: ChatGPT Decision adds TRUE/FALSE toggles to every other action only when ChatGPT Decision itself is present.

```js
const CONTROLLER_TYPE = 'myplugin_controller';

const hasController = Array.isArray( actions )
    && actions.some( ( item ) => item && item.type === CONTROLLER_TYPE );

// Decorate every action EXCEPT the controller itself
const shouldDecorate = hasController && action.type !== CONTROLLER_TYPE;
```

### B) Only on actions of certain types (whitelist)

```js
const TARGETS = [ 'send_email', 'redirect_to_page' ];
const shouldDecorate = TARGETS.includes( action.type );
```

### C) Unconditional (every action, always)

```js
const shouldDecorate = true;
```

Use sparingly. UI shown on every action of every form is rarely the right call; it crowds the editor and makes other plugins' decorators visually compete with yours.

## Step 4 — reading the action's state

The action object exposed by `useLoopedAction()` is the same shape as stored in the form's `_jf_actions` post meta:

```js
{
    id:       0,                    // unique per form
    type:     'send_email',         // action's get_id() value
    is_execute: true,
    events:   [ 'DEFAULT.PROCESS' ], // events match selection
    settings: { ... },              // action_attributes() data
    conditions: [ ... ],
    condition_operator: 'and',
}
```

You can read any of these fields directly. The most common decorator targets:

- **`action.events`** — drive event selection visually (TRUE/FALSE/Always pattern, or scoping to a custom event).
- **`action.settings`** — surface a single common setting at the top-level UI (e.g. "Send to test email" toggle for any action that supports it).
- **`action.is_execute`** — quick enable/disable toggle.
- **`action.conditions`** — preview/badge active conditions inline.

## Step 5 — writing back: `updateActionObj(id, partial)`

`updateActionObj(actionId, { ...patch })` performs a **shallow merge** of `patch` onto the action's stored object. Pass only the keys you want to change:

```js
// Switch action's events
updateActionObj( action.id, {
    events: [ 'MYPLUGIN.MODE_A', ...otherEventsToKeep ],
} );

// Toggle a setting deep in action.settings
updateActionObj( action.id, {
    settings: {
        ...action.settings,
        my_flag: ! action.settings?.my_flag,
    },
} );

// Disable the action
updateActionObj( action.id, { is_execute: false } );
```

**Always spread the previous value** when updating object-typed fields like `settings` — `updateActionObj` shallow-merges only the top level. Without spreading, you'd overwrite the whole `settings` object.

## Step 6 — the canonical events-driven pattern (TRUE / FALSE / Always)

This is the ChatGPT Decision pattern, generalized. Use it when your plugin's "controller" action dispatches one of two custom events at runtime, and other actions on the form should pick which event to respond to.

Setup the constants based on your event IDs (registered per `jfb-action-events`):

```js
const EVENT_TRUE    = 'MYPLUGIN.MODE_A';
const EVENT_FALSE   = 'MYPLUGIN.MODE_B';
const DEFAULT_EVENT = 'DEFAULT.PROCESS';
```

Reading current mode from `action.events`:

```js
const stripCustomEvents = ( list ) =>
    Array.isArray( list )
        ? list.filter( ( id ) => id !== EVENT_TRUE && id !== EVENT_FALSE )
        : [];

let mode = 'always';
if ( action.events?.includes( EVENT_TRUE ) )      mode = 'true';
else if ( action.events?.includes( EVENT_FALSE ) ) mode = 'false';
```

Writing back when the user clicks a button:

```js
const setMode = ( nextMode ) => {
    const baseEvents = stripCustomEvents( action.events ).filter(
        ( id ) => id !== DEFAULT_EVENT
    );

    let nextEvents;
    if ( nextMode === 'true' ) {
        nextEvents = [ EVENT_TRUE, ...baseEvents ];
    } else if ( nextMode === 'false' ) {
        nextEvents = [ EVENT_FALSE, ...baseEvents ];
    } else {
        // 'always' — restore DEFAULT_EVENT, drop both custom events
        nextEvents = stripCustomEvents( action.events );
        if ( ! nextEvents.includes( DEFAULT_EVENT ) ) {
            nextEvents = [ DEFAULT_EVENT, ...nextEvents ];
        }
    }

    updateActionObj( action.id, { events: nextEvents } );
};
```

Three behaviors emerge:

- "Always" → action runs on `DEFAULT.PROCESS` (whatever the user set in Events match before is preserved minus the custom events).
- "If TRUE" → action runs ONLY when the controller dispatches `MYPLUGIN.MODE_A`.
- "If FALSE" → action runs ONLY when controller dispatches `MYPLUGIN.MODE_B`.

The events themselves still need to be:
1. **Registered server-side** via `'jet-form-builder/event-types'` filter (see `jfb-action-events`).
2. **Dispatched at runtime** by the controller action's `do_action()` via `jet_fb_events()->execute( EventClass::class )`.
3. **(Optional) advertised via `provideEvents`** in the controller action's registration config — without this they don't appear in the standard Events match multi-select. Whether you want them to appear there too is a UX decision; see "Coexistence with the standard Events match panel" below.

## Step 7 — required JFB exports

The decorator depends on three JFB-shipped React hooks and two components, all on the global window. Verify each before using:

```js
const JetFBHooks      = window.JetFBHooks      || {};
const JetFBComponents = window.JetFBComponents || {};

const { useLoopedAction, useActionsEdit, useActions } = JetFBHooks;
const { ActionItemWrapper, ActionItemBody }           = JetFBComponents;
```

| Export | Purpose |
|---|---|
| `useLoopedAction()` | React hook returning `{ action }` — the current action being rendered in the iteration. |
| `useActionsEdit()` | React hook returning `{ updateActionObj(id, patch), ... }` — the editor's mutation API. |
| `useActions()` | React hook returning `[ actions, setActions ]` — the full actions array. |
| `ActionItemWrapper` | Component that wraps an action item with the editor's standard layout. |
| `ActionItemBody` | Component for the body section of an action item; place the original component inside it. |

Always guard your filter registration on these being present (early-return otherwise). Older JFB versions may not export them, and your filter must not crash the editor.

## Step 8 — PHP enqueue

Hook on `'jet-form-builder/editor-assets/before'`. Same pattern as `jfb-form-action`:

```php
add_action( 'jet-form-builder/editor-assets/before', function () {
    $handle = 'myplugin-action-decorator';

    $deps = array( 'jet-fb-components', 'wp-element', 'wp-components', 'wp-hooks', 'wp-i18n' );

    foreach ( array( 'jet-fb-actions-v2', 'jet-fb-blocks-v2-to-actions-v2' ) as $maybe_dep ) {
        if ( wp_script_is( $maybe_dep, 'registered' ) ) {
            $deps[] = $maybe_dep;
        }
    }

    wp_enqueue_script(
        $handle,
        plugins_url( 'assets/js/action-decorator.js', __FILE__ ),
        $deps,
        '1.0.0',
        true
    );
} );
```

`wp-hooks` is mandatory because you need `addFilter`. Conditional v2 deps are the same protective pattern from `jfb-form-action` Step 3.

## Coexistence with the standard Events match panel

If you also `provideEvents` (see `jfb-form-action` and `jfb-action-events`) for the controller action, your custom event IDs will appear **both** in:

- Your decorator's button group on every action item, AND
- The standard Conditions → Events match multi-select on each action.

Both UIs read and write the same `action.events` array, so they stay in sync — but a power user can set conflicting selections (e.g. picking `MYPLUGIN.MODE_A` in the multi-select while the toggle says "Always"). The toggle UI re-derives `mode` from `action.events` on every render, so the toggle will display "If TRUE" the moment the user picks the event in the multi-select. The opposite is also true: clicking "Always" in the toggle removes `MODE_A` from the multi-select.

If you don't want the custom events visible in the multi-select (cleaner UX, only one way to set them), **omit `provideEvents`** in the controller's action registration. The events still work — dispatched events still match against `action.events` regardless of how the user got them in there. The `chatgpt-for-jetformbuilder` plugin took this minimalist approach.

## Critical rules

- **Always render the `Original` component as a child.** Never replace it. The action's own editor must remain accessible.
- **Use `updateActionObj`, not direct mutation.** Don't write to `action.events` or `action.settings` directly — React state won't pick up the change.
- **Spread the previous value when patching object-typed fields** (`settings`, `events`). `updateActionObj` shallow-merges; without spread you overwrite.
- **Guard the filter registration on dependencies being present** — `addFilter`, `createElement`, the JFB hooks, and the wrapper components must all exist. Older JFB versions or load-order races will leave one undefined; bail silently rather than crashing the editor.
- **Keep the gate in Step 3 cheap.** It runs on every render of every action item. A one-line `Array.some` over the actions array is fine; an O(n²) lookup or an effect is not.
- **Use a unique filter namespace.** `addFilter( 'jet.fb.action.item', 'myplugin/decorator', ... )` — the second argument MUST be unique across the whole site. If two plugins use the same namespace, the later registration wins silently and your decorator never runs.
- **Decorator order is filter-priority based.** If multiple plugins decorate the same action item, the wrappers stack. Test side-by-side with `chatgpt-for-jetformbuilder` or any other decorator-using plugin to confirm yours composes cleanly.
- **Don't store decorator-only state in the action's `settings`.** If a value is purely UI affordance and shouldn't survive a roundtrip without the decorator's plugin, derive it from existing fields (e.g. derive `mode` from `action.events`) rather than persisting it. Anything you write to `settings` becomes part of the action's contract.

## Common pitfalls (failure modes inferred from the API contract)

- **Decorator UI renders but state doesn't change**: `updateActionObj` not destructured correctly, OR `action.id` is undefined (you got the action from somewhere other than `useLoopedAction()`). Verify by logging `action` and `updateActionObj` types before calling.
- **Decorator appears on the controller action itself, looks weird**: missing the `action.type !== CONTROLLER_TYPE` exclusion in Step 3.
- **Decorator runs on every action even when it shouldn't**: Step 3 gate is wrong or missing. The gate must derive from `actions` and/or `action`, NOT from external module-level state.
- **Editor crashes with "Original is not a function"**: you used `createElement( Original )` outside the wrapper component, or `Original` was destructured incorrectly. The HOC must be `( Original ) => function Wrapper() { ... return createElement( Original ); }` — note Original is captured by closure, not destructured.
- **Multiple plugins' decorators conflict / one disappears**: namespace collision. Each plugin's `addFilter( 'jet.fb.action.item', NAMESPACE, ... )` namespace must be unique.
- **Filter registers but never runs**: missing `wp-hooks` dependency in `wp_enqueue_script`. Or your script ran before JFB's editor bootstrap — add v2 dependency handles conditionally (Step 8).
- **Mode reads as "always" when user just clicked "If TRUE"**: probably a stale closure. Make sure `currentEvents` is read via `useLoopedAction()` at render time, not captured outside.

## Cross-references

- Run **`jfb-form-action`** to register the controller action that dispatches the events your decorator switches between.
- Run **`jfb-action-events`** to register the actual events (`MYPLUGIN.MODE_A`, `MYPLUGIN.MODE_B`) and dispatch them from the controller's `do_action()`.
- The decorator only mutates `action.events` (or other persisted fields); the runtime behavior is entirely defined by the events skill. The decorator without the events skill is just UI that does nothing.

## What this skill does NOT cover

- Decorating fields or blocks (different filter family — `jet.fb.field.*`, out of scope).
- Adding settings to your own action (use the action's own editor component — see `jfb-form-action`).
- Building React components from scratch — assumes basic `createElement` familiarity.
- Persistent UI-only state that doesn't map to action fields — out of scope, would need a separate Gutenberg sidebar plugin.

## References

- `chatgpt-for-jetformbuilder` plugin: production reference implementation of the TRUE/FALSE/Always pattern. See `assets/js/action-editor.js` lines around the `addFilter( 'jet.fb.action.item', ... )` call.
- `jet-form-builder/assets/build/editor/form.builder.js`: the bundle that applies the filter (the `jet.fb.action.item` callback site).
- `@wordpress/hooks` — the underlying filter mechanism (https://developer.wordpress.org/block-editor/reference-guides/packages/packages-hooks/).
- Official documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/03-jet-form-builder>
