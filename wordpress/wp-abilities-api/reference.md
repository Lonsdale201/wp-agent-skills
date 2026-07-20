# Abilities API REST and JavaScript Reference

Read this after the main skill when implementing REST discovery or client-side
abilities on WordPress 7.0.x.

## REST routes

With `meta.show_in_rest = true`, core exposes:

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
