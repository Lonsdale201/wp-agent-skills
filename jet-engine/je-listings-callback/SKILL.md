---
name: je-listings-callback
description: 'Register a custom Listings callback for JetEngine — the per-field transform fired when a Dynamic Field widget renders meta values (Format date, Format number, Get post title, Convert units, …). Two registration paths: legacy 3-filter via jet-engine/listings/allowed-callbacks (label), jet-engine/listings/allowed-callbacks-args (control schema), and jet-engine/listing/dynamic-field/callback-args (positional args at runtime). Modern single-call $manager->register_callback($name, $label, $args) hooked on jet-engine/callbacks/register fires the three filters internally. Contract — the registered callback identifier MUST be a real PHP callable string (a global function name OR `Fully\\Qualified\\Class::method`). Bare static method names like `''unit_converter''` fail JE''s is_callable() gate in apply_callback() and the field silently renders empty. Use when scaffolding a JetEngine companion plugin''s listing-field transform, when seeing "callback applied but value disappears" bugs, or when extending the field-args UI.'
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.8.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-05-01"
---

# JetEngine: register a Listings callback (Dynamic Field filter)

For developers extending JetEngine's Dynamic Field widget with custom value transforms — "Format date", "Format number", "Add URL scheme", "Convert units", "Pretty link", and so on. JetEngine ships ~30 built-ins; this skill is for the registration contract that lets your plugin add a new entry to the "Callback to filter field value" dropdown plus its companion controls.

## Misconception this skill corrects

> "I'll register a callback by giving JE a string name and a class+method. JE will figure out how to call it."

JE will NOT figure it out. The callback identifier you pass in `'filter_callback' => [ 'unit_converter' ]` and via `register_callback( 'unit_converter', ... )` is the SAME STRING that JE later passes to `call_user_func_array()`. PHP's `is_callable()` is the gate at [callbacks.php:535](callbacks.php) — and `is_callable( 'unit_converter' )` is `false` unless there is a global function with that name. A static method `MyPlugin\Callbacks\UnitConverter::unit_converter()` does NOT satisfy `is_callable( 'unit_converter' )`.

When the gate fails, `apply_callback()` returns `null` early ([callbacks.php:531-537](callbacks.php)) and the dynamic-field render assigns that `null` back to the value. The field renders as **empty** — no error, no warning, just a blank where the converted value should be. Easy to misdiagnose as "the callback ran and produced empty output" when in fact the gate rejected the callback and it never ran at all.

JE's own callbacks satisfy the gate two ways:

- **PHP built-ins** — `'number_format'`, `'wpautop'`, `'do_shortcode'`, `'human_time_diff'`, `'wp_oembed_get'`, `'make_clickable'`, `'wp_get_attachment_image'`, `'get_the_title'`, `'get_permalink'`, `'get_term_link'`, `'date_i18n'`, `'zeroise'`. These are PHP/WP global functions, so `is_callable()` returns true.
- **JE-prefixed globals** — `'jet_engine_date'`, `'jet_engine_proportional'`, `'jet_engine_get_user_data_by_id'`, `'jet_engine_url_scheme'`, `'jet_engine_render_multiselect'`, `'jet_engine_render_checklist'`, etc. These are declared as global functions in [includes/core/functions.php](functions.php) — NOT static methods. That is why they pass the callable gate.

Your callback MUST follow the same pattern: declare a global function (or use a fully-qualified static-method string `Vendor\\My\\Callbacks\\Convert::run`).

## When to use this skill

Trigger this skill when ANY of the following is true:

- The user asks "how do I add a callback to the Dynamic Field widget", "Format custom values", "extend the JE field filter dropdown".
- The diff or file contains: `add_filter( 'jet-engine/listings/allowed-callbacks'`, `add_filter( 'jet-engine/listings/allowed-callbacks-args'`, `add_filter( 'jet-engine/listing/dynamic-field/callback-args'`, `add_action( 'jet-engine/callbacks/register'`, or a class named `*Callback*`/`*Converter*` registering with JE.
- A listing field set to "Filter field output" with a custom callback renders empty when it shouldn't — likely the callable-gate trap.

## Workflow

### 1. Pick a registration path

JE supports two surfaces. They produce the same result; pick by ergonomics.

| Path | When to use | Hooks |
|---|---|---|
| Legacy 3-filter | Adding multiple callbacks at once, or matching the JE built-in style | `jet-engine/listings/allowed-callbacks` (label map), `jet-engine/listings/allowed-callbacks-args` (control schema), `jet-engine/listing/dynamic-field/callback-args` (positional args) |
| Modern `register_callback()` | Adding one callback with self-contained args; less boilerplate | Action `jet-engine/callbacks/register` → `$manager->register_callback( $name, $label, $args )` which fires the 3 filters internally |

The modern path is verified at [callbacks.php:35](callbacks.php) — the action fires inside the manager constructor. The `register_callback()` method at [callbacks.php:51](callbacks.php) stores the callback definition; `register_callbacks()` at line 66, `register_callbacks_args()` at line 81, and `apply_callbacks_args()` at line 117 then satisfy the same three filters that the legacy path uses directly.

### 2. Bootstrap

Both paths need `function_exists( 'jet_engine' )` because the manager is what fires the action. Hook on `plugins_loaded` priority 11 (after JE's bootstrap):

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\Jet_Engine' ) ) {
        return;
    }

    // MODERN path
    add_action( 'jet-engine/callbacks/register', [ \MyPlugin\Callbacks\Manager::class, 'register' ] );

    // LEGACY path (alternative)
    add_filter( 'jet-engine/listings/allowed-callbacks',          [ \MyPlugin\Callbacks\Manager::class, 'add_callback_label' ] );
    add_filter( 'jet-engine/listings/allowed-callbacks-args',     [ \MyPlugin\Callbacks\Manager::class, 'add_callback_controls' ] );
    add_filter( 'jet-engine/listing/dynamic-field/callback-args', [ \MyPlugin\Callbacks\Manager::class, 'apply_callback_args' ], 10, 4 );
}, 11 );
```

### 3. Declare the callback function as a GLOBAL function

This is the step everyone gets wrong. The callback identifier MUST be a PHP-callable string. The two acceptable shapes:

```php
// Option A — global function. Readable, easy.
function myplugin_format_thousands_short( $value, int $decimals = 1, string $suffix_separator = '' ): string {
    // implementation
}

// Option B — fully-qualified static method as a string. Verbose but namespaceable.
namespace MyPlugin\Callbacks;
class FormatThousandsShort {
    public static function run( $value, int $decimals = 1, string $suffix_separator = '' ): string {
        // implementation
    }
}
// Register as the FQN string:
$manager->register_callback(
    'MyPlugin\\Callbacks\\FormatThousandsShort::run',
    __( 'Format thousands (1.5K)', 'myplugin' ),
    [ /* args */ ]
);
```

Option A is what the JE built-ins use — see [functions.php:1226 (`jet_engine_proportional`)](functions.php), [line 1268 (`jet_engine_date`)](functions.php), [line 1279 (`jet_engine_get_user_data_by_id`)](functions.php). Mirror that style: prefix with your plugin slug (`mvp_`, `myplugin_`, `je_skills_smoke_`) to avoid clashes. Auto-loaded via the same loader as your classes.

### 4. Modern registration — `register_callback()`

```php
namespace MyPlugin\Callbacks;

class Manager {

    public static function register( $manager ): void {
        $manager->register_callback(
            'myplugin_format_thousands_short',
            __( 'Format thousands (1.5K)', 'myplugin' ),
            [
                'thousands_decimals' => [
                    'label'   => __( 'Decimal points', 'myplugin' ),
                    'type'    => 'number',
                    'min'     => 0,
                    'max'     => 3,
                    'step'    => 1,
                    'default' => 1,
                ],
                'thousands_suffix_separator' => [
                    'label'   => __( 'Separator before suffix', 'myplugin' ),
                    'type'    => 'text',
                    'default' => '',
                ],
            ]
        );
    }
}
```

The `args` array entries become per-callback controls. JE adds the `condition` (`dynamic_field_filter` + `filter_callback`) entries automatically so the controls only show when this callback is selected ([callbacks.php:81-110](callbacks.php)). The control `type` accepts `text` / `number` / `select` / `switcher`, and `select` takes `options`.

### 5. Legacy registration — three filters by hand

```php
namespace MyPlugin\Callbacks;

class Manager {

    public static function add_callback_label( array $callbacks ): array {
        $callbacks['myplugin_format_thousands_short'] = __( 'Format thousands (1.5K)', 'myplugin' );
        return $callbacks;
    }

    public static function add_callback_controls( array $args ): array {
        $args['thousands_decimals'] = [
            'label'   => __( 'Decimal points', 'myplugin' ),
            'type'    => 'number',
            'min'     => 0,
            'max'     => 3,
            'step'    => 1,
            'default' => 1,
            'condition' => [
                'dynamic_field_filter' => 'yes',
                'filter_callback'      => [ 'myplugin_format_thousands_short' ],
            ],
        ];
        $args['thousands_suffix_separator'] = [
            'label'   => __( 'Separator before suffix', 'myplugin' ),
            'type'    => 'text',
            'default' => '',
            'condition' => [
                'dynamic_field_filter' => 'yes',
                'filter_callback'      => [ 'myplugin_format_thousands_short' ],
            ],
        ];
        return $args;
    }

    public static function apply_callback_args( array $args, string $callback, array $settings = [], $widget = null ): array {
        if ( 'myplugin_format_thousands_short' === $callback ) {
            $args[] = $settings['thousands_decimals']         ?? 1;
            $args[] = $settings['thousands_suffix_separator'] ?? '';
        }
        return $args;
    }
}
```

The legacy path requires you to write the `condition` entries yourself; modern hides that. Otherwise identical.

### 6. Argument-flow: how settings reach your function

At runtime when the field renders:

1. Dynamic Field widget calls `Jet_Engine_Listings_Callbacks::apply_callback( $input, $callback, $settings, $widget )` ([manager.php:535](manager.php)).
2. `apply_callback()` runs `is_callable($callback) && is_allowed_callback($callback)` — the gate ([callbacks.php:535](callbacks.php)).
3. For built-in callbacks the `switch` populates positional `$args` directly. For your callback the `default` case fires `apply_filters( 'jet-engine/listing/dynamic-field/callback-args', [ $result ], $callback, $settings, $widget )` ([callbacks.php:725-731](callbacks.php)) — the third filter or `apply_callbacks_args()` from `register_callback()`. Each entry of your `$args` definition is appended in declaration order to the array, with the saved value or the declared default.
4. `call_user_func_array( $callback, $args )` ([callbacks.php:736](callbacks.php)) — the result becomes the rendered field value.

So your function signature MUST match: first parameter is the field value, then your declared args in the same order:

```php
function myplugin_format_thousands_short(
    $value,                     // <- index 0: raw field value (string|int|float)
    int $decimals = 1,          // <- index 1: thousands_decimals
    string $suffix_separator    // <- index 2: thousands_suffix_separator
): string {
    if ( ! is_numeric( $value ) ) { return (string) $value; }
    $n = (float) $value;
    $abs = abs( $n );
    if ( $abs >= 1e9 ) { $short = $n / 1e9; $suffix = 'B'; }
    elseif ( $abs >= 1e6 ) { $short = $n / 1e6; $suffix = 'M'; }
    elseif ( $abs >= 1e3 ) { $short = $n / 1e3; $suffix = 'K'; }
    else { return number_format( $n, 0 ); }
    return number_format( $short, $decimals ) . $suffix_separator . $suffix;
}
```

Mismatched arg order is a silent-rendering bug — your function gets the wrong values but doesn't error.

## Critical rules

- **The callback identifier MUST satisfy `is_callable()`.** A bare static method name like `'unit_converter'` does not — only a global function name (`'myplugin_unit_converter'`) or a fully-qualified static-method string (`'MyPlugin\\Callbacks\\UnitConverter::run'`) does. The gate at [callbacks.php:535](callbacks.php) returns `null` on failure → field renders empty with no error.
- **Both paths produce the same result.** The modern `register_callback()` fires the legacy 3 filters internally — pick by ergonomics, not capability.
- **Namespace-prefix your callback identifier** (`myplugin_*` or fully-qualified) to avoid clashing with another plugin's same-named callback.
- **Function signature: `$value` first, then your args in declaration order.** JE's `apply_callbacks_args()` appends settings in the order you declared them ([callbacks.php:117-138](callbacks.php)).
- **Args declarations need a `condition`.** With the legacy path you write `[ 'dynamic_field_filter' => 'yes', 'filter_callback' => [ 'your-callback' ] ]` yourself. With the modern path JE adds it for you. Without `condition`, your controls show under EVERY callback selection.
- **Each arg key is unique across the JE editor.** The same args dictionary feeds every callback's UI. Conflicts (e.g. multiple plugins declaring `decimal_point`) silently overwrite. Prefix arg keys: `myplugin_decimal_point` not `decimal_point`.
- **Hook on `plugins_loaded:11`** so JE's listing manager is loaded. The action `jet-engine/callbacks/register` fires from the `Jet_Engine_Listings_Callbacks` constructor, called from `Jet_Engine_Listings::__construct`.
- **Return a SCALAR (string/number) from your function.** The dynamic-field render at [render/dynamic-field.php:334-340](dynamic-field.php) accepts a value or a `WP_Error` (which becomes a "callback applying" warning). Returning arrays/objects converts to "Array" / class-name strings.

## Common mistakes

```php
// WRONG — bare static method name. Fails is_callable() and the field renders empty.
class Convert {
    public static function units( $value, $from, $to ) { /* ... */ }
}
add_filter( 'jet-engine/listings/allowed-callbacks', function( $cb ) {
    $cb['convert_units'] = 'Convert units';   // WRONG: 'convert_units' is not callable
    return $cb;
} );
// Even if every condition lines up, JE's apply_callback() returns null. Field is empty.

// RIGHT — global function. The simplest fix.
function myplugin_convert_units( $value, $from = 'cm', $to = 'cm' ) { /* ... */ }
add_filter( 'jet-engine/listings/allowed-callbacks', function( $cb ) {
    $cb['myplugin_convert_units'] = 'Convert units';
    return $cb;
} );

// RIGHT — fully-qualified static method as a string. Less common but valid.
$manager->register_callback(
    'MyPlugin\\Callbacks\\Convert::units',
    __( 'Convert units', 'myplugin' ),
    [ /* args */ ]
);

// WRONG — args declared without condition. Controls appear under every callback.
$args['my_decimal'] = [
    'label'   => 'Decimal',
    'type'    => 'number',
    'default' => 2,
];   // WRONG: No condition → leaks into every callback's panel

// RIGHT — scope to your callback only.
$args['my_decimal'] = [
    'label'   => 'Decimal',
    'type'    => 'number',
    'default' => 2,
    'condition' => [
        'dynamic_field_filter' => 'yes',
        'filter_callback'      => [ 'myplugin_format_thousands_short' ],
    ],
];

// WRONG — function signature in the wrong order.
function myplugin_format_thousands_short( int $decimals, $value ) { /* ... */ }
// WRONG: JE passes [ $value, $decimals ]. Your function receives $value as $decimals.
// Output is silently wrong — no error.

// RIGHT — $value first, then args in declaration order.
function myplugin_format_thousands_short( $value, int $decimals = 1, string $sep = '' ) { /* ... */ }

// WRONG — arg key collision with another plugin or a JE built-in.
$args['decimal_point'] = [ /* ... */ ];   // WRONG: conflicts with JE's number_format args

// RIGHT — prefix every arg key.
$args['myplugin_thousands_decimal_point'] = [ /* ... */ ];

// WRONG — returning a non-scalar from the callback.
function myplugin_get_meta_array( $value ) {
    return [ 'a', 'b', 'c' ];   // WRONG: dynamic-field renders as "Array"
}

// RIGHT — return a string. Use a delimiter helper or implode for arrays.
function myplugin_get_meta_array( $value, string $delim = ', ' ) {
    return implode( $delim, (array) $value );
}
```

## Cross-references

- Run **`je-query-builder-custom-type`** when the customization is "I need a new query type" rather than "I need a per-field transform". Different extension surface, complementary.
- Run **`je-dynamic-visibility-condition`** when the customization is "show / hide this widget based on context" rather than "transform a field value".
- Run **`wp-plugin-architecture`** for the companion-plugin scaffold and the `plugins_loaded:11` priority pattern.

## What this skill does NOT cover

- **Bricks-views and Gutenberg integration.** The same callback registration drives Bricks Dynamic Field and JE's block-editor dynamic content; you don't register a separate callback per renderer. UI specifics for Bricks/Blocks are out of scope.
- **Macros (`%macro%`).** Different system from callbacks. Macros resolve dynamic placeholders inside text fields; callbacks transform the final value. Use the JE Macros API for that, not this.
- **Listing item layout / template.** Callbacks change a field's RENDERED VALUE; layout and which fields appear belong to the listing template configuration.
- **Performance.** A callback runs per field per item per render. Heavy work (DB queries, REST calls) should cache per-request manually (e.g. static array property on a helper class).
- **Editor-side preview.** The field-filter UI in the listing-editor preview is JE-managed; you can't add custom Vue controls beyond `text` / `number` / `select` / `switcher`.

## References

- Callback manager: [wp-content/plugins/jet-engine/includes/components/listings/callbacks.php:14](callbacks.php) — `Jet_Engine_Listings_Callbacks`. Constructor at line 23 fires `jet-engine/callbacks/register` at line 35. `register_callback()` at line 51, `register_callbacks()` at 66, `register_callbacks_args()` at 81, `apply_callbacks_args()` at 117. Built-in label map at `get_cllbacks_for_options()` line 145. Built-in args dictionary at `get_callbacks_args()` line 187. The dispatcher with the `is_callable()` gate at `apply_callback()` line 529, `call_user_func_array()` at line 736.
- Field-render entry point: [includes/components/listings/render/dynamic-field.php:328](dynamic-field.php) — `render_filtered_result()` and `apply_callback()` wrapper at line 397.
- Built-in JE callback functions: [includes/core/functions.php](functions.php) — `jet_engine_proportional()` at line 1226, `jet_engine_date()` at line 1268, `jet_engine_get_user_data_by_id()` at line 1279. All are GLOBAL functions, which is what makes them satisfy `is_callable()`.
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>.
- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
