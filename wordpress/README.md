# wordpress

Core WordPress skills that apply to any plugin or theme — security, i18n, REST, the Abilities API, HTML/UTF-8 helpers, query cache.

Use these when reviewing or extending code that touches WordPress core APIs, regardless of which plugin you're building.

## Skills

| Skill | Purpose |
|---|---|
| `wp-security-audit` | Basic security checklist — sanitize, escape, nonce, capability, SQL prepare, AJAX nopriv, REST permission, redirects, path traversal. |
| `wp-security-deep` | Deeper security — object injection, SSRF, CSRF on GET, mass assignment, file include, mail/zip injection, timing comparison, TOCTOU. |
| `wp-security-secrets` | Secrets handling — hardcoded credentials, weak randomness, password storage, cookie flags, log leaks. |
| `wp-i18n-audit` | Translation correctness — text-domain consistency, escaped translation calls, placeholder helpers, translator comments. |
| `wp-rest-api` | Scaffold and review custom REST endpoints — `register_rest_route`, `permission_callback` (the `__return_true` antipattern), `args` schema, response shaping with `WP_REST_Response` / `WP_Error`, REST vs admin-ajax decision. Suggests graduating to `better-route` for non-trivial multi-route projects. |
| `wp-abilities-api` | The WordPress Abilities API (WP 6.9 server-side, WP 7.0 client-side) — register machine-readable plugin capabilities with JSON Schema inputs/outputs and a permission callback, automatically exposed over REST and bridgeable to AI agents (via MCP adapter or the WP 7.0 WP AI Client). Covers `wp_register_ability`, the `@wordpress/abilities` / `@wordpress/core-abilities` script modules, `wp_ai_client_prompt()->using_abilities()`, and the REST schema cleanup in 7.0. |
| `wp-connectors-api` | The WordPress Connectors API (WP 7.0+) — register external-service connection metadata for the Settings > Connectors screen and WP AI Client. Covers `wp_connectors_init`, `WP_Connector_Registry`, `wp_get_connector` / `wp_get_connectors` / `wp_is_connector_registered`, `api_key` vs `none` auth, env / constant / option key priority, AI provider auto-discovery, and safe metadata override patterns. |
| `wp-presence-api` | **Awareness-only** reference for the experimental Presence API feature plugin (v0.1.x, April 2026 — NOT in core, NOT a stable release). Surfaces the durable architectural pattern (dedicated ephemeral table + TTL + Heartbeat) so AI assistants don't invent `postmeta`-based presence implementations. |
| `wp-html-api` | Safe server-side HTML inspection/mutation with `WP_HTML_Tag_Processor` and `WP_HTML_Processor` — replaces regex/string hacks for tag attributes, classes, text nodes, token serialization, and `data-*` name mapping. |
| `wp-utf8-text` | UTF-8/text encoding handling for imports, exports, XML/JSON/feed boundaries, logs, and external API data — WP 6.9 `wp_is_valid_utf8()`, `wp_scrub_utf8()`, noncharacter checks, and the `seems_utf8()` deprecation. |
| `wp-query-cache` | Query-cache behavior on WP 6.9+ — salted cache helpers for direct query cache access, affected groups (`post-queries`, `term-queries`, `user-queries`, etc.), and when to avoid touching core query caches directly. |
