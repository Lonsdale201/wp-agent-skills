---
name: polylang-object-translations
description: "Create, read, link, and update translated posts and terms with Polylang 3.8.5. Covers pll_get_post, pll_get_term, pll_get_post_language, pll_get_term_language, pll_save_post_translations, pll_save_term_translations, pll_insert_post, pll_insert_term, pll_update_post, pll_update_term, translation group storage, language assignment order, media translation caveats, and why direct DB writes to language/post_translations/term_translations are unsafe. Use when a plugin imports multilingual content, syncs CPTs/taxonomies, maps IDs across languages, or repairs translation groups."
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: polylang
plugin-version-tested: "Polylang 3.8.5"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-01"
docs:
  - https://polylang.pro/doc/function-reference/
  - https://polylang.pro/doc/developpers-how-to/
source-refs:
  - wp-content/plugins/polylang/src/api.php
  - wp-content/plugins/polylang/src/translated-object.php
  - wp-content/plugins/polylang/src/translated-post.php
  - wp-content/plugins/polylang/src/translated-term.php
  - wp-content/plugins/polylang/src/crud-posts.php
  - wp-content/plugins/polylang/src/crud-terms.php
  - wp-content/plugins/polylang/src/translatable-object.php
---

# Polylang Object Translations

Use this skill when code needs to read or write the relationship between translated posts or translated terms.

Polylang stores language and translation relationships through private taxonomies, not custom tables:

| Object | Language taxonomy | Translation group taxonomy |
|---|---|---|
| Posts/CPTs/attachments | `language` | `post_translations` |
| Terms | `term_language` | `term_translations` |

Do not write those terms or term descriptions directly. Use Polylang APIs so caches, cleanup, validation, and synchronization hooks run.

## Resolve translated IDs

For posts:

```php
$translated_id = pll_get_post( $post_id, 'fr' );

if ( $translated_id > 0 ) {
    $post = get_post( $translated_id );
}
```

For terms:

```php
$translated_term_id = pll_get_term( $term_id, 'fr' );
```

Important return behavior in Polylang 3.8.5:

- `pll_get_post()` returns an integer ID.
- `pll_get_term()` returns an integer ID.
- Missing translation, invalid language, or object without language returns `0`, not `false`.
- If the requested language is the object's own language, the original ID is returned.

When `$lang` is omitted, both functions use `pll_current_language()`. In cron, CLI, imports, and many admin tasks, pass the language explicitly.

## Read language and groups

```php
$post_lang = pll_get_post_language( $post_id );          // slug or false.
$term_lang = pll_get_term_language( $term_id, 'locale' );
$lang_obj  = pll_get_post_language( $post_id, \OBJECT );

$post_translations = pll_get_post_translations( $post_id );
$term_translations = pll_get_term_translations( $term_id );
```

Translation arrays are keyed by language slug and contain object IDs:

```php
array(
    'en' => 123,
    'fr' => 456,
)
```

Only trust arrays returned by Polylang. The model validates languages and object IDs before saving.

## Create posts with language

Polylang 3.7+ provides `pll_insert_post()` and `pll_update_post()` wrappers:

```php
$post_id = pll_insert_post(
    array(
        'post_type'   => 'book',
        'post_status' => 'publish',
        'post_title'  => 'Hello',
    ),
    'en'
);

if ( is_wp_error( $post_id ) ) {
    return $post_id;
}
```

Create a translation and link it in one pass:

```php
$fr_id = pll_insert_post(
    array(
        'post_type'    => 'book',
        'post_status'  => 'publish',
        'post_title'   => 'Bonjour',
        'translations' => array(
            'en' => $post_id,
        ),
    ),
    'fr'
);
```

Update language or group on an existing post:

```php
$result = pll_update_post( array(
    'ID'           => $fr_id,
    'lang'         => 'fr',
    'translations' => array(
        'en' => $post_id,
        'fr' => $fr_id,
    ),
) );
```

`pll_insert_post()` returns `WP_Error( 'invalid_language' )` for an invalid language. Do not call `wp_insert_post()` and patch Polylang's private taxonomies by hand.

## Create terms with language

Use the term wrappers:

```php
$term = pll_insert_term(
    'News',
    'category',
    'en',
    array(
        'slug' => 'news',
    )
);

if ( is_wp_error( $term ) ) {
    return $term;
}
```

Create and link a translated term:

```php
$fr_term = pll_insert_term(
    'Actualites',
    'category',
    'fr',
    array(
        'slug'         => 'actualites',
        'translations' => array(
            'en' => (int) $term['term_id'],
        ),
    )
);
```

Update:

```php
pll_update_term( (int) $fr_term['term_id'], array(
    'lang'         => 'fr',
    'translations' => array(
        'en' => (int) $term['term_id'],
        'fr' => (int) $fr_term['term_id'],
    ),
) );
```

Term parents are language-sensitive. When creating hierarchical translated terms, translate the parent ID first.

## Link existing objects

When objects already exist, set language before saving translations:

```php
pll_set_post_language( $en_id, 'en' );
pll_set_post_language( $fr_id, 'fr' );

$saved = pll_save_post_translations( array(
    'en' => $en_id,
    'fr' => $fr_id,
) );
```

For terms:

```php
pll_set_term_language( $en_term_id, 'en' );
pll_set_term_language( $fr_term_id, 'fr' );

$saved = pll_save_term_translations( array(
    'en' => $en_term_id,
    'fr' => $fr_term_id,
) );
```

`pll_set_post_language()` and `pll_set_term_language()` return `true` only when the assignment changed successfully. They return `false` if the object already has that language or if assignment fails. Do not treat `false` as a fatal error without checking current state.

## Translatable type requirement

Post and term APIs only make sense for object types Polylang manages:

```php
if ( ! pll_is_translated_post_type( get_post_type( $post_id ) ) ) {
    return;
}

$term = get_term( $term_id );
if ( $term instanceof WP_Term && ! pll_is_translated_taxonomy( $term->taxonomy ) ) {
    return;
}
```

Register custom CPTs/taxonomies for translation with `pll_get_post_types` or `pll_get_taxonomies` early. See `polylang-language-api`.

## Media caveat

Attachments are translated only when Polylang media support is enabled. `pll_get_post( $attachment_id, $lang )` still returns `0` if the attachment has no translation.

Do not duplicate attachment rows manually unless you also need all attachment metadata, file references, alt text, language, and translation group handling. Polylang's model has internal media translation behavior and fires `pll_translate_media` after creating a media translation.

## Imports and migrations

Safe import order:

1. Ensure languages exist and collect explicit slugs.
2. Register CPT/taxonomy translation support before importing.
3. Insert original objects with `pll_insert_post()` or `pll_insert_term()`.
4. Insert translations with `translations` arrays or link existing IDs with `pll_save_*_translations()`.
5. Resolve relationship fields after all target translations exist.
6. Flush rewrite rules only if translated slugs or rewrite structures changed.

Do not rely on the current language during imports. Use explicit source and target slugs.

## Hooks worth knowing

- `pll_save_post` fires after post language/translations are saved.
- `pll_save_term` fires after term language/translations are saved.
- `pll_translate_media` fires after media translation creation.
- `pll_maybe_translate_term` lets sync code substitute a term ID while copying taxonomy relations.

Hook only when you need to cooperate with Polylang's save/sync pipeline. Avoid recursive writes without a re-entry guard.

## Common mistakes

- Saving translations before every object has a language.
- Comparing `pll_get_post()` result with `false` instead of checking `> 0`.
- Linking IDs from different post types or taxonomies into one translation group.
- Updating `post_translations` or `term_translations` term descriptions directly.
- Using `get_term_by( 'slug', ... )` without `lang => ''` or without translating term IDs.
- Assuming a translated post's slug must be unique globally. Polylang Pro can share slugs by language.

## Verification

Local source checked against:

- API wrappers and return values: `wp-content/plugins/polylang/src/api.php`
- Translation group storage and validation: `src/translated-object.php`
- Post type and post translation behavior: `src/translated-post.php`
- Term language, WXR group behavior, and term wrappers: `src/translated-term.php`
