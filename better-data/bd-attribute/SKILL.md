---
name: bd-attribute
description: Add a new declarative attribute to the better-data library
  (e.g. #[ArrayOf], #[Default], domain hint). Attributes live in
  src/Attribute/ as final readonly classes with constructor-promoted
  public properties — pure data carriers, never business logic. The
  failure mode that catches every contributor is "partial wiring" —
  declaring the attribute and reading it in ONE engine (e.g. only
  PostSink) while leaving Presenter, RestSchemaBuilder, and
  AttributeDrivenHydrator untouched. Stress scenarios have caught this
  pattern repeatedly. Every relevant engine must know about the new
  attribute, otherwise it silently degrades on the unwired path. Use
  when adding any new #[Foo] attribute that DTO authors will sprinkle
  on parameters / properties. Triggers on creating a class in
  src/Attribute/, applying #[Attribute(...)], references to
  AttributeDrivenHydrator / SinkProjection::prepareValue /
  RestSchemaBuilder / Presenter::sensitiveFieldNames in the diff.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/Attribute/MetaKey.php
  - src/Attribute/PostField.php
  - src/Attribute/UserField.php
  - src/Attribute/TermField.php
  - src/Attribute/Column.php
  - src/Attribute/Sensitive.php
  - src/Attribute/Encrypted.php
  - src/Attribute/ListOf.php
  - src/Attribute/DateFormat.php
  - src/Internal/AttributeDrivenHydrator.php
  - src/Internal/SinkProjection.php
  - src/Internal/RestSchemaBuilder.php
  - src/Sink/OptionSink.php
  - src/Presenter/Presenter.php
  - src/DataObject.php
---

# better-data: Adding a new attribute

For library maintainers introducing a new declarative hint that DTO authors will place on constructor parameters / properties — `#[ArrayOf]`, `#[Default]`, `#[ListOf]`-style markers, domain-specific decorators. The attribute itself is just a data carrier; the work is wiring it into every engine that reads attributes, because partial wiring silently degrades.

## Misconception this skill corrects

> "I'll add `src/Attribute/Foo.php` and read it in `PostSink` — done."

Attributes are read by **multiple** engines, and missing one leaves a feature that works on a happy path and fails subtly elsewhere. The original `encrypt` flag was meta-only; when options needed the same semantics, the partial wiring left a footgun until `#[Encrypted]` replaced it across `OptionSink`, `PostSink`, `AttributeDrivenHydrator`, `RestSchemaBuilder`, and Presenter — all in one go.

The engines that read attributes today, all need to know about a new attribute relevant to their concern:

- **Read-side hydration:** `AttributeDrivenHydrator` ([src/Internal/AttributeDrivenHydrator.php](AttributeDrivenHydrator.php)) and `DataObject::coerceParameter` ([src/DataObject.php:168](DataObject.php)).
- **Write-side projection:** `SinkProjection::prepareValue` ([src/Internal/SinkProjection.php:193](SinkProjection.php)) and `OptionSink::projectForStorage` ([src/Sink/OptionSink.php:119](OptionSink.php)).
- **REST / OpenAPI schema:** `RestSchemaBuilder::buildProperty` ([src/Internal/RestSchemaBuilder.php](RestSchemaBuilder.php)).
- **Output / display:** `Presenter::sensitiveFieldNames` and friends in [src/Presenter/Presenter.php](Presenter.php).

If your attribute is a write-time concern (encryption, formatting, slashing), all four still need to coordinate — read-side has to invert what write-side did.

## When to use this skill

Trigger when ANY of the following is true:

- Creating a new file under `src/Attribute/`.
- Adding `#[Attribute(...)]` to any class.
- The diff adds a new attribute reference (`#[NewThing]`) to a DTO and to the consumer engine.
- Reviewing a PR that wires an attribute into ONE engine — flag every other relevant engine as missing.

## Workflow

### 1. File and shape

```php
<?php

declare(strict_types=1);

namespace BetterData\Attribute;

use Attribute;

#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY)]
final readonly class Foo
{
    public function __construct(
        public string $name = '',
        public bool $required = false,
    ) {}
}
```

Three structural rules:

- **`TARGET_PARAMETER | Attribute::TARGET_PROPERTY`** — better-data DTOs use constructor-promoted parameters which appear as both. Restricting to just one breaks DTO authors who happen to use the other style.
- **`final readonly class`** — same immutability promise the DTOs make. Attribute instances are constructed once per Reflection lookup; mutation is meaningless.
- **Constructor-promoted public properties** — the attribute reads its own data via `$reflectionAttribute->newInstance()->propertyName`. No methods, no business logic.

### 2. Repeatable attributes

If a single parameter can carry the attribute multiple times (validation rules, multiple format hints), add `Attribute::IS_REPEATABLE`:

```php
#[Attribute(
    Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE
)]
final readonly class Tag
{
    public function __construct(public string $name) {}
}
```

Then on the read side, use `getAttributes(Tag::class)` (which returns `array<ReflectionAttribute>`) and iterate, instead of `getAttributes(Tag::class)[0] ?? null`.

### 3. Decide which engines need to know

| Engine | Read it when… | File |
|---|---|---|
| `AttributeDrivenHydrator` | Attribute affects how a stored value becomes a typed property (decryption, list-coercion) | `src/Internal/AttributeDrivenHydrator.php` |
| `DataObject::coerceParameter` | Attribute affects type coercion in `::fromArray` (the simple in-memory hydration path) | `src/DataObject.php:168` |
| `SinkProjection::prepareValue` | Attribute affects how a property becomes a storable scalar / array | `src/Internal/SinkProjection.php:193` |
| `OptionSink::projectForStorage` | Attribute changes how an option-sink-bound property serializes (different from meta) | `src/Sink/OptionSink.php:119` |
| `RestSchemaBuilder::buildProperty` | Attribute should appear in REST schema / OpenAPI output | `src/Internal/RestSchemaBuilder.php` |
| `Presenter::sensitiveFieldNames` / filters | Attribute affects what `present()->toArray()` shows | `src/Presenter/Presenter.php:481` |

A common trap: an attribute looks like a write-only concern (e.g. "always sanitize HTML on save") but the read side must *also* know, otherwise round-tripping a value through the DTO loses the marker. If you encrypt, you must also decrypt. If you redact, you must also reveal. Symmetric end-to-end is non-negotiable.

### 4. Wiring example — adding `#[Slug]`

Suppose you want a marker that says "this string is a URL slug; lowercase + dashes on save, surface as 'string' with format 'slug' in REST".

The attribute file:

```php
namespace BetterData\Attribute;

use Attribute;

#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY)]
final readonly class Slug
{
    public function __construct(public int $maxLength = 64) {}
}
```

Write side — `SinkProjection::prepareValue`:

```php
// Inside SinkProjection::prepareValue, before the generic scalar branch:
$slug = self::firstAttribute($parameter, Slug::class);
if ($slug !== null && is_string($value)) {
    $value = \strtolower(\preg_replace('/[^a-z0-9-]+/i', '-', $value) ?? '');
    $value = \mb_substr($value, 0, $slug->maxLength);
}
```

Read side — `AttributeDrivenHydrator`: nothing to do (slug stays a string round-trip).

Schema side — `RestSchemaBuilder::buildProperty`:

```php
// Inside the property iteration:
if ($parameter->getAttributes(Slug::class)) {
    $schema['format'] = 'slug';
}
```

Presenter side: nothing unless you want to surface the slug constraint in admin UI (probably not).

Unit tests: at minimum a `tests/Unit/SlugAttributeTest.php` covering write-projection (slug shape preserved), schema output (`format: 'slug'`), and a hydration round-trip (slug-shaped string in → unchanged slug-shaped string out).

### 5. Document the composition

Each attribute's docblock answers three questions:

1. **What does it do?** One sentence.
2. **Where is it read?** List the engines explicitly — sinks, sources, hydrator, schema builder, Presenter.
3. **What composes with it?** Pairs naturally with `Secret`? Conflicts with `#[Encrypted]`? Has to be combined with `#[MetaKey]`?

Example from `Encrypted.php`:

```php
/**
 * At-rest encryption marker for DataObject parameters / properties.
 *
 * Read by:
 *  - SinkProjection::prepareValue (write: encrypts before storage)
 *  - AttributeDrivenHydrator (read: decrypts after fetch)
 *  - RestSchemaBuilder (schema: reports as 'string', writeOnly: true)
 *
 * Pairs naturally with `public ?Secret $field` typing — strongly
 * preferred over plain string for in-memory leak prevention.
 */
```

### 6. Run the full check after wiring

```bash
vendor/bin/phpunit
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
```

All three must be green. Then run the companion plugin's stress suite to surface live-WP issues:

```bash
wp better-data stress
```

A stress finding labelled `NOTE` for an attribute discrepancy is acceptable to ship; `FAIL` is not.

## Critical rules

- **Lives in `src/Attribute/`.** Other folders are reserved.
- **`final readonly class` with public promoted properties only.** No methods, no business logic — pure data carrier.
- **`TARGET_PARAMETER | TARGET_PROPERTY` always.** Restricting to one breaks promoted-constructor DTOs.
- **Symmetric end-to-end wiring.** Write-side encryption → read-side decryption. Write-side slugify → read-side accept either canonicalized or raw. If the attribute changes a value on save, the read side must accept (or invert) the change.
- **Wire ALL relevant engines in one PR.** Splitting "attribute landed in v1.2, sink wired in v1.3, schema in v1.4" leaves users on v1.2 with a footgun. Either it's complete or it's not in `main`.
- **Document composition in the docblock.** What pairs with what, what conflicts.
- **Unit tests cover every wired engine.** A passing test for write-projection alone doesn't prove read-side does the inverse.
- **Repeatable only when genuinely needed.** Validation rules need it; most attributes don't. Default to non-repeatable.

## Common mistakes

```php
// WRONG — business logic inside the attribute
#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY)]
final readonly class Encrypted
{
    public function encrypt(string $plaintext): string
    {
        return EncryptionEngine::encrypt($plaintext);
    }
}
// Attributes are loaded reflection-side, sometimes before the engine is bootstrapped.
// Embedding logic blurs the data/engine boundary.

// RIGHT — pure carrier
#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY)]
final readonly class Encrypted
{
    public function __construct(public ?string $algorithm = null) {}
}
// Logic lives in EncryptionEngine + SinkProjection consumer code.

// WRONG — wired into PostSink only
// (file: src/Sink/PostSink.php — adds slug projection)
// (no change to OptionSink, RestSchemaBuilder, AttributeDrivenHydrator)
// Result: option-stored DTOs silently skip slug normalization.

// RIGHT — wire all relevant engines in the same PR

// WRONG — only TARGET_PROPERTY, not TARGET_PARAMETER
#[Attribute(Attribute::TARGET_PROPERTY)]
final readonly class Foo {}
// PHP cannot apply this to constructor-promoted parameters.
// (Promoted parameters technically count as both, but the attribute target check is strict.)
// DTO authors using `public string $foo = ''` style get a fatal.

// RIGHT — both targets
#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY)]
final readonly class Foo {}

// WRONG — asymmetric wiring (encrypt without decrypt)
// SinkProjection::prepareValue calls EncryptionEngine::encrypt
// AttributeDrivenHydrator does NOT call EncryptionEngine::decrypt
// Result: stored ciphertext, hydrated ciphertext-as-string. Looks like garbage on read.

// RIGHT — both sides know about #[Encrypted]

// WRONG — extending an attribute
final readonly class StrongEncrypted extends Encrypted {}
// Attributes don't compose via inheritance well with reflection; engines look up the exact
// class name. Use a new attribute or a property on the existing one.

// RIGHT — add a parameter to the existing attribute, or create a parallel one
final readonly class Encrypted
{
    public function __construct(public string $algorithm = 'aes-256-gcm') {}
}
```

## Cross-references

- Run **`bd-data-object`** when adding a DTO field that uses a NEW attribute — DTO design + attribute creation often go together.
- Run **`bd-sink`** when the new attribute affects WRITE-side projection — the sink + attribute must be wired together.
- Run **`bd-security`** when the new attribute touches `Secret`, `#[Encrypted]`, redaction, or any leak-prevention path.

## What this skill does NOT cover

- Validation rules (`#[Rule\Foo]`) — those live in `src/Validation/Rule/` and have their own contract (`RuleInterface`, `check()` returning `?string`). Use `bd-validation-rule`.
- Configuring an existing attribute — that's just DTO authoring (`bd-data-object`).
- Removing an attribute — handled as a deprecation cycle outside this skill's scope.
- Cross-attribute interaction matrices — document conflicts in attribute docblocks; engines decide precedence at the wiring site.

## References

- Attribute folder: [libraries/better-data/src/Attribute/](Attribute/) — `MetaKey`, `PostField`, `UserField`, `TermField`, `Column`, `Sensitive`, `Encrypted`, `ListOf`, `DateFormat` as reference implementations.
- Hydration consumers: [libraries/better-data/src/Internal/AttributeDrivenHydrator.php](AttributeDrivenHydrator.php), [libraries/better-data/src/DataObject.php:168-200](DataObject.php) (`coerceParameter`).
- Sink consumers: [libraries/better-data/src/Internal/SinkProjection.php:193](SinkProjection.php) (`prepareValue`), [libraries/better-data/src/Sink/OptionSink.php:119](OptionSink.php) (`projectForStorage`).
- Schema consumer: [libraries/better-data/src/Internal/RestSchemaBuilder.php:114-220](RestSchemaBuilder.php) — `buildProperty` + `applyRuleAttribute`.
- Presenter consumer: [libraries/better-data/src/Presenter/Presenter.php:481](Presenter.php) (`sensitiveFieldNames`).
- PHP Attribute docs: [https://www.php.net/manual/en/language.attributes.php](https://www.php.net/manual/en/language.attributes.php).
