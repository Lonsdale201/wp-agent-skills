---
name: wp-relational-data-portability-audit
description: Audit WordPress custom-table export, import, restore, merge, and
  date-range deletion workflows for relational integrity. Covers root selection
  and dependency closure, shared dimensions, portable identity and ID remapping,
  schema-versioned manifests, checksums, staging/conflict policy, transaction
  boundaries, post-import verification, streaming, compressed-size limits, and
  resumable batches. Use when code emits SQL/CSV/JSON backups, preserves
  auto-increment IDs, uses INSERT IGNORE, imports into non-empty databases,
  deletes analytics/log/session data by time range, or promises backup/restore
  for related custom tables.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-15"
---

# WordPress relational data portability audit

Review whether a plugin can export, restore, merge, and delete related custom-
table data without silently changing relationships. This skill is about the
data graph and recovery contract, not merely generating syntactically valid SQL.

## Core invariant

Define the invariant before reviewing code:

> Every exported/imported/retained child and shared dimension refers to the same
> logical object as before, or the operation fails visibly before commit.

A file that imports without a SQL error is not proof of a correct restore.

## Audit workflow

1. Draw the table graph: roots, owned children, optional links, shared dimension
   tables, unique/natural keys, polymorphic references, and deletion direction.
2. Define the selection root. For analytics this may be session, order,
   submission, or operation—not an independent timestamp filter per table.
3. Trace export closure, serialized identity, import mapping, conflict handling,
   commit/progress, cleanup, and post-operation verification.
4. Model an empty restore, a merge into non-empty data with colliding IDs, a
   date boundary through one root object, an interrupted batch, and a retry.
5. Report the exact bad relationship or lost row, not only “missing foreign keys.”

## Critical checks

### 1. Select a root and export its dependency closure

Do not independently filter every related table by its own timestamp. A session
selected by last activity can own visits/events outside that range; selecting
each table separately produces missing children or orphan children.

Start from stable root IDs, then include all required owned rows and referenced
dimensions. Audit every reference column, including secondary/referrer links and
polymorphic fields. Names such as `url_id` and `referrer_url_id`, or `query_id`
and `referrer_query_id`, often point to the same shared table through different
columns.

State the intended mode explicitly:

- **complete object export:** include the whole root aggregate;
- **event slice:** omit the root or mark it partial with semantics that consumers
  understand;
- **legal/retention extract:** define which out-of-range dependencies must remain.

### 2. Do not treat auto-increment IDs as portable identity

Raw source IDs are safe only for a verified empty restore with the same schema
and an explicit no-merge contract. In a non-empty target, this pattern is unsafe:

```sql
-- WRONG — an existing ID can silently win while children bind to it
INSERT IGNORE INTO wp_plugin_parent (id, name) VALUES (42, 'source parent');
INSERT IGNORE INTO wp_plugin_child (parent_id, value) VALUES (42, 'child');
```

`INSERT IGNORE` converts identity conflicts and other data errors into silent
row loss. The child may now point to an unrelated target object.

Prefer stable natural/UUID identities where the domain has them. Otherwise
insert parents without source auto-increment IDs, persist a source-ID → target-ID
map scoped to the import operation, and rewrite every child/reference through
that map. Define duplicate natural-key policy: fail, reuse after equivalence
check, merge, or create a distinct object. Never let SQL defaults decide it.

### 3. Use a versioned, self-describing manifest

Record at least:

- plugin/schema/export-format versions and creation time with timezone;
- source site identity only when needed, never as the target table prefix;
- root selection parameters and complete/partial semantics;
- per-table row counts, byte counts, and cryptographic digests;
- encoding, compression, required features, and dependency order;
- stable export/operation ID for retries and audit logs.

Resolve the target `$wpdb->prefix` at import time. Reject unsupported future
schema versions and validate all counts/digests before mutating production data.
A checksum stored beside attacker-controlled content is corruption detection,
not authenticity; signatures require a separately trusted key.

### 4. Validate and stage before commit

Treat an import file as untrusted even when only administrators can upload it.
Validate extension, real type, compressed and uncompressed bytes, entry count,
encoding, schema, allowed tables/columns, value bounds, and relationship closure.
Do not accept arbitrary SQL statements when the product promises to import only
its own data format.

Prefer:

1. stream parse into operation-scoped staging tables/files;
2. validate counts, identities, references, and conflict policy;
3. apply bounded parent/dimension/child batches with durable progress;
4. atomically publish where the database and hook boundary permit;
5. run integrity checks before marking the operation complete;
6. retain redacted diagnostics and clean staging through a guaranteed path.

Check every `$wpdb` return and `$wpdb->last_error` where appropriate. A partial
import must be resumable or explicitly rolled back; never return generic success
after skipped statements.

### 5. Preserve shared dimensions during range deletion

Range deletion has the same graph problem as export. If a shared URL, user-agent,
tag, or source dimension is referenced by any retained row through any reference
column, it must remain.

Choose roots first, materialize or keyset-page their IDs, delete owned children
in a deliberate order, then garbage-collect dimensions only with a complete
anti-reference check. Do not delete sessions by last activity while deleting
visits by visit timestamp unless partial sessions are an explicit supported
state. Avoid per-dimension N+1 existence queries; use set-based candidate and
anti-join logic after verifying `NULL` semantics (`NOT EXISTS` is often safer
than `NOT IN`).

Use small transactions/batches to limit locks. Run a post-delete orphan and
retained-reference check before reporting success.

### 6. Bound memory, time, and compressed input

Do not load all rows, build one giant SQL string, or remove PHP memory/time
limits. Stream output/input, use keyset batches, cap individual field bytes, and
enforce a maximum decompressed byte count while reading gzip/archive content.

For multi-request or worker operations, require a durable operation record,
cursor, lease, retry budget, cancellation state, and idempotent work items. Apply
`wp-batch-mutation-audit`; a queue changes execution timing but not correctness.

## Verification matrix

Test at least:

1. empty-database restore;
2. non-empty merge with colliding numeric IDs and natural keys;
3. a root whose children cross both date-range boundaries;
4. all primary and secondary/shared reference columns;
5. duplicate input rows and repeated import of the same operation;
6. interruption after staging, parent insert, child insert, and before response;
7. malformed/truncated file, wrong digest/count, unsupported schema, gzip bomb;
8. partial failure and retry with hooks/cache invalidation;
9. post-import/post-delete orphan, dangling, and semantic identity checks;
10. export → import → export comparison using normalized logical identities,
    not source-specific auto-increment IDs.

## False-positive guards

- An ID-preserving dump is not inherently wrong when restore requires a new,
  empty database and verifies that precondition before any write.
- Missing SQL foreign-key constraints do not prove broken integrity; many
  WordPress tables enforce relationships in application code. Audit that code.
- A date filter per table can be correct for intentionally independent event
  facts. Require the product contract and downstream semantics before severity.
- Transactions do not roll back email, HTTP, filesystem, or hook side effects.

## Severity guide

- **HIGH:** a realistic restore/merge/delete can silently bind children to the
  wrong object, lose required rows, delete retained shared data, or claim a
  corrupt backup as successful.
- **MEDIUM:** interruption, scale, or unsupported-version handling can leave a
  recoverable partial state with clear prerequisites.
- **LOW:** manifest, diagnostics, or portability hardening where identity and
  final-state integrity remain correct.

## Report format

Report file/line, root and relationship invariant, exact failure timeline,
empty-vs-merge precondition, resulting wrong/lost/dangling row, severity, and the
smallest design correction. Separate proven corruption from a scenario requiring
dynamic data-volume or concurrency validation.

## Cross-references

- Use **`wp-batch-mutation-audit`** for cursor, retry, lease, cancellation, and
  partial-failure correctness.
- Use **`wp-database-performance-audit`** for query plans, indexes, N+1 checks,
  memory, and lock amplification.
- Use **`wp-file-upload-security`** for upload, archive, MIME, extraction, and
  temporary-file controls.

## What this skill does NOT cover

- Basic authorization, nonce, SQL-injection, and output escaping.
- WooCommerce order storage APIs or HPOS-specific data models.
- Database-server backup tooling, point-in-time recovery, or infrastructure DR.
- Legal decisions about which records must be retained.

## References

- WordPress database API: <https://developer.wordpress.org/reference/classes/wpdb/>
- WordPress privacy engineering: <https://developer.wordpress.org/plugins/privacy/>
- Core source contract: `wp-includes/class-wpdb.php`
