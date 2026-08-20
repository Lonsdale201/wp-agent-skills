# Dynamic Visibility implementation reference

Load this reference when the condition needs JetEngine field semantics, custom
controls, a custom group, or a concrete regression matrix.

## Base contract

Required methods:

```php
abstract public function get_id();
abstract public function get_name();
abstract public function check($args = array());
```

Optional defaults:

```text
get_group()          false
is_for_fields()      true
need_value_detect()  true
need_type_detect()   false
get_custom_controls() false
```

Use `is_for_fields() === false` for request/user/date conditions that do not
need the Field selector. Use `need_value_detect() === false` when no comparison
value is required. Return `true` from `need_type_detect()` only when the UI must
offer numeric/date/string coercion.

## Checker argument shape

The checker prepares these top-level keys:

```php
array(
    'type'               => 'show',
    'condition'          => 'my_plugin_condition',
    'user_role'          => null,
    'user_id'            => null,
    'field'              => null,
    'field_raw'          => null,
    'value'              => null,
    'data_type'          => null,
    'context'            => null,
    'condition_settings' => array(/* complete saved repeater row */),
)
```

The filter `jet-engine/modules/dynamic-visibility/condition/args` can adjust the
shape before `check()`. Do not make a condition depend on an undocumented key
without a default.

## Comparison pattern

```php
public function check($args = array()) {
    $current = $this->get_current_value($args);
    $wanted  = $args['value'] ?? null;
    $type    = $args['data_type'] ?? 'chars';
    $values  = $this->adjust_values_type($current, $wanted, $type);
    $match   = $values['current'] === $values['compare'];

    return 'hide' === ($args['type'] ?? 'show') ? ! $match : $match;
}
```

Choose strict or loose comparison intentionally. JetEngine's built-in Equal
uses loose equality after type adjustment; a custom condition can be stricter
when its saved-data contract permits it.

## Custom group

```php
add_filter(
    'jet-engine/modules/dynamic-visibility/conditions/groups',
    static function(array $groups): array {
        $groups['my_plugin'] = array(
            'label'   => __('My Plugin', 'my-plugin'),
            'options' => array(),
        );
        return $groups;
    }
);
```

Return `my_plugin` from `get_group()`. If an unknown slug is returned without a
filter, JetEngine currently creates a group whose displayed label is the raw
slug; do not rely on that as polished UI.

## Regression matrix

Test at least:

| Dimension | Cases |
|---|---|
| Intent | show, hide |
| Relation | one condition, AND, OR |
| Match | true, false, missing value, zero value |
| Object | post, user/term/comment/custom object where supported |
| Context | current listing, current post, macro field |
| Request | normal page, builder preview, AJAX/load more |
| State | logged out, allowed user, disallowed user |
| Repeatability | two calls with identical inputs produce identical output |

For expensive conditions, compare database query counts for one card and a
multi-card listing. A request cache must include object ID, user ID, blog ID,
locale, and any setting that changes the result.
