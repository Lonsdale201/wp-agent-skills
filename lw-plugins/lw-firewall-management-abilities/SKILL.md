---
name: lw-firewall-management-abilities
description: Manage and audit LW Firewall 1.5.6 through its options API, admin UI, WP-CLI, LW Site Manager abilities, worker controls, logs, administrator alerts, password-reset settings, and manual or automatic IP bans. Use when code or runbooks reference `wp lw-firewall`, `Options::save`, `LW_FIREWALL_*`, `lw-firewall/get-options`, `block-ip`, `lw_firewall_bans`, `BanList`, `AutoBanner::unban`, worker reinstall, alert baseline, reset protection, import/export, or firewall configuration migration.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.6"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-29"
---

# LW Firewall management, abilities and CLI

Use the narrowest management surface that owns the required feature. Admin,
WP-CLI, Site Manager abilities, and `wp-config.php` constants do not expose the
same operations.

## Surface matrix

| Surface | Suitable work | Authority |
|---|---|---|
| Admin UI | full human configuration, import/export, worker, logs, alert/reset settings, automatic-ban table | `manage_options` |
| WP-CLI | complete automation, list edits, reset/alert operations, automatic bans | trusted shell context |
| Site Manager abilities | read options/logs and manage the manual blacklist only | `can_manage_options` callback |
| `wp-config.php` constants | environment-owned immutable overrides | server access |

Do not assume a new admin or CLI feature also exists as an ability.

## Option contract

The persisted option is `LightweightPlugins\Firewall\Options::OPTION_NAME`,
whose value is `lw_firewall`.

There are now three read views, and picking the wrong one is the classic bug:

| Call | Returns |
|---|---|
| `Options::get_stored()` | defaults + database, **no** constant overlay — the editing/persistence view |
| `Options::get_all()` | stored values with `LW_FIREWALL_*` constants layered on top — the **effective runtime** view |
| `Options::get($key)` | the constant if defined, otherwise the `get_all()` value |
| `Options::overridden()` | the option keys a constant currently pins |

Since 1.5.5 `get_all()` applies constants (it did not in 1.5.4, which is why the
worker, the hook bootstrap, the `.htaccess` sync and the status screen all ran
on a configuration the operator had not chosen). Saving reads `get_stored()`,
so a pinned value is never written into the database and never survives the
constant's removal.

`Options::save()` accepts a partial array, preserves other known values, and
persists only keys present in `get_defaults()`. Since 1.5.6 it also runs
`OptionSchema::apply()` on **every** key — one server-side value policy that
clamps numeric ranges and allowlists enums for the form, WP-CLI and the settings
import alike. Passing a well-typed value is still good practice, but a bad one
is now clamped rather than stored:

```php
use LightweightPlugins\Firewall\Options;

Options::save([
    'rate_limit' => 50,
    'protect_rest_api' => true,
]);
```

Do not call `update_option('lw_firewall', $partial)`; that bypasses the merge,
normalization, and known-key boundary.

List keys are `filter_params`, `blocked_bots`, `ip_whitelist`, `ip_blacklist`,
`blocked_countries`, and `trusted_proxies`.

`geo_action` was **removed in 1.5.5**. It had never been read at runtime — the
worker always returned 403 and the `.htaccess` rule was always `[F,L]` — and it
is unimplementable as documented, since geo blocking applies to every path and
redirecting a blocked visitor to the homepage would loop. Do not reference the
option, and drop it from migrations and import files.

New in 1.5.6: `trusted_proxies` and `proxy_header` (IP Rules → Reverse Proxy).
Opt-in reverse-proxy support; without it a site behind nginx-on-the-same-host
sees every visitor as `127.0.0.1`, which the worker treats as the server's own
address — a silent total bypass. See `lw-firewall-rate-limit-worker`.

`LW_FIREWALL_DISABLE_WORKER` is checked directly and remains a separate
early-worker kill switch; `LW_FIREWALL_LOGGEDIN_MULTIPLIER` is also read
directly.

## WP-CLI map

```bash
wp lw-firewall status

wp lw-firewall config list --format=json
wp lw-firewall config get rate_limit --format=json
wp lw-firewall config set rate_limit 50
wp lw-firewall config reset --yes
wp lw-firewall config-items add filter_params "add-to-cart|10"
wp lw-firewall config-items remove filter_params "add-to-cart|10"

wp lw-firewall bots list --format=json
wp lw-firewall ip list blacklist --format=json
wp lw-firewall geo update
wp lw-firewall logs list --limit=50 --format=json
wp lw-firewall worker install

wp lw-firewall alerts status --format=json
wp lw-firewall alerts scan
wp lw-firewall alerts test
wp lw-firewall alerts baseline
wp lw-firewall alerts baseline --reset

wp lw-firewall reset status --format=json
wp lw-firewall reset on --proof --auto-ban --alert
wp lw-firewall reset on --block-admins
wp lw-firewall reset off

wp lw-firewall ban list --format=json
wp lw-firewall ban check 203.0.113.42
wp lw-firewall ban remove 203.0.113.42
wp lw-firewall ban clear --yes
```

Use `config-items` rather than replacing a complete list in automation.
`reset off` preserves individual reset limits/hardening settings for later re-enable.
Reset `--block-admins` deliberately trades self-service recovery for hardening;
confirm an alternative recovery path first.

## Site Manager abilities

When LW Site Manager is active, v1.5.6 registers exactly these abilities (the
set is unchanged since 1.5.4):

| Ability | Operation |
|---|---|
| `lw-firewall/get-options` | merged options read |
| `lw-firewall/get-log` | 1–100 recent log rows |
| `lw-firewall/list-blocked` | manual `ip_blacklist` only |
| `lw-firewall/block-ip` | idempotently add IP/CIDR to manual blacklist |
| `lw-firewall/unblock-ip` | remove IP/CIDR from manual blacklist |

All use Site Manager's `can_manage_options` permission callback and are exposed
through ability metadata. There are no ability contracts for automatic bans,
alerts, reset controls, worker install, or full option writes. Do not call the
manual `unblock-ip` ability to release an automatic ban.

The dangerous half of the 1.5.4 CIDR defect is fixed, the cosmetic half is not
— and the distinction matters:

- **Fixed (1.5.5, in `IpMatcher::ip_in_cidr()`).** The prefix must be an exact
  decimal (`ctype_digit`) within the family's range. `10.0.0.0/foo` and
  `10.0.0.0/-1` no longer collapse to a zero-width mask, so one typo in the
  whitelist can no longer disable the firewall and one in the blacklist can no
  longer take the site down. A malformed rule simply never matches.
- **Not fixed (`FirewallService::is_valid_ip_or_cidr()`).** The ability's own
  validator still casts the suffix with `(int)` before range-checking, so
  `10.0.0.0/foo` is still *accepted and stored*. It is now inert rather than
  catastrophic, but it is a rule the operator believes is active and is not.
  Validate an exact decimal suffix and its family-specific range in the calling
  workflow.

The write abilities still read-modify-write the whole option without
concurrency control and still do not check `Options::save()`'s result before
returning success.

The block/unblock abilities are marked `destructive: false`. Blocking the
caller's own IP is still a site-wide access-policy change with a lockout risk,
and there is no self-IP or whitelist-conflict safeguard. Agent clients should
require explicit confirmation even though the annotation does not request it.

## Manual lists versus automatic bans

- Manual blacklist: `ip_blacklist` inside `lw_firewall`; supports IP/CIDR.
- Enforced automatic ban: TTL key `ban_<ip>` in the selected storage backend.
- Listable automatic-ban index: non-autoloaded `lw_firewall_bans`, capped at 500.

Ban durations are clamped since 1.5.6: a zero duration used to mean "no TTL" to
every backend, i.e. an accidentally permanent ban.

The storage key is authoritative. The index records IP, reason, start and
rounded expiry so administrators can list and remove bans; an entry may remain
temporarily visible as inactive after storage loss/expiry.

Use `AutoBanner::unban($ip)` or the `ban remove` command, not raw option or
storage deletion. It removes the ban key, its index row, the producer counters
and — since 1.5.5 — the worker's reason-specific `<reason>_<ip>` /
`<reason>_li_<ip>` rate buckets, so a released address is actually released
instead of staying 429 until `rate_window` aged out.

Enforcement is also no longer conditional: since 1.5.5 the worker reads the ban
key whenever the firewall is on. A registration or password-reset ban is no
longer indexed-but-dormant while `auto_ban_enabled` and `login_limit_enabled`
are off. Still verify with a real follow-up request — the storage key, not the
index row, is the authority.

## Administrator alerts and reset protection

Administrator monitoring is initialized independently of worker health. It
uses immediate user lifecycle hooks plus an hourly reconciliation snapshot.
The snapshot fingerprints ID, login, email and a digest of the stored password
hash; it does not store the password or reusable hash. Alert recipients come
from `admin_alert_email` with site-admin fallback.

Password-reset protection is different: its runtime hooks are registered only
after the worker passes the version/installation check and the master firewall
is enabled. Use `lw-firewall-password-reset-protection` before changing its
limits or proof settings.

## Import, logs and worker

The 1.5.4 gap this skill described as "until a central option schema exists"
is closed. `OptionSchema` (`includes/OptionSchema.php`) is now the single
server-side value policy: `ranges()` clamps every numeric setting, `enums()`
allowlists every enumerated one, and `Options::save()` runs `apply()` over all
keys. The form, WP-CLI (`config set`, `config-items`, `ip add`) and the settings
import therefore share one policy — the form's only numeric bounds used to be
HTML `min`/`max` attributes, which nothing but a browser enforces.

That is type/range/enum policy, not trust. Imported JSON is still untrusted
input: a syntactically valid, fully in-range file can intentionally enable broad
blocking, blacklist the operator's own range, or redirect alert mail. Review
IP/CIDR values, country codes, email recipients and blocking policy before
importing into production. The Site Manager ability validator still differs
from `IpMatcher` (see above).

`lw_firewall_log` holds at most 100 newest entries and is written only when
`log_enabled` is true. Rows contain IP, reason, User-Agent, URL and time; treat
them as operational/personal data. Since 1.5.6 `Logger` collapses a repeated
IP/reason pair for five minutes into one counted entry, so a flood no longer
rewrites the option on every blocked request — the write amplification is
bounded, not gone, since distinct IPs still each write.

Alert delivery is now retried. `AlertQueue` holds notifications whose send
failed and the next scan retries them, giving up only after a capped number of
attempts (the admin transient still shows the failure). The baseline snapshot is
explicitly a **deduplication record, not a delivery receipt** — treating it as
one is what let a single SMTP hiccup permanently lose the notice that an
administrator had appeared. Still monitor transport externally: a scan that
reports success means the alert was queued or sent, not that it was received.

The worker is expected at `wp-content/mu-plugins/lw-firewall-worker.php`. A
missing or mismatched worker triggers one repair attempt and an admin notice;
since 1.5.6 the check compares file content (`filemtime`) as well as the version
constant, and the worker writes a `lw_firewall_worker_alive` transient so the
Status tab can distinguish "installed" from "has actually run". Manage it with
`wp lw-firewall worker install|remove`. Never edit the installed copy because
activation and upgrade overwrite it.

## Automation checklist

- Read merged options and check constant overrides before mutation.
- Distinguish saved/get-all state, single-key `Options::get()` state, and the
  behavior of an actual worker request.
- Use `Options::save()` or typed CLI commands, not raw partial option writes.
- Distinguish manual blacklist, active storage ban, and listable ban index.
- Confirm worker version and active storage before interpreting ban state.
- Confirm logging before relying on logs and redact them from non-admin output.
- Confirm alert transport delivery; a queued/retried alert is not a received
  one, and the scan command's success text is not a delivery receipt.
- Check `Options::overridden()` before telling an operator a setting took effect.
- Treat `alerts baseline --reset` as a security-state mutation requiring review.
- Verify ban removal with a real follow-up request, not only an index row.
- Use WP-CLI/admin for features absent from Site Manager abilities.

## Cross-references

- Use `lw-firewall-rate-limit-worker` for request-path behavior.
- Use `lw-firewall-registration-guard` for registration settings and tracking.
- Use `lw-firewall-password-reset-protection` for reset limits and proof scope.
- Use `lw-site-manager-extend-abilities` before adding companion abilities.

## References

- Official project: <https://github.com/lwplugins/lw-firewall>
- Verified plugin-root-relative sources:
  - `lw-firewall.php`
  - `includes/Options.php`
  - `includes/Plugin.php`
  - `includes/Rules/AutoBanner.php`
  - `includes/Rules/BanList.php`
  - `includes/CLI/FirewallCommand.php`
  - `includes/CLI/ConfigCommand.php`
  - `includes/CLI/ConfigItemsCommand.php`
  - `includes/CLI/BanCommand.php`
  - `includes/CLI/ResetCommand.php`
  - `includes/CLI/AlertsCommand.php`
  - `includes/OptionSchema.php`
  - `includes/Logger.php`
  - `includes/Alerts/AlertQueue.php`
  - `includes/Rules/IpMatcher.php`
  - `includes/CLI/WorkerCommand.php`
  - `includes/SiteManager/FirewallAbilities.php`
  - `includes/SiteManager/FirewallService.php`
  - `docs/management.md`
  - `docs/site-manager-abilities.md`
