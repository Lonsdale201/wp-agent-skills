---
name: wcm-data-model-subscriptions-link
description: WooCommerce Memberships storage and relationship map for
  membership plan CPTs, user membership CPTs, post statuses, plan/user
  membership meta keys, rule storage, profile-field storage, order grant
  meta, and WooCommerce Subscriptions-linked memberships. Use when code
  reads or writes wc_membership_plan, wc_user_membership, wcm-* statuses,
  wc_memberships_rules, _subscription_id, _has_installment_plan,
  _free_trial_end_date, membership plan access meta, user membership
  dates, product/order grant meta, or when an agent needs exact Memberships
  CPT/meta names and the Memberships-Subscriptions relation.
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-memberships
plugin-version-tested: "1.28.3"
php-min: "7.4"
last-updated: "2026-06-14"
source-refs:
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-post-types.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-membership-plan.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-user-membership.php
  - wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-rules.php
  - wp-content/plugins/woocommerce-memberships/src/functions/wc-memberships-functions-orders.php
  - wp-content/plugins/woocommerce-memberships/src/Data_Stores/Profile_Field/User_Meta.php
  - wp-content/plugins/woocommerce-memberships/src/Data_Stores/Profile_Field_Definition/Option.php
  - wp-content/plugins/woocommerce-memberships/src/API/Controller/User_Memberships.php
  - wp-content/plugins/woocommerce-memberships/src/Helpers/Directory_Block_Validator.php
  - wp-content/plugins/woocommerce-memberships/src/integrations/subscriptions/class-wc-memberships-integration-subscriptions-user-membership.php
  - wp-content/plugins/woocommerce-memberships/src/integrations/subscriptions/class-wc-memberships-integration-subscriptions.php
---

# WooCommerce Memberships: data model and Subscriptions link

Use this when an integration needs exact storage names. Prefer Memberships public APIs and objects for writes; use these keys for audits, migrations, import/export mapping, and low-level debugging.

## Core storage

| Entity | Storage | Name/key | Notes |
|---|---|---|---|
| Membership plan | CPT | `wc_membership_plan` | Registered by `WC_Memberships_Post_Types`. Not public, UI under WooCommerce when possible. |
| User membership | CPT | `wc_user_membership` | One post per user-plan membership. Not public. |
| Plan relation | WP post field | `wc_user_membership.post_parent` | This is the plan ID. Do not invent `_member_plan_id`; the installed plugin uses `post_parent`. |
| Member relation | WP post field | `wc_user_membership.post_author` | This is the member/user ID. |
| Subscription | WC order type | `shop_subscription` | From WooCommerce Subscriptions; use `wcs_get_subscription()`. |
| Membership rules | Option | `wc_memberships_rules` | Stores serialized rule arrays for all plans. Rules are not CPTs. |
| Profile field definitions | Option | `wc_memberships_profile_fields` | Definition data keyed by profile field slug. |
| Profile field values | User meta | `_wc_memberships_profile_field_{slug}` | Stored by `Profile_Field\User_Meta`. |
| Order grant marker | WC order meta | `_wc_memberships_access_granted` | Array keyed by user membership ID, with `already_granted`, `granting_order_status`, and related details. |

## Membership statuses

WP post statuses use the `wcm-` prefix. Object methods usually accept/return unprefixed slugs.

| WP status | Object status | Meaning |
|---|---|---|
| `wcm-active` | `active` | Active access. |
| `wcm-delayed` | `delayed` | Membership exists but access starts later. |
| `wcm-complimentary` | `complimentary` | Admin/complimentary access. |
| `wcm-free_trial` | `free_trial` | Added by the Subscriptions integration when a linked subscription is in trial. |
| `wcm-paused` | `paused` | Paused membership. |
| `wcm-expired` | `expired` | Expired membership. |
| `wcm-cancelled` | `cancelled` | Cancelled membership. |

Use `wc_memberships_get_user_membership_statuses()` for the installed status catalog and `wc_memberships()->get_user_memberships_instance()->get_active_access_membership_statuses()` for statuses that grant access.

## Membership plan meta

These keys are stored on `wc_membership_plan` posts and exposed by `WC_Memberships_Membership_Plan::get_meta_keys()`.

| Meta key | Purpose |
|---|---|
| `_access_method` | `manual-only`, `signup`, or `purchase` access method. |
| `_access_length` | Access length value, e.g. `unlimited`, `specific`, `fixed`, or an amount/period value depending on method. |
| `_access_start_date` | Fixed access start datetime. |
| `_access_end_date` | Fixed access end datetime. |
| `_product_ids` | Product or variation IDs that grant access. |
| `_members_area_sections` | Enabled members-area sections. |
| `_email_content` | Plan-specific email content settings. |

Use plan methods such as `get_access_method()`, `set_access_method()`, `get_product_ids()`, `set_product_ids()`, `get_access_start_date()`, and `get_access_end_date()` rather than direct meta writes.

## User membership meta

These keys are stored on `wc_user_membership` posts and exposed by `WC_Memberships_User_Membership::get_meta_keys()`.

| Meta key | Purpose |
|---|---|
| `_start_date` | Membership start datetime. |
| `_end_date` | Membership end datetime. Empty/unset can mean unlimited. |
| `_cancelled_date` | Cancellation datetime. |
| `_paused_date` | Current pause start datetime. |
| `_paused_intervals` | Historical paused intervals. |
| `_product_id` | Product or variation ID that granted access. |
| `_order_id` | Order ID that granted access. |
| `_previous_owners` | Previous owner user IDs after transfers. |
| `_renewal_login_token` | Auto-login token used for renewal flows. |
| `_locked` | Operation lock for race-sensitive flows. |

Use `wc_memberships_create_user_membership()`, `wc_memberships_get_user_membership()`, and `WC_Memberships_User_Membership` methods for writes and lifecycle side effects.

## Rule storage

Rules are stored in the `wc_memberships_rules` option, not as posts. Rule type values:

| Rule type | Purpose | Important fields |
|---|---|---|
| `content_restriction` | Restricts posts, pages, CPTs, or terms. | `content_type`, `content_type_name`, `object_ids`, `access_schedule`, `access_schedule_exclude_trial`. |
| `product_restriction` | Restricts product viewing or purchase. | Same fields plus `access_type` (`view` or `purchase`). |
| `purchasing_discount` | Applies member discounts. | `discount_type`, `discount_amount`, `active`. |

Common rule fields are `id`, `membership_plan_id`, `active`, `rule_type`, `content_type`, `content_type_name`, `object_ids`, `discount_type`, `discount_amount`, `access_type`, `access_schedule`, `access_schedule_exclude_trial`, and `meta_data`.

Use `wc_memberships()->get_rules_instance()->get_rules()`, `get_plan_rules()`, `add_rules()`, `update_rules()`, or `delete_rules()` instead of editing the option directly.

## Memberships to Subscriptions relation

WooCommerce Memberships links to WooCommerce Subscriptions by adding extra meta to the `wc_user_membership` post. The subscription itself is still a WCS `shop_subscription`.

| User membership meta | Purpose |
|---|---|
| `_subscription_id` | Linked `shop_subscription` ID. This is the primary relation key from membership to subscription. |
| `_has_installment_plan` | Flag/value used when the linked subscription is treated as an installment plan. The code stores the subscription ID when it auto-detects the flag. |
| `_free_trial_end_date` | Trial end datetime mirrored from the linked subscription trial. |

Public helpers:

```php
$integration = wc_memberships()->get_integrations_instance()->get_subscriptions_instance();
$subscription = $integration ? $integration->get_subscription_from_membership( $user_membership ) : null;
$memberships = $integration ? $integration->get_memberships_from_subscription( $subscription ) : array();

$is_linked = wc_memberships_is_user_membership_linked_to_subscription( $user_membership );
```

Do not assume a reverse meta key on the subscription. Reverse lookup queries `wc_user_membership` posts with `_subscription_id = {subscription_id}`.

## Subscription-linked lifecycle

When Subscriptions is active, Memberships may return `WC_Memberships_Integration_Subscriptions_User_Membership` for linked memberships.

Important behavior:

- Linking calls `WC_Memberships_Integration_Subscriptions_User_Membership::set_subscription_id()` and fires `wc_memberships_user_membership_linked_to_subscription`.
- Unlinking deletes `_subscription_id` and fires `wc_memberships_user_membership_unlinked_from_subscription`.
- Subscription trial dates can set membership status to `free_trial` and write `_free_trial_end_date`.
- Subscription date/status changes can update linked membership dates/statuses.
- If a plan is granted by subscription products, Memberships checks whether the subscription product grants the plan and may keep access tied to subscription activity.
- Installment plan behavior differs: completion can unlink the subscription while keeping membership access according to the plan rules.

## Gifting and Memberships

WooCommerce Subscriptions Gifting changes who receives membership access when the gifted subscription product grants a Memberships plan.

Storage bridge:

- Gifted subscription stores recipient user on subscription meta `_recipient_user` after recipient account resolution.
- Parent order item stores `wcsg_recipient = wcsg_recipient_id_{user_id}`.
- Memberships grant filtering uses `wcsg_recipient` to grant access to recipient users instead of the purchaser for gifted items.
- The membership still stores the linked subscription in `_subscription_id`.

If an order has the same membership-granting product for several recipients, do not pick the first subscription in the order. Use the WCSG/Memberships integration logic or query recipient subscriptions before assigning `_subscription_id`.

## REST and directory data boundaries

Memberships REST records are API projections, not storage contracts. The v4 directory endpoint deliberately returns less than the full user membership record:

- It requires a `page_id` containing a Memberships Directory block and optionally a matching `block_instance_id`.
- It validates the viewer's access to that page/block context.
- It whitelists response keys to `id`, `customer_data`, `plan_name`, `profile_fields`, and `meta_data`.
- It blanks `meta_data`, filters `profile_fields` to the block's configured slugs, and removes REST links.

Do not use `/wc/v4/memberships/members/directory` as an admin export or integration source. Use the admin-gated Memberships REST endpoints, public PHP APIs, or the Abilities API for privileged automation.

## Safe query patterns

```php
// Memberships for a subscription.
$memberships = get_posts( array(
    'post_type'      => 'wc_user_membership',
    'post_status'    => wc_memberships_get_user_membership_statuses( false ),
    'fields'         => 'ids',
    'posts_per_page' => -1,
    'meta_query'     => array(
        array(
            'key'   => '_subscription_id',
            'value' => $subscription_id,
        ),
    ),
) );

// Prefer API for normal code.
$user_membership = wc_memberships_get_user_membership( $user_id, $plan_id );
```

For "grant access from previous purchase" logic, do not query `shop_order` posts directly. WooCommerce order storage may be HPOS, while Memberships still stores plans/user memberships as CPTs. Use Memberships grant/order APIs and WooCommerce order APIs so previous-purchase checks work in both CPT and HPOS order storage.

## Common mistakes

```php
// WRONG: this key is not the plan relation in the installed plugin.
$plan_id = get_post_meta( $membership_id, '_member_plan_id', true );

// RIGHT: use the object or post_parent.
$membership = wc_memberships_get_user_membership( $membership_id );
$plan_id = $membership ? $membership->get_plan_id() : 0;

// WRONG: raw post status write misses Memberships side effects.
wp_update_post( array( 'ID' => $membership_id, 'post_status' => 'wcm-active' ) );

// RIGHT: use object status API with unprefixed status.
$membership->update_status( 'active' );
```

## Cross-references

- Use `wcm-membership-hooks` for lifecycle hooks and REST/webhook extension points.
- Use `wcm-access-discounts` for access checks, restrictions, drip timing, and member discounts.
- Use `wcm-abilities-api` for Memberships 1.28+ WP Abilities API automation.
- Use `wcs-data-model-switching-gifting` for Subscriptions order type, subscription meta, switch data, and gifting data.
