# WordPress 7.1 editor component migration matrix

## 40px form-control rollout

Remove `__next40pxDefaultSize` from these affected component groups and test
their surrounding layouts:

- `@wordpress/components`: `BorderBoxControl`, `BorderControl`, `BoxControl`,
  `ComboboxControl`, `CustomSelectControl`, `FontSizePicker`, `FormFileUpload`,
  `FormTokenField`, `FocalPointPicker`, `InputControl`, `NumberControl`,
  `QueryControls`, `Radio`, `RangeControl`, `SearchControl`, `SelectControl`,
  `TextControl`, `ToggleGroupControl`, `TreeSelect`, and `UnitControl`.
- `@wordpress/block-editor`: `FontAppearanceControl`, `FontFamilyControl`,
  `LetterSpacingControl`, and `LineHeightControl`.

The rollout is for form controls, not `Button`. On `BorderBoxControl`,
`BorderControl`, `FontSizePicker`, and `ToggleGroupControl`, remove a `size`
prop that was used to manipulate the old control height.

## API changes

| Before | WordPress 7.1 action |
|---|---|
| `Navigation` / subcomponents | Redesign with `Navigator` |
| `__experimentalApplyValueToSides` | Plugin-owned side-value logic |
| `<View css={...}>` | `style` or scoped `className` |
| Separate Emotion fragments passed to `cx()` | Compose order-sensitive fragments in one `css()` call |

## Review probes

- No console warning or failed import on the production Core build.
- Controls remain aligned without hard-coded 36px assumptions.
- Focus order and focus return remain correct in `Navigator` screens.
- CSS still wins by intentional specificity/source order, not generated class
  names.
- The bundle externalizes WordPress packages and has accurate `.asset.php`
  dependencies.
- Shell UI works with the always-iframed editor and persistent admin toolbar.

## Primary sources

- <https://make.wordpress.org/core/2026/07/23/editor-components-updates-in-wordpress-7-1/>
- <https://make.wordpress.org/core/2026/07/31/design-system-theming-in-wordpress-7-1/>
- <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>

