---
name: acf-field-group-development
description: >-
  Builds and reviews Advanced Custom Fields field groups defined in PHP or Local
  JSON. Covers stable group and field keys, storage names, acf/init timing,
  location rules, REST exposure, plugin-owned JSON paths, deployment, and Free
  versus PRO field availability. Use when adding a new ACF-backed meta field,
  converting an admin-created group to code, shipping field definitions in a
  plugin or theme, fixing duplicate keys or missing frontend fields, or deciding
  whether a field belongs in ACF at all.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF field group development

Treat an ACF field definition as a versioned data contract. The field **key** is
ACF's identity, the field **name** becomes the storage/API name, the field type
determines raw and formatted value shapes, and location rules decide where the
editing UI appears. Changing any of these can be a data migration even when the
admin screen still looks correct.

## Choose the ownership model

| Model | Use it when | Important behavior |
|---|---|---|
| PHP with `acf_add_local_field_group()` | A plugin owns the schema and deployments must be deterministic | Definitions are not editable in the normal Field Groups UI. |
| Local JSON | Site builders edit in ACF UI and the result must be version controlled and synchronized | JSON and database copies can diverge; review and sync deliberately. |
| Database only | A site owner intentionally manages the schema in one environment | Poor fit for reusable plugins and automated deployments. |

Do not register the same group independently in PHP and JSON. Pick one canonical
owner, or make the precedence and sync workflow explicit.

## Register a plugin-owned group

Register on `acf/init`. Do not wrap registration in `is_admin()`: frontend calls
to `get_field()` need the same definitions for field lookup and formatting.

```php
add_action( 'acf/init', static function (): void {
    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( array(
        'key'   => 'group_acme_event_details',
        'title' => __( 'Event details', 'acme-events' ),
        'fields' => array(
            array(
                'key'          => 'field_acme_event_start',
                'label'        => __( 'Start time', 'acme-events' ),
                'name'         => 'acme_event_start',
                'type'         => 'date_time_picker',
                'display_format' => 'Y-m-d H:i',
                'return_format'  => 'Y-m-d H:i:s',
                'required'       => 1,
            ),
            array(
                'key'   => 'field_acme_event_summary',
                'label' => __( 'Summary', 'acme-events' ),
                'name'  => 'acme_event_summary',
                'type'  => 'textarea',
                'rows'  => 4,
            ),
        ),
        'location' => array(
            array(
                array(
                    'param'    => 'post_type',
                    'operator' => '==',
                    'value'    => 'acme_event',
                ),
            ),
        ),
        'show_in_rest' => 1,
    ) );
} );
```

Use a stable vendor/plugin prefix in every key and field name. Never generate
keys at runtime, translate them, or include an environment name. Labels and
instructions are display text and should be translated; keys and names are not.

## Preserve identity and storage

- Every `group_*` and `field_*` key must be globally unique and stable.
- A field name is a database/API contract. Renaming it does not migrate existing
  values or the hidden `_field_name` reference row.
- Reusing one key for a different field makes the later local definition replace
  the earlier definition in ACF's local store.
- Reordering fields and changing labels is usually presentation-only. Changing
  type, return format, parent structure, or name needs a migration and read-path
  regression test.
- Use field keys with `update_field()` when creating a value for the first time,
  especially during imports. This lets ACF create the reference row needed to
  resolve the type and format later reads.

## Local JSON inside a plugin

The default `acf-json` folder belongs to the active theme. A reusable plugin must
add its own load path and, if it owns authoring, its own save path. Keep the path
inside the plugin and version the JSON files.

```php
add_filter( 'acf/settings/load_json', static function ( array $paths ): array {
    $paths[] = __DIR__ . '/acf-json';
    return array_values( array_unique( $paths ) );
} );

add_filter( 'acf/settings/save_json', static function ( string $path ): string {
    return __DIR__ . '/acf-json';
} );
```

Only add the save filter when editors are expected to author this plugin's
schema. Otherwise ship reviewed JSON as read-only definitions. A custom save
path is not automatically a load path; configure both sides.

## Free and PRO boundary

The local-field API, Local JSON, location rules, REST setting, and custom field
type API are available in Free and PRO 6.8.10. The following definitions require
**ACF PRO**:

- `repeater`
- `flexible_content`
- `gallery`
- `clone`
- Options Pages and ACF Blocks

Feature-detect the exact dependency before registering a PRO-only schema. For an
optional enhancement, omit or replace that field deliberately. For a required
field, fail visibly in admin instead of silently registering an unusable type.

## Review checklist

1. Identify who owns the schema: PHP, Local JSON, or database.
2. Confirm every key is unique and stable and every name is intentionally
   namespaced.
3. Verify registration occurs before any field read, normally on `acf/init`.
4. Check the location rule against the actual post type, taxonomy, user, options
   page, block, or other object.
5. Record raw and formatted value shapes for every field used by code.
6. Mark each PRO-only field or feature in code and documentation.
7. Test a fresh object, an object with existing data, REST if enabled, and the
   frontend read path.

## Cross-references

- `acf-value-storage-frontend` for database rows, writes, reads, and rendering.
- `acf-pro-complex-fields` for Repeater, Flexible Content, Gallery, and Clone.
- `acf-custom-field-type` when the required editor/value contract cannot be
  expressed with a built-in field.

## References

- [Official PHP field registration guide](https://www.advancedcustomfields.com/resources/register-fields-via-php/).
- [Official Local JSON guide](https://www.advancedcustomfields.com/resources/local-json/).
- [Official field group guide](https://www.advancedcustomfields.com/resources/creating-a-field-group/).
- [Official ACF settings reference](https://www.advancedcustomfields.com/resources/acf-settings/).
- Verified ACF 6.8.10 source paths:
  - `includes/local-fields.php`
  - `includes/local-json.php`
  - `includes/locations.php`
  - `includes/post-types/class-acf-field-group.php`
