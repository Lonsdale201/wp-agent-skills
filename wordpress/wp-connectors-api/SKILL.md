---
name: wp-connectors-api
description: Register and review WordPress 7.0 Connectors API integrations
  for external services, especially AI providers and API-key backed services
  shown under Settings > Connectors. Covers wp_connectors_init,
  WP_Connector_Registry, wp_get_connector, wp_get_connectors,
  wp_is_connector_registered, api_key vs none authentication, env/constant
  key priority, WP AI Client provider auto-discovery, connector settings,
  and safe metadata override patterns. Use when code mentions connectors,
  Settings > Connectors, external provider setup, or connector API keys.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-05-21"
docs:
  - https://make.wordpress.org/core/2026/03/18/introducing-the-connectors-api-in-wordpress-7-0/
  - https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/
---

# WordPress Connectors API

WordPress 7.0 introduces the Connectors API: a registry for external-service connection metadata. Core uses it for the new Settings > Connectors screen and for AI provider credentials used by the WP AI Client. A connector is not the service client itself; it describes how the service is named, displayed, installed, authenticated, and discovered.

## When to use this skill

Trigger when ANY of the following is true:

- Code calls `wp_get_connector()`, `wp_get_connectors()`, `wp_is_connector_registered()`, or hooks `wp_connectors_init`.
- A plugin needs to appear on Settings > Connectors or expose provider credentials.
- The task mentions WordPress 7.0 connectors, AI provider setup, API key settings, `connectors_ai_*_api_key`, `WP_Connector_Registry`, or `@wordpress/connectors`.
- Reviewing code that stores API keys for Anthropic, Google, OpenAI, Akismet, or another external provider.

## Availability

The Connectors API is core-only in WordPress 7.0+. Public lookup functions are available after `init`, because core initializes the registry on `init` priority 15.

AI provider connectors are registered only when `wp_supports_ai()` is true. `wp_supports_ai()` can be disabled by `WP_AI_SUPPORT` or the `wp_supports_ai` filter, so AI connectors must be feature-detected.

## Public lookup API

Use these outside the `wp_connectors_init` callback:

```php
if ( wp_is_connector_registered( 'openai' ) ) {
    $connector = wp_get_connector( 'openai' );
}

foreach ( wp_get_connectors() as $id => $connector ) {
    // $connector['name'], $connector['type'], $connector['authentication'].
}
```

Do not instantiate or replace `WP_Connector_Registry` directly.

## Registering a connector

Register new connectors on `wp_connectors_init`. The callback receives the registry instance:

```php
add_action( 'wp_connectors_init', static function ( WP_Connector_Registry $registry ): void {
    $registry->register(
        'my_service',
        array(
            'name'           => __( 'My Service', 'myplugin' ),
            'description'    => __( 'Syncs content with My Service.', 'myplugin' ),
            'type'           => 'content_sync',
            'authentication' => array(
                'method'          => 'api_key',
                'credentials_url' => 'https://example.com/account/api-keys',
                'setting_name'    => 'myplugin_my_service_api_key',
                'constant_name'   => 'MYPLUGIN_MY_SERVICE_API_KEY',
                'env_var_name'    => 'MYPLUGIN_MY_SERVICE_API_KEY',
            ),
            'plugin'         => array(
                'file'      => 'myplugin/myplugin.php',
                'is_active' => static fn (): bool => defined( 'MYPLUGIN_VERSION' ),
            ),
        )
    );
} );
```

Connector IDs must match `/^[a-z0-9_-]+$/`. The registry rejects duplicate IDs; overriding requires unregistering first.

## Connector data shape

Required:

- `name`: display name.
- `type`: connector type, e.g. `ai_provider`, `spam_filtering`, `content_sync`.
- `authentication.method`: `api_key` or `none`.

Optional but important:

- `description`: shown in UI.
- `logo_url`: URL to a logo.
- `authentication.credentials_url`: where users get credentials.
- `authentication.setting_name`: option used for API keys.
- `authentication.constant_name` / `env_var_name`: non-database secret sources.
- `plugin.file` / `plugin.is_active`: install/activate status for UI.

If `api_key` is used and `setting_name` is omitted, core generates `connectors_{$type}_{$id}_api_key` with hyphens normalized to underscores.

## API key handling

For `api_key` connectors, key source priority is:

1. Environment variable.
2. PHP constant.
3. Database option.

AI providers use `{PROVIDER_ID}_API_KEY`, for example `OPENAI_API_KEY`. Non-AI connectors can define any `env_var_name` and `constant_name`.

Database API keys are masked in REST/UI responses but are not encrypted in core 7.0. Prefer env vars or constants for production secrets. Never log connector settings or include raw key values in debug output.

Core registers default connector settings on `init` priority 20 when the connector has `api_key` authentication and its plugin is active. Settings are exposed through `/wp/v2/settings`; core masks values in REST responses and validates AI provider keys on update.

## AI providers

Core ships default AI connector metadata for `anthropic`, `google`, and `openai`, plus a non-AI `akismet` connector. For AI providers, the Connectors API auto-discovers provider metadata from the WP AI Client registry and merges it onto the defaults.

If a plugin registers an AI provider with the WP AI Client registry, do not also register a duplicate connector manually. Use `wp_connectors_init` only to override metadata or register non-AI connectors.

## Overriding metadata

Use the unregister-modify-register sequence:

```php
add_action( 'wp_connectors_init', static function ( WP_Connector_Registry $registry ): void {
    if ( ! $registry->is_registered( 'openai' ) ) {
        return;
    }

    $connector = $registry->unregister( 'openai' );
    $connector['description'] = __( 'Custom OpenAI description.', 'myplugin' );
    $registry->register( 'openai', $connector );
} );
```

Always check `is_registered()` first; `unregister()` on a missing connector triggers `_doing_it_wrong()`.

## Client-side UI

Core has an `@wordpress/connectors` script module, but its registration APIs are currently exposed as experimental/private internals. Do not build stable plugin behavior around those private exports unless you are working on core or a tightly pinned internal build.

For public plugin integrations, register connector metadata in PHP and use ordinary Settings API or plugin UI for custom flows that core does not support yet. In 7.0, built-in UI support focuses on `api_key` and `none`.

## Critical rules

- **Hook registration on `wp_connectors_init`**, not bare `init`.
- **Use public lookup functions after `init`** instead of touching the registry singleton.
- **Feature-detect AI support and connector existence.**
- **Do not duplicate WP AI Client provider connectors.** Let auto-discovery create them.
- **Prefer env vars or constants for production API keys.**
- **Do not expose raw keys through REST, logs, inline JS, or admin notices.**
- **Do not rely on private `@wordpress/connectors` APIs for public plugin contracts.**

## Common mistakes

```php
// WRONG - duplicate registration fails.
$registry->register( 'openai', array( /* ... */ ) );

// RIGHT - override explicitly.
if ( $registry->is_registered( 'openai' ) ) {
    $connector = $registry->unregister( 'openai' );
    $connector['description'] = __( '...', 'myplugin' );
    $registry->register( 'openai', $connector );
}

// WRONG - raw key leaked to JS.
wp_add_inline_script( 'myplugin-admin', 'window.apiKey = ' . wp_json_encode( get_option( 'my_key' ) ) );

// RIGHT - rely on env/constant/database lookup server-side and masked REST settings.
```

## Cross-references

- Run **`wp-ai-client`** when the connector config is used to make AI requests.
- Run **`wp-security-secrets`** when reviewing API key storage or logs.
- Run **`wp-plugin-options-storage`** when deciding whether connector-related plugin state belongs in options.

## What this skill does NOT cover

- Implementing a full AI provider plugin for the PHP AI Client SDK.
- Custom OAuth or multi-step credential flows; WP 7.0 core UI is primarily `api_key` / `none`.
- Building private core Connectors screen extensions.

## References

- Connectors API dev note: <https://make.wordpress.org/core/2026/03/18/introducing-the-connectors-api-in-wordpress-7-0/>
- WordPress 7.0 Field Guide: <https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/>
- Core files: `wp-includes/connectors.php`, `wp-includes/class-wp-connector-registry.php`, `wp-admin/options-connectors.php`.
