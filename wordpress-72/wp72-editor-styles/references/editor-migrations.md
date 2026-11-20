# Editor migration decisions

## Components

- Emotion-specific View `css` is accepted but ineffective; use `style` for inline
  declarations and your own classes for pseudo/media rules.
- If consumer Emotion fragments depend on declaration order, combine them before
  class merging. Independent classes do not require a rewrite.
- Create/reuse the consumer's Emotion cache per destination document. React
  CacheProvider does not configure the separate `@emotion/css` cache.
- Keep direct dependencies for packages you import. Components/DataViews no
  longer supply Emotion transitively. Do not remove dependencies still used by
  the application, tooling or tests.
- Own CSP nonce configuration for your cache; it does not add nonce support to
  CSS Module injection. Filter application-only props before DOM forwarding.

| Deprecated export | Direction |
|---|---|
| Animate | CSS animation and appropriate motion tokens |
| Divider / __experimentalDivider | Container's Separator, or your own CSS |
| Elevation / __experimentalElevation | Base-styles elevation tokens |
| ResponsiveWrapper | CSS aspect-ratio |
| Scrollable / __experimentalScrollable | Your own CSS |
| Surface / __experimentalSurface | Your own background/border CSS |
| Tip | Compose Notice from @wordpress/ui using its migration guide |
| ZStack / __experimentalZStack | Your own CSS |

These are deprecated in 7.2, with removal scheduled for 7.4; do not report them as
already absent. Retest the schedule at final release.

For ColorPalette, GradientPicker and DuotonePicker:

| presentation | Keyboard/selection contract |
|---|---|
| listbox (default) | One tab stop, arrows, aria-selected |
| toggle-buttons | Each swatch tabbable, aria-pressed |
| command-buttons | Each swatch tabbable, action without selected state |

Replace `asButtons={true}` with toggle-buttons. False maps to listbox.
Explicit presentation wins if both props are supplied. Loop applies to listbox;
command-buttons fires onChange even for an already identified swatch.

## Font family and menu DOM

FontFamilyControl retains `.block-editor-font-family-control`; use its
`__label` and `__hint` classes. Popup items are portalled outside the root.
Use an option's `className` for whole-item styling; `style` affects its label.

PluginMoreMenuItem, PluginSidebarMoreMenuItem and PluginPreviewMenuItem remain
supported. Their undocumented `as` prop is deprecated/ignored. Query by
accessible name/role and stable integration selectors instead of old generated
component classes.

## Bundled CSS Modules

Rebuild plugin-owned copies using at least these fixed package versions:
ui 0.26.0, dataviews 22.0.0, admin-ui 3.1.0, grid 0.11.0, components 44.0.0,
and build 0.27.0 when compiling CSS Modules. Core's shared handles already carry
its fix. Do not introduce a second copy merely to update a version number.

## Smaller deltas

The deprecated __experimentalImageEditor stylesheet moved from block-library to
block-editor. Advanced-panel custom CSS can now affect child blocks rendered by
their parent. Registry subscriptions for a not-yet-registered store now wait for
that store instead of reacting to every registered store's changes.

## Sources

- [Components](https://make.wordpress.org/core/2026/11/10/editor-components-updates-in-wordpress-7-2/)
- [Menus](https://make.wordpress.org/core/2026/11/11/editor-the-options-and-view-menus-now-use-the-new-menu-component/)
- [CSS Module collision fix](https://make.wordpress.org/core/2026/11/16/update-bundled-wordpress-packages-and-wordpress-build-to-fix-css-module-class-name-collisions/)
- [Miscellaneous editor changes](https://make.wordpress.org/core/2026/11/18/miscellaneous-editor-changes-in-wordpress-7-2/)
