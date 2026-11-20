---
name: wp72-editor-styles
description: >-
  Migrates WordPress 7.2 editor components, menus and block styling. Use for Emotion or SCSS Module overrides, palette asButtons/presentation, InspectorControls __experimentalGroup, style-state controls, textShadow presets, FontFamilyControl or bundled @wordpress package class collisions.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 editor and styling changes

Start with the affected package and loading mode: shared core handles versus
plugin-bundled packages. Source presence does not prove correct iframe styling.

## Components and menus

Read [editor-migrations.md](references/editor-migrations.md) for affected APIs.

- Replace ignored View `css` props with `style` or controlled stylesheet classes.
- Own Emotion dependencies and cross-document caches explicitly. Keep package
  StyleProvider for CSS Module styles; it no longer provides an Emotion cache.
- Replace palette `asButtons` with the appropriate `presentation`. Choose
  listbox, toggle-buttons or command-buttons according to interaction semantics.
- Use `InspectorControls group`; `__experimentalGroup` has been removed.
- Keep documented menu Slot/Fills. Update tests and custom styles for the new
  `@wordpress/ui` Menu DOM; `as` is ignored and items move into Panels.
- Update bundled packages affected by CSS Module collisions and rebuild; loading
  the fixed core handle does not repair a separate bundled copy.

## Responsive and pseudo-state controls

Use the current selected block style state, then merge only the intended style
branch. Preserve other viewport/pseudo states and unrelated declarations:

```js
const selectedState = select( blockEditorStore )
    .getSelectedBlockStyleState( clientId );
const current = getStyleForState( attributes.style, selectedState ) || {};
setAttributes( {
    style: setStyleForState( attributes.style, selectedState, {
        ...current,
        dimensions: { ...current.dimensions, minHeight: nextValue },
    } ),
} );
```

Import the helpers/store from `@wordpress/block-editor` and use a reactive
selector in a React control. The snippet illustrates the merge, not a full
component. Use `hasSelectedBlockStyleState` when branching on non-default state.
Use `group="style-state"` for matching inspector/toolbar controls. Toolbar slots
are not hidden for pseudo states in the same way as viewport states.

Use `getViewportMediaQueries()` from `@wordpress/global-styles-engine`, or
`wp_get_viewport_media_queries()` in PHP. Defaults are mobile 480px/tablet 782px;
PHP's `include_desktop` option defaults to false.

## Text shadow

Opt custom blocks in through `supports.typography.textShadow` in `block.json`.
Paragraph and Heading already opt in. Define theme presets under
`settings.typography.textShadowPresets` as name/slug/textShadow entries.
Preset values generate `--wp--preset--text-shadow--SLUG` variables and
`.has-SLUG-text-shadow` classes. The block's preset attribute is `textShadow`;
`styles.typography.textShadow` also accepts preset references.

The control may be hidden until enabled in Typography's options menu.
`defaultTextShadowPresets: false` hides core presets; also set
`textShadow: false` to disable the feature. Test global, per-block and
instance overrides without overwriting user settings.

## Verify

Exercise the editor and frontend, mobile/tablet/desktop plus a pseudo state,
save/reload and undo/redo. For palettes check roles, selection state, keyboard
navigation and visible focus. For styles check the parent document, editor iframe
and popover portals. Keep manual/device gaps explicit.

## References

- [Component/menu/package details](references/editor-migrations.md)
- [State-aware styling API](https://make.wordpress.org/core/2026/11/18/api-for-style-state-aware-block-styling-controls/)
- [Text shadow support](https://make.wordpress.org/core/2026/11/11/new-block-support-in-wordpress-7-2-text-shadow/)
- Verified source: `wp-includes/js/dist/block-editor.js`,
  `wp-includes/js/dist/components.js`, `wp-includes/block-supports/`,
  `wp-includes/class-wp-theme-json.php`, `wp-includes/global-styles-and-settings.php`.
