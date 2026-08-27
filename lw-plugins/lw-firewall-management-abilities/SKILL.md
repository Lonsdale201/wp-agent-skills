---
name: lw-firewall-management-abilities
description: Manage and audit LW Firewall 1.5.4 through its options API, admin UI, WP-CLI, LW Site Manager abilities, worker controls, logs, administrator alerts, password-reset settings, and manual or automatic IP bans. Use when code or runbooks reference `wp lw-firewall`, `Options::save`, `LW_FIREWALL_*`, `lw-firewall/get-options`, `block-ip`, `lw_firewall_bans`, `BanList`, `AutoBanner::unban`, worker reinstall, alert baseline, reset protection, import/export, or firewall configuration migration.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.4"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-27"
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

`Options::get_all()` merges stored values with defaults and normalizes list
keys. `Options::save()` accepts a partial array, preserves other known values,
and persists only keys present in `get_defaults()`. It does not run the admin
form's type/range/IP/country validation; programmatic callers must supply
validated values of the correct type:

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
and `blocked_countries`.

`geo_action` is currently persisted and rendered as `403`/`redirect`, but the
1.5.4 PHP worker always calls its 403 response and the generated `.htaccess`
rule always uses `[F,L]`. Do not promise or test a redirect as an effective
runtime choice until the implementation consumes this option.

`Options::get($key)` checks `LW_FIREWALL_<UPPERCASE_KEY>` first. Constants can
therefore make a single option read differ from the saved value. However,
`Options::get_all()` does not overlay constants. The 1.5.4 worker, its main
runtime-hook bootstrap, the admin screen and several status/management paths
use `get_all()`, so many documented constants do not affect or even accurately
describe those paths. This includes the master/toggle/list/storage decisions;
verify each intended override with a real request. `LW_FIREWALL_DISABLE_WORKER`
is checked directly and remains a separate early-worker kill switch;
`LW_FIREWALL_LOGGEDIN_MULTIPLIER` is also read directly.

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

When LW Site Manager is active, v1.5.4 registers exactly these abilities:

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

In v1.5.4 the ability's CIDR validator casts the suffix before validating its
syntax. Values such as `10.0.0.0/foo` and `10.0.0.0/24junk` are accepted; the
runtime matcher then treats `foo` as prefix zero, which can match every address
in that IP family. Validate an exact decimal suffix and its family-specific
range in the calling workflow. The write abilities also read-modify-write the
whole option without concurrency control and do not check `Options::save()`'s
result before returning success.

The block/unblock abilities are marked `destructive: false`. Blocking the
caller's own IP is still a site-wide access-policy change with a lockout risk,
and there is no self-IP or whitelist-conflict safeguard. Agent clients should
require explicit confirmation even though the annotation does not request it.

## Manual lists versus automatic bans

- Manual blacklist: `ip_blacklist` inside `lw_firewall`; supports IP/CIDR.
- Enforced automatic ban: TTL key `ban_<ip>` in the selected storage backend.
- Listable automatic-ban index: non-autoloaded `lw_firewall_bans`, capped at 500.

The storage key is authoritative. The index records IP, reason, start and
rounded expiry so administrators can list and remove bans; an entry may remain
temporarily visible as inactive after storage loss/expiry.

Use `AutoBanner::unban($ip)` or the `ban remove` command, not raw option or
storage deletion. It removes the ban key, its index row, and several producer
counters. In v1.5.4 it does not clear the worker's reason-specific
`<reason>_<ip>` or `<reason>_li_<ip>` rate buckets, so the IP may still receive
429 until `rate_window` expires.

Also verify enforcement: the worker currently checks shared ban keys only when
`auto_ban_enabled` or `login_limit_enabled` is true. A registration/reset ban
can be indexed but dormant when both are off.

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

Admin import accepts known keys, fills missing keys from defaults, and cleans
list values plus country codes. In v1.5.4 it does not run the admin form's full
scalar type/range validation before `Options::save()`. Treat imported JSON as
untrusted: validate booleans, integers, enums, IP/CIDR values, email recipients,
and policy before production. A syntactically valid file can also intentionally
enable broad blocking.

The admin form itself applies `absint()` and `sanitize_key()` but does not
enforce the HTML controls' numeric bounds or enum allowlists server-side. The
IP textareas and general `config set` / `config-items` / `ip add` CLI paths also
do not share the Site Manager validator. Treat every management surface as a
typed-but-not-policy-validated caller until a central option schema exists.

`lw_firewall_log` holds at most 100 newest entries and is written only when
`log_enabled` is true. Rows contain IP, reason, User-Agent, URL and time; treat
them as operational/personal data. The row cap does not cap writes: every
blocked request may read and rewrite the option, so enable logging cautiously
under a live flood.

Administrator alert hooks and scans advance the baseline before/independently
of confirmed mail delivery. If `wp_mail()` fails, a transient warns the admin,
but that security event is already considered known and is not retried. The
manual scan UI/CLI can also report that an alert was sent without checking the
mailer result returned inside the scanner. Monitor delivery externally; a
successful scan is not proof that the notification arrived.

The worker is expected at `wp-content/mu-plugins/lw-firewall-worker.php`. A
missing or mismatched worker triggers one repair attempt and an admin notice.
Never edit the installed copy because activation and upgrade overwrite it.

## Automation checklist

- Read merged options and check constant overrides before mutation.
- Distinguish saved/get-all state, single-key `Options::get()` state, and the
  behavior of an actual worker request.
- Use `Options::save()` or typed CLI commands, not raw partial option writes.
- Distinguish manual blacklist, active storage ban, and listable ban index.
- Confirm worker version and active storage before interpreting ban state.
- Confirm logging before relying on logs and redact them from non-admin output.
- Confirm alert transport delivery; do not acknowledge an incident only from
  baseline advancement or the scan command's success text.
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
  - `includes/SiteManager/FirewallAbilities.php`
  - `includes/SiteManager/FirewallService.php`
  - `docs/management.md`
  - `docs/site-manager-abilities.md`
