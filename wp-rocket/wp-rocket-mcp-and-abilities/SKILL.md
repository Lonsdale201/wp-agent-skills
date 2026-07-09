---
name: wp-rocket-mcp-and-abilities
description: Expose, scope, or secure WP Rocket settings for AI / MCP
  clients — new in 3.23. Two layers — WP Abilities API abilities
  (wp-rocket/get-options readonly, wp-rocket/set-option destructive,
  category wp-rocket-options, cap rocket_manage_options) and a built-in
  MCP OAuth 2.1 server at /wp-json/mcp/mcp-oauth-server (/oauth/*,
  /.well-known) with trusted publisher Claude (claude.ai). Critical —
  abilities default ON (rocket_enable_abilities), the OAuth server
  defaults OFF (rocket_mcp_oauth_server_enabled), and both need the WP
  Abilities API + wordpress/mcp-adapter or nothing registers. Scope what
  AI may read / write via rocket_mcp_options_allowlist (an additive
  allowlist); add clients via rocket_mcp_trusted_publishers. Filters are
  typed (wpm_apply_filters_typed) — return exact bool / array. Use when
  exposing WP Rocket settings to an MCP client, scoping the allowlist, or
  reviewing AI-facing code. Triggers on rocket_mcp_,
  rocket_enable_abilities, wp-rocket/get-options, wp-rocket/set-option,
  "/oauth/" MCP server.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wp-rocket
plugin-version-tested: "3.23"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://docs.wp-rocket.me/article/92-plugin-compatibility-with-wp-rocket
  - https://docs.wp-rocket.me/article/2-getting-started
source-refs:
  - wp-content/plugins/wp-rocket/inc/Engine/Abilities/Context.php
  - wp-content/plugins/wp-rocket/inc/Engine/Abilities/Options/AllowedOptions.php
  - wp-content/plugins/wp-rocket/inc/Engine/Abilities/Options/GetOptions.php
  - wp-content/plugins/wp-rocket/inc/Engine/Abilities/Options/SetOption.php
  - wp-content/plugins/wp-rocket/inc/Engine/MCP/Context.php
  - wp-content/plugins/wp-rocket/inc/Engine/MCP/Transport/Server.php
  - wp-content/plugins/wp-rocket/inc/Engine/MCP/Auth/ClaudeClientVerifier.php
  - wp-content/plugins/wp-rocket/inc/Engine/MCP/Auth/Rewrite.php
  - wp-content/plugins/wp-rocket/inc/Engine/MCP/Auth/Discovery/Endpoints.php
---

# WP Rocket: MCP server and AI Abilities

New in **WP Rocket 3.23**. WP Rocket ships an AI-integration surface that lets a Model Context Protocol (MCP) client — the bundled/trusted publisher is **Claude** — read and write WP Rocket settings on a live site in natural language. For a companion plugin / theme developer this skill covers **how to scope, extend, or lock down that surface**, not how to build an MCP client.

> The MCP OAuth server is described in its own source as a **proof of concept** ([inc/Engine/MCP/Auth/ClaudeClientVerifier.php:8](ClaudeClientVerifier.php)). Treat it as experimental: the abilities are stable-ish public hooks, the OAuth transport is newer and off by default.

## The two layers (the mental model that prevents 90% of mistakes)

WP Rocket's AI surface is **two independent layers** with **opposite defaults**:

| Layer | What it is | Default | Enable/kill filter |
|---|---|---|---|
| **Abilities** | WP Abilities API entries (`wp-rocket/get-options`, `wp-rocket/set-option`) in category `wp-rocket-options` | **ON** (`true`) | `rocket_enable_abilities` |
| **MCP OAuth server** | OAuth 2.1 + JWT transport at `/wp-json/mcp/mcp-oauth-server`, `/oauth/*`, `/.well-known/*` that lets a **remote** client authenticate and reach the abilities | **OFF** (`false`) | `rocket_mcp_oauth_server_enabled` |

Key consequences:

- Abilities register **on their own**, gated only by `rocket_enable_abilities` (default `true`) — verified [inc/Engine/Abilities/Context.php:19](Context.php). They are reachable by **any local abilities/MCP consumer** and via REST (`show_in_rest => true`), still behind the `rocket_manage_options` capability. Turning the OAuth server on is NOT required for the abilities to exist.
- The **OAuth server is what a remote client (Claude) needs** to log in. It is off until a site owner opts in with `rocket_mcp_oauth_server_enabled` — verified [inc/Engine/MCP/Context.php:23](Context.php).
- To **fully remove AI read/write of WP Rocket settings**, set `rocket_enable_abilities` to `false`. Turning off only the OAuth server still leaves the abilities registered for local consumers.

## Feature-detection — three things must ALL be present

Nothing here loads on a stock WordPress. Before relying on it:

1. **WP Rocket 3.23+** — `defined('WP_ROCKET_VERSION')` and `version_compare(WP_ROCKET_VERSION, '3.23', '>=')`.
2. **The WP Abilities API** — `function_exists('wp_register_ability')`. WP Rocket's `register()` methods early-return without it ([GetOptions.php:44](GetOptions.php), [SetOption.php:154](SetOption.php)).
3. **The MCP Adapter** — `class_exists(\WP\MCP\Core\McpAdapter::class)` (bundled as `wordpress/mcp-adapter` ^0.4.1). The transport `Server::register_server()` early-returns without it ([Server.php:19](Server.php)). Only needed for the OAuth/MCP server layer, not for the abilities themselves.

```php
if (
    ! defined( 'WP_ROCKET_VERSION' )
    || version_compare( WP_ROCKET_VERSION, '3.23', '<' )
    || ! function_exists( 'wp_register_ability' )
) {
    return; // No WP Rocket AI surface to customize.
}
```

## Misconception this skill corrects

> "Enabling the MCP OAuth server is what exposes my settings to AI, so leaving it off is safe."

Half-true. The **OAuth server** (off by default) only gates *remote* authentication. The **abilities** (`wp-rocket/get-options`, `wp-rocket/set-option`) register regardless, defaulting ON, and are callable by any local abilities consumer and over REST — always subject to the `rocket_manage_options` capability. If you need to guarantee no AI path can touch settings, use `add_filter( 'rocket_enable_abilities', '__return_false' )`, don't just leave the OAuth server off.

Other AI-prone misconceptions:

- "`rocket_mcp_options_allowlist` is a blocklist — I add keys to hide them." Wrong, it's an **allowlist**. Whatever it returns is exactly what AI can read (`get-options`) and write (`set-option`). Adding a key EXPOSES it; removing a key restricts it. Verified [AllowedOptions.php:14](AllowedOptions.php) and enforced in `SetOption::validate_option_name()` ([SetOption.php:318](SetOption.php)).
- "These are `apply_filters`, so I return whatever." They run through `wpm_apply_filters_typed( 'boolean' | 'array', ... )` — the wrapper calls core `apply_filters` (so `add_filter` works normally) then **coerces/validates the return type**. Return a real `bool` for boolean filters and a real `array` for array filters; a wrong type is coerced or dropped. Prefer `__return_true` / `__return_false` for the booleans.
- "`rocket_mcp_trusted_publishers` lets me bless any client_id." No — it can only ADD publishers, and each must still pass an **exact client_id URL match** plus a host-based SSRF gate; it cannot bypass the `verified` hard-reject. Verified [ClaudeClientVerifier.php:83-113](ClaudeClientVerifier.php).
- "`set-option` just writes what I send." It validates the key against the allowlist, sanitizes per option type, and for array/textarea options **`update` (default) MERGES into the existing list**; only `replace` overwrites. Verified [SetOption.php:331](SetOption.php).

## When to use this skill

Trigger when ANY of the following is true:

- Exposing WP Rocket settings to Claude / an MCP client, or scoping WHICH settings AI may touch.
- The diff adds `add_filter( 'rocket_enable_abilities' | 'rocket_mcp_oauth_server_enabled' | 'rocket_mcp_options_allowlist' | 'rocket_mcp_trusted_publishers', ... )`.
- Code references `wp-rocket/get-options`, `wp-rocket/set-option`, the `wp-rocket-options` ability category, or `/wp-json/mcp/mcp-oauth-server` / `/oauth/*` / `/.well-known/oauth-*`.
- Reviewing a companion plugin that registers its own abilities and wants to appear alongside WP Rocket's, or that adds custom option keys to the allowlist.
- Security review: is a destructive `set-option` reachable, is the allowlist minimal, is the OAuth server intentionally on?

## The abilities (verified surface)

Both live in category `wp-rocket-options` (registered on `wp_abilities_api_categories_init`), and both check `current_user_can( 'rocket_manage_options' )` (`rocket_manage_options` is a WP Rocket capability that exists `@since 3.4`, granted to `administrator` on activation).

| Ability | Kind | `meta.annotations` | Permission |
|---|---|---|---|
| `wp-rocket/get-options` | Read all allowlisted options as a flat key→value object | `readonly: true`, `destructive: false`, `idempotent: true` | `rocket_manage_options` |
| `wp-rocket/set-option` | Write ONE option (`option_name`, `option_value`, optional `update_mode`) | `readonly: false`, **`destructive: true`**, `idempotent: true` | `rocket_manage_options` |

Both carry `meta.mcp.public => true` and `show_in_rest => true`.

`set-option` input schema (verified [SetOption.php:171](SetOption.php)):

- `option_name` — enum of the allowlist keys.
- `option_value` — `anyOf` string / boolean / integer / array-of-string.
- `update_mode` — `update` (default, appends to array/textarea options) or `replace` (overwrites the whole list).

`set-option` returns `{ success, error?, previous_value, new_value }`. The ability's own description text instructs the AI to **show current→new value and require explicit per-change confirmation** before writing, and to call `get-options` first when editing an array-type option so it doesn't clobber existing entries.

## Controlling exposure — the allowlist and the kill switch

The single control point for "what can AI see and change" is `rocket_mcp_options_allowlist`. The built-in list (~70 keys) spans cache, CSS/JS optimization, media/lazyload, fonts, preload, database cleanup, CDN, Cloudflare, Heartbeat, performance monitoring, and add-ons — verified [AllowedOptions.php:14](AllowedOptions.php).

```php
// Expose a custom / third-party option key to the get-options & set-option abilities.
add_filter( 'rocket_mcp_options_allowlist', function ( array $allowlist ): array {
    $allowlist[] = 'my_plugin_cache_toggle';
    return $allowlist;
} );

// RESTRICT — remove sensitive settings you never want AI to change (e.g. CDN + Cloudflare).
add_filter( 'rocket_mcp_options_allowlist', function ( array $allowlist ): array {
    return array_values( array_diff( $allowlist, [
        'cdn', 'cdn_cnames', 'cdn_zone',
        'do_cloudflare', 'cloudflare_auto_settings',
    ] ) );
} );

// Kill switch — no AI read/write of WP Rocket settings at all.
add_filter( 'rocket_enable_abilities', '__return_false' );
```

> A key added to the allowlist is readable via `get-options` only if it also has a schema entry in `GetOptions` (the readable set = allowlist ∩ known schema, `array_intersect_key` at [GetOptions.php:416](GetOptions.php)); it is **writable** via `set-option` purely on allowlist membership, and unknown keys fall through `sanitize_value()` unmodified. So when you expose a custom key, prefer wiring your own sanitization on the WP Rocket option save path rather than trusting the pass-through.

## The MCP OAuth server (opt-in)

Off until a site owner opts in:

```php
// Turn the MCP OAuth server ON (rewrite rules, /oauth/* endpoints, discovery, transport).
add_filter( 'rocket_mcp_oauth_server_enabled', '__return_true' );
// After toggling, flush rewrite rules once (Settings > Permalinks, or wp rewrite flush).
```

What it registers when enabled (verified):

- **MCP server** at `/wp-json/mcp/mcp-oauth-server` via `WP\MCP\Core\McpAdapter`, exposing `mcp-adapter/discover-abilities`, `get-ability-info`, `execute-ability` over a custom JWT-Bearer `OAuthHttpTransport` — [Server.php:18-41](Server.php).
- **OAuth endpoints** via rewrite rules (query var `mcp_oauth_endpoint`, handled on `template_redirect`) — [Rewrite.php:43-48](Rewrite.php):
  `/oauth/authorize`, `/oauth/authorize-callback`, `/oauth/token`, `/oauth/consent`, `/oauth/revoke`.
- **Discovery documents** (rewrite on `init`) — [Discovery/Endpoints.php:44-52](Endpoints.php):
  `/.well-known/oauth-protected-resource` (RFC 9728), `/.well-known/oauth-authorization-server` (RFC 8414).

### Trusted publishers (who may connect)

Client identification uses Client ID Metadata Documents (CIMD). Only client_ids whose host is allowlisted are ever network-fetched (SSRF gate), and the fetched doc must exactly match a pinned client_id. The bundled publisher is **Claude** — verified [ClaudeClientVerifier.php:100-112](ClaudeClientVerifier.php):

```
claude → client_ids: https://claude.ai/oauth/claude-code-client-metadata
                     https://claude.ai/oauth/mcp-oauth-client-metadata
         host:       claude.ai
```

Add another trusted MCP client (can only ADD; the exact client_id match + host gate still apply):

```php
add_filter( 'rocket_mcp_trusted_publishers', function ( array $publishers ): array {
    $publishers['my-agent'] = [
        'client_ids' => [ 'https://agent.example.com/.well-known/mcp-client' ],
        'host'       => 'agent.example.com',
    ];
    return $publishers;
} );
```

## Security considerations

- **`set-option` is destructive by declaration.** Anyone (or any AI) that can authenticate as a user holding `rocket_manage_options` can flip caching, CDN, Cloudflare, and database-cleanup settings. Keep the allowlist minimal for the risk profile you accept.
- **Minimize the allowlist**, don't expand it casually. Database-cleanup toggles (`database_*`), `cdn*`, and `cloudflare_*` have real side effects if flipped by a confused agent.
- **The OAuth server is a public network surface when enabled** — leave it off unless a specific integration needs it, and confirm the trusted-publisher list is exactly what you intend.
- **Telemetry**: every ability execution fires `track_event( 'MCP Ability Executed', … )` (WP Media Mixpanel, via `TrackingTrait`) — [GetOptions.php:467](GetOptions.php), [SetOption.php:269](SetOption.php). If your compliance posture forbids that, gate it at WP Rocket's analytics/consent setting.
- **Capability, not nonce, is the gate.** Access hinges entirely on `rocket_manage_options`; do not grant that cap to roles you wouldn't trust to reconfigure caching.

## Critical rules

- **Two layers, opposite defaults**: abilities default ON (`rocket_enable_abilities`), OAuth server default OFF (`rocket_mcp_oauth_server_enabled`). Reason about them separately.
- **To disable AI settings access entirely**, use `rocket_enable_abilities => false`; the OAuth-server toggle alone is not enough.
- **`rocket_mcp_options_allowlist` is an ALLOWLIST** — adding exposes, removing restricts. Minimize it.
- **Typed filters** (`wpm_apply_filters_typed`): return the exact declared type — `bool` for the two enable filters, `array` for allowlist / trusted-publishers. Use `__return_true`/`__return_false` for booleans.
- **`set-option` `update_mode`** defaults to `update` (merge) for array/textarea options; pass `replace` to overwrite. Read `get-options` before editing an array option.
- **`rocket_mcp_trusted_publishers` can only ADD** publishers; exact client_id match + host SSRF gate still apply. Never widen a host to a shared domain.
- **Flush rewrite rules** after toggling the OAuth server on/off (the `/oauth/*` and `/.well-known/*` paths are rewrite-based).
- **Feature-detect all three**: WP Rocket 3.23+, `wp_register_ability`, and (for the server) `McpAdapter`.
- **The abilities are behind `rocket_manage_options`** — treat that capability as the real security boundary.

## Common mistakes

```php
// WRONG — assuming the allowlist hides keys
add_filter( 'rocket_mcp_options_allowlist', function ( $a ) {
    $a[] = 'stripe_secret_key';   // WRONG: this EXPOSES it to AI read/write
    return $a;
} );

// RIGHT — allowlist is additive exposure; to hide, remove
add_filter( 'rocket_mcp_options_allowlist', function ( $a ) {
    return array_values( array_diff( $a, [ 'do_cloudflare' ] ) );
} );

// WRONG — returning the wrong type into a typed filter
add_filter( 'rocket_mcp_oauth_server_enabled', function () {
    return 1;   // WRONG: boolean filter; return a real bool
} );

// RIGHT
add_filter( 'rocket_mcp_oauth_server_enabled', '__return_true' );

// WRONG — thinking "OAuth server off" means settings are AI-proof
add_filter( 'rocket_mcp_oauth_server_enabled', '__return_false' );
// abilities still registered & REST-exposed behind rocket_manage_options

// RIGHT — to guarantee no AI settings surface
add_filter( 'rocket_enable_abilities', '__return_false' );

// WRONG — trusting an arbitrary client via a shared host
add_filter( 'rocket_mcp_trusted_publishers', function ( $p ) {
    $p['x'] = [ 'client_ids' => [ 'https://github.com/foo' ], 'host' => 'github.com' ];
    return $p; // WRONG: shared host = anyone on that host is a candidate client
} );

// RIGHT — a host you control, with exact client_id URLs
add_filter( 'rocket_mcp_trusted_publishers', function ( $p ) {
    $p['my-agent'] = [
        'client_ids' => [ 'https://agent.example.com/.well-known/mcp-client' ],
        'host'       => 'agent.example.com',
    ];
    return $p;
} );

// WRONG — expecting update_mode 'update' to overwrite an array option
// set-option { option_name: 'cache_reject_uri', option_value: ['/x'] }
// → MERGES '/x' into the existing list, does not replace it

// RIGHT — pass replace when you mean overwrite
// set-option { option_name: 'cache_reject_uri', option_value: ['/x'], update_mode: 'replace' }
```

## Cross-references

- Run **`wp-abilities-api`** for the generic WP Abilities API mechanics (registering abilities, categories, `wp_register_ability`, permission/execute callbacks, `input_schema`/`output_schema`) — WP Rocket's abilities are a concrete consumer of that API.
- Run **`claude-api`** / MCP references when building the client side that connects to this server (Claude as the trusted publisher).
- Run **`wp-rocket-cache-rejection-and-filters`** to understand what the exposed option keys actually do (`cache_reject_uri`, `cdn_*`, `lazyload*`, etc.) before allowlisting them.
- Run **`wp-rocket-cache-invalidation`** when the task is clearing cache after a change rather than exposing settings.
- Run **`wp-security-audit`** / **`wp-security-secrets`** when reviewing whether the allowlist or trusted-publisher list widens the attack surface.

## What this skill does NOT cover

- **Building an MCP client** (the Claude side). This is the server/integrator surface only.
- **The WP Abilities API internals** — see `wp-abilities-api`.
- **The `wordpress/mcp-adapter` package internals** (`WP\MCP\*`) — bundled dependency; treat its classes as private and version-volatile. Integrate via WP Rocket's filters and the public abilities.
- **OAuth/JWT protocol internals** (token issuance, JTI/refresh handling, application-password linkage) — private `inc/Engine/MCP/Auth/*` implementation; do not call directly.
- **The WP Rocket settings UI / license / activation** — out of scope for integrators.

## References

- Abilities enable gate: [inc/Engine/Abilities/Context.php:19](Context.php) — `wpm_apply_filters_typed( 'boolean', 'rocket_enable_abilities', true )`.
- Allowlist: [inc/Engine/Abilities/Options/AllowedOptions.php:14-102](AllowedOptions.php) — built-in ~70 keys + `rocket_mcp_options_allowlist`.
- `wp-rocket/get-options`: [inc/Engine/Abilities/Options/GetOptions.php:418](GetOptions.php) — readonly, `mcp.public`, cap `rocket_manage_options`.
- `wp-rocket/set-option`: [inc/Engine/Abilities/Options/SetOption.php:158](SetOption.php) — destructive; `input_schema`, `update_mode`, per-type sanitization at [SetOption.php:331](SetOption.php).
- MCP OAuth enable gate: [inc/Engine/MCP/Context.php:23](Context.php) — `wpm_apply_filters_typed( 'boolean', 'rocket_mcp_oauth_server_enabled', false )`.
- MCP server: [inc/Engine/MCP/Transport/Server.php:18](Server.php) — `/wp-json/mcp/mcp-oauth-server`, McpAdapter, ability-adapter tools.
- OAuth endpoints: [inc/Engine/MCP/Auth/Rewrite.php:43](Rewrite.php) — `/oauth/{authorize,authorize-callback,token,consent,revoke}`.
- Discovery: [inc/Engine/MCP/Auth/Discovery/Endpoints.php:44](Endpoints.php) — `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`.
- Trusted publishers (Claude): [inc/Engine/MCP/Auth/ClaudeClientVerifier.php:100](ClaudeClientVerifier.php) — `rocket_mcp_trusted_publishers`.
- Bundled deps (composer.json): `wordpress/mcp-adapter ^0.4.1`, `wp-media/apply-filters-typed ^1.0` (the `wpm_apply_filters_typed` helper), `wp-media/wp-mixpanel` (telemetry).
