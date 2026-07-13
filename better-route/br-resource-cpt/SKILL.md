---
name: br-resource-cpt
description: Build better-route 1.1 CRUD endpoints over a WordPress custom post type with Resource::make, restNamespace, sourceCpt, allow, fields, filters, sort, filterSchema, writeSchema, policy, fieldPolicy, cptVisibleStatuses, cptVisibilityPolicy, pagination, deleteMode, uniformEnvelope, or a custom CPT repository. Use when exposing CPT records safely, reviewing visibility and pagination, or generating Resource OpenAPI contracts.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# better-route: CPT Resource CRUD

Register the Resource itself during `rest_api_init`; it creates and registers its own internal Router from `restNamespace`.

```php
use BetterRoute\Resource\Resource;
use BetterRoute\Resource\ResourcePolicy;

add_action('rest_api_init', static function (): void {
    Resource::make('books')
        ->restNamespace('myapp/v1')
        ->sourceCpt('book')
        ->allow(['list', 'get', 'create', 'update', 'delete'])
        ->fields(['id', 'title', 'slug', 'content', 'status', 'author'])
        ->filters(['status', 'author'])
        ->filterSchema([
            'status' => ['type' => 'enum', 'values' => ['publish', 'draft']],
            'author' => 'int',
        ])
        ->sort(['date', 'title', 'id'])
        ->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))
        ->writeSchema([
            'title' => ['type' => 'string', 'required' => true, 'sanitize' => 'text'],
            'status' => ['type' => 'enum', 'values' => ['draft', 'publish']],
        ])
        ->deleteMode('trash')
        ->register();
});
```

Do not pass a `Router` to `Resource::register()`. Its optional argument is a `DispatcherInterface`, intended mainly for tests/custom dispatch.

## Actions

Omitting `allow()` registers full CRUD. In 1.1:

- `allow(['list', 'get'])` creates a read-only Resource;
- `allow([])` deliberately registers no routes;
- unsupported names throw `InvalidArgumentException`;
- `update` covers both PUT and PATCH.

Never configure both `sourceCpt()` and `sourceTable()`; the second call now throws.

## CPT visibility

Default visible statuses are `['publish']`. Configure the source-verified method:

```php
->cptVisibleStatuses(['publish', 'draft'])
```

There is no `allowedStatuses()` method.

1.1 fails closed on reads:

- default list/get permission allows an unset policy only when the post type is publicly viewable;
- every item must have a visible status;
- the post type/item must be publicly queryable;
- password-protected items require `can_read === true`;
- the Resource always asks the repository for `id`, `status`, `password_protected`, `publicly_queryable`, and `can_read`, even if the client did not request them;
- missing security fields from a custom repository deny rather than expose the item.

Prefer an explicit Resource policy even though public CPT reads have a safe default.

For additional item logic:

```php
->cptVisibilityPolicy(static function (array $item, string $action): bool {
    return ($item['tenant_id'] ?? null) === current_tenant_id();
})
```

The callback receives the projected repository item plus action (`list` or `get`), not just a status and not the WP request.

An arbitrary PHP callback cannot be pushed into `WP_Query`. To keep `total`, pages, and page contents truthful, 1.1 scans every matched repository page, applies the callback, then slices the visible set. This can be expensive. On large datasets, implement visibility in a custom query-level repository/filter so the database produces the correct total.

## Query contract

List queries use:

- `fields=a,b,c`
- `sort=field` or `sort=-field`
- `page` and `per_page`
- explicitly listed filters.

Configure sort field names without a `-` prefix:

```php
->sort(['date', 'title', 'id'])
// Client may request ?sort=-date
```

An empty sort configuration uses the defaults `date` and `id`; it is not an open/no-sort state. The repository adds ID as a stable tie-breaker.

Strict unknown-parameter checks allow WordPress globals `_locale`, `_fields`, `_embed`, `_envelope`, and `_jsonp`. This keeps `wp.apiFetch`'s `_locale=user` compatible while rejecting other unknown input.

Configure pagination in any fluent order, but the final state must satisfy:

- `defaultPerPage >= 1`;
- `maxPerPage >= 1`;
- `defaultPerPage <= maxPerPage`;
- `maxOffset >= 0`.

Exceeding `maxPerPage` or `maxOffset` returns `400 validation_failed`; values are not silently clamped.

## Writes and policies

Use flat enum rules:

```php
['type' => 'enum', 'values' => ['draft', 'publish']]
```

Use `br-write-schema` for validation and `br-resource-policy` for action/field authorization. In 1.1 a denied `fieldPolicy` does not silently discard the field: it returns a validation error or `403 forbidden` according to the rule type.

The default `WordPressCptRepository` also checks mapped CPT capabilities for create/update/delete and publishing/author changes. Resource route permission does not replace object-level WordPress capability checks.

Valid delete modes are `force` and `trash`.

## Response and OpenAPI

Lists return `{data, meta}`. Create/update return `{data}`. A single get returns the raw item unless `uniformEnvelope(true)` is set; then it returns `{data}`.

After `register()`, call `contracts()` to export generated contracts. Provide `<Resource>`, `<Resource>Input`, `<Resource>Response`, and `<Resource>ListResponse` schemas in strict OpenAPI mode as applicable. Explicitly public Resource actions emit `security: []`.

## Review checklist

- Set `restNamespace` and exactly one source.
- Choose `allow()` deliberately; distinguish omitted from `[]`.
- Declare an explicit policy for the intended audience.
- Keep visibility security fields available in custom repositories.
- Avoid per-item visibility callbacks for large result sets.
- Use flat enum `values` and field names without `-` in `sort()`.
- Test private status, non-public CPT, password protection, denied field write, pagination totals, and `_locale=user`.

## Related skills

- Use `br-resource-policy` for action and field authorization.
- Use `br-write-schema` for payload validation.
- Use `br-openapi` for generated schemas/contracts.

## References

- Verified source paths:
  - `src/Resource/Resource.php`
  - `src/Resource/Cpt/WordPressCptRepository.php`
  - `src/Resource/Cpt/CptListQueryParser.php`
  - `src/Resource/ResourcePolicy.php`
