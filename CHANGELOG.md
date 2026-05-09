# Changelog

This collection is continuously evolving — entries are date-based, not version-tagged. New skills land when they're ready; updates go in when they cover real ground (a new release of an upstream plugin, a verified misconception, a corrected example).

## 2026-05-10

### New domains

- **`fluentcrm/`** — FluentCRM extension-point skills. See [`fluentcrm/README.md`](fluentcrm/README.md).

### New skills (FluentCRM 2.9.87 / FluentCampaign Pro)

- **`fluentcrm/fluentcrm-overview`** — Orient skill for FluentCRM extension development. Free / Pro split (FluentCRM = funnel chassis; FluentCampaign Pro = integrations + advanced actions / benchmarks), plugin paths and constants, the bootstrap order (`fluentcrm_loaded` → `fluentcrm_addons_loaded` → `fluent_crm/after_init`), the model layer (`Subscriber`, `Funnel`, `FunnelSequence`, `FunnelSubscriber`, `FunnelMetric`), the global helpers (`FluentCrmApi`, `fluentCrmDb`, `FunnelHelper`), the contact lifecycle hooks (`fluent_crm/contact_created`, `_updated`, `_email_changed`, `_custom_data_updated`), the smart-code extension filter (`fluent_crm/extended_smart_codes`), and a decision matrix for picking the right extension contract.
- **`fluentcrm/fluentcrm-funnel-trigger`** — Extend `BaseTrigger` to start a FluentCRM automation from a custom event. Four abstract methods, the auto-injected `__force_run_actions` field, the canonical `isProcessable` / `run_multiple` / `ifAlreadyInFunnel` guard, the `source_trigger_name` / `source_ref_id` metadata for `FunnelProcessor::startFunnelSequence`. Critical lifecycle — register on `fluentcrm_loaded` priority below 10, NEVER on `fluent_crm/after_init`. `FunnelHandler::handle` runs on `fluentcrm_addons_loaded` and locks in `actionArgNum=1` if `fluentcrm_funnel_arg_num_{name}` is absent — multi-arg hooks like `lw_lms_after_grant` silently drop args past the first.
- **`fluentcrm/fluentcrm-funnel-action`** — Extend `BaseAction` to add a sequence step that runs per-contact when an automation reaches it. Three abstract methods, the per-step `handle($subscriber, $sequence, $funnelSubscriberId, $funnelMetric)` signature, and the canonical skip / failure semantics — `handle` ONLY overrides status on early-return, because `FunnelProcessor::processSequence` already marks the sequence `'complete'` BEFORE dispatch. Status string canon is `'complete'` (NOT `'completed'`); both the sequence-subscriber row (via `FunnelHelper::changeFunnelSubSequenceStatus`) AND the `FunnelMetric` (`->status` + `->save()`) need updating on skip.
- **`fluentcrm/fluentcrm-funnel-benchmark`** — Extend `BaseBenchMark` to add a goal / wait point that pauses sequence execution until a matching event occurs (tag applied, list joined, course completed, custom event). Three abstract methods, Optional vs Essential semantics, the `can_enter` direct-entry toggle, the `assertCurrentGoalState` filter, `FunnelProcessor::startFunnelFromSequencePoint` as the canonical resume entry — NOT `startFunnelSequence` (that starts a new run). Benchmarks share the action listener with triggers via `FunnelHandler::mapTriggers`, so the `fluentcrm_funnel_arg_num_{name}` timing applies.
- **`fluentcrm/fluentcrm-rest-options`** — Register a custom AJAX option list for FluentCRM trigger / action / benchmark editor pickers. Pairs `'type' => 'rest_selector', 'option_key' => '<key>'` in a settings field with `add_filter('fluentcrm_ajax_options_<key>', $cb, 10, 3)` server-side. Filter signature `($options, $search, $includedIds)` returns `[{id, title}]`. Critical — pre-selected IDs must always be returned regardless of `$search` or the editor renders saved values as raw IDs instead of human labels.

### Updated skills

- **`lw-plugins/lw-lms-backend-extend`** — bumped tested-version to **lw-lms 1.3.0**. New canonical enrollment hook `lw_lms_after_grant` (5 args) replaces the v1.2.x shim pattern; new `lw_lms_after_revoke` (3 args) and `lw_lms_pre_grant` filter (6 args). Free-course implicit enrollment so `after_grant` fires for free as well as Woo / manual paths. New `ProgressRepository::mark_course_completed($user_id, $course_id)` force-complete helper. Read API split — `AccessQueries` / `ProgressQueries` for reads, `AccessRepository` / `ProgressRepository` writes-only. `lw_lms_lesson_completed` / `lw_lms_course_completed` now fire from the repository / completion tracker so CLI / cron / programmatic completions are no longer silent. Added "name = `lw_lms_after_grant`, NOT `lw_lms_user_enrolled`" misconception correction; flagged the `WooCommerceChecker` / `SubscriptionVariationChecker` runtime-check (no enrollment row, no hook) as a coverage gap.
- **`lw-plugins/lw-lms-frontend-build`** — bumped tested-version to **lw-lms 1.3.0**. Documents the v1.2.15 paid-course `access.subscription_variations` field (variation-level WC subscription upsells with `parent_id` / `variation_id` / `name` / `attributes` / `price` / `url`) alongside `products` and `subscriptions`. Notes v1.3.0 free-course implicit enrollment (server-side, transparent to the frontend but fires downstream automation).
- **`woocommerce/wcm-membership-hooks`** — added "Active-detection canon" section: at registration time use `class_exists('WC_Memberships_Loader')` (file-scope, race-free) NOT `function_exists('wc_memberships')` or `class_exists('WC_Memberships')` (both declared inside the plugin's `plugins_loaded:10` callback — load-order race). Added `wc_memberships_get_user_membership_statuses($with_labels, $prefixed)` as the canonical status registry (honours the `wc_memberships_user_membership_statuses` filter). Added `set_start_date()` / `set_end_date()` semantics — empty string defaults to `current_time` / clears the end date (the canonical "never expires" pattern). Updated `wc_memberships_create_user_membership` notes (throws `SV_WC_Plugin_Exception` on missing plan).

### Repo / docs

- `fluentcrm` added to the validator and submission-form domain allowlists (`.github/scripts/validate-skill.js`, `.github/scripts/build-skill-pr.js`, `.github/ISSUE_TEMPLATE/new-skill.yml`).
- `jet-engine` retroactively added to the same three allowlists (was missing since the domain was introduced — would have failed validation on any future jet-engine PR).
- Root `README.md` domain table grew a `fluentcrm/` row.
- `lw-plugins/README.md` descriptions refreshed for the lw-lms 1.3.0 hook surface.

## 2026-05-02

### New skills (better-route 0.6.0)

- **`better-route/br-jwks-jwt-auth`** — RS256/ES256 JWT verification from JWKS via `Rs256JwksJwtVerifier`, `JwksProviderInterface`, `HttpJwksProvider`, `StaticJwksProvider`, and `JwtBearerTokenVerifierAdapter`. Strict JOSE — exact `kid` match, `none` and `HS*` rejected, HTTPS-only JWKS URL, single `refresh()` on key miss, transient cache + `better_route/jwks_refresh` action.
- **`better-route/br-hmac-signature`** — `HmacSignatureMiddleware` for signed server-to-server REST requests and webhooks. `X-Signature` (HMAC-SHA256 of `timestamp.body`), `X-Timestamp` replay window, `X-Key-Id` multi-key rotation. `HmacSecretProviderInterface` + `ArrayHmacSecretProvider`. Constant-time comparison via `Crypto::equals`.
- **`better-route/br-single-use-token`** — `SingleUseTokenMiddleware` for auth codes, magic links, password-reset/email-confirmation tokens. Stores: `WpdbSingleUseTokenStore` (atomic SQL `UPDATE … WHERE used = 0`), `WpCacheSingleUseTokenStore`, `ArraySingleUseTokenStore`. Fixes auth-code TOCTOU by reserving BEFORE the handler runs.
- **`better-route/br-network-security`** — `TrustedProxyClientIpResolver` (replacement for the legacy `ClientIpResolver`), `IpAllowlistMiddleware`, `CidrMatcher`. Requires `REMOTE_ADDR` to live inside the configured trusted-proxy CIDR set before honoring `X-Forwarded-For` / `CF-Connecting-IP`. Pin webhook callbacks to issuer CIDRs (Stripe, GitHub, Cloudflare).
- **`better-route/br-crypto`** — `Crypto` and `CryptoEncoding` helpers — `Crypto::token` / `Crypto::tokenHex` for CSPRNG tokens, `Crypto::base64UrlEncode/Decode` for URL-safe base64 (PKCE / state / nonce), and `Crypto::equals` for constant-time comparison of tokens / HMACs.

### Updated skills

- **`better-route/br-auth-middleware`** — bumped tested-version to 0.6.0; documents the RS256/ES256 path via `BearerTokenAuthMiddleware` + `JwtBearerTokenVerifierAdapter` + `Rs256JwksJwtVerifier` and cross-links to `br-jwks-jwt-auth` and `br-hmac-signature`. Removed the "library ships HS256 only" caveat.
- **`better-route/br-error-contract`** — bumped tested-version to 0.6.0; covers the opt-in OAuth RFC 6749 error format via `->meta(['error_format' => 'oauth_rfc6749'])` and `OAuthErrorNormalizer`. Default better-route envelope unchanged.
- **`better-route/br-install-and-migrate`** — bumped tested-version to 0.6.0; adds the 0.6.0 changes contributors must adopt (new auth/network primitives, OAuth error format opt-in, `TrustedProxyClientIpResolver` migration from the legacy `ClientIpResolver`).
- **`better-route/br-rate-limiting`** — bumped tested-version to 0.6.0; documents the `clientIpResolver` constructor parameter accepting a `ClientIpResolverInterface` and cross-links to `br-network-security`.

### Repo / docs

- **OpenAI Agent SDK manifests** — every new and updated better-route skill ships an `agents/openai.yaml` (display_name / short_description / default_prompt) for direct consumption by the OpenAI Agent SDK runtime alongside the existing Anthropic Skill format.
- `better-route/README.md` updated — added Network and Crypto / primitives sections, listed all 0.6.0 skills.

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
