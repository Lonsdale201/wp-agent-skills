---
name: bd-sink
description: Add a new sink to better-data — code that writes
  DataObjects back to a WordPress data store the library doesn't cover
  yet (comment meta, REST upload, custom taxonomy hierarchy). Mirror
  PostSink's two-mode shape — projection methods (toArgs / toMeta)
  return raw arrays for caller-managed writes, convenience methods
  (insert / update / save) commit everything internally and MUST pass
  values through wp_slash() because WP's write pipeline calls
  wp_unslash() on inbound data. Critical contract — null DTO value
  deletes the meta entry, non-null updates it; encryption MUST route
  through EncryptionEngine::encrypt symmetrically with the matching
  source's decrypt; never silently skip encryption (every Phase-8.7
  OptionSink Secret bug came from asymmetric write/read). Use when
  integrating writes for a new WP store. Triggers on creating a class
  in src/Sink/, toArgs / toMeta / insert / update / save method shape,
  references to SinkProjection or wp_slash in the diff.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/Sink/HasWpSinks.php
  - src/Sink/PostSink.php
  - src/Sink/UserSink.php
  - src/Sink/TermSink.php
  - src/Sink/OptionSink.php
  - src/Sink/RowSink.php
  - src/Internal/SinkProjection.php
  - src/Encryption/EncryptionEngine.php
  - src/Exception/MissingIdentifierException.php
---

# better-data: Adding a sink

For library maintainers integrating WRITE-side support for a new WordPress data store with better-data — comment meta, attachments, custom taxonomies, plugin-specific tables. The shape is set by `PostSink` and `OptionSink`; deviating breaks the `HasWpSinks` trait API and surprises consumers who've internalized the dual projection-vs-convenience model.

## Misconception this skill corrects

> "I'll write the values directly to `update_post_meta` — slashing is the caller's problem."

Wrong direction. WordPress's write pipeline calls `wp_unslash()` on inbound data on the way to the DB. If you pass a raw value through `update_post_meta($id, $key, 'a"b')` without slashing first, WP unslashes a string with no slashes and stores `'ab'` (the `"` survives, but escaped/quoted values get mangled). Convenience methods (`insert`, `update`, `save`) MUST `wp_slash()` before calling any WP write function. Verified in [src/Sink/PostSink.php:144](PostSink.php) (`$args = \wp_slash($args);`), [PostSink.php:183](PostSink.php) (`\wp_update_post(\wp_slash($args), true)`), [PostSink.php:191](PostSink.php) (`\update_post_meta($postId, $key, \wp_slash($value))`).

The mirror trap on the projection side: `toArgs`/`toMeta` MUST return raw values, NOT pre-slashed. Callers that take projections and pass them to their OWN WP write calls (`wp_insert_post`) would double-slash and corrupt every backslash on round-trip.

So: **convenience slashes, projection does not**. The two paths share `SinkProjection::prepareValue` ([src/Internal/SinkProjection.php:193](SinkProjection.php)) which handles type-shaping, encryption, and DataObject unwrapping but never slashes.

Other AI-prone misconceptions:

- "Asymmetric write/read is fine — encrypt on write, store as plain on read." Wrong. Every asymmetric encryption bug in Phase-8.7's OptionSink came from this pattern. If you encrypt, the matching source MUST decrypt.
- "Storing a `DataObject` instance with `update_post_meta($id, 'thing', $dto)` — WP will serialize it." Technically true, but stores a class name in the DB; on class rename or removal you have unrecoverable garbage. Always project through `SinkProjection::prepareValue` which recurses arrays and turns nested `DataObject`s into plain arrays.
- "I'll do my own slashing inside `prepareValue`." Wrong layer — projection stays raw. Slashing is the boundary concern at the WP-call site.

## When to use this skill

Trigger when ANY of the following is true:

- Creating a new file under `src/Sink/`.
- Adding `toArgs` / `toMeta` / `insert` / `update` / `save` methods on a sink class.
- Adding a `saveAsX` shortcut to `HasWpSinks`.
- Reviewing a PR that calls `update_*_meta` / `wp_insert_*` directly without `wp_slash()`.
- Reviewing a PR that adds at-rest encryption to one sink without verifying the matching source decrypts.

## Workflow

### 1. File location

Sinks live in `src/Sink/`. The pure projection logic (no WP calls) lives in `src/Internal/SinkProjection.php` — DON'T duplicate it. Your sink delegates type shaping there and adds the WP-specific calls.

### 2. The two-mode contract

Every sink ships TWO modes that share one projection:

**Projection mode** (caller drives the write):

```php
public static function toArgs(
    DataObject $dto,
    ?array $only = null,
    bool $strict = false,
    bool $skipNullDeletes = false,
): array;

/**
 * @return array{write: array<string, mixed>, delete: list<string>}
 */
public static function toMeta(
    DataObject $dto,
    ?array $only = null,
    bool $strict = false,
    bool $skipNullDeletes = false,
): array;
```

`toArgs` returns the array shape `wp_insert_<thing>` / `wp_update_<thing>` accepts. `toMeta` returns `['write' => [k => v, ...], 'delete' => [k, k, ...]]` — split because the meta write loop is "set non-nulls, delete nulls".

**Convenience mode** (sink drives the write):

```php
public static function insert(DataObject $dto, ?array $only = null, bool $strict = false): int;
public static function update(DataObject $dto, ?array $only = null, bool $strict = false): bool;
public static function save(DataObject $dto, ?array $only = null, bool $strict = false): int;
```

All three internally call `toArgs` + `toMeta`, then issue WP function calls with `wp_slash()` applied at the boundary. `save` is the smart router: positive DTO `id` → `update`, otherwise `insert`.

### 3. Slashing policy — the rule that breaks every refactor

```php
// Inside convenience methods (insert / update / save):
$args = \wp_slash($args);
\wp_insert_post($args, true);

\update_post_meta($postId, $key, \wp_slash($value));

// Inside projection methods (toArgs / toMeta):
return $args;  // RAW, no slashing
```

Reason ([PostSink.php:32-43](PostSink.php) docblock): "WP write pipeline calls `wp_unslash()` on inbound data. Without slashing, a value containing `\"` would round-trip to `"`." But the projection caller may build a payload that's already-slashed for a different reason; double-slashing corrupts equally. The split is the API contract.

### 4. Null = delete (the meta convention)

The sink's meta loop:

```php
foreach ($meta['write'] as $key => $value) {
    \update_post_meta($postId, $key, \wp_slash($value));
}
foreach ($meta['delete'] as $key) {
    \delete_post_meta($postId, $key);
}
```

A DTO field that's `null` doesn't update the meta to NULL — it DELETES the meta entry. This pairs with the source's null-vs-empty distinction: a deleted-meta-key reads back as `null` (per the `metadata_exists` contract), which hydrates the DTO's parameter default.

The `$skipNullDeletes` flag lets a caller opt out: when the user is doing a partial update of a single field and doesn't want unrelated nulls to wipe other meta. Default behavior is "null deletes".

### 5. Honor `#[Encrypted]` symmetrically

The projection layer routes encrypted fields through `EncryptionEngine::encrypt`. Verified at [src/Sink/OptionSink.php:134](OptionSink.php):

```php
$value = EncryptionEngine::encrypt($value);
```

If your sink touches rich types (Secret, plain string with `#[Encrypted]`), EVERY write path must encrypt. The matching source's read path must decrypt. Asymmetric is worse than absent — the user puts a credential in, the user gets a credential out, but in between the DB stores plaintext.

The unit-test contract for any sink that writes `#[Encrypted]` fields:

1. Round-trip: hydrate → DTO → save (sink) → load (source) → DTO → unwrap → equals original plaintext.
2. Tamper probe: load the DB row directly, flip a byte, source-load → expect `DecryptionFailedException`.
3. Leak probe: dump the projected `toArgs` / `toMeta` arrays — should contain ciphertext, NOT the plaintext.

### 6. Add the `HasWpSinks` shortcut

Mirror [src/Sink/HasWpSinks.php:36-115](HasWpSinks.php):

```php
// Inside trait HasWpSinks:
public function saveAsComment(?array $only = null): int
{
    /** @var DataObject $this */
    return CommentSink::save($this, $only);
}

public function toCommentArgs(?array $only = null): array
{
    /** @var DataObject $this */
    return CommentSink::toArgs($this, $only);
}
```

DTO authors then write:

```php
$dto = (new CommentDto(post_id: 5, content: 'hi'))->saveAsComment();
```

### 7. Identifier requirement for `update`

Updating without an ID is a programming error. Throw a typed exception ([src/Exception/MissingIdentifierException.php](MissingIdentifierException.php) is the existing one):

```php
public static function update(DataObject $dto, ?array $only = null, bool $strict = false): bool
{
    $id = self::resolveId($dto);
    if ($id <= 0) {
        throw MissingIdentifierException::for($dto::class, 'comment_ID');
    }
    // ...
}
```

`save()` falls through to `insert` if `id <= 0`, so it doesn't throw — that's the user-facing "do the right thing" entry point.

### 8. Testing

Two layers, same as sources:

```bash
# Pure projection — no WP needed
vendor/bin/phpunit --filter CommentSinkProjectionTest

# Live-WP behaviour — companion plugin smoke + stress
wp better-data smoke
wp better-data stress
```

Smoke scenarios cover the round-trip (write a DTO, read it back, equal). Stress scenarios cover the encryption / wp_slash / null-delete edge cases against a real WP install.

## Critical rules

- **Lives in `src/Sink/`.** Pure projection logic stays in `src/Internal/SinkProjection.php`.
- **Two-mode contract: projection raw, convenience slashed.** `toArgs` / `toMeta` return raw; `insert` / `update` / `save` apply `wp_slash` at the WP-call boundary.
- **Null = delete in meta.** A null DTO value triggers `delete_*_meta`, not `update_*_meta($key, null)`. Honor `$skipNullDeletes` when the caller wants a partial update.
- **Encryption symmetric end-to-end.** If the sink encrypts a field, the matching source MUST decrypt the same field. Asymmetric ships a regression.
- **Project through `SinkProjection::prepareValue`** for nested `DataObject` and array-of-DTO fields — recurses correctly and avoids storing class names in the DB.
- **Convenience methods slash; projection methods don't.** Don't slash inside `prepareValue` — wrong layer.
- **`update` throws `MissingIdentifierException` without an ID.** `save` doesn't throw — it routes to `insert`.
- **Add the `HasWpSinks` shortcut** for natural call sites (`saveAsComment`, `toCommentArgs`). Skip for niche sinks.

## Common mistakes

```php
// WRONG — slashing in projection
public static function toArgs(DataObject $dto, ...): array
{
    $args = SinkProjection::projectForStorage($dto);
    return \wp_slash($args);  // 🔴 caller can't tell it's already slashed
}

// RIGHT — convenience slashes, projection raw
public static function toArgs(DataObject $dto, ...): array
{
    return SinkProjection::projectForStorage($dto);
}

public static function update(DataObject $dto, ...): bool
{
    $args = self::toArgs($dto, ...);
    \wp_update_post(\wp_slash($args), true);  // boundary slash
    // ...
}

// WRONG — encrypt on write, decrypt on read missing
class FooSink {
    public static function save(DataObject $dto): int {
        $value = EncryptionEngine::encrypt($plaintext);
        \update_option('foo', $value);
    }
}
class FooSource {
    public static function hydrate(string $option, string $dtoClass): DataObject {
        $stored = \get_option($option);  // 🔴 returns ciphertext, no decrypt
        return $dtoClass::fromArray(['foo' => $stored]);
    }
}

// RIGHT — symmetric
class FooSource {
    public static function hydrate(string $option, string $dtoClass): DataObject {
        $stored = \get_option($option);
        if ($parameter has #[Encrypted]) {
            $stored = EncryptionEngine::decrypt($stored);
        }
        // ...
    }
}

// WRONG — null doesn't delete
foreach ($meta as $key => $value) {
    \update_post_meta($postId, $key, $value);  // null stored as empty / falsy
}

// RIGHT — null deletes
foreach ($meta['write'] as $key => $value) {
    \update_post_meta($postId, $key, \wp_slash($value));
}
foreach ($meta['delete'] as $key) {
    \delete_post_meta($postId, $key);
}

// WRONG — storing a DataObject instance directly
\update_post_meta($postId, 'cart', $cartDto);
// Stores serialized PHP with namespaced class names. On rename, you've lost the data.

// RIGHT — project first
$projected = SinkProjection::projectForStorage($cartDto);  // recursively turns DTOs into arrays
\update_post_meta($postId, 'cart', \wp_slash($projected));

// WRONG — update without ID guard
public static function update(DataObject $dto): bool {
    \wp_update_post(['ID' => $dto->id, ...], true);  // 🔴 ID = 0 => create-with-ID-0 weirdness
}

// RIGHT
public static function update(DataObject $dto): bool {
    $id = self::resolveId($dto);
    if ($id <= 0) {
        throw MissingIdentifierException::for($dto::class, 'ID');
    }
    // ...
}
```

## Cross-references

- Run **`bd-source-adapter`** when also reading from the same store — sinks and sources usually ship as a pair.
- Run **`bd-attribute`** if the new sink consumes a NEW attribute (e.g. `#[CommentField]`) — wire it everywhere relevant in one pass.
- Run **`bd-security`** when the new sink touches `Secret`, `#[Encrypted]`, or any leak-prevention path. Asymmetric encryption is a security regression.

## What this skill does NOT cover

- Bulk write performance (transactions, deferred meta writes). Most sinks don't need it; if you do, design it on top of the two-mode contract, don't replace it.
- Schema migration / DB table creation. Sinks assume the storage exists.
- Replacing `SinkProjection::prepareValue`. New shaping behavior is an attribute (`bd-attribute`), not a parallel projector.
- Atomic multi-table writes. WP doesn't expose proper transactions — the convenience methods are best-effort. Compensating writes are caller-side.
- REST output projection — that's the `Presenter`, not a sink. Use `bd-presenter`.

## References

- Reference sink (full pattern): [libraries/better-data/src/Sink/PostSink.php](PostSink.php) — class docblock at lines 12-50, slashing at 144 / 183 / 191, `MissingIdentifierException` usage in update.
- Encryption-handling sink: [libraries/better-data/src/Sink/OptionSink.php:119-160](OptionSink.php) — `projectForStorage` with `EncryptionEngine::encrypt` at line 134.
- Pure projection: [libraries/better-data/src/Internal/SinkProjection.php:193](SinkProjection.php) — `prepareValue`, recurses into arrays and DTOs.
- Trait shortcuts: [libraries/better-data/src/Sink/HasWpSinks.php:31-115](HasWpSinks.php) — `saveAsPost`, `saveAsUser`, `saveAsTerm`, `saveAsOption`, `saveAsRow`, `toPostArgs`, etc.
- Other sinks: [libraries/better-data/src/Sink/UserSink.php](UserSink.php), [libraries/better-data/src/Sink/TermSink.php](TermSink.php), [libraries/better-data/src/Sink/RowSink.php](RowSink.php).
- Encryption engine: [libraries/better-data/src/Encryption/EncryptionEngine.php](EncryptionEngine.php) — `encrypt`, `decrypt`, key handling.
