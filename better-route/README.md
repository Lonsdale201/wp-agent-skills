# Better Route skills

Consumer skills for [Better Route](https://github.com/Lonsdale201/better-route), the fluent REST layer for WordPress. The current release preparation targets **2.0.0 / PHP 8.3+**. The published **1.1.2** line remains available for PHP 8.1/8.2 consumers. Use this collection when building, reviewing or migrating plugin APIs.

The collection is grounded in the public Better Route source and documentation. Every raw route denies by default, including `GET` and `OPTIONS`, until it declares `permission()`, `protectedByMiddleware()` or an intentionally reviewed `publicRoute()`.

The update adds customer-role policies, coupon management views, read-only Analytics, stricter OpenAPI contracts and the PHP 8.3 upgrade. Earlier cache/idempotency migration and native authentication-scope requirements remain in force. Start with `br-install-and-migrate` before deployment or rollback. Individual metadata records tested versions; unchanged skills retain their earlier baseline rather than implying a new independent runtime verification.

## Core and migration

| Skill | Purpose |
|---|---|
| `br-install-and-migrate` | Select the 2.0/PHP 8.3 or 1.1.2/PHP 8.1 line and preserve earlier routing, auth, storage and concurrency migrations. |
| `br-php83-upgrade` | Upgrade all PHP runtimes, review readonly DTO compatibility and custom sensitive-parameter annotations, then verify the consumer deployment. |
| `br-routes` | Register raw routes, WordPress regex path parameters, valid handler signatures, groups, middleware, WordPress `args`, and explicit access intent. |
| `br-error-contract` | Emit the standard error envelope, safe `ApiException` details and headers, normalized `WP_Error`, OAuth error mode, and non-leaking telemetry. |

## Resources

| Skill | Purpose |
|---|---|
| `br-resource-cpt` | Build CPT-backed CRUD with fail-closed public visibility, stable sorting, filtering, pagination, policies, and trash/force delete behavior. |
| `br-resource-table` | Build custom-table CRUD with safe table naming, real SQL `NULL`, fields/policies, stable primary-key ordering, pagination, and physical delete semantics. |
| `br-resource-policy` | Configure action and field authorization. Denied write fields fail explicitly; they are not silently stripped. |
| `br-write-schema` | Validate create/update bodies with coercion, sanitization, constraints, flat enum `values`, unknown-field rejection, and structured `fieldErrors`. |
| `br-owned-resource-guards` | Enforce server-resolved object ownership on raw routes or Resource policies, including the separate requirement to filter list queries. |

## Authentication and network controls

| Skill | Purpose |
|---|---|
| `br-auth-middleware` | Configure JWT, custom bearer, Application Password, or cookie+nonce authentication and the shared `AuthContext` identity. |
| `br-jwks-jwt-auth` | Verify RS256/ES256 OIDC/OAuth JWTs with exact `kid` selection, HTTPS/SSRF-safe JWKS fetches, bounded caches, refresh locks, and cooldowns. |
| `br-hmac-signature` | Authenticate webhooks/back-channel requests over timestamp, method, path, raw body hash, and optional canonical query. |
| `br-network-security` | Resolve client IP only through configured trusted proxies and enforce CIDR allowlists without forwarded-header spoofing. |

## Write and concurrency safety

| Skill | Purpose |
|---|---|
| `br-idempotency` | Cache completed POST/PUT/PATCH/DELETE results, detect key/fingerprint conflict, and replay normalized WordPress responses. |
| `br-atomic-idempotency` | Reserve an idempotency key before high-side-effect execution with lease-aware, data-only production storage. |
| `br-optimistic-locking` | Prevent stale and concurrent cooperating writes with `If-Match`, current-version resolution, and a per-resource critical section. |
| `br-single-use-token` | Store tokens hashed and consume them atomically once through wpdb or a persistent-object-cache-backed store. |

## HTTP behavior and public clients

| Skill | Purpose |
|---|---|
| `br-cors-public-client` | Configure validated CORS policy, authoritative WordPress response bridging, and explicit middleware-protected `OPTIONS` routes. |
| `br-etag-cache` | Generate/compare strong or weak ETags on Better Route and `WP_REST_Response` output and preserve correct 304 metadata. |
| `br-rate-limiting` | Apply identity-aware limits with truly atomic storage and complete 429/rate-limit response headers. |

## Documentation, integrations, and support

| Skill | Purpose |
|---|---|
| `br-openapi` | Export OpenAPI 3.1 from route args and metadata, override parameters/responses correctly, and describe Resource envelopes/security. |
| `br-woo-routes` | Generate strict WooCommerce CRUD with JSON pagination metadata, payload rules, stable sort, metadata protection, HPOS guard, and atomic create/update idempotency. |
| `br-woo-analytics` | Expose fixed native reports with current-user permissions, bounded report queries, comparison windows, import readiness and matching OpenAPI schemas. |
| `br-audit-enrichment` | Add safe auth/domain/IP correlation data while ensuring logger failures never alter API behavior. |
| `br-crypto` | Generate random opaque tokens, encode/decode Base64URL strictly, and compare secret strings in constant time. |

## Important 1.1 integration notes

- WordPress route placeholders use `/(?P<id>\d+)`, not `{id}`.
- WordPress REST `args` validation runs before the route permission callback. Keep validators cheap, deterministic, and side-effect-free.
- Strict query parsing still admits WordPress global parameters such as `_fields`, `_embed`, `_locale`, `_envelope`, and `_jsonp`.
- That global-parameter allowance applies to CRUD parsers. Analytics accepts only its report-specific query keys and rejects those injected extras.
- Resource `allow([])` registers no actions; omitting `allow()` registers the full CRUD set. `patch` is not a Resource action name—use `update`.
- Resource sort allowlists contain bare field names; callers request descending order with `?sort=-field`.
- Woo list totals live in the JSON `meta` envelope, not `X-WP-Total` headers; over-limit `per_page` fails rather than being silently clamped.
- The current 1.1 Woo registrar attaches atomic idempotency to generated `create` and `update` routes, not generated `delete` routes. Do not infer broader coverage from generic “write routes” wording.
- The default optimistic lock coordinates writers that use the same Better Route named lock. External writers need the same discipline or a storage-level conditional update.
