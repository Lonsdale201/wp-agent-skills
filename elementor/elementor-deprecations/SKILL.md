---
name: elementor-deprecations
description: Audit Elementor addon code for deprecated Elementor APIs,
  and deprecate your own code correctly. Elementor 3.1+ centralizes this
  in the Deprecation class (modules/dev-tools/deprecation.php) —
  deprecated_function, deprecated_hook, deprecated_argument,
  do_deprecated_action, apply_deprecated_filter — and every call carries
  name + version + replacement, so the full list is greppable from source.
  Covers the underscore→no-underscore widget method renames
  (_register_controls → register_controls in 3.1.0; _content_template /
  _init in 2.9.0), the 3.5.0 registration-hook renames
  (elementor/widgets/widgets_registered, dynamic_tags/register_tags,
  finder/categories/init → their /register replacements), and the
  debugging gotcha — Elementor's PHP _deprecated_* fires only with
  WP_DEBUG AND ELEMENTOR_DEBUG within 4 majors (SOFT=4 / HARD=8). Use
  when reviewing an addon, bumping Elementor majors, or chasing
  deprecation notices.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: elementor
plugin-version-tested: "4.0.7 (free) / 4.0.4 (pro)"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://developers.elementor.com/docs/deprecations/
source-refs:
  - wp-content/plugins/elementor/modules/dev-tools/deprecation.php
  - wp-content/plugins/elementor/core/dynamic-tags/base-tag.php
  - wp-content/plugins/elementor/includes/managers/widgets.php
  - wp-content/plugins/elementor/core/breakpoints/manager.php
---

# Elementor: deprecations (audit & deprecate correctly)

For developers maintaining an Elementor addon — recognise when your code calls a **deprecated** Elementor API (so you can migrate before it's removed), and deprecate **your own** APIs the way Elementor does. This is a static reference + audit skill, not a runtime watcher (use a hook + logging for that). The key strength: Elementor's deprecation data is **source-extractable**, so every claim here can be regenerated against the exact version installed — see `reference.md` for the recipe and the snapshot.

## The Deprecation class (since 3.1.0)

Lives at [modules/dev-tools/deprecation.php](deprecation.php), reached via the dev-tools module:

```php
$deprecation = \Elementor\Plugin::$instance->modules_manager->get_modules( 'dev-tools' )->deprecation;
```

Six methods, each recording **(name, version, replacement)** ([deprecation.php:236,257,278,321,346](deprecation.php)):

| Method | Deprecates | Signature (key args) |
|---|---|---|
| `deprecated_function` | functions / methods | `($function_name, $version, $replacement = '', $base_version = null)` |
| `deprecated_hook` | a hook (generic) | `($hook, $version, $replacement = '', $base_version = null)` |
| `deprecated_argument` | an argument | `($argument, $version, $replacement = '', $message = '')` |
| `do_deprecated_action` | an action hook (still fires it) | `($hook, $args, $version, $replacement = '', $base_version = null)` |
| `apply_deprecated_filter` | a filter hook (still applies it) | `($hook, $args, $version, $replacement = '', $base_version = null)` |

(The official docs list four methods; source also has `deprecated_hook`.)

## Debugging: WP_DEBUG is NOT enough — the gotcha

The docs say "soft deprecated code logs PHP notices, hard logs errors when WP_DEBUG is on." Source is more conservative. `check_deprecation()` ([deprecation.php:193-221](deprecation.php)) only emits the **PHP** `_deprecated_*` log call when **all three** hold:

1. `WP_DEBUG` is true, **and**
2. the deprecation is within `SOFT_VERSIONS_COUNT` (**4**) Elementor majors of the current version (`$diff <= 4`), **and**
3. `ELEMENTOR_DEBUG` is true (`Utils::is_elementor_debug()`).

```php
// deprecation.php:206-220 (paraphrased)
if ( defined( 'WP_DEBUG' ) && WP_DEBUG && $diff <= self::SOFT_VERSIONS_COUNT ) {
    $this->soft_deprecated_notices[ $entity ] = [ $version, $replacement ]; // editor console
    if ( Utils::is_elementor_debug() ) {
        $print_deprecated = true; // → _deprecated_function() / _deprecated_hook() fires
    }
}
```

Consequences for an addon dev:

- **Set `define( 'ELEMENTOR_DEBUG', true );` (plus `WP_DEBUG`)** in `wp-config.php` — otherwise you usually won't see Elementor's deprecation notices in the PHP log, only WP-core ones.
- The browser-console "soft" notices (in the editor) appear with just `WP_DEBUG` + within 4 majors; `HARD_VERSIONS_COUNT` (**8**) is used editor-side to escalate severity ([deprecation.php:11-12,21-26](deprecation.php)).
- **Past the 4-major window the wrapper goes silent** (no PHP notice, no recorded console notice). Don't rely on Elementor warning you forever — migrate while it's still in-window, and audit statically (below).

## Audit workflow — find deprecated Elementor APIs in addon code

1. **Regenerate the deprecation list for the installed version** (it changes per release) — see `reference.md` for the full recipe. Quick form:
   ```bash
   grep -rn -A4 -E "deprecated_function|deprecated_hook|deprecated_argument|do_deprecated_action|apply_deprecated_filter" \
     wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php
   ```
2. **Scan the addon** for the deprecated names:
   - Methods you define that match a deprecated Element/Widget method (the underscore set — see below).
   - `add_action` / `add_filter` on a deprecated hook.
   - Calls to deprecated functions/methods.
3. **Report** each finding as `file:line — <deprecated> (since <version>) → use <replacement>`.
4. **Migrate** to the replacement; keep `get_name()` / public identifiers stable.

### The high-frequency ones for addon devs (verified, snapshot)

Widget/Element method renames — **define the no-underscore form**:

| Deprecated method | Since | Replacement |
|---|---|---|
| `_register_controls()` | 3.1.0 | `register_controls()` |
| `_register_skins()` | 3.1.0 | `register_skins()` |
| `_print_content()` | 3.1.0 | `print_content()` |
| `_add_render_attributes()` | 3.1.0 | `add_render_attributes()` |
| `_content_template()` | 2.9.0 | `content_template()` |
| `_get_initial_config()` | 2.9.0 | `get_initial_config()` |
| `_init()` | 2.9.0 | `init()` |

Registration hook renames (3.5.0) — **hook the new action**:

| Deprecated hook | Since | Replacement |
|---|---|---|
| `elementor/widgets/widgets_registered` | 3.5.0 | `elementor/widgets/register` |
| `elementor/dynamic_tags/register_tags` | 3.5.0 | `elementor/dynamic_tags/register` |
| `elementor/finder/categories/init` | 3.5.0 | `elementor/finder/register` |
| `elementor/controls/controls_registered` | 3.5.0 | `elementor/controls/register` |

Plus the manager methods `register_tag($class)`/`unregister_tag($name)` → `register(instance)`/`unregister($name)` (3.5.0), and the breakpoints filter `elementor/core/responsive/get_stylesheet_templates` → `elementor/core/breakpoints/get_stylesheet_template` (3.2.0). Full snapshot in `reference.md`.

## Deprecating your OWN code (mirror Elementor)

When you rename/retire an API in your addon, route it through the same class so your consumers get consistent notices:

```php
// A function/method you renamed:
\Elementor\Plugin::$instance->modules_manager->get_modules( 'dev-tools' )->deprecation
    ->deprecated_function( __METHOD__, '2.5.0', __CLASS__ . '::new_method()' );

// An action hook you renamed — still fire it for back-compat:
$deprecation = \Elementor\Plugin::$instance->modules_manager->get_modules( 'dev-tools' )->deprecation;
$deprecation->do_deprecated_action( 'myplugin/old_hook', [ $arg ], '2.5.0', 'myplugin/new_hook' );
do_action( 'myplugin/new_hook', $arg );

// A filter you renamed:
$value = $deprecation->apply_deprecated_filter( 'myplugin/old_filter', [ $value ], '2.5.0', 'myplugin/new_filter' );
$value = apply_filters( 'myplugin/new_filter', $value );
```

Version-guard the access so a missing dev-tools module never fatals:

```php
$modules = \Elementor\Plugin::$instance->modules_manager;
$dev = $modules ? $modules->get_modules( 'dev-tools' ) : null;
if ( $dev && isset( $dev->deprecation ) ) {
    $dev->deprecation->deprecated_function( __METHOD__, '2.5.0', __CLASS__ . '::new_method()' );
}
```

## Critical rules

- **The full deprecation list is source-derived, never guessed.** Regenerate it against the installed Elementor version with the `reference.md` recipe before asserting "X is deprecated".
- **Test with `WP_DEBUG` AND `ELEMENTOR_DEBUG`.** Elementor's PHP deprecation notices are gated on both (plus the 4-major window). WP_DEBUG alone usually shows nothing from Elementor's wrapper.
- **Migrate within the soft window.** Past ~4 majors the wrapper stops notifying; after the addon author removes the BC shim it becomes a hard failure with no warning.
- **Don't define the underscore methods** (`_register_controls`, etc.) in new widgets — use the no-underscore names. The underscore form still runs via a shim but logs a deprecation.
- **Use the modern `*/register` hooks**, not the `*_registered` / `register_tags` / `categories/init` ones.
- **Guard the dev-tools access** (`get_modules('dev-tools')` can be null very early) when deprecating your own code.
- **Keep this skill version-aware** — the snapshot is tied to a tested version; the recipe is the durable part.

## Common mistakes

```php
// WRONG — new widget still using the deprecated method name
class My_Widget extends \Elementor\Widget_Base {
    protected function _register_controls() { /* ... */ }   // deprecated 3.1.0 → logs notice
}
// RIGHT
class My_Widget extends \Elementor\Widget_Base {
    protected function register_controls() { /* ... */ }
}

// WRONG — hooking the deprecated registration action
add_action( 'elementor/widgets/widgets_registered', 'myplugin_register_widgets' );  // 3.5.0
// RIGHT
add_action( 'elementor/widgets/register', 'myplugin_register_widgets' );

// WRONG — "I enabled WP_DEBUG but see no Elementor deprecation notices, so my code is clean"
// Elementor's _deprecated_* needs ELEMENTOR_DEBUG too, and only within 4 majors. Absence ≠ clean.
// RIGHT — define( 'ELEMENTOR_DEBUG', true ); AND audit statically with the grep recipe.
```

## Cross-references

- Run **`elementor-dynamic-tag-register`** for the dynamic-tags registration API (the `register_tags` → `register` rename is one of these deprecations).
- Run **`wp-plugin-hooks`** when deprecating hooks you emit from a non-Elementor plugin (WP-core `_deprecated_hook` / `apply_filters_deprecated`).
- See `reference.md` for the extraction recipe and the full per-version snapshot.

## What this skill does NOT cover

- **Runtime monitoring / alerting** on deprecated calls — that's a logging hook concern, not a skill. This skill is static audit + reference.
- **JavaScript / editor-side deprecations** (the `elementorCommon.helpers.deprecatedMethod` JS path) — separate surface.
- **A frozen "official" list** — deprecations change every Elementor release; treat the snapshot as a point-in-time view and regenerate with the recipe.
- **Removal timing decisions** for your own APIs — `SOFT=4` / `HARD=8` are Elementor's notice windows, not a mandate for when to delete BC code.

## References

- Deprecation class: [wp-content/plugins/elementor/modules/dev-tools/deprecation.php](deprecation.php) — constants `SOFT_VERSIONS_COUNT=4` / `HARD_VERSIONS_COUNT=8` (11-12), `check_deprecation()` gating (193-221), the six methods (236, 257, 278, 321, 346).
- Underscore method deprecations: [wp-content/plugins/elementor/core/dynamic-tags/base-tag.php:179-182](base-tag.php) (`_register_controls`), and the Element/Widget bases for the rest.
- Registration-hook deprecation example: [wp-content/plugins/elementor/includes/managers/widgets.php:143-147](widgets.php) (`widgets_registered` → `register`).
- Filter deprecation example: [wp-content/plugins/elementor/core/breakpoints/manager.php:533](manager.php) (`get_stylesheet_templates` → `get_stylesheet_template`).
- Official docs: <https://developers.elementor.com/docs/deprecations/>
