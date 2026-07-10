---
name: wc-rest-api-v4
description: Audit WooCommerce's source-gated `wc/v4` REST API. In WooCommerce 10.9.4 the core v4 controllers exist but the release build sets `rest-api-v4` false, so core routes are not registered by default. Covers runtime discovery, safe v3 fallback, latent v4 routes, settings paths, hook prefixes, authentication, fulfillments, and internal caching. Use when code targets `/wc/v4` or assumes source files mean a live public API.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/woocommerce-rest-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/rest-api/Server.php
  - wp-content/plugins/woocommerce/includes/react-admin/feature-config.php
  - wp-content/plugins/woocommerce/includes/rest-api/Controllers/Version4/class-wc-rest-settings-v4-controller.php
  - wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/AbstractController.php
  - wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4
  - wp-content/plugins/woocommerce/src/Internal/Traits/RestApiCache.php
  - wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php
---

# WooCommerce REST API v4

WooCommerce contains an authenticated merchant/integration API implementation under `wc/v4`. It is not the shopper-facing Store API and, in the 10.9.4 release build, it is not a generally available core API.

## Release gate in 10.9.4

Core registers its v4 controllers only when both conditions pass:

```php
wc_rest_should_load_namespace( 'wc/v4' )
Automattic\WooCommerce\Admin\Features\Features::is_enabled( 'rest-api-v4' )
```

`includes/react-admin/feature-config.php` sets `rest-api-v4` to `false` in WooCommerce 10.9.4. On a normal release install, core customers/orders/products/settings/fulfillment v4 routes are therefore absent even though their controller source files ship.

Other extensions can independently register routes under `/wc/v4`; seeing that namespace in the REST index does not prove WooCommerce core v4 is enabled. Check each exact route.

Do not force the build feature on with `woocommerce_admin_get_feature_config` in a production extension. The controller namespace is `Internal`, the surface can change, and consumers need a stable v3 fallback.

## Version selection

- Use v4 only after exact runtime route discovery on the target store and only when the integration accepts its source-gated status.
- Keep using v3 for resources absent from v4, including product categories and nested product variations.
- `wc/v3` is not deprecated. Migrate endpoint by endpoint, not by global search/replace.
- Discover schemas and methods with authenticated `OPTIONS /wp-json/wc/v4/<route>` against the deployed store.

The complete latent WooCommerce-core 10.9.4 route catalog is in [reference.md](reference.md). It describes controller source, not routes guaranteed to be registered by the release build.

Runtime discovery must run after route registration:

```php
add_action( 'rest_api_init', static function ( WP_REST_Server $server ): void {
    $routes        = $server->get_routes();
    $has_v4_orders = isset( $routes['/wc/v4/orders'] );
    // Store/use the result for diagnostics; do not register a competing route.
}, 20 );
```

For external clients, inspect the REST index/`OPTIONS` response and fail over to a supported v3 route rather than probing by causing a write.

## Important route shapes

Order child resources are flat:

```text
/wc/v4/order-notes?order_id=123
/wc/v4/refunds?order_id=123
/wc/v4/fulfillments?order_id=123
```

They are not `/orders/123/notes`, `/orders/123/refunds`, or `/orders/123/fulfillments`.

Shipping-zone methods use an instance ID:

```text
POST   /wc/v4/shipping-zone-method
GET    /wc/v4/shipping-zone-method/17
PUT    /wc/v4/shipping-zone-method/17
DELETE /wc/v4/shipping-zone-method/17
```

Payment gateway settings have only an item route:

```text
GET|PUT /wc/v4/settings/payment-gateways/<gateway-id>
GET     /wc/v4/settings/payments/offline-methods
```

Do not invent `/settings/payment-gateways` collection or `/settings/offline-payment-methods`; neither is registered in 10.9.4.

V4 also exposes the legacy-compatible generic setting-option wrapper under `/settings/<group_id>`, `/settings/<group_id>/<id>`, and `/settings/<group_id>/batch`. It redirects the v3 settings option controller into the v4 namespace; do not confuse it with the newer dedicated settings controllers.

## Authentication and authorization

v4 uses the existing WordPress/Woo REST stack:

- Cookie authentication plus `X-WP-Nonce: <wp_create_nonce('wp_rest')>` for same-origin logged-in browser code.
- WooCommerce consumer key/secret with HTTPS Basic Auth for server integrations.
- WordPress Application Passwords where appropriate.
- WooCommerce OAuth 1.0a where legacy integration requirements demand it.

Authentication does not imply object ownership. A custom customer-facing route must derive the user server-side and verify each order/token/resource belongs to that user. Never expose consumer secrets in browser code.

## Call from WordPress

```php
$request = new WP_REST_Request( 'GET', '/wc/v4/orders' );
$request->set_param( 'status', 'processing' );
$request->set_param( 'per_page', 25 );

$response = rest_do_request( $request );

if ( is_wp_error( $response ) || $response->is_error() ) {
    // Handle the REST error; do not assume get_data() is a collection.
    return;
}

$orders = $response->get_data();
```

An internal REST dispatch still runs route permission callbacks as the current WP user. It is not a capability bypass.

## Response filters and the slash trap

The abstract controller builds hooks as:

```php
'woocommerce_rest_api_v4_' . str_replace( '-', '_', $this->rest_base ) . '_'
```

It replaces hyphens only. Slashes remain in settings hook names.

| Route base | Item response filter |
|---|---|
| `customers` | `woocommerce_rest_api_v4_customers_item_response` |
| `order-notes` | `woocommerce_rest_api_v4_order_notes_item_response` |
| `settings/payment-gateways` | `woocommerce_rest_api_v4_settings/payment_gateways_item_response` |
| `settings/payments/offline-methods` | `woocommerce_rest_api_v4_settings/payments/offline_methods_item_response` |

This means a settings filter name can contain `/`. Do not normalize it to underscores unless the controller source does so.

Example:

```php
add_filter(
    'woocommerce_rest_api_v4_customers_item_response',
    static function ( WP_REST_Response $response, $customer, WP_REST_Request $request ): WP_REST_Response {
        if ( ! $customer instanceof WC_Customer ) {
            return $response;
        }

        $data                  = $response->get_data();
        $data['loyalty_tier']  = sanitize_key( $customer->get_meta( '_myplugin_loyalty_tier' ) );
        $response->set_data( $data );
        return $response;
    },
    10,
    3
);
```

The generated filter families are `<prefix>collection_params`, `<prefix>item_schema`, and `<prefix>item_response`, but bespoke subroutes can use other hooks. Read the concrete controller before depending on a hook.

## Internal classes are not extension bases

All v4 controllers are under `Automattic\WooCommerce\Internal`. Do not extend `V4\AbstractController`, import its traits, or instantiate controllers in plugin code. Register plugin routes with `WP_REST_Controller`, or filter the response of an existing route.

## Fulfillments have two gates

The whole core v4 namespace first needs `rest-api-v4`; fulfillment behavior additionally needs the `fulfillments` feature, which is disabled by default in 10.9.4. Route classes existing on disk does not guarantee a store exposes usable fulfillment behavior.

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

if ( ! FeaturesUtil::feature_is_enabled( 'fulfillments' ) ) {
    return;
}
```

Do not silently force-enable a WooCommerce experimental feature from an extension.

## Product response capability boundary

V4 product responses can omit sensitive fields when the caller can read a published product but lacks product-management/private-read capabilities. Downloads, cost data, purchase notes, and raw metadata are not safe client contracts for under-privileged callers.

Treat field absence as an authorization-dependent schema outcome, not as empty product data.

## Order status behavior

`status=any` does not include `checkout-draft` in current v4 order queries. Request `status=checkout-draft` explicitly when auditing Store API draft orders.

The order item route also accepts action-style update parameters such as `payment_complete` and `reset_download_permissions`. Use these domain operations only with the required capability and idempotency controls; do not expose them through customer-owned proxy routes.

## REST cache: narrow, internal, and optional

`Automattic\WooCommerce\Internal\Traits\RestApiCache` is experimental and feature-gated by `rest_api_caching`. Backend caching also requires `woocommerce_rest_api_enable_backend_caching = yes`.

In the 10.9.4 v4 controllers, `with_cache()` is used for the `GET /products/suggested-products` callback, not as a blanket cache around all v4 resources. Do not promise cache hits for customers, orders, or arbitrary v4 routes.

The trait is internal; plugin routes should use stable WordPress cache APIs and explicit invalidation/versioning.

## Critical rules

- Never conflate `/wc/v4` with `/wc/store/v1`.
- Never treat shipped controller files or another plugin's `/wc/v4/*` route as proof that Woo core v4 is active.
- Never force-enable `rest-api-v4` from a production extension; use runtime discovery and v3 fallback.
- Never assume every v3 resource exists in v4.
- Never hardcode a hook prefix without checking `rest_base`, especially settings routes containing `/`.
- Never extend WooCommerce `Internal` REST classes.
- Never treat authenticated merchant REST responses as customer-safe payloads.
- Never assume fulfillments or REST backend caching are enabled.
- Never infer permissions from response shape; use explicit capabilities and ownership checks.

## Cross-references

- `wc-store-api` for shopper cart and checkout.
- `wc-hpos-compatibility` for order data access behind v4.
- `wc-shipping-providers` for the experimental fulfillment provider registry.

## References

- Namespace release gate: `includes/rest-api/Server.php` and `includes/react-admin/feature-config.php`.
- Latent route registrations: `src/Internal/RestApi/Routes/V4/*/Controller.php`.
- Hook prefix implementation: `src/Internal/RestApi/Routes/V4/AbstractController.php`.
- Cache feature and wrapper: `src/Internal/Traits/RestApiCache.php`.
