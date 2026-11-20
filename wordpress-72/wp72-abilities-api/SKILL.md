---
name: wp72-abilities-api
description: >-
  Migrates WordPress 7.2 Abilities API integrations using required_capabilities, has_required_capabilities, WP_Ability::prepare_input and schema-aware JSON output. Use for ability registration, direct PHP versus REST input differences, permission callbacks, sanitization failures or custom AI/REST transports.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 Abilities API changes

Apply this delta to existing ability integrations. Keep category registration,
API initialization and the plugin's older-version support contract intact.

## Permissions

- `required_capabilities` is an array of non-empty capability strings. All must
  pass before `permission_callback` runs.
- Omit the callback only when a non-empty list fully describes every invocation.
  Keep object-specific checks in the callback; `edit_posts` does not authorize
  editing every post.
- An empty/omitted list still requires a valid permission callback. Use
  `__return_true` only for intentionally public abilities.
- Discovery with `has_required_capabilities => true` checks the static list,
  not input-specific callbacks or the permission-result filter. Discovery is
  not authorization.
- `wp_ability_permission_result` can override the final result. Audit relevant
  filters when an expected denial unexpectedly succeeds.

## Input lifecycle

`execute( $raw_input )` prepares input, checks permissions and executes.
Preparation normalizes defaults, validates, then sanitizes against the schema.
Both PHP and REST paths now use it.

Preserve the transport contract: POST run requests put input in the JSON body;
GET/DELETE read it from query parameters. A generic internal set_param() call is
not equivalent to constructing the JSON body in a REST test.

- `number` converts an integer input to a float. Use `integer` when required.
- Booleans and array items are schema-coerced; do not rely on PHP truthiness of
  raw strings such as `"false"`.
- Sanitization errors return `ability_invalid_input` before permission/execution
  callbacks, including nested failures. Do not fall back to raw input.
- A direct call to `check_permissions()` does not prepare input:

```php
$prepared = $ability->prepare_input( $raw_input );
if ( is_wp_error( $prepared ) ) {
    return $prepared;
}
$permission = $ability->check_permissions( $prepared );
if ( is_wp_error( $permission ) || true !== $permission ) {
    return $permission;
}
// This path checked permission only; execute() owns the execution lifecycle.
```

First establish that `$ability` is a registered `WP_Ability`. On older supported
cores, feature-detect `prepare_input` and retain the established compatible path;
do not add a partial validation polyfill.

## JSON output

Direct PHP execution keeps the callback's PHP value. A custom JSON transport
should apply `wp_prepare_json_value_for_client( $result, $output_schema )`
before encoding. Schema-declared empty objects then become `{}`, including
nested objects and list items. `wp_prepare_json_schema_for_client()` also
preserves object-shaped defaults.

These helpers do not validate a result or populate missing defaults. A schema
that allows arrays still permits `[]`; do not cast every empty array to an object.

## Verify

Test denied capabilities without callback side effects, object-specific denial,
PHP/REST type parity, duplicate values created by sanitization, discovery versus
execution, root/nested empty objects and a valid successful call.

For source-backed embedding-builder and core-ability inventory guidance, read
[ai-and-core-abilities.md](references/ai-and-core-abilities.md).

## References

- [7.2 Abilities dev note](https://make.wordpress.org/core/2026/11/19/abilities-api-updates-in-wordpress-7-2/)
- Verified source: `wp-includes/abilities-api/class-wp-ability.php`,
  `wp-includes/abilities-api.php`,
  `wp-includes/rest-api/endpoints/class-wp-rest-abilities-v1-run-controller.php`,
  `wp-includes/json-schema.php`.
- Related stable skill: `wp-abilities-api`.
