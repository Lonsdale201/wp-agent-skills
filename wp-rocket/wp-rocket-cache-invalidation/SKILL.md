---
name: wp-rocket-cache-invalidation
description: Programmatically clear WP Rocket cache from a third-party
  plugin / theme when data changes — the public rocket_clean_* function
  family (rocket_clean_post, rocket_clean_files, rocket_clean_term,
  rocket_clean_user, rocket_clean_home, rocket_clean_minify,
  rocket_clean_cache_busting, rocket_clean_domain, rocket_clean_cache_dir).
  Critical detection rule — WP Rocket is a PAID plugin not on Packagist;
  always feature-detect via function_exists('rocket_clean_post') OR
  defined('WP_ROCKET_VERSION') before calling, since not every site
  has it. Never raw-unlink the cache directory or call wp_cache_flush()
  expecting it to clear WP Rocket — wp_cache_flush is WP object cache,
  WP Rocket is FILE cache. The before_*_clean_* / after_*_clean_*
  action lifecycle hooks fire around every clean — useful for audit
  logging, monitoring, custom invalidation chains. Use when integrating
  cache invalidation in a companion plugin, WC integration, custom
  data plugin. Triggers on rocket_clean_, before_rocket_clean,
  after_rocket_clean, "WP Rocket cache invalidate / purge / clear".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wp-rocket
plugin-version-tested: "3.23"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket
  - https://docs.wp-rocket.me/article/2-getting-started
source-refs:
  - wp-content/plugins/wp-rocket/wp-rocket.php
  - wp-content/plugins/wp-rocket/inc/common/purge.php
  - wp-content/plugins/wp-rocket/inc/functions/files.php
---

# WP Rocket: cache invalidation from third-party code

For developers shipping a plugin or theme that mutates content WP Rocket has cached — saving a custom CPT, completing a WooCommerce order, importing data, processing a webhook, scheduling a bulk update. WP Rocket caches HTML to disk (NOT to the WP object cache); raw cache invalidation requires going through the plugin's public API, otherwise stale HTML stays served until the cache TTL or the next save.

> **WP Rocket is a paid plugin**, not on Packagist, not in the WordPress.org plugin directory. Many sites have it; many don't. Every code path that touches `rocket_clean_*` MUST be feature-detected first — otherwise your code fatals on installs without WP Rocket.

## Misconception this skill corrects

> "I'll call `wp_cache_flush()` after my plugin saves data — that clears WP Rocket too."

It doesn't. `wp_cache_flush()` clears the WordPress **object cache** (transients, options, post meta caches in Redis / Memcached / WP_Cache_Object). WP Rocket is a **page cache** that writes static HTML files to disk under `wp-content/cache/wp-rocket/...`. The two are completely independent layers — you can flush the object cache 1000 times and the WP Rocket cached HTML stays untouched.

The right entry point: `rocket_clean_post( $post_id )` if a specific post changed, or one of the more granular `rocket_clean_*` functions for other scenarios. Verified at [wp-content/plugins/wp-rocket/inc/common/purge.php:167](purge.php) and [inc/functions/files.php](files.php).

Other AI-prone misconceptions:

- "I'll just `unlink()` the WP Rocket cache files for this URL." Wrong direction — WP Rocket's filename layout is non-trivial: desktop / mobile / tablet variants, language variants (`/cache/wp-rocket/example.com-en/...`), query-string variants, gzipped variants, webp variants. Manual deletion misses some, leaves stale files, AND skips the `before_/after_` action hooks that other plugins (CDN purgers, Varnish, Cloudflare addons) listen for.
- "`function_exists('rocket_clean_post')` is paranoid; everyone has WP Rocket." No, WP Rocket is paid. ~30% of WP installs use SOME caching plugin; even of those, WP Rocket is one of many. Always feature-detect.
- "`is_plugin_active('wp-rocket/wp-rocket.php')`" is the right check." Half-true. `is_plugin_active()` requires `wp-admin/includes/plugin.php` to be loaded — it's NOT available during early hooks like `plugins_loaded`. `defined('WP_ROCKET_VERSION')` and `function_exists('rocket_clean_post')` work everywhere.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `rocket_clean_*`, `wp_cache_flush()`, `rocket_*` cache operations, OR raw filesystem operations against `wp-content/cache/wp-rocket/`.
- A plugin saves data and the user expects the cached page to refresh.
- WooCommerce / membership / LMS plugin invalidation flows (e.g. user enrolls in a course → cached course page shows old "no access" state).
- Reviewing PR code that hooks `save_post` / `transition_post_status` / `woocommerce_*` events and wants to invalidate cache.
- Custom CPT integration where post-save → page invalidation is needed.
- Bulk import / migration scripts that should NOT churn the cache during the import (delay invalidation to the end).

## Plugin identity (verified)

| Field | Value |
|---|---|
| Plugin | WP Rocket |
| Version | 3.23 (Code name "Iego") |
| Min WP | 5.8 |
| Min PHP | 7.4 |
| Tested up to | WP 6.3.1 |
| Distribution | **Paid / premium** — not on Packagist, not on WP.org repo |
| Constants | `WP_ROCKET_VERSION`, `WP_ROCKET_SLUG = 'wp_rocket_settings'`, `WP_ROCKET_PHP_VERSION`, `WP_ROCKET_WP_VERSION` |
| Text domain | `rocket` |
| Cache type | **File-based page cache** (HTML written to disk) — NOT object cache |

## Public cache-invalidation API (verified)

All functions live in [wp-content/plugins/wp-rocket/inc/functions/files.php](files.php) except `rocket_clean_post` which is in [inc/common/purge.php](purge.php).

| Function | Args | What it clears |
|---|---|---|
| `rocket_clean_post( $post_id, $post = null )` | int post ID, optional WP_Post | Cached HTML for this post + its archive(s) + home (per built-in logic) |
| `rocket_clean_files( $urls, $filesystem = null, $run_actions = true )` | string or array of URLs | Cached HTML for arbitrary URLs (e.g. category archives, custom permalinks) |
| `rocket_clean_term( $term_id, $taxonomy_slug )` | int + string | Taxonomy archive page |
| `rocket_clean_user( $user_id, $lang = '' )` | int + optional lang code | User-specific cache (logged-in user dynamic cookies) |
| `rocket_clean_home( $lang = '' )` | optional lang code | Homepage cache only |
| `rocket_clean_home_feeds()` | none | Home feed cache |
| `rocket_clean_domain( $lang = '', $filesystem = null )` | optional lang + filesystem | **Everything for the domain** — the nuke option |
| `rocket_clean_cache_dir()` | none | The entire cache directory (across domains on multisite) |
| `rocket_clean_minify( $extensions = ['js', 'css'] )` | array of extensions | Minified asset cache |
| `rocket_clean_cache_busting( $extensions = ['js', 'css'] )` | array of extensions | Cache-busting versioned static asset files |

## Workflow

### 1. Always feature-detect first

```php
if ( ! function_exists( 'rocket_clean_post' ) ) {
    return;   // WP Rocket not active; skip silently
}

rocket_clean_post( $post_id );
```

OR, with the constant guard:

```php
if ( defined( 'WP_ROCKET_VERSION' ) ) {
    rocket_clean_post( $post_id );
}
```

Both work; the `function_exists` form is more defensive (handles the rare case where WP Rocket is partially loaded). Pick one and stay consistent.

For namespaced PHP code, use a full backslash: `if ( ! \function_exists( 'rocket_clean_post' ) ) return;`.

### 2. Pick the right granularity

| Scenario | Right call |
|---|---|
| One specific post changed (CPT save, comment) | `rocket_clean_post( $post_id )` |
| One specific URL changed (custom permalink, programmatic page) | `rocket_clean_files( [ $url ] )` |
| Taxonomy archive needs refresh (term added / renamed) | `rocket_clean_term( $term_id, $taxonomy )` |
| User profile changed | `rocket_clean_user( $user_id )` |
| Homepage needs refresh (e.g. featured post change) | `rocket_clean_home()` |
| Site-wide change (theme switch, options change) | `rocket_clean_domain()` |
| Asset pipeline change (new minify rule, dev → prod) | `rocket_clean_minify()` + `rocket_clean_cache_busting()` |

**Do not call `rocket_clean_domain()` from frequent events.** It's the heaviest operation; over-using it defeats WP Rocket's whole purpose by constantly re-warming. Reserve it for actually-site-wide changes.

### 3. Hook into post-save events

```php
// Most common pattern — clear when a CPT entry is saved.
add_action( 'save_post_my_cpt', function ( int $post_id, \WP_Post $post, bool $update ): void {
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
        return;
    }
    if ( ! \function_exists( 'rocket_clean_post' ) ) {
        return;
    }
    rocket_clean_post( $post_id );
}, 10, 3 );
```

`save_post_<cpt>` is preferable to plain `save_post` (more specific). Skip revisions and autosaves — both fire `save_post` but neither matters for cache.

### 4. Hook into WooCommerce events

```php
// Order completion → clear product page cache
add_action( 'woocommerce_order_status_completed', function ( int $order_id ): void {
    if ( ! \function_exists( 'rocket_clean_post' ) ) {
        return;
    }
    $order = wc_get_order( $order_id );
    if ( ! $order ) {
        return;
    }
    foreach ( $order->get_items() as $item ) {
        $product_id = $item->get_product_id();
        if ( $product_id ) {
            rocket_clean_post( $product_id );   // each ordered product's page
        }
    }
}, 20, 1 );
```

Reason: stock count changes after a sale; cached product pages show stale stock. WP Rocket has its own WC integration but third-party plugins that touch stock or display cached prices need their own invalidation.

### 5. Bulk imports — defer invalidation

```php
function my_import_posts( array $records ): void {
    // Suppress WP Rocket's automatic purges during the import.
    add_filter( 'rocket_is_importing', '__return_true' );

    foreach ( $records as $record ) {
        wp_insert_post( $record );
    }

    // Restore + nuke once.
    remove_filter( 'rocket_is_importing', '__return_true' );

    if ( \function_exists( 'rocket_clean_domain' ) ) {
        rocket_clean_domain();
    }
}
```

For a 10K-post import, calling `rocket_clean_post()` per-row generates 10K cache wipes + 10K filesystem operations. One `rocket_clean_domain()` at the end is orders of magnitude faster.

### 6. Lifecycle action hooks for monitoring

Verified in [inc/functions/files.php](files.php) and [inc/common/purge.php](purge.php) — the public clean functions fire `before_*` and `after_*` actions:

| Function | Actions fired |
|---|---|
| `rocket_clean_post` | `before_rocket_clean_post`, `after_rocket_clean_post` |
| `rocket_clean_files` | `before_rocket_clean_files`, `after_rocket_clean_files` (per URL: `before_rocket_clean_file`, `after_rocket_clean_file`) |
| `rocket_clean_term` | `before_rocket_clean_term`, `after_rocket_clean_term` |
| `rocket_clean_user` | `before_rocket_clean_user`, `after_rocket_clean_user` |
| `rocket_clean_home` | `before_rocket_clean_home`, `after_rocket_clean_home` |
| `rocket_clean_home_feeds` | `before_rocket_clean_home_feeds`, `after_rocket_clean_home_feeds` |
| `rocket_clean_domain` | per URL: `before_rocket_clean_domain`, `after_rocket_clean_domain`; after the full run: `rocket_after_clean_domain` |
| `rocket_clean_minify` | `before_rocket_clean_minify`, `after_rocket_clean_minify` |
| `rocket_clean_cache_busting` | `before_rocket_clean_busting`, `after_rocket_clean_cache_busting` |
| `rocket_clean_cache_dir` | `before_rocket_clean_cache_dir`, `after_rocket_clean_cache_dir` |

Use these for:

- **CDN purges** triggered by cache wipes (`after_rocket_clean_post` → call your CDN API).
- **Audit logging** — record cache-invalidation events with the post / URL info.
- **Custom invalidation chains** — when post X changes, also invalidate URL Y.

```php
// Audit log — every invalidation
add_action( 'after_rocket_clean_domain', function ( string $root, string $lang, string $url ): void {
    do_action( 'qm/info', "WP Rocket: domain cache cleared for {$url} (lang: {$lang})" );
}, 10, 3 );

// Trigger Cloudflare purge after WP Rocket clears a post
add_action( 'after_rocket_clean_post', function ( $post, array $purge_urls ): void {
    foreach ( $purge_urls as $url ) {
        my_cloudflare_purge( $url );
    }
}, 10, 2 );
```

### 7. Multisite considerations

`rocket_clean_domain( $lang )` clears the cache for the **current site's domain**. On multisite, switching context first:

```php
foreach ( get_sites() as $site ) {
    switch_to_blog( $site->blog_id );
    if ( \function_exists( 'rocket_clean_domain' ) ) {
        rocket_clean_domain();
    }
    restore_current_blog();
}
```

`rocket_clean_cache_dir()` clears the entire cache directory on disk — across all blogs at once. Use for "I'm activating WP Rocket-affecting changes globally" (theme switch, network-wide settings rollout).

### 8. The `$run_actions` flag in `rocket_clean_files`

Verified at [inc/functions/files.php:547](files.php) — `rocket_clean_files( $urls, $filesystem = null, $run_actions = true )`. The third arg defaults to `true` — fires the `before_/after_` hooks per file. Pass `false` for silent purge if you're calling it from inside another `after_rocket_clean_*` hook (avoids infinite recursion).

```php
add_action( 'after_rocket_clean_post', function ( $post, array $purge_urls ) {
    // Don't fire actions on these supplementary cleans (we're already inside an action)
    rocket_clean_files( [ home_url( '/related-feed' ) ], null, $run_actions = false );
}, 10, 2 );
```

## Critical rules

- **Always feature-detect** with `function_exists('rocket_clean_post')` or `defined('WP_ROCKET_VERSION')`. WP Rocket is paid; not every site has it.
- **`wp_cache_flush()` does NOT clear WP Rocket cache.** Two different layers — object cache vs file cache.
- **`is_plugin_active('wp-rocket/wp-rocket.php')` requires `wp-admin/includes/plugin.php`** — not available during early hooks. Use `defined` / `function_exists` instead.
- **Pick the smallest granularity that covers the change.** `rocket_clean_post` over `rocket_clean_domain` for a single-post change.
- **Skip revisions / autosaves** when hooking `save_post` — they fire but don't change visible content.
- **Defer invalidation during bulk imports** — temporarily return `true` from `rocket_is_importing`, insert posts, remove the filter, then call `rocket_clean_domain` once.
- **Don't call `rocket_clean_domain` from high-frequency events.** Defeats WP Rocket's purpose.
- **Use `$run_actions = false`** in `rocket_clean_files` when calling from inside another action handler to avoid recursion.
- **Multisite: `switch_to_blog` + `restore_current_blog`** around the cache call when iterating sites.
- **Never raw-`unlink()` the cache files.** Filename layout is non-trivial (desktop / mobile / lang / query-string variants); manual deletion leaves stale variants.
- **`rocket_clean_minify` and `rocket_clean_cache_busting`** are for CSS / JS asset pipeline changes, not for HTML cache.

## Common mistakes

```php
// WRONG — wp_cache_flush expecting WP Rocket to clear
function my_save_handler( $post_id ): void {
    update_post_meta( $post_id, 'foo', 'bar' );
    wp_cache_flush();   // WRONG: only clears object cache, not WP Rocket file cache
}

// RIGHT
function my_save_handler( $post_id ): void {
    update_post_meta( $post_id, 'foo', 'bar' );
    if ( \function_exists( 'rocket_clean_post' ) ) {
        rocket_clean_post( $post_id );
    }
}

// WRONG — raw filesystem deletion
function my_clear() {
    $cache_dir = WP_CONTENT_DIR . '/cache/wp-rocket/example.com';
    array_map( 'unlink', glob( $cache_dir . '/*.html' ) );   // WRONG: misses mobile / lang / qs variants
}

// RIGHT
if ( \function_exists( 'rocket_clean_domain' ) ) {
    rocket_clean_domain();
}

// WRONG — is_plugin_active during plugins_loaded
add_action( 'plugins_loaded', function () {
    if ( is_plugin_active( 'wp-rocket/wp-rocket.php' ) ) {   // WRONG: fatal — function not loaded
        // ...
    }
} );

// RIGHT
add_action( 'plugins_loaded', function () {
    if ( ! defined( 'WP_ROCKET_VERSION' ) ) return;
    // ...
}, 11 );

// WRONG — clean_domain on every post save
add_action( 'save_post', function ( $post_id ) {
    if ( \function_exists( 'rocket_clean_domain' ) ) {
        rocket_clean_domain();   // WRONG: nukes the entire site cache for one post change
    }
} );

// RIGHT — granular
add_action( 'save_post', function ( $post_id ) {
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
    if ( \function_exists( 'rocket_clean_post' ) ) {
        rocket_clean_post( $post_id );
    }
} );

// WRONG — no autosave / revision skip
add_action( 'save_post', function ( $post_id ) {
    rocket_clean_post( $post_id );   // fires on every keystroke during autosave
} );

// RIGHT
if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
rocket_clean_post( $post_id );

// WRONG — clean inside a clean (recursion)
add_action( 'after_rocket_clean_post', function ( $post ) {
    rocket_clean_files( [ get_permalink( $post->ID ) ] );   // WRONG: fires after_rocket_clean_files which can re-trigger
} );

// RIGHT — pass $run_actions = false
add_action( 'after_rocket_clean_post', function ( $post ) {
    rocket_clean_files( [ get_permalink( $post->ID ) ], null, false );
} );

// WRONG — bulk import without deferral
foreach ( $records as $record ) {
    wp_insert_post( $record );
    rocket_clean_post( /* ... */ );   // WRONG: N cache wipes for N records
}

// RIGHT — defer to one nuke
add_filter( 'rocket_is_importing', '__return_true' );
foreach ( $records as $record ) {
    wp_insert_post( $record );
}
remove_filter( 'rocket_is_importing', '__return_true' );
if ( \function_exists( 'rocket_clean_domain' ) ) {
    rocket_clean_domain();
}

// WRONG — assume one implicit home clean covers every language variant
rocket_clean_home();   // ambiguous on multilingual sites; depends on the active i18n integration/context

// RIGHT — iterate the active language codes from WPML / Polylang / TranslatePress
foreach ( [ 'en', 'de', 'fr' ] as $lang ) {
    rocket_clean_home( $lang );
}
```

## Cross-references

- Run **`wp-rocket-cache-rejection-and-filters`** when the answer isn't "clear cache after change" but "PREVENT this URL / path from being cached at all".
- Run **`wp-rocket-mcp-and-abilities`** when the task is exposing WP Rocket settings to AI/MCP (the `wp-rocket/get-options` & `wp-rocket/set-option` abilities, the `/oauth/*` MCP OAuth server, or the `rocket_mcp_*` / `rocket_enable_abilities` filters) — new in 3.23.
- Run **`wp-plugin-cron`** when invalidation is scheduled / batched (Action Scheduler, WP-Cron) — combine with `rocket_clean_*` calls in the cron handler.
- Run **`wcs-renewal-scheduler`** if cache-invalidation triggers come from WC Subscription renewal events.
- Run **`wp-plugin-options-storage`** when deciding "should I cache this manually OR let WP Rocket handle it" — most often: let WP Rocket do it.

## What this skill does NOT cover

- **WP Rocket settings UI / admin pages.** Out of scope; integrators don't touch UI.
- **Internal `Engine/` classes.** Private; signatures change between versions. Use the public functions.
- **The WP Rocket REST API** (admin-side, paid). Not designed for third-party invalidation.
- **`.htaccess` rewrite rules** WP Rocket installs. Server-config concern; integrators don't modify these.
- **Cloudflare / Varnish / CDN-specific addons.** Each has its own surface; this skill is core WP Rocket only.
- **`rocket_buffer` filter** for HTML output manipulation. Niche + dangerous; covered in `wp-rocket-cache-rejection-and-filters` with strong warnings.
- **License / activation key handling.** Premium-specific; not integrator-facing.

## References

- Plugin entry: [wp-content/plugins/wp-rocket/wp-rocket.php](wp-rocket.php) — version constants, header.
- `rocket_clean_post`: [inc/common/purge.php:167](purge.php) — handles auto-draft / draft / nav_menu_item / attachment skips, fires `before_/after_rocket_clean_post`.
- `rocket_clean_files`: [inc/functions/files.php:547](files.php) — `$run_actions` third arg controls whether `before_/after_rocket_clean_files` and per-URL `before_/after_rocket_clean_file` fire.
- `rocket_clean_home`: [inc/functions/files.php:679](files.php).
- `rocket_clean_domain`: [inc/functions/files.php:821](files.php).
- `rocket_clean_term`: [inc/functions/files.php:924](files.php).
- `rocket_clean_user`: [inc/functions/files.php:996](files.php).
- `rocket_clean_cache_dir`: [inc/functions/files.php:1060](files.php).
- `rocket_clean_minify`: [inc/functions/files.php:354](files.php).
- WP Rocket plugin compatibility doc: [https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket](https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket).
