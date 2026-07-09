---
name: wp-plugin-architecture
description: Designs and reviews the internal architecture of a WordPress
  plugin — `src/` folder layout, Composer PSR-4 one-class-per-file discipline,
  PascalCase filenames matching class names, no `class-*.php` legacy layout,
  Schema/Constants placement, composition-root vs singleton decisions,
  conditional asset enqueueing, script config via wp_add_inline_script, and
  prefixed custom-hook naming. Use when scaffolding `src/`, reviewing class
  organization, migrating from `includes/class-*.php`, checking composer.json
  namespace mappings, asset enqueue code, repeated strings, or "should I make
  this a singleton" decisions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.3 - 7.0"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://developer.wordpress.org/reference/functions/wp_enqueue_script/
  - https://developer.wordpress.org/reference/functions/wp_add_inline_script/
  - https://developer.wordpress.org/reference/hooks/admin_enqueue_scripts/
---

# WordPress plugin: internal architecture

How the plugin organizes itself **inside `src/`** once the bootstrap (see `wp-plugin-bootstrap`) and lifecycle (see `wp-plugin-lifecycle`) are in place. The bootstrap is the launcher; this skill is the engine layout.

Use `src/` as the default PSR-4 root for new plugins. Treat `includes/` and `class-*.php` filenames as legacy patterns to audit or migrate, not as a scaffold target.

Out of scope: bootstrap-file content, activation / deactivation / uninstall, cron specifics, REST endpoint design — covered by sibling skills.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding the `src/` folder of a new plugin.
- Reviewing the class layout in a PR — folder structure, where things live, what's reused.
- Migrating old `includes/class-my-plugin-foo.php` files to Composer PSR-4.
- Deciding whether a meta key / option name belongs in a class const, a `Schema.php`, or a PHP enum.
- Reviewing asset enqueue code — wrong hook, missing dependencies, unconditional loading.
- The user asks "should this be a singleton" or "where should this constant live".

## Folder layout — by-type or by-feature

There are two reasonable organizational schemes for `src/`. Pick one and stay consistent.

**By-type** (group classes by their WP role). Works for small-to-medium plugins (≤ 15 classes, 1-3 features):

```
src/
├── Plugin.php              # composition root / wiring
├── Schema.php              # central constants
├── Admin/                  # admin screens / list tables / settings
├── Content/                # CPTs / taxonomies
├── Frontend/               # shortcodes / frontend app shell / assets
├── Rest/                   # REST controllers
├── Setup/                  # Activator / Deactivator
└── Api/                    # external HTTP clients
```

**By-feature** (group everything that belongs to a feature together). Scales better past 3-4 distinct features:

```
src/
├── Plugin.php
├── Schema.php
├── Documents/
│   ├── DocumentPresenter.php
│   ├── DocumentRepository.php
│   └── DocumentService.php
├── Folders/
│   └── FolderService.php
├── Rest/
│   ├── DocumentsController.php
│   └── FoldersController.php
└── Frontend/
    ├── Assets.php
    └── ListShortcode.php
```

The wrong move is **mixing both** in the same plugin. A reader gets confused, an AI gets lost, and refactors become tedious. By-type is fine until it isn't — when a third feature ships and `Actions/` has 9 classes from 3 unrelated domains, switch the whole plugin to by-feature.

**Hard rule across both styles:** one class per file, file name matches class name (`FolderService.php` -> `final class FolderService`), PSR-4 maps `<RootNamespace>\Folders\FolderService` to `src/Folders/FolderService.php`. The kebab-case `class-folder-service.php` filename is a holdover from old WordPress procedural scaffolds; modern Composer plugins use PascalCase files that match the class.

Composer mapping:

```json
{
    "autoload": {
        "psr-4": {
            "MyPlugin\\": "src/"
        }
    }
}
```

## Centralization — `Schema` / `Constants` is non-negotiable

Every string that appears more than once — meta key, option name, custom hook name, cron event name, CPT slug, capability slug, transient prefix — lives in **one place**. Three patterns that all work:

### Class const on the feature class

```php
class UsageTracker {
    public const OPTION_PREFIX = 'myplugin_usage_';

    public static function current_month_key(): string {
        return self::OPTION_PREFIX . gmdate( 'Y_m' );
    }
}
```

When the constant logically belongs to one feature, define it there. Cleanest scope.

### Dedicated `Schema` class for cross-feature constants

```php
namespace MyPlugin;

final class Schema {
    public const META_FORM_SETTINGS = '_myplugin_form_settings';
    public const OPTION_GLOBAL      = 'myplugin_global_settings';
    public const CPT_LOG            = 'myplugin_log';
    public const CRON_DAILY         = 'myplugin_daily_cleanup';
    public const HOOK_BEFORE_REQUEST = 'myplugin/before_request';

    private function __construct() {} // not instantiable
}
```

Then everywhere: `Schema::META_FORM_SETTINGS` instead of the literal string. Renaming becomes one-line; typos become impossible (the class autoloader catches them).

### PHP 8.1+ enum for typed value sets

For a fixed value set (failure modes, output types, etc.), use enums only when
the plugin's declared minimum PHP version is 8.1 or higher:

```php
enum FailureMode: string {
    case Halt        = 'halt';
    case Permissive  = 'permissive';
    case Restrictive = 'restrictive';
}

// Then instead of error-prone string parsing:
$mode = FailureMode::tryFrom( $raw ) ?? FailureMode::Halt;
```

Type-safe, enumerable, documents itself.

For PHP 7.4 / 8.0-compatible plugins, use class constants plus explicit
validation instead:

```php
final class FailureMode {
    public const HALT        = 'halt';
    public const PERMISSIVE  = 'permissive';
    public const RESTRICTIVE = 'restrictive';

    public static function normalize( string $raw ): string {
        return in_array( $raw, self::all(), true ) ? $raw : self::HALT;
    }

    public static function all(): array {
        return array( self::HALT, self::PERMISSIVE, self::RESTRICTIVE );
    }
}
```

**The hard rule:** if you find yourself typing the same magic string in two files, that's the moment to centralize. The wrong direction is "I'll only have it in two places, no need yet" — `git grep` next year proves the lie.

## Singleton discipline — composition root yes, everything else no

The `Plugin` class is often the composition root: one object wires services,
hooks, controllers, settings, and integrations after bootstrap. It MAY expose a
small `instance()` helper when the surrounding plugin style already uses that
pattern, but a singleton is not required. A plain `new Plugin(...)->register()`
from the bootstrap is usually easier to test.

Beyond the composition root, **don't make everything a singleton** by reflex.

- A `SettingsRepository` doesn't need `getInstance()` — instantiate it where you need it (`new SettingsRepository()`); it's cheap.
- A logger MAY be a singleton if it holds connection state (a buffer, a remote handler) — but most plugin loggers wrap `error_log`, which is itself globally available. No state, no singleton.
- An external API client (Stripe, OpenAI, Slack) is NOT a singleton. Inject the API key + dependencies at construction; pass it where it's needed.

The price of singleton-everywhere: tests can't substitute mocks, dependencies become hidden, and you accumulate a `Plugin::instance()->get_storage_manager()->get_provider_registry()` getter chain that nobody can refactor.

When in doubt: write the class as a regular class. Promote to singleton only when there's a concrete reason (genuine global state, expensive lazy initialization shared across many call sites, or compatibility with an existing plugin API).

## Asset enqueueing — conditional, on the right hook

The wrong way: enqueue every script and stylesheet on every page load via `wp_enqueue_scripts`. The right way:

1. **Pick the right hook for the right context.** Verified in WP source:
   - **Frontend pages**: `wp_enqueue_scripts` (`wp-includes/script-loader.php:2311`)
   - **wp-admin pages**: `admin_enqueue_scripts` (`wp-admin/admin-header.php:123`) — receives `$hook_suffix` argument identifying the current admin page
   - **Block editor (Gutenberg)**: `enqueue_block_editor_assets`
   - **Front + back of blocks**: `enqueue_block_assets`
   - **Login screen**: `login_enqueue_scripts`
   - **Customizer preview**: `customize_preview_init`

2. **Gate by context** inside the hook callback:
   ```php
   add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
       // Only on the plugin's own settings page
       if ( $hook_suffix !== 'settings_page_myplugin' ) {
           return;
       }
       wp_enqueue_script( /* ... */ );
   } );
   ```
   For frontend, gate by `is_singular()` / `has_block( 'myplugin/contact' )` / specific shortcodes.

3. **Always declare dependencies** — even ones that "feel obvious". `wp-element`, `wp-components`, `wp-i18n`, `wp-hooks`, your own scripts. Without proper deps the script may run before the dependency is defined and break.

4. **Cache-bust deterministically.** Two valid patterns:
   - `filemtime( $script_path )` — perfect during development (every save invalidates cache).
   - The plugin `VERSION` constant — best for production (predictable, changes on release).
   - A hybrid: `defined('SCRIPT_DEBUG') && SCRIPT_DEBUG ? filemtime() : VERSION`.

5. **`$args` array since WP 6.3** — the 5th parameter overloads from a boolean `$in_footer` to an array supporting `strategy` (`'defer'` or `'async'`), `in_footer`, and `fetchpriority` (since 6.9). Use `'strategy' => 'defer'` instead of jQuery-era ready-handlers when feasible.

### `wp_add_inline_script` preferred over `wp_localize_script` for new code

`wp_localize_script` (since 2.2; defined in `wp-includes/functions.wp-scripts.php`) creates a JavaScript object from an associative array. It still works, but for arbitrary runtime config it is a legacy-shaped helper: it requires an array payload and creates a top-level global. Use `wp_set_script_translations()` for JavaScript translations.

`wp_add_inline_script` (since 4.5; defined in `wp-includes/functions.wp-scripts.php`) is the modern path: any JS string, before or after the registered script. Use `wp_json_encode()` to serialize structured data:

```php
wp_add_inline_script(
    'myplugin-editor',
    'window.MyPluginConfig = ' . wp_json_encode( array(
        'restUrl' => esc_url_raw( rest_url( 'myplugin/v1/' ) ),
        'nonce'   => wp_create_nonce( 'wp_rest' ),
    ) ) . ';',
    'before'
);
```

Both functions still work; for a new plugin, default to `wp_add_inline_script`
for configuration and `wp_set_script_translations()` for script translations.

## Hook naming — prefix everything

Custom action / filter hooks the plugin emits (so other developers can wire into your behavior) follow ONE naming convention, picked once and never deviated from:

```php
// Slash-separated (common in modern plugins and integrations)
do_action( 'myplugin/before_request', $payload );
apply_filters( 'myplugin/api_response', $response, $request );

// Underscore-separated (classic; common in WordPress core)
do_action( 'myplugin_before_request', $payload );
```

Both are common in the ecosystem, but WordPress core itself mostly uses
underscore-separated hook names such as `pre_get_posts` and
`rest_pre_serve_request`. If the project uses WPCS rules that discourage slashes
in hook names, pick underscores. The hard rule: **prefix every custom hook with
the plugin slug**. `do_action( 'before_request', ... )` is a foot-gun —
collisions with other plugins are guaranteed at scale.

When you DO emit a custom hook, give it a docblock right above:

```php
/**
 * Fires before the AI request is sent.
 *
 * @since 1.0.0
 *
 * @param array $payload The request payload (mutable downstream).
 */
do_action( 'myplugin/before_request', $payload );
```

`@since` lets users pin their integration; AI assistants reading the source rely on these to suggest correct hooks.

## Critical rules

- **One class per file**, file name matches class name, PSR-4 namespace mirrors the folder path.
- **Use `src/` as the default class root**. Keep `includes/` only when preserving an existing legacy plugin layout.
- **Never scaffold `class-*.php` for new code**. Migrate it to `src/Domain/ClassName.php` when touching old files.
- **Pick by-type or by-feature**, never both in the same plugin. Switch styles by refactoring the whole `src/` at once.
- **Centralize every repeated string** (meta keys, option names, hook names, cron events, CPT slugs) in a class const, a `Schema` class, or a PHP 8.1+ enum when the plugin requires PHP 8.1+.
- **Plugin class is a composition root; singleton is optional.** Default all other classes to regular classes; promote to singleton only with a concrete reason.
- **Enqueue conditionally on the right hook** (`wp_enqueue_scripts` / `admin_enqueue_scripts($hook_suffix)` / `enqueue_block_editor_assets`); never enqueue unconditionally in `init`.
- **`wp_add_inline_script` over `wp_localize_script`** for shipping config / JSON to JS. Both work; the inline-script path is the modern default.
- **Prefix every custom hook** with the plugin slug. No collision-prone bare names.
- **`$args` array** in `wp_enqueue_script` (since 6.3) — use `'strategy' => 'defer'` where possible.

## Common mistakes

```php
// WRONG — magic strings scattered across files
update_post_meta( $post_id, '_myplugin_settings', $value ); // file A
get_post_meta( $post_id, '_myplugin_setings', true );        // file B (typo!)

// RIGHT — one source of truth
update_post_meta( $post_id, Schema::META_SETTINGS, $value );

// WRONG — enqueue on init unconditionally
add_action( 'init', function () {
    wp_enqueue_script( 'myplugin-frontend', /* ... */ );
} );
// queues assets in broad request contexts and bypasses page-specific gates

// RIGHT — frontend hook + context gate
add_action( 'wp_enqueue_scripts', function () {
    if ( ! has_block( 'myplugin/contact' ) ) return;
    wp_enqueue_script( 'myplugin-frontend', /* ... */ );
} );

// WRONG — singleton by reflex
final class HttpClient {
    private static ?self $instance = null;
    public static function instance(): self { /* ... */ }
}
// 1 plugin = 1 client, can't test, can't swap base URL per call site

// RIGHT — regular class with explicit dependencies
$client = new HttpClient( $api_key, $base_url );
$client->post( '/things', $payload );

// WRONG — bare hook name
do_action( 'before_save', $data );  // collides with 5 other plugins

// RIGHT
do_action( 'myplugin/before_save', $data );

// WRONG — legacy file/class style in a new plugin
includes/class-folder-service.php
class Folder_Service {}

// RIGHT — Composer PSR-4
src/Folders/FolderService.php
namespace MyPlugin\Folders;
final class FolderService {}
```

## Cross-references

- Run **`wp-plugin-bootstrap`** for the main file (header, autoload, requirements, Plugin bootstrapping).
- Run **`wp-plugin-lifecycle`** for activation / deactivation / `uninstall.php`.
- Run **`wp-security-audit`** on any classes that handle user input — the architecture is irrelevant if the controllers leak.

## What this skill does NOT cover

- Dependency-injection containers (PHP-DI, Symfony Container, etc.). For most WP plugins they're overkill; constructor injection without a container is plenty.
- Service layer architecture beyond "regular class, not singleton" — domain-driven design, hexagonal, etc. are valid choices but are a different conversation.
- Block / Gutenberg-specific architecture (`block.json`, `Edit` / `Save` components) — separate skill territory.
- Test architecture — what kind of tests, where they live, how they boot WP. Adjacent topic, separate skill.
- Performance tuning of asset enqueue (concatenation, defer, preload) beyond what the WP 6.3+ `$args` array enables.

## References

- `wp_enqueue_script`: `wp-includes/functions.wp-scripts.php` — note the `@since 6.3.0` on `$args` array overload.
- `wp_add_inline_script`: `wp-includes/functions.wp-scripts.php` — since WP 4.5.
- `admin_enqueue_scripts` action with `$hook_suffix`: `wp-admin/admin-header.php:123`.
- `wp_enqueue_scripts` action: `wp-includes/script-loader.php:2311`.
- PHP enums: [php.net/manual/en/language.enumerations.php](https://www.php.net/manual/en/language.enumerations.php).
