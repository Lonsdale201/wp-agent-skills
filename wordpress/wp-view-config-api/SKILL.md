---
name: wp-view-config-api
description: Extend or audit WordPress 7.1 entity list and form defaults through the View Config API used by DataViews-based screens. Covers wp_get_entity_view_config, wp_get_entity_view_config_hook_name, dynamic get_entity_view_config filters, WP_View_Config_Data merge/replace/set/remove semantics, schema version 1 patches, default_view, default_layouts, view_list, form, list identity merging, null/reset behavior, callback composition, the authenticated wp/v2/view-config route, custom post type/taxonomy capability mapping, and safe plugin interoperability. Use when a plugin customizes Site Editor or DataViews fields, layouts, filters, saved-view presets, or entity forms.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-19"
---

# WordPress View Config API

WordPress 7.1 builds DataViews-style defaults for an entity through `wp_get_entity_view_config()`. Plugins contribute versioned patches with `WP_View_Config_Data`; they do not replace REST controllers, entity data, or authorization.

## Choose the exact entity hook

The filter is dynamic and its kind/name segments are lowercased. Generate it instead of guessing:

```php
$hook = wp_get_entity_view_config_hook_name( 'postType', 'book' );
// get_entity_view_config_posttype_book
```

For a REST-exposed `book` post type:

```php
add_filter(
    'get_entity_view_config_posttype_book',
    static function ( WP_View_Config_Data $data, array $entity ): WP_View_Config_Data {
        return $data->merge(
            array(
                'default_view' => array(
                    'type'    => 'table',
                    'perPage' => 30,
                    'fields'  => array( 'author', 'status', 'genre' ),
                ),
                'view_list' => array(
                    array(
                        'title' => __( 'Published', 'myplugin' ),
                        'slug'  => 'myplugin-published',
                        'view'  => array(
                            'filters' => array(
                                array(
                                    'field'    => 'status',
                                    'operator' => 'isAny',
                                    'value'    => 'publish',
                                ),
                            ),
                        ),
                    ),
                ),
            ),
            1
        );
    },
    10,
    2
);
```

Pass the schema version the patch was authored against—currently literal `1`. Do not automatically substitute `WP_View_Config_Data::LATEST_VERSION` forever: a future schema bump should prompt review/migration of the patch.

## Understand the four top-level keys

- `default_view`: initial type, filters, sorting, per-page, fields, title/media fields, and related view options.
- `default_layouts`: defaults for table/grid/list layout types.
- `view_list`: named view presets, merged by `slug` identity.
- `form`: DataForm field/layout configuration for the entity.

The container exposes mutation methods, not a public read accessor. Do not reflect into private data or branch on an undocumented materialized shape. Contribute a minimal patch.

## Pick the least destructive method

| Method | Effect | Normal use |
|---|---|---|
| `merge( $patch, 1 )` | Deeply composes maps; merges lists by `id`, `slug`, `field`, or scalar identity | Default choice for plugins |
| `replace( $patch, 1 )` | Like merge, but named lists are replaced wholesale | Pin an exact list while preserving surrounding maps |
| `set( $patch, 1 )` | Replaces every named top-level key wholesale | A plugin truly owns that full key |
| `remove( $spec, 1 )` | Removes selected nested members; top-level removal resets the core default | Remove a precise inherited member |

Prefer `merge()`. Broad `set()`/`replace()` patches can erase core additions and other plugins' contributions.

Examples:

```php
// Remove one field from the inherited default fields list.
return $data->remove(
    array( 'default_view' => array( 'fields' => array( 'author' ) ) ),
    1
);
```

```php
// Replace only the fields list, not the whole default_view key.
return $data->replace(
    array( 'default_view' => array( 'fields' => array( 'title', 'status' ) ) ),
    1
);
```

A nested `null` deletes that leaf. A top-level `null` or top-level `remove()` resets the key to its original default rather than leaving the response key absent. Shape mismatches are rejected with a notice; do not merge a map where a list is expected.

## Compose correctly with other callbacks

Every filter callback must return the `WP_View_Config_Data` object it received. Mutation methods return the object for chaining. Returning an array, `null`, or a new unrelated container breaks later priorities.

Use prefixed view slugs and field IDs. Make additions deterministic; the filter may run more than once in a request. Do not perform database writes or remote calls while building configuration.

The API keeps only documented top-level keys. Attaching arbitrary top-level plugin data will not survive materialization.

## REST route and permissions

`GET /wp-json/wp/v2/view-config?kind=postType&name=book` exposes the built configuration and schema version. It is not anonymous:

- a post type requires that the type exists, has `show_in_rest`, and the user has its `edit_posts` capability;
- a taxonomy requires `show_in_rest` and its `manage_terms` capability;
- `root` requires `manage_options`;
- other custom kinds fall back to `edit_posts`.

The response is configuration only. Register the entity's REST fields/data separately and apply their own authorization. Hiding a field from a view config is not a data-access control.

## Audit checklist

- Exact dynamic hook for the intended kind/name.
- Entity is registered and REST-exposed when a core post type/taxonomy route is expected.
- Literal authored schema version is supplied.
- `merge()` used unless replacement ownership is explicit.
- View/field identities are stable and plugin-prefixed where custom.
- Callback returns the same container and has no side effects.
- Fields referenced by configuration actually exist in the entity/DataViews definition.
- REST capability is tested with allowed, lower-privileged, and logged-out users.
- Other plugin/core patches still compose at different priorities.

## Critical rules

- Treat view config as presentation defaults, never authorization.
- Return `WP_View_Config_Data`, not the materialized array.
- Use small `merge()` patches for interoperability.
- Review patches when the schema version changes.
- Do not depend on private container state or undocumented keys.

## Cross-references

- Use **`wp-rest-api`** for the entity data and permission contract.
- Use **`wp-metadata-api`** when view fields depend on registered REST meta.
- Use **`wp-block-editor-iframe-compatibility`** for DOM/UI extensions around DataViews screens.

## References

- Read `references/patch-semantics.md` for merge identities, removal shapes, REST behavior, and source paths.
- View Config dev note: <https://make.wordpress.org/core/2026/07/31/filtering-site-editor-screens-in-wordpress-7-1/>
- Core sources: `wp-includes/view-config.php`, `wp-includes/class-wp-view-config-data.php`, `wp-includes/rest-api/endpoints/class-wp-rest-view-config-controller.php`.
