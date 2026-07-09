---
name: lw-firewall-rate-limit-worker
description: Make plugins compatible with LW Firewall's MU-plugin worker, endpoint detection, rate limiting, IP rules, auto-ban, bot blocking, REST protection, and storage backends. Use when code touches custom REST/AJAX endpoints, query-string filters, Woo filters, `wp-login.php`, `wp-cron.php`, `xmlrpc.php`, `filter_params`, `ip_whitelist`, `ip_blacklist`, `LW_FIREWALL_*` constants, `RateLimiter`, `AutoBanner`, `IpDetector`, or worker install/outdated/fail-open behavior.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-firewall
plugin-version-tested: "1.3.2"
php-min: "8.1"
last-updated: "2026-07-09"
docs:
  - https://github.com/lwplugins/lw-firewall
source-refs:
  - wp-content/plugins/lw-firewall/worker/lw-firewall-worker.php
  - wp-content/plugins/lw-firewall/includes/Plugin.php
  - wp-content/plugins/lw-firewall/includes/Activator.php
  - wp-content/plugins/lw-firewall/includes/Options.php
  - wp-content/plugins/lw-firewall/includes/IpDetector.php
  - wp-content/plugins/lw-firewall/includes/Rules/RateLimiter.php
  - wp-content/plugins/lw-firewall/includes/Rules/AutoBanner.php
  - wp-content/plugins/lw-firewall/includes/Rules/IpMatcher.php
  - wp-content/plugins/lw-firewall/includes/Storage/StorageInterface.php
  - wp-content/plugins/lw-firewall/includes/Storage/FileStorage.php
  - wp-content/plugins/lw-firewall/includes/helpers.php
  - wp-content/plugins/lw-firewall/README.md
---

# LW Firewall: rate-limit worker compatibility

Use this when a plugin endpoint may be blocked or should be protected by LW
Firewall. The firewall's main protection runs from an installed MU-plugin worker
on `muplugins_loaded` priority 1, before normal plugins and themes finish
booting.

## Worker order

The worker checks requests in this order:

1. Emergency kill switch: `LW_FIREWALL_DISABLE_WORKER`.
2. Master option: `enabled`.
3. Server/localhost IP skip.
4. `ip_whitelist` skip all checks.
5. `ip_blacklist` 403.
6. Geo blocking.
7. Existing auto-ban check.
8. 404 flood check.
9. User-Agent bot blocking.
10. Endpoint detection.
11. Rate limiting and optional auto-ban escalation.

This order matters. A whitelisted IP bypasses all later checks; a blacklisted IP
is blocked before endpoint-specific code can run.

## Endpoint detection

The worker detects only these request types:

| Type | Condition |
|---|---|
| `cron` | URI contains `/wp-cron.php` and `protect_cron` is on |
| `xmlrpc` | URI contains `/xmlrpc.php` and `protect_xmlrpc` is on |
| `login` | URI contains `/wp-login.php` and `protect_login` is on |
| `rest` | URI contains `/wp-json/` and `protect_rest_api` is on |
| `filter` | query string contains an entry from `filter_params` |

Arbitrary pretty URLs are not rate-limited by the worker unless they also match
one of these conditions.

## Query parameter filters

`filter_params` entries are substring matches against the raw query string.
Entries may include a stricter per-prefix limit:

```text
filter_|30
query_type_|30
add-to-cart|10
my_expensive_filter|5
```

If multiple entries match, the lowest custom limit is used. The global fallback
is `rate_limit` requests per `rate_window` seconds.

Use `filter_params` for expensive filter/search URLs. Do not add broad prefixes
like `s` or `id`; that will rate-limit normal traffic.

## Custom endpoint self-protection

For a custom endpoint that the worker cannot detect precisely, rate-limit inside
the endpoint:

```php
use LightweightPlugins\Firewall\IpDetector;
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\AutoBanner;
use LightweightPlugins\Firewall\Rules\RateLimiter;

if ( function_exists( 'lw_firewall_resolve_storage' ) && class_exists( RateLimiter::class ) ) {
	$ip      = IpDetector::get_ip();
	$storage = lw_firewall_resolve_storage( (string) Options::get( 'storage', 'auto' ) );
	$key     = 'myplugin_signup_' . $ip;
	$limit   = 10;

	if ( ! ( new RateLimiter( $storage ) )->is_allowed_key( $key, $limit ) ) {
		if ( Options::get( 'auto_ban_enabled', false ) ) {
			( new AutoBanner( $storage ) )->record_violation( $ip );
		}

		RateLimiter::too_many();
	}
}
```

Use a stable namespaced key. Do not reuse the worker's keys such as `login_*`,
`rest_*`, or `filter_*`.

## Whitelist and blacklist

Manual IP lists support individual IPs and CIDR ranges for IPv4 and IPv6.

- Use whitelist for server-to-server callbacks, monitoring IPs, payment webhooks,
  or trusted admin/VPN IPs that must not be rate-limited.
- Use blacklist for known abusive IPs or ranges.
- Validate IP/CIDR values before writing them.
- Remember auto-banned IPs are stored separately from the manual blacklist.

Whitelist is powerful: it bypasses rate limits, bot blocking, geo blocking, and
auto-ban checks.

## Cloudflare IP handling

`IpDetector::get_ip()` trusts `CF-Connecting-IP` only when `REMOTE_ADDR` is a
known Cloudflare range. Otherwise it falls back to `REMOTE_ADDR`. Do not invent
your own `X-Forwarded-For` parsing beside the firewall, or your endpoint may
count a different IP from the worker.

## Worker lifecycle

- Activation installs `wp-content/mu-plugins/lw-firewall-worker.php`.
- Deactivation removes it.
- Upgrade hooks reinstall it after plugin updates.
- If the installed worker version differs from `LW_FIREWALL_VERSION`, the worker
  bails and the main plugin shows a notice/reinstalls.
- `LW_FIREWALL_DISABLE_WORKER` in `wp-config.php` neutralizes the worker.

Never edit the installed worker directly; activation/update overwrites it.

## Response behavior

- `filter` rate-limit uses configured `action`: 302 redirect stripping query
  params or 429.
- Other rate-limited endpoints return 429 with `Retry-After`.
- Blacklist, geo block, bot block, and auto-ban generally return 403.
- Logs are capped at the latest 100 entries and only stored when `log_enabled` is on.

## Compatibility checklist

- Check whether your endpoint is REST, `wp-login.php`, query-filter based, or custom pretty URL.
- Add narrow `filter_params` entries for expensive query URLs.
- Add endpoint-local `RateLimiter` protection when path-specific protection is required.
- Use `IpDetector::get_ip()` for any companion counters.
- Document webhook/provider IPs that should be whitelisted.
- Test with `protect_rest_api` both on and off if your plugin exposes REST routes.
- Test worker installed, missing/outdated, and disabled with `LW_FIREWALL_DISABLE_WORKER`.

## Cross-references

- Run `lw-firewall-registration-guard` for custom signup forms.
- Run `wp-rest-api` for REST route permission and nonce behavior.
- Run `wp-security-audit` when adding public AJAX/REST endpoints.

## What this skill does NOT cover

- Replacing a WAF/CDN firewall.
- Editing Apache/Nginx server rules manually.
- Captcha or bot-score provider integrations.
