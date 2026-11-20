---
name: wp72-platform-compatibility
description: >-
  Audits WordPress 7.2 platform deltas affecting randomable post types and random redirects, NO_BACKSLASH_ESCAPES, application-password hook slashing and notifications, register_site_meta, local WP_DEBUG, worktree update detection and Appearance submenu positions. Use when these contracts affect a 7.2 upgrade.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 platform compatibility

Review only the affected integration surfaces. Keep changes to stored data,
authentication policy and automatic updates separate from observational checks.

## Random content redirects

The default random base precedes archive paths: /random/, /random/category/slug/,
 /random/author/name/ and eligible post-type archives. The base is configurable
and translatable.

`randomable` defaults to publicly_queryable plus has_archive for custom types.
Built-in post participates; page/attachment do not. Explicitly set false for a
public archived type that should be excluded.

Selection runs through the main query. Existing archive filters also affect it.
Use `wp_is_random_content_query( $query )` to scope a change. Preserve published
status/visibility and test empty selections as well as eligible destinations.
`wp_enable_random_content_redirect` disables the feature, its rules and setting.
Flush rewrites only when applying a deliberate rewrite change.

## Database session mode

Core adds NO_BACKSLASH_ESCAPES to its incompatible-mode list and removes it from
the connection's active SQL modes. It does not change the server-wide mode. Verify `@@SESSION.sql_mode` after
bootstrap and round-trip apostrophes/backslashes with `$wpdb->prepare()`.

The early `incompatible_sql_modes` filter can adjust this from a db.php drop-in;
a normal plugin may load too late for the initial connection. Do not restore an
incompatible mode merely to match a hosting default.

## Application passwords

Creation/update APIs still expect slashed arguments: use `wp_slash()` for raw
values. In 7.2 creation/update actions and returned item data are unslashed.
Remove an old extra `wp_unslash()` in callbacks where it would strip real
backslashes. Do not change the input contract at the same time.

Core sends a creation notification. Inspect
`wp_send_application_password_created_email` and
`wp_application_password_created_email` before adding a duplicate. Both filters
receive value, user and stored item; the item's password is a hash. The creation
action separately includes the plaintext password: never log its full arguments.
Preserve subject placeholders when customizing the message and test mail through
a local interceptor/sink.

## Multisite site metadata

`register_site_meta( $key, $args )` wraps `register_meta( 'blog', ... )`;
`unregister_site_meta( $key )` unregisters it. Both load only on multisite.
Gate shared code with `is_multisite()` and version/function availability.

The wrapper registers keys for the whole blog object type by default. If you
explicitly set object_subtype to blog, clean that registration up with
unregister_meta_key( 'blog', $key, 'blog' ); unregister_site_meta() has no subtype
argument and only removes the default registration.

For an existing multisite site, get_object_subtype('blog', ID) now returns blog.
Test subtype registrations, defaults and sanitizers. These are site/blog metadata,
not network options. show_in_rest does not create a core sites REST endpoint.

## Bootstrap, updates and admin positions

- When WP_DEBUG is undefined, local now defaults to true as development already
  did. Explicit configuration wins. Define debug display/logging deliberately.
- A .git file, including worktree/submodule pointers, now counts as a VCS checkout.
  Automatic updates can therefore stop. Verify the deployment's intended updater
  rather than globally overriding the VCS filter.
- Appearance > Add Theme occupies submenu key 6 on single site. Find/remove items
  by slug instead of numeric positions. Network Admin is unchanged.
- The destructive `.delete-link` class is scoped to wp-core-ui and admin color
  schemes; it has no effect in Fresh. It does not supply a nonce or authorization.

## References

- [Translation-update manager deltas](references/translation-updates.md)

- [Random redirects](https://make.wordpress.org/core/2026/11/05/your-content-is-going-to-get-more-random/)
- [Database mode](https://make.wordpress.org/core/2026/10/09/no_backslash_escapes-sql-mode-is-now-turned-off-by-default-in-wordpress-7-2/)
- [Miscellaneous platform changes](https://make.wordpress.org/core/2026/11/19/miscellaneous-developer-changes-in-wordpress-7-2/)
- Verified source: `wp-includes/class-wp.php`, `wp-includes/class-wp-rewrite.php`,
  `wp-includes/class-wp-post-type.php`, `wp-includes/class-wpdb.php`,
  `wp-includes/class-wp-application-passwords.php`, `wp-includes/ms-site.php`,
  `wp-includes/default-constants.php`, `wp-admin/includes/class-wp-automatic-updater.php`,
  `wp-admin/menu.php`.

