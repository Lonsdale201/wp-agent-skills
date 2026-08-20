---
name: wc-abandoned-cart-recovery
description: Integrate with or audit WooCommerce 11.0's experimental abandoned-cart recovery email. Covers feature and email gates, manual versus two-hour automatic sends, eligible order statuses, duplicate-provider suppression, recovery URL filtering, unsubscribe/privacy behavior, Action Scheduler boundaries, HPOS-safe order access, and safe tests. Use when an extension already sends cart recovery mail, needs to suppress Woo duplicates, changes recovery eligibility/URLs, observes recovery sends, or audits pending and checkout-draft orders.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-05"
---

# WooCommerce abandoned-cart recovery

WooCommerce 11.0 adds an experimental `abandoned_cart_recovery` feature. It is disabled by default. When enabled, it registers a customer email, an order-edit manual action, an optional Action Scheduler send, and an unsubscribe endpoint.

This is an email around an existing order, not a generic serialized cart-recovery store. Work through `WC_Order` and public hooks.

## Activation layers

Three independent gates matter:

1. `FeaturesUtil::feature_is_enabled( 'abandoned_cart_recovery' )` must be true.
2. The `customer_abandoned_cart_recovery` email must be enabled.
3. Its `automated` setting must be `yes` for automatic scheduling; manual send can remain available when automation is off.

Do not enable the experimental feature or merchant email settings silently from a distributed extension. If your plugin already owns recovery messages, suppress Woo's flow to prevent duplicates.

## Suppress duplicate recovery providers

WooCommerce detects selected known providers for its settings default, but partner integrations should use the public runtime filter:

```php
add_filter( 'woocommerce_abandoned_cart_recovery_suppress', '__return_true' );
```

Scope the return value to your own recovery feature's enabled state if it can be turned off. Suppression is checked for scheduling, manual availability, and sending. Do not cancel Woo actions or edit its private order meta directly.

## Default lifecycle

Automatic behavior in WooCommerce 11.0:

- listens when a new checkout-created order already has an eligible status;
- defaults scheduling eligibility to `pending`;
- schedules one send two hours after order creation;
- requires the email and its automation setting to be enabled and not suppressed;
- cancels a pending send when the order leaves the eligible statuses or is trashed/deleted;
- re-checks recipient, status, one-hour minimum age, unsubscribe preference, prior send, and email settings at execution time;
- records the send only after the mail transport reports success.

Manual order actions allow both `pending` and `checkout-draft` by default after the one-hour threshold. Store API orders are usually born as `checkout-draft`, so automatic block-checkout recovery is not implied merely because `created_via` can be `store-api`.

Action Scheduler due time is not a delivery SLA. Queue delay, mail transport failure, state changes, and suppression can prevent or postpone a send.

## Eligible status filter

```php
add_filter(
    'woocommerce_abandoned_cart_recovery_eligible_statuses',
    static function ( array $statuses, ?WC_Order $order ): array {
        // Preserve the caller's defaults unless a documented business rule
        // explicitly makes another unpaid status recoverable.
        return array_values( array_unique( array_map( 'sanitize_key', $statuses ) ) );
    },
    10,
    2
);
```

The filter runs in different contexts with different defaults: scheduling starts with `pending`; send/manual eligibility starts with `pending` and `checkout-draft`. Do not replace the array blindly. Adding a paid, canceled, failed, refunded, renewal, admin-created, or privacy-sensitive status can email the wrong customer or leave cancellation semantics surprising.

Use status slugs without the `wc-` prefix. Keep the callback deterministic and side-effect free.

## Recovery URL

Core defaults to the order's checkout-payment URL:

```php
add_filter(
    'woocommerce_abandoned_cart_recovery_url',
    static function ( string $url, WC_Order $order ): string {
        return $url;
    },
    10,
    2
);
```

Treat the URL as a bearer-like customer link because it contains order payment context/key material. Never log it, put it in analytics parameters, cache it publicly, or send it to another customer. A replacement URL must be HTTPS, scoped to that order/recipient, tamper-evident, and time/state constrained; a public cart URL with only an order ID is not equivalent.

## Observe, do not take over internal state

The scheduled action hook is `woocommerce_send_abandoned_cart_recovery_notification` and receives the order ID. Core owns its handler. Observers must not send a second message from the same hook.

Manual sends reuse:

```text
woocommerce_before_resend_order_emails( WC_Order $order, string $email_type )
woocommerce_after_resend_order_email( WC_Order $order, string $email_type )
```

Check `$email_type === 'customer_abandoned_cart_recovery'` before handling. These manual resend hooks are not a reliable event for every automatic attempt.

Do not depend on `_abandoned_cart_recovery_scheduled_at`, `_abandoned_cart_recovery_email_sent_at`, `wc_email_unsubscribes`, or classes under `Automattic\WooCommerce\Internal`. They are implementation details. Keep your provider's idempotency, send state, consent, and suppression decision in your own model.

## Unsubscribe and privacy boundary

Core recovery templates include an HMAC-signed unsubscribe URL. The address is normalized and SHA-256 hashed before entering the URL/table; the email kind is signature-bound. Invalid and successful endpoints both return HTTP 200 to reduce existence disclosure. Core also registers a personal-data eraser.

- Preserve the unsubscribe link in template overrides.
- Never remove or bypass an unsubscribe during manual send.
- Do not copy core's salt/signature or private table as your plugin's consent system.
- If your extension sends independently, own a compliant preference/retention model and honor it before enqueue and again before send.

## Safe test matrix

Use a mail-capture transport and disposable orders. Never send to real customers.

1. Feature off, email off, automation off, and suppression on each produce no automatic send.
2. Eligible classic pending order schedules once; duplicate new-order observation does not duplicate it.
3. Moving out of the eligible set, trashing, or deleting cancels the pending action.
4. Orders too young, lacking a valid billing email, already sent, or unsubscribed do not send.
5. Manual pending and checkout-draft behavior respects capability, age, suppression, and unsubscribe gates.
6. Recovery URLs never leak to logs and cannot be swapped between orders/users.
7. HPOS and legacy compatibility modes use `WC_Order` CRUD only.
8. Queue replay cannot produce duplicate provider mail in an extension-owned flow.

## Cross-references

- `wc-emails-classic` for email class/templates and send observability.
- `wc-action-scheduler-jobs` for delivery and idempotency semantics.
- `wc-order-lifecycle-and-items` for status behavior.
- `wc-store-api` for checkout-draft orders.
- `wc-hpos-compatibility` for order storage.

## References

- `includes/emails/class-wc-email-customer-abandoned-cart-recovery.php`
- `src/Internal/AbandonedCartRecovery/Scheduler.php` (implementation evidence only)
- `src/Internal/AbandonedCartRecovery/ManualSendHandler.php` (implementation evidence only)
- `src/Internal/Email/Unsubscribes/*` (implementation evidence only)
- `src/Internal/Features/FeaturesController.php`

