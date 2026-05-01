---
name: wc-stripe-add-payment-method
description: WooCommerce Stripe Gateway skill for the fragile My Account
  payment-methods and add-payment-method flows. Use when editing or
  replacing Woo account templates, payment-methods.php,
  form-add-payment-method.php, Stripe card/token UI, saved cards,
  SetupIntent, Payment Element/UPE, billing details, WC payment tokens,
  customer account payment-method endpoints, Subscriptions
  change-payment-method compatibility, or code contains
  add_payment_method, add-payment-method, form#add_payment_method,
  payment_method_stripe, wc-stripe-upe-element, wc-stripe-setup-intent,
  stripe_source, wc_stripe_create_setup_intent, wc_stripe_upe_params,
  wc-stripe-payment-method, or woocommerce-gateway-stripe.
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-gateway-stripe
plugin-version-tested: "10.6.1"
woocommerce-version-tested: "10.7"
php-min: "7.4"
last-updated: "2026-05-01"
source-refs:
  - wp-content/plugins/woocommerce/templates/myaccount/payment-methods.php
  - wp-content/plugins/woocommerce/templates/myaccount/form-add-payment-method.php
  - wp-content/plugins/woocommerce/includes/class-wc-form-handler.php
  - wp-content/plugins/woocommerce/includes/class-wc-frontend-scripts.php
  - wp-content/plugins/woocommerce/includes/shortcodes/class-wc-shortcode-my-account.php
  - wp-content/plugins/woocommerce/assets/js/frontend/add-payment-method.js
  - wp-content/plugins/woocommerce-gateway-stripe/woocommerce-gateway-stripe.php
  - wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-gateway.php
  - wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-method.php
  - wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-intent-controller.php
  - wp-content/plugins/woocommerce-gateway-stripe/includes/abstracts/abstract-wc-stripe-payment-gateway.php
  - wp-content/plugins/woocommerce-gateway-stripe/assets/js/stripe.js
  - wp-content/plugins/woocommerce-gateway-stripe/build/upe-classic.js
  - wp-content/plugins/woocommerce-gateway-stripe/includes/payment-tokens/class-wc-stripe-payment-tokens.php
  - wp-content/plugins/woocommerce/includes/class-wc-payment-tokens.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-payment-token-data-store.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-change-payment-gateway.php
---

# WooCommerce Stripe: add saved payment method

Use this when an account page, theme override, Elementor template, or custom plugin touches WooCommerce My Account payment methods. This flow is easy to break because Woo core, Woo frontend JS, Stripe JS, and Stripe setup-intent handlers all depend on exact form IDs, input names, classes, and billing data.

## Misconception this skill corrects

> "The payment-methods page is just a list and a card form. I can rebuild the markup with my own class names."

Do not do that. The Add payment method endpoint is not a generic form. WooCommerce core processes a specific POST shape, Woo's `wc-add-payment-method` script opens/closes gateway boxes from specific selectors, and Stripe mounts Elements/Payment Element into specific containers before adding hidden fields that Woo's form handler and Stripe gateway expect.

## First decision

1. If the task is only to restyle My Account, keep Woo templates and override CSS/classes around them.
2. If replacing templates, preserve the canonical structure below exactly and wrap it with custom markup instead of renaming IDs/classes.
3. If adding custom billing fields, use the canonical Woo billing field IDs/names so Stripe can build `billing_details`.
4. If debugging "can't add card", inspect the browser console, the submitted POST body, and Woo/Stripe logs before changing PHP.

## Account endpoints

Woo maps account endpoints through `WC_Query` and template hooks:

- `payment-methods`: renders `myaccount/payment-methods.php` via `woocommerce_account_payment_methods()`.
- `add-payment-method`: renders `myaccount/form-add-payment-method.php` via `woocommerce_account_add_payment_method()`.
- Core form handling is `WC_Form_Handler::add_payment_method_action()`.

The Payment Methods menu item stays active on `add-payment-method`; do not invent a separate account section unless explicitly required.

## Payment methods list template

When overriding `myaccount/payment-methods.php`, preserve these behaviors:

- Load methods with `wc_get_customer_saved_methods_list( get_current_user_id() )`.
- Keep hooks `woocommerce_before_account_payment_methods` and `woocommerce_after_account_payment_methods`.
- Keep the table class set:

```html
woocommerce-MyAccount-paymentMethods shop_table shop_table_responsive account-payment-methods-table
```

- Keep column cells shaped as:

```html
woocommerce-PaymentMethod woocommerce-PaymentMethod--{column_id} payment-method-{column_id}
```

- Keep row classes `payment-method` and conditional `default-payment-method`.
- Keep action links as `button {action_key}` and preserve action URLs from `$method['actions']`.
- The Add payment method link must use `wc_get_endpoint_url( 'add-payment-method' )`.

Do not hardcode Stripe token rows. Woo builds the list through saved payment token filters; Stripe can add card, SEPA, Link, Cash App, Klarna, Amazon Pay, and other reusable token types.

## Add payment method template contract

When overriding `myaccount/form-add-payment-method.php`, this structure is the contract:

```php
<form id="add_payment_method" method="post">
    <div id="payment" class="woocommerce-Payment">
        <ul class="woocommerce-PaymentMethods payment_methods methods">
            <li class="woocommerce-PaymentMethod woocommerce-PaymentMethod--<?php echo esc_attr( $gateway->id ); ?> payment_method_<?php echo esc_attr( $gateway->id ); ?>">
                <input
                    id="payment_method_<?php echo esc_attr( $gateway->id ); ?>"
                    type="radio"
                    class="input-radio"
                    name="payment_method"
                    value="<?php echo esc_attr( $gateway->id ); ?>"
                />
                <label for="payment_method_<?php echo esc_attr( $gateway->id ); ?>">
                    <?php echo wp_kses_post( $gateway->get_title() ); ?>
                    <?php echo wp_kses_post( $gateway->get_icon() ); ?>
                </label>
                <div class="woocommerce-PaymentBox woocommerce-PaymentBox--<?php echo esc_attr( $gateway->id ); ?> payment_box payment_method_<?php echo esc_attr( $gateway->id ); ?>">
                    <?php $gateway->payment_fields(); ?>
                </div>
            </li>
        </ul>
        <?php do_action( 'woocommerce_add_payment_method_form_bottom' ); ?>
        <?php wp_nonce_field( 'woocommerce-add-payment-method', 'woocommerce-add-payment-method-nonce' ); ?>
        <button type="submit" id="place_order" class="woocommerce-Button woocommerce-Button--alt button alt">...</button>
        <input type="hidden" name="woocommerce_add_payment_method" id="woocommerce_add_payment_method" value="1" />
    </div>
</form>
```

Required details:

- `form#add_payment_method` is used by Woo's `wc-add-payment-method` JS and Stripe's classic/UPE scripts.
- `name="payment_method"` is required by `WC_Form_Handler::add_payment_method_action()`.
- `id="payment_method_{gateway_id}"` and `.payment_box.payment_method_{gateway_id}` must match; Woo JS uses `div.payment_box.` + radio ID.
- `.payment_methods input.input-radio` is the selector Woo uses for gateway selection.
- The nonce field name must be `woocommerce-add-payment-method-nonce`.
- The hidden field `woocommerce_add_payment_method=1` must be submitted.
- Call `$gateway->payment_fields()`; do not manually recreate the Stripe fields unless you also implement every Stripe JS contract.

## Woo form handling

Core only processes the form when both are present:

- `$_POST['woocommerce_add_payment_method']`
- `$_POST['payment_method']`

Then it verifies `woocommerce-add-payment-method-nonce`, applies `woocommerce_add_payment_method_form_is_valid`, rate-limits per user, checks gateway support for `add_payment_method` or `tokenization`, calls `$gateway->validate_fields()`, then calls `$gateway->add_payment_method()`.

If a custom template posts by AJAX or to a custom endpoint, it must either reproduce this flow safely or submit the same form to Woo. The safer path is to keep Woo's normal form post.

## Custom account endpoints

WooCommerce does not provide a complete customer-facing REST API for saved payment methods. The built-in account flow is form/query based:

- Add card: `form#add_payment_method` -> `WC_Form_Handler::add_payment_method_action()` -> `$gateway->add_payment_method()`.
- Delete token: `delete-payment-method/{token_id}` query var -> owner/nonce check -> `WC_Payment_Tokens::delete()`.
- Set default: `set-default-payment-method/{token_id}` query var -> owner/nonce check -> `WC_Payment_Tokens::set_users_default()`.

If building a custom customer account endpoint, do not expose Woo consumer keys or Stripe secret keys to the client. Use normal WP REST authentication, map the request to `get_current_user_id()`, and enforce token ownership on every operation.

Recommended saved-card endpoint shape:

1. `POST /.../payment-methods/setup-intent`: create/update `WC_Stripe_Customer` for the current user, create a Stripe SetupIntent for allowed reusable payment method types, return only `id` and `client_secret`.
2. The client confirms the SetupIntent with Stripe.js/Stripe SDK. Raw card data must never pass through WordPress.
3. `POST /.../payment-methods/confirm`: accept the SetupIntent ID, retrieve it server-side, verify `status=succeeded`, verify the SetupIntent customer matches the current user's Stripe customer, fetch the PaymentMethod, then create/update the Woo token with Stripe gateway token helpers.
4. Clear Stripe/Woo token caches and fire `woocommerce_stripe_add_payment_method` after a successful save.

Use idempotency keys and rate limiting for setup/confirm endpoints. Core already rate-limits the form flow under `add_payment_method_{user_id}`; custom endpoints need an equivalent guard.

Do not treat "edit card" as changing PAN/CVC/expiry. Stripe PaymentMethods generally cannot be mutated that way; replace the card with a new SetupIntent/PaymentMethod. Billing details can be updated with `WC_Stripe_API::update_payment_method()`.

## Stripe UPE / Payment Element flow

Stripe Gateway 10.6.1 uses `WC_Stripe_UPE_Payment_Gateway` as the main gateway class. The frontend handle is `wc-stripe-upe-classic`, localized as `wc_stripe_upe_params`.

On add-payment-method pages, params include:

- `isAddPaymentMethod = true`
- `cartTotal = 0`
- `customerData.billing_country`
- `customerBillingData` from `WC()->customer`
- `createSetupIntentNonce`
- `paymentMethodsConfig`
- `addPaymentReturnURL = wc_get_account_endpoint_url( 'payment-methods' )`

Main Stripe gateway payment fields render:

```html
<fieldset id="wc-stripe-upe-form" class="wc-upe-form wc-payment-form">
    <div class="wc-stripe-upe-element" data-payment-method-type="card"></div>
    <div id="wc-stripe-upe-errors" role="alert"></div>
    <input id="wc-stripe-payment-method-upe" type="hidden" name="wc-stripe-payment-method-upe" />
    <input id="wc_stripe_selected_upe_payment_type" type="hidden" name="wc_stripe_selected_upe_payment_type" />
    <input type="text" id="wc-stripe-hidden-style-input" class="input-text" ... />
</fieldset>
```

Individual reusable UPE method gateways render:

```html
<fieldset id="wc-{gateway_id}-upe-form" class="wc-upe-form wc-payment-form">
    <div class="wc-stripe-upe-element" data-payment-method-type="{stripe_payment_method_type}"></div>
    <div id="wc-{gateway_id}-upe-errors" role="alert"></div>
</fieldset>
```

The UPE frontend:

- Mounts only into `.wc-stripe-upe-element[data-payment-method-type="..."]`.
- Watches `form#add_payment_method` submit.
- Creates a Stripe PaymentMethod and appends hidden `wc-stripe-payment-method`.
- Creates or confirms a SetupIntent.
- Appends hidden `wc-stripe-setup-intent` before allowing the Woo form submit.

The Stripe gateway `add_payment_method()` then requires `$_POST['wc-stripe-setup-intent']`, fetches the SetupIntent, fetches the Stripe PaymentMethod, creates or updates a Woo payment token, fires `woocommerce_stripe_add_payment_method`, and redirects to `payment-methods`.

## Stripe classic Elements flow

The legacy/classic script in `assets/js/stripe.js` is still a useful compatibility reference. It depends on:

- `form#add_payment_method` or `form#order_review`
- selected radios such as `#payment_method_stripe`, `#payment_method_stripe_sepa`
- `.payment_methods input[name="payment_method"]:checked`
- `#stripe-card-element`, and when not inline, `#stripe-exp-element`, `#stripe-cvc-element`
- `#stripe-iban-element` for SEPA
- `.stripe-source-errors` for error placement

Classic add-card flow:

1. On submit, if Stripe is selected and no saved token/source exists, prevent the normal submit.
2. Build billing owner details.
3. Call `stripe.createPaymentMethod({ type: 'card', card, billing_details })`.
4. Append hidden `<input class="stripe-source" name="stripe_source" value="pm_...">`.
5. POST to `wc_ajax_wc_stripe_create_setup_intent` with `stripe_source_id` and `wc_stripe_params.add_card_nonce`.
6. If the SetupIntent requires action, call `stripe.confirmCardSetup(client_secret, { payment_method })`.
7. Submit the Woo form after success.

If `stripe_source` is missing on a classic flow, or `wc-stripe-setup-intent` is missing on a UPE flow, the backend cannot save the card.

## Billing details are not optional

For card setup, Stripe uses billing details for fraud checks, SCA, address verification, receipts, and payment-method metadata. Custom account pages commonly break this.

If you render billing fields on the page, use these exact IDs/names:

- `billing_first_name`
- `billing_last_name`
- `billing_email`
- `billing_phone`
- `billing_address_1`
- `billing_address_2`
- `billing_city`
- `billing_state`
- `billing_postcode`
- `billing_country`

Classic JS reads those selectors directly and sends:

```js
stripe.createPaymentMethod({
    type: 'card',
    card: stripe_card,
    billing_details: {
        name,
        email,
        phone,
        address: { line1, line2, city, state, postal_code, country }
    }
});
```

UPE add-payment-method preloads `customerBillingData` from `WC()->customer`; if the UI lets users edit billing details, save them to the Woo customer before or during the flow, or submit canonical Woo billing fields and verify the Stripe JS consumes them. Do not use custom-only field names such as `firstName`, `zip`, or `countryCode` without mapping them back to Woo billing names.

Minimum country requirement: UPE uses `customerData.billing_country` to determine country-restricted payment methods. If it is empty, some methods may not mount or may fail validation.

## Saved token names

Do not rename saved-token fields:

- Core saved token radio name pattern: `wc-{gateway_id}-payment-token`.
- New token checkbox pattern: `wc-{gateway_id}-new-payment-method`.
- Stripe card save checkbox: `wc-stripe-new-payment-method`.
- Stripe reusable APM checkbox pattern: `wc-stripe_{payment_method_type}-new-payment-method`.

On add-payment-method pages Stripe forces save mode and may hide the checkbox. Hidden does not mean unnecessary.

## Token deletion and defaults

Woo tokens live in `woocommerce_payment_tokens` plus `woocommerce_payment_tokenmeta` and are accessed through `WC_Payment_Tokens`. Never delete or default a token by raw SQL/meta.

For delete/default endpoints or custom account actions:

- Load the token with `WC_Payment_Tokens::get( $token_id )`.
- Require `$token->get_user_id() === get_current_user_id()`.
- For Stripe tokens, detach the remote PaymentMethod from the current user's Stripe customer via `WC_Stripe_Customer::detach_payment_method()` or the gateway's existing cleanup path, then delete the Woo token.
- Clear Stripe customer payment method caches after detach/default changes.
- Before deleting, check whether active subscriptions use that token/source. If yes, require a replacement payment method first or intentionally migrate those subscriptions.
- For default, call `WC_Payment_Tokens::set_users_default( $user_id, $token_id )`; for Stripe also consider `WC_Stripe_Customer::set_default_payment_method( $payment_method_id )`.

## Subscriptions compatibility

Saved Stripe tokens are used by WooCommerce Subscriptions for renewals and change-payment-method flows. The Stripe gateway hooks `woocommerce_stripe_add_payment_method` so Subscriptions compatibility code can react after a method is added.

For a subscription payment-method change, do not only update `_stripe_source_id` or token meta. Use WCS' change-payment path:

- Verify the current user owns the subscription, unless this is trusted admin/server code.
- Verify the token belongs to the same user and Stripe customer.
- Create/confirm the SetupIntent if the method is new.
- Use `WC_Subscriptions_Change_Payment_Gateway::update_payment_method( $subscription, $gateway_id )` or the installed Stripe gateway's `confirm_change_payment_from_setup_intent` flow as the model.
- Set the Stripe customer/payment method on the subscription through gateway helpers such as `set_customer_id_for_subscription()` and `set_payment_method_id_for_subscription()`.
- Preserve hooks: `woocommerce_subscriptions_pre_update_payment_method`, `woocommerce_subscription_payment_method_updated`, and gateway-specific `..._to_{gateway_id}` / `..._from_{gateway_id}`.

Changing a subscription payment method can affect remote gateway profiles and manual-renewal behavior. Avoid manual meta writes unless doing a migration with full source review.

When editing account payment templates, verify:

- Adding a card from `/my-account/add-payment-method/` creates a Woo payment token.
- The new token appears in `/my-account/payment-methods/`.
- Existing subscriptions can use the token for "Change payment".
- Do not bypass `woocommerce_stripe_add_payment_method` or direct-create partial tokens.

## Safe customization patterns

Prefer:

```php
wc_get_template( 'myaccount/form-add-payment-method.php' );
```

or copy the Woo template and only add wrappers/classes around the canonical nodes.

Safe changes:

- Add wrapper divs around `#payment` or around the table.
- Add CSS classes while keeping Woo/Stripe classes.
- Filter columns via `woocommerce_account_payment_methods_columns`.
- Render custom column content via `woocommerce_account_payment_methods_column_{column_id}`.
- Add content via `woocommerce_before_account_payment_methods`, `woocommerce_after_account_payment_methods`, `before_woocommerce_add_payment_method`, `after_woocommerce_add_payment_method`, or `woocommerce_add_payment_method_form_bottom`.

Risky changes that usually break add-card:

- Renaming `#add_payment_method`.
- Removing `.payment_methods`, `.input-radio`, `.payment_box`, or `payment_method_{gateway_id}`.
- Rendering Stripe fields without `$gateway->payment_fields()`.
- Moving Stripe mount containers outside the selected gateway payment box.
- Removing nonce or hidden `woocommerce_add_payment_method`.
- Posting through a custom AJAX endpoint that never reaches `WC_Form_Handler::add_payment_method_action()`.
- Replacing billing field IDs/names with framework-only names.

## Debug checklist

On `/my-account/add-payment-method/`:

1. Page source contains `form#add_payment_method`.
2. The selected gateway radio has `name="payment_method"` and value `stripe` or `stripe_{method}`.
3. The selected gateway box contains either `.wc-stripe-upe-element` or classic Stripe element containers.
4. Browser console has no Stripe mount errors.
5. Network request creates a SetupIntent:
   - UPE: `wc_stripe_init_setup_intent` or related setup-intent call.
   - Classic: `wc_stripe_create_setup_intent`.
6. Final POST contains:
   - `woocommerce_add_payment_method=1`
   - `woocommerce-add-payment-method-nonce`
   - `payment_method`
   - UPE: `wc-stripe-setup-intent`
   - Classic: `stripe_source`
7. Woo notice says "Payment method successfully added."
8. Token appears in `wc_get_customer_saved_methods_list( get_current_user_id() )`.

## Source search commands

```bash
rg -n "add_payment_method|form#add_payment_method|wc-stripe-setup-intent|stripe_source|billing_details|wc-stripe-upe-element" \
  wp-content/plugins/woocommerce \
  wp-content/plugins/woocommerce-gateway-stripe
```

```bash
rg -n "woocommerce_account_payment_methods|woocommerce_account_add_payment_method|woocommerce_add_payment_method_form_bottom|woocommerce_stripe_add_payment_method" \
  wp-content/plugins/woocommerce \
  wp-content/plugins/woocommerce-gateway-stripe
```

## See also

- Use `wc-payment-gateway` for general custom gateway implementation and order state handling.
- Use `wcs-subscription-hooks` when a saved token must affect WooCommerce Subscriptions renewal or payment-method-change behavior.
