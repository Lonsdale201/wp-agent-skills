---
name: wp-plugin-bootstrap
description: Scaffolds and reviews the main entry-point PHP file of a
  WordPress plugin — header (with Requires Plugins for WP 6.5+),
  ABSPATH guard, file/path/url/version constants, Composer + PSR-4 with
  manual spl_autoload_register fallback, register_activation_hook
  requirements check, Plugin class instantiation on plugins_loaded,
  and the WP 6.7+ rule that translation functions must not trigger
  before after_setup_theme. Use when scaffolding a new plugin or
  reviewing its main file. Triggers on Plugin Name headers,
  register_activation_hook, Requires Plugins, spl_autoload_register,
  plugins_loaded, or composer.json at the plugin root.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.5 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/plugins/plugin-basics/header-requirements/
  - https://developer.wordpress.org/plugins/plugin-basics/best-practices/
  - https://developer.wordpress.org/reference/functions/register_activation_hook/
  - https://make.wordpress.org/core/2024/03/05/introducing-plugin-dependencies-in-wordpress-6-5/
---

# WordPress plugin: bootstrap (main file)

The single PHP file at the plugin root, named after the plugin folder, that WordPress loads first when the plugin is active. Get this right and the rest of the plugin can be a clean class-based architecture; get it wrong and you ship a plugin that fails activation, leaks runtime errors, or won't update cleanly.

This skill covers ONLY the entry-point file and the immediately-adjacent decisions (composer.json, optional `uninstall.php` reference). Activation cleanup, deactivation cron clear, custom uninstall logic — those are scope for `wp-plugin-lifecycle` (sibling skill).

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a new WordPress plugin from scratch.
- Reviewing the main plugin file in a PR — header, constants, autoload setup, activation hook.
- Migrating an old plugin to WP 6.5+ (Requires Plugins) or WP 6.7+ (i18n timing).
- Debugging activation errors: "Plugin could not be activated", "_doing_it_wrong" notices on `__()` / `_e()`, "Class not found" on first load.
- The plugin is shipping outside wp.org and needs a self-hosted updater.
- Adopting Composer / PSR-4 autoload in a plugin that previously didn't have it (or vice versa, removing the dependency).

The diff or file most likely contains: a `Plugin Name:` header, `register_activation_hook`, `register_deactivation_hook`, `spl_autoload_register`, `defined('ABSPATH')`, `plugins_loaded`, `Requires Plugins`, or a `composer.json` at the plugin root.

## Hook firing order

```
muplugins_loaded -> [active plugin files included; top-level code runs]
  -> plugins_loaded -> after_setup_theme -> init -> ...
```

Verified in `wp-settings.php` ([wp-settings.php:511, 545-571, 593, 720, 742](wp-settings.php)) — `muplugins_loaded` fires first, then WP `include_once`s every active plugin's main file (this is when YOUR top-level code runs), then `plugins_loaded`. Two practical rules:

- **Top-level code in the bootstrap file is normal and expected.** `add_action()` / `add_filter()` registrations at top level are fine — that's how plugins wire themselves into WP. What you should NOT do at top level: business logic, DB writes, calls to other plugins' functions (they may not be loaded yet), request-dependent work, or anything that triggers translation. Anything that needs other plugins available, or runtime context, goes inside a `plugins_loaded` callback.
- **Translation calls (`__()`, `_e()`, `esc_html__`, etc.) must NOT run before `after_setup_theme`** on WP 6.7+. The just-in-time translation loader (`wp-includes/l10n.php:1380` `_load_textdomain_just_in_time`) emits `_doing_it_wrong` if a translation function triggers it before `after_setup_theme`. Bootstrap-phase strings (PHP version errors, requirement messages built during plugin file load or in a `plugins_loaded` callback) must be raw English.

## Anatomy of a clean bootstrap file

```php
<?php
/**
 * Plugin Name:       My Plugin
 * Plugin URI:        https://github.com/you/my-plugin
 * Description:       What this plugin does, in one sentence.
 * Version:           1.0.0
 * Requires at least: 6.5
 * Requires PHP:      8.0
 * Requires Plugins:  jetformbuilder
 * Author:            Your Name
 * Author URI:        https://github.com/you
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-plugin
 * Domain Path:       /languages
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'MYPLUGIN_VERSION', '1.0.0' );
define( 'MYPLUGIN_PLUGIN_FILE', __FILE__ );
define( 'MYPLUGIN_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'MYPLUGIN_PLUGIN_URL',  plugins_url( '/', __FILE__ ) );

const MYPLUGIN_MIN_PHP = '8.0';
const MYPLUGIN_MIN_WP  = '6.5';

// Autoloader — Composer first, manual fallback for ZIP installs.
$autoload = MYPLUGIN_PLUGIN_PATH . 'vendor/autoload.php';
if ( file_exists( $autoload ) ) {
    require $autoload;
}

spl_autoload_register( static function ( string $class ): void {
    $prefix = 'MyPlugin\\';
    if ( 0 !== strpos( $class, $prefix ) ) {
        return;
    }
    $relative = substr( $class, strlen( $prefix ) );
    $file     = MYPLUGIN_PLUGIN_PATH . 'includes/'
        . str_replace( '\\', '/', $relative ) . '.php';
    if ( file_exists( $file ) ) {
        require $file;
    }
} );

register_activation_hook( __FILE__, static function (): void {
    $errors = myplugin_requirement_errors();
    if ( ! empty( $errors ) ) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        deactivate_plugins( plugin_basename( __FILE__ ) );
        wp_die(
            wp_kses_post( implode( '<br>', $errors ) ),
            esc_html__( 'Plugin activation failed', 'my-plugin' ),
            array( 'back_link' => true )
        );
    }
} );

function myplugin_requirement_errors(): array {
    $errors = array();
    if ( ! is_php_version_compatible( MYPLUGIN_MIN_PHP ) ) {
        $errors[] = sprintf(
            'My Plugin requires PHP %s or higher. Current: %s.',
            MYPLUGIN_MIN_PHP,
            PHP_VERSION
        );
    }
    if ( ! is_wp_version_compatible( MYPLUGIN_MIN_WP ) ) {
        $errors[] = sprintf(
            'My Plugin requires WordPress %s or higher.',
            MYPLUGIN_MIN_WP
        );
    }
    return $errors;
}

add_action( 'plugins_loaded', static function (): void {
    \MyPlugin\Plugin::instance( MYPLUGIN_PLUGIN_FILE );
} );
```

That single file is the **entire** entry-point. Everything else lives in `includes/` under the `MyPlugin\` namespace, autoloaded.

## Critical rules

### 1. Header fields that matter in 2026

The authoritative list is in `get_plugin_data()` (`wp-admin/includes/plugin.php`). At the WordPress runtime level **only `Plugin Name` is required** — `get_plugins()` skips files where `$plugin_data['Name']` is empty. Everything else is recommended for usability, wp.org submission, or specific features.

| Field | Status | Purpose |
|---|---|---|
| `Plugin Name` | core-required | Listed in `/wp-admin/plugins.php`; if missing the plugin doesn't appear at all |
| `Plugin URI` | recommended | "Visit plugin site" link |
| `Description` | recommended | One-liner under the name |
| `Version` | recommended | SemVer; should match your `VERSION` constant + `Stable tag` in `readme.txt` |
| `Requires at least` | recommended | WP minimum, enforced at activation |
| `Requires PHP` | recommended | PHP minimum, enforced at activation |
| `Requires Plugins` | 6.5+, recommended | Comma-separated slugs (see Section 3) |
| `Author` / `Author URI` | recommended | Display name + link |
| `Text Domain` | recommended | i18n; defaults to folder slug if omitted (since WP 4.6) |
| `Domain Path` | only if `/languages/` is non-standard | Relative path to `.mo` files |
| `License` / `License URI` | recommended | wp.org submission requires GPL-compatible |
| `Update URI` | only if non-wp.org | Tells WP NOT to overwrite from wp.org if a slug collision occurs |
| `Network` | only if multisite-only | `true` makes the plugin network-wide-only |

For wp.org submission the bar is higher (wp.org review checks for `Description`, `Version`, `License`), but core-runtime-wise the only blocker is `Plugin Name`.

### 2. Composer is the modern default — but pair it with a manual fallback

Composer + PSR-4 autoload is the right choice for any non-trivial plugin in 2026: predictable namespaces, dependency management, dev-only tooling separation (PHPStan, php-cs-fixer), updater libraries vendored cleanly. Treat it as the **strongly recommended baseline**.

But: users who install your plugin from GitHub directly (no `composer install`) or from a ZIP without `vendor/` baked in will get fatal errors. Two responses, both shown in the bootstrap example:

- **Ship `vendor/` inside the release ZIP.** Gitignore it locally, bake it into the artifact you publish.
- **Manual `spl_autoload_register` fallback** for the plugin's OWN classes. ~15 lines, runs only if `vendor/autoload.php` is missing or didn't include your namespace. Insurance against any composer mishap.

A `composer.json` minimum:

```json
{
    "name": "you/my-plugin",
    "description": "What this plugin does.",
    "type": "wordpress-plugin",
    "license": "GPL-2.0-or-later",
    "require": {
        "php": ">=8.0"
    },
    "autoload": {
        "psr-4": {
            "MyPlugin\\": "includes/"
        }
    }
}
```

Plus `composer install`, commit `composer.lock`, gitignore `vendor/`, ship `vendor/` inside release ZIPs.

### 3. `Requires Plugins` since 6.5 — use it, but understand the limits

Add the dependency at the plugin header level:

```
Requires Plugins: jetformbuilder, woocommerce
```

WP surfaces missing dependencies on the plugins screen and prevents activation when they're absent (see `wp-includes/class-wp-plugin-dependencies.php`). This is **layered enforcement** — also keep your runtime requirements check (Section 4) because users on older WP, sites that bypass `validate_plugin_requirements()`, or upgrade scenarios can still get past the header check.

Limits to know:

- **Slug-based, wp.org-resolved by default.** The header is a comma-separated list of **wp.org plugin slugs** — the same identifier used in `wordpress.org/plugins/<slug>/`. WP tries to resolve them against wp.org. For non-wp.org dependencies (a paid plugin, a private internal plugin), the resolution fails and the dependency check effectively can't satisfy itself from the header alone. Workarounds: hook the `wp_plugin_dependencies_slug` filter to map your custom slug to a known one, OR rely on a runtime `class_exists()` / `function_exists()` check inside your activation hook + a `plugins_loaded` priority-ordered guard. (The header is fine as documentation in either case.)
- **No version constraint.** The header takes slugs only. If your plugin needs JFB ≥ 3.5, the runtime check has to enforce that.
- **No loading order guarantee.** WP loads plugins alphabetically by file path; the dependency header doesn't change that. If your plugin's top-level code calls a dependency's function, you may still race. Wire actual interaction inside `plugins_loaded` (or later) where load order is settled.

### 4. Activation hook = one-shot setup, NOT runtime config

`register_activation_hook( __FILE__, $callback )` fires once per activation event — including reactivations. It does NOT fire on plugin updates (use `upgrader_process_complete` for that).

Inside the hook:

- Run requirements check (PHP / WP / dependent plugins).
- On failure: `deactivate_plugins( plugin_basename( __FILE__ ) )` + `wp_die()` with the error message. Do NOT just `return` — the plugin will appear "active" in the database but broken at runtime.
- Seed default options with `add_option()` (which respects existing values), NOT `update_option()` (which overwrites).
- Schedule cron events. (Lifecycle skill covers cron clear on deactivation.)

DO NOT inside the activation hook:
- Register hooks (`add_action`, `add_filter`) for runtime work — those belong in `plugins_loaded` callbacks.
- Run heavy DB schema work without `dbDelta()`.
- Call `current_user_can()` — the activation request HAS a user, but capability state is fragile during the activation event.

### 5. Direct-access guard

Top of every PHP file (bootstrap AND class files):

```php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
```

Class-only files don't crash without it (no top-level execution), but it's a wp.org submission expectation and a defense-in-depth habit. Three lines, zero downside.

### 6. Text-domain on WP 6.5+ — less is more

The plugin header `Text Domain: my-plugin` plus `.mo` files at the conventional location (`<plugin>/languages/my-plugin-<locale>.mo` OR the GlotPress-installed `wp-content/languages/plugins/my-plugin-<locale>.mo`) is **all you need on WP 6.5+**. The `WP_Textdomain_Registry` auto-discovers them.

Call `load_plugin_textdomain()` only when:
- Your `.mo` files live in a non-standard path (custom `Domain Path` pointing somewhere weird).
- You support WP versions older than 6.5 (rare in 2026).

If you do call it, hook on `init`:

```php
add_action( 'init', static function (): void {
    load_plugin_textdomain(
        'my-plugin',
        false,
        dirname( plugin_basename( MYPLUGIN_PLUGIN_FILE ) ) . '/languages'
    );
} );
```

`load_plugin_textdomain()` itself is **safe to call earlier** — on WP 6.7+ it just registers the custom path with the textdomain registry, doesn't actually load anything. The `_doing_it_wrong` notice is triggered by **a translation function (`__()`, `_e()`, `esc_html__`, etc.)** invoking the just-in-time loader before `after_setup_theme` (`wp-includes/l10n.php:1380` `_load_textdomain_just_in_time`). So the hard rule is on the translation calls themselves, not on `load_plugin_textdomain` placement.

Practical rule: **don't translate strings during the bootstrap-phase** (top-level code, `plugins_loaded` callbacks, activation hook callbacks). PHP version errors, requirement failure messages, etc. should be raw English. Render them through `__()` only when the admin notice runs (`admin_notices`, well after `init`). The `init` hook for `load_plugin_textdomain` is convention + future-proof, not strictly required.

### 7. The bootstrap file does NOT contain business logic

It contains: header, ABSPATH guard, constants, autoload, activation/deactivation hook registrations, the `plugins_loaded` instantiation. Maybe 100-200 lines.

It does NOT contain: classes, business logic, hook callbacks beyond bootstrap, custom helper functions used elsewhere, asset enqueueing. All of those belong in dedicated class files under `includes/`.

If you find a bootstrap file pushing 400+ lines, move logic out. The bootstrap is a launcher, not the engine.

## Composer-free path (the minority case)

If Composer is off the table — solo dev, very small plugin, hosting without a build step — the manual `spl_autoload_register` from the bootstrap example carries the plugin alone. Keep PSR-4-style folder layout anyway (`includes/Settings/SettingsTab.php` for `MyPlugin\Settings\SettingsTab`); future-you will Composer-ize without a refactor. Third-party libs you depend on get vendored manually into `vendor/`. You lose the dev tooling (PHPStan, php-cs-fixer) and dependency resolution. Workable for a one-shot plugin, painful by the second.

## Common mistakes

```php
// WRONG — top-level call that depends on another plugin being loaded
// (that plugin's file may not have been included yet at this point)
$jfb_version = jet_form_builder()->version();   // fatal: function not defined

// WRONG — translation called at top level / before after_setup_theme;
// triggers _doing_it_wrong on WP 6.7+
$message = __( 'My Plugin needs PHP 8.0+', 'my-plugin' );
register_activation_hook( __FILE__, function () use ( $message ) {
    if ( PHP_VERSION_ID < 80000 ) wp_die( $message );
} );

// WRONG — missing requirements check; activates anyway with broken state
register_activation_hook( __FILE__, function () {
    // no PHP / WP / dependency check
    update_option( 'myplugin_active', true );
} );

// WRONG — class inside bootstrap file
class MyPlugin_Singleton { /* 200 lines of logic */ }

// WRONG — Plugin URI / Author URI typo'd as singular
* Plugin URL:  https://...    // should be Plugin URI
* Author URL:  https://...    // should be Author URI

// WRONG — unbounded autoload (matches every class in the codebase)
spl_autoload_register( function ( $class ) {
    require_once 'includes/' . $class . '.php';  // namespace pollution
} );
```

## Cross-references

- Run **`wp-plugin-lifecycle`** for activation/deactivation/uninstall depth — cron clear, transient cleanup, `uninstall.php` standalone semantics, multisite-aware cleanup.
- Run **`wp-i18n-audit`** to validate text-domain consistency across all `__()` calls in the plugin (this skill only handles bootstrap-phase i18n).
- Run **`wp-security-audit`** on the activation handler — it's an admin-context write endpoint and benefits from the basic checklist.

## What this skill does NOT cover

- Activation seeding logic (default options, cron schedule, role caps, custom tables) — see `wp-plugin-lifecycle`.
- `uninstall.php` content — see `wp-plugin-lifecycle`.
- Self-hosted updater integration (plugin-update-checker library bootstrap) — adjacent topic, mention the include in the bootstrap above but the configuration goes in your Plugin class.
- readme.txt / wp.org submission format — separate skill (`wp-readme-txt`, planned).
- Block / Gutenberg-only plugins where the entry point is a `block.json` rather than a classic plugin file.

## References

- Plugin header reference: [Header Requirements](https://developer.wordpress.org/plugins/plugin-basics/header-requirements/)
- Plugin Dependencies (WP 6.5): [make.wordpress.org announcement](https://make.wordpress.org/core/2024/03/05/introducing-plugin-dependencies-in-wordpress-6-5/)
- `register_activation_hook`: [developer.wordpress.org](https://developer.wordpress.org/reference/functions/register_activation_hook/)
- `is_php_version_compatible` / `is_wp_version_compatible`: `wp-includes/functions.php`
- `validate_plugin_requirements`: `wp-admin/includes/plugin.php` — what WP runs before activating your plugin.
- Just-in-time translation loader (the `_doing_it_wrong` source): `wp-includes/l10n.php` `_load_textdomain_just_in_time()`.
