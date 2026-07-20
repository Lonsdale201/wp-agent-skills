---
name: classic-theme-sidebars-widgets
description: Build or audit classic theme widget areas and sidebars for WP 7.0. Covers `widgets_init`, `register_sidebar()`, stable sidebar IDs, `before_widget` and `before_title` wrappers, `dynamic_sidebar()`, `is_active_sidebar()`, `get_sidebar()`, `sidebar-{name}.php`, `show_in_rest`, semantic aside/footer/header widget areas, block-widget era compatibility, and common mistakes such as missing IDs, changing IDs after release, hardcoded widgets, bad wrapper placeholders, and rendering empty sidebars.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Sidebars and Widgets

Use this when adding or reviewing widget areas in a classic PHP theme: blog sidebars, footer columns, header widget areas, shop sidebars, or template-specific widget regions.

In WordPress naming, "sidebar" means a registered widget area. It does not have to appear visually at the side of the layout.

## When to Use This Skill

- Registering widget areas with `register_sidebar()`.
- Creating `sidebar.php` or `sidebar-{name}.php`.
- Rendering `dynamic_sidebar()`.
- Checking empty widget area behavior.
- Migrating hardcoded footer/header content to user-manageable widget areas.
- Reviewing widget markup semantics and REST exposure.

## Register Widget Areas

Register widget areas on `widgets_init`.

```php
add_action( 'widgets_init', 'mytheme_register_sidebars' );

function mytheme_register_sidebars() {
	register_sidebar(
		array(
			'name'          => __( 'Primary sidebar', 'textdomain' ),
			'id'            => 'sidebar-1',
			'description'   => __( 'Widgets shown beside the main content.', 'textdomain' ),
			'before_widget' => '<aside id="%1$s" class="widget %2$s">',
			'after_widget'  => '</aside>',
			'before_title'  => '<h2 class="widget-title">',
			'after_title'   => '</h2>',
			'show_in_rest'  => false,
		)
	);
}
```

Rules:

- Always provide an explicit `id`.
- Treat IDs as persistent storage keys. Changing an ID after release can orphan assigned widgets.
- Keep `%1$s` and `%2$s` in `before_widget`; core substitutes widget ID and classes.
- Choose semantic wrappers: `aside` for side content, `section` for content regions, `div` only when no semantic element fits.
- Use translated `name` and `description`.
- `register_sidebar()` adds theme support for widgets.

## Multiple Areas

Use predictable IDs for repeated footer columns.

```php
for ( $i = 1; $i <= 4; $i++ ) {
	register_sidebar(
		array(
			'name'          => sprintf(
				/* translators: %d: Footer column number. */
				__( 'Footer column %d', 'textdomain' ),
				$i
			),
			'id'            => 'footer-' . $i,
			'before_widget' => '<section id="%1$s" class="widget %2$s">',
			'after_widget'  => '</section>',
			'before_title'  => '<h2 class="widget-title">',
			'after_title'   => '</h2>',
		)
	);
}
```

Rules:

- Keep generated IDs stable.
- Use translator comments for numbered names.
- Do not let Customizer options or request values create arbitrary sidebar IDs.

## Render a Sidebar

Use `is_active_sidebar()` before outputting layout wrappers.

```php
if ( is_active_sidebar( 'sidebar-1' ) ) :
	?>
	<aside id="secondary" class="widget-area" aria-label="<?php esc_attr_e( 'Sidebar', 'textdomain' ); ?>">
		<?php dynamic_sidebar( 'sidebar-1' ); ?>
	</aside>
	<?php
endif;
```

Rules:

- Do not output empty wrapper markup for inactive sidebars unless the layout requires a placeholder.
- Pass the sidebar ID, not a translated name.
- Do not hardcode widget output in the theme to simulate a widget area.
- `dynamic_sidebar()` returns a boolean; use it if you need fallback behavior.

## Sidebar Template Files

Use `get_sidebar()` to load sidebar template files.

```php
get_sidebar();          // sidebar.php
get_sidebar( 'footer' ); // sidebar-footer.php
```

Rules:

- Put reusable sidebar rendering in `sidebar.php` or `sidebar-{name}.php`.
- Keep registration in `functions.php`/`inc/widgets.php`, not in sidebar templates.
- Do not make sidebar templates query-heavy; they may appear on many pages.

## REST and Block Widget Era

`register_sidebar()` supports `show_in_rest`.

Rules:

- Leave `show_in_rest => false` unless the widget area must be exposed publicly through REST.
- If enabling REST exposure, assume the sidebar structure is public data.
- Classic themes can still render widget areas with `dynamic_sidebar()` even when the admin widget UI uses block widgets.
- Do not disable block widgets just because the theme is classic unless the project has a tested compatibility reason.

## Markup and Accessibility

Good widget-area output:

- Uses a landmark or labeled region when it is a major page area.
- Does not create many unlabeled `aside` landmarks.
- Keeps heading levels sensible for the template context.
- Lets individual widgets output their own content.

Wrapper choice examples:

| Area | Wrapper |
|---|---|
| Blog sidebar | `<aside class="widget-area">` |
| Footer column | `<section class="footer-widget-area">` |
| Header utility area | `<div class="header-widget-area">` or labeled `<aside>` |

## Theme vs Plugin Boundary

Themes may register display regions. Plugins should register reusable widgets that provide business functionality.

Good theme-owned widget areas:

- Sidebar.
- Footer columns.
- Header utility region.
- Homepage display sections.

Bad theme-owned functionality:

- CRM signup logic.
- Payment/account widgets.
- Custom data dashboards.
- Anything that must survive theme switching.

## Review Checklist

- Widget areas are registered on `widgets_init`.
- Every sidebar has an explicit stable `id`.
- Widget wrappers preserve `%1$s` and `%2$s`.
- Titles use appropriate heading levels.
- Template output checks `is_active_sidebar()` before printing layout wrappers.
- `dynamic_sidebar()` receives IDs, not translated names.
- Empty widget areas do not leave broken layout gaps.
- `show_in_rest` is intentional.
- Business widgets are not implemented inside the theme.

## Common Mistakes

- Omitting `id` and relying on generated `sidebar-1` notices.
- Renaming a sidebar ID after users have assigned widgets.
- Removing `%1$s` or `%2$s` from `before_widget`.
- Rendering empty `<aside>` containers on every page.
- Registering sidebars from template files.
- Using widget areas as plugin data storage.

## References

- Official documentation: <https://developer.wordpress.org/themes/classic-themes/functionality/sidebars/>
- Official documentation: <https://developer.wordpress.org/themes/classic-themes/functionality/widgets/>
- Official documentation: <https://developer.wordpress.org/reference/functions/register_sidebar/>
- Official documentation: <https://developer.wordpress.org/reference/functions/dynamic_sidebar/>
- Verified source paths:
  - `wp-includes/widgets.php`
  - `wp-includes/theme.php`
  - `wp-includes/general-template.php`
  - `wp-content/themes/storefront/sidebar.php`
  - `wp-content/themes/storefront/inc/class-storefront.php`
  - `wp-content/themes/generatepress/sidebar.php`
  - `wp-content/themes/generatepress/inc/general.php`
