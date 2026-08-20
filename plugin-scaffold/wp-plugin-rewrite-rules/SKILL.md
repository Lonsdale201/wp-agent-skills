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
  wp-skills-plugin-version-tested: "6.5 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
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

Register the regex on `init`, whitelist its query variable, handle the request
at an appropriate lifecycle hook, and register the same rule immediately before
the one-time activation flush. Use REST for a JSON API. Read
`references/custom-rules-and-endpoints.md` for the complete checked pattern.

## `add_rewrite_endpoint` — extending existing permastructs

Use `add_rewrite_endpoint()` only for a suffix attached to selected existing
permastructs. Choose the narrowest `EP_*` bitmask; `EP_ALL` expands every
supported structure. It registers a same-named query var unless the third
argument overrides or disables it. Register on `init` and flush once on
activation. See `references/custom-rules-and-endpoints.md`.

## Sitemap query routes in WordPress 7.1

WordPress 7.1 adds `WP_Query::$is_sitemap`, `WP_Query::is_sitemap()`, and the
global `is_sitemap()` conditional. Core marks the query when the public
`sitemap` query var is non-empty. SEO plugins such as Rank Math may also use
that query var, so third-party sitemap requests can satisfy the core
conditional after query parsing.

This does not register a route, create a provider, or render XML for custom
plugin content. Keep rewrite registration, query vars, output ownership, HTTP
headers, canonical behavior, and caching in one explicit integration. Never
call `is_sitemap()` before the main query; feature-detect it when supporting
WordPress 7.0 or older.

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
- **`is_sitemap()` is a conditional, not a routing API.** It does not create a
  `sitemap.php` template or replace provider/output code.

## Common mistakes

Read `references/custom-rules-and-endpoints.md` to review per-request flushes,
missing activation registration, stripped query vars, REST-shaped rewrite
handlers, and unconditional settings-save flushes.

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

- Custom rule, endpoint, and failure patterns:
  `references/custom-rules-and-endpoints.md`.
- `add_rewrite_rule`: `wp-includes/rewrite.php`
- `add_rewrite_endpoint`: `wp-includes/rewrite.php` — `EP_*` bitmask constants in `wp-includes/class-wp-rewrite.php`
- `flush_rewrite_rules`: `wp-includes/rewrite.php` — wraps `WP_Rewrite::flush_rules`
- `WP_Rewrite::refresh_rewrite_rules` (since WP 6.4): `wp-includes/class-wp-rewrite.php` — explains the deferred-flush behavior when `wp_loaded` hasn't fired
- `query_vars` filter: [developer.wordpress.org/reference/hooks/query_vars/](https://developer.wordpress.org/reference/hooks/query_vars/)
- Official documentation: <https://developer.wordpress.org/reference/functions/add_rewrite_rule/>
- Official documentation: <https://developer.wordpress.org/reference/functions/flush_rewrite_rules/>
- Official documentation: <https://developer.wordpress.org/reference/functions/add_rewrite_endpoint/>
