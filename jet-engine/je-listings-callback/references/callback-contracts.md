# Listings callback contracts

Load this reference for legacy registration, zero-sensitive controls, chained
callbacks, or array-backed field data.

## Gate sequence

JetEngine executes a callback only when both conditions hold:

1. the identifier is present in `jet-engine/listings/allowed-callbacks`;
2. PHP `is_callable($identifier)` returns true.

Valid examples:

```php
'my_plugin_global_formatter'
'My_Plugin_JE_Callbacks::format_distance'
'Vendor\\Package\\Formatter::format'
```

A bare alias such as `format_distance` is invalid unless a global function with
that exact name exists. Registering a label does not create a callable.

## Legacy registration

```php
$id = 'My_Plugin_JE_Callbacks::format_distance';

add_filter('jet-engine/listings/allowed-callbacks', static function($items) use ($id) {
    $items[$id] = __('Format distance', 'my-plugin');
    return $items;
});

add_filter('jet-engine/listings/allowed-callbacks-args', static function($args) use ($id) {
    $args['my_plugin_decimals'] = array(
        'label'     => __('Decimals', 'my-plugin'),
        'type'      => 'number',
        'default'   => 1,
        'condition' => array(
            'dynamic_field_filter' => 'yes',
            'filter_callback'      => array($id),
        ),
    );
    return $args;
});

add_filter(
    'jet-engine/listing/dynamic-field/callback-args',
    static function($runtime, $callback, $settings) use ($id) {
        if ($id !== $callback) {
            return $runtime;
        }

        $runtime[] = array_key_exists('my_plugin_decimals', $settings)
            ? $settings['my_plugin_decimals']
            : 1;
        return $runtime;
    },
    10,
    3
);
```

The runtime array already contains the field value. Append arguments in the
same order as the callable signature.

## Multiple callbacks

When `filter_callbacks` is populated, JetEngine ignores the singular
`filter_callback` path and applies each row in order. A formatter must accept
the previous formatter's output, not only the original database shape.

Test chains such as:

```text
stored ID -> title lookup -> HTML badge
stored array -> join -> uppercase
missing value -> fallback-aware formatter
```

## Non-scalar input

The non-scalar allowlist tells JetEngine that the callback expects safely
decoded array-backed data. It does not validate element types for the callback.
After decoding:

```php
public static function join_labels($value, $separator = ', ') {
    if (! is_array($value)) {
        return '';
    }

    $labels = array_filter($value, 'is_scalar');
    $labels = array_map('sanitize_text_field', array_map('strval', $labels));
    return implode((string) $separator, $labels);
}
```

Do not mark a scalar callback as non-scalar merely to make malformed data work.

## Performance checklist

- Preload related objects with one query where possible.
- Use request-local memoization keyed by input and every control argument.
- Do not cache personalized output under a global key.
- Put timeouts and failure handling around remote services; preferably hydrate
  remote data before render time.
- Benchmark a realistic Listing Grid with all configured callback chains.
