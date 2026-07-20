---
name: wc-stripe-link-payments
description: Implement or audit Stripe Link behavior in the WooCommerce Stripe Gateway, especially code that assumes every `pm_...` or `stripe` token is a card. Distinguishes native Stripe PaymentMethod `type=link` and `WC_Payment_Token_Link` from `type=card` with `card.wallet.type=link`, and covers gateway/type identifiers, Payment Element and Express Checkout, save consent, SetupIntents, remote-to-Woo token reconciliation, duplicate detection, checkout request validation, deletion/defaulting, orders, subscriptions, and Link-specific test cases. Use for Link by Stripe, `WC_Payment_Token_Link`, `link.email`, `wallet_type=link`, saved Link methods, or Stripe token type errors.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-gateway-stripe"
  wp-skills-plugin-version-tested: "10.8.4"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce Stripe Link payments

Do not model Link as a card brand or a separate WooCommerce gateway. Determine the representation from the Stripe PaymentMethod object and the hydrated Woo token.

## Distinguish the two Link representations

| Stripe object | Woo token | Durable fields | Meaning |
|---|---|---|---|
| `type = link`, `link.email` | `WC_Payment_Token_Link` | type `link`, gateway `stripe`, token `pm_...`, email meta | Native reusable Link PaymentMethod |
| `type = card`, `card.wallet.type = link` | `WC_Stripe_Payment_Token_CC` | type `CC`, gateway `stripe`, `pm_...`, card/fingerprint fields, `wallet_type=link` | A card-shaped PaymentMethod used through Link |

Both can have a `pm_...` ID. Never infer card shape from that prefix. The plugin deliberately does not expose Link branding for the second case: `get_wallet_brand_label()` returns a label only for Apple Pay and Google Pay.

## Keep the identifier layers separate

- Stripe method type: `link` or `card`.
- Woo token type: `link` or `CC`.
- Woo token class: `WC_Payment_Token_Link` or `WC_Stripe_Payment_Token_CC`.
- Woo gateway ID on the token, order, and subscription: `stripe`.
- Saved-token form field: `wc-stripe-payment-token`.
- Gateway intent marker: `express_payment_type=link`.
- Express Checkout/WCS bookkeeping marker: `express_checkout_type=link`.
- Shopper-facing order title: `Link`.

`WC_Stripe_UPE_Payment_Method_Link::get_id()` returns the Stripe method type `link`, not a Woo gateway ID, and `is_available()` deliberately returns false. The helper is not a standalone checkout gateway; there is no registered `stripe_link` gateway to store on an order.

## Inspect tokens polymorphically

```php
function myplugin_describe_stripe_token( WC_Payment_Token $token ): array {
	if ( 'stripe' !== $token->get_gateway_id() ) {
		return array();
	}

	$type = strtolower( $token->get_type() );

	if ( 'link' === $type && method_exists( $token, 'get_email' ) ) {
		return array(
			'kind'    => 'link',
			'display' => $token->get_display_name(),
			'email'   => sanitize_email( $token->get_email() ),
		);
	}

	if ( $token instanceof WC_Payment_Token_CC ) {
		return array(
			'kind'    => 'card',
			'display' => $token->get_display_name(),
			'last4'   => $token->get_last4(),
		);
	}

	return array(
		'kind'    => $type,
		'display' => $token->get_display_name(),
	);
}
```

Use `get_type()` and capabilities such as `method_exists()` before type-specific getters. Do not call `get_last4()`, expiry, card brand, or fingerprint methods on a Link token.

### Verified 10.8.4 quirk

`WC_Payment_Token_Link::set_payment_method_type()` calls `set_prop( 'payment_method_type', ... )`, but that property is absent from the class's `extra_data`. Consequently `get_payment_method_type()` returns `null` in 10.8.4. Do not use it to classify Link; use `get_type() === 'link'`. Version-guard and retest if upstream adds the property.

## Let the gateway create tokens

For Add payment method, checkout, or subscription changes, preserve the plugin's Payment Element/SetupIntent flow. It retrieves the final Stripe PaymentMethod, selects its method handler, and creates the matching Woo token:

- native Link stores `link.email` and the PaymentMethod ID;
- card stores safe card display fields and fingerprint;
- both use gateway ID `stripe`.

Do not construct a partial Link token from an email or browser-submitted `pm_...`. Link email is display/deduplication data, not authentication or proof of ownership. If direct integration is unavoidable, retrieve the PaymentMethod server-side and verify its Stripe Customer, type, usable state, and current Woo user before invoking a version-pinned gateway service.

The plugin deduplicates native Link tokens by `link.email`, not PaymentMethod ID. A replacement remote `pm_...` for the same Link email can update the existing local token. Therefore neither Link email nor the local Woo token ID is a safe immutable business identifier.

## Preserve Link's consent boundary

Link saving and WooCommerce-account tokenization are separate concepts:

- Link collects consent for the shopper's Link wallet inside Stripe's UI;
- a Woo saved method is a merchant-side local projection of a PaymentMethod attached to the Stripe Customer;
- having a Link wallet does not imply that a Woo token exists;
- deleting a Woo token does not delete the shopper's Link account.

When Link is enabled, the gateway hides the store-level save checkbox for card and Link because the Payment Element owns Link consent. Do not re-add or force that checkbox merely because custom UI expects `wc-stripe-new-payment-method`. Subscription and Add payment method paths have their own forced/setup logic.

## Preserve the payment surface contracts

### Payment Element

Link is offered inside the main Stripe/card surface rather than as a standalone Woo gateway. When card is selected and Link is enabled, the gateway requests both `card` and `link` intent types. Keep that pair; forcing only `card` breaks Link, SetupIntent, mandate, and some subscription paths.

### Express Checkout Element

Express Link sends `express_payment_type=link` into the gateway intent path and `express_checkout_type=link` for Express Checkout/WCS bookkeeping, but the order gateway remains `stripe`. The final PaymentMethod may still need server-side inspection; do not treat either request marker as the provider token type.

### Optimized Checkout

Multiple methods share the consolidated `stripe` gateway. Use the resolved PaymentMethod type and hydrated Woo token, not the selected container slug, as the type authority.

## Validate saved-token requests

Prefer the installed gateway's normal checkout flow. In custom authenticated endpoints, treat the posted value as a local Woo token ID:

```php
$token = WC_Payment_Tokens::get( absint( $request['token_id'] ?? 0 ) );

if (
	! $token instanceof WC_Payment_Token ||
	(int) $token->get_user_id() !== get_current_user_id() ||
	'stripe' !== $token->get_gateway_id() ||
	! in_array( strtolower( $token->get_type() ), array( 'cc', 'link' ), true )
) {
	return new WP_Error( 'invalid_payment_method', __( 'Invalid payment method.', 'myplugin' ), array( 'status' => 403 ) );
}

$payment_method_id = $token->get_token( 'edit' ); // Server-side only.
```

Then let the gateway retrieve/use the PaymentMethod. Do not expose the `pm_...`, Link email, SetupIntent client secret, or Stripe Customer ID in logs or general REST output.

## Account for reconciliation-on-read

The Stripe plugin filters `WC_Payment_Tokens::get_customer_tokens()` for logged-in requests. A token-list read can therefore:

1. call Stripe for active reusable PaymentMethod types;
2. create missing local Woo tokens;
3. update a duplicate token's remote `pm_...`;
4. delete local methods no longer returned for the active type set.

CLI/cron without a logged-in user does not take this synchronization path. The remote list is cached, and synchronization is skipped when the initial local token list already reaches the configured `posts_per_page` limit. Do not assume token enumeration is pure, context-independent, complete, or cheap.

Disabling Link can remove its local projection during a logged-in reconciliation while leaving the remote PaymentMethod attached; re-enabling can recreate it with another Woo token ID. Store durable domain relationships against the order/subscription and remote PaymentMethod purpose, not a permanently stable local token-row ID. Load [references/link-contract.md](references/link-contract.md) for the full sync, deletion/default, order, and subscription contracts.

## Handle orders and subscriptions through `stripe`

For a Link payment, the gateway stores:

- Woo payment method ID `stripe`;
- title `Link`;
- Stripe Customer ID in gateway-owned metadata;
- native or card-shaped `pm_...` source/payment-method ID.

Subscriptions also renew through gateway `stripe`; `_stripe_source_id` can contain a native Link `pm_...`. Do not switch the WCS gateway to `stripe_link`, infer Link from the gateway ID, or write `_stripe_source_id` directly.

On Express Checkout change-payment, the plugin replaces the subscription's attached Woo payment-token IDs with the local token matching the new Stripe PaymentMethod. Keep the WCS + Stripe orchestration so this, update-all consent, SetupIntent/SCA, titles, and hooks remain consistent.

## Test matrix

1. Native `type=link` versus `type=card` + `wallet.type=link`.
2. Classic Payment Element, Blocks, Optimized Checkout, and Express Checkout.
3. Guest, logged-in, Add payment method, and one-time checkout save behavior.
4. Existing saved Link selection through `wc-stripe-payment-token`.
5. Duplicate Link email with the same and a replacement `pm_...`.
6. Remote detach, Woo deletion, default change, disabled/re-enabled Link, cache refresh, and CLI versus logged-in listing.
7. Subscription signup, off-session renewal, standard and Express change-payment, update-all consent, and 3DS return.
8. Plugin disabled/missing custom token class; code must fail closed rather than assuming a CC token.

## Cross-references

- `wc-stripe-add-payment-method`: complete My Account form and SetupIntent contract.
- `wc-payment-tokens`: provider-neutral Woo token ownership and CRUD.
- `wc-stripe-subscriptions`: renewal, WCS change-payment, SCA, and detached-token behavior.
- `wc-stripe-webhooks`: asynchronous settlement and idempotent order transitions.

## Verified sources

- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-method-link.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-method-cc.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-upe-payment-gateway.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-express-checkout-element.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-methods/class-wc-stripe-express-checkout-helper.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-tokens/class-wc-stripe-link-payment-token.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-tokens/class-wc-stripe-cc-payment-token.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/payment-tokens/class-wc-stripe-payment-tokens.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-customer.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/class-wc-stripe-intent-controller.php`
- `wp-content/plugins/woocommerce-gateway-stripe/includes/compat/trait-wc-stripe-subscriptions.php`
