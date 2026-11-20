---
name: wp72-rest-api
description: >-
  Audits the WordPress 7.2 REST changes to revision/autosave metadata, comments status arrays and rest_allowed_cors_methods. Use for revision.meta clients, revisions_enabled, wp_post_revision_meta_keys, rest_comment_query, comments status comparisons or Access-Control-Allow-Methods overrides.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 REST compatibility

Review these three changed contracts independently. Keep authentication and
object-level authorization in the normal endpoint lifecycle.

## Revision and autosave metadata

`WP_REST_Revision_Meta_Fields` restricts revision response data and schema to
revisioned keys for the parent post type. A non-revisioned `show_in_rest` key is
absent, rather than returned with its default.

- Opt into revisions deliberately with `revisions_enabled => true`, or the
  `wp_post_revision_meta_keys` filter. The filter receives keys and post type.
- Adding a key also changes classic revision restoration. Do not enable it only
  to preserve a client's old response-shape assumption.
- Visual restoration also needs `show_in_rest`; classic restoration does not.
- Autosave revisions follow the same filtering. An author's autosave of their
  own draft updates/returns the parent post instead, so that response can include
  all parent metadata.
- With no revisioned keys, the candidate can return `meta: []`. Handle missing
  keys and this empty representation in clients.
- Gutenberg can backport part of the behavior to 7.0/7.1. Record its presence.

## Comments status

The collection parameter now has an array-of-strings schema and defaults to
`array( 'approve' )`. Single values, comma-separated values and bracket arrays
are accepted and normalized. Duplicates/empty entries are removed; `'0'` stays.

Review code in `rest_comment_query` and request inspection:

```php
if ( in_array( 'hold', (array) $request['status'], true ) ) {
    // Handle a collection containing held comments.
}
```

Do not assume an enum of only core statuses. Unauthenticated users and users
without `edit_posts` remain restricted to the default approved selection;
including approved alongside a private status does not grant access.

## CORS methods

`rest_allowed_cors_methods` receives the method list and a
`WP_REST_Request|null`. Return an array, and normalize input with
`wp_parse_list()` because an earlier callback may have returned a string.

A response's explicit `Access-Control-Allow-Methods` is now the starting list,
and the filter has the final word. An empty array omits the header; invalid method
tokens are dropped. `?_envelope=1` moves response headers into the body before
this stage, so test it separately.

CORS headers advertise browser behavior; they do not restrict a route's allowed
methods or replace `permission_callback`. Test headers over HTTP with an Origin
header. `rest_do_request()` does not exercise all response-serving headers.

## Verification

Create revisioned and non-revisioned keys, test responses and restoration,
exercise own-draft and separate autosaves, query comments as admin and guest, and
check default/filtered/explicit/enveloped CORS headers. Record untested branches.

## References

- [REST changes in 7.2](https://make.wordpress.org/core/2026/11/17/rest-api-changes-in-wordpress-7-2/)
- Verified source: `wp-includes/rest-api/fields/class-wp-rest-revision-meta-fields.php`,
  `wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php`,
  `wp-includes/rest-api/endpoints/class-wp-rest-comments-controller.php`,
  `wp-includes/rest-api.php`.
- Related stable skill: `wp-rest-api`.
