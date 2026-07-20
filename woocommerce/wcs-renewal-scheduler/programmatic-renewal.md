# Programmatic WCS renewal-now skeleton

Prefer WooCommerce > Status > Subscriptions > Resolve for merchant remediation. If a plugin truly needs a programmatic command, the following is a skeleton, not a copy-paste endpoint. Add authorization, a durable lock, audit logging, and an idempotency key appropriate to the product.

```php
function myplugin_process_subscription_renewal_now( int $subscription_id ) {
    $subscription = wcs_get_subscription( $subscription_id );

    if ( ! $subscription instanceof WC_Subscription ) {
        return new WP_Error( 'invalid_subscription', 'Subscription not found.' );
    }

    if ( ! $subscription->has_status( array( 'active', 'on-hold' ) ) ) {
        return new WP_Error( 'invalid_status', 'Subscription is not renewable.' );
    }

    $hook  = 'woocommerce_scheduled_subscription_payment';
    $args  = array( 'subscription_id' => $subscription_id );
    $group = 'wc_subscription_scheduled_event';

    $running = ActionScheduler::store()->query_action(
        array(
            'hook'   => $hook,
            'args'   => $args,
            'group'  => $group,
            'status' => ActionScheduler_Store::STATUS_RUNNING,
        )
    );

    if ( $running ) {
        return new WP_Error( 'renewal_running', 'A renewal is already running.' );
    }

    // Add a durable per-subscription lock and a recent/in-flight renewal-order
    // check here. The Health Check tool uses a 60-second recent-order guard.

    try {
        $renewal_order = WC_Subscriptions_Manager::process_renewal(
            $subscription_id,
            $subscription->get_status(),
            'Renewal initiated by My Plugin.'
        );

        if ( ! $renewal_order instanceof WC_Order ) {
            return new WP_Error( 'renewal_not_created', 'No renewal order was created.' );
        }

        // Cancel only after an order exists; exact args/group must match WCS.
        as_unschedule_all_actions( $hook, $args, $group );
        WC_Subscriptions_Payment_Gateways::gateway_scheduled_subscription_payment( $subscription_id );

        return $renewal_order;
    } catch ( Throwable $e ) {
        return new WP_Error( 'renewal_failed', $e->getMessage() );
    } finally {
        // Release the durable command lock here.
    }
}
```

Additional requirements:

- A REST/AJAX wrapper must require authentication, capability/ownership, nonce, and replay-safe idempotency.
- Check recent related renewal orders before entering the flow; do not rely only on order status.
- A distributed cache lock must use atomic add/compare-delete semantics. A plain option read followed by update is not a lock.
- Manual subscriptions create an invoice rather than an off-session charge.
- A gateway supporting `gateway_scheduled_payments` can make `process_renewal()` return false; leave its scheduled action intact.
- Never report success until a renewal order exists; payment success is a separate event.
- Test concurrent HTTP commands and a real Action Scheduler worker.
