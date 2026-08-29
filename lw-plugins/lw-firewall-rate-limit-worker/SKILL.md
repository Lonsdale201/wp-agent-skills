---
name: lw-firewall-rate-limit-worker
description: Build or audit companion endpoints against LW Firewall's early MU-plugin worker, URI classification, shared and route-local rate limits, logged-in buckets, IP/geo rules, automatic bans, backend consistency, configuration overrides, logging load, and worker lifecycle. Use when code exposes REST, AJAX, login, cron, XML-RPC, WooCommerce filter, webhook, or custom endpoints or references `protect_rest_api`, `filter_params`, `RateLimiter`, `AutoBanner`, `IpDetector`, `lw_firewall_resolve_storage`, `LW_FIREWALL_*`, worker installation, 429 responses, whitelists, blacklists, geo blocking, storage, or ban enforcement.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.6"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-29"
---

# LW Firewall rate-limit worker compatibility

Use this skill when an endpoint may be blocked by LW Firewall or needs a
dedicated limit. The copied MU worker runs on `muplugins_loaded` priority 1,
before normal plugin callbacks.

## Worker decision order

After bootstrap/version checks, the request path is:

1. `LW_FIREWALL_DISABLE_WORKER` and master `enabled` exits.
2. Worker heartbeat transient (`lw_firewall_worker_alive`), written before any
   decision so the Status tab can tell "installed" from "actually running".
3. Server/localhost IP exemption.
4. `ip_whitelist` exemption.
5. `ip_blacklist` 403.
6. Geo blocking.
7. Storage resolution (memoized per request).
8. Shared-ban lookup — **unconditional whenever the firewall is on** since 1.5.5.
9. 404-flood lookup.
10. User-Agent bot blocking.
11. Endpoint detection.
12. Per-IP counter, 429/redirect, and optional violation escalation.

Whitelisting bypasses every later worker check. A blacklist or geo block runs
before endpoint-specific code.

The server-IP exemption covers `127.0.0.1`, `::1` and `SERVER_ADDR` only. Since
1.5.6 the site's own hostname is deliberately **not** resolved into an
exemption: `SERVER_NAME` comes from the client's `Host` header under Apache's
default `UseCanonicalName Off`, so resolving it was a full bypass for any
address an attacker could point a hostname at.

## Exact endpoint detection

Since 1.5.6 classification runs on the **decoded path**, never the raw URI.
`lw_firewall_parse_uri()` splits path from query, `rawurldecode()`s the path,
collapses repeated slashes and strips a trailing one; `lw_firewall_path_is()`
then compares with `str_ends_with` so a subdirectory install's
`/blog/wp-login.php` still matches.

| Reason | v1.5.6 condition |
|---|---|
| `cron` | decoded path is/ends with `/wp-cron.php`, `protect_cron`; exempt only when `doing_wp_cron` is a query arg **on that path** |
| `xmlrpc` | decoded path is/ends with `/xmlrpc.php`, `protect_xmlrpc` |
| `login` | decoded path is/ends with `/wp-login.php`, `protect_login` |
| `rest` | decoded path contains `/wp-json/` (bare `/wp-json` included) **or** a `rest_route` query arg is present, `protect_rest_api` |
| `filter` | raw query string contains a configured `filter_params` substring |

This closes the 1.5.4 substring hole: `/wp-json/x?next=/wp-cron.php&doing_wp_cron=1`
no longer escapes rate limiting, and `?redirect=/wp-login.php` is no longer
billed to the login quota. Both REST shapes are now covered — the pretty
`/wp-json/` prefix, the bare `/wp-json` index, and `?rest_route=/namespace/path`.

The cron loopback marker is still **not authenticated** — it is only a path-scoped
`doing_wp_cron` presence check. It can no longer be used to skip classification
on another endpoint, but do not treat it as proof that WordPress originated the
request.

The worker still does not detect arbitrary pretty URLs, normal `admin-ajax.php`
actions, or route/method combinations. A global REST toggle is coarse
protection for a shared bucket, not registration blocking or route
authorization.

## Logged-in REST/filter bucket

On `rest` and `filter` only, a cookie whose name starts with
`wordpress_logged_in_` and whose value has the expected four-part shape moves
the request into `<reason>_li_<ip>` with a default 10× allowance. The worker
cannot authenticate the cookie this early, so this is deliberate headroom, not
a trusted-user exemption. Override the multiplier with the integer constant
`LW_FIREWALL_LOGGEDIN_MULTIPLIER`.

Application Password, bearer-token, and other stateless REST authentication do
not normally carry that cookie and therefore use the anonymous bucket. Login,
XML-RPC, and cron never receive the higher allowance.

Any client can forge the expected cookie shape; the worker does not validate
its HMAC. That cannot remove the limit, but it gives an anonymous REST/filter
request the separate default 10× bucket. Do not use the worker bucket as the
only limit for an expensive public route.

## Query parameter filters

`filter_params` uses case-sensitive substring matching against the raw query
string. Entries may carry a per-match limit:

```text
filter_|30
query_type_|30
add-to-cart|10
my_expensive_filter|5
```

When several entries match, the lowest explicit limit wins. Avoid broad pieces
such as `s`, `id`, or `page`; substrings are not parsed parameter names.

## Route-local protection

Use a unique key when the worker cannot identify the endpoint narrowly:

```php
use LightweightPlugins\Firewall\IpDetector;
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\AutoBanner;
use LightweightPlugins\Firewall\Rules\RateLimiter;

if (function_exists('lw_firewall_resolve_storage')
    && class_exists(RateLimiter::class)
) {
    $ip = IpDetector::get_ip();
    $storage = lw_firewall_resolve_storage((string) Options::get('storage', 'auto'));
    $allowed = (new RateLimiter($storage))->is_allowed_key(
        'myplugin_public_signup_' . $ip,
        5
    );

    if (!$allowed) {
        if ((bool) Options::get('auto_ban_enabled', false)) {
            (new AutoBanner($storage))->record_violation($ip);
        }

        RateLimiter::too_many();
    }
}
```

Run this before expensive database or remote work. Do not reuse worker keys
such as `rest_<ip>`, `filter_<ip>`, or their `_li_` forms. `too_many()` prints a
plain 429 response and exits; return a `WP_Error` instead when the endpoint
must preserve a JSON error contract.

## IP identity and lists

Use `IpDetector::get_ip()` so companion counters agree with the worker.
`CF-Connecting-IP` is trusted only when `REMOTE_ADDR` belongs to a known
Cloudflare network. Never independently trust `X-Forwarded-For`.

Since 1.5.6 that same trust test also gates geo: `GeoDetector` calls
`IpDetector::is_cloudflare_request()` before reading `CF-IPCountry`, and the
value must be exactly two letters (`XX`/`T1` fall through to the CIDR index).
The 1.5.4 hole — any non-empty country header believed straight at the origin —
is closed. Geo is still a signal, not authorization.

**Reverse proxies (new in 1.5.6, opt-in).** Behind the common "nginx in front
of Apache on the same host" layout every request arrived as `127.0.0.1`, which
the server-IP exemption treated as the server itself: a silent, total bypass
while the Status tab reported health. Configure trusted proxies under
IP Rules → Reverse Proxy (`trusted_proxies`, `proxy_header`). `ProxyTrust`
reads the forwarded chain right to left, skipping hops that are themselves
trusted, and only after `REMOTE_ADDR` matches a configured proxy; the header
name is restricted to `x-forwarded-for` / `x-real-ip` / `forwarded`. It stays
opt-in because a forwarded header is client-controlled until the hop that set
it is known. If a companion computes its own client IP, it must honour the same
configuration or its counters will disagree with the worker's.

Manual whitelist/blacklist values support individual IPv4/IPv6 addresses and
CIDR ranges. Whitelist payment/webhook providers only when their published
source ranges are stable and verified; whitelisting bypasses bot, geo, rate,
404, and shared-ban checks too.

## Ban enforcement (fixed in 1.5.5)

Both 1.5.4 ban defects are gone:

- The worker now reads `ban_<ip>` **unconditionally whenever the firewall is
  on**. Gating it on `auto_ban_enabled` / `login_limit_enabled` had left every
  other producer — registration spam, password-reset floods, a manual CLI or
  admin ban — writing a key nothing ever read, so the admin screen listed an
  address as banned while it browsed the site freely.
- `AutoBanner::unban()` now also clears the worker's per-endpoint counters, so
  a released address is actually released instead of staying 429 until
  `rate_window` aged out.
- Ban durations are clamped: a zero duration used to mean "no TTL" to every
  backend, i.e. an accidentally permanent ban.

Still verify a real follow-up request rather than an index row — the storage
key remains the sole authority on whether an IP is blocked.

## Configuration and backend boundaries

Since 1.5.5 `wp-config.php` constants reach the runtime. `Options::get_all()`
layers `LW_FIREWALL_<KEY>` constants over the stored values, so the worker,
`Plugin::init_runtime_hooks()`, the `.htaccess` sync and the status screen all
see the pinned configuration — including the master `enabled` switch. The new
`Options::get_stored()` is the editing/persistence view with no constant
overlay, so saving never writes a pinned value into the database, and
`Options::overridden()` lists the keys a constant currently pins (the settings
screen labels those fields). `LW_FIREWALL_DISABLE_WORKER` is still checked
directly and remains a real worker kill switch.

The 1.5.4 storage-semantics divergences are fixed:

- The file backend counts in a **fixed window** like Redis and APCu.
  Re-stamping expiry on every increment made it a sliding window, so the same
  traffic banned on one backend and never banned on another. `increment()` is
  an atomic read-modify-write under an exclusive lock.
- APCu uses `apcu_add()` for the first hit, so concurrent first requests can no
  longer overwrite one another and undercount the start of a burst.
- Expired cache files are swept probabilistically with a batch cap
  (`CacheDirectory::sweep()`), instead of only when the identical hashed key
  was read again.
- Guard files are written unconditionally and cover the geo sub-directory
  (`CacheDirectory::protect()`).
- Keys are namespaced per installation: `StorageDetector::key_prefix()` returns
  `lw_fw_<md5(ABSPATH) first 8>_`. Two installs sharing one APCu/Redis pool no
  longer collide. Note the seed is `ABSPATH`, so a **multisite network shares
  one prefix** — buckets are per network, not per subsite.
- The CIDR cache is written to a temp file and renamed, so a reader cannot see
  a half-written include and fail open.

Remaining backend caveat: file storage is node-local unless the directory is
truly shared. It cannot enforce one cluster-wide quota by itself.

For a security-sensitive companion, verify atomicity, TTL semantics, backend
health, installation isolation and multi-node behavior in the deployment. Do
not advertise backend-independent quotas until those checks pass.

`lw_firewall_resolve_storage()` is memoized per request since 1.5.6 (a static
map keyed by preference, delegating to `lw_firewall_build_storage()`), so
repeated calls no longer re-run the availability probes or open a second Redis
connection. A companion may call it freely; still never add its own probe loop
on every page view.

When `log_enabled` is on, `Logger` collapses repeated IP/reason pairs for five
minutes (`DEDUPE_WINDOW = 300`) into one counted entry, so a flood no longer
rewrites the 100-row `lw_firewall_log` option on every blocked request. The
write amplification is bounded, not eliminated: distinct IPs still each write.
High-volume sites should still prefer an external append-oriented sink.

## Worker lifecycle

- Activation copies `worker/lw-firewall-worker.php` to the MU-plugin directory.
- Upgrade hooks replace it; deactivation removes it.
- Version drift makes the worker bail and the main plugin attempts one repair.
- Since 1.5.6 `Activator::is_worker_outdated()` also compares **content**, not
  only the version constant: an installed copy older than
  `worker/lw-firewall-worker.php` by `filemtime` is replaced. A worker edited
  without a version bump used to leave the stale copy running against new
  plugin classes, which can fatal the site on a duplicate declaration.
- The copied worker still resolves classes from the literal
  `WP_PLUGIN_DIR . '/lw-firewall/'` directory, so renaming the plugin directory
  makes it return before registering. Since 1.5.6 that is visible: the worker
  writes a `lw_firewall_worker_alive` transient before any decision, and the
  Status tab reports a worker that is installed but has never run
  (`Activator::worker_last_seen()`). The version constant is defined before the
  worker proves it can load anything, so it alone never was evidence.
- `wp lw-firewall worker install|remove` drives the lifecycle from the CLI.
- If the worker remains missing/outdated, the plugin does not register its
  normal runtime hooks, including registration, reset, 404 tracking, and
  security headers. Administrator monitoring is initialized separately.
- `LW_FIREWALL_DISABLE_WORKER` neutralizes the worker but does not by itself
  remove the file.

Never edit the installed copy: lifecycle operations overwrite it.

## Response and release checklist

- Test anonymous and cookie-bearing REST/filter requests separately.
- Test `/wp-json/`, bare `/wp-json`, and `?rest_route=` separately.
- Test a REST URI carrying `/wp-cron.php` plus `doing_wp_cron=` in its query,
  and percent-encoded / doubled-slash / trailing-slash spellings of each endpoint.
- Test from behind a reverse proxy with and without `trusted_proxies` set.
- Test limits with `protect_rest_api` on and off.
- Exercise 429/`Retry-After`, filter redirect, and the endpoint's JSON contract.
- Test current, missing, outdated, and emergency-disabled worker states.
- Test whitelist/blacklist/CDN proxy identity from a non-local address.
- Verify automatic-ban enforcement, listing, removal, and post-unban behavior.
- Exercise the same first-hit burst and quiet/steady TTL sequence on every
  selectable storage backend.
- Inspect expired file count and database writes during a distributed smoke load.
- Verify constant overrides against a real worker request, not only an option read.
- Verify the worker heartbeat after a plugin-directory rename.

## Cross-references

- Use `lw-firewall-registration-guard` for signup proof fields.
- Use `lw-firewall-password-reset-protection` for lost-password limits.
- Use `lw-firewall-management-abilities` for CLI, options, bans, and logs.
- Use `wp-rest-api` for REST permission and schema design.

## References

- Official project: <https://github.com/lwplugins/lw-firewall>
- Verified plugin-root-relative sources:
  - `worker/lw-firewall-worker.php`
  - `includes/helpers.php`
  - `includes/Plugin.php`
  - `includes/Activator.php`
  - `includes/Options.php`
  - `includes/IpDetector.php`
  - `includes/Rules/RateLimiter.php`
  - `includes/Rules/AutoBanner.php`
  - `includes/Rules/IpMatcher.php`
  - `includes/Storage/StorageInterface.php`
  - `includes/Storage/FileStorage.php`
  - `includes/Storage/ApcuStorage.php`
  - `includes/Storage/StorageDetector.php`
  - `includes/Storage/CacheDirectory.php`
  - `includes/ProxyTrust.php`
  - `includes/OptionSchema.php`
  - `includes/Logger.php`
  - `includes/Geo/GeoDetector.php`
  - `includes/CLI/WorkerCommand.php`
  - `CHANGELOG.md`
