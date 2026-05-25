---
name: wp-admin-settings-api
description: Build plugin admin settings pages with the WordPress Settings
  API instead of custom form handlers. Covers `register_setting()`,
  `add_settings_section()`, `add_settings_field()`, `settings_fields()`,
  `do_settings_sections()`, `add_settings_error()`, `settings_errors()`,
  `admin_init` registration, `<form method="post" action="options.php">`,
  `sanitize_callback`, `$option_group` vs `$page`, single-array option
  storage, tabbed pages, `show_in_rest` schemas, custom option capabilities
  via `option_page_capability_{$option_group}`, and the mistake of POSTing
  to your own handler. Use for plugin settings screens, integration config,
  feature toggles, or any options page that saves to `wp_options`.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0"
php-min: "7.4"
last-updated: "2026-05-24"
docs:
  - https://developer.wordpress.org/reference/functions/register_setting/
  - https://developer.wordpress.org/reference/functions/add_settings_section/
  - https://developer.wordpress.org/reference/functions/add_settings_field/
  - https://developer.wordpress.org/plugins/settings/settings-api/
---

# WordPress Settings API

The Settings API exists so you don't write your own form handling, nonce verification, capability check, sanitization dispatch, error flashing, and option storage. Core does all of it — you describe the form. Plugins that bypass it (POSTing to a custom admin-post handler, writing their own nonce + cap check) end up with worse security and worse a11y than the boring built-in path.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin needs an admin settings page that saves option values.
- Code references `register_setting`, `add_settings_section`, `add_settings_field`, `settings_fields`, `do_settings_sections`, `add_settings_error`, `settings_errors`, `options.php`, `sanitize_callback`, or `show_in_rest` in a plugin context.
- The user is about to write `<form method="post" action="<?php echo $_SERVER['REQUEST_URI']; ?>">` and a manual handler — the Settings API is the right answer.
- The user complains: "my settings don't save", "settings_fields nonce mismatch", "options page registered but field doesn't show", "sanitize_callback runs twice", "tabs don't persist data when I switch".

## The mental model — three IDs, easy to confuse

The Settings API uses three identifier types and reusing them inconsistently is the single most common debugging dead-end:

| Identifier | What it groups | Functions that take it |
|---|---|---|
| `$option_group` | A *nonce-protected save batch*. `options.php` accepts a POST only if its `option_page` field matches one of these. | `register_setting( $option_group, ... )`, `settings_fields( $option_group )` |
| `$page` (settings page slug) | A *rendering target* — collects sections and fields to render together. | `add_settings_section( ..., $page, ... )`, `add_settings_field( ..., $page, ... )`, `do_settings_sections( $page )` |
| `$option_name` | The actual `wp_options` row key | `register_setting( $group, $option_name, ... )`, `get_option( $option_name )` |

You CAN use the same string for `$option_group` and `$page` — that's the common simplification. But if you set the menu page slug to one thing, the section page to another, and `settings_fields()` to a third, the result is: nothing renders (silent — `do_settings_sections` finds no matching sections) AND the save dies loudly via `wp_die()` from `options.php` ("not in the allowed options list"). Two distinct failure modes from the same slug-drift bug. **Pick one slug, reuse it.**

## The full bootstrap — single-option-array pattern

The pattern below stores ALL plugin settings in a SINGLE serialized array in `wp_options` (`myplugin_options`). This is the WP-recommended approach — one row, one autoload entry, less query overhead than one-option-per-field.

### 1. Register the menu page

```php
add_action( 'admin_menu', static function (): void {
    add_options_page(
        __( 'My Plugin', 'myplugin' ),
        __( 'My Plugin', 'myplugin' ),
        'manage_options',
        'myplugin',                       // the admin page slug — also our $page identifier
        'myplugin_render_settings_page'
    );
} );
```

`add_options_page()` registers under Settings → My Plugin. For a top-level entry use `add_menu_page()`; for an integration tab use `add_submenu_page()`.

### 2. Register sections, fields, and the setting itself on `admin_init`

```php
add_action( 'admin_init', static function (): void {

    register_setting(
        'myplugin',                       // $option_group — used by settings_fields() in the form
        'myplugin_options',               // $option_name — the wp_options row key
        array(
            'type'              => 'object',
            'default'           => array(
                'enabled'   => false,
                'api_key'   => '',
                'log_level' => 'info',
            ),
            'sanitize_callback' => 'myplugin_sanitize_options',
            'show_in_rest'      => false, // set to a schema array to expose via REST
        )
    );

    add_settings_section(
        'myplugin_section_general',       // section id
        __( 'General', 'myplugin' ),      // section title
        static function (): void {
            echo '<p>' . esc_html__( 'General plugin configuration.', 'myplugin' ) . '</p>';
        },
        'myplugin'                        // $page — must match do_settings_sections() below
    );

    add_settings_field(
        'enabled',
        __( 'Enable plugin', 'myplugin' ),
        'myplugin_render_field_enabled',
        'myplugin',                       // $page
        'myplugin_section_general',
        array( 'label_for' => 'myplugin_enabled' ) // sets the section <th>'s <label for>
    );

    add_settings_field(
        'api_key',
        __( 'API key', 'myplugin' ),
        'myplugin_render_field_api_key',
        'myplugin',
        'myplugin_section_general',
        array( 'label_for' => 'myplugin_api_key' )
    );
} );
```

### 3. Field render callbacks

Render callbacks echo normal form controls. The `name` attribute ties the input to the `$option_name` array: `myplugin_options[api_key]` lands in `$_POST['myplugin_options']['api_key']` and arrives at `sanitize_callback` as `$input['api_key']`. See `reference.md` for checkbox and text-field callbacks.

### 4. The single sanitize callback

```php
function myplugin_sanitize_options( $input ): array {
    $defaults = array( 'enabled' => false, 'api_key' => '', 'log_level' => 'info' );
    $existing = get_option( 'myplugin_options', $defaults );

    $clean = $existing;  // start from current saved state so untouched tabs don't get blanked

    // Boolean.
    $clean['enabled'] = ! empty( $input['enabled'] );

    // String with format check.
    if ( isset( $input['api_key'] ) ) {
        $api_key = trim( (string) $input['api_key'] );
        if ( $api_key !== '' && ! preg_match( '/^[A-Za-z0-9_-]{20,}$/', $api_key ) ) {
            add_settings_error( 'myplugin_options', 'api_key_invalid',
                __( 'API key format is invalid.', 'myplugin' ) );
            // Keep the existing value rather than letting the bad one through.
        } else {
            $clean['api_key'] = $api_key;
        }
    }

    // Enum.
    $allowed_levels = array( 'debug', 'info', 'warn', 'error' );
    if ( isset( $input['log_level'] ) && in_array( $input['log_level'], $allowed_levels, true ) ) {
        $clean['log_level'] = $input['log_level'];
    }

    return $clean;
}
```

The "start from `$existing`" pattern is critical when you have tabs (see below). A tab only submits its own fields; without this guard, switching tabs and saving wipes the others.

### 5. The page render — the form that POSTs to `options.php`

```php
function myplugin_render_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'You are not allowed to access this page.', 'myplugin' ), 403 );
    }
    ?>
    <div class="wrap">
        <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

        <?php settings_errors(); ?>

        <form method="post" action="options.php">
            <?php
            // Emits the nonce, option_page, action="update" hidden fields.
            settings_fields( 'myplugin' );

            // Renders all sections + fields registered against $page = 'myplugin'.
            do_settings_sections( 'myplugin' );

            submit_button();
            ?>
        </form>
    </div>
    <?php
}
```

The form action `options.php` is **mandatory**. That's the core handler that:

1. Verifies the `settings_fields()` nonce.
2. Verifies `current_user_can( 'manage_options' )` by default, or a custom cap when you filter `option_page_capability_{$option_group}`.
3. Verifies `$_POST['option_page']` matches a registered `$option_group`.
4. Calls `update_option()` on each option in that group (your `sanitize_callback` runs here).
5. Flashes the standard "Settings saved" notice and redirects back to your page with `?settings-updated=true`.

Bypass this and you lose all of it.

## Tabs pattern

The Settings API doesn't ship tabs — you build them. Use one `$_GET['tab']` query var, one form per tab posting to `options.php`, and separate `$option_group` / `$page` slugs per tab. All tabs can still write to the same `$option_name` as long as the sanitize callback starts from the existing option and only overwrites submitted keys. See `reference.md` for the full tab scaffold.

## Surfacing settings in REST / Site Editor — `show_in_rest`

When `show_in_rest => true` (or a schema array), the setting becomes readable / writable at `/wp/v2/settings`. Useful for block-editor side panels, headless frontends, or CLI tools.

REST writes go through the same `sanitize_callback`. Important: REST permissions default to `manage_options`-or-equivalent on `/wp/v2/settings` — fine for plugin-admin settings, NOT fine if you want a lower-privileged user to update a subset. For per-cap REST writes, register a dedicated REST route instead.

For object settings, pass a schema with `properties`; see `reference.md`.

## Flash messages — `add_settings_error` + `settings_errors`

`add_settings_error( $setting, $code, $message, $type )` — `$type` is `'error' | 'warning' | 'info' | 'success' | 'updated'`. Errors are queued during sanitize and flashed on the next render.

Then in your page render, call `settings_errors()` once (above the form). The default "Settings saved" notice from `options.php` is added automatically with code `settings_updated`. Pass the setting slug when you want to show only that setting's messages:

```php
settings_errors( 'myplugin_options' );
```

Do not use `$hide_on_update = true` as a way to hide the default saved notice after submit; it suppresses all messages while `settings-updated` is present. Reserve it for first-load diagnostics that should disappear after a save redirect.

## Single-array vs one-option-per-field

The bootstrap above uses ONE option (`myplugin_options`) holding an array. This is the right default for plugin settings: fewer DB rows, single autoload entry, one nonce, one sanitize callback. One-option-per-field is valid only when other code genuinely needs separate option names. See `reference.md` for the alternate registration shape.

## Critical rules

- **Form action MUST be `options.php`**. POSTing to your own page handler discards core's nonce + cap + option-page-allowlist check.
- **`settings_fields( $option_group )` MUST match a `register_setting()`'s first arg**. Mismatch = `options.php` (verified line 249) calls `wp_die()` with the message *"Error: The `<group>` options page is not in the allowed options list."* — the form post is dropped before any sanitize callback runs.
- **`add_settings_section()` / `add_settings_field()` `$page` MUST match `do_settings_sections( $page )`**. Mismatch = nothing renders (no error — silent failure).
- **Call `register_setting()` on `admin_init`, NOT in your menu-page render callback**. The menu page only renders when the user views it; `options.php` validates against the `$option_group` registry, which is built on `admin_init` for every admin request.
- **`sanitize_callback` runs on every save, including REST writes**. Don't put side effects (sending emails, calling external APIs) directly in it — return the cleaned value. Side effects belong in a separate `update_option_myplugin_options` hook.
- **`sanitize_callback` is called with the full submitted array for array options**. For tabs to coexist, start from the existing saved value and only overwrite keys present in `$input`.
- **`current_user_can()` defaults to `manage_options` for `options.php`**. Override by using `add_menu_page()` with a custom cap AND filtering `option_page_capability_{$option_group}` to require the same.
- **Don't echo competing headings in the section callback for accessibility-critical content** — `do_settings_sections()` prints the section `<h2>` first, then runs the callback directly under it. Use descriptive `<p>` text unless you intentionally need more heading structure.

## Common AI mistakes

See `reference.md` for before/after snippets: posting to your own handler, registering settings inside the render callback, mismatched group/page slugs, tab saves that wipe other tab data, and side effects inside `sanitize_callback`.

## Cross-references

- See **`wp-plugin-options-storage`** for choosing between options vs custom tables vs user meta — the storage layer beneath the Settings API.
- See **`wp-admin-form-controls`** for color picker / date picker / pointer / autocomplete widgets to drop into field render callbacks.
- See **`wp-admin-codemirror`** when a settings field is a CSS/JSON/code textarea.
- See **`wp-admin-media-frame`** when a settings field picks an image or file.
- See **`wp-rest-api`** when the `show_in_rest` defaults don't fit your auth model and you need a custom REST route instead.

## What this skill does NOT cover

- Network-wide / multisite settings. `register_setting` is per-site; multisite uses a separate `add_network_options_page` / `update_site_option` path.
- Customizer settings (`wp.customize`). Different API on the frontend; the Settings API is admin-only.
- Block-editor settings panels (`@wordpress/components` PluginSettings, MetaBoxes in the block editor). React-rendered; uses `useEntityProp` instead.
- Building a settings page UI with React/Gutenberg components inside admin. Possible (`createRoot` + WP REST settings endpoints), but a separate topic from the classic Settings API.

## References

- `wp-includes/option.php:2994` — `register_setting()` definition with the full `$args` shape.
- `wp-admin/includes/template.php:1637` — `add_settings_section()`.
- `wp-admin/includes/template.php:1715` — `add_settings_field()`.
- `wp-admin/includes/template.php:1766` — `do_settings_sections()`.
- `wp-admin/includes/template.php:1870` — `add_settings_error()`.
- `wp-admin/includes/template.php:1985` — `settings_errors()` with the `$hide_on_update` arg.
- `wp-admin/includes/plugin.php:2347` — `settings_fields()` (emits the nonce + option_page + action hidden fields).
- `wp-admin/options.php` — the core handler your form posts to; read it to understand what verification you get for free.
- `reference.md` — tabs, REST schema, flash messages, one-option-per-field, and common mistakes.
