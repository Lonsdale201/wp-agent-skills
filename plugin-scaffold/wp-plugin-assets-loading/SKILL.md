---
name: wp-plugin-assets-loading
description: Register and enqueue WordPress plugin scripts/styles with
  modern loading behavior, especially WP 7.0 classic-script module
  dependencies, script module translations, fetchpriority support,
  script module args, footer placement, inline style limits, and removal
  of legacy IE conditional asset support. Covers wp_enqueue_script args
  strategy/in_footer/fetchpriority/module_dependencies,
  wp_register_script_module / wp_enqueue_script_module args,
  wp_set_script_module_translations, wp_script_add_data,
  wp_style_add_data, dependency handles, conditional enqueueing on the
  right hook, and avoiding global frontend/admin asset bloat. Use when
  adding or reviewing plugin JS/CSS enqueue code.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.3 - 7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-05-21"
---

# WordPress Plugin Asset Loading

Use this skill when adding or reviewing plugin JS/CSS enqueue code. The goal is to load the right asset on the right screen, with a correct dependency graph and modern loading hints.

This skill avoids Gutenberg-specific editor development. It covers general WordPress frontend/admin assets.

## When to use this skill

Trigger when ANY of the following is true:

- Code calls `wp_enqueue_script()`, `wp_register_script()`, `wp_enqueue_style()`, `wp_script_add_data()`, `wp_style_add_data()`, `wp_register_script_module()`, or `wp_enqueue_script_module()`.
- A plugin loads assets on every admin page or every frontend request without checking context.
- The task mentions `defer`, `async`, `fetchpriority`, script modules, module translations, `module_dependencies`, inline CSS, asset bloat, or frontend performance.
- Code uses legacy IE conditional comments or `wp_style_add_data( $handle, 'conditional', ... )`.

## Runtime placement

| Context | Hook |
|---|---|
| Frontend scripts/styles | `wp_enqueue_scripts` |
| Admin scripts/styles | `admin_enqueue_scripts` |
| Login page assets | `login_enqueue_scripts` |
| Specific plugin settings page | Check `$hook_suffix` in `admin_enqueue_scripts` |

Do not enqueue admin assets globally unless the UI appears globally.

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }

    wp_enqueue_script(
        'myplugin-admin',
        plugins_url( 'assets/admin.js', MYPLUGIN_FILE ),
        array( 'wp-api-fetch' ),
        MYPLUGIN_VERSION,
        array(
            'in_footer'     => true,
            'strategy'      => 'defer',
            'fetchpriority' => 'low',
        )
    );
} );
```

## Script loading args

Since WP 6.3, the fifth `wp_enqueue_script()` parameter can be an args array. Since WP 6.9, it also accepts `fetchpriority`.
Since WP 7.0, it also accepts `module_dependencies` so a classic script can dynamically import registered script modules.

```php
wp_enqueue_script(
    'myplugin-frontend',
    plugins_url( 'assets/frontend.js', MYPLUGIN_FILE ),
    array(),
    MYPLUGIN_VERSION,
    array(
        'in_footer'     => true,
        'strategy'      => 'defer',
        'fetchpriority' => 'low', // 'auto', 'low', or 'high'.
    )
);
```

Guidance:

- Use `in_footer => true` for non-critical frontend behavior.
- Use `strategy => 'defer'` for scripts that can run after parsing and preserve dependency order.
- Use `strategy => 'async'` only for independent scripts that do not depend on execution order.
- Use `fetchpriority => 'high'` rarely, only for scripts that are genuinely critical to initial rendering.
- Use `fetchpriority => 'low'` for behavior that should not compete with LCP resources.
- If a classic script uses `module_dependencies`, it must either set `in_footer => true` or `strategy => 'defer'`; otherwise it can run before the import map exists.

```php
wp_enqueue_script(
    'myplugin-admin',
    plugins_url( 'assets/admin.js', MYPLUGIN_FILE ),
    array( 'wp-api-fetch' ),
    MYPLUGIN_VERSION,
    array(
        'in_footer'           => true,
        'module_dependencies' => array(
            '@wordpress/abilities',
        ),
    )
);
```

## Script modules

For ES modules, use the Script Modules API on WP 6.5+:

```php
wp_enqueue_script_module(
    'myplugin/frontend',
    plugins_url( 'assets/frontend.js', MYPLUGIN_FILE ),
    array(),
    MYPLUGIN_VERSION,
    array(
        'in_footer'     => true,
        'fetchpriority' => 'low',
    )
);
```

In WP 6.9, `wp_register_script_module()` and `wp_enqueue_script_module()` accept an `$args` array with `in_footer` and `fetchpriority`. Feature-detect if supporting older WP:

```php
if ( function_exists( 'wp_enqueue_script_module' ) ) {
    wp_enqueue_script_module( 'myplugin/frontend', $src, array(), MYPLUGIN_VERSION );
} else {
    wp_enqueue_script( 'myplugin-frontend', $fallback_src, array(), MYPLUGIN_VERSION, array( 'in_footer' => true ) );
}
```

In WP 7.0, registered script modules can have translations:

```php
wp_register_script_module(
    'myplugin/admin',
    plugins_url( 'assets/admin.js', MYPLUGIN_FILE ),
    array(),
    MYPLUGIN_VERSION
);

wp_set_script_module_translations(
    'myplugin/admin',
    'myplugin',
    plugin_dir_path( MYPLUGIN_FILE ) . 'languages'
);

wp_enqueue_script_module( 'myplugin/admin' );
```

Call `wp_set_script_module_translations()` after the module is registered. Use `wp_set_script_translations()` for classic scripts and `wp_set_script_module_translations()` for script modules.

## Styles and legacy conditionals

WP 6.9 removed support for legacy conditional asset loading for Internet Explorer. Do not use `wp_style_add_data( $handle, 'conditional', 'IE' )`; in WP 6.9, a stylesheet with `conditional` data is ignored.

```php
// WRONG on WP 6.9+.
wp_style_add_data( 'myplugin-ie', 'conditional', 'IE' );

// RIGHT - drop legacy IE-only styles, or serve a normal stylesheet if still required.
wp_enqueue_style( 'myplugin-admin', plugins_url( 'assets/admin.css', MYPLUGIN_FILE ), array(), MYPLUGIN_VERSION );
```

Use the `path` style data only when the stylesheet is registered and the file path is absolute:

```php
wp_register_style( 'myplugin-small', plugins_url( 'assets/small.css', MYPLUGIN_FILE ), array(), MYPLUGIN_VERSION );
wp_style_add_data( 'myplugin-small', 'path', plugin_dir_path( MYPLUGIN_FILE ) . 'assets/small.css' );
wp_enqueue_style( 'myplugin-small' );
```

## Inline data

Use `wp_add_inline_script()` for boot data and `wp_set_script_translations()` for translations. Do not use `wp_localize_script()` as a generic JSON dump.

```php
wp_add_inline_script(
    'myplugin-admin',
    'window.mypluginSettings = ' . wp_json_encode( $settings ) . ';',
    'before'
);
```

## Critical rules

- **Register/enqueue on the correct hook** for frontend, admin, or login.
- **Gate admin assets by screen** using `$hook_suffix` or `get_current_screen()`.
- **Use script args arrays**, not the old boolean-only fifth parameter, when setting strategy/footer/fetchpriority.
- **Do not use `async` on dependency-sensitive scripts.**
- **For classic scripts with `module_dependencies`, use footer placement or `defer`.**
- **Use the matching translation API**: `wp_set_script_translations()` for classic scripts, `wp_set_script_module_translations()` for modules.
- **Do not use legacy IE `conditional` data** on styles in WP 6.9+.
- **Do not put `<script>` tags inside `wp_add_inline_script()`.**
- **Prefer dependencies over manual load ordering.**

## Common mistakes

```php
// WRONG - loads everywhere in wp-admin.
add_action( 'admin_enqueue_scripts', static function (): void {
    wp_enqueue_script( 'myplugin-admin', plugins_url( 'admin.js', __FILE__ ) );
} );

// RIGHT - load only where the screen exists.
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }

    wp_enqueue_script(
        'myplugin-admin',
        plugins_url( 'admin.js', __FILE__ ),
        array( 'wp-api-fetch' ),
        '1.0.0',
        array( 'in_footer' => true, 'strategy' => 'defer', 'fetchpriority' => 'low' )
    );
} );

// WRONG - dependency-sensitive code with async.
wp_enqueue_script( 'myplugin-app', $src, array( 'jquery' ), '1.0.0', array( 'strategy' => 'async' ) );

// RIGHT
wp_enqueue_script( 'myplugin-app', $src, array( 'jquery' ), '1.0.0', array( 'strategy' => 'defer' ) );
```

## Cross-references

- Run **`wp-plugin-architecture`** for broader placement of enqueue code inside plugin services.
- Run **`wp-i18n-audit`** when scripts need translations.
- Run **`wp-security-audit`** when inline boot data contains user/admin-controlled values.

## What this skill does NOT cover

- Gutenberg/block editor component development.
- Build tooling such as Vite, webpack, or `@wordpress/scripts`.
- CDN/page-cache strategy.

## References

- WordPress 6.9 frontend performance field guide: <https://make.wordpress.org/core/2025/11/18/wordpress-6-9-frontend-performance-field-guide/>
- Script APIs: `wp-includes/functions.wp-scripts.php`
- Script Modules API: `wp-includes/script-modules.php`
- Style APIs: `wp-includes/functions.wp-styles.php`
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_enqueue_script/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_enqueue_style/>
