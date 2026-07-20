---
name: br-resource-table
description: Build better-route 1.1 CRUD endpoints over a custom WordPress database table with Resource::make, restNamespace, sourceTable, primary key, fields, filters, sort, filterSchema, writeSchema, policy, pagination, allow, SQL NULL writes, stable ordering, or a custom TableRepositoryInterface. Use when exposing plugin tables safely or reviewing deny-by-default table permissions and SQL behavior.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# better-route: custom-table Resource CRUD

Custom tables have no WordPress visibility model, so all actions deny by default until an explicit policy is supplied.

```php
use BetterRoute\Resource\Resource;
use BetterRoute\Resource\ResourcePolicy;

add_action('rest_api_init', static function (): void {
    global $wpdb;

    Resource::make('audit-events')
        ->restNamespace('myapp/v1')
        ->sourceTable($wpdb->prefix . 'myapp_audit_events', 'id')
        ->allow(['list', 'get'])
        ->fields(['id', 'event_type', 'user_id', 'created_at'])
        ->filters(['event_type', 'user_id'])
        ->filterSchema(['user_id' => 'int'])
        ->sort(['created_at', 'id'])
        ->policy(ResourcePolicy::adminOnly('manage_options'))
        ->register();
});
```

Do not pass a Router to `register()`. The optional argument is a dispatcher for tests/custom integration.

## Required configuration

- Set `restNamespace('vendor/version')`.
- Set exactly one of `sourceTable()` or `sourceCpt()`; 1.1 rejects both.
- Set a non-empty `fields()` list for table resources.
- Set a policy. Without it, list/get/create/update/delete all return 403.

Omitting `allow()` registers full CRUD. `allow([])` registers no routes. Invalid action names throw. `update` creates both PUT and PATCH routes.

## Table name and primary key

`WpdbAdapter` accepts either the current full prefixed table name or an unprefixed suffix. When the supplied name does not start with current `$wpdb->prefix`, the adapter prepends it. Prefer the explicit multisite-safe form:

```php
->sourceTable($wpdb->prefix . 'myapp_events', 'event_id')
```

Do not pass a different database/table qualified name; `.` is rejected. Identifiers must be simple SQL identifiers.

The second argument is the database primary-key column. The generated WordPress route uses `/(?P<id>\d+)`; its `id` value maps to that column, while OpenAPI renders the parameter as `{id}`.

## Sorting and pagination

`sort()` is an allowlist of field names; it does not set a default direction:

```php
->sort(['created_at', 'id'])
// ?sort=created_at  => ASC
// ?sort=-created_at => DESC
```

Do not include `-created_at` in the allowlist. When no sort query is supplied, the adapter orders by the primary key ascending. When sorting by another field, 1.1 adds the primary key in the same direction as a deterministic tie-breaker.

Configure pagination in any fluent order. At registration the final values must satisfy `defaultPerPage <= maxPerPage`, both positive, and non-negative `maxOffset`. Oversized page/offset input returns `400 validation_failed`, not a silent clamp.

Strict list parsing accepts WordPress global REST parameters `_locale`, `_fields`, `_embed`, `_envelope`, and `_jsonp`; other unrecognized parameters fail.

## Filters and SQL NULL

Only allowlisted filter columns become SQL predicates. In 1.1 a null filter value becomes `IS NULL` rather than an equality against an empty string.

On create/update, a nullable field with payload `null` is written as real SQL `NULL`:

```php
->writeSchema([
    'event_type' => ['type' => 'string', 'required' => true],
    'user_id' => ['type' => 'int', 'nullable' => true],
])
```

The adapter validates every table/column identifier, uses prepared bindings for values, rejects structured array/object column values, and allowlists writable fields.

## Deletion and custom repositories

The default table repository performs a physical `DELETE`. Resource `deleteMode('trash')` is meaningful for CPT repositories only and does not create table soft-delete semantics. Implement a custom `TableRepositoryInterface` for `deleted_at`, joins, aggregates, tenant constraints, or storage-level optimistic updates:

```php
->usingTableRepository(new MyTableRepository())
```

Row-level authorization must be enforced by policy plus repository/query constraints. `fieldPolicy` protects writes to fields; it does not filter list rows.

## Response and OpenAPI

Lists return `{data, meta}`; create/update return `{data}`; a single get is raw unless `uniformEnvelope(true)` is enabled. After registration, use `contracts()` for OpenAPI export and provide the matching response-envelope schemas in strict mode.

## Review checklist

- Use current `$wpdb->prefix` and reject cross-database identifiers.
- Expose only an explicit `fields()` list.
- Add a policy for every action that exists.
- Distinguish omitted `allow()` from `allow([])`.
- Configure sort names without `-` and rely on primary-key tie-breaking.
- Test SQL null create/update/filter behavior.
- Add tenant/ownership conditions at query/repository level.
- Test `_locale=user`, unknown params, oversized pagination, and concurrent writes.

## Related skills

- Use `br-resource-policy` for action and field authorization.
- Use `br-write-schema` for payload rules.
- Use `br-optimistic-locking` when concurrent updates need a version precondition.

## References

- Verified source paths:
  - `src/Resource/Resource.php`
  - `src/Resource/Table/WordPressTableRepository.php`
  - `src/Resource/Table/TableListQueryParser.php`
  - `src/Storage/WpdbAdapter.php`
