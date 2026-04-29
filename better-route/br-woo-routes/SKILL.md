---
name: br-woo-routes
description: Expose WooCommerce data (orders, products, customers,
  coupons) via REST using BetterRoute::wooRouteRegistrar()->register(
  $namespace, $options). Critical v0.3.0 behavior — customer endpoints
  return ONLY users with the customer role; create / update / delete
  additionally require WP capabilities create_users / edit_user /
  delete_user. Meta keys starting with _ (underscore) are NOT writable
  or returned by default — pass $allowProtected = true on
  MetaDataHelper calls only when intentional. Order list query
  patterns — ?status=processing&sort=-date_created&page=1&per_page=50;
  fields= is comma-separated; sort prefix - = DESC; per_page capped at
  maxPerPage (default 100); pagination via X-WP-Total / X-WP-TotalPages
  headers. WooRouteRegistrar options — basePath, requireHpos (default
  true), defaultPerPage, maxPerPage, deleteMode, actions, permissions,
  idempotency. Use when exposing WC data over REST. Triggers on
  BetterRoute::wooRouteRegistrar, MetaDataHelper, /woo/ in better-route.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: WooCommerce route registration

For developers exposing WooCommerce data — orders, products, customers, coupons — over REST using `BetterRoute::wooRouteRegistrar()`. The registrar generates a CRUD route set per resource type, wires HPOS-aware queries, and applies the v0.3.0 capability defaults that lock down customer endpoints.

## Misconception this skill corrects

> "I'll register Woo routes with `wooRouteRegistrar()` and customers with `manage_options` will see all WP users."

Wrong. Verified via the WooCustomerService — customer list / get / create / update / delete are restricted to users with the `customer` role only, AND the write actions require WP capabilities `create_users` / `edit_user` / `delete_user` ON TOP of any registrar-level permission. So even an admin without the right capability gets 403 on customer writes.

The reasoning: customer endpoints expose PII (email, addresses, order history); locking them to the explicit `customer` role prevents accidental "list all WP users" leaks that would happen with an open user-list endpoint. The capability layer prevents support-tier admins from mass-modifying customer accounts.

Other AI-prone misconceptions:

- "Meta keys are read/write by default like normal WP fields." Wrong — keys starting with `_` (underscore) are NOT writable and NOT returned. `MetaDataHelper` strips them. To read or write them, pass `$allowProtected = true` to the helper. Verified by error responses at [MetaDataHelper.php:137-139](MetaDataHelper.php) (`'protected meta keys are not writable'`).
- "I'll use the registrar without `requireHpos: true` for backwards compatibility." Wrong direction — `requireHpos` defaults to `true`, which forces HPOS to be active and emits a clear `503 hpos_required` error if not. Setting it to `false` makes routes run against legacy postmeta storage on installs that haven't migrated, which produces inconsistent results (some queries hit HPOS, others hit postmeta).
- "DELETE force-deletes orders by default — I need to set `deleteMode: 'trash'`." The default `deleteMode` is in fact `'force'` (permanent delete) per the agents.md doc — but this is consequential for live sites. Always set `'trash'` explicitly for customer-facing APIs.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `BetterRoute::wooRouteRegistrar()->register(...)`.
- The user asks "how do I expose WooCommerce orders / products / customers over REST".
- A diff queries WooCommerce data directly via `wc_get_orders()` / `wc_get_products()` and the right move is to delegate to better-route's registrar.
- Investigating "my customer endpoint returns empty even though there are users".
- Triaging "my POST /products with `_my_meta_key` doesn't store the meta value".

## Workflow

### 1. Minimal registration

```php
add_action('rest_api_init', function () {
    \BetterRoute\BetterRoute::wooRouteRegistrar()
        ->register('myapp/v1', [
            'basePath'    => '/shop',         // default 'woo'
            'requireHpos' => true,             // default true
            'deleteMode'  => 'trash',          // 'force' (default) or 'trash'
        ]);
});
```

This generates routes under `/wp-json/myapp/v1/shop/`:

- `/orders` (list/get/create/update/delete)
- `/products`
- `/customers`
- `/coupons`

Each follows REST conventions (`GET /orders`, `GET /orders/{id}`, `POST /orders`, etc.). For default `basePath: 'woo'`, routes mount at `/wp-json/myapp/v1/woo/orders`.

### 2. Restrict actions per resource

```php
->register('myapp/v1', [
    'actions' => [
        'orders'    => ['list', 'get'],                               // read-only orders
        'products'  => ['list', 'get', 'create', 'update'],           // no delete
        'customers' => ['list', 'get'],                                // read-only customers
        'coupons'   => ['list', 'get', 'create', 'update', 'delete'], // full CRUD
    ],
]);
```

Resources without an `actions` key get all five (list, get, create, update, delete). Pass an empty array `[]` to disable the resource entirely.

### 3. Resource-level permissions

```php
'permissions' => [
    'orders.create' => 'manage_woocommerce',
    'orders.delete' => 'manage_woocommerce',
    'products.create' => 'edit_products',
    'products.update' => 'edit_products',
],
```

Format: `'{resource}.{action}'`. Values: cap string, cap-list (any-of), or callable. Defaults vary by resource — orders default to `manage_woocommerce` for writes; customers have the additional capability gate (`create_users` / `edit_user` / `delete_user`) ON TOP of whatever you set here.

### 4. Pagination + sorting + filtering

```http
GET /wp-json/myapp/v1/woo/orders?status=processing&sort=-date_created&page=1&per_page=50
```

| Query param | Behavior |
|---|---|
| `status=processing` | Filter (per resource) |
| `sort=-date_created` | DESC sort; no prefix = ASC |
| `page=1` | 1-indexed page |
| `per_page=50` | Page size; capped at `maxPerPage` (default 100) |
| `fields=id,name,price` | Comma-separated field list |

Response includes pagination headers:

```
X-WP-Total: 1234
X-WP-TotalPages: 25
```

Unknown query parameters return `400 unknown_parameter` — keeps the API surface tight.

### 5. Resource-specific list patterns

```http
# Orders
GET /woo/orders?status=processing&sort=-date_created&fields=id,total,status

# Products
GET /woo/products?type=simple&stock_status=instock&fields=id,name,price

# Customers (only customer-role users returned)
GET /woo/customers?role=customer&search=john&sort=email

# Coupons
GET /woo/coupons?code=SUMMER25&fields=id,code,amount,discount_type
```

Each resource has its own filter/sort allowlist — declared in the corresponding `*ListQueryParser` ([src/Integration/Woo/](Woo/)). Unknown params return 400.

### 6. Metadata read/write

Standard meta payload for create/update on any resource:

```json
{
  "meta_data": [
    {"key": "custom_field", "value": "custom_value"},
    {"key": "another_field", "value": 42}
  ]
}
```

Rules verified at [src/Integration/Woo/MetaDataHelper.php:21-49](MetaDataHelper.php):

- `key` must be a non-empty string.
- `value` can be any JSON-serializable type.
- Keys starting with `_` are stripped on write and excluded on read **unless `$allowProtected = true`**.
- On update, `meta_data` entries call `update_meta_data()` — existing keys are overwritten, new keys added.
- Response meta entries include an `id` field (the meta entry's auto-generated ID).

To bypass the protected-meta filter (e.g. for an internal admin tool that needs to read `_billing_first_name`):

```php
// In your handler:
\BetterRoute\Integration\Woo\MetaDataHelper::extract($order, $allowProtected: true);
\BetterRoute\Integration\Woo\MetaDataHelper::apply($order, $payload, $allowProtected: true);
```

### 7. Customer endpoints — capability + role gates

Customer endpoints have two additional gates beyond standard registrar permissions:

1. **Role filter:** Only users with the `customer` role appear in `GET /customers` / `GET /customers/{id}`. Even if a user has admin + customer role, they ONLY appear when the role filter passes.
2. **Cap requirements for writes:**
   - `POST /customers` → `current_user_can('create_users')`
   - `PUT/PATCH /customers/{id}` → `current_user_can('edit_user', $userId)`
   - `DELETE /customers/{id}` → `current_user_can('delete_user', $userId)`

These caps run BEFORE your registrar-level `permissions` callback. Both must pass.

### 8. Idempotency on Woo writes

```php
->register('myapp/v1', [
    'idempotency' => [
        'enabled'    => true,
        'requireKey' => true,
        'ttlSeconds' => 600,
    ],
]);
```

Enables `IdempotencyMiddleware` on every write route. Clients send `Idempotency-Key: <uuid>` header; duplicates within 10 minutes return the cached response. See **`br-idempotency`** for the store choice (production needs `WpdbIdempotencyStore`).

### 9. HPOS requirement

```php
'requireHpos' => true,   // default
```

Verified at [WooRouteRegistrar.php:63](WooRouteRegistrar.php). When true, the registrar checks that HPOS is active (via `OrderUtil::custom_orders_table_usage_is_enabled()`); if not, every order route returns `503 hpos_required`. Always leave true on production sites — it surfaces the migration debt.

For dev / staging where you're testing both stores: set `false` and live with the inconsistency, OR migrate to HPOS first.

## Critical rules

- **Customer endpoints filter to `customer` role only.** Even admins don't appear in customer lists.
- **Customer writes need WP caps** — `create_users` for POST, `edit_user` for PUT/PATCH, `delete_user` for DELETE — ON TOP of registrar permissions.
- **Meta keys starting with `_` are stripped** on write AND read by default. Use `$allowProtected = true` only when intentional.
- **`requireHpos: true` (default)** — emits `503 hpos_required` if HPOS not active. Don't disable on production.
- **`deleteMode: 'force'` is the default** — destructive. Use `'trash'` for customer-facing APIs unless permanent delete is intentional.
- **`per_page` capped at `maxPerPage`** (default 100). Requests for `per_page=999` are clamped silently.
- **Unknown query parameters return 400** — strict validation.
- **`fields=` is comma-separated.** No JSON-array syntax for the filter list.
- **Sort prefix `-` = DESC; no prefix = ASC.** Multiple sorts not supported in v0.4.0.
- **Pagination headers:** `X-WP-Total`, `X-WP-TotalPages`.
- **Resource-level permissions format:** `'{resource}.{action}'` (e.g. `'orders.create'`).
- **Idempotency-Key header rejects duplicates.** Combine with `requireKey: true` for high-stakes writes.

## Common mistakes

```php
// WRONG — exposing customer endpoints with default permissions and forgetting the customer-role filter
->register('myapp/v1', [
    'actions' => ['customers' => ['list']],
]);
// Devs assume "list all users". Actually only customer-role users appear.
// Test with non-customer admin → expect them to be invisible.

// WRONG — requireHpos: false on production
->register('myapp/v1', ['requireHpos' => false]);
// Some queries hit HPOS, others hit postmeta. Inconsistent results.

// RIGHT — leave true; force-migrate to HPOS first if needed.

// WRONG — deleteMode default ('force') in customer-facing API
->register('myapp/v1');   // deleteMode defaults to 'force'
// User deletes an order → permanent. No recovery.

// RIGHT
->register('myapp/v1', ['deleteMode' => 'trash'])

// WRONG — protected meta read attempt without allowProtected
GET /woo/orders/123
// Response meta_data is missing _billing_first_name etc. Caller writes their own helper to query postmeta.

// RIGHT — for an internal admin tool that needs underscore-prefixed meta:
// Write a custom route that calls MetaDataHelper::extract($order, allowProtected: true)
// (don't expose this endpoint publicly — it bypasses the default protection)

// WRONG — assuming idempotency is on by default
->register('myapp/v1', ['idempotency' => ['enabled' => true]]);
// Yes, this enables it. Default is OFF.

// RIGHT — explicit when needed for write-heavy flows
'idempotency' => [
    'enabled' => true,
    'requireKey' => true,
    'ttlSeconds' => 600,
]

// WRONG — providing per_page beyond maxPerPage
GET /woo/orders?per_page=10000
// Silently clamped to 100. No error; consumer thinks they got "all" when they got 100.

// RIGHT — paginate with X-WP-TotalPages

// WRONG — fields with JSON array syntax
GET /woo/orders?fields=["id","total","status"]
// Returns 400 because the parser expects comma-separated.

// RIGHT
GET /woo/orders?fields=id,total,status

// WRONG — multi-sort
GET /woo/orders?sort=-date_created,total
// Behavior depends on parser; usually only the first sort is honored.

// RIGHT — single sort

// WRONG — hand-rolling order pagination via wc_get_orders inside a custom handler
$orders = wc_get_orders(['paged' => $page, 'limit' => $perPage]);
return rest_response($orders);
// Bypasses the registrar; lose HPOS-awareness, error normalization, capability gates.

// RIGHT — let the registrar handle it
->register('myapp/v1', ['actions' => ['orders' => ['list', 'get']]]);
```

## Cross-references

- Run **`br-routes`** for raw routes alongside Woo routes (e.g. custom `/store-info` endpoint that's not WC-data).
- Run **`br-idempotency`** for the idempotency store config (`WpdbIdempotencyStore::installSchema()` on activation).
- Run **`br-resource-policy`** for the cap-string/array/callable patterns used in `permissions`.
- Run **`br-error-contract`** for the standard error envelope — `503 hpos_required`, `409 customer_exists`, `503 woo_unavailable` shapes.
- Run **`wc-hpos-compatibility`** (in the woocommerce/ folder) for HPOS migration mechanics.

## What this skill does NOT cover

- Migrating from WooCommerce's own `wc/v3` REST API to better-route's wooRouteRegistrar. Different namespaces; both can coexist.
- Block-editor / Gutenberg integration with the registered routes. Routes expose REST; consumer apps decide UI.
- WC subscriptions / memberships — the registrar covers core WC entities only. For subscriptions, use the `wcs-subscription-hooks` skill plus custom routes.
- Custom WC stores (custom CPTs registered as WC products via `Custom_Product_Type` plugin). Out of scope.
- WC payment gateway endpoints. Use `wc-payment-gateway` skill (custom hand-rolled gateway) or expose payment gateway data via custom raw routes.
- Localization of error messages.

## References

- WooRouteRegistrar: [libraries/better-route/src/Integration/Woo/WooRouteRegistrar.php:30-50](WooRouteRegistrar.php) — `register(string $namespace, array $options): void`. Options at lines 33-46.
- HPOS check: [WooRouteRegistrar.php:63](WooRouteRegistrar.php) — `requireHpos` default true.
- Pagination defaults: [WooRouteRegistrar.php:64-65](WooRouteRegistrar.php) — `defaultPerPage: 20`, `maxPerPage: 100`.
- MetaDataHelper: [libraries/better-route/src/Integration/Woo/MetaDataHelper.php](MetaDataHelper.php) — `extract`, `apply` with `$allowProtected` flag (default false). Underscore-key rejection at line 137.
- Resource services: [libraries/better-route/src/Integration/Woo/](Woo/) — `WooOrderService`, `WooProductService`, `WooCustomerService` (with role filter and cap gates), `WooCouponService`.
- List query parsers: [libraries/better-route/src/Integration/Woo/](Woo/) — `OrderListQueryParser`, `ProductListQueryParser`, `CustomerListQueryParser`, `CouponListQueryParser`.
- HposGuard: [libraries/better-route/src/Integration/Woo/HposGuard.php](HposGuard.php) — emits `503 hpos_required` when HPOS not active.
