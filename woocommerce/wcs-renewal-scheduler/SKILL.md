---
name: wcs-renewal-scheduler
description: Safely integrate with WooCommerce Subscriptions renewal scheduling, Action Scheduler, renewal-order creation, gateway charge dispatch, guarded process-renewal-now commands, and retries. Use for WC_Subscription::update_dates, wcs_create_renewal_order, woocommerce_scheduled_subscription_payment, gateway-specific scheduled payment hooks, renewal success/failure, missing renewals, or duplicate renewal orders.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce Subscriptions: renewal scheduler

Use this when code touches renewal timing, scheduled payments, renewal order creation, or retry behavior. The key rule: change subscription dates/status through `WC_Subscription` methods, not by writing schedule meta or Action Scheduler rows directly.

## Misconception this skill corrects

> "To reschedule a subscription, update `_schedule_next_payment` or call `as_schedule_single_action()`."

That bypasses WCS validation and the scheduler's cleanup/reschedule behavior. `WCS_Scheduler` listens to `woocommerce_subscription_date_updated`, `woocommerce_subscription_date_deleted`, and `woocommerce_subscription_status_updated`. Those fire when you use `WC_Subscription::update_dates()`, `delete_date()`, or `update_status()`.

## When to use this skill

Trigger when ANY of the following is true:

- The user wants to change `next_payment`, `trial_end`, `end`, `payment_retry`, or renewal timing.
- Code contains `_schedule_next_payment`, `_schedule_payment_retry`, `as_schedule_single_action`, `woocommerce_scheduled_subscription_payment`, `WCS_Action_Scheduler`, `wcs_create_renewal_order`, or `WCS_Retry_Manager`.
- A gateway or integration needs to charge recurring payments, create renewal orders, react after a renewal succeeded, or handle failed renewal retries.

## Renewal flow

For a normal WCS-managed automatic renewal:

1. A future Action Scheduler action exists in group `wc_subscription_scheduled_event`.
2. The action hook is `woocommerce_scheduled_subscription_payment` with args `array( 'subscription_id' => $id )`.
3. `WC_Subscriptions_Manager::prepare_renewal()` runs at priority `1`. It puts the subscription on hold and creates a renewal order with `wcs_create_renewal_order()`.
4. `wcs_renewal_order_created` fires after the renewal relation is stored.
5. `WC_Subscriptions_Payment_Gateways::gateway_scheduled_subscription_payment()` runs at priority `10`.
6. For non-manual gateways that do not manage their own schedule, WCS triggers `woocommerce_scheduled_subscription_payment_{gateway_id}` with `$amount, $renewal_order`.
7. After payment result, use `woocommerce_subscription_renewal_payment_complete` or `woocommerce_subscription_renewal_payment_failed` for business side effects.

Do not fulfill, ship, grant service, or call an external "success" API on `woocommerce_scheduled_subscription_payment`; at that point the renewal may not be paid yet.

## Safe date changes

```php
$subscription = wcs_get_subscription( $subscription_id );

if ( ! $subscription instanceof WC_Subscription ) {
    return;
}

// UTC MySQL datetime. This updates WCS props, validates ordering, saves,
// and lets WCS_Action_Scheduler reschedule the matching action.
$subscription->update_dates(
    array(
        'next_payment' => '2026-05-15 10:00:00',
    ),
    'gmt'
);
```

Use these date keys:

| Date type | Meaning | Scheduled hook |
|---|---|---|
| `next_payment` | Next renewal payment due date | `woocommerce_scheduled_subscription_payment` |
| `trial_end` | Trial expiry | `woocommerce_scheduled_subscription_trial_end` |
| `end` on active subscription | Subscription expiration | `woocommerce_scheduled_subscription_expiration` |
| `end` on `pending-cancel`/`cancelled` | End of prepaid term | `woocommerce_scheduled_subscription_end_of_prepaid_term` |
| `payment_retry` | Retry for last renewal order | `woocommerce_scheduled_subscription_payment_retry` |

`update_dates()` is strict. It throws if a date is invalid or out of order. If you are importing messy external data and want to keep valid values while ignoring invalid ones, use `update_valid_dates()` and still catch exceptions for impossible ordering.

```php
try {
    $subscription->update_valid_dates( $dates, 'gmt' );
} catch ( InvalidArgumentException $e ) {
    wc_get_logger()->warning( $e->getMessage(), array( 'source' => 'myplugin-subscriptions-import' ) );
}
```

## WCS 9.0 date validation details

WCS 9.0 keeps the same public rule: use `WC_Subscription::update_dates()` or `update_valid_dates()`. Two source-verified edge cases matter for integrations:

- `prepare_dates_for_update()` compares `next_payment` against `trial_end` at minute resolution. If both land in the same visible minute, WCS treats that as valid instead of rejecting the edit over hidden seconds.
- Admin schedule editor text now correctly tells merchants that next payment must be after the trial end.

Practical import rule: normalize external schedule dates to UTC `Y-m-d H:i:s`, but do not add arbitrary seconds just to make trial end and next payment different. If your system only stores minute precision, pass the minute value and let WCS validate it.

## Process a renewal now

There is no safe one-line public "force renewal" call. A bare:

```php
do_action( 'woocommerce_scheduled_subscription_payment', $subscription_id ); // unsafe as a general command
```

can race the already-running/pending Action Scheduler action and create or charge twice. WCS 9.0's Health Check Resolve tool is the preferred merchant operation because it adds recent-renewal and running-action guards.

Programmatic processing must follow this sequence:

1. Acquire a durable per-subscription command lock.
2. Allow only the intended status (`active` or deliberately `on-hold`).
3. Reject if the canonical scheduled action is already running.
4. Reject if a recent/in-flight renewal order already exists.
5. Call `WC_Subscriptions_Manager::process_renewal( $id, $subscription->get_status(), $note )`.
6. If no `WC_Order` is returned, do not unschedule anything; gateways with `gateway_scheduled_payments` own their schedule.
7. Only after order creation, unschedule the matching pending canonical action using hook, associative args, and group.
8. Dispatch `WC_Subscriptions_Payment_Gateways::gateway_scheduled_subscription_payment( $id )` and release the lock in `finally`.

These manager methods are established WCS classes but not a transactional command API. Pin tests to the installed WCS version. See [programmatic-renewal.md](programmatic-renewal.md) for a source-verified skeleton.

If you only need to create a pending renewal order for a later manual workflow, `wcs_create_renewal_order()` is lower-level and still requires duplicate prevention:

```php
$renewal_order = wcs_create_renewal_order( $subscription );

if ( is_wp_error( $renewal_order ) ) {
    wc_get_logger()->error( $renewal_order->get_error_message(), array( 'source' => 'myplugin-renewals' ) );
    return;
}

$renewal_order->update_meta_data( '_myplugin_external_id', $external_id );
$renewal_order->save();
```

When decorating renewal orders, `wcs_renewal_order_created` is usually better than wrapping `wcs_create_renewal_order()` everywhere:

```php
add_filter( 'wcs_renewal_order_created', function ( WC_Order $renewal_order, WC_Subscription $subscription ): WC_Order {
    $renewal_order->update_meta_data( '_myplugin_subscription_source', $subscription->get_id() );
    $renewal_order->save();

    return $renewal_order;
}, 10, 2 );
```

REST order API caution in WCS 9.0: when WooCommerce REST updates renewal, resubscribe, or switch order line items, WCS no longer reapplies the product sign-up fee to those line totals. If your integration edits those order types through REST, preserve existing WCS relation meta and do not add sign-up fees again in your own `woocommerce_rest_set_order_item` callback.

## Gateway recurring charge hook

Payment gateways that charge WCS-managed renewals should hook the gateway-specific dynamic action:

```php
add_action( 'woocommerce_scheduled_subscription_payment_my_gateway', function ( $amount, WC_Order $renewal_order ): void {
    $subscription_ids = wcs_get_subscription_ids_for_order( $renewal_order, 'renewal' );

    // Charge the saved token. On success call $renewal_order->payment_complete().
    // On failure call $renewal_order->update_status( 'failed', ... ).
}, 10, 2 );
```

The suffix is the payment method ID stored on the renewal order. Do not use the old `scheduled_subscription_payment_{gateway}` hook; WCS keeps compatibility shims, but new code should use the `woocommerce_` hook.

## Correct success/failure hooks

| Need | Hook | Args |
|---|---|---|
| Provision after any subscription payment | `woocommerce_subscription_payment_complete` | `WC_Subscription $subscription` |
| Provision after renewal payment only | `woocommerce_subscription_renewal_payment_complete` | `WC_Subscription $subscription, WC_Order $last_order` |
| React to any payment failure | `woocommerce_subscription_payment_failed` | `WC_Subscription $subscription, string $new_status` |
| React to renewal payment failure | `woocommerce_subscription_renewal_payment_failed` | `WC_Subscription $subscription, WC_Order $related_order` |
| Customer paid a failed renewal | `woocommerce_subscriptions_paid_for_failed_renewal_order` | `WC_Order $renewal_order, WC_Subscription $subscription` |

## Retry flow

WCS retries are their own objects/rules. Do not reschedule retries by hand unless replacing the retry system.

| Need | Hook/filter | Use |
|---|---|---|
| Toggle retry feature | `wcs_is_retry_enabled` | Disable/enable retry handling. |
| Change retry cadence | `wcs_default_retry_rules` | Replace default rules array. |
| Modify a specific retry | `wcs_get_retry_rule_raw` or `wcs_get_retry_rule` | Customize by retry number/order. |
| Before/after retry rule applied | `woocommerce_subscriptions_before_apply_retry_rule`, `woocommerce_subscriptions_after_apply_retry_rule` | Observe creation of retry schedule. |
| Before/after retry payment | `woocommerce_subscriptions_before_payment_retry`, `woocommerce_subscriptions_after_payment_retry` | Wrap the actual retry attempt. |

`wcs_is_scheduled_payment_attempt` is a filter around WCS's internal `doing_action()` check, not a public getter. If your own code needs to know whether it is inside a scheduled payment attempt, check the actions directly:

```php
add_filter( 'woocommerce_email_enabled_customer_processing_renewal_order', function ( bool $enabled ): bool {
    if ( doing_action( 'woocommerce_scheduled_subscription_payment' ) || doing_action( 'woocommerce_scheduled_subscription_payment_retry' ) ) {
        return false;
    }

    return $enabled;
} );
```

Only hook `wcs_is_scheduled_payment_attempt` when you intentionally need to override WCS retry detection.

## Same-gateway failed-renewal retries in WCS 8.8+

When a failed renewal is paid/retried with the same gateway, WCS 8.8 no longer calls `WC_Subscriptions_Change_Payment_Gateway::update_payment_method()` just to rewrite the same gateway onto the subscription. That means these hooks do not fire for same-gateway retry events:

- `woocommerce_subscriptions_pre_update_payment_method`
- `woocommerce_subscription_payment_method_updated`
- `woocommerce_subscription_payment_method_updated_to_{gateway_id}`

Use `woocommerce_subscription_failing_payment_method_updated` or `woocommerce_subscription_failing_payment_method_updated_{gateway_id}` for retry-event side effects such as clearing external failure counters. Those hooks still fire after the failed renewal payment method handling.

```php
add_action( 'woocommerce_subscription_failing_payment_method_updated', function ( WC_Subscription $subscription, WC_Order $renewal_order ): void {
    my_gateway_clear_retry_failure_state( $subscription->get_id(), $renewal_order->get_id() );
}, 10, 2 );
```

Do not move ordinary payment-method migration logic to the failing-payment hook. Keep token/gateway migration behavior on `woocommerce_subscription_payment_method_updated`; use the failing-payment hook only for failed-renewal recovery behavior.

## Scheduler customization

Only use these when you intentionally extend WCS scheduling. For ordinary next-payment changes, use `update_dates()`.

```php
add_filter( 'woocommerce_subscriptions_date_types_to_schedule', function ( array $date_types ): array {
    $date_types[] = 'myplugin_followup';
    return array_unique( $date_types );
} );

add_filter( 'woocommerce_subscriptions_scheduled_action_hook', function ( string $hook, string $date_type ): string {
    return 'myplugin_followup' === $date_type ? 'myplugin_subscription_followup' : $hook;
}, 10, 2 );

add_action( 'myplugin_subscription_followup', function ( int $subscription_id ): void {
    $subscription = wcs_get_subscription( $subscription_id );
    if ( $subscription instanceof WC_Subscription ) {
        myplugin_send_followup( $subscription );
    }
} );
```

If you change scheduled args with `woocommerce_subscriptions_scheduled_action_args`, keep them deterministic. WCS uses the args to find and unschedule existing actions.

## Common mistakes

```php
// WRONG: bypasses WCS date validation and Action Scheduler cleanup.
update_post_meta( $subscription_id, '_schedule_next_payment', '2026-05-15 10:00:00' );

// RIGHT:
$subscription = wcs_get_subscription( $subscription_id );
$subscription->update_dates( array( 'next_payment' => '2026-05-15 10:00:00' ), 'gmt' );

// WRONG: create a duplicate AS action with different args/group.
as_schedule_single_action( time() + DAY_IN_SECONDS, 'woocommerce_scheduled_subscription_payment', array( $subscription_id ) );

// RIGHT: set the subscription date and let WCS schedule the canonical action.
$subscription->update_dates( array( 'next_payment' => gmdate( 'Y-m-d H:i:s', time() + DAY_IN_SECONDS ) ), 'gmt' );

// WRONG: firing the scheduled hook as an unguarded admin command can race AS.
do_action( 'woocommerce_scheduled_subscription_payment', $subscription_id );

// WRONG: fulfillment at scheduled-payment time, before payment succeeds.
add_action( 'woocommerce_scheduled_subscription_payment', 'provision_customer' );

// RIGHT:
add_action( 'woocommerce_subscription_renewal_payment_complete', 'provision_customer_after_renewal', 10, 2 );
```

## What this skill does NOT cover

- Building the full gateway tokenization/payment-method-change UI.
- General HPOS compatibility for raw order queries. Use `wc-hpos-compatibility`.
- A complete hook catalog. Use `wcs-subscription-hooks` for broader hook selection.

## Cross-references

- Run `wcs-subscription-hooks` when you need a broader action/filter map beyond renewal timing.
- Run `wcs-health-check-processing` when diagnosing the 8.8 Health Check tab, Resolve actions, dedicated processing, or web-cron queue support.
- Run `wc-hpos-compatibility` before writing SQL or `WP_Query` over subscriptions/orders.

## References

- Official documentation: <https://woocommerce.com/document/subscriptions/develop/>
- Verified source paths:
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wcs-action-scheduler.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/abstracts/abstract-wcs-scheduler.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-manager.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-time-functions.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/class-wcs-api.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gateways/class-wc-subscriptions-payment-gateways.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/payment-retry/class-wcs-retry-manager.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php`
  - `wp-content/plugins/woocommerce-subscriptions/src/Internal/Queue_Management/`
  - `wp-content/plugins/woocommerce-subscriptions/src/Internal/HealthCheck/`
