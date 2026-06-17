---
name: elementor-dynamic-tag-fields
description: Build the body of an Elementor Dynamic Tag — choose Tag
  (echoes via render(), content_type 'ui') vs Data_Tag (returns a
  value via get_value(), content_type 'plain'); declare what kind of
  value it produces via get_categories() using the Module constants
  (TEXT_CATEGORY, URL_CATEGORY, IMAGE_CATEGORY, MEDIA_CATEGORY,
  POST_META_CATEGORY, GALLERY_CATEGORY, NUMBER_CATEGORY, COLOR_CATEGORY,
  DATETIME_CATEGORY, SVG_CATEGORY); add settings fields in
  register_controls() (NOT the deprecated _register_controls()) with
  Controls_Manager types (TEXT, NUMBER, SELECT, SELECT2, SWITCHER,
  MEDIA, …); and wire the fallback system. Important — a Tag gets
  Before / After / Fallback controls automatically and applies the
  fallback when render() outputs empty, but a Data_Tag gets NONE of
  that and must register its own fallback control and consult it in
  get_value(). Use when implementing or reviewing a dynamic tag's
  render/get_value, controls, categories, or fallback behaviour.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elementor
plugin-version-tested: "4.0.7 (free) / 4.0.4 (pro)"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://developers.elementor.com/docs/dynamic-tags/
  - https://developers.elementor.com/docs/dynamic-tags/dynamic-tag-data/
source-refs:
  - wp-content/plugins/elementor/core/dynamic-tags/tag.php
  - wp-content/plugins/elementor/core/dynamic-tags/data-tag.php
  - wp-content/plugins/elementor/core/dynamic-tags/base-tag.php
  - wp-content/plugins/elementor/modules/dynamic-tags/module.php
  - wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/post-featured-image.php
  - wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/post-custom-field.php
---

# Elementor: Dynamic Tag types, fields & fallback

The body of a dynamic tag has three decisions: **which base class** (`Tag` vs `Data_Tag`), **which categories** it produces (so the right controls accept it), and **which settings fields** the editor shows. Plus the easily-missed **fallback** asymmetry between the two base classes. This skill assumes the tag is already being registered — see `elementor-dynamic-tag-register` for that.

## Decision 1 — `Tag` vs `Data_Tag`

| | `Tag` | `Data_Tag` |
|---|---|---|
| Extend | `\Elementor\Core\DynamicTags\Tag` | `\Elementor\Core\DynamicTags\Data_Tag` |
| You implement | `render()` — **echo** the output | `get_value( array $options = [] )` — **return** the value |
| `get_content_type()` | `'ui'` (final) | `'plain'` (final) |
| Use for | rendered text/HTML fragments (price, reading time, a badge) | structured values consumed by a control — an image array `[ 'id' => …, 'url' => … ]`, a URL string, a color |

Verified: `Tag::get_content()` does `ob_start(); $this->render(); $value = ob_get_clean();` ([tag.php:30-37](tag.php)) and `get_content_type()` returns `'ui'` ([tag.php:64](tag.php)). `Data_Tag` declares `abstract protected function get_value()` ([data-tag.php:25](data-tag.php)), returns it directly from `get_content()` ([data-tag.php:43-45](data-tag.php)), and `get_content_type()` returns `'plain'` ([data-tag.php:31](data-tag.php)).

Rule of thumb: if the value feeds a **MEDIA / IMAGE / URL / COLOR** control (the control needs a structured value, not printed markup), use `Data_Tag`. If it feeds a **TEXT** context (it's printed inline), use `Tag`.

```php
// Tag — echoes
class Reading_Time extends Tag {
    public function render(): void {
        echo esc_html( $this->compute() . ' min' );   // print, don't return
    }
}

// Data_Tag — returns
class Featured_Image_Fallback extends Data_Tag {
    protected function get_value( array $options = [] ) {
        $id = get_post_thumbnail_id();
        if ( $id ) {
            return [ 'id' => $id, 'url' => wp_get_attachment_image_src( $id, 'full' )[0] ];
        }
        return $this->get_settings( 'fallback' );   // see "Fallback" below
    }
}
```

## Decision 2 — categories (what value the tag produces)

`get_categories()` returns one or more **category constants** from `Elementor\Modules\DynamicTags\Module`. Categories declare the *kind* of value the tag emits; a control accepts a tag only when their categories overlap, so the editor shows your tag only under compatible controls.

Verified constants ([modules/dynamic-tags/module.php:31-76](module.php)):

| Constant | Value | Typical use |
|---|---|---|
| `TEXT_CATEGORY` | `'text'` | printed strings (most `Tag`s) |
| `URL_CATEGORY` | `'url'` | link fields |
| `IMAGE_CATEGORY` | `'image'` | image controls |
| `MEDIA_CATEGORY` | `'media'` | media (image/video) controls |
| `POST_META_CATEGORY` | `'post_meta'` | meta-field contexts |
| `GALLERY_CATEGORY` | `'gallery'` | gallery controls |
| `NUMBER_CATEGORY` | `'number'` | number controls |
| `COLOR_CATEGORY` | `'color'` | color controls |
| `DATETIME_CATEGORY` | `'datetime'` | date/time controls |
| `SVG_CATEGORY` | `'svg'` | inline-SVG / icon controls |

A tag may declare several — Pro's `Post_Custom_Field` returns `[ TEXT, URL, POST_META, COLOR, DATETIME, MEDIA ]` because a meta value can drive any of those controls. Reference the constant, never the bare string, so a renamed value can't break you.

```php
use Elementor\Modules\DynamicTags\Module as TagsModule;

public function get_categories(): array {
    return [ TagsModule::TEXT_CATEGORY ];
}
```

## Decision 3 — settings fields via `register_controls()`

Add the tag's configuration fields in `register_controls()`. Elementor has **already opened a "Settings" controls section** around your call ([base-tag.php:175-187](base-tag.php)) — add controls directly; do **not** wrap them in your own `start_controls_section()`.

```php
use Elementor\Controls_Manager;

protected function register_controls(): void {
    $this->add_control( 'format', [
        'label'   => esc_html__( 'Format', 'myplugin' ),
        'type'    => Controls_Manager::SELECT,
        'default' => 'minutes',
        'options' => [
            'minutes' => esc_html__( 'Minutes', 'myplugin' ),
            'words'   => esc_html__( 'Word count', 'myplugin' ),
        ],
    ] );

    $this->add_control( 'wpm', [
        'label'   => esc_html__( 'Words / minute', 'myplugin' ),
        'type'    => Controls_Manager::NUMBER,
        'default' => 200,
        'min'     => 50,
    ] );
}
```

Common control `type`s (from `Elementor\Controls_Manager`, all seen in verified tags/widgets): `TEXT`, `TEXTAREA`, `NUMBER`, `SELECT`, `SELECT2` (add `'multiple' => true` for multi), `SWITCHER`, `CHOOSE`, `COLOR`, `MEDIA`, `ICONS`, `ALERT`, `REPEATER`. Read settings back with `$this->get_settings( 'key' )` (raw) or `$this->get_settings_for_display()` (parsed). For a large-dataset picker (products/posts) use the AJAX query control — see `elementor-dynamic-tag-ajax-select`; a plain `SELECT2` preloaded with thousands of options freezes the editor.

**Name your method `register_controls()`, not `_register_controls()`.** The underscore form is deprecated since 3.1.0 — `init_controls()` calls it but emits a `_doing_it_wrong` notice ([base-tag.php:179-182](base-tag.php)). (The reference plugin used the underscore form until its 2026-06-17 migration; older copies and tutorials still show it, so recognise it but don't copy it.)

Two optional panel hints on `Base_Tag`:

- `is_settings_required()` — return `true` if the tag is useless until configured (Pro's `Post_Custom_Field` does). Default `false` ([base-tag.php:83](base-tag.php)).
- `get_panel_template_setting_key()` — return a control key to surface in the tag's panel label (e.g. `'key'`). Default `''` ([base-tag.php:75](base-tag.php)).

## The fallback system (the asymmetry that bites)

A `Tag` gets **Before / After / Fallback** controls **for free** and applies the fallback automatically when `render()` produces empty output. A `Data_Tag` gets **none of this** and must do it by hand.

### `Tag` — automatic

`Tag::register_advanced_section()` adds an "Advanced" section with `before`, `after`, and `fallback` controls ([tag.php:84-123](tag.php)), and `get_content()` applies them: if the rendered value is non-empty it prepends `before` / appends `after`; **else if** a `fallback` is set it uses `wp_kses_post_deep( $settings['fallback'] )` ([tag.php:39-55](tag.php)). You write `render()` and get fallback behaviour automatically — just make sure `render()` outputs **nothing** when there's no value (don't echo `'0'`, `'—'`, or an empty wrapper, or the fallback never triggers).

```php
public function render(): void {
    $value = $this->compute();
    if ( '' === $value ) {
        return;   // emit nothing → Elementor's Fallback control takes over
    }
    echo esc_html( $value );
}
```

### `Data_Tag` — manual

`Data_Tag` inherits the **empty** `Base_Tag::register_advanced_section()` ([base-tag.php:166](base-tag.php)) — no Before/After/Fallback section is added, and `get_content()` does **no** fallback logic. To support a fallback you register the control yourself and consult it in `get_value()`. Pro's `Post_Featured_Image` is the canonical pattern:

```php
protected function register_controls(): void {
    $this->add_control( 'fallback', [
        'label' => esc_html__( 'Fallback', 'myplugin' ),
        'type'  => Controls_Manager::MEDIA,   // match the control type your value feeds
    ] );
}

protected function get_value( array $options = [] ) {
    $id = get_post_thumbnail_id();
    if ( $id ) {
        return [ 'id' => $id, 'url' => wp_get_attachment_image_src( $id, 'full' )[0] ];
    }
    return $this->get_settings( 'fallback' );   // the manual fallback
}
```

Verified at [post-featured-image.php:33-56](post-featured-image.php) — `get_value()` returns the image array or `$this->get_settings( 'fallback' )`, and `register_controls()` adds a single `MEDIA` fallback control.

## Critical rules

- **`Tag` echoes (`render()`); `Data_Tag` returns (`get_value()`).** Mixing them up (returning from `render()`, or echoing from `get_value()`) silently produces empty/garbage output.
- **`get_categories()` returns `Module::*_CATEGORY` constants**, never bare strings, and matches the control kinds your value feeds. Wrong categories → the tag never appears under the intended control.
- **Add controls directly in `register_controls()`** — Elementor already opened the "Settings" section. A self-opened section nests incorrectly.
- **Method is `register_controls()`**, not `_register_controls()` (deprecated 3.1.0).
- **`Tag` fallback is automatic** but only triggers on **empty** output — `render()` must emit nothing when there's no value.
- **`Data_Tag` has no automatic fallback/before/after** — register a `fallback` control and read it in `get_value()` yourself, with a `type` matching the consuming control.
- **Escape on output in `Tag::render()`** (`esc_html` / `wp_kses_post`) — it's echoed into the page like any front-end output.

## Common mistakes

```php
// WRONG — Data_Tag that echoes (output is captured nowhere; control gets null)
class My_Image extends Data_Tag {
    protected function get_value( array $options = [] ) {
        echo wp_get_attachment_url( $id );   // <-- should RETURN
    }
}

// WRONG — Tag that returns (nothing is printed; tag renders empty)
class My_Text extends Tag {
    public function render() {
        return get_the_title();   // <-- should ECHO
    }
}

// WRONG — render() prints a placeholder, so Elementor's Fallback never fires
public function render() {
    $v = $this->compute();
    echo esc_html( $v ?: '—' );   // <-- non-empty → fallback control is dead
}
// RIGHT — emit nothing on empty
public function render() {
    $v = $this->compute();
    if ( '' === $v ) { return; }
    echo esc_html( $v );
}

// WRONG — Data_Tag expecting an automatic Fallback control (there is none)
class My_Url extends Data_Tag {
    protected function get_value( array $o = [] ) {
        return $this->get_settings( 'fallback' );   // <-- 'fallback' was never registered
    }
}
// RIGHT — register it first
protected function register_controls() {
    $this->add_control( 'fallback', [ 'type' => Controls_Manager::URL ] );
}

// WRONG — wrapping controls in your own section
protected function register_controls() {
    $this->start_controls_section( 'sec', [ 'label' => 'X' ] );  // <-- already inside "Settings"
    $this->add_control( /* … */ );
    $this->end_controls_section();
}
```

## Cross-references

- Run **`elementor-dynamic-tag-register`** for registering the tag, groups, hooks, and bootstrap timing.
- Run **`elementor-dynamic-tag-ajax-select`** when a settings field must pick from a large dataset without a preloaded `SELECT2`.
- See `reference.md` in this skill folder for the full control-type catalog and a complete worked `Data_Tag`.

## What this skill does NOT cover

- **Registering the tag / groups / hooks** — `elementor-dynamic-tag-register`.
- **AJAX/search option fields** — `elementor-dynamic-tag-ajax-select`.
- **Group-control families** (Typography, Box Shadow, etc.) — those are for widgets, not tag settings.
- **The full `Controls_Manager` control reference** — see Elementor's controls docs; this skill cites only the types proven in dynamic-tag source.

## References

- `Tag`: [wp-content/plugins/elementor/core/dynamic-tags/tag.php](tag.php) — `get_content()` ob/render/fallback (30-58), `'ui'` type (64), advanced section with before/after/fallback (84-123).
- `Data_Tag`: [wp-content/plugins/elementor/core/dynamic-tags/data-tag.php](data-tag.php) — abstract `get_value()` (25), `'plain'` type (31), `get_content()` returns value (43-45).
- `Base_Tag`: [wp-content/plugins/elementor/core/dynamic-tags/base-tag.php](base-tag.php) — `init_controls()` opens Settings + `_register_controls` deprecation (172-187), empty `register_advanced_section()` (166), `is_settings_required()` (83), `get_panel_template_setting_key()` (75).
- Categories: [wp-content/plugins/elementor/modules/dynamic-tags/module.php:31-76](module.php).
- Manual-fallback Data_Tag: [wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/post-featured-image.php:33-56](post-featured-image.php).
- Tag with SELECT + TEXT controls + `is_settings_required()`: [wp-content/plugins/elementor-pro/modules/dynamic-tags/tags/post-custom-field.php:46-105](post-custom-field.php).
