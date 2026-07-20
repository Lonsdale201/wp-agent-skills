---
name: wp-ai-client
description: Build and review WordPress 7.0 WP AI Client integrations for
  provider-agnostic text, image, speech, video, JSON, and ability-powered
  generation. Covers wp_ai_client_prompt, WP_AI_Client_Prompt_Builder,
  wp_supports_ai, using_model_preference, is_supported_* checks,
  generate_* / generate_*_result methods, WP_Error handling,
  using_abilities, WP_AI_Client_Ability_Function_Resolver, connector-backed
  provider configuration, prompt prevention filters, and safe AI feature
  gating. Use when plugin code calls AI models or adds AI-powered WordPress
  features.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress AI Client

WordPress 7.0 adds a provider-agnostic WP AI Client. Plugin code asks WordPress for a prompt builder, declares what it needs, and lets the configured providers/models handle execution. Credentials are managed through Settings > Connectors and the Connectors API.

## When to use this skill

Trigger when ANY of the following is true:

- Code calls `wp_ai_client_prompt()`, `wp_supports_ai()`, `using_model_preference()`, `generate_text()`, `generate_image()`, `as_json_response()`, or `using_abilities()`.
- A plugin adds AI-assisted content generation, summarization, analysis, media generation, chat, or agent workflow features.
- The task mentions WP AI Client, AI providers, model preferences, AI Connectors, `WP_AI_Client_Prompt_Builder`, or AI-generated output in WordPress.
- Reviewing whether an AI feature degrades correctly when no provider is configured.

## Availability

The WP AI Client is available in WordPress 7.0+. Guard code for older sites:

```php
if ( ! function_exists( 'wp_ai_client_prompt' ) || ! wp_supports_ai() ) {
    return new WP_Error( 'ai_unavailable', __( 'AI is not available on this site.', 'myplugin' ) );
}
```

`wp_supports_ai()` returns false when `WP_AI_SUPPORT` is defined as false, and can be filtered through `wp_supports_ai`. Treat it as a runtime feature flag, not a version check.

## Basic workflow

1. Gate the feature by capability, nonce/request intent, and `wp_supports_ai()`.
2. Build a prompt with `wp_ai_client_prompt()`.
3. Prefer model capabilities or `using_model_preference()` instead of hard-coding one provider.
4. Call `is_supported_*()` before showing UI or starting expensive work.
5. Call a `generate_*` method and handle `WP_Error`.
6. Escape or sanitize AI output according to where it is used.

## Text generation

```php
$builder = wp_ai_client_prompt( 'Write a short product summary for: ' . $product_name )
    ->using_system_instruction( 'Return concise, factual marketing copy.' )
    ->using_temperature( 0.3 )
    ->using_model_preference(
        'provider-a/model-id',
        'provider-b/model-id'
    );

if ( ! $builder->is_supported_for_text_generation() ) {
    return new WP_Error( 'ai_text_unsupported', __( 'No configured AI model can generate text.', 'myplugin' ) );
}

$text = $builder->generate_text();
if ( is_wp_error( $text ) ) {
    return $text;
}

return sanitize_textarea_field( $text );
```

`using_model_preference()` is a preference list, not a hard requirement. Use model IDs that exist in the installed provider registry; if none of the preferred models is available, core can fall back to another compatible configured model.

## Full result metadata

Use `generate_*_result()` when you need provider/model metadata, token usage, or a REST-serializable result object:

```php
$result = wp_ai_client_prompt( 'Summarize the current post.' )
    ->generate_text_result();

if ( is_wp_error( $result ) ) {
    return $result;
}

$model_metadata = $result->getModelMetadata();
$token_usage    = $result->getTokenUsage();
```

Available result methods include `generate_text_result()`, `generate_image_result()`, `convert_text_to_speech_result()`, `generate_speech_result()`, and `generate_video_result()`.

## Structured JSON

For machine-consumed output, request JSON and validate again after generation:

```php
$schema = array(
    'type'       => 'object',
    'properties' => array(
        'title' => array( 'type' => 'string' ),
        'tags'  => array(
            'type'  => 'array',
            'items' => array( 'type' => 'string' ),
        ),
    ),
    'required'   => array( 'title', 'tags' ),
);

$data = wp_ai_client_prompt( 'Extract a title and tags from: ' . $content )
    ->as_json_response( $schema )
    ->generate_text();

if ( is_wp_error( $data ) ) {
    return $data;
}

$decoded = json_decode( $data, true );
if ( ! is_array( $decoded ) ) {
    return new WP_Error( 'ai_invalid_json', __( 'AI returned invalid JSON.', 'myplugin' ) );
}
```

The AI Client helps request structured output; plugin code still owns validation before saving data.

## Media generation

`generate_image()` returns a `WordPress\AiClient\Files\DTO\File` object:

```php
$image = wp_ai_client_prompt( 'A clean icon for a WordPress analytics plugin.' )
    ->generate_image();

if ( is_wp_error( $image ) ) {
    return $image;
}

$data_uri = $image->getDataUri();
```

Handle generated files deliberately: validate MIME/type, avoid silently inserting generated media into content, and require an explicit user action for writes.

## Abilities as AI tools

WordPress 7.0 can pass selected Abilities API entries as function declarations:

```php
$result = wp_ai_client_prompt( 'Check the site environment and summarize risk.' )
    ->using_abilities( 'core/get-site-info', 'core/get-environment-info' )
    ->generate_text_result();
```

Only allowlist abilities that the prompt needs. For model function-call resolution, use `WP_AI_Client_Ability_Function_Resolver` with the same explicit list:

```php
$resolver = new WP_AI_Client_Ability_Function_Resolver(
    'myplugin/get-report-status',
    'myplugin/create-report'
);
```

The resolver converts ability names to function names with the `wpab__` prefix. Do not expose all abilities to a model. The ability `permission_callback` still runs, but the resolver allowlist prevents arbitrary tool selection.

## Controls and hooks

- `wp_ai_client_default_request_timeout`: filter default request timeout in seconds.
- `wp_ai_client_prevent_prompt`: last-chance filter to block prompt execution. Generation methods return `WP_Error( 'prompt_prevented', ... )`.
- AI client events dispatch to hooks such as `wp_ai_client_before_generate_result` and `wp_ai_client_after_generate_result`.

Use these for policy, observability, and operational control. Do not use them to smuggle credentials into prompts.

## Critical rules

- **Never hard-code provider API keys.** Configure providers through Connectors, env vars, or constants.
- **Do not assume a provider or model exists.** Use `wp_supports_ai()` and `is_supported_*()`.
- **Handle `WP_Error` from every generation call.**
- **Use `using_model_preference()` for preferences, not provider lock-in.**
- **Require explicit user intent for write actions.** Avoid AI generation on every page load, cron tick, or unauthenticated request.
- **Treat AI output as untrusted input.** Validate before saving, escape before rendering.
- **Allowlist abilities when using AI tools.**
- **Avoid sending secrets, private user data, or personal data unless the feature explicitly requires it and the user/admin has consented.**

## Common mistakes

```php
// WRONG - assumes AI exists and writes raw model output.
$summary = wp_ai_client_prompt( $_POST['content'] )->generate_text();
update_post_meta( $post_id, '_summary', $summary );

// RIGHT - gate, unslash/sanitize input, check support, handle WP_Error, sanitize output.
$content = sanitize_textarea_field( wp_unslash( $_POST['content'] ?? '' ) );
$builder = wp_ai_client_prompt( $content );

if ( ! $builder->is_supported_for_text_generation() ) {
    return new WP_Error( 'ai_unsupported', __( 'No configured text model is available.', 'myplugin' ) );
}

$summary = $builder->generate_text();
if ( is_wp_error( $summary ) ) {
    return $summary;
}

update_post_meta( $post_id, '_summary', sanitize_textarea_field( $summary ) );
```

## Cross-references

- Run **`wp-connectors-api`** for provider credential setup and Settings > Connectors behavior.
- Run **`wp-abilities-api`** when exposing plugin operations as AI-callable tools.
- Run **`wp-security-audit`** when AI features read requests or write WordPress data.

## What this skill does NOT cover

- Building a provider plugin for the underlying PHP AI Client SDK.
- Prompt-engineering strategy beyond WordPress integration contracts.
- Legal/privacy policy design for AI processing.

## References

- AI Client dev note: <https://make.wordpress.org/core/2026/03/24/introducing-the-ai-client-in-wordpress-7-0/>
- WordPress 7.0 Field Guide: <https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/>
- Core files: `wp-includes/ai-client.php`, `wp-includes/ai-client/class-wp-ai-client-prompt-builder.php`, `wp-includes/ai-client/class-wp-ai-client-ability-function-resolver.php`.
