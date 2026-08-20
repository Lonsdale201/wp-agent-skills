---
name: wp-plugin-bootstrap
description: Scaffolds and reviews the main entry-point PHP file of a
  WordPress plugin — header (with Requires Plugins for WP 6.5+),
  ABSPATH guard, file/path/url/version constants, Composer PSR-4 autoload
  with `src/` as the default class root, optional scoped fallback for release
  ZIP safety, PascalCase class filenames that match class names, no
  `class-*.php` legacy layout, register_activation_hook requirements check,
  Plugin class bootstrapping on plugins_loaded, and the WP 6.7+ rule that
  translation functions must not trigger before after_setup_theme. Use when
  scaffolding a new plugin or reviewing its main file. Triggers on Plugin Name
  headers, register_activation_hook, Requires Plugins, spl_autoload_register,
  plugins_loaded, composer.json at the plugin root, `src/Plugin.php`, or legacy
  `includes/class-*.php` files.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.5 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
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
- Migrating away from legacy `includes/class-my-plugin-foo.php` files toward `src/Foo.php` / `src/Domain/FooService.php`.

The diff or file most likely contains: a `Plugin Name:` header, `register_activation_hook`, `register_deactivation_hook`, `spl_autoload_register`, `defined('ABSPATH')`, `plugins_loaded`, `Requires Plugins`, or a `composer.json` at the plugin root.

## Hook firing order

Core loads active plugin files after `muplugins_loaded`, then fires
`plugins_loaded`, `after_setup_theme`, and `init`. Two practical rules:

- **Top-level code in the bootstrap file is normal and expected.** `add_action()` / `add_filter()` registrations at top level are fine — that's how plugins wire themselves into WP. What you should NOT do at top level: business logic, DB writes, calls to other plugins' functions (they may not be loaded yet), request-dependent work, or anything that triggers translation. Anything that needs other plugins available, or runtime context, goes inside a `plugins_loaded` callback.
- **Translation calls (`__()`, `_e()`, `esc_html__`, etc.) must NOT run before `after_setup_theme`** on WP 6.7+. The just-in-time translation loader (`wp-includes/l10n.php:1380` `_load_textdomain_just_in_time`) emits `_doing_it_wrong` if a translation function triggers it before `after_setup_theme`. Bootstrap-phase strings (PHP version errors, requirement messages built during plugin file load or in a `plugins_loaded` callback) must be raw English.

Read `references/bootstrap-contracts-and-mistakes.md` for the verified sequence
and review examples.

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

// Autoloader — Composer first, optional scoped PSR-4 fallback for ZIP installs.
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
    $file     = MYPLUGIN_PLUGIN_PATH . 'src/'
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

That single file is the **entire** entry-point. Everything else lives in `src/` under the `MyPlugin\` namespace, autoloaded. A class named `MyPlugin\Folders\FolderService` lives in `src/Folders/FolderService.php`, not `includes/class-folder-service.php`.

## Critical rules

### 1. Header fields that matter in 2026

The authoritative list is parsed by `get_plugin_data()`. Core needs `Plugin
Name` for discovery; other headers drive compatibility, dependencies, updates,
i18n, attribution, and directory review. Read
`references/bootstrap-contracts-and-mistakes.md` for the field matrix.

WordPress 7.1 makes `get_file_data()` recognize a header line prefixed by either
`<?php` or the short open tag `<?`. This is parsing compatibility, not a new
recommended bootstrap style: keep the standard `<?php` opening tag and a normal
comment header. Do not use the parser change to justify short open tags, mixed
template syntax, or executable expressions inside metadata.

### 2. Composer + `src/` PSR-4 is the modern default

Composer + PSR-4 autoload is the right choice for any non-trivial plugin in 2026: predictable namespaces, dependency management, dev-only tooling separation (PHPStan, php-cs-fixer), updater libraries vendored cleanly. Treat it as the **strongly recommended baseline**.

Use `src/` as the default class root and PascalCase filenames that match class names. This is the baseline shape:

```
my-plugin/
├── composer.json
├── my-plugin.php
├── src/
│   ├── Plugin.php
│   ├── Schema.php
│   ├── Setup/Activator.php
│   ├── Setup/Deactivator.php
│   ├── Folders/FolderService.php
│   └── Rest/FoldersController.php
└── assets/
```

Do not scaffold `includes/class-my-plugin.php`, `includes/class-folder-service.php`, or WPCS-era class filenames for a new Composer plugin. Those are legacy migration targets, not the default architecture.

Users who install from GitHub directly without `composer install`, or from a ZIP without `vendor/`, will get fatal errors unless the release artifact is built correctly. Prefer:

- **Ship `vendor/` inside the release ZIP.** Gitignore it locally, bake it into the artifact you publish.
- **Optional scoped fallback** for the plugin's own namespace only, mapped to `src/`. This is release insurance, not permission to invent a second filename convention.

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
            "MyPlugin\\": "src/"
        }
    }
}
```

Plus `composer install`, commit `composer.lock`, gitignore `vendor/`, ship `vendor/` inside release ZIPs, and use `composer dump-autoload -o` in the release/build step.

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

### 6. Text-domain — what actually loads a bundled `.mo`

Nothing auto-discovers a plugin's own `languages/` folder by convention. The
global location (`wp-content/languages/plugins/my-plugin-<locale>.mo`) is
searched on every supported version. A **bundled** translation is registered
from the plugin header only on **WP 6.8 and up** — from `Domain Path`, or the
plugin root when that header is absent. On **6.7 and earlier** nothing looks
inside the plugin folder, so a bundled `.mo` silently never loads without an
explicit `load_plugin_textdomain()` call. `Domain Path` is load-bearing, not
decoration: omit it and even 6.8+ registers the plugin root, leaving a
`languages/` subfolder invisible.

Do not translate values during plugin-file load, `plugins_loaded`, or
activation. Read the i18n section in
`references/bootstrap-contracts-and-mistakes.md` before adding
`load_plugin_textdomain()` or diagnosing an early-translation notice.

### 7. The bootstrap file does NOT contain business logic

It contains: header, ABSPATH guard, constants, autoload, activation/deactivation hook registrations, the `plugins_loaded` instantiation. Maybe 100-200 lines.

It does NOT contain: classes, business logic, hook callbacks beyond bootstrap, custom helper functions used elsewhere, asset enqueueing. All of those belong in dedicated class files under `src/`.

If you find a bootstrap file pushing 400+ lines, move logic out. The bootstrap is a launcher, not the engine.

## Composer-free path (legacy/minority)

If Composer is unavailable, preserve the same namespace-to-`src/` and
PascalCase filename convention with a plugin-scoped autoloader. See the
reference for the trade-off; do not revive `class-*.php` for new code.

## Common mistakes

Read `references/bootstrap-contracts-and-mistakes.md` when reviewing dependency
calls, early translations, requirements, class placement, header spelling, or
autoload scope.

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

- Header matrix, load order, and review examples:
  `references/bootstrap-contracts-and-mistakes.md`.
- Plugin header reference: [Header Requirements](https://developer.wordpress.org/plugins/plugin-basics/header-requirements/)
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
- Plugin Dependencies (WP 6.5): [make.wordpress.org announcement](https://make.wordpress.org/core/2024/03/05/introducing-plugin-dependencies-in-wordpress-6-5/)
- `register_activation_hook`: [developer.wordpress.org](https://developer.wordpress.org/reference/functions/register_activation_hook/)
- `is_php_version_compatible` / `is_wp_version_compatible`: `wp-includes/functions.php`
- `validate_plugin_requirements`: `wp-admin/includes/plugin.php` — what WP runs before activating your plugin.
- Just-in-time translation loader (the `_doing_it_wrong` source): `wp-includes/l10n.php` `_load_textdomain_just_in_time()`.
- Official documentation: <https://developer.wordpress.org/plugins/plugin-basics/best-practices/>
