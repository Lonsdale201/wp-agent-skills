# better-route

**Consumer** skills for the [better-route](https://github.com/Lonsdale201/better-route) PHP library — fluent REST router for WordPress, PHP 8.1+, v0.5.0+. Use these when building / migrating / extending an API on top of better-route.

## Core

| Skill | Purpose |
|---|---|
| `br-install-and-migrate` | Install (Composer VCS repo, NOT yet on Packagist) + v0.4.0 migration — write methods (POST/PUT/PATCH/DELETE) deny by default; declare intent via `->permission()`, `->protectedByMiddleware()`, or `->publicRoute()`. Plus the v0.3.0 breaking changes that still apply on older upgrades (custom-table policy required, JWT `exp` required, identity-aware default keys, OpenAPI doc admin-only). |
| `br-routes` | Custom REST routes via fluent Router — `BetterRoute::router('vendor', 'v1')` with `->get/post/put/patch/delete` returning a RouteBuilder. The v0.4.0 deny-by-default rule for write methods, route grouping with shared middleware, URL-param-wins-over-body-param resolution, X-Request-ID validation regex `^[A-Za-z0-9._:-]{1,128}$`. |
| `br-resource-cpt` | CPT-backed CRUD resources via `Resource::make('books')->sourceCpt('book')` — auto-generates list/get/create/update/delete routes. Source-verified note — visibility method is `->cptVisibleStatuses(...)` (NOT `->allowedStatuses(...)` as some docs show), `writeSchema`/`payloadSchema` aliases, `deleteMode` is `'force'` or `'trash'`. |
| `br-resource-table` | Custom-table-backed CRUD via `Resource::make->sourceTable($wpdb->prefix . 'audit_events')` — REQUIRES `->fields([...])` (throws if empty) AND `->policy(...)` (deny-by-default for ALL actions including reads, unlike CPT sources). Cross-database table names containing `.` are rejected. |
| `br-write-schema` | Resource payload validation via `->writeSchema([...])` — type / required / nullable / min / max / minLength / maxLength / regex / values / sanitize. Source-verified — enum shape is FLAT `{type: 'enum', values: [...]}`, NOT nested `{type: 'enum', enum: {values: [...]}}` as some docs show. Failures return `400 validation_failed` with `details.fieldErrors`. |
| `br-resource-policy` | Permission policies on resources — four `ResourcePolicy` presets (`publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks`) and per-field write authorization via `->fieldPolicy([...])`. Important — `fieldPolicy` strips denied fields silently; combine with explicit error-throwing in `writeSchema` sanitize callable if consumers need feedback. |
| `br-error-contract` | The standard error envelope `{error: {code, message, requestId, details}}` — throw `ApiException(message, status, errorCode, details)` for caller-controlled errors. v0.3.0 normalization scrubs `message` to "Unexpected error." and empties `details` for status >= 500 from non-ApiException; status === 400 preserves `details.exception` as developer aid. Common codes — `validation_failed`, `idempotency_key_required`, `invalid_token`, `not_found`, `rate_limited`, `hpos_required`. |

## Auth

| Skill | Purpose |
|---|---|
| `br-auth-middleware` | JWT (Hs256JwtVerifier with v0.3.0 `exp`-required default), custom bearer tokens (BearerTokenAuthMiddleware), WP application passwords, cookie + nonce. WpClaimsUserMapper no longer maps `sub` by default — re-add explicitly if your tokens use it. Middleware order matters — auth before rate-limit / idempotency. |
| `br-owned-resource-guards` | Add v0.5.0 ownership checks for user-owned REST resources — `OwnershipGuardMiddleware` for raw routes, `OwnedResourcePolicy::currentUserOwns()` for the Resource DSL. Use when authentication is not enough and the requested object must belong to the authenticated user (orders, profiles, tokens, subscriptions, memberships). Bypass via `bypassCapability` for admins; default `deniedStatus: 404` does not leak existence. |

## Write safety

| Skill | Purpose |
|---|---|
| `br-idempotency` | Replay-cache idempotency for POST / PUT / PATCH — `IdempotencyMiddleware` + `Idempotency-Key` header. Production needs `WpdbIdempotencyStore` (call `installSchema()` on plugin activation). v0.3.0 default key is identity-aware. Cross-links to `br-atomic-idempotency` when concurrent duplicate execution must be prevented. |
| `br-atomic-idempotency` | v0.5.0 `AtomicIdempotencyMiddleware` for high-side-effect write endpoints (payment / order / subscription / account) where concurrent duplicate requests must NOT execute twice. Reserves the key BEFORE the handler runs. Concurrent identical retries get `409 idempotency_in_progress`; same key with a different fingerprint gets `409 idempotency_conflict`; replay carries `Idempotency-Replayed: true`. Production store is `WpdbAtomicIdempotencyStore` (`INSERT IGNORE` reservation, dedicated installable schema). |

## CORS / public client

| Skill | Purpose |
|---|---|
| `br-cors-public-client` | v0.5.0 `CorsMiddleware` + `CorsPolicy` + `Router::options()` for browser / mobile / embedded clients that need `Authorization`, `Idempotency-Key`, `If-Match`, `X-Request-ID`, or credentialed cross-origin requests. Default exposed headers cover `ETag`, `Idempotency-Replayed`, and rate-limit telemetry. Place CORS BEFORE auth so preflight short-circuits without `401`. |

## HTTP behaviors

| Skill | Purpose |
|---|---|
| `br-etag-cache` | HTTP ETag caching for GET/HEAD endpoints via ETagMiddleware — `sha1(json_encode($body))` by default, custom `etagResolver` for cheap hashing on large bodies, `weak: true` for W/-prefixed validators. Skips non-2xx-non-204; combine with `Cache-Control` for unconditional caching. |
| `br-rate-limiting` | Throttling via RateLimitMiddleware with WpObjectCacheRateLimiter (preferred, throws if no persistent object cache) or TransientRateLimiter (fallback). v0.3.0 default key is identity-aware. ClientIpResolver requires REMOTE_ADDR to be in `trustedProxies` before reading X-Forwarded-For (otherwise IP spoofing is trivial). v0.5.0 — array handler responses are wrapped into `Response` so rate-limit headers survive. |

## Observability

| Skill | Purpose |
|---|---|
| `br-audit-enrichment` | v0.5.0 `AuditEnricherMiddleware` + `AuditMiddleware` audit-attribute merging. Adds auth provider/user/subject, hashed Idempotency-Key, optional client IP, and any static fields (e.g. `resource`, `action`) to emitted events without modifying handlers. Order: auth → enricher → audit. Enriched values are domain-safe (no raw tokens / PII). |

## Documentation

| Skill | Purpose |
|---|---|
| `br-openapi` | OpenAPI 3.1.0 export via `BetterRoute::openApiExporter()->export(...)` OR live publishing via `OpenApiRouteRegistrar::register(...)`. v0.3.0 default permission for the registrar is `manage_options`; pass `permissionCallback` to override. `strictSchemas: true` throws on unknown `$ref`; default `false` substitutes a forgiving `{type: object, additionalProperties: true}`. |

## WooCommerce integration

| Skill | Purpose |
|---|---|
| `br-woo-routes` | WooCommerce data over REST via `BetterRoute::wooRouteRegistrar()->register(...)` — generates orders/products/customers/coupons CRUD. v0.3.0 customer endpoints filter to `customer` role only; writes need `create_users`/`edit_user`/`delete_user` on top of registrar permissions. Meta keys with `_` prefix stripped by default. |
