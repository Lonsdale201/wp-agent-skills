---
name: wp-utf8-text
description: Handle UTF-8 and text encoding safely in WordPress plugins,
  especially on WP 6.9+ where wp_is_valid_utf8(), wp_scrub_utf8(), and
  noncharacter helpers replace older seems_utf8-style checks. Covers when
  to validate, scrub, reject, or preserve invalid bytes; wp_check_invalid_utf8
  behavior; XML/JSON/feed/export boundaries; and avoiding data loss from
  premature replacement. Use when processing imported text, CSV, XML, feeds,
  email, REST payloads, AI prompts, logs, filenames, or external API data.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.9 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress UTF-8 Text Handling

WordPress 6.9 modernized UTF-8 handling. New code should prefer the explicit UTF-8 helpers instead of older heuristics and hand-written byte regexes.

This skill is for server-side plugin text processing. It is not about block editor text controls.

## When to use this skill

Trigger when ANY of the following is true:

- Code uses `seems_utf8()`, `mb_check_encoding()`, `iconv()`, `utf8_encode()`, `utf8_decode()`, or byte-level regexes.
- A plugin imports or exports CSV, XML, feeds, JSON, email, AI prompt data, logs, filenames, or third-party API text.
- The task mentions invalid UTF-8, mojibake, replacement character `�`, XML generation, REST encoding errors, or noncharacters.

## The core helpers

| Need | Use |
|---|---|
| Check whether bytes are valid UTF-8 | `wp_is_valid_utf8( $bytes )` |
| Replace invalid UTF-8 spans with U+FFFD | `wp_scrub_utf8( $text )` |
| Detect Unicode noncharacters | `wp_has_noncharacters( $text )` |
| Legacy display/database helper | `wp_check_invalid_utf8( $text, $strip )` |

`seems_utf8()` is deprecated in WP 6.9. Use `wp_is_valid_utf8()` for validation.

## Validate, scrub, or reject

Pick behavior based on the boundary:

| Boundary | Preferred behavior |
|---|---|
| Admin text field save | Usually reject invalid UTF-8 with a validation error. |
| Frontend display of legacy stored text | Scrub for display if rejection is no longer possible. |
| XML, JSON, feed, sitemap, external API | Scrub or reject before serialization; invalid bytes can break the whole document. |
| Security-sensitive identifiers, slugs, tokens | Reject, do not scrub into a different value. |
| Logs/debug dumps | Preserve raw bytes if forensic fidelity matters; scrub only for display. |
| AI/LLM prompt payloads | Scrub before sending unless invalid bytes are semantically important. |

Replacing invalid bytes is lossy. Once U+FFFD is inserted, you cannot know what the original byte sequence was.

## Examples

Reject invalid imported text:

```php
$name = (string) ( $row['name'] ?? '' );

if ( ! wp_is_valid_utf8( $name ) ) {
    return new WP_Error(
        'myplugin_invalid_utf8',
        __( 'The imported name contains invalid UTF-8 bytes.', 'myplugin' )
    );
}
```

Scrub before XML output:

```php
$title = wp_scrub_utf8( (string) $title );

$xml .= '<title>' . esc_xml( $title ) . '</title>';
```

Preserve raw bytes as an encoded forensic value, scrub only a decoded copy for
display. Do not write invalid bytes directly to normal text meta/options: the
database charset layer may reject, strip, or alter them.

```php
$encoded = base64_encode( $payload );
update_post_meta( $post_id, '_myplugin_raw_payload_b64', $encoded );

$raw = base64_decode(
    (string) get_post_meta( $post_id, '_myplugin_raw_payload_b64', true ),
    true
);
if ( false === $raw ) {
    return new WP_Error( 'invalid_raw_payload', __( 'Stored payload is invalid.', 'myplugin' ) );
}
$safe_for_screen = wp_scrub_utf8( $raw );
echo esc_html( $safe_for_screen );
```

## `wp_check_invalid_utf8()`

`wp_check_invalid_utf8( $text, false )` returns an empty string for invalid UTF-8 on UTF-8 sites. Since WP 6.9, `wp_check_invalid_utf8( $text, true )` replaces invalid byte sequences with U+FFFD instead of silently removing them.

Use it when you are already in a WordPress escaping/sanitizing path that expects this helper. For new explicit validation logic, prefer `wp_is_valid_utf8()` and `wp_scrub_utf8()` because the intent is clearer.

## Noncharacters

Unicode noncharacters can be valid UTF-8 while still being inappropriate for interchange formats. Use `wp_has_noncharacters()` when producing XML, strict external API payloads, or data that will be consumed outside WordPress.

```php
if ( ! wp_is_valid_utf8( $text ) ) {
    return new WP_Error( 'invalid_utf8', __( 'Invalid text encoding.', 'myplugin' ) );
}

if ( wp_has_noncharacters( $text ) ) {
    return new WP_Error(
        'myplugin_noncharacter_text',
        __( 'The text contains Unicode noncharacters that cannot be exported.', 'myplugin' )
    );
}
```

## Critical rules

- **Do not use `seems_utf8()` in new code.** It is deprecated as of WP 6.9.
- **Do not scrub identifiers.** Reject invalid bytes for slugs, tokens, IDs, and security-sensitive values.
- **Do not scrub too early.** Replacement is lossy and may destroy useful import/debug information.
- **Validate before serialization boundaries.** XML, JSON, feed, sitemap, and external API payloads should not receive invalid bytes.
- **Call Unicode code-point helpers only after UTF-8 validation/scrubbing.**
  Noncharacter checks do not replace byte-sequence validation.
- **Remember ASCII ambiguity.** A string can be valid UTF-8 and still originate from a non-UTF-8 encoding if it contains only ASCII.

## Common mistakes

```php
// WRONG - deprecated and less explicit.
if ( ! seems_utf8( $value ) ) {
    $value = '';
}

// RIGHT - clear validation.
if ( ! wp_is_valid_utf8( $value ) ) {
    return new WP_Error( 'invalid_utf8', __( 'Invalid text encoding.', 'myplugin' ) );
}

// WRONG - silently changes an identifier.
$slug = sanitize_key( wp_scrub_utf8( $raw_slug ) );

// RIGHT - reject bad bytes before deriving identifiers.
if ( ! wp_is_valid_utf8( $raw_slug ) ) {
    return new WP_Error( 'invalid_slug_encoding', __( 'Invalid slug encoding.', 'myplugin' ) );
}
$slug = sanitize_key( $raw_slug );
```

## Cross-references

- Run **`wp-security-audit`** when invalid text comes from uploads, REST, AJAX, or third-party APIs.
- Run **`wp-rest-api`** when text is accepted or returned through REST schemas.
- Run **`wp-html-api`** when text is being inserted into HTML fragments.

## What this skill does NOT cover

- Full charset conversion from legacy encodings such as Windows-1250 or ISO-8859-2.
- Browser-side text handling.
- Translation/i18n placeholder correctness.

## References

- WordPress 6.9 UTF-8 dev note: <https://make.wordpress.org/core/2025/11/18/modernizing-utf-8-support-in-wordpress-6-9/>
- UTF-8 helpers: `wp-includes/utf8.php`
- `wp_check_invalid_utf8()` / `seems_utf8()`: `wp-includes/formatting.php`
