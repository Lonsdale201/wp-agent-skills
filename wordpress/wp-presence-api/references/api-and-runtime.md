# Presence API 0.1.23 API and runtime contract

Read this reference when implementing an integration rather than only deciding
whether the Presence API is relevant.

## Storage and return shape

Each site owns a `{prefix}presence` table with:

- numeric primary key `id`;
- `room` and `client_id`, each `varchar(191)` and unique as a pair;
- `user_id`;
- JSON state in `longtext`;
- UTC refresh time in `date_gmt`;
- indexes for time, user, and room/time reads.

`wp_get_presence()` returns objects with `room`, `client_id`, `user_id`,
decoded array `data`, and `date_gmt`. The direct PHP API does not hydrate user
display names or avatars. The REST representation adds `display_name` and
`avatar_url` and supports `_fields`.

The default TTL is `WP_PRESENCE_DEFAULT_TTL` (60 seconds). Define the constant
before plugin load or filter `wp_presence_default_ttl`. Keep it positive and
test it against actual Heartbeat intervals and background-tab suspension.

## REST enforcement

The controller applies these 0.1.23 boundaries:

- `room` and `client_id`: non-empty string, maximum 191 characters;
- `data`: JSON object, maximum encoded size 10,240 bytes;
- nested arrays: sanitized recursively to three levels;
- state values: strings, integers, floats, booleans, and arrays only;
- entry listing: `per_page` 1-100, default 100;
- room listing: `per_page` 1-100, default 50;
- active entries per user: maximum 50;
- same active `(room, client_id)` owned by someone else: HTTP 409;
- unavailable table on a write: HTTP 503;
- every collection response: `X-WP-Total`, `X-WP-TotalPages`, and
  `Cache-Control: no-store`.

Sanitized REST strings are preserved as data and must still be escaped for the
eventual HTML, attribute, URL, or JavaScript output context.

`GET`, `POST`, and `DELETE` all call `wp_can_access_presence_room()`. A post
room maps to `user_can( $user_id, 'edit_post', $post_id )`; other rooms map to
`edit_posts`. Delete additionally checks database ownership, except users with
`manage_options` may remove another user's entry.

## Heartbeat behavior

The plugin uses these principal server hooks:

- `heartbeat_received` priority 9: update `admin/online`;
- priority 10: update the post editor entry;
- priority 11: bridge a core post-lock refresh when the editor ping was absent;
- priority 12: compare stale-screen revisions.

The ping asset is enqueued only for logged-in users with `edit_posts`; on the
front end the admin bar must also be showing. It writes an initial entry in the
page request to avoid a gap until the first Heartbeat tick. Editor client IDs
use `editor-{user_id}` and the admin room uses `user-{user_id}`.

Do not assume one entry per user. A user can occupy multiple rooms and clients;
REST consumers should deduplicate by `user_id` when displaying people rather
than connections.

## Screen revisions

Classic settings, post, user, term, and comment screens are covered. Custom
admin screens need both sides:

1. filter `wp_presence_current_screen_key` to return a stable, non-empty key;
2. after a successful REST/AJAX save, call the plugin's browser-side
   `wp.presence.markScreenStale( key )` surface when available.

The REST route accepts lowercase letters, digits, slash, underscore, and
hyphen after normalization and caps the key at 191 characters. Its permission
callback maps known screen-key families to relevant object capabilities.
Custom fallback revisions share a bounded 200-entry option; known object
screens use object metadata or dedicated state instead.

`wp_presence_screen_revision_bumped` receives the screen key, revision, and
actor ID after a successful bump.

## Editor and collaboration extension points

`wp_presence_editor_state` receives current state, post ID, and user ID. Add
only bounded, non-secret, JSON-compatible values:

```php
add_filter(
    'wp_presence_editor_state',
    static function ( array $state, int $post_id, int $user_id ): array {
        if ( current_user_can( 'edit_post', $post_id ) ) {
            $state['my_plugin_mode'] = 'review';
        }
        return $state;
    },
    10,
    3
);
```

At 0.1.23, collaboration start/end threshold tracking uses a static variable
inside `wp_presence_check_collaboration_threshold()`. That memory survives
multiple calls only inside one PHP request. Normal Heartbeat transitions occur
across requests, so do not interpret these actions as a durable or exactly-once
session lifecycle. Query the room and make the downstream operation idempotent.

## Provisioning and cleanup

Activation provisions the current site. Network activation iterates sites only
when WordPress does not classify the network as large. New sites are provisioned
after `wp_initialize_site`; missed/large-network sites reconcile on a real admin
or CLI request. Front-end and AJAX request paths do not repeatedly run schema
repair. Until provisioning succeeds, PHP reads return an empty array and writes
return `false`.

Cleanup runs through `wp_delete_expired_presence_data` on a custom one-minute
WP-Cron interval. It selects and deletes bounded primary-key batches; the
defaults are 1,000 rows per pass and 10 passes per invocation, filterable via
`wp_presence_cleanup_batch_size` and `wp_presence_cleanup_max_passes`.

Deactivation clears scheduled cleanup; uninstall drops each site's table and
removes plugin revision/options/meta. Because WP-Cron is traffic-dependent,
expiry filtering protects reads even when physical cleanup is delayed.

## Public documentation inconsistency

At tag `v0.1.23`, `README.md` says “six public functions” and its code block
lists six, while `includes/functions.php` explicitly says “Public API (7
functions)” and additionally lists `wp_presence_admin_room()`. The function's
docblock is not marked private. Treat the tagged source as authoritative for
this snapshot, but recheck the upstream contract on the next release.
