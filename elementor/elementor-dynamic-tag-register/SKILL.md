---
name: elementor-dynamic-tag-register
description: Register a custom Elementor Dynamic Tag from a companion
  plugin — hook the modern elementor/dynamic_tags/register action and
  call $manager->register( new MyTag() ), where MyTag extends
  \Elementor\Core\DynamicTags\Tag (echoes via render()) or
  \Elementor\Core\DynamicTags\Data_Tag (returns via get_value()). The
  legacy elementor/dynamic_tags/register_tags action + register_tag(
  $class ) still work but are deprecated since 3.5.0. Covers the four
  required methods (get_name / get_title / get_group / get_categories),
  registering UI groups with register_group( $slug, [ 'title' => … ] ),
  bootstrap timing under elementor/loaded, and the Pro-feature reality
  — the dynamic-tags API ships in free Elementor but the editor picker
  and the AJAX query control are Pro, so feature-detect and degrade.
  Use when scaffolding a plugin that adds dynamic tags, when a diff
  hooks elementor/dynamic_tags/register(_tags) or extends a
  DynamicTags base class, or when grouping tags in the editor.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "elementor"
  wp-skills-plugin-version-tested: "4.0.7 (free) / 4.0.4 (pro)"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-17"
---

# Elementor: register a Dynamic Tag

For developers shipping a companion plugin that adds Dynamic Tags — "show this product's shipping class", "this user's last order total", "this course's progress %". The dynamic-tags **infrastructure** (base classes, the registration manager, the hooks, the category/group system) ships in **free** Elementor under `Elementor\Core\DynamicTags\*`; this skill is the stable extension contract for registering your own tags against it. It does **not** cover building the tag's controls/fallback (see `elementor-dynamic-tag-fields`) or AJAX pickers (see `elementor-dynamic-tag-ajax-select`).

## The Pro-feature reality (read this first)

The user's instinct that "dynamic tags are a Pro feature" is half-right, and the distinction matters:

- The **API is in free Elementor** — `\Elementor\Core\DynamicTags\Tag`, `Data_Tag`, `Base_Tag`, the `Manager`, the `elementor/dynamic_tags/register` hook, and the category constants all live in the free plugin. Your tag classes compile and register without Pro.
- Free Elementor registers **zero tags of its own** — `Module::get_tag_classes_names()` returns `[]` ([modules/dynamic-tags/module.php:116-118](module.php)) and only one group, "Base Tags" ([module.php:130-136](module.php)).
- **Pro** ships ~34 tags plus 8 groups, every one gated behind a license check — `API::is_licence_has_feature( 'dynamic-tags', … )` ([elementor-pro/modules/dynamic-tags/module.php:97](module.php)).
- The **AJAX query control** (`QueryControlModule::QUERY_CONTROL_ID`) used to pick from large datasets is **Pro-only**. Without Pro you fall back to a manual field — see `elementor-dynamic-tag-ajax-select`.

Practical rule: **build for "Elementor active, Pro likely present", feature-detect Pro-only pieces, and degrade gracefully.** The reference plugin does exactly this with a `has_query_control_support()` check before using the Pro autocomplete control.

## Misconception this skill corrects

> "I'll register my tag with `add_action( 'elementor/dynamic_tags/register_tags', … )` and `$manager->register_tag( MyTag::class )` like the old tutorials show."

Both still work — Elementor keeps deprecation shims — but both are **deprecated since 3.5.0**:

```php
// DEPRECATED (3.5.0) — fires a _doing_it_wrong notice, still functional
add_action( 'elementor/dynamic_tags/register_tags', function ( $manager ) {
    $manager->register_tag( '\MyPlugin\Tags\MyTag' );   // string class name
} );

// MODERN — register() takes an INSTANCE, not a class string
add_action( 'elementor/dynamic_tags/register', function ( $manager ) {
    $manager->register( new \MyPlugin\Tags\MyTag() );
} );
```

Verified: the deprecated action is wrapped in `do_deprecated_action( 'elementor/dynamic_tags/register_tags', …, '3.5.0', 'elementor/dynamic_tags/register' )` ([manager.php:284-289](manager.php)); the modern action fires at [manager.php:302](manager.php). `register_tag()` is `@deprecated 3.5.0 Use register()` ([manager.php:315](manager.php)); `register()` takes a `Base_Tag` instance ([manager.php:337](manager.php)).

(The bundled reference plugin was migrated to the modern API on 2026-06-17 — [TagManager.php:45,109](TagManager.php) now hooks `register` and calls `register( new $tag_class() )`. Older copies and most tutorials still show the legacy pair, which is why it's worth recognising.)

## When to use this skill

Trigger when ANY of the following is true:

- The diff hooks `elementor/dynamic_tags/register` or the legacy `elementor/dynamic_tags/register_tags`.
- A class `extends \Elementor\Core\DynamicTags\Tag` / `Data_Tag` / `Base_Tag` (or a Pro `Pro_Tag` / `Pro_Data_Tag`).
- The user asks "how do I add a custom dynamic tag to Elementor", or wants to group tags in the editor's tag picker.
- Reviewing a companion plugin that adds dynamic content sources.

## Workflow

### 1. Bootstrap — register the callback when Elementor is present

```php
add_action( 'elementor/loaded', static function (): void {
    add_action( 'elementor/dynamic_tags/register', [ \MyPlugin\Tags\Manager::class, 'register' ] );
} );
```

`elementor/loaded` fires once Elementor's core is available, so the `\Elementor\Core\DynamicTags\*` base classes are guaranteed loadable when your tag files autoload. The `register` action itself fires lazily, the first time `Manager::get_tags()` is called ([manager.php:272-303](manager.php)) — well after load — so the `extends` in your tag class always resolves. Do not register tags before `elementor/loaded`.

### 2. Register groups, then tags

```php
namespace MyPlugin\Tags;

use Elementor\Core\DynamicTags\Manager;

class Manager_Bootstrap {
    public static function register( Manager $manager ): void {
        // Groups first — a tag's get_group() must point at a registered slug.
        $manager->register_group( 'myplugin', [
            'title' => esc_html__( 'My Plugin', 'myplugin' ),
        ] );

        $manager->register( new Post_Reading_Time() );
        $manager->register( new Author_Twitter_Url() );

        // Conditional on a dependency
        if ( class_exists( '\WooCommerce' ) ) {
            $manager->register( new Product_Shipping_Class() );
        }
    }
}
```

`register_group( $group_name, array $group_settings )` merges your settings over a `[ 'title' => '' ]` default ([manager.php:382-390](manager.php)). The slug is the key you return from each tag's `get_group()`.

### 3. The minimal tag class

```php
namespace MyPlugin\Tags;

use Elementor\Core\DynamicTags\Tag;
use Elementor\Modules\DynamicTags\Module as TagsModule;

class Post_Reading_Time extends Tag {

    public function get_name(): string {
        return 'myplugin-reading-time';   // unique, stable, namespace-prefixed
    }

    public function get_title(): string {
        return esc_html__( 'Reading Time', 'myplugin' );
    }

    public function get_group(): string {
        return 'myplugin';   // a slug you registered with register_group()
    }

    public function get_categories(): array {
        return [ TagsModule::TEXT_CATEGORY ];   // which control types accept this tag
    }

    public function render(): void {
        $words = str_word_count( wp_strip_all_tags( get_the_content() ) );
        echo esc_html( max( 1, (int) ceil( $words / 200 ) ) . ' min' );
    }
}
```

The four methods every tag must implement: `get_name()` (from `Controls_Stack`), `get_title()`, `get_group()`, `get_categories()` — the last three are `abstract` on `Base_Tag` ([base-tag.php:35,42,53](base-tag.php)). Then `render()` for a `Tag` or `get_value()` for a `Data_Tag` (see `elementor-dynamic-tag-fields`).

### 4. Extend the FREE base classes (portability)

Extend `\Elementor\Core\DynamicTags\Tag` / `Data_Tag`, **not** the Pro bases (`ElementorPro\Modules\DynamicTags\Tags\Base\Pro_Tag`). The free bases load whenever Elementor is active; the Pro bases require Pro AND add a license check your tag does not need. The reference plugin extends the free bases throughout (e.g. [ProductAttributes.php:10](ProductAttributes.php) `extends Tag`) and runs fine alongside Pro.

### 5. Unregister a tag (rare)

```php
$manager->unregister( 'some-tag-name' );   // modern; unregister_tag() is deprecated 3.5.0
```

`unregister()` at [manager.php:371](manager.php); deprecated `unregister_tag()` at [manager.php:351](manager.php).

## Critical rules

- **Use the modern API** — `elementor/dynamic_tags/register` + `register( new Tag() )` (an instance). The `_tags` action and `register_tag( $class )` (a string) are deprecated since 3.5.0 and emit notices.
- **`get_name()` is the stable identifier.** It keys the registry ([manager.php:338](manager.php)) and is saved into every page that uses the tag. Renaming it orphans existing usages. Namespace-prefix it (`myplugin-reading-time`).
- **Register groups before (or alongside) tags.** A `get_group()` pointing at an unregistered slug leaves the tag ungrouped in the picker.
- **Bootstrap on `elementor/loaded`**, then add the `register` action. Registering earlier risks the base class not being loadable when your tag file autoloads.
- **Extend the free base classes** for portability; reach for Pro bases only when you specifically need their license-gated behavior.
- **Feature-detect Pro-only pieces** (the AJAX query control especially) and degrade — don't hard-require Pro unless your whole plugin does.
- **`get_categories()` must return registered category constants** (`TagsModule::TEXT_CATEGORY`, etc.) — see `elementor-dynamic-tag-fields`. A wrong/empty category means the tag won't appear under any control.

## Common mistakes

```php
// WRONG — passing a class string to register() (that was register_tag's signature)
$manager->register( '\MyPlugin\Tags\MyTag' );   // TypeError: expects Base_Tag instance

// RIGHT
$manager->register( new \MyPlugin\Tags\MyTag() );

// WRONG — tag points at a group nobody registered
public function get_group() { return 'my-cool-group'; }   // never register_group()'d → ungrouped

// RIGHT — register the group in the same callback
$manager->register_group( 'my-cool-group', [ 'title' => esc_html__( 'My Cool Group', 'myplugin' ) ] );

// WRONG — generic name collides across plugins and Elementor core
public function get_name() { return 'reading-time'; }

// RIGHT — namespace-prefixed, stable
public function get_name() { return 'myplugin-reading-time'; }

// WRONG — registering before Elementor core is loaded
add_action( 'plugins_loaded', function () {
    add_action( 'elementor/dynamic_tags/register', 'myplugin_register' );  // base class may not be loadable yet
} );

// RIGHT — gate on elementor/loaded
add_action( 'elementor/loaded', function () {
    add_action( 'elementor/dynamic_tags/register', 'myplugin_register' );
} );
```

## Cross-references

- Run **`elementor-dynamic-tag-fields`** for the body of the tag — `Tag` vs `Data_Tag`, the category constants, `register_controls()` field types, and the fallback system.
- Run **`elementor-dynamic-tag-ajax-select`** when a tag (or widget) needs to pick from a large dataset (products, posts) without freezing the editor.
- Run **`wp-plugin-bootstrap`** / **`wp-plugin-architecture`** for the companion-plugin scaffold and load-order patterns.

## What this skill does NOT cover

- **The controls/fields and fallback** a tag declares — see `elementor-dynamic-tag-fields`.
- **AJAX/search pickers** for large option sets — see `elementor-dynamic-tag-ajax-select`.
- **Editor-side UI internals** (the React tag picker). Third-party plugins register tags; they don't extend the picker's rendering.
- **Whether the dynamic switcher appears on a given control** — that is per-control (`'dynamic' => [ 'active' => true ]`) and, in practice, surfaced through Pro. This skill is about registering the tag, not enabling dynamic on someone else's control.
- **Atomic / v4 elements dynamic system** beyond `get_atomic_group()` ([base-tag.php:44](base-tag.php)).

## References

- Manager: [wp-content/plugins/elementor/core/dynamic-tags/manager.php](manager.php) — `register()` (337), `register_tag()` deprecated (315), `register_group()` (382), `unregister()` (371), the two actions in `get_tags()` (272-303, modern fired at 302).
- Base tag: [wp-content/plugins/elementor/core/dynamic-tags/base-tag.php](base-tag.php) — `abstract class Base_Tag extends Controls_Stack` (19), abstract `get_categories`/`get_group`/`get_title` (35,42,53), `get_atomic_group()` (44).
- Free module: [wp-content/plugins/elementor/modules/dynamic-tags/module.php](module.php) — `get_tag_classes_names()` returns `[]` (116-118), `get_groups()` "Base Tags" (130-136), hooks the modern action (89).
- Pro module: [wp-content/plugins/elementor-pro/modules/dynamic-tags/module.php](module.php) — license gate (97), the 8 groups (144-171), tag list (98-134).
- Reference plugin (legacy API, working): [wp-content/plugins/dynamic-elementor-extension-main/dynamic-tags/TagManager.php](TagManager.php) — `register_tags` action (45), `register_group()` calls (58-83), `register_tag()` (109).
- Official: <https://developers.elementor.com/docs/dynamic-tags/>
- Official documentation: <https://developers.elementor.com/docs/dynamic-tags/register-tag/>
