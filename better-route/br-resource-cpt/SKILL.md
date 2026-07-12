---
name: br-resource-cpt
description: Create CRUD endpoints over a custom post type via
  better-route's Resource API — Resource::make('books')->sourceCpt(
  'book')->fields([...])->register($router) generates list / get /
  create / update / delete routes automatically. Important — the
  source-verified visibility method is ->cptVisibleStatuses(['publish',
  'draft']) (the agents.md doc lists ->allowedStatuses but the code at
  src/Resource/Resource.php:235 is named cptVisibleStatuses; same
  semantics, different name). Other Resource builder methods —
  restNamespace, fields, filters, sort, policy, writeSchema (alias
  payloadSchema), fieldPolicy, deleteMode ('force' or 'trash'),
  defaultPerPage, maxPerPage, maxOffset, uniformEnvelope,
  cptVisibilityPolicy, filterSchema. Use when generating CRUD over a
  CPT. Triggers on Resource::make, ->sourceCpt, "REST CRUD over post
  type" with better-route.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Resource/Resource.php
  - src/Resource/ResourcePolicy.php
  - src/Resource/Cpt/WordPressCptRepository.php
  - src/Resource/Cpt/CptRepositoryInterface.php
  - src/Resource/Cpt/CptListQuery.php
  - src/Resource/Cpt/CptListQueryParser.php
  - src/Router/Router.php
---

# better-route: CPT-backed Resource CRUD

For developers generating REST CRUD over a custom post type using better-route's Resource API. The Resource walks the configured fields, filters, write schema, and policy and emits a full list / get / create / update / delete route set automatically — no per-action handler boilerplate.

## Misconception this skill corrects

> "I'll use `->allowedStatuses(['publish', 'draft'])` to restrict visibility per the docs."

The agents.md doc lists this method, but the source-verified name is `->cptVisibleStatuses(...)` at [src/Resource/Resource.php:235](Resource.php). Same semantics — a list of allowed `post_status` values for read operations — but the call site needs the right name or you'll get a fatal "method not found".

```php
// WRONG (per docs draft, but not in v0.4.0 source)
->allowedStatuses(['publish', 'draft'])

// RIGHT (per src/Resource/Resource.php:235)
->cptVisibleStatuses(['publish', 'draft'])
```

If you need conditional / dynamic visibility, use `->cptVisibilityPolicy(callable)` ([Resource.php:253](Resource.php)) — receives `($status, $request, $action)` and returns bool.

Other AI-prone misconceptions:

- "The Resource handles permissions automatically — I don't need a `->policy()`." Wrong — without `->policy()`, the resource has empty permission rules, which behaves as deny-by-default for writes (and 200 for reads, but inconsistent). Always declare a policy (`ResourcePolicy::publicReadPrivateWrite()` is the most common).
- "`writeSchema` and `payloadSchema` do different things." Wrong — `payloadSchema()` ([Resource.php:159](Resource.php)) is just an alias for `writeSchema()` ([Resource.php:150](Resource.php)). Pick one, stay consistent.
- "I'll set `deleteMode('soft')` for trash semantics." Wrong — valid values are `'force'` (default) or `'trash'`. Verified at [Resource.php:212](Resource.php).

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `Resource::make(...)->sourceCpt(...)`.
- The user asks "how do I expose a CPT over REST" / "CRUD endpoints for a post type".
- Reviewing PR with `Resource::make` chains.
- Migrating a hand-rolled `register_rest_route` set into the Resource API.

## Workflow

### 1. Minimal Resource setup

```php
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');

    \BetterRoute\Resource\Resource::make('books')
        ->restNamespace('myapp/v1')
        ->sourceCpt('book')
        ->fields(['id', 'title', 'status', 'content'])
        ->policy(\BetterRoute\Resource\ResourcePolicy::publicReadPrivateWrite('edit_posts'))
        ->register($router);

    $router->register();
});
```

This generates:

- `GET  /myapp/v1/books`         — list
- `GET  /myapp/v1/books/{id}`    — get one
- `POST /myapp/v1/books`         — create
- `PUT  /myapp/v1/books/{id}`    — update
- `PATCH /myapp/v1/books/{id}`   — partial update
- `DELETE /myapp/v1/books/{id}`  — delete

### 2. Choose which actions to emit

```php
Resource::make('books')
    ->sourceCpt('book')
    ->allow(['list', 'get'])   // read-only resource — no create/update/delete routes registered
    ->register($router);
```

`->allow([...])` ([Resource.php:105](Resource.php)) restricts which actions exist on the resource. Useful for read-only catalogs or admin-only mutations exposed via a separate resource.

### 3. Field-level configuration

```php
Resource::make('books')
    ->sourceCpt('book')
    ->fields(['id', 'title', 'status', 'content', 'meta'])
    ->filters(['status', 'author'])           // ?status=publish&author=42
    ->sort(['title', '-modified'])             // accept ?sort=title or ?sort=-modified
    ->cptVisibleStatuses(['publish', 'draft']) // restrict read to these statuses
    ->deleteMode('trash')                       // moves to trash; default is 'force'
    ->register($router);
```

| Method | Purpose |
|---|---|
| `fields(list<string>)` | Which post columns / virtual fields appear in responses (incl. `'meta'` to surface meta entries). |
| `filters(list<string>)` | Which fields can appear as query-string filters (`?status=publish`). |
| `sort(list<string>)` | Allowed sort keys. Prefix `-` for DESC. Sorts NOT in this list return 400. |
| `cptVisibleStatuses(list<string>)` | Allowed `post_status` values for reads. Posts in other statuses 404. |
| `cptVisibilityPolicy(callable)` | Dynamic visibility — receives `($status, $request, $action)`, returns bool. |
| `deleteMode('force'\|'trash')` | DELETE behavior. Default `'force'` permanently deletes; `'trash'` moves to trash. |
| `defaultPerPage(int)` | Default `per_page` when not supplied (default 20). |
| `maxPerPage(int)` | Cap on `per_page` (default 100). |
| `maxOffset(int)` | Cap on offset to prevent deep pagination DoS. |
| `uniformEnvelope(bool)` | When true, responses are wrapped in `{data: ..., meta: ...}` envelope. |

### 4. Write validation (writeSchema)

```php
Resource::make('books')
    ->sourceCpt('book')
    ->writeSchema([
        'title'   => ['type' => 'string', 'required' => true, 'minLength' => 1, 'maxLength' => 200, 'sanitize' => 'text'],
        'isbn'    => ['type' => 'string', 'regex' => '/^[0-9]{10,13}$/'],
        'price'   => ['type' => 'float', 'min' => 0],
        'status'  => ['type' => 'enum', 'enum' => ['values' => ['draft', 'publish']], 'required' => true],
        'website' => ['type' => 'url', 'nullable' => true],
    ])
    ->register($router);
```

Validation runs before the handler. Failures return:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Invalid request.",
    "details": { "fieldErrors": { "title": ["..."], "price": ["..."] } }
  }
}
```

See **`br-write-schema`** for the complete rule reference.

### 5. Field-level write policy

```php
Resource::make('books')
    ->sourceCpt('book')
    ->fieldPolicy([
        'featured' => static fn ($request, string $action): bool
            => current_user_can('manage_options'),
        'price'    => static fn ($request, string $action): bool
            => current_user_can('edit_posts'),
    ])
    ->register($router);
```

The closure receives `($request, $action)` — usually `$action` is one of `'create'`, `'update'`, `'patch'`. Returning `false` strips the field from the incoming payload silently. Useful when a single endpoint serves multiple roles with different write permissions per field.

### 6. Permission policy

```php
->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))
->policy(ResourcePolicy::adminOnly('manage_options'))
->policy(ResourcePolicy::capabilities([
    '*'      => 'edit_posts',
    'delete' => 'manage_options',
]))
->policy(ResourcePolicy::callbacks([
    'update' => fn ($req, $action, $self) => current_user_can('edit_post', (int) $req->get_param('id')),
]))
```

See **`br-resource-policy`** for the complete preset reference.

### 7. Filter schema (custom query-param validation)

```php
->filterSchema([
    'status' => ['type' => 'enum', 'enum' => ['values' => ['publish', 'draft']]],
    'author' => ['type' => 'int', 'min' => 1],
])
```

`filterSchema` ([Resource.php:226](Resource.php)) declares the type / validation contract for query-string filters. Combined with `->filters(['status', 'author'])`, it enforces both "this field is allowed as a filter" AND "the value must match this shape".

### 8. Custom repository for non-default behavior

```php
->usingCptRepository(new MyCustomCptRepository())
```

[Resource.php:173](Resource.php) — replaces the default `WordPressCptRepository`. Most plugins don't need this; the default handles standard CPT semantics correctly. Useful when you have a multi-table CPT or a virtual CPT backed by an external store.

## Critical rules

- **`restNamespace` is required.** Throws `InvalidArgumentException` otherwise. Format: `'vendor/version'` (e.g. `'myapp/v1'`).
- **`->register($router)` is mandatory.** Without it, no routes are wired.
- **`writeSchema()` and `payloadSchema()` are aliases.** Pick one, stay consistent across the codebase.
- **`cptVisibleStatuses(...)` not `allowedStatuses(...)`.** The agents.md doc has the older name; source uses `cptVisibleStatuses` ([Resource.php:235](Resource.php)).
- **`deleteMode` is `'force'` (default) or `'trash'`.** Any other value fails validation.
- **`->policy()` is effectively required** — without one, write actions deny by default. Pick a `ResourcePolicy` preset or pass a `permissions` array.
- **Sort and filter fields must be allowlisted.** `->sort([])` and `->filters([])` are open by default; passing keys not in the allowlist returns 400.
- **`->fieldPolicy` strips silently** — denied fields are removed from the payload before the handler. Use response-side validation if you need to surface "field not authorized" errors.
- **`->allow(['list', 'get'])` restricts which actions register.** Useful for read-only resources.
- **`uniformEnvelope(true)` changes the response shape.** Wraps lists and individual responses in `{data, meta}`. Don't toggle mid-API — clients that expect one shape will break on the other.

## Common mistakes

```php
// WRONG — using allowedStatuses (older docs name)
Resource::make('books')->sourceCpt('book')
    ->allowedStatuses(['publish', 'draft'])  // WRONG: method does not exist
    ->register($router);

// RIGHT
->cptVisibleStatuses(['publish', 'draft'])

// WRONG — no policy declared
Resource::make('books')->sourceCpt('book')
    ->fields(['id', 'title'])
    ->register($router);
// Reads work; writes deny silently because permissions array is empty.

// RIGHT — declare a policy
->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))

// WRONG — restNamespace omitted
Resource::make('books')->sourceCpt('book')->register($router);
// → InvalidArgumentException: 'restNamespace is required.'

// RIGHT
->restNamespace('myapp/v1')

// WRONG — invalid deleteMode
->deleteMode('soft')   // WRONG: throws
->deleteMode('archive')

// RIGHT
->deleteMode('force')   // default — permanent
->deleteMode('trash')   // move to trash

// WRONG — both writeSchema and payloadSchema declared
->writeSchema([...])
->payloadSchema([...])  // overrides the previous; confusing on read-back

// RIGHT — pick one
->writeSchema([...])

// WRONG — fields not in sort allowlist
->sort([])  // empty → no sort allowed
// Client requests ?sort=title → 400 unknown_parameter

// RIGHT — declare allowed sorts
->sort(['title', '-modified', 'date'])

// WRONG — filterSchema without filters allowlist
->filterSchema(['status' => ['type' => 'enum', 'enum' => [...]]])
// status not in ->filters([...]), so the filter is rejected as unknown.

// RIGHT — both
->filters(['status'])
->filterSchema(['status' => ['type' => 'enum', 'enum' => ['values' => ['publish', 'draft']]]])

// WRONG — assuming `meta` field appears without listing it
->fields(['id', 'title', 'status'])
// Response has no meta_data even though the post has meta.

// RIGHT — include 'meta' explicitly
->fields(['id', 'title', 'status', 'meta'])
// See br-woo-routes for meta_data shape; CPT meta uses the same envelope.
```

## Cross-references

- Run **`br-write-schema`** for the full validation rule catalog (types, sanitizers, error envelope).
- Run **`br-resource-policy`** for the policy preset reference (`publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks`) and `fieldPolicy`.
- Run **`br-resource-table`** when the data lives in a custom DB table instead of a CPT.
- Run **`br-routes`** when you need to combine Resource-driven routes with raw routes (e.g. a `/books/{id}/featured` action endpoint).

## What this skill does NOT cover

- Custom-table resources (`->sourceTable(...)`). Covered by **`br-resource-table`** — different deny-by-default rule.
- Block-editor / Gutenberg integration. Resources expose REST; consumer apps decide how to render.
- WP capability design (which capabilities to map to which actions). WP-level decision.
- Async / batched operations. Each Resource action is sync; bulk write is the consumer's concern.
- File / media uploads. The Resource doesn't handle multipart bodies — write a raw route for that.

## References

- Resource class: [libraries/better-route/src/Resource/Resource.php](Resource.php) — fluent builder. Key methods:
  - `restNamespace(string)` line 83 — required.
  - `sourceCpt(string $postType)` line 89.
  - `sourceTable(string $table, string $primaryKey = 'id')` line 95.
  - `allow(list<string> $actions)` line 105 — restrict to subset of `['list', 'get', 'create', 'update', 'delete']`.
  - `fields(list<string>)` line 114.
  - `filters(list<string>)` line 123.
  - `sort(list<string>)` line 132.
  - `policy(array)` line 141.
  - `writeSchema(array)` line 150 / `payloadSchema(array)` line 159 alias.
  - `fieldPolicy(array)` line 167.
  - `usingCptRepository(CptRepositoryInterface)` line 173.
  - `usingTableRepository(TableRepositoryInterface)` line 179.
  - `defaultPerPage(int)` line 185.
  - `maxPerPage(int)` line 192.
  - `maxOffset(int)` line 199.
  - `uniformEnvelope(bool $enabled = true)` line 206.
  - `deleteMode(string $mode)` line 212 — `'force'` or `'trash'`.
  - `filterSchema(array)` line 226.
  - `cptVisibleStatuses(list<string>)` line 235.
  - `cptVisibilityPolicy(callable)` line 253.
  - `register(?DispatcherInterface)` line 259.
- CPT repository / dispatcher: [libraries/better-route/src/Resource/Cpt/](Cpt/) — `WordPressCptRepository`, `CptListQuery`, `CptListQueryParser`.
- ResourcePolicy: [libraries/better-route/src/Resource/ResourcePolicy.php](ResourcePolicy.php) — preset factory.
