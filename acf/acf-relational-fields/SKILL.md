---
name: acf-relational-fields
description: >-
  Implements and reviews ACF Relationship, Post Object, User, and Taxonomy
  fields. Covers raw ID storage versus ID/object return formats, single and
  multiple values, native bidirectional settings, taxonomy save/load term side
  effects, reverse meta queries, object targeting, authorization, and bounded
  frontend rendering. Use when connecting posts, users, or terms with ACF,
  building related-content templates, importing relations, enabling
  bidirectionality, or debugging a relation that appears on only one side.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF relational fields

Relationship, Post Object, User, and Taxonomy fields are available in ACF Free
and PRO 6.8.10. Their editor controls, storage, and return values solve different
parts of the problem: raw metadata stores identifiers, Return Format controls
what templates receive, and optional bidirectionality writes a second ACF field
on the related object.

## Choose the field deliberately

| Field | Best fit | Raw value |
|---|---|---|
| Relationship | Curated, ordered set of posts with search/filter UI | serialized array of post IDs |
| Post Object | One post or a simpler multi-post selector | post ID or serialized ID array |
| User | One or more WordPress users | user ID or serialized ID array |
| Taxonomy | One or more terms, optionally synchronized to native object terms | term ID or serialized ID array |

Return Format does not rewrite the raw IDs. It controls whether `get_field()`
returns IDs or hydrated `WP_Post`, `WP_User`, or `WP_Term` objects. Configure and
document the format rather than accepting either shape everywhere.

## Render IDs with explicit object checks

ID return formats keep the boundary clear and allow code to use the canonical
WordPress loaders.

```php
$related_ids = get_field( 'acme_related_articles', get_the_ID() );
$related_ids = is_array( $related_ids ) ? array_map( 'absint', $related_ids ) : array();

foreach ( array_slice( array_filter( $related_ids ), 0, 12 ) as $related_id ) {
    $related = get_post( $related_id );
    if ( ! $related || 'publish' !== $related->post_status ) {
        continue;
    }

    printf(
        '<a href="%s">%s</a>',
        esc_url( get_permalink( $related ) ),
        esc_html( get_the_title( $related ) )
    );
}
```

Do not trust a saved relation as authorization. Recheck visibility, post status,
capabilities, tenancy, or membership rules at the point of use. An editor who
could select an object earlier does not guarantee the current visitor may read
it now.

## Write relations with field keys

```php
update_field(
    'field_acme_related_articles',
    array_values( array_unique( array_map( 'absint', $candidate_ids ) ) ),
    $post_id
);
```

Validate that every ID belongs to an allowed object type before saving. Preserve
order for Relationship fields when order is meaningful. Use the field key for
first writes so ACF creates the hidden reference row.

## Native bidirectional relations

ACF 6.2+ can update target fields automatically for Relationship, Post Object,
User, and Taxonomy fields. Use the field's Bidirectional setting when both sides
are truly part of the schema.

Key constraints:

- target fields must be top-level fields; nested Group, Repeater, Flexible
  Content, and Clone descendants are not supported targets;
- reverse updates do not reliably enforce a target field's single-value or
  maximum-count UI constraint, so bidirectionality does not create a strict
  one-to-one database invariant;
- both field definitions must be loaded during every write path, including
  imports, REST, CLI, cron, and background jobs;
- do not add a second `acf/update_value` mirror beside native bidirectionality or
  the two mechanisms can recurse, duplicate values, and undo each other;
- removing a relation is part of the contract: test add, replace, and delete on
  both objects.

For a strict one-to-one or transactional relationship, use a model that can
enforce uniqueness rather than relying on two serialized metadata values.

## Taxonomy fields have two possible stores

The Taxonomy field's `save_terms` and `load_terms` settings connect ACF metadata
to WordPress's native object-term relationships.

- With Save Terms enabled, saving the ACF field also updates the object's native
  terms.
- With Load Terms enabled, the editor value is populated from native terms.
- With both disabled, the selection is only ACF metadata.

Choose one source of truth. Code that independently calls `wp_set_object_terms()`
and `update_field()` can create last-writer-wins behavior or confusing admin
values. Use native taxonomies when archive URLs, term queries, counts, and indexed
filtering are required.

## Reverse lookups

A multiple Relationship/Post Object/User/Taxonomy value is serialized in one
metadata row. A reverse query therefore commonly uses a quoted identifier:

```php
$query = new WP_Query( array(
    'post_type'      => 'book',
    'posts_per_page' => 20,
    'meta_query'     => array(
        array(
            'key'     => 'acme_related_author',
            'value'   => '"' . $author_id . '"',
            'compare' => 'LIKE',
        ),
    ),
) );
```

The quotes reduce false matches inside PHP serialization; the query is still an
unindexed wildcard scan. Bound it and measure it. For frequently queried reverse
relations, enable a suitable bidirectional target field, use a taxonomy, or keep
an indexed relationship table maintained by the owning plugin.

Single-value fields can use `=` against the stored ID, but first confirm the
field is configured as single and inspect its raw value. The formatted object
shape never belongs in `meta_query`.

## Critical rules

- Store IDs; hydrate objects at the read boundary.
- Normalize single and multiple modes separately. Do not cast an object-return
  field to an integer and hope its shape is stable.
- Treat Return Format as an API contract and regression-test changes.
- Keep related object visibility and permissions in the frontend/API layer.
- Avoid N+1 rendering: bound result counts and prime/load objects in batches for
  large lists.
- Use native taxonomy relationships when the feature needs taxonomy queries.

## Cross-references

- `acf-value-storage-frontend` for reference rows and raw/formatted reads.
- `acf-field-group-development` for stable keys, names, and location rules.

## References

- [Official Relationship field documentation](https://www.advancedcustomfields.com/resources/relationship/).
- [Official bidirectional relationships guide](https://www.advancedcustomfields.com/resources/bidirectional-relationships/).
- [Official Post Object field documentation](https://www.advancedcustomfields.com/resources/post-object/).
- [Official User field documentation](https://www.advancedcustomfields.com/resources/user/).
- [Official Taxonomy field documentation](https://www.advancedcustomfields.com/resources/taxonomy/).
- Verified ACF 6.8.10 source paths:
  - `includes/fields/class-acf-field-relationship.php`
  - `includes/fields/class-acf-field-post_object.php`
  - `includes/fields/class-acf-field-user.php`
  - `includes/fields/class-acf-field-taxonomy.php`
  - `includes/acf-bidirectional-functions.php`
