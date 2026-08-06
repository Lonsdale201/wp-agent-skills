---
name: fluentcart-payment-gateways
description: >-
  Builds and audits third-party FluentCart payment gateways using
  AbstractPaymentGateway, BaseGatewaySettings, PaymentInstance, GatewayManager,
  frontend fluent_cart_load_payments_* events, transaction reconciliation,
  refunds, signed webhooks, and optional subscription capabilities. Use when
  registering fluent_cart/register_payment_methods, implementing meta(),
  fields(), makePaymentFromPaymentInstance(), handleIPN(), provider redirects,
  saved methods, off-session renewal charging, or debugging a gateway that is
  visible but cannot safely settle an order.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart payment gateways

Implement a gateway as a provider adapter around FluentCart's order,
transaction, and subscription state machine. A successful browser callback is
not proof of settlement.

Read [gateway-contract.md](references/gateway-contract.md) before creating the
PHP class, checkout JavaScript, webhook, or subscription branch.

## Implement the required contract

Extend AbstractPaymentGateway and supply BaseGatewaySettings. Implement:

- meta()
- fields()
- makePaymentFromPaymentInstance()
- handleIPN()
- getOrderInfo()

GatewayManager 1.6.0 requires meta keys brand_color, description, icon, logo,
route, status, and title. Also provide slug, upcoming, label/admin_title where
the corresponding UI path reads them. Keep route, slug, registration key,
frontend event suffix, stored option key, and webhook method consistent.

Attach the listener by fluentcart_loaded at the latest, then register during
fluent_cart/register_payment_methods. In 1.6.0 the registration action runs in
an earlier init callback than fluent_cart/init; adding this listener from
fluent_cart/init is too late.

~~~php
add_action('fluent_cart/register_payment_methods', static function (): void {
    fluent_cart_api()->registerCustomPaymentMethod(
        'acme_pay',
        new \Acme\FluentCart\AcmeGateway()
    );
});
~~~

registerCustomPaymentMethod requires an AbstractPaymentGateway instance.
GatewayManager invokes boot() when present and injects StoreSettings.

## Process the initial payment

Use the supplied PaymentInstance. Resolve/create provider objects with a stable
idempotency key derived from the FluentCart transaction/payment attempt and
mode. Return the response shape used by the active checkout client; 1.6.0
built-ins use status plus redirect_to or redirect_url depending on path, so test
the concrete checkout script instead of copying the generic docs example.

Never:

- create a second FluentCart order for the same PaymentInstance;
- trust client amount/currency/customer/provider IDs;
- mark an order paid before provider verification;
- store raw card data or secret credentials in order/transaction meta;
- turn a free trial into an unsupported zero-amount charge.

## Reconcile through the webhook

handleIPN() is publicly reachable. Verify the provider signature against the
raw request body before parsing business fields. Then verify event type, mode,
account, currency, amount, provider object ownership, FluentCart references,
and previous processing state.

Use a durable provider event/object idempotency record. Update/create the
transaction, then call the normal status synchronization path. Return a quick
2xx only after the local claim is durable; queue slow secondary work.

Do not construct a listener URL from memory. In 1.6.0 the source contains two
forms: PaymentHelper::listenerUrl() emits fct_payment_listener=1, while the
source-verified central WebRoutes handler and built-in Stripe/PayPal constants
use fluent-cart=fct_payment_listener_ipn. Confirm with an actual request that
the URL reaches this gateway's handleIPN() and re-audit this discrepancy after
upgrades.

## Integrate checkout JavaScript

- Enqueue through getEnqueueScriptSrc()/getEnqueueStyleSrc().
- Listen for fluent_cart_load_payments_{route}.
- Read the event detail contract from the active core checkout asset.
- Disable order submission until the provider element/token/setup is ready.
- Cancel or ignore stale asynchronous loads when the selected method changes.
- Never put a secret key in localized data.
- Make both page checkout and supported modal/embedded contexts work.

## Add optional capabilities deliberately

- Include refund only when processRefund() is implemented and provider-tested.
- Include subscriptions only with an AbstractSubscriptionModule.
- Include system_subscription only when stored-token off-session renewal
  charging is implemented.
- Override supportsSetupWithoutCharge() for zero-payable setup only when the
  provider supports it.
- Implement chargeRenewal() and reconcileRenewalCharge() for asynchronous
  system charges, preserving the true/processing/WP_Error contract.
- Route store-managed manual/system subscriptions through the one-time charge
  branch by respecting shouldChargeSubscriptionAsOneTime().

## Test matrix

Test live/test credentials, success, decline, cancel, retry, duplicate checkout,
browser-confirmation/webhook race, duplicate/out-of-order webhook, partial/full
refund, zero total, free trial setup, subscription renewal, signature failure,
wrong amount/currency/account, and unavailable provider API.

## Cross-references

- Use fluentcart-orders-transactions for settlement and refund semantics.
- Use fluentcart-subscriptions-renewals for recurring capabilities.
- Use wp-http-api-client for outbound WordPress HTTP behavior.

## References

- Official gateway guide: <https://dev.fluentcart.com/payment-methods-integration/>
- Official reference integration: <https://github.com/WPManageNinja/paystack-for-fluent-cart>
- Verified Free source paths:
  - fluent-cart/app/Modules/PaymentMethods/Core/PaymentGatewayInterface.php
  - fluent-cart/app/Modules/PaymentMethods/Core/AbstractPaymentGateway.php
  - fluent-cart/app/Modules/PaymentMethods/Core/AbstractSubscriptionModule.php
  - fluent-cart/app/Modules/PaymentMethods/Core/GatewayManager.php
  - fluent-cart/app/Modules/PaymentMethods/Cod/Cod.php
  - fluent-cart/app/Hooks/Handlers/GlobalPaymentHandler.php
  - fluent-cart/app/Services/Payments/PaymentInstance.php
  - fluent-cart/app/Services/Payments/PaymentHelper.php
  - fluent-cart/assets/cod-checkout.js
