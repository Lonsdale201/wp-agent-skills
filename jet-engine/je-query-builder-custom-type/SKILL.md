---
name: je-query-builder-custom-type
description: Register a custom Query type for JetEngine's Query Builder
  — extend \Jet_Engine\Query_Builder\Queries\Base_Query for the runtime
  query class, extend \Jet_Engine\Query_Builder\Query_Editor\Base_Query
  for the editor component, then hook BOTH register actions —
  jet-engine/query-builder/queries/register (factory) for the runtime,
  jet-engine/query-builder/query-editor/register for the editor UI.
  Five abstract methods on Base_Query — _get_items(),
  get_items_total_count(), get_items_page_count(),
  get_items_pages_count(), get_current_items_page(). Built-in cache
  via get_cached_data() / update_query_cache(). Custom queries
  participate in JE 3.8+ MCP tool exposure and the frontend query
  inspector automatically. Use when scaffolding a custom query type
  (HPOS WC orders, third-party API source, custom DB table) for
  JetEngine listings, dynamic widgets, or REST API endpoints.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.8.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-05-01"
---

# JetEngine: register a custom Query Builder query type

For developers adding a new query type to JetEngine's Query Builder — query data sources beyond the built-in Posts / Terms / Users / Comments / SQL / Repeater / Current_WP_Query / Merged_Query. Common cases: HPOS WooCommerce orders (the legacy Posts_Query won't see HPOS-stored orders), custom DB tables, external REST API responses, computed result sets. Once registered, your query appears in the Query Builder editor, listings can iterate it, dynamic widgets can target it, and (since JE 3.8) the MCP tool surface and the frontend query inspector automatically include it.

## Misconception this skill corrects

> "I'll write a custom listing type with `WP_Query` overrides — same outcome."

Wrong layer. JetEngine's Query Builder is a separate system from WP_Query / `pre_get_posts`. The Query Builder is a stored, named, reusable query (saved as a `jet-engine-query` post type entry, addressable by ID across listings, widgets, and REST endpoints). Custom listing-type overrides give you ONE listing's data; a custom query type gives you a named query you can use FROM many listings + the dynamic widgets + REST.

The verified extension contract is **two coupled hooks**:

```php
// 1. Register the runtime query class (the data source)
add_action( 'jet-engine/query-builder/queries/register', function ( $factory ) {
    $factory::register_query( 'my-custom-type', \MyPlugin\Query\MyCustomQuery::class );
} );

// 2. Register the editor UI for it (the form fields admins fill in)
add_action( 'jet-engine/query-builder/query-editor/register', function ( $manager ) {
    $manager->register_type( new \MyPlugin\Query\MyCustomQueryEditor() );
} );
```

The two MUST be paired. Verified at [wp-content/plugins/jet-engine/includes/components/query-builder/query-factory.php:128](query-factory.php) (factory hook fires after default queries register) and [includes/components/query-builder/query-editor.php:54](query-editor.php) (editor hook fires after default editors register).

Other AI-prone misconceptions:

- "I'll use `pre_get_posts` to inject HPOS support into the Posts_Query." Won't work — `Posts_Query` builds a `WP_Query` over the `wp_posts` table; HPOS orders live in `wp_wc_orders`. A new query type extending `Base_Query` and using `WC_Order_Query` is the right path (and what the existing `dynamic-elementor-extension` plugin's `WCOrderHposQuery` does).
- "The query class can be just a function or POPO." No — it MUST extend `Base_Query` AND implement five abstract methods: `_get_items()`, `get_items_total_count()`, `get_items_page_count()`, `get_items_pages_count()`, `get_current_items_page()`. Verified at [queries/base.php:638-666](base.php).
- "Cache is automatic." Half-true — `Base_Query` provides a cache layer (`get_cached_data` / `update_query_cache`) but YOUR `_get_items()` / `get_items_total_count()` need to call it. The factory wires the keys; you're responsible for cache use.

## When to use this skill

Trigger when ANY of the following is true:

- The diff hooks `jet-engine/query-builder/queries/register` or `jet-engine/query-builder/query-editor/register`.
- The diff extends `\Jet_Engine\Query_Builder\Queries\Base_Query` or `\Jet_Engine\Query_Builder\Query_Editor\Base_Query`.
- The user wants a query source JE doesn't ship: HPOS orders, custom DB tables, external API, derived/computed sets.
- A listing or dynamic widget needs to iterate a non-standard data source via the Query Builder.

## The contract — two classes, two hooks

### Runtime: `Queries\Base_Query`

| Method | Required? | Purpose |
|---|---|---|
| `_get_items()` | abstract | Return the array of items for the current page. |
| `get_items_total_count()` | abstract | Total count across ALL pages. |
| `get_items_page_count()` | abstract | Items returned on the CURRENT page (after pagination + per-page). |
| `get_items_pages_count()` | abstract | Total page count. |
| `get_current_items_page()` | abstract | Current page number (1-indexed). |
| `__construct( $args = [] )` | provided | Sets `$id`, `$name`, `$query_id`, `$query_type`, `$query`, `$dynamic_query`, `$preview`, `$cache_query`, `$cache_expires`, `$api_settings`. |
| `get_cached_data( $key = null )` | provided | Read from object cache (per-query-instance cache hash). |
| `update_query_cache( $data, $key = null )` | provided | Write to cache. |
| `setup_query()` | provided, overridable | The "rebuild internal state from `$this->final_query`" lifecycle hook — override to set up your underlying query object. |
| `reset_query()` | provided, overridable | Reset internal state — for second runs of the same query in one request. |
| `get_query_args()` | provided | The current resolved `$this->final_query` array. |
| `apply_macros( $val )` | provided | Resolve `%dynamic%` macros in a value (use for user-entered fields). |
| `merge_dynamic_nested_args( $args_group )` | provided | Combine static `query` settings with `dynamic_query` overrides. |

### Editor: `Query_Editor\Base_Query`

| Method | Required? | Purpose |
|---|---|---|
| `get_id()` | abstract | Slug — MUST match the runtime query's registered type. |
| `get_name()` | abstract | Display label in the editor's "Query Type" dropdown. |
| `editor_component_name()` | optional | Vue component name for the editor form (default null = use generic). |
| `editor_component_template()` | optional | Vue template string. |
| `editor_component_file()` | optional | Path to a Vue component file (cleaner). |
| `editor_component_data()` | optional | Initial data passed to the Vue component (default values, options arrays). |

The editor base lives at [includes/components/query-builder/editor/base.php:4](base.php). Verified.

## Workflow

### 1. Bootstrap your companion plugin

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\Jet_Engine' ) ) {
        return;   // JE not active
    }

    add_action(
        'jet-engine/query-builder/queries/register',
        [ \MyPlugin\Query\Manager::class, 'register_runtime' ]
    );
    add_action(
        'jet-engine/query-builder/query-editor/register',
        [ \MyPlugin\Query\Manager::class, 'register_editor' ]
    );
}, 11 );
```

JetEngine's Query Builder doesn't have a separate module flag — it's part of core; just check `class_exists('\Jet_Engine')`. Priority 11 so JE's own bootstrap runs first.

### 2. Runtime query class — minimal HPOS WC orders example

```php
namespace MyPlugin\Query;

use Jet_Engine\Query_Builder\Queries\Base_Query;

class WCOrderHposQuery extends Base_Query {

    private ?\WC_Order_Query $current_query = null;
    private ?array $current_results = null;
    private bool $is_paginated = false;
    private int $items_per_page = 0;

    public function _get_items(): array {
        $results = $this->get_results();
        return $results['orders'];
    }

    public function get_items_total_count(): int {
        $cached = $this->get_cached_data( 'count' );
        if ( false !== $cached ) {
            return (int) $cached;
        }

        $results = $this->get_results();
        $total = $results['total'];

        $this->update_query_cache( $total, 'count' );
        return $total;
    }

    public function get_current_items_page(): int {
        if ( ! $this->is_paginated ) {
            return 1;
        }
        $query = $this->get_current_order_query();
        $page = $query ? absint( $query->get( 'page' ) ) : 1;
        return $page > 0 ? $page : 1;
    }

    public function get_items_pages_count(): int {
        if ( $this->is_paginated ) {
            $results = $this->get_results();
            $pages = $results['max_num_pages'];
            return $pages > 0 ? $pages : 1;
        }

        $per_page = $this->get_items_per_page();
        $total = $this->get_items_total_count();
        return $per_page ? (int) ceil( $total / $per_page ) : 1;
    }

    public function get_items_page_count(): int {
        if ( ! $this->is_paginated ) {
            return $this->get_items_total_count();
        }

        $items = $this->_get_items();
        return is_array( $items ) ? count( $items ) : 0;
    }

    /** Build / cache / return the WC_Order_Query result. */
    private function get_results(): array {
        if ( null !== $this->current_results ) {
            return $this->current_results;
        }

        $cached = $this->get_cached_data( 'results' );
        if ( false !== $cached ) {
            $this->current_results = $cached;
            return $cached;
        }

        $args = $this->build_args();
        $this->current_query = new \WC_Order_Query( $args );

        $orders = $this->current_query->get_orders();
        $total = $this->current_query->get_total();
        $this->current_results = [
            'orders'        => $orders,
            'total'         => $total,
            'max_num_pages' => $this->items_per_page
                ? (int) ceil( $total / $this->items_per_page )
                : 1,
        ];

        $this->update_query_cache( $this->current_results, 'results' );
        return $this->current_results;
    }

    private function build_args(): array {
        $query  = (array) ( $this->final_query ?: [] );
        $merged = $this->merge_dynamic_nested_args( $query );   // dynamic args override

        // your translation from JE settings → WC_Order_Query args
        return [
            'limit'    => $merged['posts_per_page'] ?? 10,
            'page'     => $merged['paged'] ?? 1,
            'paginate' => true,
            'status'   => $merged['order_status'] ?? array_keys( wc_get_order_statuses() ),
            // ...
        ];
    }

    private function get_current_order_query(): ?\WC_Order_Query {
        if ( null === $this->current_query ) {
            $this->get_results();
        }
        return $this->current_query;
    }
}
```

### 3. Editor class — minimal companion

```php
namespace MyPlugin\Query;

use Jet_Engine\Query_Builder\Query_Editor\Base_Query as Editor_Base_Query;

class WCOrderHposQueryEditor extends Editor_Base_Query {

    public function get_id(): string {
        return 'wc-order-hpos';   // MUST match the runtime registration slug
    }

    public function get_name(): string {
        return __( 'WooCommerce Orders (HPOS)', 'myplugin' );
    }

    /**
     * For complex editors, point at a Vue component file shipped with your plugin.
     * For simple types, leave the defaults — the generic editor handles basic args.
     */
    public function editor_component_file(): string {
        return MYPLUGIN_PATH . '/assets/js/query-editor.js';
    }

    public function editor_component_data(): array {
        return [
            'orderStatusOptions' => array_map(
                static fn ( $label ) => [ 'value' => $label, 'label' => $label ],
                wc_get_order_statuses()
            ),
        ];
    }
}
```

### 4. Manager — wire both registrations

```php
namespace MyPlugin\Query;

class Manager {

    private const QUERY_SLUG = 'wc-order-hpos';

    public static function register_runtime( $factory ): void {
        // $factory is the FQN of Query_Factory (passed via get_called_class()).
        // Call register_query() statically:
        $factory::register_query( self::QUERY_SLUG, WCOrderHposQuery::class );
    }

    public static function register_editor( $manager ): void {
        $manager->register_type( new WCOrderHposQueryEditor() );
    }
}
```

The factory hook passes the class name (string) — that's why you call `$factory::register_query( ... )` statically. Verified at [query-factory.php:127](query-factory.php) — `do_action( 'jet-engine/query-builder/queries/register', get_called_class() )`.

### 5. The `final_query` vs `query` vs `dynamic_query` distinction

Three properties on `Base_Query` look related but mean different things:

| Property | Source | Meaning |
|---|---|---|
| `$this->query` | constructor arg `query` | The user-saved STATIC query settings (from the editor form). |
| `$this->dynamic_query` | constructor arg `dynamic_query` | DYNAMIC overrides resolved at runtime — e.g. "use the current page's category as the term filter". Each entry has a path + dynamic value. |
| `$this->final_query` | `setup_query()` result | The merged, resolved query — what your `build_args()` should read from. |

Use `merge_dynamic_nested_args()` to combine them correctly. Don't read `$this->query` directly when you have dynamic args — the static value would override the dynamic resolution. Verified at [queries/base.php:410](base.php).

### 6. Cache discipline

The cache layer keys per-instance via a hash of `get_query_hash_args()`. It does NOT cache automatically — your code must call:

```php
public function get_items_total_count(): int {
    $cached = $this->get_cached_data( 'count' );
    if ( false !== $cached ) {
        return (int) $cached;
    }

    // ... expensive count query ...

    $this->update_query_cache( $total, 'count' );
    return $total;
}
```

The `'count'` key is a sub-key WITHIN the per-instance hash bucket — so you can cache `'count'`, `'results'`, `'whatever'` separately. Cache disabled if `$this->cache_query === false` (user setting in the editor).

### 7. Macros and dynamic values

User-entered query args may contain JE macros like `%current_user_id%` or `%queried_post_meta|some_field%`. Resolve them via:

```php
$user_id = $this->apply_macros( $merged['author'] ?? '' );
```

`apply_macros()` walks the JE macro engine and returns the resolved string. Don't use raw user input — macros won't resolve and you'll see literal `%foo%` in your query args.

### 8. REST API endpoint exposure (optional)

Each query saved in JE can be exposed as a REST endpoint via the `api_settings` constructor args. Your query class participates automatically — `Base_Query::__construct()` reads the endpoint config. You don't need to register routes manually; JE's `Query_Endpoint` does it from the saved query data.

Verified at [queries/base.php:39-46](base.php) — `api_settings` array stores `api_endpoint`, `api_namespace`, `api_path`, `api_access`, `api_access_cap`, `api_access_role`, `api_schema`. The `maybe_register_rest_api_endpoint()` method at [base.php:68](base.php) wires it up.

### 9. MCP tool exposure (JE 3.8+)

JE 3.8 added an MCP bridge ([includes/components/query-builder/mcp/](mcp/)) that exposes saved queries as tools to AI agents (Claude / GPT via MCP server). Your custom query type participates AUTOMATICALLY — the MCP layer reads from the registered query types and surfaces them as tools. No additional registration required, but ensure your `_get_items()` returns a SERIALIZABLE shape (objects must be `JsonSerializable` or arrays).

### 10. Reusing JE's Meta Query / Date Query / Tax Query group UI

The hardest UI to roll yourself is the Meta Query repeater with its **group support** ("Add new" for a leaf clause + "Add new group" for a nested AND/OR sub-query). JE ships the entire stack as reusable building blocks. You don't author the meta-clause editor — you compose JE's existing pieces.

The same pattern applies to Date Query (`Date_Query_Trait` + `JetQueryDateParamsMixin`) and Tax Query (`JetQueryTaxParamsMixin`). Below is the meta-query flow end-to-end; date/tax follow the same shape.

#### a) Editor template — the Meta Query tab

```php
<cx-vui-tabs-panel
    name="meta_query"
    :label="isInUseMark( [ 'meta_query' ] ) + '<?php esc_attr_e( 'Meta Query', 'mytype' ); ?>'"
    key="meta_query"
>
    <cx-vui-component-wrapper :wrapper-css="[ 'query-fullwidth' ]">
        <div class="cx-vui-inner-panel query-panel">
            <div class="cx-vui-component__label"><?php esc_html_e( 'Meta Query Clauses', 'mytype' ); ?></div>
            <cx-vui-repeater
                button-label="<?php esc_attr_e( 'Add new', 'mytype' ); ?>"
                button-style="accent"
                button-size="mini"
                v-model="query.meta_query"
                @add-new-item="addNewField( $event, [], query.meta_query, newDynamicMeta )"
                :custom-actions="[
                    {
                        buttonLabel: '<?php esc_attr_e( 'Add new group', 'mytype' ); ?>',
                        buttonStyle: 'accent-border',
                        callback: addNewMetaGroup,
                    }
                ]"
            >
                <cx-vui-repeater-item
                    v-for="( clause, index ) in query.meta_query"
                    :collapsed="isCollapsed( clause )"
                    :index="index"
                    :key="clause._id"
                    @clone-item="cloneField( $event, clause._id, query.meta_query, newDynamicMeta )"
                    @delete-item="deleteField( $event, clause._id, query.meta_query, deleteDynamicMeta )"
                >
                    <jet-engine-query-meta-field
                        :field="clause"
                        :meta-query="query.meta_query"
                        :dynamic-query="dynamicQuery.meta_query[ clause._id ]"
                        @input="setFieldData( clause._id, $event, query.meta_query )"
                        @dynamic-input="setDynamicMeta( clause._id, $event )"
                    ></jet-engine-query-meta-field>
                </cx-vui-repeater-item>
            </cx-vui-repeater>
        </div>
    </cx-vui-component-wrapper>
    <cx-vui-select
        v-if="1 < query.meta_query.length"
        label="<?php esc_attr_e( 'Relation', 'mytype' ); ?>"
        :wrapper-css="[ 'equalwidth' ]"
        :options-list="[
            { value: 'and', label: '<?php esc_attr_e( 'And', 'mytype' ); ?>' },
            { value: 'or',  label: '<?php esc_attr_e( 'Or',  'mytype' ); ?>' },
        ]"
        size="fullwidth"
        v-model="query.meta_query_relation"
    ></cx-vui-select>
</cx-vui-tabs-panel>
```

The `<jet-engine-query-meta-field>` component is registered globally by JE itself ([mixins.js:142-238](mixins.js)) and the `#jet-meta-field` template is printed in the JE query-edit page footer ([pages/edit.php:236](edit.php)). You don't load either — they're already on the page when your editor mounts.

#### b) JS — pull in the mixins, preset state

```js
Vue.component( 'jet-mytype-query', {
    template: '#jet-mytype-query',
    mixins: [
        window.JetQueryWatcherMixin,
        window.JetQueryRepeaterMixin,
        window.JetQueryMetaParamsMixin, // <-- gives presetMeta, newDynamicMeta, addNewMetaGroup, deleteDynamicMeta
    ],
    props: [ 'value', 'dynamic-value' ],
    data: function () {
        return {
            operators: window.JetEngineQueryConfig.operators_list,  // shared globals
            dataTypes: window.JetEngineQueryConfig.data_types,
            query: {},
            dynamicQuery: {},
        };
    },
    computed: {
        // Optional — exposes "named clauses" so other parts of the editor can reference them
        metaClauses: function () {
            const result = [];
            for ( let i = 0; i < this.query.meta_query.length; i++ ) {
                if ( this.query.meta_query[ i ].clause_name ) {
                    result.push( {
                        value: this.query.meta_query[ i ].clause_name,
                        label: this.query.meta_query[ i ].clause_name,
                    } );
                }
            }
            return result;
        },
    },
    created: function () {
        this.query        = { ...this.value };
        this.dynamicQuery = { ...this.dynamicValue };
        this.presetMeta(); // <-- initializes query.meta_query = [] and dynamicQuery.meta_query = {}
    },
} );
```

`presetMeta()` ensures `query.meta_query` is an array and `dynamicQuery.meta_query` is an object map keyed by clause `_id`. Without it, the first "Add new" click crashes because `meta_query` is undefined.

`addNewMetaGroup` (provided by `JetQueryMetaParamsMixin`) appends a SPECIAL clause with `is_group: true`, `relation: 'and'`, `args: []`. The `<jet-engine-query-meta-field>` component detects `is_group` and renders the nested repeater inside it automatically — you don't write group-rendering UI.

#### c) Runtime — `Meta_Query_Trait` translates the structure to a WP-compatible meta_query

```php
class MyTypeQuery extends \Jet_Engine\Query_Builder\Queries\Base_Query {

    use \Jet_Engine\Query_Builder\Queries\Traits\Meta_Query_Trait;

    public function get_query_args() {
        if ( null === $this->final_query ) {
            $this->setup_query();
        }
        $args = $this->final_query;

        if ( ! empty( $args['meta_query'] ) ) {
            // Trait converts editor structure (clauses + groups + relation + clause_name)
            // into the canonical WP_Query meta_query shape, recursively for groups.
            $args['meta_query'] = $this->prepare_meta_query_args( $args );
        }
        return $args;
    }
}
```

`Meta_Query_Trait::prepare_meta_query_args()` ([traits/meta-query.php:12](meta-query.php)) does several non-obvious transformations — DON'T re-implement these by hand:

- Recurses into `$row['is_group']` clauses and produces nested `[ 'relation' => 'AND', [...sub-clauses...] ]` blocks.
- Top-level `meta_query_relation` becomes `meta_query['relation']`.
- `IN` / `NOT IN` operator with a comma-separated string value gets exploded into an array.
- `TIMESTAMP` data-type values get converted to NUMERIC + epoch via `strtotime()`.
- `exclude_empty` flag drops the clause entirely when its value is empty (different from the `EXISTS`/`NOT EXISTS` semantics).
- Clauses with `clause_name` get keyed by that name (so `orderby` can target `meta_value` of a specific clause).
- `custom: true` clauses (added at runtime by filter integration) get appended after the editor-defined ones, with relation-aware placement.

#### d) Filter integration — `set_filtered_prop( 'meta_query', $rows )`

When a JE filter widget (search, taxonomy, range slider) injects extra meta criteria at runtime, JE calls `set_filtered_prop( 'meta_query', $rows )` on your query. Wire it to `replace_meta_query_row()` (also from the trait):

```php
public function set_filtered_prop( $prop = '', $value = null ) {
    switch ( $prop ) {
        case 'meta_query':
            $this->replace_meta_query_row( $value );
            break;
        // ... other props
        default:
            $this->merge_default_props( $prop, $value );
            break;
    }
}
```

`replace_meta_query_row()` ([traits/meta-query.php:98](meta-query.php)) merges the filter-supplied rows with the existing editor-defined rows — replacing rows that share a `key` and appending the rest as `custom: true`. This is what lets a search-filter widget refine an existing meta_query without clobbering it.

#### e) Where to call `prepare_meta_query_args()` matters

Call it INSIDE `get_query_args()` (or wherever you build the args you pass to your data source) — NOT in `_get_items()`. The reason — JE's filter integration calls `set_filtered_prop()` which writes to `$this->final_query['meta_query']` in editor format. If you transform too early, the filter writes look corrupted; if you transform too late, the data source receives editor format instead of WP format. The Users / Comments / Posts queries all do it in `get_query_args()` — follow the convention.

```php
// WRONG — runtime data source receives editor-format meta_query, not WP_Query format
public function _get_items() {
    return wc_memberships_get_membership_plans( $this->final_query );
}

// RIGHT — transform on the way out
public function _get_items() {
    return wc_memberships_get_membership_plans( $this->get_query_args() );
}
```

Where `get_query_args()` calls `$this->prepare_meta_query_args( $args )` before returning.

## Critical rules

- **Two hooks paired.** `jet-engine/query-builder/queries/register` AND `jet-engine/query-builder/query-editor/register` — never just one.
- **Slug match.** The runtime registration slug and the editor's `get_id()` MUST be identical strings, otherwise the editor can't bind to the runtime class.
- **Five abstract methods on `Base_Query`.** `_get_items()`, `get_items_total_count()`, `get_items_page_count()`, `get_items_pages_count()`, `get_current_items_page()`. Skipping any → fatal.
- **Read from `$this->final_query`** in your `build_args()` / `setup_query()`. Use `merge_dynamic_nested_args()` to get the resolved version including dynamic overrides.
- **Cache is opt-in via `get_cached_data` / `update_query_cache`.** Use it for expensive counts and full results.
- **Honor `$this->cache_query` and `$this->cache_expires`.** Don't bypass when user disabled cache in the editor.
- **`apply_macros()` for user-entered fields** that may contain `%macro%` placeholders. Don't push raw user strings into your query args.
- **Singleton-friendly construction.** `Base_Query::__construct( $args = [] )` — your subclass either passes through to parent or extends with its own state. Don't replace the parent constructor.
- **Cache key sub-keys are arbitrary.** Use distinct keys (`'count'`, `'results'`, `'top-N'`) per cached operation to avoid stomping.
- **MCP / REST surfaces are automatic.** Don't try to register them again; JE handles per saved-query.
- **Hook at priority 11+ on `plugins_loaded`** so JE's bootstrap runs first.
- **Reuse `Meta_Query_Trait` / `Date_Query_Trait` / `Tax_Query_Trait`** instead of hand-rolling editor-format → WP-format conversion. The traits handle nested groups, OR/AND relations, IN/NOT IN explosion, TIMESTAMP coercion, and clause naming — easy to get wrong if you write your own.
- **Reuse `JetQueryMetaParamsMixin` + `<jet-engine-query-meta-field>`** in the editor. Don't author the meta-clause UI yourself. The component is registered globally on the JE query-edit page, the `#jet-meta-field` template is in the page footer, and the mixin gives you `presetMeta`, `newDynamicMeta`, `addNewMetaGroup`, `deleteDynamicMeta` ready to wire to `<cx-vui-repeater>`.
- **Always call `presetMeta()` / `presetDate()` / `presetTax()` in `created`** if you use the corresponding mixin. Without it, the structure is undefined on first paint and the first "Add new" click throws.
- **Transform meta_query in `get_query_args()`, not in `_get_items()`.** Filter widgets write to `$this->final_query['meta_query']` in editor format; transform on the way out, not on the way in.
- **`_e()` not `esc_attr_e()` inside Vue binding JS string literals.** `esc_attr_e()` encodes `'` → `&#039;` which Vue's template parser then HTML-decodes back to `'`, closing the JS string early and throwing `ReferenceError` on the next bare identifier. This applies to `:label="... + '...'"`, `:options-list="[ { label: '...' } ]"`, `:custom-actions="[ { buttonLabel: '...' } ]"`. Plain HTML attributes (`label="..."`) still use `esc_attr_e()`.
- **Pre-register your editor script with an explicit `jet-engine-query-mixins` dependency.** JE enqueues type-component scripts with empty deps ([query-editor.php:108](query-editor.php)), which leaves the load order undefined relative to `mixins.js`. Result: `window.JetQueryMetaParamsMixin` may be undefined at `Vue.component()` definition time, the mixin silently fails to apply, and the first render throws `ReferenceError: addNewMetaGroup is not defined` (or whichever mixin method the template touches first). JE's own type scripts ship in the same plugin and don't hit this — third-party plugins do. Hook `jet-engine/query-builder/editor/before-enqueue-scripts` at priority 5 (before JE's own callback at default priority 10) and call `wp_register_script()` with your handle (`jet-query-component-{slug}`), your src, and `[ 'jet-engine-query-mixins' ]` as deps. JE's later `wp_enqueue_script()` call with empty deps is a no-op on the already-registered handle — the enqueue happens, your deps stick.

## Common mistakes

```php
// WRONG — only registering the runtime, not the editor
add_action( 'jet-engine/query-builder/queries/register', function ( $factory ) {
    $factory::register_query( 'my-type', MyQuery::class );
} );
// (no jet-engine/query-builder/query-editor/register hook)
// → query type works at runtime, but admins can't pick it from the editor → unusable.

// RIGHT — both
add_action( 'jet-engine/query-builder/queries/register', /* runtime */ );
add_action( 'jet-engine/query-builder/query-editor/register', /* editor */ );

// WRONG — slug mismatch
$factory::register_query( 'wc-orders-hpos', MyQuery::class );  // runtime
$manager->register_type( new MyEditor() );                      // editor get_id() returns 'wc-order-hpos'
// → editor renders, but runtime never matches; saved query is broken.

// RIGHT — same slug everywhere
private const QUERY_SLUG = 'wc-order-hpos';
$factory::register_query( self::QUERY_SLUG, MyQuery::class );

// WRONG — implementing fewer than 5 abstract methods
class MyQuery extends Base_Query {
    public function _get_items() { /* ... */ }
    public function get_items_total_count() { /* ... */ }
    // (missing get_items_page_count / get_items_pages_count / get_current_items_page)
}
// → fatal: cannot instantiate abstract class.

// RIGHT — implement all 5

// WRONG — reading $this->query directly
public function build_args() {
    $args = (array) $this->query;   // WRONG: ignores dynamic overrides
    return $args;
}

// RIGHT
public function build_args() {
    $args = $this->merge_dynamic_nested_args( (array) $this->final_query );
    return $args;
}

// WRONG — caching bypassed
public function get_items_total_count() {
    return $this->expensive_count_query();   // re-runs every page render
}

// RIGHT
public function get_items_total_count() {
    $cached = $this->get_cached_data( 'count' );
    if ( false !== $cached ) return (int) $cached;
    $count = $this->expensive_count_query();
    $this->update_query_cache( $count, 'count' );
    return $count;
}

// WRONG — manual macro resolution
public function build_args() {
    $author = preg_replace( '/^%(.+)%$/', '$1', $this->final_query['author'] ?? '' );
    // WRONG: won't resolve nested macros like %queried_post_meta|some_field%
}

// RIGHT
public function build_args() {
    $author = $this->apply_macros( $this->final_query['author'] ?? '' );
}

// WRONG — registering at the wrong action priority
add_action( 'init', function () {
    add_action( 'jet-engine/query-builder/queries/register', /* ... */ );
} );
// init fires AFTER plugins_loaded; JE's ensure_queries() may have run by then.

// RIGHT — register the registration hook on plugins_loaded:11
add_action( 'plugins_loaded', function () {
    add_action( 'jet-engine/query-builder/queries/register', /* ... */ );
}, 11 );

// WRONG — non-serializable result for MCP
public function _get_items() {
    return $this->wc_orders;  // array of WC_Order objects → not JSON-serializable for MCP layer
}

// RIGHT — convert for the consumer surface OR implement JsonSerializable
public function _get_items() {
    return array_map(
        fn ( \WC_Order $o ) => $o->get_data(),  // associative array, JSON-safe
        $this->wc_orders
    );
}

// WRONG — overriding constructor without calling parent
public function __construct( $args = [] ) {
    $this->slug = $args['slug'] ?? '';
    // (no parent::__construct( $args ))
}
// → $this->id, $this->query_type, etc. all unset → JE downstream code breaks.

// RIGHT
public function __construct( $args = [] ) {
    parent::__construct( $args );
    $this->slug = $args['slug'] ?? '';
}

// WRONG — assuming setup_query auto-runs
public function _get_items() {
    return $this->wc_orders;   // wc_orders never populated; setup_query never ran
}

// RIGHT — setup_query is invoked by JE before _get_items, BUT only if you handle the trigger:
public function setup_query() {
    parent::setup_query();   // resolves $this->final_query from $this->query + dynamic_query
    $this->wc_orders = $this->execute_wc_query();
}

// WRONG — esc_attr_e() inside a JS string literal in a Vue binding expression
// editor template (PHP):
:custom-actions="[
    {
        buttonLabel: '<?php esc_attr_e( 'Add new group', 'mytype' ); ?>',
        callback: addNewMetaGroup,
    }
]"
// WRONG: esc_attr_e encodes ' → &#039;, so the rendered output is:
//    buttonLabel: '&#039;Add new group&#039;',
// Vue's template parser HTML-decodes this to:
//    buttonLabel: ''Add new group'',
// which closes the string early. The next bare identifier (Add, addNewMetaGroup, etc.)
// then throws ReferenceError at render time. JE's own templates use _e() here.

// RIGHT — _e() echoes raw text into a JS string literal context
:custom-actions="[
    {
        buttonLabel: '<?php _e( 'Add new group', 'mytype' ); ?>',
        callback: addNewMetaGroup,
    }
]"
// Same rule applies to :options-list="[ { label: '...' } ]" and
// :label="isInUseMark(...) + '...'" — anywhere a Vue binding expression contains
// a single-quoted JS string with translated content. Plain HTML attributes
// (label="...", description="...") still use esc_attr_e() — they're not JS expressions.
```

## Cross-references

- Run **`je-dynamic-visibility-condition`** for the visibility-gate pattern (different extension surface; both are JE registration hooks).
- Run **`wc-hpos-compatibility`** when your custom query handles WooCommerce orders — HPOS migration concerns.
- Run **`wp-rest-api`** if you're consuming the auto-exposed REST endpoint that JE creates from your saved query.
- Run **`wp-plugin-architecture`** for the companion plugin scaffold + `plugins_loaded:11` priority pattern.

## What this skill does NOT cover

- **Vue editor component authoring.** The `editor_component_file()` returns a path to your Vue component, but the component itself uses JE's query-editor Vue framework — out of scope. For complex editors, copy the JE built-in editor components as a template.
- **Listing-side rendering.** This skill is about the QUERY; once the query returns items, JE listings / dynamic widgets render them via separate templates.
- **REST API auth on the auto-generated endpoint.** Use `api_access` / `api_access_cap` settings in the saved query's `api_settings`. The endpoint is created automatically; auth is editor-configured.
- **MCP tool descriptor customization.** JE auto-generates the MCP tool from your query type; tweaking the descriptor isn't supported as a plugin extension point.
- **Frontend query inspector UI.** Available since JE 3.8 (`jet-engine/query-builder/frontend-editor/is-enabled` filter); your custom queries appear automatically. UI customization not in scope.
- **Replacing built-in queries.** No way to "override" the built-in `Posts_Query`; create a new type with a unique slug.
- **`Avoid_Duplicates` integration.** JE has a duplicate-prevention layer for cross-query consistency — your custom query may need to opt in via the `query_was_changed` lifecycle hook for advanced cases.

## References

- Runtime base: [wp-content/plugins/jet-engine/includes/components/query-builder/queries/base.php:6](base.php) — `abstract class Base_Query`. Constructor at line 27, abstract methods at 638-666 (`_get_items`, `get_items_total_count`, `get_items_page_count`, `get_items_pages_count`, `get_current_items_page`). Cache helpers at 141-178. `setup_query()` at 267, `merge_dynamic_nested_args()` at 410, `apply_macros()` at 488, `get_query_args()` at 553.
- Reference runtime impl: [includes/components/query-builder/queries/posts.php](posts.php) — `Posts_Query extends Base_Query`, full pattern with `WP_Query` underneath.
- Query factory: [includes/components/query-builder/query-factory.php:128](query-factory.php) — `do_action( 'jet-engine/query-builder/queries/register', get_called_class() )` after `ensure_queries()`. `register_query( $type, $class )` at line 142.
- Default query types map: [query-factory.php:92-103](query-factory.php) — `get_default_query_types()` returns the 8 built-ins.
- Editor manager: [includes/components/query-builder/query-editor.php:54](query-editor.php) — `do_action( 'jet-engine/query-builder/query-editor/register', $this )` after default editors register. `register_type()` after.
- Editor base: [includes/components/query-builder/editor/base.php:4](base.php) — `abstract class Base_Query` with `get_id()` / `get_name()` abstract, `editor_component_*` optional.
- Manager (orchestrator): [includes/components/query-builder/manager.php](manager.php) — fires `jet-engine/query-builder/init`, `jet-engine/query-builder/after-queries-setup`, `jet-engine/query-builder/<for>/orderby-options` filters.
- Meta query trait (runtime): [includes/components/query-builder/queries/traits/meta-query.php:12](meta-query.php) — `prepare_meta_query_args()` recurses groups, handles `IN`/`NOT IN` explosion, `TIMESTAMP` coercion, `clause_name` keying, `exclude_empty` skip. `replace_meta_query_row()` at line 98 for filter integration.
- Date / Tax traits: [includes/components/query-builder/queries/traits/date-query.php](date-query.php), [tax-query.php](tax-query.php) — same shape as meta but for `WP_Date_Query` / `WP_Tax_Query` arg formats.
- Editor mixins: [includes/components/query-builder/assets/js/admin/mixins.js](mixins.js) — `JetQueryWatcherMixin` (line 285), `JetQueryRepeaterMixin` (line 35), `JetQueryMetaParamsMixin` (line 240, gives `presetMeta` / `newDynamicMeta` / `addNewMetaGroup` / `deleteDynamicMeta`), `JetQueryDateParamsMixin` (line 302), `JetQueryTaxParamsMixin` (line 337), `JetQueryTabInUseMixin` (line 4, gives `isInUseMark`).
- Meta-field component: [mixins.js:142-238](mixins.js) — `JetEngineQueryMetaField` registered as `<jet-engine-query-meta-field>`. Renders one meta clause OR a group (auto-detects `is_group: true`). Template id `#jet-meta-field` printed by [pages/edit.php:236](edit.php) — already on the JE query-edit page; you don't load it.
- Reference editor with meta-query group setup: [includes/components/query-builder/templates/admin/types/users.php:194-254](users.php) and the matching JS at [assets/js/admin/types/users.js:5-58](users.js). Cleaner than the Posts editor for studying the pattern.
- Editor data globals: [includes/components/query-builder/pages/edit.php:188-218](edit.php) — `JetEngineQueryConfig` window global is localized here with `operators_list`, `data_types`, `orderby_options`, `post_types`. Reference these from your editor JS instead of re-localizing.
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>.
- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
