# Changelog

This collection is continuously evolving — entries are date-based, not version-tagged. New skills land when they're ready; updates go in when they cover real ground (a new release of an upstream plugin, a verified misconception, a corrected example).

## 2026-05-01

### New domains

- **`jet-engine/`** — JetEngine extension-point skills. See [`jet-engine/README.md`](jet-engine/README.md).

### New skills

- **`better-route/br-atomic-idempotency`** — better-route 0.5.0 `AtomicIdempotencyMiddleware` for high-side-effect write endpoints (payment / order / subscription / account) where concurrent duplicate execution must be prevented. Reserves the key BEFORE the handler runs.
- **`better-route/br-audit-enrichment`** — better-route 0.5.0 `AuditEnricherMiddleware` + `AuditMiddleware` audit-attribute merging. Adds auth provider/user/subject, hashed Idempotency-Key, optional client IP, and static fields without modifying handlers.
- **`better-route/br-cors-public-client`** — better-route 0.5.0 `CorsMiddleware` + `CorsPolicy` + `Router::options()` for browser/mobile clients that need credentialed cross-origin requests with `Authorization`, `Idempotency-Key`, etc.
- **`better-route/br-owned-resource-guards`** — better-route 0.5.0 `OwnershipGuardMiddleware` and `OwnedResourcePolicy::currentUserOwns()` for routes / Resource DSL endpoints where the authenticated user may only access their own object.
- **`jet-engine/je-dynamic-visibility-condition`** — register a custom JetEngine Dynamic Visibility condition (`Conditions\Base` subclass + `jet-engine/modules/dynamic-visibility/conditions/register`).
- **`jet-engine/je-listings-callback`** — register a custom JetEngine Listings callback (per-field transform for the Dynamic Field widget). Both registration paths covered, with the critical "callback identifier must be a real callable string" rule.
- **`jet-engine/je-query-builder-custom-type`** — register a custom Query type for JetEngine's Query Builder (runtime + editor halves), including JE 3.8+ MCP exposure and the frontend query inspector hookup.
- **`woocommerce/wc-stripe-add-payment-method`** — the fragile My Account payment-methods + add-payment-method flows of the WooCommerce Stripe Gateway (templates, Payment Element/UPE, SetupIntent, saved cards, Subscriptions change-payment-method compatibility).
- **`woocommerce/wcm-data-model-subscriptions-link`** — WooCommerce Memberships storage and relationship map (CPTs, statuses, plan/user-membership meta keys, rule storage, profile-field storage, the Subscriptions-linked membership relation).
- **`woocommerce/wcs-data-model-switching-gifting`** — WooCommerce Subscriptions data model + switcher + gifting reference (order types, product type slugs, schedule/date keys, switch cart data, switch order data, WCS Gifting recipient storage).

### Updated skills

- **`better-route/br-idempotency`** — cross-linked to the new `br-atomic-idempotency` skill, bumped tested-version to 0.5.0, clarified that classic `IdempotencyMiddleware` does NOT prevent concurrent double execution (use atomic for that).
- **`better-route/br-routes`** — better-route 0.5.0 cross-references (`Router::options()` for preflight, ownership guards link).
- **`better-route/br-rate-limiting`** — note that v0.5.0 `RateLimitMiddleware` wraps array handler responses into `Response` so rate-limit headers survive even when the handler returns plain data.
- **`woocommerce/wcs-subscription-hooks`** — added a "Storage facts agents must not guess" section (subscription order type, product type slugs, scheduled-action group, prop meta keys, related-order meta) and "Customer action guardrails" (status / payment-method / switch actions, ownership and capability checks).
- **`woocommerce/wcm-membership-hooks`** — additional source-refs and tightened hook coverage around membership-Subscriptions linking.
- **`woocommerce/wc-rest-api-v4`** — verified-route catalog expansion and additional hook-prefix examples.
- **`woocommerce/wc-payment-gateway`** — minor source-ref / wording tightening.
- **YAML frontmatter normalization** across 13 skills (`bd-attribute`, `bd-security`, `br-auth-middleware`, `br-error-contract`, `br-etag-cache`, `br-openapi`, `br-resource-policy`, `br-write-schema`, `wp-plugin-cron`, `wp-plugin-hooks`, `wp-plugin-options-storage`, `wp-plugin-rewrite-rules`, `wp-abilities-api`) — `description: >` block converted to inline form for parser consistency. No content change.

### Repo / docs

- Repository structure section in the root README is now a domain table (not a flat skill list); each domain folder has its own `README.md` with the skill table for that domain.
- Added this `CHANGELOG.md`.
