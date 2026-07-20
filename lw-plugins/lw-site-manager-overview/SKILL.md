---
name: lw-site-manager-overview
description: Reference for the LW Site Manager plugin (lwplugins/
  lw-site-manager) — a WP 6.9+ Abilities-API-native exposure layer that
  registers 120+ machine-callable abilities under the site-manager/*
  namespace for AI agents (Claude, ChatGPT, MCP clients) to discover
  and invoke. Covers updates / plugins / themes / posts / pages /
  comments / media / users / taxonomies / settings / backups / health
  / database / cache / WooCommerce. Calling pattern — REST run endpoint
  is /wp-json/wp-abilities/v1/abilities/{namespace}/{ability}/run with
  Application Password Basic auth. Important — this is NOT MainWP; the
  surface and security model are different (per-ability cap-checks via
  PermissionManager, not a single dashboard token). Header requires
  PHP 8.2 (not 8.1 as some docs say). Use when calling the plugin's
  abilities, advising on AI agent integration, or before extending the
  plugin (see lw-site-manager-extend-abilities). Triggers on
  site-manager/, lw-site-manager, wp-abilities/v1, AI agent + WP.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-site-manager"
  wp-skills-plugin-version-tested: "1.1.22"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-04-29"
---

# LW Site Manager: overview and consumer reference

For developers and AI agents calling the [LW Site Manager](https://github.com/lwplugins/lw-site-manager) plugin's abilities — a curated, security-checked exposure of 120+ WordPress operations through the WP 6.9+ Abilities API. The plugin's positioning is "AI-ready alternative to MainWP" — but the surface and the security model differ, and that distinction matters for both consumers and reviewers.

## Misconception this skill corrects

> "It's just MainWP with a different name — point a token at it and run remote management."

It isn't. MainWP-class tools use a single privileged dashboard token to do almost-anything against the target install; LW Site Manager exposes **per-operation abilities**, each gated by a **specific WP capability check** through a centralized `PermissionManager`. Verified at [src/Abilities/PermissionManager.php](PermissionManager.php) — `can_manage_updates` requires both `update_plugins` AND `update_themes`; `can_install_plugins` requires `install_plugins`; `can_view_health` requires `view_site_health_checks`; `can_manage_backups` / `can_manage_database` / `can_manage_cache` / `can_manage_options` all require `manage_options`. There is no "admin override" or single-token bypass.

The practical difference for an integrator:

- A user with WP role `editor` (no `install_plugins`) can call `site-manager/list-plugins` (read) but NOT `site-manager/install-plugin` — gracefully gets 403 from the WP layer, not from a custom ACL.
- A user without `view_site_health_checks` can't call `site-manager/health-check` even if their Application Password is valid.
- A compromised Application Password is bounded by THAT user's WP capabilities, not by a global token.

Other AI-prone misconceptions:

- "PHP 8.1+ per the README." Wrong — the actual plugin header (`Requires PHP: 8.2`) is binding. Verified at [lw-site-manager.php:8](lw-site-manager.php). The README and CHANGELOG are stale on this; WP enforces the header.
- "All abilities are listed in the README's table." Wrong — the README lists ~60 abilities; source has **126 unique IDs** (verified by grepping `'site-manager/...'` literals in `src/Abilities/`). The full set includes things the README skips: `bulk-posts`, `bulk-comments`, `restore-post`, `duplicate-post`, `duplicate-page`, `reorder-pages`, `set-post-meta`, `delete-user-meta`, `wc-revenue-stats`, `wc-low-stock-products`, `wc-bulk-orders`, etc.
- "The MCP adapter ships with the plugin." No. The plugin exposes abilities; the MCP adapter is a separate concern (Anthropic's MCP server bridge for the WP Abilities API). The plugin works without it via the REST run endpoint.

## When to use this skill

Trigger when ANY of the following is true:

- Calling `site-manager/*` abilities from PHP, REST, or MCP.
- The user asks "how do I drive a WP site with Claude / ChatGPT".
- A diff references `'site-manager/...'`, `wp-abilities/v1`, `LW_SITE_MANAGER_*` constants.
- Reviewing AI agent integration code that targets WP maintenance flows.
- Choosing between "raw REST endpoints" and "Abilities API" for AI agent tooling — this skill is the proof-of-concept.

## Plugin identity (verified)

| Field | Value | Source |
|---|---|---|
| Slug | `lw-site-manager` | [lw-site-manager.php:1-12](lw-site-manager.php) |
| Namespace | `LightweightPlugins\SiteManager` | [lw-site-manager.php:18](lw-site-manager.php) |
| Constants prefix | `LW_SITE_MANAGER_` | [lw-site-manager.php:26-29](lw-site-manager.php) |
| Text domain | `lw-site-manager` | header |
| Tested with | WP 6.9.x, plugin v1.1.22 (April 2026) | header + CHANGELOG |
| Min WP | 6.9 | header `Requires at least: 6.9` |
| Min PHP | **8.2** (NOT 8.1 — README is stale) | header `Requires PHP: 8.2` |
| Ability namespace | `site-manager/` | every `wp_register_ability(...)` call |
| Action hooks | `lw_site_manager_register_abilities`, `lw_site_manager_register_categories` | [Registrar.php:48](Registrar.php), [lw-site-manager.php:232](lw-site-manager.php) |
| Filters emitted | none | grep |
| GitHub | <https://github.com/lwplugins/lw-site-manager> | header |

## Calling pattern — REST

Every Abilities-API ability has a "run" REST endpoint at:

```
POST /wp-json/wp-abilities/v1/abilities/{namespace}/{ability-slug}/run
Authorization: Basic <base64(username:application-password)>
Content-Type: application/json

{ "input": { /* ability-specific input matching the ability's input_schema */ } }
```

Concrete example:

```bash
# Check for all available updates
curl -X POST "https://site.example/wp-json/wp-abilities/v1/abilities/site-manager/check-updates/run" \
  -u 'admin:xxxx xxxx xxxx xxxx' \
  -H 'Content-Type: application/json' \
  -d '{"input":{"type":"all","force_refresh":false}}'
```

The response shape comes from the ability's `output_schema`; for read abilities it's typically a list/entity envelope (see `listOutputSchema` / `entityOutputSchema` helpers documented in **`lw-site-manager-extend-abilities`**).

`HEAD` and `GET` on the same path return the ability's metadata (label, description, input/output schemas, annotations) — useful for AI agent discovery.

## Calling pattern — PHP

```php
// Direct PHP invocation — bypasses REST, runs in-process.
$ability = wp_get_ability( 'site-manager/check-updates' );
$result  = $ability->execute( [ 'type' => 'all' ] );
```

`execute()` validates input, runs the permission callback, calls the registered `execute_callback`, and validates output. Throws `WP_Error` on permission failure or schema mismatch.

## Calling pattern — MCP

The Anthropic MCP server bridge for the WP Abilities API exposes every registered ability as an MCP tool automatically. Configure once at the MCP server level; AI agents see all abilities (including LW Site Manager's `site-manager/*` set) through their normal tool-discovery flow. Out of scope for THIS plugin — the plugin doesn't ship MCP code, it benefits from the Abilities API's native MCP integration.

## Ability catalog (all 126, grouped)

**Updates and packaging (10):**
`check-updates`, `update-core`, `update-plugin`, `update-theme`, `update-all`, `install-plugin`, `install-theme`, `activate-plugin`, `deactivate-plugin`, `delete-plugin`, `activate-theme`, `delete-theme`.

**Posts (10):** `list-posts`, `get-post`, `create-post`, `update-post`, `delete-post`, `restore-post`, `duplicate-post`, `bulk-posts`, `set-post-terms`, `get-post-terms`.

**Pages (9):** `list-pages`, `get-page`, `create-page`, `update-page`, `delete-page`, `restore-page`, `duplicate-page`, `reorder-pages`, `page-hierarchy`, `page-templates`, `set-page-template`.

**Taxonomies (10):** `list-categories`, `get-category`, `create-category`, `update-category`, `delete-category`, `list-tags`, `get-tag`, `create-tag`, `update-tag`, `delete-tag`. (All also work on custom taxonomies via the `taxonomy` parameter.)

**Comments (8):** `list-comments`, `get-comment`, `create-comment`, `update-comment`, `delete-comment`, `approve-comment`, `spam-comment`, `bulk-comments`, `comment-counts`.

**Users (6):** `list-users`, `get-user`, `create-user`, `update-user`, `delete-user`, `reset-password`, `get-roles`.

**Media (5):** `list-media`, `get-media`, `upload-media`, `update-media`, `delete-media`.

**Meta (post / user / term, 6):** `get-post-meta`, `set-post-meta`, `delete-post-meta`, `get-user-meta`, `delete-user-meta`, `get-term-meta`, `delete-term-meta`.

**Settings (8):** `get-general-settings`, `update-general-settings`, `get-reading-settings`, `update-reading-settings`, `get-discussion-settings`, `update-discussion-settings`, `get-permalink-settings`, `update-permalink-settings`, `front-page-settings`, `set-homepage`, `set-posts-page`, `get-post-types`.

**Backup (4 + 1):** `create-backup`, `list-backups`, `restore-backup`, `delete-backup`, `backup-status`, `cancel-backup`.

**Health and diagnostics (2):** `health-check`, `error-log`.

**Database (3):** `optimize-database`, `cleanup-database`, `repair-database`.

**Cache (1):** `flush-cache`.

**Plugin database updates (4):** `check-plugin-db-updates`, `update-plugin-db`, `update-all-plugin-dbs`, `get-supported-db-plugins`.

**Options (3):** `get-option`, `update-option`, `list-options`.

**WooCommerce — products (8):** `wc-list-products`, `wc-get-product`, `wc-create-product`, `wc-update-product`, `wc-delete-product`, `wc-duplicate-product`, `wc-bulk-products`, `wc-list-variations`, `wc-update-stock`, `wc-list-product-categories`.

**WooCommerce — orders (7):** `wc-list-orders`, `wc-get-order`, `wc-update-order-status`, `wc-bulk-orders`, `wc-list-order-statuses`, `wc-list-order-notes`, `wc-add-order-note`, `wc-create-refund`.

**WooCommerce — reports (5):** `wc-orders-totals`, `wc-products-totals`, `wc-sales-report`, `wc-revenue-stats`, `wc-top-sellers`, `wc-low-stock-products`.

**Total: 126 unique abilities** (verified by grepping all `'site-manager/...'` IDs in `src/Abilities/`).

## Authentication

The plugin doesn't ship its own auth; it inherits the Abilities API's REST authentication. The recommended path:

1. **Application Passwords (WP 5.6+ native).** User profile → "Application Passwords" → generate. Use Basic auth: `Authorization: Basic base64(username:app-password)`. Bound to a specific WP user; revocable per app.
2. **Cookie + nonce** for browser-side calls from logged-in admins (same-origin).
3. **JWT / custom bearer** via a separate auth plugin or via `better-route` middleware if the consumer wants tokens with shorter lifetimes / scoping.

Best practice: dedicated WP user per AI agent / consumer, with the minimum role required for the abilities they'll call. An "AI editor" role with `edit_posts` + `upload_files` + `moderate_comments` is enough for content workflows; an "AI maintainer" role with `manage_options` + `update_plugins` + `install_plugins` for site management.

## Relationship to other tooling

| Tool | Relationship |
|---|---|
| WP Abilities API (core, WP 6.9+) | The substrate. Plugin registers via `wp_register_ability`. See **`wp-abilities-api`**. |
| MainWP / ManageWP | Different surface (single-token dashboard vs per-cap abilities). Not interchangeable; both can coexist on a site. |
| `better-route` (separate library) | Could publish lw-site-manager abilities as REST routes with custom permissions / rate limits / OpenAPI. Not done by default. |
| `better-data` DTOs | Could shape the input/output of custom abilities you ADD via the extension hooks. Native ability schemas are JSON Schema arrays. |
| Anthropic MCP server | Discovers all registered abilities; presents them as tools to Claude. No plugin-side configuration. |

## Critical rules

- **Calls use the WP Abilities API REST surface, NOT a plugin-specific REST namespace.** The path is `/wp-json/wp-abilities/v1/abilities/site-manager/{slug}/run`, not `/wp-json/lw-site-manager/v1/...`.
- **Per-ability capability checks via `PermissionManager`.** A 403 is the user's WP role missing the cap, not a plugin-level deny list.
- **Application Password auth is the canonical consumer path.** Use a dedicated WP user per agent.
- **Plugin requires PHP 8.2** per the binding plugin header — README is stale on this.
- **126 unique abilities** in v1.1.22 — the README undercounts.
- **No filter mutation hooks.** The plugin is additively extensible only (two action hooks); intercepting built-in abilities goes through the WP Abilities API's general `ability_*` filters, not plugin-specific ones.
- **WooCommerce abilities only register when WC is active.** Verified at [lw-site-manager.php:225](lw-site-manager.php) — `class_exists('WooCommerce')` guard. Don't depend on `wc-*` ability IDs without that prerequisite.
- **The plugin is in the LW Plugins family.** Shares an admin menu integration (`lw_plugins_overview_cards` action) — don't assume single-plugin standalone behavior in admin UI tests.

## Common mistakes

```bash
# WRONG — assuming a plugin-specific REST namespace
curl https://site.example/wp-json/lw-site-manager/v1/check-updates
# → 404. Plugin doesn't register a custom REST namespace.

# RIGHT — Abilities API canonical path
curl -X POST https://site.example/wp-json/wp-abilities/v1/abilities/site-manager/check-updates/run \
  -d '{"input":{"type":"all"}}'
```

```bash
# WRONG — admin user assumed to bypass per-ability cap checks
curl -u 'admin:app-pwd' .../site-manager/install-plugin/run
# Works because admin has install_plugins. But if you assigned the AI agent
# to an editor account, install-plugin returns 403 even with valid auth.

# RIGHT — match the AI agent's WP role to the abilities they need
# editor → list-posts / create-post / list-media / upload-media work; install-plugin doesn't
```

```bash
# WRONG — passing input at the request root
curl -X POST .../site-manager/create-post/run \
  -d '{"title":"Hello","content":"..."}'
# → 400 — Abilities API expects {"input": {...}} envelope.

# RIGHT — wrap in input
curl -X POST .../site-manager/create-post/run \
  -d '{"input":{"title":"Hello","content":"..."}}'
```

```php
// WRONG — assuming wc-* abilities exist regardless of WC
$ability = wp_get_ability( 'site-manager/wc-list-products' );
$ability->execute(); // → null on sites without WooCommerce.

// RIGHT — feature-detect before calling
if ( null !== wp_get_ability( 'site-manager/wc-list-products' ) ) {
    $ability = wp_get_ability( 'site-manager/wc-list-products' );
    $result = $ability->execute(/* ... */);
}
```

```php
// WRONG — assuming README's ability list is exhaustive
$abilities = [ 'check-updates', 'update-plugin', /* ... 60 more from README */ ];

// RIGHT — discover via the Abilities API registry, OR list per category
$registry = wp_get_ability_categories_registry(); // pseudo — check actual registry call name
// OR enumerate via the REST discovery endpoint:
// GET /wp-json/wp-abilities/v1/abilities → full list of registered abilities
```

## Cross-references

- Run **`wp-abilities-api`** for the underlying WP Abilities API mechanics (categories, register_ability, execute_callback, JSON Schema input/output, REST run endpoint, MCP integration). LW Site Manager is a consumer; that skill is the substrate.
- Run **`lw-site-manager-extend-abilities`** when adding custom abilities to the plugin's namespace via the extensibility hooks. Reuses the centralized `PermissionManager` and the `AbstractAbilitiesRegistrar` helper builders.
- Run **`wp-plugin-options-storage`** when an ability you're adding needs to read / write WP options — settings abilities here are good examples of the pattern.

## What this skill does NOT cover

- **Per-ability docs** — those live in [docs/abilities/](docs/abilities/) inside the plugin (14 markdown files: `posts.md`, `pages.md`, `comments.md`, `media.md`, `meta.md`, `tags.md`, `settings.md`, `theme-management.md`, `plugin-management.md`, `categories.md`, `user-management.md`, `maintenance.md`, `woocommerce.md`). For input/output schemas of a specific ability, read those.
- **Implementation internals** (UpdateManager, BackupManager, CacheManager service classes). Third-party code should hit abilities, not poke services directly.
- **MCP server setup**. Anthropic's WP-Abilities MCP bridge is a separate project; configuration is at the MCP server level, not in this plugin.
- **MainWP migration**. Different model entirely; not a drop-in replacement.
- **Custom REST namespace** — the plugin doesn't register one. All calls go through `/wp-json/wp-abilities/v1/`.

## References

- Plugin header: [wp-content/plugins/lw-site-manager/lw-site-manager.php:1-15](lw-site-manager.php) — version 1.1.22, requires WP 6.9, requires PHP 8.2, namespace `LightweightPlugins\SiteManager`, text domain `lw-site-manager`.
- Constants: [lw-site-manager.php:26-29](lw-site-manager.php) — `LW_SITE_MANAGER_VERSION`, `LW_SITE_MANAGER_FILE`, `LW_SITE_MANAGER_DIR`, `LW_SITE_MANAGER_URL`.
- Ability registrar orchestrator: [src/Abilities/Registrar.php](Registrar.php) — instantiates 4 specialized registrars (Update / Maintenance / User / Content) and fires `lw_site_manager_register_abilities` action at line 48.
- Permission map: [src/Abilities/PermissionManager.php](PermissionManager.php) — central typed cap-check methods.
- Categories registration: [lw-site-manager.php:120-285](lw-site-manager.php) — built-in category registrations via `wp_register_ability_category`, then `lw_site_manager_register_categories` action at line 232.
- WooCommerce gate: [lw-site-manager.php:225](lw-site-manager.php) — `class_exists('WooCommerce')` check before registering WC categories.
- All registered ability IDs: 126 unique values matching `'site-manager/*'` regex across `src/Abilities/`.
- README (partially stale): [README.md](README.md).
- Per-ability docs: [docs/abilities/](docs/abilities/) — 14 markdown files for individual ability reference.
- Plugin GitHub: <https://github.com/lwplugins/lw-site-manager>.
- LW Plugins home: <https://lwplugins.com>.
- Official documentation: <https://developer.wordpress.org/apis/abilities-api/>
- Verified source paths:
  - `wp-content/plugins/lw-site-manager/src/Abilities/Registrars/AbstractAbilitiesRegistrar.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Registrars/UpdateAbilitiesRegistrar.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Registrars/MaintenanceAbilitiesRegistrar.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Registrars/UserAbilitiesRegistrar.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Registrars/ContentAbilitiesRegistrar.php`
