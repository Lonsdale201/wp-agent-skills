---
name: wp-comments-notes-api
description: "Extend or audit WordPress comments and editor Notes, including WP_Comment queries, REST note permissions, note status/mentions, notification hooks, comment counts, pingbacks/trackbacks, and WordPress 7.1 behavior changes. Use when a plugin creates or queries comments/notes, alters notify_post_author, integrates note mentions, supports Notes on a custom post type, or controls pings by environment."
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.9 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Comments and Notes API

WordPress editor Notes use the comments table with `comment_type = note`, but they are private editorial data, not public comments. Always make the type explicit in queries, capabilities, REST requests, counts, notifications, and deletion logic.

## Separate public comments from Notes

| Concern | Public comment | Editor Note |
|---|---|---|
| `comment_type` | usually `comment`/empty legacy value | `note` |
| Anonymous creation | site/filter dependent | never |
| Creation permission | normal comment policy | `edit_post` for the target post |
| Read permission | approved comment + readable post, or elevated access | note author or user who can `edit_comment` |
| Comment counts | included | excluded by Core |
| Discussion open/closed | enforced | not used as the Notes gate |

Do not query `type => all` and expose the result publicly. Use `type => comment` for public output and `type => note`, `status => all` only inside an authorized editorial context.

## Enable Notes for a custom post type

Core's REST controller accepts Notes only when the post type's `editor` support has Notes enabled:

```php
register_post_type(
    'acme_record',
    array(
        'show_in_rest' => true,
        'supports'     => array(
            'title',
            'editor' => array( 'notes' => true ),
        ),
    )
);
```

This nested support shape is not the same as adding a separate `notes` feature. Test editor UI and REST creation for the actual custom post type.

## REST integration

Notes use `/wp/v2/comments` with `type: note`. Core restricts REST creation to the Core types `comment` and `note`; custom comment types need their own route/controller rather than assuming this endpoint accepts them.

For Notes, Core requires:

- an authenticated user;
- a valid target post whose type supports Notes;
- `edit_post` for that post;
- a readable, non-trashed post.

Core's `_wp_note_status` comment meta is REST-exposed with only `resolved` or `reopen`, and editing it requires `edit_comment`. An empty Note body is accepted only for a valid resolution/reopen status transition. Do not bypass these rules with direct metadata writes from a weaker route.

## Inline markers and mentions in WordPress 7.1

Inline Note anchors are stored in raw block content as:

```html
<mark class="wp-note" data-id="123">selected text</mark>
```

WordPress 7.1 unwraps the exact `wp-note` marker during `render_block`, preserving the text but hiding Note metadata from public block output. Raw post content, revisions, exports, and REST `raw` content can still contain the marker. Plugins that bypass `render_block` must not assume Note metadata has been removed.

Mentions are stored in Note content as an exact chip:

```html
<span class="wp-note-mention user-42">@Editor</span>
```

Use `wp_get_note_mentioned_user_ids()` on 7.1+ instead of regex. Core's restrictive comment KSES path keeps only the `wp-note-mention` and positive `user-N` classes on mention spans.

Mention emails on new REST-created Notes:

- obey `wp_notes_notify`;
- skip the Note author and post author;
- go only to users who can `edit_comment` for that Note;
- are not resent when an existing Note is edited.

Do not duplicate Core mention delivery from another `rest_insert_comment` callback without deduplication.

## Notification filter change in 7.1

`notify_post_author` now has final authority. Its first argument is always a strict boolean. For an invalid comment ID, the function returns before the filter fires. For ordinary unapproved/spam/trashed comments, the default is `false`, but a callback returning `true` now forces an email.

```php
add_filter( 'notify_post_author', static function ( bool $notify, int $comment_id ): bool {
    $comment = get_comment( $comment_id );
    if ( ! $comment instanceof WP_Comment ) {
        return false;
    }

    if ( 'note' !== $comment->comment_type && '1' !== $comment->comment_approved ) {
        return false;
    }

    return $notify;
}, 10, 2 );
```

Audit callbacks such as `__return_true`: after upgrading to 7.1 they can email the post author for comments in moderation, spam, or trash.

## Ping behavior in 7.1

Non-production environments (`local`, `development`, `staging`) disable incoming/outgoing pingbacks, trackbacks, and ping-service notifications by default. `wp_should_disable_pings_for_environment` can override that policy. Do not re-enable pings in CI/staging merely to silence a test; test the filter deliberately.

Same-site pingbacks from published local posts can now be auto-approved. The `wp_auto_approve_ping` filter receives the default decision, local source post ID or `0`, and source URL. Trackbacks do not get this trust because their source is not verified like a pingback.

Read [references/queries-notifications-pings.md](references/queries-notifications-pings.md) for migration and test cases.

## Data and lifecycle rules

- Use `get_comment()` only with a `WP_Comment`, object/array shape, or numeric ID. In 7.1 an arbitrary nonnumeric value returns `null` instead of being cast to an ID.
- Use `wp_insert_comment()`, `wp_update_comment()`, and REST APIs rather than raw table writes so caches and hooks remain correct.
- Specify `type` in plugin queries; avoid counting Notes as engagement.
- Preserve parent/type/status constraints when fetching Note threads.
- Enforce object-level capabilities on every custom Note read/write endpoint.
- Treat Note content and recipient identity as private editorial data in logs, exports, webhooks, and analytics.

## Verification

1. Create, read, update, resolve, reopen, and delete a Note through REST as an editor and as a subscriber.
2. Confirm public comment output and counts exclude Notes.
3. Render a post with an inline Note marker and verify public HTML keeps text but not marker metadata.
4. Create a Note with valid, malformed, duplicate, self, post-author, and unauthorized mentions.
5. Test `notify_post_author` with approved, pending, spam, trash, Note, and invalid IDs on 7.1.
6. Test incoming and outgoing pings under every `WP_ENVIRONMENT_TYPE` used in deployment.

## Related skills

- `wordpress/wp-rest-api` for custom comment/note routes.
- `wordpress/wp-metadata-api` for custom comment meta.
- `wordpress/wp-html-api` for Note-aware markup processing.
- `theme-development/classic-theme-comments-discussion` for public classic-theme rendering.

## References

- Read `references/queries-notifications-pings.md` for query arguments, notification filters and ping semantics.
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
