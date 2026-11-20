---
name: wp72-admin-icons
description: >-
  Migrates WordPress 7.2 admin menu and toolbar icon integrations to inline SVG. Use for Dashicons pseudo-element overrides, custom admin color schemes, WP_Admin_Bar node title manipulation, the new icon argument, core-admin icon names or wp_is_valid_icon_name checks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 admin icons

Core menus/toolbars render inline SVG instead of font glyphs. Existing plugin
Dashicons integrations generally remain supported; review actual overrides.

## Inspect markup and CSS

- Styles on `::before` do not automatically style SVG. Color the containing
  `.wp-menu-image` or `.ab-icon`; SVG inherits its color.
- To hide an icon, hide the SVG/container as appropriate, not only its old glyph.
- A replacement background needs its own content/size instead of relying on the
  removed pseudo-element to create a box.
- Target stable menu/node IDs or `menu-icon-*` classes when the old Dashicons
  class is absent. Keep old selectors when supporting earlier cores.
- Core toolbar icons now come from the node's icon property; empty icon spans
  may no longer be present in node titles. The wp-logo title is a special case.
- Keep icon-only actions accessibly named, decorative SVG hidden from assistive
  technology and keyboard focus visible.

## Public registration

Use registered names from the stable `core-admin` collection for admin icons.
The `core` collection targets content/frontend use and can be unregistered by
other code. A missing name renders no icon and reports incorrect usage in debug.

`add_menu_page()` and post type `menu_icon` accept registered names in 7.2.
`WP_Admin_Bar::add_node()` accepts an `icon` argument.

```php
$icon = function_exists( 'wp_is_valid_icon_name' )
    ? 'core-admin/pin'
    : 'dashicons-admin-post';
```

Use that value as a menu icon. The new helper only validates namespaced syntax;
it does not prove registration. For toolbar fallbacks, keep the established old
title/icon markup and add the new icon argument according to the dev note.
Do not assume that the 7.1 SVG registry alone proves 7.2 menu support.

For custom icons, register a collection and its icons through the existing SVG
Icon API. Feature-detect for the minimum core version actually supported.

## Adjacent toolbar changes

The greeting moved from top-level my-account to user-info. Do not replace
"Howdy" in the old title and assume it worked. The user display name has
`user-display-name`; preserve `.username[hidden]` behavior. Code overriding
core's account node must run after its priority 9991 callback and retain an
accessible menu name.

## Verify

Check standard and custom color schemes, hover/focus/current states, collapsed
and responsive menus, RTL, frontend toolbar, an old supported core and an
unregistered icon. Exercise any title replacement after save/reload.

## References

- [SVG admin/menu dev note](https://make.wordpress.org/core/2026/11/05/svg-icons-in-the-admin-bar-and-menu-in-wordpress-7-2/)
- [Toolbar and appearance changes](https://make.wordpress.org/core/2026/11/19/miscellaneous-developer-changes-in-wordpress-7-2/)
- Verified source: `wp-includes/class-wp-admin-bar.php`,
  `wp-includes/admin-bar.php`, `wp-admin/menu-header.php`,
  `wp-admin/includes/plugin.php`, `wp-includes/icons.php`.
- Related stable skill: `wp-svg-icon-api`.
