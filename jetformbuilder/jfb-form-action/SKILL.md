---
name: jfb-form-action
description: Registers a custom JetFormBuilder Form Action — a server-side
  handler that runs after submit (send to API, subscribe to CRM, write
  to a sheet, etc.). Covers extending Base action class, declaring
  settings via action_attributes(), implementing do_action() with
  Action_Exception error reporting, building the action-editor React
  panel via window.JetFBActions.addAction(), the two field-mapping
  patterns (dynamic "Add row" like Google Sheets vs fixed-key pattern
  like Fluent CRM with predefined target fields), looking up the
  form's current fields via the useFields() hook, multi-select with
  FormLabeledTokenField, plus the category/docHref convention. Use
  when scaffolding a JFB integration plugin (Mailchimp, Slack, custom
  API, payment processor, CRM subscribe). Triggers on mentions of
  "JFB action", "jet-form-builder/actions/register", "Base_Action",
  "JetFBActions.addAction", "Action_Exception", "field map", or
  "fields_map".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: jetformbuilder
plugin-version-tested: "3.5.6"
api-stable-since: "3.0"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://github.com/Crocoblock/developer-documentation/tree/main/03-jet-form-builder
  - https://developer.wordpress.org/block-editor/reference-guides/components/
source-refs:
  - includes/actions/types/base.php
  - includes/actions/manager.php
  - includes/actions/action-handler.php
  - modules/actions-v2/send-email/send-email-action.php
---

# JetFormBuilder: register a custom Form Action

A Form Action is a server-side handler that fires **after** a JFB form is submitted: send email, subscribe to a CRM, append to a Google Sheet, post to Slack, charge a card, etc. Each form can have multiple actions in a chain; each action sees the request data and the chain context, can write back to the response, and can halt the chain by throwing.

This skill covers the official end-to-end API as observed in JFB 3.5.x and three production companion plugins. It includes both field-mapping patterns plugins use in the wild (dynamic "Add row" and fixed-key), plus the multi-select / token-field pattern.

## API stability note

The `Base` action class, the `'jet-form-builder/actions/register'` PHP hook, the persistence model (`_jf_actions` post meta), and the `Action_Exception` error pattern have been stable across JFB 3.x. The JS-side `window.JetFBActions.addAction()` and `window.jfb.blocksToActions.useFields()` are also stable in the source observed. The `category` and `docHref` action editor properties are a **community convention** (used by Fluent CRM and others) that JFB's action picker UI consumes, but they are not part of the PHP API — keep them in JS only.

## When to use this skill

- Building a JFB companion plugin that needs to do something on form submit.
- The user mentions an integration target (CRM, payment, webhook, file storage, ticketing).
- The diff/files contain `extends Base` (action namespace), `action_attributes`, `do_action`, `JetFBActions.addAction`, `useFields`, `Action_Exception`, or `'jet-form-builder/actions/register'`.

## Architecture in one paragraph

JFB's action manager fires `'jet-form-builder/actions/register'` at `init` priority 99 with a `Manager` instance. Each plugin calls `$manager->register_action_type( new MyAction() )` with a class extending `Jet_Form_Builder\Actions\Types\Base`. The class declares its settings shape in `action_attributes()`, exposes user-facing labels via `editor_labels()` / `editor_labels_help()`, and implements `do_action( array $request, Action_Handler $handler )` which runs at submit time. On the JS side, the action editor is React-based: the plugin enqueues a script on `'jet-form-builder/editor-assets/before'` and calls `window.JetFBActions.addAction( id, Component, config )` to register the editor UI. The component receives `props.settings` and `props.onChangeSetting`, uses `window.jfb.blocksToActions.useFields()` to query the form's current fields, and renders standard `@wordpress/components`. The user's configuration persists as part of the form's `_jf_actions` post meta (a JSON array of all actions on the form). Errors during execution are surfaced by throwing `Action_Exception( $code, $message )`.

## Step 1 — PHP: extend the Base action class

```php
<?php
namespace MyPlugin\Actions;

use Jet_Form_Builder\Actions\Types\Base;
use Jet_Form_Builder\Actions\Action_Handler;
use Jet_Form_Builder\Exceptions\Action_Exception;

class SubscribeAction extends Base {

    public function get_id() {
        return 'myplugin_subscribe';
    }

    public function get_name() {
        return __( 'My CRM Subscribe', 'myplugin' );
    }

    public function self_script_name() {
        // Used as the localize handle in JS — must be unique.
        return 'MyPluginSubscribeData';
    }

    public function action_attributes() {
        return array(
            'list_id'    => array( 'default' => array() ),       // multi-select target
            'tag_ids'    => array( 'default' => array() ),       // multi-select tags
            'fields_map' => array( 'default' => array(           // fixed-key mapping
                'email'      => '',
                'first_name' => '',
                'last_name'  => '',
            ) ),
            'double_optin'         => array( 'default' => true ),
            'duplicate_message'    => array( 'default' => '' ),
        );
    }

    public function editor_labels() {
        return array(
            'list_id'    => __( 'Lists',        'myplugin' ),
            'tag_ids'    => __( 'Tags',         'myplugin' ),
            'fields_map' => __( 'Field map',    'myplugin' ),
            'email'      => __( 'Email field',  'myplugin' ),
            'first_name' => __( 'First name',   'myplugin' ),
            'last_name'  => __( 'Last name',    'myplugin' ),
        );
    }

    public function editor_labels_help() {
        return array(
            'email' => __( 'The form field that holds the subscriber email address.', 'myplugin' ),
        );
    }

    public function action_data() {
        // Pushed to JS as MyPluginSubscribeData (or whatever self_script_name returns).
        return array(
            'lists'    => $this->get_remote_lists(),
            'tags'     => $this->get_remote_tags(),
            'field_map' => array(
                array( 'key' => 'email',      'label' => __( 'Email field',      'myplugin' ), 'required' => true ),
                array( 'key' => 'first_name', 'label' => __( 'First name field', 'myplugin' ) ),
                array( 'key' => 'last_name',  'label' => __( 'Last name field',  'myplugin' ) ),
            ),
        );
    }

    public function do_action( array $request, Action_Handler $handler ) {
        $email = $this->get_mapped_value( 'email', $request );
        if ( ! is_email( $email ) ) {
            throw new Action_Exception( 'failed', __( 'A valid email is required.', 'myplugin' ) );
        }

        $payload = array(
            'email'      => $email,
            'first_name' => $this->get_mapped_value( 'first_name', $request ),
            'last_name'  => $this->get_mapped_value( 'last_name', $request ),
            'lists'      => (array) ( $this->settings['list_id'] ?? array() ),
            'tags'       => (array) ( $this->settings['tag_ids'] ?? array() ),
        );

        $result = $this->call_remote_api( $payload );
        if ( is_wp_error( $result ) ) {
            throw new Action_Exception( 'failed', $result->get_error_message() );
        }

        // Hand off to later actions if useful.
        $handler->add_context_once( array(
            'subscriber_id' => $result['id'] ?? '',
        ) );
    }

    private function get_mapped_value( string $key, array $request ): string {
        $map      = (array) ( $this->settings['fields_map'] ?? array() );
        $field_id = (string) ( $map[ $key ] ?? '' );
        if ( '' === $field_id ) {
            return '';
        }
        $value = $request[ $field_id ] ?? '';
        if ( is_array( $value ) ) {
            $value = reset( $value ) ?: '';
        }
        return is_scalar( $value ) ? (string) $value : '';
    }
}
```

Required methods: `get_id`, `get_name`, `do_action`. Strongly recommended: `action_attributes`, `editor_labels`, `self_script_name`. Optional: `action_data`, `editor_labels_help`, `dependence`, `unsupported_events`.

`get_id()` MUST be a stable, unique slug — changing it after release strands all existing user configurations. Treat it as a public identifier.

## Step 2 — PHP: register the action

```php
add_action(
    'jet-form-builder/actions/register',
    function ( $manager ) {
        $manager->register_action_type( new \MyPlugin\Actions\SubscribeAction() );
    }
);
```

The hook fires once per request at `init` priority 99 with a `Jet_Form_Builder\Actions\Manager` instance. Don't store the action somewhere else — register it here and let JFB own the lifecycle.

## Step 3 — PHP: enqueue the action editor JS

```php
add_action(
    'jet-form-builder/editor-assets/before',
    function () {
        $handle = 'myplugin-action-editor';

        $dependencies = array(
            'jet-fb-components', // exposes window.jfb.components and window.jfb.blocksToActions
            'wp-element',        // React via @wordpress/element
            'wp-components',     // SelectControl, TextControl, ToggleControl, etc.
            'wp-i18n',
        );

        // JFB v2 action editor handles. Conditionally added — they are
        // only registered when the modern action editor is active.
        // Without these, your script can race the modern API and run
        // before window.jfb.actions is populated, causing dual-registration
        // failures and editor crashes (the JSON.parse "[object Object]"
        // error in form.builder.js's _jf_gateways meta state is a known
        // symptom).
        foreach ( array( 'jet-fb-actions-v2', 'jet-fb-blocks-v2-to-actions-v2' ) as $maybe_dep ) {
            if ( wp_script_is( $maybe_dep, 'registered' ) ) {
                $dependencies[] = $maybe_dep;
            }
        }

        wp_enqueue_script(
            $handle,
            plugins_url( 'assets/js/action-editor.js', __FILE__ ),
            $dependencies,
            '1.0.0',
            true
        );

        if ( function_exists( 'wp_set_script_translations' ) ) {
            wp_set_script_translations( $handle, 'myplugin' );
        }
    }
);
```

`jet-fb-components` is the script handle that exposes `window.jfb.blocksToActions.useFields()`, `window.jfb.components.*`, and `window.JetFBActions.addAction()`. Always declare it.

`jet-fb-actions-v2` and `jet-fb-blocks-v2-to-actions-v2` are the modern action editor v2 handles. They are only registered on JFB versions that ship the v2 editor. Add them conditionally with `wp_script_is( $handle, 'registered' )` — never declare them unconditionally, because on older JFB versions they don't exist and the dependency will silently break script loading.

## Step 4 — JS: register the action editor

JFB has **two action registration APIs** in the wild and both can be present at the same time:

- **Modern**: `window.jfb.actions.registerAction({ type, edit, ...config })` — the v2 action editor.
- **Legacy**: `window.JetFBActions.addAction( type, component, config )` — the older wp.data-store-driven flow, plus `wp.data.dispatch('jet-forms/actions').registerAction(...)` for category/docHref metadata.

**Critical rule: register through ONE path only — never both.** Calling `addAction()` AND `wp.data.dispatch('jet-forms/actions').registerAction(...)` AND `jfb.actions.registerAction(...)` together corrupts the editor's data store and produces baffling failures (the `JSON.parse "[object Object]"` crash on `_jf_gateways` meta in `form.builder.js` is a known symptom of dual registration on JFB versions where both APIs co-exist).

The recommended pattern is a **wrapper that prefers modern, falls back to legacy**:

```js
( function registerMyPluginAction( wp, JetFBActions, actionData, jfb ) {
    if ( ! wp ) {
        return;
    }

    const hasModernAction = jfb?.actions && typeof jfb.actions.registerAction === 'function';
    const hasLegacyAction = JetFBActions && typeof JetFBActions.addAction === 'function';

    if ( ! hasModernAction && ! hasLegacyAction ) {
        // Neither API available — JFB editor not loaded. Fail silently.
        return;
    }

    const addAction = hasLegacyAction
        ? JetFBActions.addAction.bind( JetFBActions )
        : () => {};

    const { Fragment, createElement } = wp.element;
    const { __ } = wp.i18n;
    const { TextControl, ToggleControl, Button, Notice } = wp.components;

    const useFields     = jfb?.blocksToActions?.useFields;
    const jfbComponents = jfb?.components || {};

    // ONE entry point that picks the right API at runtime.
    const registerAction = ( type, component, config ) => {
        if ( hasModernAction ) {
            jfb.actions.registerAction( {
                type,
                edit: component,
                ...config,
            } );
            return;
        }
        addAction( type, component, config );
    };

    function MyPluginSubscribeEdit( props ) {
        const { settings = {}, onChangeSetting, label } = props;
        const data      = actionData || {};
        const fieldOpts = useFields ? useFields( { withInner: false, placeholder: '--' } ) : [];

        // ... field mapping, multi-select, etc. (Step 5)

        return createElement( Fragment, null /* children */ );
    }

    registerAction(
        'myplugin_subscribe', // MUST match get_id() in PHP
        MyPluginSubscribeEdit,
        {
            category:      'communication',
            docHref:       'https://example.com/docs/myplugin-subscribe',
            provideEvents: () => [ 'MYPLUGIN.SUCCESS', 'MYPLUGIN.FAILURE' ], // see jfb-action-events
        }
    );
}( window.wp || false, window.JetFBActions || false, window.MyPluginSubscribeData || {}, window.jfb || {} ) );
```

Notes on the wrapper:

- The IIFE pattern (immediate-invocation with `window.*` arguments) keeps the module self-contained and lets any of the dependencies be missing without throwing — important because `window.jfb` and `window.JetFBActions` may be undefined on older JFB versions or if the editor failed to load.
- `hasModernAction` and `hasLegacyAction` are checked once; the wrapper picks one path and never switches mid-call.
- The modern API wraps the component in `edit`, the legacy passes it positionally — abstract this away in the wrapper so the rest of your code is API-agnostic.
- **Don't add a separate `wp.data.dispatch('jet-forms/actions').registerAction(...)` call alongside this**. Older skills suggested it as a "data store mirror" — that advice is obsolete and creates the dual-registration bug. The modern API handles store registration internally; the legacy path's `addAction` is sufficient on its own.

If neither API is available (`! hasModernAction && ! hasLegacyAction`), your script is loaded but the JFB editor isn't — bail silently. Don't render an error UI.

## Step 5 — Field mapping: pick the right pattern

Two patterns are common and serve different needs.

### 5a. Fixed-key mapping (preferred when target schema is known)

Use when your integration has a fixed set of target fields (CRM with first_name/last_name/email/phone). The user maps form fields to these named slots.

```js
const fieldMapDef = data.field_map || []; // from PHP action_data()
const currentMap  = settings.fields_map || {};

const handleMap = ( key, value ) => {
    onChangeSetting( { ...currentMap, [ key ]: value }, 'fields_map' );
};

// JFB ships an optional table layout — check if available, fall back to plain controls.
const Table = jfbComponents.TableListContainer;
const Head  = jfbComponents.TableListHead;
const Row   = jfbComponents.TableListRow;

const renderRows = fieldMapDef.map( ( def ) =>
    el( Row, {
        key:        def.key,
        tag:        def.key,
        label:      def.label,
        help:       def.help,
        isRequired: !! def.required,
    },
        ( ) => el( StyledSelect, {
            value:    currentMap[ def.key ] || '',
            options:  fieldOpts,
            onChange: ( v ) => handleMap( def.key, v ),
        } )
    )
);

const fixedMapUI = ( Table && Head && Row )
    ? el( Table, null,
        el( Head, { columns: [ __( 'Target field', 'myplugin' ), __( 'Form field', 'myplugin' ) ] } ),
        renderRows
      )
    : el( Fragment, null,
        fieldMapDef.map( ( def ) =>
            el( StyledSelect || 'select', {
                key:      def.key,
                label:    def.label,
                value:    currentMap[ def.key ] || '',
                options:  fieldOpts,
                onChange: ( v ) => handleMap( def.key, v ),
            } )
        )
      );
```

PHP shape: `'fields_map' => [ 'email' => 'form_email_id', 'first_name' => 'form_fname_id', ... ]`.

### 5b. Dynamic "Add row" mapping (use when the target schema is open-ended)

Use when the target system has arbitrary columns / properties and the user picks both sides — e.g. Google Sheets where the user types arbitrary column names.

```js
const rows = Array.isArray( settings.field_map ) ? settings.field_map : [];

const updateRow = ( i, key, value ) => {
    onChangeSetting(
        rows.map( ( r, idx ) => idx === i ? { ...r, [ key ]: value } : r ),
        'field_map'
    );
};
const addRow = () => onChangeSetting(
    rows.concat( [ { column_header: '', form_field: '' } ] ),
    'field_map'
);
const removeRow = ( i ) => onChangeSetting(
    rows.filter( ( _, idx ) => idx !== i ),
    'field_map'
);

const dynamicMapUI = el( 'div', { className: 'myplugin-mapping' },
    rows.map( ( row, i ) => el( 'div', { key: i, className: 'myplugin-mapping-row' },
        el( TextControl, {
            label:    __( 'Column', 'myplugin' ),
            value:    row.column_header,
            onChange: ( v ) => updateRow( i, 'column_header', v ),
        } ),
        el( StyledSelect || 'select', {
            label:    __( 'Form field', 'myplugin' ),
            value:    row.form_field,
            options:  fieldOpts,
            onChange: ( v ) => updateRow( i, 'form_field', v ),
        } ),
        el( Button, {
            isDestructive: true,
            isSmall:       true,
            onClick:       () => removeRow( i ),
        }, __( 'Remove', 'myplugin' ) )
    ) ),
    el( Button, { variant: 'secondary', onClick: addRow },
        __( 'Add row', 'myplugin' )
    )
);
```

PHP shape: `'field_map' => [ [ 'column_header' => 'Email',  'form_field' => 'email_field_id' ], ... ]`.

### 5c. Multi-select (lists, tags, channels)

For multi-value selects (e.g. CRM lists or tags), use JFB's `FormLabeledTokenField` if available, fall back to `SelectControl` with `multiple: true`.

```js
const lists           = data.lists || []; // [{ value, label }]
const selectedListIds = ( settings.list_id || [] ).map( String );

// FormLabeledTokenField (JFB-shipped) handles value↔label translation
// internally: pass IDs as `value`, pass {value, label} objects as
// `suggestions`, and onChange receives IDs back. This is unlike the
// standard @wordpress/components FormTokenField, which is string-only.
const handleListTokens = ( tokens ) => {
    onChangeSetting( ( tokens || [] ).map( String ), 'list_id' );
};

const listsUI = FormLabeledTokenField
    ? el( FormLabeledTokenField, {
        label:                          __( 'Lists', 'myplugin' ),
        value:                          selectedListIds,
        suggestions:                    lists, // array of { value, label }
        onChange:                       handleListTokens,
        __experimentalExpandOnFocus:    true,
      } )
    : el( StyledSelect || 'select', {
        label:    __( 'Lists', 'myplugin' ),
        value:    selectedListIds,
        options:  lists,
        multiple: true,
        onChange: ( v ) => onChangeSetting( ( v || [] ).map( String ), 'list_id' ),
      } );
```

`FormLabeledTokenField` is a token (chip) input that feels native in Gutenberg admin. Note its API differs from the standard `@wordpress/components/FormTokenField`: the labeled variant accepts `{ value, label }` suggestions and translates between displayed labels and stored IDs internally — you store IDs, the user sees labels. The fallback path uses the plain string-based `SelectControl`. Always include the fallback; the `FormLabeledTokenField` component is shipped by JFB and not guaranteed across versions.

## `useFields` — the form fields hook

`window.jfb.blocksToActions.useFields( opts )` is a React hook returning the form's current fields as `[ { value, label }, ... ]`, suitable for any select control. Common options:

- `withInner` (boolean) — include nested fields (repeater children, etc.). Default: depends on JFB version; pass explicitly.
- `placeholder` (string) — first option label, e.g. `'--'`. If passed, prepends `{ value: '', label: placeholder }`.

There is no REST call here; it's local React state derived from the editor's current form blocks. The hook re-runs when fields change, so the dropdown reflects edits in real time.

## `provideEvents` — advertise custom events the action dispatches

If your action dispatches custom JFB events (defined per the **`jfb-action-events`** skill via the `'jet-form-builder/event-types'` filter), you MUST advertise them in the JS registration. Otherwise the events exist in the global registry but are invisible in the per-action event picker — meaning no admin can wire any action to them.

Pass `provideEvents` in the same `config` object you give the `registerAction` wrapper (Step 4):

```js
registerAction(
    'myplugin_subscribe',
    Component,
    {
        category:      'communication',
        docHref:       'https://example.com/docs/subscribe',
        provideEvents: ( settings ) => [
            'MYPLUGIN.SUCCESS',
            'MYPLUGIN.ALREADY_EXISTS',
        ],
    }
);
```

The callback receives the action's current settings — return a different list per configuration if needed (e.g. only advertise `'MYPLUGIN.FAILURE'` when error notifications are enabled). The wrapper passes this through to whichever underlying API is active (`jfb.actions.registerAction` or `JetFBActions.addAction`); both honour `provideEvents`. See **`jfb-action-events`** for the full visibility model (always / gateway / dynamic / provided).

## Category and doc link — community convention, not PHP API

The `category` and `docHref` properties passed in the registration config are **JS-only conventions** consumed by JFB's action picker UI for grouping and rendering a help icon. They are **not exposed by the PHP `Base` class** — there is no `get_category()` or `get_doc_link()` method. The Fluent CRM plugin pioneered this; if you follow the same shape, your action will group and link consistently with theirs.

```js
registerAction( 'myplugin_subscribe', Component, {
    category: 'communication', // free-form; common values: 'communication', 'integration', 'advanced', 'utility'
    docHref:  'https://example.com/docs/...',
} );
```

**Do NOT add a separate `wp.data.dispatch('jet-forms/actions').registerAction(...)` call alongside this.** Older versions of this skill recommended that pattern as a "data store mirror", but on JFB versions that ship the modern `jfb.actions.registerAction` API, the dual call corrupts the editor's data store and triggers `JSON.parse "[object Object]"` failures in `form.builder.js`. The wrapper from Step 4 already routes to whichever API is available, and that single call is enough — both APIs internally write to the data store.

Don't push category/docHref into PHP `action_data()` expecting JFB to render it — there's no consumer there. Keep it JS-side.

## Native components and JFB-shipped helpers

Use these directly:

| Source | Component | Purpose |
|---|---|---|
| `@wordpress/components` | `TextControl`, `TextareaControl`, `ToggleControl`, `CheckboxControl`, `SelectControl`, `RadioControl`, `RangeControl`, `Button`, `Notice`, `PanelBody`, `Spinner` | Standard Gutenberg controls — the same set as `jfb-form-sidebar-panel`. |
| `window.jfb.components` | `StyledSelect` | Styled wrapper around `SelectControl` matching JFB action editor look. |
| `window.jfb.components` | `FormLabeledTokenField` | Token / chip input for multi-value selects. |
| `window.jfb.components` | `TableListContainer`, `TableListHead`, `TableListRow`, `TableListStyle` | Table layout helpers for fixed-key mapping. |
| `window.jfb.blocksToActions` | `useFields` | React hook returning the form's current fields. |
| `window.jfb.actions` | `registerAction({ type, edit, ...config })` | **Modern** action registration API. Single object argument with `edit` for the component. |
| `window.JetFBActions` | `addAction( type, component, config )` | **Legacy** action registration API. Positional args. Use the wrapper from Step 4 to bridge both. |

Always check existence before using JFB-shipped components — they are not part of a documented stable contract, and a future JFB version may move them. A graceful fallback to `wp.components` keeps the editor usable across versions.

## Error handling: `Action_Exception`

Throw from `do_action()` to halt the action chain and surface a message to the user:

```php
throw new \Jet_Form_Builder\Exceptions\Action_Exception( 'failed', __( 'CRM unreachable. Try again later.', 'myplugin' ) );
```

The first argument is a stable code (used for conditional logic / logging), the second is the user-facing message (translatable). The handler catches the exception, marks the action as failed, includes the message in the form response, and stops processing further actions.

For non-fatal issues (e.g. "user already subscribed — that's fine"), don't throw; just `return` from `do_action()` after writing context.

## Action context: passing data between actions

```php
$handler->add_context_once( array( 'subscriber_id' => 42 ) );
```

Later actions in the chain (or follow-up handlers) read this via:

```php
$id = $handler->get_action_handler_context( 'myplugin_subscribe' )['subscriber_id'] ?? null;
// or via the helper
$id = jet_fb_action_handler()->get_inserted_post_id(); // for built-in patterns
```

Use this when one action's output is another's input (e.g. "Insert Post" → ID → "Send Email" with the post URL).

## Storage: `_jf_actions` post meta

JFB persists all of a form's actions under one post-meta key on the form CPT (`jet-form-builder`):

```
post_id  | meta_key      | meta_value (JSON-encoded)
123      | _jf_actions   | [ { "id": 0, "type": "send_email", "settings": {...} },
                              { "id": 1, "type": "myplugin_subscribe", "settings": {...} } ]
```

You don't need to read or write this directly — JFB handles the round-trip. If you need to programmatically configure an action (e.g. for a setup wizard), update this meta value via the standard post meta API.

## Critical rules

- **`get_id()` is a public identifier** — never change it after release. Migrating users to a new ID requires writing a meta upgrader.
- **Register on `'jet-form-builder/actions/register'`**, not on `init` directly. The Manager isn't ready earlier.
- **`do_action()` is request-scoped** — don't cache state on `$this` between submissions. Each form submit instantiates fresh.
- **Throw `Action_Exception`** for halting errors. Never `wp_die()` or `exit` from `do_action()` — you'll break the JFB response handling.
- **`add_context_once` over `add_context`** when writing data for downstream actions — prevents accidental overwrites if your action somehow runs twice.
- **Fixed-key vs dynamic mapping**: don't mix shapes. Pick one based on whether the target schema is known and stable.
- **`useFields` hook** must be called inside the component render, not at module top level — it's a React hook.
- **`category` and `docHref` live in JS only** — don't try to surface them through the PHP API.
- **Always provide `self_script_name()`** if you call `wp_localize_script` with action data — the name must be unique across all actions on the page.
- **`is_email()`, `absint()`, `sanitize_text_field()`** — sanitize values inside `do_action()` before passing to APIs. The form data is post-validation by JFB but post-validation ≠ post-sanitization for your specific target.
- **Register through ONE API only** — modern `jfb.actions.registerAction` OR legacy `JetFBActions.addAction`, never both, and never duplicate via `wp.data.dispatch('jet-forms/actions').registerAction`. Use the wrapper from Step 4 to make a single call route to the right path. Dual registration corrupts the editor's data store on JFB versions that ship both APIs.
- **Conditionally depend on `jet-fb-actions-v2` and `jet-fb-blocks-v2-to-actions-v2`** in `wp_enqueue_script` — only when `wp_script_is($handle, 'registered')` confirms the modern editor is present. Hard-coding these as unconditional dependencies breaks on older JFB versions that don't ship them.

## Common pitfalls (failure modes inferred from the API contract)

- **Action doesn't appear in the action picker**: editor JS not enqueued (check `'jet-form-builder/editor-assets/before'` hook), OR registration ID doesn't match `get_id()`, OR neither `window.jfb.actions` nor `window.JetFBActions` is available (missing `jet-fb-components` and/or `jet-fb-actions-v2` dependency).
- **`JSON.parse "[object Object]"` crash in `form.builder.js` (the `_jf_gateways` meta state)**: classic symptom of dual action registration on JFB versions that ship both the modern and legacy APIs. Calling `addAction()` AND `wp.data.dispatch('jet-forms/actions').registerAction(...)` at the same time corrupts the data store. Switch to the single-call wrapper from Step 4.
- **Settings don't save**: action ID mismatch between PHP and JS, OR `onChangeSetting` called with the wrong key name (must match `action_attributes()` keys).
- **`useFields` returns empty**: called outside a React render, OR the form has no field blocks yet.
- **Form submit silently fails after adding the action**: thrown `Action_Exception` not caught — verify the namespace import. Or you're throwing a generic `Exception` instead of `Action_Exception`, which JFB doesn't translate to user-facing.
- **Multi-select stores wrong values**: when using the plain `@wordpress/components/FormTokenField` (string-based), `onChange` receives displayed labels, not IDs — translate manually. JFB's `FormLabeledTokenField` handles the translation internally and returns IDs directly (verified by production usage in `fluent-subscriptions-for-jetformbuilder`).
- **Field mapping resets on every load**: `action_attributes()` `default` is wrong shape (e.g. returning `''` for an array key).
- **Editor crashes only on certain forms / certain actions**: race condition. Your script ran before the v2 action editor was ready. Add `jet-fb-actions-v2` and `jet-fb-blocks-v2-to-actions-v2` as conditional dependencies (Step 3) so wp_enqueue_script defers loading.

## Cross-references

- Run **`jfb-form-sidebar-panel`** when the plugin also needs per-form settings outside of any action (e.g. media-storage's storage targets) — different subsystem.
- Run **`jfb-settings-tab`** for site-wide settings (API keys, defaults). Most action plugins have all three: a global tab for credentials, a sidebar panel for per-form overrides if any, and the action itself.
- Run **`wp-security-audit`** on `do_action()` — it processes user-submitted data and calls remote APIs. SSRF, sanitize, capability are all relevant.
- Run **`wp-security-secrets`** when API credentials are stored — never hardcode, never commit, prefer `wp-config.php` constants or capability-gated options.
- Run **`wp-i18n-audit`** on PHP labels and JS strings.

## What this skill does NOT cover

- The action's *event* model (`form_submit_event`, `gateway_failed_event`, etc.) — actions can declare which events they support; this skill assumes the default submit event.
- Actions that integrate with JFB's payment gateways subsystem — that's a separate API on top of actions.
- Conditional execution rules (the "execute only if X" UI on each action) — handled by JFB core, not the action class.
- Background / queued execution. Out of the box, actions run synchronously inside the submit request.
- Writing JFB CORE actions inside the JFB plugin itself (different namespacing rules).

## References

- Base class: `wp-content/plugins/jetformbuilder/includes/actions/types/base.php`
- Manager and registration hook: `wp-content/plugins/jetformbuilder/includes/actions/manager.php`
- Action handler / execution loop: `wp-content/plugins/jetformbuilder/includes/actions/action-handler.php`
- Built-in `Send_Email` example: `wp-content/plugins/jetformbuilder/modules/actions-v2/send-email/send-email-action.php`
- Dynamic-mapping reference (Google Sheets):
  `wp-content/plugins/google-sheet-for-jetformbuilder/includes/Action/GoogleSheetAction.php`
  `wp-content/plugins/google-sheet-for-jetformbuilder/assets/js/action-editor.js`
- Fixed-mapping + multi-select + category/docHref reference (Fluent CRM):
  `wp-content/plugins/fluent-subscriptions-for-jetformbuilder-main/src/Actions/FluentCrmSubscribeAction.php`
  `wp-content/plugins/fluent-subscriptions-for-jetformbuilder-main/assets/js/editor-action.js`
- WP component catalog: https://developer.wordpress.org/block-editor/reference-guides/components/
