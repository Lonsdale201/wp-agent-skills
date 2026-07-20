# Better Route skills

Consumer skills for [Better Route](https://github.com/Lonsdale201/better-route) 1.1.0, the PHP 8.1+ fluent REST layer for WordPress. Use this collection when building, reviewing, or migrating plugin APIs.

The collection is source-verified against the local 1.1 implementation. In particular, every raw route now denies by default—including `GET` and `OPTIONS`—until it declares `permission()`, `protectedByMiddleware()`, or an intentionally reviewed `publicRoute()`.

## Core and migration

| Skill | Purpose |
|---|---|
| `br-install-and-migrate` | Install and migrate to 1.1, including fail-closed routes, dispatcher registration, Resource/Woo behavior, CORS, errors, authentication, storage, and concurrency changes. |
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
| `br-audit-enrichment` | Add safe auth/domain/IP correlation data while ensuring logger failures never alter API behavior. |
| `br-crypto` | Generate random opaque tokens, encode/decode Base64URL strictly, and compare secret strings in constant time. |

## Important 1.1 integration notes

- WordPress route placeholders use `/(?P<id>\d+)`, not `{id}`.
- WordPress REST `args` validation runs before the route permission callback. Keep validators cheap, deterministic, and side-effect-free.
- Strict query parsing still admits WordPress global parameters such as `_fields`, `_embed`, `_locale`, `_envelope`, and `_jsonp`.
- Resource `allow([])` registers no actions; omitting `allow()` registers the full CRUD set. `patch` is not a Resource action name—use `update`.
- Resource sort allowlists contain bare field names; callers request descending order with `?sort=-field`.
- Woo list totals live in the JSON `meta` envelope, not `X-WP-Total` headers; over-limit `per_page` fails rather than being silently clamped.
- The current 1.1 Woo registrar attaches atomic idempotency to generated `create` and `update` routes, not generated `delete` routes. Do not infer broader coverage from generic “write routes” wording.
- The default optimistic lock coordinates writers that use the same Better Route named lock. External writers need the same discipline or a storage-level conditional update.
