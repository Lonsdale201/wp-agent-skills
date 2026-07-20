# elementor-deprecations — reference

The durable part of this skill is the **extraction recipe**: Elementor's deprecation calls all carry `(name, version, replacement)`, so the complete, accurate list for *any* installed version is greppable. The table below is a **point-in-time snapshot** (Elementor 4.1.4 / Pro 4.1.2) — regenerate it when the installed version changes.

> Re-verified against 4.1.4 / 4.1.2 (2026-07-09): the addon-facing deprecation surface is **unchanged** from the 4.0.x snapshot — same call-site counts, same names/versions/replacements. The only addition below is the Pro Forms action hook (`elementor_pro/forms/register_action`), which existed at 4.0.4 but was previously uncurated.

## Extraction recipe

Every deprecation is a call to one of the six `Deprecation` methods. They are usually multi-line, so grep with trailing context:

```bash
# All deprecation call sites, with the args that follow (name / version / replacement):
grep -rn -A4 -E "deprecated_function|deprecated_hook|deprecated_argument|do_deprecated_action|apply_deprecated_filter" \
  wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php
```

Narrow by kind:

```bash
# Deprecated ACTION hooks (name → version → replacement are the next lines):
grep -rn -A4 "do_deprecated_action(" wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php

# Deprecated FILTER hooks:
grep -rn -A5 "apply_deprecated_filter(" wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php

# Deprecated arguments:
grep -rn -A2 "deprecated_argument(" wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php

# Deprecated methods with a string-literal name (the addon-facing ones):
grep -rn -A3 "deprecated_function(" wp-content/plugins/elementor wp-content/plugins/elementor-pro --include=*.php \
  | grep -oE "'_[a-z_]+'[^)]*'[0-9.]+'"
```

Reading the output: the **first string** after the `(` is the deprecated entity (or `__METHOD__` / `__FUNCTION__` / `__CLASS__ . '...'` — resolve against the enclosing class), the **next string** is the version it was deprecated in, the **third** is the replacement. Many `deprecated_function` calls use `__METHOD__`, so the "name" is the method of the class where the call sits — open that file to resolve it.

### Call-site counts (4.1.4 / 4.1.2)

Counted as real invocations (`->method(`), excluding the method definitions and commented-out lines — i.e. `grep -rn "\->deprecated_function(" … | grep -v "function deprecated_function"`:

| Method | elementor | elementor-pro |
|---|---|---|
| `deprecated_function` | 64 | 7 |
| `deprecated_argument` | 3 | 0 |
| `do_deprecated_action` | 4 | 1 |
| `apply_deprecated_filter` | 1 | 0 |
| `deprecated_hook` (direct) | 0 | 0 |

(~77 real call sites. `deprecated_hook` has no direct addon-facing call site — `do_deprecated_action` / `apply_deprecated_filter` call it internally. The `deprecated_function` count is dominated by internal `__METHOD__` BC shims that addon code never calls; the curated set below is what matters for addon developers. A naive `grep -c` without the `function`/comment filter over-counts to ~82/~10 by including the class definitions and doc lines.)

## Snapshot — addon-relevant deprecations (Elementor 4.1.4 / Pro 4.1.2)

### Widget / Element method renames (define the no-underscore form)

| Deprecated | Since | Replacement |
|---|---|---|
| `_register_controls()` | 3.1.0 | `register_controls()` |
| `_register_skins()` | 3.1.0 | `register_skins()` |
| `_print_content()` | 3.1.0 | `print_content()` |
| `_add_render_attributes()` | 3.1.0 | `add_render_attributes()` |
| `_content_template()` | 2.9.0 | `content_template()` |
| `_get_initial_config()` | 2.9.0 | `get_initial_config()` |
| `_init()` | 2.9.0 | `init()` |

Verified replacements are `__CLASS__ . '::<name>()'` in the source; resolved at `core/dynamic-tags/base-tag.php:179-182` (`_register_controls`) and the Element/Widget base classes.

### Registration action hooks (3.5.0)

| Deprecated action | Replacement |
|---|---|
| `elementor/widgets/widgets_registered` | `elementor/widgets/register` |
| `elementor/dynamic_tags/register_tags` | `elementor/dynamic_tags/register` |
| `elementor/finder/categories/init` | `elementor/finder/register` |
| `elementor/controls/controls_registered` | `elementor/controls/register` *(commented in source — register on `elementor/controls/register` directly)* |
| `elementor_pro/forms/register_action` (Pro) | `elementor_pro/forms/actions/register` |

Sources: `includes/managers/widgets.php:143-147`, `core/dynamic-tags/manager.php:284-289`, `core/common/modules/finder/categories-manager.php:147-151`, `includes/managers/controls.php:498-502`, `elementor-pro/modules/forms/registrars/form-actions-registrar.php:66-70`.

### Manager method renames (3.5.0)

| Deprecated | Replacement |
|---|---|
| `Dynamic_Tags\Manager::register_tag( $class_string )` | `register( Base_Tag $instance )` |
| `Dynamic_Tags\Manager::unregister_tag( $name )` | `unregister( $name )` |

Source: `core/dynamic-tags/manager.php:315,351`.

### Filter hook (3.2.0)

| Deprecated filter | Replacement |
|---|---|
| `elementor/core/responsive/get_stylesheet_templates` | `elementor/core/breakpoints/get_stylesheet_template` |

Source: `core/breakpoints/manager.php:533`.

### Deprecated arguments

| Deprecated argument | Since | Replacement / note |
|---|---|---|
| `Plugin::$instance->posts_css_manager` | 2.7.0 | `Plugin::$instance->files_manager` |
| `$finder_category_name` (finder category registration arg) | 3.5.0 | register via `elementor/finder/register` |
| `$control_id` (controls manager arg) | 3.5.0 | — |

Sources: `includes/plugin.php:800`, `core/common/modules/finder/categories-manager.php:68`, `includes/managers/controls.php:562`.

## Regenerating this snapshot

1. Note the installed versions: `wp plugin get elementor --field=version` and `... elementor-pro ...` (or the plugin headers).
2. Run the extraction recipe above.
3. Keep the addon-facing rows (method renames, hook/filter renames, arguments); drop the internal `__METHOD__` shims that aren't part of the public addon surface.
4. Update the "Since / Replacement" columns from the actual call args — never from memory.
