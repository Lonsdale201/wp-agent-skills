# jet-engine

Skills for **extending JetEngine** — Dynamic Visibility conditions, Listings field callbacks, and Query Builder custom query types.

Use these when building a JetEngine companion plugin or integrating a custom data source / transform / visibility rule into JE.

## Skills

| Skill | Purpose |
|---|---|
| `je-dynamic-visibility-condition` | Register a custom Dynamic Visibility condition — extend `Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base`, hook `jet-engine/modules/dynamic-visibility/conditions/register`, implement `get_id` / `get_name` / `check`. Override `get_group` / `is_for_fields` / `need_value_detect` / `need_type_detect` to control where it appears, `get_custom_controls` for per-condition UI. The `check()` `$args['type']` carries the user's show/hide intent — invert the boolean accordingly. |
| `je-listings-callback` | Register a custom Listings callback (the per-field transform fired by the Dynamic Field widget — Format date, Convert units, etc.). Both registration paths — legacy 3-filter and modern `$manager->register_callback($name, $label, $args)` on `jet-engine/callbacks/register`. **Critical**: the callback identifier must be a real PHP callable string (global function name or `Fully\\Qualified\\Class::method`); bare static method names fail JE's `is_callable()` gate at `apply_callback()` and the field silently renders empty. |
| `je-query-builder-custom-type` | Register a custom Query type for JetEngine's Query Builder — extend `Jet_Engine\Query_Builder\Queries\Base_Query` for runtime, extend `Jet_Engine\Query_Builder\Query_Editor\Base_Query` for the editor component, hook BOTH register actions. Five abstract methods (`_get_items`, `get_items_total_count`, `get_items_page_count`, `get_items_pages_count`, `get_current_items_page`). Built-in cache via `get_cached_data` / `update_query_cache`. Custom queries auto-participate in JE 3.8+ MCP tool exposure and the frontend query inspector. |
