---
name: elementor-v3-widget-controls
description: >-
  Designs and reviews built-in controls for classic Elementor
  `Widget_Base` widgets: content/style sections, control value shapes,
  responsive and group controls, CSS selectors, conditions, dynamic tags,
  URL/media/icons values, repeaters, inline editing, and safe PHP rendering.
  Use when code calls `start_controls_section()`, `add_control()`,
  `add_responsive_control()`, `add_group_control()`, creates `Repeater`, uses
  `selectors` or `condition`, or reads `get_settings_for_display()`. Excludes
  custom control classes and Atomic/V4 controls.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "elementor"
  wp-skills-plugin-version-tested: "4.2.3 (free) / 4.2.2 (pro)"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-api-stable-since: "3.5.0"
  wp-skills-last-updated: "2026-08-22"
---

# Elementor V3 widget controls

Build editor panels from Elementor's **built-in classic controls** and couple each saved value to safe, predictable rendering. “V3” means the established `Widget_Base` / `Controls_Stack` model even when the installed plugin is Elementor 4.x. Do not apply these arrays to Atomic Widgets / Editor V4.

This skill does not create custom control types. Prefer a built-in control or a well-defined fallback; a custom-control integration is a separate lifecycle, asset, and compatibility problem.

## When to use this skill

- Add or review `register_controls()` in a `Widget_Base` subclass.
- Choose between regular, responsive, group, repeater, media, URL, or icon controls.
- Use `selectors`, `selectors_dictionary`, `prefix_class`, `condition`, or `conditions`.
- Diagnose a control that saves one shape but `render()` expects another.
- Enable dynamic tags or expose selected settings to widget JavaScript.
- Render repeater rows, responsive values, links, icons, or editor-inline text.
- Audit whether Elementor controls are being mistaken for sanitizers.

Read `references/built-in-controls-and-patterns.md` when implementing value shapes, selector tokens, group controls, repeaters, or a full example. Pair this skill with **`elementor-v3-widget-development`** for bootstrap, registration, assets, caching, and frontend lifecycle.

## Workflow

### 1. Start from output and data shape

Before adding panel fields, write down:

1. The semantic output and accessibility behavior.
2. The exact saved value shape: scalar, compound array, list, or responsive variants.
3. The final output context and validation allowlist.
4. Whether a style can be expressed through Elementor selectors or needs PHP/JS.
5. Whether the value may use a dynamic tag.

Do not choose a control by appearance alone. A `URL`, `MEDIA`, `ICONS`, `SLIDER`, `DIMENSIONS`, and `REPEATER` each returns a structured array, not a string.

### 2. Put controls in explicit sections

Classic widget controls must be inside a section:

```php
$this->start_controls_section(
    'section_content',
    [
        'label' => esc_html__( 'Content', 'acme' ),
        'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
    ]
);

// add_control(), add_responsive_control(), add_group_control()...

$this->end_controls_section();
```

- Use stable, prefixed IDs when collision or future injection is plausible.
- Use `TAB_CONTENT` for data/behavior and `TAB_STYLE` for presentation.
- Do not nest sections; `Controls_Stack` rejects controls outside a section and section misuse can terminate panel construction.
- Keep editor labels/descriptions translated and concise. Never translate IDs, option keys, CSS selectors, or stored values.
- Use headings, separators, popovers, and tabs only to clarify a real grouping.

### 3. Choose the smallest built-in control that matches the value

| Need | Control | Render-time shape/check |
|---|---|---|
| Short plain input | `TEXT`, `NUMBER`, `TEXTAREA` | scalar; validate/escape for use |
| Restricted choice | `SELECT`, `CHOOSE`, `SWITCHER` | scalar; re-check against allowlist |
| Rich content | `WYSIWYG` | string; use an explicit HTML policy |
| Link | `URL` | `url`, `is_external`, `nofollow`, `custom_attributes` |
| Image/file | `MEDIA` | `id`, `url`, `size`; prefer attachment APIs when ID exists |
| Icon | `ICONS` | `value`, `library`; render via `Icons_Manager` |
| Size | `SLIDER` | `size`, `unit`, optionally `sizes` |
| Box values | `DIMENSIONS` | `top/right/bottom/left/unit/isLinked` |
| Multiple images | `GALLERY` | list of attachment-like arrays |
| Repeated rows | `REPEATER` | list of row maps, each with stable `_id` |

Use `RAW_HTML`, `HEADING`, `DIVIDER`, and `POPOVER_TOGGLE` as panel UI, not as content storage. Do not put secrets or authorization state in any control: Elementor document settings are content data, not a confidential store.

### 4. Use display settings for rendering

```php
$settings = $this->get_settings_for_display();
```

This returns active settings after conditions and dynamic-tag parsing. It does not grant permission to run arbitrary shortcodes; process shortcodes only through an explicit, intentional renderer. Use raw `$this->get_settings()` only for a specifically documented need such as inspecting stored configuration before dynamic resolution.

Control definitions do **not** establish a security boundary:

- A `SELECT` option list does not prevent an imported/filtered/database value outside the list.
- A numeric UI range does not prove the saved value is in range.
- Dynamic tags can replace a value at display time.
- A conditional hidden control may still exist in raw document data; the display value can be `null` when inactive.

Validate allowed HTML tags, element names, CSS classes, IDs, numbers, URLs, attachment visibility, and business permissions in the code that consumes them. Escape at final output.

### 5. Let selectors handle deterministic styles

Use `selectors` for styles fully derived from a control:

```php
$this->add_responsive_control(
    'gap',
    [
        'label'      => esc_html__( 'Gap', 'acme' ),
        'type'       => \Elementor\Controls_Manager::SLIDER,
        'size_units' => [ 'px', 'em', 'rem' ],
        'range'      => [ 'px' => [ 'min' => 0, 'max' => 100 ] ],
        'selectors'  => [
            '{{WRAPPER}} .acme-card__list' => 'gap: {{SIZE}}{{UNIT}};',
        ],
    ]
);
```

- Anchor selectors at `{{WRAPPER}}` to prevent cross-widget leakage.
- Use `{{VALUE}}`, `{{SIZE}}`, and `{{UNIT}}` only where the chosen control supplies them.
- Use `selectors_dictionary` to map stored choices to CSS values instead of embedding arbitrary CSS.
- Use `{{CURRENT_ITEM}}` for per-row repeater styling.
- Prefer `add_responsive_control()` only when per-device values make sense; do not manually guess generated breakpoint suffixes.
- Use `prefix_class` only with a tight option allowlist and a namespaced prefix.

Selector output is presentation, not permission enforcement or server-side validation. Do not interpolate arbitrary editor text into property names, selectors, at-rules, or unrestricted declarations.

### 6. Use conditions as editor UX, not runtime authorization

Simple equality/membership belongs in `condition`; compound logic belongs in `conditions`:

```php
'condition' => [ 'show_icon' => 'yes' ],

'conditions' => [
    'relation' => 'or',
    'terms'    => [
        [ 'name' => 'columns', 'operator' => '>', 'value' => 1 ],
        [ 'name' => 'columns', 'operator' => '===', 'value' => '' ],
    ],
],
```

Use supported operators only. Conditions change panel visibility and active settings; they do not authorize output or delete stored values. Inside a repeater, an inner field may depend on another field in the same row. Do not make an inner field depend on an outer/main control; Elementor documents that cross-level dependency as unsupported.

### 7. Prefer group controls for coherent CSS features

Use `add_group_control()` with official types such as Typography, Background, Border, Box Shadow, Text Shadow, Text Stroke, CSS Filter, or Image Size. Give each group a unique `name` and its target `selector`.

Do not manually recreate the group's internal control IDs or read guessed keys. Let the group generate selectors, or use its documented renderer/helper (for example image-size output) where required.

### 8. Render repeaters with stable keys

Create fields with `new \Elementor\Repeater()` and pass `$repeater->get_controls()` to a `REPEATER` control. `get_fields()` is deprecated.

At render time:

1. Confirm the setting is an array.
2. Validate each row field independently.
3. Build a unique attribute/link key per row with `get_repeater_setting_key()` or a namespaced index key.
4. Use the row `_id`/`{{CURRENT_ITEM}}` contract for row-specific styling; do not use array order as a persistent identity.
5. Bound any query or remote work driven by rows; avoid N+1 lookups.

For large remote/post/product/user datasets, do not preload thousands of `SELECT2` options. Apply **`elementor-dynamic-tag-ajax-select`** for the Pro AJAX Query Control plus a free-safe manual-ID fallback.

### 9. Expose only intentional frontend settings

`frontend_available => true` makes a control available to frontend handlers; it is not a secure transport. Expose only values required by JS, never secrets, nonces intended for another action, capability decisions, private IDs, or raw privileged data. Re-authorize every server request made by the handler.

## Critical rules

- Keep classic control arrays out of Atomic/V4 classes.
- Put widget controls inside balanced sections; do not nest sections.
- Match the render code to the control's actual scalar/compound/list value shape.
- Use `get_settings_for_display()` for normal rendering and handle inactive `null` values.
- Treat every setting as untrusted at output, including select values and dynamic tags.
- Anchor style selectors at `{{WRAPPER}}` and whitelist class/tag/CSS choices.
- Treat conditions as panel UX, never authorization.
- Use `get_controls()` for repeater fields and stable per-row render keys.
- Render URL, media, and icon values through their dedicated APIs.
- Keep large datasets asynchronous or use a bounded manual-ID fallback.

## Review checks

- Every control is in the right tab/section and has a stable unique ID.
- Defaults match the control's real value shape and render assumptions.
- Responsive settings are not read as one unsuffixed scalar in custom PHP/JS logic.
- Selector placeholders match the control shape and remain wrapper-scoped.
- Conditions reference controls at a supported scope and inactive values are handled.
- Dynamic-tag eligibility matches the semantic value type.
- Output validation/escaping exists independently of the editor UI.
- Repeaters have bounded work, stable keys, safe empty state, and no N+1 query.
- `frontend_available` reveals no sensitive data.
- Style-control tests account for Elementor's optimized split stack; query a known control by ID instead of treating a context-dependent bulk `get_controls()` list as complete.

## Cross-references

- Run **`elementor-v3-widget-development`** for addon bootstrap, widget registration, rendering, assets, JS lifecycle, and caching.
- Run **`elementor-dynamic-tag-ajax-select`** for large dataset selectors and Pro/free degradation.
- Run **`elementor-experiments-and-markup`** for `ICONS` output and optimized wrapper behavior.

## What this skill does NOT cover

- Creating or registering a custom Elementor control class.
- Atomic Widgets / Editor V4 prop types, controls, or style schema.
- Pro Forms fields, nested elements, skins, documents, or Theme Builder controls.
- Generic WordPress form processing, persistence, REST authorization, or business rules.

## References

- Built-in control catalog, value shapes, group controls, selectors, repeater pattern, and escaping matrix: `references/built-in-controls-and-patterns.md`.
- Official editor controls documentation: <https://developers.elementor.com/docs/editor-controls/>
- Official conditional display documentation: <https://developers.elementor.com/docs/editor-controls/conditional-display/>
- Official repeater control documentation: <https://developers.elementor.com/docs/editor-controls/control-repeater/>
- Official widget rendering documentation: <https://developers.elementor.com/docs/widgets/>
- Verified Elementor Free 4.2.3 source paths:
  - `includes/managers/controls.php`
  - `includes/base/controls-stack.php`
  - `includes/controls/`
  - `includes/controls/groups/`
  - `includes/elements/repeater.php`
  - `includes/base/element-base.php`
  - `includes/base/widget-base.php`
  - `includes/widgets/heading.php`
  - `includes/widgets/icon-list.php`
