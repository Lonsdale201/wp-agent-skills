---
name: wp-presence-api
description: Implement or audit integrations with the experimental WordPress Presence API feature plugin 0.1.23. Covers the seven public PHP functions, post and admin rooms, the per-site wp_presence table and TTL, Heartbeat transport, REST read/write/delete/rooms endpoints, per-room capabilities and ownership, pagination and payload limits, post-type opt-in, usePresenceUsers source hook, stale-screen revisions, collaboration hooks, cleanup and multisite provisioning. Use for who-is-online, active-editor, post-lock, co-presence, Heartbeat, `wp_get_presence`, `wp_set_presence`, `wp-presence/v1`, or high-frequency ephemeral-state work. Do not confuse this experimental plugin with WordPress 7.1 core.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "presence-api"
  wp-skills-plugin-version-tested: "0.1.23"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Presence API

Integrate with Presence API 0.1.23 as an experimental feature plugin, not as a
WordPress 7.1 core API. It supplies awareness of active users and editors using
a dedicated per-site table, a 60-second TTL, Heartbeat, REST, admin surfaces,
and a small public PHP API. Pin and feature-detect the plugin; its `0.1.x`
contract may still change.

## When to use this skill

- Build who-is-online, active-editor, post-lock, or co-presence UI.
- Review `wp_get_presence()`, `wp_set_presence()`, `wp_presence_post_room()`,
  `presence-ping`, `wp_presence_editor_state`, or `/wp-presence/v1` code.
- Add presence support to a custom post type.
- Decide where to store high-frequency ephemeral state.
- Audit Heartbeat load, room authorization, presence privacy, cleanup, or
  multisite behavior.

## Establish the runtime contract first

Feature-detect a public function and avoid loading plugin internals yourself:

```php
if ( ! function_exists( 'wp_get_presence' ) ) {
    return;
}
```

Presence API 0.1.23 requires WordPress 7.0+ and PHP 7.4+. WordPress 7.1 does
not provide these functions or the `wp_presence` table by itself. Do not test
only `version_compare( get_bloginfo( 'version' ), '7.1', '>=' )`.

Treat an experimental-plugin version constraint as a deliberate product
decision. Fail softly when it is absent, and verify the installed source again
before relying on signatures in a later `0.1.x` release.

## Use only the seven public PHP functions

The source explicitly marks these as its public contract:

| Function | Contract |
|---|---|
| `wp_get_presence( $room, $timeout )` | Return active entry objects for one room. |
| `wp_set_presence( $room, $client_id, $state, $user_id )` | Atomically upsert one `(room, client_id)` row. |
| `wp_remove_presence( $room, $client_id )` | Remove one client entry. |
| `wp_remove_user_presence( $user_id )` | Remove a user's entries across all rooms. |
| `wp_can_access_presence_room( $room, $user_id )` | Check the plugin's room access policy. |
| `wp_presence_post_room( $post )` | Return the canonical post room or `false`. |
| `wp_presence_admin_room()` | Return the canonical `admin/online` room. |

Everything after the public section in `includes/functions.php` is marked
private even when it has a global `wp_*` function name. Do not depend on
`wp_get_active_rooms()`, `wp_get_presence_summary()`, table/provisioning
helpers, or cleanup internals.

The direct PHP write/remove functions are trusted server-side primitives. They
do not reproduce the REST controller's room-length, payload, ownership, entry
limit, or capability checks. Validate and authorize before calling them from
any request handler.

## Model rooms and authorization together

Core post types `post` and `page` opt in automatically. Add support to a custom
post type during registration or afterwards:

```php
register_post_type(
    'book',
    array(
        'show_ui'  => true,
        'supports' => array( 'title', 'editor', 'presence' ),
    )
);

$room = wp_presence_post_room( $book_id ); // postType/book:123 or false.
```

`postType/{post_type}:{id}` rooms require `edit_post` for that object. Other
room strings, including `admin/online`, require only `edit_posts`. Therefore a
custom room name is not a custom authorization boundary. Do not put data in a
generic room when every user with `edit_posts` must not see it; enforce the
narrower capability in your own server handler or use an object-backed room.

Presence is awareness, not authorization. Never grant locks, saves, or content
access merely because a user has a presence entry.

## Keep state ephemeral and bounded

```php
$room      = wp_presence_post_room( $post_id );
$client_id = 'my-plugin-' . get_current_user_id();

if ( $room && current_user_can( 'edit_post', $post_id ) ) {
    wp_set_presence(
        $room,
        $client_id,
        array( 'mode' => 'reviewing' ),
        get_current_user_id()
    );
}
```

Use stable, namespaced client IDs. Store only small UI state, never secrets,
tokens, unpublished content bodies, or durable workflow state. Entries expire
from reads after the TTL and are later removed in bounded cron batches. TTL is
not a delivery guarantee, logout is not guaranteed to run, and a crashed tab
can remain visible until expiry.

The table is the correct architectural pattern for high-frequency awareness:
it avoids repeatedly invalidating `wp_options` or object meta caches. It does
not make every custom ephemeral feature a reason to depend on this plugin;
use the public contract only when Presence API's room and capability model fit.

## Use the REST contract safely

Authenticated endpoints are:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/wp-presence/v1/presence` | Paginated entries for `room`. |
| `POST` | `/wp-presence/v1/presence` | Upsert `room`, `client_id`, and `data`. |
| `DELETE` | `/wp-presence/v1/presence` | Delete an owned entry; `manage_options` can delete any. |
| `GET` | `/wp-presence/v1/presence/rooms` | Paginated, access-filtered active rooms. |
| `POST` | `/wp-presence/v1/presence/screen-revisions/stale` | Bump an authorized screen revision. |

Use `wp.apiFetch` in WordPress admin/editor JavaScript so the REST nonce and
root middleware are applied. Respect pagination headers and request `_fields`
when only user identity is needed. Responses use `Cache-Control: no-store`.

The 0.1.23 controller bounds room/client IDs to 191 characters, REST state to
10 KiB and three nested array levels, list pages to 100 rows, and active
entries to 50 per user. It rejects an active `client_id` owned by a different
user and restricts delete-by-client ownership. Do not clone these values into
a competing endpoint; use the plugin route or implement an independently
reviewed contract.

Read `references/api-and-runtime.md` before adding a REST client, custom room,
screen-revision integration, or multisite dependency.

## Integrate Heartbeat without multiplying traffic

The plugin enqueues WordPress Heartbeat and writes initial presence on eligible
admin/front-end requests, then refreshes state through Heartbeat. The block
editor can run Heartbeat faster than its normal 60-second interval for post
locks. Do not add a second timer that posts the same state independently.

The shipped `usePresenceUsers()` React hook performs one REST read initially
and on Heartbeat ticks, deduplicates by user ID, supports `_fields`, and can
exclude the current user. In 0.1.23 it is shipped as source, not as a registered
WordPress package or script handle. Do not deep-import another installed
plugin's filesystem path at runtime. If a build deliberately vendors that
experimental source, pin the plugin release and review license/update drift;
otherwise implement a small `wp.apiFetch` consumer around the REST contract.

## Treat collaboration hooks as advisory in 0.1.23

`wp_presence_editor_state` can enrich editor state. The plugin also declares
`wp_presence_collaboration_started` and `wp_presence_collaboration_ended`.
Do not use the latter actions for billing, durable workflow transitions, or
exact participant lifecycle: in 0.1.23 threshold memory is a request-local
static variable, so it does not persist a transition state across separate
Heartbeat requests. Recompute current membership from the room for decisions
and verify this implementation again after upgrading.

## Test the whole lifecycle

1. Absence of the feature plugin: integration fails softly.
2. Supported and unsupported post types: room string versus `false`.
3. Author can access own editable post but not a post they cannot edit.
4. Generic custom room visibility for every `edit_posts` user.
5. REST create/read/delete, ownership conflict, 191-character keys, oversized
   state, nested state, pagination, `_fields`, and `Cache-Control: no-store`.
6. Two tabs for one user and two users in one room; close/crash/logout/TTL.
7. Heartbeat active, slowed, suspended, and unavailable.
8. Table missing during a front-end request: reads return empty and writes
   return `false` instead of causing SQL errors.
9. Site activation, network activation, new-site creation, large network, cron
   cleanup, deactivation, and uninstall on a real multisite test network.
10. Dynamic UI with keyboard focus, empty avatar alt text, live-region
    announcements, and reduced motion.

## Critical rules

- Presence API 0.1.23 is an experimental plugin, not WordPress 7.1 core.
- Feature-detect it and use only the seven explicitly public PHP functions.
- Keep capability checks at every write/read boundary; presence grants nothing.
- Treat generic rooms as visible to all users with `edit_posts`.
- Keep state small, non-secret, ephemeral, and retry-safe.
- Reuse Heartbeat; do not add a competing polling loop.
- Do not depend on private global helpers or exact internal table queries.
- Do not treat collaboration threshold hooks as durable transition events.

## Cross-references

- Use **`wp-api-fetch-client`** for the authenticated JavaScript REST client.
- Use **`wp-rest-api`** when implementing a separate custom endpoint.
- Use **`wp-plugin-options-storage`** for the custom-table decision.
- Use **`wp-plugin-cron`** for cleanup reliability and multisite scheduling.

## References

- Read `references/api-and-runtime.md` for exact response fields, limits,
  provisioning, stale-screen, and hook details.
- Active repository and source: <https://github.com/WordPress/presence-api>
- v0.1.23 release: <https://github.com/WordPress/presence-api/releases/tag/v0.1.23>
- Feature-plugin announcement: <https://make.wordpress.org/core/2026/04/27/presence-api-feature-plugin/>
- Verified source paths at tag `v0.1.23`:
  - `presence-api.php`
  - `includes/functions.php`
  - `includes/class-wp-rest-presence-controller.php`
  - `includes/heartbeat.php`
  - `includes/screen-revisions.php`
  - `includes/cron.php`
  - `src/hooks/use-presence-users.js`
