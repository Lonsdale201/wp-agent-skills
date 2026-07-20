---
name: wp-metadata-api
description: Implements and audits WordPress post, user, term, comment, and
  generic metadata code, including slashing contracts, revision redirection,
  multi-row keys, exact meta_id operations, return-value ambiguity, cache and
  hook behavior, registration/auth schemas, scalar typing, and safe handling of
  serialized or double-serialized values. Use when code calls get_*_meta,
  add_*_meta, update_*_meta, delete_*_meta, register_meta,
  update_metadata_by_mid, get_metadata_by_mid, maybe_serialize,
  maybe_unserialize, or queries a *_meta table directly.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-12"
---

# WordPress Metadata API

Choose the correct metadata surface and preserve its historical contracts. This
skill covers correctness and data integrity, not whether a meta table is the
right storage primitive for a new feature.

## Choose the operation by identity

| Intent | API |
|---|---|
| Read one key's first value | `get_post_meta( $id, $key, true )` |
| Read all rows for one key | `get_post_meta( $id, $key, false )` |
| Add another row | `add_post_meta()` / `add_metadata()` |
| Update every row matching object + key | `update_post_meta()` / `update_metadata()` without `$prev_value` |
| Update only rows matching an old value | pass `$prev_value` |
| Update one physical row | `update_metadata_by_mid()` |
| Delete every row matching object + key | `delete_post_meta()` / `delete_metadata()` without value |
| Delete one physical row | `delete_metadata_by_mid()` |

Do not use a key-level update when preserving multiple distinct rows matters.
Do not use `$single = true` when duplicate keys are meaningful.

## Critical contracts

### 1. Slashing differs by API

`add_metadata()`, `update_metadata()`, `delete_metadata()` and the normal
post/user/term/comment wrappers historically expect slashed key/value input and
call `wp_unslash()` internally. If a value has already been unslashed and must
retain literal backslashes, slash it for that boundary:

```php
$value = wp_unslash( $_POST['json'] ?? '' );
// Validate the domain value here.
update_post_meta( $post_id, $key, wp_slash( $value ) );
```

Do not blindly double-slash a superglobal value that has not been normalized.
Trace the value's state.

`update_metadata_by_mid()` does **not** call `wp_unslash()` on the new value or
key. Pass the already-normalized domain value directly:

```php
update_metadata_by_mid( 'post', $meta_id, $normalized_value );
```

Flag code that applies the wrapper contract to the by-mid API or vice versa.

### 2. Post wrappers redirect revisions

`add_post_meta()`, `update_post_meta()`, and `delete_post_meta()` call
`wp_is_post_revision()` and operate on the parent post. If the intent is to
change metadata physically stored on a revision, use the generic API with the
exact revision ID:

```php
update_metadata( 'post', $revision_id, wp_slash( $key ), wp_slash( $value ) );
```

Read paths do not perform the same parent redirect. Audit read/write symmetry.

### 3. Multi-row cardinality

Without `$prev_value`, `update_metadata()` updates all rows sharing object ID
and key. `delete_metadata()` without a value deletes all of them. A
delete-then-add sequence collapses multiple rows to one and is not atomic.

When transforming each row independently, select stable `meta_id` values and
use by-mid operations. Detect key-renaming collisions before writing. PHP array
keys such as `"1"` can coerce to integer `1` and collide even when source strings
look different.

### 4. Return values are not a simple success boolean

`update_metadata()` can return a meta ID when it inserts, `true` when it updates,
and `false` for failure **or an unchanged single value**. By-mid update returns
`false` when the row is missing, blocked, unchanged at SQL level, or failed.

Do not increment processed counters unconditionally. On ambiguous `false`,
inspect the exact function contract and verify the final value/row existence.
For direct SQL also inspect `$wpdb->last_error`; never expose it to untrusted
clients.

### 5. Scalar types and missing values

Normal meta reads return non-serialized scalars as strings: false becomes `''`,
true becomes `'1'`, and numbers become strings. Arrays and objects retain type.
Use `metadata_exists()` when `''` can mean either missing or an explicitly empty
value.

`get_post_meta( $id )` without a key returns the cache-shaped map and its stored
values are not passed through the per-key `maybe_unserialize()` branch. Do not
assume it has the same shape as repeated keyed reads.

### 6. Registration and authorization

Use `register_post_meta()` / `register_meta()` when exposing or validating a
known schema. Verify `type`, `single`, `default`, `sanitize_callback`,
`auth_callback`, `object_subtype`, and `show_in_rest`. Registration does not
replace endpoint/object capability checks.

Do not sanitize an opaque migration value with `sanitize_text_field()` merely
to satisfy a generic checklist. Preserve exact values when the feature requires
it, but validate type, size, encoding, and allowed operation; use prepared SQL
or the meta API; escape only at output.

## Serialization safety

WordPress automatically serializes arrays/objects. Do not call `serialize()` or
`maybe_serialize()` before a normal meta write unless preserving a deliberate
legacy storage layer. A string that already looks serialized is double-serialized
by `maybe_serialize()` for backward compatibility.

### Audit transformations by layer

Never run a blind `str_replace()` over serialized text. Serialized strings
contain byte lengths:

```text
s:3:"foo";
```

Changing `foo` to a longer value without decode/re-encode corrupts the payload.
This also occurs after one decode of double-serialized data, or inside a nested
string that itself contains serialized data. Record the original layer count,
decode only the intended trusted layers, transform the domain value, then
re-encode the same storage contract.

Do not use `is_serialized()` as a full integrity check. It recognizes the
serialized shape and can accept a string whose embedded byte lengths make an
actual `unserialize()` fail. Validate by safely decoding the expected type in a
bounded test path; distinguish a decode failure from the legitimate serialized
boolean `b:0;`.

Before rewriting array keys, preflight transformed keys with type-aware
collision detection. Do not partially save a row after a collision.

### Treat object construction and recursion as a trust boundary

`maybe_unserialize()` eventually calls PHP `unserialize()` with classes allowed.
`__wakeup()` / `__unserialize()` runs before later code can decide to skip the
object. Rate severity by who can write the raw stored payload; a database read
alone is not proof of an exploitable object-injection path.

For untrusted serialized input, prefer rejecting it or using JSON. If legacy
data must be inspected, use `allowed_classes => false`, a supported `max_depth`,
byte/node/depth limits, and cycle-aware traversal. `allowed_classes => false`
blocks class instantiation but does not make arbitrary graphs safe to recurse or
rewrite.

## Cache, hooks, and direct SQL

Metadata APIs run sanitize filters, pre/post hooks, and clear the corresponding
`{$meta_type}_meta` object cache. Direct SQL bypasses these contracts. Use direct
SQL only when set-based performance is necessary and the product explicitly
decides how to reproduce cache invalidation and hook semantics.

For read loops, prefer priming with `update_meta_cache()` or a query API that
primes meta caches instead of calling keyed getters across unprimed objects.

## False-positive guards

- Do not flag every `maybe_unserialize( get_option(...) )` as object injection;
  trace who can write the raw serialized payload and which gadget classes exist.
- Do not demand text sanitization for an exact-preservation migration. Demand a
  defined type/size/encoding contract and safe sinks instead.
- Do not flag generic metadata APIs merely because wrappers exist; exact revision
  or meta-row identity can require the generic/by-mid surface.
- Do not interpret `false` as definite failure without checking unchanged-state
  semantics.

## Report format

Report the API used, intended row identity/cardinality, slash state, stored and
returned type, serialization layers, hooks/caches affected, observed failure,
and the corrected contract. Mark speculative object-injection chains as
conditional and state the required write primitive.

## Cross-references

- Use **`wp-batch-mutation-audit`** for multi-request or concurrent meta changes.
- Use **`wp-security-deep`** for exploit-focused object-injection analysis.
- Use **`wp-plugin-options-storage`** when deciding whether meta is the right
  storage primitive.

## What this skill does NOT cover

- General nonce, capability, REST, and SQL-injection review.
- Custom-table schema design or query-plan optimization.
- A universal parser for hostile PHP serialization.

## References

- Core contracts: `wp-includes/meta.php`
- Post wrapper revision behavior: `wp-includes/post.php`
- Serialization compatibility: `wp-includes/functions.php`
- Official documentation: <https://developer.wordpress.org/apis/metadata/>
- Official documentation: <https://developer.wordpress.org/reference/functions/update_metadata/>
- Official documentation: <https://developer.wordpress.org/reference/functions/update_metadata_by_mid/>
- Verified source paths:
  - `wp-includes/revision.php`
