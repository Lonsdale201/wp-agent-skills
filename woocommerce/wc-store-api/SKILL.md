---
name: wc-store-api
description: Build shopper-facing WooCommerce integrations with the Store API. Covers `/wc/store/v1`, public product reads, cart Nonce and Cart-Token authentication, CORS, Store API sessions, endpoint data and cart update extensions, add-to-cart validation, payment requirements, checkout draft timing, and feature-gated routes. Use for headless carts, Checkout Block server integration, Store API response extensions, cart mutations, or debugging nonce/session/order timing.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://developer.woocommerce.com/docs/apis/store-api/
  - https://developer.woocommerce.com/docs/apis/store-api/nonce-tokens/
  - https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/
source-refs:
  - wp-content/plugins/woocommerce/src/StoreApi/RoutesController.php
  - wp-content/plugins/woocommerce/src/StoreApi/Authentication.php
  - wp-content/plugins/woocommerce/src/StoreApi/SessionHandler.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/AbstractCartRoute.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/Checkout.php
  - wp-content/plugins/woocommerce/src/StoreApi/Schemas/ExtendSchema.php
  - wp-content/plugins/woocommerce/src/StoreApi/functions.php
---

# WooCommerce Store API

Store API is the public shopper/cart surface. It is different from authenticated merchant CRUD under `wc/v3` or `wc/v4`.

## Namespace and route families

WooCommerce registers the stable routes under both `wc/store` and `wc/store/v1`; use the explicit versioned form in clients:

```text
/wp-json/wc/store/v1/products
/wp-json/wc/store/v1/products/<id>
/wp-json/wc/store/v1/cart
/wp-json/wc/store/v1/cart/add-item
/wp-json/wc/store/v1/cart/update-item
/wp-json/wc/store/v1/cart/remove-item
/wp-json/wc/store/v1/cart/apply-coupon
/wp-json/wc/store/v1/cart/update-customer
/wp-json/wc/store/v1/cart/select-shipping-rate
/wp-json/wc/store/v1/cart/extensions
/wp-json/wc/store/v1/checkout
/wp-json/wc/store/v1/order/<id>
```

Products, categories, brands, tags, attributes, terms, collection data, and reviews are read-oriented shopper resources. They honor catalog visibility and are not private catalog/admin APIs.

Shopper-list routes are registered only when WooCommerce's `ShopperListsController` reports at least one supporting feature enabled. The experimental `agentic_checkout` feature uses a separate `wc/agentic/v1` namespace, is disabled by default, and must not be assumed to be Store API v1.

## Nonce and Cart-Token

Cart writes require one of these identities:

1. `Nonce` request header containing `wp_create_nonce( 'wc_store_api' )` for cookie/session browser flows.
2. A valid `Cart-Token` header for token-based headless continuity.

Do not send `X-WP-Nonce`/`wp_rest` as a Store API cart nonce. That is the regular WP REST convention, not the Store API write contract.

Headless flow:

```bash
# The response supplies Cart-Token and a refreshed Nonce.
curl -i https://store.example/wp-json/wc/store/v1/cart

curl -X POST https://store.example/wp-json/wc/store/v1/cart/add-item \
  -H 'Content-Type: application/json' \
  -H "Cart-Token: $CART_TOKEN" \
  -d '{"id":123,"quantity":1}'
```

Capture the newest token/header values from responses. Treat `Cart-Token` as a bearer credential: do not log it, put it in analytics URLs, or share it across customers.

Store API's token handler shares `wp_woocommerce_sessions` with the classic handler but has no cookie, cron, or object-cache layer.

## CORS boundary

Store API permits `Cart-Token` and `Nonce` request headers. It exposes `Cart-Token`, not the nonce, in CORS responses. A valid Cart-Token can authorize an origin that would otherwise fail the Store API origin check.

Set a narrow frontend origin policy around any additional custom endpoints. Never expose Woo consumer keys, gateway secrets, or admin REST credentials to the shopper client.

## Extend response data

Register after `woocommerce_blocks_loaded` and use the public helper:

```php
use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;

add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_endpoint_data( array(
        'endpoint'        => ProductSchema::IDENTIFIER,
        'namespace'       => 'myplugin',
        'data_callback'   => static function ( WC_Product $product ): array {
            return array(
                'badge' => (string) $product->get_meta( '_myplugin_public_badge' ),
            );
        },
        'schema_callback' => static function (): array {
            return array(
                'badge' => array(
                    'description' => __( 'Public badge text.', 'myplugin' ),
                    'type'        => 'string',
                    'readonly'    => true,
                ),
            );
        },
        'schema_type'     => ARRAY_A,
    ) );
} );
```

Extension data appears below `extensions.myplugin`. Callbacks and schema callbacks must return arrays. Keep data callbacks read-only, cheap, and free of secrets or admin-only metadata.

Supported extension schema identifiers include cart, cart item, checkout, and product. Use the schema constants rather than hardcoded identifiers where available.

## Mutate extension cart state

Use `/cart/extensions` and a registered update callback:

```php
add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_update_callback( array(
        'namespace' => 'myplugin',
        'callback'  => static function ( array $data ): void {
            WC()->session->set( 'myplugin_gift_wrap', ! empty( $data['gift_wrap'] ) );
        },
    ) );
} );
```

The route runs the callback, recalculates totals, and returns a fresh cart. Validate and normalize every value in the callback; namespace registration is routing, not authorization.

Arbitrary JSON fields sent to `/cart/add-item` are not automatically copied into cart item data. Bridge deliberate fields through `woocommerce_store_api_add_to_cart_data`, then validate them.

## Add-to-cart validation and quantities

```php
add_action(
    'woocommerce_store_api_validate_add_to_cart',
    static function ( WC_Product $product, array $request ): void {
        if ( myplugin_product_is_locked( $product ) ) {
            throw new Exception( __( 'This product cannot be added to the cart.', 'myplugin' ) );
        }
    },
    10,
    2
);
```

Quantity constraints exposed to clients use:

```text
woocommerce_store_api_product_quantity_minimum
woocommerce_store_api_product_quantity_maximum
woocommerce_store_api_product_quantity_multiple_of
woocommerce_store_api_product_quantity_editable
```

Server validation still owns the final decision; client limits are UX hints.

## Checkout draft timing

Since WooCommerce 10.8, `PATCH /checkout` can update customer/session state before any `WC_Order` exists. Draft order materialization is deferred to POST/place-order.

| Need | Hook | Order available |
|---|---|---|
| Observe PATCH draft updates | `woocommerce_store_api_checkout_update_draft` | No; receives request |
| First order materialization | `woocommerce_store_api_checkout_order_created` | Yes; receives order |
| Write order metadata | `woocommerce_store_api_checkout_update_order_meta` | Yes; receives order |

Persist pre-order state in the Woo session, then copy it into the order object at `woocommerce_store_api_checkout_update_order_meta`. The old `__experimental_woocommerce_blocks_checkout_update_order_meta` and `woocommerce_blocks_checkout_update_order_meta` actions are deprecated.

WooCommerce 10.9.4 also fixed checkout order `is_vat_exempt` synchronization for logged-in shoppers. Do not trust a client-supplied VAT-exempt flag; set validated customer state server-side and let checkout copy current cart customer state.

## Payment requirements

```php
add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_payment_requirements( array(
        'data_callback' => static function (): array {
            return myplugin_cart_needs_tokenization() ? array( 'tokenization' ) : array();
        },
    ) );
} );
```

Requirements are compared with gateway `$supports`. This filters gateway eligibility; it does not register a Checkout Block payment UI or replace the PHP gateway's `process_payment()`.

## Critical rules

- Use `wc/store/v1` for shopper cart/checkout, not `wc/v4`.
- Use `Nonce` with action `wc_store_api`, or a valid `Cart-Token`.
- Register Store API extensions on `woocommerce_blocks_loaded`.
- Namespace response/update data and return schema-compatible arrays.
- Never mutate state in a response data callback.
- Never assume a checkout order exists during PATCH.
- Never disable nonce checks in production.
- Apply rate limits and idempotency to public write-heavy flows.
- Do not subclass Store API route internals; use documented helper functions or your own WP REST route.

## Cross-references

- `wc-customer-and-sessions` for classic versus token sessions.
- `wc-payment-gateway` for gateway support and payment completion.
- `wc-rest-api-v4` for authenticated merchant/admin CRUD.
- `wc-hpos-compatibility` for order metadata and queries.

## References

- Route registry and conditional route groups: `src/StoreApi/RoutesController.php`.
- Nonce, token, and CORS behavior: `src/StoreApi/Authentication.php` and `Routes/V1/AbstractCartRoute.php`.
- Deferred checkout lifecycle: `src/StoreApi/Routes/V1/Checkout.php`.
- Public extension helpers: `src/StoreApi/functions.php` and `Schemas/ExtendSchema.php`.
