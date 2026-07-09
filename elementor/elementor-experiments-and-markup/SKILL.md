---
name: elementor-experiments-and-markup
description: Design Elementor addons / widgets / dynamic tags to survive
  Elementor's two markup-changing STABLE "Performance" experiments — both
  default-ON on new installs, so never assume they are off; detect at
  runtime with Plugin::$instance->experiments->is_feature_active('name').
  Optimized Markup (e_optimized_markup) drops the
  .elementor-widget-container inner wrapper — the contract is
  Element_Base::has_widget_inner_wrapper() (default true); your widget
  keeps its wrapper unless you override it, but CSS / JS targeting CORE
  widgets' wrapper breaks when it is on. Inline Font Icons
  (e_font_icon_svg) renders icons as inline SVG and does NOT load Font
  Awesome CSS — always render icons via Icons_Manager::render_icon(),
  never hardcode an i-tag; it looks fine in the editor but breaks on the
  frontend. Use when building / reviewing a widget or addon that renders
  icons or reads the DOM.
  Triggers on is_feature_active, e_optimized_markup, e_font_icon_svg,
  has_widget_inner_wrapper, Icons_Manager render_icon, Optimized Markup.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elementor
plugin-version-tested: "4.1.4 (free) / 4.1.2 (pro)"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://developers.elementor.com/docs/
  - https://go.elementor.com/wp-dash-inline-font-awesome/
  - https://go.elementor.com/wp-dash-flex-container/
source-refs:
  - wp-content/plugins/elementor/core/experiments/manager.php
  - wp-content/plugins/elementor/includes/base/element-base.php
  - wp-content/plugins/elementor/includes/base/widget-base.php
  - wp-content/plugins/elementor/includes/managers/icons.php
  - wp-content/plugins/elementor/includes/widgets/button.php
  - wp-content/plugins/elementor-pro/modules/forms/widgets/form.php
---

# Elementor: experiments and markup-changing features

For developers shipping a companion plugin / theme that adds **widgets, dynamic tags, or frontend CSS/JS** on top of Elementor. Elementor ships "experiments" (feature flags) under `core/experiments/manager.php`. Most are cosmetic, but two **Performance** experiments **change the rendered HTML** and are **default-ON on new installs**, so a modern addon must handle them or it silently breaks on a large share of sites.

## Read this first — you cannot assume the state

Experiment state is per-site and three-valued (Default / Active / Inactive), and the effective default differs between fresh and upgraded installs. **Never hardcode an assumption; detect at runtime:**

```php
if ( \Elementor\Plugin::$instance->experiments->is_feature_active( 'e_optimized_markup' ) ) {
    // adapt markup
}
```

Verified: `Experiments\Manager::is_feature_active( $name, $check_dependencies = false )` at [core/experiments/manager.php:257](manager.php); actual state resolves to the user's explicit `state` unless it's `Default`, then the feature's `default` ([manager.php](manager.php) `get_feature_actual_state`).

The two markup-changing experiments (both `release_status => STABLE`, tag "Performance", `new_site.default_active => true`) — verified [manager.php:312-381](manager.php):

| Experiment | `name` | Default on NEW install (≥ ver) | What it changes |
|---|---|---|---|
| **Inline Font Icons** | `e_font_icon_svg` | ON (≥ 3.17.0) | Icons render as inline `<svg>`; Font Awesome + eicons CSS/fonts NOT loaded on frontend |
| **Optimized Markup** | `e_optimized_markup` | ON (≥ 3.30.0) | Removes inner wrapper HTML (`.elementor-widget-container`) from widgets to shrink the DOM |

> `new_site.default_active => true` means a site first installed at/after that version defaults the experiment ON. Sites upgraded from older versions may keep it OFF (`e_optimized_markup` / `container` have `default => STATE_INACTIVE`). So the SAME addon meets both states in the wild — which is exactly why you detect at runtime.

## Misconception this skill corrects

> "My widget's icons render fine in the Elementor editor, so my icon markup is correct."

The editor/preview is misleading. `Icons_Manager` only switches to inline SVG **when not in edit/preview mode** — verified [includes/managers/icons.php:186](icons.php) (`is_font_icon_inline_svg() && ! is_edit_mode() && ! is_preview_mode()`). So with Inline Font Icons ON, the editor still loads the icon **fonts** and hardcoded `<i class="fas fa-star">` looks correct there — but on the **frontend** the Font Awesome CSS is absent and your hardcoded icon renders as an empty/broken glyph. Always test on the published frontend, and always emit icons through `Icons_Manager::render_icon()`.

## When to use this skill

- Building or reviewing a **custom widget** (its `render()` markup, wrapper structure, or icon output).
- Shipping **frontend CSS/JS** that targets Elementor's DOM (`.elementor-widget-container`, widget inner structure).
- Any addon that renders icons chosen via the `ICONS` control.
- Diagnosing "works on my site, breaks on the client's" icon/layout bugs — usually an experiment default difference.
- The diff references `is_feature_active`, `has_widget_inner_wrapper`, `Icons_Manager`, `e_optimized_markup`, or `e_font_icon_svg`.

## Optimized Markup (`e_optimized_markup`)

The wrapper contract lives on the element base. `Element_Base::has_widget_inner_wrapper()` returns **`true` by default** — verified [includes/base/element-base.php:1588](element-base.php). `Widget_Base::render()` prints the `<div class="elementor-widget-container">` **only when that method returns true** ([includes/base/widget-base.php:427](widget-base.php)), and the widget's frontend script-dependency group flips `common` → `common-optimized` based on it ([widget-base.php:201](widget-base.php)).

Core widgets opt IN to the DOM reduction by overriding it — the canonical one-liner, e.g. [includes/widgets/button.php:85](button.php) and Pro's [modules/forms/widgets/form.php:45](form.php):

```php
public function has_widget_inner_wrapper(): bool {
    return ! \Elementor\Plugin::$instance->experiments->is_feature_active( 'e_optimized_markup' );
}
```

What this means for YOUR addon:

- **Your widget does NOT break by default.** Since the base returns `true`, a widget that doesn't override the method keeps its `.elementor-widget-container` even when Optimized Markup is on. No action needed for correctness.
- **Your CSS/JS targeting CORE (and Pro) widgets DOES break** when Optimized Markup is on, because those widgets drop the wrapper. A selector like `.elementor-widget-heading .elementor-widget-container h2 {}` stops matching; `el.querySelector('.elementor-widget-container')` returns `null`. Target the widget wrapper (`.elementor-widget-{name}` / `.elementor-element`) or the content element directly, not the inner container.
- **To let your widget participate** in the DOM reduction, override `has_widget_inner_wrapper()` with the same one-liner — then make sure your own styles/scripts don't depend on `.elementor-widget-container`, and register a `-optimized`-aware style if needed.

## Inline Font Icons (`e_font_icon_svg`)

When active on the frontend, `Icons_Manager::render_font_icon()` resolves the icon to an inline `<svg>` via the SVG data manager and returns it; otherwise it falls back to `<i class="{icon value}">` which needs the font CSS — verified [includes/managers/icons.php:309-341](icons.php). The single rule:

```php
// RIGHT — works in BOTH modes; emits <svg> when the experiment is on, <i> otherwise
\Elementor\Icons_Manager::render_icon(
    $settings['my_icon'],           // the ICONS control value: [ 'value' => ..., 'library' => ... ]
    [ 'aria-hidden' => 'true' ],
    'i'                             // wrapping tag; ignored for uploaded-SVG
);
```

- `render_icon()` ([icons.php:354](icons.php)) → `get_icon_html()` ([icons.php:67](icons.php)) handles uploaded SVGs (`library === 'svg'`) AND font icons transparently. Use it for every icon your widget outputs.
- **Do NOT hardcode `<i class="fas fa-...">`** or manually enqueue Font Awesome expecting it to be present — with the experiment on, Elementor deliberately does not load FA/eicons CSS on the frontend, so hardcoded markup renders broken.
- If you genuinely need the font CSS (rare, legacy markup you can't convert), `Icons_Manager::enqueue_shim()` exists, but the right fix is to route through `render_icon()`.
- This experiment sets `generator_tag => true`, so its state is also observable in the `<meta name="generator">` Elementor emits — handy for support triage.

## Registering your OWN experiment (optional)

Addons can register experiments on the same system via the `elementor/experiments/default-features-registered` action — verified [core/experiments/manager.php:433](manager.php). Allowed `add_feature()` option keys ([manager.php:1049](manager.php)): `name`, `title`, `tag`, `tags`, `description`, `release_status`, `default`, `mutable`, `hidden`, `new_site`, `on_state_change`, `dependencies`, `generator_tag`, `messages`, `deprecated`.

```php
add_action( 'elementor/experiments/default-features-registered', function ( $experiments ): void {
    $experiments->add_feature( [
        'name'           => 'myplugin_new_renderer',
        'title'          => esc_html__( 'My Plugin: New Renderer', 'myplugin' ),
        'release_status' => \Elementor\Core\Experiments\Manager::RELEASE_STATUS_BETA,
        'default'        => \Elementor\Core\Experiments\Manager::STATE_INACTIVE,
    ] );
} );

// then gate behavior:
if ( \Elementor\Plugin::$instance->experiments->is_feature_active( 'myplugin_new_renderer' ) ) { /* ... */ }
```

## Critical rules

- **Detect, never assume.** `Plugin::$instance->experiments->is_feature_active( $name )` — the effective default differs between fresh and upgraded installs.
- **Both markup experiments are STABLE and default-ON on new installs** — treat "on" as the common case, not an edge case.
- **Icons: always `Icons_Manager::render_icon()`.** Never hardcode `<i class="fa">`; the editor hides the breakage because it still loads fonts in edit/preview mode.
- **Optimized Markup: your widget keeps its wrapper by default** (base returns `true`), so it won't break — but your **CSS/JS against core/Pro widgets' `.elementor-widget-container` will**. Don't target the inner container.
- **To opt your widget into DOM reduction**, override `has_widget_inner_wrapper()` with the core one-liner, and make your own styles wrapper-independent.
- **Don't fight the experiment** by force-enqueuing Font Awesome or re-adding wrappers globally — you reintroduce the DOM/asset cost the site owner opted out of and cause the exact third-party conflicts the experiment warns about.

## Common mistakes

```php
// WRONG — hardcoded font icon; broken on frontend when e_font_icon_svg is on
echo '<i class="fas fa-star"></i>';

// RIGHT — routes through the manager, SVG or font as appropriate
\Elementor\Icons_Manager::render_icon( $settings['star_icon'], [ 'aria-hidden' => 'true' ] );

// WRONG — CSS assumes the inner container always exists
// .my-addon .elementor-widget-button .elementor-widget-container { gap: 8px; }
//   → no match when Optimized Markup drops the wrapper on the core Button widget

// RIGHT — target the widget/element wrapper or the content node
// .my-addon .elementor-widget-button .elementor-button { gap: 8px; }

// WRONG — JS that expects the wrapper on a core widget
// const c = widgetEl.querySelector('.elementor-widget-container'); c.dataset.x = 1; // c is null

// RIGHT — guard / target a stable node
// const c = widgetEl.querySelector('.elementor-widget-container') || widgetEl;

// WRONG — assuming your custom widget lost its wrapper (it didn't; base returns true)
// ...adding a second wrapper "to be safe" → double nesting

// RIGHT — override only if you WANT the reduction, mirroring core
public function has_widget_inner_wrapper(): bool {
    return ! \Elementor\Plugin::$instance->experiments->is_feature_active( 'e_optimized_markup' );
}
```

## Cross-references

- Run **`elementor-dynamic-tag-register`** / **`elementor-dynamic-tag-fields`** when the work is registering a dynamic tag; if the tag outputs an icon, the Inline Font Icons rule here applies.
- Run **`elementor-dynamic-tag-ajax-select`** for large-dataset controls (unrelated to markup, but same addon surface).
- Run **`elementor-deprecations`** when a markup/API change you rely on may be deprecated — the `has_widget_inner_wrapper` / `Icons_Manager` APIs are current, but audit before bumping Elementor majors.

## What this skill does NOT cover

- **Atomic Widgets / Editor V4** (`e_atomic_elements`, Pro `AtomicWidgetsModule::EXPERIMENT_NAME`, `e_pro_atomic_form`, `collection-loop`) — a much larger architectural shift (new widget base, styles engine, schema) that deserves its own skill. This skill is only the two STABLE markup-changing performance experiments plus the experiments mechanics.
- **Flexbox/Grid Container** (`container`) beyond noting it's still an experiment — layout authoring, not addon-markup contract.
- **The editor-JS side** of experiments (React panels, `elementorCommon.config.experimentalFeatures`).
- **Elementor's own internal widget CSS** — you adapt to it, you don't edit it.

## References

- Experiments manager + `is_feature_active`: [core/experiments/manager.php:257](manager.php); registered features [manager.php:311-391](manager.php); extension action `elementor/experiments/default-features-registered` [manager.php:433](manager.php); `add_feature` allowed keys [manager.php:1049](manager.php).
- `has_widget_inner_wrapper()` default `true`: [includes/base/element-base.php:1588](element-base.php); wrapper print + script group: [includes/base/widget-base.php:201,427](widget-base.php).
- Core override example: [includes/widgets/button.php:85](button.php); Pro override example: [elementor-pro/modules/forms/widgets/form.php:45](form.php).
- Icons manager: inline-SVG gate [includes/managers/icons.php:186,258](icons.php); `render_icon` [icons.php:354](icons.php); `get_icon_html` [icons.php:67](icons.php); `render_font_icon` (SVG vs `<i>`) [icons.php:309](icons.php); `enqueue_shim` [icons.php:206](icons.php).
