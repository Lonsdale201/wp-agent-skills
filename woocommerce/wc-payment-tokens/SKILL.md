---
name: wc-payment-tokens
description: Store and use WooCommerce saved payment methods through `WC_Payment_Tokens` and `WC_Payment_Token_CC` safely. Covers provider token vs card data, tokenization gateway support, creating/updating/deleting/defaulting tokens, My Account nonce and ownership checks, `get_customer_tokens`, `get_customer_default_token`, `get_order_tokens`, attaching tokens to orders, gateway ID filtering, custom token tables, hooks, HPOS-safe order use, and checkout saved-token validation. Use when building saved cards, charging a saved method, add-payment-method flows, token migrations, token deletion/default endpoints, or gateway tokenization.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/payment-gateway-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-payment-tokens.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-payment-token.php
  - wp-content/plugins/woocommerce/includes/payment-tokens/class-wc-payment-token-cc.php
  - wp-content/plugins/woocommerce/includes/payment-tokens/class-wc-payment-token-echeck.php
  - wp-content/plugins/woocommerce/includes/data-stores/class-wc-payment-token-data-store.php
  - wp-content/plugins/woocommerce/includes/class-wc-form-handler.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-payment-gateway.php
  - wp-content/plugins/woocommerce/includes/gateways/class-wc-payment-gateway-cc.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-order.php
---

# WooCommerce payment tokens

Payment tokens are WooCommerce's saved-payment-method records. They connect a WooCommerce customer to a gateway-owned provider token and safe display metadata such as card type, last4, and expiry.

They are not raw card storage. Never store PAN/card numbers, CVV, magnetic stripe data, or full bank credentials in WooCommerce token fields or meta.

## Misconception this skill corrects

> "I have a token ID from the browser, so I can charge it."

A token ID is user-controlled input. Load the token server-side and verify ownership, gateway ID, and token type before using it. WooCommerce's built-in My Account delete/default handlers check both nonce and ownership; custom endpoints must do the same.

## When to use this skill

Trigger when ANY of the following is true:

- Building a gateway with saved cards or saved bank accounts.
- Implementing Add payment method in My Account.
- Charging a saved token during checkout, renewal, or admin action.
- Deleting or setting a default saved payment method.
- Migrating provider tokens into WooCommerce.
- The diff contains `WC_Payment_Tokens`, `WC_Payment_Token_CC`, `WC_Payment_Token_ECheck`, `tokenization`, `woocommerce_payment_token`, `wc-{$gateway_id}-payment-token`, or `add_payment_token`.

## Data model

WooCommerce stores tokens in custom tables:

| Table | Purpose |
|---|---|
| `wp_woocommerce_payment_tokens` | token ID, gateway ID, provider token string, user ID, default flag, token type |
| `wp_woocommerce_payment_tokenmeta` | token type metadata such as last4, expiry, card type |

Use the API. Do not write these tables directly.

Core token fields:

| Field | Meaning |
|---|---|
| `token` | Provider token/reference, not card number. |
| `gateway_id` | Must match the payment gateway `$id`. |
| `user_id` | WordPress user ID, or 0 for guest/non-customer association. |
| `is_default` | One default token per user. |
| `type` | `CC`, `eCheck`, or a custom registered type. |

## Gateway support flag

A gateway that exposes saved methods must support tokenization:

```php
class MyGateway extends WC_Payment_Gateway {
    public function __construct() {
        $this->id       = 'mygateway';
        $this->supports = array( 'products', 'tokenization' );

        $this->init_form_fields();
        $this->init_settings();
    }
}
```

The checkout field names use the gateway ID, for example `wc-mygateway-payment-token` and `wc-mygateway-new-payment-method`.

Important: the tokenization helper methods live on `WC_Payment_Gateway`, but the base gateway's default `payment_fields()` does not render the saved-token UI. Core `WC_Payment_Gateway_CC` and `WC_Payment_Gateway_ECheck` call `tokenization_script()`, `saved_payment_methods()`, and `save_payment_method_checkbox()` from their `payment_fields()` methods. If your gateway extends base `WC_Payment_Gateway`, call those helpers yourself or extend the relevant tokenized gateway base class.

```php
public function payment_fields(): void {
    if ( $this->supports( 'tokenization' ) && is_checkout() ) {
        $this->tokenization_script();
        $this->saved_payment_methods();
        $this->render_provider_fields();
        $this->save_payment_method_checkbox();
        return;
    }

    $this->render_provider_fields();
}
```

## Create a credit-card token

Create the Woo token only after your provider has returned a reusable provider token.

```php
function myplugin_save_card_token( int $user_id, string $provider_token, array $card ): ?WC_Payment_Token_CC {
    if ( $user_id < 1 ) {
        return null;
    }

    $token = new WC_Payment_Token_CC();
    $token->set_token( $provider_token );
    $token->set_gateway_id( 'mygateway' );
    $token->set_user_id( $user_id );
    $token->set_card_type( sanitize_key( $card['brand'] ?? '' ) );
    $token->set_last4( preg_replace( '/\D+/', '', (string) ( $card['last4'] ?? '' ) ) );
    $token->set_expiry_month( (string) ( $card['exp_month'] ?? '' ) );
    $token->set_expiry_year( (string) ( $card['exp_year'] ?? '' ) );

    if ( null === WC_Payment_Tokens::get_customer_default_token( $user_id ) ) {
        $token->set_default( true );
    }

    if ( ! $token->validate() ) {
        return null;
    }

    try {
        $token_id = $token->save();
    } catch ( Exception $e ) {
        return null;
    }

    if ( ! $token_id ) {
        return null;
    }

    return $token;
}
```

`WC_Payment_Token_CC::validate()` requires provider token, last4, expiry month, expiry year, and card type. Expiry year must be four digits; expiry month is stored in two-digit format.

If `set_default( true )` is saved, WooCommerce flips other user tokens to non-default through `WC_Payment_Tokens::set_users_default()`.

## Read customer tokens

```php
$tokens = WC_Payment_Tokens::get_customer_tokens( get_current_user_id(), 'mygateway' );

foreach ( $tokens as $token ) {
    if ( $token instanceof WC_Payment_Token ) {
        echo esc_html( $token->get_display_name() );
    }
}
```

When no gateway ID is passed, WooCommerce filters to currently registered gateway IDs plus an empty gateway ID. During migrations or disabled-gateway cleanup, query the explicit old gateway ID or you may not see those tokens.

`get_customer_tokens()` is also limited by `woocommerce_get_customer_payment_tokens_limit` (`posts_per_page` by default). A migration that must enumerate every token should page through `WC_Payment_Tokens::get_tokens()` with explicit `user_id`, `gateway_id`, `limit`, and `page` arguments instead of assuming one call returns all rows.

Use `WC_Payment_Tokens::get_order_tokens( $order_id )` when you need token objects attached to an order. In WC 10.9.4, `$order->get_payment_tokens()` returns token IDs from the order data store; `WC_Payment_Tokens::get_order_tokens()` wraps them into token objects.

## Validate a chosen saved token at checkout

```php
$posted_token_id = isset( $_POST['wc-mygateway-payment-token'] )
    ? wc_clean( wp_unslash( $_POST['wc-mygateway-payment-token'] ) )
    : 'new';

if ( 'new' !== $posted_token_id ) {
    $token = WC_Payment_Tokens::get( absint( $posted_token_id ) );

    if (
        ! $token instanceof WC_Payment_Token ||
        (int) $token->get_user_id() !== get_current_user_id() ||
        'mygateway' !== $token->get_gateway_id()
    ) {
        wc_add_notice( __( 'Invalid payment method.', 'myplugin' ), 'error' );
        return array( 'result' => 'failure' );
    }

    $provider_token = $token->get_token( 'edit' );
    // Charge $provider_token through the gateway provider.
}
```

Do not send the raw provider token to JavaScript. Use token IDs and safe display names in UI; use the provider token only server-side.

## Attach token to an order

After a successful charge or authorization, attach the token to the order so future order views and integrations can find it.

```php
$order = wc_get_order( $order_id );
$token = WC_Payment_Tokens::get( $token_id );

if ( $order instanceof WC_Order && $token instanceof WC_Payment_Token ) {
    $order->add_payment_token( $token );
}
```

Use `WC_Payment_Tokens::get_order_tokens( $order_id )` later to retrieve token objects for that order.

## Delete and default actions

WooCommerce's built-in My Account handlers validate both ownership and nonce:

- delete nonce action: `delete-payment-method-{$token_id}`
- default nonce action: `set-default-payment-method-{$token_id}`
- ownership check: `get_current_user_id() === $token->get_user_id()`

Mirror that in custom REST/AJAX endpoints:

```php
$token_id = absint( $_POST['token_id'] ?? 0 );
$token    = WC_Payment_Tokens::get( $token_id );
$nonce    = isset( $_POST['_wpnonce'] )
    ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) )
    : '';

if (
    ! $token instanceof WC_Payment_Token ||
    (int) $token->get_user_id() !== get_current_user_id() ||
    ! wp_verify_nonce( $nonce, 'set-default-payment-method-' . $token_id )
) {
    wp_die( esc_html__( 'Invalid payment method.', 'myplugin' ), 403 );
}

WC_Payment_Tokens::set_users_default( $token->get_user_id(), $token_id );
```

For deletion:

```php
$delete_nonce = isset( $_POST['_wpnonce'] )
    ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) )
    : '';

if (
    $token instanceof WC_Payment_Token &&
    (int) $token->get_user_id() === get_current_user_id() &&
    wp_verify_nonce( $delete_nonce, 'delete-payment-method-' . $token_id )
) {
    WC_Payment_Tokens::delete( $token->get_id() );
}
```

Deleting a WooCommerce token does not automatically revoke the token at your payment provider unless your gateway implements that. Hook `woocommerce_payment_token_deleted` if provider-side cleanup is required.

## Useful hooks

| Hook | Use |
|---|---|
| `woocommerce_new_payment_token` | Token row created. |
| `woocommerce_payment_token_updated` | Token row updated. |
| `woocommerce_payment_token_deleted` | Token row deleted. |
| `woocommerce_payment_token_set_default` | User default token changed. |
| `woocommerce_get_customer_payment_tokens` | Filter listed customer tokens. |
| `woocommerce_payment_gateway_get_saved_payment_method_option_html` | Customize saved-token checkout radio HTML. |
| `woocommerce_payment_gateway_save_new_payment_method_option_html` | Customize save-token checkbox HTML. |
| `woocommerce_payment_token_added_to_order` | Token attached to an order. |

## Common mistakes

- Storing card numbers or CVV in `token` or token meta.
- Trusting a token ID without checking user ownership and gateway ID.
- Using direct SQL against token tables.
- Forgetting `'tokenization'` in gateway supports.
- Querying all tokens without an explicit gateway during disabled-gateway migrations.
- Assuming `$order->get_payment_tokens()` returns token objects; use `WC_Payment_Tokens::get_order_tokens()` for objects.
- Deleting a Woo token and assuming the provider token was revoked.
- Exposing `get_token( 'edit' )` to the browser or logs.

## Cross-skill routing

- Gateway `process_payment()` and add-payment-method flow: `wc-payment-gateway`
- HPOS-safe order reads/writes: `wc-hpos-compatibility`
- Store API payment requirements: `wc-store-api`
