# View Config patch semantics

## Method depth

Assume the current configuration contains:

```php
array(
    'default_view' => array(
        'type'   => 'table',
        'sort'   => array( 'field' => 'title', 'direction' => 'asc' ),
        'fields' => array( 'author', 'status' ),
    ),
)
```

- `merge( [ 'default_view' => [ 'sort' => [ 'direction' => 'desc' ] ] ], 1 )` keeps the sort field and changes direction.
- `replace()` behaves the same for associative maps, but replaces a list such as `fields` wholesale.
- `set( [ 'default_view' => [ 'type' => 'grid' ] ], 1 )` replaces the whole `default_view` value and drops inherited members.
- `remove( [ 'default_view' => [ 'sort' => [ 'direction' ] ] ], 1 )` removes only the nested direction.

## List identity

`merge()` identifies list members by `id`, then `slug`, then `field`, or by the scalar value for scalar lists. A contribution with the same identity patches the existing member; a new identity appends. Lists without a usable identity cannot compose predictably and should be replaced only deliberately.

An empty list passed to `merge()` is a no-op. Use `replace()` when an intentionally empty exact list is required.

## Null and defaults

- Nested `null` removes a leaf.
- Top-level `null` resets that key to the base default.
- Naming a top-level key in `remove()` also resets it to the base default.
- Unsupported top-level keys are discarded from the final materialized response.
- Unsupported schema versions and incompatible list/map shapes are rejected without applying the patch.

## Dynamic hook

`wp_get_entity_view_config_hook_name( $kind, $name )` lowercases both dynamic segments inside:

```text
get_entity_view_config_{kind}_{name}
```

Use the helper in diagnostics and tests. Hook names are still literal when passed to `add_filter()`.

## REST contract

Route:

```text
GET /wp-json/wp/v2/view-config?kind={kind}&name={name}
```

Response keys include `kind`, `name`, `version`, `default_view`, `default_layouts`, `view_list`, and `form`. Empty object-typed values are serialized as `{}`, not `[]`, to match the REST schema.

## Source paths

- `wp-includes/view-config.php`
- `wp-includes/class-wp-view-config-data.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-view-config-controller.php`
