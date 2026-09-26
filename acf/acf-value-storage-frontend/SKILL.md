---
name: acf-value-storage-frontend
description: >-
  Implements and diagnoses Advanced Custom Fields value storage, programmatic
  writes, database inspection, and frontend rendering. Covers the value row plus
  hidden field-key reference, post/user/term/comment/options targets, field-key
  first writes, raw versus formatted get_field values, return formats, escaping,
  cache behavior, and meta queries. Use when adding an ACF-backed meta value,
  importing data, displaying fields in a template or shortcode, debugging values
  that exist in the database but format incorrectly, or reviewing direct meta SQL.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF value storage and frontend rendering

ACF normally stores a field as a pair:

```text
acme_event_start   = 2026-10-20 18:00:00
_acme_event_start  = field_acme_event_start
```

The visible row contains the raw value. The underscore-prefixed row maps the
field name to its stable field key, which lets ACF find the field type and apply
the correct load/format behavior. A raw meta value without a valid reference can
look present in SQL while `get_field()` returns an unformatted value, no value,
or a value governed by a different field definition.

## Storage locations

| ACF `$post_id` | WordPress storage | Example value/reference keys |
|---|---|---|
| `123` | `wp_postmeta` | `field_name`, `_field_name` |
| `user_12` | `wp_usermeta` | `field_name`, `_field_name` |
| `term_34` or `category_34` | `wp_termmeta` | `field_name`, `_field_name` |
| `comment_56` | `wp_commentmeta` | `field_name`, `_field_name` |
| `option` or `options` | `wp_options` | `options_field_name`, `_options_field_name` |
| custom option target such as `option_brand_a` | `wp_options` | `option_brand_a_field_name`, `_option_brand_a_field_name` |

Numeric IDs mean posts. Pass the explicit prefixed target for every other object;
do not rely on the current global object in imports, cron, REST, or CLI code.

## Read with the shape you intend to render

```php
$post_id = get_the_ID();

// Plain text: format through ACF, then escape for this HTML context.
$eyebrow = get_field( 'acme_eyebrow', $post_id );
if ( is_string( $eyebrow ) && '' !== $eyebrow ) {
    echo '<p class="eyebrow">' . esc_html( $eyebrow ) . '</p>';
}

// WYSIWYG: ask ACF 6.2.6+ for its field-aware safe HTML value.
$body = get_field( 'acme_body', $post_id, true, true );
if ( is_string( $body ) && '' !== $body ) {
    echo $body; // ACF returned the escaped/formatted value.
}

// Image configured to return an attachment ID.
$image_id = (int) get_field( 'acme_image', $post_id );
if ( $image_id ) {
    echo wp_get_attachment_image( $image_id, 'large' );
}
```

`get_field( $selector, $post_id, $format_value, $escape_html )` has two distinct
switches:

- formatted `true` applies the field type's return format and format filters;
- escaped `true` asks ACF for an HTML-safe formatted value and requires formatted
  to also be `true`;
- formatted `false` returns the raw database shape after WordPress unserializes
  metadata. It does not mean "safe to output."

Prefer `get_field()` when ACF owns the schema. Use `get_post_meta()` or the
matching core metadata API when code intentionally needs the raw storage value
or the value is ordinary WordPress meta that ACF does not own.

## Write through ACF

Use the field key for a first write so ACF can create both the value and reference
rows. Later writes by name work once the reference exists, but key-based imports
remain clearer and survive ambiguous field names.

```php
$saved = update_field(
    'field_acme_event_start',
    '2026-10-20 18:00:00',
    $post_id
);

if ( false === $saved ) {
    // False can also mean that the stored value was unchanged; verify the value
    // before treating this as an operational failure.
}
```

Do not create only `_field_name`, copy a field key from another field, or bulk
write complex ACF values with `$wpdb`. `update_field()` runs the field type's
`acf/update_value` pipeline, writes the reference, removes obsolete nested rows
where supported, and clears ACF's request cache.

## Raw and formatted shapes

The field settings decide the public shape. Code must not infer it from the label
or field name.

| Field configuration | Typical raw storage | Typical formatted value |
|---|---|---|
| Text, number, URL, date/time | scalar string | string or field-specific scalar |
| True/False | `0` or `1` | boolean-like value |
| Image/File | attachment ID | ID, URL, or array according to Return Format |
| Link | serialized array | array containing URL, title, and target |
| Select/Checkbox | scalar or serialized array | value(s), or value/label arrays when configured |
| Relationship/Post Object | ID or serialized ID array | ID(s) or object(s) according to Return Format |
| Group | flattened child meta rows | associative array of formatted child values |
| Repeater | parent row count plus flattened child rows | array of formatted rows; **PRO** |
| Flexible Content | layout-name array plus flattened child rows | layout rows; **PRO** |

WordPress serializes arrays placed in a single metadata row. ACF complex fields
may instead use several flattened rows; inspect the field type before writing a
migration or query.

## Query the raw value, render the formatted value

`WP_Query` and metadata SQL see stored values, not `get_field()` return formats.
An image field configured to return an array still stores an attachment ID. A
Relationship field returning `WP_Post` objects still stores IDs. Build queries
against the verified raw shape, then render through ACF.

Serialized multi-value fields are a weak database index. A quoted-ID `LIKE`
query can avoid matching `12` inside `312`, but it remains unindexed and should
not become the primary model for large or frequently queried relationships.
Use taxonomies, dedicated relationship tables, or a purpose-built post model
when querying is central to the feature.

## Diagnose a missing or wrong value

1. Resolve the exact `$post_id` target and field selector.
2. Confirm the field definition is registered before the read.
3. Inspect both the value row and `_field_name` reference.
4. Resolve that reference to the expected field key and type.
5. Compare `get_field( ..., false )` raw output with formatted output.
6. Check `acf/load_value`, `acf/format_value`, and type/name/key variations.
7. If code mixed raw metadata writes and ACF reads in one request, repeat through
   `update_field()` or explicitly account for ACF's value cache.

## Runtime characterization

The bundled [WP-CLI smoke plugin](examples/acf-skills-smoke/acf-skills-smoke.php)
registers a disposable schema and verifies post, user, term, custom-options,
Relationship, Group, escaped reads, and a custom field type under Free and PRO;
when PRO is active it also verifies Repeater storage. It is pinned to ACF 6.8.10
and deletes its fixtures in a `finally` block.

Run it only on an authorized disposable installation. Define
`ACF_SKILLS_SMOKE_ALLOW_WRITES` as `true` before WordPress loads, activate the
example plugin, and run:

```text
wp acf-skills-smoke run --confirm-disposable
```

Deactivate and remove the example afterward. Keep environment names, server
paths, database prefixes, and run output outside the public skill collection.

## Cross-references

- `acf-field-group-development` for stable field definitions and deployment.
- `acf-relational-fields` for ID/object return formats and reverse relations.
- `acf-pro-complex-fields` for flattened Repeater and Flexible Content storage.

## References

- [Official `get_field()` documentation](https://www.advancedcustomfields.com/resources/get_field/).
- [Official `update_field()` documentation](https://www.advancedcustomfields.com/resources/update_field/).
- [Official HTML escaping guide](https://www.advancedcustomfields.com/resources/html-escaping/).
- [Official field-function behavior since ACF 5.11](https://www.advancedcustomfields.com/resources/acf-field-functions/).
- Verified ACF 6.8.10 source paths:
  - `includes/api/api-template.php`
  - `includes/acf-value-functions.php`
  - `includes/acf-meta-functions.php`
  - `includes/acf-wp-functions.php`
  - `src/Meta/MetaLocation.php`
  - `src/Meta/Post.php`
  - `src/Meta/User.php`
  - `src/Meta/Term.php`
  - `src/Meta/Option.php`
