---
name: wc-store-api
description: Build against the WooCommerce Store API (`/wp-json/wc/store/v1`) for shopper-facing products, cart, checkout, Cart/Checkout Blocks, and headless carts. Covers route choice, Nonce header (`wp_create_nonce('wc_store_api')`) vs Cart-Token, Store API sessions/CORS/rate limits, `woocommerce_store_api_register_endpoint_data`, `/cart/extensions` + `extensionCartUpdate`, payment requirements, product query pitfalls such as `related`, and when to use WC REST `wc/v4` instead. Use when adding checkout-block data, Store API calls, custom cart state, Store API payment availability, or headless cart/checkout behavior.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.0"
php-min: "7.4"
last-updated: "2026-05-26"
docs:
  - https://developer.woocommerce.com/docs/apis/store-api/
  - https://developer.woocommerce.com/docs/apis/store-api/nonce-tokens/
  - https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/
  - https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/extend-store-api-add-data/
source-refs:
  - wp-content/plugins/woocommerce/src/StoreApi/RoutesController.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/AbstractCartRoute.php
  - wp-content/plugins/woocommerce/src/StoreApi/Authentication.php
  - wp-content/plugins/woocommerce/src/StoreApi/Schemas/ExtendSchema.php
  - wp-content/plugins/woocommerce/src/StoreApi/functions.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/CartExtensions.php
  - wp-content/plugins/woocommerce/src/StoreApi/Schemas/V1/CartExtensionsSchema.php
  - wp-content/plugins/woocommerce/src/StoreApi/Utilities/CartController.php
  - wp-content/plugins/woocommerce/src/StoreApi/Utilities/ProductQuery.php
  - wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/Products.php
  - wp-content/plugins/woocommerce/assets/client/blocks/wc-blocks-data.js
---

# WooCommerce Store API

The Store API is WooCommerce's shopper-facing REST surface. It powers Cart and Checkout blocks and is the right API for product browsing, current-cart reads/writes, current-customer checkout data, and headless cart/checkout flows.

It is **not** the admin/integration REST API (`/wp-json/wc/v3` or `/wp-json/wc/v4`). Store API routes are public by design and return data for the current shopper/session only. If you need store settings, arbitrary orders/customers by ID, private product data, or back-office CRUD, use authenticated WC REST (`wc/v4`) or a custom WP REST route with explicit permissions.

## Misconception this skill corrects

> "Checkout is WooCommerce REST, so I will call `/wp-json/wc/v4/orders` from the browser."

That leaks the wrong model. WC REST is capability/consumer-key based and exposes admin-style resources. Store API is cart/session based, uses `Nonce` or `Cart-Token` for write protection, and is shaped for blocks/headless storefronts. Do not ship WC consumer keys to a browser to make checkout work.

## When to use this skill

Trigger when ANY of the following is true:

- Building or debugging Cart/Checkout Blocks behavior.
- Calling `/wp-json/wc/store/v1/...` from JS, a mobile client, or a headless frontend.
- Adding extension data under `extensions.<namespace>` to cart items, cart, checkout, or products.
- Mutating custom cart state from block checkout via `/cart/extensions` or `extensionCartUpdate`.
- Filtering payment-method availability for block checkout with Store API payment requirements.
- The diff contains `woocommerce_store_api_register_endpoint_data`, `woocommerce_store_api_register_update_callback`, `woocommerce_store_api_register_payment_requirements`, `Cart-Token`, `wc_store_api`, or `extensionCartUpdate`.

## Mental model

| Need | Use |
|---|---|
| Public products/product filters for storefront UI | Store API `/wc/store/v1/products` |
| Current shopper cart read/write | Store API `/wc/store/v1/cart...` |
| Checkout the current cart | Store API `/wc/store/v1/checkout` |
| Add data to existing Store API responses | `woocommerce_store_api_register_endpoint_data()` |
| Let block UI update plugin cart state | `/cart/extensions` via `woocommerce_store_api_register_update_callback()` |
| Admin/server CRUD for orders, products, refunds, fulfillments, settings | WC REST `wc/v4` |
| Plugin-specific private endpoint | Custom `register_rest_route()` with `permission_callback` |

All stable Store API resources are under `/wp-json/wc/store/v1`. Woo also registers `/wc/store` as an alias to the current v1 routes, but hardcode `/wc/store/v1` in clients so versioning is explicit.

## Route map

Source-verified in `src/StoreApi/RoutesController.php` and `src/StoreApi/Routes/V1/`:

| Area | Common routes |
|---|---|
| Cart | `GET /cart`, `POST /cart/add-item`, `POST /cart/update-item`, `POST /cart/remove-item`, `POST /cart/apply-coupon`, `POST /cart/remove-coupon`, `POST /cart/update-customer`, `POST /cart/select-shipping-rate`, `POST /cart/extensions` |
| Cart collections | `/cart/items`, `/cart/items/<key>`, `/cart/coupons`, `/cart/coupons/<code>` |
| Checkout | `GET /checkout`, `POST /checkout`, `PUT /checkout`, `POST /checkout/<id>` |
| Order | `GET /order/<id>` for the current shopper/order key flow, not arbitrary admin lookup |
| Products | `/products`, `/products/<id>`, `/products/<slug>`, `/products/collection-data` |
| Taxonomies | `/products/categories`, `/products/tags`, `/products/attributes`, `/products/attributes/<id>/terms`, `/products/brands` |
| Reviews/batch | `/products/reviews`, `/batch` |

Private routes under `/wc/private` and experimental/feature-gated agentic checkout routes are not plugin extension contracts. Do not build public plugin behavior on them.

## Nonce, Cart-Token, and sessions

Store API writes do **not** use `X-WP-Nonce` / `wp_rest`. They use a header named `Nonce` whose value is created with:

```php
wp_create_nonce( 'wc_store_api' );
```

Cart routes send fresh headers with each response:

- `Nonce`
- `Nonce-Timestamp`
- `Cart-Token`
- `Cart-Hash`
- `User-ID`
- `Cache-Control: no-store`

For update methods (`POST`, `PUT`, `PATCH`, `DELETE`), `AbstractCartRoute` requires `Nonce` unless a valid `Cart-Token` header is present. Missing nonce returns `woocommerce_rest_missing_nonce` (401); invalid nonce returns `woocommerce_rest_invalid_nonce` (403).

Headless flow:

```bash
curl -i https://store.example/wp-json/wc/store/v1/cart
# Save the Cart-Token response header.

curl -H "Cart-Token: $CART_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"id":123,"quantity":1}' \
  https://store.example/wp-json/wc/store/v1/cart/add-item
```

Same-site browser flow can use cookies + the `Nonce` header returned by the API. A `Cart-Token` is usually easier for headless clients because it avoids cookie affinity and also bypasses the nonce requirement for cart/checkout updates.

Store API CORS is stricter than the default WP REST behavior because cart/checkout responses can include shopper data. `Cart-Token` and `Nonce` are allowed request headers; only `Cart-Token` is exposed in CORS responses. A valid cart token can allow access from origins that would otherwise fail origin checks.

## Extending response data

Register extension data after `woocommerce_blocks_loaded`; the Store API container is not ready before then. Use the helper functions rather than instantiating `ExtendSchema` yourself.

Extensible endpoint identifiers:

| Identifier | Constant | `data_callback` args |
|---|---|---|
| `cart` | `CartSchema::IDENTIFIER` | none |
| `cart-item` | `CartItemSchema::IDENTIFIER` | `$cart_item` |
| `checkout` | `CheckoutSchema::IDENTIFIER` | none |
| `product` | `ProductSchema::IDENTIFIER` | `WC_Product $product` |

Example: add public product badge data under `extensions.myplugin`:

```php
use Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema;

add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_endpoint_data( array(
        'endpoint'        => ProductSchema::IDENTIFIER,
        'namespace'       => 'myplugin',
        'data_callback'   => static function ( WC_Product $product ): array {
            return array(
                'badge' => (string) $product->get_meta( '_myplugin_badge' ),
            );
        },
        'schema_callback' => static function (): array {
            return array(
                'badge' => array(
                    'description' => __( 'Short public badge text.', 'myplugin' ),
                    'type'        => array( 'string', 'null' ),
                    'readonly'    => true,
                ),
            );
        },
        'schema_type'     => ARRAY_A,
    ) );
} );
```

Rules for extension data:

- Namespace is required and should be your plugin slug.
- `data_callback` and `schema_callback` must return arrays. Returning anything else is logged and becomes empty data for non-admins.
- Data appears under the endpoint's `extensions` object, not as a top-level field.
- Do not mutate cart/order state from a response `data_callback`; keep it read-only.
- Do not expose secrets, private settings, arbitrary customer/order lookups, or admin-only product data. Store API is public.

## Updating cart state from blocks

Use `/cart/extensions` for plugin state that the shopper can change in cart/checkout UI: gift wrap, delivery instruction, insurance toggle, pickup choice, custom fee option, etc.

PHP registration:

```php
add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_update_callback( array(
        'namespace' => 'myplugin',
        'callback'  => static function ( array $data ): void {
            $gift_wrap = ! empty( $data['gift_wrap'] );
            WC()->session->set( 'myplugin_gift_wrap', $gift_wrap );
        },
    ) );
} );
```

JS call from a checkout/cart block extension:

```js
import { extensionCartUpdate } from '@woocommerce/blocks-checkout';

await extensionCartUpdate( {
    namespace: 'myplugin',
    data: { gift_wrap: true },
    overwriteDirtyCustomerData: {
        shipping_address: false,
        billing_address: false,
    },
} );
```

`/cart/extensions` loads the cart, runs your callback with `data`, recalculates totals, and returns the updated cart response. In WC 10.8, `overwriteDirtyCustomerData` can be a boolean or an object with `shipping_address` / `billing_address` booleans, so extensions can avoid overwriting the shopper's unsaved address edits independently.

## Payment requirements

Payment requirements are extra cart-wide support flags. Store API merges your returned strings with the default requirement `products` and compares them against each gateway's `$supports` array.

```php
add_action( 'woocommerce_blocks_loaded', static function (): void {
    woocommerce_store_api_register_payment_requirements( array(
        'data_callback' => static function (): array {
            if ( myplugin_cart_requires_saved_card() ) {
                return array( 'tokenization' );
            }
            return array();
        },
    ) );
} );
```

This filters which gateways are valid for the current Store API cart. It does not register gateway UI. Checkout Block payment UI is still a JS payment-method integration; the PHP gateway class still owns `process_payment()`.

## Validation and quantity hooks

For Store API add-to-cart validation, prefer:

```php
add_action( 'woocommerce_store_api_validate_add_to_cart', static function ( WC_Product $product, array $request ): void {
    if ( myplugin_product_is_locked( $product ) ) {
        throw new Exception( __( 'This product cannot be added to the cart.', 'myplugin' ) );
    }
}, 10, 2 );
```

Quantity constraints shown in Store API cart/item schemas come from `QuantityLimits`. Filter:

```php
woocommerce_store_api_product_quantity_minimum
woocommerce_store_api_product_quantity_maximum
woocommerce_store_api_product_quantity_multiple_of
woocommerce_store_api_product_quantity_editable
```

Each receives the value, `WC_Product $product`, and optional `$cart_item`.

## Product endpoint notes for 10.8

`GET /wc/store/v1/products` is public and cache-sensitive. WC 10.8 fixed transient bloat caused by arbitrary product IDs in the `related` query parameter. In 10.8 source, `related` is an integer product ID, sanitized with `absint`, and invalid/non-visible products throw `woocommerce_rest_product_not_found`.

Rules:

- Pass a single product ID to `related`, not arrays or comma lists.
- Do not use Store API products as a private catalog endpoint. Visibility/readability checks still matter.
- Use WC REST `wc/v4/products` with proper auth when you need admin/private product fields.

## Critical rules

- **Store API is `wc/store/v1`, not `wc/v4`.** Use Store API for shopper cart/checkout; use WC REST for admin/integration CRUD.
- **Never ship WC consumer keys or secret gateway keys to a public client.**
- **Use header `Nonce`, action `wc_store_api`; not `X-WP-Nonce`, action `wp_rest`.**
- **Use `Cart-Token` for headless cart continuity.** Get it from `GET /cart`, send it back as a request header.
- **Register Store API extension callbacks on `woocommerce_blocks_loaded`.**
- **Keep extension data public and read-only.** Use `/cart/extensions` for mutations.
- **Return arrays from Store API callbacks.** Non-array return values are logged and dropped.
- **Namespace extension data.** Do not write top-level response fields or generic namespaces like `custom`.
- **Do not subclass internal Store API route classes for plugin endpoints.** Use `register_rest_route()` for your own routes; use Store API helpers only where WC exposes extension points.
- **Do not disable nonce checks outside local/dev testing.** `woocommerce_store_api_disable_nonce_check` is a development escape hatch, not production configuration.
- **Use Store API rate-limit hooks for public write-heavy Store API flows.** `woocommerce_store_api_rate_limit_options`, `woocommerce_store_api_rate_limit_id`, and `woocommerce_store_api_rate_limit_exceeded` affect Store API requests; unrelated custom REST routes need their own limits.

## Cross-references

- Run **`wc-rest-api-v4`** when the task is admin/integration REST, fulfillments, settings, private product/order data, or server-to-server API clients.
- Run **`wc-customer-and-sessions`** when code uses `WC()->session`, `WC()->customer`, or needs to understand frontend/REST session bootstrapping.
- Run **`wc-payment-gateway`** when Store API payment requirements intersect with a gateway's `$supports` and `process_payment()`.
- Run **`wc-hpos-compatibility`** when checkout/order code stores custom order meta.
- Run **`wp-rest-api`** when creating custom plugin endpoints outside Store API.

## What this skill does NOT cover

- Full React payment-method UI registration (`registerPaymentMethod`, express methods, saved-token components). This skill covers Store API server-side availability and data extension points.
- Admin REST `wc/v4` route details. Use `wc-rest-api-v4`.
- Store API internals/private route implementation. Internal classes are useful source references, not a public inheritance contract.
- GraphQL or the newer dual-code API experiments in WC 10.8.

## References

- Official Store API overview: <https://developer.woocommerce.com/docs/apis/store-api/>.
- Store API nonce tokens: <https://developer.woocommerce.com/docs/apis/store-api/nonce-tokens/>.
- Store API cart tokens: <https://developer.woocommerce.com/docs/apis/store-api/cart-tokens/>.
- Extending Store API data: <https://developer.woocommerce.com/docs/apis/store-api/extending-store-api/extend-store-api-add-data/>.
- Route registration: [wp-content/plugins/woocommerce/src/StoreApi/RoutesController.php](RoutesController.php).
- Cart route headers/session/nonce rules: [wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/AbstractCartRoute.php](AbstractCartRoute.php).
- Store API authentication/CORS/rate limit logic: [wp-content/plugins/woocommerce/src/StoreApi/Authentication.php](Authentication.php).
- Extension helpers: [wp-content/plugins/woocommerce/src/StoreApi/functions.php](functions.php) and [wp-content/plugins/woocommerce/src/StoreApi/Schemas/ExtendSchema.php](ExtendSchema.php).
- `/cart/extensions`: [wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/CartExtensions.php](CartExtensions.php) and [wp-content/plugins/woocommerce/src/StoreApi/Schemas/V1/CartExtensionsSchema.php](CartExtensionsSchema.php).
- Product `related` query handling: [wp-content/plugins/woocommerce/src/StoreApi/Routes/V1/Products.php](Products.php) and [wp-content/plugins/woocommerce/src/StoreApi/Utilities/ProductQuery.php](ProductQuery.php).
