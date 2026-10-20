---
name: br-woo-routes
description: Expose WooCommerce orders, products, customers and coupons with Better Route WooRouteRegistrar. Use for strict CRUD, CustomerRolePolicy, coupon state/status and metadata views, native permissions, HPOS, pagination, idempotency and Woo OpenAPI components. Read-only Analytics reports have a separate br-woo-analytics skill.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-10-20"
---

# better-route: WooCommerce routes

Register Woo routes during `rest_api_init` and retain the returned Router when contracts are needed.

```php
use BetterRoute\BetterRoute;

add_action('rest_api_init', static function (): void {
    $woo = BetterRoute::wooRouteRegistrar()->register('myapp/v1', [
        'basePath' => 'woo',
        'requireHpos' => true,
        'deleteMode' => 'trash',
        'actions' => [
            'customers' => ['list', 'get'],
            'coupons' => [],
        ],
        'permissions' => [
            'orders.list' => 'manage_woocommerce',
            'orders.create' => 'manage_woocommerce',
        ],
    ]);
});
```

Routes cover orders, products, customers, and coupons under `/wp-json/myapp/v1/woo` by default.

## Actions and permissions

Each resource supports `list`, `get`, `create`, `update`, and `delete`; update registers both PUT and PATCH.

- Omit `actions.<resource>` for full CRUD.
- Pass `[]` to disable that resource.
- Invalid action names or a non-array value throw.

Permission keys use `<resource>.<action>`. A value may be bool, capability string, any-of capability list, or callable receiving the request and optionally the registrar. Unrecognized/empty rules deny. Defaults are `manage_woocommerce`.

Customer writes also enforce native user capabilities inside the service:

- create: `create_users`;
- update: `edit_user` for the target;
- delete: `delete_user` for the target.

Customer visibility defaults to the `customer` role and uses one `CustomerRolePolicy`
for lists, detail and mutations. Configure additional customer-like roles explicitly:

```php
'customerRoles' => new \BetterRoute\Integration\Woo\CustomerRolePolicy(
    allowedRoles: ['customer', 'wholesale_customer'],
    excludedRoles: ['former_customer'],
    allowPrivilegedRoles: false
),
```

Privileged roles, direct administrative capabilities and multisite superadmins are
excluded by default, including multi-role accounts. Request role filters can only
narrow the configured allowlist. `allowPrivilegedRoles: true` is a trusted server
opt-in; it does not grant native user-write capabilities or make a user directory.

## Lists

```http
GET /wp-json/myapp/v1/woo/orders?status=processing&sort=-date_created&page=1&per_page=50&fields=id,total,status
```

Lists return pagination in the JSON envelope:

```json
{"data": [], "meta": {"page": 1, "perPage": 50, "total": 0}}
```

Do not expect `X-WP-Total` or `X-WP-TotalPages`; Better Route Woo pagination is in `meta`.

`per_page > maxPerPage` returns `400 validation_failed`; it is not clamped. `sort=-field` means DESC. Services add an ID tie-breaker so equal primary sort values paginate deterministically.

Strict parsers reject unknown parameters but accept WordPress globals `_locale`, `_fields`, `_embed`, `_envelope`, and `_jsonp`, including `wp.apiFetch`'s `_locale=user`.

Resource filters/sorts differ:

- orders: status, customer_id, search; stable order/date/total options supported by parser;
- products: status, type, sku, search, stock_status; derived price sorting is not supported;
- customers: role, email, search; role must be inside the configured policy;
- coupons: code, search, state and native status; numeric usage/expiry sorting.

Use each parser's allowlist rather than forwarding arbitrary Woo query vars.

## Strict write payloads in 1.1

All services reject unknown top-level fields and enforce field types before setters/save.

Orders:

- validate the complete payload before persistence;
- reject unknown billing/shipping/line-item keys;
- require `product_id` for line items and validate product/variation existence and relationship;
- require positive finite line quantities supported by Woo's stock normalizer, and non-negative finite totals;
- refuse line-item replacement after stock reduction with `409 woo_line_items_locked`;
- run create/update inside `wc_transaction_query('start'/'commit'/'rollback')`.

Products:

- treat `price` as read-only;
- write `regular_price` and `sale_price` instead;
- validate all fields before applying setters/save.

Customers:

- require `email` on create;
- reject `username` on update because WordPress usernames are immutable through this API;
- reject unknown address keys and non-string address values;
- omit expensive `orders_count` and `total_spent` from list defaults to avoid N+1 work; request them explicitly when needed.

Coupons:

- require `code` on create;
- strictly validate monetary, boolean, list, date, and metadata fields;
- enforce normalized code uniqueness on create and update under a MySQL named lock;
- exclude the current coupon ID when checking an update; conflicts return `409 coupon_exists`.

Money response fields are decimal strings, not JSON floats.

## 1.1.1 order lifecycle and quantities

- Initialize payment gateways before writes; apply items/addresses and calculate taxes/totals before staging the requested status. Status hooks see final totals.
- Treat billing/shipping-only updates as financially significant: they recalculate totals even on paid orders.
- Save before payment completion. On update, `set_paid: true` calls `payment_complete()` only when the order still needs payment. Repeated paid updates do not repeat the event. An already-paid status with `set_paid` is not a guarantee of that event or evidence of external capture.
- Do not assume database rollback undoes emails, webhooks or external hook effects.
- Accept finite numeric quantities (including numeric strings). Order lines must be positive; product stock accepts negative values and null. Reject booleans, non-numeric/non-finite values, and any quantity that `wc_stock_amount()` would change, before persistence.
- Keep fractional Woo stock configuration active for later reads as well as writes. Woo normalizes quantities on load; Better Route does not recover old fractions by bypassing its data store.
- Use OpenAPI `number` for line quantities, `exclusiveMinimum: 0` on input, and `number` or `null` for stock.

The registrar is administrative CRUD, not a Store API cart/checkout adapter. It adds
no storefront or refund endpoints. The current measured runtime matrix is WordPress
6.9.4 / WooCommerce 10.9.4 on PHP 8.3/8.5, each with HPOS and legacy storage. This does
not establish every WP/Woo combination; `requireHpos` remains enabled by default.

## Coupon management views

Coupon `state` is read-only: `active`, `scheduled`, `expired`, `exhausted` or `draft`.
It is a management summary, not a checkout eligibility decision. State filters select
their matching native post status; contradictory `state`/`status` combinations fail.
Published state precedence is expired, then exhausted, then active. Unfiltered lists
remain published coupons, including expired/exhausted ones.

Use `status=publish|draft|future` and numeric sort fields `date_expires` or
`usage_count`, with `-` for descending. The `expiring` filter uses `expiring_days`
(default 30, maximum 3650); it is not a separate DTO state. Expiry uses shop-timezone
rules. Request metadata explicitly when the application needs public plugin fields.

## Metadata

Prefer the services, which enforce entity-specific metadata guards. In an already
authorized custom integration, use the corresponding normalizer:

```php
use BetterRoute\Integration\Woo\MetaDataHelper;

$couponMeta = MetaDataHelper::normalizeCouponIncoming($payload['meta_data'] ?? null);
MetaDataHelper::applyToTarget($coupon, $couponMeta);

$customerMeta = MetaDataHelper::normalizeCustomerIncoming($payload['meta_data'] ?? null);
MetaDataHelper::applyToTarget($customer, $customerMeta);
$serialized = MetaDataHelper::serializeCustomer($customer->get_meta_data());
```

Incoming metadata may be null, a key/value map or a list of `{key,value}` entries.
Underscore-prefixed keys are rejected on write and omitted on serialization by
default. The generic `normalizeIncoming()`/`serialize()` helper flags are not
substitutes for the customer/coupon guards. Normalization does not authorize writes;
retain native capability and visibility checks.

Customer list defaults omit `meta_data`; select the field explicitly on lists.
Customer detail and create/update responses can include filtered public metadata by
default. Coupon default read DTOs omit `meta_data` for both list and detail.
Customer services additionally reject known WordPress role/capability/session keys,
including keys without an underscore. Coupon services reject internal data keys such
as `usage_count` so metadata cannot invoke native setters. Generic helper flags do
not remove those service-level boundaries. Review third-party authorization metadata
and use an application allowlist rather than assuming every public key is harmless.

## Atomic idempotency

```php
'idempotency' => [
    'enabled' => true,
    'requireKey' => true,
    'ttlSeconds' => 86400,
    'resources' => [
        'orders' => true,
        'products' => true,
        'customers' => true,
        'coupons' => true,
    ],
],
```

Idempotency defaults to disabled and `requireKey` defaults to false; enable both explicitly for protected retry-safe writes. 1.1 uses `AtomicIdempotencyMiddleware` and requires a custom store to implement `AtomicIdempotencyStoreInterface`. Under WordPress, the default is a lease-aware wpdb store whose schema is installed/migrated once per version option; failure is surfaced rather than silently falling back.

The current 1.1 registrar attaches idempotency to create and update routes. DELETE routes are not wrapped by the registrar's idempotency configuration; add a custom raw route/middleware if idempotent delete replay is a requirement.

Before updating existing idempotent writers to 1.1.1, follow `br-install-and-migrate`: default namespace/URL keys and fingerprints change without translating legacy records.

## HPOS

`requireHpos` defaults to true and gates order routes only. When HPOS is unavailable, order routes return `503 hpos_required`; products/customers/coupons are not HPOS data stores.

The host plugin must also declare compatibility from its main file:

```php
BetterRoute\Integration\Woo\HposGuard::declareCompatibility(__FILE__);
```

The runtime guard does not replace Woo's feature compatibility declaration.

## OpenAPI

Use the returned Router's contracts and `BetterRoute::wooOpenApiComponents()`. In 1.1 input schemas match strict runtime behavior: customer create requires email, coupon create requires code, product input excludes derived price, order line input requires product ID, and nested addresses disallow additional properties.

## Review checklist

- Set `deleteMode` explicitly; default `force` is destructive.
- Keep HPOS required for production order APIs and declare host compatibility.
- Verify action omission versus explicit `[]`.
- Test customer role plus native capabilities.
- Assert oversized `per_page` is 400 and read totals from JSON `meta`.
- Test unknown nested keys and exact scalar types for every write entity.
- Concurrency-test duplicate idempotent create/update and duplicate coupon codes.
- Request expensive customer aggregate fields only when necessary.

## Related skills

- Use `br-atomic-idempotency` for reservation semantics.
- Use `br-openapi` for document generation.
- Use WooCommerce HPOS skills for migration/operational setup.

## References

- Verified source paths:
  - `src/Integration/Woo/WooRouteRegistrar.php`
  - `src/Integration/Woo/WooOrderService.php`
  - `src/Integration/Woo/WooProductService.php`
  - `src/Integration/Woo/WooCustomerService.php`
  - `src/Integration/Woo/WooCouponService.php`
  - `src/Integration/Woo/WooOpenApiComponents.php`
  - `src/Integration/Woo/CustomerRolePolicy.php`
  - `src/Integration/Woo/CouponQueryFilters.php`
