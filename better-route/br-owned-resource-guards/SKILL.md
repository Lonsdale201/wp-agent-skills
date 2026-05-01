---
name: br-owned-resource-guards
description: Add better-route 0.5.0 ownership checks for user-owned REST resources. Use when a route or Resource DSL endpoint must ensure the authenticated user owns the order, record, token, subscription, membership, profile object, or other per-user object. Triggers on OwnershipGuardMiddleware, OwnedResourcePolicy, currentUserOwns, ownerResolver, bypassCapability, and customer-owned or user-owned API routes.
---

# better-route: Owned resource guards

Use ownership guards when authentication is not enough. A valid token proves identity; an ownership guard proves the requested object belongs to that identity.

## Route-level guard

```php
use BetterRoute\Middleware\Auth\OwnershipGuardMiddleware;

$guard = new OwnershipGuardMiddleware(
    ownerResolver: static function ($context): ?int {
        $id = (int) $context->request->get_param('id');
        return my_resource_owner_id($id);
    },
    bypassCapability: 'manage_options'
);

$router->get('/account/records/(?P<id>\d+)', $handler)
    ->middleware([$jwt, $guard])
    ->protectedByMiddleware('bearerAuth');
```

`OwnershipGuardMiddleware` checks `RequestContext::$attributes['auth']['userId']`, then `subject`, then `get_current_user_id()`. It returns `404 not_found` by default on denial to avoid disclosing object existence.

## Resource DSL policy

```php
use BetterRoute\Resource\OwnedResourcePolicy;

Resource::make('records')
    ->policy(OwnedResourcePolicy::currentUserOwns(
        ownerResolver: static fn (int $id): ?int => my_resource_owner_id($id),
        bypassCapability: 'manage_options'
    ));
```

Use this when Resource-generated `get`, `update`, or `delete` routes need owner checks. For list routes, also filter the query itself by current user; list permission alone is not a data filter.

## Rules

- Run auth middleware before the ownership guard.
- Never rely on client-sent owner/customer/user IDs.
- Resolve ownership server-side from the resource ID.
- Use a bypass capability only for real admin/integration routes.
- Prefer `404` for customer/user routes, `403` only when the API intentionally exposes resource existence.
- For write routes, combine with optimistic lock or atomic idempotency when the operation has side effects.

## Source refs

- `libraries/better-route/src/Middleware/Auth/OwnershipGuardMiddleware.php`
- `libraries/better-route/src/Resource/OwnedResourcePolicy.php`
- `libraries/better-route/src/Resource/ResourcePolicy.php`
