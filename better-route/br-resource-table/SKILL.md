---
name: br-resource-table
description: Create CRUD endpoints over a custom database table via
  better-route's Resource API — Resource::make('audit')->sourceTable(
  'wp_myapp_events')->fields([...])->policy(...)->register($router).
  Critical v0.3.0 rule — custom-table resources are deny-by-default
  for ALL actions including list and get (CPT sources still allow
  reads, but raw tables don't have WP's visibility model). Without an
  explicit ->policy() declaration the resource returns 403 on every
  call. fields() is also REQUIRED — throws InvalidArgumentException
  if empty (CPT sources have implicit fields from post columns; tables
  do not). Other Resource builder methods carry over from CPT —
  filters, sort, writeSchema, fieldPolicy, deleteMode, defaultPerPage.
  Use when generating CRUD over a custom DB table. Triggers on
  Resource::make + ->sourceTable, "REST CRUD over custom table" with
  better-route, "$wpdb->prefix . 'myapp_*'".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: Custom-table-backed Resource CRUD

For developers generating REST CRUD over a custom database table (audit logs, analytics events, plugin-specific entities) using better-route's Resource API. Same fluent builder as CPT resources, but with two stricter rules — deny-by-default for all actions, and explicit `fields()` required.

## Misconception this skill corrects

> "I set up a `Resource::make('audit')->sourceTable('wp_myapp_events')->register($router)` and the list endpoint returns 403 even for admins. Must be a permission cache issue."

It's not a cache issue. Verified at [src/Resource/Resource.php:835-844](Resource.php) — the `defaultPermissionForAction` for table-source resources returns `false` for **every** action (list, get, create, update, delete) when no `->policy()` is declared:

```php
return match ($action) {
    'list', 'get' => $this->sourceCpt !== null
        ? static fn (): bool => true
        : static fn (): bool => false,    // ← table reads deny by default
    default       => static fn (): bool => false,
};
```

The rationale: a CPT inherits WordPress's visibility model (post_status, capability mapping, public/private logic) so reads are reasonable to allow by default. A raw custom table has no such model — better-route deliberately refuses to guess and forces the developer to declare intent.

The fix:

```php
Resource::make('audit')
    ->sourceTable('wp_myapp_events')
    ->fields(['id', 'event_type', 'user_id', 'created_at'])
    ->policy(ResourcePolicy::publicReadPrivateWrite('manage_options'))
    ->register($router);
```

Other AI-prone misconceptions:

- "I'll skip `fields([...])` since the table has obvious columns the resource can introspect." Wrong — table-source requires explicit `fields()`. Verified at [Resource.php:514-517](Resource.php): `if ($fields === []) throw new InvalidArgumentException('fields are required for sourceTable resources.')`. Better-route doesn't introspect schemas; you list the exposed columns.
- "Custom table resources support the same `cptVisibleStatuses` for soft-delete." Wrong — `cptVisibleStatuses` and `cptVisibilityPolicy` are CPT-only. Custom tables have no `post_status` concept. For soft-delete on a custom table, model it explicitly: add a `deleted_at` column, exclude rows via repository logic.
- "`->sourceTable('wp_myapp_events')` works with cross-database tables." Wrong — table names with `.` (cross-database references) are rejected by the underlying `WpdbIdempotencyStore` and table dispatcher to prevent cross-DB writes.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `Resource::make(...)->sourceTable(...)`.
- The user asks "how do I expose a custom DB table over REST" / "CRUD endpoints for `wp_myapp_*`".
- Reviewing a PR with `Resource::make` + `sourceTable`.
- Triaging "Resource returns 403 on every call" after a v0.3.0 upgrade — table policy is the missing piece.

## Workflow

### 1. Minimal table resource

```php
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');

    \BetterRoute\Resource\Resource::make('audit_events')
        ->restNamespace('myapp/v1')
        ->sourceTable('wp_myapp_audit_events')
        ->fields(['id', 'event_type', 'user_id', 'created_at'])
        ->filters(['event_type', 'user_id'])
        ->sort(['created_at', 'id'])
        ->policy(\BetterRoute\Resource\ResourcePolicy::adminOnly('manage_options'))
        ->register($router);

    $router->register();
});
```

This generates:

- `GET    /myapp/v1/audit_events`         — list
- `GET    /myapp/v1/audit_events/{id}`    — get one
- `POST   /myapp/v1/audit_events`         — create
- `PUT    /myapp/v1/audit_events/{id}`    — update
- `PATCH  /myapp/v1/audit_events/{id}`    — partial update
- `DELETE /myapp/v1/audit_events/{id}`    — delete

(Use `->allow(['list', 'get'])` to restrict — see step 4.)

### 2. Pass the unprefixed table name? Or the prefixed?

`->sourceTable('wp_myapp_events')` — pass the FULL table name as it appears in `$wpdb`. Better-route does NOT auto-prefix:

```php
global $wpdb;
$tableName = $wpdb->prefix . 'myapp_events';   // e.g. 'wp_myapp_events' or 'wp_2_myapp_events' on multisite
->sourceTable($tableName)
```

If you hardcode `'wp_myapp_events'`, your resource breaks on multisite installs where `$wpdb->prefix` is `'wp_2_'`. Use `$wpdb->prefix` to compose the full name at registration time.

### 3. Custom primary key

```php
->sourceTable('wp_myapp_events', 'event_id')   // second arg = primary-key column name
```

Default is `'id'`. The primary key drives URL routing (`/audit_events/{id}` looks up by `event_id` column when configured).

### 4. Restrict actions

```php
Resource::make('audit_events')
    ->sourceTable('wp_myapp_events')
    ->fields(['id', 'event_type', 'user_id', 'created_at'])
    ->allow(['list', 'get'])      // read-only — no create/update/delete routes registered
    ->policy(ResourcePolicy::adminOnly('manage_options'))
    ->register($router);
```

For event logs / read-only feeds, restrict to `['list', 'get']`. Don't register write routes that would never be exercised.

### 5. Sort default

If you don't declare `->sort([...])`, the default sort is by primary key ([Resource.php:524](Resource.php) — `allowedSort: $this->sort !== [] ? $this->sort : [$primaryKey]`). For chronological data, declare `'created_at'` first:

```php
->sort(['-created_at', 'id'])   // newest-first by default
```

### 6. Pagination

```php
->defaultPerPage(20)     // default page size
->maxPerPage(100)        // hard cap
->maxOffset(10000)       // prevent deep-pagination DoS (LIMIT N OFFSET 50000 is expensive)
```

The list response shape matches the CPT resource's:

```json
{
  "data": [ /* rows */ ],
  "meta": { "page": 1, "perPage": 20, "total": 1234 }
}
```

(`uniformEnvelope(true)` applies the same `{data, meta}` wrapper to single-record responses.)

### 7. Custom repository for derived tables

```php
->usingTableRepository(new MyJoinedTableRepository())
```

The default `WordPressTableRepository` does single-table CRUD via `$wpdb`. For derived data (joins, aggregates), implement `TableRepositoryInterface` ([src/Resource/Table/TableRepositoryInterface.php](TableRepositoryInterface.php)). Most plugins don't need this.

### 8. Write validation

```php
->writeSchema([
    'event_type' => ['type' => 'string', 'required' => true, 'enum' => ['values' => ['login', 'logout', 'failed_attempt']]],
    'user_id'    => ['type' => 'int', 'min' => 0, 'nullable' => true],
    'created_at' => ['type' => 'date', 'required' => true],
])
```

Same syntax as CPT resources — see **`br-write-schema`** for the full catalog.

## Critical rules

- **Custom-table resources are deny-by-default for ALL actions** (including list and get). Without `->policy()`, every call returns 403. Verified at [Resource.php:840-844](Resource.php).
- **`->fields([...])` is REQUIRED for table sources.** Throws `InvalidArgumentException` otherwise.
- **`->restNamespace()` is REQUIRED.** Same as CPT.
- **Pass the full prefixed table name** — better-route does NOT add `$wpdb->prefix`. Use `$wpdb->prefix . 'myapp_events'` to be multisite-safe.
- **Cross-database table names (containing `.`) are rejected** — security guard against accidental cross-DB writes.
- **Default sort is the primary key** when `->sort([])` is empty. Declare an explicit sort for chronological / business-meaningful ordering.
- **`cptVisibleStatuses` / `cptVisibilityPolicy` don't apply.** Tables have no `post_status`. Implement soft-delete via a column + repository filter.
- **`deleteMode('trash')` doesn't apply** — there's no trash for custom tables. `deleteMode('force')` is the only valid value (the default).
- **`->allow([...])` is the right way to make read-only resources** — don't try to deny writes via empty policy callbacks; restrict at registration.

## Common mistakes

```php
// WRONG — no policy declared
Resource::make('audit')->sourceTable('wp_myapp_events')
    ->fields(['id', 'event_type'])
    ->register($router);
// → list / get / create / update / delete ALL return 403

// RIGHT — declare a policy
->policy(ResourcePolicy::adminOnly('manage_options'))

// WRONG — no fields declared
Resource::make('audit')->sourceTable('wp_myapp_events')
    ->policy(ResourcePolicy::adminOnly())
    ->register($router);
// → throws InvalidArgumentException: 'fields are required for sourceTable resources.'

// RIGHT
->fields(['id', 'event_type', 'user_id', 'created_at'])

// WRONG — hardcoded table name without prefix
->sourceTable('myapp_events')   // WP looks for actual table 'myapp_events' (no wp_ prefix); usually doesn't exist

// RIGHT
global $wpdb;
->sourceTable($wpdb->prefix . 'myapp_events')

// WRONG — assuming CPT visibility methods work on tables
Resource::make('events')->sourceTable($wpdb->prefix . 'events')
    ->cptVisibleStatuses(['active'])   // 🔴 method exists but does nothing for table-source
    ->register($router);

// RIGHT — implement soft-delete in the table itself
// Add a 'status' column, filter via filterSchema:
->fields(['id', 'name', 'status'])
->filters(['status'])
->filterSchema(['status' => ['type' => 'enum', 'enum' => ['values' => ['active']]]])
// Or use ->usingTableRepository(...) with a custom repo that always filters status='active' on reads.

// WRONG — cross-database table reference
->sourceTable('other_db.wp_myapp_events')   // 🔴 rejected by guard

// RIGHT — same database
->sourceTable($wpdb->prefix . 'myapp_events')

// WRONG — empty sort + numeric primary key on a chronological log
->sourceTable($wpdb->prefix . 'audit_log')
->fields(['id', 'created_at', 'event_type'])
// Default sort is 'id' — fine for primary-key fetch, but a list scroll feels random.

// RIGHT
->sort(['-created_at', 'id'])   // newest-first; id as tiebreaker

// WRONG — hoping deleteMode('trash') gives soft-delete on tables
->deleteMode('trash')   // 🔴 throws or no-ops; trash is CPT-only

// RIGHT — soft-delete via column + repository filter
// Add 'deleted_at' nullable column, filter rows where deleted_at IS NULL, set deleted_at on DELETE.
// Implement via a custom TableRepository.

// WRONG — assuming the resource introspects the table schema for fields
->sourceTable('wp_myapp_events')
// (no fields() call)
// Hopes resource discovers columns via DESCRIBE — it does not. Throws.

// RIGHT — explicit fields list
->fields(['id', 'event_type', 'user_id', 'payload', 'created_at'])
```

## Cross-references

- Run **`br-resource-cpt`** for the CPT-source equivalent — same fluent builder, different default-permission semantics.
- Run **`br-resource-policy`** for the policy preset reference — `adminOnly`, `publicReadPrivateWrite`, `capabilities`, `callbacks`.
- Run **`br-write-schema`** for the validation rule catalog used in `->writeSchema(...)`.
- Run **`br-install-and-migrate`** if you're upgrading from <v0.3.0 — the deny-by-default rule for tables landed in v0.3.0.

## What this skill does NOT cover

- DB schema migration. Better-route assumes the table exists; create it via plugin activation hooks (see `wp-plugin-lifecycle` skill).
- `dbDelta` calls / table creation syntax. WP-level concern.
- Multi-table joins (one Resource exposing data from N tables). Use `->usingTableRepository(...)` with a custom repo.
- Row-level access control (e.g. "user X can only see rows where `user_id = X`"). Use `->fieldPolicy` or, for whole-row gating, a `policy(ResourcePolicy::callbacks(...))` that reads the request and rejects.
- Bulk operations / batch writes. Resources are single-row; bulk is a consumer concern.
- Real-time subscriptions / SSE / WebSocket. Out of scope.

## References

- Resource builder: [libraries/better-route/src/Resource/Resource.php:95-100](Resource.php) — `sourceTable(string $table, string $primaryKey = 'id')`.
- Required-field guard: [Resource.php:512-517](Resource.php) — `if ($fields === []) throw new InvalidArgumentException('fields are required for sourceTable resources.')`.
- Default permission for table source: [Resource.php:835-844](Resource.php) — `defaultPermissionForAction` returns `false` for table-source on every action.
- Default sort fallback: [Resource.php:524](Resource.php) — `allowedSort: $this->sort !== [] ? $this->sort : [$primaryKey]`.
- Table dispatcher: [libraries/better-route/src/Resource/Table/](Table/) — `WordPressTableRepository`, `TableListQuery`, `TableListQueryParser`.
- ResourcePolicy presets: [libraries/better-route/src/Resource/ResourcePolicy.php](ResourcePolicy.php).
