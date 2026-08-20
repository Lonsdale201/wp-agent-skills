---
name: wp-json-schema-api
description: >-
  Prepare, expose, and audit WordPress-authored JSON Schemas with the WordPress
  7.1 JSON Schema API. Covers wp_prepare_json_schema_for_client,
  wp_get_json_schema_allowed_keywords, draft-04 versus rest-api profiles,
  required-property conversion, recursive schema cleanup, empty-object
  defaults, the wp_json_schema_allowed_keywords filter, and the boundary
  between schema publication, REST validation, sanitization, and application
  authorization. Use when returning schemas through REST, Abilities, AI tools,
  JavaScript configuration, or converting WordPress REST-style schemas for
  external consumers.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress JSON Schema API

WordPress 7.1 adds a shared API for preparing WordPress-authored schemas for
clients. Its job is compatibility and safe publication: it converts a few
WordPress conventions and removes keywords outside the selected profile. It
does not validate or sanitize a value and does not authorize an operation.

## Use the public helpers

Feature-detect when WordPress 7.0 or older remains supported:

```php
if ( function_exists( 'wp_prepare_json_schema_for_client' ) ) {
	$public_schema = wp_prepare_json_schema_for_client( $schema, 'draft-04' );
} else {
	// Keep a deliberately maintained compatibility schema; do not expose
	// callbacks or blindly return the server schema.
	$public_schema = $legacy_public_schema;
}
```

The two public functions have deliberately different defaults:

- `wp_get_json_schema_allowed_keywords()` defaults to `rest-api`;
- `wp_prepare_json_schema_for_client()` defaults to `draft-04`.

Choose `rest-api` for the historical REST-exposed keyword subset. Choose
`draft-04` for a standalone client, Ability description, or AI provider that
can consume the broader Draft 4 vocabulary. An unknown profile falls back to
the REST keyword set; do not rely on misspelled profile names failing closed
with an exception.

## Keep server and published schemas separate

```php
$server_schema = array(
	'type'       => 'object',
	'properties' => array(
		'post_id' => array(
			'type'              => 'integer',
			'minimum'           => 1,
			'required'          => true,
			'sanitize_callback' => 'absint',
		),
	),
);

$public_schema = wp_prepare_json_schema_for_client(
	$server_schema,
	'draft-04'
);
```

The published result moves the per-property `required: true` marker into the
parent object's `required` array and strips the callable. Keep the original
schema for WordPress execution and the prepared copy for transport.

If the parent already has a Draft 4 `required` array, it takes precedence:
per-property booleans are removed but are not merged into that array. Make the
server contract internally consistent before publishing it.

## Understand what preparation changes

Preparation recursively walks schema-bearing keywords, removes keys not
allowed by the profile, and normalizes WordPress-specific representations. In
particular:

- an empty array used as the default of an object schema becomes a JSON object;
- per-property boolean `required` flags are removed and, when no parent
  `required` array exists, the `true` properties are collected there;
- a stray boolean `required` without an object property list is removed;
- nested `properties`, `patternProperties`, `definitions`, `dependencies`,
  `items`, `not`, `additionalProperties`, `additionalItems`, `anyOf`, `oneOf`,
  and `allOf` schemas are prepared recursively when the chosen profile permits
  those keywords;
- unknown and WordPress-only keys, including PHP callbacks, are removed.

Numeric arrays used as data, such as property-dependency lists, are preserved
instead of being mistaken for schema maps.

Read `references/profiles-and-normalization.md` for the exact profile delta and
review probes.

## Validation, sanitization, and authorization remain separate

Never treat a prepared schema as evidence that input was checked:

1. validate inbound data with the API that owns the request, such as
   `rest_validate_value_from_schema()` or the registered REST argument schema;
2. sanitize/coerce only according to that server contract;
3. perform capability and object-ownership checks separately;
4. copy allowlisted fields into the write model rather than mass-assigning a
   request object.

Adding a keyword through `wp_json_schema_allowed_keywords` only allows that
keyword to survive publication. It does not teach WordPress validators or
sanitizers how to enforce it. A plugin that adds `const`, `if`, or a custom
keyword must also own and test the corresponding validation behavior.

## Filter safely

The filter receives the allowed keyword list and profile name:

```php
add_filter(
	'wp_json_schema_allowed_keywords',
	static function ( array $keywords, string $profile ): array {
		if ( 'draft-04' !== $profile ) {
			return $keywords;
		}

		$keywords[] = 'x-acme-ui';
		return array_values( array_unique( $keywords ) );
	},
	10,
	2
);
```

Only extend the list for a namespaced, documented consumer contract. A global
filter affects every schema prepared later in the request, including core and
other plugins. Keep it deterministic, avoid removing standard keywords, and
test for cross-plugin collisions.

## Review checklist

- Confirm the target consumer and select `rest-api` or `draft-04` explicitly.
- Keep the execution schema distinct from its prepared transport copy.
- Inspect the prepared output with `wp_json_encode()`, especially empty object
  defaults and nested schemas.
- Verify parent `required` arrays and per-property markers do not disagree.
- Confirm no callable, internal metadata, secret default, or implementation
  detail survives publication.
- Validate and authorize actual inputs independently of schema preparation.
- Test custom allowed-keyword filters with other plugins active.
- Feature-detect the helpers or require WordPress 7.1.

## Related skills

- `wp-rest-api` for server route schemas and request validation.
- `wp-abilities-api` for Ability input/output contracts.
- `wp-ai-client` for structured AI output and function declarations.

## References

- WordPress 7.1 core: `wp-includes/json-schema.php`.
- WordPress REST schema helpers: `wp-includes/rest-api.php`.
- <https://make.wordpress.org/core/2026/07/31/json-schema-preparation-for-client-compatibility-in-wordpress-7-1/>
