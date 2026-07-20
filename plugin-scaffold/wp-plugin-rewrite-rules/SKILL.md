---
name: wp-plugin-rewrite-rules
description: >-
  Design and review custom WordPress URL rewrites:
  add_rewrite_rule, add_rewrite_tag, query_vars, CPT/taxonomy rewrite
  slugs, add_rewrite_endpoint, soft vs hard flushes, rewrite_rules cache
  behavior, and the rule that flush_rewrite_rules() must not run on every
  request. Use for custom pretty URLs, CPT permalink 404s, endpoint
  rewrites, and code containing flush_rewrite_rules or add_rewrite_rule.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.5 - 6.9"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-04-28"
---

# WordPress plugin: rewrite rules & flush

The single most consistently-mishandled topic in WP plugin code by AI assistants and inexperienced developers. The pattern that "works" — call `flush_rewrite_rules()` after `add_rewrite_rule()` — is correct but the WHEN matters more than the WHAT. Calling it once is right; calling it on every page load wrecks performance.

This skill covers when and how to register custom URL rewrites and the discipline around flushing.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a custom URL endpoint (`/api/v1/...`, `/dashboard/orders/`, `/track/<token>/`).
- Registering a CPT or taxonomy with a `'rewrite'` argument that creates new permalink structures.
- Adding a "REST-but-pretty-URL" pattern that uses WP's rewrite engine instead of `register_rest_route`.
- Debugging "my new permalink returns 404 even though the post exists".
- Reviewing code where you see `flush_rewrite_rules()` or `add_rewrite_rule()` — verify the placement.

## Mental model — `rewrite_rules` is a cached option

WordPress's permalink engine works in two passes:

1. **Generate**: based on registered CPTs, taxonomies, custom rules (`add_rewrite_rule`), endpoints (`add_rewrite_endpoint`), and the configured permalink structure, WP builds a big regex array. Each entry maps a URL pattern → query variables.
2. **Cache**: this entire array is stored in the `rewrite_rules` option (`wp-includes/class-wp-rewrite.php` `refresh_rewrite_rules()`, since WP 6.4). Whether the option is autoloaded depends on its stored `autoload` value and newer WP autoload heuristics; do not assume every install has the same value.
3. **Match**: every request uses the cached option to figure out what query to run.

Generation is expensive (iterates ALL post types, taxonomies, endpoints, custom rules). The cache is regenerated only when explicitly told to — via `flush_rewrite_rules()` or by the user saving the Permalinks settings page.

The footgun: register a CPT, see 404 on the CPT permalink, and "fix it" by adding `flush_rewrite_rules()` to the `init` callback. This works (the second visit succeeds), but you've now made every page request rebuild + write the `rewrite_rules` option AND rewrite `.htaccess`. Sites with many CPTs see noticeable slowdowns.

## The flush rule — once on activation, once on deactivation, NEVER on init

```php
// === Runtime: registers the rewrite on EVERY request, no flush ===
add_action( 'init', static function (): void {
    add_rewrite_rule(
        '^api/v1/items/?$',
        'index.php?myplugin_endpoint=items',
        'top'
    );
} );

add_filter( 'query_vars', static function ( array $vars ): array {
    $vars[] = 'myplugin_endpoint';
    return $vars;
} );

// === Activation: flush ONCE, after CPTs/rewrites are registered ===
register_activation_hook( __FILE__, static function (): void {
    // Make sure our rewrite is registered for THIS request before flushing,
    // since activation runs after `init` of the activation request.
    add_rewrite_rule(
        '^api/v1/items/?$',
        'index.php?myplugin_endpoint=items',
        'top'
    );
    flush_rewrite_rules();
} );

// === Deactivation: flush ONCE, so the generated option can be rebuilt ===
register_deactivation_hook( __FILE__, static function (): void {
    flush_rewrite_rules();
} );
```

Three rules:

1. **Register rewrites on `init`**, every request. Cached rules can keep matching until the next flush, but registration must be present whenever WP regenerates the rules; otherwise the next flush drops your rule.
2. **Flush on activation and deactivation only.** That's two writes per plugin lifecycle, not two per request.
3. **Don't conditionally flush at runtime** ("if rules don't include mine, flush"). It's tempting; it's also fragile and easy to mis-trigger.

If a settings UI change affects URL structure (a slug rename), flush after the option is saved — gated by the specific setting having changed:

```php
add_action( 'update_option_myplugin_settings', static function ( $old, $new ): void {
    if ( ( $old['slug'] ?? '' ) !== ( $new['slug'] ?? '' ) ) {
        flush_rewrite_rules();
    }
}, 10, 2 );
```

That's the only place runtime flushing belongs. A settings screen flush should almost always use `flush_rewrite_rules( false )` unless the permalink file rules also changed.

## CPT and taxonomy rewrite slugs

`register_post_type( 'foo', array( 'rewrite' => array( 'slug' => 'foos' ) ) )` adds permalink rules for `foos/<post-slug>/`. WP **does not auto-flush** when you register the CPT (verified in `wp-includes/post.php` — no `flush_rewrite_rules()` call inside `register_post_type`). Same for `register_taxonomy`.

This is why CPT-based plugins MUST flush on activation. Otherwise: install the plugin → first CPT entry created → 404 on the entry's permalink → user thinks plugin is broken.

```php
register_activation_hook( __FILE__, static function (): void {
    myplugin_register_post_types();   // call your CPT registration
    flush_rewrite_rules();
} );
```

If your CPT registration is encapsulated inside a class method that's normally only called on `init`, expose it as a callable function or static method so the activation hook can call it directly. Don't rely on the `init` of the current request having already registered it (in some flows, like programmatic activation via `activate_plugin()`, hook order is shifted).

## Custom rewrite rules — the `add_rewrite_rule` + handler pattern

To handle a URL pattern that doesn't map to a post or taxonomy:

```php
// 1. Register the rule on init.
add_action( 'init', static function (): void {
    add_rewrite_rule(
        '^track/([a-z0-9]+)/?$',          // URL pattern
        'index.php?myplugin_track=$matches[1]',  // query string
        'top'                             // priority over default rules
    );
} );

// 2. Whitelist the query var (otherwise WP strips it).
add_filter( 'query_vars', static function ( array $vars ): array {
    $vars[] = 'myplugin_track';
    return $vars;
} );

// 3. Handle the request — usually on template_redirect or parse_request.
add_action( 'template_redirect', static function (): void {
    $token = get_query_var( 'myplugin_track' );
    if ( ! $token ) {
        return;
    }
    // Render or redirect. exit; if you don't want WP's template loader to also run.
    myplugin_render_track_page( sanitize_key( $token ) );
    exit;
} );

// 4. Activation: flush after registering.
register_activation_hook( __FILE__, static function (): void {
    add_rewrite_rule( '^track/([a-z0-9]+)/?$', 'index.php?myplugin_track=$matches[1]', 'top' );
    flush_rewrite_rules();
} );
```

Notes on each step:

- **`add_rewrite_rule( $regex, $redirect, $position )`** (`wp-includes/rewrite.php`). `$position`: `'top'` matches before WP defaults (use for plugin endpoints that should override `?p=NN` style queries); `'bottom'` matches after (use for fallback patterns).
- **The query var IS whitelist-required.** Without the `query_vars` filter entry, `get_query_var()` returns empty even if the rule matched. If you use `add_rewrite_tag( '%myplugin_track%', '([a-z0-9]+)' )` before building rules, WordPress registers the matching public query var for you.
- **`template_redirect` is the usual handler hook** for rendering custom output from a rewrite. `parse_request` runs earlier if you need to short-circuit before WP_Query.
- **REST is usually a better choice** for true API endpoints — `register_rest_route` gives you typed args, permission_callback, JSON formatting, and cookie auth for free. Use `add_rewrite_rule` only when you genuinely need pretty URLs that participate in WP's permalink engine (frontend pages, redirects, content-driven routes).

## `add_rewrite_endpoint` — extending existing permastructs

For URLs that hang off existing permalinks, like `/<post-slug>/json/` or `/blog/<post-slug>/print/`:

```php
add_action( 'init', static function (): void {
    // EP_PERMALINK | EP_PAGES — append /json/ to single-post and page permalinks
    add_rewrite_endpoint( 'json', EP_PERMALINK | EP_PAGES );
} );

// On the template hook:
add_action( 'template_redirect', static function (): void {
    if ( get_query_var( 'json' ) !== '' && is_singular() ) {
        wp_send_json( myplugin_serialize_post( get_post() ) );
        exit;
    }
} );
```

`add_rewrite_endpoint` automatically registers a query var matching the name by default and adds rules to the relevant permastructs. Pass `false` as the third argument to skip query-var registration, or a string to use a custom query-var name. Bitmask options (verified in `wp-includes/rewrite.php` and `EP_*` constants in `wp-includes/class-wp-rewrite.php`):

- `EP_PERMALINK` — single posts
- `EP_PAGES` — pages
- `EP_ALL` — every permastruct WP knows
- `EP_ROOT` — root only (`/json/`)
- `EP_CATEGORIES`, `EP_TAGS`, `EP_AUTHORS`, etc.

Same flush rule applies: register on `init`, flush on activation.

## Soft vs hard flush

`flush_rewrite_rules( $hard = true )` (`wp-includes/rewrite.php`):

- **Hard flush (`$hard = true`, default)**: rebuilds the rules array, writes the `rewrite_rules` option, AND writes `.htaccess` (Apache) / `web.config` (IIS) with the regenerated mod_rewrite directives.
- **Soft flush (`$hard = false`)**: rebuilds rules array, writes the option only. Skips the file write.

For activation / deactivation: hard flush is correct (the file edit catches setups where mod_rewrite reads from `.htaccess` directly). For settings-change-driven flushes mid-runtime: soft is enough if `.htaccess` is unchanged.

The `.htaccess` write requires file-system write access in the WP install directory. Hosts with read-only deployment may emit a notice or silently skip it; the soft flush still updates the option, which is what most lookups use anyway.

## The `rewrite_rules` option — cached and growable

`rewrite_rules` is stored in `wp_options` and is read whenever WP needs to match pretty permalinks. Many installs have it autoloaded, but WP 6.6+ may store automatic autoload decisions such as `auto`, `auto-on`, or `auto-off`; audit the actual value before making a performance claim. A site with:

- 50 plugins each adding 2-3 custom rules
- 20 CPTs
- 5 custom endpoints

…can end up with a `rewrite_rules` option in the 100KB-500KB range. If autoloaded, that's read into memory on every uncached request. Two consequences:

- **Don't add rewrites you don't need.** Each rule lives in the option forever (until flushed away by deactivation).
- **Plugin uninstall should ensure cleanup.** Deactivation usually flushes, but the user might delete the plugin without deactivating. Add a `flush_rewrite_rules()` call to `uninstall.php` if your plugin added rules — see `wp-plugin-lifecycle`.

You can audit the option's size with:

```sql
SELECT LENGTH(option_value) AS bytes, autoload
FROM wp_options
WHERE option_name = 'rewrite_rules';
```

A healthy site is in the 10-50KB range. 200KB+ is a smell.

## Multisite

Each blog has its own `rewrite_rules` option — flush is per-blog. For multisite-network plugins that add rewrites, flush per-site at activation:

```php
register_activation_hook( __FILE__, static function ( bool $network_wide = false ): void {
    if ( $network_wide ) {
        foreach ( get_sites( array( 'fields' => 'ids' ) ) as $site_id ) {
            switch_to_blog( $site_id );
            myplugin_register_rewrites();
            flush_rewrite_rules();
            restore_current_blog();
        }
    } else {
        myplugin_register_rewrites();
        flush_rewrite_rules();
    }
} );
```

Multisite caveat: this skill's authoring environment is single-site. The pattern above is source-derived (`switch_to_blog` (`wp-includes/ms-blogs.php`) is per-blog, `flush_rewrite_rules` operates on the current blog). Verify on a real network install.

## Critical rules

- **Register rewrites on `init`** (every request); they have to exist when the rules are regenerated.
- **Flush on activation + deactivation, NEVER on `init`.** The single highest-leverage rule in this skill.
- **`register_post_type` / `register_taxonomy` do NOT auto-flush** — your activation handler must.
- **Whitelist custom query vars** via the `query_vars` filter, or `get_query_var()` returns empty.
- **Prefer REST (`register_rest_route`)** for API endpoints; use rewrite rules for permalink-engine-participating URLs.
- **Match settings-change flushing to specific setting changes**, not blanket "after any save".
- **Hard flush = file write**; soft flush = option write only. Default `$hard = true` is fine for activation.
- **Audit `rewrite_rules` option size** if you suspect rule bloat. 200KB+ is a smell.

## Common mistakes

```php
// WRONG — flush on every request, .htaccess rewritten constantly
add_action( 'init', function () {
    add_rewrite_rule( '^api/v1/items/?$', 'index.php?myplugin_endpoint=items', 'top' );
    flush_rewrite_rules(); // disaster
} );

// WRONG — registers a CPT but never flushes; permalinks 404
register_activation_hook( __FILE__, function () {
    register_post_type( 'myplugin_log', array( 'rewrite' => array( 'slug' => 'logs' ) ) );
    // missing: flush_rewrite_rules();
} );

// WRONG — flush on activation but rule isn't registered for this request
register_activation_hook( __FILE__, function () {
    flush_rewrite_rules(); // rebuilds rules WITHOUT my CPT (registered on init only)
} );

// WRONG — query_var not whitelisted; get_query_var returns empty
add_action( 'init', function () {
    add_rewrite_rule( '^track/([a-z0-9]+)/?$', 'index.php?myplugin_track=$matches[1]', 'top' );
} );
// Missing: add_filter( 'query_vars', fn ( $v ) => array_merge( $v, array( 'myplugin_track' ) ) );

// WRONG — using add_rewrite_rule for a JSON API
add_rewrite_rule( '^api/v1/orders/?$', 'index.php?myplugin_orders=1', 'top' );
// Better: register_rest_route( 'myplugin/v1', '/orders', ... );

// WRONG — flushing on every settings save regardless of what changed
add_action( 'update_option_myplugin_settings', 'flush_rewrite_rules' );
// Should be gated to specific URL-affecting fields changing.
```

## Cross-references

- Run **`wp-plugin-lifecycle`** for the activation/deactivation/uninstall placement of `flush_rewrite_rules()` in full lifecycle context.
- Run **`wp-rest-api`** when the endpoint is a JSON API — REST is almost always a better choice than rewrite-rule + custom handler.
- Run **`wp-plugin-options-storage`** if `rewrite_rules` option size is the concern; the skill explains autoload tradeoffs in general.

## What this skill does NOT cover

- The `WP_Rewrite` class internals beyond what `flush_rules` does. Most plugin code shouldn't touch the class directly.
- Multisite-network domain mapping plugins (Multisite-style URL routing across subsites) — niche, separate concern.
- mod_rewrite vs nginx rewrite block differences. WP writes mod_rewrite to `.htaccess` for Apache; nginx requires manual `location` directives in the server config (no automatic write from WP).
- URL canonicalization (`redirect_canonical`) and trailing-slash handling — adjacent topic.
- Page-builder / theme-introduced rewrite gotchas.

## References

- `add_rewrite_rule`: `wp-includes/rewrite.php`
- `add_rewrite_endpoint`: `wp-includes/rewrite.php` — `EP_*` bitmask constants in `wp-includes/class-wp-rewrite.php`
- `flush_rewrite_rules`: `wp-includes/rewrite.php` — wraps `WP_Rewrite::flush_rules`
- `WP_Rewrite::refresh_rewrite_rules` (since WP 6.4): `wp-includes/class-wp-rewrite.php` — explains the deferred-flush behavior when `wp_loaded` hasn't fired
- `query_vars` filter: [developer.wordpress.org/reference/hooks/query_vars/](https://developer.wordpress.org/reference/hooks/query_vars/)
- Official documentation: <https://developer.wordpress.org/reference/functions/add_rewrite_rule/>
- Official documentation: <https://developer.wordpress.org/reference/functions/flush_rewrite_rules/>
- Official documentation: <https://developer.wordpress.org/reference/functions/add_rewrite_endpoint/>
