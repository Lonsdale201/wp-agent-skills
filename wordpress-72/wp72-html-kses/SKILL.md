---
name: wp72-html-kses
description: >-
  Reviews HTML sanitization against WordPress 7.2's transitional KSES implementation. Use for wp_kses, wp_kses_post, pre_kses, custom allowlists, wp_kses_force_legacy_parser, or HTML API parser migrations. Distinguishes the default HTML API parser from the legacy fallback and tests security and output compatibility.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 HTML and KSES

Keep `wp_kses()` and `wp_kses_post()` as the public sanitization entry points.
They have not been removed. In build 7.2-RC2-65695, the new HTML API implementation
is active after normal bootstrap: `default-filters.php` registers
`__return_false` on `wp_kses_force_legacy_parser`. The `true` fallback visible
inside `wp_kses()` alone does not describe the effective default.

## Workflow

1. Inspect `wp-includes/kses.php`, `wp-includes/default-filters.php` and the
   runtime filter stack in the actual candidate. Record the effective parser;
   do not infer it from one function, a since tag or an October progress report.
2. Inventory content entry points, allowed tags/attributes/protocols,
   `pre_kses`, `wp_kses_allowed_html` and lower-level parser callbacks.
3. Save representative fragments: editor block comments, malformed markup,
   entity-encoded URLs, styles, non-ASCII text, custom attributes and large
   attribute values.
4. Run the same policy through default and forced-legacy modes in an isolated process.
   Compare allowed content and browser-visible semantics as well as bytes.
5. Check disallowed elements/attributes and URL protocols with a structured
   parser. An output-string difference alone is not a vulnerability.
6. Test the project's hooks with nested sanitization. Avoid reading or changing
   `$wp_kses_operating_mode` as a plugin API.

For a scoped experiment, use the existing entry point and restore the filter:

```php
$legacy_override = static function () { return true; };
add_filter( 'wp_kses_force_legacy_parser', $legacy_override, PHP_INT_MAX );
try {
    $clean = wp_kses( $input, $allowed_html, $allowed_protocols );
} finally {
    remove_filter( 'wp_kses_force_legacy_parser', $legacy_override, PHP_INT_MAX );
}
```

Use a distinct callback so cleanup does not remove core's filter. Prefer a
disposable request/process for comparisons with an existing filter stack.

## Boundaries

- Do not call `wp_sanitize_html_kses()` directly. The candidate labels it private
  and transitional even though PHP exposes the function.
- Do not replace sanitization with `WP_HTML_Tag_Processor` or
  `WP_HTML_Processor`; parsers alone retain unsafe HTML.
- Do not promise byte-identical serialization, unchanged entity spelling or
  unchanged malformed-tag repair.
- Keep the allowlist appropriate to the output context. Broadening it to make a
  snapshot pass can introduce XSS.
- Treat forcing the legacy parser as a temporary diagnostic or a documented,
  scoped compatibility measure, not a substitute for fixing the integration.

## Verification

Exercise a custom allowlist and verify removal of scripts, event attributes and
JavaScript URLs in both modes. Include the target plugin's content corpus and
filters. Keep regression checks distinct from a full sanitizer security review.

## References

- [KSES implementation ticket](https://core.trac.wordpress.org/ticket/66208)
- [Original progress report; its forecast is not a release guarantee](https://make.wordpress.org/core/2026/10/07/progress-report-wp_kses/)
- Verified source: `wp-includes/kses.php`, `wp-includes/default-filters.php`,
  `wp-includes/html-api/class-wp-html-tag-processor.php`.
- Related stable skill: `wp-html-api`.

