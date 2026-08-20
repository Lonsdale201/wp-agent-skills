---
name: je-data-stores
description: >-
  Builds or audits JetEngine Data Store integrations for favorites, bookmarks,
  likes, recently viewed items, user IDs, and CCT IDs. Covers cookie, session,
  user-meta, local-storage, and user-IP semantics; Factory lookup; frontend and
  programmatic mutation; Query Builder; counters; CCT bridges; custom store
  types; and anonymous AJAX trust boundaries. Use when adding store buttons,
  querying stored items, syncing counts, extending storage, or diagnosing
  missing server data, spoofable state, stale counters, hooks, and size limits.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.14"
  wp-skills-wp-version-tested: "7.0.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-17"
---

# JetEngine Data Stores

Use Data Stores for preference-like collections such as favorites, bookmarks,
likes, comparisons, and recently viewed items. Storage membership and counters
are user-controlled signals, not authentication, authorization, payment,
license, course access, or entitlement data.

## When to use this skill

- Render add/remove buttons or query a configured Data Store.
- Read or mutate a store from a companion plugin.
- Choose among cookie, session, user metadata, local storage, and user IP.
- Store user IDs or CCT item IDs instead of post IDs.
- Add a custom store type.
- Audit anonymous AJAX, max-size behavior, counts, caching, or synchronization.

## Module timing and lookup

The Data Stores module initializes on WordPress `init` priority 0. Its configured
stores are available afterward:

```php
add_action('init', static function(): void {
    if (! class_exists('Jet_Engine\\Modules\\Data_Stores\\Module')) {
        return;
    }

    $module = \Jet_Engine\Modules\Data_Stores\Module::instance();
    $store  = $module->stores
        ? $module->stores->get_store('my_favorites')
        : false;

    if (! $store) {
        return;
    }

    $items = $store->get_store();
}, 20);
```

Allowlist the slug; do not expose arbitrary store selection from request data.
`Factory::in_store()` uses non-strict `in_array()`, so normalize IDs at your
boundary when type distinctions matter.

## Storage-type matrix

| Type | State location | PHP-readable | Identity/reliability notes |
|---|---|---:|---|
| `cookies` | HttpOnly browser cookie, one-year expiry | Yes, on requests carrying it | Client-owned, size-limited by cookie constraints |
| `session` | PHP session | Yes | Starts session during `parse_request`; audit full-page cache and session locking |
| `user-meta` | `je_data_store_{slug}` user meta | Yes | Logged-in user only; values are normalized to strings |
| `local-storage` | browser `localStorage` | No | PHP `get/add/remove` methods are empty; frontend/query bridge supplies IDs |
| `user_ip` | JetEngine custom table keyed by MD5 of detected IP | Yes | IP/header-derived and collision/shared-network prone; not identity |

`is_user` means the stored item IDs represent WordPress users; it does not mean
the store belongs to the current user. Choose `user-meta` for per-account
persistence. User stores are server-side only.

## Read path

Use the configured factory:

```php
$type      = $store->get_type();
$type_id   = $type->type_id();
$items     = $type->is_front_store() ? null : (array) $store->get_store();
$contains  = null === $items ? null : in_array($item_id, $items, true);
$size      = $store->get_size();
$can_count = $store->can_count_posts();
```

For local storage, PHP `get_store()` returns `null`; calling the Factory
`get_count()` or `in_store()` wrappers can consequently reach `count(null)` or
`in_array(..., null)` on PHP 8. Use a Data Store Listing/Query Builder
configuration so JetEngine's frontend bridge passes the IDs. Never silently
treat a missing server result as an empty browser store.

## Mutation paths are not equivalent

The frontend add/remove AJAX handlers orchestrate max size, on-view eviction,
`filtered-id`, counts, fragments, and lifecycle hooks. `Factory` has no public
high-level `add()`/`remove()` wrapper. Calling:

```php
$store->get_type()->add_to_store($store->get_slug(), $item_id);
$store->get_type()->remove($store->get_slug(), $item_id);
```

changes backend state but bypasses Factory size checks, count maintenance,
fragments, and add/remove hooks. JetFormBuilder's built-in add action also calls
the type directly. For programmatic writes, create one integration-owned service
that validates item/actor, applies the intended size policy, maps IDs, checks an
actual membership transition, updates/rebuilds counts, and emits your own
idempotent domain event. Mirror JetEngine's internal AJAX sequence only when
compatibility with those exact hooks is required.

In 3.8.14, `before-remove-from-store` fires after the store type has already
removed the value, despite its name. Do not use it to veto removal or read the
pre-mutation state. Also regression-test bounded `store_on_view` plus item
counters: automatic oldest-item eviction does not reconcile the evicted item's
counter through the normal decrement path.

## Anonymous AJAX and trust boundary

Every configured server-side store registers authenticated and `nopriv` add /
remove actions. The request validates `post_id` and matching store slug, but no
nonce, capability, or object-ownership check is performed. This supports public
favorites/likes. Consequences:

- do not use membership as proof of identity or permission;
- do not use counts as fraud-resistant analytics or billing data;
- validate whether an item is public/eligible in companion logic when required;
- rate-limit abusive public writes outside JetEngine if counts/resources matter;
- remember that a nonce would mitigate CSRF, not make a public signal trusted.

The admin clear action is different: it requires `manage_options` and a valid
`jet-engine-data-stores` nonce, resets counters, then clears supported storage.

## Query Builder and CCT

Use Query Builder type `data-stores-query` to return stored posts or users in
store order and apply supported post/user filters. Local storage is resolved on
the frontend and load-more path. Set a finite `max_items`; an empty store must
produce no results, not an unrestricted query.

For a CCT store, enable `is_cct` and choose `related_cct`. JetEngine maps listing
objects to CCT `_ID`, delegates the query to CCT Query Builder, preserves stored
ID order, and stores optional counts in a generated `{store_slug}_count` CCT
service column. A store cannot be both `is_user` and CCT. Test the CCT/local
storage frontend bridge, filters, load more, and counter resets.

## Custom store types

Register an instance extending
`Jet_Engine\Modules\Data_Stores\Stores\Base_Store` on
`jet-engine/data-stores/register-store-types`. Implement `type_id`, `type_name`,
`add_to_store`, `remove`, and `get`. If browser-only, implement the JS methods
and return true from `is_front_store()`.

The manager reuses one store-type object for all configured stores and calls
its `on_init()` from every Factory. Make initialization idempotent and keep
per-store state keyed by slug rather than in one mutable property. Sanitize both
store slug and item shape, define concurrency behavior, and implement clearing
only if it is safe and complete.

Read [storage-mutation-query.md](references/storage-mutation-query.md) before
programmatic mutation, custom types, count-sensitive work, or CCT integration.

## Verification

Test logged in/out, add duplicate, remove missing, zero/unlimited and full size,
on-view eviction, simultaneous requests, invalid item/slug, every chosen storage
backend, private/cached pages, local-storage listing and load more, post versus
user versus CCT IDs, count increment/decrement/rebuild/clear, and anonymous
abuse. Verify the storage medium directly as well as the rendered button.

## References

- Official Data Stores overview: <https://crocoblock.com/knowledge-base/articles/jetengine-data-stores-module-overview/>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/module.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/stores/manager.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/stores/factory.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/stores/base.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/stores/local-storage.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/stores/user-ip.php`
  - `wp-content/plugins/jet-engine/includes/modules/data-stores/inc/query-builder/query.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/data-stores/manager.php`
