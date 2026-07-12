---
name: br-resource-policy
description: >-
  Configure permission policies on a better-route Resource —
  use a ResourcePolicy preset (publicReadPrivateWrite, adminOnly,
  capabilities, callbacks) for per-action authorization, or
  ->fieldPolicy([...]) for per-field write authorization. The four
  presets all return ['permissions' => [...]] with different
  configurations — publicReadPrivateWrite opens list/get and gates
  writes on a capability, adminOnly gates everything on a single
  capability (default manage_options), capabilities wraps any
  per-action map (action keys: list, get, create, update, delete, *),
  callbacks does the same with callable values. Important — denied
  fields under fieldPolicy are stripped silently from the payload, NOT
  rejected with an error; combine with response-side validation if
  consumers need to know. Use when configuring a Resource's
  permissions or per-field writes. Triggers on ResourcePolicy::,
  ->policy([), ->fieldPolicy([ in better-route Resources.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Resource/ResourcePolicy.php
  - src/Resource/Resource.php
---

# better-route: Resource permission policies

For developers configuring authorization on a better-route Resource — both per-action (who can list / get / create / update / delete) and per-field (who can set the `featured` flag, who can write `price`). Four `ResourcePolicy` presets cover most patterns; `->fieldPolicy` handles the rest.

## Misconception this skill corrects

> "I'll declare `->fieldPolicy(['featured' => fn ($req) => current_user_can('manage_options')])` and a non-admin will see a 403 when they try to write that field."

Wrong — denied fields are stripped silently from the payload before the handler runs, not rejected with an error. If a non-admin POSTs `{title: "X", featured: true}`, the handler receives `{title: "X"}` — `featured` is silently dropped, the post is created without the privileged flag, and the consumer thinks the request succeeded.

This is the deliberate design — `fieldPolicy` is for forward-compat scenarios where the API surface should accept the same payload from all roles, but only certain roles can modify certain fields. If you need the consumer to know "you tried to set a privileged field and weren't allowed", do the explicit check inside the handler:

```php
->fieldPolicy([
    'featured' => static fn ($request, string $action): bool
        => current_user_can('manage_options'),
])
// AND, in your handler / via writeSchema:
'featured' => ['type' => 'bool', 'sanitize' => function ($value, $field) {
    if (!current_user_can('manage_options') && $value) {
        throw \BetterRoute\Http\ApiException::forbidden('only admins can set featured');
    }
    return $value;
}],
```

Other AI-prone misconceptions:

- "`adminOnly()` is more restrictive than `publicReadPrivateWrite()`." Half-true — `adminOnly` requires the cap on EVERY action including reads; `publicReadPrivateWrite` opens reads. Pick based on whether the data is publicly readable (events, public posts) or private (audit logs, user accounts).
- "I'll combine `->policy(...)` with route-level `->permission(...)`." Wrong — `policy` is read at action-registration time inside Resource; once you register the resource, the per-action permissions are baked. Mixing route-level overrides on resource-generated routes is undefined behavior.
- "Resource policy uses WordPress's role/capability system directly." Wrong — `ResourcePolicy::capabilities` accepts strings (cap names), arrays of cap names (any-of), booleans (always-allow / always-deny), or callables. The strings ARE WP capabilities, but the wrapper accepts more.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `Resource::make(...)->policy(...)`.
- The diff uses `ResourcePolicy::` factory methods.
- The diff calls `->fieldPolicy([...])` on a Resource.
- Reviewing a PR with hand-written permission arrays on a resource.
- Triaging "everyone can write to my Resource" / "no one can read my Resource".

## Workflow

### 1. Pick a preset (most common case)

```php
use \BetterRoute\Resource\ResourcePolicy;

// Public reads, admin-only writes
->policy(ResourcePolicy::publicReadPrivateWrite('manage_options'))

// Same, with a different write cap
->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))

// Same, with multiple acceptable write caps (any-of)
->policy(ResourcePolicy::publicReadPrivateWrite(['edit_posts', 'manage_woocommerce']))

// Everything gated on one cap
->policy(ResourcePolicy::adminOnly('manage_options'))

// Per-action map
->policy(ResourcePolicy::capabilities([
    '*'      => 'edit_posts',
    'delete' => 'manage_options',   // delete needs higher cap than other writes
]))

// Per-action callbacks (cross-action logic)
->policy(ResourcePolicy::callbacks([
    'update' => fn ($req, $action, $self) => current_user_can('edit_post', (int) $req->get_param('id')),
]))
```

### 2. Verified preset behavior

`publicReadPrivateWrite($writeCap)` ([src/Resource/ResourcePolicy.php:13-26](ResourcePolicy.php)) returns:

```php
['permissions' => [
    'list'   => true,           // public
    'get'    => true,           // public
    'create' => $writeCap,
    'update' => $writeCap,
    'delete' => $writeCap,
]]
```

`adminOnly($cap)` ([ResourcePolicy.php:29-39](ResourcePolicy.php)) returns:

```php
['permissions' => [
    'list'   => $cap,
    'get'    => $cap,
    'create' => $cap,
    'update' => $cap,
    'delete' => $cap,
]]
```

`capabilities([...])` ([ResourcePolicy.php:44-47](ResourcePolicy.php)) — passes the array through unchanged. The `*` wildcard key applies to any action not explicitly listed.

`callbacks([...])` ([ResourcePolicy.php:53-56](ResourcePolicy.php)) — same shape, but every value is a callable instead of a cap string.

### 3. Per-action permission value types

The `permissions` array maps action keys (`list`, `get`, `create`, `update`, `delete`, `*`) to one of:

| Value | Meaning |
|---|---|
| `true` | Always allow. |
| `false` | Always deny. |
| `'manage_options'` (cap string) | Allow when `current_user_can($cap)`. |
| `['edit_posts', 'manage_woocommerce']` (cap list) | Allow when ANY of the caps match. |
| `fn ($request, $action, $self): bool` | Custom — receives the request, action name, resource instance. |

Verified at [Resource.php:792-833](Resource.php) — `permissionForAction` walks the value type chain.

### 4. Field-level write authorization

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

The closure receives `($request, $action)` — `$action` is `'create'` / `'update'` / `'patch'`. Returning `false` strips the field from the payload silently.

Use case: a consumer-facing API where authors can write `title`, `content`, but only admins can flip `featured`. The same endpoint accepts the same payload structure; the role gate is per-field.

### 5. Combining policy and fieldPolicy

```php
->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))
->fieldPolicy([
    'featured' => static fn ($request, $action) => current_user_can('manage_options'),
])
```

`policy` controls who can call create/update at all. `fieldPolicy` controls which fields they can set within an authorized call. So a non-admin author with `edit_posts` can call `POST /books`, the request is authorized at the action layer, and `featured` is stripped at the field layer.

### 6. Public preset (when reads should be world-accessible)

If you want to open a resource to anonymous reads (cache-friendly public catalog), there's no preset for that — write the policy directly:

```php
->policy([
    'public' => true,   // bypasses all per-action permissions
])
```

Verified at [Resource.php:794-797](Resource.php):

```php
if (($this->policy['public'] ?? false) === true) {
    return static fn (): bool => true;
}
```

The `public => true` flag short-circuits the permission resolver and returns `true` for every action. Use sparingly — it bypasses every other check.

### 7. Permission callback (custom logic)

```php
->policy([
    'permissionCallback' => static fn ($request, $action) => /* your logic */,
])
```

A single callback for ALL actions. Use when the action distinction matters less than other context (e.g. JWT scopes — same callback inspects the token's scope claim per action).

## Critical rules

- **Pick a preset over hand-rolling permissions.** `publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks` cover 95% of cases.
- **`adminOnly` requires the cap on reads too.** Use `publicReadPrivateWrite` if reads should be public.
- **`fieldPolicy` strips silently — does not return an error.** If consumers need to know, validate explicitly in `writeSchema` sanitize callable or in the handler.
- **Per-action permission values: `bool`, cap string, list of caps (any-of), or callable.** Strings call `current_user_can`; arrays of strings call any-of via `currentUserCanAny`.
- **`'*'` wildcard applies to any action not explicitly listed.** Use it with overrides for the exception case.
- **Custom-table resources are deny-by-default** (verified at [Resource.php:840-844](Resource.php)). Always set `->policy(...)` for table sources, otherwise list/get/create/update/delete all return 403.
- **CPT-source default permission allows list/get** when no policy is set, but writes deny. Still declare `->policy()` explicitly — relying on defaults is fragile.
- **`'public' => true` bypasses ALL per-action checks.** Use only when the resource is genuinely public; otherwise pick a preset.

## Common mistakes

```php
// WRONG — assuming fieldPolicy returns a 403
->fieldPolicy([
    'featured' => fn ($req) => current_user_can('manage_options'),
])
// Non-admin POSTs {featured: true}; gets 200 with featured silently dropped.

// RIGHT — for "tell the consumer they can't set this field"
'featured' => [
    'type' => 'bool',
    'sanitize' => function ($value, $field) {
        if (!current_user_can('manage_options') && $value) {
            throw \BetterRoute\Http\ApiException::forbidden('only admins can set featured');
        }
        return $value;
    },
]

// WRONG — adminOnly when reads should be public
Resource::make('events')
    ->policy(ResourcePolicy::adminOnly('manage_options'))
    ->register($router);
// Public can't even read the event list.

// RIGHT — publicReadPrivateWrite
->policy(ResourcePolicy::publicReadPrivateWrite('manage_options'))

// WRONG — string capability assumed to be ANY-of when wrapped in array implicitly
'permissions' => [
    'create' => 'edit_posts manage_woocommerce',  // WRONG: single string with spaces; treated as the literal cap name
]

// RIGHT — array of cap names for any-of
'permissions' => [
    'create' => ['edit_posts', 'manage_woocommerce'],
]

// WRONG — combining route-level permission with resource-generated routes
Resource::make('books')->register($router);
// later:
$router->put('/books/{id}', $myCustomHandler)->permission(...);
// Now there are two PUT /books/{id} registrations — undefined which wins.

// RIGHT — pick one. Either let Resource generate the route, or use ->allow([]) to skip
// the action, then register manually.
Resource::make('books')->allow(['list', 'get'])->register($router);
$router->put('/books/{id}', $myCustomHandler)->permission(...);

// WRONG — public-true with a sensitive write resource
->policy(['public' => true])
// Anonymous users can create / update / delete.

// RIGHT — public => true is for read-only public resources only
->policy(['public' => true])
->allow(['list', 'get'])

// WRONG — fieldPolicy without writeSchema declaring the field
->writeSchema(['title' => ['type' => 'string']])  // doesn't list 'featured'
->fieldPolicy(['featured' => fn () => false])
// WRONG: 'featured' isn't in writeSchema, so it's dropped at the schema layer regardless.
// fieldPolicy never runs because the field never enters the validated payload.

// RIGHT — declare in writeSchema
->writeSchema([
    'title'    => ['type' => 'string'],
    'featured' => ['type' => 'bool'],
])
->fieldPolicy(['featured' => fn () => current_user_can('manage_options')])
```

## Cross-references

- Run **`br-resource-cpt`** / **`br-resource-table`** for the Resource builder context — `policy` and `fieldPolicy` are fluent methods on the Resource.
- Run **`br-write-schema`** when the field-level rejection should be visible to the consumer — combine with `sanitize` callable + `ApiException`.
- Run **`br-routes`** for raw-route permission patterns (`->permission`, `->protectedByMiddleware`, `->publicRoute`) — the route-layer equivalent.

## What this skill does NOT cover

- WP capability design (which capabilities to require for which actions). WP-level decision; choose `edit_posts`, `manage_options`, `delete_posts`, etc. based on the data model.
- Custom capability registration. Use `add_role` / `add_cap` in plugin activation if you need a custom capability layer.
- Row-level access control inside reads ("user can only see their own posts"). Add a query filter to a custom repository OR via WP's `posts_where` filter.
- Cross-resource policy reuse. If two Resources share a policy, define a function `static fn () => ResourcePolicy::publicReadPrivateWrite('edit_posts')` and call it from both.
- Multi-tenancy / per-site policy. WP multisite — handle in the callback by reading `get_current_blog_id()`.

## References

- ResourcePolicy presets: [libraries/better-route/src/Resource/ResourcePolicy.php](ResourcePolicy.php) — `publicReadPrivateWrite` line 13, `adminOnly` line 29, `capabilities` line 44, `callbacks` line 53.
- Resource.policy fluent: [libraries/better-route/src/Resource/Resource.php:141-147](Resource.php) — `policy(array)`.
- Resource.fieldPolicy fluent: [Resource.php:167-171](Resource.php) — `fieldPolicy(array)`.
- Permission resolution: [Resource.php:792-833](Resource.php) — `permissionForAction(string)` walks `public => true` short-circuit, `permissionCallback`, then `permissions[$action] ?? permissions['*']` with bool / string / array / callable handling.
- Default permission for unset policy: [Resource.php:835-844](Resource.php) — CPT source allows list/get, denies writes. Table source denies everything.
- Field-write enforcement (silent strip): [Resource.php:1147-1180](Resource.php) — `enforceFieldPolicy` walks the policy map, strips denied fields without raising.
