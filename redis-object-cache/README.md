# redis-object-cache

Integration skills for [Redis Object Cache](https://wordpress.org/plugins/redis-cache/) (`redis-cache`, the free/OSS persistent object-cache drop-in manager by Rhubarb Group). Use when configuring, auditing, or troubleshooting Redis-backed object caching, or when plugin code uses `wp_cache_*` on installs that may have it enabled.

## Skills

| Skill | Purpose |
|---|---|
| `wp-redis-object-cache` | Configure, audit, troubleshoot, and extend the `redis-cache` plugin (tested v2.8.0, WP 7.0). Covers the `wp-content/object-cache.php` drop-in lifecycle (plugin-active vs drop-in-installed vs valid vs current vs Redis-connected), `wp redis status\|enable\|disable\|update-dropin` behavior, the `WP_REDIS_*` constants (connection, auth, socket/TLS, prefixing, selective flush, client selection, topology), Predis/PhpRedis/Relay/Credis client choice, correct `wp_cache_*` usage with the `$found` flag and groups, the `redis_object_cache_*` / `redis_cache_*` hooks and filters, metrics/diagnostics with credential masking, and the critical operational rules (don't equate "plugin active" with "cache enabled"; don't touch the drop-in or flush Redis as a casual check; always set a unique prefix/salt on shared Redis). Not a Redis server install / hardening guide. |
