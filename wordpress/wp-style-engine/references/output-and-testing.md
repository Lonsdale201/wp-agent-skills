# Style Engine output and testing

## Output matrix

| Input path | Expected output |
|---|---|
| Valid style object, no selector | declaration string plus declarations/classes where applicable |
| Valid style object and selector | complete selector rule |
| Rule list with `rules_group` | nested parent selector or at-rule output |
| Empty/invalid declarations | skipped rule or empty string |
| Context used by several calls | one compiled request-local stylesheet |
| 7.1 declarations object with `important` | filtered declaration with `!important` |

## Smoke probes

1. Compile a preset color and confirm the CSS variable and expected class name.
2. Compile `background.gradient` and `dimensions.minWidth` on WordPress 7.1.
3. Pass an invalid property/value and confirm it is omitted rather than causing
   broken stylesheet output.
4. Store two selectors in a namespaced context and emit the context once.
5. Compile optimized and pretty output; compare semantics, not whitespace.
6. Try a hostile declaration value, selector, and rules group separately. The
   declaration filter does not justify accepting hostile structural input.
7. Verify the stylesheet handle exists before `wp_add_inline_style()` and that
   editor-canvas CSS is loaded into the iframe where needed.

## Review boundary

The public wrapper functions are the extender contract. `WP_Style_Engine` is
documented by core as internal even though PHP visibility exposes several
methods. `WP_Style_Engine_CSS_Declarations` is accepted by the public
stylesheet function in 7.1 specifically to carry declaration options; keep its
use limited to that documented path.
