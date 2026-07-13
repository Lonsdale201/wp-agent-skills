---
name: br-write-schema
description: Configure Better Route 1.1 Resource writeSchema or payloadSchema validation for create and update payloads. Use when defining writable fields, coercion, sanitization, required and nullable values, lengths, ranges, regexes, enums, or structured fieldErrors.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route Resource write schema

Use `writeSchema()` to validate and normalize Resource create/update payload fields. `payloadSchema()` is an exact alias.

```php
Resource::make('articles')
    ->allow(['create', 'update'])
    ->fields(['id', 'title', 'status', 'priority', 'published_at'])
    ->writeSchema([
        'title' => [
            'type' => 'string',
            'required' => true,
            'sanitize' => 'text',
            'minLength' => 1,
            'maxLength' => 180,
        ],
        'status' => [
            'type' => 'enum',
            'values' => ['draft', 'published'],
        ],
        'priority' => ['type' => 'int', 'min' => 0, 'max' => 100],
        'published_at' => ['type' => 'date', 'nullable' => true],
    ]);
```

The enum allowlist is flat: use `['type' => 'enum', 'values' => [...]]`. Do not nest `values` under an `enum` key.

## Rule contract

- Type strings may be supplied directly, such as `'title' => 'string'`.
- Supported coercion types are `int`/`integer`, `float`/`number`, `bool`/`boolean`, `string`, `date`, `email`, `url`, `enum`, `array`, `object`, and `mixed`.
- `required` is enforced only on `create`; updates may be partial but must contain at least one writable field.
- `nullable: true` accepts `null`; otherwise `null` fails validation.
- String constraints are `minLength`, `maxLength`, and `regex`. Numeric constraints are `min` and `max`.
- `email` and `url` use PHP validation after coercion/sanitization. `date` is only string coercion; validate date format with `regex` or a callable sanitizer/other domain layer.
- Sanitizers are `text`, `email`, `key`, `url`, or a callable receiving `(value, field)`. An unknown sanitizer string leaves the value unchanged, so never treat arbitrary names as validation.
- Callable sanitizers transform values; they are not authorization checks and must return a value compatible with subsequent constraints.

Resource writable fields come from configured `fields` minus the ID field. Unknown payload keys fail with `400 validation_failed`; they are not silently dropped. A field denied by `fieldPolicy` also fails, rather than disappearing from the write.

Validation errors use the standard error envelope with `details.fieldErrors`. Boolean `fieldPolicy: false` produces a 400 non-writable validation error; failed capabilities or policy callbacks produce 403 errors. Follow `br-resource-policy` for authorization.

## Checks

- Test unknown, empty, null, malformed, boundary, and coerced values.
- Test required fields separately on create and partial update.
- Test enum values with strict type expectations; enum values are compared strictly after string coercion.
- Anchor regexes and set explicit maximum lengths before expensive domain processing.
- Do not add `patch` to `allow()`; the Resource action name is `update`, even though its route handles update semantics.

Source reference: `src/Resource/Resource.php` (`readPayload`, `coercePayloadValue`, `assertValueConstraints`, `validationError`).
