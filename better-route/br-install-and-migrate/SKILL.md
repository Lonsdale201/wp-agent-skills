---
name: br-install-and-migrate
description: Install better-route from Packagist or migrate a WordPress integration to better-route 1.1. Use when adding better-route/better-route, changing the Composer constraint to ^1.1, upgrading from 1.0 or pre-1.0 releases, diagnosing new 403 route responses, migrating atomic idempotency schema, or reviewing 1.1 behavior changes in routing, Resource CRUD, CORS, ETag, rate limiting, JWT/JWKS, OpenAPI, and WooCommerce routes.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# better-route: install and migrate to 1.1

## Install

Require the stable 1.1 line directly from Packagist:

```bash
composer require better-route/better-route:^1.1
composer show better-route/better-route
```

Use PHP 8.1 or newer. Do not add a VCS repository unless intentionally consuming a fork or unreleased branch.

Register routes during `rest_api_init`:

```php
use BetterRoute\Router\Router;

add_action('rest_api_init', static function (): void {
    $router = Router::make('myapp', 'v1');
    $router->get('/ping', static fn (): array => ['pong' => true])
        ->publicRoute();
    $router->register();
});
```

## 1.1 migration checklist

Treat these as consumer-visible changes when moving from `^1.0` to `^1.1`.

### Routing

- Add `permission()`, `protectedByMiddleware()`, or `publicRoute()` to every raw Router route. In 1.1 omitted intent denies `GET` and `OPTIONS` too, not only writes.
- Register only during `rest_api_init`. Registration outside the hook or a `false` result from WordPress now throws clearly.
- Use WordPress route regex such as `/(?P<id>\d+)`, not `{id}`.
- Review one-parameter handlers: an untyped parameter receives the WP request; a `RequestContext`-compatible type receives the context.
- Keep route `args` validation cheap and side-effect free because WordPress performs it before `permission_callback`.

### Identity, cache, and throttling

- Expect default cache, idempotency, and rate-limit keys to use a native logged-in WordPress user even when no auth middleware populated `attributes['auth']`.
- Expect structured, recursively canonicalized keys and fingerprints. Do not depend on old delimiter-concatenated key strings.
- Use `WpObjectCacheRateLimiter` only with a persistent external object cache that supports atomic `wp_cache_incr()`.
- Use the default `TransientRateLimiter` only where MySQL named locks are available; it now serializes the transient read/modify/write instead of racing.
- Read `Retry-After` as well as `X-RateLimit-*` on `429` responses.

### Idempotency and optimistic locking

- Re-run `WpdbAtomicIdempotencyStore::installSchema()` during deployment/activation. The 1.1 schema adds `reservation_token` and migrates an existing table.
- Do not release an uncertain atomic reservation after a throwable unless duplicate execution is demonstrably safe. `releaseOnThrowable` now defaults to `false`.
- Keep idempotency keys at or below the configured `maxKeyLength` (default 200) and printable ASCII.
- Store data-only responses. Better Route serializes no arbitrary PHP classes; `WP_REST_Response` is converted to a safe Better Route response and returned `WP_Error` values are not stored.
- Understand that optimistic locking serializes cooperating Better Route writers with a MySQL advisory lock. External writers must use the same protocol or a storage-level conditional update.

### Resource DSL

- Treat omitted `allow()` as full CRUD and explicit `allow([])` as no routes. Unsupported action names now throw.
- Never call both `sourceCpt()` and `sourceTable()` on one Resource; 1.1 rejects the combination.
- Review CPT exposure. Default reads only allow a publicly viewable post type and visible status; password/private read data fails closed.
- Avoid arbitrary per-item `cptVisibilityPolicy()` callbacks on large datasets. Accurate visible totals require scanning all matched pages; prefer a query-level repository condition.
- Keep `defaultPerPage <= maxPerPage`; validation is performed on final registration state, so fluent setter order no longer changes validity.
- Expect custom-table null payloads to become SQL `NULL`, default ordering to use the primary key, and non-primary sorts to add the primary key as a stable tie-breaker.
- Strict list parsers accept WordPress global REST parameters `_locale`, `_fields`, `_embed`, `_envelope`, and `_jsonp`; other unknown parameters still fail.

### CORS, ETag, errors, and telemetry

- Attach `CorsMiddleware` to matched routes and explicitly mark any raw `OPTIONS` route public. The 1.1 WordPress bridge handles preflight before dispatch and replaces core CORS headers for those routes.
- Validate configured CORS origins/methods/header names; wildcard origin plus credentials remains invalid.
- Expect ETag matching to support weak validators, comma-separated validators, and `*`; `WP_REST_Response` status/data/cache headers are preserved. `WP_Error` and non-2xx responses are skipped.
- Pass response headers through the new `ApiException(..., headers: [...])` argument when required. Status, header names, and CR/LF values are validated.
- Do not expect arbitrary `WP_Error` data in client details. Only the allowlisted core validation `params` map is exposed.
- Treat audit/metric delivery as best-effort. Sink failures no longer replace a successful API response or mask the application exception.

### JWT and JWKS

- When `maxLifetimeSeconds` is configured, issue both `iat` and `exp`; missing either claim fails verification.
- Keep JWKS URLs HTTPS. `HttpJwksProvider` requires `wp_safe_remote_get()` with bounded redirect/body settings.
- Expect unknown-`kid` refreshes to be throttled by MySQL lock plus transient cooldown. A failed refresh preserves last-known-good cached keys.

### OpenAPI

- Let executable route `args` generate path/query parameters; use explicit `meta.parameters` only to override the same `in` + `name` pair.
- Use `meta(['openapi' => ['include' => false]])` for route exclusion.
- Expect explicit `meta.responses` to replace defaults at the same status, and `OPTIONS` to document `204` without a response body.
- Provide `<Resource>Response` envelope schemas for Resource create/update and for get when `uniformEnvelope(true)` is enabled.

### WooCommerce

- Configure Woo idempotency with `AtomicIdempotencyStoreInterface`. In WordPress, the registrar installs/migrates and reuses `WpdbAtomicIdempotencyStore`; schema failure is surfaced instead of falling back to request-local memory.
- Treat omitted `actions[resource]` as full CRUD and explicit `[]` as disabled. Invalid action names throw.
- Expect strict payload types and unknown nested-key rejection. Order payloads are fully validated before writes and create/update run in a Woo transaction.
- Keep product `price` read-only; send `regular_price` or `sale_price`.
- Do not send `username` on customer update; username changes are rejected.
- Require customer `email` and coupon `code` on create. Coupon code uniqueness is checked on create and update under a named lock.
- Paginate list endpoints. `per_page > maxPerPage` returns `400 validation_failed`; it is not silently clamped.
- Expect stable ID tie-break ordering and request expensive customer `orders_count`/`total_spent` fields explicitly on lists.

## Older migrations still in force

When upgrading from pre-1.0, also preserve these established contracts:

- JWT `exp` is required by default.
- `WpClaimsUserMapper` does not map `sub`, email, or login by default; opt in only with an issuer-safe mapping.
- Granted-scope wildcards are opt-in.
- Custom-table Resource permissions deny by default.
- The OpenAPI document endpoint defaults to `manage_options`.
- CORS wildcard origin cannot be combined with credentials.
- Woo money fields are decimal strings, product `price` is read-only, and HPOS absence is `503 hpos_required` for order routes.

## Verify

Run the package checks and then live REST smoke tests against the host stack:

```bash
composer test
composer analyse
composer cs-check
```

Smoke at minimum: anonymous/public and denied routes, authenticated reads/writes, CORS preflight, conditional ETag `304`, rate-limit `429` headers, repeated/concurrent idempotent writes, OpenAPI generation, Resource pagination/visibility, and Woo writes with HPOS enabled.

## Related skills

- Use `br-routes` for handler and permission details.
- Use `br-atomic-idempotency` and `br-optimistic-locking` for write safety.
- Use `br-resource-cpt`, `br-resource-table`, and `br-woo-routes` for migration details by integration.
- Use `br-cors-public-client`, `br-rate-limiting`, `br-openapi`, and `br-jwks-jwt-auth` for subsystem configuration.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
- Official documentation: <https://github.com/Lonsdale201/better-route>
- Verified source paths:
  - `README.md`
  - `composer.json`
  - `src/Router/Router.php`
  - `src/Middleware/Write/WpdbAtomicIdempotencyStore.php`
  - `src/Integration/Woo/WooRouteRegistrar.php`
