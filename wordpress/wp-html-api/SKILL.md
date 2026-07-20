---
name: wp-html-api
description: Use WordPress' HTML API for structured server-side HTML inspection
  and mutation instead of regex, fragile string replacement, or DOMDocument.
  Covers WP_HTML_Tag_Processor, WP_HTML_Processor, set_attribute,
  remove_attribute, add_class, remove_class, set_modifiable_text,
  serialize_token, custom data attribute name mapping, and WP 6.9 behavior
  where attribute/text setters escape character references. Use when plugin
  code modifies rendered HTML, block output, shortcodes, content filters,
  widget markup, email fragments, or user-provided HTML.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.2 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress HTML API

Use this skill when plugin code needs to read or modify HTML. The goal is to avoid regex-based HTML parsing and unsafe manual escaping. WordPress' HTML API understands malformed real-world HTML better than ad hoc string code and keeps escaping rules in one place.

This skill is not about React, Gutenberg editor internals, or client-side DOM work.

The HTML API is a parser and mutation API, **not an HTML sanitizer**. It
preserves existing scripts, event-handler attributes, and unsafe URL schemes,
and setter escaping only prevents broken markup. Sanitize untrusted HTML with
`wp_kses()`/`wp_kses_post()` at the trust boundary, then mutate the accepted
HTML. Validate values such as `href` by semantic type before setting them.

## When to use this skill

Trigger when ANY of the following is true:

- Code uses regex or `str_replace()` to modify HTML tags, attributes, classes, or text nodes.
- Code uses `DOMDocument` for frontend HTML fragments and then fights encoding, wrapper tags, or HTML5 parsing differences.
- The task mentions `WP_HTML_Tag_Processor`, `WP_HTML_Processor`, `set_attribute`, `add_class`, `serialize_token`, or `data-*` attributes.
- A plugin filters `the_content`, shortcode output, widget output, email HTML, REST-rendered HTML, or third-party markup.

## Pick the right processor

| Task | Prefer |
|---|---|
| Add/remove/read attributes on matching tags | `WP_HTML_Tag_Processor` |
| Add/remove classes on matching tags | `WP_HTML_Tag_Processor` |
| Replace text in modifiable text nodes | `WP_HTML_Tag_Processor::set_modifiable_text()` |
| Traverse nested structure or serialize matched tokens | `WP_HTML_Processor` |
| Normalize malformed HTML into well-formed HTML | `WP_HTML_Processor::normalize()` |
| Map between `data-*` HTML names and JS `dataset` names | `wp_js_dataset_name()` / `wp_html_custom_data_attribute_name()` |

For most plugin output filters, start with `WP_HTML_Tag_Processor`. Reach for `WP_HTML_Processor` only when you need document/fragment structure, nesting, or token serialization.

## Attribute and class mutation

```php
function myplugin_add_tracking_attr( string $html ): string {
    $processor = new WP_HTML_Tag_Processor( $html );

    while ( $processor->next_tag( array( 'tag_name' => 'a' ) ) ) {
        $href = $processor->get_attribute( 'href' );
        if ( ! is_string( $href ) || ! str_starts_with( $href, 'https://example.com/' ) ) {
            continue;
        }

        $processor->add_class( 'myplugin-tracked-link' );
        $processor->set_attribute( 'data-myplugin-source', 'content' );
    }

    return $processor->get_updated_html();
}
```

Important WP 6.9 behavior: `set_attribute()` and `set_modifiable_text()` escape all character references. Pass normal unescaped text. Do not pre-escape with `esc_attr()`, `esc_html()`, or `htmlspecialchars()` before calling these methods, or you will produce double-escaped output.

```php
// WRONG - pre-escaped value can become double-escaped.
$processor->set_attribute( 'title', esc_attr( 'Eggs & Milk' ) );

// RIGHT - pass the raw intended value; HTML API encodes it.
$processor->set_attribute( 'title', 'Eggs & Milk' );
```

## Text node mutation

`set_modifiable_text()` only works when the current token is modifiable text. It is not a general "replace all visible text" function.

```php
$processor = new WP_HTML_Tag_Processor( $html );

while ( $processor->next_token() ) {
    if ( '#text' !== $processor->get_token_type() ) {
        continue;
    }

    $text = $processor->get_modifiable_text();
    if ( null === $text ) {
        continue;
    }

    // "\u{1F642}" is the slightly-smiling-face code point, written as a PHP
    // escape so the source stays plain-ASCII (7.0+ double-quoted syntax).
    $processor->set_modifiable_text( str_replace( ':)', "\u{1F642}", $text ) );
}

$html = $processor->get_updated_html();
```

If the target text may be inside `script`, `style`, or complex nested content, inspect the processor behavior on the target WP version before shipping.

## Structural extraction

Use `WP_HTML_Processor` when you need safe token serialization or fragment-level structure:

```php
$processor = WP_HTML_Processor::create_fragment( $html );
$links     = array();

while ( $processor->next_tag( array( 'tag_name' => 'a' ) ) ) {
    $links[] = $processor->serialize_token();
}
```

In WP 6.9, `WP_HTML_Processor::serialize_token()` is public. It serializes the current token in normalized form; it is not a full `outerHTML` extractor for arbitrary subtrees unless you explicitly walk and collect the nested tokens you need.

## `data-*` attribute names

HTML `data-*` names and JS `dataset` properties do not map by simple dash removal in every case. For generated attributes that must line up with JS, use the core mapping helpers:

```php
$attribute = wp_html_custom_data_attribute_name( 'myPluginSource' );
if ( null !== $attribute ) {
    $processor->set_attribute( $attribute, 'content' );
}

$dataset_name = wp_js_dataset_name( 'data-my-plugin-source' );
```

## Critical rules

- **Do not parse HTML with regex** when the task is tag, attribute, class, or text-node aware.
- **Do not treat either processor as XSS filtering.** Apply a deliberate KSES
  policy to untrusted HTML and validate URL/attribute semantics separately.
- **Do not pre-escape values passed to HTML API setters.** Pass the intended raw string; the API encodes it.
- **Use `WP_HTML_Tag_Processor` first** for simple mutations; it is cheaper and simpler than structural processing.
- **Use `WP_HTML_Processor` for structure**, nested traversal, normalization, and `serialize_token()`.
- **Return `get_updated_html()`** after lexical updates; returning the original `$html` drops changes.
- **Test malformed HTML.** Plugin output often receives fragments, not clean full documents.

## Common mistakes

```php
// WRONG - regex breaks on attribute order, quotes, nesting, and malformed HTML.
$html = preg_replace( '/<a /', '<a rel="nofollow" ', $html );

// RIGHT
$p = new WP_HTML_Tag_Processor( $html );
while ( $p->next_tag( array( 'tag_name' => 'a' ) ) ) {
    $p->set_attribute( 'rel', 'nofollow' );
}
$html = $p->get_updated_html();

// WRONG - escapes before the API escapes.
$p->set_attribute( 'title', esc_attr( $title ) );

// RIGHT
$p->set_attribute( 'title', $title );
```

## Cross-references

- Run **`wp-security-audit`** when HTML contains user input or saved admin settings.
- Run **`wp-i18n-audit`** when replacing visible text with translated strings.
- Run **`wp-rest-api`** when HTML is returned from an endpoint and should instead be structured JSON.

## What this skill does NOT cover

- Client-side DOM manipulation.
- Gutenberg editor component development.
- KSES allowlist design beyond identifying where sanitization belongs.

## References

- WordPress 6.9 HTML API dev note: <https://make.wordpress.org/core/2025/11/21/updates-to-the-html-api-in-6-9/>
- `WP_HTML_Tag_Processor`: `wp-includes/html-api/class-wp-html-tag-processor.php`
- `WP_HTML_Processor`: `wp-includes/html-api/class-wp-html-processor.php`
- Dataset helpers: `wp-includes/script-loader.php`
- Official documentation: <https://developer.wordpress.org/reference/classes/wp_html_tag_processor/>
- Official documentation: <https://developer.wordpress.org/reference/classes/wp_html_processor/>
