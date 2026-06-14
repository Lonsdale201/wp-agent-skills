---
name: wcm-abilities-api
description: WooCommerce Memberships 1.28+ WordPress Abilities API
  reference for membership plan and user membership abilities, category
  slugs, registration requirements, permissions, schemas, annotations,
  and safe automation guardrails. Use when code or a task mentions
  wp_register_ability, wp_get_ability, WP Abilities API,
  woocommerce-memberships/plans-create, plans-delete, plans-get,
  plans-list, user-memberships-create, user-memberships-delete,
  user-memberships-get, user-memberships-list, or privileged
  agent/headless/admin automation for WooCommerce Memberships.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-memberships
plugin-version-tested: "1.28.3"
php-min: "7.4"
last-updated: "2026-06-14"
source-refs:
  - wp-content/plugins/woocommerce-memberships/class-wc-memberships.php
  - wp-content/plugins/woocommerce-memberships/src/Abilities/Provider.php
  - wp-content/plugins/woocommerce-memberships/src/Plans/Abilities/
  - wp-content/plugins/woocommerce-memberships/src/UserMemberships/Abilities/
  - wp-content/plugins/woocommerce-memberships/vendor/skyverge/wc-plugin-framework/woocommerce/Abilities/
---

# WooCommerce Memberships: Abilities API

Use this when building or reviewing privileged automation around Memberships plans and user memberships through the WordPress Abilities API.

## Misconception this skill corrects

> "Memberships abilities are customer-facing REST endpoints for headless member dashboards."

They are privileged Abilities API operations. In Memberships 1.28.3, every built-in ability checks `current_user_can( 'manage_woocommerce' )`. Use them for admin/agent automation, not untrusted frontend flows.

## When to use this skill

Trigger when ANY of the following is true:

- The task mentions WordPress Abilities API, `wp_register_ability()`, `wp_get_ability()`, `wp_abilities_api_init`, or agent automation for Memberships.
- Code contains ability names beginning with `woocommerce-memberships/`.
- Code needs to create/list/get/delete Memberships plans or user memberships through an ability layer instead of direct PHP APIs.
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
| `rest_api_init` | Registers ability REST routes only for abilities with explicit `RestConfig`. The current Memberships abilities do not pass a `RestConfig`. |

Do not assume these abilities exist on older WordPress installs. In WP 7.0+ contexts, they should be available if Memberships is loaded and no site-level code disables the Abilities API.

## Categories

| Category slug | Meaning |
|---|---|
| `woocommerce-membership-plans` | Abilities related to `WC_Memberships_Membership_Plan`. |
| `woocommerce-user-memberships` | Abilities related to `WC_Memberships_User_Membership`. |

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

Output schemas use the plugin object JSON schemas:

- `WC_Memberships_Membership_Plan::getJsonSchema()`
- `WC_Memberships_User_Membership::getJsonSchema()`

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

Do not use `manage_woocommerce` abilities for a customer-facing dashboard. A customer should not be able to list arbitrary users' memberships or delete plans.

## Security guardrails

- Never proxy ability execution from a public REST route without a capability check.
- Do not pass arbitrary frontend-controlled WP_Query args into `plans-list`; even though the ability is admin-gated, sanitize UI inputs before execution.
- Treat delete abilities as destructive and require an explicit admin confirmation in UI.
- Do not down-scope permission by filtering current user capabilities. Build a narrower custom endpoint/service when customers need self-service membership data.
- Do not assume ability REST routes exist. The current Memberships ability classes pass `showInRest = true`, but do not pass a framework `RestConfig`.

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
