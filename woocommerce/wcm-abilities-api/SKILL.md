---
name: wcm-abilities-api
description: WooCommerce Memberships 1.29+ WordPress Abilities API
  reference for membership plan, user membership, and per-post content
  restriction rule abilities, category slugs, registration requirements,
  permissions, schemas, annotations, REST route exposure, and safe
  automation guardrails. Use when code or a task mentions
  wp_register_ability, wp_get_ability, WP Abilities API,
  woocommerce-memberships/plans-create, plans-delete, plans-get,
  plans-list, user-memberships-create, user-memberships-delete,
  user-memberships-get, user-memberships-list,
  post-restriction-rules-get, post-restriction-rules-update,
  /wc-memberships/v1/post-restriction-rules, or privileged
  agent/headless/admin automation for WooCommerce Memberships.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-memberships"
  wp-skills-plugin-version-tested: "1.29.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-06"
---

# WooCommerce Memberships: Abilities API

Use this when building or reviewing privileged automation around Memberships plans, user memberships, and per-post content restriction rules through the WordPress Abilities API.

## Misconception this skill corrects

> "Memberships abilities are customer-facing REST endpoints for headless member dashboards."

They are privileged Abilities API operations. Plan and user-membership abilities check `manage_woocommerce`. The 1.29.0 post-restriction abilities check `manage_woocommerce_membership_plans`; the GET ability also reaches the trait's numeric `edit_post` check because its input is the post ID. The UPDATE ability input is an object/array, so add your own `edit_post` guard when wrapping it. Use these abilities for admin/editor/agent automation, not untrusted frontend flows.

## When to use this skill

Trigger when ANY of the following is true:

- The task mentions WordPress Abilities API, `wp_register_ability()`, `wp_get_ability()`, `wp_abilities_api_init`, or agent automation for Memberships.
- Code contains ability names beginning with `woocommerce-memberships/`.
- Code needs to create/list/get/delete Memberships plans or user memberships through an ability layer instead of direct PHP APIs.
- Code reads or writes `/wc-memberships/v1/post-restriction-rules/{id}` or uses the block editor Memberships sidebar restriction entity.
- You are deciding whether to use Memberships REST API, PHP APIs, or Abilities API.

## Registration facts

Memberships 1.28.0+ implements the SkyVerge framework `HasAbilitiesContract` in `WC_Memberships`. The framework initializes ability registration only when WordPress exposes both:

```php
function_exists( 'wp_register_ability' )
function_exists( 'wp_register_ability_category' )
```

On supported WordPress versions, the framework hooks:

| Hook | Purpose |
|---|---|
| `wp_abilities_api_categories_init` | Registers Memberships ability categories. |
| `wp_abilities_api_init` | Registers the abilities. |
| `rest_api_init` | Registers framework REST routes only for abilities with explicit `RestConfig`. In 1.29.0 this applies to the post-restriction rule GET/PUT abilities. |

Do not assume these abilities exist on older WordPress installs. In WP 7.0+ contexts, they should be available if Memberships is loaded and no site-level code disables the Abilities API.

## Categories

| Category slug | Meaning |
|---|---|
| `woocommerce-membership-plans` | Abilities related to `WC_Memberships_Membership_Plan`. |
| `woocommerce-user-memberships` | Abilities related to `WC_Memberships_User_Membership`. |
| `woocommerce-memberships-posts` | Abilities related to per-post membership restriction configuration. |

## Ability map

| Ability | Class | Permission | Annotation | Input |
|---|---|---|---|---|
| `woocommerce-memberships/plans-create` | `CreatePlan` | `manage_woocommerce` | write, non-destructive, non-idempotent | Plan object data. |
| `woocommerce-memberships/plans-delete` | `DeletePlan` | `manage_woocommerce` | destructive | Integer plan ID. |
| `woocommerce-memberships/plans-get` | `GetPlan` | `manage_woocommerce` | readonly, idempotent | Integer plan ID. |
| `woocommerce-memberships/plans-list` | `ListPlans` | `manage_woocommerce` | readonly, idempotent | WP_Query-like args for plans. |
| `woocommerce-memberships/user-memberships-create` | `CreateUserMembership` | `manage_woocommerce` | write, non-destructive, non-idempotent | `plan_id`, `user_id`, optional `product_id`, `order_id`. |
| `woocommerce-memberships/user-memberships-delete` | `DeleteUserMembership` | `manage_woocommerce` | destructive | Integer user membership ID. |
| `woocommerce-memberships/user-memberships-get` | `GetUserMembership` | `manage_woocommerce` | readonly, idempotent | Integer user membership ID. |
| `woocommerce-memberships/user-memberships-list` | `ListUserMemberships` | `manage_woocommerce` | readonly, idempotent | `user_id`, optional `status`. |
| `woocommerce-memberships/post-restriction-rules-get` | `GetPostRestrictionRules` | `manage_woocommerce_membership_plans` plus `edit_post` for direct integer input | readonly, idempotent | Integer post ID. |
| `woocommerce-memberships/post-restriction-rules-update` | `UpdatePostRestrictionRules` | `manage_woocommerce_membership_plans` in source; add `edit_post` in wrappers | write, non-destructive, idempotent | Object with `id` and replacement `rules`. |

Output schemas use the plugin object JSON schemas:

- `WC_Memberships_Membership_Plan::getJsonSchema()`
- `WC_Memberships_User_Membership::getJsonSchema()`
- `PostRestrictionRulesSerializer::getJsonSchema()`

## Plan creation input

`plans-create` delegates to `wc_memberships()->get_plans_instance()->createPlan( $data )`.

Important input groups:

| Input | Notes |
|---|---|
| `name` | Required by schema. |
| `slug` | Optional plan slug. |
| `status` | `draft` or `publish`. |
| `description` | Optional description. |
| `access.method` | `manual-only`, `signup`, or `purchase`. |
| `access.product_ids` | Required by business rules when method is `purchase`. |
| `membership_length.type` | `unlimited`, `specific`, or `fixed`. |
| `membership_length.amount` / `period` | Required by business rules for `specific`. |
| `membership_length.start_date` / `end_date` | Required by business rules for `fixed`. |
| `rules.content_restriction` | Plan content restriction rules. |
| `rules.product_restriction` | Product view/purchase restriction rules. |
| `rules.purchasing_discount` | Member discount rules. |

Do not write the `wc_memberships_rules` option directly when an ability or plan API can create the plan and rules together.

## User membership creation input

`user-memberships-create` delegates to Memberships's user membership manager:

```php
wc_memberships()->get_user_memberships_instance()->create_user_membership( $data );
```

Schema fields:

| Input | Notes |
|---|---|
| `plan_id` | Required membership plan ID. |
| `user_id` | Required WP user ID. |
| `product_id` | Optional product that granted access. |
| `order_id` | Optional order that granted access. |

For purchase-based access, prefer passing meaningful `product_id` and `order_id` when the membership is truly tied to a purchase. Do not fake order/product relations just to satisfy reporting.

## Post restriction rule abilities

Memberships 1.29.0 added Abilities API operations for the block-editor Memberships sidebar. They are configuration APIs for restrictable posts, not runtime access checks.

| Need | Ability | REST route |
|---|---|---|
| Read rules applying to a post | `woocommerce-memberships/post-restriction-rules-get` | `GET /wc-memberships/v1/post-restriction-rules/{id}` |
| Replace post-specific rules | `woocommerce-memberships/post-restriction-rules-update` | `PUT /wc-memberships/v1/post-restriction-rules/{id}` |

`post-restriction-rules-get` returns:

```php
array(
    'id'    => 123,
    'rules' => array(
        array(
            'id'                 => 'rule-id',
            'membership_plan_id' => 456,
            'access_schedule'    => array( 'type' => 'immediate' ),
            'editable'           => true,
        ),
    ),
);
```

The response includes both post-specific rules and inherited rules from post-type/taxonomy level configuration. The `editable` flag is the safety boundary:

- `editable === true`: rule targets this post directly and can be sent to the update ability.
- `editable === false`: inherited rule; render read-only and edit it on the membership plan/source rule, not from the post payload.

`post-restriction-rules-update` treats `rules` as the full desired state for post-specific content restriction rules:

- Existing direct rules omitted from the payload are deleted.
- Rows with a known direct rule `id` are updated.
- Rows without `id` are added.
- `rules: array()` clears all direct post-specific rules.
- Inherited rules are not affected, and sending an inherited rule ID causes a `422 invalid_input` because the ID does not belong to this post.

Safe PHP execution shape:

```php
$get = wp_get_ability( 'woocommerce-memberships/post-restriction-rules-get' );
$current = $get ? $get->execute( $post_id ) : null;

if ( is_wp_error( $current ) || ! is_array( $current ) ) {
    return $current;
}

$editable_rules = array_values( array_filter(
    $current['rules'],
    static fn( array $rule ): bool => ! empty( $rule['editable'] )
) );

$editable_rules[] = array(
    'membership_plan_id' => $plan_id,
    'access_schedule'    => array( 'type' => 'delayed', 'amount' => 7, 'period' => 'days' ),
);

if ( ! current_user_can( 'edit_post', $post_id ) ) {
    return new WP_Error( 'forbidden', 'Cannot edit this post.', array( 'status' => 403 ) );
}

$update = wp_get_ability( 'woocommerce-memberships/post-restriction-rules-update' );
$result = $update ? $update->execute( array(
    'id'    => $post_id,
    'rules' => $editable_rules,
) ) : new WP_Error( 'missing_ability' );
```

The update rule schema accepts `membership_plan_id` and optional `access_schedule`. Delayed schedules use `type = delayed`, positive `amount`, and `period` in `days`, `weeks`, `months`, or `years`; immediate schedules use `array( 'type' => 'immediate' )`.

The block editor sidebar also registers REST-exposed post meta for `_wc_memberships_force_public` and the per-post custom restriction message keys. Those meta writes are separate from rule replacement; use the abilities above for rule rows and normal post meta/REST for the sidebar's force-public/message settings.

## Safe execution pattern

```php
$ability = function_exists( 'wp_get_ability' )
    ? wp_get_ability( 'woocommerce-memberships/user-memberships-get' )
    : null;

if ( ! $ability || ! current_user_can( 'manage_woocommerce' ) ) {
    return new WP_Error( 'forbidden', 'Membership ability is unavailable.', array( 'status' => 403 ) );
}

$result = $ability->execute( 123 );

if ( is_wp_error( $result ) ) {
    return $result;
}
```

Let the ability permission callback run; the explicit `current_user_can()` guard is useful when your code is about to choose between an admin path and a frontend-safe path.

## Choosing the right surface

| Need | Prefer |
|---|---|
| Admin/agent automation on WP 7.0+ | Abilities API. |
| External integration over HTTP with Woo auth | Memberships REST API. |
| In-process plugin business logic | Public PHP APIs and objects. |
| Customer frontend/headless "my memberships" | Custom endpoint that checks ownership and uses Memberships access APIs. |
| Public member directory | `/wc/v4/memberships/members/directory`, with page/block validation and privacy-limited fields. |
| Block-editor per-post restriction UI | `post-restriction-rules-get/update` abilities or their `/wc-memberships/v1/post-restriction-rules/{id}` routes. |

Do not use `manage_woocommerce` abilities for a customer-facing dashboard. A customer should not be able to list arbitrary users' memberships or delete plans.

## Security guardrails

- Never proxy ability execution from a public REST route without a capability check.
- Do not pass arbitrary frontend-controlled WP_Query args into `plans-list`; even though the ability is admin-gated, sanitize UI inputs before execution.
- Treat delete abilities as destructive and require an explicit admin confirmation in UI.
- Do not down-scope permission by filtering current user capabilities. Build a narrower custom endpoint/service when customers need self-service membership data.
- Do not assume every ability has a REST route. Plan and user-membership abilities pass `showInRest = true` for Abilities API metadata but do not provide the SkyVerge framework `RestConfig`; the post restriction rule abilities do.
- For post rule updates, never round-trip inherited rows from GET into PUT. Filter to `editable === true` and intentionally rebuild the direct post-specific rule set.
- The framework's route permission callback is invoked without request input before execution. `WP_Ability::execute()` passes validated input to the permission callback, but the update input is an array, not a numeric ID, so the shared trait's `edit_post` branch does not fire there in 1.29.0. Add an explicit `current_user_can( 'edit_post', $post_id )` check before custom update wrappers.

## Common mistakes

```php
// WRONG: exposing a privileged ability to any logged-in user.
register_rest_route( 'my/v1', '/membership', array(
    'methods'             => 'POST',
    'permission_callback' => 'is_user_logged_in',
    'callback'            => function ( WP_REST_Request $request ) {
        return wp_get_ability( 'woocommerce-memberships/user-memberships-delete' )->execute( (int) $request['id'] );
    },
) );

// RIGHT: use capability checks for privileged automation.
register_rest_route( 'my/v1', '/admin/membership', array(
    'methods'             => 'POST',
    'permission_callback' => static fn() => current_user_can( 'manage_woocommerce' ),
    'callback'            => function ( WP_REST_Request $request ) {
        $ability = wp_get_ability( 'woocommerce-memberships/user-memberships-get' );
        return $ability ? $ability->execute( (int) $request['id'] ) : new WP_Error( 'missing_ability' );
    },
) );
```

## Cross-references

- Use `wcm-membership-hooks` for lifecycle hooks, REST/webhooks, profile fields, member directory, CSV, and Subscriptions-linked memberships.
- Use `wcm-data-model-subscriptions-link` for CPT names, meta keys, rule storage, and Subscriptions relation storage.
- Use `wcm-access-discounts` for access checks, restriction/drip behavior, and member discount APIs.

## References

- Verified source paths:
  - `wp-content/plugins/woocommerce-memberships/class-wc-memberships.php`
  - `wp-content/plugins/woocommerce-memberships/src/Abilities/Provider.php`
  - `wp-content/plugins/woocommerce-memberships/src/Plans/Abilities/`
  - `wp-content/plugins/woocommerce-memberships/src/UserMemberships/Abilities/`
  - `wp-content/plugins/woocommerce-memberships/src/Posts/Abilities/`
  - `wp-content/plugins/woocommerce-memberships/src/Posts/Actions/SetPostRules.php`
  - `wp-content/plugins/woocommerce-memberships/src/Posts/Adapters/JsonSerializers/PostRestrictionRulesSerializer.php`
  - `wp-content/plugins/woocommerce-memberships/src/Posts/Traits/CanCheckRestrictablePostPermissionTrait.php`
  - `wp-content/plugins/woocommerce-memberships/src/Blocks/BlockEditorSidebar.php`
  - `wp-content/plugins/woocommerce-memberships/vendor/skyverge/wc-plugin-framework/woocommerce/Abilities/`
