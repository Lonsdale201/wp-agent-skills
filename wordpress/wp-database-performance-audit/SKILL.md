---
name: wp-database-performance-audit
description: Audits WordPress PHP data access for slow or unbounded SQL,
  LIMIT/OFFSET degradation, N+1 queries, missing cache priming, expensive
  postmeta joins, LONGTEXT sorting/aggregation, leading-wildcard LIKE, oversized
  result transfer, unsuitable indexes, cache stampedes, stale invalidation, and
  direct-write cache bypass. Use when reviewing $wpdb queries, WP_Query loops,
  metadata loops, admin reports, imports, migrations, bulk tools, transients,
  object-cache behavior, EXPLAIN plans, or performance problems that grow with
  posts/users/orders/meta rows.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-12"
docs:
  - https://developer.wordpress.org/reference/classes/wpdb/
  - https://developer.wordpress.org/reference/classes/wp_query/
  - https://developer.wordpress.org/reference/functions/update_meta_cache/
source-refs:
  - wp-admin/includes/schema.php
  - wp-includes/class-wpdb.php
  - wp-includes/meta.php
  - wp-includes/class-wp-query.php
---

# WordPress database performance audit

Review how query cost, result size, cache behavior, and write amplification scale
with production data. Keep this separate from SQL-injection review and from the
WP 6.9 salted internal query-cache format.

## Audit workflow

1. Inventory queries on each request/worker path, including calls hidden inside
   metadata and option APIs.
2. Estimate rows matched, rows examined, bytes returned, query count, and how
   each grows with dataset size.
3. Read the actual core/custom table schema and indexes; do not infer indexes
   from column names.
4. Inspect representative `EXPLAIN` plans in a safe environment when available.
5. Trace cache key, miss sentinel, TTL, invalidation, concurrency, and fallback
   behavior.
6. Rank measured or mechanically demonstrated bottlenecks above style advice.

## Critical checks

### 1. Unbounded reads and oversized transfer

Flag queries without a deliberate bound when row count or value size can grow.
`LIMIT 500` bounds rows, not bytes: one `LONGTEXT` value can still exhaust PHP
memory. Select only required columns and bound data at the database boundary
when a preview is sufficient.

Do not fetch full rows and trim them only after hydration. Check whether a
database substring changes semantics (multibyte, ordering, serialized data)
before recommending it.

### 2. OFFSET degradation and drift

Large offsets require the database to find and discard preceding rows. Repeated
batch pages can approach quadratic total work:

```sql
... ORDER BY id ASC LIMIT 100 OFFSET 500000
```

Prefer a stable indexed keyset cursor (`id > last_id ORDER BY id LIMIT ...`).
For mutating sets, also apply `wp-batch-mutation-audit`; keyset improves cost but
does not solve replay or concurrent membership changes by itself.

### 3. N+1 API calls

Trace loops where each object causes another query:

```php
foreach ( $post_ids as $post_id ) {
    $value = get_post_meta( $post_id, '_key', true );
}
```

Check whether the query API already primed caches. Otherwise use
`update_meta_cache( 'post', $post_ids )`, request needed fields in one query, or
redesign the operation. For writes, count the internal reads/hooks/cache deletes
performed by each metadata call; a batch size of 500 can mean thousands of SQL
statements.

### 4. Core meta-table index reality

Default `wp_postmeta` has separate indexes on `post_id` and a prefix of
`meta_key`; it does not have a core composite `(meta_key, post_id)` index and
does not index `meta_value`. The same broad shape applies to other meta tables
with their object-ID differences.

Flag plans that require filtering/grouping/sorting many meta rows, especially:

- `meta_value LIKE '%term%'`;
- casts/ranges on `meta_value`;
- `GROUP BY meta_key, ...` across the whole table;
- `MIN/MAX/ORDER BY` on `LONGTEXT` values;
- joins that multiply rows before `DISTINCT`.

Do not casually make a plugin alter WordPress core table indexes. For a product
feature with stable query requirements, prefer a purpose-built custom table.
Site-specific DBAs may add indexes after measuring workload and upgrade impact.

### 5. Correct aggregate semantics

Verify what a count represents. `COUNT(*)` or `SUM(condition)` over a meta join
counts rows, not distinct posts/users. Duplicate meta keys can inflate UI totals
and drive the wrong batch progress. Use `COUNT(DISTINCT object_id)` only when the
product definition is distinct objects; do not apply it mechanically because it
can be expensive.

Ensure sample/detail queries use the same joins, status filters, tenant/blog
scope, and deletion rules as overview counts.

### 6. Query shape and prepared SQL

Prepared dynamic `IN` placeholders generated with `array_fill()` are valid when
the placeholder list is code-generated and every value is passed to
`$wpdb->prepare()`. Do not report that pattern as SQL injection merely because a
static analyzer sees interpolation.

Table names from trusted `$wpdb` properties are not user input. User-selected
identifiers and sort directions still require semantic allowlists even when `%i`
is available.

### 7. Cache effectiveness and stampede

For every cache answer:

- What exact source result is cached?
- Can `false`/`null` be a legitimate value confused with a miss?
- Is the TTL a maximum age rather than a durability promise?
- Which writes invalidate it, including writes from other plugins?
- Can two misses run the expensive query concurrently?
- Does invalidation happen once per completed operation or on every batch?
- What happens with and without persistent object cache?

Use a soft lock to reduce recomputation stampedes. Do not use a transient lock
as correctness-grade mutual exclusion. Allow stale-while-revalidate only when
the product can display stale data safely.

### 8. Direct writes and cache/hook bypass

Direct `$wpdb` writes can be appropriate for set-based performance, but they
bypass core mutation hooks, validation, and object-cache invalidation. Require an
explicit plan for `clean_post_cache()`, meta-cache deletion, or the matching
entity cache. Do not replace thousands of safe API writes with direct SQL unless
the lost hook semantics are understood and tested.

### 9. Instrument safely

Use Query Monitor or `SAVEQUERIES` only in development; `SAVEQUERIES` retains SQL,
timings, and call stacks in memory. Use representative data volumes and record
query count plus wall time.

Run `EXPLAIN` on reads in a non-production or read-only context. Avoid presenting
`EXPLAIN ANALYZE` as harmless: depending on the database and statement it
executes the query. Never benchmark destructive statements on production data.

## False-positive guards

- Direct SQL is not automatically a performance or security bug.
- A full scan on a tiny bounded configuration table may be the simplest correct
  design; state the scale assumption.
- A transient does not automatically fix an expensive query. Verify hit rate,
  invalidation frequency, payload size, and stampede behavior.
- Do not recommend an index without column order, selectivity, write cost, and a
  representative query plan.
- Do not assume every getter inside a loop queries the database; verify cache
  priming on that path.

## Severity guide

- **HIGH:** predictable timeout, memory exhaustion, lock amplification, or
  superlinear work on realistic production volume.
- **MEDIUM:** material N+1/full-scan/stampede issue under a documented scale or
  concurrency condition.
- **LOW:** bounded inefficiency, cache hygiene, or maintainability improvement
  without demonstrated production impact.

## Report format

Report file/line, query/API path, table/index facts, estimated or measured scale,
query count/bytes where available, cache behavior, failure mode, severity, and a
fix that preserves semantics. Label unmeasured estimates as estimates.

## Cross-references

- Use **`wp-query-cache`** only for direct interaction with core query-cache
  groups and salted helpers.
- Use **`wp-batch-mutation-audit`** for retries, locks, and mutation cursors.
- Use **`wp-plugin-options-storage`** when the storage primitive itself is wrong.

## What this skill does NOT cover

- SQL injection and authorization; use `wp-security-audit`.
- Redis/Memcached server sizing and database server tuning.
- Vendor-specific optimizer hints or universal index prescriptions.

## References

- Core schema and indexes: `wp-admin/includes/schema.php`
- Query recording/error contracts: `wp-includes/class-wpdb.php`
- Meta cache behavior: `wp-includes/meta.php`

