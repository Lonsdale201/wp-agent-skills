# WordPress 7.1 tooltip and toggletip helpers

## Choose the right pattern

- Prefer persistent visible text for labels and important instructions.
- Use `wp_get_tooltip( $content )` when `$content` is the short accessible name
  of a compact/icon control and the same text may appear visually on hover or
  focus.
- Use `wp_get_toggletip( $content, $args )` for longer, optional explanatory
  text opened by an explicit action.
- Do not hide validation errors, required constraints, consent terms, or
  critical workflow instructions in either popover.

Both helpers treat `$content` as plain text and escape it. An empty value returns
an empty string. Translate content and labels before passing them.

```php
wp_enqueue_style( 'wp-tooltip' );
wp_enqueue_script( 'wp-tooltip' );

echo wp_get_tooltip( __( 'Refresh status', 'myplugin' ) );

echo wp_get_toggletip(
    __( 'The remote check may take several seconds.', 'myplugin' ),
    array(
        'label'       => __( 'About the remote check', 'myplugin' ),
        'close_label' => __( 'Close help', 'myplugin' ),
        'class'       => 'myplugin-check-help',
    )
);
```

The generated tooltip uses a hint popover with `role="tooltip"`. The toggletip
uses an action popover with `role="dialog"`, a close button, and focus handling.
The helpers generate a unique ID unless an ID is supplied.

## Assets and dynamic markup

Enqueue `wp-tooltip` where the helper output is used. Core admin styles may
already include its stylesheet, but arbitrary admin screens should still make
their script dependency explicit; front-end output needs both handles.

The WordPress 7.1 script scans `.wp-is-tooltip` nodes when it executes and binds
hover/focus behavior. Tooltip HTML inserted later through AJAX is not
automatically initialized. Either render it before the script runs or implement
an application-owned dynamic initialization path without evaluating untrusted
HTML. Toggletips use native popover targeting and do not use the hover binding.

## Custom trigger markup

`button` may contain an existing `<button>` for either helper or an `<a>` for a
tooltip. Core finds the first supported element, adds its trigger class, and
adds popover attributes for a toggletip. If markup cannot be processed, core
falls back to its default button.

The custom trigger must already have a correct accessible name unless it uses
the helper's documented format placeholders. Do not assume visually displayed
popover content automatically labels arbitrary custom markup. Use a real button
for an action and a real link only for navigation.

## Test matrix

Verify keyboard focus, hover, Escape/close behavior, focus return, 200% zoom,
320-CSS-pixel reflow, translated long text, high contrast, reduced motion, and
several helpers on one page. Confirm IDs are unique and the control remains
understandable when CSS, JavaScript, or popover support is unavailable.
