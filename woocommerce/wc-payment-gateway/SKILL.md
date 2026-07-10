---
name: wc-payment-gateway
description: Build a secure WooCommerce core payment gateway. Covers `WC_Payment_Gateway` registration/settings, synchronous captured versus authorized/pending outcomes, `payment_complete()` versus status updates, refunds, core support flags, customer-safe errors, logging, signed and idempotent webhooks, callback URLs, tokenization boundaries, and Checkout Block compatibility. Use when creating or auditing a gateway or debugging charged orders, stale carts, duplicate webhooks, or unsafe provider errors.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/payment-gateway-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-payment-gateway.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-settings-api.php
  - wp-content/plugins/woocommerce/includes/class-wc-payment-gateways.php
  - wp-content/plugins/woocommerce/includes/class-wc-order.php
  - wp-content/plugins/woocommerce/includes/class-woocommerce.php
  - wp-content/plugins/woocommerce/src/Enums/PaymentGatewayFeature.php
---

# WooCommerce payment gateway

A provider response is not automatically a paid order. Model captured, authorization-only, asynchronous pending, failed, refunded, and duplicate callback states explicitly.

## Register the gateway

```php
add_filter( 'woocommerce_payment_gateways', static function ( array $gateways ): array {
    $gateways[] = MyPlugin\Payment\Gateway::class;
    return $gateways;
} );
```

Register a class name so WooCommerce controls instantiation.

## Minimal gateway class

```php
namespace MyPlugin\Payment;

final class Gateway extends \WC_Payment_Gateway {
    public function __construct() {
        $this->id                 = 'myplugin_gateway';
        $this->method_title       = __( 'My Provider', 'myplugin' );
        $this->method_description = __( 'Accept payments through My Provider.', 'myplugin' );
        $this->has_fields         = false;
        $this->supports           = array( 'products', 'refunds' );

        $this->init_form_fields();
        $this->init_settings();

        $this->enabled     = $this->get_option( 'enabled', 'no' );
        $this->title       = $this->get_option( 'title', __( 'Card payment', 'myplugin' ) );
        $this->description = $this->get_option( 'description', '' );

        add_action(
            'woocommerce_update_options_payment_gateways_' . $this->id,
            array( $this, 'process_admin_options' )
        );
    }

    public function init_form_fields(): void {
        $this->form_fields = array(
            'enabled' => array(
                'title'   => __( 'Enable', 'myplugin' ),
                'type'    => 'checkbox',
                'label'   => __( 'Enable this payment method', 'myplugin' ),
                'default' => 'no',
            ),
            'title' => array(
                'title'   => __( 'Title', 'myplugin' ),
                'type'    => 'text',
                'default' => __( 'Card payment', 'myplugin' ),
            ),
            'api_key' => array(
                'title' => __( 'API key', 'myplugin' ),
                'type'  => 'password',
            ),
        );
    }

    public function process_payment( $order_id ) {
        $order = wc_get_order( $order_id );
        if ( ! $order instanceof \WC_Order ) {
            return array( 'result' => 'failure' );
        }

        try {
            $payment = $this->provider()->create_payment( array(
                'amount'          => wc_add_number_precision( $order->get_total(), false ),
                'currency'        => $order->get_currency(),
                'idempotency_key' => 'wc-' . $order->get_order_key(),
                'metadata'        => array( 'order_id' => $order->get_id() ),
            ) );
        } catch ( \Throwable $error ) {
            wc_get_logger()->error(
                'Payment provider request failed.',
                array(
                    'source'          => 'myplugin-gateway',
                    'order_id'        => $order->get_id(),
                    'exception_class' => get_class( $error ),
                )
            );
            wc_add_notice( __( 'The payment could not be processed. Please try again.', 'myplugin' ), 'error' );
            return array( 'result' => 'failure' );
        }

        $order->update_meta_data( '_myplugin_provider_payment_id', $payment->id );

        if ( 'captured' === $payment->status ) {
            if ( ! $order->payment_complete( $payment->transaction_id ) ) {
                return array( 'result' => 'failure' );
            }
        } elseif ( 'authorized' === $payment->status ) {
            // Authorization reserves funds; it is not necessarily a capture.
            $order->set_transaction_id( $payment->transaction_id );
            $order->update_status( 'on-hold', __( 'Payment authorized; capture pending.', 'myplugin' ) );
        } elseif ( 'pending' === $payment->status ) {
            $order->update_status( 'on-hold', __( 'Awaiting provider confirmation.', 'myplugin' ) );
        } else {
            $order->update_status( 'failed', __( 'The provider declined the payment.', 'myplugin' ) );
            wc_add_notice( __( 'The payment was declined. Try another payment method.', 'myplugin' ), 'error' );
            return array( 'result' => 'failure' );
        }

        if ( WC()->cart ) {
            WC()->cart->empty_cart();
        }

        return array(
            'result'   => 'success',
            'redirect' => $this->get_return_url( $order ),
        );
    }
}
```

Use WooCommerce decimal helpers according to the provider's minor-unit contract; do not blindly multiply floats by 100. Store only provider identifiers and non-sensitive state on the order.

## Payment completion contract

Call `$order->payment_complete( $transaction_id )` only at the provider's "money captured/settled enough to fulfill" state. It sets transaction/date paid data, clears `order_awaiting_payment`, chooses processing/completed, saves, adds a note, and fires `woocommerce_payment_complete`.

`update_status()` still runs normal status transition hooks, emails, and stock handlers for the chosen status. What it does not provide is the complete paid-domain contract: transaction assignment, awaiting-payment cleanup, and `woocommerce_payment_complete`.

Authorization-only must not be treated as capture unless the provider contract explicitly defines it as the fulfillable paid state.

## Core support flags

Declare only behavior the gateway actually implements:

| Flag | Requirement |
|---|---|
| `products` | Normal product checkout |
| `refunds` | Working `process_refund()` returning `true` or `WP_Error` |
| `tokenization` | Safe saved-method selection/storage integration |
| `add_payment_method` | Working My Account add-method flow |
| `default_credit_card_form` | Legacy core card form support |

Do not advertise support solely to make UI appear. Extension-defined flags belong in the extension-specific integration and tests, not a core gateway scaffold.

## Refunds

`process_refund( $order_id, $amount, $reason )` must validate the order and transaction, use a provider idempotency key, log redacted failures, and return a generic `WP_Error` to admin. Never put raw provider payloads, API responses, or secrets into order notes.

WooCommerce creates the local refund around the gateway flow; do not independently duplicate refund records unless the caller contract requires it.

## Webhooks

A webhook endpoint is public by design and authenticated by provider signature, not by a WordPress nonce. Preferred flow:

1. Read the raw request body exactly once.
2. Verify timestamped signature against the raw bytes before JSON decoding.
3. Reject stale timestamps and malformed event types.
4. Resolve the order by a previously stored provider payment/reference ID; never trust an arbitrary submitted order ID alone.
5. Compare currency and amount using the provider's integer/decimal contract.
6. Atomically claim provider event ID in an owned table with a unique key.
7. Return 2xx for already-processed valid events.
8. Apply only allowed state transitions; call `payment_complete()` only for capture/success.
9. Log redacted identifiers and add concise private order notes.

Register a namespaced WP REST route with `permission_callback => __return_true` only because signature verification occurs inside the callback. Alternatively, WooCommerce's callback surface still supports:

```php
$callback_url = WC()->api_request_url( 'myplugin_gateway' );
add_action( 'woocommerce_api_myplugin_gateway', array( $handler, 'handle' ) );
```

Do not call the callback mechanism deprecated in 10.9.4; it remains used by core. WP REST is usually preferable for explicit methods, schemas, and response handling.

## Checkout Block boundary

A PHP `WC_Payment_Gateway` class supports classic checkout server behavior. Checkout Block additionally needs a JavaScript payment-method registration and can use Store API payment requirements. A gateway appearing in classic checkout does not prove Block compatibility.

## Security rules

- Never show `$error->getMessage()` or a provider response to customers.
- Never log API keys, signatures, PAN, CVV, full request bodies, or bearer tokens.
- Use provider idempotency keys for charge, capture, refund, and webhook events.
- Verify webhook signature, amount, currency, provider reference, order state, and event uniqueness.
- Use generic customer errors and detailed but redacted server logs.
- Keep provider API calls out of constructors and availability checks.
- Test synchronous, pending, authorized, captured, duplicate, out-of-order, timeout, refund, and replay paths.

## Cross-references

- `wc-order-lifecycle-and-items` for status and stock side effects.
- `wc-payment-tokens` for saved methods.
- `wc-store-api` for Checkout Block server requirements.
- `wc-hpos-compatibility` for order storage.

## References

- Gateway contract: `includes/abstracts/abstract-wc-payment-gateway.php`.
- Registration: `includes/class-wc-payment-gateways.php`.
- Paid lifecycle: `includes/class-wc-order.php`.
- Callback URL builder: `includes/class-woocommerce.php`.
