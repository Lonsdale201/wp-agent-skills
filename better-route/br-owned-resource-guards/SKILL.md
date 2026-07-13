---
name: br-owned-resource-guards
description: Add Better Route 1.1 ownership authorization to raw routes and Resource DSL endpoints. Use when authenticated users may access only their own records, orders, profiles, memberships, tokens, or subscriptions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route ownership guards

Authentication establishes identity; ownership authorization establishes whether that identity may access this object.

## Raw route

```php
use BetterRoute\Middleware\Auth\OwnershipGuardMiddleware;

$guard = new OwnershipGuardMiddleware(
    ownerResolver: static function ($context): ?int {
        return my_resource_owner_id((int) $context->request->get_param('id'));
    },
    bypassCapability: 'manage_options',
    deniedStatus: 404
);

$router->get('/records/(?P<id>\d+)', $handler)
    ->middleware([$auth, $guard])
    ->protectedByMiddleware('bearerAuth');
```

Run authentication before the guard. It resolves identity from the normalized `auth.userId`, then `auth.subject`, then the native WordPress current user. The owner resolver must load ownership server-side from the route resource; never trust a submitted owner ID.

## Resource DSL

```php
use BetterRoute\Resource\OwnedResourcePolicy;

Resource::make('records')
    ->policy(OwnedResourcePolicy::currentUserOwns(
        ownerResolver: static fn (int $id): ?int => my_resource_owner_id($id),
        ownedActions: ['get', 'update', 'delete'],
        bypassCapability: 'manage_options',
        allowListForAuthenticatedUsers: true
    ));
```

`allowListForAuthenticatedUsers: true` grants list permission to logged-in WordPress users; it does not filter the result. Apply an owner predicate in the repository/query, or disable the generated list permission, before exposing user-owned collections.

## Rules

- Prefer denial as `404` when revealing object existence would leak data. Use `403` only for an intentionally discoverable object.
- Use narrowly scoped, reviewed bypass capabilities.
- Check ownership against the current stored record during writes, not a stale client copy.
- Cover `get`, `update`, and `delete` independently; list filtering is a separate control.
- Combine write authorization with optimistic locking and atomic idempotency when concurrency or duplicate side effects matter.

Test another user's ID, absent object, anonymous access, subject-only identity, native WordPress identity, admin bypass, and list-result isolation.

Source references: `src/Middleware/Auth/OwnershipGuardMiddleware.php`, `src/Resource/OwnedResourcePolicy.php`.
