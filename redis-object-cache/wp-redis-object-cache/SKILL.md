---
name: wp-redis-object-cache
description: >
  Configure, audit, troubleshoot, and extend the Redis Object Cache plugin
  (`redis-cache`) for WordPress persistent object caching. Covers the
  `wp-content/object-cache.php` drop-in, `wp redis status|enable|disable|update-dropin`,
  `WP_REDIS_*` constants, Predis/PhpRedis/Relay client selection, cache groups,
  selective flush, metrics, Query Monitor integration, and correct plugin code
  that uses `wp_cache_*` with Redis Object Cache.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: redis-cache
plugin-version-tested: "2.8.0"
wp-version-tested: "7.0"
php-min: "7.2"
last-updated: "2026-06-15"
docs:
  - https://wordpress.org/plugins/redis-cache/
  - https://github.com/rhubarbgroup/redis-cache
source-refs:
  - wp-content/plugins/redis-cache/redis-cache.php
  - wp-content/plugins/redis-cache/readme.txt
  - wp-content/plugins/redis-cache/includes/class-plugin.php
  - wp-content/plugins/redis-cache/includes/object-cache.php
  - wp-content/plugins/redis-cache/includes/class-predis.php
  - wp-content/plugins/redis-cache/includes/cli/class-commands.php
  - wp-content/plugins/redis-cache/includes/diagnostics.php
  - wp-content/plugins/redis-cache/includes/class-metrics.php
license: GPLv3
---

# Redis Object Cache

Redis Object Cache is a WordPress persistent object-cache drop-in manager. The plugin being active is not enough: persistent caching only runs when a valid `wp-content/object-cache.php` drop-in exists, `WP_REDIS_DISABLED` is not true, and WordPress can connect to Redis.

This skill is about WordPress/plugin integration with the OSS `redis-cache` plugin. It is not a Redis server installation or Linux service hardening guide.

## When to use this skill

Trigger when ANY of the following is true:

- The task mentions Redis Object Cache, `redis-cache`, `object-cache.php`, persistent object cache, `wp redis`, `WP_REDIS_*`, PhpRedis, Predis, Relay, Redis cluster, sentinel, or object-cache diagnostics.
- A plugin stores expensive computed data with `wp_cache_get()` / `wp_cache_set()` and the site may have Redis Object Cache enabled.
- The user reports "Redis plugin is active but not working", "Object cache not enabled", "Drop-in missing/outdated/invalid", "Redis server unreachable", or "wp cache flush flushed too much".
- Code needs cache groups, TTLs, selective flush, non-persistent groups, or Redis Object Cache hooks.

## Non-destructive checks first

Run these before changing anything:

```bash
wp redis status
wp help redis
wp eval 'echo defined( "WP_REDIS_VERSION" ) ? WP_REDIS_VERSION : "not-loaded";'
wp eval 'var_export( file_exists( WP_CONTENT_DIR . "/object-cache.php" ) );'
```

Do not run `wp redis enable`, `wp redis disable`, `wp redis update-dropin`, `wp cache flush`, or admin "Flush Cache" actions as a casual check. Those commands touch the drop-in or flush Redis data.

## Mental model

| Layer | What it means | Source behavior |
|---|---|---|
| Plugin active | Admin UI, CLI command, diagnostics, helpers are loaded | `redis-cache.php` registers the plugin and `wp redis` command |
| Drop-in installed | `wp-content/object-cache.php` exists | copied from `includes/object-cache.php` |
| Drop-in valid | Drop-in header matches this plugin URI | checked by `Plugin::validate_object_cache_dropin()` |
| Drop-in current | Drop-in version matches plugin version | checked by `Plugin::object_cache_dropin_outdated()` |
| Redis connected | `$wp_object_cache->redis_status()` returns true | reported as `Connected`; otherwise `Not connected` |

`wp redis status` can say `Not enabled` even when the plugin is active. That usually means the drop-in is missing. If the drop-in exists but Redis is down, the status moves toward `Not connected`.

## Status meanings

| Status | Read it as | Fix path |
|---|---|---|
| `Disabled` | `WP_REDIS_DISABLED` is true | remove/flip the constant if Redis should run |
| `Not enabled` | no valid drop-in | check Redis connectivity, then enable intentionally |
| `Drop-in is invalid` | another object-cache drop-in owns the file | audit before overwriting; `update-dropin` replaces it |
| `Drop-in is outdated` | plugin updated but drop-in stayed old | update the drop-in after review |
| `Not connected` | drop-in exists but Redis connection failed | check host, port, socket, auth, TLS, server state |
| `Connected` | persistent object cache is active | proceed with normal cache/API work |

## Configuration constants

Define constants in `wp-config.php`, above the WordPress bootstrap line.

Basic connection:

```php
define( 'WP_REDIS_HOST', '127.0.0.1' );
define( 'WP_REDIS_PORT', 6379 );
define( 'WP_REDIS_DATABASE', 0 );
define( 'WP_REDIS_TIMEOUT', 1 );
define( 'WP_REDIS_READ_TIMEOUT', 1 );
define( 'WP_REDIS_RETRY_INTERVAL', null );
```

Authentication:

```php
define( 'WP_REDIS_PASSWORD', 'secret' );
define( 'WP_REDIS_USERNAME', 'default' ); // Redis ACL user, when used.
```

Socket/TLS:

```php
define( 'WP_REDIS_SCHEME', 'unix' );
define( 'WP_REDIS_PATH', '/var/run/redis/redis.sock' );

define( 'WP_REDIS_SCHEME', 'tls' );
define( 'WP_REDIS_SSL_CONTEXT', array(
    'verify_peer' => true,
) );
```

Prefixing and safe flushes:

```php
define( 'WP_REDIS_PREFIX', 'example.com:' );
define( 'WP_REDIS_SELECTIVE_FLUSH', true );
```

If `WP_REDIS_PREFIX` is not defined, the drop-in maps `WP_CACHE_KEY_SALT` to `WP_REDIS_PREFIX`. On shared Redis, set a unique prefix or salt before enabling Redis. Without `WP_REDIS_SELECTIVE_FLUSH`, a full object-cache flush uses `flushdb()` for the selected database.

Performance and behavior:

```php
define( 'WP_REDIS_CLIENT', 'phpredis' ); // predis, phpredis, relay, credis.
define( 'WP_REDIS_IGBINARY', true );     // only if the igbinary extension is loaded.
define( 'WP_REDIS_MAXTTL', DAY_IN_SECONDS );
define( 'WP_REDIS_FLUSH_TIMEOUT', 5 );
define( 'WP_REDIS_GRACEFUL', true );
define( 'WP_REDIS_DISABLE_METRICS', true );
```

Groups:

```php
define( 'WP_REDIS_IGNORED_GROUPS', array( 'my-runtime-only' ) );
define( 'WP_REDIS_UNFLUSHABLE_GROUPS', array( 'my-critical-group' ) );
define( 'WP_REDIS_DISABLE_GROUP_FLUSH', false );
```

`WP_REDIS_GLOBAL_GROUPS` replaces the plugin's default global groups, it does not merge with them. Prefer `wp_cache_add_global_groups()` in plugin code unless the whole install is deliberately redefining the global group list.

Advanced topology:

```php
define( 'WP_REDIS_SERVERS', array( 'tcp://127.0.0.1:6379' ) );
define( 'WP_REDIS_SENTINEL', 'mymaster' );
define( 'WP_REDIS_CLUSTER', array( 'tcp://10.0.0.1:6379', 'tcp://10.0.0.2:6379' ) );
define( 'WP_REDIS_SHARDS', array( 'tcp://10.0.0.1:6379', 'tcp://10.0.0.2:6379' ) );
```

Do not use `WP_REDIS_SERIALIZER`; version 2.7.0 removed it. Use `WP_REDIS_IGBINARY` when igbinary is installed and desired.

## Client selection

The drop-in chooses a client in this order:

- Default is `predis`.
- If PHP class `Redis` exists, default becomes `phpredis`.
- `WP_REDIS_CLIENT` overrides the default; `pecl` maps to `phpredis`.
- Relay is used only when `WP_REDIS_CLIENT` is set to `relay`; it is not auto-selected.
- Credis still exists for compatibility but is deprecated.

Do not assume all topology modes work with every client. Relay in this plugin does not support sharding or cluster mode. Predis handles the broadest pure-PHP topology set because the plugin bundles Predis.

## WP-CLI behavior

`wp redis status` is read-only and prints diagnostics from `includes/diagnostics.php`.

`wp redis enable`:

- refuses to enable over a foreign `object-cache.php`;
- tries to flush Redis with the plugin's Predis helper before copying the drop-in;
- fails if Redis is unreachable;
- fires `redis_object_cache_enable` with the copy result.

`wp redis disable`:

- refuses if no drop-in exists;
- refuses foreign drop-ins;
- deletes a valid Redis Object Cache drop-in;
- flushes Redis after successful deletion;
- fires `redis_object_cache_disable`.

`wp redis update-dropin`:

- overwrites `wp-content/object-cache.php`;
- flushes Redis after the copy;
- fires `redis_object_cache_update_dropin`.

Treat `update-dropin` as a deliberate operation. It can replace another plugin's object-cache drop-in.

## Correct plugin cache usage

Use WordPress cache APIs. Do not instantiate Redis directly from normal plugin code.

```php
$key   = 'report:' . md5( wp_json_encode( $args ) );
$group = 'myplugin_reports';

$value = wp_cache_get( $key, $group, false, $found );
if ( ! $found ) {
    $value = myplugin_build_report( $args );
    wp_cache_set( $key, $value, $group, HOUR_IN_SECONDS );
}

return $value;
```

Always use the `$found` parameter because a cached value may legitimately be `false`, `0`, `''`, or an empty array.

Use groups intentionally:

```php
add_action( 'init', static function (): void {
    wp_cache_add_non_persistent_groups( array( 'myplugin_request_only' ) );
    wp_cache_add_global_groups( array( 'myplugin_network_config' ) );
} );
```

Flush a group only after checking support:

```php
if ( wp_cache_supports( 'flush_group' ) ) {
    wp_cache_flush_group( 'myplugin_reports' );
}
```

This drop-in reports support for `add_multiple`, `set_multiple`, `get_multiple`, `delete_multiple`, `flush_runtime`, and `flush_group`.

## Hooks and filters

Lifecycle:

- `redis_object_cache_enable`
- `redis_object_cache_disable`
- `redis_object_cache_update_dropin`

Runtime/cache events:

- `redis_object_cache_get`
- `redis_object_cache_get_multiple`
- `redis_object_cache_get_value`
- `redis_object_cache_set`
- `redis_object_cache_delete`
- `redis_object_cache_flush`
- `redis_object_cache_flush_group`
- `redis_object_cache_error`

Behavior filters:

- `redis_cache_expiration` to cap or adjust TTL per key/group.
- `redis_cache_add_non_persistent_groups` to alter groups passed to `wp_cache_add_non_persistent_groups()`.
- `redis_cache_validate_dropin` to override the plugin's drop-in validation result.
- `redis_cache_manager_capability` or `WP_REDIS_MANAGER_CAPABILITY` to change admin access from `manage_options` / `manage_network_options`.

## Metrics and diagnostics

Metrics are enabled unless `WP_REDIS_DISABLE_METRICS` is true, but they record only when Redis is connected and the drop-in exposes `info()` and `redis_instance()`. `WP_REDIS_METRICS_MAX_TIME` controls retention; default is one hour.

Diagnostics intentionally masks `WP_REDIS_PASSWORD` and password query parameters in `WP_REDIS_SERVERS`, but still avoid pasting full diagnostics into public tickets without checking for hostnames, usernames, paths, and topology.

## Critical rules

- Do not equate "plugin active" with "Redis object cache enabled". Check the drop-in and status.
- Do not enable/update/disable the drop-in on production without approval. Those operations write `wp-content/object-cache.php` and may flush Redis.
- Do not use shared Redis without a unique `WP_REDIS_PREFIX` or `WP_CACHE_KEY_SALT`.
- Do not rely on selective flush unless both `WP_REDIS_PREFIX` and `WP_REDIS_SELECTIVE_FLUSH` are set.
- Do not use `wp_cache_get()` with `false === $value` checks for values that may be false. Use `$found`.
- Do not write directly to core query cache groups unless the `wp-query-cache` skill says that pattern is safe.
- Do not log raw Redis credentials. The plugin masks diagnostics, your code still must not expose secrets.
- Do not suppress Redis connection failures in application code. Fix the service, socket, auth, TLS, constants, or drop-in state.

## Cross-references

- Run **`wp-query-cache`** when code touches core query cache groups or `last_changed` salts.
- Run **`wp-filesystem-api`** when implementing a plugin feature that writes drop-ins or generated files.
- Run **`wp-cli-extending`** when adding custom maintenance commands around cache warming or purge tasks.
- Run **`wp-security-audit`** when exposing cache flush/update actions in admin, AJAX, or REST.

## References

- Plugin entry/version: `wp-content/plugins/redis-cache/redis-cache.php`
- Drop-in implementation: `wp-content/plugins/redis-cache/includes/object-cache.php`
- Admin/drop-in lifecycle: `wp-content/plugins/redis-cache/includes/class-plugin.php`
- WP-CLI command behavior: `wp-content/plugins/redis-cache/includes/cli/class-commands.php`
- Diagnostics constants: `wp-content/plugins/redis-cache/includes/diagnostics.php`
- Predis connection/flush helper: `wp-content/plugins/redis-cache/includes/class-predis.php`
- Metrics behavior: `wp-content/plugins/redis-cache/includes/class-metrics.php`
