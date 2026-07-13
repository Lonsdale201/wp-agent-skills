---
name: br-resource-policy
description: Configure better-route 1.1 Resource action and field authorization. Use for ResourcePolicy::publicReadPrivateWrite, adminOnly, capabilities, callbacks, Resource::policy, permissionCallback, per-action rules, wildcard rules, fieldPolicy, public Resource OpenAPI security, ownership policies, or reviewing CPT/table CRUD permissions. In 1.1 denied fields are rejected rather than silently stripped.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Resource/ResourcePolicy.php
  - src/Resource/Resource.php
  - src/Resource/OwnedResourcePolicy.php
---

# better-route: Resource authorization

Use a Resource policy to decide who may call each generated action. Use `fieldPolicy` separately to authorize individual incoming fields.

## Presets

```php
use BetterRoute\Resource\ResourcePolicy;

->policy(ResourcePolicy::publicReadPrivateWrite('edit_posts'))
->policy(ResourcePolicy::adminOnly('manage_options'))
->policy(ResourcePolicy::capabilities([
    'list' => 'read_private_reports',
    'get' => 'read_private_reports',
    'create' => ['edit_posts', 'manage_woocommerce'], // any-of
    'update' => 'edit_posts',
    'delete' => 'delete_posts',
]))
->policy(ResourcePolicy::callbacks([
    'update' => static fn ($request, string $action): bool =>
        current_user_can('edit_post', (int) $request->get_param('id')),
]))
```

Supported action keys are `list`, `get`, `create`, `update`, `delete`, and fallback `*`. `update` covers PUT and PATCH.

Rule values:

- boolean: allow/deny;
- non-empty capability string: `current_user_can($capability)`;
- capability list: any capability may pass;
- callable: invoked with as many of `($request, $action, $resource)` as its signature accepts.

A top-level `permissionCallback` callable overrides per-action resolution for the Resource. A top-level `public => true` opens every registered action, including writes; use it only with a deliberately read-only `allow(['list', 'get'])` Resource.

## Defaults

Without a policy:

- table resources deny every action;
- CPT writes deny;
- CPT list/get allow only when the post type is publicly viewable, followed by item-level status/public/password visibility checks.

Prefer explicit policy even where the CPT default is safe, so intent and OpenAPI are clear.

## Field policy in 1.1

```php
->fieldPolicy([
    'featured' => ['write' => 'manage_options'],
    'author' => ['write' => ['edit_others_posts', 'manage_options']],
    'external_id' => ['write' => false],
    'tenant_id' => ['write' => static function (
        $request,
        string $field,
        string $action,
        ?int $id
    ): bool {
        return can_write_tenant($request, $id);
    }],
])
```

Denied fields are not silently stripped in 1.1:

- boolean `false` returns `400 validation_failed` with a field error;
- a failed capability/list/callback returns `403 forbidden` with field error details;
- allowed fields continue into coercion/sanitization.

A field-policy callable can accept `($request, $field, $action, $id, $resource)`. Declare only the prefix needed. The action is `create` or `update`; PATCH also resolves as `update`.

Only payload fields in the Resource's writable `fields()` set reach field policy. Unknown/read-only fields fail earlier.

## OpenAPI

An action whose resolved static policy is explicitly public (`true` or top-level public) gets operation `security: []`. Callable policy source is never serialized into metadata; it is represented only as a safe callback marker where applicable.

Do not assume a callable's runtime result can be inferred into OpenAPI. Document the security scheme explicitly when middleware/auth is required.

## Ownership

Use `OwnedResourcePolicy::currentUserOwns()` for get/update/delete ownership checks. It resolves resource ID from the request, compares the owner to native current WP user, and optionally permits an admin bypass capability. List access still needs query-level row filtering; a permission callback alone cannot remove other users' rows from a collection.

## Review checklist

- Declare which actions exist with `allow()` before reviewing permissions.
- Never use top-level `public => true` on a write-capable Resource unintentionally.
- Treat capability arrays as any-of, not all-of.
- Add object/row-level checks for get/update/delete and query-level filters for lists.
- Test denied fields and assert 400/403; do not expect silent removal.
- Keep policy callback work cheap because WordPress evaluates permission before the handler.
- Verify explicitly public actions emit `security: []` in OpenAPI.

## Related skills

- Use `br-resource-cpt` or `br-resource-table` for source behavior.
- Use `br-owned-resource-guards` for ownership patterns.
- Use `br-write-schema` for validation after field authorization.
