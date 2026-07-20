---
name: lw-firewall-management-abilities
description: Automate or audit LW Firewall management through WP-CLI, Site Manager abilities, config import/export, options, logs, worker status, IP blacklist changes, and wp-config overrides. Use when code or operational runbooks mention `wp lw-firewall`, `lw-firewall/get-options`, `lw-firewall/get-log`, `lw-firewall/block-ip`, `lw-firewall/unblock-ip`, `Options::save`, `LW_FIREWALL_*` constants, `log_enabled`, worker install/reinstall, config-items, or firewall settings migration.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.3.2"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-09"
---

# LW Firewall: management abilities and CLI

Use this when a plugin, deployment script, or AI agent needs to inspect or
change LW Firewall safely. There are three management surfaces with different
scope: admin settings/import-export, WP-CLI, and LW Site Manager abilities.

## Management surface matrix

| Surface | Best for | Capability |
|---|---|---|
| Admin UI | human settings, import/export, worker reinstall, log clear | `manage_options` |
| WP-CLI | deployment, scripted config, list edits, geo, logs, worker | shell WP-CLI user context |
| Site Manager abilities | AI/REST management of options, logs, manual blacklist | `can_manage_options` |
| `wp-config.php` constants | immutable environment overrides | server access |

Do not use Site Manager abilities for features they do not expose. Use WP-CLI or
admin/import-export for full configuration changes.

## Option model

All settings live in one option:

```php
LightweightPlugins\Firewall\Options::OPTION_NAME // lw_firewall
```

Always use:

```php
$options = \LightweightPlugins\Firewall\Options::get_all();
$options['rate_limit'] = 50;
\LightweightPlugins\Firewall\Options::save( $options );
```

`get_all()` merges defaults and normalizes list options. Avoid updating
`lw_firewall` with partial raw arrays; missing keys can reset behavior if not
merged with defaults/current values first.

List-typed settings:

- `filter_params`
- `blocked_bots`
- `ip_whitelist`
- `ip_blacklist`
- `blocked_countries`

## wp-config constants

`Options::get()` checks `LW_FIREWALL_<KEY>` before saved options. Constants win
over admin UI, CLI, and abilities for single-value reads.

Common examples:

```php
define( 'LW_FIREWALL_ENABLED', true );
define( 'LW_FIREWALL_STORAGE', 'apcu' );
define( 'LW_FIREWALL_RATE_LIMIT', 30 );
define( 'LW_FIREWALL_RATE_WINDOW', 60 );
define( 'LW_FIREWALL_ACTION', '429' );
define( 'LW_FIREWALL_PROTECT_REST_API', false );
define( 'LW_FIREWALL_LOG_ENABLED', false );
define( 'LW_FIREWALL_DISABLE_WORKER', true );
```

When a setting "does not change", check constants first.

## WP-CLI

Status:

```bash
wp lw-firewall status
```

Config:

```bash
wp lw-firewall config list --format=json
wp lw-firewall config get filter_params --format=json
wp lw-firewall config set rate_limit 50
wp lw-firewall config set storage redis
wp lw-firewall config reset --yes
```

List edits without replacing the whole list:

```bash
wp lw-firewall config-items add filter_params "add-to-cart|10"
wp lw-firewall config-items remove filter_params "add-to-cart|10"
wp lw-firewall config-items add blocked_countries KP
```

IP lists:

```bash
wp lw-firewall ip list whitelist --format=json
wp lw-firewall ip add blacklist 203.0.113.42
wp lw-firewall ip remove blacklist 203.0.113.42
```

Worker:

```bash
wp lw-firewall worker install
wp lw-firewall worker remove
```

Prefer `config-items` for list settings in automation; replacing full lists is
more error-prone.

## Site Manager abilities

LW Firewall registers the `firewall` category and these abilities when LW Site
Manager is active:

| Ability | Type | Notes |
|---|---|---|
| `lw-firewall/get-options` | read | returns merged options |
| `lw-firewall/get-log` | read | `limit` 1-100; useful only when `log_enabled` |
| `lw-firewall/list-blocked` | read | manual blacklist only |
| `lw-firewall/block-ip` | write | add IP/CIDR to manual blacklist |
| `lw-firewall/unblock-ip` | write | remove IP/CIDR from manual blacklist |

All use `$permissions->callback( 'can_manage_options' )`. The write abilities
are idempotent for repeated block/unblock operations, but they only affect
manual `ip_blacklist`. Auto-bans are stored separately and are not listed or
removed through these abilities.

## Import/export

Admin import/export downloads or uploads JSON for known option keys only. Import
fills missing keys from defaults and ignores unknown keys by iterating defaults.

After import or normal settings save, geo `.htaccess` rules are synced.

Do not import untrusted JSON into production without review; this can enable
REST blocking, broad geo blocking, or global worker disablement through options.

## Logs

Logs are stored in option `lw_firewall_log`, capped at 100 newest entries, and
only written when `log_enabled` is true.

Entries contain:

- `ip`
- `reason`
- `ua`
- `url`
- `time`

Treat logs as operational data that may contain IP addresses and User-Agent
strings. Do not expose them to non-admin users.

## Worker status

The worker is expected at:

```text
wp-content/mu-plugins/lw-firewall-worker.php
```

If missing or outdated, the plugin attempts reinstall and records the latest
install result in transient `lw_firewall_worker_install_attempt`. Admin notices
surface the failure; WP-CLI status reports worker state.

## Automation checklist

- Use WP-CLI for full config and list edits.
- Use Site Manager abilities only for options read, log read, and manual blacklist operations.
- Check `LW_FIREWALL_*` constants before debugging saved options.
- Use exact IP/CIDR validation before blacklisting.
- Confirm `log_enabled` before relying on logs.
- Confirm worker installed/current before expecting early blocking.
- Do not confuse manual blacklist with auto-ban storage.

## Cross-references

- Run `lw-site-manager-extend-abilities` when adding new Site Manager abilities.
- Run `lw-firewall-rate-limit-worker` when changing endpoint protection behavior.
- Run `wp-cli-extending` when adding companion WP-CLI commands.

## What this skill does NOT cover

- Building a new firewall rule engine.
- Managing CDN/WAF provider rules.
- Editing the MU-plugin worker directly.

## References

- Official documentation: <https://github.com/lwplugins/lw-firewall>
- Verified source paths:
  - `wp-content/plugins/lw-firewall/lw-firewall.php`
  - `wp-content/plugins/lw-firewall/includes/Options.php`
  - `wp-content/plugins/lw-firewall/includes/Admin/SettingsSaver.php`
  - `wp-content/plugins/lw-firewall/includes/Admin/ImportExportHandler.php`
  - `wp-content/plugins/lw-firewall/includes/CLI/FirewallCommand.php`
  - `wp-content/plugins/lw-firewall/includes/CLI/ConfigCommand.php`
  - `wp-content/plugins/lw-firewall/includes/CLI/ConfigItemsCommand.php`
  - `wp-content/plugins/lw-firewall/includes/CLI/IpCommand.php`
  - `wp-content/plugins/lw-firewall/includes/SiteManager/Integration.php`
  - `wp-content/plugins/lw-firewall/includes/SiteManager/FirewallAbilities.php`
  - `wp-content/plugins/lw-firewall/includes/SiteManager/FirewallService.php`
  - `wp-content/plugins/lw-firewall/docs/management.md`
  - `wp-content/plugins/lw-firewall/docs/site-manager-abilities.md`
