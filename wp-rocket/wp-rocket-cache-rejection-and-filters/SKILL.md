---
name: wp-rocket-cache-rejection-and-filters
description: Customize WP Rocket behavior from a third-party plugin /
  theme via filter hooks — exclude URIs / cookies / user agents / REST
  API namespaces from caching, configure CDN URL rewrites, extend lazy
  load handling, override capability requirements, hook into Action
  Scheduler integration. Critical guidance — rocket_cache_reject_uri
  takes URI patterns (regex-like), NOT full URLs; rocket_cache_reject_*
  filters all expect arrays. The rocket_buffer filter is the FULL HTML
  output filter — extremely powerful but dangerous; one fatal error in
  the callback breaks every cached page until WP Rocket is disabled.
  Use when extending WP Rocket's default rules, NOT for cache
  invalidation (see wp-rocket-cache-invalidation). Triggers on
  rocket_cache_reject_, rocket_cdn_, do_rocket_lazyload, rocket_buffer,
  rocket_capacity, "exclude from WP Rocket cache".
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
  - wp-content/plugins/wp-rocket/inc/functions/options.php
  - wp-content/plugins/wp-rocket/inc/Engine/Optimization/Buffer/Optimization.php
  - wp-content/plugins/wp-rocket/inc/Engine/CDN/
  - wp-content/plugins/wp-rocket/inc/Engine/Media/Lazyload/
---

# WP Rocket: cache rejection, filters, and behavior customization

For developers who need to **alter WP Rocket's default behavior** from a third-party plugin or theme — not to clear cache (that's `wp-rocket-cache-invalidation`), but to tell WP Rocket "don't cache THIS", "rewrite assets to MY CDN", "treat THIS as a logged-in cookie", "require THIS capability for settings access". WP Rocket exposes ~200 filter hooks for customization; this skill covers the integrator-relevant subset.

> **Feature-detection still mandatory.** WP Rocket is a paid plugin; not every site has it. Filter callbacks fail silently if WP Rocket isn't active (the filter never fires), so detection is less critical here than for direct function calls — but adding the filter wastes nothing if the plugin is missing.

## Misconception this skill corrects

> "I'll add `rocket_cache_reject_uri` filter with a full URL like `https://site.com/api/foo` — that excludes my endpoint."

Wrong format. Verified at [wp-content/plugins/wp-rocket/inc/functions/options.php:243](options.php), the filter takes **URI patterns** (path fragments, regex-style), NOT full URLs. WP Rocket compiles them into a regex and matches against the request path without the host:

```php
// WRONG
add_filter( 'rocket_cache_reject_uri', function ( $uris ) {
    $uris[] = 'https://site.com/api/foo';   // never matches anything
    return $uris;
} );

// RIGHT
add_filter( 'rocket_cache_reject_uri', function ( $uris ) {
    $uris[] = '/api/foo(/.*)?';   // path-only, regex-style; matches /api/foo and any subpath
    return $uris;
} );
```

The `(/.*)?` suffix is the WP Rocket convention for "this prefix and anything below it". Plain `/api/foo` matches only the exact `/api/foo`, not `/api/foo/bar`. Plus `/api/.+` matches any path under `/api/`.

Other AI-prone misconceptions:

- "`rocket_cache_reject_uri` excludes ALSO the WP REST API." Wrong — REST API caching has its own gate: `rocket_cache_reject_wp_rest_api` (default `true`, meaning REST is rejected from cache). Use that filter to flip behavior, not URI rejection. WC REST: `rocket_cache_reject_wc_rest_api`.
- "Cookies excluded via `rocket_cache_reject_cookies` mean 'don't set this cookie'." No — it means "if THIS cookie is present in the request, serve uncached HTML to that visitor". Used for "logged-in" detection beyond the standard WP login cookie.
- "`rocket_buffer` filter for tweaking HTML is fine to use." Technically yes, but the filter receives the ENTIRE rendered HTML before WP Rocket writes it to disk. A fatal error or malformed return breaks every cached page until WP Rocket is disabled. Treat it like editing core — only when there's no other option.

## When to use this skill

Trigger when ANY of the following is true:

- The diff adds `add_filter( 'rocket_*', ... )`.
- The user asks "exclude my plugin's URL from WP Rocket caching".
- A custom REST namespace needs caching (or needs to STAY uncached when WP Rocket changes the default).
- CDN integration — URL rewriting, host management, CSS / JS exclusions.
- Custom lazy-load logic — image filters, ATF (above-the-fold) tuning.
- Reviewing PR code that hooks any `rocket_*` filter.
- Restricting WP Rocket settings access to a custom role.

## Workflow

### 1. Cache rejection — the most common use case

#### Reject URIs (path patterns, NOT full URLs)

```php
add_filter( 'rocket_cache_reject_uri', function ( array $uris ): array {
    // My plugin's frontend tracker endpoint — never serve cached HTML for it
    $uris[] = '/myplugin-track(/.*)?';

    // Exclude any path under /api/v2/ (custom REST not via WP Rocket's REST gate)
    $uris[] = '/api/v2/.+';

    // Exclude a specific page slug
    $uris[] = '/checkout-step-2/?';

    return $uris;
} );
```

Format rules (verified against the regex compiler in WP Rocket):

- Path-only — leading `/`, no host, no protocol.
- Regex metacharacters allowed — `.+`, `(/.*)?`, `?`, `\d`, etc.
- WP Rocket wraps the array into an alternation regex; each entry must be a valid regex fragment.
- Trailing `/?` to match both with and without trailing slash.
- `(/.*)?` to match a prefix and any subpath.

#### Reject cookies — the "this visitor is special" gate

```php
add_filter( 'rocket_cache_reject_cookies', function ( array $cookies ): array {
    // My plugin sets this cookie when a visitor is in a custom A/B test — they should see uncached HTML
    $cookies[] = 'myplugin_ab_test_variant';

    // The WP Rocket default already includes wordpress_logged_in_*, woocommerce_items_in_cart, etc.
    return $cookies;
} );
```

When a request arrives WITH any of these cookies set, WP Rocket bypasses the cache for that request. Use for any per-visitor state that affects rendered HTML.

#### Reject user agents

```php
add_filter( 'rocket_cache_reject_ua', function ( array $uas ): array {
    $uas[] = 'MyBot/1\.0';   // regex; escape literals
    $uas[] = 'Internal-Health-Check';
    return $uas;
} );
```

Use for crawler / bot exclusion, internal monitoring agents you don't want cached responses for.

#### REST API caching toggle

```php
// Cache the WP REST API responses (default: NOT cached)
add_filter( 'rocket_cache_reject_wp_rest_api', '__return_false' );

// Cache the WooCommerce REST API (default: NOT cached)
add_filter( 'rocket_cache_reject_wc_rest_api', '__return_false' );
```

Both filters return `true` by default (REST is rejected from cache). Flipping to `false` enables caching — useful for read-heavy public REST endpoints. **Do NOT enable for endpoints that vary per user** — WP Rocket's per-user / per-cookie variants don't apply to REST URLs.

#### Query string variants

```php
add_filter( 'rocket_cache_query_strings', function ( array $params ): array {
    $params[] = 'currency';   // allow cached variants for ?currency=EUR / ?currency=USD
    return $params;
} );
```

`rocket_cache_query_strings` is an allow-list gate: when a request has query params, WP Rocket only processes it if a built-in allowed param or one of your listed params is present. `rocket_cache_ignored_parameters` removes noisy params from the cache key; other remaining params can still become part of the generated query-string cache key.

### 2. CDN integration

```php
// Add CDN hostnames
add_filter( 'rocket_cdn_cnames', function ( array $cnames ): array {
    $cnames[] = 'cdn.example.com';
    return $cnames;
} );

// Reject specific files from CDN (e.g. dynamic generated assets)
add_filter( 'rocket_cdn_reject_files', function ( array $files ): array {
    $files[] = '/wp-content/uploads/myplugin/dynamic/.+';
    return $files;
} );

// Disable relative-path CDN rewriting if it breaks generated markup
add_filter( 'rocket_cdn_relative_paths', '__return_false' );
```

`rocket_cdn_hosts` is WP Rocket's list of CDN hosts, not a list of internal
hosts to keep local. Do not add staging/internal hostnames there to prevent CDN
rewrites. Legacy filters such as `rocket_allow_cdn_images` and
`rocket_cdn_custom_filetypes` appear in deprecated code paths; avoid using them
for new 3.21.x integrations unless you are explicitly supporting old WP Rocket
versions.

### 3. Lazy load tuning

```php
// Disable lazy load entirely on certain pages
add_filter( 'do_rocket_lazyload', function ( bool $enable ): bool {
    if ( is_singular( 'product' ) ) {
        return false;   // product pages — eager-load images
    }
    return $enable;
} );

// Disable iframe lazy load
add_filter( 'do_rocket_lazyload_iframes', '__return_false' );

// Skip lazy load for specific images (above-the-fold)
add_filter( 'rocket_atf_valid_image', function ( bool $valid, string $src ): bool {
    if ( strpos( $src, 'hero-image' ) !== false ) {
        return true;   // mark as ATF, eager-load
    }
    return $valid;
}, 10, 2 );

// Number of images treated as ATF (default in 3.21.1: 20)
add_filter( 'rocket_atf_images_number', function ( int $max, string $url, array $images ): int {
    return 3;   // first 3 images eager, rest lazy
}, 10, 3 );

// WebP attribute customization
add_filter( 'rocket_attributes_for_webp', function ( array $attrs ): array {
    $attrs['data-fallback'] = 'true';
    return $attrs;
} );
```

### 4. Capability override

```php
// Replace 'manage_options' with a custom capability for WP Rocket access.
add_filter( 'rocket_capacity', function ( string $cap ): string {
    return 'manage_wp_rocket';   // your custom cap
} );

// Define and grant the cap to specific roles
register_activation_hook( __FILE__, function (): void {
    $editor = get_role( 'editor' );
    if ( $editor ) {
        $editor->add_cap( 'manage_wp_rocket' );
    }
} );
```

Use for delegating cache management to non-admin roles (agency setups, multi-author teams).

`rocket_capability` exists in legacy/deprecated code as an old typo. For current integrations, prefer `rocket_capacity`.

### 5. The `rocket_buffer` filter — power and danger

The single most powerful WP Rocket filter. Verified at [inc/Engine/Optimization/Buffer/Optimization.php:87](Optimization.php) — fires AFTER all WP Rocket optimizations (minify, lazy load, defer JS, critical CSS injection) and BEFORE WP Rocket writes the HTML to disk for caching:

```php
add_filter( 'rocket_buffer', function ( string $buffer ): string {
    // $buffer is the ENTIRE HTML page output, post-optimization
    return str_replace( '__PLACEHOLDER__', 'replaced', $buffer );
}, 99 );   // late priority — after everything else
```

**Critical warnings:**

1. **A fatal error in the callback** kills the page render entirely — the visitor sees a white screen, AND WP Rocket caches the broken page (HTTP 500 with cached output is a user-experience nightmare).
2. **Returning malformed (but non-empty) HTML** breaks the rendered page — and gets cached. Note: as of 3.23, returning an *empty* string is guarded — WP Rocket falls back to the original buffer and logs an error (Optimization.php:89) — but malformed non-empty output still passes straight through to disk.
3. **Breaking the structure** (removing `</body>` etc.) breaks every page that hits the cache.
4. **Performance**: the callback runs on EVERY page render before the cache hit.

Do NOT use `rocket_buffer` for:

- Anything achievable via standard WP filters (`the_content`, `wp_head`, etc.).
- A/B testing variant injection — use cookie variants or dedicated A/B plugins.
- Ad insertion — same story.

Do use `rocket_buffer` for:

- Late HTML transforms that MUST happen after WP Rocket's optimizations (post-minify rewriting, post-critical-CSS injection).
- HTML schema injection that needs to see the optimized DOM.
- Inserting cache-time markers (`<!-- cached at <?php echo date('c'); ?> -->` for debugging).

```php
// Defensive pattern with try/catch
add_filter( 'rocket_buffer', function ( string $buffer ): string {
    try {
        // YOUR transformation
        return $buffer;
    } catch ( \Throwable $e ) {
        // Log but don't break the page
        error_log( "rocket_buffer filter error: " . $e->getMessage() );
        return $buffer;   // fall through with the original HTML
    }
}, 99 );
```

### 6. Action Scheduler integration tuning

WP Rocket uses Action Scheduler for background jobs such as preload and RUCSS-related queues. Three filters tune its queue behavior:

```php
// Batch size for cleaning up old AS records
add_filter( 'rocket_action_scheduler_clean_batch_size', function ( int $batch_size, string $group ): int {
    return 50;   // default 100 — lower for memory-constrained hosts
}, 10, 2 );

// How long to keep completed actions
add_filter( 'rocket_action_scheduler_retention_period', function ( int $lifespan, string $group ): int {
    return DAY_IN_SECONDS * 7;   // WP Rocket starts from 1 hour unless another AS filter changes it
}, 10, 2 );

// Cron schedule for the cleanup job
add_filter( 'rocket_action_scheduler_run_schedule', function ( string $schedule ): string {
    return 'twicedaily';
} );
```

### 7. Asset URL rewriting

```php
// Modify URLs before WP Rocket maps assets to local files / CDN zones.
add_filter( 'rocket_asset_url', function ( string $url, array $zones ): string {
    if ( strpos( $url, '/myplugin/dynamic-' ) !== false ) {
        return $url;   // leave dynamic assets untouched
    }
    return $url;
}, 10, 2 );
```

### 8. Combining filters in a companion plugin

```php
// my-wp-rocket-companion/my-wp-rocket-companion.php

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'plugins_loaded', static function (): void {
    if ( ! defined( 'WP_ROCKET_VERSION' ) ) {
        return;   // WP Rocket not active; nothing to customize
    }

    // Cache rejection — my plugin's stateful endpoints
    add_filter( 'rocket_cache_reject_uri', static function ( array $uris ): array {
        $uris[] = '/api/myplugin/.+';
        $uris[] = '/myplugin-cart(/.*)?';
        return $uris;
    } );

    // Cookies — A/B test variant
    add_filter( 'rocket_cache_reject_cookies', static function ( array $cookies ): array {
        $cookies[] = 'myplugin_variant';
        return $cookies;
    } );

    // CDN — add my custom asset host
    add_filter( 'rocket_cdn_cnames', static function ( array $cnames ): array {
        $cnames[] = 'static.myplugin.example';
        return $cnames;
    } );

    // Capability — let editor role manage cache
    add_filter( 'rocket_capacity', static function ( string $cap ): string {
        return 'manage_my_caches';
    } );

}, 11 );   // priority 11 to run after WP Rocket itself loads
```

## Critical rules

- **`rocket_cache_reject_uri` takes path patterns, NOT full URLs.** Path-only, regex-style; use `(/.*)?` suffix for prefix matches.
- **REST API caching has its own toggle.** `rocket_cache_reject_wp_rest_api` (default `true` — REST not cached). Don't try to gate REST via `rocket_cache_reject_uri`.
- **Cookie / UA filters expect arrays of regex patterns.** Escape literal dots and special chars.
- **`rocket_buffer` is the nuclear option.** Always wrap in try/catch; never call functions that may fatal; test extensively before deploying.
- **Feature-detect with `defined('WP_ROCKET_VERSION')`** before calling functions; filters can be added unconditionally (they fire only when WP Rocket is active anyway), but it's cleaner to gate the entire customization block.
- **Filters at priority 11+ on `plugins_loaded`** so they register after WP Rocket's own bootstrap.
- **`rocket_cache_query_strings`** allows query-string caching when a listed param is present; use `rocket_cache_ignored_parameters` for UTM/noisy params so they do not inflate cache variants.
- **`rocket_capacity` lets non-admin roles access WP Rocket admin actions/settings.** Combine with `add_cap` on activation. Treat `rocket_capability` as legacy.
- **CDN CNAME filters expect hostnames, not URLs.** `cdn.example.com`, not `https://cdn.example.com/`.
- **`do_rocket_lazyload`** is a single boolean toggle — use page-context branching inside the filter.
- **Multilingual sites (Polylang / WPML)** — URI patterns should account for language prefixes (`/en/api/.+`, `/de/api/.+`) OR use a regex that's lang-agnostic.

## Common mistakes

```php
// WRONG — full URL in rocket_cache_reject_uri
add_filter( 'rocket_cache_reject_uri', function ( $uris ) {
    $uris[] = 'https://example.com/checkout';   // never matches; WP Rocket strips host
    return $uris;
} );

// RIGHT — path only
add_filter( 'rocket_cache_reject_uri', function ( $uris ) {
    $uris[] = '/checkout(/.*)?';
    return $uris;
} );

// WRONG — exact match where prefix is intended
$uris[] = '/api';
// matches /api ONLY, not /api/foo or /api/v2/bar

// RIGHT
$uris[] = '/api(/.*)?';
// matches /api, /api/, /api/foo, /api/v2/bar, etc.

// WRONG — using rocket_cache_reject_uri for REST API
add_filter( 'rocket_cache_reject_uri', function ( $uris ) {
    $uris[] = '/wp-json(/.*)?';
    return $uris;
} );
// Works for non-WP-Rocket REST handling, but redundant — REST already rejected by default.

// RIGHT — REST has its own filter
// (default: REST already not cached, no filter needed)
// To ENABLE REST caching:
add_filter( 'rocket_cache_reject_wp_rest_api', '__return_false' );

// WRONG — assumed cookie meaning
add_filter( 'rocket_cache_reject_cookies', function ( $cookies ) {
    $cookies[] = 'php_session_id';   // WRONG: this means "if cookie is present, bypass cache"
    return $cookies;
} );
// You probably wanted: "browser sends cookie X = bypass cache". That IS the right behavior here.
// But if the cookie is set on EVERY visitor (e.g. session cookie), you've effectively disabled cache.

// RIGHT — only for cookies that mark special visitors
$cookies[] = 'wp_logged_in_some_token';   // present only when user logs in to a specific section

// WRONG — rocket_buffer without try/catch
add_filter( 'rocket_buffer', function ( $buffer ) {
    return process_with_third_party_lib( $buffer );   // throws on rare input → white screen
} );

// RIGHT — defensive
add_filter( 'rocket_buffer', function ( $buffer ) {
    try {
        return process_with_third_party_lib( $buffer );
    } catch ( \Throwable $e ) {
        error_log( 'rocket_buffer error: ' . $e->getMessage() );
        return $buffer;   // ship original on failure
    }
}, 99 );

// WRONG — high-cardinality query strings
add_filter( 'rocket_cache_query_strings', function ( $params ) {
    $params[] = 'utm_id';   // unique per email campaign → millions of cache variants
    return $params;
} );

// RIGHT — strip high-cardinality params instead
add_filter( 'rocket_cache_ignored_parameters', function ( $params ) {
    $params['utm_id'] = 1;
    $params['utm_term'] = 1;
    $params['utm_content'] = 1;
    return $params;
} );

// WRONG — CDN cname with protocol
add_filter( 'rocket_cdn_cnames', function ( $cnames ) {
    $cnames[] = 'https://cdn.example.com/';   // won't match URL rewriter expectations
    return $cnames;
} );

// RIGHT — hostname only
$cnames[] = 'cdn.example.com';

// WRONG — using rocket_cdn_hosts as an "internal hosts" allowlist
add_filter( 'rocket_cdn_hosts', function ( $hosts ) {
    $hosts[] = 'preview.example.com';
    return $hosts;
} );
// This filter represents CDN hosts known to WP Rocket. It is not a "do not CDN" list.

// WRONG — capability filter without granting the cap
add_filter( 'rocket_capacity', function (): string {
    return 'manage_my_caches';
} );
// Now NO ONE can access WP Rocket settings (no role has the new cap).

// RIGHT — define + grant
add_filter( 'rocket_capacity', function (): string {
    return 'manage_my_caches';
} );
register_activation_hook( __FILE__, function () {
    foreach ( [ 'administrator', 'editor' ] as $role_name ) {
        $role = get_role( $role_name );
        if ( $role ) $role->add_cap( 'manage_my_caches' );
    }
} );

```

## Cross-references

- Run **`wp-rocket-cache-invalidation`** when the question is "how do I CLEAR cache after change", not "customize WP Rocket behavior".
- Run **`wp-rocket-mcp-and-abilities`** when the customization is AI/MCP-facing — exposing settings via the `wp-rocket/get-options` & `wp-rocket/set-option` abilities, tuning the `rocket_mcp_options_allowlist`, or enabling the `/oauth/*` MCP server (`rocket_mcp_oauth_server_enabled`). New in 3.23.
- Run **`wp-plugin-cron`** if you're tuning Action Scheduler integration via `rocket_action_scheduler_*` filters.
- Run **`wp-plugin-architecture`** for the companion-plugin scaffold pattern (`plugins_loaded:11` priority, feature-detection, namespace).
- Run **`wp-rest-api`** if the customization is around REST API endpoints (`rocket_cache_reject_wp_rest_api`).

## What this skill does NOT cover

- **`.htaccess` rules** WP Rocket installs (server-config, not a filter point).
- **Internal `Engine/` class signatures** (private; change between versions).
- **Cache file format on disk** (path layout, naming) — `wp-rocket-cache-invalidation` covers the public clean functions; raw filesystem manipulation is OFF the supported path.
- **License / activation key handling** — premium-specific.

## References

- Plugin entry: [wp-content/plugins/wp-rocket/wp-rocket.php](wp-rocket.php) — version constants.
- Cache rejection filters (URI, cookies, UA): [inc/functions/options.php:243, 303, 377](options.php) — `rocket_cache_reject_uri`, `rocket_cache_reject_cookies`, `rocket_cache_reject_ua`.
- `rocket_buffer` filter: [inc/Engine/Optimization/Buffer/Optimization.php:87](Optimization.php) — fires after all optimizations, before disk write. `(string) apply_filters( 'rocket_buffer', $buffer )`; an empty return is guarded (falls back to the original buffer + logs) as of 3.23.
- CDN engine: [inc/Engine/CDN/](CDN/) — `rocket_cdn_cnames`, `rocket_cdn_hosts`, `rocket_cdn_reject_files`, `rocket_cdn_relative_paths`, `rocket_asset_url`.
- Lazy load: [inc/Engine/Media/Lazyload/](Lazyload/) and [inc/Engine/Media/AboveTheFold/](AboveTheFold/) — `do_rocket_lazyload`, `do_rocket_lazyload_iframes`, `rocket_atf_*`.
- Capability filter: current code uses `rocket_capacity`; `rocket_capability` appears only in legacy/deprecated code as the old typo.
- WP Rocket plugin compatibility doc: [https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket](https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket).
