# Source-backed AI additions in the tested candidate

Read the actual candidate registry before inferring shipped abilities from an AI
feature-plugin announcement. Discovery and external model execution are separate.

## Embedding builder

The candidate adds wp_ai_client_embedding(...$input) in wp-includes/ai-client.php.
It creates a WP_AI_Client_Embedding_Builder. Multiple inputs can be supplied as
arguments or a list. A model must be selected explicitly through the builder;
embedding vectors from different models are not interchangeable.

Feature-detect the entry point. Keep provider credentials in the site's supported
credential mechanism; do not adopt the withdrawn Secrets API for 7.2. Handle
unsupported providers/models and provider errors. A vector needs its model and
dimension/version metadata when persisted or indexed. Re-embedding a corpus and
switching similarity indexes is a separate data migration.

Check builder construction separately from provider execution. Test generation
and error handling against the intended provider/model within the user's data
and cost constraints.

## Core ability inventory

Inspect the names returned by wp_get_abilities() after bootstrap, then check each
ability's schemas, required capabilities and callbacks before allowing a consumer
to invoke it. Keep any consumer allowlist explicit.

Do not expose all discovered abilities automatically to AI tools. Discovery is
not authorization, and neither the AI plugin's version nor a provider installation
proves that every core transport or write ability is enabled.

## Sources

- [Official PHP AI Client](https://github.com/WordPress/php-ai-client)
- [Official core source](https://github.com/WordPress/wordpress-develop)
- Verified source: wp-includes/ai-client.php,
  wp-includes/ai-client/class-wp-ai-client-embedding-builder.php, wp-includes/abilities/.
