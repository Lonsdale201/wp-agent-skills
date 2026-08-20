---
name: block-theme-global-styles
description: Build and audit WordPress 7.1 block-theme Global Styles and theme.json. Covers schema version 3, responsive mobile/tablet viewport states, block and element pseudo-states, Navigation Link current-state styles, style variations, CSS generation, background gradients, minimum width, text shadow, block visibility controls, validation, sanitization, cascade behavior, and editor/front-end parity. Use when creating or reviewing a block theme, theme.json, Global Styles variation, responsive block styling, or WordPress 7.1 design controls.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-19"
---

# Block Theme Global Styles

Use `theme.json` as structured design data, not as a place to paste arbitrary CSS. WordPress merges core defaults, theme data, child-theme data, user Global Styles, and block-level styles; verify both editor and front-end output after every structural change.

## Start with the supported schema

WordPress 7.1 still uses theme.json schema version `3`:

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {},
  "styles": {}
}
```

Use the trunk schema while developing against the current WordPress release, and validate the file as JSON. The schema version and WordPress release number are separate concepts; do not write `"version": 7.1`.

## Model responsive styles as states

WordPress 7.1 introduces global `settings.viewport` breakpoints and `@mobile` / `@tablet` style-state nodes:

```json
{
  "version": 3,
  "settings": {
    "viewport": {
      "mobile": "480px",
      "tablet": "782px"
    }
  },
  "styles": {
    "blocks": {
      "core/group": {
        "spacing": { "padding": { "left": "3rem", "right": "3rem" } },
        "@tablet": {
          "spacing": { "padding": { "left": "2rem", "right": "2rem" } }
        },
        "@mobile": {
          "spacing": { "padding": { "left": "1rem", "right": "1rem" } }
        }
      }
    }
  }
}
```

The default breakpoints are `480px` and `782px`. With both present:

- `@mobile` means `width <= mobile`;
- `@tablet` means `mobile < width <= tablet`;
- base styles remain the desktop/default layer.

Only non-negative numeric `px`, `em`, and `rem` values are accepted (the core
regular expression also accepts zero). Percentages, CSS functions, variables,
unsupported keys, and non-string values are discarded. If no custom value is
valid, core restores both defaults. If tablet is not larger than mobile, tablet
is omitted. A single valid breakpoint gets one max-width query rather than
being merged with a missing default.

Viewport settings are global-only; do not put `settings.viewport` below an individual block. Responsive state styles can appear on blocks, their elements, and registered block style variations. Read [references/theme-json-71.md](references/theme-json-71.md) before designing nested state structures.

To remove only the 7.1 responsive-editing controls from the editor, filter
`block_editor_settings_all` and set `responsiveEditingEnabled` to `false`.
This hides the responsive-style entry points; it does not delete saved states,
stop their CSS from rendering, or disable device previews. Treat it as editor
policy, not a content restriction.

## Use only supported style states

Element states remain under an element:

```json
{
  "styles": {
    "elements": {
      "link": {
        ":hover": { "color": { "text": "var:preset|color|contrast" } },
        "@mobile": { "typography": { "textDecoration": "underline" } }
      }
    }
  }
}
```

WordPress accepts block pseudo-states only for block types on its allowlist. In WordPress 7.1 these are `core/button` and `core/navigation-link`, with `:hover`, `:focus`, `:focus-visible`, and `:active`.

The new `-current` custom state is restricted to `core/navigation-link` and maps to that block's registered current-menu selector:

```json
{
  "styles": {
    "blocks": {
      "core/navigation-link": {
        "-current": {
          "typography": { "fontWeight": "700" },
          ":hover": { "typography": { "textDecoration": "underline" } }
        }
      }
    }
  }
}
```

Do not invent state keys or assume a third-party block's `selectors.states` makes it valid in Global Styles. WordPress 7.1 validates custom block states against a core allowlist; unsupported nodes are removed during theme.json processing.

## Adopt new supports without confusing settings and values

WordPress 7.1 adds these relevant design capabilities:

- `settings.background.gradient`: exposes the new background-gradient support for blocks that declare it;
- `settings.dimensions.minWidth`: enables minimum-width support where the block declares it;
- `settings.blockVisibility.allowEditing`: controls whether editors may change block visibility;
- `styles.*.typography.textShadow`: supplies a CSS text-shadow value through theme.json.

Support flags enable controls; actual values belong under `styles` or per-block attributes. Example:

```json
{
  "version": 3,
  "settings": {
    "background": { "gradient": true },
    "dimensions": { "minWidth": true },
    "blockVisibility": { "allowEditing": true }
  },
  "styles": {
    "blocks": {
      "core/group": {
        "background": {
          "gradient": "linear-gradient(135deg, #111 0%, #444 100%)"
        },
        "dimensions": { "minWidth": "18rem" }
      },
      "core/heading": {
        "typography": { "textShadow": "0 1px 2px rgb(0 0 0 / 0.25)" }
      }
    }
  }
}
```

`background.gradient` is different from the older color-gradient preset system. When the new background-gradient value is set, it owns the background-image output; image and gradient values may also be combined by core. Test KSES filtering of any value built from dynamic input.

## Respect merge order and the cascade

- Base styles and responsive styles coexist; a breakpoint does not replace the complete block style object.
- User Global Styles can override theme values. Test with and without user customizations.
- Responsive pseudo-state CSS is emitted late enough to win against the equivalent base pseudo-state, but higher-specificity plugin/theme CSS can still win.
- WordPress 7.1 wraps block-level preset selectors in `:where()`, lowering
  their specificity to the same `0-1-0` as root preset classes. Audit custom
  `!important` CSS that relied on the old block selector winning a tie.
- Style variations can contain responsive states, elements, and inner block styles, but nested variations are not valid.
- Never depend on private editor settings or generated class-name details when the public theme.json structure is sufficient.

Template Parts use content-only editing by default. A theme or plugin can set
`disableContentOnlyForTemplateParts` through `block_editor_settings_all` to
restore standard block editing, but template-locked rendering overrides that
choice. Treat this as editor UX policy, not a content-security control.

## Validate behavior, not just JSON syntax

1. Validate JSON and the theme.json schema.
2. Load the parsed data through `WP_Theme_JSON` or `WP_Theme_JSON_Resolver` and inspect what survives sanitization.
3. Inspect generated CSS for desktop, mobile, tablet, pseudo-state, and custom-state rules.
4. Compare the Site Editor canvas and the front end at boundary widths.
5. Test child-theme and user Global Styles overrides.
6. Confirm keyboard focus, current-navigation indication, contrast, and reduced-motion behavior independently of visual hover styles.

Do not use responsive styling to hide security-sensitive content. CSS and block visibility are presentation controls, not authorization.

## Related skills

- Use `wp-block-editor-iframe-compatibility` when editor assets or DOM code must work inside the editor canvas iframe.
- Use `wp-block-registration-and-assets` for server/client block registration and asset handles.
- Use `classic-theme-assets-build` only for classic-theme asset pipelines; it does not replace theme.json validation.

## References

- Responsive styles and viewports: <https://make.wordpress.org/core/2026/08/05/responsive-block-styles-and-configurable-viewports-in-wordpress-7-1/>
- Pseudo and custom states: <https://make.wordpress.org/core/2026/08/05/pseudo-and-custom-style-states-in-wordpress-7-1/>
- Miscellaneous editor changes: <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
