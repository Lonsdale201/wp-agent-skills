# Checkout Block payment lifecycle reference

Load this reference when implementing a new Block gateway, integrating a provider SDK, or diagnosing duplicate/missing payment processing.

## End-to-end sequence

```text
woocommerce_blocks_loaded
  -> register AbstractPaymentMethodType
  -> enqueue registered JS handle
  -> expose {integration_name}_data
  -> JavaScript registerPaymentMethod()
  -> shopper selects method
  -> onPaymentSetup observers validate/prepare opaque data
  -> POST /wc/store/v1/checkout
       payment_method = paymentMethodId
       payment_data[] = key/value pairs
  -> PaymentContext(payment_method, order, string payment_data)
  -> woocommerce_rest_checkout_process_payment_with_context
       explicit handler, or
       priority-999 legacy bridge -> validate_fields() -> process_payment()
  -> PaymentResult(status, redirect_url, string payment_details)
  -> onCheckoutSuccess for any required client SDK completion
  -> verified provider webhook/reconciliation finalizes asynchronous state
```

## Registration contracts

### PHP adapter

`AbstractPaymentMethodType` provides these extension points:

- `$name` / `get_name()` identifies the Blocks integration and the `{name}_data` settings object.
- `initialize()` loads dependencies and settings.
- `is_active()` determines whether scripts/data are registered.
- `get_payment_method_script_handles()` registers frontend scripts.
- `get_payment_method_script_handles_for_admin()` may supply a lighter editor bundle.
- `get_payment_method_data()` exposes client settings.
- `get_supported_features()` declares compatibility requirements.

The adapter is not a `WC_Payment_Gateway`; it must not become a second source of payment settings or state.

### JavaScript registration

Required normal-payment properties are `name`, `label`, `ariaLabel`, `content`, `edit`, and `canMakePayment`. Relevant optional properties include:

- `paymentMethodId`: server gateway ID; defaults to `name`.
- `savedTokenComponent`: UI rendered for a selected saved Woo token.
- `placeOrderButtonLabel`: label for the normal button.
- `placeOrderButton`: full custom component; use only when the provider requires it.
- `supports.features`: capabilities compared with cart payment requirements.
- `supports.showSavedCards`: whether Woo token choices appear.
- `supports.showSaveOption`: whether Woo's save-method checkbox appears.

Do not provide both `placeOrderButton` and `placeOrderButtonLabel`. A custom button is not used when a saved token is selected, so the default path must still work.

## Event response shapes

Register from a React effect and unsubscribe on unmount:

```js
useEffect( () => {
	const unsubscribe = onPaymentSetup( async () => ( {
		type: emitResponse.responseTypes.SUCCESS,
		meta: {
			paymentMethodData: {
				myplugin_reference: 'opaque-reference',
			},
		},
	} ) );

	return unsubscribe;
}, [ onPaymentSetup, emitResponse.responseTypes.SUCCESS ] );
```

Use:

- `SUCCESS` when payment input/preparation is valid and checkout may reach the server.
- `ERROR` for invalid shopper/payment input and optionally `validationErrors`.
- `FAILURE` for a payment attempt that failed; show only a safe customer message.

The object belongs below `meta.paymentMethodData`, not at the top level. Store API accepts key/value entries, applies `sanitize_key()` to names and `wc_clean()` to values, then `PaymentContext::set_payment_data()` casts values to strings. Prefer short opaque scalar values.

`PaymentResult::set_payment_details()` also casts every value to string in WooCommerce 10.9.4. Return short scalar values such as a scoped client secret or provider intent ID; do not expect nested response objects to survive.

`onPaymentProcessing` may still appear in older examples but is deprecated. Use `onPaymentSetup`.

## Pick the processing choreography

### Opaque reference before order processing

The provider JS creates a token/reference during `onPaymentSetup`; Store API sends it to the PHP gateway, which performs the authoritative server request. This is the simplest fit for `process_payment()`.

### Server intent, then client confirmation

The Store API handler creates/updates an intent using the persisted order amount and returns a narrowly scoped client secret in `payment_details`. `onCheckoutSuccess` confirms or handles the next action. Webhooks/reconciliation own final asynchronous success.

Protect this design against:

- cart/order amount changes between element mount and server processing;
- duplicate checkout requests and repeated event observers;
- navigating away during client confirmation;
- provider success with a lost browser response;
- `requires_action`, redirect, `processing`, decline, and timeout states.

### Provider-hosted redirect

The PHP gateway returns a provider session URL in the redirect result. Verify the return and webhook independently; a browser return alone is not proof of payment.

## Saved-token boundary

The token prop supplied to `savedTokenComponent` is the local database token ID. On the server:

1. Load with `WC_Payment_Tokens::get()`.
2. Match `get_user_id()` to the authenticated customer.
3. Match `get_gateway_id()` and expected token subclass/type.
4. Resolve the provider identifier and compare its remote Customer/account.
5. Reject deleted, detached, unsupported, or unusable methods.

Never accept a provider PaymentMethod ID from a browser as proof that the shopper owns it.

## Server handler rules

An explicit `woocommerce_rest_checkout_process_payment_with_context` callback must:

- return immediately for every other `payment_method`;
- validate all `payment_data` again;
- use the context order's amount and currency, not client values;
- use provider idempotency tied to the operation/order/attempt;
- set a valid result status: `success`, `failure`, `pending`, or `error`;
- set only customer-safe payment details and redirects;
- throw a customer-safe exception on failure while logging redacted diagnostics.

Setting any result status prevents Woo's priority-999 legacy bridge from invoking `process_payment()`. Use one owner for a charge.

## Review traps

- A classic-checkout screenshot does not prove Block support.
- `woocommerce_store_api_register_payment_requirements()` is eligibility only.
- `canMakePayment()` is repeatedly evaluated UX logic, not authorization.
- PHP settings data is visible to every checkout visitor.
- Editor rendering is not a live checkout and must not create provider objects.
- React rerenders can remount fields or add observers; cleanup and provider-instance ownership must be explicit.
- A successful client SDK call is not a substitute for signed webhooks and idempotent settlement.
- A provider's reusable wallet/token may not map to `WC_Payment_Token_CC`; preserve polymorphism.
