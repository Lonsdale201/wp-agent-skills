---
name: wp-admin-toolbar
description: >-
  Add, remove, or audit WordPress Admin Toolbar nodes with `admin_bar_menu` and
  `WP_Admin_Bar`, including capability-aware links, parent/child ordering,
  accessible markup, frontend/admin/network/editor contexts, and WordPress 7.1's
  persistent toolbar in the Post and Site Editors. Use when a plugin adds quick
  actions, status links, counters, account menus, or must hide/fix a toolbar node
  in editor screens.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Admin Toolbar

Build toolbar extensions through the public PHP API. In WordPress 7.1 the bar is
also present by default in the Post and Site Editors, except in Distraction Free
mode, so every node must tolerate those contexts.

## Add a capability-aware node

```php
add_action(
	'admin_bar_menu',
	static function ( WP_Admin_Bar $bar ): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$bar->add_node(
			array(
				'id'     => 'myplugin-status',
				'parent' => false,
				'title'  => esc_html__( 'Service status', 'my-plugin' ),
				'href'   => admin_url( 'admin.php?page=my-plugin' ),
				'meta'   => array(
					'class' => 'myplugin-toolbar-status',
					'title' => __( 'Open service status', 'my-plugin' ),
				),
			)
		);
	},
	100
);
```

Use a globally unique, prefixed `id`. Add parents before children, keep labels
short, and do not place forms, complex application UI, or request-controlled
HTML in `title`. A CSS class is not a security boundary.

## Context and WordPress 7.1

The same callback may run on the frontend, ordinary wp-admin, network admin,
the Post Editor, and the Site Editor. `get_current_screen()` is admin-only and
can be `null`; guard it:

```php
$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

if ( $screen && ( 'site-editor' === $screen->id || $screen->is_block_editor() ) ) {
	return;
}
```

Do not assume the Site Editor is a normal full-page reload context. Re-test
focus, submenu positioning, styles, and destinations. Prefer normal links to
scripts tied to one document lifecycle. If the node is irrelevant in editors,
omit it explicitly rather than hiding it with fragile CSS.

WordPress owns the W logo, site icon, site title, and editor back button. Do not
replace their semantics. The toolbar may be absent in Distraction Free mode, so
never make it the only path to a required feature.

## Remove or change nodes

Hook after the node's registration priority, then use `get_node()`,
`add_node()` to update, or `remove_node()` to remove. Never manipulate the
rendered DOM as the primary implementation.

```php
add_action(
	'admin_bar_menu',
	static function ( WP_Admin_Bar $bar ): void {
		if ( ! current_user_can( 'update_core' ) ) {
			$bar->remove_node( 'updates' );
		}
	},
	999
);
```

Removing a link does not revoke access. Enforce the same capability in the
destination screen, REST route, Ajax handler, or mutation callback.

## Performance and state

`admin_bar_menu` runs on every request where the toolbar renders. Avoid remote
HTTP calls, unbounded counts, large queries, or rebuilding expensive state.
Use a short-lived cache for informational counters and make stale status clear.
Never execute a mutation merely because a node renders.

For action links, prefer a destination screen with a POST form. If a direct
action URL is justified, use a capability check, `wp_nonce_url()`, strict action
handling, and a safe redirect. A nonce proves intent, not authorization.

## Accessibility and styling

- Visible text must explain the destination; icon-only nodes need an accessible
  name and must be tested with core toolbar keyboard navigation.
- Do not use `title` alone as the label.
- Scope CSS beneath `#wpadminbar` and the prefixed node ID/class.
- Do not copy core internal selectors or assume a fixed toolbar height.
- Test zoom, RTL, narrow screens, high contrast, keyboard traversal, and both
  submenu directions.

## Test matrix

Test logged out, subscriber, intended role, administrator, frontend, wp-admin,
network admin, Post Editor, Site Editor, Distraction Free mode, no site icon,
multisite, mobile/narrow viewport, RTL, direct destination access, invalid nonce,
and cached-counter failure. Verify that parent and child IDs remain unique when
two integrations are active.

## Cross-references

- `wp-accessibility-audit` for keyboard and naming checks.
- `wp-block-editor-iframe-compatibility` for editor document boundaries.
- `wp-plugin-assets-loading` for context-gated styles and scripts.
- `wp-security-audit` for destination authorization and nonces.

## References

- `WP_Admin_Bar`: <https://developer.wordpress.org/reference/classes/wp_admin_bar/>
- `admin_bar_menu`: <https://developer.wordpress.org/reference/hooks/admin_bar_menu/>
- WordPress 7.1 persistent toolbar: <https://make.wordpress.org/core/2026/07/13/consistent-navigation-in-wordpress-7-1-with-persistent-toolbar/>
