---
name: je-listings-callback
description: >-
  Registers or audits a JetEngine Listings callback used by Dynamic Field
  rendering through jet-engine/callbacks/register or the legacy callback
  filters. Covers callable identifiers, positional control arguments,
  multi-callback chains, zero-value defaults, serialized/non-scalar input,
  scalar output, escaping, and render-time performance. Use when adding a field
  formatter, callback controls, array-aware transforms, or diagnosing blank,
  unsafe, incorrectly ordered, or unexpectedly defaulted Dynamic Field output.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.14"
  wp-skills-wp-version-tested: "7.0.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-17"
---

# JetEngine Listings callback

Add a Dynamic Field transform through JetEngine's allowlist. Treat the callback
as render code: make it deterministic, cheap, and explicit about whether it
returns plain text or already-safe HTML.

## When to use this skill

- Add a formatter to Dynamic Field's Filter field output control.
- Add callback-specific controls and positional PHP arguments.
- Diagnose a selected callback that yields blank or malformed output.
- Process serialized arrays, chained callbacks, HTML, or zero-valued settings.
- Audit output escaping or N+1 work in Listing Grids.

## Preferred registration

Register on `jet-engine/callbacks/register`. The identifier must pass
`is_callable()` and JetEngine's allowed-callback gate. Use a global function or
a fully qualified static callable string.

```php
final class My_Plugin_JE_Callbacks {
    public static function format_distance($value, $decimals = 1, $unit = 'km') {
        if (! is_numeric($value)) {
            return '';
        }

        $decimals = max(0, min(6, (int) $decimals));
        $unit     = in_array($unit, array('km', 'mi'), true) ? $unit : 'km';

        return number_format_i18n((float) $value, $decimals) . ' ' . $unit;
    }
}

add_action(
    'jet-engine/callbacks/register',
    static function($manager): void {
        $manager->register_callback(
            'My_Plugin_JE_Callbacks::format_distance',
            __('Format distance', 'my-plugin'),
            array(
                'my_plugin_decimals' => array(
                    'label'   => __('Decimals', 'my-plugin'),
                    'type'    => 'number',
                    'default' => 1,
                ),
                'my_plugin_unit' => array(
                    'label'   => __('Unit', 'my-plugin'),
                    'type'    => 'select',
                    'default' => 'km',
                    'options' => array(
                        'km' => 'km',
                        'mi' => 'mi',
                    ),
                ),
            )
        );
    }
);
```

JetEngine calls the function as:

```text
callback(field value, my_plugin_decimals, my_plugin_unit)
```

Control declaration order is argument order. Prefix every control key. The
modern registration adds its own UI conditions; do not duplicate them.

## Critical argument edge

In 3.8.14, modern argument extraction uses `! empty($settings[$key])`. Saved
`0`, `'0'`, `false`, and `''` therefore fall back to the declared default. The
default is read with `! empty()` too, so a declared default of `0` becomes an
empty string. If zero is valid:

- choose a non-ambiguous UI representation and normalize it in the callback; or
- use the legacy `jet-engine/listing/dynamic-field/callback-args` filter and
  `array_key_exists()` for that argument.

Do not promise that a numeric control can pass literal zero through the modern
helper unchanged.

## Input and output contract

- The first argument is the current field result.
- Multiple `filter_callbacks` run sequentially; each output becomes the next
  callback's input.
- Return `string`, number, `null`, or `WP_Error` intentionally. Raw arrays and
  objects produce a visible JetEngine error with available child keys; they are
  not silently stringified.
- Return an empty string for unsupported input only when hiding the value is the
  desired behavior. Otherwise return a `WP_Error` during development.
- Bound database/remote work. A Listing Grid may invoke the callback once per
  field, per item, and per callback in the chain.

## Serialized and array-backed values

JetEngine only safely unserializes input for callbacks listed by
`jet-engine/listings/non-scalar-callbacks`. Add a custom callback only when its
source field is documented to store arrays:

```php
add_filter(
    'jet-engine/listings/non-scalar-callbacks',
    static function(array $callbacks): array {
        $callbacks['My_Plugin_JE_Callbacks::join_labels'] = true;
        return $callbacks;
    }
);
```

Do not call unrestricted `unserialize()` in a callback. Validate the resulting
shape and convert it to a scalar before returning.

## Output security

Custom callback output is not automatically escaped by default. The filter
`jet-engine/listings/dynamic-field/kses-output` defaults to `false` at the final
render point.

- For plain text, return `esc_html($text)` if the callback owns final HTML
  rendering, or return a raw scalar only when the consuming format escapes it.
- For URLs/attributes, escape at the final attribute context; do not use
  `esc_html()` as a universal sanitizer.
- For intentional limited HTML, return `wp_kses_post($html)` or enable final
  KSES for the exact field settings.
- Never pass user-controlled shortcode or arbitrary callable names through.

```php
add_filter(
    'jet-engine/listings/dynamic-field/kses-output',
    static function($use_kses, $settings) {
        return 'My_Plugin_JE_Callbacks::safe_badge'
            === ($settings['filter_callback'] ?? '') ? true : $use_kses;
    },
    10,
    2
);
```

## Legacy route

Use the three legacy filters only for compatibility or zero-sensitive argument
handling:

- `jet-engine/listings/allowed-callbacks`
- `jet-engine/listings/allowed-callbacks-args`
- `jet-engine/listing/dynamic-field/callback-args`

Keep the same fully callable identifier in all three. Read
[callback-contracts.md](references/callback-contracts.md) before implementing
the legacy path or chained/non-scalar behavior.

## Verification

Test direct `is_callable()`, allowlist presence, argument order, omitted values,
literal zero, empty input, malicious HTML, array/object output, a multi-callback
chain, and a multi-item Listing Grid. Confirm the actual rendered DOM and count
queries, not only the callback's direct return value.

## References

- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/components/listings/callbacks.php`
  - `wp-content/plugins/jet-engine/includes/components/listings/manager.php`
  - `wp-content/plugins/jet-engine/includes/components/listings/render/dynamic-field.php`
  - `wp-content/plugins/jet-engine/includes/core/functions.php`
