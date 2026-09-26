---
name: lw-site-manager-overview
description: >-
  Operate and integrate with LW Site Manager 1.5.x through its WordPress
  Abilities REST surface or built-in MCP server. Covers the site-manager/*
  catalog, Application Password authentication, MCP enablement and domain lock,
  skill discovery, capability and object-level authorization, error contracts,
  and WooCommerce prerequisites. Use when calling, configuring, diagnosing, or
  reviewing lw-site-manager, /wp-json/wp-abilities/v1, or
  /wp-json/mcp/lw-site-manager. Use lw-site-manager-extend-abilities when adding
  abilities from another plugin.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-site-manager"
  wp-skills-plugin-version-tested: "1.5.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# LW Site Manager 1.5: consumer and operations reference

Use the plugin's registered abilities instead of calling its internal service classes. Version 1.5.0 exposes the same abilities through the WordPress Abilities REST API and a built-in MCP server, but the two transports have different discovery and authorization layers.

## Binding requirements and current surface

Read the plugin header before relying on README badges:

| Contract | Version 1.5.0 |
|---|---|
| WordPress | 6.9 or newer |
| PHP | 8.2 or newer |
| Ability namespace | `site-manager/*` |
| Operational abilities | 167 |
| Built-in skill abilities | `skill-get` plus one prompt ability for each prompt-enabled skill |
| REST ability endpoint | `/wp-json/wp-abilities/v1/abilities/{namespace}/{slug}/run` |
| MCP endpoint | `/wp-json/mcp/lw-site-manager` |

The bundled default skill set contains three agentic skills, all with prompt exposure disabled. It adds `site-manager/skill-get`, so a default installation has 168 `site-manager/*` registrations. A companion source that opts a skill into prompt exposure adds `site-manager/skill-prompt-{slug}` dynamically. Treat the total as installation-dependent because other plugins can add skills and abilities.

The 167 operational abilities cover updates, plugins, themes, posts, pages, taxonomies, comments, media, users, settings, meta, backups, database maintenance, cache, health, plugin database updates, and WooCommerce. Do not copy a hard-coded list into a client. Discover the current registry and inspect the target ability's schemas.

## Choose the transport

### Abilities REST API

Use REST when the client can call one known ability directly:

```http
POST /wp-json/wp-abilities/v1/abilities/site-manager/check-updates/run
Authorization: Basic BASE64(username:application-password)
Content-Type: application/json

{"input":{"type":"all","force_refresh":false}}
```

Keep the `input` envelope. The path comes from WordPress core's Abilities API; LW Site Manager does not create a parallel route for each operation.

In PHP, feature-detect and execute through the registry:

```php
$ability = wp_get_ability( 'site-manager/check-updates' );

if ( null === $ability ) {
	return new WP_Error( 'ability_unavailable', 'The ability is not registered.' );
}

$result = $ability->execute( [ 'type' => 'all' ] );
```

### Built-in MCP server

Version 1.5.0 ships the WordPress MCP Adapter in release packages and brands its default server as LW Site Manager. Connect a Streamable HTTP MCP client to:

```text
https://example.com/wp-json/mcp/lw-site-manager
```

The server exposes adapter meta-tools rather than one MCP tool per ability:

- `mcp-adapter/discover-abilities`
- `mcp-adapter/get-ability-info`
- `mcp-adapter/execute-ability`

Run `discover-abilities`, inspect the selected schema, then call `execute-ability` with the ability name and parameters.

The server is enabled by default. Manage it under **LW Plugins -> AI / MCP**. Enabling records the current host. A later domain change disables the endpoint until an administrator enables it again. This protects cloned databases and staging copies from exposing the original MCP configuration.

The state lives in:

- `lw_site_manager_mcp_enabled`
- `lw_site_manager_mcp_domain`

Use the admin UI or its administrator-only routes to change the state:

- `GET|POST /wp-json/lw-site-manager/v1/admin/mcp`
- `GET /wp-json/lw-site-manager/v1/admin/skills`

Do not update those options directly in integration code.

## Authentication and authorization

Use a dedicated WordPress user and an Application Password. REST ability calls enforce each ability's `permission_callback`. The MCP transport adds a broader gate:

1. WordPress authenticates the Application Password.
2. MCP transport requires `manage_options` by default.
3. The selected ability runs its own permission callback.
4. Mutating services apply object-level meta-capability checks when the target ID is known.

The transport capability is filterable through `lw_site_manager_mcp_capability`, but relaxing it widens access to every MCP-public ability on that server. Review every exposed namespace before changing the default.

Do not treat a successful registration-time primitive capability as authorization for a specific object. Since 1.4.0, update/delete/meta operations also check capabilities such as `edit_post`, `delete_post`, `edit_user`, or WooCommerce order permissions against the target object.

## MCP exposure rules

While MCP is enabled, `AbilityExposer` adds `meta.mcp.public = true` and `meta.mcp.type = tool` to `site-manager/*` abilities through `wp_register_ability_args`.

Abilities in another namespace are not automatically exposed by LW Site Manager. A companion plugin that registers `my-plugin/*` or `lw-cookie/*` abilities must opt in explicitly:

```php
'meta' => [
	'show_in_rest' => true,
	'annotations'  => [
		'readonly'    => true,
		'destructive' => false,
		'idempotent'  => true,
	],
	'mcp' => [
		'public' => true,
		'type'   => 'tool',
	],
],
```

WordPress MCP Adapter 0.6 may also expose foreign abilities that set older public metadata. Keep the explicit `mcp` block so intent is unambiguous.

## Failure and result handling

Treat transport success and operation success separately:

- A whole-operation failure should arrive as `WP_Error`; REST then returns an error status and MCP reports `isError: true`.
- A batch operation may return a successful envelope with per-item failures. Inspect `failed`, `failed_ids`, and the message.
- Plugin activation can succeed while returning captured PHP warnings. Do not retry activation merely because `php_errors` is non-empty.
- MCP Adapter conflicts matter. Another plugin can load an older adapter first. Version 1.5.0 detects the loaded implementation by reflection and shows an outdated-adapter warning. Resolve that warning before trusting MCP result unwrapping.

## High-impact behavior added after 1.1.22

Account for these contracts in clients and reviews:

- `list-posts` defaults to editable statuses instead of exposing every draft/private post.
- `list-comments` defaults to ordinary comments; request `type=review` for WooCommerce reviews or `type=all` deliberately.
- User, post, term, comment, order, product, and variation meta writes pass key guards. Protected keys require stronger capability, and role/session keys are refused.
- Inline `meta` maps use the same guards as dedicated meta abilities.
- `delete-media` trashes by default; permanent deletion requires `force: true`.
- WooCommerce order operations use order capabilities and lock cancelled, refunded, and failed orders from mutation.
- Hard failures in plugin/theme installation and activation return errors rather than `200 {success:false}`.

## Skills subsystem

The built-in MCP discovery response includes a skill catalog. `site-manager/skill-get` returns a skill's rendered `SKILL.md`; prompt-enabled skills also register `site-manager/skill-prompt-{slug}` with `meta.mcp.type = prompt`.

Other plugins can add skill sources through `lw_site_manager_skill_sources`. A source must return parsed, bounded skill content; follow the plugin's `docs/extending-skills.md` contract. Do not confuse these runtime skills with the portable skills in this repository.

## WooCommerce boundary

WooCommerce categories and abilities register only when WooCommerce is active. Feature-detect every `site-manager/wc-*` ability. Use WooCommerce CRUD objects through the ability implementation; do not replace HPOS-safe paths with post or postmeta access.

For order mutations:

- confirm the order ID and financial amount before refunds or paid-state changes;
- use `recalculate=false` while applying a planned group of line/coupon/fee/shipping changes, then call `wc-recalculate-order` once;
- treat `wc-send-order-email` and `wc-mark-order-paid` as externally visible actions.

## Operational checks

When diagnosing an installation:

1. Verify the plugin header version and the active runtime version.
2. Confirm the ability exists in the live registry.
3. For REST, inspect the ability schema and call its run endpoint with an Application Password.
4. For MCP, confirm the toggle, recorded domain, adapter version, and `manage_options` transport user.
5. On WooCommerce sites, verify the WooCommerce-dependent ability registered.
6. Treat a missing foreign ability in MCP discovery as a metadata problem first; check `meta.mcp.public`.

## Cross-references

- Use `lw-site-manager-extend-abilities` when another plugin adds categories or abilities.
- Use `wp-abilities-api` for the underlying WordPress registration, schema, and execution lifecycle.
- Use a WooCommerce-specific skill before automating order, product, stock, refund, or HPOS-sensitive work.

## References

- Plugin repository: <https://github.com/lwplugins/lw-site-manager>
- Built-in MCP server: <https://github.com/lwplugins/lw-site-manager/blob/main/docs/mcp-server.md>
- Extending abilities: <https://github.com/lwplugins/lw-site-manager/blob/main/docs/extending-abilities.md>
- Skills subsystem: <https://github.com/lwplugins/lw-site-manager/blob/main/docs/skills.md>
- WordPress Abilities API: <https://developer.wordpress.org/apis/abilities-api/>
- Verified source paths:
  - `lw-site-manager.php`
  - `src/Abilities/Registrar.php`
  - `src/Abilities/PermissionManager.php`
  - `src/Mcp/Bootstrap.php`
  - `src/Mcp/AbilityExposer.php`
  - `src/Mcp/RouteGuard.php`
  - `src/Mcp/Toggle.php`
  - `src/Skills/Bootstrap.php`
  - `src/Skills/SkillGetAbility.php`
