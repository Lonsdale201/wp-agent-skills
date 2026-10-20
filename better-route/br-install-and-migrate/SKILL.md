---
name: br-install-and-migrate
description: Install better-route from Packagist or migrate an existing WordPress API to Better Route 2.0 on PHP 8.3. Use for Composer constraints, choosing the PHP 8.1-compatible 1.1.3 security patch, upgrading web/CLI/worker runtimes, readonly DTO compatibility, or preserving earlier authentication, idempotency, Resource and WooCommerce migration requirements.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-10-20"
---

# better-route: install and migrate

## Install

Choose the package line for the actual PHP runtime. Better Route is a Composer
library, not an independently activated WordPress plugin.

```bash
composer require better-route/better-route:^2.0
composer show better-route/better-route
composer check-platform-reqs --no-dev
```

Version 2.0 requires PHP 8.3 in web, CLI, cron and worker processes. For PHP 8.1/8.2,
use the security-patched 1.x line with `composer require better-route/better-route:^1.1.3`.
On 1.1.2 or older, replace the Resource ownership helper with an explicit URL-bound
policy until updated; see `br-owned-resource-guards`.
An existing `^1.1` constraint deliberately does not select 2.0. Do not add a VCS
repository unless intentionally consuming a fork or unreleased branch.

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

## 1.1.2 / 1.1.3 to 2.0.0

- Upgrade every PHP runtime before changing the Composer constraint. A Composer
  `config.platform` value does not upgrade the server; check real platform requirements.
- Request/response, route and Woo query/policy DTOs become readonly classes. Declared
  fields and constructors remain; attaching undeclared properties now fails. Use
  `RequestContext::withAttribute()` or separate application state. Readonly is shallow.
- Sensitive arguments in annotated library frames are redacted in exception traces.
  Messages, object properties and onward PHP/WP/custom callback frames are outside
  that protection. Annotate sensitive parameters in custom implementations too.
- Method overrides and constant types are checked by PHP. Public names and constant
  values remain unchanged. No database-schema, cache-key or idempotency-key migration
  is introduced between 1.1.2 and 2.0.0.
- Resource ownership authorization now uses the same URL capture as the handler,
  preventing query/body IDs from selecting a different authorization object.
  The same security fix is available in 1.1.3 without raising the PHP minimum.
- Keep the application's REST namespace and OpenAPI `info.version` independent of the
  library major. Installing 2.0 does not require renaming an unchanged `myapp/v1` API.

Use `br-php83-upgrade` for runtime and extension compatibility checks.

## 1.1.1 to 1.1.2

This earlier upgrade remains relevant when jumping directly to 2.0:

- Customer visibility is shared across list/detail/writes through `CustomerRolePolicy`.
  Privileged multi-role, directly privileged and superadmin users are excluded by
  default. Role filters only narrow trusted configuration. Authorization/session
  metadata is rejected, including known sensitive keys without an underscore prefix.
- Customer list defaults and all coupon defaults omit metadata. Customer detail and
  create/update responses can include filtered public metadata by default. Coupon `state` is a management summary;
  published default lists still include expired/exhausted coupons unless filtered.
  Internal coupon metadata cannot invoke native setters; usage counts remain read-only.
- Analytics is opt-in through `WooAnalyticsService`, with native report capabilities,
  import-readiness checks and no cross-user wrapper cache. Use `br-woo-analytics`.
- OpenAPI PATCH operation IDs now end in `Patch`, independently of PUT `Update` IDs.
  Invalid security, duplicate operations and equivalent path templates throw. Use
  strict export and a complete OpenAPI 3.1 validator; handle native WP errors too.
- No new storage migration is introduced by 1.1.2. Preserve the older coordinated
  writer rollout below when coming from 1.1.0 or earlier.

## 1.1.0 to 1.1.1

Keep Composer versions, your REST namespace and OpenAPI `info.version` independent. Updating the library does not rename `myapp/v1`. This patch fixes existing APIs; it adds no Store API, cart, checkout or refund endpoints.

### Coordinate cache and idempotency key changes

Default response-cache keys and both classic/atomic idempotency keys and fingerprints now include router namespace, template, concrete request path and separately captured URL parameters. Query/body fields cannot mask a URL ID in this scope. `RequestContext::routePath` remains the template; the router supplies `attributes['routeNamespace']`.

Old response-cache entries become cold and expire. Old default idempotency records lack the namespace/target needed for safe translation; there is no legacy replay fallback. No table-schema change is needed from 1.1.0.

1. Pause all affected writers, webhooks, retry queues and client retries; drain in-flight requests.
2. Reconcile uncertain operations against business records. Complete or retire old retries before switching keys. Account for the entire client retry horizon; waiting for record TTL alone is insufficient.
3. Switch every web/worker process together and restart long-running workers. Never mix old/new default key schemes.
4. Verify identical replay and payload conflicts, then resume new operations. Retain business-level deduplication for irreversible effects.

Do not clear records as a substitute for reconciliation. Rollback requires the same coordination. Custom key/fingerprint resolvers own namespace, URL, identity and tenant isolation; a custom key alone still uses the changed default fingerprint. Keep auth before cache/idempotency. Rate-limit buckets, optimistic-lock scope and single-use token semantics are unchanged.

### Review authentication and Woo changes

- JWT, Bearer and Application Password middleware restore the caller's native WP user in `finally`. Unmapped JWT/Bearer identities run downstream as native user `0`; null/empty identity attributes replace stale outer values.
- Pair custom `setCurrentUser` adapters with the appended optional `getCurrentUser` callback. Existing positional constructor arguments are unchanged.
- Native binding ends with the downstream pipeline: later `rest_request_after_callbacks`, `rest_post_dispatch` and `_embed` see the restored caller. Use native WP request authentication when those phases require a WP identity. Never disable authorization to preserve access.
- WordPress permissions run before middleware. `protectedByMiddleware()` alone does not authenticate.
- Address-only order updates recalculate tax/totals, including paid orders. Requested status follows calculations; payment gateways initialize before writes.
- Save precedes `payment_complete()`; `set_paid` updates call it only if the order still needs payment. An already-paid status plus `set_paid` does not guarantee that event. The flag does not prove external capture.
- Database rollback cannot undo emails/webhooks/external effects.
- Order quantities are positive finite numbers; stock accepts finite numbers (including negative values) or null. Reject values that `wc_stock_amount()` changes. Fractional configuration must remain active for subsequent reads too; Better Route does not bypass Woo's data store.
- Regenerate clients if needed: OpenAPI line quantities are `number` (input `exclusiveMinimum: 0`); stock is `number` or `null`.

## 1.0.x to 1.1.x migration checklist

Also follow the 1.1.1 rollout above when upgrading directly from 1.0.x.

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
- Return data-only payloads. The atomic wpdb store uses data-only encoding; the classic wpdb store retains its `Response::class` allowlist. Both middleware normalize `WP_REST_Response` into a Better Route response and do not store returned `WP_Error` values.
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

- Enable Woo idempotency explicitly (default disabled); custom stores must implement `AtomicIdempotencyStoreInterface`. When enabled in WordPress, the registrar installs/migrates and reuses `WpdbAtomicIdempotencyStore`; schema failure is surfaced instead of falling back to request-local memory.
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
- Migration contract: <https://github.com/Lonsdale201/better-route/blob/main/MIGRATING.md>
- Verified source paths:
  - `README.md`
  - `composer.json`
  - `src/Router/Router.php`
  - `src/Middleware/Write/WpdbAtomicIdempotencyStore.php`
  - `src/Integration/Woo/WooRouteRegistrar.php`
