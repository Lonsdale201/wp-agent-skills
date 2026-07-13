---
name: lw-site-manager-extend-abilities
description: Add custom abilities to the LW Site Manager hub via its extension contract — two action hooks (lw_site_manager_register_categories for category labels, lw_site_manager_register_abilities for the abilities themselves; the second receives the PermissionManager so external abilities reuse the typed cap-check methods). Pattern — extend AbstractAbilitiesRegistrar to inherit the meta builders (readOnlyMeta / writeMeta / destructiveMeta) and schema builders (paginationSchema/orderingSchema/idSchema/listOutputSchema/entityOutputSchema/successOutputSchema/bulkResultSchema/updateResultSchema). Don't bypass — meta annotations (readonly / destructive / idempotent) are how AI agents reason about ability safety; inconsistent helpers make the hub surface heterogeneous. The plugin emits NO filters; it's additively extensible only. Use when shipping a companion plugin that adds site-manager/* abilities. Triggers on lw_site_manager_register_abilities, lw_site_manager_register_categories, AbstractAbilitiesRegistrar.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-site-manager"
  wp-skills-plugin-version-tested: "1.1.22"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-04-29"
---

# LW Site Manager: extending with custom abilities

For developers shipping a companion plugin that adds abilities to the LW Site Manager hub — without forking, without registering a parallel namespace. The plugin exposes a small but precise extension contract: two action hooks plus a reusable abstract registrar. Done right, your custom abilities appear seamlessly in the hub's catalog with consistent meta annotations and capability checks; done wrong, they look like an unrelated plugin that happens to share a prefix.

## Misconception this skill corrects

> "I'll just call `wp_register_ability('site-manager/my-thing', [...])` directly on `wp_abilities_api_init` — same outcome."

It registers the ability, yes. But it bypasses the plugin's central infrastructure:

1. **No shared `PermissionManager`** — your `permission_callback` is some inline `current_user_can('edit_posts')` rather than the typed `$permissions->callback('can_edit_posts')`. When WP shifts a capability mapping (rare but happens — comment editing migrated cap), every ability that called `current_user_can` directly needs its own update; abilities routed through `PermissionManager` get the fix in one place.
2. **No `AbstractAbilitiesRegistrar` helpers** — meta annotations (`readonly` / `destructive` / `idempotent`) and output envelope shapes (success / list / entity / bulk-result / update-result) become whatever you remembered to build by hand. Surface looks heterogeneous to AI agents; some abilities tag `readonly: true` for read endpoints, yours doesn't, agent doesn't realize a "list" is safe to retry.
3. **Wrong category** — if you forget `category` or set one the plugin's category map doesn't recognize, the ability registers but doesn't appear in the plugin's grouped admin UI / catalog views.

The contract is two action hooks + one abstract class to extend. Verified at:

- `lw_site_manager_register_categories` action — [lw-site-manager.php:232](lw-site-manager.php). Fires inside the plugin's category-init hook AFTER its own categories register, so external categories don't collide with built-in ones.
- `lw_site_manager_register_abilities` action — [src/Abilities/Registrar.php:48](Registrar.php). Fires AFTER the plugin's own four registrars run, with the `PermissionManager` instance as the only argument: `do_action( 'lw_site_manager_register_abilities', $this->permissions );`.

Other AI-prone misconceptions:

- "I'll add a filter to mutate one of the built-in abilities' inputs." Wrong — the plugin emits zero filters (verified by grepping the source). Built-in abilities are not interceptable from this plugin's contract; use the WP Abilities API's general lifecycle filters (`ability_*` family) if available, or wrap the ability call site-side.
- "I should add abilities under MY OWN namespace (`my-plugin/foo`) instead of `site-manager/`." That's also valid, but it doesn't show up in the LW Site Manager catalog/UI and AI agents discovering through the hub's surface won't find them. The two-namespace question is "do I want the hub UX or not?" — pick `site-manager/*` to live in the hub.
- "The PermissionManager is private; I'll roll my own." It's `public` and explicitly passed as the action argument because external use is the design intent. Read the `callback($methodName)` helper at [PermissionManager.php:277](PermissionManager.php) — that's the canonical way.

## When to use this skill

Trigger when ANY of the following is true:

- A diff calls `add_action( 'lw_site_manager_register_abilities', ... )` or `lw_site_manager_register_categories`.
- Adding `extends AbstractAbilitiesRegistrar` (or an inheritance chain reaching it).
- A user / PR plans to ship a companion plugin that adds `site-manager/*` abilities.
- Reviewing a PR that hand-rolls `wp_register_ability` for the `site-manager/` namespace without using the helpers.

## Workflow

### 1. Bootstrap your companion plugin

```php
add_action( 'lw_site_manager_register_categories', 'mycompanion_register_categories' );
add_action( 'lw_site_manager_register_abilities',  'mycompanion_register_abilities', 10, 1 );

function mycompanion_register_categories(): void {
    wp_register_ability_category(
        'mycompanion-newsletter',
        [
            'label'       => __( 'Newsletter', 'mycompanion' ),
            'description' => __( 'Newsletter subscriber and campaign abilities.', 'mycompanion' ),
        ]
    );
}

function mycompanion_register_abilities( \LightweightPlugins\SiteManager\Abilities\PermissionManager $permissions ): void {
    ( new \MyCompanion\Abilities\NewsletterAbilitiesRegistrar( $permissions ) )->register();
}
```

The `register_categories` callback runs at category-init time. The `register_abilities` callback fires AFTER the four built-in registrars, with `PermissionManager` as the argument.

### 2. Extend `AbstractAbilitiesRegistrar`

Mirror the plugin's own registrar pattern at [src/Abilities/Registrars/](Registrars/):

```php
namespace MyCompanion\Abilities;

use LightweightPlugins\SiteManager\Abilities\PermissionManager;
use LightweightPlugins\SiteManager\Abilities\Registrars\AbstractAbilitiesRegistrar;

class NewsletterAbilitiesRegistrar extends AbstractAbilitiesRegistrar
{
    public function register(): void
    {
        $this->register_list_subscribers();
        $this->register_create_subscriber();
        $this->register_send_campaign();
    }

    private function register_list_subscribers(): void
    {
        wp_register_ability(
            'site-manager/newsletter-list-subscribers',
            [
                'label'       => __( 'List Newsletter Subscribers', 'mycompanion' ),
                'description' => __( 'List newsletter subscribers with filters and pagination.', 'mycompanion' ),
                'category'    => 'mycompanion-newsletter',
                'input_schema' => [
                    'type'       => 'object',
                    'default'    => [],
                    'properties' => array_merge(
                        $this->listingSchema( defaultLimit: 50, defaultBy: 'created_at', defaultOrder: 'DESC' ),
                        $this->searchSchema(),
                        $this->statusSchema( allowed: [ 'all', 'active', 'unsubscribed' ], default: 'active' ),
                    ),
                ],
                'output_schema'       => $this->listOutputSchema( 'subscribers', $this->subscriberSchema() ),
                'execute_callback'    => [ \MyCompanion\Services\NewsletterManager::class, 'list_subscribers' ],
                'permission_callback' => $this->permissions->callback( 'can_manage_options' ),
                'meta'                => $this->readOnlyMeta( idempotent: true ),
            ]
        );
    }

    private function register_create_subscriber(): void
    {
        wp_register_ability(
            'site-manager/newsletter-create-subscriber',
            [
                'label'       => __( 'Create Subscriber', 'mycompanion' ),
                'description' => __( 'Add a new newsletter subscriber.', 'mycompanion' ),
                'category'    => 'mycompanion-newsletter',
                'input_schema' => [
                    'type'       => 'object',
                    'default'    => [],
                    'properties' => [
                        'email' => [ 'type' => 'string', 'required' => true ],
                        'name'  => [ 'type' => 'string' ],
                    ],
                ],
                'output_schema'       => $this->entityOutputSchema( 'subscriber', $this->subscriberSchema() ),
                'execute_callback'    => [ \MyCompanion\Services\NewsletterManager::class, 'create_subscriber' ],
                'permission_callback' => $this->permissions->callback( 'can_manage_options' ),
                'meta'                => $this->writeMeta( idempotent: false ),
            ]
        );
    }

    private function register_send_campaign(): void
    {
        wp_register_ability(
            'site-manager/newsletter-send-campaign',
            [
                'label'       => __( 'Send Campaign', 'mycompanion' ),
                'description' => __( 'Trigger a newsletter campaign send. Cannot be undone.', 'mycompanion' ),
                'category'    => 'mycompanion-newsletter',
                'input_schema' => [
                    'type'       => 'object',
                    'default'    => [],
                    'properties' => [
                        'campaign_id' => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
                    ],
                ],
                'output_schema'       => $this->successOutputSchema(),
                'execute_callback'    => [ \MyCompanion\Services\NewsletterManager::class, 'send_campaign' ],
                'permission_callback' => $this->permissions->callback( 'can_manage_options' ),
                'meta'                => $this->destructiveMeta( idempotent: false ),
            ]
        );
    }

    private function subscriberSchema(): array
    {
        return [
            'type'       => 'object',
            'default'    => [],
            'properties' => [
                'id'         => [ 'type' => 'integer' ],
                'email'      => [ 'type' => 'string' ],
                'name'       => [ 'type' => 'string' ],
                'status'     => [ 'type' => 'string' ],
                'created_at' => [ 'type' => 'string' ],
            ],
        ];
    }
}
```

This earns:

- Consistent meta annotations (read-only list with `idempotent: true`, destructive send with `destructive: true`) so AI agents can correctly reason about retry safety and risk.
- Consistent output envelope shapes (`listOutputSchema` with `total` / `total_pages` / `has_more`; `entityOutputSchema` with `success` / `message` / entity body; `successOutputSchema` with `success` / `message`).
- Consistent input schemas (pagination / ordering / status / search via the helper builders).
- Centralized permission routing — `$this->permissions->callback('can_manage_options')` instead of inline `current_user_can`.

### 3. Inherited helpers — verified API

From [src/Abilities/Registrars/AbstractAbilitiesRegistrar.php](AbstractAbilitiesRegistrar.php):

**Meta builders (lines 38-77):**

```php
$this->buildMeta( readonly: false, destructive: false, idempotent: false )   // raw, full control
$this->readOnlyMeta( idempotent: true )                                      // for reads (default idempotent: true)
$this->writeMeta( idempotent: false )                                        // for non-destructive writes
$this->destructiveMeta( idempotent: true )                                   // for destructive ops (default idempotent: true — common for "delete X by id")
```

Each returns:

```php
[
    'show_in_rest' => true,
    'annotations'  => [
        'readonly'    => bool,
        'destructive' => bool,
        'idempotent'  => bool,
    ],
]
```

**Schema builders (lines 89-188):**

| Helper | Returns | Use for |
|---|---|---|
| `paginationSchema(int $defaultLimit = 20)` | `limit` + `offset` properties | Lists |
| `orderingSchema(string $defaultBy = 'date', string $defaultOrder = 'DESC', array $allowedBy = [])` | `orderby` + `order` properties | Lists |
| `listingSchema(int $defaultLimit = 20, string $defaultBy = 'date', string $defaultOrder = 'DESC')` | both above merged | Most lists |
| `statusSchema(array $allowed, string $default = 'any')` | `status` enum property | Filtered lists |
| `searchSchema()` | `search` string property | Searchable lists |
| `idSchema(string $description = 'Item ID', bool $required = true)` | `id` integer >=1 | Get / update / delete |
| `slugSchema(string $description = 'Item slug')` | `slug` string | Slug-keyed lookups |

**Output envelope builders (lines 200-306):**

| Helper | Output shape |
|---|---|
| `successOutputSchema(array $additionalProperties = [])` | `{success, message, ...$additionalProperties}` |
| `listOutputSchema(string $key, array $itemSchema)` | `{$key: [items], total, total_pages, limit, offset, has_more}` |
| `entityOutputSchema(string $key, array $entitySchema)` | `{success, message, $key: entity}` |
| `updateResultSchema()` | `{success, message, old_version, new_version, php_errors}` |
| `bulkResultSchema()` | `{success, action, processed, failed, total, success_ids, failed_ids, message}` |

### 4. Use the central `PermissionManager`

```php
// In your ability registration:
'permission_callback' => $this->permissions->callback( 'can_manage_options' ),
```

`PermissionManager::callback($method)` ([src/Abilities/PermissionManager.php:277](PermissionManager.php)) returns `[$this, $method]` — a standard PHP callable for the WP Abilities API.

Available cap-check methods (verified):

| Method | Caps required |
|---|---|
| `can_manage_updates` | `update_plugins` AND `update_themes` |
| `can_install_plugins` | `install_plugins` |
| `can_install_themes` | `install_themes` |
| `can_manage_plugins` | `activate_plugins` |
| `can_manage_themes` | `switch_themes` |
| `can_manage_backups` | `manage_options` |
| `can_view_health` | `view_site_health_checks` |
| `can_manage_database` / `_cache` / `_options` | `manage_options` |
| `can_manage_users` | `list_users` |
| `can_create_users` / `can_edit_users` / `can_delete_users` | `create_users` / `edit_users` / `delete_users` |
| `can_edit_posts` / `can_publish_posts` / `can_delete_posts` / `can_edit_others_posts` | corresponding caps |
| `can_edit_pages` / `can_publish_pages` / `can_delete_pages` / `can_edit_others_pages` | corresponding caps |
| `can_moderate_comments` / `can_edit_comments` | `moderate_comments` / `edit_posts` |
| `can_upload_files` | `upload_files` |
| `can_manage_categories` / `can_manage_tags` | `manage_categories` |
| `has_any_capability(array $caps)` | OR of caps |
| `has_all_capabilities(array $caps)` | AND of caps |

If your ability needs a cap not in this map (e.g. `manage_woocommerce`), you can either:

1. Pass an inline closure: `'permission_callback' => static fn (): bool => current_user_can('manage_woocommerce')`. Loses central updateability but works.
2. Add a method to your own subclass / wrapper that delegates: `static fn (): bool => current_user_can('manage_woocommerce')`. Same result, slightly cleaner.
3. Use `has_any_capability(['manage_woocommerce', 'manage_options'])` for OR semantics.

### 5. Choose the right meta annotation

The `readonly` / `destructive` / `idempotent` triple is how AI agents reason about safety:

| Annotation | Meaning | When true |
|---|---|---|
| `readonly` | Doesn't mutate state | List / get / health-check / error-log |
| `destructive` | Loses data; cannot be undone trivially | Delete / send-email / restore-backup |
| `idempotent` | Repeat calls produce the same result | Reads, Set-X-to-Y, deletes (already-deleted is no-op) |

Some examples from the plugin's own usage:

- `site-manager/list-posts` → `readOnlyMeta(idempotent: true)` — read, repeat-safe.
- `site-manager/create-post` → `writeMeta(idempotent: false)` — each call creates a new post; not idempotent.
- `site-manager/delete-post` → `destructiveMeta(idempotent: true)` — destructive, but a second delete of the same ID is a no-op (idempotent in the resource sense).
- `site-manager/update-core` → `destructiveMeta(idempotent: false)` — major version upgrade isn't undoable; not idempotent because the post-state depends on what's available at call time.

Get this right: AI agents calling abilities with `idempotent: true` will retry on transient errors automatically; calling `idempotent: false` ones, they ask the user before retrying. Mislabeling causes safety regressions.

### 6. Service layer (optional but recommended)

Mirror the plugin's [src/Services/](Services/) pattern: put the actual logic in a service class, register the `execute_callback` as `[ServiceClass::class, 'method']`. Keeps registrars thin and services testable.

```php
namespace MyCompanion\Services;

class NewsletterManager
{
    public static function list_subscribers( array $input ): array
    {
        // ... query, paginate, return list-output-shape
        return [
            'subscribers' => $subscribers,
            'total'       => $total,
            'total_pages' => $pages,
            'limit'       => $input['limit'],
            'offset'      => $input['offset'],
            'has_more'    => ( $input['offset'] + $input['limit'] ) < $total,
        ];
    }

    public static function create_subscriber( array $input ): array
    {
        // ... insert, return entity-output-shape
        return [
            'success'    => true,
            'message'    => __( 'Subscriber created.', 'mycompanion' ),
            'subscriber' => $subscriberArray,
        ];
    }

    public static function send_campaign( array $input ): array
    {
        // ... dispatch, return success-output-shape
        return [
            'success' => true,
            'message' => sprintf( __( 'Campaign #%d queued.', 'mycompanion' ), $input['campaign_id'] ),
        ];
    }
}
```

### 7. Document your abilities

If you ship abilities under `site-manager/*` for the hub, add a markdown doc per ability under your own plugin's `docs/abilities/` (mirror the LW Site Manager `docs/abilities/` structure). Consumers / AI agents discovering the hub catalog can then find your ability docs alongside the built-in ones.

## Critical rules

- **Two action hooks, one abstract class.** `lw_site_manager_register_categories` for categories; `lw_site_manager_register_abilities` for abilities (gets `PermissionManager` instance); extend `AbstractAbilitiesRegistrar` for the helpers.
- **Use `$permissions->callback('can_X')` for permission checks** — not inline `current_user_can` — to keep the plugin's central permission map authoritative.
- **Use the helper builders for meta and schemas.** `readOnlyMeta` / `writeMeta` / `destructiveMeta` for annotations; `paginationSchema` / `idSchema` / `listOutputSchema` / `entityOutputSchema` / `successOutputSchema` / `bulkResultSchema` for shapes.
- **Pick the right `readonly` / `destructive` / `idempotent` triple.** AI agents use it for retry / undo / risk-warning logic. Mislabeling causes safety regressions.
- **Register category labels in `lw_site_manager_register_categories`** before the abilities reference them — otherwise the ability's `category` field points to a label-less slug and the admin grouping shows the raw slug.
- **Use `site-manager/` namespace** for abilities you want in the hub catalog. Use your own namespace if you want a separate surface.
- **Service layer separates registration from logic.** Registrar is a thin shell; `execute_callback` points at a service class method.
- **The plugin emits NO filter hooks** — additive extension only. To intercept built-in abilities, use the WP Abilities API's general lifecycle filters (out of scope for this plugin's contract).
- **PHP 8.2 and WP 6.9** — the plugin's binding requirements; your companion must match.
- **Don't subclass `PermissionManager`** to add methods — instead, pass your own callable via `permission_callback`. Subclassing breaks if the base class changes signatures.

## Common mistakes

```php
// WRONG — registering ability outside the hook (bypasses PermissionManager)
add_action( 'wp_abilities_api_init', function () {
    wp_register_ability( 'site-manager/my-thing', [
        'category'            => 'maintenance',
        'permission_callback' => static fn () => current_user_can( 'manage_options' ),
        'meta'                => [ 'show_in_rest' => true ],
        // (forgot annotations — AI agents see ability with no readonly/destructive/idempotent hints)
        // ...
    ] );
} );

// RIGHT — through the plugin's hook + AbstractAbilitiesRegistrar
add_action( 'lw_site_manager_register_abilities', function ( $permissions ) {
    ( new MyRegistrar( $permissions ) )->register();
} );

// WRONG — inline cap check
'permission_callback' => static fn () => current_user_can( 'manage_options' ),

// RIGHT — through the central PermissionManager
'permission_callback' => $this->permissions->callback( 'can_manage_options' ),

// WRONG — unannotated meta (or only show_in_rest)
'meta' => [ 'show_in_rest' => true ],
// AI agent calling this can't tell if it's safe to retry / undo / parallelize.

// RIGHT — explicit annotations via the helpers
'meta' => $this->readOnlyMeta( idempotent: true ),

// WRONG — destructive marked as readonly (or vice versa)
'meta' => $this->readOnlyMeta(),  // for an ability that calls wp_delete_post()
// AI agent treats it as safe-to-retry; multiple retries delete the post once and silently succeed
// for the next N retries (which IS technically idempotent, but the readonly: true is a lie).

// RIGHT
'meta' => $this->destructiveMeta( idempotent: true ),

// WRONG — registering category in register_abilities action
add_action( 'lw_site_manager_register_abilities', function () {
    wp_register_ability_category( 'mycompanion-newsletter', [/* ... */] );  // WRONG: wrong hook
    // category-init has already passed; this fails or fires too late.
} );

// RIGHT — categories in their own hook
add_action( 'lw_site_manager_register_categories', function () {
    wp_register_ability_category( 'mycompanion-newsletter', [/* ... */] );
} );

// WRONG — using a category that doesn't exist
'category' => 'mycompanion-newsletter',  // forgot to register the category
// Ability registers but admin grouping shows the raw slug as the label.

// RIGHT — register categories first

// WRONG — bypassing the helpers and hand-rolling pagination schema
'input_schema' => [
    'properties' => [
        'page'     => [ 'type' => 'integer' ],
        'per_page' => [ 'type' => 'integer' ],
    ],
],
// Inconsistent with other hub abilities which use limit/offset (the plugin's convention).

// RIGHT — use listingSchema()
'input_schema' => [
    'type'       => 'object',
    'default'    => [],
    'properties' => $this->listingSchema( defaultLimit: 50 ),
],

// WRONG — hand-rolled list output that doesn't match listOutputSchema's shape
return [
    'data'  => $items,
    'count' => $total,
];
// Consumer expects { items_key, total, total_pages, limit, offset, has_more }; gets a different shape.

// RIGHT — match the helper's output envelope
return [
    'subscribers' => $items,
    'total'       => $total,
    'total_pages' => (int) ceil( $total / $limit ),
    'limit'       => $limit,
    'offset'      => $offset,
    'has_more'    => ( $offset + $limit ) < $total,
];

// WRONG — calling the action handler at the wrong priority / with wrong args
add_action( 'lw_site_manager_register_abilities', 'my_register' );
function my_register() { /* ... */ }   // forgot the $permissions argument

// RIGHT — accept the PermissionManager arg
add_action( 'lw_site_manager_register_abilities', 'my_register', 10, 1 );
function my_register( \LightweightPlugins\SiteManager\Abilities\PermissionManager $permissions ) {
    // ...
}
```

## Cross-references

- Run **`lw-site-manager-overview`** for the plugin-level reference (calling pattern, ability catalog, authentication).
- Run **`wp-abilities-api`** for the underlying WP Abilities API mechanics — `wp_register_ability`, JSON Schema input/output, `WP_Ability::execute()`, REST run endpoint, MCP integration. LW Site Manager builds on top of that; this skill is the consumer-side wiring.
- Run **`wp-plugin-architecture`** for the broader plugin scaffolding patterns (PSR-4 autoload, singleton scope, hook registration timing).
- Run **`wp-i18n-audit`** for the text-domain rules on your custom ability `label` / `description` strings.

## What this skill does NOT cover

- **Intercepting / modifying built-in abilities.** The plugin emits no filters; built-in abilities are not interceptable from this plugin's contract. Use the WP Abilities API's general lifecycle filters if available, or wrap call sites externally.
- **MCP server registration.** Anthropic's MCP bridge for the WP Abilities API picks up your registered abilities automatically; no per-plugin MCP setup needed.
- **Custom REST routing for your abilities.** They go through `/wp-json/wp-abilities/v1/abilities/site-manager/{slug}/run` — the WP Abilities API's REST surface — automatically.
- **Cross-plugin permission coordination.** If two plugins ship companion abilities under `site-manager/*` with different capability requirements, conflicts are out of scope; coordinate via shared user roles.
- **Backwards compatibility with `WPSiteManager` namespace.** Pre-v1.1.0 the namespace was `WPSiteManager` (per CHANGELOG); current code uses `LightweightPlugins\SiteManager`. New companion plugins target the current.
- **Replacing the central `PermissionManager`.** The plugin instantiates one; you receive that instance. You can't swap in a different implementation; you can only delegate to it or supply your own callable.

## References

- Action hook for category registration: [wp-content/plugins/lw-site-manager/lw-site-manager.php:232](lw-site-manager.php) — `do_action( 'lw_site_manager_register_categories' );` fires after built-in category registrations.
- Action hook for ability registration: [wp-content/plugins/lw-site-manager/src/Abilities/Registrar.php:48](Registrar.php) — `do_action( 'lw_site_manager_register_abilities', $this->permissions );` fires after built-in registrars run.
- AbstractAbilitiesRegistrar: [src/Abilities/Registrars/AbstractAbilitiesRegistrar.php](AbstractAbilitiesRegistrar.php) — meta builders at lines 38-77, schema builders at 89-188, output envelope builders at 200-306.
- PermissionManager: [src/Abilities/PermissionManager.php](PermissionManager.php) — typed cap-check methods, `callback($method)` helper at line 277, `has_any_capability` / `has_all_capabilities` at lines 247-269.
- Reference registrar implementations: [src/Abilities/Registrars/UpdateAbilitiesRegistrar.php](UpdateAbilitiesRegistrar.php), [MaintenanceAbilitiesRegistrar.php](MaintenanceAbilitiesRegistrar.php), [UserAbilitiesRegistrar.php](UserAbilitiesRegistrar.php), [ContentAbilitiesRegistrar.php](ContentAbilitiesRegistrar.php).
- Reference definition (per-topic ability sets): [src/Abilities/Definitions/](Definitions/) — `PostAbilities`, `PageAbilities`, `CommentAbilities`, `MediaAbilities`, `MetaAbilities`, `SettingsAbilities`, `TaxonomyAbilities`, `WooCommerceAbilities`.
- Service layer pattern: [src/Services/](Services/) — `UpdateManager`, `BackupManager`, `CacheManager`, etc., each implementing one or more `execute_callback` static methods.
- Plugin GitHub: <https://github.com/lwplugins/lw-site-manager>.
- Official documentation: <https://developer.wordpress.org/apis/abilities-api/>
- Verified source paths:
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/PostAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/PageAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/CommentAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/MediaAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/MetaAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/SettingsAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/TaxonomyAbilities.php`
  - `wp-content/plugins/lw-site-manager/src/Abilities/Definitions/WooCommerceAbilities.php`
