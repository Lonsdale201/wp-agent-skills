---
name: wcm-membership-hooks
description: Curated WooCommerce Memberships hook and extension-point map
  for plugins that build on user memberships, membership plans, status
  transitions, purchase/free-signup grants, profile fields, REST API,
  webhooks, members-area templates, CSV import/export, and Woo
  Subscriptions-linked memberships. Use when the user asks for a
  Memberships hook list, "where should I hook", membership created/saved,
  status changed, grant access from order, user membership API, profile
  fields, member directory, or code contains wc_memberships_,
  WC_Memberships_User_Membership, WC_Memberships_Membership_Plan,
  wc_user_membership, wc_membership_plan, wcm-, _subscription_id,
  wc_memberships_rules, or woocommerce-memberships.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-memberships
plugin-version-tested: "1.28.3"
php-min: "7.4"
last-updated: "2026-06-14"
source-refs:
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-post-types.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-user-memberships.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-user-membership.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-membership-plan.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-rules.php
  - wp-content/plugins/woocommerce-memberships/src/API/Controller/User_Memberships.php
  - wp-content/plugins/woocommerce-memberships/src/API/Webhooks.php
  - wp-content/plugins/woocommerce-memberships/src/Abilities/Provider.php
  - wp-content/plugins/woocommerce-memberships/src/Plans/Abilities/
  - wp-content/plugins/woocommerce-memberships/src/UserMemberships/Abilities/
  - wp-content/plugins/woocommerce-memberships/src/Helpers/Directory_Block_Validator.php
  - wp-content/plugins/woocommerce-memberships/src/Profile_Fields.php
  - wp-content/plugins/woocommerce-memberships/src/integrations/subscriptions/
---

# WooCommerce Memberships: hook map

Use this when building or reviewing an integration that needs to react to WooCommerce Memberships events. This is a curated decision map, not an exhaustive dump of every hook call in the plugin.

## Misconception this skill corrects

> "Memberships are just posts/meta, so query `wc_user_membership` posts and update `_member_plan_id` or `post_status` directly."

User memberships are stored as custom posts, but the plugin has object wrappers, status hooks, access rules, order-grant metadata, REST/webhook behavior, profile-field storage, and Subscriptions integration. Prefer public functions and `WC_Memberships_User_Membership` methods unless the task explicitly requires low-level inspection.

## When to use this skill

Trigger when ANY of the following is true:

- The user asks for WooCommerce Memberships actions/filters, lifecycle hooks, status hooks, purchase grant hooks, profile fields, REST API hooks, webhooks, member directory, members area, or Subscriptions-linked memberships.
- Code contains `wc_memberships_`, `WC_Memberships_User_Membership`, `WC_Memberships_Membership_Plan`, `wc_user_membership`, `wcm-active`, `_member_plan_id`, `_wc_memberships_access_granted`, or `woocommerce-memberships`.
- You need to decide whether to hook at membership creation, post save, status transition, access grant, profile field save, API response shaping, or frontend members-area rendering.

## Workflow

1. Identify the layer first: user membership lifecycle, purchase/free-signup grant, access/restriction, discount, profile fields, REST/webhook, Abilities API, members area, CSV/admin, or Subscriptions integration.
2. Prefer public functions and objects over raw `WP_Query`, `wp_update_post()`, or direct post meta writes.
3. For status strings, know the boundary: WP post statuses use `wcm-` prefix, but object methods and lifecycle hooks commonly use unprefixed statuses such as `active`, `paused`, `cancelled`, `expired`, `free_trial`, `delayed`.
4. Before implementing, inspect the installed plugin line with:

```bash
rg -n "hook_name|function_name" wp-content/plugins/woocommerce-memberships/src wp-content/plugins/woocommerce-memberships/templates
```

## Storage facts agents must not guess

Memberships registers two CPTs: `wc_membership_plan` for plans and `wc_user_membership` for user memberships. A user membership's plan ID is `post_parent`, and its member/user ID is `post_author`; the installed plugin does not use `_member_plan_id` as the plan relation.

Core plan meta keys are `_access_method`, `_access_length`, `_access_start_date`, `_access_end_date`, `_product_ids`, `_members_area_sections`, and `_email_content`.

Core user membership meta keys are `_start_date`, `_end_date`, `_cancelled_date`, `_paused_date`, `_paused_intervals`, `_product_id`, `_order_id`, `_previous_owners`, `_renewal_login_token`, and `_locked`.

Membership rules are stored in the `wc_memberships_rules` option. Rule type values are `content_restriction`, `product_restriction`, and `purchasing_discount`.

When WooCommerce Subscriptions links a membership, the `wc_user_membership` post gets `_subscription_id`; subscription-linked memberships may also use `_has_installment_plan` and `_free_trial_end_date`.

## Active-detection canon

When gating code that registers something at FluentCRM / WP boot time (FluentCRM trigger / action, WC custom block, JFB action, etc.), use a symbol that exists at FILE LOAD — not one declared inside Memberships's own `plugins_loaded:10` callback. The symptom of getting this wrong is non-deterministic: works on some installs, your code disappears on others, depending on plugin activation order.

```php
// RIGHT — declared at file scope in woocommerce-memberships.php:83.
// Available the moment WP includes the plugin file, before any hook fires.
class_exists('WC_Memberships_Loader');

// WRONG — load-order race.
// wc_memberships() is declared inside class-wc-memberships.php which
// Memberships's plugins_loaded:10 callback require_onces from init_plugin().
// If your registration callback runs BEFORE Memberships's, function_exists
// returns false and your code skips registration silently.
function_exists('wc_memberships');
```

Same rule for `WC_Memberships` itself (the main class): it's loaded INSIDE `init_plugin()` so `class_exists('WC_Memberships')` is also racy. The loader class is the safe top-level checkpoint. At call time (REST endpoints, funnel handlers, AJAX) all classes/functions are loaded — the racy checks only matter at registration time.

## Public API first

| Need | API | Notes |
|---|---|---|
| Get one membership | `wc_memberships_get_user_membership( $id, $plan = null )` | Returns `WC_Memberships_User_Membership` or false. Subscriptions integration may return the subscription-aware subclass. |
| Get memberships for user/query | `wc_memberships_get_user_memberships( $user_id, $args )` | Prefer over hand-written membership `WP_Query` unless doing admin/reporting internals. |
| Get active memberships | `wc_memberships_get_user_active_memberships( $user_id, $args )` | Uses Memberships status semantics. |
| Check plan membership | `wc_memberships_is_user_member( $user_id, $plan )` | General membership check. |
| Check active membership | `wc_memberships_is_user_active_member( $user, $plan )` | Use for "currently active member" business rules. |
| Create membership | `wc_memberships_create_user_membership( $args, $action = 'create' )` | Lets Memberships run grant/renew/update logic. Throws `SV_WC_Plugin_Exception` on missing plan — wrap in try/catch. Sets `post_status = 'wcm-active'` by default; override with `$membership->update_status('paused', $note)` after. |
| Get plan(s) | `wc_memberships_get_membership_plan()`, `wc_memberships_get_membership_plans()` | Avoid reading plan post meta directly. |
| Status registry | `wc_memberships_get_user_membership_statuses( $with_labels = true, $prefixed = true )` | Canonical picker / dropdown source. Pass `(true, false)` for `{key, label}` pairs with UNPREFIXED keys (`active` not `wcm-active`) — that's the form `update_status()` accepts. Honours the `wc_memberships_user_membership_statuses` filter so 3rd-party additions appear automatically. |
| Set / clear start date | `$membership->set_start_date( $date_string_or_empty )` | Empty string defaults to `current_time('timestamp', true)` — useful for "member-since = now" semantics. |
| Set / clear end date | `$membership->set_end_date( $timestamp_or_string_or_empty )` | Empty string clears the end date — the canonical "unlimited / never expires" pattern. Numeric timestamp or `strtotime`-able string accepted. |
| Check access | `wc_memberships_user_can( $user_id, 'view'|'purchase', $target, $when = '' )` | Use targets like `array( 'post' => $post_id )` or `array( 'product' => $product_id )`. |

## User membership lifecycle hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Alter new membership post data | `wc_memberships_new_membership_data` | filter | `array $data, array $args` | Set initial status/date/title before insert/update. Keep status prefixed if assigning `post_status`. |
| Membership created by product/API/CLI create flow | `wc_memberships_user_membership_created` | action | `WC_Memberships_Membership_Plan $plan, array $args` | Attach external IDs or provision once. Args include `user_id`, `user_membership_id`, `is_update`. |
| Membership saved through `save_post` | `wc_memberships_user_membership_saved` | action | `WC_Memberships_Membership_Plan $plan, array $args` | Catch admin/manual/import saves. May fire in broader situations than creation. |
| Status catalog | `wc_memberships_user_membership_statuses` | filter | `array $statuses` | Add labels/statuses. Keys normally use `wcm-` prefix. |
| Statuses granting access | `wc_memberships_active_access_membership_statuses` | filter | `string[] $statuses` | Controls access semantics; do not assume only `active` grants access. |
| Renewal-eligible statuses | `wc_memberships_valid_membership_statuses_for_renewal` | filter | `string[] $statuses` | Change when a membership can be renewed. |
| Cancel-eligible statuses | `wc_memberships_valid_membership_statuses_for_cancel` | filter | `string[] $statuses` | Change when members can cancel. |
| Any status transition | `wc_memberships_user_membership_status_changed` | action | `WC_Memberships_User_Membership $membership, string $old, string $new` | Best generic lifecycle sync hook. `$old` and `$new` are unprefixed. |
| Membership activated | `wc_memberships_user_membership_activated` | action | `$membership, bool $was_paused, string $previous_status` | Resume/provision after activation. |
| Membership paused | `wc_memberships_user_membership_paused` | action | `$membership` | Suspend access in external systems. |
| Membership cancelled | `wc_memberships_user_membership_cancelled` | action | `$membership` | Cancel external entitlements. |
| Gate automatic expiry | `wc_memberships_expire_user_membership` | filter | `bool $expire, $membership` | Block/allow scheduled expiration. |
| Membership expired | `wc_memberships_user_membership_expired` | action | `int $user_membership_id` | Runs after expiry; load object if needed. |
| Can member cancel | `wc_memberships_user_membership_can_be_cancelled` | filter | `bool $can, $membership` | UI/business rule for cancellation. |
| Cancel URL | `wc_memberships_get_cancel_membership_url` | filter | `string $url, $membership` | Route cancellation to custom flow. |
| Can renew | `wc_memberships_user_membership_can_be_renewed` | filter | `bool $can, $membership` | UI/business rule for renewal. |
| Renewal product | `wc_memberships_user_membership_get_product_for_renewal` | filter | `$product, array $products, $membership` | Choose renewal product when several grant access. |
| Renew URL | `wc_memberships_get_renew_membership_url` | filter | `string $url, $membership` | Route renewal to custom flow. |
| Can transfer | `wc_memberships_user_membership_can_be_transferred` | filter | `bool $can, $membership, int $from_user_id, int $to_user_id` | Gate ownership transfer. |
| Transfer error | `wc_memberships_user_membership_can_be_transferred_error` | filter | `WP_Error $error, $membership, $from_user_id, $to_user_id` | Customize transfer failure. |
| Transferred | `wc_memberships_user_membership_transferred` | action | `$membership, WP_User $new_owner, WP_User $previous_owner` | Sync owner change. |
| Deleted | `wc_memberships_user_membership_deleted` | action | `WC_Memberships_User_Membership $membership` | Clean external state before Memberships removes related data. |

## Purchase and free-signup grants

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Choose order item product that grants access | `wc_memberships_access_granting_purchased_product_id` | filter | `int|int[] $product_ids, int[] $candidate_ids, WC_Memberships_Membership_Plan $plan` | Resolve parent/variation/multiple granting products. |
| Access granted from purchase | `wc_memberships_grant_membership_access_from_purchase` | action | `WC_Memberships_Membership_Plan $plan, array $args` | Runs after plan grants access from an order. Args include user, order, product, membership. |
| Free membership granted on signup | `wc_memberships_grant_free_membership_access_from_sign_up` | action | `WC_Memberships_Membership_Plan $plan, array $args` | Add onboarding/profile data for free signup plans. |
| Force checkout registration | `wc_memberships_force_checkout_registration` | filter | `bool $force, array $plans` | Force account creation when cart grants membership access. Avoid disabling if granting products are in cart. |
| Thank-you membership links | `woocommerce_memberships_thank_you_message` | filter | `string $message, int $order_id, array $memberships` | Customize order thank-you/email membership links. |

## Profile fields

| Need | Hook | Type | Use |
|---|---|---|---|
| Field type compatibility | `wc_memberships_profile_fields_compatible_types` | filter | Extend/limit field type support. |
| Visibility options | `wc_memberships_profile_fields_visibility_options` | filter | Add visibility choices. |
| Plan-specific visibility | `wc_memberships_profile_fields_membership_plan_visibility_options` | filter | Change visibility choices for a plan/access method. |
| Read profile fields | `wc_memberships_get_profile_fields` | filter | Adjust loaded `Profile_Field` objects for a user. |
| Validate definition | `wc_memberships_profile_field_definition_validation` | filter | Validate admin field definition data. |
| Validate value | `wc_memberships_profile_field_validation` | filter | Validate submitted member value. |
| Before/after signup fields | `wc_memberships_before_signup_profile_fields`, `wc_memberships_after_signup_profile_fields` | action | Surround registration profile fields. |
| Before/after product fields | `wc_memberships_before_product_profile_fields`, `wc_memberships_after_product_profile_fields` | action | Surround product-page profile fields. |
| Process product field submission | `wc_memberships_should_process_product_profile_fields_submission` | filter | Disable product-page profile field collection for a product. |
| My Account profile endpoint | `wc_memberships_profile_fields_area_endpoint` | filter | Change endpoint slug/query var. |
| Profile field CRUD | `wc_memberships_create_profile_field`, `wc_memberships_update_profile_field`, `wc_memberships_delete_profile_field` | action | Observe user field storage changes. |
| Definition CRUD | `wc_memberships_create_profile_field_definition`, `wc_memberships_update_profile_field_definition`, `wc_memberships_delete_profile_field_definition` | action | Observe field definition changes. |

## REST API and webhooks

| Area | Hooks | Use |
|---|---|---|
| User membership write request | `wc_memberships_rest_api_create_user_membership_request`, `wc_memberships_rest_api_update_user_membership_request`, `wc_memberships_rest_api_user_membership_set_data` | Validate/shape REST create/update before save. |
| User membership response | `wc_memberships_rest_api_user_membership_data`, `wc_memberships_rest_api_user_membership_links`, `wc_memberships_rest_api_user_membership_schema`, `wc_memberships_rest_api_user_membership_endpoint_args`, `wc_memberships_rest_api_user_memberships_collection_params` | Add fields, links, schema, endpoint args, or collection params. |
| Membership plan response | `wc_memberships_rest_api_membership_plan_data`, `wc_memberships_rest_api_membership_plan_schema`, `wc_memberships_rest_api_membership_plans_collection_params` | Extend plan REST output. |
| Excluded meta | `wc_memberships_rest_api_{$object_name}_excluded_meta_keys` | Hide internal meta keys in REST. |
| Webhook topics | `wc_memberships_user_membership_webhook_topic_hooks` | Map webhook topics to actions. |
| User membership webhook events | `wc_memberships_webhook_user_membership_created`, `updated`, `transferred`, `deleted` | Webhook topic source events; usually observe, not replace. |
| Plan webhook events | `wc_memberships_webhook_membership_plan_created`, `updated`, `deleted`, `restored` | Webhook topic source events for plans. |

The public member directory endpoint is not a generic user-memberships list shortcut. `/wc/v4/memberships/members/directory` requires a `page_id` that contains a Memberships Directory block and validates the referenced block context. In Memberships 1.28.3, directory responses are intentionally narrowed to the fields the block renders: `id`, `customer_data`, `plan_name`, `profile_fields`, and `meta_data` with `meta_data` blanked and `profile_fields` filtered to the block's allowed slugs. Cross-resource REST links are stripped. Use the admin-gated user memberships endpoint for full membership records.

## Abilities API

Memberships 1.28.0+ registers WordPress Abilities API abilities when `wp_register_ability()` and `wp_register_ability_category()` exist:

- `woocommerce-memberships/plans-create`
- `woocommerce-memberships/plans-delete`
- `woocommerce-memberships/plans-get`
- `woocommerce-memberships/plans-list`
- `woocommerce-memberships/user-memberships-create`
- `woocommerce-memberships/user-memberships-delete`
- `woocommerce-memberships/user-memberships-get`
- `woocommerce-memberships/user-memberships-list`

All built-in Memberships abilities use `current_user_can( 'manage_woocommerce' )`. Treat them as privileged admin automation, not front-end/headless customer endpoints. Use `wcm-abilities-api` when implementing or reviewing ability-based automation.

## Members area, directory, CSV, admin

| Area | Hooks | Use |
|---|---|---|
| Members area wrapper | `wc_memberships_before_members_area`, `wc_memberships_after_members_area` | Add UI around a members-area section. |
| My memberships table | `wc_memberships_my_memberships_column_names`, `wc_memberships_my_memberships_column_{$column_id}`, `wc_memberships_my_memberships_no_memberships_text` | Add or render columns in My Account. |
| Members area navigation/details | `wc_memberships_members_area_navigation_items`, `wc_memberships_members_area_my_membership_details`, `wc_memberships_members_area_{$section}_actions`, `wc_memberships_members_area_{$section}_title` | Customize member dashboard structure. |
| Section tables | `wc_memberships_members_area_my_membership_content_column_names`, `products_column_names`, `discounts_column_names`, `notes_column_names` plus matching `..._column_{$column_id}` actions | Add columns to content/product/discount/note sections. |
| Active discount display | `wc_memberships_members_area_show_only_active_discounts` | Include inactive/future discounts in member area. |
| Member directory | `wc_memberships_member_directory_settings`, `wc_memberships_member_directory_listing_plans`, `wc_memberships_member_directory_included_members`, `wc_memberships_member_directory_before_member_card`, `after_member_card` | Shape directory query and cards. |
| CSV import/export | `wc_memberships_csv_import_user_memberships_data`, `wc_memberships_csv_import_user_membership`, `wc_memberships_csv_export_user_memberships_headers`, `wc_memberships_csv_export_user_memberships_row`, `wc_memberships_csv_export_user_memberships_{$column_name}_column`, `wc_memberships_csv_export_user_memberships_query_args` | Add columns/data to Memberships import/export. |
| Admin capabilities | `woocommerce_memberships_can_import_export`, `woocommerce_memberships_can_manage_profile_fields`, `wc_memberships_admin_screen_ids`, `wc_memberships_admin_tabs` | Integrate admin pages/caps carefully. |

## Woo Subscriptions integration

If WooCommerce Subscriptions is active, Memberships may use subscription-aware membership objects and lifecycle rules.

| Need | Hook | Type | Use |
|---|---|---|---|
| Membership linked to subscription | `wc_memberships_user_membership_linked_to_subscription` | action | Sync external relation. Args include membership object, new subscription ID, old subscription ID. |
| Membership unlinked from subscription | `wc_memberships_user_membership_unlinked_from_subscription` | action | Remove external relation. |
| Cancel membership when linked subscription cancels | `wc_memberships_cancel_subscription_linked_membership` | filter | Return false only when your integration deliberately keeps access after subscription cancellation. |
| Subscription affects access start | `wc_memberships_access_from_time` | filter | Subscriptions integration uses this for trial-aware drip access. |
| REST subscription data | `wc_memberships_rest_api_user_membership_data`, `wc_memberships_rest_api_user_membership_schema`, `wc_memberships_rest_api_user_membership_set_data` | Subscriptions integration extends these with subscription fields. |

## Common mistakes

```php
// WRONG: skips Memberships creation/update hooks and object semantics.
wp_insert_post( array(
    'post_type'   => 'wc_user_membership',
    'post_status' => 'wcm-active',
) );

// RIGHT: let Memberships create/renew/update the user membership.
$membership = wc_memberships_create_user_membership( array(
    'user_id' => $user_id,
    'plan_id' => $plan_id,
) );

// WRONG: status meta/post writes bypass object methods and can miss side effects.
wp_update_post( array( 'ID' => $membership_id, 'post_status' => 'wcm-cancelled' ) );

// RIGHT: use the object API; pass unprefixed status.
$membership = wc_memberships_get_user_membership( $membership_id );
if ( $membership instanceof WC_Memberships_User_Membership ) {
    $membership->update_status( 'cancelled', 'Cancelled by external CRM.' );
}

// WRONG: raw "active" check misses Memberships access semantics and delayed/free-trial cases.
$is_member = 'wcm-active' === get_post_status( $membership_id );

// RIGHT: use public checks for business rules.
if ( wc_memberships_is_user_active_member( $user_id, $plan_id ) ) {
    myplugin_enable_feature( $user_id );
}

// WRONG: function_exists() is a load-order race at registration time.
// wc_memberships() is declared inside Memberships's plugins_loaded:10
// callback. If your registrar runs first (also plugins_loaded:10), this
// returns false and your integration silently doesn't register.
add_action( 'plugins_loaded', function () {
    if ( ! function_exists( 'wc_memberships' ) ) {
        return; // racy — sometimes false even when Memberships is active
    }
    register_my_membership_integration();
}, 11 );

// RIGHT: WC_Memberships_Loader is at file scope — race-free.
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( 'WC_Memberships_Loader' ) ) {
        return;
    }
    register_my_membership_integration();
}, 11 );

// WRONG: hardcoding the status list — Memberships allows 3rd parties to add
// their own statuses via the wc_memberships_user_membership_statuses filter.
$statuses = array( 'active', 'paused', 'cancelled', 'expired' );

// RIGHT: read from the registry (UNPREFIXED keys for object methods).
$statuses = wc_memberships_get_user_membership_statuses( true, false );
foreach ( $statuses as $key => $data ) {
    // $key = 'active', 'paused', ...; $data['label'] = 'Active', 'Paused', ...
}
```

## Cross-references

- Use `wcm-data-model-subscriptions-link` for exact CPT names, meta keys, rule storage, profile-field storage, and Memberships-Subscriptions relation details.
- Use `wcm-access-discounts` for access checks, restriction/drip hooks, member discounts, and price-adjustment recursion safety.
- Use `wcm-abilities-api` for Memberships 1.28+ WP Abilities API names, permissions, schemas, and guardrails.
- Use `wcs-subscription-hooks` or `wcs-renewal-scheduler` when the membership is tied to WooCommerce Subscriptions renewal/payment flow.
