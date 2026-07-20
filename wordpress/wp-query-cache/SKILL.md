---
name: wp-query-cache
description: Review and implement WordPress core query-cache usage on WP 6.9+,
  especially direct interaction with query cache groups now using salted
  cache helpers. Covers wp_cache_get_salted, wp_cache_set_salted,
  wp_cache_get_multiple_salted, wp_cache_set_multiple_salted,
  wp_cache_get_last_changed, affected query
  groups like post-queries, term-queries, user-queries, comment-queries,
  site-queries, and why plugins should usually use WP_Query APIs instead
  of writing query cache entries directly. Use when code touches those core
  query groups/salts, duplicates WP_Query cache internals, or shows stale/miss
  behavior specifically after direct query-cache reads or writes; use the
  database-performance skill for general SQL, transient, OFFSET, or N+1 issues.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.9 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-12"
---

# WordPress Query Cache

WordPress 6.9 changed how query cache groups store invalidation state. Core now uses stable cache keys with stored salts instead of baking changing `last_changed` values into every key. This reduces unreachable cache keys on high-update sites.

This skill is for plugin code that directly reads/writes object-cache entries for query results. Most plugins should not do that.

Do not trigger this skill merely because code uses a transient or has a slow
query. Use `wp-database-performance-audit` for general SQL shape, indexes,
pagination, N+1 calls, payload size, or cache stampedes.

## When to use this skill

Trigger when ANY of the following is true:

- Code directly calls `wp_cache_get()` / `wp_cache_set()` in query groups such as `post-queries`, `term-queries`, `user-queries`, `comment-queries`, `site-queries`, or `network-queries`.
- Code builds cache keys with `wp_cache_get_last_changed()`.
- The task mentions persistent object cache misses, query cache bloat, cache invalidation, or stale query results after updates.
- A plugin duplicates `WP_Query`, `WP_User_Query`, `WP_Term_Query`, or `WP_Comment_Query` cache behavior.

## Prefer core query APIs

Before writing custom cache logic, ask whether the normal query API already caches the result:

- `WP_Query` and helpers for posts.
- `WP_Term_Query` / taxonomy helpers for terms.
- `WP_User_Query` / user helpers for users.
- `WP_Comment_Query` / comment helpers for comments.
- Site/network query classes on multisite.

Direct query-cache writes are a maintenance liability. They couple plugin code to internal cache key formats that changed in WP 6.9.

## Salted cache helpers

Use these only when you deliberately maintain a cache entry whose validity depends on one or more core `last_changed` salts:

```php
$last_changed = wp_cache_get_last_changed( 'posts' );
$cache_key    = 'myplugin:featured_ids:' . md5( wp_json_encode( $args ) );

$ids = wp_cache_get_salted( $cache_key, 'post-queries', $last_changed );
if ( false === $ids ) {
    $ids = myplugin_expensive_featured_post_ids_query( $args );
    wp_cache_set_salted( $cache_key, $ids, 'post-queries', $last_changed, HOUR_IN_SECONDS );
}
```

For data depending on multiple groups, pass an array of salts:

```php
$salt = array(
    wp_cache_get_last_changed( 'posts' ),
    wp_cache_get_last_changed( 'terms' ),
);

$result = wp_cache_get_salted( $cache_key, 'post-queries', $salt );
```

The helper stores an array containing `data` and `salt`. Do not assume the raw cached value is your data when reading entries written by `wp_cache_set_salted()`.

For batches, pair `wp_cache_get_multiple_salted()` with
`wp_cache_set_multiple_salted()`. Their per-key values use the same salt/data
envelope.

Do not cache literal `false` when your code uses `false` as the miss/stale
sentinel: a valid cached `false` is indistinguishable from a miss. `null` is
also unsuitable because the compatibility helper checks the data key with
`isset()`. Wrap such domain values in a non-null array/object.

## Affected groups

Core WP 6.9 uses salted query cache helpers in groups including:

- `post-queries`
- `term-queries`
- `comment-queries`
- `user-queries`
- `site-queries`
- `network-queries`

If old plugin code directly sets any of these groups with `wp_cache_set()`, it can bypass the new salt shape and produce stale reads or misses depending on how the value is later consumed.

## Invalidation

Use WordPress mutation APIs whenever possible. They update the relevant `last_changed` salts through core hooks.

```php
// Good: core updates post caches and last_changed state.
wp_update_post( array(
    'ID'         => $post_id,
    'post_title' => $title,
) );

// Risky: direct SQL bypasses normal cache invalidation.
$wpdb->update( $wpdb->posts, array( 'post_title' => $title ), array( 'ID' => $post_id ) );
```

If you deliberately perform direct SQL, call the correct cache clean function afterwards (`clean_post_cache()`, `clean_term_cache()`, `clean_user_cache()`, etc.) rather than manually setting query group salts.

## Upgrade behavior

After upgrading to WP 6.9, a temporary increase in cache misses is expected because affected query cache keys are different. Do not "fix" this by forcing old keys back. Let the cache warm naturally unless the object-cache backend needs a one-time eviction plan.

## Critical rules

- **Do not write core query groups with plain `wp_cache_set()`** unless you fully control every reader of that key.
- **Do not append `last_changed` to query cache keys in new code.** Use `wp_cache_*_salted()` helpers when direct query caching is justified.
- **Do not read salted entries with raw `wp_cache_get()`** and expect the original data shape.
- **Prefer WP query APIs over direct cache choreography.**
- **Invalidate through core mutation APIs** or the matching `clean_*_cache()` function after direct SQL.

## Common mistakes

```php
// WRONG - old pattern creates unreachable keys as last_changed changes.
$key  = 'my_query:' . md5( $sql ) . ':' . wp_cache_get_last_changed( 'posts' );
$data = wp_cache_get( $key, 'post-queries' );

// RIGHT
$salt = wp_cache_get_last_changed( 'posts' );
$key  = 'my_query:' . md5( $sql );
$data = wp_cache_get_salted( $key, 'post-queries', $salt );

// WRONG - direct set into a core query group with arbitrary shape.
wp_cache_set( $key, $data, 'post-queries' );

// RIGHT - if direct caching is truly needed.
wp_cache_set_salted( $key, $data, 'post-queries', $salt );
```

## Cross-references

- Run **`wp-plugin-options-storage`** when persistent data is being stored in options/transients instead of cache.
- Run **`wp-database-performance-audit`** for slow SQL, OFFSET, N+1,
  transient payload, or stampede analysis.
- Run **`wp-security-audit`** when direct SQL is part of the cache path.

## What this skill does NOT cover

- Writing a persistent object cache drop-in.
- CDN/page cache invalidation.
- General query optimization unrelated to core query-cache keys; use
  `wp-database-performance-audit`.

## References

- WordPress 6.9 query cache dev note: <https://make.wordpress.org/core/2025/11/17/consistent-cache-keys-for-query-groups-in-wordpress-6-9/>
- Salted cache helpers: `wp-includes/cache-compat.php`
- Query cache usage examples: `wp-includes/class-wp-query.php`, `wp-includes/class-wp-term-query.php`, `wp-includes/class-wp-user-query.php`
