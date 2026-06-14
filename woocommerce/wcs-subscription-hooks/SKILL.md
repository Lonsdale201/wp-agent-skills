---
name: wcs-subscription-hooks
description: Curated WooCommerce Subscriptions hook and extension-point map
  for choosing the right action/filter around WC_Subscription creation,
  status transitions, date changes, renewal orders, scheduled payments,
  payment retries, gateway events, switching, gifting, related orders,
  REST/API responses, and account/admin UI. Use when the user asks for a
  Woo Subscriptions hook list, "where should I hook", "after renewal",
  "subscription status changed", or when code contains WC_Subscription,
  wcs_create_subscription, wcs_create_renewal_order,
  woocommerce_scheduled_subscription_payment, wcs_renewal_order_created,
  payment_retry, wcs_get_subscriptions, wcsg_, subscription_switch,
  _subscription_switch_data, _recipient_user, wcsg_recipient, or
  subscription switching.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-subscriptions
plugin-version-tested: "8.8.1"
php-min: "7.4"
last-updated: "2026-06-14"
source-refs:
  - wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-functions.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-core-plugin.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-product.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-renewal-functions.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wcs-action-scheduler.php
  - wp-content/plugins/woocommerce-subscriptions/includes/payment-retry/class-wcs-retry-manager.php
  - wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wc-subscriptions-switcher.php
  - wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wcs-cart-switch.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcs-gifting.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-checkout.php
  - wp-content/plugins/woocommerce-subscriptions/src/Internal/HealthCheck/
  - wp-content/plugins/woocommerce-subscriptions/src/Internal/Queue_Management/
  - wp-content/plugins/woocommerce-subscriptions/src/Internal/Abilities/
---

# WooCommerce Subscriptions: hook map

Use this when building or reviewing an integration that needs to react to WooCommerce Subscriptions events. This is not an exhaustive dump of the 800+ hook calls in the plugin. It is a decision map for the hooks that are usually correct and the older/noisy hooks that AI agents tend to choose incorrectly.

## Misconception this skill corrects

> "Subscriptions are just orders, so hook `woocommerce_order_status_changed` or update `_schedule_next_payment` meta directly."

Subscriptions are `WC_Subscription` objects with their own lifecycle hooks, status transition hooks, date hooks, relation store, renewal order hooks, and scheduler bridge. Prefer WCS hooks and CRUD methods unless the task explicitly needs ordinary WC orders.

## When to use this skill

Trigger when ANY of the following is true:

- The user asks for WooCommerce Subscriptions actions/filters, lifecycle hooks, renewal hooks, status hooks, payment retry hooks, switching hooks, or gifting hooks.
- You see `WC_Subscription`, `wcs_get_subscription()`, `wcs_create_subscription()`, `wcs_create_renewal_order()`, `woocommerce_scheduled_subscription_payment`, `wcs_renewal_order_created`, `payment_retry`, `wcsg_`, or `subscription_switch`.
- You need to decide whether to hook at subscription creation, renewal order creation, gateway payment attempt, successful payment, failed payment, status change, or scheduled action time.

## Workflow

1. Identify the lifecycle point first: creation, status, date schedule, renewal order, gateway charge, retry, switch/gift, or UI/API.
2. Prefer hooks that pass `WC_Subscription` or `WC_Order` objects over legacy hooks that pass subscription keys.
3. For dynamic hooks, expand the real hook name from the runtime value: status, date type, payment method ID, or order relation type.
4. Before implementing, inspect the exact source line in the installed plugin with:

```bash
rg -n "hook_name|function_name" wp-content/plugins/woocommerce-subscriptions/includes wp-content/plugins/woocommerce-subscriptions/src
```

## Storage facts agents must not guess

Subscriptions registers `shop_subscription` as a WooCommerce order type. In CPT mode it appears as a post type; in HPOS it is an order type. Subscription product type slugs are `subscription`, `variable-subscription`, and `subscription_variation`.

Subscription prop meta keys include `_billing_period`, `_billing_interval`, `_suspension_count`, `_cancelled_email_sent`, `_requires_manual_renewal`, `_trial_period`, `_last_order_date_created`, `_schedule_start`, `_schedule_trial_end`, `_schedule_next_payment`, `_schedule_cancelled`, `_schedule_end`, `_schedule_payment_retry`, and `_subscription_switch_data`.

Related order meta keys are `_subscription_renewal`, `_subscription_switch`, and `_subscription_resubscribe`.

Switch cart items store `subscription_switch` cart item data. Gift cart items store `wcsg_gift_recipients_email`; gifted subscriptions use `_recipient_user_email_address` and `_recipient_user`, with parent order item meta `wcsg_recipient`.

## Core hook map

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Detect a loaded subscription object | `wcs_get_subscription` | filter | `WC_Subscription|false $subscription` | Last-resort object substitution/validation. Do not return arbitrary types; WCS 8.1+ rejects non-`WC_Subscription` values. |
| Create subscription programmatically | `wcs_created_subscription` | filter | `WC_Subscription $subscription` | Modify the newly saved object before the post-create action. |
| Run after subscription creation | `wcs_create_subscription` | action | `WC_Subscription $subscription` | Attach metadata, external IDs, logs, or provisioning. |
| Change default new status | `woocommerce_default_subscription_status` | filter | `string $status` | Default is `pending`; return status without `wc-`. |
| Add/rename statuses | `wcs_subscription_statuses` | filter | `array $statuses` | Keys must use `wc-` prefix, e.g. `wc-paused`. |
| Allow status transition | `woocommerce_can_subscription_be_updated_to_{status}` | filter | `bool $can, WC_Subscription $subscription` | Permit a custom or normally blocked transition. |
| Before status update | `woocommerce_subscription_pre_update_status` | action | `$old_status, $new_status, WC_Subscription $subscription` | Validate/log before WCS mutates dates and saves. |
| Status reached | `woocommerce_subscription_status_{to}` | action | `WC_Subscription $subscription` | React to a specific target status, e.g. `woocommerce_subscription_status_active`. |
| Specific transition | `woocommerce_subscription_status_{from}_to_{to}` | action | `WC_Subscription $subscription` | Use for exact transitions such as `on-hold_to_active`. |
| Generic status update | `woocommerce_subscription_status_updated` | action | `WC_Subscription $subscription, string $to, string $from` | Best general hook for lifecycle integration. |
| WC-like status changed | `woocommerce_subscription_status_changed` | action | `int $subscription_id, string $from, string $to, WC_Subscription $subscription` | Useful when porting code shaped like `woocommerce_order_status_changed`. |
| Read a stored date | `woocommerce_subscription_get_{date_type}_date` | filter | `$date, WC_Subscription $subscription, string $timezone` | Display/read override; do not use to reschedule. |
| Calculate a future date | `woocommerce_subscription_calculated_{date_type}_date` | filter | `$date, WC_Subscription $subscription` | Change calculated `next_payment`, `trial_end`, `end`, or `end_of_prepaid_term`. |
| Date changed | `woocommerce_subscription_date_updated` | action | `WC_Subscription $subscription, string $date_type, string $datetime` | Scheduler listens here; good place for external sync. |
| Date deleted | `woocommerce_subscription_date_deleted` | action | `WC_Subscription $subscription, string $date_type` | Clean up external schedule/state. |
| Can date be changed | `woocommerce_subscription_can_date_be_updated` | filter | `bool $can, string $date_type, WC_Subscription $subscription` | Open/close date editing rules. |
| Query subscriptions | `woocommerce_get_subscriptions_query_args` | filter | `$query_args, $working_args` | Modify `wcs_get_subscriptions()` query before execution. |
| After query | `woocommerce_got_subscriptions` | filter | `$subscriptions, $working_args` | Post-filter subscription results. |
| Related orders | `woocommerce_subscription_related_orders` | filter | `$orders, WC_Subscription $subscription, $return_fields, $order_type` | Add/adjust parent, renewal, switch, resubscribe relations. |

## Renewal and scheduled payment hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Scheduled renewal is due | `woocommerce_scheduled_subscription_payment` | action | `int $subscription_id` | Fired by Action Scheduler/admin action. WCS prepares renewal at priority 1 and gateway processing runs at priority 10. |
| Renewal order creation failed | `wcs_failed_to_create_renewal_order` | action | `WP_Error $error, WC_Subscription $subscription` | Alert/log/retry externally. |
| Renewal order created | `wcs_renewal_order_created` | filter | `WC_Order $renewal_order, WC_Subscription $subscription` | Add order meta, line item data, external IDs. Return a `WC_Order`. |
| Gateway charge hook | `woocommerce_scheduled_subscription_payment_{gateway_id}` | action | `float $amount, WC_Order $renewal_order` | Payment gateways implement recurring charge here, e.g. `_stripe` or `_paypal`. |
| Manual renewal order generated | `woocommerce_generated_manual_renewal_order` | action | `int $renewal_order_id, WC_Subscription $subscription` | Notify, adjust pending manual renewal order. |
| Renewal payment complete | `woocommerce_subscription_renewal_payment_complete` | action | `WC_Subscription $subscription, WC_Order $last_order` | Provision after a successful renewal, not before gateway payment. |
| Renewal payment failed | `woocommerce_subscription_renewal_payment_failed` | action | `WC_Subscription $subscription, WC_Order $related_order` | Handle failed renewal consequences. |
| Any subscription payment complete | `woocommerce_subscription_payment_complete` | action | `WC_Subscription $subscription` | Fires for parent or renewal payment completion. |
| Any subscription payment failed | `woocommerce_subscription_payment_failed` | action | `WC_Subscription $subscription, string $new_status` | React to failure and resulting status. |
| Paid failed renewal | `woocommerce_subscriptions_paid_for_failed_renewal_order` | action | `WC_Order $renewal_order, WC_Subscription $subscription` | Update failing payment method or clear retry state after customer pays a failed renewal. |

## Scheduler hooks

WCS uses Action Scheduler with group `wc_subscription_scheduled_event`, but the public integration point is the subscription date/status API. The scheduler listens to `woocommerce_subscription_date_updated`, `woocommerce_subscription_date_deleted`, and `woocommerce_subscription_status_updated`.

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Add/remove date types to schedule | `woocommerce_subscriptions_date_types_to_schedule` | filter | `string[] $date_types` | Include custom subscription date types. |
| Change scheduled action hook | `woocommerce_subscriptions_scheduled_action_hook` | filter | `string $hook, string $date_type` | Route a date type to a custom action. |
| Change scheduled args | `woocommerce_subscriptions_scheduled_action_args` | filter | `array $args, string $date_type, WC_Subscription $subscription` | Add deterministic args for custom scheduled actions. |
| Change Action Scheduler priority | `woocommerce_subscriptions_scheduled_action_priority` | filter | `int $priority, string $action_hook` | Default is priority `1`. |
| Trial ended | `woocommerce_subscription_trial_ended` | action | `int $subscription_id` | Fired from scheduled trial end handler. |
| Expiration/end hooks | `woocommerce_scheduled_subscription_expiration`, `woocommerce_scheduled_subscription_end_of_prepaid_term` | action | `int $subscription_id` | Internal status handlers run here; attach after them if you need post-status side effects. |

## Payment retry hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Enable/disable retries | `wcs_is_retry_enabled` | filter | `bool $enabled` | Feature-level gate. |
| Replace default retry rules | `wcs_default_retry_rules` | filter | `array $rules` | Configure retry cadence/statuses. |
| Alter one retry rule | `wcs_get_retry_rule_raw`, `wcs_get_retry_rule` | filter | `$rule, $retry_number, $order_id` | Fine-grained retry rule customization. |
| Before/after applying rule | `woocommerce_subscriptions_before_apply_retry_rule`, `woocommerce_subscriptions_after_apply_retry_rule` | action | `WCS_Retry_Rule $rule, WC_Order $last_order, WC_Subscription $subscription` | Observe scheduled retry creation. |
| Retry action is about to charge | `woocommerce_subscriptions_before_payment_retry` | action | `WCS_Retry $retry, WC_Order $last_order` | Prepare/log before retry payment. |
| Retry charge finished | `woocommerce_subscriptions_after_payment_retry` | action | `WCS_Retry $retry, WC_Order $last_order` | Record retry result. |
| Retry status/date changed | `woocommerce_subscriptions_retry_status_updated`, `woocommerce_subscriptions_retry_date_updated` | action | `WCS_Retry ...` | External sync for retry objects. |

## Switching, early renewal, gifting

| Area | Hooks | Use |
|---|---|---|
| Switch eligibility | `wcs_is_product_switchable`, `woocommerce_subscriptions_can_item_be_switched`, `woocommerce_subscriptions_can_item_be_switched_by_user` | Allow/block switching by product, item, or user. |
| Switch pricing | `wcs_switch_should_prorate_recurring_price`, `wcs_switch_should_prorate_sign_up_fee`, `wcs_switch_sign_up_fee`, `wcs_switch_proration_extra_to_pay` | Adjust proration math. In WCS 8.8+, `wcs_switch_proration_extra_to_pay` receives a 5th `$switch_item` argument. |
| Switch completion | `woocommerce_subscriptions_switch_completed` | React after switch order flow completes. |
| Early renewal | `wcs_is_early_renewal_enabled`, `woocommerce_subscriptions_can_user_renew_early`, `woocommerce_subscriptions_get_early_renewal_url` | Enable/disable and route early renewal. |
| Gifting product/checkout | `wcsg_enable_gifting`, `wcsg_is_enabled_for_all_products`, `wcsg_is_giftable_product`, `wcsg_cart_item_data` | Control whether gifting is available and persisted in cart. |
| Gifting recipient | `wcsg_recipient_details_updated`, `woocommerce_subscriptions_gifting_recipient_changed` | Sync recipient changes. |

## Gateway hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Gateway support check | `woocommerce_subscription_payment_gateway_supports` | filter | `bool $supports, string $feature, WC_Subscription $subscription` | Add support for features like `subscription_date_changes`. |
| Status changed for gateway | `woocommerce_subscription_activated_{gateway_id}`, `woocommerce_subscription_on-hold_{gateway_id}`, `woocommerce_subscription_pending-cancel_{gateway_id}`, `woocommerce_subscription_cancelled_{gateway_id}`, `woocommerce_subscription_expired_{gateway_id}` | action | `WC_Subscription $subscription` | Gateway-specific remote profile updates. |
| Payment method updated | `woocommerce_subscription_payment_method_updated` | action | `WC_Subscription $subscription, string $new, string $old` | Sync token/payment method changes. |
| Payment method updated to/from gateway | `woocommerce_subscription_payment_method_updated_to_{gateway_id}`, `woocommerce_subscription_payment_method_updated_from_{gateway_id}` | action | `WC_Subscription $subscription, string $other_gateway_id` | Gateway-specific migration logic. |
| Failing method updated | `woocommerce_subscription_failing_payment_method_updated` and `..._{gateway_id}` | action | `WC_Subscription $subscription, WC_Order $renewal_order` | After failed-renewal payment method handling. Use this for same-gateway failed-renewal retries in WCS 8.8+, because `update_payment_method()` hooks are skipped when the gateway did not actually change. |
| Payment meta fields | `woocommerce_subscription_payment_meta` | filter | `array $payment_meta, WC_Subscription $subscription` | Add fields to payment-method change UI. |
| Validate payment meta | `woocommerce_subscription_validate_payment_meta` and `..._{gateway_id}` | action | `array $payment_meta, WC_Subscription $subscription` | Throw/notice on invalid payment details. |

## Health Check and Processing reliability

WCS 8.8 adds operational surfaces that are not ordinary renewal hooks:

| Area | Surface | Use |
|---|---|---|
| Health Check tab | `Automattic\WooCommerce_Subscriptions\Internal\HealthCheck\StatusTab` | WooCommerce > Status > Subscriptions scan UI. It stores run/candidate rows and uses nonce-protected actions/AJAX for scan, cancel, suggestion, and remediation. |
| Resolve actions | `RemediationAdvisor`, `ToolRunner` | Built-in remediation can switch a flagged subscription to automatic renewal or process a missed renewal now. Do not call these internal classes from plugin business logic. |
| Dedicated processing | `Automattic\WooCommerce_Subscriptions\Internal\Queue_Management\Manager` | Merchant setting for subscription Action Scheduler isolation/focused runs. Tune via filters instead of creating competing runners. |
| External web cron | `/wp-json/wc/v3/subscriptions/job-queue?wcs_token=...` | Tokenized, rate-limited queue trigger created by the Web cron support setting. |

Use `wcs-health-check-processing` for implementation details and debugging patterns.

## Abilities API caveat

WCS 8.8 includes read-only Abilities API classes under `src/Internal/Abilities`, but registration is gated by `woocommerce_subscriptions_abilities_enabled` and defaults to `false`. The registrar also requires WooCommerce Core's 10.9 `AbilitiesLoader`. Do not assume these abilities exist on ordinary WCS 8.8.1 installs, and do not build a production integration that depends on them unless your plugin explicitly controls that feature gate and Core version.

## Customer action guardrails

For custom customer account actions, do not expose WCS admin REST writes directly. Load the subscription object, verify the current user owns it, then use WCS capabilities and object methods.

Status actions:

- Check `$subscription->get_user_id() === get_current_user_id()` unless this is trusted admin/server code.
- Check `$subscription->can_be_updated_to( $target_status )` before calling `$subscription->update_status( $target_status, $note, true )`.
- Prefer domain statuses: cancel to `pending-cancel` when the prepaid term should continue; cancel to `cancelled` only when immediate cancellation is intended and allowed.
- Let WCS status hooks run; do not update `post_status` or order status meta directly.

Payment-method actions:

- Verify the selected payment token belongs to the same WP user and gateway customer.
- Do not update only payment meta/source IDs. Use `WC_Subscriptions_Change_Payment_Gateway::update_payment_method()` or the gateway's change-payment flow so hooks and remote gateway side effects run.
- Preserve `woocommerce_subscriptions_pre_update_payment_method` and `woocommerce_subscription_payment_method_updated` when the gateway actually changes; gateways use them for remote profile cleanup and migration. For same-gateway failed-renewal retries in WCS 8.8+, use `woocommerce_subscription_failing_payment_method_updated` for retry side effects.

Switch actions:

- Use `WC_Subscriptions_Switcher::can_item_be_switched_by_user()` for eligibility.
- Wrap the switch cart/checkout flow or reproduce `_subscription_switch_data` deliberately. Direct line-item replacement is not a subscription switch.

## Common mistakes

```php
// WRONG: catches many normal orders and misses WCS-specific semantics.
add_action( 'woocommerce_order_status_changed', 'my_sync' );

// RIGHT: subscription transition with object.
add_action( 'woocommerce_subscription_status_updated', function ( WC_Subscription $subscription, string $to, string $from ): void {
    my_sync_subscription_status( $subscription->get_id(), $from, $to );
}, 10, 3 );

// WRONG: changing the schedule by writing meta bypasses validation and can desync Action Scheduler.
update_post_meta( $subscription_id, '_schedule_next_payment', '2026-05-01 00:00:00' );

// RIGHT: CRUD date update; WCS validates and reschedules via date hooks.
$subscription = wcs_get_subscription( $subscription_id );
if ( $subscription ) {
    $subscription->update_dates( array( 'next_payment' => '2026-05-01 00:00:00' ), 'gmt' );
}

// WRONG: use the scheduled-payment hook for fulfillment.
add_action( 'woocommerce_scheduled_subscription_payment', 'ship_box' );

// RIGHT: fulfill only after renewal payment is complete.
add_action( 'woocommerce_subscription_renewal_payment_complete', function ( WC_Subscription $subscription, WC_Order $order ): void {
    ship_box_for_renewal( $subscription, $order );
}, 10, 2 );
```

## What this skill does NOT cover

- Building a payment gateway from scratch.
- HPOS order CRUD beyond the WCS-specific hooks here. Use `wc-hpos-compatibility` for general order storage issues.
- Exhaustive hook cataloging. For full local discovery, run `rg -n "do_action\\(|apply_filters\\(" wp-content/plugins/woocommerce-subscriptions`.

## Cross-references

- Run `wcs-data-model-switching-gifting` when exact Subscriptions meta names, product type slugs, switch payloads, switched item meta/types, or WCS Gifting recipient storage matters.
- Run `wcs-renewal-scheduler` for changes to next payment dates, renewal order creation, scheduled actions, or payment retry timing.
- Run `wcs-health-check-processing` for WCS 8.8 Health Check, Resolve actions, dedicated processing, and web-cron queue support.
- Run `wc-hpos-compatibility` if the integration queries orders/subscriptions directly.
