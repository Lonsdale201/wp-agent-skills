---
name: elementor-v3-widget-development
description: >-
  Builds and reviews production-ready classic Elementor widgets based on
  `Elementor\Widget_Base`: companion-plugin bootstrap and compatibility gates,
  `elementor/widgets/register`, widget identity, PHP and editor rendering,
  render attributes, asset dependencies, frontend handlers, accessibility,
  output caching, and regression tests. Use when code extends `Widget_Base`,
  implements `register_controls()` or `render()`, registers an Elementor
  widget/category, or must distinguish the established V3 widget API from
  Atomic Widgets / Editor V4. Does not cover custom control types.
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

# Elementor V3 widget development

Build companion-plugin widgets on Elementor's established `Widget_Base` / `Controls_Stack` architecture. Treat **V3** here as the classic editor/widget model, not as an installed Elementor 3.x version: this API remains available and is used by core widgets in Elementor 4.2.3.

Do not mix this model with Atomic Widgets / Editor V4. Atomic widgets extend classes under `Elementor\Modules\AtomicWidgets`, declare prop types and styles differently, and remain a moving surface. Never translate a V3 control array into an Atomic schema by guesswork.

## When to use this skill

- Create or review a class extending `\Elementor\Widget_Base`.
- Register widgets, categories, scripts, or styles from an Elementor addon.
- Implement `register_controls()`, `render()`, `content_template()`, or `render_plain_content()`.
- Add widget frontend JavaScript through `frontend/element_ready/{widget-name}.default`.
- Decide whether `is_dynamic_content()` may return `false`.
- Diagnose a widget visible in PHP but missing/broken in the editor or frontend.
- Migrate `_register_controls()` or `elementor/widgets/widgets_registered` to current APIs.

For a complete companion-plugin skeleton and test matrix, read `references/widget-contract-and-example.md`. Load **`elementor-v3-widget-controls`** as well when designing or reviewing the control schema.

## Architecture boundary

Use the following identity test before editing:

| Model | Base/signals | This skill |
|---|---|---|
| Classic V3 widget | `Elementor\Widget_Base`, `Controls_Manager`, `register_controls()`, `render()` | In scope |
| Atomic / Editor V4 | `Modules\AtomicWidgets`, `Atomic_Widget_Base`, prop types, Atomic controls/styles | Out of scope |
| Elementor plugin version | `ELEMENTOR_VERSION`, currently 4.2.3 in the tested install | Independent of the model name |

Allow both models to coexist in a plugin only behind separate classes and registration paths. Do not make Atomic feature flags a prerequisite for a classic widget.

## Workflow

### 1. Gate the companion plugin before loading widget classes

1. Declare `Requires Plugins: elementor` in the plugin header on supported WordPress versions.
2. Run compatibility checks after plugins load. Verify `did_action( 'elementor/loaded' )`, `ELEMENTOR_VERSION`, and the addon's actual PHP minimum.
3. Do not include a file that extends `Widget_Base` until Elementor is loaded; otherwise a missing/inactive Elementor causes a fatal before a notice can run.
4. Register callbacks only when requirements pass. Keep Pro optional unless the widget genuinely extends a Pro-only API.

Choose and document a real minimum Elementor version. The modern widget registration contract used here is stable since 3.5.0; a tested-up-to value is not a minimum-version claim.

### 2. Register, do not instantiate early

Hook the manager and pass a widget instance:

```php
add_action(
    'elementor/widgets/register',
    static function ( \Elementor\Widgets_Manager $widgets_manager ): void {
        require_once __DIR__ . '/includes/class-example-widget.php';
        $widgets_manager->register( new Example_Widget() );
    }
);
```

- Use `elementor/widgets/register`; `elementor/widgets/widgets_registered` is deprecated since 3.5.0.
- Give `get_name()` a stable, globally unique, prefixed lowercase identifier. It becomes `widgetType`, is persisted in Elementor JSON, participates in CSS classes, and selects the frontend-ready hook. Renaming it breaks existing content.
- Register an optional category on `elementor/elements/categories_registered` with `$elements_manager->add_category()`. Keep a fallback category such as `general`; a category is organization, not authorization.
- Never unregister or overwrite another widget merely to resolve a name collision.

### 3. Implement the smallest correct widget contract

Implement these methods deliberately:

```php
public function get_name(): string;
public function get_title(): string;
public function get_icon(): string;
public function get_categories(): array;
public function get_keywords(): array;
protected function register_controls(): void;
protected function render(): void;
```

`get_icon()`, categories, and keywords have base defaults, but explicit metadata makes a public widget discoverable and predictable. Translate human-facing strings; do not translate identifiers, control IDs, script handles, or category slugs.

Use `register_controls()`, never deprecated `_register_controls()`. Delegate the control array and value-shape work to **`elementor-v3-widget-controls`**.

### 4. Make PHP rendering canonical and safe

1. Read display values with `$this->get_settings_for_display()`. It applies active-control conditions and dynamic-tag parsing; `get_settings()` is raw saved/default data. Process shortcodes only through an explicit renderer such as `parse_text_editor()` or `do_shortcode()` when the widget intentionally supports them.
2. Validate enumerations again at output time. Saved Elementor JSON, REST/import operations, filters, and dynamic tags can bypass the editor's option list.
3. Escape at the final output context: `esc_html()`, `wp_kses_post()`, `esc_url()`, or an explicit `wp_kses()` allowlist. Control registration is not an output sanitizer.
4. Build attributes through `add_render_attribute()` and `print_render_attribute_string()`. Build URL-control links through `add_link_attributes()`.
5. Use `add_inline_editing_attributes()` only on text nodes intended for editor editing. For repeaters, derive a unique key with `get_repeater_setting_key()`.
6. Return early for empty optional content rather than emitting empty semantic elements.
7. Emit valid semantic HTML and accessible names/states. Do not use a clickable `div` where a button or link is required.

Treat `render()` as the source of truth. Add `content_template()` only when immediate Backbone-based editor preview is worth maintaining, then keep its structure, conditions, attributes, and escaping intent in parity with PHP. Never move authorization or sensitive lookup logic into the JS template.

Override `render_plain_content()` when the default rendered HTML is unsuitable for WordPress search, SEO extraction, feeds, or Elementor deactivation. Return meaningful plain content, a shortcode when appropriate, or an empty string for functionality that must not survive deactivation.

### 5. Register assets once and declare dependencies

Register handles on a WordPress enqueue hook; do not enqueue globally and do not register them on every `render()` call:

```php
add_action( 'wp_enqueue_scripts', static function (): void {
    wp_register_style( 'acme-example-widget', plugins_url( 'assets/widget.css', __FILE__ ), [], '1.0.0' );
    wp_register_script( 'acme-example-widget', plugins_url( 'assets/widget.js', __FILE__ ), [ 'elementor-frontend' ], '1.0.0', true );
} );
```

Return registered handles from `get_style_depends()` / `get_script_depends()`. Elementor then loads them for pages containing the widget, including the preview iframe. Use `elementor/editor/before_enqueue_scripts` or `.../after_enqueue_scripts` only for code that belongs to the editor panel itself.

For interactive widgets, initialize each instance from:

```js
jQuery( window ).on( 'elementor/frontend/init', () => {
    elementorFrontend.hooks.addAction(
        'frontend/element_ready/acme-example.default',
        ( $scope ) => { /* initialize only inside $scope */ }
    );
} );
```

- Make initialization idempotent; editor rerenders can fire the hook repeatedly.
- Scope queries and event teardown to the current `$scope`.
- Use the exact `get_name()` plus `.default`; skins use their own suffix.
- Do not initialize solely on DOM ready: that misses editor rerenders and dynamically inserted elements.

### 6. Decide output caching from runtime behavior

The base returns `true` from `is_dynamic_content()`, so output is not declared cacheable. Override it to `false` **only** when output is stable for all users/requests and fully determined by cache-safe settings/dependencies:

```php
protected function is_dynamic_content(): bool {
    return false;
}
```

Keep the default `true` when rendering depends on the current user, cookies/session, request, time, randomness, stock/entitlement state, uncached remote data, or mutable external state. Elementor separately detects configured dynamic tags, but that does not prove arbitrary PHP logic is static.

For inner-wrapper compatibility and icon rendering, apply **`elementor-experiments-and-markup`**. Do not assume `.elementor-widget-container` exists on core widgets, and render `ICONS` values through `Icons_Manager::render_icon()`.

## Critical rules

- Keep classic V3 and Atomic/V4 classes, controls, styles, and registration paths separate.
- Load a `Widget_Base` subclass only after Elementor is available.
- Use the modern manager hook and a stable, prefixed `get_name()`.
- Treat PHP `render()` as canonical and escape every value for its output context.
- Register asset handles once; let widget dependency methods control loading.
- Initialize frontend JS through the widget-ready hook and make it idempotent.
- Return `false` from `is_dynamic_content()` only after proving cross-user output stability.
- Test both editor preview and published frontend; they exercise different render and asset paths.

## Review checks

- Bootstrap: inactive/old Elementor produces no fatal and a useful admin state.
- Registration: one unique widget appears exactly once in its expected category.
- Persistence: existing instances survive plugin upgrades because names/control IDs remain stable.
- Rendering: empty, default, rich text, link, media, responsive, repeater, and dynamic-tag states are safe.
- Assets: absent on pages without the widget; present once on pages with one or many instances.
- JS: works after editor rerender and does not duplicate listeners.
- Compatibility: free-only and Pro-active installations; optimized markup on/off where relevant.
- Performance: no unbounded query in registration/render and no false static-cache declaration.

## Cross-references

- Run **`elementor-v3-widget-controls`** for built-in control schemas, values, selectors, conditions, and repeaters.
- Run **`elementor-experiments-and-markup`** when rendering icons or depending on wrapper markup.
- Run **`elementor-deprecations`** while upgrading an older addon or reviewing legacy hooks/methods.

## What this skill does NOT cover

- Atomic Widgets / Editor V4 implementation.
- Custom Elementor control classes and control-manager registration.
- Pro-only Forms fields, Theme Builder conditions, nested-element internals, skins, or documents.
- Business-specific authorization, query, REST, or data-storage design beyond the widget boundary.

## References

- Detailed bootstrap, widget example, frontend handler, and test matrix: `references/widget-contract-and-example.md`.
- Official widget documentation: <https://developers.elementor.com/docs/widgets/>
- Official compatibility checks: <https://developers.elementor.com/docs/addons/compatibility/>
- Official widget dependencies: <https://developers.elementor.com/docs/widgets/widget-dependencies/>
- Official output caching: <https://developers.elementor.com/docs/widgets/widget-output-caching/>
- Verified Elementor Free 4.2.3 source paths:
  - `elementor.php`
  - `includes/managers/widgets.php`
  - `includes/managers/elements.php`
  - `includes/base/widget-base.php`
  - `includes/base/element-base.php`
  - `includes/base/controls-stack.php`
  - `includes/widgets/heading.php`
  - `assets/js/frontend.js`
- Atomic/V4 boundary verified in `modules/atomic-widgets/` and `modules/atomic-widgets/elements/base/atomic-widget-base.php`.
