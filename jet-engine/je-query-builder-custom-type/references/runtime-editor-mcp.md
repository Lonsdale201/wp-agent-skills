# Query Builder runtime, editor, REST, and MCP reference

Load this reference when implementing the editor component, nested controls,
filter merging, REST exposure, or MCP query creation.

## Editor base contract

```php
use Jet_Engine\Query_Builder\Query_Editor\Base_Query;

final class My_Plugin_Query_Editor extends Base_Query {
    public function get_id() {
        return 'my-plugin-records';
    }

    public function get_name() {
        return __('My Plugin records', 'my-plugin');
    }

    public function editor_component_name() {
        return 'my-plugin-records-query';
    }

    public function editor_component_file() {
        return plugins_url('assets/query-editor.js', MY_PLUGIN_FILE);
    }

    public function editor_component_template() {
        ob_start();
        require __DIR__ . '/../templates/query-editor.php';
        return ob_get_clean();
    }

    public function editor_component_data() {
        return array('statuses' => my_plugin_allowed_statuses());
    }
}
```

Keep `get_id()` identical to the runtime slug. Escape translated labels for the
actual Vue/HTML context. Do not interpolate untrusted values into a template or
inline script.

JetEngine localizes component data as an object named from the handle
`jet-query-component-{type}`, with hyphens converted to underscores.

## Dynamic and nested settings

Give repeatable/nested rows stable `_id` values. JetEngine saves dynamic
overrides by row ID and `setup_query()` merges them. Renumbering or regenerating
IDs on each editor load disconnects saved dynamic values.

For a nested group, the shape is conceptually:

```php
array(
    'is_group' => true,
    '_id'      => 'stable-group-id',
    'relation' => 'AND',
    'args'     => array(
        array(
            '_id'     => 'stable-row-id',
            'field'   => 'status',
            'operator'=> '=',
            'value'   => 'active',
        ),
    ),
)
```

The runtime must allowlist fields, operators, relation values, order fields,
and cast values. Editor restrictions are usability, not server validation.

## Filter merging

`set_filtered_prop()` is a security boundary when a frontend filter changes a
saved query. Use one of these policies per property:

- replace: safe presentation property such as page;
- merge: independent additive constraints;
- intersect: IDs/statuses/tenants where filters may only narrow;
- reject: internal credentials, table names, raw SQL, ownership scope.

If an intersection becomes empty, use an explicit no-results sentinel rather
than removing the restriction.

## REST saved-query endpoint

`Base_Query::maybe_register_rest_api_endpoint()` registers only when the saved
query enables it and provides a namespace and path. `Query_Endpoint` applies
the saved access mode/capability/roles. Audit:

- public versus role/capability settings;
- schema arguments and runtime sanitization;
- object-level visibility of returned records;
- pagination bounds and denial-of-service costs;
- cache variation for authenticated users;
- output fields and sensitive repository columns.

## MCP conversion

The MCP add-query tool obtains a converter through:

```php
add_filter(
    'jet-engine/query-builder/mcp/get-converter/my-plugin-records',
    static function($converter) {
        if ($converter) {
            return $converter;
        }
        return new My_Plugin_Query_MCP_Converter();
    }
);
```

Match the converter interface used in
`includes/components/query-builder/mcp/converters/converter-interface.php`.
Allowlist input keys, cast values, cap page sizes, reject raw SQL/identifiers,
and return the exact settings shape the editor/runtime expects.

Without this filter, the custom slug can appear in the MCP schema while the
tool persists an empty custom argument array. Treat that as unsupported, not
automatic compatibility.

## Personalized cache hashes

If results depend on state not already present in `final_query`, extend the
hash explicitly:

```php
public function get_query_hash_args() {
    $args = parent::get_query_hash_args();
    $args['my_plugin_user_id'] = get_current_user_id();
    $args['my_plugin_blog_id'] = get_current_blog_id();
    return $args;
}
```

Add only deterministic scalar/array dimensions. Do not put credentials or
non-serializable service objects into the hash.

## Regression checklist

```text
runtime class is concrete
runtime/editor IDs match
saved -> reload preserves every setting
dynamic nested values merge by stable _id
item cache distinguishes effective queries
count cache accepts 0
filters cannot widen protected scope
empty intersection yields no results
REST public access is intentional
MCP-created settings equal editor-created settings
```
