---
name: wc-checkout-block-payment-method
description: Build or audit a WooCommerce Checkout Block payment-method integration. Covers the separate PHP `WC_Payment_Gateway`, Blocks `AbstractPaymentMethodType`, JavaScript `registerPaymentMethod`, stable gateway identifiers, `onPaymentSetup`, Store API `payment_data`, saved-token UI, legacy `process_payment()` bridging, advanced `PaymentContext`/`PaymentResult` processing, SDK confirmation, security, performance, and classic-versus-Block tests. Use when a gateway works in shortcode checkout but is missing or broken in Checkout Block, or when adding card fields, wallets, tokenization, redirects, or custom payment data to Blocks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce Checkout Block payment methods

A Checkout Block integration is an adapter around a payment gateway, not a replacement for it. Implement and test each layer deliberately.

## Keep the four layers separate

| Layer | Responsibility |
|---|---|
| `WC_Payment_Gateway` | Settings, availability, validation, server-side provider calls, refunds, and classic checkout |
| `AbstractPaymentMethodType` | Registers Block assets and exposes non-secret settings to JavaScript |
| `registerPaymentMethod()` | Renders the Block UI, reports availability, prepares opaque payment data, and handles client SDK events |
| Store API processing | Bridges `payment_data` to `process_payment()` or an explicit `PaymentContext`/`PaymentResult` handler |

Store API payment requirements only filter eligible methods. They do not register a payment UI or process money.

## Use one stable identifier

Make these values equal unless a verified compatibility requirement says otherwise:

```text
WC_Payment_Gateway::$id
AbstractPaymentMethodType::$name
registerPaymentMethod({ name })
registerPaymentMethod({ paymentMethodId })
```

`paymentMethodId` is what Checkout sends as `payment_method` and uses to find the PHP gateway. It defaults to `name`; set it explicitly if the client registration name differs. A provider payment-method type, wallet type, and Woo gateway ID are different identifiers and must not be conflated.

## Register the PHP Blocks adapter

Register after `woocommerce_blocks_loaded` and guard the Blocks class:

```php
use Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType;
use Automattic\WooCommerce\Blocks\Payments\PaymentMethodRegistry;

final class MyPlugin_Blocks_Payment_Method extends AbstractPaymentMethodType {
    protected $name = 'myplugin_gateway';

    public function initialize(): void {
        $this->settings = get_option( 'woocommerce_myplugin_gateway_settings', array() );
    }

    public function is_active(): bool {
        return 'yes' === $this->get_setting( 'enabled', 'no' );
    }

    public function get_payment_method_script_handles(): array {
        $asset = file_exists( MYPLUGIN_PATH . 'build/checkout.asset.php' )
            ? require MYPLUGIN_PATH . 'build/checkout.asset.php'
            : array(
                'dependencies' => array( 'wc-blocks-registry', 'wc-settings', 'wp-element', 'wp-html-entities' ),
                'version'      => MYPLUGIN_VERSION,
            );

        wp_register_script(
            'myplugin-checkout-block',
            MYPLUGIN_URL . 'build/checkout.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );
        wp_set_script_translations( 'myplugin-checkout-block', 'myplugin' );

        return array( 'myplugin-checkout-block' );
    }

    public function get_payment_method_data(): array {
        return array(
            'title'       => $this->get_setting( 'title', __( 'Pay securely', 'myplugin' ) ),
            'description' => $this->get_setting( 'description', '' ),
            'supports'    => $this->get_supported_features(),
        );
    }
}

add_action( 'woocommerce_blocks_loaded', static function (): void {
    if ( ! class_exists( AbstractPaymentMethodType::class ) ) {
        return;
    }

    add_action(
        'woocommerce_blocks_payment_method_type_registration',
        static function ( PaymentMethodRegistry $registry ): void {
            $registry->register( new MyPlugin_Blocks_Payment_Method() );
        }
    );
} );
```

Use the generated `*.asset.php` dependency/version file. Do not expose secret keys, webhook secrets, unrestricted client secrets, internal errors, or full provider configuration through `get_payment_method_data()`.

## Register the client method

Read PHP data from `{name}_data`. Render a real interactive component in `content` and a safe preview in `edit`.

```js
const { registerPaymentMethod } = window.wc.wcBlocksRegistry;
const { getPaymentMethodData } = window.wc.wcSettings;
const { createElement, useEffect } = window.wp.element;
const { decodeEntities } = window.wp.htmlEntities;

const settings = getPaymentMethodData( 'myplugin_gateway', {} );

const Content = ( { eventRegistration, emitResponse } ) => {
	const { onPaymentSetup } = eventRegistration;

	useEffect( () => {
		const unsubscribe = onPaymentSetup( async () => {
			try {
				const reference = await collectOpaqueProviderReference();
				return {
					type: emitResponse.responseTypes.SUCCESS,
					meta: {
						paymentMethodData: {
							myplugin_payment_reference: reference.id,
						},
					},
				};
			} catch ( error ) {
				return {
					type: emitResponse.responseTypes.ERROR,
					message: 'Please check your payment details and try again.',
				};
			}
		} );

		return unsubscribe;
	}, [ onPaymentSetup, emitResponse.responseTypes.SUCCESS, emitResponse.responseTypes.ERROR ] );

	return createElement( 'div', null, decodeEntities( settings.description || '' ) );
};

registerPaymentMethod( {
	name: 'myplugin_gateway',
	paymentMethodId: 'myplugin_gateway',
	label: decodeEntities( settings.title || 'Pay securely' ),
	ariaLabel: decodeEntities( settings.title || 'Pay securely' ),
	content: createElement( Content ),
	edit: createElement( 'div', null, decodeEntities( settings.description || '' ) ),
	canMakePayment: () => true,
	supports: {
		features: settings.supports || [ 'products' ],
		showSavedCards: false,
		showSaveOption: false,
	},
} );
```

Replace the placeholder collector with the provider's hosted field/SDK. Card or bank credentials must go directly to the provider; send WordPress only an opaque reference, confirmation token, or local Woo token ID. Use `onPaymentSetup`; `onPaymentProcessing` is deprecated. Always return the unsubscribe function so rerenders do not duplicate observers or charges.

## Choose one server processing path

### Reuse `process_payment()`

For a conventional gateway, return `paymentMethodData` from `onPaymentSetup`. Checkout POSTs it to `/wc/store/v1/checkout`; Woo sanitizes keys, converts values to strings, temporarily copies them to `$_POST`, and calls the selected gateway's `validate_fields()` and `process_payment()`.

Use lowercase snake-case keys because Store API applies `sanitize_key()`. Treat every value as untrusted. For structured data, encode deliberately and validate size, schema, and types after decoding.

### Handle Store API explicitly

Use `woocommerce_rest_checkout_process_payment_with_context` when the legacy bridge cannot express the provider flow:

```php
add_action(
    'woocommerce_rest_checkout_process_payment_with_context',
    static function ( $context, $result ): void {
        if ( 'myplugin_gateway' !== $context->payment_method ) {
            return;
        }

        // Validate $context->payment_data and process the authoritative order.
        $result->set_status( 'success' );
        $result->set_redirect_url( $context->order->get_checkout_order_received_url() );
    },
    10,
    2
);
```

Once this handler sets a result status, Woo skips the legacy gateway bridge. Do not charge once here and again in `process_payment()`.

## Client confirmation and saved tokens

- Use `onPaymentSetup` to validate or create an opaque provider-side reference before Checkout sends the order.
- If the server must first return a scoped client secret, put only required scalar data in `PaymentResult::payment_details`, then complete the SDK step through `onCheckoutSuccess`. Woo 10.9.4 casts each payment-detail value to string. Settle the order from verified server state/webhooks.
- `savedTokenComponent` receives a local Woo token ID, not the provider credential. Resolve it server-side and verify ownership, gateway, type, expiry/state, and provider customer.
- Set `supports.showSavedCards` and `supports.showSaveOption` only if the PHP gateway implements safe tokenization. These flags are UI capability claims, not security checks.
- Keep `canMakePayment` cheap, deterministic, and side-effect free. It can run repeatedly and asynchronously; memoize costly provider capability checks.

## Audit and test matrix

1. Test both shortcode checkout and Checkout Block; they are independent paths.
2. Test block editor preview separately from shopper checkout. Do not mount live provider Elements in editor mode.
3. Test new method, saved token, save checkbox, guest/account policy, zero total, redirect/SCA, asynchronous settlement, decline, retry, refresh, and back-button paths.
4. Change cart totals/shipping while the payment UI is mounted and verify stale provider intents are updated or replaced safely.
5. Double-click Place Order and replay the request; provider idempotency must prevent duplicate money movement.
6. Verify no PAN/CVV, secret, client secret, Cart-Token, raw provider response, or sensitive billing payload reaches logs or general settings data.
7. Treat `canMakePayment` and client validation as UX only; repeat amount, currency, ownership, eligibility, and state checks on the server.

## Cross-references

- `wc-payment-gateway` for the PHP gateway and payment state machine.
- `wc-store-api` for shopper identity, checkout, and payment requirements.
- `wc-payment-tokens` for local token ownership and storage.
- `wc-stripe-future-payments` for charge-now/save-for-later and off-session Stripe flows.
- `wc-stripe-link-payments` for Link-specific token shapes and consent.
- See [references/blocks-payment-lifecycle.md](references/blocks-payment-lifecycle.md) for the full request lifecycle, integration choices, and review checklist.

## References

- Official payment-method integration: <https://developer.woocommerce.com/docs/block-development/extensible-blocks/cart-and-checkout-blocks/checkout-payment-methods/payment-method-integration>
- Official checkout events: <https://developer.woocommerce.com/docs/block-development/extensible-blocks/cart-and-checkout-blocks/checkout-payment-methods/checkout-flow-and-events/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/src/Blocks/Payments/Integrations/AbstractPaymentMethodType.php`
  - `wp-content/plugins/woocommerce/src/Blocks/Payments/PaymentMethodRegistry.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Payments/PaymentContext.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Payments/PaymentResult.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Legacy.php`
  - `wp-content/plugins/woocommerce/src/StoreApi/Utilities/CheckoutTrait.php`
