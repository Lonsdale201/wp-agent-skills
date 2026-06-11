---
name: classic-theme-accessibility-semantics
description: Build or audit accessibility and semantic HTML in classic PHP WordPress themes on WP 7.0. Covers `language_attributes()`, `wp_head()`, `body_class()`, `wp_body_open()`, landmarks, skip links, focus management, `screen-reader-text`, heading order, nav/button semantics, `aria-controls` and `aria-expanded`, forms and labels, image alt handling, icon accessibility, reduced motion CSS, search forms, and common mistakes such as hover-only menus, hidden focus outlines, fake buttons, missing main landmarks, or unlabeled controls.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-04"
docs:
  - https://developer.wordpress.org/themes/functionality/accessibility/
  - https://developer.wordpress.org/themes/classic-themes/basics/template-tags/
source-refs:
  - wp-includes/general-template.php
  - wp-includes/post-template.php
  - wp-includes/nav-menu-template.php
  - wp-includes/class-walker-nav-menu.php
  - wp-content/themes/storefront/inc/structure/header.php
  - wp-content/themes/generatepress/header.php
---

# Classic Theme Accessibility and Semantics

Use this when creating or reviewing the HTML semantics, keyboard behavior, landmarks, skip links, focus styles, forms, images, icons, and ARIA behavior of a classic PHP WordPress theme.

Accessibility is not a visual polish pass. It affects template structure, PHP output, CSS, and JavaScript behavior.

## When to Use This Skill

- Writing `header.php`, `footer.php`, `index.php`, `single.php`, `page.php`, or navigation templates.
- Adding a mobile menu, modal, search toggle, carousel, tabs, accordion, or interactive widget.
- Reviewing theme markup for WordPress.org-style accessibility expectations.
- Fixing keyboard navigation, missing focus states, unlabeled controls, bad heading order, or broken landmarks.

## Document Skeleton

A classic theme header should preserve core hooks and language/body helpers.

```php
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
```

Rules:

- Use `language_attributes()` on `<html>`.
- Use `bloginfo( 'charset' )` for the charset.
- Use `wp_head()` before closing `</head>`.
- Use `body_class()` on `<body>`.
- Call `wp_body_open()` immediately after the opening body tag.
- Add `add_theme_support( 'title-tag' )` in theme setup; do not hardcode `<title>`.

## Landmarks

Use semantic landmarks so users can navigate the page structure.

```php
<header id="masthead" class="site-header">
	<nav id="site-navigation" class="main-navigation" aria-label="<?php esc_attr_e( 'Primary menu', 'textdomain' ); ?>">
		...
	</nav>
</header>

<main id="main" class="site-main">
	...
</main>

<footer id="colophon" class="site-footer">
	...
</footer>
```

Rules:

- Each page should have a clear main landmark.
- Major navigation landmarks need accessible names when there is more than one `nav`.
- Do not put the entire page in generic `<div>` elements when semantic elements fit.
- Do not create multiple unlabeled `main` elements.

## Skip Links

Add a skip link that becomes visible on focus and targets real content.

```php
<a class="skip-link screen-reader-text" href="#main">
	<?php esc_html_e( 'Skip to content', 'textdomain' ); ?>
</a>
```

The target must exist. If focus needs to move reliably in JavaScript-assisted layouts, make the target focusable:

```php
<main id="main" class="site-main" tabindex="-1">
```

Rules:

- The skip link must be the first meaningful focusable element after `wp_body_open()`.
- It must become visible on keyboard focus.
- The `href` must point to an ID that exists on every template.

## Screen Reader Text CSS

Include a standard visually-hidden utility and restore it on focus.

```css
.screen-reader-text {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(1px, 1px, 1px, 1px);
	word-wrap: normal;
	border: 0;
}

.screen-reader-text:focus {
	top: 5px;
	left: 5px;
	z-index: 100000;
	display: block;
	width: auto;
	height: auto;
	padding: 15px 23px 14px;
	clip: auto;
	background: #fff;
	color: #000;
	font-size: 1rem;
	font-weight: 700;
	text-decoration: none;
}
```

Rules:

- Do not use `display: none` for content that screen readers need.
- Make skip links visible on focus, not only available to assistive tech.
- Keep focus styles visible above sticky headers.

## Headings

Headings describe document structure.

Rules:

- Use one clear `h1` for the primary page title.
- Archive/search pages usually use the archive/search title as `h1`.
- Posts in archive cards should usually use `h2`.
- Do not choose heading levels based only on font size.
- Do not skip levels to achieve visual styling; style with CSS.

## Links, Buttons, and Toggles

Use elements by behavior:

- Links navigate to URLs.
- Buttons perform actions on the current page.
- Form controls collect input.

Mobile menu toggle:

```php
<button
	class="menu-toggle"
	type="button"
	aria-controls="primary-menu"
	aria-expanded="false"
>
	<?php esc_html_e( 'Menu', 'textdomain' ); ?>
</button>
```

Rules:

- Do not use `<a href="#">` as a button.
- Keep visible labels or accessible names for icon-only buttons.
- Update `aria-expanded` when a controlled region opens/closes.
- `aria-controls` must reference an existing ID.
- Avoid adding ARIA when native HTML already communicates the behavior correctly.

## Focus and Keyboard

Rules:

- Never remove `outline` without a visible replacement.
- Use `:focus-visible` where appropriate, with a fallback if supporting older browsers.
- Hover-only menus are not enough. Keyboard users must be able to open and traverse navigation.
- Modals and off-canvas panels need focus management and Escape behavior. If the theme cannot implement that correctly, avoid shipping the interaction.
- Do not trap focus in ordinary dropdown navigation.

## Forms and Search

Rules:

- Every input needs a real `<label>` or an equivalent accessible name.
- Placeholder text is not a label.
- Error messages should identify the field and be programmatically connected when possible.
- Use `get_search_form()` unless the theme has a specific accessible custom search form.
- Nonces and validation are security concerns, but accessible errors are still required for user correction.

## Images and Icons

Rules:

- Informative images need useful alt text.
- Decorative images should use empty alt text.
- Do not stuff keywords into alt text.
- For featured images, rely on WordPress image functions where possible and ensure attachment alt text is maintained.
- SVG icons used only as decoration should have `aria-hidden="true"` and `focusable="false"`.
- Icon-only buttons/links need an accessible name via visible text, `.screen-reader-text`, or `aria-label`.

## Motion and Visual Requirements

Respect reduced motion preferences.

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		scroll-behavior: auto !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
```

Rules:

- Ensure text contrast is sufficient in normal, hover, and focus states.
- Do not rely on color alone to communicate state.
- Keep line heights and spacing readable.
- Avoid auto-playing motion-heavy UI. If used, provide pause/stop controls.

## WordPress Template Helpers

Preserve helpers that contribute useful classes and core integration:

- `body_class()` on `<body>`.
- `post_class()` on post wrappers.
- `wp_body_open()` after `<body>`.
- `wp_head()` and `wp_footer()`.
- `language_attributes()` on `<html>`.
- `the_custom_logo()` when using core custom logo support.
- `get_search_form()` for baseline search form behavior.

## Review Checklist

- Header uses `language_attributes()`, `wp_head()`, `body_class()`, and `wp_body_open()`.
- Page has one clear main landmark.
- Skip link exists, is focus-visible, and points to a real ID.
- Navigation landmarks have accessible names.
- Mobile toggles are buttons and update `aria-expanded`.
- Keyboard focus is visible everywhere.
- Headings follow document structure.
- Forms have labels and understandable errors.
- Images and SVG icons have appropriate alt/ARIA behavior.
- Reduced motion is respected for animations/transitions.
- Theme does not rely on hover-only interactions.

## Common Mistakes

- Hiding skip links with `display: none`.
- Removing outlines globally.
- Using a fake link for menu/search toggles.
- Adding `role="button"` to an anchor instead of using a button.
- Creating several unlabeled navigation landmarks.
- Outputting icon-only buttons with no accessible name.
- Making dropdown menus impossible to use with a keyboard.
- Forgetting `wp_body_open()` in `header.php`.
