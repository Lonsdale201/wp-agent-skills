---
name: lw-site-manager-extend-abilities
description: >-
  Add companion-plugin abilities to LW Site Manager 1.5.x through
  lw_site_manager_register_categories and lw_site_manager_register_abilities.
  Covers namespaces, REST and MCP exposure metadata, PermissionManager,
  object-level authorization, schemas, annotations, WP_Error failure contracts,
  and service-layer registration. Use when a plugin should expose its own
  operations through the Site Manager Abilities or MCP surface. Use
  lw-site-manager-overview when consuming existing abilities.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-site-manager"
  wp-skills-plugin-version-tested: "1.5.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# Extend LW Site Manager with companion abilities

Register a companion plugin's operations through LW Site Manager's two action hooks. Keep the companion's domain logic in its own service classes and expose only stable, capability-checked operations.

## Extension hooks

| Hook | Arguments | Purpose |
|---|---:|---|
| `lw_site_manager_register_categories` | 0 | Register ability categories before abilities reference them. |
| `lw_site_manager_register_abilities` | 1 | Register abilities; receives the central `PermissionManager`. |

Attach handlers before `wp_abilities_api_init` runs. A normal plugin bootstrap on `plugins_loaded` is early enough.

```php
use LightweightPlugins\SiteManager\Abilities\PermissionManager;

add_action( 'lw_site_manager_register_categories', 'acme_register_categories' );
add_action( 'lw_site_manager_register_abilities', 'acme_register_abilities', 10, 1 );

function acme_register_categories(): void {
	wp_register_ability_category(
		'acme-newsletter',
		[
			'label'       => __( 'Newsletter', 'acme-newsletter' ),
			'description' => __( 'Newsletter management operations.', 'acme-newsletter' ),
		]
	);
}

function acme_register_abilities( PermissionManager $permissions ): void {
	wp_register_ability(
		'acme-newsletter/list-subscribers',
		[
			'label'               => __( 'List subscribers', 'acme-newsletter' ),
			'description'         => __( 'List newsletter subscribers.', 'acme-newsletter' ),
			'category'            => 'acme-newsletter',
			'input_schema'        => Acme\Abilities\Schemas::list_input(),
			'output_schema'       => Acme\Abilities\Schemas::subscriber_list(),
			'execute_callback'    => [ Acme\Services\Subscribers::class, 'list' ],
			'permission_callback' => $permissions->callback( 'can_manage_options' ),
			'meta'                => [
				'show_in_rest' => true,
				'annotations'  => [
					'readonly'    => true,
					'destructive' => false,
					'idempotent'  => true,
				],
				'mcp' => [
					'public' => true,
					'type'   => 'tool',
				],
			],
		]
	);
}
```

## Own the namespace

Use the companion plugin's namespace, such as `lw-cookie/*` or `acme-newsletter/*`. This prevents collisions and makes ownership visible in discovery.

LW Site Manager automatically adds MCP metadata only to `site-manager/*`. A foreign namespace must set:

```php
'mcp' => [
	'public' => true,
	'type'   => 'tool',
],
```

`show_in_rest => true` and `mcp.public => true` solve different problems. The first exposes the ability through the WordPress Abilities REST API. The second lets the built-in MCP server discover it.

Do not borrow `site-manager/*` merely to gain automatic MCP exposure. Use explicit metadata and retain namespace ownership.

## PermissionManager is the baseline

Reuse the central manager where its primitive capability matches the operation:

| Method | Capability or rule |
|---|---|
| `can_manage_updates` | `update_plugins` and `update_themes` |
| `can_install_plugins` | `install_plugins` |
| `can_install_themes` | `install_themes` |
| `can_manage_plugins` | `activate_plugins` |
| `can_manage_themes` | `switch_themes` |
| `can_manage_backups`, `can_manage_database`, `can_manage_cache`, `can_manage_options` | `manage_options` |
| `can_view_health` | `view_site_health_checks` |
| `can_manage_users` | `list_users` |
| `can_create_users`, `can_edit_users`, `can_delete_users` | matching user capability |
| content/media/taxonomy methods | matching primitive capability |

The registration callback cannot authorize a target object it has not seen. Apply the object's meta capability inside the execute callback:

```php
public static function update( array $input ): array|WP_Error {
	$post_id = (int) ( $input['id'] ?? 0 );

	if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
		return new WP_Error(
			'forbidden_post',
			__( 'You cannot edit this post.', 'acme-newsletter' ),
			[ 'status' => 403 ]
		);
	}

	// Validate the requested transition, then mutate.
}
```

Use WooCommerce meta capabilities and CRUD objects for orders and products. A primitive `edit_posts` check is not order authorization.

## Build truthful schemas

Define every accepted input and every returned field. Keep `required` at the object schema level:

```php
'input_schema' => [
	'type'       => 'object',
	'properties' => [
		'id' => [
			'type'    => 'integer',
			'minimum' => 1,
		],
		'status' => [
			'type' => 'string',
			'enum' => [ 'draft', 'ready', 'sent' ],
		],
	],
	'required'             => [ 'id', 'status' ],
	'additionalProperties' => false,
],
```

If a client depends on a field, include it in `output_schema`. WordPress validates output; drift becomes a runtime failure instead of an undocumented response.

The plugin's `AbstractAbilitiesRegistrar` currently offers protected helpers such as `readOnlyMeta()`, `writeMeta()`, `destructiveMeta()`, `listingSchema()`, `idSchema()`, `listOutputSchema()`, and `entityOutputSchema()`. Subclass it only when the companion explicitly depends on LW Site Manager 1.5.x. It is an internal implementation class, so re-verify it on every version bump. A local schema/meta builder creates a looser dependency.

## Mark annotations by behavior

| Annotation | Set true when |
|---|---|
| `readonly` | The operation does not mutate state or trigger external effects. |
| `destructive` | It can remove data, send irreversible messages, charge/refund, restore over state, or otherwise cause hard-to-reverse effects. |
| `idempotent` | Repeating the same request produces the same intended state without duplicate side effects. |

Examples:

- list/get: readonly, non-destructive, idempotent;
- create: write, non-destructive, usually non-idempotent;
- set an existing resource to an exact value: write, often idempotent;
- send campaign or email: write, destructive/external, non-idempotent;
- delete by stable ID: destructive and often idempotent, provided repeated deletion is a clean no-op.

Do not call a scanner or outbound probe readonly merely because it does not change WordPress content. Network traffic, refreshed scan state, and rate-limit consumption are side effects.

## Return errors that transports understand

Return `WP_Error` for a failed whole operation:

```php
return new WP_Error(
	'newsletter_send_failed',
	__( 'The campaign could not be queued.', 'acme-newsletter' ),
	[ 'status' => 500 ]
);
```

Do not return `[ 'success' => false ]` with HTTP 200 for a hard failure. REST clients and MCP agents can otherwise misread the transport as successful.

For a batch, return a normal result when part of the batch completed. Include processed IDs and failed IDs, and make the output schema match those types exactly.

## Keep registrars thin

The registrar should describe the interface. Put validation, object authorization, transactions, and domain logic in a service:

```php
'execute_callback' => [ Acme\Services\Campaigns::class, 'send' ],
```

The service should:

1. normalize and validate input;
2. authorize the specific target;
3. check current state and transition rules;
4. perform the operation once;
5. return a schema-conforming result or `WP_Error`.

## Verify the integration

Check all relevant surfaces after implementation:

1. The category and ability appear in the live Abilities registry.
2. The REST metadata endpoint shows the declared input/output schemas.
3. An allowed user can execute the ability; a lower role cannot.
4. Object-level denial works against another user's private object.
5. A hard failure becomes a non-2xx REST response and an MCP error.
6. If MCP exposure is intended, discovery includes the foreign namespace.
7. Readonly, destructive, and idempotent annotations match observed behavior.

## Cross-references

- Use `lw-site-manager-overview` for MCP state, domain lock, authentication, adapter diagnostics, and consumer calls.
- Use `wp-abilities-api` for the WordPress core registration lifecycle and schema rules.
- Use `wp-security-audit` for nonce, capability, input, output, SQL, file, and remote-request review of the companion implementation.
- Follow the plugin's `docs/extending-skills.md` separately when adding runtime skill sources; ability registration and skill-source registration are different contracts.

## References

- Plugin repository: <https://github.com/lwplugins/lw-site-manager>
- Official extension guide: <https://github.com/lwplugins/lw-site-manager/blob/main/docs/extending-abilities.md>
- MCP exposure rules: <https://github.com/lwplugins/lw-site-manager/blob/main/docs/mcp-server.md>
- Verified source paths:
  - `lw-site-manager.php`
  - `src/Abilities/Registrar.php`
  - `src/Abilities/PermissionManager.php`
  - `src/Abilities/Registrars/AbstractAbilitiesRegistrar.php`
  - `src/Mcp/AbilityExposer.php`
