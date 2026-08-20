---
name: wp-connectors-api
description: Register and review WordPress 7.1 Connectors API integrations
  for external services, especially AI providers and API-key backed services
  shown under the Settings / Connectors screen. Covers wp_connectors_init,
  WP_Connector_Registry, wp_get_connector, wp_get_connectors,
  wp_is_connector_registered, api_key, application_password, and none
  authentication, credential source priority, masking and REST settings,
  WP AI Client provider auto-discovery, connector settings,
  and safe metadata override patterns. Use when code mentions connectors,
  the Settings / Connectors screen, external provider setup, or connector API keys.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Connectors API

WordPress 7.0 introduced the Connectors API; 7.1 adds Application Password credentials. Core uses the registry for Settings > Connectors and AI provider credentials. A connector is not the service client itself: it describes how the service is named, displayed, installed, authenticated, and discovered.

## When to use this skill

Trigger when ANY of the following is true:

- Code calls `wp_get_connector()`, `wp_get_connectors()`, `wp_is_connector_registered()`, or hooks `wp_connectors_init`.
- A plugin needs to appear on Settings > Connectors or expose provider credentials.
- The task mentions WordPress connectors, AI provider setup, API keys, Application Password credentials, `WP_Connector_Registry`, or `@wordpress/connectors`.
- Reviewing code that stores API keys or `username` / `password` credential objects for an external service.

## Availability

The Connectors API is core-only in WordPress 7.0+. Public lookup functions are available after `init`, because core initializes the registry on `init` priority 15. Feature-detect `application_password` support when retaining WordPress 7.0 compatibility.

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
- `authentication.method`: `api_key`, `application_password` (WordPress 7.1+), or `none`.

Optional but important:

- `description`: shown in UI.
- `logo_url`: URL to a logo.
- `authentication.credentials_url`: where users get credentials.
- `authentication.setting_name`: option used for API keys.
- `authentication.constant_name` / `env_var_name`: non-database secret sources.
- `plugin.file` / `plugin.is_active`: install/activate status for UI.

If a credential method is used and `setting_name` is omitted, core generates `connectors_{$type}_{$id}_{$method}` with hyphens normalized to underscores.

## API key handling

For `api_key` connectors, key source priority is:

1. Environment variable.
2. PHP constant.
3. Database option.

AI providers use `{PROVIDER_ID}_API_KEY`, for example `OPENAI_API_KEY`. Non-AI connectors can define any `env_var_name` and `constant_name`.

Database API keys are masked in REST/UI responses but are not encrypted in core 7.0. Prefer env vars or constants for production secrets. Never log connector settings or include raw key values in debug output.

Core registers default connector settings on `init` priority 20 when the connector uses a credential method and its plugin is active. Settings are exposed through `/wp/v2/settings`; core masks values in REST responses and validates AI provider API keys on update.

## Application Password credentials in WordPress 7.1

Use `application_password` for an external WordPress-style HTTP Basic pair, not
for an API key and not for the current site's Application Password management
UI:

```php
'authentication' => array(
    'method'          => 'application_password',
    'credentials_url' => 'https://remote.example.com/wp-admin/profile.php',
    'setting_name'    => 'myplugin_remote_credentials',
    'constant_name'   => 'MYPLUGIN_REMOTE_CREDENTIALS',
    'env_var_name'    => 'MYPLUGIN_REMOTE_CREDENTIALS',
),
```

Environment and constant values use one `username:password` string, split on
the first colon, so the password may contain colons. Core resolves sources in
environment, constant, database order. A malformed non-empty environment or
constant value emits `_doing_it_wrong()` and falls through to the next source.

The database setting is an object with `username` and `password`. Core exposes
its schema through `/wp/v2/settings` and masks a non-empty password as exactly
16 bullet characters in responses. Resubmitting that mask preserves the stored
password; an explicit empty string clears the field. An empty username clears
both fields. Partial updates preserve omitted stored fields.

Application Password values are masked but not verified against the remote
service by core. The integration must test credentials server-side, use HTTPS,
avoid logging Authorization headers, and provide a deterministic disconnected
state. Database values remain ordinary options, not encrypted secrets.

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

For public plugin integrations, register connector metadata in PHP and use ordinary Settings API or plugin UI for custom flows that core does not support. WordPress 7.1's public registry supports `api_key`, `application_password`, and `none`; OAuth and multi-step credential protocols still need plugin-owned flows.

## Critical rules

- **Hook registration on `wp_connectors_init`**, not bare `init`.
- **Use public lookup functions after `init`** instead of touching the registry singleton.
- **Feature-detect AI support and connector existence.**
- **Do not duplicate WP AI Client provider connectors.** Let auto-discovery create them.
- **Prefer env vars or constants for production API keys.**
- **Treat Application Password pairs as secrets.** Use HTTPS and server-side resolution; never expose them to browser code.
- **Do not expose raw keys through REST, logs, inline JS, or admin notices.**
- **A configured connector is site-wide infrastructure, not automatic consent
  for every plugin feature.** Require explicit feature/admin intent before
  spending provider quota or sending site/user content, and disclose the data
  boundary in the feature UI/privacy documentation.
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
- Custom OAuth or multi-step credential flows.
- Building private core Connectors screen extensions.

## References

- Connectors API dev note: <https://make.wordpress.org/core/2026/03/18/introducing-the-connectors-api-in-wordpress-7-0/>
- WordPress 7.0 Field Guide: <https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/>
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
- Core files: `wp-includes/connectors.php`, `wp-includes/class-wp-connector-registry.php`, `wp-admin/options-connectors.php`.
