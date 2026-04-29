---
name: bd-data-object
description: Add or modify DataObject subclasses inside the better-data
  library — the immutable, attribute-decorated DTOs that the whole
  library is built around. Every DTO is final readonly class extends
  DataObject with constructor-promoted typed parameters; sources hydrate
  via ::fromArray, sinks project via SinkProjection, the Presenter
  renders via HasPresenter trait. Important — every trailing constructor
  parameter MUST have a default. Without it, PHP Reflection reports
  isDefaultValueAvailable=false on earlier params too, and DataObject
  throws MissingRequiredFieldException at hydration. Also Secret fields
  default to ?Secret = null (never new Secret('')), encrypt requires the
  Secret type, and DTOs never grow public mutators (use ->with([...])).
  Use when adding a new DTO (UserProfileDto, OrderDto, plugin fixture),
  adding fields to an existing DTO, or reviewing a PR that introduces a
  new class extending DataObject. Triggers on extends DataObject,
  DataObject::fromArray, ->with(), HasWpSources, HasWpSinks,
  HasPresenter, MissingRequiredFieldException, "new DTO" in
  better-data.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/DataObject.php
  - src/Internal/AttributeDrivenHydrator.php
  - src/Source/HasWpSources.php
  - src/Sink/HasWpSinks.php
  - src/Presenter/HasPresenter.php
  - src/Attribute/MetaKey.php
  - src/Attribute/PostField.php
  - src/Attribute/Encrypted.php
  - src/Attribute/Sensitive.php
  - src/Attribute/ListOf.php
  - src/Attribute/DateFormat.php
  - src/Validation/Rule/Required.php
  - src/Secret.php
  - src/Exception/MissingRequiredFieldException.php
---

# better-data: Adding a DataObject

For library maintainers and downstream contributors who add or modify a `DataObject` subclass inside [better-data](../../README.md). Every typed shape — production DTOs in `src/`, test fixtures in `tests/Fixtures/`, plugin-level DTOs in the companion testbed — extends the abstract `DataObject` ([src/DataObject.php:36](DataObject.php)) and is the foundation that every engine (sources, sinks, validation, Presenter, REST schema, better-route bridge) reads against.

## Misconception this skill corrects

> "I'll just declare the constructor parameters with the types I want and set the values when I instantiate the class — defaults are optional."

In better-data, defaults are **load-bearing**. The hydration entry point `DataObject::fromArray` ([src/DataObject.php:47-79](DataObject.php)) iterates `ReflectionParameter`s and treats any parameter without `isDefaultValueAvailable()` (and without `allowsNull()`) as REQUIRED — throwing `MissingRequiredFieldException`. PHP's Reflection silently demotes earlier-positioned defaults to "required" if a later parameter has no default — so a single missing default at the end cascades and breaks `::fromArray` for the whole DTO.

Other AI-prone misconceptions:

- "I'll add `encrypt: true` to the `MetaKey` and store the property as a plain `string`." Wrong shape — `#[Encrypted]` writes ciphertext but the in-memory value is still a plain string that leaks via `var_dump` / `print_r` / `serialize`. Use `Secret` as the property type.
- "I'll add a public mutator method (`setEmail()`) to make consumer code more ergonomic." Wrong — every DTO is `final readonly class`. Mutation is `$dto->with(['email' => 'new@example.com'])` which returns a NEW instance. Mutators break the immutability contract that `Secret`, route-side projection, and Presenter caching all depend on.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a new `final readonly class extends DataObject` under `src/`, `tests/Fixtures/`, or the companion plugin's `Dto/`.
- Adding, removing, or retyping a constructor parameter on an existing DTO.
- The diff or PR title mentions: "new DTO", "add Dto", "add field to <X>Dto", "introduce <Foo>Dto".
- Reviewing a class that extends `DataObject` — use this skill's checklist before approving.
- Hitting `MissingRequiredFieldException` at runtime — usually the cause is a trailing parameter without a default.

## Workflow

### 1. Choose the file location

| What you're building | Path |
|---|---|
| Production DTO (library users hydrate it) | `src/<area>/<Name>Dto.php` |
| Test-only fixture | `tests/Fixtures/<Name>Dto.php` |
| Plugin-level DTO (companion testbed) | `wp-content/plugins/better-data-plugin-test/src/Dto/<Name>Dto.php` |

### 2. Declare the class

```php
namespace MyNamespace;

use BetterData\DataObject;
use BetterData\Source\HasWpSources;
use BetterData\Sink\HasWpSinks;
use BetterData\Presenter\HasPresenter;

final readonly class ProductDto extends DataObject
{
    use HasWpSources;
    use HasWpSinks;
    use HasPresenter;

    public function __construct(
        public int $id = 0,
        public string $post_title = '',
        public string $post_status = 'publish',
    ) {}
}
```

Three non-negotiables:

- `final` — never extended. The library does not support subclass-of-DTO patterns.
- `readonly` — every property is immutable. Hydration writes once via `newInstanceArgs`; consumers mutate via `->with(...)`.
- `extends DataObject` — gives you `::fromArray`, `::fromArrayValidated`, `->toArray()`, `->with()`, attribute-aware coercion.

### 3. Constructor-promoted parameters with defaults on every trailing one

The single most important rule. Every parameter must have either an explicit default OR be nullable. Recommended defaults by type:

| Type | Default |
|---|---|
| `int` | `= 0` |
| `string` | `= ''` |
| `float` | `= 0.0` |
| `bool` | `= false` |
| `array` | `= []` |
| `?DateTimeImmutable` | `= null` |
| `?Secret` | `= null` (NEVER `new Secret('')`) |
| `BackedEnum` | first case (`= MyEnum::Default`) or `= null` if nullable |

PHP-side reasoning: `ReflectionParameter::isDefaultValueAvailable()` returns false when ANY required parameter sits later in the signature. The hydrator at [src/DataObject.php:63-73](DataObject.php) checks this exact predicate; missing a default at position N silently breaks defaults at positions 0..N-1.

### 4. Choose the most-specific type possible

Better-data leans on type information for coercion, schema generation, and Presenter formatting. Be specific:

- `?DateTimeImmutable` over `?string` for timestamps — `TypeCoercer` parses ISO-8601 strings and `WC_DateTime` instances automatically.
- `Secret` over `string` for credentials — provides redacted `__toString`, throwing `__serialize`, leak-probe-tested behaviour.
- `BackedEnum` subclass over `string` for closed sets — `TypeCoercer::toEnum` resolves the value or throws `TypeCoercionException`.
- A specific `DataObject` subclass over `array` for nested structures — coercion delegates to `$class::fromArray()` recursively ([src/DataObject.php:195-197](DataObject.php)).

### 5. Decorate with attributes

Each attribute is a pure data carrier ([src/Attribute/](Attribute/)) read by one or more engines:

| Attribute | Read by | Purpose |
|---|---|---|
| `#[MetaKey('key', type: 'number', showInRest: true)]` | `OptionSink`, `PostSink::toMeta`, `RestSchemaBuilder` | Map property to a `meta_key` and REST schema |
| `#[PostField('post_date_gmt')]` | `PostSink`, `PostSource` | Rename DTO param to a `wp_posts` column |
| `#[UserField]`, `#[TermField]`, `#[Column]` | corresponding sink/source | Same but for users / terms / custom rows |
| `#[Sensitive]` | `Presenter::sensitiveFieldNames` | Redact in `present()->toArray()` |
| `#[Encrypted]` | `EncryptionEngine`, `SinkProjection`, `AttributeDrivenHydrator` | At-rest encryption — pair with `Secret` type |
| `#[ListOf(Element::class)]` | `DataObject::coerceParameter` | Coerce each array element into `Element` |
| `#[Rule\Required]`, `#[Rule\Email]`, `#[Rule\Min(0)]`, … | `BuiltInValidator` | Validation in `::fromArrayValidated` |
| `#[DateFormat('Y-m-d')]` | Presenter, sink projection | Non-default DateTime serialization |

### 6. Add the relevant traits

The traits are syntactic sugar over `PostSource`, `PostSink`, etc. — they make `Dto::fromPost($id)` and `$dto->saveAsPost()` work without manual instantiation:

```php
use HasWpSources;  // ::fromPost($id), ::fromUser($id), ::fromTerm($id), ::fromOption($name), ::fromRow($row)
use HasWpSinks;    // ->saveAsPost(), ->saveAsUser(), ->saveAsTerm(), ->saveAsOption(), ->saveAsRow()
use HasPresenter;  // ->present() returns a Presenter builder
```

Don't add a trait you won't use. Including `HasWpSinks` on a read-only fixture pollutes the API surface.

### 7. Realistic example

```php
namespace MyPlugin\Dto;

use BetterData\DataObject;
use BetterData\Secret;
use BetterData\Source\HasWpSources;
use BetterData\Sink\HasWpSinks;
use BetterData\Presenter\HasPresenter;
use BetterData\Attribute\MetaKey;
use BetterData\Attribute\PostField;
use BetterData\Attribute\Encrypted;
use BetterData\Attribute\Sensitive;
use BetterData\Validation\Rule;

final readonly class ProductDto extends DataObject
{
    use HasWpSources;
    use HasWpSinks;
    use HasPresenter;

    public function __construct(
        public int $id = 0,
        #[Rule\Required] public string $post_title = '',
        public string $post_status = 'publish',
        public string $post_type = 'product',
        #[PostField('post_date_gmt')] public ?\DateTimeImmutable $publishedAt = null,
        #[MetaKey('_price'), Rule\Min(0)] public float $price = 0.0,
        #[MetaKey('_sku'), Rule\Regex('/^[A-Z]{2,4}-\d+$/')] public string $sku = '',
        #[MetaKey('_api_key'), Encrypted] public ?Secret $apiKey = null,
        #[MetaKey('_notes'), Sensitive] public ?string $notes = null,
    ) {}
}
```

Verify the DTO works end-to-end:

```bash
vendor/bin/phpunit --filter ProductDto
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
```

## Critical rules

- **`final readonly class extends DataObject`.** Never skip `final`, never skip `readonly`, never skip `extends DataObject`. Tools and engines all assume this shape.
- **Every constructor parameter has a default OR is nullable.** Trailing-without-default cascades and breaks earlier defaults via PHP's Reflection. `int $id = 0`, `string $foo = ''`, `?T $bar = null`.
- **`?Secret = null`, never `new Secret('')`.** An empty-string Secret is worse than no Secret because consumers can't distinguish "intentionally absent" from "set to empty string".
- **`#[Encrypted]` requires `Secret` type.** The library tolerates plain-string + `#[Encrypted]` for backward compatibility but the in-memory value leaks. Always pair them.
- **Mutate via `->with([...])`, never via setter.** `with()` calls `static::fromArray(array_replace($snapshot, $changes))` ([src/DataObject.php:119-130](DataObject.php)), preserving immutability and re-running coercion.
- **One trait per concern.** `HasWpSources` for read, `HasWpSinks` for write, `HasPresenter` for output. Add only what you use.
- **Specific types over loose ones.** `?DateTimeImmutable` over `?string`, `BackedEnum` over `string`, nested `DataObject` over `array`.
- **Constructor parameter names == hydration keys.** `fromArray(['post_title' => 'X'])` sets `$post_title`. Renaming a param is a breaking change for every caller.

## Common mistakes

```php
// WRONG — trailing param without default cascades
public function __construct(
    public int $id = 0,
    public string $name = '',
    public ?\DateTimeImmutable $createdAt,  // no default → ALL params reported "required"
) {}
// Result: ProductDto::fromArray(['id' => 5]) throws MissingRequiredFieldException for "id"
// even though it has = 0 — because Reflection demoted it.

// RIGHT
public function __construct(
    public int $id = 0,
    public string $name = '',
    public ?\DateTimeImmutable $createdAt = null,
) {}

// WRONG — empty-string Secret as default
#[MetaKey('_api_key'), Encrypted] public Secret $apiKey = new Secret('')
// Looks tidy but: caller can't tell "user never set a key" from "user typed nothing".
// Worse, default expressions in promoted constructor parameters MUST be constants — this
// won't even parse. Use ?Secret = null.

// RIGHT
#[MetaKey('_api_key'), Encrypted] public ?Secret $apiKey = null,

// WRONG — #[Encrypted] on a plain string
#[MetaKey('_api_key'), Encrypted] public string $apiKey = ''
// Ciphertext goes to DB on save, decrypts back on hydration — but in-memory the value is a
// plain string. var_dump($dto), serialize($dto), error logs all leak it.

// RIGHT
#[MetaKey('_api_key'), Encrypted] public ?Secret $apiKey = null,

// WRONG — adding a public mutator
public function setEmail(string $email): void
{
    $this->email = $email;  // FATAL — readonly property, can't reassign after construction
}

// RIGHT
$updated = $dto->with(['email' => 'new@example.com']);

// WRONG — extending an existing DTO instead of composing
final readonly class PremiumProductDto extends ProductDto
{
    public function __construct(public bool $isPremium = false) {}
}
// Library assumes leaf classes; nesting breaks Reflection-based hydration in subtle ways
// (parent's parameters disappear when the child redefines __construct).

// RIGHT — make it a flat class with the extra field, or compose:
final readonly class PremiumProductDto extends DataObject
{
    public function __construct(
        public ProductDto $base = new ProductDto(),
        public bool $isPremium = false,
    ) {}
}

// WRONG — using snake_case keys on the call site but expecting camelCase params (or vice versa)
public function __construct(public ?\DateTimeImmutable $publishedAt = null) {}
ProductDto::fromArray(['published_at' => '...']);  // unmatched key — falls back to default null

// RIGHT — keys must match parameter names exactly. Use #[PostField] / #[Column] only for
// rename when projecting to/from WP storage; in PHP land, keep one canonical name.
```

## Cross-references

- Run **`bd-attribute`** when you need a NEW attribute that isn't in `src/Attribute/` yet — wiring an attribute into one engine is a footgun.
- Run **`bd-validation-rule`** when the DTO needs a validation rule that isn't in `src/Validation/Rule/`.
- Run **`bd-security`** when ANY new field is typed as `Secret` or carries `#[Encrypted]` / `#[Sensitive]` — security review is mandatory for those.

## What this skill does NOT cover

- Designing the storage shape itself (which `meta_key` to use, which sink to write to). DTO design is type-shape + attributes; storage decisions belong in `bd-source-adapter` / `bd-sink`.
- Writing the actual sink or source if better-data doesn't ship one. New WP store integration is `bd-source-adapter` + `bd-sink`.
- Validation logic beyond the built-in rules. New rules go through `bd-validation-rule`.
- Presenter customization. Adding a new fluent method or context flag is `bd-presenter`.
- Plugin-level DTO testing (companion plugin smoke / stress). Covered by `bd-companion-plugin`.

## References

- Base class: [libraries/better-data/src/DataObject.php:36](DataObject.php) — `abstract readonly class`. `fromArray` line 47, `coerceParameter` line 168, `with` line 119, `fromArrayValidated` line 154.
- Required-field guard: [libraries/better-data/src/DataObject.php:63-73](DataObject.php) — `isDefaultValueAvailable()` + `allowsNull()` check, then `MissingRequiredFieldException::for(...)`.
- Same predicate inside the attribute-aware hydrator: [libraries/better-data/src/Internal/AttributeDrivenHydrator.php:90-95](AttributeDrivenHydrator.php).
- Source/sink traits: [libraries/better-data/src/Source/HasWpSources.php:28](HasWpSources.php), [libraries/better-data/src/Sink/HasWpSinks.php:31](HasWpSinks.php), [libraries/better-data/src/Presenter/HasPresenter.php:15](HasPresenter.php).
- Attribute carriers: [libraries/better-data/src/Attribute/](Attribute/) — `MetaKey`, `PostField`, `UserField`, `TermField`, `Column`, `Sensitive`, `Encrypted`, `ListOf`, `DateFormat`.
- Built-in rules: [libraries/better-data/src/Validation/Rule/](Rule/) — `Required`, `Email`, `Url`, `Uuid`, `Min`, `Max`, `MinLength`, `MaxLength`, `Regex`, `OneOf`, `Callback`.
