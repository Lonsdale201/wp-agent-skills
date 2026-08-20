# FluentCart 1.6.0 gateway contract

## Registration timing

Core registers its gateway-manager init callback before the later callback that
fires fluent_cart/init. Register the fluent_cart/register_payment_methods
listener at plugin load/plugins_loaded or from fluentcart_loaded, not from
fluent_cart/init.

## Registration and metadata

Core registers built-ins at init and then fires
fluent_cart/register_payment_methods with one array containing gatewayManager.
A callback may ignore the argument and call fluent_cart_api().

Required GatewayManager metadata:

- brand_color
- description
- icon
- logo
- route
- status
- title

Common additional values are slug, logo_light, upcoming, label, admin_title,
is_addon, addon_source, and instructions.

## Settings

BaseGatewaySettings owns the method handler/option mapping. fields() describes
sanitization and admin controls. AbstractPaymentGateway::updateSettings():

1. merges submitted data with existing settings;
2. sanitizes from fields();
3. validates enabled credentials;
4. calls beforeSettingsUpdate();
5. removes provider;
6. stores through fluent_cart_update_option().

Never return secret field values through custom REST/frontend metadata.

## Payment response and confirmation

The gateway receives PaymentInstance containing order, transaction, and
subscription when relevant. Provider calls need an idempotency key that changes
only when FluentCart intentionally advances the payment attempt.

Provider success must converge on:

1. a succeeded transaction with verified amount/currency/mode;
2. StatusHelper transaction/total synchronization;
3. the atomic order paid transition;
4. subscription activation/renewal handling when applicable.

Redirects and JavaScript confirmations may accelerate UX but must not weaken
webhook verification.

## Subscription capabilities

| Feature | Required behavior |
|---|---|
| subscriptions | Supply AbstractSubscriptionModule for gateway-managed billing |
| system_subscription | Charge a stored method for store-managed invoices |
| setup without charge | supportsSetupWithoutCharge() returns true and setup flow exists |
| async off-session charge | chargeRenewal() returns processing, then webhook confirms |
| reconciliation | reconcileRenewalCharge() returns true, processing, or WP_Error |

Never advertise a feature solely to make the gateway visible.

## Webhook checklist

1. Read raw body exactly once.
2. Verify signature/timestamp and reject outside tolerance.
3. Identify live/test account.
4. Atomically claim provider event ID.
5. Locate transaction/order using server-created metadata.
6. Verify amount, currency, customer/account, and object type.
7. Reconcile via FluentCart status services.
8. Make repeat delivery return the same successful outcome.
9. Record bounded, redacted diagnostics.
