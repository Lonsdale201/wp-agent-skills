---
name: wcs-rest-api
description: Integrate with WooCommerce Subscriptions REST API v3. Covers subscription CRUD, status versus transition_status, GMT schedule fields, payment_details validation, related-order and order-to-subscriptions routes, notes, batch operations, creating subscriptions from an order, HPOS-safe behavior, APFS plan route boundaries, authentication, idempotency, and Store API separation. Use for /wc/v3/subscriptions, headless subscription administration, external subscription sync, or code attempting to expose subscription writes through the Store API.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce Subscriptions REST API

Use the latest `wc/v3` controllers for new admin/server integrations. WCS also registers v1/v2 and a legacy WC API for compatibility; do not choose them for new work.

## API boundary

The WCS REST API is an authenticated store-management API. It is not a shopper-facing subscription-management API and it is not the Woo Store API.

- Server/admin API: `/wp-json/wc/v3/subscriptions...`
- Shopper cart/checkout API: `/wp-json/wc/store/v1...`
- APFS plan management: authenticated `wc/v3` routes

Never expose Woo consumer secrets in a browser or mobile app. A customer portal needs your own authenticated REST controller that checks subscription ownership/capabilities and calls WCS domain methods.

## Route map

WCS 9.0 registers:

| Method | Route | Purpose |
|---|---|---|
| `GET`, `POST` | `/wc/v3/subscriptions` | List/create subscriptions. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/wc/v3/subscriptions/<id>` | Read/update/delete one subscription. |
| `POST` | `/wc/v3/subscriptions/batch` | Batch create/update/delete. |
| `GET` | `/wc/v3/subscriptions/statuses` | Public status labels; no subscription data. |
| `GET` | `/wc/v3/subscriptions/<id>/orders` | Related parent/renewal/switch/resubscribe orders. |
| `GET`, `POST` | `/wc/v3/orders/<order_id>/subscriptions` | Read subscriptions for an order or create them from eligible order items. |
| REST note methods | `/wc/v3/subscriptions/<id>/notes[/<note_id>]` | Subscription notes. |

Plan routes are separate:

- `/wc/v3/subscriptions/storewide-plans`
- `/wc/v3/products/<product_id>/subscription-plans`

Use `wcs-subscription-plans-apfs` for plan payloads. A subscription resource is not a plan resource.

## Authentication and permissions

Use WooCommerce REST authentication over HTTPS or trusted WordPress application authentication. Controllers inherit Woo order permission checks; write operations require suitable order-management capabilities.

The statuses route intentionally permits public reads because it contains labels only. Do not infer that subscription collection/item routes are public.

A custom customer endpoint must additionally require:

```php
$subscription = wcs_get_subscription( $subscription_id );

if ( ! $subscription
    || (int) $subscription->get_user_id() !== get_current_user_id()
    || ! current_user_can( 'view_order', $subscription->get_id() )
) {
    return new WP_Error( 'forbidden', 'Not allowed.', array( 'status' => 403 ) );
}
```

Use the action-specific WCS capability for cancel/suspend/change-payment rather than reusing `view_order` as write permission.

## Subscription fields

WCS extends the Woo order schema with:

- `billing_period`, `billing_interval`, `trial_period`
- `suspension_count`, `requires_manual_renewal`
- `start_date`, `trial_end_date`, `next_payment_date`, `cancelled_date`, `end_date`
- `transition_status`
- `payment_details`
- removed/switched item projections and related subscription fields

Schedule fields are GMT date-times, but WCS 9.0 passes write values directly to `WC_Subscription::update_dates()`. Therefore request values must use UTC MySQL format `Y-m-d H:i:s` even though the REST schema says `date-time` and responses are REST-formatted. An RFC 3339 value such as `2026-08-10T10:00:00Z` passes generic REST schema validation but WCS rejects it during object preparation.

Do not send `_schedule_next_payment` in `meta_data`. That bypasses the intended schema and can desynchronize scheduled actions.

## `status` versus `transition_status`

These are not equivalent:

- `status` uses `set_status()` while preparing the object. It sets storage state without running the full transition side-effect path.
- `transition_status` uses `update_status()` and runs WCS lifecycle/date/status behavior.

Use `transition_status` for a real operational transition such as activating, placing on hold, or cancelling an existing subscription. Use `status` only when deliberately setting imported/initial state and you understand which side effects are skipped.

Do not update `post_status`, HPOS order rows, or status meta outside the controller/object API.

## Creating directly

A direct `POST /wc/v3/subscriptions` must provide coherent customer, currency, billing schedule, dates, items, addresses, and payment context. Creation does not magically perform an initial provider charge.

Minimal conceptual body:

```json
{
  "customer_id": 123,
  "billing_period": "month",
  "billing_interval": 1,
  "start_date": "2026-07-10 10:00:00",
  "next_payment_date": "2026-08-10 10:00:00",
  "requires_manual_renewal": true,
  "line_items": [
    { "product_id": 456, "quantity": 1, "subtotal": "20.00", "total": "20.00" }
  ]
}
```

For automatic renewal, do not invent gateway metadata. Use a gateway-supported payment-method setup/change flow and then set validated `payment_method` plus `payment_details` in the shape provided by `woocommerce_subscription_payment_meta`.

## Payment details

When `payment_method` is supplied, the controller calls gateway/WCS payment-meta validation. The schema separates `post_meta` and `user_meta`; exact keys are gateway-specific. For Stripe, use the installed Stripe change-payment flow rather than posting guessed `_stripe_customer_id`/`_stripe_source_id` values.

The generic validation action receives three arguments:

```php
add_action(
    'woocommerce_subscription_validate_payment_meta',
    function ( string $gateway_id, array $payment_meta, WC_Subscription $subscription ): void {
        // Throw on invalid data.
    },
    10,
    3
);
```

The dynamic `woocommerce_subscription_validate_payment_meta_{gateway_id}` action receives only payment meta and subscription.

## Create subscriptions from an order

`POST /wc/v3/orders/<order_id>/subscriptions` converts eligible subscription-product order items into one or more subscriptions grouped by recurring schedule.

Guards/behavior:

- The order must exist and have a customer.
- It must not already have subscriptions associated with it.
- No eligible subscription items returns HTTP 204.
- WCS uses an SQL transaction where available, enabling retry after rollback.
- It derives schedule/product data, copies addresses/payment/meta, removes sign-up fee/trial-only amounts from recurring item totals, and copies recurring coupons/shipping/fees.
- Paid order creates active subscriptions; unpaid order creates pending subscriptions.

This route is safer than hand-copying an existing order, but your client still needs request idempotency and reconciliation for network timeouts. After an ambiguous response, query `/orders/<id>/subscriptions` before retrying.

## Updating line items and totals

The controller uses Woo order-item APIs and supports line/shipping/fee data. Quantity zero or a null item can remove an existing item.

WCS 9.0 does not reapply product sign-up fees when Woo's Orders REST API updates line items on renewal, resubscribe, or switch orders. Do not add the fee in a custom `woocommerce_rest_set_order_item` callback; it belongs to the initial purchase.

After structural edits, validate totals, tax, shipping, next payment, renewal amount, downloads/entitlements, and gateway compatibility. A syntactically valid REST response does not prove a commercially valid recurring contract.

## Idempotency and concurrency

- Persist an external request/event ID on the subscription with a unique application-level constraint or atomic lock.
- Search/reconcile before creating after timeout.
- Do not use `meta_data` existence checks without atomicity.
- Serialize schedule/payment-method commands per subscription.
- Never fire `woocommerce_scheduled_subscription_payment` from a generic REST update.
- Use WCS renewal success/failure hooks for downstream provisioning.

## Local discovery

Confirm routes on the installed version:

```bash
wp eval '$routes = rest_get_server()->get_routes(); foreach ( array_keys( $routes ) as $route ) { if ( 0 === strpos( $route, "/wc/v3/subscriptions" ) ) { echo $route, PHP_EOL; } }'
wp wc shop_subscription list --user=<admin-id> --format=ids
```

The Woo WP-CLI resource name is `shop_subscription`. `--user` is a WordPress user ID/login/email for local capability context, not a REST consumer key.

## Common mistakes

- Using Store API cart tokens to call management routes.
- Using v1/v2 for new integrations because an old example does.
- Posting raw `_schedule_*` meta instead of date fields.
- Using `status` when transition side effects are required.
- Guessing gateway payment meta or attaching a token owned by another customer.
- Treating `POST /subscriptions` as payment capture.
- Retrying create after timeout without querying for the first result.
- Editing renewal order items and re-adding sign-up fees.

## Cross-references

- Use `wcs-data-model-switching-gifting` for subscription and related-order storage.
- Use `wcs-renewal-scheduler` for date scheduling and renewal commands.
- Use `wcs-subscription-hooks` for lifecycle and payment-meta hooks.
- Use `wcs-subscription-plans-apfs` for plan management routes.
- Use `wc-store-api` for shopper cart/checkout requests.
- Use `wc-stripe-subscriptions` for Stripe automatic renewal/payment-method setup.

## References

- Verified source paths:
  - `wp-content/plugins/woocommerce-subscriptions/includes/class-wcs-api.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/api/class-wc-rest-subscriptions-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/api/class-wc-rest-subscription-notes-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/api/v2/class-wc-rest-subscriptions-v2-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/admin/class-wcs-att-rest-plans-controller.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/admin/class-wcs-att-rest-product-plans-controller.php`
