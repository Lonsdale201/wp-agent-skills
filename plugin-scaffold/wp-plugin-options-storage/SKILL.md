---
name: wp-plugin-options-storage
description: Picks the right WordPress storage primitive for plugin data:
  options, user/post/term/comment meta, transients, site options, site
  transients, or custom tables. Covers grouped settings, autoload
  management, transient TTL rules, serialized/JSON blob trade-offs,
  multisite storage caveats, and naming conventions. Use when scaffolding
  settings, choosing persistence for plugin-owned data, or auditing
  update_option/get_option/get_post_meta/set_transient/autoload usage.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.5 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/reference/functions/add_option/
  - https://developer.wordpress.org/reference/functions/get_option/
  - https://developer.wordpress.org/reference/functions/get_post_meta/
  - https://developer.wordpress.org/reference/functions/set_transient/
---

# WordPress plugin: options & storage

Where to put the data the plugin owns. WordPress offers several storage primitives — `wp_options`, four flavors of `*_meta`, transients, multisite site options/transients, and custom tables — and picking the right one is the single highest-leverage architectural decision for a plugin's long-term performance and maintainability.

This skill covers picking + using them correctly. It does NOT cover one-time activation seeding (see `wp-plugin-lifecycle`) or REST endpoint validation of stored values (see `wp-rest-api`).

## Multisite caveat (read first)

This skill's author works on single-site WordPress; the multisite advice below is **derived from WP source code but has not been end-to-end tested in a multisite environment**. The primitives — `get_site_option` / `update_site_option` / `set_site_transient` / `delete_site_option` — exist and are documented; their semantics here are taken from [wp-includes/option.php](wp-includes/option.php). If you ship a plugin that has actual multisite users, run an integration test on a real network install before relying on these patterns. Some quirks (`switch_to_blog` interactions, network admin context detection, blog-id-aware caches) only surface in a real network.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a new plugin's settings page or any persistent state.
- Reviewing a plugin where you see hundreds of `update_option` calls — performance smell.
- Picking where to store a piece of data: option vs meta vs transient vs custom table.
- Investigating a slow autoload payload (`SELECT option_name, option_value FROM wp_options WHERE autoload IN (...)`).
- The user asks "should I JSON this and put it in an option" — short answer below, see "JSON storage trap".

## Decision matrix — pick by access pattern

| Need | Use | Key API |
|---|---|---|
| Site-wide config, settings page values, feature flags | `wp_options` (single grouped row) | `get_option` / `update_option` |
| Per-user data (preferences, dismissed notices; secrets need extra care) | user-meta | `get_user_meta` / `update_user_meta` |
| Per-post / CPT entry data | post-meta | `get_post_meta` / `update_post_meta` |
| Per-taxonomy-term data | term-meta | `get_term_meta` / `update_term_meta` |
| Per-comment data | comment-meta | `get_comment_meta` / `update_comment_meta` |
| Cached value with TTL (API response, computed result) | transient | `get_transient` / `set_transient` |
| Network-wide setting in multisite | site option | `get_site_option` / `update_site_option` |
| Network-wide cached value in multisite | site transient | `get_site_transient` / `set_site_transient` |
| Many rows with structured fields, queryable, aggregable | custom table | `dbDelta` + `$wpdb->insert` / `$wpdb->get_results` |
| Hot-path counter / metric updated many times per second | custom table OR object cache | `$wpdb->query` |

The rough rule: **scalar or grouped key/value with no querying needs → option / meta / transient. Multi-row data you'll filter, sort, aggregate, or index → custom table.**

## Group settings into ONE option, not 100

The biggest single mistake in WP plugin storage: one option per setting.

```php
// WRONG — 12 rows, 12 writes, 12 cache/autoload entries
update_option( 'myplugin_provider',         $provider );
update_option( 'myplugin_default_model',    $model );
update_option( 'myplugin_max_tokens',       $tokens );
update_option( 'myplugin_log_enabled',      $log );
update_option( 'myplugin_failure_mode',     $mode );
// ... eight more
```

```php
// RIGHT — one row, one write, one cache/autoload entry
update_option( 'myplugin_settings', array(
    'provider'         => $provider,
    'default_model'    => $model,
    'max_tokens'       => $tokens,
    'log_enabled'      => $log,
    'failure_mode'     => $mode,
    // ... eight more
) );
```

When to group:
- **All settings UI values that belong to one feature**, in one associative-array option. One form save becomes one database write; one `get_option` call returns everything. This is not a compare-and-swap primitive, so concurrent read-modify-write flows can still race.
- **Distinct features** can each have their own option (`myplugin_billing_settings`, `myplugin_email_settings`, `myplugin_ai_settings`). Groups by domain, not by lump.
- **Repeating-row config** (e.g. a list of webhook URLs) can be the array value inside one option.
- **Secrets are the exception.** Do not bury API keys or OAuth tokens inside a normal grouped settings option that may autoload. Store them separately with explicit non-autoload, or prefer `wp-config.php` constants / an encryption layer.

When NOT to group:
- **Counters / increments updated by independent code paths.** Two requests writing to the same `myplugin_settings` array race each other (read-modify-write without atomic CAS — see `wp-plugin-cron` for the concurrency story). Counters live in their own option (single scalar value) or a custom table.
- **Cached values with different TTLs** — those are transients, not options.
- **Per-user / per-post data** — wrong primitive, use the right meta API.

WP auto-serializes the array via `maybe_serialize` ([wp-includes/functions.php](wp-includes/functions.php)) using PHP `serialize()`. `get_option` auto-`maybe_unserialize`s back. You don't manually JSON-encode.

## Autoload management — WP 6.6+ semantics

`autoload` controls whether the option is loaded into memory on every WordPress page request. Verified in [add_option docblock](wp-includes/option.php) (`@since 6.6.0 The $autoload parameter's default value was changed to null`, `@since 6.7.0 The autoload values 'yes' and 'no' are deprecated`):

```php
// MODERN — let WP decide via default autoload heuristics
add_option( 'myplugin_settings', $defaults );

// EXPLICIT — autoload (option is read on most page loads)
add_option( 'myplugin_settings', $defaults, '', true );

// EXPLICIT — DO NOT autoload (option is rarely read; saves memory)
add_option( 'myplugin_uninstall_log', $defaults, '', false );
```

Rules:

- **WP 6.7+ deprecates the string values `'yes'` / `'no'`.** Use the boolean `true` / `false` (or pass `null` to let WP decide).
- **Default to `null` (auto-decide)** for small settings read in normal runtime paths. In WP 6.6+, the default path stores an internal value such as `auto`, `auto-on`, or `auto-off`; by default `auto` and `auto-on` are treated as autoloaded values.
- **Force `false`** for options that are only read on specific admin pages, REST endpoints, or background jobs. A 500KB serialized config that's only read on the settings page should NOT be in autoload.
- **Force `true`** only when the option is genuinely needed on most page loads (rare for plugin settings). The site's autoload payload is shared across all plugins; bloating it slows everything down.
- **Changing autoload on an existing option is a separate operation.** `update_option( $name, $same_value, false )` returns early and will not change autoload. On WP 6.7+, use `wp_set_option_autoload( $name, false )`; for older supported WP versions, change autoload when the value changes or recreate the option deliberately during a migration.

Audit your plugin's autoload footprint with:
```sql
SELECT option_name, LENGTH(option_value)
FROM wp_options
WHERE autoload IN ('yes', 'on', 'auto-on', 'auto')
  AND option_name LIKE 'myplugin_%';
```

(WP 6.6+ uses values like `'on'`, `'off'`, `'auto'`, `'auto-on'`, and `'auto-off'`; pre-6.6 used `'yes'` / `'no'`.)

## The JSON / serialized-blob trap

> "I'll just JSON-encode this nested data and `update_option` it."

This works but **it's almost always the wrong choice** for non-trivial data in WordPress. The trade-off applies whether you store via PHP `serialize()` (WP's auto-pathway when you pass an array) OR manually as `wp_json_encode($data)` — the underlying database column is `LONGTEXT`, opaque to the SQL engine.

What you lose:

- **No SQL indexing on inner fields.** MySQL can't use an index on `data->'$.user_id'` from your option. Looking up "all options where user_id = 42" means fetching every row, decoding in PHP, filtering. O(n) regardless of data size.
- **No aggregation.** `SUM(price)` / `AVG(score)` / `GROUP BY status` over fields inside the blob is impossible without per-row decode.
- **No partial update.** Want to bump one counter inside the array? Read whole option, decode, mutate one field, encode, write whole option back. Concurrent writes race.
- **Painful schema migration.** Renaming a key or splitting a field means iterating every row, decoding, mutating, encoding, writing. Multiply by how many sites the plugin runs on.
- **Cache pressure.** A 500KB serialized option in autoload bloats every page request's memory.

**When the blob is fine:**
- Settings UI values (a dozen scalars in one array, ≤ 4-8 KB total). Fetched once per request, never aggregated.
- Read-mostly state that's effectively a "blob of preferences" — never queried by inner fields.

**When you should reach for a custom table instead:**
- Logs, audit trails, anything append-mostly.
- Per-record entities with their own schema (e.g. webhook deliveries, AI request history, user activity).
- Anything you'll ever want to filter, sort, aggregate, paginate.
- Big rows (≥ 50KB) — at that point, performance and migration concerns dominate.

The custom-table path is a `dbDelta` call in activation (see `wp-plugin-lifecycle`) plus `$wpdb->prepare` for queries. Not a free lunch but pays dividends every time you need to touch the data.

## Transients — caching, not storage

Transients store a value with an optional TTL. Backed by the object cache when one is available (Redis, Memcached, etc.); fall back to `wp_options` otherwise.

```php
$status = get_transient( 'myplugin_api_status' );
if ( false === $status ) {
    $status = myplugin_check_api_status();
    set_transient( 'myplugin_api_status', $status, HOUR_IN_SECONDS );
}
```

Rules:

- **Transients are CACHE, not source-of-truth.** WP may evict them at any time (object cache flush, low memory). Don't store anything you can't recompute.
- **TTL > 0**, almost always. With the database fallback, a transient with no expiration is stored as an autoloaded option. If the value is durable state, use `update_option()` with an explicit autoload choice instead.
- **Name your transients with a plugin prefix.** `set_transient( 'api_status', ... )` collides with everything; `myplugin_api_status` is safe.
- **`set_site_transient`** for multisite-network-wide caches (verified, untested in this skill's authoring env — see caveat above).
- **Don't use transients for high-write counters.** Each set/get traverses the object cache layer; for hot paths, write to a custom table or use the object cache directly via `wp_cache_set` / `wp_cache_get`.

## Naming conventions

- **Option names**: snake_case, plugin-prefixed. `myplugin_settings`, `myplugin_billing_settings`. Keep under ~64 chars (option_name column is `varchar(191)` in modern MySQL but transient timeout names need 12+ chars of overhead).
- **Meta keys**: snake_case, plugin-prefixed; for "private" meta (not shown in REST or `custom-fields` metabox by default) prefix with underscore: `_myplugin_form_settings`. The leading underscore matters — `register_post_meta` with a `_`-prefixed key requires explicit `auth_callback` for REST writes.
- **Transient names**: snake_case, plugin-prefixed. WordPress prepends `_transient_<name>` and `_transient_timeout_<name>` internally — `set_transient()` names must be 172 characters or fewer.
- **Site option / site transient names**: same conventions, just on the network table. `set_site_transient()` names must be 167 characters or fewer.
- **Custom table names**: `{$wpdb->prefix}myplugin_<entity>` — never hardcode `wp_` since `$wpdb->prefix` may be customized. Multisite uses per-blog prefix automatically; for network-wide tables use `$wpdb->base_prefix`.

## Critical rules

- **Group settings into ONE associative-array option per feature.** Not 100 scalar options.
- **Default `autoload` to `null`** (let WP decide). Force `false` for rarely-read options. Don't pass `'yes'`/`'no'` strings on WP 6.7+.
- **For queryable / aggregable / append-mostly data, use a custom table.** JSON / PHP-serialized blobs in options can't be SQL-indexed.
- **Transients are cache, not storage.** Always TTL, always plugin-prefixed.
- **Use the right primitive for the entity scope** — site (option), user (user-meta), post (post-meta), etc. Don't fake user-data in a global option keyed by user ID.
- **Plugin-prefix every name** (option, meta, transient, custom table, hook).
- **Never autoload secrets.** API keys and tokens belong in non-autoload options or, ideally, `wp-config.php` constants. Non-autoload is not encryption; it only keeps the secret out of the alloptions payload. (See `wp-security-secrets`.)

## Common mistakes

```php
// WRONG — one option per setting, 30 rows, 30 autoload entries
foreach ( $settings as $key => $value ) {
    update_option( 'myplugin_' . $key, $value );
}

// WRONG — JSON-encoded blob storing 10,000 log entries
update_option( 'myplugin_logs', wp_json_encode( $log_entries ) );
// Reading back: get_option, json_decode, paginate in PHP, repeat
// Should be: custom table with id / created_at / level / message columns

// WRONG — transient as durable storage (no TTL)
set_transient( 'myplugin_user_purchases', $rows ); // no expiration
// DB fallback autoloads it; object cache flush can still drop it

// WRONG — per-user data in a single option
$users = get_option( 'myplugin_users', array() );
$users[ $user_id ]['last_seen'] = time();
update_option( 'myplugin_users', $users );
// race condition + linear scan + autoload bloat

// RIGHT
update_user_meta( $user_id, 'myplugin_last_seen', time() );

// WRONG — deprecated 'yes'/'no' strings on WP 6.7+
add_option( 'myplugin_settings', $defaults, '', 'yes' );

// RIGHT
add_option( 'myplugin_settings', $defaults, '', true );

// WRONG — trying to change autoload while keeping the same value
update_option( 'myplugin_large_report', get_option( 'myplugin_large_report' ), false );

// RIGHT on WP 6.7+
wp_set_option_autoload( 'myplugin_large_report', false );
```

## Cross-references

- Run **`wp-plugin-lifecycle`** for default option seeding via `add_option` on activation, and `delete_option` / `delete_site_option` on uninstall.
- Run **`wp-security-secrets`** when the option holds API keys, tokens, OAuth secrets — autoload + plaintext storage warrants additional thought.
- Run **`wp-plugin-architecture`** for the `Schema` / Constants centralization pattern that names every option key in one place.

## What this skill does NOT cover

- Custom table schema design beyond "if you need it, use one" — column types, indexes, partitioning, migrations across plugin versions are a separate topic.
- Object-cache backend setup (Redis / Memcached) — server-side concern.
- Encrypted-at-rest options (per-plugin encryption layer over `update_option`) — niche.
- Multisite end-to-end testing patterns — see caveat at top.
- WP-CLI commands for option management (`wp option get`, `wp option update`) — adjacent topic.

## References

- `add_option` autoload semantics (WP 6.6 `null` default, 6.7 `'yes'`/`'no'` deprecation): [wp-includes/option.php](wp-includes/option.php)
- `maybe_serialize` (WP's auto-PHP-serialize for arrays/objects): [wp-includes/functions.php](wp-includes/functions.php)
- Transient API: [wp-includes/option.php](wp-includes/option.php) `set_transient` / `set_site_transient`
- Meta API: [wp-includes/meta.php](wp-includes/meta.php) — `get_metadata` / `update_metadata` / `delete_metadata` underlie all `*_meta` functions
- WP database schema: [wp-admin/includes/schema.php](wp-admin/includes/schema.php) — see how WP itself names tables and columns for inspiration
