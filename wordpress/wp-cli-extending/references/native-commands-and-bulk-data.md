# Native commands and safe bulk data operations

Baseline checked on 2026-11-15: WP-CLI 2.12.0, WordPress 7.1.3, PHP 8.3.31,
MariaDB 10.11, disposable single-site installation, default object cache.
Check installed `wp help` again: packages and releases can change the interface.

## Evaluate comparison claims individually

| Claim | Verified native behavior | What a custom command must add or prove |
|---|---|---|
| Aggregate metadata requires custom SQL | `post meta list` is per object; `post list` can select by meta key and WP_Query filters. Native commands can be composed. A single all-key/count/byte dashboard is not provided by that per-object command. | Efficient aggregation, defined byte metrics and evidence for ownership labels. SQL is one implementation, not the only possible one. |
| Deletion means one post or unchecked SQL | `post meta delete <id> <key> [<value>]` supports nonempty-value matching; see the empty-value sentinel below. Selected IDs can be iterated through WP APIs. `--all` means all metadata on **one** object. | Whole-dataset key scope, bounded selection, preview and an explicit status/revision policy. |
| Search-replace cannot be scoped to one metadata key | Its native table/column selection does not provide an arbitrary row predicate or `--meta-key` filter in 2.12.0. Nested single-object values can be edited with `post meta patch`. | A targeted key/row selector plus a carefully specified value/array-key transformation. |
| Native preview only shows numbers | `search-replace --dry-run --log=<file>` includes old/new context; `--export=<file>` writes transformed SQL without applying database changes. These are command-specific features. | Preview for custom operations, selection counts and redacted examples. Do not invent `--dry-run` on every native command. |
| Native commands have no interruption or concurrency guarantees | A generic resumable, shared-lock bulk-operation contract is not implied by WP-CLI. Individual commands can have their own transaction/locking behavior. | Durable checkpoints, replay policy, lock ownership/leases and failure tests. CLI alone proves none of these. |
| Native writes always leave caches/indexes stale | Metadata/option API commands can run WP invalidation and loaded hooks; raw SQL and search-replace do not provide equivalent per-record lifecycle behavior. | Refresh a plugin-specific derived index via its documented service/hook or a scoped rebuild. Verify freshness rather than infer it. |

An unnamed plugin's promises about locks, ownership, previews or exactly-once
processing remain unverified until its implementation and failure behavior are
tested. Do not convert marketing claims into skill rules.

## Metadata selection, deletion and ownership

Before mutation record the target installation, table prefix, site/blog ID, post
types, statuses, revisions, key, value comparison and estimated affected rows.
Prefer an explicit allowlist of statuses to relying on command defaults.

```bash
# Read-only selection example; excludes trash, auto-draft and revisions.
wp post list --post_type=post --post_status=publish,draft \
  --meta_key=_acme_tag --fields=ID,post_status --format=json
```

`post list` accepts WP_Query filters, including meta-key selection. Including
revisions requires selecting `revision` and its statuses explicitly; some WP
metadata APIs redirect a revision ID to its parent. Test the exact operation.
Do not promise that revisions are always included or always excluded by WP-CLI.

The native delete syntax supports deleting one key, or matching nonempty values
of that key on an object. **An empty string is a sentinel, not an exact empty-value
predicate:** `post meta delete <id> <key> ''` removed both empty and nonempty values
in the lab. Core `delete_metadata()` likewise omits value filtering for `''`, null
and false. Use a purpose-built metadata-row-ID operation for empty-only deletion.
Duplicate rows and metadata slashing/normalization also affect matching; test `0`
and structured data. Removing a
selected key must preserve sibling keys. `post meta delete <id> --all` removes
every key from that object's metadata and is not an all-posts selector.

For a small reviewed ID set, iterating native commands is valid. For large sets,
use a trusted PHP command with bounded cursor-based reads and metadata APIs.
Do not generate a shell pipeline that blindly deletes whatever a broad query
returns. Preserve errors, exit status and a durable target list. Never use a
mutable offset cursor while deleting selected rows.

Metadata has no universal plugin-owner registry. A prefix or matching source
string is a heuristic; several plugins may share a key or leave orphaned data.
Label ownership evidence/confidence. Define whether size means `OCTET_LENGTH`
of stored values, characters, logical decoded data or allocated storage; they
are not interchangeable. Aggregate row counts and distinct object counts differ.

## Serialization, replacements and malformed values

`search-replace` handles PHP serialization; a raw SQL `REPLACE()` may corrupt
serialized string lengths. `--precise` selects PHP processing, not a row filter.
Restricting `meta_value` still affects values belonging to **other metadata keys**
in that column. `--where` and `--format=json` were rejected in 2.12.0.

Object recursion is enabled by default for native search-replace and can be
disabled with `--no-recurse-objects`. The tested serialized array preserved its
keys while replacing string values. Do not infer an array-key rename capability
from serialization support. A custom key rename needs collision handling and
tests for numeric keys, nesting and repeated references.

Avoid unserializing untrusted object payloads to implement a preview. Define
whether objects, malformed serialization and unsupported encodings are rejected
or skipped, count them separately, and never silently overwrite unreadable rows.
For untrusted legacy decoding use `allowed_classes => false`, byte/depth/node
limits and cycle-aware traversal; test reserialization and reject unsupported
structures. `--no-recurse-objects` controls traversal, not whether decoding can
execute an object's magic methods. It is not a general security/losslessness proof.

Use `post meta patch` or `option patch` for documented nested updates when its
single-object contract fits. These commands are not arbitrary key-scoped bulk
string-replacement engines.

## APIs, SQL, cache and plugin indexes

| Write path | What to expect |
|---|---|
| `post meta add/update/delete`, option commands | WordPress storage APIs; their registered/loaded filters, actions and cache behavior can run. |
| Plugin domain service | The above plus whatever business rules, audit events and derived-state updates the service implements. Verify its actual path. |
| `$wpdb` / `wp db query` mutations | No automatic WP per-record sanitization, metadata actions or object-cache invalidation. |
| `search-replace` | Database replacement engine with serialization handling; not a loop through plugin setters or metadata hooks. |

An option sanitizer must actually be registered in the CLI bootstrap context.
Logic attached only to an admin screen or REST controller will not run merely
because `update_option()` runs. Conversely, claiming all native option changes
bypass sanitizers/hooks/cache is false.

After direct writes, invalidate the affected cache keys and rebuild derived data
through documented plugin APIs. An arbitrary plugin materialized index is not
guaranteed fresh by core invalidation. `wp cache flush` cannot rebuild such an
index, may affect other sites on a shared backend, and is not a default batch step.
Search-replace can explicitly remind operators to flush a persistent cache;
that warning is not evidence that it already did so.

The legacy `WP_CLI\Utils\wp_clear_object_cache()` still present in 2.12.0 is marked
`@deprecated 1.5.0`. It resets query logs and runtime cache state, using
`wp_cache_flush_runtime()` when supported. New code should feature-check the
supported core runtime-cache API instead. Do not describe the legacy helper as an
unconditional persistent cache flush. Query accumulation
depends on `SAVEQUERIES` and instrumentation; profile memory before intervention.

## Preview, checkpoints and concurrency

A custom preview must use the same selector and pure transformation as apply.
Report objects selected, metadata rows affected, changes, no-ops, skips and
failures separately. Redact values and bound sample output. Store sensitive logs,
SQL exports and backups outside the webroot with restricted access; a replacement
log can contain complete credentials or private content around a match.

For a resumable operation define:

- Immutable input identity, target site/schema, selector and transformation version.
- Stable cursor, batch boundaries, checkpoint persistence and lock ownership.
- Crash windows: before write, after write but before checkpoint, and mid-batch.
- Replay semantics: idempotent updates, deduplication keys or transactional
  checkpointing, with special handling for email/webhooks/jobs outside a DB transaction.
- Shared coordination across CLI, admin, cron and workers, plus lock timeout,
  owner-checked release, stale-owner recovery and fencing where necessary.
- Cancellation/failure exit codes and counts of completed versus pending work.

Writing a cursor file after each batch does not guarantee exactly-once processing.
A transient named `lock` does not prove mutual exclusion. A lock honored only by
CLI does not coordinate an admin writer. Prove the promised behavior with forced
termination, replay and concurrent clients. Revalidate a stored preview against
current data before applying; a preview hash alone does not freeze the database.

Use bounded keyset pagination or an immutable target manifest; do not load the
entire dataset merely to chunk it. State the consistency behavior when new rows
appear during processing. Transactions do not roll back external side effects.

## Operational boundaries

Resolve `--path`, `--url`/multisite blog, environment, DB prefix and active plugins
before a write. `--skip-plugins` changes validation/lifecycle behavior and still
loads mu-plugins; it is not equivalent to a normal plugin run. Distinguish local
shell, SSH/container execution and commands sent through a plugin API bridge.

Use narrow table selection for search-replace. `--all-tables` can include other
applications; a prefix is not proof of exclusive ownership. Define backup/restore
and post-operation application checks. Use runtime `wp help` over newer online
flags: the live docs on the checked date marked `--old`/`--new` as not stable yet.

Quote paths/values for the actual shell. Bash examples are not PowerShell scripts;
avoid `eval`, shell-built SQL and interpolated command strings. Use stdin/files
with size/shape validation where supported, and keep secrets out of argv/history.

## Official sources

- [post list](https://developer.wordpress.org/cli/commands/post/list/)
- [post meta list](https://developer.wordpress.org/cli/commands/post/meta/list/)
- [post meta delete](https://developer.wordpress.org/cli/commands/post/meta/delete/)
- [post meta patch](https://developer.wordpress.org/cli/commands/post/meta/patch/)
- [option patch](https://developer.wordpress.org/cli/commands/option/patch/)
- [search-replace](https://developer.wordpress.org/cli/commands/search-replace/)
- [update_option](https://developer.wordpress.org/reference/functions/update_option/)
- [update_metadata](https://developer.wordpress.org/reference/functions/update_metadata/)
- [delete_metadata](https://developer.wordpress.org/reference/functions/delete_metadata/)
- [WP-CLI 2.12.0 legacy WP utilities](https://github.com/wp-cli/wp-cli/blob/v2.12.0/php/utils-wp.php#L360-L401)
- [search-replace implementation](https://github.com/wp-cli/search-replace-command/blob/main/src/Search_Replace_Command.php)
