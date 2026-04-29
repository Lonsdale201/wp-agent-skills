---
name: jfb-form-sidebar-panel
description: Adds a per-form settings panel to the JetFormBuilder
  Gutenberg form editor sidebar — registers REST-exposed post meta
  on the form CPT, enqueues a block-editor JS bundle, and registers
  a panel via the JFB-specific 'jet.fb.register.plugins' filter
  using @wordpress/components (TextControl, SelectControl, ToggleControl)
  and JFB's useMetaState hook for two-way binding to post meta. Use
  when a companion plugin needs settings that vary per form (e.g.
  upload folder, file size limit, integration target) instead of
  (or in addition to) site-wide defaults from the global Settings
  page. Triggers on mentions of "JFB form sidebar", "JFB form
  settings panel", "form-level settings", "useMetaState",
  "jet.fb.register.plugins", "jet-form-builder/editor-assets/before",
  or scaffolding a JFB companion plugin that needs per-form config.
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
  - https://developer.wordpress.org/reference/functions/register_post_meta/
source-refs:
  - modules/post-type/module.php
  - modules/post-type/meta/base-meta-type.php
  - includes/admin/editor.php
---

# JetFormBuilder: form-level settings panel in the Gutenberg sidebar

JetFormBuilder forms are stored as a custom post type (`jet-form-builder`) edited in the standard Gutenberg block editor. Companion plugins add **per-form settings** by injecting a panel into the editor's document sidebar — the panel reads and writes post meta on the form, so each form gets its own configuration independently of the plugin's global Settings page.

This skill covers that subsystem. It is **distinct** from the global plugin Settings page covered in the **`jfb-settings-tab`** skill — that one uses Vue + `cx-vui` components, this one uses WordPress packages (`@wordpress/components`, React under the hood) and standard post-meta REST exposure.

A typical JFB companion plugin (e.g. `media-storage-for-jetformbuilder`) ships **both**: a global tab for site-wide defaults, and a per-form sidebar panel for overrides. See the *Dual-mode pattern* section below.

## API stability note

The `register_post_meta` + REST exposure pattern is standard WordPress and stable since WP 4.9. The JFB-specific pieces — the `'jet-form-builder/editor-assets/before'` PHP action, the `'jet.fb.register.plugins'` JS filter, and the `useMetaState` hook exposed on `window.JetFBHooks` — are stable across the JFB 3.x line in the source observed. The `plugin-version-tested` field records last end-to-end verification only.

## When to use this skill

- A JFB companion plugin needs settings that differ between forms.
- The user asks how to add a sidebar panel to the JFB form editor.
- The diff/files contain `register_post_meta` for the `jet-form-builder` post type, `jet.fb.register.plugins`, `jet-form-builder/editor-assets/before`, or `useMetaState`.

## Architecture in one paragraph

The JFB form CPT (`jet-form-builder`) registers post meta keys with `'show_in_rest' => true` and an `auth_callback`, making them readable and writable through the WordPress REST API. The Gutenberg post editor automatically syncs registered REST meta with its data store, so any UI bound to that meta auto-saves when the user clicks "Update". JFB exposes a JS filter `'jet.fb.register.plugins'` that collects panel definitions, each containing a render function. Inside the render function, the panel calls JFB's `useMetaState` hook (a thin wrapper around Gutenberg's `useEntityProp`) to bind component state to a meta key, then renders WP standard form controls.

## Step 1 — PHP: register the post meta

```php
<?php
namespace MyPlugin\FormSettings;

class FormMeta {

    const FORM_CPT = 'jet-form-builder';
    const META_KEY = '_myplugin_form_settings';

    public function register() {
        add_action( 'init', array( $this, 'register_meta' ) );
    }

    public function register_meta() {
        register_post_meta(
            self::FORM_CPT,
            self::META_KEY,
            array(
                'type'              => 'string',
                'single'            => true,
                'default'           => wp_json_encode( $this->defaults() ),
                'show_in_rest'      => array(
                    'schema' => array( 'type' => 'string' ),
                ),
                'auth_callback'     => static function ( $allowed, $meta_key, $post_id, $user_id ) {
                    return user_can( $user_id, 'edit_post', $post_id );
                },
                'sanitize_callback' => array( $this, 'sanitize' ),
            )
        );
    }

    public function defaults() {
        return array(
            'enabled'         => false,
            'target_folder'   => '',
            'max_filesize_mb' => null,
        );
    }

    public function sanitize( $raw ) {
        $decoded = json_decode( (string) $raw, true );
        if ( ! is_array( $decoded ) ) {
            return wp_json_encode( $this->defaults() );
        }
        // Coerce types per known schema.
        $clean = array(
            'enabled'         => ! empty( $decoded['enabled'] ),
            'target_folder'   => sanitize_text_field( $decoded['target_folder'] ?? '' ),
            'max_filesize_mb' => isset( $decoded['max_filesize_mb'] )
                ? (float) $decoded['max_filesize_mb']
                : null,
        );
        return wp_json_encode( $clean );
    }
}
```

Critical points:

- **Use post-level `auth_callback`**. The signature is `( $allowed, $meta_key, $post_id, $user_id )` — call `user_can( $user_id, 'edit_post', $post_id )`. This matches what JFB core itself does and scopes access correctly. **Avoid** the simpler `current_user_can( 'edit_posts' )` shortcut: it's a global capability check and lets any post-editor write meta on any form, which is over-permissive.
- **Store one JSON blob per feature**, not separate meta keys per field. JFB core does this (`_jf_args`, `_jf_messages`, `_jf_actions`, etc.) and the convention keeps the `wp_postmeta` table sane and the REST schema simple.
- **Always provide `sanitize_callback`** that decodes, type-coerces, and re-encodes. The REST API will accept whatever string the client sends — your sanitizer is the gate.
- **`type: 'string'`** is intentional. Even though the data is structurally an object, you store it as a JSON-encoded string; if you set `type: 'object'` you have to declare a full JSON schema and the `default` handling becomes awkward.

## Step 2 — PHP: enqueue the editor assets

JFB fires `'jet-form-builder/editor-assets/before'` when the form editor loads its scripts. Hook into this rather than `enqueue_block_editor_assets` directly — it ensures your bundle loads in the right order, after JFB's own data module is registered.

```php
add_action(
    'jet-form-builder/editor-assets/before',
    function () {
        $handle = 'myplugin-form-editor';

        wp_enqueue_script(
            $handle,
            plugins_url( 'assets/js/form-editor.js', __FILE__ ),
            array(
                'wp-hooks',
                'wp-element',
                'wp-components',
                'wp-data',
                'wp-i18n',
                'jet-fb-data', // exposes window.JetFBHooks (incl. useMetaState)
            ),
            '1.0.0',
            true
        );

        if ( function_exists( 'wp_set_script_translations' ) ) {
            wp_set_script_translations( $handle, 'myplugin' );
        }

        // Pass site-wide defaults and labels to the panel.
        wp_localize_script(
            $handle,
            'MyPluginFormPanel',
            array(
                'metaKey'        => '_myplugin_form_settings',
                'globalDefaults' => array(
                    'max_filesize_mb' => (float) get_option( 'myplugin_max_filesize_mb', 0 ),
                ),
                'labels'         => array(
                    'panelTitle' => __( 'My Plugin', 'myplugin' ),
                    'enabled'    => __( 'Enable for this form', 'myplugin' ),
                    'folder'     => __( 'Target folder', 'myplugin' ),
                    'filesize'   => __( 'Max file size (MB)', 'myplugin' ),
                ),
            )
        );
    }
);
```

The `jet-fb-data` script handle is what exposes `window.JetFBHooks.useMetaState`. Declare it as a dependency even though JFB usually loads it first — the dependency is the contract.

## Step 3 — JS: register the sidebar panel

```js
import { addFilter } from '@wordpress/hooks';
import { __ } from '@wordpress/i18n';
import { Fragment, createElement as el } from '@wordpress/element';
import { ToggleControl, TextControl, RangeControl, Notice } from '@wordpress/components';

const { metaKey, globalDefaults, labels } = window.MyPluginFormPanel || {};
const useMetaState = window.JetFBHooks && window.JetFBHooks.useMetaState;

if ( ! useMetaState ) {
    // JFB data module not loaded — fail silently rather than crashing the editor.
    return;
}

function MyPluginPanel() {
    const [ raw, setRaw ] = useMetaState( metaKey, '{}', [] );

    const state = ( () => {
        try { return JSON.parse( raw ); } catch ( e ) { return {}; }
    } )();

    const update = ( patch ) => {
        setRaw( JSON.stringify( { ...state, ...patch } ) );
    };

    return el( Fragment, null,
        el( ToggleControl, {
            label:    labels.enabled,
            checked:  !! state.enabled,
            onChange: ( v ) => update( { enabled: v } ),
        } ),
        el( TextControl, {
            label:    labels.folder,
            value:    state.target_folder || '',
            onChange: ( v ) => update( { target_folder: v } ),
            disabled: ! state.enabled,
        } ),
        el( RangeControl, {
            label:    labels.filesize,
            value:    state.max_filesize_mb ?? globalDefaults.max_filesize_mb,
            min:      0,
            max:      500,
            step:     0.5,
            onChange: ( v ) => update( { max_filesize_mb: v } ),
            help:     state.max_filesize_mb == null && globalDefaults.max_filesize_mb > 0
                ? __( 'Using global default. Change here to override.', 'myplugin' )
                : undefined,
        } )
    );
}

addFilter(
    'jet.fb.register.plugins',
    'myplugin/form-panel',
    ( plugins = [] ) => {
        const def = {
            base: {
                name:  'myplugin-form-panel',
                title: labels.panelTitle,
            },
            settings: {
                icon:   'admin-generic',
                render: MyPluginPanel,
            },
        };

        // Idempotency guard — addFilter callbacks can run more than once.
        if ( ! plugins.some( ( p ) => p.base.name === def.base.name ) ) {
            plugins.push( def );
        }
        return plugins;
    }
);
```

## `useMetaState` — what it actually does

`useMetaState( metaKey, defaultValue, deps )` is a JFB-specific React hook exposed at `window.JetFBHooks.useMetaState`. It wraps `useEntityProp` from `@wordpress/core-data` to bind a component to a single post-meta key on the currently-edited post. It returns `[ value, setValue ]` like `useState`, but writes go through the WP data store and trigger Gutenberg's "post is dirty" indicator, so saving is automatic on the next "Update" click.

Treat the value as an opaque string in the hook layer; parse JSON in your component, write JSON back via `setValue( JSON.stringify( ... ) )`. Wrapping `JSON.parse` in try/catch is mandatory — corrupt or partially-saved meta should not crash the editor.

If `window.JetFBHooks.useMetaState` is undefined (JFB data module failed to load, version mismatch, etc.), the panel must fail silently. Don't throw, don't render an error UI inside the editor — that just confuses the user.

## Native components — use these 1:1

These are from `@wordpress/components` and work without modification in the JFB sidebar context. **They are not the same as the `cx-vui-*` set** used in the global Settings page.

| Component | Purpose | Common props |
|---|---|---|
| `TextControl` | Single-line text input | `label`, `value`, `onChange`, `help`, `placeholder`, `disabled` |
| `TextareaControl` | Multi-line text | `label`, `value`, `onChange`, `rows`, `help` |
| `ToggleControl` | Boolean on/off | `label`, `checked`, `onChange`, `help` |
| `CheckboxControl` | Boolean checkbox | `label`, `checked`, `onChange` |
| `SelectControl` | Dropdown | `label`, `value`, `options: [{ label, value }]`, `onChange` |
| `RadioControl` | Radio group | `label`, `selected`, `options`, `onChange` |
| `RangeControl` | Numeric slider | `label`, `value`, `min`, `max`, `step`, `onChange` |
| `Notice` | Inline alert / info | `status: 'info' \| 'warning' \| 'error' \| 'success'`, `isDismissible` |
| `PanelBody` | Collapsible section inside a panel | `title`, `initialOpen` |
| `Button` | Action button | `variant: 'primary' \| 'secondary' \| 'tertiary'`, `onClick` |
| `Spinner` | Loading indicator | (no props) |

The full component catalog is on the WordPress block editor handbook page; the list above is the subset confirmed in the wild for JFB sidebar panels.

## Beyond the native set — "hack zone"

`@wordpress/components` covers most form UI needs. If you need something not in the table:

### Preferred: compose existing components

Most "complex" UI (a key/value pair editor, a list of items, a conditional reveal) is just a loop of `TextControl` + `Button` inside a `PanelBody`. Compose first.

### Acceptable: bundle your own React component

For genuinely custom UI (a code editor, a JSON tree view, an OAuth-aware connector card) use `@wordpress/element` (which is React under another name) and write your own component. Keep it inside your plugin's bundle.

### Avoid: Vue or cx-vui inside the sidebar

The JFB sidebar is React. Don't try to mount Vue components or pull in `cx-vui-*` here — that's the global Settings page world. Mixing the two breaks reactivity and confuses users.

### Avoid: directly mutating Gutenberg state

Always go through `useMetaState` (or `useEntityProp` if you have a reason). Calling `wp.data.dispatch( 'core/editor' ).editPost(...)` directly works but bypasses the meta-key abstraction and makes save flow harder to reason about.

## Storage format — one JSON blob per feature

Per the JFB convention, store all your form-level config under **one** meta key as a JSON-encoded string. Concrete row in `wp_postmeta`:

```
post_id  | meta_key                   | meta_value
123      | _myplugin_form_settings    | {"enabled":true,"target_folder":"uploads","max_filesize_mb":50}
```

Don't split into `_myplugin_enabled`, `_myplugin_folder`, `_myplugin_filesize` etc. — that bloats `wp_postmeta`, multiplies REST schema entries, and complicates atomic saves.

## Dual-mode pattern: global default + per-form override

A common requirement: "if the form sets a value, use it; otherwise fall back to the plugin's site-wide setting." JFB does not provide a built-in merge utility — you implement it in your plugin's runtime code.

**The convention** observed in production companion plugins:

1. Global defaults live in the plugin Settings page (`jfb-settings-tab` skill), stored in `wp_options`.
2. Per-form overrides live in post meta, stored as JSON under a single key.
3. Both are passed to the panel JS via `wp_localize_script` — the global as `globalDefaults`, the meta key name as `metaKey`.
4. In the panel, when a per-form value is `null` / unset, render placeholder or help text showing the global default ("Using global default. Change here to override.").
5. On the **frontend** (form rendering / submission handler), implement the merge:

```php
function get_effective_setting( $form_id, $key ) {
    $form_raw  = get_post_meta( $form_id, '_myplugin_form_settings', true );
    $form_data = $form_raw ? json_decode( $form_raw, true ) : array();
    if ( isset( $form_data[ $key ] ) && $form_data[ $key ] !== null ) {
        return $form_data[ $key ];
    }
    return get_option( 'myplugin_' . $key );
}
```

Keep the merge logic in **one** function called from every consumer. Otherwise inevitably one consumer reads only the form meta, another reads only the global, and they drift.

## Critical rules

- **Register the post meta on `init`**, not earlier. The CPT must exist first.
- **`auth_callback` MUST do a post-level capability check** (`user_can( $user_id, 'edit_post', $post_id )`). The simpler `current_user_can( 'edit_posts' )` is a security loosening — flag it in security review.
- **`sanitize_callback` MUST validate the JSON shape**, not just run `wp_json_encode` on whatever came in. Anyone with edit-post capability on a form can write any string to the REST endpoint; your sanitizer is the schema gate.
- **Hook editor JS via `'jet-form-builder/editor-assets/before'`**, not `enqueue_block_editor_assets` directly. Otherwise `jet-fb-data` may not be loaded yet when your bundle runs.
- **Always declare `jet-fb-data` as a script dependency** if you use `useMetaState`. Without it, `window.JetFBHooks` may be undefined at first render.
- **Wrap `JSON.parse` in try/catch** in the panel — corrupt meta must not crash the editor.
- **Idempotency guard** in the `addFilter` callback (`plugins.some( p => p.base.name === ... )`). Filter callbacks can fire multiple times during HMR / hot reloads.
- **One JSON blob per feature**, not many small meta keys.
- **Fail silently** if `useMetaState` is missing, don't render error UI inside the editor.

## Common pitfalls (failure modes inferred from the API contract)

- **Panel doesn't appear**: check that the script is enqueued (Network tab), `jet-fb-data` is loaded before it (script order), and the filter name is exact (`'jet.fb.register.plugins'` — note dots).
- **Values don't save**: meta key not registered with `show_in_rest`, OR `auth_callback` returns false for the current user, OR `sanitize_callback` rejects the payload silently.
- **Values save but don't reload**: `default` is malformed JSON, so initial parse throws and the panel renders defaults each time.
- **Panel renders, but `useMetaState` is undefined**: missing `jet-fb-data` dependency, or JFB version doesn't expose `window.JetFBHooks`.
- **REST returns 401/403 on save**: capability check too strict (e.g. requiring `manage_options` for editors). Use `edit_post` against the specific form ID.
- **Editor's "post is dirty" indicator never clears**: you're calling `setValue` with a new object reference every render even when the data didn't change. Memoize or compare before writing.

## Cross-references

- Run **`jfb-settings-tab`** when the user needs a site-wide settings tab in addition to (or instead of) per-form panels — it covers the global Vue/cx-vui Settings page.
- Run **`wp-security-audit`** on the PHP side before release — `register_post_meta` with REST exposure is a write endpoint that an audit must check (auth_callback strength, sanitize_callback completeness).
- Run **`wp-i18n-audit`** on both PHP and JS strings to verify text-domain consistency.

## What this skill does NOT cover

- Adding new JFB form blocks (different subsystem — block.json, edit/save components).
- Adding JFB form actions (the "after submit do X" flow — Google Sheet plugin uses that, not this).
- Adding JFB preset providers (data sources for prefilling form fields).
- Customizing Gutenberg's main editor canvas, post status info, or pre-publish panel — those are standard Gutenberg slots accessed via `registerPlugin` from `@wordpress/plugins`, not through JFB's filter.
- Multi-form UI (settings that span multiple forms or aggregate across them).

## References

- Form CPT registration: `wp-content/plugins/jetformbuilder/modules/post-type/module.php`
- Meta base class with reference `auth_callback`: `wp-content/plugins/jetformbuilder/modules/post-type/meta/base-meta-type.php`
- Editor asset enqueue trigger: `wp-content/plugins/jetformbuilder/includes/admin/editor.php`
- Real-world panel implementation: `wp-content/plugins/media-storage-for-jetformbuilder/assets/js/form-editor.js` and `includes/Plugin.php`
- WP component catalog: https://developer.wordpress.org/block-editor/reference-guides/components/
- `register_post_meta` reference: https://developer.wordpress.org/reference/functions/register_post_meta/
