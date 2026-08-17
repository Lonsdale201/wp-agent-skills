---
name: je-query-builder-custom-type
description: >-
  Registers or audits a custom JetEngine Query Builder type with paired runtime
  and editor classes. Covers all six Base_Query abstract methods including
  set_filtered_prop, setup_query dynamic/macro merging, pagination, automatic
  item caching and explicit count caching, filtering, REST endpoint exposure,
  editor assets, and optional MCP argument conversion. Use for custom tables,
  HPOS-like repositories, external APIs, or bugs involving stale cache, broken
  filters, missing editor controls, empty MCP-created queries, or pagination.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.14"
  wp-skills-wp-version-tested: "7.0.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-17"
---

# JetEngine Query Builder custom type

Build a saved-query type as two coordinated components: a runtime query and an
admin editor. Keep the runtime authoritative; editor controls, REST inputs,
filters, and MCP-created settings are all untrusted input to that runtime.

## When to use this skill

- Expose a custom table, service, or repository to Query Builder/Listings.
- Add query-type-specific editor controls.
- Diagnose abstract-class fatals after a JetEngine upgrade.
- Fix dynamic arguments, filters, cache, count, or pagination behavior.
- Make a custom type intentionally usable from saved-query REST or MCP tooling.

## Architecture and registration

Use the same vendor-prefixed slug in both registrations.

```php
add_action(
    'jet-engine/query-builder/queries/register',
    static function($factory): void {
        require_once __DIR__ . '/src/class-my-plugin-query.php';
        $factory::register_query('my-plugin-records', My_Plugin_Query::class);
    }
);

add_action(
    'jet-engine/query-builder/query-editor/register',
    static function($editor): void {
        require_once __DIR__ . '/src/class-my-plugin-query-editor.php';
        $editor->register_type(new My_Plugin_Query_Editor());
    }
);
```

The runtime base has six required methods in 3.8.14:

```text
_get_items()
get_items_total_count()
get_items_page_count()
get_items_pages_count()
get_current_items_page()
set_filtered_prop($prop = '', $value = null)
```

Omitting `set_filtered_prop()` leaves the subclass abstract and causes a fatal
when JetEngine instantiates it.

## Runtime skeleton

```php
use Jet_Engine\Query_Builder\Queries\Base_Query;

final class My_Plugin_Query extends Base_Query {
    private function args(): array {
        $this->setup_query();
        $args = $this->get_query_args();

        return array(
            'status'   => sanitize_key($args['status'] ?? 'active'),
            'page'     => max(1, absint($args['page'] ?? 1)),
            'per_page' => min(100, max(1, absint($args['per_page'] ?? 20))),
        );
    }

    public function _get_items() {
        return my_plugin_repository()->find($this->args());
    }

    public function get_items_total_count() {
        $cached = $this->get_cached_data('count');
        if (false !== $cached) {
            return (int) $cached;
        }

        $count = (int) my_plugin_repository()->count($this->args());
        $this->update_query_cache($count, 'count');
        return $count;
    }

    public function get_items_per_page() {
        return $this->args()['per_page'];
    }

    public function get_current_items_page() {
        return $this->args()['page'];
    }

    public function get_items_pages_count() {
        return max(1, (int) ceil(
            $this->get_items_total_count() / $this->get_items_per_page()
        ));
    }

    public function get_items_page_count() {
        return count($this->get_items());
    }

    public function set_filtered_prop($prop = '', $value = null) {
        if ('_page' === $prop) {
            $this->final_query['page'] = max(1, absint($value));
            return;
        }

        $this->merge_default_props($prop, $value);
    }
}
```

`Base_Query::get_items()` automatically reads and writes the item cache. Do not
duplicate item caching in `_get_items()`. Counts and auxiliary requests need
their own keys. Always test cache lookup with `false !== $cached`, because zero
and an empty array are valid cached values.

## Query setup and filtering

Call `setup_query()` or `get_query_args()` before reading final arguments. It:

- merges saved and dynamic values;
- resolves JetEngine macros;
- merges `_id`-addressed nested groups;
- explodes properties declared by `get_args_to_explode()`;
- adds `_query_type` and `queried_object_id`.

Do not read `$this->query` as the executable query, and do not call
`merge_dynamic_nested_args()` on the entire final query. That helper accepts a
single nested group with an `args` member; `setup_query()` invokes it correctly.

In `set_filtered_prop()`, validate each property and preserve restrictions.
Intersect allowlists/IDs when a filter must narrow the base query. Blindly
replacing a tenant, owner, status, or visibility restriction can expose data.

## Pagination and cache invariants

- Apply the same normalized filters to item and count queries.
- Include page/offset, site, locale, user/tenant, permissions, and all dynamic
  inputs in the effective cache hash when they affect results.
- Set a finite `cache_expires` for external or frequently changing data.
- Invalidate domain caches after writes; JetEngine cannot infer external data
  changes.
- Return objects with stable IDs and fields that Listings can consume.
- Implement `reset_query()`/`query_was_changed()` if the class holds an inner
  query object or mutable state beyond `final_query`.

## Editor, REST, and MCP boundaries

The editor subclass must at least implement `get_id()` and `get_name()`. Return
a component name/template/file only if custom controls are required. JetEngine
enqueues editor component files with an empty dependency array; ensure required
globals are already provided by the Query Builder page, or enqueue a separate
dependency-aware bundle.

Saved Query Builder queries can opt into a REST endpoint. The type must still
sanitize every runtime argument and preserve access constraints; endpoint
permission comes from the saved query's access settings, not the custom class.

JetEngine's MCP add-query tool lists registered custom type slugs, but it does
not understand their arguments automatically. Without a converter,
`converted_args` is empty and the saved type-specific settings may be empty.
For intentional MCP support:

1. provide static `mcp_description()` for schema guidance; and
2. return a converter through
   `jet-engine/query-builder/mcp/get-converter/my-plugin-records`.

This MCP feature creates saved queries; it does not turn every saved query into
an independently callable MCP tool.

Read [runtime-editor-mcp.md](references/runtime-editor-mcp.md) when building the
editor UI, filter semantics, REST exposure, or MCP conversion.

## Verification

Test empty results, cached empty results, zero count, two pages, final partial
page, out-of-range page, filter narrowing, attempted restriction widening,
macro changes, two identical cached calls, mutation invalidation, editor save /
reload, and REST permissions if enabled. For MCP support, create a query and
inspect the persisted type-specific settings rather than only the returned ID.

## References

- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/components/query-builder/queries/base.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/query-factory.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/query-editor.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/editor/base.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/rest-api/query-endpoint.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/mcp/controller.php`
  - `wp-content/plugins/jet-engine/includes/components/query-builder/mcp/tool-add-query.php`
