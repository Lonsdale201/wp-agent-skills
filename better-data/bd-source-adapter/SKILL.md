---
name: bd-source-adapter
description: Add a new source adapter to better-data — code that reads
  from a WordPress data store the library doesn't cover yet (comments,
  attachments, transients, custom tables). Mirror the canonical shape
  PostSource / UserSource / TermSource use — a non-final class with
  static hydrate(int|object, $dtoClass) and hydrateMany(list<int>,
  $dtoClass) methods. Critical contract — the meta fetcher closure
  passed to the AttributeDrivenHydrator must return null when the meta
  key does not exist (use metadata_exists guard) and the stored value
  otherwise. Without this guard you cannot distinguish "missing meta
  → use default" from "stored empty string → preserve emptiness", and
  Reflection-default fallback breaks. Bulk hydration must prewarm
  caches with the equivalent of update_meta_cache + (where applicable)
  _prime_post_caches. Use when integrating a new WP store. Triggers on
  creating a class in src/Source/, hydrate / hydrateMany method
  signatures, references to AttributeDrivenHydrator from a source.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/Source/HasWpSources.php
  - src/Source/PostSource.php
  - src/Source/UserSource.php
  - src/Source/TermSource.php
  - src/Source/OptionSource.php
  - src/Source/RowSource.php
  - src/Source/RequestSource.php
  - src/Internal/AttributeDrivenHydrator.php
  - src/Exception/PostNotFoundException.php
---

# better-data: Adding a source adapter

For library maintainers integrating a new WordPress data store with better-data — comments, attachments, transients, custom tables, taxonomy hierarchies. Sources hydrate stored data into typed DataObjects via `AttributeDrivenHydrator`; the work is wiring up the bridge between WP's storage idioms and the hydrator's closure contract.

## Misconception this skill corrects

> "I'll call `get_post_meta($id, $key, true)` directly — empty string means 'not set'."

Wrong. WordPress `get_meta($key, true)` returns `''` (empty string) for both "key does not exist" AND "key exists with empty-string value". The `AttributeDrivenHydrator` distinguishes these because the **default-value fallback** at [src/Internal/AttributeDrivenHydrator.php:90-95](AttributeDrivenHydrator.php) needs to know "missing → use the parameter's default" vs "present-but-empty → coerce as empty string". Without the distinction, every nullable meta-backed field with a non-null default falls back incorrectly.

The contract: the closure you pass to the hydrator returns:

- `null` → key does not exist (hydrator falls back to parameter default / parameter nullable)
- the stored value (including `''`) → key exists, hydrator coerces

Verified pattern from [src/Source/PostSource.php:91-93](PostSource.php):

```php
if (\function_exists('metadata_exists')
    && !\metadata_exists('post', $postId, $key)) {
    return null;  // key does not exist
}
return \get_post_meta($postId, $key, true);  // exists; could be ''
```

Other AI-prone misconceptions:

- "I'll instantiate `WP_User` directly with `new WP_User($id)` in a hot loop." Wrong — bypasses object cache. Use `get_user_by('id', $id)` so the per-request cache participates.
- "Bulk hydration is just `array_map($id => hydrate($id))`." Wrong — without prewarming, that's N+1 queries. Always call `update_meta_cache(...)` (and `_prime_post_caches` for posts) first.
- "I'll write the WP-touching code in `src/Internal/`." Wrong — `src/Internal/` is the WP-free engine zone (so it's unit-testable without a WP runtime). Source adapters live in `src/Source/` and CAN call WP functions.

## When to use this skill

Trigger when ANY of the following is true:

- Creating a new file under `src/Source/`.
- The diff adds a `hydrate(...)` / `hydrateMany(...)` method that reads from a WP table.
- Adding a `::fromComment($id)` / `::fromAttachment($id)` etc. shortcut to `HasWpSources`.
- Reviewing a PR that calls `get_*_meta($key, true)` without a `metadata_exists` guard inside a source.

## Workflow

### 1. File location

Public source adapter: `src/Source/<Name>Source.php`. The pure, WP-free engine that does the attribute-driven work already lives in `src/Internal/AttributeDrivenHydrator.php` — DON'T duplicate it. Your job is to feed the hydrator a fetcher closure.

### 2. Method shape — match the existing sources

Every source has the same two static methods:

```php
public static function hydrate(int|\WP_Comment $record, string $dtoClass): DataObject;

/**
 * @template T of DataObject
 * @param  list<int>      $ids
 * @param  class-string<T> $dtoClass
 * @return list<T>
 */
public static function hydrateMany(array $ids, string $dtoClass): array;
```

Why static: the source has no per-instance state. Why this exact shape: `HasWpSources` wires `Dto::fromComment($id)` to `CommentSource::hydrate($id, static::class)`; deviating breaks the trait contract.

### 3. The fetcher closure contract

Every source ends up calling (or fakes a call to) `AttributeDrivenHydrator::hydrate($dtoClass, $primary, $metaFetcher)`. The third arg is a closure:

```php
$metaFetcher = static function (string $key) use ($commentId): mixed {
    if (\function_exists('metadata_exists')
        && !\metadata_exists('comment', $commentId, $key)) {
        return null;  // CRUCIAL — distinguishes missing from empty
    }
    return \get_comment_meta($commentId, $key, true);
};
```

Without the `metadata_exists` guard, the closure returns `''` for both missing and stored-empty, and the hydrator can't apply default-fallback logic correctly.

### 4. Bulk path: prewarm caches first

```php
public static function hydrateMany(array $commentIds, string $dtoClass): array
{
    if ($commentIds === []) {
        return [];
    }

    // Prewarm WP's per-request comment cache.
    if (\function_exists('_prime_comment_caches')) {
        \_prime_comment_caches($commentIds);
    }

    // Prewarm meta cache (single SELECT for all comments × all keys).
    if (\function_exists('update_meta_cache')) {
        \update_meta_cache('comment', $commentIds);
    }

    return \array_map(
        static fn (int $id): DataObject => self::hydrate($id, $dtoClass),
        $commentIds,
    );
}
```

Result: N comments cost 1 prime + 1 meta + N hydrate calls (cache hits) — instead of N comments × (1 SELECT comment + N SELECT meta) = O(N²).

### 5. Add a `HasWpSources` shortcut

If the source maps to a natural shortcut, add a method on the trait at [src/Source/HasWpSources.php:28](HasWpSources.php):

```php
// Inside trait HasWpSources:
public static function fromComment(int|\WP_Comment $comment): static
{
    /** @var static */
    return CommentSource::hydrate($comment, static::class);
}
```

DTO authors then write:

```php
final readonly class CommentDto extends DataObject
{
    use HasWpSources;
    // ...
}

$dto = CommentDto::fromComment($commentId);
```

Don't add a shortcut for niche sources — `RowSource` doesn't have one because raw row hydration is intentionally call-site-explicit.

### 6. Exception strategy

Throw a typed exception when the primary record doesn't exist. Mirror [src/Exception/PostNotFoundException.php](PostNotFoundException.php):

```php
namespace BetterData\Exception;

final class CommentNotFoundException extends \RuntimeException
{
    public static function forId(string $dtoClass, int $id): self
    {
        return new self(\sprintf('No comment found for %s with ID %d', $dtoClass, $id));
    }
}
```

### 7. Testing

Two test layers:

```
tests/Unit/CommentSourceTest.php       ← pure engine via fake fetcher closure
tests/Fixtures/CommentDtoFixture.php   ← realistic DTO shape
companion plugin: src/Stress/CommentScenario.php  ← live-WP behavior
```

Unit tests don't require WP — pass a hand-crafted closure to `AttributeDrivenHydrator::hydrate` directly. Stress tests against a live WP install verify cache primings and `metadata_exists` behavior in the real environment.

```bash
vendor/bin/phpunit --filter CommentSource
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
wp better-data stress  # in companion plugin context
```

## Critical rules

- **Lives in `src/Source/`**, not `src/Internal/`. `Internal` stays WP-free.
- **`hydrate(int|<WPType>, string $dtoClass): DataObject` + `hydrateMany(list<int>, string $dtoClass): list<DataObject>`** — exact two-method shape every source uses.
- **Meta fetcher closure: return `null` for missing, stored value otherwise.** Use `metadata_exists` (or equivalent) before fetching. Empty string is NOT missing.
- **Bulk path prewarms caches.** `_prime_*_caches` for the primary objects, `update_meta_cache(...)` for meta. Without it, you've shipped O(N²).
- **Use `get_user_by('id', $id)`, not `new WP_User($id)`** in user-related sources — object cache participation.
- **Wrap WP function calls in `function_exists` if the source is unit-tested without WP**. Allows tests to import `Source` without bootstrapping WP.
- **Throw a typed exception** when the primary record is missing (`PostNotFoundException`-style). Don't return null from `hydrate` — the caller can't tell hydration-of-missing from hydration-of-empty.
- **Add the `HasWpSources` shortcut** if the source has a natural ergonomic call site (most do; `RowSource` is the exception).

## Common mistakes

```php
// WRONG — get_post_meta with empty-string ambiguity
$metaFetcher = static fn (string $key): mixed => \get_post_meta($postId, $key, true);
// Returns '' for missing AND stored-empty — defaults break.

// RIGHT
$metaFetcher = static function (string $key) use ($postId): mixed {
    if (\function_exists('metadata_exists')
        && !\metadata_exists('post', $postId, $key)) {
        return null;
    }
    return \get_post_meta($postId, $key, true);
};

// WRONG — N+1 in hydrateMany
public static function hydrateMany(array $ids, string $dtoClass): array
{
    return \array_map(
        static fn (int $id) => self::hydrate($id, $dtoClass),
        $ids,
    );
}
// Each hydrate call hits cold caches.

// RIGHT — prewarm first
\_prime_comment_caches($ids);
\update_meta_cache('comment', $ids);
return \array_map(...);

// WRONG — new WP_User in a loop
foreach ($userIds as $id) {
    $user = new \WP_User($id);  // bypasses object cache
    // ...
}

// RIGHT
\update_meta_cache('user', $userIds);
foreach ($userIds as $id) {
    $user = \get_user_by('id', $id);
    // ...
}

// WRONG — silent on missing record
public static function hydrate(int $id, string $dtoClass): DataObject
{
    $comment = \get_comment($id);
    if ($comment === null) {
        return $dtoClass::fromArray([]);  // 🔴 hydrates an empty DTO; caller can't tell
    }
    // ...
}

// RIGHT — typed exception
if ($comment === null) {
    throw CommentNotFoundException::forId($dtoClass, $id);
}

// WRONG — engine call inside src/Internal/
// File: src/Internal/CommentEngine.php
\update_meta_cache('comment', $ids);  // 🔴 src/Internal/ must be WP-free for unit testability

// RIGHT — keep WP calls in src/Source/
// (the WP-free attribute-driven hydrator already lives in src/Internal/)
```

## Cross-references

- Run **`bd-sink`** when also writing back to the same store — sources and sinks usually ship as a pair.
- Run **`bd-attribute`** if the new source needs a NEW attribute (e.g. `#[CommentField]`) — the attribute and source must be wired together.
- Run **`bd-data-object`** when adding the DTO that the source hydrates — DTO + source design typically co-evolve.

## What this skill does NOT cover

- Custom hydration logic beyond the attribute-driven path. If your source needs deep custom branching (e.g. building a tree from term hierarchy), that goes inside the source as helper logic, but the entry shape stays `hydrate / hydrateMany`.
- Replacing `AttributeDrivenHydrator`. The hydrator is intentionally one engine; new behaviors are attributes, not parallel hydrators.
- Performance optimization beyond cache prewarming (sharding queries, lazy hydration). Most sources don't need it.
- Caching the hydrated DTO itself — that's a consumer concern. Sources hydrate fresh each call.
- Sourcing from non-WP systems (REST API, GraphQL, external DB). Possible architecturally but outside this skill's WP-store scope.

## References

- Reference source (full pattern): [libraries/better-data/src/Source/PostSource.php](PostSource.php) — hydrate at line 64, hydrateMany with `_prime_post_caches` + `update_meta_cache` at line 117-124, `metadata_exists` guard at line 91-93.
- Trait shortcut: [libraries/better-data/src/Source/HasWpSources.php:28](HasWpSources.php) — `::fromPost`, `::fromUser`, `::fromTerm`, `::fromOption`, `::fromRow`.
- Hydrator engine: [libraries/better-data/src/Internal/AttributeDrivenHydrator.php](AttributeDrivenHydrator.php) — pure, WP-free; takes a fetcher closure and produces a hydrated DTO.
- Default-fallback predicate: [libraries/better-data/src/Internal/AttributeDrivenHydrator.php:90-95](AttributeDrivenHydrator.php) — the `null`-vs-value distinction in the fetcher matters here.
- Other sources: [libraries/better-data/src/Source/UserSource.php](UserSource.php), [libraries/better-data/src/Source/TermSource.php](TermSource.php), [libraries/better-data/src/Source/OptionSource.php](OptionSource.php), [libraries/better-data/src/Source/RowSource.php](RowSource.php), [libraries/better-data/src/Source/RequestSource.php](RequestSource.php).
