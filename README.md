# wp-agent-skills

A community-maintained collection of **agent skills** for WordPress plugin and theme development.

These skills give an AI coding assistant a concrete, version-tested playbook for common WordPress development tasks — security audits, scaffolding, i18n, REST API patterns, plugin-specific helpers (WooCommerce, JetFormBuilder, etc.) — so you spend less time re-explaining "the WordPress way" on every project.

> **Tool compatibility.** The format is plain Markdown with YAML frontmatter (the [Anthropic Skills](https://docs.anthropic.com/claude/docs/skills) shape). It's primarily tested with **Claude Code** and **claude.ai**, but any agent runtime that consumes a `SKILL.md` (Cursor rules, Aider conventions, custom Agent SDK apps, etc.) can use the same files directly or with a thin adapter.

## What's a skill?

A skill is a folder with a `SKILL.md` file that tells the agent **when** to use it and **how** to do the work. The runtime loads it on demand based on the YAML `description` in the frontmatter.

This repo is **not** a plugin, runtime, or framework. It's documentation that an AI consumes. There's nothing to install in your WordPress site.

## Repository structure

Skills are grouped by domain:

```
wp-agent-skills/
  wordpress/          # core WP, applies to any plugin or theme
    wp-security-audit/
    wp-security-deep/
    wp-security-secrets/
    wp-i18n-audit/
    wp-rest-api/
    wp-abilities-api/
    wp-presence-api/
    wp-html-api/
    wp-utf8-text/
    wp-query-cache/
  plugin-scaffold/    # building a new plugin from scratch
    wp-plugin-bootstrap/
    wp-plugin-lifecycle/
    wp-plugin-architecture/
    wp-plugin-options-storage/
    wp-plugin-cron/
    wp-plugin-hooks/
    wp-plugin-rewrite-rules/
    wp-plugin-assets-loading/
    wp-action-scheduler/
  woocommerce/        # WooCommerce-specific skills
    wc-shipping-method/
    wc-shipping-providers/
    wc-product-search-select/
    wc-hpos-compatibility/
    wc-rest-api-v4/
    wc-variations-data/
    wc-variations-pricing-filters/
    wc-payment-gateway/
    wc-emails-classic/
    wc-coupon-dynamic/
    wc-customer-and-sessions/
    wcs-subscription-hooks/
    wcs-renewal-scheduler/
    wcm-membership-hooks/
    wcm-access-discounts/
  jetformbuilder/     # JetFormBuilder-specific skills
  better-data/        # better-data library contributor skills
    bd-data-object/
    bd-attribute/
    bd-validation-rule/
    bd-source-adapter/
    bd-sink/
    bd-presenter/
    bd-hydration-coercion/
    bd-security/
    bd-better-route-bridge/
    bd-companion-plugin/
  better-route/       # better-route library consumer skills
    br-install-and-migrate/
    br-routes/
    br-resource-cpt/
    br-resource-table/
    br-write-schema/
    br-resource-policy/
    br-auth-middleware/
    br-etag-cache/
    br-rate-limiting/
    br-idempotency/
    br-openapi/
    br-woo-routes/
    br-error-contract/
  lw-plugins/         # LW Plugins family (LW LMS, LW Site Manager)
    lw-lms-backend-extend/
    lw-lms-frontend-build/
    lw-site-manager-overview/
    lw-site-manager-extend-abilities/
  wp-rocket/          # WP Rocket integration (third-party plugin)
    wp-rocket-cache-invalidation/
    wp-rocket-cache-rejection-and-filters/
```

Each skill folder contains at minimum a `SKILL.md`. Larger skills may also include `reference.md`, `examples/`, or `scripts/`.

## Using these skills

### Claude Code

Symlink (or copy) the skills into your global skills directory:

```bash
# clone once
git clone https://github.com/Lonsdale201/wp-agent-skills.git ~/wp-agent-skills

# symlink the ones you want
mkdir -p ~/.claude/skills
ln -s ~/wp-agent-skills/wordpress/wp-security-audit ~/.claude/skills/wp-security-audit
ln -s ~/wp-agent-skills/wordpress/wp-i18n-audit     ~/.claude/skills/wp-i18n-audit
# ...etc
```

Or symlink a whole domain at once if you want everything from it.

Per-project (skills only available inside a specific repo):

```bash
mkdir -p .claude/skills
ln -s ~/wp-agent-skills/wordpress/wp-security-audit .claude/skills/wp-security-audit
```

### claude.ai / Agent SDK

Upload the skill folder via the UI or SDK as documented in [Anthropic's skills docs](https://docs.anthropic.com/claude/docs/skills).

### Other agent runtimes

The format is markdown + YAML frontmatter, so most agent tools can consume it directly or with a thin adapter (e.g. symlink as a Cursor rule under `.cursor/rules/`, or include in an Aider read-list). The `name`, `description`, and body conventions are stable; only the host runtime's loading mechanism differs.

### Triggering a skill

Once installed, just ask the agent in natural language:

- *"Run a security audit on this plugin."*
- *"Check this file for i18n issues before I push."*
- *"Add a custom checkout field to WooCommerce."*

The skill's `description` matches your intent and the agent loads it automatically. You can also force one explicitly: *"Use the wp-security-deep skill on `class-rest-controller.php`."*

## Available skills

### `wordpress/`

| Skill | Purpose |
|---|---|
| `wp-security-audit` | Basic security checklist — sanitize, escape, nonce, capability, SQL prepare, AJAX nopriv, REST permission, redirects, path traversal. |
| `wp-security-deep` | Deeper security — object injection, SSRF, CSRF on GET, mass assignment, file include, mail/zip injection, timing comparison, TOCTOU. |
| `wp-security-secrets` | Secrets handling — hardcoded credentials, weak randomness, password storage, cookie flags, log leaks. |
| `wp-i18n-audit` | Translation correctness — text-domain consistency, escaped translation calls, placeholder helpers, translator comments. |
| `wp-rest-api` | Scaffold and review custom REST endpoints — `register_rest_route`, `permission_callback` (the `__return_true` antipattern!), `args` schema, response shaping with `WP_REST_Response` / `WP_Error`, REST vs admin-ajax decision. Suggests graduating to `better-route` for non-trivial multi-route projects. |
| `wp-abilities-api` | The WordPress Abilities API (WP 6.9+) — register machine-readable plugin capabilities with JSON Schema inputs/outputs and a permission callback, automatically exposed over REST and bridgeable to AI agents via the MCP adapter. Up-to-date reference for assistants whose training data predates the API. |
| `wp-presence-api` | **Awareness-only** reference for the experimental Presence API feature plugin (v0.1.x, April 2026 — NOT in core, NOT a stable release). Surfaces the durable architectural pattern (dedicated ephemeral table + TTL + Heartbeat) so AI assistants don't invent `postmeta`-based presence implementations. |
| `wp-html-api` | Safe server-side HTML inspection/mutation with `WP_HTML_Tag_Processor` and `WP_HTML_Processor` — replaces regex/string hacks for tag attributes, classes, text nodes, token serialization, and `data-*` name mapping. |
| `wp-utf8-text` | UTF-8/text encoding handling for imports, exports, XML/JSON/feed boundaries, logs, and external API data — WP 6.9 `wp_is_valid_utf8()`, `wp_scrub_utf8()`, noncharacter checks, and the `seems_utf8()` deprecation. |
| `wp-query-cache` | Query-cache behavior on WP 6.9+ — salted cache helpers for direct query cache access, affected groups (`post-queries`, `term-queries`, `user-queries`, etc.), and when to avoid touching core query caches directly. |

### `plugin-scaffold/`

| Skill | Purpose |
|---|---|
| `wp-plugin-bootstrap` | Main entry-point file — header (with `Requires Plugins` for WP 6.5+), ABSPATH guard, constants, Composer + PSR-4 with manual `spl_autoload_register` fallback, `register_activation_hook` requirements check, Plugin class instantiation on `plugins_loaded`, WP 6.7+ i18n timing rules. |
| `wp-plugin-lifecycle` | Activation / deactivation / `uninstall.php` — `dbDelta` table creation, `add_option` not `update_option` for seeding, `wp_unschedule_hook` for cron cleanup, multisite-aware uninstall via `switch_to_blog` loop, `WP_UNINSTALL_PLUGIN` guard, why `uninstall.php` beats `register_uninstall_hook`, optional `preserve_data_on_uninstall` toggle. |
| `wp-plugin-architecture` | Internal layout of `includes/` — by-type vs by-feature folder structure, PSR-4 one-class-per-file, centralized `Schema` / Constants / PHP enums for repeated strings, singleton scope discipline (Plugin yes, everything else no), conditional asset enqueueing on the right hook, `wp_add_inline_script` over `wp_localize_script`, prefixed custom hook names. |
| `wp-plugin-options-storage` | Picking the right WP storage primitive — options vs user/post/term/comment meta vs transients vs custom tables, the rule that settings group into ONE associative-array option (not 100 scalar options), autoload management on WP 6.6+ (boolean over deprecated `'yes'`/`'no'`), the JSON / serialized-blob trap (no SQL indexing, no aggregation, painful migration), multisite caveat for `*_site_option` / `*_site_transient`. |
| `wp-plugin-cron` | Scheduled / background work — `wp_schedule_event` + custom intervals via `cron_schedules`, idempotent scheduling with `wp_next_scheduled`, the WP-cron-is-pseudo-cron model (page-load triggered, not real-time), `DISABLE_WP_CRON` + system cron alternative, multisite per-blog cron, and Action Scheduler graduation point for queue-style work (10k+ actions, retry, status tracking, idempotency by `unique`). |
| `wp-plugin-hooks` | Designing custom action and filter hooks the plugin EMITS — action vs filter by semantics, prefixed naming with `@since` docblocks, parameter design (order, type stability, 4-arg ceiling), the stability promise, and deprecation via `apply_filters_deprecated` / `do_action_deprecated`. |
| `wp-plugin-rewrite-rules` | Custom URL rewrites and the flush footgun — `add_rewrite_rule` + `query_vars` filter + handler pattern, CPT rewrite slugs, `add_rewrite_endpoint` for permastruct extensions, the hard rule that `flush_rewrite_rules()` runs ONCE on activation/deactivation, NEVER on `init`. Pushes back on the "flush every request" antipattern AI assistants commonly emit. |
| `wp-plugin-assets-loading` | Plugin JS/CSS loading — correct enqueue hooks and screen gating, script args (`strategy`, `in_footer`, WP 6.9 `fetchpriority`), script module args, inline data, and removal of legacy IE conditional style support. |
| `wp-action-scheduler` | Action Scheduler 3.9.x in plugins — async / single / recurring / cron-expression actions, `action_scheduler_init` load timing, hook + args + group naming, `unique` and `priority` parameters, idempotent callbacks, chunked workloads, activation / deactivation cleanup, WooCommerce-bundled vs standalone dependency, admin + WP-CLI debugging, queue runner limits. The graduation point from `wp-plugin-cron` for queue-style work (10k+ actions, retry, status tracking). |

### `jetformbuilder/`

| Skill | Purpose |
|---|---|
| `jfb-settings-tab` | Register a custom tab in the JFB global Settings page (Vue + cx-vui), saved to `wp_options` via JFB's `Base_Handler` API. |
| `jfb-form-sidebar-panel` | Add a per-form settings panel to the JFB Gutenberg form editor sidebar — `register_post_meta` + `useMetaState` + `@wordpress/components`, including the dual-mode pattern when paired with global settings. |
| `jfb-form-action` | Register a custom Form Action (CRM subscribe, send to API, append to sheet) — `Base` action class + `do_action` + `Action_Exception`, action editor via `JetFBActions.addAction`, both field-mapping patterns (dynamic "Add row" and fixed-key) and multi-select via `FormLabeledTokenField`. |
| `jfb-action-messages` | Surface user-facing custom messages from a custom action — both the idiomatic registered-key path (form Messages panel integration) and the action-local pattern (per-action message fields with the `dsuccess\|` dynamic prefix). |
| `jfb-action-events` | Configure WHEN a custom action runs — declare `supported_events` / `unsupported_events` / `get_required_events`, subscribe to `GATEWAY.SUCCESS` / `BAD.REQUEST` / `DEFAULT.REQUIRED`, register a brand-new event class via `'jet-form-builder/event-types'` (e.g. `WEBHOOK.RECEIVED`). |
| `jfb-action-item-decorator` | Wrap every action item in the action editor with custom UI via the `'jet.fb.action.item'` filter — visual True/Always/False button group that mutates the action's `events` array, or any per-action toggle. |
| `jfb-action-external-api` | Read form data from `jet_fb_context()`, replace `%field%` macros in admin templates, call external HTTP APIs via `wp_remote_post`, write the response back into form context, dispatch outcome events — the full action data-flow lifecycle. |

### `woocommerce/`

| Skill | Purpose |
|---|---|
| `wc-shipping-method` | Register a custom shipping method with explicit control over which fields appear in the per-zone settings modal — extend `WC_Shipping_Method`, declare fields in `init_form_fields()` (no `unset` / DOM hacks / CSS hides), use `$supports = array( 'shipping-zones' )` to suppress the modal entirely. Corrects the "this is React, removing fields is hard" misconception — the zone-method modal is Backbone, field list is fully PHP-controlled. |
| `wc-product-search-select` | Build a WooCommerce-style AJAX product picker (`class="wc-product-search"` + `data-action="woocommerce_json_search_products_and_variations"`) — products AND variations through WC's built-in endpoint, server-side pre-render of saved options via `wc_get_product()->get_formatted_name()`, no manual enqueue on WC admin screens (auto-enqueued), explicit enqueue for non-WC pages. Solves the "load all 20k products into a `<select>`" antipattern. |
| `wc-hpos-compatibility` | Make a plugin HPOS-compatible (default-on in WC 10.x) — declare via `FeaturesUtil::declare_compatibility` on `before_woocommerce_init`, replace direct `$wpdb->postmeta` / `WP_Query` order code with `wc_get_orders` + `WC_Order::get_meta`, build admin hook names dynamically via `OrderUtil::get_order_admin_screen`. Solves the "my plugin worked on dev but finds no orders on prod" silent breakage. |
| `wc-variations-data` | Read, query, and write WooCommerce variations correctly — `WC_Product_Variable` (parent) vs `WC_Product_Variation` (child) class split, the `wc_var_prices_<id>` cache, the right programmatic-creation sequence (`set_parent_id` + `set_attributes` + `save` + `wc_delete_product_transients` + `WC_Product_Variable::sync`), the three-level stock model. Solves "I added a variation programmatically and the parent's price range / stock didn't update." |
| `wc-variations-pricing-filters` | Mutate variation prices via filters — pick the right layer (`woocommerce_product_get_price` vs `woocommerce_product_variation_get_price` vs the `woocommerce_variation_prices_*` aggregation family), and CRITICAL: filter `woocommerce_get_variation_prices_hash` whenever your logic depends on context outside the default cache key. Solves both "min/max range doesn't update" and "everyone gets the first user's cached discount" bugs. |
| `wc-shipping-providers` | Register a custom carrier identity for the WC Fulfillments system (WC 10.1+) — extend `AbstractShippingProvider` (4 abstract methods: `get_key` / `get_name` / `get_icon` / `get_tracking_url`), register via `woocommerce_fulfillment_shipping_providers` filter. Distinct from shipping methods — providers are post-purchase tracking-aware carrier identities, NOT checkout-time rate calculators. |
| `wc-rest-api-v4` | Use WooCommerce REST API v4 (namespace `wc/v4`, since WC 10.2) — verified route catalog, hook prefix `woocommerce_rest_api_v4_<route>_*`, when to pick v4 over v3 (DELETE on shipping zones, fulfillments CRUD, segmented settings, ID-sortable customers), and the rule that the v4 `AbstractController` is `Internal\` (NOT a public extension surface — plugin-defined routes still use `WP_REST_Controller`). |
| `wc-payment-gateway` | Register a custom payment gateway — extend `WC_Payment_Gateway`, implement `process_payment` returning `array(result, redirect)`, optional `process_refund`, declare features in `$supports`, register via `woocommerce_payment_gateways`. The `payment_complete` vs `update_status` distinction (canonical paid-order state machine vs status-only flip) and the always-forgotten `WC()->cart->empty_cart()` after success. Webhook receiver via `wc-api`. |
| `wc-emails-classic` | Customize WC transactional emails the classic PHP-template way (NOT block editor) — extend `WC_Email`, register via `woocommerce_email_classes`, hook `trigger()` to `_notification` actions, use `wc_get_template_html` with `template_base`. Plus the theme `woocommerce/emails/<file>.php` override path that doesn't need a class. |
| `wc-coupon-dynamic` | Synthesize WC coupons at runtime via `woocommerce_get_shop_coupon_data` — no `shop_coupon` posts needed. The hidden virtual-coupon mechanism for rule-driven codes (LOYALTY-{ID}, partner CRM, auto-apply discounts), custom discount types, and the validation triple `woocommerce_coupon_is_valid_*`. The single most AI-deficient WC topic. |
| `wc-customer-and-sessions` | Use WC's session and customer APIs — `WC()->session` (cookie + `wp_woocommerce_sessions` table) for visitor data, `WC()->customer` for the active customer context including guests, `new WC_Customer($user_id)` for one-off loads. Replaces the broken `$_SESSION` / `setcookie` / user_meta-for-guests patterns AI defaults to. |
| `wcs-subscription-hooks` | Curated WooCommerce Subscriptions hook map — choose the right action/filter for subscription creation, status transitions, date changes, renewal orders, scheduled payments, payment retries, gateway events, switching, gifting, related orders, REST/API responses, and account/admin UI. Solves the "hook ordinary order status or raw AS/meta" mistake. |
| `wcs-renewal-scheduler` | WooCommerce Subscriptions renewal timing and scheduler playbook — safely change `next_payment`/trial/end dates with `WC_Subscription::update_dates()`, understand `woocommerce_scheduled_subscription_payment`, renewal order creation, gateway charge hooks, retry rules, and when to use success/failure hooks instead of scheduled-payment time. |
| `wcm-membership-hooks` | Curated WooCommerce Memberships hook map — user membership creation/saves/status transitions, purchase/free-signup grants, profile fields, REST API, webhooks, members-area templates, CSV/admin hooks, and Subscriptions-linked memberships. Solves the "membership is just post/meta" mistake. |
| `wcm-access-discounts` | WooCommerce Memberships access and discount playbook — use `wc_memberships_user_can()` for target access, alter restriction/drip rules at the right hook layer, map products that grant access, and avoid double-discount/recursion bugs around member prices. |

### `better-data/`

Contributor skills for the [better-data](https://github.com/lonsdale201/better-data) PHP library — DTO + Presenter for WordPress 8.3+. Use these when adding to the library itself, not when consuming it from a plugin.

| Skill | Purpose |
|---|---|
| `bd-data-object` | Add or modify a `DataObject` subclass — `final readonly class extends DataObject`, the trailing-default-cascade rule (every constructor parameter needs a default or be nullable, otherwise PHP Reflection demotes earlier defaults to required and `MissingRequiredFieldException` fires), `?Secret = null` over `new Secret('')`, `#[Encrypted]` requires the `Secret` type, mutate via `->with([...])` not setters. |
| `bd-attribute` | Add a new declarative attribute under `src/Attribute/` — pure data carrier (`final readonly class` with promoted public properties, `TARGET_PARAMETER \| TARGET_PROPERTY`), and the partial-wiring trap — read AND write side, schema, and Presenter all need to know about it in one PR. |
| `bd-validation-rule` | Add a new validation rule under `src/Validation/Rule/` — implement `Rule` (NOT `RuleInterface`), `check()` returns `?string` (null pass / short-string fail; never throw), null is "skip" except in `Required`, surface in `RestSchemaBuilder::applyRuleAttribute` when there's a JSON Schema equivalent. |
| `bd-source-adapter` | Add a new source adapter under `src/Source/` — `hydrate(int\|object, $dtoClass)` + `hydrateMany(list<int>, $dtoClass)`, the meta fetcher closure MUST return null for missing (use `metadata_exists`) and the stored value otherwise, prewarm caches with `_prime_*_caches` + `update_meta_cache` in bulk. |
| `bd-sink` | Add a new sink under `src/Sink/` — two-mode contract (projection raw, convenience slashes), null = delete in meta, `#[Encrypted]` symmetric encrypt-on-write / decrypt-on-read, project nested DTOs through `SinkProjection::prepareValue`, `MissingIdentifierException` on update without ID. |
| `bd-presenter` | Extend the Presenter — fluent methods mutate `$this` and return `$this` (mutable builder pattern; the wrapped DTO stays readonly), mirror per-call methods on `CollectionPresenter` as recorded configurer closures, never bypass `sensitiveFieldNames()` redaction, wrap localized text in `LocaleScope::runIn($ctx->locale, fn () => ...)`. |
| `bd-hydration-coercion` | Modify hydration / coercion — `TypeCoercer` stays pure (no WP function calls, no globals), attribute-aware coercion lives ABOVE TypeCoercer in `DataObject::coerceParameter`, use the explicit helpers (`toString`, `toInt`, …) and throw `TypeCoercionException` on surprising input, idempotent read-side transforms. |
| `bd-security` | Apply the security discipline when touching `Secret` / `EncryptionEngine` / `#[Encrypted]` / `#[Sensitive]` / `RequestSource` guards — loud-over-silent (every degradation throws), symmetric end-to-end (encrypt requires decrypt), never cache the encryption key (defeats rotation via `BETTER_DATA_ENCRYPTION_KEY_PREVIOUS`), `hash_equals` for any secret comparison, no debug-mode plaintext logs, threat model in PR description. |
| `bd-better-route-bridge` | Compose better-data DTOs with the better-route library — `BetterRouteBridge::{get, post, put, patch, delete}` registers a route that hydrates → validates → handler → presents. Method-name duck typing keeps better-route a soft dep. `routeFields` for URL-owned fields with `RequestParamCollisionException` guard. Permission and middleware stay route-owned. |
| `bd-companion-plugin` | Work on `better-data-plugin-test` — three test tiers (Smoke = regression with zero-FAIL gate, Stress = integration with OK/FAIL/NOTE findings, Admin pages = visual confirmation), Widget Shop fixture is canonical, no deps beyond better-data + WP, CLI driving surface (`wp better-data {smoke, stress, seed, purge, inventory}`). |

### `better-route/`

Skills for consumers of the [better-route](https://github.com/Lonsdale201/better-route) PHP library — fluent REST router for WordPress, PHP 8.1+, v0.4.0+. Use these when building / migrating / extending an API on top of better-route.

| Skill | Purpose |
|---|---|
| `br-install-and-migrate` | Install (Composer VCS repo, NOT yet on Packagist) + v0.4.0 migration — write methods (POST/PUT/PATCH/DELETE) now deny by default; declare intent via `->permission()`, `->protectedByMiddleware()`, or `->publicRoute()`. Plus the v0.3.0 breaking changes that still apply on older upgrades (custom-table policy required, JWT `exp` required, identity-aware default keys, OpenAPI doc admin-only). |
| `br-routes` | Custom REST routes via fluent Router — `BetterRoute::router('vendor', 'v1')` with `->get/post/put/patch/delete` returning a RouteBuilder. The v0.4.0 deny-by-default rule for write methods, route grouping with shared middleware, URL-param-wins-over-body-param resolution, X-Request-ID validation regex `^[A-Za-z0-9._:-]{1,128}$`. |
| `br-resource-cpt` | CPT-backed CRUD resources via `Resource::make('books')->sourceCpt('book')` — auto-generates list/get/create/update/delete routes. Source-verified note — visibility method is `->cptVisibleStatuses(...)` (NOT `->allowedStatuses(...)` as some docs show), `writeSchema`/`payloadSchema` aliases, `deleteMode` is `'force'` or `'trash'`. |
| `br-resource-table` | Custom-table-backed CRUD via `Resource::make->sourceTable($wpdb->prefix . 'audit_events')` — REQUIRES `->fields([...])` (throws if empty) AND `->policy(...)` (deny-by-default for ALL actions including reads, unlike CPT sources). Cross-database table names containing `.` are rejected. |
| `br-write-schema` | Resource payload validation via `->writeSchema([...])` — type / required / nullable / min / max / minLength / maxLength / regex / values / sanitize. Source-verified — enum shape is FLAT `{type: 'enum', values: [...]}`, NOT nested `{type: 'enum', enum: {values: [...]}}` as some docs show. Failures return `400 validation_failed` with `details.fieldErrors`. |
| `br-resource-policy` | Permission policies on resources — four `ResourcePolicy` presets (`publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks`) and per-field write authorization via `->fieldPolicy([...])`. Important — `fieldPolicy` strips denied fields silently; combine with explicit error-throwing in `writeSchema` sanitize callable if consumers need feedback. |
| `br-auth-middleware` | JWT (Hs256JwtVerifier with v0.3.0 `exp`-required default), custom bearer tokens (BearerTokenAuthMiddleware), WP application passwords, cookie + nonce. WpClaimsUserMapper no longer maps `sub` by default — re-add explicitly if your tokens use it. Middleware order matters — auth before rate-limit / idempotency. |
| `br-etag-cache` | HTTP ETag caching for GET/HEAD endpoints via ETagMiddleware — `sha1(json_encode($body))` by default, custom `etagResolver` for cheap hashing on large bodies, `weak: true` for W/-prefixed validators. Skips non-2xx-non-204; combine with `Cache-Control` for unconditional caching. |
| `br-rate-limiting` | Throttling via RateLimitMiddleware with WpObjectCacheRateLimiter (preferred, throws if no persistent object cache) or TransientRateLimiter (fallback). v0.3.0 default key is identity-aware. ClientIpResolver requires REMOTE_ADDR to be in `trustedProxies` before reading X-Forwarded-For (otherwise IP spoofing is trivial). |
| `br-idempotency` | Duplicate-write protection via IdempotencyMiddleware + `Idempotency-Key` header. Production needs WpdbIdempotencyStore (call `installSchema()` on plugin activation). Cross-database table names rejected. v0.3.0 default key is identity-aware. `requireKey: true` rejects requests without the header (400 idempotency_key_required). |
| `br-openapi` | OpenAPI 3.1.0 export via `BetterRoute::openApiExporter()->export(...)` OR live publishing via `OpenApiRouteRegistrar::register(...)`. v0.3.0 default permission for the registrar is `manage_options`; pass `permissionCallback` to override. `strictSchemas: true` throws on unknown `$ref`; default `false` substitutes a forgiving `{type: object, additionalProperties: true}`. |
| `br-woo-routes` | WooCommerce data over REST via `BetterRoute::wooRouteRegistrar()->register(...)` — generates orders/products/customers/coupons CRUD. v0.3.0 customer endpoints filter to `customer` role only; writes need `create_users`/`edit_user`/`delete_user` on top of registrar permissions. Meta keys with `_` prefix stripped by default. |
| `br-error-contract` | The standard error envelope `{error: {code, message, requestId, details}}` — throw `ApiException(message, status, errorCode, details)` for caller-controlled errors. v0.3.0 normalization scrubs `message` to "Unexpected error." and empties `details` for status >= 500 from non-ApiException; status === 400 preserves `details.exception` as developer aid. Common codes — `validation_failed`, `idempotency_key_required`, `invalid_token`, `not_found`, `rate_limited`, `hpos_required`. |

### `lw-plugins/`

Skills covering the LW Plugins family (LW LMS, LW Site Manager). Use these when extending or building on top of these plugins.

| Skill | Purpose |
|---|---|
| `lw-lms-backend-extend` | Backend extension contract for `lwplugins/lw-lms` (BETA — README explicitly says "not recommended for production use"). Headless LMS — courses / lessons / sections / progress / access control. Three verified custom actions (`lw_lms_attachment_downloaded`, `lw_lms_lesson_completed`, `lw_lms_course_completed`) and two access-override filters (`lw_lms_has_course_access`, `lw_lms_has_lesson_access`). 11 custom capabilities, three DB tables, optional Site Manager integration. |
| `lw-lms-frontend-build` | Build a frontend on top of `lwplugins/lw-lms` (also BETA). The plugin is intentionally HEADLESS — no shipped templates, shortcodes, or blocks; only a REST API at `/wp-json/lms/v1`. Six endpoints (public list/single, auth+access lessons / progress GET+POST / per-course progress / download). Single-course response includes content ONLY when `access.has_access === true`. |
| `lw-site-manager-overview` | Reference for `lwplugins/lw-site-manager` — a WP 6.9+ Abilities-API-native exposure layer that registers 120+ machine-callable abilities under `site-manager/*` for AI agents (Claude, ChatGPT, MCP clients) to discover and invoke. Calling pattern via `/wp-json/wp-abilities/v1/abilities/{namespace}/{ability}/run` with Application Password Basic auth. **Not** MainWP — different surface and security model (per-ability cap-checks). |
| `lw-site-manager-extend-abilities` | Add custom abilities to LW Site Manager via two action hooks (`lw_site_manager_register_categories`, `lw_site_manager_register_abilities` — second receives the central `PermissionManager` instance). Critical pattern — extend `AbstractAbilitiesRegistrar` to inherit the meta builders (`readOnlyMeta` / `writeMeta` / `destructiveMeta`) and schema builders (`paginationSchema` / `orderingSchema` / `idSchema` / `listOutputSchema` / etc.). |

### `wp-rocket/`

Integration skills for [WP Rocket](https://wp-rocket.me) (paid third-party caching plugin, not on Packagist). Use when your plugin / theme needs to play nicely with WP Rocket on installs that have it.

| Skill | Purpose |
|---|---|
| `wp-rocket-cache-invalidation` | Programmatically clear WP Rocket cache from a third-party plugin / theme — the `rocket_clean_*` function family (`rocket_clean_post`, `rocket_clean_files`, `rocket_clean_term`, `rocket_clean_user`, `rocket_clean_home`, `rocket_clean_minify`, `rocket_clean_cache_busting`, `rocket_clean_domain`, `rocket_clean_cache_dir`). Detection rule — feature-detect via `function_exists('rocket_clean_post')` OR `defined('WP_ROCKET_VERSION')` since not every site has it. Don't raw-unlink the cache dir; `wp_cache_flush()` is the WP object cache (unrelated). |
| `wp-rocket-cache-rejection-and-filters` | Customize WP Rocket behavior via filter hooks — exclude URIs / cookies / user agents / REST API namespaces from caching, configure CDN URL rewrites, extend lazy load, override capability requirements, hook into Action Scheduler integration. `rocket_cache_reject_uri` takes URI patterns (regex-like), NOT full URLs. The `rocket_buffer` filter is the FULL HTML output filter — extremely powerful but dangerous (one fatal in the callback breaks every cached page until WP Rocket is disabled). |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for naming rules, the required frontmatter shape, the writing checklist, and the PR process.

There's a starter template at [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md).

## License

All skills in this repository are released under the MIT License unless a specific skill's folder declares otherwise. See [LICENSE](LICENSE).

This is a non-commercial community project. Skills are documentation, not executable software — but they shape what AI does in your codebase, so quality and clarity matter.
