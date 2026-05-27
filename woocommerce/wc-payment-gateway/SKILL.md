---
name: wc-payment-gateway
description: >
  Register a custom WooCommerce payment gateway — extend
  WC_Payment_Gateway, declare $id / $title / $supports, implement
  process_payment returning array(result, redirect), optionally
  process_refund when refunds is in supports, register via the
  woocommerce_payment_gateways filter. Canonical gotcha:
  payment_complete vs update_status — payment_complete runs the paid-order
  state machine (status, transaction id, session flag, payment-complete
  action), update_status only changes status. Includes the forgotten
  WC()->cart->empty_cart() call and Store API payment requirements for
  Checkout Blocks. Use when integrating/reviewing gateways or debugging
  "payment succeeded but cart didn't clear" / "order stuck in pending". Triggers on
  WC_Payment_Gateway, woocommerce_payment_gateways, process_payment,
  process_refund, payment_complete, get_return_url,
  woocommerce_payment_complete_order_status,
  woocommerce_store_api_register_payment_requirements.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.0"
php-min: "7.4"
last-updated: "2026-05-26"
docs:
  - https://woocommerce.com/document/payment-gateway-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-payment-gateway.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-settings-api.php
  - wp-content/plugins/woocommerce/includes/class-wc-payment-gateways.php
  - wp-content/plugins/woocommerce/includes/class-wc-order.php
  - wp-content/plugins/woocommerce/includes/gateways/bacs/class-wc-gateway-bacs.php
  - wp-content/plugins/woocommerce/includes/gateways/cheque/class-wc-gateway-cheque.php
  - wp-content/plugins/woocommerce/includes/gateways/cod/class-wc-gateway-cod.php
  - wp-content/plugins/woocommerce/includes/class-woocommerce.php
  - wp-content/plugins/woocommerce/src/StoreApi/Schemas/ExtendSchema.php
  - wp-content/plugins/woocommerce/assets/client/blocks/wc-blocks-registry.js
---

# WooCommerce: register a custom payment gateway

For plugins that integrate a payment provider (Stripe, Braintree, a national bank, a private gateway, an offline method) into WooCommerce. The skill covers the full flow: registration, settings, checkout rendering, payment processing, refunds, and the order status state machine — all source-verified against the WC 10.7 abstract and built-in BACS / cheque / COD reference implementations.

## Misconception this skill corrects

> "I'll call `update_status( 'completed' )` after the API charges the card."

`payment_complete()` and `update_status()` are not the same thing. AI consistently uses `update_status` because it sounds more direct, then debugs for hours when:
- The order shows the right status but the customer email never sent.
- Stock didn't decrease.
- The "order_awaiting_payment" session flag stays true and the user can re-pay.
- The transaction ID doesn't get stored as order meta.
- Reports / analytics don't pick the order up as paid.

`$order->payment_complete( $transaction_id )` ([includes/class-wc-order.php](class-wc-order.php)) is the canonical "payment succeeded" call. It runs the full lifecycle: clears the session flag, sets the next status via the `woocommerce_payment_complete_order_status` filter (`processing` if the order needs processing, `completed` for digital-only), records the transaction_id, adds an order note, fires `woocommerce_payment_complete` action, saves. `update_status` is for everything else (`on-hold` while awaiting confirmation, `failed` on capture decline, etc.).

## When to use this skill

Trigger when ANY of the following is true:

- Integrating a new payment provider with WooCommerce.
- Reviewing PR code that touches `WC_Payment_Gateway`, `process_payment`, `process_refund`, or any of the `woocommerce_payment_*` hooks.
- Debugging "the customer was charged but the order is still pending" / "cart didn't empty after payment" / "refund button doesn't appear in admin".
- Migrating a v1-style gateway plugin (pre-WC 2.6) to modern conventions.
- Adding refund support to an existing gateway.

## Architecture in one paragraph

A gateway is a PHP class extending `WC_Payment_Gateway` ([includes/abstracts/abstract-wc-payment-gateway.php:31](abstract-wc-payment-gateway.php), itself extending `WC_Settings_API`), registered via the `woocommerce_payment_gateways` filter ([includes/class-wc-payment-gateways.php:92](class-wc-payment-gateways.php)). The class declares an `$id`, settings via `init_form_fields()`, customer-facing checkout via `payment_fields()`, and processes payment via `process_payment( $order_id )` returning an array of `result` (`'success'` or `'failure'`) plus `redirect` (URL the customer goes to next). Refund support is opt-in via `'refunds'` in the `$supports` array plus a `process_refund( $order_id, $amount, $reason )` implementation. The order's lifecycle hooks (`woocommerce_payment_complete`, `woocommerce_order_status_<status>`) handle downstream side effects.

## Minimal scaffold

### Registration

```php
add_filter( 'woocommerce_payment_gateways', static function ( array $gateways ): array {
    $gateways[] = MyPlugin\Gateway\MyGateway::class;
    return $gateways;
} );
```

The filter accepts class names (instantiated by WC) or instances. Class names are simpler.

### Gateway class

```php
namespace MyPlugin\Gateway;

class MyGateway extends \WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'mygateway';
        $this->method_title       = __( 'My Gateway', 'myplugin' );      // admin
        $this->method_description = __( 'Process payments via My Gateway.', 'myplugin' );
        $this->has_fields         = false; // true if you render extra fields in payment_fields()
        $this->icon               = plugins_url( 'assets/icon.png', MYPLUGIN_PLUGIN_FILE );

        // Supported features. 'products' is default. Add 'refunds' to enable
        // automatic refunds, 'tokenization' for saved-card support, etc.
        $this->supports = array( 'products', 'refunds' );

        $this->init_form_fields();
        $this->init_settings();

        // Customer-facing values come from settings, with defaults.
        $this->title       = $this->get_option( 'title' );
        $this->description = $this->get_option( 'description' );
        $this->enabled     = $this->get_option( 'enabled' );

        add_action(
            'woocommerce_update_options_payment_gateways_' . $this->id,
            array( $this, 'process_admin_options' )
        );

        // Webhook listener (see "Webhooks" section).
        add_action( 'woocommerce_api_mygateway', array( $this, 'handle_webhook' ) );
    }

    public function init_form_fields(): void {
        $this->form_fields = array(
            'enabled' => array(
                'title'   => __( 'Enable/Disable', 'myplugin' ),
                'type'    => 'checkbox',
                'label'   => __( 'Enable My Gateway', 'myplugin' ),
                'default' => 'no',
            ),
            'title' => array(
                'title'       => __( 'Title', 'myplugin' ),
                'type'        => 'text',
                'description' => __( 'Shown to customers at checkout.', 'myplugin' ),
                'default'     => __( 'My Gateway', 'myplugin' ),
                'desc_tip'    => true,
            ),
            'description' => array(
                'title'   => __( 'Description', 'myplugin' ),
                'type'    => 'textarea',
                'default' => __( 'Pay securely via My Gateway.', 'myplugin' ),
            ),
            'api_key' => array(
                'title' => __( 'API key', 'myplugin' ),
                'type'  => 'password',
            ),
        );
    }

    /**
     * Optional — render extra fields on the checkout payment block. Skip if
     * $has_fields = false.
     */
    public function payment_fields(): void {
        if ( $this->description ) {
            echo wpautop( wp_kses_post( $this->description ) );
        }
        // For credit-card hosted fields, render here.
    }

    /**
     * Process the payment. Called when the customer submits the checkout form.
     *
     * Return shape (verified in built-in BACS / cheque / COD gateways):
     *   array( 'result' => 'success', 'redirect' => $url )    // success path
     *   throw new Exception( 'message' )                       // failure path (preferred)
     *   array( 'result' => 'failure', 'messages' => 'msg' )   // alternative failure shape
     *
     * @param int $order_id
     * @return array{result:string, redirect?:string, messages?:string}
     */
    public function process_payment( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order instanceof \WC_Order ) {
            throw new \Exception( __( 'Invalid order.', 'myplugin' ) );
        }

        try {
            // 1. Call your provider's API.
            $response = $this->call_api_charge( array(
                'amount'   => $order->get_total(),
                'currency' => $order->get_currency(),
                'order_id' => $order_id,
                'api_key'  => $this->get_option( 'api_key' ),
            ) );
        } catch ( \Throwable $e ) {
            // Surface the error in the WC checkout notice.
            wc_add_notice( __( 'Payment error: ', 'myplugin' ) . $e->getMessage(), 'error' );
            return array( 'result' => 'failure' );
        }

        if ( $response['status'] === 'authorized' || $response['status'] === 'captured' ) {
            // 2. Mark the order as paid. This is the CANONICAL call.
            //    Pass the gateway transaction ID so admins can correlate later.
            $order->payment_complete( $response['transaction_id'] );
        } elseif ( $response['status'] === 'pending' ) {
            // Payment will confirm asynchronously (e.g. bank transfer received).
            $order->update_status( 'on-hold', __( 'Awaiting payment confirmation.', 'myplugin' ) );
        } else {
            $order->update_status( 'failed', __( 'Payment failed: ', 'myplugin' ) . ( $response['message'] ?? '' ) );
            return array( 'result' => 'failure' );
        }

        // 3. Empty the cart. CRITICAL — without this, the customer's cart
        //    still contains the items after a successful payment, leading to
        //    accidental re-purchase. The built-in BACS / cheque / COD gateways
        //    all call this.
        WC()->cart->empty_cart();

        // 4. Redirect to the thank-you page. get_return_url returns the
        //    correct order-received URL with the order_received query var.
        return array(
            'result'   => 'success',
            'redirect' => $this->get_return_url( $order ),
        );
    }

    /**
     * Process refund. Only called when 'refunds' is in $supports AND the admin
     * clicks the refund button in the order edit screen.
     *
     * @param int        $order_id
     * @param float|null $amount   Amount to refund (null = full).
     * @param string     $reason
     * @return bool|\WP_Error
     */
    public function process_refund( $order_id, $amount = null, $reason = '' ) {
        $order = wc_get_order( $order_id );
        if ( ! $order instanceof \WC_Order ) {
            return new \WP_Error( 'invalid_order', __( 'Invalid order.', 'myplugin' ) );
        }

        $txn_id = $order->get_transaction_id();
        if ( ! $txn_id ) {
            return new \WP_Error( 'no_transaction', __( 'No transaction ID stored on this order.', 'myplugin' ) );
        }

        try {
            $this->call_api_refund( array(
                'transaction_id' => $txn_id,
                'amount'         => $amount,
                'reason'         => $reason,
            ) );
        } catch ( \Throwable $e ) {
            return new \WP_Error( 'refund_failed', $e->getMessage() );
        }

        $order->add_order_note(
            sprintf( __( 'Refunded %s via My Gateway. Reason: %s', 'myplugin' ),
                wc_price( $amount, array( 'currency' => $order->get_currency() ) ),
                $reason
            )
        );

        return true;
    }

    private function call_api_charge( array $params ): array { /* ... */ }
    private function call_api_refund( array $params ): array { /* ... */ }
    public function handle_webhook(): void { /* see below */ }
}
```

## `payment_complete()` vs `update_status()` — when to use each

Both touch the order's status, but they're not interchangeable.

`$order->payment_complete( $transaction_id )` ([class-wc-order.php payment_complete method](class-wc-order.php)) — verified flow:

1. Clears the `order_awaiting_payment` session flag.
2. Fires `woocommerce_pre_payment_complete` action.
3. Looks up the next status via `apply_filters( 'woocommerce_payment_complete_order_status', $needs_processing ? 'processing' : 'completed', $order_id, $order )`.
4. Records the transaction ID via `set_transaction_id`.
5. Sets the status (`set_status` + `save`).
6. Adds an order note (`"Payment via X (transaction Y)"`).
7. Fires `woocommerce_payment_complete` action — downstream listeners hook into THIS for "the order is paid" reactions.

`$order->update_status( $status, $note )` is mechanical:
- Sets status → save → fires `woocommerce_order_status_<status>` and `woocommerce_order_status_<from>_to_<to>` and `woocommerce_order_status_changed`.
- Does NOT clear the session flag.
- Does NOT record a transaction ID.
- Does NOT fire `woocommerce_payment_complete`.

| Use | When |
|---|---|
| `payment_complete( $txn_id )` | Capture / charge succeeded synchronously. The "we have the money" moment. |
| `update_status( 'on-hold', $note )` | Bank transfer / cheque / awaiting webhook confirmation. Money will arrive later. |
| `update_status( 'processing', $note )` | Manual status flip in admin tool — NEVER from a successful charge. |
| `update_status( 'failed', $note )` | Provider declined / network error / fraud-decline. |

The `woocommerce_payment_complete_order_status` filter is the right place to override the resolved status (e.g. COD overrides to `'processing'` because there's no actual money in hand yet).

## The `$supports` array

`$supports` declares features your gateway implements. WC and ecosystem plugins (Subscriptions, Pre-Orders, Memberships) read this to decide whether to integrate.

Common values (verified in `WC_Payment_Gateway::supports()` and concrete gateways):

| Feature | Meaning |
|---|---|
| `'products'` | Standard checkout. **Default**, included even if you don't declare. |
| `'refunds'` | Implements `process_refund`. The "Refund" button appears in admin. |
| `'tokenization'` | Stores tokens via `WC_Payment_Tokens` for saved-card / one-click checkout. |
| `'add_payment_method'` | Lets user save a method outside the checkout flow (My Account → Payment Methods). |
| `'default_credit_card_form'` | Legacy card form. Use the modern `WC_Payment_Gateway_CC` extension instead. |
| `'subscriptions'` | Compatible with WC Subscriptions for renewal payments. |
| `'subscription_cancellation'` / `'subscription_suspension'` / `'subscription_reactivation'` / `'subscription_amount_changes'` / `'subscription_date_changes'` / `'subscription_payment_method_change'` | Subscriptions sub-features. Check WC Subscriptions docs for the exact gating. |
| `'multiple_subscriptions'` | Handles checkout containing multiple subscriptions. |
| `'pre-orders'` | WC Pre-Orders compat. |

## Store API / Checkout Blocks notes

Classic `WC_Payment_Gateway` still owns the server-side gateway identity, settings, `process_payment()`, refunds, and `$supports`. The Checkout Block does **not** render `payment_fields()`; block checkout UI is registered separately in JS with Woo Blocks payment-method registration. If your extension only implements the classic PHP gateway, it may work in shortcode checkout and still be absent or incomplete in Checkout Blocks.

Store API payment requirements are cart-wide flags compared against each gateway's `$supports` array. Use them when a cart condition means only gateways with a specific capability should appear:

```php
add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_payment_requirements( array(
        'data_callback' => static function (): array {
            if ( WC()->cart && myplugin_cart_requires_tokenized_payment( WC()->cart ) ) {
                return array( 'tokenization' );
            }
            return array();
        },
    ) );
} );
```

If this callback returns `array( 'tokenization' )`, gateways without `'tokenization'` in `$supports` are not valid for that cart. Do not return a requirement just because your gateway supports it; return one only when the cart/customer flow truly requires it.

WC 10.8 also exposes a `Skeleton` component through the Checkout Blocks payment-method interface's `components` prop. Use it in block gateway UI loading states instead of shipping a mismatched custom placeholder. This is a JS-side affordance; it does not change the PHP `WC_Payment_Gateway` contract.

WC 10.8 reverted the checkout-evidence validation that had been added inside `WC_Order::payment_complete()`. That does **not** make `payment_complete()` a security boundary. Gateways still have to verify provider signatures, transaction IDs, amounts, currencies, and order ownership before marking an order paid.

## Webhooks — the `wc-api` mechanism

For provider callbacks (Stripe webhook, PayPal IPN, bank notification), use the `wc-api` endpoint — WC's pre-REST callback URL system:

```php
// Register the listener in __construct
add_action( 'woocommerce_api_mygateway', array( $this, 'handle_webhook' ) );

public function handle_webhook(): void {
    // Verify signature using your provider's signing scheme — NEVER trust
    // payload contents without verification. Each provider differs.
    $payload = file_get_contents( 'php://input' );
    if ( ! $this->verify_signature( $payload, $_SERVER['HTTP_X_PROVIDER_SIGNATURE'] ?? '' ) ) {
        status_header( 401 );
        wp_die( 'Invalid signature', '', array( 'response' => 401 ) );
    }

    $data     = json_decode( $payload, true );
    $order_id = (int) ( $data['metadata']['order_id'] ?? 0 );
    $order    = wc_get_order( $order_id );
    if ( ! $order ) {
        status_header( 404 );
        exit;
    }

    if ( $data['event'] === 'payment.captured' && ! $order->is_paid() ) {
        $order->payment_complete( $data['transaction_id'] );
    } elseif ( $data['event'] === 'payment.failed' ) {
        $order->update_status( 'failed', $data['message'] ?? '' );
    }

    status_header( 200 );
    exit;
}
```

The webhook URL the provider should call is `https://store.example/?wc-api=mygateway`. The action hook name is `woocommerce_api_<gateway_id>` — slug must match.

For new code consider also exposing a REST endpoint via `register_rest_route` (see `wp-rest-api` skill); the `wc-api` mechanism predates REST and is being phased out long-term. Both work today.

## Critical rules

- **`process_payment` returns `array( 'result' => 'success', 'redirect' => $url )` on success**, throws an exception or returns `array( 'result' => 'failure' )` on error. Never return raw HTML, never `wp_redirect` from inside the method (WC handles the redirect from the return value).
- **`payment_complete( $transaction_id )` for "money received" — NOT `update_status('processing')` / `update_status('completed')`.** The latter skips session-flag cleanup, transaction-id storage, and the `woocommerce_payment_complete` action.
- **`WC()->cart->empty_cart()` after a successful `process_payment`.** The built-in BACS / cheque / COD all do this. Skip it and the customer's cart still has the items they just bought.
- **`$this->get_return_url( $order )` for the thank-you redirect.** Don't construct your own URL — `get_return_url` honors site-specific overrides (custom thank-you pages, etc.).
- **Only declare `'refunds'` in `$supports` if you implement `process_refund`.** Declaring without implementing leaves the admin with a broken refund button.
- **Checkout Blocks require a block payment-method integration.** `payment_fields()` is classic-shortcode UI; Store API payment requirements only filter availability, they do not render your gateway.
- **Use `woocommerce_store_api_register_payment_requirements()` only for cart-wide required capabilities.** Returned strings must match gateway `$supports` entries.
- **Webhooks MUST verify signatures.** No exceptions. The `wc-api` endpoint is unauthenticated by default.
- **Idempotent webhook handling.** Providers retry on non-2xx. Check `$order->is_paid()` before calling `payment_complete()` again on a re-delivered event.
- **`woocommerce_payment_complete_order_status` filter to override the resolved status.** Used when a gateway naturally lands on a non-default status (COD → `'processing'`, even though `needs_processing()` would return `false`).
- **`init_form_fields()` declares admin settings, `init_settings()` reads them**. Always pair both in the constructor.
- **Settings save handler wiring**: `add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );` — without this, settings page Save doesn't persist.

## Common mistakes

```php
// WRONG — using update_status where payment_complete belongs
public function process_payment( $order_id ) {
    $order = wc_get_order( $order_id );
    $this->call_api_charge( /* ... */ ); // succeeds
    $order->update_status( 'completed' ); // BUG — cart not emptied, no transaction_id, no woocommerce_payment_complete event
    return array( 'result' => 'success', 'redirect' => $this->get_return_url( $order ) );
}

// RIGHT
$order->payment_complete( $response['transaction_id'] );
WC()->cart->empty_cart();

// WRONG — wp_redirect inside process_payment
public function process_payment( $order_id ) {
    $order = wc_get_order( $order_id );
    // ...
    wp_redirect( $this->get_return_url( $order ) );
    exit;
}
// WC's checkout JS expects a JSON {result, redirect} response. Hard-redirecting
// breaks the AJAX checkout flow.

// WRONG — declaring 'refunds' without implementing process_refund
$this->supports = array( 'products', 'refunds' );
// process_refund inherits the abstract default `return false;` — admin gets
// "Refund failed" with no log entry.

// WRONG — webhook handler that never verifies the signature
public function handle_webhook(): void {
    $data = json_decode( file_get_contents( 'php://input' ), true );
    $order = wc_get_order( $data['order_id'] );
    $order->payment_complete(); // INSECURE — anyone can POST a fake "paid" notification
}

// WRONG — non-idempotent webhook handler
public function handle_webhook(): void {
    if ( /* signature ok */ ) {
        $order->payment_complete( $data['txn'] );
        // No is_paid() guard — provider retries cause duplicate state changes,
        // multiple "Payment complete" notes, possible double-fulfillment.
    }
}

// WRONG — returning success without redirect
return array( 'result' => 'success' );
// WC's checkout treats missing redirect as undefined behavior.

// WRONG — settings save handler missing
public function __construct() {
    $this->id = 'mygateway';
    $this->init_form_fields();
    // ...no add_action for woocommerce_update_options_payment_gateways_mygateway
}
// Admin clicks Save; nothing persists.
```

## Reading transaction IDs / payment state

```php
$order = wc_get_order( $order_id );

$transaction_id = $order->get_transaction_id();
$payment_method = $order->get_payment_method();        // gateway $id slug
$payment_title  = $order->get_payment_method_title();  // gateway $title at the time of order
$is_paid        = $order->is_paid();                   // any of the "paid" statuses
$needs_payment  = $order->needs_payment();             // true while order is awaiting capture
```

Storing additional gateway-specific data on the order: `$order->update_meta_data( '_mygateway_capture_id', $value ); $order->save();` (HPOS-compatible). Don't use `update_post_meta` directly on order IDs — see `wc-hpos-compatibility` skill.

## Cross-references

- Run **`wc-hpos-compatibility`** when storing custom meta on orders — `WC_Order::update_meta_data + save` is the right path; direct postmeta calls break HPOS.
- Run **`wc-stripe-add-payment-method`** when touching WooCommerce Stripe saved cards, My Account payment method templates, `add-payment-method`, SetupIntent, or Stripe billing-details/tokenization UI.
- Run **`wp-security-audit`** on the webhook handler — it's an unauthenticated endpoint with attacker-controlled input. Signature verification + rate limiting + idempotency.
- Run **`wp-security-secrets`** on API key storage — gateway secrets in autoloaded options is a smell; consider `wp-config.php` constants or per-environment config.
- Run **`wp-rest-api`** if migrating webhooks from `wc-api` to a proper REST endpoint with `permission_callback`.
- Run **`wc-store-api`** when the gateway needs Cart/Checkout Blocks data, Store API extension fields, or `/cart/extensions` state.

## What this skill does NOT cover

- Full block-based checkout UI integration (`@woocommerce/blocks-registry`, `registerPaymentMethod`). This skill only covers the PHP gateway contract and Store API availability requirements.
- Subscriptions support beyond declaring `'subscriptions'` in `$supports`. WC Subscriptions has its own gateway-extension docs.
- Stripe saved-card tokenization/account-template details — use `wc-stripe-add-payment-method`.
- Currency conversion / multi-currency at the gateway level — usually a separate plugin handles this above the gateway.
- 3D Secure / SCA flow — provider-specific; the skill only covers the outer WC integration.
- Server-side certificate pinning for webhook delivery — niche.

## References

- Abstract: [wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-payment-gateway.php:31](abstract-wc-payment-gateway.php) — `process_payment`, `process_refund`, `supports`, `get_method_title`, `validate_fields`, `payment_fields`.
- Registration filter: [wp-content/plugins/woocommerce/includes/class-wc-payment-gateways.php:92](class-wc-payment-gateways.php) — `apply_filters( 'woocommerce_payment_gateways', ... )`.
- `payment_complete()`: [wp-content/plugins/woocommerce/includes/class-wc-order.php](class-wc-order.php) — verified flow steps.
- Store API payment requirements: [wp-content/plugins/woocommerce/src/StoreApi/Schemas/ExtendSchema.php](ExtendSchema.php) — `register_payment_requirements()` and `$supports` comparison.
- BACS reference: [wp-content/plugins/woocommerce/includes/gateways/bacs/class-wc-gateway-bacs.php:393](class-wc-gateway-bacs.php) — `process_payment` for awaiting-payment-then-success pattern.
- Cheque reference: [wp-content/plugins/woocommerce/includes/gateways/cheque/class-wc-gateway-cheque.php:144](class-wc-gateway-cheque.php).
- COD reference: [wp-content/plugins/woocommerce/includes/gateways/cod/class-wc-gateway-cod.php:311](class-wc-gateway-cod.php) — uses `woocommerce_payment_complete_order_status` filter to override default status resolution.
