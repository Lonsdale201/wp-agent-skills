# better-route

**Consumer** skills for the [better-route](https://github.com/Lonsdale201/better-route) PHP library — fluent REST router for WordPress, PHP 8.1+, v1.0.0 (first stable release). Use these when building / migrating / extending an API on top of better-route. v1.0.0 consolidates the 0.3–0.6 line and hardens several defaults — see `br-install-and-migrate` for the behavior-change checklist.

## Core

| Skill | Purpose |
|---|---|
| `br-install-and-migrate` | Install (Composer, on Packagist since 1.0.0) + migrate to v1.0.0 — write methods (POST/PUT/PATCH/DELETE) deny by default; declare intent via `->permission()`, `->protectedByMiddleware()`, or `->publicRoute()`. Includes the v1.0.0 behavior-change checklist (WpClaimsUserMapper email/login mapping off by default, granted-scope wildcards opt-in, CORS wildcard+credentials rejected, Woo money as strings, HPOS 503, 428 for missing preconditions) plus the older v0.3.0/v0.4.0 breaking changes that still apply on older upgrades. |
| `br-routes` | Custom REST routes via fluent Router — `BetterRoute::router('vendor', 'v1')` with `->get/post/put/patch/delete` returning a RouteBuilder. The v0.4.0 deny-by-default rule for write methods, route grouping with shared middleware, URL-param-wins-over-body-param resolution, X-Request-ID validation regex `^[A-Za-z0-9._:-]{1,128}$`. |
| `br-resource-cpt` | CPT-backed CRUD resources via `Resource::make('books')->sourceCpt('book')` — auto-generates list/get/create/update/delete routes. Source-verified note — visibility method is `->cptVisibleStatuses(...)` (NOT `->allowedStatuses(...)` as some docs show), `writeSchema`/`payloadSchema` aliases, `deleteMode` is `'force'` or `'trash'`. |
| `br-resource-table` | Custom-table-backed CRUD via `Resource::make->sourceTable($wpdb->prefix . 'audit_events')` — REQUIRES `->fields([...])` (throws if empty) AND `->policy(...)` (deny-by-default for ALL actions including reads, unlike CPT sources). Cross-database table names containing `.` are rejected. |
| `br-write-schema` | Resource payload validation via `->writeSchema([...])` — type / required / nullable / min / max / minLength / maxLength / regex / values / sanitize. Source-verified — enum shape is FLAT `{type: 'enum', values: [...]}`, NOT nested `{type: 'enum', enum: {values: [...]}}` as some docs show. Failures return `400 validation_failed` with `details.fieldErrors`. |
| `br-resource-policy` | Permission policies on resources — four `ResourcePolicy` presets (`publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks`) and per-field write authorization via `->fieldPolicy([...])`. Important — `fieldPolicy` strips denied fields silently; combine with explicit error-throwing in `writeSchema` sanitize callable if consumers need feedback. |
| `br-error-contract` | The standard error envelope `{error: {code, message, requestId, details}}` — throw `ApiException(message, status, errorCode, details)` for caller-controlled errors. Normalization scrubs message + details for ANY non-ApiException throwable (since 1.0.0 the 400 case no longer leaks `details.exception`; a 500 says "Unexpected error.", an `\InvalidArgumentException` becomes generic `400 invalid_request`). Common codes — `validation_failed`, `idempotency_key_required`, `invalid_token`, `insufficient_scope`, `not_found`, `coupon_exists` / `woo_line_items_locked` (409), `precondition_failed` (412), `precondition_required` (428), `rate_limited`, `hpos_required` (503 since 1.0.0). v0.6.0 adds opt-in OAuth RFC 6749 error format via `->meta(['error_format' => 'oauth_rfc6749'])`. |

## Auth

| Skill | Purpose |
|---|---|
| `br-auth-middleware` | JWT (Hs256JwtVerifier with v0.3.0 `exp`-required default), custom bearer tokens (BearerTokenAuthMiddleware), WP application passwords, cookie + nonce. v0.6.0 adds RS256/ES256 JWT via `Rs256JwksJwtVerifier` + `JwtBearerTokenVerifierAdapter` (dispatches to `br-jwks-jwt-auth`). WpClaimsUserMapper no longer maps `sub` by default — re-add explicitly if your tokens use it. 1.0.0 — email/login claim mapping is off by default (opt-in, requires a truthy `email_verified`; prevents account takeover from unverified issuer emails) and token-supplied `*` wildcard scopes are literal unless `allowGrantedScopeWildcards: true`. Middleware order matters — auth before rate-limit / idempotency. |
| `br-jwks-jwt-auth` | v0.6.0 `Rs256JwksJwtVerifier` + `JwksProviderInterface` (`HttpJwksProvider`, `StaticJwksProvider`) for OIDC/OAuth RS256/ES256 bearer tokens. Strict JOSE — exact `kid` match required, `none` and `HS*` algorithms rejected, HTTPS JWKS URL enforced, single `refresh()` on key miss, transient cache + `better_route/jwks_refresh` action hook. 1.0.0 — JWKS fetched via `wp_safe_remote_get` (SSRF-safe, bounded redirects + response size). Pair with `BearerTokenAuthMiddleware` via `JwtBearerTokenVerifierAdapter`. |
| `br-hmac-signature` | v0.6.0 `HmacSignatureMiddleware` for signed server-to-server REST requests and webhooks — `X-Signature` (HMAC-SHA256 of `timestamp.body`), `X-Timestamp` (replay window in seconds), `X-Key-Id` (multi-key rotation). Pair with `HmacSecretProviderInterface` / `ArrayHmacSecretProvider`. Constant-time comparison via `Crypto::equals`. 1.0.0 — the query string is not signed by default; opt in with `signQueryString: true` (adds a fifth canonical line) or send signed params in the body. Replaces unsigned public POST endpoints with shared-secret authentication. |
| `br-owned-resource-guards` | Add v0.5.0 ownership checks for user-owned REST resources — `OwnershipGuardMiddleware` for raw routes, `OwnedResourcePolicy::currentUserOwns()` for the Resource DSL. Use when authentication is not enough and the requested object must belong to the authenticated user (orders, profiles, tokens, subscriptions, memberships). Bypass via `bypassCapability` for admins; default `deniedStatus: 404` does not leak existence. |
| `br-single-use-token` | v0.6.0 `SingleUseTokenMiddleware` for auth codes, password-reset links, magic links, email-confirmation tokens — any token that must be consumed exactly once. Stores: `WpdbSingleUseTokenStore` (production, atomic SQL `UPDATE … WHERE used = 0`), `WpCacheSingleUseTokenStore` (object-cache add/get/delete; 1.0.0 — throws without a persistent object cache, since the consume-lock is not atomic on the in-process cache), `ArraySingleUseTokenStore` (tests). Fixes auth-code TOCTOU by reserving the token BEFORE the handler runs. |

## Write safety

| Skill | Purpose |
|---|---|
| `br-idempotency` | Replay-cache idempotency for POST / PUT / PATCH — `IdempotencyMiddleware` + `Idempotency-Key` header. Production needs `WpdbIdempotencyStore` (call `installSchema()` on plugin activation). v0.3.0 default key is identity-aware. 1.0.0 — the wpdb stores (plain + atomic) restrict `unserialize()` of cached responses to the library's `Response` class (`allowed_classes`), closing an object-injection sink. Cross-links to `br-atomic-idempotency` when concurrent duplicate execution must be prevented. |
| `br-atomic-idempotency` | v0.5.0 `AtomicIdempotencyMiddleware` for high-side-effect write endpoints (payment / order / subscription / account) where concurrent duplicate requests must NOT execute twice. Reserves the key BEFORE the handler runs. Concurrent identical retries get `409 idempotency_in_progress`; same key with a different fingerprint gets `409 idempotency_conflict`; replay carries `Idempotency-Replayed: true`. Production store is `WpdbAtomicIdempotencyStore` (`INSERT IGNORE` reservation, dedicated installable schema). |

## CORS / public client

| Skill | Purpose |
|---|---|
| `br-cors-public-client` | v0.5.0 `CorsMiddleware` + `CorsPolicy` + `Router::options()` for browser / mobile / embedded clients that need `Authorization`, `Idempotency-Key`, `If-Match`, `X-Request-ID`, or credentialed cross-origin requests. Default exposed headers cover `ETag`, `Idempotency-Replayed`, and rate-limit telemetry. 1.0.0 — `CorsPolicy` throws at construction when `*` origins are combined with `allowCredentials: true`. Place CORS BEFORE auth so preflight short-circuits without `401`. |

## HTTP behaviors

| Skill | Purpose |
|---|---|
| `br-etag-cache` | HTTP ETag caching for GET/HEAD endpoints via ETagMiddleware — `sha1(json_encode($body))` by default, custom `etagResolver` for cheap hashing on large bodies, `weak: true` for W/-prefixed validators. Skips non-2xx-non-204; combine with `Cache-Control` for unconditional caching. |
| `br-rate-limiting` | Throttling via RateLimitMiddleware with WpObjectCacheRateLimiter (preferred, throws if no persistent object cache) or TransientRateLimiter (fallback). v0.3.0 default key is identity-aware. ClientIpResolver requires REMOTE_ADDR to be in `trustedProxies` before reading X-Forwarded-For (otherwise IP spoofing is trivial). v0.5.0 — array handler responses are wrapped into `Response` so rate-limit headers survive. v0.6.0 — `clientIpResolver` constructor parameter accepts a `ClientIpResolverInterface` (e.g. `TrustedProxyClientIpResolver`); see `br-network-security`. |

## Network

| Skill | Purpose |
|---|---|
| `br-network-security` | v0.6.0 `TrustedProxyClientIpResolver` (replacement for the legacy `ClientIpResolver`) + `IpAllowlistMiddleware` + `CidrMatcher`. Requires `REMOTE_ADDR` to be inside the configured trusted-proxy CIDR set before honoring `X-Forwarded-For` / `CF-Connecting-IP` — prevents header-spoofed IP injection. 1.0.0 — `X-Forwarded-For` is walked right-to-left to the closest untrusted hop (the left-most entry is client-forgeable behind an appending proxy). Pin webhook callbacks to issuer CIDRs (Stripe, GitHub, Cloudflare). Inject as `clientIpResolver` into rate-limit / audit middleware. |

## Crypto / primitives

| Skill | Purpose |
|---|---|
| `br-crypto` | v0.6.0 `Crypto` and `CryptoEncoding` helpers for cryptographically secure token generation (`Crypto::token`, `Crypto::tokenHex`), URL-safe base64 (`Crypto::base64UrlEncode/Decode`), and constant-time comparison (`Crypto::equals`). Use anywhere you'd otherwise compare tokens with `===`/`!==` (HMAC, password reset codes, PKCE verifier, CSRF, webhook signatures). |

## Observability

| Skill | Purpose |
|---|---|
| `br-audit-enrichment` | v0.5.0 `AuditEnricherMiddleware` + `AuditMiddleware` audit-attribute merging. Adds auth provider/user/subject, hashed Idempotency-Key, optional client IP, and any static fields (e.g. `resource`, `action`) to emitted events without modifying handlers. Order: auth → enricher → audit. Enriched values are domain-safe (no raw tokens / PII). |

## Documentation

| Skill | Purpose |
|---|---|
| `br-openapi` | OpenAPI 3.1.0 export via `BetterRoute::openApiExporter()->export(...)` OR live publishing via `OpenApiRouteRegistrar::register(...)`. v0.3.0 default permission for the registrar is `manage_options`; pass `permissionCallback` to override. `strictSchemas: true` throws on unknown `$ref`; default `false` substitutes a forgiving `{type: object, additionalProperties: true}`. 1.0.0 — Woo component monetary fields are typed `string` (services serialize money as decimal strings). |

## WooCommerce integration

| Skill | Purpose |
|---|---|
| `br-woo-routes` | WooCommerce data over REST via `BetterRoute::wooRouteRegistrar()->register(...)` — generates orders/products/customers/coupons CRUD. v0.3.0 customer endpoints filter to `customer` role only; writes need `create_users`/`edit_user`/`delete_user` on top of registrar permissions. Meta keys with `_` prefix stripped by default. 1.0.0 — money serialized as decimal strings, `requireHpos` gates order routes only (503, was 409), order/product `?search=` actually filters, product `price` read-only, line-item edits locked on stock-reduced orders (`409 woo_line_items_locked`), duplicate coupon codes `409 coupon_exists`, plus a `HposGuard::declareCompatibility(__FILE__)` helper the host plugin must call. |
