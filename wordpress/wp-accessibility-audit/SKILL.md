---
name: wp-accessibility-audit
description: Audit or implement accessibility for WordPress plugins, admin screens, frontend plugin output, and classic themes against WCAG 2.2 A/AA and WordPress accessibility patterns. Use when the user asks for akadalymentesites/accessibility/a11y, form field labels, `aria-label`, `aria-describedby`, keyboard navigation, focus states, admin notices, live AJAX updates, modal/dialog UI, color contrast, font sizing, reduced motion, target size, screen-reader text, image alt text, or making a plugin/theme usable without a mouse or screen.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress Accessibility Audit

Use this when making a WordPress plugin, admin page, frontend feature, or classic theme accessible. The target baseline is WCAG 2.2 Level A and AA, matching WordPress' stated accessibility commitment. AAA is encouraged where practical, but do not claim full AAA unless every relevant AAA criterion has been audited.

This skill is not a legal certification. It is an implementation and review checklist for code.

## When to Use This Skill

- The task says accessibility, a11y, WCAG, screen reader, keyboard, akadalymentesites, ARIA, or accessible forms.
- Reviewing admin screens, settings pages, metaboxes, list tables, media frames, custom dialogs, AJAX UI, or frontend shortcode output.
- Adding labels/help text/errors for fields.
- Fixing color contrast, focus visibility, target sizes, font sizing, reduced motion, or hover-only interactions.
- Making live updates announce through `wp.a11y.speak()`.

## Baseline Rules

- Content and controls are usable with keyboard only.
- Every interactive element has a correct native role or ARIA role.
- Every form control has an accessible name.
- Focus is visible and not hidden behind sticky headers/toolbars.
- Text and UI contrast meet WCAG AA.
- Text can be zoomed to 200% without loss of content or functionality.
- Motion-heavy UI respects reduced-motion preferences.
- Errors are visible, understandable, and programmatically associated with fields.
- Dynamic updates are announced when they change user-relevant state.
- Automated tests are supplemented by keyboard and screen-reader checks.

## ARIA Decision Rule

Prefer native HTML first. ARIA patches semantics; it does not make broken interaction accessible by itself.

Use this order:

1. Correct native element: `<button>`, `<a>`, `<label>`, `<input>`, `<select>`, `<textarea>`, `<fieldset>`, `<legend>`, `<dialog>`, `<nav>`, `<main>`.
2. Visible text labels.
3. `aria-labelledby` when visible text elsewhere labels the control.
4. `aria-label` only when no visible label is possible, usually icon-only buttons or named landmarks.
5. `aria-describedby` for help text, constraints, and errors. It is not the field's name.

Do not add ARIA roles that duplicate or contradict native semantics.

## Form Fields

Every input/select/textarea needs a real accessible name.

Good visible label:

```php
<label for="myplugin_api_key"><?php esc_html_e( 'API key', 'textdomain' ); ?></label>
<input
	type="text"
	id="myplugin_api_key"
	name="myplugin_options[api_key]"
	value="<?php echo esc_attr( $api_key ); ?>"
	aria-describedby="myplugin_api_key_help"
>
<p id="myplugin_api_key_help" class="description">
	<?php esc_html_e( 'Create this key in your provider dashboard.', 'textdomain' ); ?>
</p>
```

- Do not use placeholder text as the only label.
- Do not use `aria-label` when a visible `<label>` can exist.
- Keep `for` and `id` exactly paired.
- Use `aria-describedby` for help text and constraints.
- For required fields, use native `required` where validation supports it, plus visible required text where needed.
- For invalid fields, set `aria-invalid="true"` and connect the error with `aria-describedby`.
- Radio/checkbox groups need `<fieldset>` and `<legend>`.

Error example:

```php
<label for="myplugin_email"><?php esc_html_e( 'Notification email', 'textdomain' ); ?></label>
<input
	type="email"
	id="myplugin_email"
	name="myplugin_email"
	value="<?php echo esc_attr( $email ); ?>"
	aria-describedby="myplugin_email_help myplugin_email_error"
	aria-invalid="true"
>
<p id="myplugin_email_help" class="description"><?php esc_html_e( 'Used for failure alerts.', 'textdomain' ); ?></p>
<p id="myplugin_email_error" class="notice notice-error inline">
	<?php esc_html_e( 'Enter a valid email address.', 'textdomain' ); ?>
</p>
```

## Buttons, Links, Icons

- Use `<button type="button">` for actions that change UI state.
- Use `<a href="...">` for navigation.
- Never use `<a href="#">` or clickable `<div>` for buttons.
- Icon-only buttons need visible text, `.screen-reader-text`, or `aria-label`.
- Decorative icons inside named controls should use `aria-hidden="true"` and not receive focus.
- Repeated links like "Read more" need extra context through visible text or `.screen-reader-text`.

Icon button:

```php
<button type="button" class="button myplugin-refresh">
	<span class="dashicons dashicons-update" aria-hidden="true"></span>
	<span class="screen-reader-text"><?php esc_html_e( 'Refresh import status', 'textdomain' ); ?></span>
</button>
```

## Keyboard and Focus

- Tab reaches every interactive element in a logical order.
- Shift+Tab works backward.
- Enter activates links and submit buttons.
- Space activates buttons, checkboxes, and toggles.
- Escape closes modals, popovers, and autocomplete popups.
- Arrow-key behavior is implemented for custom menu/listbox/tab/slider patterns only when the ARIA APG pattern requires it.

- Do not use positive `tabindex`.
- Use `tabindex="-1"` only for programmatic focus targets such as error summaries or modal containers.
- Never remove outlines without a visible replacement.
- After AJAX save/delete/filter operations, keep focus stable or move it deliberately to the next useful place.
- Do not trap focus except in true modal dialogs.
- When closing a modal, return focus to the control that opened it.

Focus CSS:

```css
.myplugin-ui :focus-visible {
	outline: 2px solid #1d2327;
	outline-offset: 2px;
}

@media (forced-colors: active) {
	.myplugin-ui :focus-visible {
		outline: 2px solid CanvasText;
	}
}
```

## Dynamic Updates and Notices

For admin JavaScript that updates state without a full page load, enqueue `wp-a11y` and announce meaningful changes.

```php
wp_enqueue_script(
	'myplugin-admin',
	plugins_url( 'assets/admin.js', __FILE__ ),
	array( 'wp-a11y', 'wp-i18n' ),
	'1.0.0',
	true
);
```

```js
const { __ } = wp.i18n;

wp.a11y.speak( __( 'Settings saved.', 'textdomain' ) );
```

- Announce results, not implementation details.
- Use `polite` announcements for normal updates and `assertive` only for urgent errors.
- Visible notices still matter; screen-reader announcements do not replace visible feedback.
- Error summaries should be focusable with `tabindex="-1"` and focused after failed validation.

## Color, Text, and Layout

- Normal text contrast: at least 4.5:1.
- Large text contrast: at least 3:1.
- UI components and graphical state indicators: at least 3:1.
- Do not use color as the only way to show errors, selected state, required fields, or links in prose.

- Use relative units for text: `rem`, `em`, `%`.
- As design guidance, start body text at `1rem`, avoid UI text below 14px, and
  prefer 16px for content/form-heavy screens. WCAG does not define a universal
  minimum font-size pass/fail threshold.
- Use line-height around `1.4` to `1.6` for readable body text.
- Avoid fixed-height containers for text that can wrap or zoom.
- Test text zoom at 200%, and test reflow at 400% zoom / a 320 CSS-pixel-wide
  viewport without two-dimensional scrolling except for allowed content such
  as data tables.
- Test WCAG text-spacing overrides: line height `1.5`, paragraph spacing `2em`,
  letter spacing `0.12em`, and word spacing `0.16em`; content and controls must
  remain available.

Reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
	.myplugin-nonessential-animation {
		scroll-behavior: auto !important;
		animation: none !important;
		transition: none !important;
	}
}
```

Scope reduced-motion changes to nonessential effects. Do not globally shorten
animations when application logic waits for `animationend`/`transitionend`;
provide a no-motion code path and test that completion still occurs.

- WCAG 2.2 AA target size is 24 by 24 CSS pixels, with defined exceptions for
  sufficient spacing, inline text, equivalent larger controls, user-agent
  controls, and essential presentation. Audit the exception before reporting
  every smaller compact control as a failure.
- Prefer 44 by 44 CSS pixels for touch-heavy frontend UI.
- If the visual icon is smaller, increase clickable padding.

## Landmarks, Headings, and Tables

- Use one meaningful `h1` for the screen/admin page title.
- Keep headings in logical order; do not choose heading levels by visual size.
- Admin pages should use the normal `.wrap > h1` pattern.
- Use landmarks for major areas: `main`, `nav`, `aside`, `header`, `footer`.
- Multiple `nav` landmarks need names with `aria-label` or `aria-labelledby`.
- Data tables need header cells with `scope="col"` or `scope="row"`.
- Do not use tables for layout.

## Media and Images

- Informative images need meaningful alt text.
- Decorative images use empty `alt=""`.
- Do not repeat adjacent text in alt text.
- SVG icons that are decorative use `aria-hidden="true" focusable="false"`.
- Audio/video must not autoplay with sound.
- Captions/transcripts are required when media conveys information.

## Custom Components

Before building a custom widget, check whether native HTML or a WordPress component already solves it.

- Use the WAI-ARIA APG pattern for the component type.
- Implement the documented keyboard interaction.
- Manage focus deliberately.
- Keep ARIA state synchronized: `aria-expanded`, `aria-selected`, `aria-checked`, `aria-disabled`, `aria-controls`.
- Test with keyboard and at least one screen reader.

- Modal dialogs.
- Autocomplete/listbox.
- Tabs.
- Accordions/disclosures.
- Drag-and-drop UIs.
- Toasts/live updates.
- Date pickers.

## Audit Workflow

1. Identify every interactive element.
2. Verify accessible name, role, value, and state.
3. Tab through the whole UI without a mouse.
4. Trigger validation errors and verify visible/focus/ARIA behavior.
5. Test 200% text zoom, 400%/320-CSS-pixel reflow, and text-spacing overrides.
6. Check contrast for text, focus, borders, icons, and error states.
7. Disable animations through reduced-motion preference.
8. Run an automated checker, then manually verify anything it cannot know.
9. Record issues with severity and WCAG/WordPress rationale.

## Severity Guide

- Critical: keyboard trap, unreachable primary action, missing accessible names on required controls, modal focus broken, security/checkout/account flow unusable.
- High: invalid fields not announced, focus invisible, insufficient contrast on important text/actions, destructive action ambiguity, dynamic state not announced.
- Medium: poor heading order, missing landmark names, weak help text
  association, target size below 24px without a WCAG exception, or
  nonessential motion not reduced.
- Low: redundant labels, minor screen-reader verbosity, cosmetic focus inconsistency that remains usable.

## Common Mistakes
- Common failures: replacing visible labels with `aria-label`, using
  `aria-describedby` as the name, hiding labels with `display:none`, removing
  outlines, positive `tabindex`, click handlers on non-interactive elements,
  color-only state, silent AJAX completion, and trusting an automated scan as
  proof of accessibility.

## Cross-References

- Pair with `wp-admin-settings-api`, `wp-admin-list-table`, or
  `wp-admin-media-frame` for those specific admin components.
- Use `classic-theme-accessibility-semantics` for classic theme document structure and landmarks.

## References

- Official documentation: <https://developer.wordpress.org/coding-standards/wordpress-coding-standards/accessibility/>
- Official documentation: <https://www.w3.org/TR/WCAG22/>
- Official documentation: <https://www.w3.org/WAI/ARIA/apg/>
- Official documentation: <https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/>
- Official documentation: <https://www.section508.gov/develop/guide-accessible-web-design-development/>
- Verified source paths:
  - `wp-admin/css/common.css`
  - `wp-includes/js/dist/a11y.js`
  - `wp-includes/script-loader.php`
  - `wp-includes/comment-template.php`
  - `wp-includes/media-template.php`
  - `wp-includes/class-wp-customize-control.php`
  - `wp-admin/js/common.js`
