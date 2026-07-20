# Stripe Link integration contract

Version scope: WooCommerce Stripe Gateway 10.8.4 with WooCommerce 10.9.4. Use this reference when a custom integration lists, stores, selects, deletes, defaults, or migrates Link methods, or changes a subscription to Link.

## Contents

1. [Object and identifier matrix](#object-and-identifier-matrix)
2. [Why Link is hidden behind the main gateway](#why-link-is-hidden-behind-the-main-gateway)
3. [Token construction and duplicate rules](#token-construction-and-duplicate-rules)
4. [Remote reconciliation](#remote-reconciliation)
5. [Checkout and intent behavior](#checkout-and-intent-behavior)
6. [Deletion and default behavior](#deletion-and-default-behavior)
7. [Orders and subscriptions](#orders-and-subscriptions)
8. [Security and compatibility](#security-and-compatibility)
9. [Regression checklist](#regression-checklist)

## Object and identifier matrix

| Layer | Native Link | Card used through Link |
|---|---|---|
| Stripe PaymentMethod ID | `pm_...` | `pm_...` |
| Stripe `type` | `link` | `card` |
| Stripe details | `link.email` | `card.brand`, `last4`, expiry, fingerprint, `wallet.type=link` |
| Woo class | `WC_Payment_Token_Link` | `WC_Stripe_Payment_Token_CC` |
| Woo token type | `link` | `CC` |
| Woo gateway ID | `stripe` | `stripe` |
| Duplicate key | Link email | Stripe card fingerprint |
| Display | `Stripe Link (email)` | ordinary card display in 10.8.4 |

The local Link class extends base `WC_Payment_Token`, not `WC_Payment_Token_CC`. Its extra data contains only `email`. It has no card brand, last4, expiry, or fingerprint contract.

The plugin maps lowercase token type `link` explicitly through `woocommerce_payment_token_class`. Without the active Stripe plugin/classmap/filter, core would derive a different class name and cannot reliably hydrate this provider-specific token. Treat plugin availability as a runtime requirement.

### `payment_method_type` accessor caveat

The Link class defines `set_payment_method_type()` and `get_payment_method_type()`, and creation code calls the setter. However, `payment_method_type` is absent from the class's `extra_data`, while `WC_Data::set_prop()` ignores undeclared properties. Runtime verification on 10.8.4 therefore yields:

```text
get_type()                => "link"
get_payment_method_type() => null
```

Use `get_type()`. Treat the accessor as a version-specific upstream inconsistency, not a usable contract.

## Why Link is hidden behind the main gateway

`WC_Stripe_UPE_Payment_Method_Link::get_id()` returns the provider method type `link`. The helper sets itself reusable but returns false from `is_available()`. Link appears inside Stripe-owned UI:

- the standard Payment Element associated with the card/main gateway;
- the Express Checkout Element;
- Optimized Checkout's consolidated element.

The method helper exists so the main gateway can describe, validate, save, and title Link. Its `link` ID is not a Woo gateway registration, and no `stripe_link` payment gateway is registered. Consequently:

- token gateway: `stripe`;
- order/subscription gateway: `stripe`;
- standard saved-token input: `wc-stripe-payment-token`;
- title may be `Link`;
- `stripe_link` must not be used as a business discriminator.

Determine Link from the final Stripe PaymentMethod/Woo token or from the trusted order title/type metadata maintained by the gateway, depending on the task.

## Token construction and duplicate rules

The Link method's creation path stores:

```text
class       WC_Payment_Token_Link
type        link
gateway_id  stripe
token       Stripe pm_... ID
user_id     WordPress user ID
email       Stripe payment_method.link.email
```

Creation must follow a server-retrieved Stripe PaymentMethod. Do not build this tuple from customer POST data.

`WC_Stripe_Payment_Tokens::get_duplicate_token()` loads up to 100 local tokens for the customer/gateway and delegates comparison to each token. Link equality requires:

```text
payment_method.type == link
payment_method.link.email == token.email
```

It does not compare PaymentMethod IDs. During remote synchronization, if a matching email is found and the old local `pm_...` is absent from the returned remote IDs, the local row is updated to the new PaymentMethod ID. This makes the email a reconciliation key, not an authorization key or globally unique domain identity.

## Remote reconciliation

`WC_Stripe_Payment_Tokens` filters `woocommerce_get_customer_payment_tokens`. On a logged-in request it can reconcile the local token list with the Stripe Customer:

1. accept only reusable Stripe gateway IDs;
2. stop when the initial local token count reaches `posts_per_page`;
3. categorize stored and deprecated local tokens by provider ID;
4. fetch all remote Stripe Customer PaymentMethods, cached under an all-methods transient;
5. filter to active reusable types, or all reusable types under Optimized Checkout;
6. preserve matching `pm_...` rows;
7. create missing type-specific Woo tokens;
8. collapse duplicates using the type-specific comparator;
9. delete local rows not represented in the active remote result.

The cleanup temporarily removes the normal remote-detach deletion action. Thus local reconciliation cleanup does not detach the PaymentMethod from Stripe.

Practical consequences:

- `get_customer_tokens()` can perform network I/O and local writes;
- CLI/cron without a logged-in user sees local state only;
- transient state can delay remote changes until cleared by gateway operations/expiry;
- disabled Link is outside the active type set, so its local row can be removed and later recreated if Link is re-enabled;
- local token IDs are projections, not permanent external identifiers;
- repeated listing in a loop risks expensive provider synchronization.

Use `WC_Payment_Tokens::get_tokens()` with explicit arguments when the task intentionally needs raw local rows and must avoid the customer-token filter. Use the gateway's normal UI/service when reconciliation is desired; direct Stripe internal service calls require version pinning.

## Checkout and intent behavior

### Standard Payment Element

The submitted Woo gateway remains `stripe`, so the selected internal type initially normalizes to `card`. When Link is enabled, intent creation expands that selection to:

```php
array( 'card', 'link' )
```

The final PaymentMethod object is authoritative. `set_payment_method_title_for_order()` detects `type=link`, forces order gateway `stripe`, and stores title `Link`.

The intent controller also treats a card selection as requiring Link mandate data when Link is enabled. A custom intent builder that strips `link` or bypasses the gateway's mandate handling is not equivalent.

### Express Checkout

The gateway intent request carries `express_payment_type=link`; the Express Checkout and WCS change-payment orchestration also uses `express_checkout_type=link`. For intent creation Link again permits both card and Link types. These markers express the UI route, not a promise that every returned provider object has identical shape.

### Save behavior

The gateway hides its own save checkbox for card/Link while Link is enabled because Stripe's Payment Element owns Link wallet consent. That does not guarantee a Woo token after every Link payment.

Woo token creation occurs when the gateway's merchant-side save path is active, including Add payment method SetupIntent, an automatic subscription requirement, an explicit supported save path, or later remote reconciliation of an attached PaymentMethod.

## Deletion and default behavior

Normal Woo token deletion invokes the Stripe token manager. For reusable Stripe gateways, including native Link, it detaches the stored `pm_...` from the Stripe Customer when provider-detach policy allows it. Do not detach manually and then delete the Woo token; that duplicates the remote operation.

Reconciliation cleanup intentionally disables that detach listener because a local stale/disabled projection should not necessarily delete the remote method.

Setting a Woo token as default triggers Stripe synchronization. Since Link token values begin with `pm_`, the plugin sets the Stripe Customer's default PaymentMethod. Keep the core ownership/nonce checks and normal token action rather than updating `is_default` or Stripe customer fields independently.

Deleting a local Link token does not delete the shopper's consumer Link account. It removes/detaches the merchant's Stripe Customer PaymentMethod relationship according to the gateway behavior.

## Orders and subscriptions

Orders store the main gateway `stripe` and title `Link`. Gateway-owned metadata stores the Stripe Customer and PaymentMethod/source ID. The PaymentMethod ID alone does not encode whether its object type is Link or card.

For WooCommerce Subscriptions:

- subscription gateway remains `stripe`;
- `_stripe_customer_id` identifies the Stripe Customer;
- `_stripe_source_id` can be a native Link or card-shaped `pm_...`;
- scheduled renewals use the normal `woocommerce_scheduled_subscription_payment_stripe` handler;
- display logic retrieves the provider object and renders `Via Stripe Link (email)` for native Link;
- payment-method changes must run WCS and Stripe orchestration, not raw meta updates.

Express change-payment has extra bookkeeping. It forces the old saved-token selector to `new`, clears implicit update-all consent, records the express type/payment-method ID across redirects, restores the `Link` title, and replaces the subscription's attached Woo token IDs through the order data store. Bypassing this can leave `_stripe_source_id`, `_payment_tokens`, visible title, and renewal behavior inconsistent.

## Security and compatibility

- Treat local token ID, provider `pm_...`, Link email, and Stripe Customer ID as separate identifiers.
- Verify local token ownership and gateway before use.
- Retrieve the provider object server-side when its actual type/customer matters.
- Do not authorize by Link email; it is PII and a mutable display/deduplication field.
- Do not expose raw provider IDs, customer IDs, client secrets, or full token objects through custom REST responses/logs.
- Avoid hard type hints to plugin classes before confirming Stripe is active and the class is loadable.
- Fail closed for unknown custom token types; do not cast them into a fake CC token.
- Pin and retest direct calls into Stripe gateway classes because they are extension internals.

## Regression checklist

- Hydrate `link` through the token-class filter and verify `get_type()`/`get_email()`.
- Verify `get_payment_method_type()` behavior against the installed plugin version.
- Verify native Link versus card wallet Link without calling the wrong getters.
- Exercise same-email duplicate and replacement-`pm_...` reconciliation.
- Compare logged-in customer listing with CLI/raw-local enumeration.
- Toggle Link off/on and observe local projection/recreated token ID.
- Test normal delete, reconciliation cleanup, and default selection separately.
- Test Payment Element and Express Checkout across classic, Blocks, and Optimized Checkout.
- Test one-time, Add payment method, subscription signup, renewal, change-payment, update-all, and 3DS return.
- Disable the Stripe plugin and verify custom code handles unhydratable provider-specific tokens safely.
