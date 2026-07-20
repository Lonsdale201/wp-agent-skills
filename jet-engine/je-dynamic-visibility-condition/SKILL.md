---
name: je-dynamic-visibility-condition
description: Register a custom Dynamic Visibility condition for
  JetEngine — extend \Jet_Engine\Modules\Dynamic_Visibility\Conditions\
  Base, hook jet-engine/modules/dynamic-visibility/conditions/register,
  call $manager->register_condition( new MyCondition() ). The 3
  abstract methods are get_id() / get_name() / check( $args = [] );
  override get_group() to assign a UI group, is_for_fields() / 
  need_value_detect() / need_type_detect() to control where the
  condition appears, get_custom_controls() to add per-condition UI
  controls. The check() $args includes type ('show' or 'hide'),
  field / field_raw, value, data_type ('chars' / 'numeric' /
  'datetime' / 'date' / 'list'), and context ('default' or
  'current_listing'). Important — $args['type'] is the user's
  show/hide intent; condition must invert its boolean accordingly.
  Use get_current_value() helper for context-aware meta resolution
  (handles WP_Post, WP_User, WP_Term, WP_Comment, listing macros).
  Use when scaffolding a JetEngine companion plugin's visibility
  conditions.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.8.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-05-01"
---

# JetEngine: register a Dynamic Visibility condition

For developers extending JetEngine's Dynamic Visibility module with custom conditions — "is current page the front page", "is the user past N days since registration", "has the visitor purchased a specific product", "is the LearnDash course completed". The module already ships ~40 built-in conditions; this skill is for the **custom-condition extension contract** that's been stable across JetEngine 3.x.

## Misconception this skill corrects

> "I'll add a `pre_get_posts` filter or a custom shortcode to gate the visibility — same outcome."

Different layer. JetEngine's Dynamic Visibility runs the condition check INSIDE the rendering pipeline of every JE-aware widget/block (Elementor widgets, Gutenberg blocks, Bricks elements, listing items). A custom condition slots into the SAME UI as the built-in ones — site editors pick it from a dropdown, configure it, and it applies wherever JE Dynamic Visibility is enabled.

`pre_get_posts` only filters main queries; doesn't help with widget-level visibility. Shortcodes don't get the visibility-condition UI. The verified extension contract is:

```php
add_action( 'jet-engine/modules/dynamic-visibility/conditions/register', function ( $manager ) {
    $manager->register_condition( new MyCondition() );
} );
```

Where `MyCondition` extends `\Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base`. Verified at [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/base.php:4](base.php).

Other AI-prone misconceptions:

- "`check( $args )` returns true when the visitor SHOULD see the content." Half-true. The semantics is "should the widget be displayed". `$args['type']` carries `'show'` (user wants to show when condition is true) or `'hide'` (user wants to hide when condition is true). Your `check()` MUST invert the result based on `$args['type']` — see the `Equal` built-in at [conditions/equal.php:37-41](equal.php).
- "`is_for_fields()` controls whether the condition is shown in the UI." Wrong — it controls whether the condition is available in the **meta-field** context (where the user is comparing meta values). Conditions like "is front page" don't compare values, so they return `is_for_fields() => false`.
- "I should hardcode `get_post_meta( get_the_ID(), ... )` to read meta." Don't — use `$this->get_current_value( $args )` from the Base class. It handles `current_listing` context automatically (WP_Post / WP_User / WP_Term / WP_Comment / listing-macros).

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `register_condition`, hooks `jet-engine/modules/dynamic-visibility/conditions/register`, or extends `\Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base`.
- The user asks "how do I add a custom Dynamic Visibility condition for JetEngine".
- A companion plugin needs role-aware / membership-aware / LMS-progress-aware visibility logic.
- Reviewing PR code that adds a condition class.

## The `Base` API surface (verified)

All methods live on `\Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base` ([base.php:4-212](base.php)):

| Method | Default | Purpose |
|---|---|---|
| `get_id()` | abstract | Unique slug — used as the form-control key. Pick a stable slug; renaming breaks saved configurations. |
| `get_name()` | abstract | Display label in the editor dropdown. Translatable. |
| `check( $args = [] )` | abstract | The actual gate. Return `true` if the widget should display, `false` to hide. Honor `$args['type']`. |
| `get_group()` | `false` | Optional UI group label. `false` lands the condition in "Other"; otherwise groups conditions visually. |
| `is_for_fields()` | `true` | Whether the condition appears in the **meta-field** value-compare UI. Set `false` for context-only conditions. |
| `need_value_detect()` | `true` | Whether the UI prompts for a "value" input. Set `false` for binary "is X" conditions. |
| `need_type_detect()` | `false` | Whether the UI prompts for a "data_type" (chars/numeric/datetime/date/list). Set `true` if your condition does numeric/date comparison. |
| `get_current_value( $args )` | helper | Reads the current value from listing context (post / user / term / comment / macro). Use INSTEAD of raw `get_post_meta`. |
| `checkboxes_to_array( $array )` | helper | Convert JE-checkbox `{value: bool}` to plain list. |
| `adjust_values_type( $current, $compare, $data_type )` | helper | Cast both sides for comparison per data_type. |
| `explode_string( $value )` | helper | CSV → array, trims values. |
| `get_custom_controls()` | `false` | Optional — return an array of UI controls (like Elementor controls) to add per-condition fields. |

## The `$args` shape (verified)

When `check( $args )` runs, `$args` contains:

```php
[
    'type'      => 'show' | 'hide',          // user's intent — invert your boolean here
    'condition' => 'my-condition-id',         // your get_id() value
    'field'     => 'meta_value_or_macro',     // user-entered, possibly with %macros%
    'field_raw' => 'meta_key',                // raw meta key without macro processing
    'operator'  => 'equal' | 'not-equal' | …, // (for value-compare conditions)
    'value'     => 'value_to_compare',        // user-configured comparison value
    'data_type' => 'chars' | 'numeric' | 'datetime' | 'date' | 'list',
    'context'   => 'default' | 'current_listing',
    // ... plus any keys your get_custom_controls() declared
]
```

Not all keys are present in every call — depends on the condition's `is_for_fields()` / `need_value_detect()` / `need_type_detect()` flags + `get_custom_controls()`.

## Workflow

### 1. Bootstrap your companion plugin

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\Jet_Engine' ) ) {
        return;   // JetEngine not active
    }

    add_action(
        'jet-engine/modules/dynamic-visibility/conditions/register',
        [ \MyPlugin\Visibility\Manager::class, 'register' ]
    );
}, 11 );
```

Priority 11 so JE's own `plugins_loaded:10` has run, making the `Conditions\Base` class loadable.

Important — do NOT call `jet_engine()->modules->is_module_active( 'dynamic-visibility' )` inside this guard. `jet_engine()->modules` is null until JE's `init()` callback runs at `init` priority -999 (verified at [jet-engine.php:164,345](jet-engine.php)) — long after `plugins_loaded`. A pre-init module-active check fatal-errors with "Call to a member function is_module_active() on null". You don't need the gate anyway: the `jet-engine/modules/dynamic-visibility/conditions/register` action is fired from inside the visibility module's own bootstrap ([conditions/manager.php:77](manager.php)) — if the module is disabled, the action never fires and your callback never runs.

### 1b. When you DO need to check the module is active

The condition-registration action handles the gating for you, so a module-active check is unnecessary for that path. But there are legitimate uses for `is_module_active()` — admin notices ("Dynamic Visibility module is off, your conditions won't appear"), conditional asset enqueuing, REST endpoints that depend on visibility state, second registrations on a sibling module. For those, run the check AFTER JE's modules manager exists.

```php
// CORRECT — check on jet-engine/init, fired right after JE finishes its init()
add_action( 'jet-engine/init', static function ( $jet_engine ): void {
    if ( ! $jet_engine->modules->is_module_active( 'dynamic-visibility' ) ) {
        // Module is disabled — surface a notice, skip your asset enqueue, etc.
        add_action( 'admin_notices', static function (): void {
            echo '<div class="notice notice-warning"><p>'
               . esc_html__( 'MyPlugin: enable JetEngine Dynamic Visibility to use the conditions.', 'myplugin' )
               . '</p></div>';
        } );
        return;
    }

    // Module is active — do whatever needs the module to be on
    MyPlugin\Visibility\AssetLoader::register();
} );

// ALSO CORRECT — same effect via init:-998 (one step after JE's init:-999)
add_action( 'init', static function (): void {
    if ( ! function_exists( 'jet_engine' ) || ! jet_engine()->modules ) {
        return; // JE not loaded at all
    }
    if ( ! jet_engine()->modules->is_module_active( 'dynamic-visibility' ) ) {
        return;
    }
    // ... module-dependent setup
}, -998 );
```

The `jet-engine/init` action is the cleanest because the JE instance is passed in and you don't need defensive `function_exists()` checks. It is fired at [jet-engine.php:375](jet-engine.php).

```php
// WRONG — calling on plugins_loaded (any priority) fatal-errors
add_action( 'plugins_loaded', static function (): void {
    if ( jet_engine()->modules->is_module_active( 'dynamic-visibility' ) ) {  // WRONG: modules is null here
        // ...
    }
}, 11 );
```

### 2. Minimal context condition — "Is Front Page"

```php
namespace MyPlugin\Visibility;

use Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base;

class IsFrontPage extends Base {

    public function get_id(): string {
        return 'myplugin-is-front-page';   // namespace-prefix the slug to avoid collisions
    }

    public function get_name(): string {
        return __( 'Is Front Page', 'myplugin' );
    }

    public function get_group(): string {
        return __( 'Page Context', 'myplugin' );   // groups multiple related conditions in the UI
    }

    /**
     * No meta-field comparison — this is a binary context check.
     */
    public function is_for_fields(): bool {
        return false;
    }

    /**
     * No "value" input in the UI — the condition is a yes/no gate.
     */
    public function need_value_detect(): bool {
        return false;
    }

    public function check( $args = [] ): bool {
        $is_front_page = ( (int) get_option( 'page_on_front' ) === (int) get_the_ID() );

        // Honor the user's show/hide intent
        $type = $args['type'] ?? 'show';

        return ( 'hide' === $type ) ? ! $is_front_page : $is_front_page;
    }
}
```

### 3. Meta-comparison condition — read listing context correctly

```php
class HighRatedProducts extends Base {

    public function get_id(): string {
        return 'myplugin-high-rated';
    }

    public function get_name(): string {
        return __( 'Product Rating ≥ N', 'myplugin' );
    }

    public function need_type_detect(): bool {
        return true;   // user picks numeric / chars / etc. — we use numeric here
    }

    public function check( $args = [] ): bool {
        // get_current_value() handles the listing context for us:
        // - WP_Post (incl. WC_Product) → get_post_meta
        // - WP_User                     → get_user_meta
        // - WP_Term                     → get_term_meta
        // - WP_Comment                  → get_comment_meta
        // - macros (%dynamic_value%)    → resolved via macros engine
        $current = (float) $this->get_current_value( $args );
        $threshold = (float) ( $args['value'] ?? 0 );

        $type = $args['type'] ?? 'show';
        $matches = $current >= $threshold;

        return ( 'hide' === $type ) ? ! $matches : $matches;
    }
}
```

### 4. Custom UI controls — `get_custom_controls()`

For conditions that need bespoke inputs beyond the default field/value pair (like "select days of week", "select user roles", repeater of items):

```php
class WeekDays extends Base {

    public function get_id(): string {
        return 'myplugin-week-days';
    }

    public function get_name(): string {
        return __( 'Day of Week', 'myplugin' );
    }

    public function is_for_fields(): bool {
        return false;   // not a meta-comparison
    }

    public function need_value_detect(): bool {
        return false;   // value input is custom, declared below
    }

    public function get_custom_controls(): array {
        global $wp_locale;
        return [
            'week_days' => [
                'label'    => __( 'Days of Week', 'myplugin' ),
                'type'     => 'select2',
                'multiple' => true,
                'default'  => [],
                'options'  => $wp_locale->weekday,   // [0 => 'Sunday', 1 => 'Monday', ...]
            ],
        ];
    }

    public function check( $args = [] ): bool {
        $allowed = $args['week_days'] ?? [];   // matches the key from get_custom_controls
        $today = (int) current_time( 'w' );

        $matches = in_array( $today, array_map( 'intval', $allowed ), true );
        $type = $args['type'] ?? 'show';

        return ( 'hide' === $type ) ? ! $matches : $matches;
    }
}
```

The control `type` field accepts the same values JE uses elsewhere: `text`, `number`, `select`, `select2`, `checkbox`, `media`, `date`, `time`, `datetime`. Verified usage in `WeekDays`, `TimePeriod`, `ListingOdd` built-ins.

### 5. Register all conditions

```php
namespace MyPlugin\Visibility;

class Manager {
    public static function register( $manager ): void {
        $manager->register_condition( new IsFrontPage() );
        $manager->register_condition( new HighRatedProducts() );
        $manager->register_condition( new WeekDays() );

        // Conditional — only if dependency plugin is active
        if ( class_exists( '\WooCommerce' ) ) {
            $manager->register_condition( new \MyPlugin\Visibility\Wc\PurchasedProducts() );
        }
        if ( function_exists( 'wc_memberships' ) ) {
            $manager->register_condition( new \MyPlugin\Visibility\Wc\MemberAccess() );
        }
    }
}
```

Conditional registration based on third-party plugin presence is the canonical pattern — verified in the existing `dynamic-elementor-extension` plugin's `VisibilityManager::register_conditions()`.

### 6. Listing context awareness

When the visibility check runs INSIDE a JE listing (a card in a listing grid, for example), `$args['context']` is `'current_listing'` and `get_current_value()` reads from the LISTING's current object — NOT the parent page. The Base helper handles this:

```php
// Inside check( $args ):
$value = $this->get_current_value( $args );

// For 'current_listing' context, this resolves to:
// - if listing iterates WP_Post → get_post_meta( $current_post_id, $field_raw, true )
// - if listing iterates WP_User → get_user_meta( $current_user_id, $field_raw, true )
// - …etc.

// Don't manually re-read with get_post_meta( get_the_ID() ) — get_the_ID() in
// listing context returns the LISTING'S parent page, not the iterated item.
```

Verified at [base.php:69-120](base.php) — the resolver dispatches by `get_class( $object )`.

### 7. Group conditions in the UI

```php
public function get_group(): string {
    return __( 'My Plugin', 'myplugin' );
}
```

All conditions returning the same string land in a labeled section in the editor's condition dropdown. Useful for plugins shipping multiple conditions — keeps them visually clustered. Without `get_group()`, the condition lands in the default "Other" bucket.

### 8. Checkbox values — convert before use

JE checkboxes return `{ value1: true, value2: false }` shape (so the user can keep all keys but only some are "on"). Convert to a plain list:

```php
$selected = $this->checkboxes_to_array( $args['my_checkbox_field'] ?? [] );
// Now $selected is ['value1', 'value3', ...]
```

## Critical rules

- **`get_id()` is stable.** Renaming breaks saved visibility configurations on every site that uses the condition.
- **Namespace-prefix the slug** (`myplugin-is-front-page` not `is-front-page`) to avoid collisions with built-ins or other companion plugins.
- **`check()` MUST honor `$args['type']`.** Invert the boolean when `type === 'hide'`. Otherwise the user's "hide if true" UI choice does the opposite of what they expect.
- **Use `$this->get_current_value( $args )`** for meta reads — handles the listing context automatically. Don't `get_post_meta( get_the_ID(), ... )` directly.
- **`is_for_fields() => false`** when the condition isn't comparing a meta field value. Cleaner UI for the editor.
- **`need_value_detect() => false`** when the condition is a binary gate without a value input.
- **`need_type_detect() => true`** when the condition does numeric / date / list comparison and the data_type matters.
- **Hook at priority 11+ on `plugins_loaded`** so JetEngine's own bootstrap (priority 10) has run.
- **Do NOT call `jet_engine()->modules->is_module_active(...)` from `plugins_loaded`** — `jet_engine()->modules` is null until `init:-999`. Calling it earlier fatal-errors. The registration action is module-gated by JE itself (only fires when the module is on), so the gate is also unnecessary.
- **`get_custom_controls()` keys become `$args` keys** — the field name you declare is the same name you read in `check()`.
- **`Base` is in the `Jet_Engine\Modules\Dynamic_Visibility\Conditions` namespace.** Use the FQN with `use` or full backslash; class auto-loads via JE's PSR-4-ish loader.

## Common mistakes

```php
// WRONG — ignoring $args['type']
public function check( $args = [] ): bool {
    return is_front_page();   // returns true on front page; user picked "hide if true" → still shows
}

// RIGHT
public function check( $args = [] ): bool {
    $is = is_front_page();
    $type = $args['type'] ?? 'show';
    return ( 'hide' === $type ) ? ! $is : $is;
}

// WRONG — manual meta read in listing context
public function check( $args = [] ): bool {
    $rating = (float) get_post_meta( get_the_ID(), 'rating', true );
    // get_the_ID() in a listing context returns the parent page, NOT the listing item.
    return $rating >= ( $args['value'] ?? 0 );
}

// RIGHT — use the Base helper
public function check( $args = [] ): bool {
    $rating = (float) $this->get_current_value( $args );
    return $rating >= ( $args['value'] ?? 0 );
}

// WRONG — generic slug colliding with built-ins
public function get_id(): string {
    return 'is-front-page';   // WRONG: might collide with another plugin's condition
}

// RIGHT — namespaced
public function get_id(): string {
    return 'myplugin-is-front-page';
}

// WRONG — leaving need_type_detect as default for a numeric condition
class HighRated extends Base {
    public function check( $args = [] ): bool {
        return (float) $this->get_current_value( $args ) >= (float) $args['value'];
    }
    // (no need_type_detect override → defaults to false → UI doesn't ask for data_type → numeric cast is forced everywhere; for 'chars' fields the $value is a STRING and the float cast is wrong)
}

// RIGHT
class HighRated extends Base {
    public function need_type_detect(): bool { return true; }

    public function check( $args = [] ): bool {
        $values = $this->adjust_values_type(
            $this->get_current_value( $args ),
            $args['value'] ?? 0,
            $args['data_type'] ?? 'numeric'
        );
        return $values['current'] >= $values['compare'];
    }
}

// WRONG — hooking before JE bootstrap
add_action(
    'jet-engine/modules/dynamic-visibility/conditions/register',
    'myplugin_register_conditions'
);
// In your plugin's main file with no priority handling. If your plugin loads BEFORE JE,
// the Conditions namespace classes aren't loaded yet → fatal "Class not found".

// RIGHT — defer to plugins_loaded:11
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( '\Jet_Engine' ) ) return;
    add_action(
        'jet-engine/modules/dynamic-visibility/conditions/register',
        'myplugin_register_conditions'
    );
}, 11 );

// WRONG — calling is_module_active() at plugins_loaded
add_action( 'plugins_loaded', function () {
    if ( ! function_exists( 'jet_engine' ) ) return;
    if ( ! jet_engine()->modules->is_module_active( 'dynamic-visibility' ) ) return;
    // WRONG: Fatal — jet_engine()->modules is null until init:-999. plugins_loaded runs earlier.
}, 11 );

// RIGHT — just register the action; JE itself only fires it when the module is on
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( '\Jet_Engine' ) ) return;
    add_action(
        'jet-engine/modules/dynamic-visibility/conditions/register',
        'myplugin_register_conditions'
    );
}, 11 );

// WRONG — register inside another condition's check()
add_action( 'jet-engine/modules/dynamic-visibility/conditions/register', function ( $manager ) {
    $manager->register_condition( new ConditionA() );
    if ( ConditionA::should_register_b() ) {
        $manager->register_condition( new ConditionB() );   // OK — but use direct guards
    }
} );
// vs.

// RIGHT — direct guards, no cross-condition coupling
add_action( 'jet-engine/modules/dynamic-visibility/conditions/register', function ( $manager ) {
    $manager->register_condition( new ConditionA() );
    if ( class_exists( 'WooCommerce' ) ) {
        $manager->register_condition( new ConditionB() );
    }
} );

// WRONG — assuming custom_controls keys are namespaced for you
public function get_custom_controls(): array {
    return [ 'days' => [ /* ... */ ] ];
}
public function check( $args = [] ): bool {
    return ! empty( $args['my_plugin_days'] );   // WRONG: reads wrong key
}

// RIGHT — keys match between get_custom_controls() and $args
public function get_custom_controls(): array {
    return [ 'myplugin_days' => [ /* ... */ ] ];   // namespace-prefix the key
}
public function check( $args = [] ): bool {
    return ! empty( $args['myplugin_days'] );
}
```

## Cross-references

- Run **`je-query-builder-custom-type`** when the customization is "I need a new query type" rather than "I need a visibility gate".
- Run **`je-listings-callback`** (when written) for callback registration — different extension surface but related (visibility decides IF something renders, callbacks transform the rendered value).
- Run **`wp-plugin-architecture`** for the companion-plugin scaffold + `plugins_loaded:11` priority pattern.
- Run **`wp-i18n-audit`** for `get_name()` / `get_group()` translation strings.

## What this skill does NOT cover

- **JE Conditions Manager UI internals.** Editor-side rendering happens via JE's own React components — third-party plugins don't extend the UI rendering layer beyond `get_custom_controls()`.
- **Bricks-views integration specifics.** JE Dynamic Visibility supports Bricks; the condition class shape is identical, but Bricks integration helpers live in `inc/bricks-views/`.
- **Block editor (Gutenberg) integration.** Same Base class works; the UI rendering happens via `inc/blocks-integration.php` — third-party doesn't touch that.
- **Performance / caching of condition checks.** `check()` runs per widget per page render; expensive operations (DB queries, REST calls) should be cached per-request manually (e.g. via static array property).
- **Conditions for non-DV contexts.** Other JE modules (CCT, listings) have their own condition or visibility surfaces — out of scope.
- **Listing-iteration semantics.** Use `wpcs-subscription-hooks`-style separate skills for the listing data model itself.
- **Replacing the conditions manager** via the `woocommerce_session_handler`-style swap. JE doesn't expose a manager-replacement filter; conditions must extend the existing manager.

## References

- Base class: [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/base.php:4](base.php) — `abstract class Base`. Abstract methods at lines 11, 18, 25; defaults at 32-61; `get_current_value()` at 69-120; helpers at 125-203; `get_custom_controls()` at 208-210.
- Reference value-compare condition: [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/equal.php](equal.php) — `Equal extends Base`, `need_type_detect() => true`, `check()` at line 29 honors `$args['type']`.
- Reference custom-controls condition: [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/week-days.php](week-days.php) — `get_custom_controls()` shape with `select2` multiple.
- Conditions checker (the runtime that calls `check()`): [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions-checker.php](conditions-checker.php) — composes `$args` from the editor settings.
- Module bootstrap: [wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/manager.php:77](manager.php) — fires `jet-engine/modules/dynamic-visibility/conditions/register` from inside the module's own bootstrap (so the action only fires when the module is on).
- JE init timing: [wp-content/plugins/jet-engine/jet-engine.php:164,345](jet-engine.php) — `add_action( 'init', [ $this, 'init' ], -999 )` is where `$this->modules = new Jet_Engine_Modules()` is set; calling `is_module_active()` before that fires fatal-errors.
- Modules manager: [wp-content/plugins/jet-engine/includes/modules/modules-manager.php:382](modules-manager.php) — `is_module_active()` impl, callable only after `init:-999`.
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation>.
- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
- Official documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/module.php`
