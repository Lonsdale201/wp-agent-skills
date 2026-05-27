# Changelog

This collection is continuously evolving — entries are date-based, not version-tagged. New skills land when they're ready; updates go in when they cover real ground (a new release of an upstream plugin, a verified misconception, a corrected example).

## 2026-05-27

### WooCommerce 10.8 batch

Five new WooCommerce core skills covering the order / cart / checkout / saved-cards / background-jobs surfaces that were missing from the domain, plus an eight-skill refresh of the existing WC skills against the WooCommerce 10.8.0 release. All new and updated skills are `plugin-version-tested: "10.8.0"`.

### New skills

- **`woocommerce/wc-order-lifecycle-and-items`** — Work safely with WooCommerce order statuses, payment completion, status hooks, order items, line-item meta, totals, and stock side effects. Covers `payment_complete()` vs `update_status()`, `woocommerce_order_status_*` hook ordering and args, `woocommerce_order_status_changed`, `woocommerce_order_payment_status_changed`, `WC_Order_Item_Product`, `add_item()`, `calculate_totals()`, stock reduction/restoration hooks, HPOS-safe CRUD, and why not to instantiate the base `WC_Order_Item`. The "my paid order skipped its lifecycle side effects" and order-item-meta-confusion skill.
- **`woocommerce/wc-cart-checkout-classic`** — Customize the classic (shortcode) WooCommerce cart and checkout with `woocommerce_add_cart_item_data`, `woocommerce_get_item_data`, `woocommerce_before_calculate_totals`, `woocommerce_cart_calculate_fees`, `woocommerce_checkout_fields`, `woocommerce_after_checkout_validation`, `woocommerce_checkout_update_order_meta`, and `woocommerce_checkout_create_order_line_item`. Covers cart-key merging, absolute price mutation, fees, classic checkout fields, order-line meta vs order meta, HPOS-safe order saves, and the Checkout Block / Store API boundary. Solves missing / duplicated cart and order-item data.
- **`woocommerce/wc-store-api`** — Build against the WooCommerce Store API (`/wp-json/wc/store/v1`) for shopper-facing products / cart / checkout, the Cart & Checkout Blocks, and headless carts. Covers route choice, the Nonce header (`wp_create_nonce('wc_store_api')`) vs Cart-Token, Store API sessions / CORS / rate limits, `woocommerce_store_api_register_endpoint_data`, `/cart/extensions` + `extensionCartUpdate`, payment requirements, the `related` product-query pitfall, and when to use WC REST `wc/v4` instead. The Store-API-vs-REST boundary skill for block and headless work.
- **`woocommerce/wc-payment-tokens`** — Store and use WooCommerce saved payment methods through `WC_Payment_Tokens` and `WC_Payment_Token_CC` safely. Covers provider token vs raw card data, tokenization gateway support, creating / updating / deleting / defaulting tokens, My Account nonce and ownership checks, `get_customer_tokens` / `get_customer_default_token` / `get_order_tokens`, attaching tokens to orders, gateway ID filtering, custom token tables, hooks, HPOS-safe order use, and checkout saved-token validation. The data layer behind saved cards and add-payment-method flows (pairs with `wc-stripe-add-payment-method`).
- **`woocommerce/wc-action-scheduler-jobs`** — Queue and run WooCommerce background jobs with Action Scheduler. Covers `as_enqueue_async_action`, `as_schedule_single_action`, `as_schedule_recurring_action`, `as_schedule_cron_action`, `as_has_scheduled_action`, `as_next_scheduled_action`, `as_unschedule_action`, `as_unschedule_all_actions`, groups, scalar args, the WP-CLI runner, activation / deactivation scheduling, batching, idempotency, and the important WC 10.8 DB-store gotcha that `$unique` prevents another pending / running action with the same hook and group — NOT one per argument set. Use when moving slow order / product / customer work out of requests or status hooks.

### Updated skills (WooCommerce 10.8.0)

- **`woocommerce/wc-rest-api-v4`** — route catalog re-verified against WC 10.8 source; scope line extended from "expanded through 10.7" to "through 10.8" with stricter 10.8 order/product response behavior. New "WC 10.8 behavior changes" section: `status=any` order listings now **exclude `checkout-draft`** (aligned with `exclude_from_search` statuses) — request `status=checkout-draft` explicitly to audit draft checkout orders.
- **`woocommerce/wc-payment-gateway`** — WC 10.8 reverted the checkout-evidence validation that had briefly been added inside `WC_Order::payment_complete()`; skill now states explicitly that this does **not** make `payment_complete()` a security boundary (gateways still verify provider signatures, transaction IDs, amounts, currencies, and order ownership). Notes the new `Skeleton` component exposed through the Checkout Blocks payment-method `components` prop for block-gateway loading states (JS affordance; PHP contract unchanged).
- **`woocommerce/wc-hpos-compatibility`** — new "WC 10.8 HPOS changes worth knowing" section. The plugin-author contract is unchanged, but internals shifted enough that direct-table assumptions are even riskier: the `wp_wc_orders_meta` `meta_key_value` index was reshaped during the cycle and restored to `(meta_key(50), meta_value(20))` by the `wc_update_10802_restore_orders_meta_key_value_index` migration after a performance regression.
- **`woocommerce/wc-emails-classic`** — new "WC 10.8 email additions" section documenting two template-level filters added to `templates/emails/email-order-details.php` (order-summary heading / order-number visibility); guidance to use them before overriding the whole template for those small tweaks.
- **`woocommerce/wc-product-search-select`** — new "Visibility and capability note (WC 10.8)": the AJAX handler filters candidates through `wc_products_array_filter_readable()`, and WC 10.8 fixed hidden-product search visibility — don't assume hidden/private products appear for every admin-like request. The pre-rendered `<option selected>` loop is what preserves a saved hidden product's label.
- **`woocommerce/wc-shipping-providers`** — new "WC 10.8 REST note": the v4 Fulfillments surface is flat (`/wc/v4/fulfillments?order_id=<id>`, `/wc/v4/fulfillments/<id>`, `/wc/v4/fulfillments/providers`), not nested under `/orders/<id>/...`; WC 10.8 tightened unauthenticated access to guest order fulfillments — require explicit ownership checks before exposing them to customer-facing code. Provider count phrasing bumped to "WC 10.8 ships ~70 built-in providers".
- **`woocommerce/wc-customer-and-sessions`**, **`woocommerce/wc-shipping-method`** — `plugin-version-tested` bumped to `10.8.0` and `last-updated` refreshed; content re-verified against the 10.8 surface.

### Repo / docs

- `woocommerce/README.md` — "WooCommerce core" table grew by 5 rows (`wc-order-lifecycle-and-items`, `wc-cart-checkout-classic`, `wc-store-api`, `wc-payment-tokens`, `wc-action-scheduler-jobs`).

## 2026-05-25

### New skills

- **`wordpress/wp-admin-notices`** — Render WordPress admin notices via the four core hooks (`admin_notices`, `network_admin_notices`, `user_admin_notices`, `all_admin_notices`) and the WP 6.4+ `wp_admin_notice()` / `wp_get_admin_notice()` helpers. Covers the four severity classes (`notice-error/-warning/-info/-success`), `is-dismissible`, per-user persisted dismissal via `user_meta` + REST endpoint, screen targeting via `get_current_screen()`, transient-backed flash notices after `wp_safe_redirect()`, and the `wp_admin_notice_args` / `wp_admin_notice_markup` filters. Pairs naturally with the `wp-admin-settings-api` skill (settings save → flash notice on redirect).
- **`wordpress/wp-cli-extending`** — Add custom WP-CLI commands to a plugin via `WP_CLI::add_command( $name, $callable, $args )`. Class-based command pattern with PHPDoc-driven synopsis, positional vs `--flag` args, the I/O helpers (`WP_CLI::success` / `log` / `warning` / `error` / `confirm` / `debug`), formatted output via `WP_CLI\Utils\format_items()` + `--format=table|csv|json|yaml|count`, progress bars with `WP_CLI\Utils\make_progress_bar()`, `WP_CLI::runcommand()` for invoking other commands, the lifecycle hook system (`before_wp_load`, `before_invoke:<cmd>`, `after_invoke:<cmd>`), and the canonical `defined( 'WP_CLI' ) && WP_CLI` registration guard. Tested against WP-CLI 2.10–2.11 / WP 6.0–7.0.
- **`wordpress/wp-filesystem-api`** — Read, write, copy, delete, chmod files from a plugin via the `WP_Filesystem` abstraction instead of bare PHP (`fopen` / `file_put_contents` / `unlink`). Covers the full bootstrap (`require_once ABSPATH . 'wp-admin/includes/file.php'` → `request_filesystem_credentials()` → `WP_Filesystem()` → `$wp_filesystem->*` methods), the four transports (direct / ssh2 / ftpext / ftpsockets) selected by `get_filesystem_method()`, the `FS_METHOD` / `FS_CHMOD_FILE` / `FS_CHMOD_DIR` constants, the credentials form flow, and when to fall back to `wp_handle_upload()` / `wp_upload_dir()` instead. The hard requirement to use this on shared hosts where PHP cannot directly write files outside its own ownership.
- **`wordpress/wp-locale-and-dates`** — Handle dates, times, and numbers in plugins with the modern (WP 5.3+) locale-aware helpers — `wp_date()`, `current_datetime()`, `wp_timezone()`, `get_gmt_from_date()` / `get_date_from_gmt()`, `mysql_to_rfc3339()`, `number_format_i18n()` — and document the legacy foot-guns to avoid: `current_time('timestamp')` returns an offset-summed *not-quite-Unix* integer (looks like a timestamp, isn't), `date_i18n()` has timezone-handling quirks that bit half the ecosystem before 5.3, and `mysql_to_rfc3339()` doesn't actually produce strict RFC 3339 (no timezone suffix). Covers `timezone_string` vs `gmt_offset` fallback, the storing site-local + UTC MySQL columns pattern, REST date emission, and locale-aware number formatting.

### Updated skills

- **`wordpress/wp-admin-settings-api`** — Failure-mode clarification in the "Three identifiers" section: previously the skill said "if slugs drift, nothing renders and saves silently fail" — actually two distinct failure modes from the same bug. Render side: `do_settings_sections()` finds no matching `$page`, silently outputs nothing. Save side: `options.php` (verified line 249) calls `wp_die()` with the exact message *"Error: The `<group>` options page is not in the allowed options list"* — the form post is dropped BEFORE any `sanitize_callback` runs. Critical-rules entry updated to match (replaced the misleading `Cheatin&#8217; uh?` reference, which was the pre-WP-4.7 wording, with the current `wp_die()` message). `reference.md` tabbed-page example: split combined `isset()` check so `sanitize_key()` runs on `wp_unslash()`-ed value BEFORE the tab allowlist check — the previous form sanitized only when `$tabs[ $_GET['tab'] ]` already existed, leaving the lookup itself reading unslashed magic-quoted input on hosts where magic quotes haven't been stripped yet.

### Repo / docs

- `wordpress/README.md` — skill table grew by 4 rows (`wp-admin-notices` appended to the admin UI cluster; `wp-cli-extending`, `wp-filesystem-api`, `wp-locale-and-dates` follow as standalone infrastructure / locale skills).

## 2026-05-24

### WordPress 7.0 AI Client skill

The `wp-ai-client` cross-reference placed in the 2026-05-21 batch (from `wp-abilities-api` and `wp-connectors-api`) is now backed by a real skill. Completes the WP 7.0 trio: Abilities API (machine-readable capabilities), Connectors API (external-service credentials), AI Client (provider-agnostic generation).

### New skills

- **`wordpress/wp-ai-client`** — WordPress 7.0 WP AI Client. Provider-agnostic text / image / speech / video / JSON / ability-powered generation. Covers the `wp_ai_client_prompt()` builder entry point, `WP_AI_Client_Prompt_Builder` fluent chain, `wp_supports_ai()` / `is_supported_*` capability gating, `using_model_preference()` modality + feature requirements (chat / image / speech / video / structured-output / system-instruction / function-calling / tool-use), the `generate_*` / `generate_*_result` method pairs, `WP_Error` handling at every step, ability-powered prompts via `->using_abilities( 'core/get-site-info', … )` and the `WP_AI_Client_Ability_Function_Resolver` allowlist (the FIRST boundary — the ability's `permission_callback` still runs after), connector-backed provider configuration (the Connectors API is where API keys live), and prompt prevention filters for safe feature gating.

### Admin UI cluster (7 skills)

Native WordPress admin UI patterns that plugins consistently reimplement from scratch (custom drag-and-drop libraries, ad-hoc settings forms, hand-rolled media pickers) instead of using core's bundled surface. This cluster surfaces the WP-native flow for each, with the non-obvious gotchas — the parts AI assistants tend to invent wrong defaults for. All seven verified against WP 6.0 – 7.0, PHP 7.4+.

- **`wordpress/wp-admin-settings-api`** — Build plugin settings pages with the Settings API instead of custom form handlers. Covers `register_setting()`, `add_settings_section()`, `add_settings_field()`, `settings_fields()`, `do_settings_sections()`, `add_settings_error()`, `settings_errors()`, `admin_init` registration, `<form method="post" action="options.php">`, `sanitize_callback`, the `$option_group` vs `$page` distinction, single-array option storage (one row in `wp_options` per plugin), tabbed pages, `show_in_rest` schemas, custom option capabilities via `option_page_capability_{$option_group}`, and the canonical mistake of POSTing to your own handler instead of `options.php`.
- **`wordpress/wp-admin-list-table`** — Build admin record tables by extending `WP_List_Table`. Required `require_once`, constructor `singular` / `plural` / `ajax` args, `prepare_items()`, `get_columns()`, `column_cb()`, `column_default()`, `get_sortable_columns()`, `get_bulk_actions()`, `process_bulk_action()`, `extra_tablenav()`, pagination via `set_pagination_args()`, row actions, search, views, Screen Options per-page settings, sortable `orderby` / `order`, AND the plugin CSRF gap — `check_admin_referer( 'bulk-' . $this->_args['plural'] )` MUST run before acting on `current_action()` (core's own list tables enforce this; plugin subclasses constantly forget).
- **`wordpress/wp-admin-form-controls`** — Core admin form-control widgets: `wp-color-picker`, `jquery-ui-datepicker`, `jquery-ui-autocomplete`, `wp-pointer`. Correct script/style enqueues (datepicker's missing CSS is the #1 trap), `wpColorPicker` change / clear callbacks, datepicker `yy-mm-dd` formatting paired with strict server-side sanitization (the picker's format is display-only), autocomplete `source` shapes with `response()` for AJAX, core user/tag suggest, and `wp-pointer` dismissal through the `dismiss-wp-pointer` AJAX action.
- **`wordpress/wp-admin-media-frame`** — Open the standard Media Library picker from plugin admin. Screen-gated `wp_enqueue_media()`, the `media-editor` dependency, `wp.media( { frame, title, button, library, multiple } )` config, `library` filters (`type` / MIME / `uploadedTo` / `author`), `multiple: true` vs `multiple: 'add'`, `select` and `open` events, reading attachments via `frame.state().get('selection').first().toJSON()`, attachment `sizes`, frame caching, pre-selecting existing attachments, and the canonical rule — save attachment IDs (not URLs) in options/meta.
- **`wordpress/wp-admin-codemirror`** — Embed WP's bundled CodeMirror in admin via `wp_enqueue_code_editor()` + `wp.codeEditor.initialize()`. MIME / file mode selection for CSS / JS / JSON / HTML / PHP / SQL / Markdown / YAML; the **critical `false` return** when the user disabled syntax highlighting in their profile (causes silent breakage if you blindly init); passing settings to JS; the bare textarea ID requirement for `initialize( 'mytextarea', settings )`; reading values with `instance.codemirror.getValue()`; the `wp_code_editor_settings` filter for global defaults; linter handles (`csslint`, `htmlhint`, `htmlhint-kses`, `jsonlint`) WP auto-enqueues per MIME; and the `.refresh()` call required after un-hiding a tabbed / accordion editor.
- **`wordpress/wp-admin-drag-and-drop`** — Build admin drag-and-drop UI with core's bundled jQuery UI Sortable / Draggable / Droppable, optional `jquery-touch-punch` for mobile, `wp-api-fetch` for REST persistence, and `wp-a11y.speak()` for screen-reader announcements. Flat reorder lists, connected lists / kanban columns, palette-to-dropzone clones, hierarchical tree indentation, REST order persistence, and the keyboard reorder controls accessibility audits will flag the absence of. The "use core, don't bundle Sortable.js / dnd-kit / react-dnd" guidance — they're already loaded.
- **`wordpress/wp-admin-postbox-sortable`** — Wire up WordPress postboxes on custom plugin admin pages with collapse, drag sorting, Screen Options visibility, and core persistence. `add_meta_box()`, `do_meta_boxes()`, the `postbox` script, `postboxes.add_postbox_toggles( pageId )`, the `.meta-box-sortables` / `.postbox` / `.hndle` DOM contract, AND the two nonce fields plugins forget — `closedpostboxesnonce` and `meta-box-order-nonce` — without which core's collapse/order persistence silently no-ops. Guidance to use raw `jquery-ui-sortable` (the `wp-admin-drag-and-drop` skill) for non-postbox repeater rows.

### Updated skills

- **`wordpress/wp-html-api`**, **`wordpress/wp-query-cache`**, **`wordpress/wp-utf8-text`** — references section: dropped the bogus `[filename](filename)` markdown links on `wp-includes/...` paths (the links resolved relative to the skill folder, not to a real WP source tree) in favour of plain `code` spans. No content change; cosmetic / correctness fix only.

### Repo / docs

- `wordpress/README.md` — skill table grew by 8 rows (added `wp-ai-client` after `wp-connectors-api`, then a 7-row admin UI cluster after `wp-query-cache`).

## 2026-05-21

### lw-lms skill split (all verified for lw-lms 1.3.0)

The single `lw-lms-frontend-build` skill was retired in favour of three more narrowly-scoped sibling skills, so consumers / agents pick up only the surface they need (REST consumer, Abilities surface, or one-time LearnDash migration) instead of the whole bundle. `lw-lms-backend-extend` keeps its role as the backend extension hub and now routes the three new topics out.

### New skills

- **`lw-plugins/lw-lms-rest-frontend`** — Build a custom frontend against the headless `/wp-json/lms/v1` REST API. Replaces and supersedes the retired `lw-lms-frontend-build` skill. Covers the public list/single course endpoints, the auth+access-gated lessons / progress (GET+POST) / per-course progress / download endpoints, the conditional `content` field (present only when `access.has_access === true`), and paid-course `access` carrying `products` + `subscriptions` + `subscription_variations` (variation-level WC subscription upsells since 1.2.15). Nonce / Application Password auth patterns and the `_embed` rule for `featured_media`.
- **`lw-plugins/lw-lms-abilities`** — Consumer / reviewer reference for the built-in `lw-lms/*` Abilities API surface registered by the plugin itself: `list-courses`, `get-course`, `get-progress`, `set-progress`, `get-options`. Documents the dual registration model (Site Manager bridge when present, standalone WP 6.9+ Abilities API fallback at `wp_abilities_api_init` priority 20, `did_action()` guards prevent double-registration). Calling pattern uses `/wp-json/wp-abilities/v1/abilities/lw-lms/.../run` with arguments wrapped in `input`. Output schemas per ability since v1.2.16, including `total_pages` / `page` / `per_page` on `list-courses`. Critical — feature-detect with `function_exists('wp_register_ability')`, not by checking for Site Manager.
- **`lw-plugins/lw-lms-learndash-migration`** — Plan, run, or review the one-time WP-CLI LearnDash → LW LMS migration (`wp lw-lms migrate-learndash --dry-run --verbose`). Maps `sfwd-courses` / `sfwd-lessons` into `course` / `lesson` posts, writes `_lw_lms_migrated_to` reverse mappings on source posts, builds one generated section per course from `ld_course_steps`, extracts LearnDash / Elementor / embed video URLs into `_lw_lms_video`. Rerunnable (skip-if-exists by title, refresh mapping) but explicitly NOT a synchronization tool — does not migrate quizzes, certificates, groups, assignments, user progress, enrollments, or drip rules.

### Retired skills

- **`lw-plugins/lw-lms-frontend-build`** — folded into `lw-lms-rest-frontend` (broader scope: now covers all consumer-side REST topics including download endpoints and access shape, not just "build a frontend").

### Updated skills

- **`lw-plugins/lw-lms-backend-extend`** — frontmatter `description` tightened (extension-contract focus, routes abilities / frontend / migration topics out to the new sibling skills instead of trying to summarize them). Fixed `source-refs:` paths — drop the leading `lw-lms-main/` directory prefix (was a leftover from the upstream `main`-branch zip layout, never matched real installs). Cross-references rewritten to point at the new sibling skills (`lw-lms-rest-frontend`, `lw-lms-abilities`, `lw-lms-learndash-migration`). `last-updated: 2026-05-21`.

### Repo / docs

- `lw-plugins/README.md` skill table grew from 4 rows to 6 (added `lw-lms-rest-frontend`, `lw-lms-abilities`, `lw-lms-learndash-migration`; removed `lw-lms-frontend-build`).

### WordPress 7.0 readiness

WordPress 7.0 is landing with three surfaces that change what plugins should be doing in JS asset registration, Abilities, and external-service connection metadata. Two existing skills (`wp-abilities-api`, `wp-plugin-assets-loading`) updated against the 7.0 field guide + dev notes; one new skill (`wp-connectors-api`) added for the new Connectors API. Cross-references to a future `wp-ai-client` skill are placed but the skill itself is not in this batch.

### New skills

- **`wordpress/wp-connectors-api`** — WordPress 7.0 Connectors API. The registry for external-service connection metadata that powers the new Settings > Connectors screen and AI provider credentials for the WP AI Client. Covers the public lookup API (`wp_get_connector`, `wp_get_connectors`, `wp_is_connector_registered`), registration on the `wp_connectors_init` action with a `WP_Connector_Registry` instance, required vs optional shape fields (`name` / `type` / `authentication.method` required; `description` / `logo_url` / `credentials_url` / `setting_name` / `constant_name` / `env_var_name` / `plugin.file` / `plugin.is_active` optional), `api_key` vs `none` auth, the env > constant > database option priority for API keys, the `connectors_{$type}_{$id}_api_key` default `setting_name` generator, the masked-but-not-encrypted DB key reality (prefer env / constant for production), default AI connector metadata (`anthropic`, `google`, `openai`) plus `akismet`, WP AI Client registry auto-discovery for AI providers (do NOT duplicate-register them), the canonical unregister-modify-register override pattern, and the rule against building public plugin contracts on the still-experimental `@wordpress/connectors` script module.

### Updated skills

- **`wordpress/wp-abilities-api`** — bumped tested-version to **WP 6.9 – 7.0**. New WP 7.0 client-side surface: `@wordpress/abilities` (client-only registry) and `@wordpress/core-abilities` (bridge that fetches server-registered abilities over REST and exposes them via the same client API). Documents the `wp_enqueue_script_module( '@wordpress/core-abilities' )` enqueue, the `await ready` pattern, the `registerAbilityCategory` → `registerAbility` order (categories must exist first), and `executeAbility()` input/output schema validation. New WP AI Client integration section — `wp_ai_client_prompt()->using_abilities( 'core/get-site-info', … )` and the `WP_AI_Client_Ability_Function_Resolver` allowlist contract (the ability's `permission_callback` still runs; the resolver allowlist is the FIRST boundary). New REST surface: `/wp-json/wp-abilities/v1/categories` list + single endpoints. WP 7.0 REST cleanup strips `sanitize_callback` / `validate_callback` / `arg_options` from ability schemas before exposing to clients — put public constraints in JSON Schema keywords. Identifier rule sharpened — PHP server-side accepts exactly two slash-separated segments; the JS registry accepts 2–4 segments, but two-segment form is required for abilities that round-trip through PHP / REST / WP AI Client. Cross-reference added to a future `wp-ai-client` skill. Common-mistakes section grew a JS "category not registered first" antipattern.
- **`plugin-scaffold/wp-plugin-assets-loading`** — bumped tested-version to **WP 6.3 – 7.0**. New WP 7.0 args field on `wp_enqueue_script()`: `module_dependencies` (array of registered script module identifiers) lets a classic script dynamically import script modules — but the classic script MUST set either `in_footer => true` or `strategy => 'defer'`, otherwise it can run before the import map exists. New `wp_set_script_module_translations( $module_id, $domain, $path )` (WP 7.0) for script-module i18n; pairs with `wp_set_script_translations()` for classic scripts (use the matching API per script type). Critical-rules list grew two new rules: footer-or-defer requirement for classic scripts using `module_dependencies`, and the matched translation API per script type.

### Repo / docs

- `wordpress/README.md` — `wp-abilities-api` row rewritten for the WP 7.0 client-side surface; added `wp-connectors-api` row.
- `plugin-scaffold/README.md` — `wp-plugin-assets-loading` row mentions WP 7.0 `module_dependencies` and `wp_set_script_module_translations()`.

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
