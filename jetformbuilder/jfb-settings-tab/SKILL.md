---
name: jfb-settings-tab
description: Registers a custom settings tab in the JetFormBuilder admin
  Settings page using the official JFB API — PHP-side Base_Handler
  subclass for persistence, JS-side wp.hooks filter for the Vue tab
  component, native cx-vui field components for the UI. Use when a
  plugin needs its own configuration tab inside JFB Settings (API
  credentials, defaults, debug flags, third-party integrations) and
  the developer must NOT roll their own admin page. Triggers on
  mentions of "JetFormBuilder settings tab", "JFB settings page",
  "Base_Handler", "register-tabs-handlers", "jet.fb.register.settings-page.tabs",
  "cx-vui-input", or when a JFB-companion plugin is being scaffolded.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: jetformbuilder
plugin-version-tested: "3.5.6"
api-stable-since: "3.0"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://jetformbuilder.com/documentation/
source-refs:
  - includes/admin/tabs-handlers/base-handler.php
  - includes/admin/tabs-handlers/tab-handler-manager.php
  - includes/admin/tabs-handlers/options-handler.php
  - includes/admin/pages/pages-manager.php
---

# JetFormBuilder: register a custom settings tab

JetFormBuilder ships with its own Vue-based admin Settings page. Companion plugins should not create separate `add_options_page()` screens — they should plug into the JFB Settings page as a tab. This skill describes the official API for doing so.

## API stability note

The `Base_Handler` PHP API and the `jet.fb.register.settings-page.tabs` JS filter described here are stable across the entire JFB 3.x line and have not had breaking changes in the version range observed. The `cx-vui-*` Vue components are also stable. The `plugin-version-tested` field in the frontmatter records only the version where this skill was last verified end-to-end — treat it as "this skill was confirmed accurate on at least this version", not as "this is the only version where it works". Almost certainly this skill applies to JFB 3.0+ unchanged. If you encounter a JFB version where any step here is wrong, please file an issue and bump the field — don't silently work around it.

The flow has **two halves** that must both be implemented:

1. **PHP side** — a `Base_Handler` subclass for persistence + the `jet-form-builder/register-tabs-handlers` filter to register it.
2. **JS side** — a Vue component + the `jet.fb.register.settings-page.tabs` JS filter (via `wp.hooks.addFilter`) to render it.

Skip either half and the tab silently won't appear or won't save.

## When to use this skill

- A companion plugin needs a configuration tab inside JFB Settings.
- The user mentions API keys, OAuth, third-party integrations that need a settings UI for JFB.
- The diff/files contain `Base_Handler`, `register-tabs-handlers`, `jet.fb.register.settings-page.tabs`, `cx-vui-*`, or `Pages_Manager`.

## Architecture in one paragraph

`Tab_Handler_Manager` (singleton) collects tab handlers via the `jet-form-builder/register-tabs-handlers` filter. Each handler is a `Base_Handler` subclass with a `slug()`, `on_load()` (returns saved options to Vue), and `on_get_request()` (saves POST data). On the JS side, the JFB admin bundle reads a Vue-side filter `jet.fb.register.settings-page.tabs` to collect tab components. Each component receives saved options as `props.incoming` and exposes a `getRequestOnSave()` method that returns `{ data: {...} }`. JFB persists the data to `wp_options` under the key `jet_form_builder_settings__<slug>` as JSON, via an AJAX action `wp_ajax_jet_fb_save_tab__<slug>` with nonce `jfb-settings` and capability `manage_options`.

## Step 1 — PHP: extend Base_Handler

```php
<?php
namespace MyPlugin\Settings;

use Jet_Form_Builder\Admin\Tabs_Handlers\Base_Handler;

class SettingsTab extends Base_Handler {

    public function slug() {
        return 'my-plugin-settings-tab';
    }

    public function on_load() {
        // Returned to Vue as props.incoming
        return $this->get_options( SettingsRepository::defaults() );
    }

    public function on_get_request() {
        // Sanitize $_POST input (already nonce + cap-checked by Base_Handler)
        $payload = array(
            'api_key'       => sanitize_text_field( wp_unslash( $_POST['api_key'] ?? '' ) ),
            'debug_enabled' => rest_sanitize_boolean( $_POST['debug_enabled'] ?? false ),
        );

        $this->update_options( $payload );
        $this->send_response( $this->get_success_response_data() );
    }
}
```

Required methods: `slug`, `on_load`, `on_get_request`. The `slug` MUST match the JS-side tab identifier and must be URL-safe.

`Base_Handler` already verifies the `jfb-settings` nonce and `manage_options` capability before calling `on_get_request`. **Do not skip your own input sanitization** — the cap check guards who can save, not what they save.

## Step 2 — PHP: register the handler

```php
add_filter(
    'jet-form-builder/register-tabs-handlers',
    function ( array $tabs ): array {
        $tabs[] = new \MyPlugin\Settings\SettingsTab();
        return $tabs;
    }
);
```

Hook this in your plugin's main bootstrap, NOT inside `init` — JFB collects tabs early. A safe place is the constructor of your plugin's main class instantiated on `plugins_loaded` priority 11+.

## Step 3 — PHP: enqueue assets for your tab

```php
add_action( 'jet-fb/admin-pages/before-assets/jfb-settings', function () {
    wp_enqueue_style(
        \Jet_Form_Builder\Admin\Pages\Pages_Manager::STYLE_ADMIN
    );
    wp_enqueue_script(
        \Jet_Form_Builder\Admin\Pages\Pages_Manager::SCRIPT_VUEX_PACKAGE
    );
    wp_enqueue_script(
        \Jet_Form_Builder\Admin\Pages\Pages_Manager::SCRIPT_PACKAGE
    );

    wp_enqueue_script(
        'my-plugin-settings-tab',
        plugins_url( 'assets/js/settings-tab.js', __FILE__ ),
        array(
            \Jet_Form_Builder\Admin\Pages\Pages_Manager::SCRIPT_VUEX_PACKAGE,
            'wp-hooks',
            'wp-i18n',
            // 'wp-api-fetch' — only if your JS actually calls wp.apiFetch
        ),
        '1.0.0',
        true
    );
});
```

Always declare `wp-hooks` and `wp-i18n` as dependencies even if you "see them on `window.wp`" — they're what `addFilter` and `__()` rely on. Add `wp-api-fetch` only when your component actually calls `wp.apiFetch` (fetch wrappers, REST calls). Including the JFB Vuex package handle as a dependency is also recommended so script load order is deterministic.

## Step 4 — JS: register the Vue tab component

```js
import { addFilter } from '@wordpress/hooks';
import { __ } from '@wordpress/i18n';

const MyPluginSettingsTab = {
    props: {
        incoming: { type: Object, required: true },
    },
    data() {
        return {
            current: { ...this.incoming },
        };
    },
    methods: {
        // JFB calls this on save; must return { data: ... }
        getRequestOnSave() {
            return { data: this.current };
        },
    },
    render( h ) {
        return h( 'cx-vui-panel', [
            h( 'cx-vui-input', {
                attrs: {
                    label: __( 'API Key', 'my-plugin' ),
                    description: __( 'Get this from your dashboard.', 'my-plugin' ),
                    size: 'fullwidth',
                    'wrapper-css': [ 'equalwidth' ],
                },
                model: {
                    value: this.current.api_key,
                    callback: ( v ) => { this.current.api_key = v; },
                },
            } ),
            h( 'cx-vui-switcher', {
                attrs: { label: __( 'Debug mode', 'my-plugin' ) },
                model: {
                    value: this.current.debug_enabled,
                    callback: ( v ) => { this.current.debug_enabled = v; },
                },
            } ),
        ] );
    },
};

addFilter(
    'jet.fb.register.settings-page.tabs',
    'my-plugin/settings-tab',
    ( tabs ) => {
        tabs.push( {
            title: __( 'My Plugin', 'my-plugin' ),
            component: MyPluginSettingsTab,
        } );
        return tabs;
    }
);
```

The third argument to `addFilter` is your unique namespace — convention is `<plugin-slug>/settings-tab`.

## Native field components — use these 1:1

These are the only Vue components JFB ships that you can use directly without bundling extra UI. They're from Crocoblock's private `cx-vui` library; **not** WordPress core components.

| Component | Purpose | Required attrs | Model binding |
|---|---|---|---|
| `cx-vui-input` | Text / number input | `label`, `description`, `size: 'fullwidth'` | `value` (string \| number) |
| `cx-vui-switcher` | Boolean on/off toggle | `label` | `value` (boolean) |
| `cx-vui-panel` | Collapsible section / container | `label` (optional) | none — just children |
| `cx-vui-button` | Action button | `button-style`, `size` | none — listen for `@click` |

Confirmed in JFB 3.6.0 source and used in two production companion plugins (`media-storage-for-jetformbuilder`, `google-sheet-for-jetformbuilder`).

**Common attrs that work across cx-vui-input / cx-vui-switcher:**

- `label` — string, displayed left of the field.
- `description` — string, help text below.
- `size` — `'fullwidth'` is the only documented value seen in the wild.
- `wrapper-css` — array of class names; `[ 'equalwidth' ]` aligns label and field columns.
- `disabled` — boolean.

`cx-vui-input` `attrs.type`: `'text'` (default), `'number'`, `'password'`. Browser-level types only — no built-in masking.

## Beyond the native set — "hack zone"

JFB does **not** ship native components for: textarea, select / dropdown, repeater, color picker, media picker, code editor, date picker, range slider. If you need these, you have three options, in order of preference:

### Preferred: raw HTML in render function

Acceptable for textarea, simple selects, native HTML5 inputs:

```js
render( h ) {
    return h( 'cx-vui-panel', [
        // Use cx-vui-input where you can
        h( 'cx-vui-input', { /* ... */ } ),

        // Drop down to raw HTML for what cx-vui doesn't cover
        h( 'div', { class: 'cx-vui-component cx-vui-component--equalwidth' }, [
            h( 'label', { class: 'cx-vui-component__label' }, __( 'Notes', 'my-plugin' ) ),
            h( 'textarea', {
                attrs: { rows: 6, class: 'cx-vui-input' },
                domProps: { value: this.current.notes },
                on: { input: ( e ) => { this.current.notes = e.target.value; } },
            } ),
        ] ),
    ] );
},
```

This is what `google-sheet-for-jetformbuilder` does for its credentials JSON textarea. It looks visually consistent if you mirror the cx-vui wrapper class structure (`cx-vui-component`, `cx-vui-component__label`, `cx-vui-input`).

### Acceptable: bundle your own Vue component

For complex UI (custom file picker, OAuth-aware connector card, JSON editor) write a local Vue 2 component and use it in your render function. Keep it inside your plugin's bundle — don't expose it globally.

`media-storage-for-jetformbuilder` does this for its provider connection cards (Dropbox OAuth flow with postMessage).

### Avoid: WordPress `wp-components` (React)

JFB Settings is Vue 2. Mounting React components inside a Vue tree works but creates two virtual DOMs, breaks form-state propagation, and won't participate in JFB's save flow. Don't do it unless there's no alternative — and if you do, keep React contained to a leaf node and bridge state manually.

## Critical rules

- **Slug must match** between PHP `slug()` return value and the option name JFB derives (`jet_form_builder_settings__<slug>`). It also functions as the AJAX action suffix. Use kebab-case, no spaces, no underscores in user-visible parts.
- **`getRequestOnSave()` MUST return `{ data: {...} }`.** Returning the data object directly silently saves nothing.
- **`props.incoming` is read-only initial state.** Mutating it directly does not trigger Vuex reactivity correctly — copy into `data().current` and bind to that.
- **Sanitize in PHP, not JS.** The Vue layer can be bypassed by anyone with `manage_options` who crafts the AJAX request manually.
- **Capability is hardcoded to `manage_options`.** There is no per-tab cap filter. If you need a different role to access the tab, add the check in `on_get_request()` and return `wp_send_json_error()`.
- **Don't use a separate option key.** `Base_Handler::update_options()` already prefixes correctly. Calling `update_option('my_custom_key', ...)` from inside `on_get_request()` defeats the entire system.
- **Asset enqueue must include `Pages_Manager::SCRIPT_PACKAGE`.** Without it, `cx-vui-*` components are not registered and Vue throws "Unknown custom element" warnings on render.

## Save flow — what actually happens

1. User clicks Save in the Vue UI.
2. JFB collects `getRequestOnSave()` from each registered tab component.
3. JFB POSTs to `admin-ajax.php` with action `jet_fb_save_tab__<slug>` + nonce `jfb-settings` + the `data` object flattened as POST fields.
4. `Base_Handler::on_raw_request()` verifies nonce and `manage_options` capability.
5. Your `on_get_request()` runs — you sanitize and call `$this->update_options( $payload )`.
6. `update_options()` JSON-encodes and writes to `wp_options` under `jet_form_builder_settings__<slug>`.
7. `send_response()` returns success/error JSON; the Vue UI displays the toast.

## Common pitfalls (failure modes inferred from the API contract)

- **Tab appears empty / no Save button**: missing `Pages_Manager::SCRIPT_PACKAGE` enqueue. Re-check Step 3.
- **Save returns 403**: nonce expired or wrong capability. Don't override the nonce; let JFB handle it.
- **Save returns success but nothing persists**: `getRequestOnSave()` returned wrong shape. Must be `{ data: {...} }`.
- **Tab loads with empty fields on second visit**: `on_load()` returning `false` or `null` instead of an array. Always return an array, default to `SettingsRepository::defaults()` (your own static defaults class).
- **Filter callback never fires**: registered `jet-form-builder/register-tabs-handlers` too late (after JFB initialized). Move to `plugins_loaded` priority 11.
- **Linking to your tab from outside (`Configure` action link, plugin row meta, dashboard widget, etc.) throws `Not_Found_Page_Exception: Current page is not defined`**: you used `admin.php?page=jfb-settings`. JFB does NOT register its settings under the top-level `admin.php` route — it lives under the `jet-form-builder` CPT submenu. See *Linking to your tab from outside* below for the correct URL.

## Linking to your tab from outside

A common companion-plugin pattern is to add a **Configure** action link on the `Plugins` screen, or a `Settings` link in a dashboard widget, that jumps directly to your settings tab. Two non-obvious things bite people here:

### 1. Use the CPT-submenu URL, not `admin.php`

JFB's settings page is registered as a child of the `jet-form-builder` custom post type, so the URL is:

```
edit.php?post_type=jet-form-builder&page=jfb-settings#<your-tab-slug>
```

NOT `admin.php?page=jfb-settings...`. The `admin.php` form throws `Jet_Form_Builder\Admin\Exceptions\Not_Found_Page_Exception` because the page is not registered there.

### 2. Use the hash fragment for tab selection

The Vue settings page reads `window.location.hash` to pick the active tab on load. There is no `&tab=...` query parameter. The hash value is the tab `slug()` returned by your `Base_Handler` subclass.

### Reference snippet — `Configure` link on the Plugins screen

```php
add_filter(
    'plugin_action_links_' . plugin_basename( __FILE__ ),
    static function ( array $links ): array {
        $url = admin_url(
            'edit.php?post_type=jet-form-builder&page=jfb-settings#my-plugin-settings-tab'
        );
        array_unshift(
            $links,
            sprintf(
                '<a href="%s">%s</a>',
                esc_url( $url ),
                esc_html__( 'Configure', 'my-plugin' )
            )
        );
        return $links;
    }
);
```

`array_unshift` puts `Configure` before `Deactivate`, matching the WordPress convention for settings-bearing plugins (`woocommerce`, `google-sheet-for-jetformbuilder`, etc.).

If you want it in the right-hand row meta column instead (next to *Visit plugin site*), use `plugin_row_meta` with the same URL — the gotcha about the route is identical.

## Cross-references

- Run **`wp-security-audit`** on the PHP handler before release — `on_get_request()` is a write endpoint with attacker-controlled input.
- Run **`wp-i18n-audit`** on both PHP and JS strings to verify text-domain consistency.

## What this skill does NOT cover

- JFB form builder block development (different subsystem).
- JFB action / preset / post-type registration (separate APIs).
- Custom Vuex store integration with JFB's store.
- React / Gutenberg integration inside the Settings page.
- JFB Pro-only APIs that aren't shipped in the free plugin.

## References

- Base handler: `wp-content/plugins/jetformbuilder/includes/admin/tabs-handlers/base-handler.php`
- Tab manager: `wp-content/plugins/jetformbuilder/includes/admin/tabs-handlers/tab-handler-manager.php`
- Pages manager (asset constants): `wp-content/plugins/jetformbuilder/includes/admin/pages/pages-manager.php`
- Reference implementation in JFB itself: `includes/admin/tabs-handlers/options-handler.php`
- Real-world examples: `media-storage-for-jetformbuilder`, `google-sheet-for-jetformbuilder` (companion plugins by the same author).
