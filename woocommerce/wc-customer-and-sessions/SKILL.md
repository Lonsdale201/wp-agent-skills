---
name: wc-customer-and-sessions
description: Use WooCommerce's customer and session APIs correctly — WC
  ships its own session handler (WC_Session_Handler, single
  wp_woocommerce_sessions table for both guests and logged-in users)
  and its own customer object (WC_Customer via WC()->customer). Avoid
  $_SESSION, direct setcookie, and user_meta for guest/session state.
  Use WC()->session->set/get for ephemeral visitor data,
  WC()->customer->get_billing_* for active customer context including
  guests, and new WC_Customer($user_id) for one-off loads. WC()->session
  auto-inits only on frontend/admin-ajax; REST, cron, and WP-CLI must
  call wc_load_cart() explicitly, while Store API cart/checkout routes
  can use Cart-Token sessions. Use when storing per-visitor state,
  reading billing data, or debugging session loss across cache/REST/cron.
  Triggers on WC_Session, WC_Session_Handler, WC_Customer,
  WC()->session, WC()->customer, wp_woocommerce_sessions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.0"
php-min: "7.4"
last-updated: "2026-05-26"
docs:
  - https://woocommerce.com/document/woocommerce-data-storage/
source-refs:
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-session.php
  - wp-content/plugins/woocommerce/includes/class-wc-session-handler.php
  - wp-content/plugins/woocommerce/includes/class-wc-customer.php
  - wp-content/plugins/woocommerce/includes/class-wc-cart-session.php
  - wp-content/plugins/woocommerce/includes/class-woocommerce.php
  - wp-content/plugins/woocommerce/includes/wc-core-functions.php
  - wp-content/plugins/woocommerce/src/StoreApi/Authentication.php
  - wp-content/plugins/woocommerce/src/StoreApi/SessionHandler.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/AbstractCartRoute.php
  - wp-content/plugins/woocommerce/src/StoreApi/Utilities/CartController.php
---

# WooCommerce: customer and session APIs

For plugins that store per-visitor data (cart-adjacent state, in-progress form, last-viewed product, A/B variant), or read / mutate the current customer's address / email pre-checkout. WC has its own session and customer abstractions that look optional but aren't — using `$_SESSION`, `setcookie`, or WP-user-meta directly for these breaks across page caching, REST, AJAX, cron, and guest contexts.

## Misconception this skill corrects

> "I'll use `$_SESSION['my_data']` to remember the visitor's choice across pages."

Three different ways this fails:

1. **Page caching plugins** (WP Rocket, W3 Total Cache, hosted edge cache) bypass PHP entirely on cached pages. `$_SESSION` is never written / read for those visitors.
2. **WP REST API** doesn't start a session unless something explicitly does. Your AJAX call has no `$_SESSION` even when the previous page wrote to it.
3. **Guests** have no `$user_id`, so user meta isn't an option either.

The right path: WC ships its own session handler with cookie-based identity (separate from WP login cookies), backed by the single `wp_woocommerce_sessions` custom table — for both guests AND logged-in users. The cookie keeps the visitor identifier across pages and the row persists per-customer in the table.

Important — auto-initialization is **frontend-only**. `WC::init()` (registered on hook `init` priority 0, see [class-woocommerce.php:323](class-woocommerce.php) and [class-woocommerce.php:944-946](class-woocommerce.php)) calls `wc_load_cart()` only when `is_request('frontend')` is true. That predicate ([class-woocommerce.php:645](class-woocommerce.php)) excludes REST, cron, and WP-CLI; it includes admin-ajax (`DOING_AJAX`) and regular page loads. Code running under `/wp-json/`, `wp_cron`, or `wp` CLI must call `wc_load_cart()` (or `WC()->initialize_session()`) explicitly before reading `WC()->session`. Store API routes do this themselves — see [src/StoreApi/Utilities/CartController.php:30-33](CartController.php).

## When to use this skill

Trigger when ANY of the following is true:

- Storing cart-adjacent ephemeral data (selected gift wrap option, A/B test variant, "viewed but not purchased" tracking, multi-step checkout state).
- Reading the current customer's billing / shipping address before they place an order.
- Reviewing code that uses `$_SESSION`, `session_start()`, `setcookie`, or direct `wp_woocommerce_sessions` table writes in WC context.
- Debugging "session is lost on the next page" / "cart empties when page cache warms" / "AJAX call doesn't see session data".
- The diff or file contains: `WC_Session`, `WC_Session_Handler`, `WC_Customer`, `WC()->session`, `WC()->customer`, `$_SESSION` next to WC code.

## Mental model — three layers

| Layer | Class / API | What it stores | Lifetime |
|---|---|---|---|
| **Visitor session** | `WC()->session` (`WC_Session_Handler`) | Arbitrary key/value data per visitor (cart contents, applied coupons, custom plugin state). Cookie-based identity. | Default 2 days for guests, 7 days for logged-in users (filterable via `wc_session_expiration`). |
| **Active customer context** | `WC()->customer` (`WC_Customer`) | Billing / shipping address, email, display name FOR THE CURRENT REQUEST. Logged-in users persist across requests via user meta; guests persist via session. | Until logout / session expiry. |
| **Customer object (one-off)** | `new WC_Customer( $user_id )` | A specific user's WC profile data. | One-off load; you save it explicitly. |

The three are related but distinct. Most plugin code that "needs the customer's email" wants `WC()->customer->get_billing_email()`. Most plugin code that needs to remember a visitor choice across pages wants `WC()->session->set('my_key', $value)`. The third (loading another user's profile) is rarer.

## `WC()->session` — visitor session API

The session handler ([includes/class-wc-session-handler.php](class-wc-session-handler.php)) wraps the abstract `WC_Session` ([includes/abstracts/abstract-wc-session.php](abstract-wc-session.php)). Identity comes from a cookie named `wp_woocommerce_session_<COOKIEHASH>` set on the first page that touches the session.

### Reading and writing

```php
// Set a value
WC()->session->set( 'myplugin_step', 'step_2' );
WC()->session->set( 'myplugin_choices', array( 'option_a' => true, 'option_b' => false ) );

// Read with a default
$step    = WC()->session->get( 'myplugin_step', 'step_1' );
$choices = (array) WC()->session->get( 'myplugin_choices', array() );

// Remove
WC()->session->__unset( 'myplugin_step' );
// OR equivalently
unset( WC()->session->myplugin_step );
```

Values can be any serializable PHP type — arrays, objects (be careful with PHP class compatibility), scalars. The handler serializes them when writing to storage.

### Storage details (verified)

- **Session payload (both guests and logged-in users)**: serialized into the `wp_woocommerce_sessions` custom table — a single `INSERT ... ON DUPLICATE KEY UPDATE` keyed by `session_key` (= customer ID for logged-in users, generated guest ID otherwise). Verified at [class-wc-session-handler.php:561-575](class-wc-session-handler.php) (`save_data()`).
- **Persistent cart (logged-in users only)**: a separate user-meta entry keyed `_woocommerce_persistent_cart_<blog_id>` storing only the cart contents, written by `WC_Cart_Session::persistent_cart_update()` ([class-wc-cart-session.php:458-471](class-wc-cart-session.php)). This is NOT the session payload — it lives in user meta and persists across logins so a returning user finds their cart re-hydrated. Filter `woocommerce_persistent_cart_enabled` to disable.
- **Default expiry**: guest = `2 * DAY_IN_SECONDS`, logged-in = `WEEK_IN_SECONDS`. Verified at [class-wc-session-handler.php:401-403](class-wc-session-handler.php): `$default_expiration_seconds = is_user_logged_in() ? WEEK_IN_SECONDS : 2 * DAY_IN_SECONDS;`. Filter `wc_session_expiration` to override.
- **Cache layer**: an object-cache `wp_cache_set()` writes the session into `WC_SESSION_CACHE_GROUP` on save — so persistent object-cache backends (Redis, Memcached) shortcut DB reads.
- **Cleanup**: WC schedules a recurring action (`woocommerce_cleanup_sessions`, see Action Scheduler) to purge expired rows from `wp_woocommerce_sessions`.

### When the session is initialized

`WC::init()` runs on hook `init` priority 0 ([class-woocommerce.php:323](class-woocommerce.php)) and calls `wc_load_cart()` only when `is_request('frontend')` is true ([class-woocommerce.php:944-946](class-woocommerce.php)). `wc_load_cart()` then calls `WC()->initialize_session()` and `WC()->initialize_cart()` ([wc-core-functions.php:2526-2527](wc-core-functions.php)).

Concretely:

| Request type | `WC()->session` auto-initialized? | Why |
|---|---|---|
| Regular frontend page | Yes | `is_request('frontend')` is true |
| `admin-ajax.php` (`DOING_AJAX`) | Yes | `is_request('frontend')` returns true when `DOING_AJAX` is defined |
| `/wp-json/...` (REST) | **No** | `is_request('frontend')` returns false for REST (`is_rest_api_request()`) |
| Store API (`/wp-json/wc/store/...`) | Yes — but only because the route calls `wc_load_cart()` itself ([CartController.php:30-33](CartController.php)) |
| `wp_cron` (`DOING_CRON`) | **No** | `is_request('frontend')` excludes cron |
| `wp` CLI | **No** | `is_request('frontend')` excludes CLI |
| wp-admin (no AJAX) | **No** | `is_request('frontend')` excludes admin |

If your code runs in a context where the session is not auto-initialized AND you need session data, call `wc_load_cart()` (or `WC()->initialize_session()` if you don't need the cart):

```php
if ( ! did_action( 'wc_loaded' ) ) return; // WC must be loaded
if ( null === WC()->session ) {
    wc_load_cart(); // or WC()->initialize_session(); for session-only
}
$value = WC()->session->get( 'myplugin_key' );
```

Even after init, `WC()->session->has_session()` may be false (no cookie set yet because the visitor hasn't triggered anything that would set one). To force the cookie + table row for an anonymous tracking flow:

```php
add_action( 'wp', static function (): void {
    if ( ! WC()->session ) return;
    if ( WC()->session->has_session() ) return;
    WC()->session->set_customer_session_cookie( true );
} );
```

`set_customer_session_cookie( true )` writes the cookie and creates the row in `wp_woocommerce_sessions`.

### Store API Cart-Token sessions

Store API cart and checkout routes are the exception to the "REST has no auto-loaded session" rule. The route calls `wc_load_cart()` and sends session headers back on each cart response:

- `Nonce` / `Nonce-Timestamp` for same-site cookie flows.
- `Cart-Token` for headless flows that should identify the cart without relying on browser cookies.
- `Cart-Hash`, `User-ID`, and `Cache-Control: no-store`.

For write requests (`POST`, `PUT`, `PATCH`, `DELETE`) the Store API requires the `Nonce` header unless the request includes a valid `Cart-Token`. When a valid `Cart-Token` is present, WooCommerce swaps the session handler to `Automattic\WooCommerce\StoreApi\SessionHandler` for that request.

Do not copy the Store API session handler into arbitrary custom REST routes. If the endpoint is cart/checkout/customer-facing, prefer Store API extension points (`/cart/extensions`, endpoint data callbacks). If it is your own REST route, call `wc_load_cart()` explicitly and enforce your own authentication/authorization.

### Common usage pattern

```php
// On a custom AJAX endpoint or page hit:
$tracking = (array) WC()->session->get( 'myplugin_tracking', array() );
$tracking['last_viewed_product'] = $product_id;
$tracking['last_seen_at']        = time();
WC()->session->set( 'myplugin_tracking', $tracking );

// Later, perhaps in a checkout filter:
$tracking = (array) WC()->session->get( 'myplugin_tracking', array() );
if ( ! empty( $tracking['last_viewed_product'] ) ) {
    // attach to order, send to analytics, etc.
}
```

The session is request-scoped (in-memory) AND persisted (to storage on shutdown). Multiple `set` calls in the same request just update the in-memory copy; the actual DB write happens once on shutdown via `save_data()`.

## `WC()->customer` — active customer context

`WC()->customer` returns the `WC_Customer` for the current visitor (logged-in user or guest). The instance is hydrated from:
- The logged-in user's `WC_Customer` data (user meta), if they're logged in.
- The session-stored customer fields, if a guest with active session.
- Defaults (store country, etc.), otherwise.

### Reading address / email

```php
$customer = WC()->customer;

$email          = $customer->get_billing_email();
$first_name     = $customer->get_billing_first_name();
$country        = $customer->get_billing_country();
$shipping_state = $customer->get_shipping_state();

// Convenience
$is_vat_exempt  = $customer->is_vat_exempt();
```

These work for guests too — WC promotes session-stored billing fields onto the customer object.

### Writing address / email

```php
WC()->customer->set_billing_email( 'visitor@example.com' );
WC()->customer->set_billing_country( 'HU' );
WC()->customer->save(); // for logged-in users; guests save via session
```

For logged-in users, `save()` writes to user meta. For guests, the values flow back into `WC()->session` automatically — calling `save()` on a guest customer is harmless but unnecessary.

### One-off loading another user

```php
$customer = new WC_Customer( $user_id );
$email    = $customer->get_billing_email();
// Modify and save:
$customer->set_billing_phone( '+36 1 234 5678' );
$customer->save();
```

This loads from user meta directly and saves back. Doesn't touch the session.

## Critical rules

- **Don't use `$_SESSION` in WC plugin code.** It's broken with page caching, REST, AJAX, and cron contexts.
- **Don't use `setcookie` directly for visitor data.** No signing, no expiry handshake, no automatic cleanup. Use `WC()->session` instead.
- **Don't use `update_user_meta` for guest data.** Guests have no `$user_id`.
- **`WC()->session` auto-init is frontend-only.** REST, cron, and CLI must call `wc_load_cart()` (or `WC()->initialize_session()`) before reading the session. Don't assume `WC()->session` is non-null in those contexts.
- **Store API Cart-Token is not a generic WC session token.** It is valid for Store API cart/checkout routes; custom REST routes still need explicit bootstrapping and permission checks.
- **Code running before hook `init` priority 0 cannot use `WC()->session`** — that's where `WC::init()` runs and conditionally creates the handler. `plugins_loaded` is too early.
- **Force a session with `set_customer_session_cookie( true )`** if you need persistence for empty-cart visitors (e.g. tracking) — `set` alone does not write the cookie.
- **Namespace all session keys with your plugin slug.** `myplugin_*` — without prefix you collide with WC core (`'cart'`, `'shipping_methods'`, `'customer'`, etc.) or other plugins.
- **Storable types only.** Don't put closures or non-serializable objects into the session — fatal on `unserialize`.
- **`WC()->customer` IS the right way to read the current visitor's billing email**, even when they're not logged in. Don't reach for `$_POST['billing_email']` or `wp_get_current_user()->user_email` — those are checkout-form-time and account-time values, which differ.
- **Session expiry differs by login state.** Default 2 days for guests, 7 days for logged-in users. Filter `wc_session_expiration` to change. Don't store data that needs to last weeks in the session.
- **The session payload lives in `wp_woocommerce_sessions` for everyone** (guest and logged-in alike). The `_woocommerce_persistent_cart_<blog_id>` user meta is a SEPARATE, cart-only persistence layer for logged-in users — don't confuse the two.
- **`WC()->session->save_data()` is automatic on shutdown.** Don't call it manually unless you specifically need an early flush (rare).
- **Cron, CLI, and REST contexts have no auto-loaded session.** Code running under `WP_CLI`, `wp_cron`, or `/wp-json/` does not have `WC()->session` populated by default — you'll get null. Either bootstrap explicitly, or design the flow not to need a visitor session there.

## Common mistakes

```php
// WRONG — $_SESSION breaks with page caching, REST, AJAX
session_start();
$_SESSION['myplugin_choice'] = $choice;

// RIGHT
WC()->session->set( 'myplugin_choice', $choice );

// WRONG — direct cookie, no signing, leaks across user agents
setcookie( 'myplugin_data', wp_json_encode( $data ), time() + DAY_IN_SECONDS );

// RIGHT — session handles cookie + signing + cleanup
WC()->session->set( 'myplugin_data', $data );

// WRONG — user_meta for guest data
update_user_meta( get_current_user_id(), 'myplugin_data', $data );
// get_current_user_id() returns 0 for guests; update_user_meta(0, ...) silently fails.

// RIGHT
WC()->session->set( 'myplugin_data', $data );

// WRONG — accessing session before WC initializes it
add_action( 'plugins_loaded', function () {
    $value = WC()->session->get( 'foo' ); // WC()->session is null at plugins_loaded
} );

// RIGHT — wait for init or later
add_action( 'init', function () {
    if ( ! WC()->session ) return; // null in REST/cron/CLI even after init
    $value = WC()->session->get( 'foo' );
}, 10 );

// WRONG — assuming the session exists in a REST endpoint
register_rest_route( 'myplugin/v1', '/state', array(
    'callback' => function () {
        return WC()->session->get( 'foo' ); // null in REST — fatal
    },
) );

// RIGHT — bootstrap explicitly in REST
register_rest_route( 'myplugin/v1', '/state', array(
    'callback' => function () {
        if ( null === WC()->session ) {
            wc_load_cart(); // brings up session + cart
        }
        return WC()->session->get( 'foo' );
    },
) );

// WRONG — no namespace prefix on key
WC()->session->set( 'cart', $stuff );
// Collides with WC core's 'cart' key — corrupts cart contents.

// RIGHT
WC()->session->set( 'myplugin_cart_meta', $stuff );

// WRONG — stuffing closures or non-serializable objects
WC()->session->set( 'myplugin_callback', function () { /* ... */ } );
// Fatal on next request.

// WRONG — assuming wp_get_current_user matches WC()->customer
$email = wp_get_current_user()->user_email;
// For a guest mid-checkout, this is empty string. WC()->customer->get_billing_email()
// returns the billing email they typed into the checkout form, even pre-submit.

// RIGHT — for "the customer's email in the active checkout context"
$email = WC()->customer->get_billing_email();

// WRONG — reading session in cron / WP-CLI and expecting visitor data
add_action( 'wp_scheduled_event', function () {
    $value = WC()->session->get( 'foo' ); // always default; no visitor cookie in cron context
} );
```

## Forcing a guest session — the analytics use case

If your plugin tracks visitor behavior across pages even when the cart is empty, you need to force the session to start:

```php
add_action( 'wp', static function (): void {
    // Some condition — e.g. visitor on a tracked landing page
    if ( ! is_singular( 'product' ) ) return;
    if ( ! WC()->session ) return;
    if ( WC()->session->has_session() ) return;

    WC()->session->set_customer_session_cookie( true );
} );
```

Without this, `WC()->session->get( 'myplugin_*' )` returns the default for empty-cart guests because there's no row to read from. Calling `set` on its own does NOT initialize the cookie — `set_customer_session_cookie( true )` is the explicit init.

## Reading from the customer object (post-checkout context)

After an order is placed, prefer reading from the order, not the session — sessions are visitor-scoped and the data may be the NEXT visitor's by the time your async handler runs:

```php
// WRONG in an async webhook handler
$email = WC()->customer->get_billing_email();
// At webhook receive time, WC()->customer is the receiver's session customer,
// not the original buyer.

// RIGHT
$order = wc_get_order( $order_id );
$email = $order->get_billing_email();
```

`WC()->customer` is for the active page-render context. For order-tied work, read from `$order` directly.

## Cross-references

- Run **`wc-payment-gateway`** when payment processing reads / mutates the customer or session — payment gateways use both heavily.
- Run **`wc-store-api`** for Cart-Token, Nonce, `/cart/extensions`, and Store API endpoint-data extension points.
- Run **`wc-hpos-compatibility`** for any meta you also store on orders — orders go through HPOS, sessions don't.
- Run **`wp-plugin-options-storage`** when deciding what data goes in the session vs in user meta vs in custom tables — session is for ephemeral, options/meta for durable.

## What this skill does NOT cover

- Custom session handlers (replacing `WC_Session_Handler` entirely via the `woocommerce_session_handler` filter). Niche; the default handler suits 99% of plugins.
- WC's REST API customer endpoints (`/wc/v3/customers`, `/wc/v4/customers`). Sibling skill `wc-rest-api-v4` covers REST.
- Login / authentication flow, "Remember me" cookies, social login plugins. WP-level concerns; WC consumes the resolved current user.
- Multi-currency per-session selection — usually handled by the multi-currency plugin's own filter chain, not directly via session.
- PII compliance (GDPR data export / erasure) on session data — WC's privacy export tools cover the standard fields; custom session keys need their own export hook.
- WP-CLI / cron contexts that need to "log in as user" — use `wp_set_current_user()` explicitly; that doesn't restore a WC session.

## References

- Abstract: [wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-session.php](abstract-wc-session.php) — `WC_Session` data + getter/setter contract.
- Default handler: [wp-content/plugins/woocommerce/includes/class-wc-session-handler.php](class-wc-session-handler.php) — cookie-based, single-table-backed for both guests and logged-in users. `init_session_cookie()` line 164, `set_customer_session_cookie( bool )` line 350, `set_session_expiration()` line 401 (guest 2 days, logged-in 7 days), `save_data()` line 561 (writes to `wp_woocommerce_sessions`), `get_session()` line 666.
- Frontend-only auto-init: [wp-content/plugins/woocommerce/includes/class-woocommerce.php:944-946](class-woocommerce.php) — `if ( $this->is_request( 'frontend' ) ) { wc_load_cart(); }` inside `WC::init()`.
- `is_request('frontend')` predicate: [wp-content/plugins/woocommerce/includes/class-woocommerce.php:645](class-woocommerce.php) — true for non-admin OR `DOING_AJAX`, AND not cron, AND not REST.
- `wc_load_cart()`: [wp-content/plugins/woocommerce/includes/wc-core-functions.php:2515-2528](wc-core-functions.php) — calls `WC()->initialize_session()` then `WC()->initialize_cart()`. Use this from REST/cron/CLI when you need the session.
- Store API cart-session headers and nonce rules: [wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/AbstractCartRoute.php](AbstractCartRoute.php).
- Store API session handler swap on Cart-Token: [wp-content/plugins/woocommerce/src/StoreApi/Authentication.php](Authentication.php) and [wp-content/plugins/woocommerce/src/StoreApi/SessionHandler.php](SessionHandler.php).
- Persistent-cart user meta: [wp-content/plugins/woocommerce/includes/class-wc-cart-session.php:458-471](class-wc-cart-session.php) — `_woocommerce_persistent_cart_<blog_id>` is logged-in-only and stores cart contents only, separate from the session payload.
- Customer class: [wp-content/plugins/woocommerce/includes/class-wc-customer.php](class-wc-customer.php) — extends `WC_Legacy_Customer`, holds billing / shipping / VAT-exempt state.
- Session handler swap filter: [wp-content/plugins/woocommerce/includes/class-woocommerce.php](class-woocommerce.php) — `apply_filters( 'woocommerce_session_handler', 'WC_Session_Handler' )` at the WC singleton's session getter.
- Sessions table: created during WC activation; verify with `SHOW TABLES LIKE 'wp_woocommerce_sessions';` on a live install.
