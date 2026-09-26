---
name: acf-custom-field-type
description: >-
  Builds and reviews custom Advanced Custom Fields field types on the Free
  acf_field extension API. Covers acf/include_field_types registration,
  initialize metadata, settings and input rendering, dynamic input names,
  validation, load/update/format transforms, field-aware HTML escaping, assets,
  REST visibility, and repeater-compatible JavaScript initialization. Use when a
  built-in ACF field cannot represent the editor control or stored value, when
  extending acf_field, or when a custom field saves correctly but formats,
  validates, repeats, or renders unsafely.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF custom field type

The `acf_field` extension API is available in ACF Free and PRO. A custom field
type should solve a distinct input/value contract, not merely restyle a Text or
Select field. Prefer a built-in field plus targeted filters when its raw value,
validation, and return format already fit.

## Register after the field API exists

```php
add_action( 'acf/include_field_types', static function ( $api_version ): void {
    if ( ! class_exists( 'acf_field' ) ) {
        return;
    }

    require_once __DIR__ . '/includes/class-acme-acf-field-json.php';
    acf_register_field_type( 'Acme_ACF_Field_JSON' );
} );
```

Keep registration idempotent and feature-detect ACF. The hook receives ACF's
field API version; do not confuse it with the plugin version.

In ACF 6.8.10 the base constructor calls `initialize()`. Set properties there
instead of replacing `__construct()` and accidentally skipping base hook
registration.

## Define the field contract

```php
final class Acme_ACF_Field_JSON extends acf_field {
    public function initialize() {
        $this->name        = 'acme_json';
        $this->label       = __( 'JSON object', 'acme-addon' );
        $this->category    = 'advanced';
        $this->description = __( 'Stores a validated JSON object.', 'acme-addon' );
        $this->defaults    = array(
            'rows' => 8,
        );
        $this->show_in_rest = true;
    }

    public function render_field_settings( $field ) {
        acf_render_field_setting( $field, array(
            'label' => __( 'Rows', 'acme-addon' ),
            'name'  => 'rows',
            'type'  => 'number',
            'min'   => 3,
        ) );
    }

    public function render_field( $field ) {
        $value = is_array( $field['value'] )
            ? wp_json_encode( $field['value'], JSON_PRETTY_PRINT )
            : (string) $field['value'];

        printf(
            '<textarea name="%s" rows="%d">%s</textarea>',
            esc_attr( $field['name'] ),
            max( 3, (int) $field['rows'] ),
            esc_textarea( $value )
        );
    }

    public function validate_value( $valid, $value, $field, $input ) {
        if ( true !== $valid || '' === $value || is_array( $value ) ) {
            return $valid;
        }

        json_decode( (string) $value, true );
        return JSON_ERROR_NONE === json_last_error()
            ? true
            : __( 'Enter valid JSON.', 'acme-addon' );
    }

    public function update_value( $value, $post_id, $field ) {
        if ( is_array( $value ) || '' === $value || null === $value ) {
            return $value;
        }

        $decoded = json_decode( (string) $value, true );
        return JSON_ERROR_NONE === json_last_error() ? $decoded : null;
    }
}
```

Always use `$field['name']` in the input. ACF rewrites it for Group, Repeater,
Flexible Content, Clone, AJAX append, and row indexes. A hardcoded input name or
DOM ID works once at top level and then silently collides in nested fields.

## Separate the value stages

| Method | Stage | Appropriate work |
|---|---|---|
| `validate_value()` | before save acceptance | reject invalid input with `true` or a translated error string |
| `update_value()` | before raw storage | normalize to the canonical database shape |
| `load_value()` | after raw load | compatibility repair for historical raw values; keep it cheap |
| `format_value()` | template/API formatting | return the documented consumer shape; honor `$escape_html` if supported |
| `delete_value()` | after deletion | remove auxiliary rows owned only by this field type |

Keep these methods pure where possible. A formatter can run more than once and
is cached by ACF per request. Do not send HTTP requests, mutate other content, or
perform unbounded queries while formatting a value.

The base ACF value pipeline stores the field's raw value and hidden field-key
reference after `update_value()` runs. A custom type normally should not call
`update_post_meta()` itself. If the type owns auxiliary rows, namespace them and
delete them consistently for posts, users, terms, comments, and options—not just
post meta.

## HTML escaping support

Set `$this->supports['escaping_html'] = true` only when `format_value()` returns a
safe value whenever its fourth `$escape_html` argument is true.

```php
public function initialize() {
    // Other properties...
    $this->supports = array(
        'escaping_html' => true,
        'required'      => true,
    );
}

public function format_value( $value, $post_id, $field, $escape_html = false ) {
    $value = (string) $value;
    return $escape_html ? acf_esc_html( $value ) : $value;
}
```

Do not mark support merely because `render_field()` escapes admin markup. The
flag describes frontend/template formatting of stored values, including values
modified directly in the database.

## Assets and dynamic inputs

Register and enqueue admin assets in `input_admin_enqueue_scripts()`, with unique
handles and a real plugin version. Scope CSS to the field wrapper. JavaScript
must initialize fields appended after page load by Repeaters, Flexible Content,
Clone, modals, and AJAX; use ACF's field lifecycle instead of a one-time document
ready scan. Destroy third-party widgets when rows are removed to prevent leaked
listeners and duplicate instances.

Do not enqueue frontend assets unless the field's formatted output actually
needs them. A field editor control and its frontend presentation are separate
features.

## Verify the field type

1. Create, edit, clear, and delete the value on a normal post.
2. Repeat on every supported location: user, term, comment, or options.
3. Test valid, invalid, empty, array, and historical raw values.
4. Insert multiple field instances and nested Repeater/Group/Clone instances.
5. Duplicate, reorder, append, and remove dynamic rows in the editor.
6. Compare raw metadata, formatted `get_field()`, and escaped reads.
7. Test REST only when `show_in_rest` is intended.
8. Verify behavior with ACF Free and PRO separately when both are supported.

The `acf-value-storage-frontend` smoke example includes a minimal custom JSON
field and verifies its `update_value()` and formatted read on ACF PRO 6.8.10.

## Cross-references

- `acf-value-storage-frontend` for the base storage/reference pipeline.
- `acf-field-group-development` for definitions that consume the new type.
- `acf-pro-complex-fields` for nested dynamic-field behavior under PRO fields.

## References

- [Official custom field type guide](https://www.advancedcustomfields.com/resources/creating-a-new-field-type/).
- [Official example field type repository](https://github.com/AdvancedCustomFields/acf-example-field-type).
- [Official HTML escaping guide](https://www.advancedcustomfields.com/resources/html-escaping/).
- Verified ACF 6.8.10 source paths:
  - `acf.php`
  - `includes/fields.php`
  - `includes/fields/class-acf-field.php`
  - `includes/acf-value-functions.php`
  - `includes/validation.php`
