---
name: wc-customer-and-sessions
description: Use WooCommerce customer objects and sessions without confusing checkout-session state with persistent account data. Covers `WC()->customer`, `WC_Customer( $user_id )`, `WC()->session`, cookie creation, shutdown persistence, guest-to-user migration, Cart-Token sessions, safe session values, and the experimental empty-session cleanup. Use when storing cart-flow state, changing billing or shipping data, creating guest sessions, or debugging values that disappear or unexpectedly alter checkout only.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.github.io/code-reference/classes/WC-Customer.html
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-customer.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-session.php
  - wp-content/plugins/woocommerce/includes/class-wc-session-handler.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-customer-data-store-session.php
  - wp-content/plugins/woocommerce/src/StoreApi/SessionHandler.php
  - wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php
---

# WooCommerce customers and sessions

Use this skill whenever code touches the active shopper, account profile, cart-flow state, or Store API session.

## The critical distinction

`WC()->customer` is created in session mode:

```php
new WC_Customer( get_current_user_id(), true );
```

Its data store is `WC_Customer_Data_Store_Session`. Calling `WC()->customer->save()` updates the WooCommerce session for both guests and logged-in users; it does **not** persist account fields to user meta.

To edit a registered customer's durable profile, load a separate non-session object:

```php
$customer = new WC_Customer( $user_id );
$customer->set_billing_phone( $phone );
$customer->save();
```

Never use the active session object as a shortcut for an account-profile write.

## Initialization boundaries

On normal cart and checkout requests WooCommerce initializes `WC()->session`, `WC()->customer`, and `WC()->cart`. They are not guaranteed in early hooks, WP-CLI, cron, arbitrary REST routes, or admin requests.

```php
add_action( 'wp_loaded', static function (): void {
    if ( ! function_exists( 'WC' ) || ! WC()->session ) {
        return;
    }

    $campaign = WC()->session->get( 'myplugin_campaign', '' );
} );
```

Do not call `WC()->initialize_cart()` globally just to make a property non-null. Initialize cart/session state only in a request that genuinely needs shopper state.

## Store plugin state in the session

```php
add_action( 'wp_loaded', static function (): void {
    if ( ! WC()->session ) {
        return;
    }

    WC()->session->set(
        'myplugin_quote',
        array(
            'product_id' => absint( $_POST['product_id'] ?? 0 ),
            'quantity'   => max( 1, absint( $_POST['quantity'] ?? 1 ) ),
        )
    );

    // Must happen before headers are sent. set() marks data dirty; the DB row
    // is written later by save_data(), normally during shutdown.
    WC()->session->set_customer_session_cookie( true );
} );
```

Rules:

- Namespace keys, for example `myplugin_quote`; never reuse core keys such as `cart`, `customer`, or `order_awaiting_payment`.
- Store small scalar/array data. Although values are serialized, avoid service objects, Woo objects, closures, and credentials.
- Treat session values as untrusted input when they reach a write, payment, or authorization decision.
- `set_customer_session_cookie( true )` sets the cookie/flag only. It does not itself create a `wp_woocommerce_sessions` row.
- A row is persisted only when the session is dirty and has a session identity.
- Set cookies before output; calling the method after headers were sent cannot repair the response.

## Read and remove state

```php
$quote = WC()->session ? WC()->session->get( 'myplugin_quote', array() ) : array();

if ( WC()->session ) {
    WC()->session->__unset( 'myplugin_quote' );
}
```

Do not use PHP's native `$_SESSION`. WooCommerce intentionally owns its session lifecycle and storage.

## Checkout customer vs account profile

Use the session customer for request-local tax, address, and checkout calculations:

```php
if ( WC()->customer ) {
    WC()->customer->set_billing_country( 'HU' );
    WC()->customer->set_shipping_postcode( '1051' );
    WC()->customer->save(); // session only
}
```

For durable account updates, verify authorization and use a fresh persistent customer:

```php
if ( get_current_user_id() !== $user_id && ! current_user_can( 'edit_users' ) ) {
    return;
}

$customer = new WC_Customer( $user_id );
$customer->set_billing_country( $country );
$customer->save();
```

## Guest login migration

The classic session handler migrates guest state to the logged-in customer and removes the old guest row when saving. Do not manually copy the whole serialized session into user meta. If plugin state should survive login, keep it under a namespaced session key and test the login transition.

If data should survive across devices or after session expiry, it is not session data. Store it in an owned table, user meta, order meta, or another durable model with an explicit retention policy.

## Classic cookie sessions and Store API Cart-Token

These are related but not interchangeable:

| Surface | Identity | Storage behavior |
|---|---|---|
| Classic frontend | `wp_woocommerce_session_*` cookie | `WC_Session_Handler`; DB table plus object-cache layer and cleanup cron |
| Store API with valid token | `Cart-Token` header | `StoreApi\SessionHandler`; same DB table, no cookie, cron, or cache layer |

Do not parse or mint Cart-Tokens yourself. Let Store API return a `Cart-Token` response header and send it back on later cart requests.

WooCommerce 10.9 can also initialize the classic handler from a valid `?session=<Cart-Token>` query value and clone guest data. Treat Cart-Tokens as bearer credentials: do not log them, place them in analytics URLs, or expose them to unrelated origins.

## Empty-session cleanup

The experimental `destroy-empty-sessions` feature is disabled by default in 10.9.4. When enabled, WooCommerce may remove an empty guest session and cookie to improve page caching. Plugins must not depend on the mere existence of a session cookie; store actual namespaced data when continuity is required.

Do not force empty cookies as a tracking or cache-bypass mechanism.

## Security and concurrency

- A session identifies cart state; it is not an authorization system.
- Validate nonce/authentication, capability, ownership, and business rules at every write endpoint.
- Avoid read-modify-write counters in sessions across parallel AJAX requests; last write can win.
- Never store PAN, CVV, passwords, API secrets, or bearer tokens in session data.
- Regenerate/transition through WooCommerce's own login and logout flow; do not replace session IDs manually.

## Common mistakes

```php
// WRONG: this only changes the active checkout session.
WC()->customer->set_billing_phone( $phone );
WC()->customer->save();

// RIGHT: persistent registered-customer update.
$customer = new WC_Customer( $user_id );
$customer->set_billing_phone( $phone );
$customer->save();

// WRONG: cookie creation is not a DB write and this stores no state.
WC()->session->set_customer_session_cookie( true );

// RIGHT: set namespaced data, then ensure the cookie before headers.
WC()->session->set( 'myplugin_context', array( 'source' => 'quote' ) );
WC()->session->set_customer_session_cookie( true );
```

## Cross-references

- `wc-store-api` for Nonce/Cart-Token request handling.
- `wc-cart-checkout-classic` for cart-item and checkout persistence.
- `wc-payment-tokens` for durable provider-token records; payment tokens do not belong in sessions.

## References

- `WC_Customer` constructor and session flag: `includes/class-wc-customer.php`.
- Session-only customer data store: `includes/data-stores/class-wc-customer-data-store-session.php`.
- Cookie, dirty-write, Cart-Token clone, and empty cleanup behavior: `includes/class-wc-session-handler.php`.
- Header-based Store API handler: `src/StoreApi/SessionHandler.php`.
