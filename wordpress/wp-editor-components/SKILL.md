---
name: wp-editor-components
description: >-
  Build or migrate WordPress editor and plugin React interfaces using public
  @wordpress/components APIs. Covers dependency handles, accessible controlled
  controls, WordPress 7.1 40px form-control defaults, removed Navigation and
  __experimentalApplyValueToSides APIs, Navigator migration, Emotion-to-SCSS
  styling changes, View's no-op css prop, and design-system integration. Use
  when plugin JavaScript imports @wordpress/components, renders Inspector or
  admin controls, has 7.1 layout regressions, console deprecations, or relies on
  private/generated component markup and classes.
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

# WordPress Editor Components

Use public WordPress components for editor/admin application UI, but keep form
state, persistence, authorization, and errors in your own explicit data flow.
Component visibility and disabled state are never server-side access control.

## Load the package correctly

When using `@wordpress/scripts`, import packages normally and consume the
generated `.asset.php` file so `wp-components`, `wp-element`, `wp-i18n`, and
other dependencies are declared automatically. Do not bundle a second React or
reach through `window.wp.components` private properties to bypass the build.

Load component CSS in the target document. WordPress 7.1's post-editor canvas
is always iframed, so distinguish shell components from block content styles.
If custom UI uses `@wordpress/theme` or `--wpds-*` tokens, declare the matching
`wp-theme` script/style dependency; the two registries are independent.

## Build accessible controlled controls

```jsx
import { TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

<TextControl
	label={ __( 'API label', 'acme' ) }
	value={ label }
	onChange={ setLabel }
	help={ error || __( 'Shown to editors.', 'acme' ) }
/>;
```

Keep a stable controlled value and provide real labels, help/error association,
keyboard behavior, focus restoration, and loading feedback. Do not scrape a
component's generated DOM, class names, or Emotion identifiers. Use documented
props and composition.

## WordPress 7.1 form-control sizing

Affected form controls now use a 40px default unconditionally. Remove
`__next40pxDefaultSize`; it has no runtime effect, and `false` does not restore
36px. On `BorderBoxControl`, `BorderControl`, `FontSizePicker`, and
`ToggleGroupControl`, the old `size` prop is also deprecated and ineffective.

This rollout does not include `Button`; do not mechanically remove a Button
opt-in without checking its current contract. Audit surrounding fixed heights,
grid rows, modal footers, and custom CSS instead of forcing old internal
dimensions back onto the component.

## Removed and changed APIs

- `Navigation` and its subcomponents were removed in 7.1. Migrate navigation
  state and screens to `Navigator`; it is not a one-name import replacement.
- `__experimentalApplyValueToSides` was removed. Keep `BoxControl`, but move
  side-value transformation into plugin-owned data logic.
- `View` still accepts `css` for type compatibility, but the prop is a no-op.
  Use `style` or `className`.
- `Divider`, `Surface`, `Truncate`, `View`, `Flex`, and `Spacer` are among the
  components moving away from Emotion implementation details. If using
  Emotion `cx()`/`css()`, compose order-dependent fragments in one `css()` call
  before `cx()`; preferably use scoped classes.

Read `references/wp-71-migration-matrix.md` for the affected controls and
before/after checks.

## Design-system boundary

Prefer a WordPress component over styling low-level tokens directly. For a
plugin-owned themed application subtree, public `ThemeProvider` can set primary
and background seed colors, cursor behavior, and corner radius. Render at most
one `isRoot` provider per document, accept only valid opaque colors, and verify
actual contrast; the generated palette cannot guarantee every combination.

Do not globally restyle core editor controls from plugin CSS. Scope any
plugin-specific surface and test it with admin color schemes, RTL, high
contrast, zoom, and narrow viewports.

## Migration workflow

1. Search imports/JSX for removed, deprecated, `__experimental`, `__unstable`,
   `css`, generated-class, and fixed-height dependencies.
2. Confirm the installed WordPress package version and public documentation.
3. Migrate one behavior at a time; do not silence console warnings with aliases.
4. Rebuild dependency metadata and verify the script/style handles.
5. Test keyboard, focus, screen reader naming, errors, loading, RTL, zoom, and
   both Post/Site Editor contexts.
6. Test the oldest supported WordPress or feature-detect an optional export.

## Security and performance

- Re-check permissions and sanitize writes at REST/Ajax handlers.
- Never render untrusted HTML through component escape hatches.
- Debounce deliberate search, cancel stale requests, and avoid a request on
  every uncontrolled render.
- Keep selectors stable and subscriptions narrow; memoize only after measuring.
- Treat experimental APIs as unstable even when they happen to exist in Core.
- React 19 did not ship in WordPress 7.1; do not code against that experiment as
  the Core runtime contract.

## Related skills

- `wp-dataviews-dataform` for dataset and form abstractions.
- `wp-block-editor-iframe-compatibility` for canvas/shell document boundaries.
- `wp-plugin-assets-loading` for handles, generated metadata, and `wp-theme`.
- `wp-accessibility-audit` for full interaction testing.

## References

- Read `references/wp-71-migration-matrix.md` for the per-component removal/replacement matrix.
- Editor components updates in WordPress 7.1: <https://make.wordpress.org/core/2026/07/23/editor-components-updates-in-wordpress-7-1/>
- Design system theming in WordPress 7.1: <https://make.wordpress.org/core/2026/07/31/design-system-theming-in-wordpress-7-1/>
- Miscellaneous block editor changes in WordPress 7.1: <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
