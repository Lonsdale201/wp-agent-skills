---
name: lw-firewall-rate-limit-worker
description: Build or audit companion endpoints against LW Firewall's early MU-plugin worker, URI classification, shared and route-local rate limits, logged-in buckets, IP/geo rules, automatic bans, backend consistency, configuration overrides, logging load, and worker lifecycle. Use when code exposes REST, AJAX, login, cron, XML-RPC, WooCommerce filter, webhook, or custom endpoints or references `protect_rest_api`, `filter_params`, `RateLimiter`, `AutoBanner`, `IpDetector`, `lw_firewall_resolve_storage`, `LW_FIREWALL_*`, worker installation, 429 responses, whitelists, blacklists, geo blocking, storage, or ban enforcement.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.4"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-27"
---

# LW Firewall rate-limit worker compatibility

Use this skill when an endpoint may be blocked by LW Firewall or needs a
dedicated limit. The copied MU worker runs on `muplugins_loaded` priority 1,
before normal plugin callbacks.

## Worker decision order

After bootstrap/version checks, the request path is:

1. `LW_FIREWALL_DISABLE_WORKER` and master `enabled` exits.
2. Server/localhost IP exemption.
3. `ip_whitelist` exemption.
4. `ip_blacklist` 403.
5. Geo blocking.
6. Existing shared-ban lookup, conditionally enabled as described below.
7. 404-flood lookup.
8. User-Agent bot blocking.
9. Endpoint detection.
10. Per-IP counter, 429/redirect, and optional violation escalation.

Whitelisting bypasses every later worker check. A blacklist or geo block runs
before endpoint-specific code.

## Exact endpoint detection

| Reason | v1.5.4 condition |
|---|---|
| `cron` | URI contains `/wp-cron.php`, `protect_cron`; requests containing `doing_wp_cron=` are exempt |
| `xmlrpc` | URI contains `/xmlrpc.php`, `protect_xmlrpc` |
| `login` | URI contains `/wp-login.php`, `protect_login` |
| `rest` | URI contains `/wp-json/`, `protect_rest_api` |
| `filter` | raw query string contains a configured `filter_params` substring |

The cron exemption is not authenticated. In 1.5.4 any external request whose
URI contains both `/wp-cron.php` and `doing_wp_cron=` is treated as a loopback
and gets no endpoint limit. Because detection scans the complete raw URI in a
fixed order, a protected REST URL can also add those strings in its query and
return early before REST detection. Parse and compare the path plus the actual
loopback trust boundary in regression tests; do not treat the current helper as
proof that WordPress originated the request.

The worker does not detect arbitrary pretty URLs, normal `admin-ajax.php`
actions, route/method combinations, the bare REST index `/wp-json`, or
WordPress REST URLs written as `?rest_route=/namespace/path`. A global REST
toggle is coarse protection for a shared bucket, not registration blocking or
route authorization.

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
Cloudflare network. Do not independently trust `X-Forwarded-For`.

That safe client-IP rule does not currently extend to geo detection:
`GeoDetector` accepts any non-empty `CF-IPCountry` header without checking that
`REMOTE_ADDR` is Cloudflare. On an origin reachable directly, a caller can send
an allowed/invalid country header and skip CIDR fallback. Do not use the geo
result as authorization, and close direct origin access when relying on the
1.5.4 Cloudflare-header path.

Manual whitelist/blacklist values support individual IPv4/IPv6 addresses and
CIDR ranges. Whitelist payment/webhook providers only when their published
source ranges are stable and verified; whitelisting bypasses bot, geo, rate,
404, and shared-ban checks too.

## Verified v1.5.4 ban limitations

- The worker looks up `ban_<ip>` only when `auto_ban_enabled` or
  `login_limit_enabled` is true. Registration and password-reset code can write
  a ban while both toggles are false, leaving the indexed ban unenforced.
- Worker endpoint counters are named `<reason>_<ip>` and
  `<reason>_li_<ip>`. `AutoBanner::unban()` clears `rl_<ip>` but not those
  reason-specific keys, so an unbanned client can remain rate-limited until the
  normal `rate_window` expires.

Account for these current behaviors in tests and operational runbooks. They
are not reasons to duplicate or edit the worker from a companion plugin.

## Configuration and backend boundaries

`Options::get()` applies an `LW_FIREWALL_<KEY>` constant, but
`Options::get_all()` does not. The worker and `Plugin::init_runtime_hooks()`
read `get_all()` for their master/toggle/list decisions. Consequently several
documented constant overrides—including the master `enabled`, endpoint
toggles, IP lists, geo/bot lists and storage preference—do not change those
paths in 1.5.4. `LW_FIREWALL_DISABLE_WORKER` is checked directly and remains a
real worker kill switch. Test the effective request, not only `Options::get()`
or a status screen.

The storage implementations do not currently provide identical semantics:

- Redis and APCu keep a counter's TTL from its first hit; file storage extends
  expiry on every increment, so sustained low-rate traffic can accumulate and
  later block only on the file backend.
- APCu's missing-key path uses `apcu_store()` rather than an atomic add/retry;
  simultaneous first hits can overwrite one another and undercount a burst.
- file storage has no expired-file sweep. Distinct IP/token keys leave expired
  files until that exact key is read again, so inode use can grow without bound.
- APCu/Redis keys use the global `lw_fw_` prefix without an installation/site
  namespace; independent WordPress installs sharing the backend can collide.
- file storage is node-local unless the directory is truly shared. It cannot
  enforce one cluster-wide quota by itself.

For a security-sensitive companion, verify atomicity, TTL semantics, backend
health, installation isolation and multi-node behavior in the deployment. Do
not advertise backend-independent quotas until those checks pass.

`lw_firewall_resolve_storage()` probes APCu/Redis before the worker knows
whether the request has an endpoint limit, and a usable Redis path opens one
connection for availability and another for the backend object. Cache or defer
companion backend resolution; never add another probe loop on every page view.

When `log_enabled` is on, each blocked request can rewrite the 100-row
`lw_firewall_log` option. The cap bounds stored rows but not database writes;
high-volume logging needs sampling/aggregation or an external append-oriented
sink so the defense does not amplify a flood.

## Worker lifecycle

- Activation copies `worker/lw-firewall-worker.php` to the MU-plugin directory.
- Upgrade hooks replace it; deactivation removes it.
- Version drift makes the worker bail and the main plugin attempts one repair.
- The copied worker resolves classes from the literal
  `WP_PLUGIN_DIR . '/lw-firewall/'` directory. Renaming the plugin directory can
  make the worker return before registering while its version constant still
  lets the main plugin regard the installed copy as current.
- If the worker remains missing/outdated, the plugin does not register its
  normal runtime hooks, including registration, reset, 404 tracking, and
  security headers. Administrator monitoring is initialized separately.
- `LW_FIREWALL_DISABLE_WORKER` neutralizes the worker but does not by itself
  remove the file.

Never edit the installed copy: lifecycle operations overwrite it.

## Response and release checklist

- Test anonymous and cookie-bearing REST/filter requests separately.
- Test `/wp-json/`, bare `/wp-json`, and `?rest_route=` separately.
- Test a REST URI carrying `/wp-cron.php` plus `doing_wp_cron=` in its query.
- Test limits with `protect_rest_api` on and off.
- Exercise 429/`Retry-After`, filter redirect, and the endpoint's JSON contract.
- Test current, missing, outdated, and emergency-disabled worker states.
- Test whitelist/blacklist/CDN proxy identity from a non-local address.
- Verify automatic-ban enforcement, listing, removal, and post-unban behavior.
- Exercise the same first-hit burst and quiet/steady TTL sequence on every
  selectable storage backend.
- Inspect expired file count and database writes during a distributed smoke load.
- Verify constant overrides against a real worker request, not only an option read.

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
  - `CHANGELOG.md`
