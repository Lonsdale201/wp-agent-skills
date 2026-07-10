---
name: wp-admin-form-controls
description: Use WordPress admin form-control widgets that ship in core,
  `wp-color-picker`, `jquery-ui-datepicker`, `jquery-ui-autocomplete`,
  and `wp-pointer`. Covers correct script/style enqueues, the missing
  jQuery UI datepicker CSS, `wpColorPicker` change / clear callbacks,
  datepicker `yy-mm-dd` formatting plus strict server sanitization,
  autocomplete `source` shapes with `response()`, core user/tag suggest,
  and `wp-pointer` dismissal through `dismiss-wp-pointer`. Use when adding
  color, date, typeahead, or first-run pointer controls to settings pages,
  metaboxes, or repeater rows.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://developer.wordpress.org/reference/functions/wp_enqueue_script/
  - https://api.jqueryui.com/datepicker/
  - https://api.jqueryui.com/autocomplete/
  - https://automattic.github.io/Iris/
---

# WordPress Admin Form Controls

Four small widgets that ship with every WP install and that plugin developers reach for daily — but rarely enqueue correctly. This skill is the recipe sheet.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin admin field needs a color picker, a date picker, a typeahead/autocomplete, or a first-run tooltip on a new feature.
- Code references `wp-color-picker`, `wpColorPicker`, `iris`, `jquery-ui-datepicker`, `jquery-ui-autocomplete`, `wp-pointer`, or `$('#x').pointer()`.
- The user is about to bundle their own color picker (Pickr, color.js, Coloris) or date picker (flatpickr, Pikaday) when core's would do.
- The user complains "the datepicker has no CSS" / "wpColorPicker is not a function".

## Color picker — `wp-color-picker`

Script handle `wp-color-picker` depends on `iris` (the underlying picker — Automattic's color library, `wp-includes/js/iris.min.js`, registered at `wp-includes/script-loader.php:1502`). The stylesheet `wp-color-picker` is also registered; you must enqueue it as well.

### Enqueue

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_script( 'wp-color-picker' );
    wp_enqueue_style( 'wp-color-picker' );

    wp_enqueue_script(
        'myplugin-color-init',
        plugins_url( 'assets/color-init.js', MYPLUGIN_FILE ),
        array( 'wp-color-picker', 'wp-i18n' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );
} );
```

### Markup + init

```php
<input
    type="text"
    name="myplugin_options[brand_color]"
    value="<?php echo esc_attr( $options['brand_color'] ?? '#0073aa' ); ?>"
    class="myplugin-color-field"
    data-default-color="#0073aa"
/>
```

```js
jQuery( function ( $ ) {
    $( '.myplugin-color-field' ).wpColorPicker( {
        // Optional — picked up automatically from data-default-color if set on the input.
        // defaultColor: '#0073aa',

        change: function ( event, ui ) {
            // Fires on every color tweak while the picker is open.
            // ui.color is an Iris Color object — call .toString() for the hex.
        },
        clear: function () {
            // Fires when the "Clear" button is clicked.
        },
        palettes: true,                              // false to hide the preset palette row
        // palettes: [ '#0073aa', '#23282d', '#fff' ], // OR an array of hex strings
    } );
} );
```

### Sanitizing server-side

```php
'sanitize_callback' => static function ( $value ): string {
    if ( ! is_string( $value ) ) {
        return '';
    }
    return sanitize_hex_color( $value ) ?: '';
},
```

`sanitize_hex_color()` returns `null` on invalid input — coalesce to `''` (or your default) to keep `update_option()` happy.

## Date picker — `jquery-ui-datepicker`

The bundled jQuery UI datepicker. The non-obvious bit: **core does NOT enqueue
a default stylesheet for it**. Ship a small plugin-owned stylesheet; avoid
making wp-admin depend on a third-party CDN. For a simple date-only value,
prefer native `<input type="date">` and use jQuery UI only when you need a
consistent calendar UI or constraints native controls cannot provide.

### Enqueue

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_script( 'jquery-ui-datepicker' );

    // CRITICAL — core ships no datepicker CSS. Ship your own:
    wp_enqueue_style(
        'myplugin-datepicker',
        plugins_url( 'assets/datepicker.css', MYPLUGIN_FILE ),
        array(),
        MYPLUGIN_VERSION
    );

    wp_enqueue_script(
        'myplugin-date-init',
        plugins_url( 'assets/date-init.js', MYPLUGIN_FILE ),
        array( 'jquery-ui-datepicker', 'wp-i18n' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );

    wp_add_inline_script(
        'myplugin-date-init',
        'window.MyPluginDates = ' . wp_json_encode( array(
            'firstDay' => (int) get_option( 'start_of_week', 0 ),
        ) ) . ';',
        'before'
    );
} );
```

If you don't want to bundle your own CSS, the jQuery UI "smoothness" theme CSS works:

```css
/* assets/datepicker.css — minimum the picker needs to be usable */
.ui-datepicker { background: #fff; border: 1px solid #c3c4c7; padding: 8px; z-index: 9999; }
.ui-datepicker-header { display: flex; justify-content: space-between; padding: 4px 0; }
.ui-datepicker-prev, .ui-datepicker-next { cursor: pointer; }
.ui-datepicker table { border-collapse: collapse; }
.ui-datepicker td a { display: block; padding: 4px 8px; text-align: center; text-decoration: none; }
.ui-datepicker td a.ui-state-active { background: #2271b1; color: #fff; }
```

### Markup + init

```php
<input
    type="text"
    name="myplugin_options[start_date]"
    value="<?php echo esc_attr( $options['start_date'] ?? '' ); ?>"
    class="myplugin-date-field"
    autocomplete="off"
/>
```

```js
jQuery( function ( $ ) {
    $( '.myplugin-date-field' ).datepicker( {
        dateFormat:      'yy-mm-dd',           // ISO format for storage. NOT PHP's date() format — jQuery UI's.
        firstDay:        MyPluginDates.firstDay,
        changeMonth:     true,
        changeYear:      true,
        yearRange:       '-5:+5',
        showButtonPanel: true,
    } );
} );
```

`autocomplete="off"` on the input prevents the browser from popping its own calendar overlay on top of the jQuery UI one.

`dateFormat` is jQuery UI's own format string (`yy-mm-dd` = 4-digit year, 2-digit month, 2-digit day) — NOT PHP's `date()` syntax. Common confusion source.

### Sanitizing server-side

```php
'sanitize_callback' => static function ( $value ): string {
    $raw  = trim( (string) $value );
    $date = DateTimeImmutable::createFromFormat( '!Y-m-d', $raw );
    $err  = DateTimeImmutable::getLastErrors();

    if ( ! $date || ( is_array( $err ) && ( $err['warning_count'] || $err['error_count'] ) ) ) {
        return '';
    }

    return $date->format( 'Y-m-d' ) === $raw ? $raw : '';
},
```

## Autocomplete — `jquery-ui-autocomplete`

Handle `jquery-ui-autocomplete` (depends on `jquery-ui-menu` and `wp-a11y` — the a11y dep means screen readers get role announcements for free).

### Enqueue

```php
wp_enqueue_script(
    'myplugin-tag-suggest',
    plugins_url( 'assets/tag-suggest.js', MYPLUGIN_FILE ),
    array( 'jquery-ui-autocomplete', 'wp-api-fetch', 'wp-i18n' ),
    MYPLUGIN_VERSION,
    array( 'in_footer' => true )
);
```

### Source shapes

`source` can be a static array, a synchronous transform, or an async function that calls `response( results )` after `wp.apiFetch()`. It cannot just return a Promise. Items can be strings or objects with at least `label` and `value`; add an `id` and read it in `select` when you need a hidden ID field. See `reference.md` for complete examples.

For user / term suggestions, core ships `user-suggest` (admin pages only) and `tags-suggest` — those are wrappers around `jquery-ui-autocomplete` that hit core admin-ajax endpoints. Worth reusing if your "User" autocomplete maps to WP users — see `wp-admin/js/user-suggest.js`.

## Admin pointer — `wp-pointer`

The blue floating tooltip core uses for "new feature" onboarding (e.g. the first-time pointer that introduced the Customizer). Useful in plugins for: announcing a new admin menu item after a version bump, drawing attention to a moved button, first-time-tour-style hints.

Handle `wp-pointer` is registered at `wp-includes/script-loader.php:860` and depends on `jquery-ui-core`. The matching stylesheet `wp-pointer` is registered at `:1655` and depends on `dashicons` — enqueue both.

### Dismissal persistence pattern

The hard part isn't showing the pointer; it is not showing it again after dismissal. Core stores dismissed pointer slugs in `dismissed_wp_pointers` user meta. Enqueue `wp-pointer` + style only when the slug is not already dismissed, then POST `{ action: 'dismiss-wp-pointer', pointer: slug }` in the pointer `close` callback. See `reference.md` for the full safe-content example.

## Combining multiple controls on one page

The handles compose cleanly — declare them all as deps, init each in DOM-ready. WP loads each only once even if multiple scripts depend on it.

```php
wp_enqueue_script( 'wp-color-picker' );
wp_enqueue_style( 'wp-color-picker' );
wp_enqueue_script( 'jquery-ui-datepicker' );
wp_enqueue_style( 'myplugin-datepicker' );
wp_enqueue_script(
    'myplugin-fields',
    plugins_url( 'assets/fields.js', MYPLUGIN_FILE ),
    array( 'wp-color-picker', 'jquery-ui-datepicker', 'jquery-ui-autocomplete', 'wp-api-fetch', 'wp-i18n' ),
    MYPLUGIN_VERSION,
    array( 'in_footer' => true )
);
```

## Critical rules

- **Always enqueue the matching stylesheet** for `wp-color-picker` and `wp-pointer`. The script-only enqueue renders unstyled.
- **jQuery UI datepicker has NO default WP stylesheet**. You ship one or the picker renders as an ugly unstyled table.
- **`dateFormat` uses jQuery UI's syntax**, not PHP's. `yy-mm-dd`, not `Y-m-d`. The capitalization differs and silently produces wrong dates.
- **Add `autocomplete="off"` to datepicker / autocomplete inputs** to prevent browser-native overlays from competing with the widget.
- **Sanitize server-side regardless of the widget**. The widget is UX, not a validation layer — users can edit the value with DevTools, paste arbitrary text, or disable JS.
- **For pointers, use core's `dismiss-wp-pointer` AJAX action**, not a custom one. The user-meta key `dismissed_wp_pointers` is what every other dismissed pointer in WP uses; matching the convention means a clean uninstall (you can remove your slug from the CSV in your uninstaller).
- **Pointer slugs must be `sanitize_key()`-safe**. Use lowercase letters, numbers, and underscores, or core's dismissal handler rejects the request.
- **Don't init `wpColorPicker` while its input is inside a hidden container** — Iris reads computed dimensions at init time. Init AFTER the containing tab/accordion is shown, or call `.iris('refresh')` on the input after revealing it.

## Common AI mistakes

See `reference.md` for before/after snippets: script without stylesheet, unstyled datepicker, PHP date formats in jQuery UI, returning a Promise from autocomplete `source`, and pointer UI with no dismissal persistence.

## Cross-references

- See **`wp-admin-codemirror`** for the syntax-highlighted textarea variant — different API (`wp.codeEditor.initialize`) but same general "enqueue + init at DOM-ready" rhythm.
- See **`wp-admin-media-frame`** for the picker that lives next to these on most settings pages.
- See **`wp-admin-settings-api`** for routing the field values through `register_setting()` + `sanitize_callback`.
- See **`wp-plugin-assets-loading`** for the `$hook_suffix` gate that keeps these out of every admin page.

## What this skill does NOT cover

- React/Gutenberg form controls (`@wordpress/components` Color Picker, Date Picker, etc.). Different API stack — `<ColorPicker>` not `wpColorPicker`, lives in the block editor or a custom React island.
- Range slider, time picker, file picker. WP doesn't ship dedicated widgets for these in classic admin — for a range, an `<input type="range">` works fine; for time, the HTML5 `<input type="time">` does the job.
- Customizer color / date controls (`wp.customize.ColorControl`). Different abstraction over the same picker.

## References

- `wp-admin/js/color-picker.js:23` — `wpColorPicker` widget definition with `options` defaults.
- `wp-includes/js/wp-pointer.js:12` — `$.widget('wp.pointer', ...)` definition.
- `wp-includes/script-loader.php:1502` — `wp-color-picker` script handle registration (depends on `iris`).
- `wp-includes/script-loader.php:860` — `wp-pointer` script handle (depends on `jquery-ui-core`).
- `wp-includes/script-loader.php:937-939` — `jquery-ui-autocomplete` (deps `jquery-ui-menu`, `wp-a11y`) and `jquery-ui-datepicker` (deps `jquery-ui-core`).
- `wp-admin/js/user-suggest.js`, `wp-admin/js/tags-suggest.js` — reference autocomplete implementations for users/tags.
- `reference.md` — autocomplete source shapes, pointer dismissal example, and common mistakes.
