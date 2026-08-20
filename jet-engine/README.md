# jet-engine

Skills for extending JetEngine 3.8.14 from a companion plugin: Dynamic
Visibility, Listings field callbacks, Query Builder custom types, Custom
Content Types, and Data Stores.

Use these skills to integrate with JetEngine's public hooks and runtime objects
without bypassing sanitation, access policy, cache, lifecycle, or storage
semantics.

## Skills

| Skill | Purpose |
|---|---|
| `je-dynamic-visibility-condition` | Register a custom Dynamic Visibility condition with correct show/hide polarity, condition-specific controls under `condition_settings`, listing context, groups, pure checks, and 3.8.14 silent asset-preload behavior. |
| `je-listings-callback` | Register a Dynamic Field callback through the modern manager or legacy filters; covers callable IDs, positional controls, literal-zero defaults, callback chains, non-scalar input, final output escaping, and render-time cost. |
| `je-query-builder-custom-type` | Build paired runtime/editor Query Builder types with all six required abstract methods, dynamic settings, filters, pagination, automatic item caching, explicit count caching, REST settings, and optional MCP argument conversion. |
| `je-custom-content-types` | Integrate with CCT custom tables through Factory/Item Handler CRUD, lifecycle hooks, safe queries, related single posts, Query Builder, REST capabilities, object ownership, and same-request delete-cache behavior. |
| `je-data-stores` | Integrate favorites/bookmarks/likes/recently-viewed stores across cookie, session, user-meta, local-storage, and user-IP backends; covers frontend/programmatic mutation, counts, user/CCT items, Query Builder, custom store types, and anonymous AJAX trust boundaries. |

All five skills were source-audited against the locally installed JetEngine
3.8.14 and smoke-tested on WordPress 7.0.4 / PHP 8.3.30 where the module state
allowed it; inactive CCT/Data Stores modules were initialized only inside an
isolated WP-CLI process without changing saved module settings.
