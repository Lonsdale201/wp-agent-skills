---
name: wc-rest-api-v4
description: Use the WooCommerce REST API v4 (namespace wc/v4, since WC 10.2)
  alongside or in place of v3 — verified route catalog (Customers, Orders,
  Refunds, Products, ShippingZones with DELETE, ShippingZoneMethod,
  Fulfillments, segmented Settings under /wc/v4/settings/<group>), the
  hook prefix pattern woocommerce_rest_api_v4_<route>_*, shared error
  codes, and the RestApiCache trait (WC 10.5+) for endpoint response
  caching. The v4 AbstractController lives under the Internal namespace
  and is NOT a public extension surface; plugin-defined REST routes use
  WP_REST_Controller directly. Use when calling WC REST endpoints, when
  picking v3 vs v4, or when reviewing /wc/v3/ URLs that now have v4
  equivalents. Triggers on wc/v4, /wc/v4/, woocommerce_rest_api_v4_*,
  RestApiCache, customer-owned Woo endpoints, REST API v4 in WooCommerce
  context.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.7"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://woocommerce.com/document/woocommerce-rest-api/
source-refs:
  - wp-content/plugins/woocommerce/includes/wc-rest-functions.php
  - wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/AbstractController.php
  - wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/
  - wp-content/plugins/woocommerce/src/Internal/Traits/RestApiCache.php
  - wp-content/plugins/woocommerce/src/StoreApi/RoutesController.php
  - wp-content/plugins/woocommerce-subscriptions/includes/api/class-wc-rest-subscriptions-controller.php
---

# WooCommerce REST API v4

A second-major-version of the WC REST API, introduced in WC 10.2 (2025) and expanded through 10.7. It coexists with v3 — neither replaces the other — and adds capabilities the v3 surface lacked: per-route response caching, ID-sortable customer list, DELETE on shipping zones / methods, payment gateway PUT with top-level fields, fulfillments CRUD, and per-group settings endpoints.

This skill is the **up-to-date reference for AI assistants whose training data predates v4**. Default behavior of LLMs is to write `/wc/v3/...` URLs and v3 controller patterns. Many of those endpoints exist in v4 with cleaner shapes, additional verbs, and per-endpoint cache headers — and a few v4 endpoints have NO v3 counterpart.

## Misconception this skill corrects

Two common AI errors:

1. **"I'll write `/wp-json/wc/v3/...` because that's the WC REST API."**
   v3 still works, but v4 may be the right answer for ID-list parameters on customers, DELETE on shipping zones, modern fulfillments, payment gateway settings. Check the route catalog below.

2. **"I'll extend `Automattic\WooCommerce\Internal\RestApi\Routes\V4\AbstractController` for my plugin's routes."**
   The class lives under `Internal\` — that's WC core's signal "no public extension contract here, the internal shape can change in any minor release." Plugin-defined routes use `WP_REST_Controller` directly (see sibling skill `wp-rest-api`). The v4 AbstractController patterns are educational; the class itself is not a stable extension point.

## When to use this skill

Trigger when ANY of the following is true:

- Calling WC REST endpoints from a custom plugin, external integration, or custom client.
- Reviewing hardcoded `/wc/v3/` URLs to check whether v4 has a better-shaped endpoint for the same data.
- Building a new feature that needs ID-sortable customers, fulfillments, granular settings, or per-route cache headers.
- Debugging "why is my v3 customers query slow" — v4 added caching infrastructure for these.
- The diff or file contains: `/wc/v4/`, `wc/v4`, `woocommerce_rest_api_v4_*`, `AbstractController` in WC context, `RestApiCache`, `with_cache(`.

## Route catalog (verified in WC 10.7 source)

All routes live under namespace `wc/v4`. Verified by directory listing of [wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/](V4/).

**v4 routes are FLAT, NOT nested under parent resources.** Order notes, refunds, and fulfillments take an `order_id` query parameter — they don't appear under `/orders/<id>/...`. Verified in each Controller's `register_rest_route` call:

| Resource | Path | Notes |
|---|---|---|
| Customers | `/wc/v4/customers`, `/wc/v4/customers/<id>` | ID-sortable; `customers_exclude` query param. Username and password optional regardless of registration settings. |
| Orders | `/wc/v4/orders`, `/wc/v4/orders/<id>` | HPOS-aware; cache-primed for batch reads. |
| Order Notes | `/wc/v4/order-notes?order_id=<id>`, `/wc/v4/order-notes/<note_id>` | Flat path; pass `order_id` as query param to filter by order. Stored XSS prevention for note content (10.7 patch). |
| Refunds | `/wc/v4/refunds?order_id=<id>`, `/wc/v4/refunds/<refund_id>` | Same flat-path pattern. Floating-point precision fix (10.7). |
| Products | `/wc/v4/products`, `/wc/v4/products/<id>` | |
| Shipping Zones | `/wc/v4/shipping-zones`, `/wc/v4/shipping-zones/<id>` | Note: dash-separated rest_base, NOT `/shipping/zones/`. **DELETE supported in v4.** Locations array optional. |
| Shipping Zone Method (single) | `/wc/v4/shipping-zone-method/<instance_id>` | Flat path with the instance ID — NOT nested under a zone. New endpoint type in v4. |
| Fulfillments | `/wc/v4/fulfillments?order_id=<id>`, `/wc/v4/fulfillments/<fulfillment_id>` | Flat path. New system in WC 10.7. Lifecycle order notes auto-generated. |
| Fulfillment Providers | `/wc/v4/fulfillments/providers` | Sub-route under fulfillments. List of registered `AbstractShippingProvider` subclasses. |
| Settings (general) | `/wc/v4/settings/general` | |
| Settings (account) | `/wc/v4/settings/account` | |
| Settings (tax) | `/wc/v4/settings/tax` | |
| Settings (email/emails) | `/wc/v4/settings/email`, `/wc/v4/settings/emails` | Block email editor backend. |
| Settings (payment gateways) | `/wc/v4/settings/payment-gateways` | PUT accepts top-level `enabled`, `title`, `description`, `order` (10.7) — symmetric with GET. |
| Settings (offline payment methods) | `/wc/v4/settings/offline-payment-methods` | BACS / cheque / COD config. |
| Settings (products) | `/wc/v4/settings/products` | |

The `Internal\RestApi\Routes\V4\` namespace maps each resource to its Controller. Verified `rest_base` values: `customers`, `orders`, `order-notes`, `refunds`, `products`, `shipping-zones`, `shipping-zone-method`, `fulfillments`. The actual URL is the namespace + the rest_base; nothing more (until you hit a sub-route like `/fulfillments/providers`).

## When to pick v4 over v3

| Need | Use |
|---|---|
| ID-list operations (`include[]=1&include[]=2`) on customers | v4 (better-shaped query params) |
| DELETE a shipping zone or zone method | v4 only |
| Fulfillments CRUD (tracking numbers, providers, lifecycle) | v4 only — feature didn't exist in v3 |
| Granular settings endpoints (per-group instead of all-in-one) | v4 |
| Payment gateway settings PUT with top-level fields | v4 (v3's `values` wrapper less ergonomic) |
| Single shipping zone method by instance ID | v4 only |
| Plain CRUD on products / orders / categories where v3 already works | v3 is fine; v4 doesn't add value here |
| External integration written before WC 10.2 | Stay on v3 unless you specifically need v4 features |

**v3 is not deprecated.** WC has shipped v3 since 2018 and there's no announced sunset. Adopt v4 endpoints for what they add; don't migrate working v3 code wholesale "just because".

## Authentication — same as v3

v4 inherits WP REST authentication. From the WC perspective:

- **Cookie + nonce** (`X-WP-Nonce` header from `wp_create_nonce('wp_rest')`) for browser / admin context.
- **Basic Auth** over HTTPS for server-to-server, with the WC-issued consumer key / secret pair as username / password.
- **Application Passwords** (WP 5.6+) — works the same.
- **OAuth 1.0a** — WC's classic external-integration scheme.

No new auth types in v4. The `permission_callback` enforcement is identical.

## Customer-owned account endpoints

Do not confuse Woo's admin/integration REST API with customer-facing account actions. WC REST resources such as orders/subscriptions are generally protected by capabilities and consumer keys; they are not automatically safe to expose to a logged-in customer for "my account" operations.

When implementing custom routes for account actions:

- Use `register_rest_route()` with a strict `permission_callback`.
- Authenticate as a WP user and derive the user ID server-side with `get_current_user_id()`.
- Never ship Woo consumer keys, application passwords, or Stripe secret keys to a public client.
- For every object ID in the request, verify ownership: order customer ID, subscription customer ID, payment token user ID, or membership user ID.
- Return only customer-safe fields; do not mirror admin REST responses wholesale.
- Prefer domain actions over raw CRUD: `cancel subscription`, `set default payment method`, `delete payment token`, `create setup intent`, `confirm payment method`.
- Keep writes behind nonces/bearer tokens, rate limits, idempotency keys for payment-related operations, and audit notes/logs.

Important surfaces:

| Need | Existing surface | Customer-facing status |
|---|---|---|
| Cart/checkout | Store API (`wc/store/v1`) | Designed for shopper checkout, session/cart oriented. |
| Saved payment methods | Woo account form/query handlers + `WC_Payment_Tokens` | No complete customer REST CRUD; wrap token APIs yourself. |
| Stripe card setup | Stripe Gateway AJAX + SetupIntent helpers | Browser/account flow exists; custom REST must verify SetupIntent/customer server-side. |
| Subscriptions CRUD | WCS `/wc/v3/subscriptions` | Admin/server API; customer routes should enforce ownership and allowed transitions. |
| Subscription switch | WCS switcher cart/checkout flow | No simple REST endpoint; wrap the switch flow, do not raw-update line items/meta. |
| Membership access | Memberships objects/hooks | Expose only current user's membership state unless admin. |

For Subscriptions, the REST controller can set `status`, `transition_status`, dates, line items, `payment_method`, and `payment_details`, but its permissions are Woo capability based. For customer actions, call WCS object methods after ownership checks: `$subscription->can_be_updated_to()`, `$subscription->update_status()`, `update_dates()`, and WCS change-payment/switch services.

## Hook prefix pattern (for filtering responses)

The v4 abstract controller's `get_hook_prefix()` ([AbstractController.php:181-190](AbstractController.php)) builds the prefix as:

```php
return 'woocommerce_rest_api_v4_' . str_replace( '-', '_', $this->rest_base ) . '_';
```

Note: it ONLY replaces `-` with `_`, NOT `/`. So most routes get a clean prefix:

| `rest_base` | Hook prefix | Example filter |
|---|---|---|
| `customers` | `woocommerce_rest_api_v4_customers_` | `..._item_response` |
| `orders` | `woocommerce_rest_api_v4_orders_` | `..._collection_params` |
| `order-notes` | `woocommerce_rest_api_v4_order_notes_` | `..._item_schema` |
| `shipping-zones` | `woocommerce_rest_api_v4_shipping_zones_` | `..._item_response` |
| `shipping-zone-method` | `woocommerce_rest_api_v4_shipping_zone_method_` | |
| `fulfillments` | `woocommerce_rest_api_v4_fulfillments_` | |

The three predictable filter points per controller:

```php
woocommerce_rest_api_v4_<base>_collection_params
woocommerce_rest_api_v4_<base>_item_schema
woocommerce_rest_api_v4_<base>_item_response
```

Example — modify the customers item response to include a custom field:

```php
add_filter( 'woocommerce_rest_api_v4_customers_item_response', static function ( $response, $item, $request ) {
    $data = $response->get_data();
    $data['my_custom_field'] = (string) get_user_meta( $item->get_id(), '_my_field', true );
    $response->set_data( $data );
    return $response;
}, 10, 3 );
```

**Caveat — sub-routes don't follow this pattern.** The `/wc/v4/fulfillments/providers` sub-route uses a custom filter `woocommerce_rest_prepare_fulfillments_providers` ([Fulfillments/Controller.php:463](Controller.php)) — it's not part of the abstract's auto-generated three. When in doubt, grep the controller for `apply_filters(` to find what hooks it actually exposes.

**Settings paths with `/` don't generate a prefix from the path.** `Settings/PaymentGateways/Controller.php` has `rest_base = 'payment-gateways'` (set in the controller class), not `'settings/payment-gateways'`. The `/settings/` segment in the URL comes from how the route is REGISTERED (`'/' . 'settings' . '/' . $this->rest_base`), not from `rest_base`. So the hook prefix is `woocommerce_rest_api_v4_payment_gateways_` — verify against the specific controller before relying on the prefix.

## Standard error codes

The v4 AbstractController defines shared error codes ([V4/AbstractController.php:34-40](AbstractController.php)):

| Code | When |
|---|---|
| `invalid_id` | `id` parameter doesn't match an existing resource |
| `resource_exists` | POST collides with an existing resource |
| `cannot_create` | POST failed at the data-store level |
| `cannot_update` | PUT/PATCH failed at the data-store level |
| `cannot_delete` | DELETE failed at the data-store level |
| `cannot_trash` | DELETE without `force=true` failed |
| `trash_not_supported` | DELETE without `force=true` on a non-trash-supporting resource |

Error responses use a stable shape via `get_route_error_response( $error_code, $error_message, $http_status, $additional_data )` — useful to handle on the client.

## RestApiCache trait — WC 10.5+ caching

`Automattic\WooCommerce\Internal\Traits\RestApiCache` ([src/Internal/Traits/RestApiCache.php:124](RestApiCache.php)) wraps endpoint callbacks with response caching:

- Cache key includes route, query params, user context (if `vary_by_user` is set), and a version string.
- Storage: `wp_cache_*` (object cache). On installs without an external object cache (Redis / Memcached), the trait falls back to per-request memory.
- Feature-gated on `feature_is_enabled('rest_api_caching')` AND the option `woocommerce_rest_api_enable_backend_caching = 'yes'`.
- TTL configurable per route via the `with_cache( $callback, [ 'cache_ttl' => N ] )` config array.
- Invalidation by entity-type tagging: changes to a tagged entity (e.g. `'order'`) bust the cached responses tied to it.

**This trait is for WC's own controllers.** Plugin-defined routes wouldn't use it (it's `Internal\Traits`); they'd use the WP-native cache primitives or roll their own. Knowing the feature exists is the value here — when you see `X-WC-Cache` headers in v4 responses, this is what's emitting them.

## Calling v4 from PHP / JS

**PHP — internal call (admin-context AJAX, REST plumbing):**

```php
$request  = new WP_REST_Request( 'GET', '/wc/v4/customers' );
$request->set_param( 'orderby', 'id' );
$request->set_param( 'order',   'desc' );
$request->set_param( 'per_page', 50 );
$response = rest_do_request( $request );

if ( ! $response->is_error() ) {
    $customers = $response->get_data();
}
```

**JS — `@wordpress/api-fetch` from inside wp-admin:**

```js
import apiFetch from '@wordpress/api-fetch';

const customers = await apiFetch( {
    path: '/wc/v4/customers?orderby=id&order=desc&per_page=50',
} );
// X-WP-Nonce attached automatically inside admin context.
```

**Server-to-server with Basic Auth:**

```bash
curl -u "$CK:$CS" \
    "https://store.example/wp-json/wc/v4/orders?status=processing"
```

The endpoint surface is REST-conventional — same query params (`per_page`, `orderby`, `order`, `include`, `exclude`, `status`), same response envelope, same `X-WP-Total` / `X-WP-TotalPages` pagination headers.

## Critical rules

- **`wc/v4` is the namespace, NOT `wc-blocks/v4` or `wc-store/v4`.** Those are different APIs (Store API and Blocks API; not covered here).
- **v4 coexists with v3.** Both work; pick per-endpoint based on what each provides.
- **Admin REST is not a My Account API.** Do not expose WC consumer keys or capability-protected order/subscription endpoints directly to customers; write customer-owned routes with explicit ownership checks.
- **Don't extend `Automattic\WooCommerce\Internal\RestApi\Routes\V4\AbstractController`** for your plugin's REST routes. The `Internal\` namespace prefix is WC's "we may break this in any release" signal. Use `WP_REST_Controller` directly (see `wp-rest-api` skill).
- **Filter responses via `woocommerce_rest_api_v4_<route>_item_response`** when you need to add fields without rewriting the route. Same pattern works in v3 with the v3-prefixed hook (`woocommerce_rest_prepare_*`).
- **DELETE on shipping zones is v4-only.** v3 lacks it; if you're cleaning up zones programmatically, use v4.
- **Fulfillments only exist on v4.** v3 has no equivalent. See sibling skill `wc-shipping-providers` for the related provider abstraction.
- **The `RestApiCache` trait is internal**. Don't rely on its existence in plugin code; it's WC's mechanism for its own routes.
- **Authentication is unchanged from v3.** Cookie + X-WP-Nonce, Basic Auth with WC API keys, Application Passwords, OAuth 1.0a — all the same.

## Common mistakes

```php
// WRONG — extending an Internal class for plugin routes
class MyController extends Automattic\WooCommerce\Internal\RestApi\Routes\V4\AbstractController { }
// The Internal\ namespace can be reshaped in any WC minor release.

// RIGHT — extend WP_REST_Controller directly
class MyController extends WP_REST_Controller { }

// WRONG — assuming v3 path is canonical
const URL = '/wp-json/wc/v3/customers'; // missing v4's better customer ordering

// RIGHT — pick the right version per use case
const URL = '/wp-json/wc/v4/customers?orderby=id&order=desc';

// WRONG — trying to DELETE a shipping zone via v3
fetch('/wp-json/wc/v3/shipping/zones/5', { method: 'DELETE' });
// 404 — v3 doesn't expose DELETE on this route

// RIGHT — v4 supports it (note dash-separated rest_base, NOT /shipping/zones/)
fetch('/wp-json/wc/v4/shipping-zones/5', { method: 'DELETE', headers: { 'X-WP-Nonce': nonce } });

// WRONG — hardcoding the v4 hook with the wrong prefix
add_filter( 'woocommerce_rest_v4_customers_item_response', $cb ); // wrong prefix

// RIGHT
add_filter( 'woocommerce_rest_api_v4_customers_item_response', $cb, 10, 3 );

// WRONG — assuming RestApiCache headers mean external cache is configured
header( 'X-WC-Cache: HIT' ); // your endpoint can't fake this for clients

// (RestApiCache is WC-internal — your plugin doesn't emit X-WC-Cache headers
//  unless you implement caching independently with the WP cache primitives.)
```

## Cross-references

- Run **`wp-rest-api`** for the broader WP REST API patterns — `register_rest_route`, `permission_callback`, args schema. Plugin-defined REST routes belong here, NOT under WC's v4 namespace.
- Run **`wc-shipping-providers`** when working with the v4 fulfillments / providers endpoints — the AbstractShippingProvider class is the data shape behind those routes.
- Run **`wc-hpos-compatibility`** when v4 order endpoints are involved — order data goes through HPOS by default in WC 10.x.

## What this skill does NOT cover

- The Store API (`/wp-json/wc/store/v1/...`) — different surface entirely, customer-facing checkout / cart APIs. Separate scope.
- The Blocks API (`/wp-json/wc-blocks/`) — also separate.
- Migration tooling for moving v3 integrations to v4 — there isn't one; rewrite per-endpoint.
- Schema-by-schema diff between v3 and v4 fields. Use `OPTIONS /wc/v4/<resource>` against a live install to fetch the JSON Schema; trust the live response over any documentation.
- WC POS endpoints that may use bespoke namespaces. Out of scope.
- WP REST authentication mechanics (cookie+nonce flow, Basic over HTTPS, OAuth) — handled by `wp-rest-api` and the official WC REST docs.

## References

- v4 abstract controller: [wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/AbstractController.php](AbstractController.php) — `@since 10.2.0`. Note the `Internal\` namespace prefix.
- Concrete controllers: [wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/](V4/) — directory listing is the authoritative route catalog.
- `RestApiCache` trait: [wp-content/plugins/woocommerce/src/Internal/Traits/RestApiCache.php](RestApiCache.php) — `@since 10.5.0`.
- WC REST API official docs: <https://woocommerce.com/document/woocommerce-rest-api/> — covers v3; v4 documentation has not yet been consolidated as of WC 10.7. Trust source-verified routes over outdated public docs.
