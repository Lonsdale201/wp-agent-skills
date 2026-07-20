---
name: fluentform-custom-fields
description: >-
  Builds and reviews third-party Fluent Forms input fields with the Free-core
  BaseFieldManager API. Covers fluentform/loaded bootstrap, editor component
  schema, frontend rendering, input-name mapping, conditional logic, server-side
  normalization and validation, response formatting, accessibility, assets, and
  Free versus Pro feature boundaries. Use when code extends BaseFieldManager,
  adds fluentform/render_item_* or fluentform/validate_input_item_* hooks, creates
  a custom field for the form builder, or must make a field appear correctly in
  entries, emails, feeds, and conditional rules.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluentform"
  wp-skills-plugin-version-tested: "6.2.7"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# Fluent Forms custom fields

Build fields against the documented Free-core `BaseFieldManager` contract. Do
not copy a Pro component and accidentally make the extension depend on Pro.

Read [field-contract.md](references/field-contract.md) when implementing a new
field or debugging nested values, response rendering, editor settings, or Pro
feature detection.

## Availability contract

| Surface | Availability in 6.2.7 |
|---|---|
| `FluentForm\App\Services\FormBuilder\BaseFieldManager` | Free |
| Editor registration, frontend render hook, parser input type, conditional support | Free |
| Element input/validation/response filters | Free |
| Phone, range slider, NPS, ranking, dynamic field, chained select, repeater, rich text, file upload | Pro implementations |

The Pro fields demonstrate the same Free base class. Referencing their element
keys, JavaScript, uploader, data-source, or server classes is still Pro-only.

## Workflow

1. Inspect the installed versions and feature-detect every class or constant used.
2. Choose a globally unique, lowercase element key and a configurable input
   `attributes.name`; never use the element key as a permanent business ID.
3. Bootstrap on `fluentform/loaded` and instantiate the field once.
4. Return a complete editor component with `element`, `attributes`, `settings`,
   and `editor_options`.
5. Render with the inherited markup helpers so labels, error placement,
   conditional logic, repeated form instances, and accessibility remain intact.
6. Normalize before rule validation, validate on the server, then add a separate
   display formatter for entries/emails.
7. Test editor insertion, saved/reloaded configuration, classic and
   conversational rendering, valid/invalid submission, conditional visibility,
   entry display, email/feed value, and two instances of the same form.

## Bootstrap and field skeleton

```php
use FluentForm\App\Services\FormBuilder\BaseFieldManager;
use FluentForm\Framework\Helpers\ArrayHelper as Arr;

add_action('fluentform/loaded', static function (): void {
    if (!class_exists(BaseFieldManager::class)) {
        return;
    }

    new Acme_Order_Code_Field();
});

final class Acme_Order_Code_Field extends BaseFieldManager
{
    public function __construct()
    {
        parent::__construct(
            'acme_order_code',
            __('Order code', 'acme-addon'),
            ['order', 'reference', 'code'],
            'advanced'
        );
    }

    public function getComponent()
    {
        return [
            'index'      => 20,
            'element'    => $this->key,
            'attributes' => [
                'type'        => 'text',
                'name'        => 'acme_order_code',
                'value'       => '',
                'class'       => '',
                'placeholder' => '',
            ],
            'settings' => [
                'label'             => __('Order code', 'acme-addon'),
                'admin_field_label' => '',
                'label_placement'   => '',
                'help_message'      => '',
                'container_class'   => '',
                'validation_rules'  => [
                    'required' => [
                        'value'   => false,
                        'message' => __('This field is required.', 'acme-addon'),
                    ],
                ],
                'conditional_logics' => [],
            ],
            'editor_options' => [
                'title'      => __('Order code', 'acme-addon'),
                'icon_class' => 'ff-edit-text',
                'template'   => 'inputText',
            ],
        ];
    }

    public function render($data, $form)
    {
        $data['attributes']['id'] = $this->makeElementId($data, $form);
        $data['attributes']['class'] = trim(
            'ff-el-form-control ' . Arr::get($data, 'attributes.class', '')
        );

        $input = '<input ' . $this->buildAttributes($data['attributes'], $form) . '>';
        $html  = $this->buildElementMarkup($input, $data, $form);

        $this->printContent(
            'fluentform/rendering_field_html_' . $this->key,
            $html,
            $data,
            $form
        );
    }
}
```

Keep `render()` output escaped. The inherited helpers escape attributes and
produce Fluent Forms-compatible wrappers; they do not make arbitrary custom HTML
or JavaScript safe.

## Normalize and validate

```php
add_filter(
    'fluentform/input_data_acme_order_code',
    static fn($value) => is_string($value) ? strtoupper(trim($value)) : $value,
    10,
    1
);

add_filter(
    'fluentform/validate_input_item_acme_order_code',
    static function ($error, $field, $formData, $fields, $form, $errors = []) {
        $name  = (string) ($field['name'] ?? '');
        $value = (string) ($formData[$name] ?? '');

        if ($value !== '' && !preg_match('/^[A-Z0-9-]{6,32}$/', $value)) {
            $error = is_array($error) ? $error : ($error ? [$error] : []);
            $error['acme_format'] = __('Use 6–32 letters, numbers, or dashes.', 'acme-addon');
        }

        return $error;
    },
    10,
    6
);
```

Scope form-specific rules with `(int) $form->id`. Never rely only on browser
validation. Do not add raw request keys to `fluentform/white_listed_fields` merely
to make a field persist; a registered input type and a valid `attributes.name`
are the correct path.

## Response formatting

Use response formatting only for display. Preserve the stored machine value.

```php
add_filter(
    'fluentform/response_render_acme_order_code',
    static function ($response, $field, $formId, $isHtml) {
        $value = (string) $response;
        return $isHtml ? esc_html($value) : $value;
    },
    10,
    4
);
```

## Critical rules

- Treat `attributes.name` as the key connecting browser data, `$formData`, the
  submission `response` JSON, entry details, smart codes, and feed mappings.
- Keep filters pure and deterministic; rendering and formatting can occur more
  than once in a request.
- Register scripts/styles only when the target form contains the field and use
  unique handles. Do not enqueue Pro assets from a Free-only addon.
- Support arrays intentionally. A scalar-looking renderer or validator is not
  automatically safe for repeaters, containers, or multi-value inputs.
- Do not use the unrelated `FluentForm\App\Modules\Component\BaseComponent` API
  as the default extension path; `BaseFieldManager` is the documented and
  core/Pro-used field manager in 6.2.7.

## Cross-references

- Use `fluentform-submission-lifecycle` for hook timing and transformations.
- Use `fluentform-entries-data` for stored response and entry-detail semantics.
- Use `wp-security-audit` when the custom renderer outputs complex HTML.

## References

- Official Base Field Manager documentation: <https://developers.fluentforms.com/api/classes/base-field-manager/>
- Verified Free source paths:
  - `fluentform/app/Services/FormBuilder/BaseFieldManager.php`
  - `fluentform/app/Services/FormBuilder/Components/BaseComponent.php`
  - `fluentform/app/Services/Parser/Form.php`
  - `fluentform/app/Services/Form/FormValidationService.php`
- Verified Pro examples, required only when their features are used:
  - `fluentformpro/src/Components/RangeSliderField.php`
  - `fluentformpro/src/Components/DynamicField/DynamicField.php`
  - `fluentformpro/src/Components/RepeaterField.php`
