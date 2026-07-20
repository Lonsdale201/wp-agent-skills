---
name: bd-hydration-coercion
description: Modify how raw values become typed property values in
  better-data — work in TypeCoercer (primitives + DateTime + Enum +
  Secret) or DataObject::coerceParameter (attribute-aware — ListOf,
  Encrypted, etc.). Critical layering — TypeCoercer is pure, must stay
  callable from a no-WordPress unit test, no side effects, no global
  reads, no WP function calls; attribute-driven coercion lives ABOVE
  TypeCoercer (read attribute → do the rich-type dance → optionally
  delegate to TypeCoercer with a simpler value). Use the explicit
  helpers (toString, toInt, toFloat, toBool, toArray, toEnum), never
  settype() / intval() / unchecked casts — and throw
  TypeCoercionException on anything surprising. Use when fixing a
  hydration bug, adding a new primitive coercion, or extending
  attribute-aware coercion. Triggers on changes to TypeCoercer.php,
  DataObject::coerceParameter, AttributeDrivenHydrator,
  TypeCoercionException, "hydration bug", "fromArray throws".
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-data"
  wp-skills-plugin-version-tested: "phase-9"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-04-29"
---

# better-data: Hydration and coercion

For library maintainers fixing or extending how stored / incoming values become typed property values on a `DataObject`. The coercion layer sits between the source's raw fetch and the constructor's typed parameters; modifying it touches every DTO that goes through `::fromArray`.

## Misconception this skill corrects

> "I'll just `settype($value, 'int')` or `(int) $value` inside the hydrator — same effect."

Wrong. PHP's silent casts paper over invalid input — `(int) 'abc' === 0`, `(int) '12foo' === 12`, `(bool) 'false' === true`. better-data's coercion is intentionally strict: surprising input becomes `TypeCoercionException` with the field name, expected type, and offending value. Verified at [src/Internal/TypeCoercer.php:46-58](TypeCoercer.php) and the per-helper throws ([toString:197, toInt:218, toFloat:235, toBool:254](TypeCoercer.php)).

The discipline is:

```php
// WRONG inside coercion code
$intValue = (int) $value;

// RIGHT
$intValue = TypeCoercer::toInt($dtoClass, $fieldName, $value);
// throws TypeCoercionException if $value isn't a coercible int — caller gets the field
// name and value in the message instead of silently storing 0.
```

Other AI-prone misconceptions:

- "I'll add a WP function call inside `TypeCoercer` — it makes the code shorter." Wrong — `TypeCoercer` is the one engine that MUST stay WP-free so its tests can run without a WP runtime. WP-aware logic goes in `DataObject::coerceParameter` or in the source.
- "I'll add the `Encrypted` decryption to `TypeCoercer`." Wrong layer — attribute-aware coercion lives ABOVE `TypeCoercer` in `DataObject::coerceParameter` ([src/DataObject.php:168](DataObject.php)). The pattern is: handle the attribute (decrypt, walk the list), then call `TypeCoercer::coerce` with the simpler value.

## When to use this skill

Trigger when ANY of the following is true:

- A bug report says "fromArray hydrates with the wrong type" or "casting issue".
- The diff modifies `src/Internal/TypeCoercer.php` or `src/DataObject.php::coerceParameter`.
- Adding support for a new primitive type or a new attribute that affects coercion.
- Reviewing a PR that calls `settype()`, `intval()`, `(int)`, or `(string)` inside coercion code.
- Hitting `TypeCoercionException` at runtime and triaging.

## Workflow

### 1. Choose the layer

| Change type | Layer |
|---|---|
| New primitive (decimal type, IPv4 stored as string <-> int) | `TypeCoercer` (pure) |
| New WP-builtin handling (e.g. coerce `WP_Term` to a term ID) | `TypeCoercer` (still pure — `WP_Term` is just a class shape; check `instanceof` doesn't require WP runtime) |
| New attribute affects coercion (`#[Slug]` lowercase before string-coerce) | `DataObject::coerceParameter` (above TypeCoercer) |
| New attribute affects encryption / list coercion | `DataObject::coerceParameter` |

The acid test: "Can my code run inside a unit test that does NOT bootstrap WordPress?" If yes, it can live in `TypeCoercer`. If no (calls `wp_remote_get`, reads `$wpdb`, looks up `WP_User`), it must live elsewhere.

### 2. Adding a primitive coercion

Inside `TypeCoercer::coerce` ([src/Internal/TypeCoercer.php:83-88](TypeCoercer.php)):

```php
return match ($targetTypeName) {
    'string' => self::toString(...),
    'int'    => self::toInt(...),
    'float'  => self::toFloat(...),
    'bool'   => self::toBool(...),
    'array'  => self::toArray(...),
    // your new branch:
    'decimal' => self::toDecimal($dataObjectClass, $fieldName, $value),
    default  => throw TypeCoercionException::unsupportedType(...),
};
```

The helper:

```php
private static function toDecimal(string $cls, string $field, mixed $value): Decimal
{
    if ($value instanceof Decimal) {
        return $value;
    }
    if (is_string($value) && \preg_match('/^-?\d+(\.\d+)?$/', $value)) {
        return new Decimal($value);
    }
    if (is_int($value) || is_float($value)) {
        return new Decimal((string) $value);
    }
    throw TypeCoercionException::for($cls, $field, 'decimal', $value);
}
```

Three rules:

1. **Accept the type-as-input shortcut.** `$value instanceof Decimal` returns it unchanged — caller passes back what they got.
2. **Convert from common neighbors.** Decimal accepts strings, ints, floats; rejects arrays, booleans, objects of other types.
3. **Throw `TypeCoercionException::for(...)`** with class + field + target + offending value when nothing matches.

### 3. Adding an attribute-aware coercion

Inside `DataObject::coerceParameter` ([src/DataObject.php:168-220](DataObject.php)) BEFORE the `TypeCoercer::coerce` final delegation:

```php
private static function coerceParameter(ReflectionParameter $parameter, mixed $value): mixed
{
    // Existing #[Encrypted] decryption (idempotent envelope check) — see lines 173-184.

    // Your new attribute-aware coercion — example: #[Slug] lowercases before string coerce.
    $slugAttr = $parameter->getAttributes(Slug::class)[0] ?? null;
    if ($slugAttr !== null && is_string($value)) {
        $value = \mb_strtolower($value);
        // Don't return here — let TypeCoercer handle the final string coercion below
        // so length / max-length attribute can also apply.
    }

    // Existing #[ListOf] handling (lines 185-208).

    // Final fallback to pure TypeCoercer.
    return TypeCoercer::coerce(
        static::class,
        $parameter->getName(),
        $parameter->getType(),
        $value,
    );
}
```

Pattern: read the attribute → mutate `$value` (or recurse, or replace) → fall through to `TypeCoercer` for the final type cast. Don't duplicate `TypeCoercer`'s logic above it.

### 4. Idempotency for read-side transformations

`#[Encrypted]` is the canonical example of an idempotent transformation ([DataObject.php:173-184](DataObject.php)):

```php
if (is_string($value)
    && $value !== ''
    && EncryptionEngine::looksEncrypted($value)
    && $parameter->getAttributes(Encrypted::class) !== []
) {
    $value = EncryptionEngine::decrypt($value, $parameter->getName());
}
```

Three checks: is it a non-empty string, does it look like a `bd:v1:` envelope, does the property carry `#[Encrypted]`. If any check fails, the transformation no-ops — so a freshly-decrypted value passing through this path again doesn't double-decrypt. Apply the same idempotency principle to your transformation.

### 5. Tests

Each coercion path needs unit tests:

- **Primitive coercions** → `tests/Unit/TypeCoercionTest.php`. Cover the type itself, neighbor types (int from numeric string, etc.), and rejection (array → int throws).
- **Attribute-aware coercions** → their own file, e.g. `tests/Unit/SlugAttributeTest.php`, `tests/Unit/ListOfTest.php`, `tests/Unit/EncryptedAttributeTest.php`, `tests/Unit/SecretTest.php`.

Two specific shapes per coercion:

```php
public function test_it_coerces_a_valid_input(): void
{
    $dto = MyDto::fromArray(['decimalField' => '1.50']);
    $this->assertInstanceOf(Decimal::class, $dto->decimalField);
    $this->assertSame('1.50', (string) $dto->decimalField);
}

public function test_it_throws_on_invalid_input(): void
{
    $this->expectException(TypeCoercionException::class);
    MyDto::fromArray(['decimalField' => 'abc']);
}
```

### 6. Run the full check

```bash
vendor/bin/phpunit
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
wp better-data stress  # if the change can affect WP-side hydration
```

## Critical rules

- **`TypeCoercer` stays pure.** No WP function calls, no `$_*` superglobals, no globals, no constants. Must be unit-testable without WP bootstrap.
- **Attribute-aware coercion lives in `DataObject::coerceParameter`.** Read attribute → transform value → optionally fall through to `TypeCoercer`.
- **Use the explicit helpers (`toString`, `toInt`, `toFloat`, `toBool`, `toArray`)**. Never `settype()`, `intval()`, `(int)` cast on unchecked input — those silently turn invalid data into 0/false.
- **Throw `TypeCoercionException` on anything surprising.** Caller gets class + field + expected type + offending value in the message.
- **Idempotency for read-side transformations.** A value that's already been transformed (decrypted, lowercased, parsed) should pass through unchanged on the next call. Use a "looks like the post-transform shape?" check.
- **Accept the type-as-input shortcut.** If a coercion target is `Decimal`, `Decimal $value === $value` short-circuits.
- **Single-attribute change goes in ONE PR with all relevant engines wired.** A new attribute that affects coercion also affects `RestSchemaBuilder`, sink projection, etc. — don't ship partial.

## Common mistakes

```php
// WRONG — settype inside coercion
private static function toInt(string $cls, string $field, mixed $value): int
{
    \settype($value, 'integer');  // 'abc' silently becomes 0
    return $value;
}

// RIGHT — explicit checks + throw on bad input
private static function toInt(string $cls, string $field, mixed $value): int
{
    if (\is_int($value)) {
        return $value;
    }
    if (\is_string($value) && \preg_match('/^-?\d+$/', $value)) {
        return (int) $value;
    }
    if (\is_float($value) && \floor($value) === $value) {
        return (int) $value;
    }
    throw TypeCoercionException::for($cls, $field, 'int', $value);
}

// WRONG — WP function call in TypeCoercer
private static function toUserId(string $cls, string $field, mixed $value): int
{
    if (\is_string($value)) {
        return (int) \get_user_by('login', $value)?->ID;  // WRONG: not WP-free
    }
    return self::toInt($cls, $field, $value);
}

// RIGHT — keep WP-aware logic in src/Source/ where it belongs

// WRONG — duplicating TypeCoercer logic in coerceParameter
private static function coerceParameter(ReflectionParameter $parameter, mixed $value): mixed
{
    $type = $parameter->getType()->getName();
    if ($type === 'int') {
        return (int) $value;  // WRONG: reimplements toInt, loses the validation
    }
    // ...
}

// RIGHT — let TypeCoercer handle primitive types after attribute logic
return TypeCoercer::coerce(
    static::class,
    $parameter->getName(),
    $parameter->getType(),
    $value,
);

// WRONG — non-idempotent read-side transformation
if ($parameter->getAttributes(Encrypted::class) !== []) {
    $value = EncryptionEngine::decrypt($value, $parameter->getName());
}
// Crash on the second pass: trying to decrypt already-plaintext value.

// RIGHT — idempotent guard
if (\is_string($value)
    && $value !== ''
    && EncryptionEngine::looksEncrypted($value)
    && $parameter->getAttributes(Encrypted::class) !== []
) {
    $value = EncryptionEngine::decrypt($value, $parameter->getName());
}

// WRONG — silent fallback on unknown type
'unknown_type' => $value,  // pass through unchanged
// Hides bugs — caller expected a specific shape, gets a mystery value.

// RIGHT
'unknown_type' => throw TypeCoercionException::unsupportedType(...),
```

## Cross-references

- Run **`bd-attribute`** when adding a new attribute that affects coercion — wire it through `DataObject::coerceParameter` AND every other engine.
- Run **`bd-data-object`** if hydration changes affect specific DTO patterns — sometimes the right fix is the DTO design, not the coercer.
- Run **`bd-security`** when the coercion touches `Secret` or `#[Encrypted]` — symmetric encrypt/decrypt is mandatory.

## What this skill does NOT cover

- Replacing `TypeCoercer` with a different coercion library (Symfony Serializer, etc.). The library deliberately keeps its own minimal coercion to stay framework-free.
- Async / lazy hydration. All coercion is sync; lazy fields are a Presenter concern (`compute`).
- Data validation. Coercion turns a value into the right TYPE; validation (`Rule\*`) checks if the typed value passes business rules. They run sequentially, never together.
- Performance optimization beyond reflection caching (which the library doesn't do — `coerceParameter` reads attributes per call). Premature.
- Coercion FROM DTO TO storage. That's `SinkProjection`, not coercion.

## References

- TypeCoercer: [libraries/better-data/src/Internal/TypeCoercer.php](TypeCoercer.php) — `final class TypeCoercer`, `coerce()` at line 25, `toString` at 179, `toInt` at 200, `toFloat` at 221, `toBool` at 238, `toArray` further below, `toEnum` for backed enums.
- Attribute-aware layer: [libraries/better-data/src/DataObject.php:168-220](DataObject.php) — `coerceParameter`. Encryption check at 173-184, ListOf at 185-208, TypeCoercer fallback at 215-220.
- AttributeDrivenHydrator: [libraries/better-data/src/Internal/AttributeDrivenHydrator.php](AttributeDrivenHydrator.php) — the WP-side counterpart that uses fetcher closures and applies attribute-driven decryption / list coercion.
- `TypeCoercionException`: [libraries/better-data/src/Exception/TypeCoercionException.php](TypeCoercionException.php) — `for($cls, $field, $target, $value)`, `unsupportedType($cls, $field, $target)`.
- Encryption envelope detection: `EncryptionEngine::looksEncrypted` — string predicate that doesn't decrypt; safe to call on any string.
- Official documentation: <https://github.com/lonsdale201/better-data>
- Verified source paths:
  - `src/Attribute/Encrypted.php`
  - `src/Attribute/ListOf.php`
  - `src/Encryption/EncryptionEngine.php`
