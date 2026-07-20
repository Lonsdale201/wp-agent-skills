---
name: wc-stripe-add-payment-method
description: Build or audit WooCommerce Stripe Gateway My Account saved-payment-method flows. Covers the canonical Woo form contract, Stripe UPE SetupIntents, exact selectors and POST fields, billing details, polymorphic Woo tokens including native Link, remote reconciliation/detach/default synchronization, custom endpoint security, and the Subscriptions boundary. Use for payment-methods.php, form-add-payment-method.php, add_payment_method, wc-stripe-setup-intent, wc-stripe-upe-element, Stripe saved cards or Link, or custom customer payment-method screens.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-gateway-stripe"
  wp-skills-plugin-version-tested: "10.8.4"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce Stripe: saved payment methods

Use this skill when account markup or custom code can affect adding, listing, deleting, or defaulting Stripe payment methods. These flows are contracts between Woo templates, `WC_Form_Handler`, Stripe UPE JavaScript, SetupIntents, and Woo payment tokens.

## Non-negotiable boundary

Do not rebuild Stripe Elements markup or submit raw card data to WordPress. Keep `$gateway->payment_fields()` and let Stripe.js own payment details. WordPress receives only provider identifiers such as `seti_...` and `pm_...`.

Stripe 10.8.4 uses `WC_Stripe_UPE_Payment_Gateway` as the main `stripe` gateway. `WC_Gateway_Stripe` is only a deprecated compatibility subclass. Optimized Checkout is deliberately disabled on Add payment method and Subscriptions Change payment method pages; those pages use the standard UPE flow. Express Checkout on a subscription change-payment page is a separate Stripe 10.8+ feature covered by `wc-stripe-subscriptions`.

## Canonical Woo form

Prefer Woo's template unchanged. The following is a condensed selector map, not a complete accessible replacement template. If overriding `myaccount/form-add-payment-method.php`, start from the installed Woo template and preserve:

```php
<form id="add_payment_method" method="post">
    <div id="payment" class="woocommerce-Payment">
        <ul class="woocommerce-PaymentMethods payment_methods methods">
            <li class="woocommerce-PaymentMethod payment_method_<?php echo esc_attr( $gateway->id ); ?>">
                <input
                    id="payment_method_<?php echo esc_attr( $gateway->id ); ?>"
                    class="input-radio"
                    type="radio"
                    name="payment_method"
                    value="<?php echo esc_attr( $gateway->id ); ?>"
                />
                <div class="payment_box payment_method_<?php echo esc_attr( $gateway->id ); ?>">
                    <?php $gateway->payment_fields(); ?>
                </div>
            </li>
        </ul>
        <?php do_action( 'woocommerce_add_payment_method_form_bottom' ); ?>
        <?php wp_nonce_field( 'woocommerce-add-payment-method', 'woocommerce-add-payment-method-nonce' ); ?>
        <button id="place_order" type="submit">...</button>
        <input type="hidden" name="woocommerce_add_payment_method" value="1" />
    </div>
</form>
```

Required contracts:

- `form#add_payment_method` is watched by Woo and Stripe scripts.
- The gateway radio must use `name="payment_method"`, `.input-radio`, and `id="payment_method_{gateway_id}"`.
- The box must retain `.payment_box.payment_method_{gateway_id}`.
- The nonce action/name are `woocommerce-add-payment-method` and `woocommerce-add-payment-method-nonce`.
- `woocommerce_add_payment_method=1` is the form-handler gate.
- Call `$gateway->payment_fields()`; do not copy its generated fieldset.

`WC_Form_Handler::add_payment_method_action()` verifies the nonce, applies `woocommerce_add_payment_method_form_is_valid`, rate-limits by user, checks `add_payment_method` or `tokenization` support, calls `validate_fields()`, then `add_payment_method()`.

## Stripe UPE contract

On Add payment method, Stripe localizes `wc-stripe-upe-classic` as `wc_stripe_upe_params`. Important values include `isAddPaymentMethod`, `cartTotal = 0`, `customerBillingData`, `customerData.billing_country`, `createSetupIntentNonce`, `paymentMethodsConfig`, and `addPaymentReturnURL`.

The main gateway renders:

```html
<fieldset id="wc-stripe-upe-form" class="wc-upe-form wc-payment-form">
    <div class="wc-stripe-upe-element" data-payment-method-type="card"></div>
    <div id="wc-stripe-upe-errors" role="alert"></div>
    <input id="wc-stripe-payment-method-upe" name="wc-stripe-payment-method-upe" type="hidden" />
    <input id="wc_stripe_selected_upe_payment_type" name="wc_stripe_selected_upe_payment_type" type="hidden" />
</fieldset>
```

Reusable alternative methods render `#wc-{gateway_id}-upe-form` with `.wc-stripe-upe-element[data-payment-method-type="..."]`.

The frontend initializes/confirms a SetupIntent and appends `wc-stripe-setup-intent`. The gateway then retrieves the SetupIntent and PaymentMethod, creates or updates a `WC_Payment_Token`, clears the Stripe customer cache, fires:

```php
do_action( 'woocommerce_stripe_add_payment_method', $user_id, $payment_method_object );
```

and redirects to the `payment-methods` endpoint. Do not document this hook with a token ID: its arguments are user ID and the Stripe PaymentMethod object.

### Link boundary

Classify the retrieved PaymentMethod, not its `pm_...` prefix. A native Stripe `type=link` method becomes `WC_Payment_Token_Link` with Woo token type `link`, gateway `stripe`, and email metadata; it is not a `WC_Payment_Token_CC`. A `type=card` method with `card.wallet.type=link` remains a Stripe CC token with card fields. Do not store either one under a fictional `stripe_link` order gateway.

When Link is enabled, Stripe hides the Woo store-level save checkbox for card and Link because the Payment Element owns Link-wallet consent. Do not re-add that checkbox. Add payment method still uses a SetupIntent and the gateway's merchant-side token-creation path. Use `wc-stripe-link-payments` for the complete identifier, consent, duplicate, and reconciliation contract.

## Billing data

UPE preloads billing data from `WC()->customer`; country-restricted methods also depend on `customerData.billing_country`. Custom account screens must map edits back to canonical Woo customer properties:

- `billing_first_name`, `billing_last_name`, `billing_email`, `billing_phone`
- `billing_address_1`, `billing_address_2`, `billing_city`
- `billing_state`, `billing_postcode`, `billing_country`

Custom field names such as `firstName` or `zip` are harmless only after explicit server-side mapping and validation. Never assume a visible custom form automatically updates `WC()->customer`.

## Listing, deleting, and defaulting

List methods with `wc_get_customer_saved_methods_list( get_current_user_id() )`; preserve URLs from `$method['actions']`. Do not synthesize Stripe rows from remote objects because Woo/Stripe filters merge reusable card, Link, debit, wallet, and other token classes.

For custom token actions:

1. Load with `WC_Payment_Tokens::get( $token_id )`.
2. Require `(int) $token->get_user_id() === get_current_user_id()`.
3. Confirm the token gateway belongs to the Stripe integration.
4. Before deletion, check whether active subscriptions depend on the token and require an intentional replacement/migration policy.
5. Delete with `$token->delete()` or default with `WC_Payment_Tokens::set_users_default()`.

Do **not** manually call `WC_Stripe_Customer::detach_payment_method()` before ordinary Woo token deletion. Stripe listens to `woocommerce_payment_token_deleted` and detaches reusable methods itself. Manual detach followed by token deletion duplicates the remote operation. Likewise, `woocommerce_payment_token_set_default` synchronizes supported `pm_`/`src_` defaults to Stripe.

## Custom REST or AJAX UI

Woo does not expose a shopper-facing saved-payment-method REST CRUD API. A custom API must:

1. Use WordPress REST authentication and derive the user from `get_current_user_id()`.
2. Create a SetupIntent server-side for that user's Stripe customer and return only its ID/client secret.
3. Let Stripe.js confirm it; raw payment details never touch WordPress.
4. Retrieve the SetupIntent server-side and require the expected customer, allowed payment-method type, and a successful/usable status.
5. Retrieve the PaymentMethod, create/update the Woo token through the installed gateway's token service, clear caches, and fire the normal success hook.
6. Apply nonce/authentication, rate limiting, idempotency, and ownership checks to confirm/delete/default endpoints.

Do not invoke plugin AJAX controller methods by faking `$_POST`; they are request handlers, not stable service APIs. Stripe gateway classes are plugin internals, so version-guard any direct integration and pin tests to the installed plugin version.

## Subscriptions boundary

Adding a token and changing a subscription's payment method are different operations. Never update only `_stripe_source_id` or `_stripe_customer_id`. Use WCS change-payment flow plus Stripe's SetupIntent/token path so gateway hooks, remote state, SCA, and update-all behavior run. Use `wc-stripe-subscriptions` for that workflow.

## Debug checklist

1. Confirm `form#add_payment_method`, canonical radio/box selectors, nonce, and hidden submit gate exist.
2. Confirm `wc-stripe-upe-classic`, Stripe.js, and `wc_stripe_upe_params` load without duplicate/conflicting Stripe.js versions.
3. Confirm the mount container is inside the selected gateway box.
4. Confirm SetupIntent creation succeeds and the final POST contains `wc-stripe-setup-intent`.
5. Confirm `woocommerce_stripe_add_payment_method` fires once and a Woo token is created for the current user.
6. Confirm the method appears in My Account after Stripe customer cache clearing.
7. Test delete/default, duplicate-card handling, native Link versus card-through-Link, redirect/SCA methods, and subscription change-payment separately.

## Cross-references

- Use `wc-payment-tokens` for provider-neutral Woo token storage and ownership rules.
- Use `wc-stripe-link-payments` for native Link versus Link-wallet card tokens, consent, and remote reconciliation.
- Use `wc-stripe-subscriptions` for renewals, payment-method changes, SCA, and Express Checkout on subscriptions.
- Use `wc-stripe-webhooks` for webhook validation, deferred settlement, and order-state hooks.
- See [reference.md](reference.md) for the full My Account list/template and legacy compatibility notes.

## References

- Verified source paths:
  - `wp-content/plugins/woocommerce/templates/myaccount/payment-methods.php`
  - `wp-content/plugins/woocommerce/templates/myaccount/form-add-payment-method.php`
  - `wp-content/plugins/woocommerce/includes/class-wc-form-handler.php`
  - `wp-content/plugins/woocommerce/assets/js/frontend/add-payment-method.js`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-gateway.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-method.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-intent-controller.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-tokens/class-wc-stripe-payment-tokens.php`
  - `wp-content/plugins/woocommerce-gateway-stripe/includes/compat/trait-wc-stripe-subscriptions.php`
