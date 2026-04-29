---
name: wp-abilities-api
description: Register WordPress Abilities: machine-readable plugin
  operations with JSON Schema contracts, required permission callbacks,
  optional REST exposure, and AI/MCP-friendly discovery. Covers categories,
  wp_register_ability, WP_Ability::execute, REST run endpoints,
  meta.show_in_rest, annotations, and Ability vs REST route vs custom hook
  decisions. Use when exposing plugin functionality to agents, admin JS,
  external tools, or reviewing AI integration code.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.9 - 6.9.4"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/apis/abilities-api/
  - https://developer.wordpress.org/news/2025/11/introducing-the-wordpress-abilities-api/
  - https://packagist.org/packages/wordpress/abilities-api
  - https://github.com/WordPress/abilities-api
---

# WordPress Abilities API

A standardized registry for plugin / theme / core functionality, designed primarily so AI agents and external tools can **discover** what a WordPress site can do and **invoke** those capabilities through a uniform contract. Each Ability has a stable identifier, JSON-Schema-typed inputs and outputs, and a required permission callback. `WP_Ability::execute()` validates input, checks permissions, executes, and validates output.

Pre-Abilities, the same functionality was scattered across `do_action`, `apply_filters`, custom REST routes, public PHP functions, and ad-hoc plugin APIs (each with its own conventions). The Abilities API consolidates that into one machine-readable surface.

This skill is grounded in WordPress 6.9 core behavior. If a current handbook page and installed core disagree, verify against the target site's `wp-includes/abilities-api` and REST controller classes before coding.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding plugin functionality that AI agents (Claude, ChatGPT, custom MCP clients) should be able to discover and invoke.
- Designing an admin tool whose logic should be reachable from BOTH PHP code and the block editor JS without writing two parallel implementations.
- Reviewing a plugin where you see `wp_register_ability`, `wp_get_ability`, `WP_Ability`, the `wp_abilities_api_init` action, or the `@wordpress/abilities` JS package.
- Deciding whether to expose a feature as a custom REST endpoint vs an Ability.
- Migrating an existing custom REST endpoint to the Abilities API.

## Availability and installation

Three installation paths, depending on WP version:

1. **WordPress 6.9+** — server-side PHP API, registry, REST exposure, and core integration ship in core. No additional install needed.
2. **WordPress < 6.9 — Composer package** for plugins that bundle their own dependencies:
   ```bash
   composer require wordpress/abilities-api
   ```
   Package: <https://packagist.org/packages/wordpress/abilities-api>.
3. **WordPress < 6.9 — feature plugin** for site-wide install: download the latest release ZIP from <https://github.com/WordPress/abilities-api> or install via WP admin.

The JavaScript client is documented as `@wordpress/abilities` / `wp.abilities`, but do not assume the script is registered on every WP 6.9 install. Feature-detect the script handle or call the REST endpoints directly.

## Registering a category (prerequisite)

Every Ability MUST belong to a category. Register categories on the dedicated init action ([Abilities API docs](https://developer.wordpress.org/apis/abilities-api/)):

```php
add_action( 'wp_abilities_api_categories_init', 'myplugin_register_ability_categories' );

function myplugin_register_ability_categories(): void {
    wp_register_ability_category(
        'myplugin-site-information',
        array(
            'label'       => __( 'Site Information', 'myplugin' ),
            'description' => __( 'Abilities that report on site state.', 'myplugin' ),
        )
    );
}
```

If two plugins register the same category slug, the second registration fails with `_doing_it_wrong()` and returns `null`; the first category remains registered. Pick a slug specific enough to avoid collisions (`myplugin-tools`, not `tools`).

## Registering an ability — minimal example

```php
add_action( 'wp_abilities_api_init', 'myplugin_register_abilities' );

function myplugin_register_abilities(): void {
    wp_register_ability(
        'myplugin/site-info',
        array(
            'label'       => __( 'Site Info', 'myplugin' ),
            'description' => __( 'Returns information about this WordPress site.', 'myplugin' ),
            'category'    => 'myplugin-site-information',
            'input_schema'  => array(),
            'output_schema' => array(
                'type'       => 'object',
                'properties' => array(
                    'site_name' => array(
                        'type'        => 'string',
                        'description' => __( 'The name of the site.', 'myplugin' ),
                    ),
                    'php_version' => array(
                        'type'        => 'string',
                        'description' => __( 'PHP version running on the server.', 'myplugin' ),
                    ),
                ),
            ),
            'execute_callback'    => 'myplugin_get_site_info',
            'permission_callback' => static fn () => current_user_can( 'manage_options' ),
            'meta' => array(
                'show_in_rest' => true,
            ),
        )
    );
}

function myplugin_get_site_info(): array {
    return array(
        'site_name'   => get_bloginfo( 'name' ),
        'php_version' => PHP_VERSION,
    );
}
```

## Registration arguments — what's required

WordPress 6.9.4 core validates these arguments in `WP_Ability::prepare_properties()` and `WP_Abilities_Registry::register()`:

| Field | Required | Type | Notes |
|---|---|---|---|
| `label` | yes | string | Translated, human-readable. |
| `description` | yes | string | Translated. AI agents read this to decide whether to invoke. |
| `category` | yes | string | Slug must match a registered category. |
| `input_schema` | no | array | Required in practice when the ability accepts input. If omitted/empty and input is provided, execution returns `ability_missing_input_schema`. |
| `output_schema` | no in core, yes in docs/review | array | Core allows omission and then skips output validation. Provide it anyway for contracts, REST discovery, and agents. |
| `execute_callback` | yes | callable | The PHP function that runs. |
| `permission_callback` | yes | callable | Returns `true`, `false`, or `WP_Error`. Enforced by `WP_Ability::execute()` and by REST run permission checks. |
| `meta` | optional | array | Additional metadata. `'show_in_rest' => true` exposes the ability via the REST endpoints. |

The `description` is the most important field for AI consumers — it's what an agent reads to decide whether the Ability is the right tool. Write it the way you'd describe the function to a smart colleague reviewing the API.

Callback arity depends on `input_schema`: if the schema is empty, WordPress calls `execute_callback` and `permission_callback` with no arguments. If the schema is non-empty, WordPress passes the normalized input as the first argument.

## Naming convention

Ability identifier: `namespace/ability-name` (slash-separated, kebab-case on both sides).

- The `namespace` is your plugin slug or a sub-system inside it (`myplugin`, `myplugin-billing`).
- The `ability-name` describes what it does (`get-site-info`, `cancel-subscription`, `summarize-post`).

Pick names a non-developer could read aloud — `myplugin/cancel-subscription` is better than `myplugin/cancel-sub-v2`. Treat the identifier as a public API contract: once an Ability is shipped and an AI agent or external client depends on it, renaming is a breaking change.

## Permission callback

Required. Return `true` to allow execution, `false` to deny, or `WP_Error` for a structured REST permission failure. `WP_Ability::execute()` enforces this for direct PHP execution; if the callback returns `WP_Error` there, core logs it via `_doing_it_wrong()` and returns a generic `ability_invalid_permissions` error so the message is not leaked. The REST run endpoint also checks permissions before execution:

```php
'permission_callback' => static function (): bool {
    return current_user_can( 'manage_options' );
},
```

For object-level abilities (operate on a specific post / user / order), pass the object ID through the meta-capability check:

```php
'permission_callback' => static function ( array $input ): bool {
    return current_user_can( 'edit_post', (int) ( $input['post_id'] ?? 0 ) );
},
```

Keep permission callbacks cheap and side-effect-free. In the REST run flow, WordPress validates input and calls `check_permissions()` in the REST `permission_callback`, then `WP_Ability::execute()` validates and checks permissions again before running the ability. Do not put logging, billing, remote API calls, or state changes in `permission_callback`.

## Executing an ability from PHP

```php
$ability = wp_get_ability( 'myplugin/site-info' );
if ( $ability instanceof WP_Ability ) {
    $result = $ability->execute( $input ); // $input is the args array matching input_schema
}
```

Helpers documented in the announcement:

- `wp_get_ability( string $id ): ?WP_Ability`
- `wp_get_abilities(): array<string, WP_Ability>`
- `wp_has_ability( string $id ): bool`

For inspection / debugging during development, use `wp shell`:

```
$ wp shell
wp> wp_has_ability( 'myplugin/site-info' );
=> bool(true)
wp> wp_get_ability( 'myplugin/site-info' );
=> object(WP_Ability) ...
```

## REST exposure

When `meta.show_in_rest = true`, the Ability is automatically exposed under:

- `GET /wp-json/wp-abilities/v1/abilities` — list all
- `GET /wp-json/wp-abilities/v1/abilities/{namespace}/{ability}` — get one, where the captured `name` is `namespace/ability`
- `GET|POST|DELETE /wp-json/wp-abilities/v1/abilities/{namespace}/{ability}/run` — execute

This path shape is verified against the WP 6.9.4 core REST controllers. If a handbook page, feature plugin, or bundled Composer package shows a different path shape, inspect `WP_REST_Abilities_V1_*_Controller::register_routes()` on the target site.

The method is selected from annotations in the WP 6.9.4 run controller: `readonly: true` expects `GET`; `destructive: true` plus `idempotent: true` expects `DELETE`; everything else expects `POST`. The route is registered as `ALLMETHODS`, but incorrect methods return a 405 error.

The `permission_callback` is enforced on the REST endpoints automatically; you don't need to write a separate `register_rest_route` permission check. REST list/get endpoints also require an authenticated user with `read`.

This is the **primary reason to prefer Abilities over custom REST routes** for new code: one registration, one permission contract, one schema, and the registry is discoverable.

## JavaScript client

```js
const { executeAbility } = window.wp?.abilities ?? {};

if ( executeAbility ) {
    const result = await executeAbility( 'myplugin/site-info', {
        /* input matching input_schema */
    } );
}
```

The Block Editor handbook documents `wp.abilities` and `@wordpress/abilities`, including `getAbilities`, `getAbility`, `getAbilityCategories`, and `executeAbility`. In plugin code, feature-detect the client or enqueue the script from the package you actually bundle; otherwise call the REST endpoint with `apiFetch`.

## MCP adapter — bridging to AI agents

The WordPress team maintains a separate **MCP adapter** that bridges the Abilities registry to the [Model Context Protocol](https://modelcontextprotocol.io/) — the protocol Claude, ChatGPT, and other AI agent runtimes use to discover and invoke external tools. With the adapter installed, every registered Ability becomes an MCP tool the AI can call, gated by the same `permission_callback`.

Architectural details of the MCP adapter were not included in the Nov 2025 announcement (deferred to a follow-up post). For now, the practical takeaway: registering a clean, well-described Ability also makes it AI-agent-ready without any extra code on your side, IF the site administrator installs the MCP adapter.

## When to use an Ability vs a custom REST route vs a custom hook

| Situation | Use |
|---|---|
| Operation that AI agents / external tools should discover and invoke | **Ability** |
| Operation called only from your own JS / blocks, with rich validation | Either Ability (preferred) or custom REST route |
| Internal extension point (other plugins / themes can wire callbacks) | Custom action / filter hook (see `wp-plugin-hooks`) |
| Pure UI rendering with no logic to expose externally | Block / shortcode, NOT an Ability |
| Webhook receiver from a third-party service | Custom REST route — webhooks usually need a fixed URL contract that doesn't fit the Abilities namespace shape |

The default in 2026 for new "operation surface" code in a WP plugin is: try as an Ability first.

## Critical rules

- **Register on `wp_abilities_api_init`** for abilities, `wp_abilities_api_categories_init` for categories. Don't register on `init` directly.
- **Categories are prerequisite.** Register categories before abilities.
- **Identifier `namespace/ability-name` is a public contract** — treat it like a versioned API.
- **Always provide a `permission_callback`**; core requires it. Use object-aware capability checks for object-scoped abilities.
- **Provide schemas even when core does not force them.** If the ability accepts input, `input_schema` is required in practice; without it, provided input is rejected. `output_schema` is essential for documentation and agents.
- **Set `meta.show_in_rest = true`** if external tools should call the ability. Without it, only PHP-side `->execute()` works.
- **Description is the AI's tool selector.** Write it for a reader who doesn't know your plugin.
- **For pre-6.9 sites, use the Composer package or feature plugin.** Don't reimplement the registry yourself.

## Common mistakes

```php
// WRONG — registering on 'init' instead of 'wp_abilities_api_init'
add_action( 'init', function () {
    wp_register_ability( 'myplugin/foo', /* ... */ );
} );

// WRONG — no category registered, ability registration returns null
wp_register_ability( 'myplugin/foo', array(
    'category' => 'never-registered',
    /* ... */
) );

// WRONG — permission_callback always returns true on a write action
'permission_callback' => '__return_true', // anyone with REST access can invoke

// WRONG — empty description; AI agents have nothing to choose against
'description' => '',

// WRONG — ability expects input but has no schema; provided input is rejected
'input_schema'    => array(),
'execute_callback' => function ( array $input ) {
    if ( ! isset( $input['post_id'] ) || ! is_numeric( $input['post_id'] ) ) { /* ... */ }
}
// Should be: declare 'post_id' as a required integer in input_schema. With a
// non-empty input_schema, the callback receives the normalized input.

// WRONG — namespace collision with another plugin
wp_register_ability( 'tools/cancel', /* ... */ ); // generic; collide-prone

// RIGHT — plugin-prefixed namespace
wp_register_ability( 'myplugin/cancel-subscription', /* ... */ );
```

## Cross-references

- Run **`wp-rest-api`** when comparing against custom `register_rest_route` patterns. Many existing custom REST endpoints in plugin codebases would be cleaner as Abilities.
- Run **`wp-plugin-hooks`** for the case where the right primitive is actually an `apply_filters` extension point inside the plugin, not a publicly invocable Ability.
- Run **`wp-security-audit`** on the `execute_callback` — it's a request-handling endpoint reached through REST and MCP. Sanitize / validate inputs, escape outputs, treat the input as untrusted regardless of the schema.

## What this skill does NOT cover

- The MCP adapter's internal architecture and configuration (deferred to a separate post in the official series).
- The full `@wordpress/abilities` JS package API surface beyond basic discovery and execution.
- Multisite-network considerations for Abilities (not addressed in the Nov 2025 announcement; verify before relying on per-site vs network registration semantics).
- WP-CLI command coverage beyond `wp shell` inspection (no dedicated CLI commands documented yet).
- Building a full hook extension layer around abilities. Core provides `wp_abilities_api_categories_init`, `wp_abilities_api_init`, `wp_before_execute_ability`, `wp_after_execute_ability`, `wp_register_ability_category_args`, and `wp_register_ability_args`.

## References

- [Abilities API documentation](https://developer.wordpress.org/apis/abilities-api/) — primary authoritative source.
- [Introducing the Abilities API (Nov 2025)](https://developer.wordpress.org/news/2025/11/introducing-the-wordpress-abilities-api/) — announcement post with concrete examples.
- [`wordpress/abilities-api` Composer package](https://packagist.org/packages/wordpress/abilities-api).
- [WordPress/abilities-api on GitHub](https://github.com/WordPress/abilities-api) — active feature-plugin repository (the older archived repo is NOT canonical).
- [Make WordPress Core AI team blog](https://make.wordpress.org/ai/) — ongoing development discussion.
