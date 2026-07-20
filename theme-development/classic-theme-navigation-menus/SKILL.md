---
name: classic-theme-navigation-menus
description: Build or audit navigation menus in classic PHP WordPress themes on WP 7.0. Covers `register_nav_menus()` on `after_setup_theme`, rendering with `wp_nav_menu()`, `theme_location`, `container => nav`, `container_aria_label`, `fallback_cb => false`, `has_nav_menu()`, menu IDs/classes, mobile toggle buttons with `aria-controls` and `aria-expanded`, safe filters for menu attributes/classes, when to avoid custom walkers, and common accessibility/security mistakes around raw menu meta and anchor-based toggles.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Navigation Menus

Use this when adding or reviewing classic theme menus, header navigation, footer navigation, social/menu locations, mobile menu toggles, menu filters, or custom walkers.

## When to Use This Skill

- Registering menu locations in a classic theme.
- Rendering `wp_nav_menu()` in `header.php`, `footer.php`, or a template part.
- Adding a mobile menu toggle.
- Preventing WordPress from silently falling back to page lists.
- Adding classes/attributes to menu links.
- Reviewing custom `Walker_Nav_Menu` code.

## Register Menu Locations

Register locations on `after_setup_theme`.

```php
add_action( 'after_setup_theme', 'mytheme_register_menus' );

function mytheme_register_menus() {
	register_nav_menus(
		array(
			'primary' => __( 'Primary menu', 'textdomain' ),
			'footer'  => __( 'Footer menu', 'textdomain' ),
		)
	);
}
```

Rules:

- Location keys must be strings.
- Prefix unusual location keys if they might collide in shared code.
- `register_nav_menus()` automatically adds theme support for menus.
- Do not register menu locations from template files.

## Render a Menu

Use `wp_nav_menu()` with an explicit location and fallback behavior.

```php
if ( has_nav_menu( 'primary' ) ) :
	?>
	<button
		class="menu-toggle"
		type="button"
		aria-controls="primary-menu"
		aria-expanded="false"
	>
		<?php esc_html_e( 'Menu', 'textdomain' ); ?>
	</button>

	<?php
	wp_nav_menu(
		array(
			'theme_location'       => 'primary',
			'container'            => 'nav',
			'container_id'         => 'site-navigation',
			'container_class'      => 'main-navigation',
			'container_aria_label' => __( 'Primary menu', 'textdomain' ),
			'menu_id'              => 'primary-menu',
			'menu_class'           => 'primary-menu',
			'fallback_cb'          => false,
			'depth'                => 3,
		)
	);
endif;
```

Rules:

- Use `theme_location`; do not render an arbitrary first menu by accident.
- Use `fallback_cb => false` unless a page-list fallback is a deliberate design decision.
- Use unique `menu_id` values. Duplicate IDs break toggles and accessibility.
- Use `container => 'nav'` plus `container_aria_label` for landmark clarity.
- If there is no assigned menu, render nothing or a deliberate setup/help state for administrators only.

## Mobile Toggle Contract

A menu toggle is an action, so it must be a `<button>`, not a fake link.

Required behavior:

- `type="button"` so it does not submit a wrapping form.
- `aria-controls` points to the actual menu container or list ID.
- `aria-expanded="false"` initially when the menu is closed.
- JavaScript toggles both the visible state and `aria-expanded`.
- The menu remains usable without hover-only interactions.

Example JavaScript:

```js
( function () {
	var button = document.querySelector( '.menu-toggle' );
	var menu = document.getElementById( 'primary-menu' );

	if ( ! button || ! menu ) {
		return;
	}

	button.addEventListener( 'click', function () {
		var expanded = button.getAttribute( 'aria-expanded' ) === 'true';

		button.setAttribute( 'aria-expanded', expanded ? 'false' : 'true' );
		menu.classList.toggle( 'is-open', ! expanded );
	} );
}() );
```

Enqueue this script through `wp_enqueue_scripts`, not inline in `header.php`.

## Fallback Strategy

WordPress' default `wp_nav_menu()` fallback can output a page menu when no menu is assigned. That is often surprising in custom themes.

Use one of these explicit strategies:

- `fallback_cb => false` for production themes where no assigned menu should mean no menu output.
- A custom fallback callback that outputs controlled markup.
- An administrator-only notice in preview/local development, never public setup instructions for visitors.

## Menu Filters

Prefer filters for small attribute/class changes.

Useful filters:

- `nav_menu_css_class` for `<li>` classes.
- `nav_menu_item_id` for item IDs.
- `nav_menu_link_attributes` for `<a>` attributes.
- `nav_menu_submenu_css_class` for submenu classes.
- `nav_menu_submenu_attributes` for submenu attributes.

Example:

```php
add_filter( 'nav_menu_link_attributes', 'mytheme_nav_link_attributes', 10, 4 );

function mytheme_nav_link_attributes( $atts, $menu_item, $args, $depth ) {
	if ( 'primary' !== $args->theme_location ) {
		return $atts;
	}

	$atts['class'] = isset( $atts['class'] ) ? $atts['class'] . ' menu-link' : 'menu-link';

	return $atts;
}
```

Rules:

- Check `theme_location` before changing all menus.
- Preserve existing classes and attributes unless intentionally replacing them.
- Escape custom attribute values if they come from custom fields or options.

## Custom Walkers

Avoid a custom walker unless the HTML structure must change in a way filters cannot handle.

If a walker is necessary:

- Extend `Walker_Nav_Menu`.
- Match the current method signatures.
- Preserve core current-menu classes and `aria-current`.
- Preserve core filters unless there is a deliberate reason to replace them.
- Escape every custom attribute and text value.
- Keep output deterministic and test submenu depth.
- Implement both opening and closing methods correctly.
- Review `wp-includes/class-walker-nav-menu.php` before changing walker output. It contains accessibility behavior that custom walkers often accidentally remove.

## Review Checklist

- Menu locations are registered on `after_setup_theme`.
- Rendered menus use `theme_location`.
- Public menus do not accidentally fall back to page lists.
- `container => 'nav'` and `container_aria_label` are used for major navigation.
- IDs referenced by `aria-controls` exist and are unique.
- Mobile toggle is a `<button>` and updates `aria-expanded`.
- Menu JavaScript is enqueued, not hardcoded in the template.
- Filters check the intended menu location before mutating attributes.
- Custom walkers are avoided unless filters are insufficient.
- Custom walker output is escaped and preserves core accessibility state.

## Common Mistakes

- Rendering `wp_nav_menu()` without `theme_location`.
- Forgetting `fallback_cb => false` and exposing an unwanted page list.
- Using `<a href="#">` as a menu toggle.
- Creating duplicate `id="primary-menu"` markup in header and footer.
- Replacing all menu item classes and losing current-menu state.
- Echoing menu item custom fields without escaping.
- Writing a custom walker for a simple class or data attribute.

## References

- Official documentation: <https://developer.wordpress.org/themes/functionality/navigation-menus/>
- Verified source paths:
  - `wp-includes/nav-menu.php`
  - `wp-includes/nav-menu-template.php`
  - `wp-includes/class-walker-nav-menu.php`
  - `wp-content/themes/storefront/inc/structure/header.php`
  - `wp-content/themes/generatepress/inc/structure/navigation.php`
