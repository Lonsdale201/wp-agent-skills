---
name: bd-presenter
description: Extend the better-data Presenter — add a fluent builder
  method (rename, mask, format, compute) or a PresentationContext flag.
  The Presenter is a mutable builder around a readonly DTO — each
  fluent method mutates internal state ($this->only, $this->hidden,
  $this->computed, etc.) and returns $this for chaining; the wrapped
  DataObject NEVER mutates. CollectionPresenter records every
  configurer as a closure on $this->configurers and replays them per
  item in toArray. Critical contract — any new method that emits
  values from the DTO MUST honor sensitiveFieldNames() (the Sensitive
  attribute + Secret type list); a method that bypasses redaction is a
  security regression. Localized strings need LocaleScope::runIn so
  withLocale() works. Use when adding mask, formatDate-like, hideIf,
  context-aware methods. Triggers on changes to Presenter.php /
  CollectionPresenter.php / PresentationContext.php / Formatter/.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-data"
  wp-skills-plugin-version-tested: "phase-9"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-04-29"
---

# better-data: Extending the Presenter

For library maintainers adding output transformations to the better-data Presenter — a new fluent builder method (`mask`, `formatPhone`, `hideIfBlank`), a `PresentationContext` flag (admin vs REST vs export), or a Formatter helper. The Presenter is the read-side projection layer between a `DataObject` and whatever consumes it (admin UI, REST response, audit log).

## Misconception this skill corrects

> "The Presenter is `readonly` like the DataObject — every fluent method must clone and return a new instance."

Wrong. The DataObject is `readonly`, the Presenter is intentionally a **mutable builder**. Look at [src/Presenter/Presenter.php:65-89](Presenter.php) — `class Presenter` (not `final readonly class`), with private mutable properties `$only`, `$hidden`, `$rename`, `$computed`, `$presets`, `$includeSensitive`. Each fluent method assigns to `$this->...` and returns `$this`. This is deliberate — chained calls share state, repeated calls override, and there's no clone overhead.

What IS immutable: `$this->dto` is `protected readonly DataObject` and never gets reassigned. The builder mutates ITS state to control HOW the DTO is rendered; the DTO itself stays untouched.

The "don't mutate permanently" rule from older docs means: don't introduce a method whose effect can't be reset by a subsequent method or context swap. A method that pushes to a private array is fine; a method that writes to a static cache or to the wrapped DTO would be a regression.

Other AI-prone misconceptions:

- "I'll add `getSecretRevealed()` so consumers don't need `->reveal()` boilerplate." Wrong — the explicit `$dto->field->reveal()` inside a `compute()` closure IS the security audit point. Adding a bypass method is the same regression as a debug-mode log of secrets.
- "CollectionPresenter is a separate Presenter; I just add the method there too with copy/paste logic." Wrong — `CollectionPresenter` records each configurer as a closure on `$this->configurers` ([src/Presenter/CollectionPresenter.php:30-44](CollectionPresenter.php)) and replays it on every item via the per-item Presenter. The pattern is `$this->configurers[] = static fn (Presenter $p) => $p->yourMethod(...);`. No business logic on the collection side.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a fluent method to `Presenter` / `CollectionPresenter` (`hideIfBlank`, `truncate`, `defaultIfNull`).
- Adding a flag / accessor to `PresentationContext` (`isExport()`, `currentUserId()`).
- Adding a Formatter helper under `src/Presenter/Formatter/`.
- Reviewing a PR that emits DTO values without going through `sensitiveFieldNames()` redaction.

## Workflow

### 1. Decide: per-call (Presenter) or per-context (PresentationContext)

- **Per-call (fluent method):** the caller decides each invocation. Examples: `only(['email'])`, `hide('apiKey')`, `formatDate('createdAt', 'Y-m-d')`. Lives on `Presenter` + mirrored on `CollectionPresenter`.
- **Per-context (PresentationContext):** the entire rendering environment changes. Examples: REST response vs admin table vs export CSV. Lives on `PresentationContext`.

Most additions are per-call. Per-context additions are rarer and require updating `PresentationContext::rest()`, `::admin()`, `::none()`, etc.

### 2. Per-call method shape

Look at existing methods like `hide` ([Presenter.php:164](Presenter.php)) or `rename` ([Presenter.php:204](Presenter.php)):

```php
public function hideIfBlank(string|array $field): static
{
    $fields = (array) $field;
    foreach ($fields as $f) {
        $this->hidden[$f] = static fn (PresentationContext $ctx, mixed $value): bool
            => $value === null || $value === '' || $value === [];
    }
    return $this;
}
```

Six structural rules:

1. **Return `static`** (not `self`, not `Presenter`) so subclasses chain correctly.
2. **Parameter naming follows existing conventions** — `$field` for single, `$fields` for list, `$capability` for cap names, `$as` for output-key rename.
3. **Mutate `$this->...` private state.** Don't add new public mutable state.
4. **Return `$this`** at the end of every fluent method.
5. **Single concern per method.** `hideIfBlank` doesn't also rename. Compose at the call site: `->hideIfBlank('foo')->rename('foo', 'bar')`.
6. **Resettable.** A subsequent call to a related method (or a `context()` swap) should be able to undo the effect. Methods that push to `$this->hidden[$field]` work; methods that mutate the wrapped `$this->dto` would not.

### 3. Mirror the method on `CollectionPresenter`

Every per-call method gets a mirror at [src/Presenter/CollectionPresenter.php](CollectionPresenter.php) that records a configurer:

```php
public function hideIfBlank(string|array $field): self
{
    $this->configurers[] = static fn (Presenter $p): Presenter => $p->hideIfBlank($field);
    return $this;
}
```

Reason: `CollectionPresenter::toArray` ([line 142-155](CollectionPresenter.php)) creates a fresh `Presenter` per DTO and replays every configurer on it. The configurers must be closures (not method references) so they bind the args at the time of the collection-level call, not at the per-item replay.

Skip the mirror only if the method is meaningless for collections (rare).

### 4. Honor `sensitiveFieldNames` for any value-emitting method

Verified in [src/Presenter/Presenter.php:481-510](Presenter.php) — `sensitiveFieldNames()` walks both properties AND constructor parameters, looking for `#[Sensitive]` attribute OR `Secret`-typed parameters, and returns the field-name list. The `toArray` path uses this list to redact (`'***'` for Secret, omit for Sensitive plain string unless `includeSensitive([...])` opted in).

Any new method that emits a value from the DTO must consult this list. Example — a hypothetical `mask` method:

```php
public function mask(string $field, callable $masker): static
{
    $this->presets[$field] = function (mixed $value, PresentationContext $ctx) use ($field, $masker) {
        // sensitive fields go through normal redaction unless explicitly included
        if (in_array($field, $this->sensitiveFieldNames(), true)
            && !in_array($field, $this->includeSensitive, true)) {
            return $this->redactSensitive($value);  // existing helper, look at toArray for the canonical call
        }
        return $masker($value);
    };
    return $this;
}
```

A method that bypasses this is a leak path — `Secret` typed values shouldn't quietly appear via your new fluent helper.

### 5. Localized strings: wrap through `LocaleScope::runIn`

If your method emits localized text (e.g. a translated status label, a humanized number with locale-specific separators), wrap the locale-sensitive logic:

```php
public function formatStatus(string $field, ?string $as = null): static
{
    $this->presets[$field] = function (mixed $value, PresentationContext $ctx): string {
        return LocaleScope::runIn(
            $ctx->locale,
            static fn (): string => __( ucfirst((string) $value), 'my-textdomain' )
        );
    };
    if ($as !== null) {
        $this->rename[$field] = $as;
    }
    return $this;
}
```

Reason: a consumer that calls `->context(PresentationContext::rest()->withLocale('hu_HU'))` expects rendered text in Hungarian even if the request came in under another locale. `LocaleScope` switches WP's locale for the closure scope and restores after.

### 6. Formatters live in `src/Presenter/Formatter/`

If the transformation is reusable (date formatting, currency formatting, phone-number formatting), implement the logic in a `Formatter` class and have the fluent method call it:

```
src/Presenter/Formatter/
├── DateFormatter.php
├── CurrencyFormatter.php
└── PhoneFormatter.php  ← your new one
```

The fluent method becomes a thin glue:

```php
public function formatPhone(string $field, ?string $as = null, ?string $region = null): static
{
    $this->presets[$field] = static function (mixed $value, PresentationContext $ctx) use ($region): string {
        return PhoneFormatter::format($value, $region ?? $ctx->locale);
    };
    if ($as !== null) {
        $this->rename[$field] = $as;
    }
    return $this;
}
```

### 7. Testing

Per-call methods have unit tests covering:

- Default behavior (no method called).
- Method called once.
- Method called twice (override / append behavior — depends on the method's semantics).
- Interaction with `Sensitive` / `Secret` (redaction not bypassed).
- `CollectionPresenter` replay produces the same per-item output as `Presenter` directly.

```bash
vendor/bin/phpunit --filter Presenter
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
```

## Critical rules

- **`Presenter` is a mutable builder; the wrapped DTO is `readonly`.** Mutate `$this->only`, `$this->hidden`, `$this->presets`, etc. Never mutate `$this->dto` or the DTO it points to.
- **Fluent methods return `static`** (not `self`, not `Presenter`) so subclasses chain.
- **Mirror every per-call method on `CollectionPresenter`** as a recorded closure on `$this->configurers`.
- **Honor `sensitiveFieldNames()` for any value-emitting method.** A new path that bypasses redaction is a security regression.
- **`Secret` is revealed only via explicit `$dto->field->reveal()`** inside a `compute()` closure. Don't add convenience bypasses.
- **Wrap localized text in `LocaleScope::runIn($ctx->locale, fn () => ...)`** so `withLocale()` works.
- **Reusable transformations live as `Formatter` classes** under `src/Presenter/Formatter/`. Fluent method is thin glue.
- **Single concern per fluent method.** `formatDate` doesn't also rename — chain `->formatDate(...)->rename(...)`.

## Common mistakes

```php
// WRONG — cloning per call (fights the builder pattern)
public function hide(string $field): static
{
    $clone = clone $this;
    $clone->hidden[$field] = ...;
    return $clone;
}

// RIGHT — mutate $this, return $this
public function hide(string $field): static
{
    $this->hidden[$field] = ...;
    return $this;
}

// WRONG — mutating the DTO
public function uppercase(string $field): static
{
    $this->dto->{$field} = strtoupper($this->dto->{$field});  // FATAL — readonly property
    return $this;
}

// RIGHT — preset the rendered value
public function uppercase(string $field): static
{
    $this->presets[$field] = static fn (mixed $value): string => \mb_strtoupper((string) $value);
    return $this;
}

// WRONG — secret bypass
public function revealAllSecrets(): static
{
    $this->includeSensitive = $this->sensitiveFieldNames();  // WRONG: silent reveal of all Secret fields
    return $this;
}

// RIGHT — caller is explicit per field
$presenter->includeSensitive(['apiKey'])->compute('apiKey', fn (Dto $d) => $d->apiKey?->reveal());

// WRONG — forgetting CollectionPresenter mirror
// (added formatPhone to Presenter, didn't add to CollectionPresenter)
// Result: Dto::for($single)->formatPhone(...) works, ::forCollection([...])->formatPhone(...) fatals.

// RIGHT — both sides
// Presenter::formatPhone — implementation
// CollectionPresenter::formatPhone — $this->configurers[] = fn (Presenter $p) => $p->formatPhone(...)

// WRONG — locale unaware string emission
public function formatStatus(string $field): static
{
    $this->presets[$field] = static fn (string $v) => __( ucfirst($v), 'plugin' );
    // Translates in current request locale; ignores ->withLocale('hu_HU') on context.
    return $this;
}

// RIGHT — wrap in LocaleScope::runIn
public function formatStatus(string $field): static
{
    $this->presets[$field] = static function (string $v, PresentationContext $ctx) {
        return LocaleScope::runIn($ctx->locale, fn () => __( ucfirst($v), 'plugin' ));
    };
    return $this;
}

// WRONG — multi-concern method
public function formatDateAndRename(string $field, string $format, string $as): static
{
    // Encourages copy-paste later when consumers want one but not both.
}

// RIGHT — chain instead
->formatDate('createdAt', 'Y-m-d')->rename('createdAt', 'created_at')

// WRONG — closure captures $this->dto by reference and reads through it
public function annotate(string $field): static
{
    $this->presets[$field] = function (mixed $value) {
        return $value . ' (id: ' . $this->dto->id . ')';
    };
    // Works for the immediate render. But $this->dto is the per-item DTO inside CollectionPresenter
    // replay — fine here. If you instead capture $this->dto into a variable before the closure, you
    // freeze the first DTO and apply it to all collection items.
    return $this;
}

// RIGHT — capture inside the closure (lazy bind)
$this->presets[$field] = function (mixed $value): string {
    return $value . ' (id: ' . $this->dto->id . ')';
};
```

## Cross-references

- Run **`bd-data-object`** if the new method needs a NEW DTO field (e.g. a presentation-only computed field) — DTO + Presenter design often co-evolve.
- Run **`bd-attribute`** if the new method consumes a NEW attribute (e.g. `#[Format('Y-m-d')]`) — wire the attribute everywhere relevant.
- Run **`bd-security`** when the new method emits values from `Secret` / `#[Sensitive]` fields — explicit reveal is the audit point.

## What this skill does NOT cover

- HTML rendering / Twig integration / view layer. Presenter emits arrays + JSON; HTML is a consumer-side concern.
- Caching the rendered output. Presenter renders fresh; cache at the consumer layer.
- Async / lazy field computation (`compute('foo', fn () => Promise::resolve(...))`). The Presenter is sync.
- Schema generation for the rendered output. That's `RestSchemaBuilder`, not Presenter.
- Replacing `CollectionPresenter` with a streaming variant. Not in scope; sufficient batches keep memory bounded.

## References

- Presenter base: [libraries/better-data/src/Presenter/Presenter.php:65](Presenter.php) — `class Presenter` (mutable builder, NOT readonly), constructor at 99, `for()` factory at 109, `forCollection()` at 117.
- Sensitive-field discovery: [libraries/better-data/src/Presenter/Presenter.php:481-510](Presenter.php) — `sensitiveFieldNames()` walks properties + constructor params for `#[Sensitive]` or `Secret` type.
- CollectionPresenter: [libraries/better-data/src/Presenter/CollectionPresenter.php:30-160](CollectionPresenter.php) — `$configurers[]` per fluent call, replayed in `toArray`.
- PresentationContext: [libraries/better-data/src/Presenter/PresentationContext.php](PresentationContext.php) — `none()`, `rest()`, `admin()`, `withLocale()`.
- HasPresenter trait: [libraries/better-data/src/Presenter/HasPresenter.php:15-20](HasPresenter.php) — adds `->present()` to DTOs.
- Formatters: [libraries/better-data/src/Presenter/Formatter/](Formatter/) — `DateFormatter`, `CurrencyFormatter` as templates for new helpers.
- Official documentation: <https://github.com/lonsdale201/better-data>
- Verified source paths:
  - `src/Presenter/Formatter/DateFormatter.php`
  - `src/Presenter/Formatter/CurrencyFormatter.php`
  - `src/Secret.php`
  - `src/Attribute/Sensitive.php`
