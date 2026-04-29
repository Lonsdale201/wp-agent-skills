---
name: br-write-schema
description: Validate POST / PUT / PATCH bodies on a better-route
  Resource via ->writeSchema([...]) (alias ->payloadSchema([...])).
  Maps each field to a rule array with type / required / nullable /
  min / max / minLength / maxLength / regex / enum-values / sanitize.
  Important — the source-verified shape for enum is {type: 'enum',
  'values': [...]} (FLAT), NOT {type: 'enum', 'enum': {'values': [...]}}
  (the agents.md doc nests it). Verified at src/Resource/Resource.php:
  1366 — assertValueConstraints reads $rule['values'] directly. Other
  shape rules — sanitize values are 'text'|'email'|'key'|'url'|callable;
  type values are int|integer / float|number / bool|boolean / string /
  date / email / url / enum / array / object / mixed (the integer /
  number / boolean variants are aliases). Validation failures throw
  ApiException with code validation_failed and details.fieldErrors.
  Use when adding payload validation to a Resource. Triggers on
  ->writeSchema(, ->payloadSchema(, fieldErrors, validation_failed.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: Resource write-schema validation

For developers wiring payload validation onto a `Resource::make(...)` POST / PUT / PATCH endpoint via `->writeSchema([...])`. Each field gets a rule shape that drives type coercion, sanitization, and constraint checks before the handler runs. Failures return a structured `validation_failed` error envelope with per-field error lists.

## Misconception this skill corrects

> "For an enum field I'll write `['type' => 'enum', 'enum' => ['values' => ['draft', 'publish']]]` per the docs."

The agents.md doc shows that nested shape, but the source-verified shape is FLAT:

```php
// WRONG (per agents.md, but not what source reads)
'status' => ['type' => 'enum', 'enum' => ['values' => ['draft', 'publish']]]

// RIGHT (source-verified at src/Resource/Resource.php:1366)
'status' => ['type' => 'enum', 'values' => ['draft', 'publish']]
```

Verified at [Resource.php:1364-1369](Resource.php):

```php
if (($rule['type'] ?? null) === 'enum') {
    $values = $rule['values'] ?? [];
    if (!is_array($values) || !in_array($value, $values, true)) {
        throw $this->validationError([$field => ['must be one of the allowed values']]);
    }
}
```

The validator looks for `$rule['values']` directly on the rule array. A nested `'enum' => ['values' => [...]]` block is ignored, so every value falls through to the rejection branch — every request fails as "must be one of the allowed values" with an empty allowlist.

Other AI-prone misconceptions:

- "`writeSchema` and `payloadSchema` do different things." Wrong — `payloadSchema()` ([Resource.php:159](Resource.php)) is just an alias for `writeSchema()` ([Resource.php:150](Resource.php)). Same in-memory storage, same validator.
- "I'll `'sanitize' => 'sanitize_text_field'` and pass the WP function name." Wrong — `sanitize` accepts the strings `'text'`, `'email'`, `'key'`, `'url'`, OR a callable. A function name string that isn't one of the four passes through unchanged because the match defaults to `$value`. Pass an actual callable: `'sanitize' => 'sanitize_text_field'` works because PHP treats the function-name string as callable in `is_callable()`.
- "`'type' => 'integer'` and `'type' => 'int'` are different." Wrong — both alias to the same `coerceInt`. Same for `'float'`/`'number'`, `'bool'`/`'boolean'`. Pick one and stay consistent.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `->writeSchema([...])` or `->payloadSchema([...])` on a Resource.
- A consumer reports `validation_failed` errors with cryptic `fieldErrors`.
- Reviewing a PR that hand-rolls payload validation inside a handler instead of using `writeSchema`.
- Setting up CRUD endpoints over a CPT or table where the payload needs constraints.

## Workflow

### 1. Minimal write schema

```php
Resource::make('books')
    ->sourceCpt('book')
    ->writeSchema([
        'title'   => ['type' => 'string', 'required' => true, 'minLength' => 1, 'maxLength' => 200],
        'isbn'    => ['type' => 'string', 'regex' => '/^[0-9]{10,13}$/'],
        'price'   => ['type' => 'float', 'min' => 0],
        'status'  => ['type' => 'enum', 'values' => ['draft', 'publish'], 'required' => true],
        'website' => ['type' => 'url', 'nullable' => true],
    ])
    ->register($router);
```

The validator runs before the handler. On success, the coerced + sanitized values reach the handler. On failure, the route returns:

```json
HTTP/1.1 400 Bad Request

{
  "error": {
    "code": "validation_failed",
    "message": "Invalid request.",
    "requestId": "req_abc123",
    "details": {
      "fieldErrors": {
        "title":  ["is too short"],
        "price":  ["is too small"],
        "status": ["must be one of the allowed values"]
      }
    }
  }
}
```

### 2. Type catalog (verified)

| `type` | What it accepts | Coercion |
|---|---|---|
| `'int'` / `'integer'` | int OR string matching `/^-?\d+$/` | `(int) $value` |
| `'float'` / `'number'` | float, int, or numeric string | `(float) $value` |
| `'bool'` / `'boolean'` | bool, `0`/`1`, `'1'`/`'true'`/`'yes'`/`'0'`/`'false'`/`'no'` | normalized to bool |
| `'string'` | string, int, float, bool | `(string) $value` |
| `'date'` | string (no parsing — same as string here) | string-coerce |
| `'email'` | string passing `FILTER_VALIDATE_EMAIL` | string-coerce + email format check |
| `'url'` | string passing `FILTER_VALIDATE_URL` | string-coerce + URL format check |
| `'enum'` | value present in `$rule['values']` | string-coerce + allowlist check |
| `'array'` | array | passthrough; rejects non-array |
| `'object'` | non-list array (associative) | passthrough; rejects list arrays |
| `'mixed'` | anything | passthrough |

Aliases (`'integer'` ↔ `'int'`, `'number'` ↔ `'float'`, `'boolean'` ↔ `'bool'`) are equivalent; pick one across the codebase.

### 3. Constraint catalog

| Key | Applies to | Behavior |
|---|---|---|
| `required: true` | All | Field must be present in the payload (create only — partial updates skip). |
| `nullable: true` | All | Explicit null is allowed; missing field still falls through to default. |
| `min: <number>` | int / float | Reject if value `<` min. |
| `max: <number>` | int / float | Reject if value `>` max. |
| `minLength: <int>` | string-shaped types | Reject if `strlen($value) <` minLength. |
| `maxLength: <int>` | string-shaped types | Reject if `strlen($value) >` maxLength. |
| `regex: '/pattern/'` | string-shaped types | Reject if `preg_match` returns 0. |
| `values: [...]` | enum | The allowed-value list. **FLAT shape, not nested under `'enum'`**. |

Numeric constraints (`min`, `max`) only apply to numeric types. Length/regex constraints only apply to strings. Cross-type constraints silently pass — `'minLength' => 3` on an int field does nothing.

### 4. Sanitize catalog

```php
'sanitize' => 'text'      // sanitize_text_field() if available, else trim(strip_tags(...))
'sanitize' => 'email'     // strtolower(trim(...))
'sanitize' => 'key'       // preg_replace('/[^A-Za-z0-9_-]/', '', $value)
'sanitize' => 'url'       // trim(...)
'sanitize' => callable    // your own: fn ($value, $field) => mixed
```

Sanitization runs AFTER coercion but BEFORE constraint checks. So `'sanitize' => 'text'` strips HTML tags from the input before `regex` runs — your regex sees the cleaned value.

### 5. Custom sanitizer callable

```php
->writeSchema([
    'tags' => [
        'type' => 'string',
        'sanitize' => static function (string $value, string $field): string {
            $tags = array_map('trim', explode(',', $value));
            return implode(',', array_filter($tags));
        },
    ],
])
```

The callable receives `($value, $field)` — the field name lets you reuse one sanitizer across multiple fields with field-specific behavior.

### 6. Combining required + nullable

```php
'status' => ['type' => 'enum', 'values' => ['draft', 'publish'], 'required' => true]
// → must be present, must be 'draft' or 'publish'

'website' => ['type' => 'url', 'nullable' => true]
// → may be omitted (default applies); if present, must be null OR a valid URL

'website' => ['type' => 'url', 'required' => true, 'nullable' => true]
// → must be present; may be the literal null OR a valid URL
```

`required` checks presence in the payload. `nullable` allows the explicit null value when the field IS present. They're orthogonal — combine when you want "must be set, may be null".

### 7. Per-action validation

By default, `required` is enforced on `create`. Updates and patches don't enforce required (allowing partial updates). If you need stricter behavior, declare a separate Resource with a different schema:

```php
Resource::make('books_strict')
    ->allow(['update'])
    ->writeSchema([
        'title' => ['type' => 'string', 'required' => true],
    ])
    ->register($router);
```

Or do per-field validation inside the handler for complex rules.

## Critical rules

- **Enum values shape is FLAT.** `['type' => 'enum', 'values' => [...]]`. NOT `['type' => 'enum', 'enum' => ['values' => [...]]]`. Verified at [Resource.php:1366](Resource.php).
- **`writeSchema` and `payloadSchema` are aliases.** Pick one, stay consistent.
- **`sanitize` is `'text'` | `'email'` | `'key'` | `'url'` | callable.** Other strings pass through unchanged (silent footgun).
- **Type aliases are equivalent.** `int`/`integer`, `float`/`number`, `bool`/`boolean`. Stay consistent across the codebase.
- **Email / URL / regex run AFTER sanitize.** Use sanitize to clean the input before format checks bite.
- **`required` checks presence; `nullable` allows null.** Orthogonal — combine for "must be set, may be null".
- **`required` defaults to `false`.** Don't omit it for create-mandatory fields.
- **Validation errors are `400 validation_failed`** with `details.fieldErrors`. Don't try to throw a custom 422 — better-route's contract is 400.
- **Cross-type constraints silently pass.** `minLength` on an int does nothing; the validator only applies length checks on strings.

## Common mistakes

```php
// WRONG — nested enum shape (from older docs draft)
'status' => ['type' => 'enum', 'enum' => ['values' => ['draft', 'publish']]]
// → every request fails: "must be one of the allowed values" because $rule['values'] is empty.

// RIGHT — flat enum shape
'status' => ['type' => 'enum', 'values' => ['draft', 'publish']]

// WRONG — sanitize with random WP function name string
'title' => ['type' => 'string', 'sanitize' => 'wp_kses_post']
// 🔴 'wp_kses_post' isn't 'text'/'email'/'key'/'url' AND it IS callable —
// PHP's is_callable() treats function-name strings as callable, so it actually works,
// but ONLY because the function exists at runtime.
// Cleaner: use the callable form explicitly:
'title' => ['type' => 'string', 'sanitize' => 'wp_kses_post']
// (Works, but the documentation surface for sanitize lists 'text'/'email'/'key'/'url'.)

// WRONG — mixing required + missing default behavior
'price' => ['type' => 'float', 'required' => true, 'min' => 0]
// Create with body {} → 400 validation_failed for missing 'price'. Correct.
// PATCH with body {} → no validation error (required isn't enforced on partial updates).

// RIGHT — handle the asymmetry intentionally
// Use Resource::make()->allow(['update', 'patch']) with a non-required schema for partial updates,
// and a separate ->allow(['create']) resource with required fields.

// WRONG — assuming 'date' validates date format
'created_at' => ['type' => 'date', 'required' => true]
// Source treats 'date' identically to 'string' — no format validation. The body {created_at: 'banana'} passes.

// RIGHT — combine type with regex
'created_at' => ['type' => 'string', 'regex' => '/^\d{4}-\d{2}-\d{2}/', 'required' => true]
// Or do format parsing in the handler.

// WRONG — using minLength on a numeric field
'price' => ['type' => 'float', 'minLength' => 1]
// 🔴 silently no-ops; minLength is for strings.

// RIGHT
'price' => ['type' => 'float', 'min' => 0.01]

// WRONG — null without nullable
'website' => ['type' => 'url']
// Body { "website": null } → 400 'must not be null'.

// RIGHT
'website' => ['type' => 'url', 'nullable' => true]

// WRONG — sanitize 'text' on an int field
'count' => ['type' => 'int', 'sanitize' => 'text']
// sanitize runs only when value is_string; int values bypass sanitization. Effectively no-op.

// RIGHT — match sanitize to type
'comment' => ['type' => 'string', 'sanitize' => 'text']
'count'   => ['type' => 'int']

// WRONG — assuming validator runs on read endpoints
->writeSchema([
    'name' => ['type' => 'string', 'required' => true],
])
// → enforced on POST/PUT/PATCH only. GET routes never invoke the schema.

// RIGHT — for read-side filter validation, use ->filterSchema(...) instead.
```

## Cross-references

- Run **`br-resource-cpt`** / **`br-resource-table`** for the Resource builder context — `writeSchema` is one of many fluent methods.
- Run **`br-error-contract`** for the full `validation_failed` envelope shape and how it composes with other 4xx errors.
- Run **`br-resource-policy`** for `fieldPolicy` (per-field write authorization) — pairs naturally with `writeSchema` (per-field validation).

## What this skill does NOT cover

- Cross-field validation ("password matches passwordConfirmation"). `writeSchema` is per-field; do cross-field in the handler or via a custom rule.
- Async validation ("is this email already taken in the DB"). `writeSchema` is sync and has no DB access. Do that check in the handler, throw `ApiException::conflict(...)`.
- Client-side validation. `writeSchema` is server-side only; mirror the rules in your client code if needed.
- Localization of error messages. Messages are framework-agnostic English; translate at the consumer layer.
- Complex shape validation (nested objects, arrays of objects). The validator handles primitives + flat arrays/objects; for deep nesting, validate manually in the handler or use a separate JSON Schema library.

## References

- writeSchema fluent method: [libraries/better-route/src/Resource/Resource.php:150-156](Resource.php) — `writeSchema(array $schema): self`.
- payloadSchema alias: [Resource.php:159-165](Resource.php) — `payloadSchema(array $schema): self` (same internal storage).
- Coercion entry: [Resource.php:1225-1260](Resource.php) — `coercePayloadValue(string $field, mixed $value)`.
- Type coercers: [Resource.php:1276-1320](Resource.php) — `coerceString`, `coerceInt`, `coerceFloat`, `coerceBool`.
- Sanitizer: [Resource.php:1332-1349](Resource.php) — `sanitizeValue` with the four string options + callable fallback.
- Constraint validator: [Resource.php:1362-1406](Resource.php) — `assertValueConstraints` — enum (line 1366), minLength/maxLength/regex (line 1373-1383), email/url filter (1385-1391), min/max numeric (1393-).
- Error helper: [Resource.php:1453-1460](Resource.php) — `validationError(array $fieldErrors): ApiException` — throws `ApiException` with code `validation_failed`, status 400, details `{fieldErrors: ...}`.
