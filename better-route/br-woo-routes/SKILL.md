---
name: br-woo-routes
description: Expose WooCommerce 10.x orders, products, customers, and coupons with better-route 1.1 WooRouteRegistrar. Use for BetterRoute::wooRouteRegistrar, HPOS guards, actions, permissions, strict list/body validation, pagination meta, stable sorting, protected metadata, atomic idempotency, transactional order writes, product price rules, customer role/capability rules, coupon uniqueness, or Woo OpenAPI components.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
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

Customer list/get expose users with the `customer` role only; a general WordPress user directory is intentionally not provided.

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
- customers: role, email, search;
- coupons: code, search.

Use each parser's allowlist rather than forwarding arbitrary Woo query vars.

## Strict write payloads in 1.1

All services reject unknown top-level fields and enforce field types before setters/save.

Orders:

- validate the complete payload before persistence;
- reject unknown billing/shipping/line-item keys;
- require `product_id` for line items and validate product/variation existence and relationship;
- require non-negative finite quantities/totals where applicable;
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

## Metadata

Use the actual helper APIs:

```php
$meta = MetaDataHelper::normalizeIncoming($payload['meta_data'] ?? null);
MetaDataHelper::applyToTarget($object, $meta);
$serialized = MetaDataHelper::serialize($object->get_meta_data());
```

Incoming metadata may be a key/value map or a list of `{key,value}` entries. Underscore-prefixed protected keys are rejected on write and omitted on serialization by default. Opt in with `allowProtected/includeProtected` only on tightly protected internal code paths.

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

1.1 uses `AtomicIdempotencyMiddleware` and requires a custom store to implement `AtomicIdempotencyStoreInterface`. Under WordPress, the default is a lease-aware wpdb store whose schema is installed/migrated once per version option; failure is surfaced rather than silently falling back.

The current 1.1 registrar attaches idempotency to create and update routes. DELETE routes are not wrapped by the registrar's idempotency configuration; add a custom raw route/middleware if idempotent delete replay is a requirement.

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
