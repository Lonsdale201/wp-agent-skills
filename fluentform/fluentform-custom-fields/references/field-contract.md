# Fluent Forms field contract reference

Read this file while implementing or debugging a custom field. The contract was
verified against Fluent Forms Free and Pro 6.2.7.

## Registration effects

Constructing `BaseFieldManager` immediately calls `register()` and attaches:

| Hook | Purpose |
|---|---|
| `fluentform/editor_components` | Adds the component to its editor group. |
| `fluentform/editor_element_settings_placement` | Chooses general/advanced editor controls. |
| `fluentform/editor_element_search_tags` | Adds builder search terms. |
| `fluentform/render_item_{key}` | Renders the frontend field. |
| `fluentform/form_input_types` | Makes the parser treat the element as an input. |
| `fluentform/editor_element_customization_settings` | Adds custom editor controls. |
| `fluentform/supported_conditional_fields` | Makes it available to conditional rules. |

Instantiating twice duplicates hook callbacks and often duplicates the component.
Own registration in one bootstrap class or guard it with a static flag.

## Minimum component shape

`getComponent()` should return:

- `index`: ordering hint.
- `element`: exact manager key.
- `attributes.name`: persisted field key; the admin may later rename it.
- `attributes.type`, `value`, `class`, and relevant HTML attributes.
- `settings.label`, `admin_field_label`, `label_placement`, `help_message`,
  `container_class`, `validation_rules`, and `conditional_logics`.
- `editor_options.title`, `icon_class`, and a supported `template`.

Editor control names returned by `getGeneralEditorElements()` and
`getAdvancedEditorElements()` must correspond to keys in `attributes` or
`settings`. Add non-standard controls through `generalEditorElement()`,
`advancedEditorElement()`, and `getEditorCustomizationSettings()` only after
verifying the current editor component schema.

## Input-to-entry mapping

The main path is:

```text
component attributes.name
  -> serialized browser key
  -> FormFieldsParser input map
  -> recursive Fluent Forms sanitization
  -> accepted $formData key
  -> fluentform_submissions.response JSON
  -> fluentform_entry_details.field_name projection
  -> response_render_{element} for human display
```

Unknown browser keys are removed before validation. `fluentform/white_listed_fields`
is intended for protocol/control keys such as CAPTCHA and payment tokens; those
keys are excluded from entry details. Do not use it to bypass field registration.

For nested fields, parser keys may contain bracket notation. `getEntryInputs()`
removes child keys containing `[` so the top-level field owns entry display.
Test the exact stored JSON and detail rows instead of assuming a scalar contract.

## Hook signatures

```php
// Normalize a present field before validation rules run.
apply_filters(
    'fluentform/input_data_{element}',
    $value,
    $field,
    $formData,
    $form
);

// Add field-specific errors after the general validator has run.
apply_filters(
    'fluentform/validate_input_item_{element}',
    $error,
    $field,
    $formData,
    $fields,
    $form,
    $errors
);

// Format a stored response for entries, emails, and other display contexts.
apply_filters(
    'fluentform/response_render_{element}',
    $response,
    $field,
    $formId,
    $isHtml
);
```

An input filter runs only when the key exists in accepted `$formData`. A
validation filter runs for every parsed field, so handle missing optional values.
Return an array of error messages or the existing error value. Do not return an
array containing an already-array value.

## Rendering checklist

- Generate a per-form-instance ID with `makeElementId()`.
- Use `buildAttributes()` and `buildElementMarkup()` for normal inputs.
- Include `ff-el-form-control` where the stock frontend expects it.
- Keep label association, `aria-invalid`, required state, help text, and Fluent
  Forms error placement working.
- Preserve conditional wrapper classes by using `buildElementMarkup()`.
- Escape values by output context. `buildAttributes()` covers attributes passed
  to it; it does not sanitize custom HTML assembled elsewhere.
- Do not use a random ID or mutable label as the submission key.

## Free and Pro boundary

The following field implementations were verified in Pro 6.2.7 and must be
feature-detected before use:

- `FluentFormPro\Components\PhoneField`
- `FluentFormPro\Components\RangeSliderField`
- `FluentFormPro\Components\DynamicField\DynamicField`
- `FluentFormPro\Components\ChainedSelect\ChainedSelect`
- `FluentFormPro\Components\RepeaterField` and `RepeaterContainer`
- rich-text/post fields, uploaders, ranking/NPS, color picker, and save progress

Do not check only `defined('FLUENTFORMPRO')`; also check the exact class or method
needed. This survives incomplete activation and version skew more safely.

## Test matrix

1. Free active, Pro inactive: addon boots and Free-only field works.
2. Free and Pro 6.2.7 active: no duplicate keys or assets.
3. Add field, rename input, save, reload editor.
4. Render two copies of the same form: IDs remain unique.
5. Submit missing, invalid, valid, zero-like (`"0"`), and array-shaped values.
6. Hide/show through conditional logic and confirm hidden-field behavior.
7. Inspect raw `response` JSON, entry details, admin entry, email, export, and feed.
8. Run classic and conversational forms if the addon claims both.
