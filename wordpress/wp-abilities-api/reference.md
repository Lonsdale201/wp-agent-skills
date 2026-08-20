# Abilities API REST and JavaScript Reference

Read this after the main skill when implementing REST discovery or client-side
abilities on WordPress 7.1.

## REST routes

With effective `meta.show_in_rest = true`, core exposes:

- `GET /wp-json/wp-abilities/v1/abilities`
- `GET /wp-json/wp-abilities/v1/abilities/{namespace}/{ability}`
- `GET|POST|DELETE /wp-json/wp-abilities/v1/abilities/{namespace}/{ability}/run`
- `GET /wp-json/wp-abilities/v1/categories`
- `GET /wp-json/wp-abilities/v1/categories/{slug}`

The run controller expects GET for `readonly: true`, DELETE for destructive and
idempotent abilities, and POST otherwise. Wrong methods return 405. List/get
require an authenticated user with `read`; run also enforces the ability's
permission callback. Inspect `WP_REST_Abilities_V1_*_Controller` on the target
core version if a package or handbook disagrees.

REST responses omit internal schema keys such as `sanitize_callback`,
`validate_callback`, and `arg_options`. Express public constraints using JSON
Schema keywords.

In WordPress 7.1 the collection route supports `page` (minimum 1), `per_page`
(1-100, default 50), `category`, `namespace`, and `meta`. It always forces the
internal `show_in_rest => true` match. It sends `X-WP-Total`,
`X-WP-TotalPages`, and pagination links; `HEAD` returns an empty body with the
same collection headers. Use `rest_abilities_collection_params` to declare the
schema for custom meta query fields before expecting query-string coercion.

The 7.1 run controller coerces already-valid GET/DELETE query input into the
ability's schema types. It deliberately leaves invalid input unchanged so
validation rejects it instead of sanitization silently making it valid. POST
reads `input` from the JSON body; GET/DELETE read it from the query string.

## Public exposure flags

```php
'meta' => array(
    'public'       => true,
    'show_in_rest' => false,
),
```

WordPress 7.1 resolves REST exposure in this order:

1. explicit `show_in_rest`;
2. `public` as its default;
3. false.

`public` communicates broad client-facing intent for REST, MCP, AI, and future
channels; it is not authorization and does not force every adapter to expose
the ability. An explicit channel flag can narrow or broaden one channel.

## Filtered server discovery

WordPress 7.1 accepts filters in `wp_get_abilities()`:

```php
$abilities = wp_get_abilities(
    array(
        'category'  => 'myplugin-actions',
        'namespace' => 'myplugin',
        'meta'      => array(
            'public'      => true,
            'annotations' => array( 'readonly' => true ),
        ),
        'item_include_callback' => static fn ( WP_Ability $ability ): bool =>
            current_user_can( 'read' ),
        'result_callback' => static fn ( array $items ): array =>
            array_slice( $items, 0, 20, true ),
    )
);
```

Category, namespace, and meta use AND logic. Nested meta arrays are matched
recursively and scalar values strictly. Results stay keyed by ability name
unless a callback reshapes them. The pipeline order is declarative filters,
caller item callback, `wp_get_abilities_item_include`, caller result callback,
then `wp_get_abilities_result`. Ecosystem filters fire even for a no-argument
call. Use the registry's raw getter only when deliberately bypassing all of
those policies.

## WordPress 7.1 execution lifecycle

The exact `WP_Ability::execute()` order is:

1. `wp_ability_invoked` receives raw input for every attempt.
2. `wp_pre_execute_ability` may short-circuit everything below.
3. schema default normalization, then `wp_ability_normalize_input`.
4. schema validation, then `wp_ability_validate_input`.
5. permission callback, then `wp_ability_permission_result`.
6. `wp_before_execute_ability`.
7. execute callback, then `wp_ability_execute_result`.
8. schema validation, then `wp_ability_validate_output`.
9. `wp_after_execute_ability`.

`wp_pre_execute_ability` receives a unique `WP_Filter_Sentinel`. Return that
exact value to continue; any different value—including `null` or `false`—is a
final result and bypasses input/output validation and permission checks. Use it
only in trusted server code, and enforce equivalent authorization and result
integrity when caching or mocking.

Normalization can return `WP_Error`. Validation filters receive `true` or the
core `WP_Error`; return `false` for a generic invalid error or a non-empty
`WP_Error` for a specific failure. Permission filtering coerces unexpected
types to denial. The result filter can recover from an execution `WP_Error` or
convert success into an error. Before/after actions now receive the
`WP_Ability` object; old callbacks must keep their accepted-argument count
compatible.

REST dispatch runs normalization/validation/permission before the callback and
`execute()` runs them again. Those stages must therefore be deterministic,
read-only, and safe to repeat.

## Client-safe JSON Schema

Use `wp_prepare_json_schema_for_client( $schema )` before passing a
WordPress-authored schema to browsers or AI providers. The default `draft-04`
profile preserves a broader draft-04 vocabulary; pass `rest-api` for the
historical REST subset. It recursively strips unapproved/PHP callback keys,
converts per-property `required: true` to the parent draft-04 `required` array,
and emits an empty object default as an object instead of an empty JSON array.

`wp_get_json_schema_allowed_keywords()` can be filtered, but exposing a keyword
does not make WordPress validate or sanitize it. Keep the server contract within
the validator's supported subset.

## Server abilities in JavaScript

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_script_module( '@wordpress/core-abilities' );
} );
```

```js
const { ready } = await import( '@wordpress/core-abilities' );
const { executeAbility } = await import( '@wordpress/abilities' );

await ready;
const result = await executeAbility( 'myplugin/site-info' );
```

## Client-only abilities

Enqueue `@wordpress/abilities`, import functions from the module rather than a
global, and register the category first.

```js
const {
    registerAbility,
    registerAbilityCategory,
    executeAbility,
} = await import( '@wordpress/abilities' );

registerAbilityCategory( 'myplugin-actions', {
    label: 'My Plugin Actions',
    description: 'Actions provided by My Plugin.',
} );

registerAbility( {
    name: 'myplugin/navigate-to-settings',
    label: 'Navigate to Settings',
    description: 'Navigates to the plugin settings screen.',
    category: 'myplugin-actions',
    permissionCallback: () => true,
    callback: async () => {
        window.location.href = '/wp-admin/options-general.php?page=myplugin';
        return { success: true };
    },
    output_schema: {
        type: 'object',
        properties: { success: { type: 'boolean' } },
        required: [ 'success' ],
    },
} );
```

`executeAbility()` validates input and output. A client permission callback
only governs local execution; server abilities still require PHP authorization.

## Correct common failures

```php
// Register on the API hook, after its category exists.
add_action( 'wp_abilities_api_init', static function (): void {
    wp_register_ability( 'myplugin/do-thing', array(
        'label'               => __( 'Do thing', 'myplugin' ),
        'description'         => __( 'Runs a defined plugin operation.', 'myplugin' ),
        'category'            => 'myplugin-actions',
        'input_schema'        => array(
            'type'       => 'object',
            'properties' => array( 'post_id' => array( 'type' => 'integer' ) ),
            'required'   => array( 'post_id' ),
        ),
        'output_schema'       => array( 'type' => 'object' ),
        'execute_callback'    => 'myplugin_do_thing',
        'permission_callback' => static function ( array $input ): bool {
            return current_user_can( 'edit_post', $input['post_id'] );
        },
    ) );
} );
```

Avoid `init`, unregistered categories, empty descriptions, missing schemas,
generic namespaces such as `tools/*`, unconditional access to privileged
writes, and exposing every registered ability to an AI resolver.
