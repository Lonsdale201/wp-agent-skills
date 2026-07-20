# Stripe saved-payment-method reference

## Payment methods list template

When overriding `myaccount/payment-methods.php`, preserve:

- `woocommerce_before_account_payment_methods` and `woocommerce_after_account_payment_methods`, including their `$has_methods` argument.
- Table classes `woocommerce-MyAccount-paymentMethods shop_table shop_table_responsive account-payment-methods-table`.
- Cell classes `woocommerce-PaymentMethod woocommerce-PaymentMethod--{column_id} payment-method-{column_id}`.
- Row classes `payment-method` and conditional `default-payment-method`.
- Action URLs from `$method['actions']`; action links use `button {action_key}`.
- `wc_get_endpoint_url( 'add-payment-method' )` for the Add payment method URL.
- `wc_get_account_payment_methods_columns()` and `woocommerce_account_payment_methods_column_{column_id}` for custom columns.

Useful wrapping hooks are `woocommerce_before_account_payment_methods`, `woocommerce_after_account_payment_methods`, `before_woocommerce_add_payment_method`, `after_woocommerce_add_payment_method`, and `woocommerce_add_payment_method_form_bottom`.

## Saved field names

- Saved token radio: `wc-{gateway_id}-payment-token`.
- New-method checkbox: `wc-{gateway_id}-new-payment-method`.
- Main Stripe checkbox: `wc-stripe-new-payment-method`.
- Reusable UPE sub-gateway checkbox: `wc-stripe_{payment_method_type}-new-payment-method`.

On Add payment method and subscription purchases Stripe can force saving and hide the checkbox. Hidden does not mean optional.

## Classic compatibility path

`assets/js/stripe.js` remains in Stripe 10.8.4 for compatibility paths, but new integrations should target UPE. Legacy selectors include `#stripe-card-element`, `#stripe-iban-element`, `.stripe-source-errors`, and hidden `stripe_source`.

The old flow creates a PaymentMethod, calls the `wc_stripe_create_setup_intent` AJAX endpoint with `stripe_source_id` and the nonce, confirms SCA if required, then submits the Woo form. Do not choose this path for new UI and do not instantiate deprecated `WC_Gateway_Stripe`.

## Common breakage

- Renaming `#add_payment_method`, `.payment_methods`, `.input-radio`, `.payment_box`, or `payment_method_{gateway_id}`.
- Rendering Stripe mount containers outside the selected payment box.
- Removing the Woo nonce or `woocommerce_add_payment_method` hidden field.
- Posting to a custom endpoint without reproducing Woo ownership, rate-limit, and gateway checks.
- Manually creating partial tokens without the remote Stripe customer/payment method relation.
- Manually detaching a Stripe PaymentMethod and then calling normal Woo token deletion.
- Treating Add payment method as a subscription payment-method change.
- Casting every returned token to `WC_Payment_Token_CC`; native Link hydrates as `WC_Payment_Token_Link` and has no card-field contract.
