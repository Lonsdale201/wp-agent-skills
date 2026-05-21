# plugin-scaffold

Skills for **building a new plugin from scratch** — entry point, lifecycle hooks, internal architecture, storage choices, scheduled work, custom hooks, URL rewrites, asset loading.

Use these on day one of a new plugin or when reviewing the bones of an existing one.

## Skills

| Skill | Purpose |
|---|---|
| `wp-plugin-bootstrap` | Main entry-point file — header (with `Requires Plugins` for WP 6.5+), ABSPATH guard, constants, Composer + PSR-4 with manual `spl_autoload_register` fallback, `register_activation_hook` requirements check, Plugin class instantiation on `plugins_loaded`, WP 6.7+ i18n timing rules. |
| `wp-plugin-lifecycle` | Activation / deactivation / `uninstall.php` — `dbDelta` table creation, `add_option` not `update_option` for seeding, `wp_unschedule_hook` for cron cleanup, multisite-aware uninstall via `switch_to_blog` loop, `WP_UNINSTALL_PLUGIN` guard, why `uninstall.php` beats `register_uninstall_hook`, optional `preserve_data_on_uninstall` toggle. |
| `wp-plugin-architecture` | Internal layout of `includes/` — by-type vs by-feature folder structure, PSR-4 one-class-per-file, centralized `Schema` / Constants / PHP enums for repeated strings, singleton scope discipline (Plugin yes, everything else no), conditional asset enqueueing on the right hook, `wp_add_inline_script` over `wp_localize_script`, prefixed custom hook names. |
| `wp-plugin-options-storage` | Picking the right WP storage primitive — options vs user/post/term/comment meta vs transients vs custom tables, the rule that settings group into ONE associative-array option (not 100 scalar options), autoload management on WP 6.6+ (boolean over deprecated `'yes'`/`'no'`), the JSON / serialized-blob trap (no SQL indexing, no aggregation, painful migration), multisite caveat for `*_site_option` / `*_site_transient`. |
| `wp-plugin-cron` | Scheduled / background work — `wp_schedule_event` + custom intervals via `cron_schedules`, idempotent scheduling with `wp_next_scheduled`, the WP-cron-is-pseudo-cron model (page-load triggered, not real-time), `DISABLE_WP_CRON` + system cron alternative, multisite per-blog cron, and Action Scheduler graduation point for queue-style work (10k+ actions, retry, status tracking, idempotency by `unique`). |
| `wp-plugin-hooks` | Designing custom action and filter hooks the plugin EMITS — action vs filter by semantics, prefixed naming with `@since` docblocks, parameter design (order, type stability, 4-arg ceiling), the stability promise, and deprecation via `apply_filters_deprecated` / `do_action_deprecated`. |
| `wp-plugin-rewrite-rules` | Custom URL rewrites and the flush footgun — `add_rewrite_rule` + `query_vars` filter + handler pattern, CPT rewrite slugs, `add_rewrite_endpoint` for permastruct extensions, the hard rule that `flush_rewrite_rules()` runs ONCE on activation/deactivation, NEVER on `init`. Pushes back on the "flush every request" antipattern AI assistants commonly emit. |
| `wp-plugin-assets-loading` | Plugin JS/CSS loading — correct enqueue hooks and screen gating, script args (`strategy`, `in_footer`, WP 6.9 `fetchpriority`, WP 7.0 `module_dependencies`), script module args, `wp_set_script_module_translations()` (WP 7.0), inline data, and removal of legacy IE conditional style support. |
| `wp-action-scheduler` | Action Scheduler 3.9.x in plugins — async / single / recurring / cron-expression actions, `action_scheduler_init` load timing, hook + args + group naming, `unique` and `priority` parameters, idempotent callbacks, chunked workloads, activation / deactivation cleanup, WooCommerce-bundled vs standalone dependency, admin + WP-CLI debugging, queue runner limits. The graduation point from `wp-plugin-cron` for queue-style work (10k+ actions, retry, status tracking). |
