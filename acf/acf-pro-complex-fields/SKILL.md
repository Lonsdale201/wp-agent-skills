---
name: acf-pro-complex-fields
description: >-
  Builds and reviews ACF PRO Repeater, Flexible Content, Gallery, and Clone
  fields. Covers their flattened database shapes, field-key update arrays,
  have_rows and get_sub_field loops, layout dispatch, safe rendering, nested
  cleanup, pagination limits, migration risks, and performance boundaries. Use
  when implementing repeated rows, modular page sections, galleries, reused
  field definitions, or debugging missing subfields and orphaned meta after a
  programmatic update. Requires ACF PRO; Group fields are identified separately
  because Group is available in Free.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields-pro"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF PRO complex fields

This skill requires **ACF PRO**. Repeater, Flexible Content, Gallery, and Clone
are not Free fields. The similarly nested **Group** field is available in Free
and PRO and is mentioned only where its storage shape helps comparison.

## Know the raw contract

| Field | Parent raw value | Child/raw storage |
|---|---|---|
| Repeater | row count, or empty string | `field_name_0_sub_name`, `field_name_1_sub_name`, plus reference rows |
| Flexible Content | ordered serialized array of layout names | `field_name_0_sub_name` rows plus layout metadata |
| Gallery | serialized attachment-ID array | no per-image ACF child rows |
| Clone | no independent content model of its own | selected fields save through their cloned definitions; optional name prefixing changes the resulting field names |
| Group (**Free**) | wrapper value plus flattened children | `group_name_sub_name` rows plus references |

Formatted reads rebuild nested arrays from these rows. Do not treat a Repeater
or Flexible Content value as one serialized blob and do not rename a parent or
subfield without migrating the flattened meta keys.

## Programmatic writes

Use the parent field key and subfield keys for imports. This removes ambiguity
and lets ACF update reference rows and delete rows that no longer exist.

```php
update_field(
    'field_acme_team_members',
    array(
        array(
            'field_acme_member_name' => 'Ada',
            'field_acme_member_role' => 'Engineer',
        ),
        array(
            'field_acme_member_name' => 'Lin',
            'field_acme_member_role' => 'Designer',
        ),
    ),
    $post_id
);
```

Flexible Content rows also require `acf_fc_layout`:

```php
update_field(
    'field_acme_sections',
    array(
        array(
            'acf_fc_layout'          => 'hero',
            'field_acme_hero_title'  => 'Build clearly',
            'field_acme_hero_image'  => $attachment_id,
        ),
        array(
            'acf_fc_layout'         => 'quote',
            'field_acme_quote_text' => 'Structure is part of the API.',
        ),
    ),
    $post_id
);
```

Pass Gallery attachment IDs. Do not write formatted image arrays back into the
raw field. Validate attachment existence, MIME type, and access before saving.

Avoid direct `update_post_meta()` loops for complex fields. A shorter new value
must remove obsolete row metadata, and each child needs the correct hidden field
reference. A raw write often leaves ghost rows that reappear during later edits.

## Render Repeater rows

```php
if ( have_rows( 'acme_team_members', $post_id ) ) {
    echo '<ul class="team">';

    while ( have_rows( 'acme_team_members', $post_id ) ) {
        the_row();

        $name = get_sub_field( 'name' );
        $role = get_sub_field( 'role' );

        if ( ! is_string( $name ) || '' === $name ) {
            continue;
        }

        echo '<li><strong>' . esc_html( $name ) . '</strong>';
        if ( is_string( $role ) && '' !== $role ) {
            echo ' <span>' . esc_html( $role ) . '</span>';
        }
        echo '</li>';
    }

    echo '</ul>';
}
```

`have_rows()` maintains loop state. Do not call it speculatively in helpers that
also run the same loop, and reset/restructure code that nests loops over the same
field. For random access or transformations, call `get_field()` once and work on
the returned array.

## Dispatch Flexible Content by layout

```php
while ( have_rows( 'acme_sections', $post_id ) ) {
    the_row();

    switch ( get_row_layout() ) {
        case 'hero':
            get_template_part( 'template-parts/section', 'hero' );
            break;

        case 'quote':
            get_template_part( 'template-parts/section', 'quote' );
            break;
    }
}
```

Use an allowlisted mapping from layout name to renderer. Never build an include
path directly from stored layout data. Each renderer owns validation and output
escaping for its subfields.

## Clone fields

Clone reuses field definitions; it is not a relational pointer to another
object's values. Review its Display and Prefix settings before reading or
migrating data:

- seamless display can make cloned fields look like direct siblings;
- group display returns a nested wrapper;
- Prefix Field Names can change the effective storage/API names;
- changing prefix/display strategy after content exists can move the expected
  meta keys without moving stored data.

Resolve the final prepared field definitions and inspect real saved metadata
before writing migration code. Do not update a guessed "clone value" as if the
Clone field stored one independent payload.

## Performance boundary

- Repeater pagination reduces rows rendered in the admin; it does not paginate
  template values or REST output.
- Nested Repeaters/Flexible Content multiply field lookups and generated inputs.
- `get_field()` loads the complete formatted structure. Avoid it for an
  unbounded dataset when the request needs only one page.
- Large, searchable, sortable, independently addressable records belong in a
  custom post type, taxonomy, or dedicated table rather than a Repeater.
- Gallery stores IDs, but rendering full arrays and image metadata can still be
  expensive. Choose image sizes and lazy-loading behavior deliberately.

## Migration checklist

1. Snapshot the old field definitions and raw meta key patterns.
2. Register the new definitions before reading old values.
3. Read old raw values, normalize them, and write through `update_field()` using
   stable parent and subfield keys.
4. Verify formatted frontend output and the editor after reload.
5. Confirm removed rows and their underscore references are gone.
6. Keep the migration idempotent and record completion outside the content rows.

## Cross-references

- `acf-value-storage-frontend` for reference rows, object targets, and escaping.
- `acf-field-group-development` for stable parent/subfield definitions.

## References

- [Official Repeater documentation](https://www.advancedcustomfields.com/resources/repeater/).
- [Official Flexible Content documentation](https://www.advancedcustomfields.com/resources/flexible-content/).
- [Official Gallery documentation](https://www.advancedcustomfields.com/resources/gallery/).
- [Official Clone documentation](https://www.advancedcustomfields.com/resources/clone/).
- [Official nested Repeater guide](https://www.advancedcustomfields.com/resources/working-with-nested-repeaters/).
- Verified ACF PRO 6.8.10 source paths:
  - `pro/fields/class-acf-field-repeater.php`
  - `pro/fields/class-acf-field-flexible-content.php`
  - `pro/fields/class-acf-field-gallery.php`
  - `pro/fields/class-acf-field-clone.php`
- Verified shared source path:
  - `includes/fields/class-acf-field-group.php`
