---
name: wp-batch-mutation-audit
description: Audits destructive or long-running WordPress batch writes for retry
  safety, idempotency, lost-response ambiguity, durable cursors, OFFSET drift,
  concurrent execution, atomic locks, partial failures, return-value handling,
  cancellation, and resumability. Use when reviewing AJAX loops, admin bulk
  tools, WP-Cron/Action Scheduler workers, WP-CLI migrations, importers,
  exporters with erasure, backfills, bulk update/delete code, LIMIT/OFFSET
  mutation loops, processing flags, or any workflow that changes many rows
  across multiple requests.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-12"
docs:
  - https://developer.wordpress.org/plugins/cron/
  - https://developer.wordpress.org/cli/commands/
source-refs:
  - wp-includes/option.php
  - wp-includes/meta.php
  - wp-includes/class-wpdb.php
---

# WordPress batch mutation audit

Review the correctness boundary of work split across requests or workers. Treat
"the request returned success" and "the intended dataset reached the intended
state exactly once" as different claims. Do not use this skill for read-only
pagination; use it when rows, files, remote systems, or durable state change.

## Audit workflow

1. Identify the unit of work: object ID, meta ID, custom-table primary key, file,
   remote delivery, or immutable snapshot row.
2. Trace selection, mutation, progress persistence, response, retry, and cleanup.
3. Model a timeout before commit, after commit but before response, and halfway
   through a batch.
4. Model two tabs, two admins, cron overlap, and a manual retry running together.
5. Verify every mutation result and distinguish no-op from failure.
6. Report the final-state invariant, not only individual code smells.

## Critical checks

### 1. Lost-response ambiguity

Assume the server can commit a batch while the client receives a timeout. A
browser-local offset does not prove whether that batch ran.

Flag a multi-request mutation when retry starts from zero and the operation is
not naturally idempotent. Search/replace is not idempotent when replacement can
match the search again: `a -> aa` becomes `a -> aa -> aaaa` on replay.

Require a durable operation record containing:

- immutable parameters and initiator;
- status (`pending`, `running`, `completed`, `failed`, `cancelled`);
- cursor or target snapshot;
- processed/failed counts and last error;
- timestamps and a lease/heartbeat when workers can die.

An idempotency key deduplicates operation creation. It does not by itself make
each row mutation replay-safe.

### 2. Cursor stability

Flag mutation loops that page with increasing `OFFSET` over a set whose
membership can change:

```sql
SELECT id FROM table
WHERE status = 'pending'
ORDER BY id
LIMIT 100 OFFSET 500;
```

Deleting or changing an earlier matching row shifts later offsets and can skip
work. Concurrent inserts can repeat work. Prefer keyset pagination:

```sql
SELECT id FROM table
WHERE id > %d AND id <= %d
ORDER BY id ASC
LIMIT 100;
```

Persist the last successfully completed key. Capture an upper bound or materialize
target IDs when new matching rows must not join an in-flight operation. Keyset
pagination prevents offset drift; it does not provide exactly-once effects after
an uncertain response.

Define cursor semantics in the field name and contract: store either
`last_completed_id/page` or `next_id/page_to_process`, never an ambiguous `page`.
Resume from that contract directly instead of applying special `> 1` increments;
test interruption after the first item/page to catch off-by-one replay.

### 3. Replay-safe row effects

Classify each effect:

| Effect | Replay property |
|---|---|
| Set field to a constant | Usually idempotent |
| Delete if present | Usually idempotent |
| Increment / append / send email | Not idempotent |
| Search/replace | Depends on search/replacement and original value |
| Delete then add replacement row | Not atomic; races alter cardinality |

For non-idempotent effects, require an immutable work item with a unique key and
a committed completion marker. Where feasible, update only if the original
version/hash still matches. Do not claim exactly-once delivery to remote systems
without cooperation from that system; use an idempotency key and reconciliation.

### 4. Server-side exclusion

Client-side disabled buttons protect one page, not the server. Audit overlap from
AJAX, another tab, cron, WP-CLI, and another node.

Do not treat `get_transient()` followed by `set_transient()` as an atomic lock.
Use one of:

- a custom-table row protected by a unique key and expiring lease;
- a unique-key insert as the gate;
- a database advisory lock when connection scope and release behavior are
  explicitly handled.

Use a transient only as a soft stampede hint. Never rely on it for financial,
destructive, or exactly-once correctness.

### 5. Mutation result handling

Flag unconditional counters such as:

```php
update_post_meta( $post_id, $key, $value );
++ $processed;
```

WordPress APIs often return `false` for both failure and unchanged state.
Determine the contract of the exact function, inspect `$wpdb->last_error` for
direct SQL where appropriate, and verify the final value when `false` is
ambiguous. Count only verified success/no-op. Return failed IDs or work-item
keys; do not collapse partial failure into a generic success response.

### 6. Transaction and hook boundaries

Keep a database batch and its progress update in one transaction when the
storage engine and code path permit it. Remember that WordPress mutation APIs
emit hooks and can cause email, HTTP, cache, or file side effects that a database
rollback cannot undo. Do not wrap arbitrary hook ecosystems in a transaction
and call the whole workflow atomic.

Make each batch small enough to avoid long locks. Commit before returning a
cursor. Record progress only after required durable effects succeed.

### 7. Cancellation, expiry, and cleanup

Verify that:

- nonce expiry stops authorization without losing durable progress;
- cancellation is checked between work items and never marks unfinished work
  complete;
- stale `running` operations can be reclaimed through a bounded lease;
- failed operations preserve diagnostics and can resume or restart explicitly;
- cleanup does not delete the only evidence needed to reconcile partial work.

### 8. Bounded execution

Impose batch size, wall-time, memory, input-size, and maximum-attempt limits.
`count( $rows ) === $limit` only means the page was full; it does not prove more
rows exist, so allow the harmless final empty page or query for `limit + 1`.
Detect no-progress loops: a destructive restart-at-zero worker must fail closed
when selected rows remain but no mutation succeeds.

## False-positive guards

- Do not flag `OFFSET` on a read-only, immutable report solely because keyset is
  faster; assess consistency and measured cost separately.
- Do not require a durable job table for a single atomic request that can safely
  finish inside its execution budget.
- Do not label every repeated write a race. State the interleaving that violates
  an invariant.
- Do not treat an idempotent final state as proof that hooks, counters, emails,
  or remote side effects are idempotent too.

## Severity guide

- **HIGH:** plausible replay, overlap, or ignored failure can silently corrupt,
  duplicate, skip, charge, send, or delete production data.
- **MEDIUM:** recovery is unreliable under timeout/concurrency, or the worker can
  loop indefinitely without immediate irreversible loss.
- **LOW:** missing progress UX, inefficient extra terminal batch, or hardening
  where the final-state invariant remains safe.

## Report format

For each finding report file/line, affected invariant, exact failure timeline,
preconditions, final bad state, severity, and the smallest safe design change.
Separate confirmed behavior from concurrency scenarios that need dynamic tests.

## Cross-references

- Use **`wp-metadata-api`** when batches read or write WordPress meta rows.
- Use **`wp-database-performance-audit`** for query count, pagination cost, and
  index analysis.
- Use **`wp-plugin-update-migrations`** for versioned schema/data migrations.

## What this skill does NOT cover

- Basic nonce/capability/SQL-injection checks; use `wp-security-audit`.
- Queue backend installation or Action Scheduler API scaffolding.
- Distributed transactions across WordPress and third-party services.

## References

- WordPress DB behavior: `wp-includes/class-wpdb.php`
- Metadata return contracts: `wp-includes/meta.php`
- Option/transient semantics: `wp-includes/option.php`
