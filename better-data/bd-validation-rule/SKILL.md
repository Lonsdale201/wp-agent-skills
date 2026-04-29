---
name: bd-validation-rule
description: Add a new validation rule to better-data — implement
  the Rule interface (NOT "RuleInterface"; the actual interface in
  src/Validation/Rule.php is named Rule), live in src/Validation/Rule/,
  and follow the canonical contract — check(mixed, string, DataObject)
  returns null on pass or a short error string on fail; rules other
  than Required treat null as skip so nullable fields don't false-
  positive. Each rule is also a PHP attribute (TARGET_PARAMETER |
  TARGET_PROPERTY | IS_REPEATABLE), is final readonly, holds zero
  business logic outside check(), and surfaces in JSON Schema via
  RestSchemaBuilder::applyRuleAttribute when relevant. Use when
  introducing a rule that isn't in src/Validation/Rule/ (Email, Url,
  Uuid, Min, Max, MinLength, MaxLength, Regex, OneOf, Required,
  Callback). Triggers on creating a class implementing Rule, adding a
  new #[Rule\Foo] attribute, or extending applyRuleAttribute.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/Validation/Rule.php
  - src/Validation/Rule/Required.php
  - src/Validation/Rule/Email.php
  - src/Validation/Rule/Url.php
  - src/Validation/Rule/Uuid.php
  - src/Validation/Rule/Min.php
  - src/Validation/Rule/Max.php
  - src/Validation/Rule/MinLength.php
  - src/Validation/Rule/MaxLength.php
  - src/Validation/Rule/Regex.php
  - src/Validation/Rule/OneOf.php
  - src/Validation/Rule/Callback.php
  - src/Validation/BuiltInValidator.php
  - src/Validation/ValidationResult.php
  - src/Internal/RestSchemaBuilder.php
---

# better-data: Adding a validation rule

For library maintainers introducing a new built-in validation rule (`Rule\CreditCard`, `Rule\PhoneE164`, `Rule\StrongPassword`, etc.). Rules are tiny, pure, attribute-decorated classes that the validator iterates per field. The contract is small but precise — getting it wrong (throwing instead of returning, applying to nulls, embedding side effects) breaks compositional rules and surfaces messy errors to consumers.

## Misconception this skill corrects

> "I'll throw an exception with the validation error message inside `check()` — easier than a return-string protocol."

The contract at [src/Validation/Rule.php:25-28](Rule.php) is:

```php
interface Rule
{
    public function check(mixed $value, string $fieldName, DataObject $subject): ?string;
}
```

`null` = pass, short error string = fail. Throwing is the engine's prerogative, not an individual rule's. The `BuiltInValidator` ([src/Validation/BuiltInValidator.php](BuiltInValidator.php)) iterates rules across many fields and accumulates errors; an exception would short-circuit the entire validation pass and return a single error instead of the complete failure list — which is what `ValidationResult` is for.

Other AI-prone misconceptions:

- "Rule\Foo extends Rule\Email." Wrong — rules don't compose via inheritance; PHP's attribute reflection looks up exact class names. Add a new rule.
- "The interface is RuleInterface." Wrong — it's literally `Rule`. The AGENTS.md docs in older drafts referred to it as `RuleInterface`, but the actual file is `src/Validation/Rule.php` and the interface is `Rule`. Use that name.
- "Rules apply to null values too — I want to validate that `?Email $email = null` is non-null." Wrong — convention is `null` means "skip"; if you want non-null, add `#[Rule\Required]` *also*. Single responsibility.

## When to use this skill

Trigger when ANY of the following is true:

- Creating a new file under `src/Validation/Rule/`.
- The diff adds `implements Rule` (or implements the deprecated `RuleInterface`).
- Adding a new `#[Rule\Foo]` attribute to a DTO and you can't find `Foo` in `src/Validation/Rule/`.
- Reviewing a PR that throws inside a `check()` method — flag and convert to return-string.

## Workflow

### 1. File layout

```
src/Validation/Rule/CreditCard.php
tests/Unit/Validation/Rule/CreditCardTest.php  ← optional, or co-located
tests/Unit/ValidationTest.php                   ← shared rule tests
```

### 2. Class shape (use Required.php as the template)

```php
<?php

declare(strict_types=1);

namespace BetterData\Validation\Rule;

use Attribute;
use BetterData\DataObject;
use BetterData\Validation\Rule;

#[Attribute(Attribute::TARGET_PARAMETER | Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final readonly class CreditCard implements Rule
{
    public function __construct(
        public bool $allowTestNumbers = false,
    ) {}

    public function check(mixed $value, string $fieldName, DataObject $subject): ?string
    {
        if ($value === null) {
            return null; // null = skip; pair with #[Required] if presence matters
        }

        if (!\is_string($value)) {
            return 'must be a string of digits';
        }

        $digits = \preg_replace('/\s+/', '', $value);

        if ($digits === null || !\preg_match('/^\d{12,19}$/', $digits)) {
            return 'must be a valid card number';
        }

        if (!self::luhnPasses($digits)) {
            return 'failed checksum';
        }

        if (!$this->allowTestNumbers && self::isTestCard($digits)) {
            return 'test card numbers are not accepted';
        }

        return null;
    }

    private static function luhnPasses(string $digits): bool { /* ... */ }
    private static function isTestCard(string $digits): bool { /* ... */ }
}
```

Five structural rules:

1. **`final readonly class`** — same immutability the rest of the lib enforces.
2. **`implements Rule`** — the interface from `BetterData\Validation`. Not `RuleInterface`, not your own.
3. **`#[Attribute(...)] | IS_REPEATABLE`** — repeatable so a single field can carry both `#[Rule\Required]` and `#[Rule\Email]`.
4. **Constructor-promoted public properties for parameters** (`allowTestNumbers` here). Same data-carrier shape as other attributes.
5. **`check()` returns `?string`** — null on pass, short message on fail. Messages are short, lowercase-by-convention, framework-agnostic; consumers wrap them in localized strings if needed.

### 3. Null handling (the convention)

Look at the difference between [Required.php:14-20](Required.php) and [Email.php:14-20](Email.php):

```php
// Required: null is the failure case
if ($value === null) {
    return 'is required';
}

// Email (and every other rule): null is "skip"
if ($value === null) {
    return null;
}
```

Reason: a `?Email $email = null` field with `#[Rule\Email]` is legitimately "no email yet". If `Email` rejected null, you'd be forced to make the field non-nullable. Only `Required` treats null as failure — every other rule treats null as "not my concern; pair me with `Required` if you want presence enforcement".

Your new rule MUST follow this. Skip null first.

### 4. Type-narrow before checking

Most rules want a string / int / array. Narrow early and return a type-mismatch message:

```php
if (!\is_string($value)) {
    return 'must be a string';  // not "is not a string" — keep the verb tone consistent
}
```

This avoids `TypeError` deep inside the check logic if a DTO author somehow lands a non-string in a `Rule\Email`-decorated field.

### 5. Cross-field rules use `$subject`

The third argument is the full DataObject snapshot at validation time:

```php
final readonly class MatchesField implements Rule
{
    public function __construct(public string $other) {}

    public function check(mixed $value, string $fieldName, DataObject $subject): ?string
    {
        $snapshot = $subject->toArray();
        if (!isset($snapshot[$this->other])) {
            return "matches field '{$this->other}' which is missing";
        }
        if ($snapshot[$this->other] !== $value) {
            return "must match '{$this->other}'";
        }
        return null;
    }
}
```

Use `$subject->toArray()` not direct property access — `Secret` and other rich types appear as their canonical array form there.

### 6. Surface in JSON Schema (when applicable)

If the rule maps to a JSON Schema constraint, add a case in `RestSchemaBuilder::applyRuleAttribute` ([src/Internal/RestSchemaBuilder.php:220-260](RestSchemaBuilder.php)):

```php
// Inside the switch on $name:
case CreditCard::class:
    $schema['format'] = 'credit-card';  // or pattern, depending on convention
    break;
```

The pattern for built-ins:

| Rule | JSON Schema key |
|---|---|
| `Email` | `format: 'email'` |
| `Url` | `format: 'uri'` |
| `Uuid` | `format: 'uuid'` |
| `MinLength(n)` | `minLength: n` |
| `MaxLength(n)` | `maxLength: n` |
| `Min(n)` | `minimum: n` |
| `Max(n)` | `maximum: n` |
| `Regex(pattern)` | `pattern: <stripped delimiters>` |
| `OneOf(values)` | `enum: [values]` |

If your rule has no schema equivalent (e.g. `Callback` runs arbitrary PHP), don't add a case — `applyRuleAttribute` will pass through.

### 7. Unit tests cover four paths

`tests/Unit/ValidationTest.php` (or co-located `tests/Unit/Validation/Rule/CreditCardTest.php`) MUST cover:

```php
public function test_it_passes_a_valid_value(): void { /* check() returns null */ }
public function test_it_fails_an_explicit_invalid_value(): void { /* check() returns string */ }
public function test_it_skips_null(): void { /* unless this IS Rule\Required */ }
public function test_it_handles_the_edge_case_implied_by_its_name(): void
{
    // For Email: a string that's almost an email
    // For Min(0): exact-zero (boundary)
    // For Required: empty string + empty array (both fail per the impl)
}
```

Run:

```bash
vendor/bin/phpunit --filter CreditCardTest
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
```

## Critical rules

- **`implements Rule`** — interface name is `Rule`, file `src/Validation/Rule.php`. Not `RuleInterface`.
- **`check()` returns `?string`.** Throwing breaks `BuiltInValidator`'s accumulation pass.
- **Skip null first** (except in `Required`). Convention: rules treat null as "not applicable" so they compose with nullable fields.
- **`final readonly class` with `IS_REPEATABLE`.** A single field commonly carries multiple rules.
- **No runtime configuration in rules.** No environment reads, no global lookups, no WP function calls. Rules are pure and testable without WP.
- **Short error messages, framework-agnostic tone.** "must not be blank", "must be a valid email address", "must match 'passwordConfirmation'". Consumer code localizes.
- **Add a JSON Schema mapping if applicable.** Rules without schema equivalents are fine; partial mapping creates surprise.
- **Cover four test paths**: pass, fail, null handling, edge case named in the rule.

## Common mistakes

```php
// WRONG — throwing instead of returning
public function check(mixed $value, string $fieldName, DataObject $subject): ?string
{
    if (!is_email($value)) {
        throw new \InvalidArgumentException('not an email');  // breaks BuiltInValidator
    }
    return null;
}

// RIGHT
return is_email($value) ? null : 'must be a valid email address';

// WRONG — applies to nulls
public function check(mixed $value, string $fieldName, DataObject $subject): ?string
{
    if ($value === null) {
        return 'must be set';  // if you want presence, the user adds #[Required], not in your rule
    }
    // ...
}

// RIGHT — null is skip
if ($value === null) {
    return null;
}

// WRONG — environment reads in rules
public function check(mixed $value, string $fieldName, DataObject $subject): ?string
{
    $strict = (bool) ($_ENV['STRICT_VALIDATION'] ?? false);  // 🔴 rule is no longer pure
    return $strict ? $this->strictCheck($value) : $this->lenientCheck($value);
}

// RIGHT — make it a constructor parameter
public function __construct(public bool $strict = false) {}

// WRONG — long error message that mixes localization concerns
return 'A megadott érték nem érvényes hitelkártyaszám, kérjük adjon meg egy 13-19 számjegyből álló kártyaszámot.';
// Rules emit short framework-agnostic strings. Localization happens in the consumer (admin UI,
// REST response middleware) which can swap to the user's language.

// RIGHT
return 'must be a valid card number';

// WRONG — implementing the wrong interface name
final readonly class MyRule implements RuleInterface { /* ... */ }
// Class doesn't exist. The interface is BetterData\Validation\Rule.

// RIGHT
final readonly class MyRule implements Rule { /* ... */ }

// WRONG — partial schema mapping
case CreditCard::class:
    // (forgot to set anything on $schema)
    break;
// Result: rule runs at validation time but disappears from REST schema — consumer apps don't
// know the constraint is there.

// RIGHT
case CreditCard::class:
    $schema['format'] = 'credit-card';
    break;
```

## Cross-references

- Run **`bd-attribute`** when adding a NEW non-rule attribute. Rules ARE attributes too, but live under `src/Validation/Rule/` and follow this skill's contract.
- Run **`bd-data-object`** when the new rule is being applied to a new DTO field — the DTO design and the rule design often co-evolve.
- Run **`bd-better-route-bridge`** when the rule should appear in REST response error formatting — the bridge wraps `ValidationResult` for HTTP error envelopes.

## What this skill does NOT cover

- Validation result formatting / localization. `BuiltInValidator` accumulates `ValidationResult`; UI / API layers translate.
- Async / I/O-bound validation (e.g. "is this email already in the DB?"). Rules are sync and pure; do that work in a controller layer.
- Conditional validation ("only validate when other field is X"). Use `Rule\Callback` or build a domain-specific rule that reads `$subject->toArray()`.
- Validation engine internals — replacing `BuiltInValidator` with a custom engine is out of scope.
- Internationalization of rule messages. Library messages stay English; consumers translate via the field-name + message pair.

## References

- Rule interface: [libraries/better-data/src/Validation/Rule.php:25-28](Rule.php) — `check(mixed, string, DataObject): ?string`. Note: interface name is `Rule`, NOT `RuleInterface`.
- Reference rule (null-as-fail): [libraries/better-data/src/Validation/Rule/Required.php:14-30](Required.php).
- Reference rule (null-as-skip): [libraries/better-data/src/Validation/Rule/Email.php:14-25](Email.php).
- Built-in rule directory: [libraries/better-data/src/Validation/Rule/](Rule/) — `Required`, `Email`, `Url`, `Uuid`, `Min`, `Max`, `MinLength`, `MaxLength`, `Regex`, `OneOf`, `Callback` as templates.
- Schema mapping: [libraries/better-data/src/Internal/RestSchemaBuilder.php:220-260](RestSchemaBuilder.php) — `applyRuleAttribute` switch.
- Validator: [libraries/better-data/src/Validation/BuiltInValidator.php](BuiltInValidator.php) — accumulates `ValidationResult` across rules.
