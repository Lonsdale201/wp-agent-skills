---
name: polylang-pro-slugs-sync-acf
description: "Work with Polylang Pro 3.8.5 features that affect plugin/theme compatibility: translated slugs, shared slugs, duplicate/sync post workflows, ACF Pro integration, translated ACF labels, ACF field translation strategies, import/export/machine-translation hooks, and sync metadata filters. Use when code touches rewrite slugs, custom permalink structures, duplicated translations, synchronized custom fields, ACF fields containing post/term/media IDs, ACF field groups, or hooks such as pll_translated_slugs, pll_sync_post_fields, pll_copy_post_metas, pll_translate_post_meta, pll_post_synchronized, pll_created_sync_post, or pll_enable_acf_labels_translation."
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "polylang-pro"
  wp-skills-plugin-version-tested: "Polylang Pro 3.8.5"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-01"
---

# Polylang Pro Slugs, Sync, and ACF

Use this skill when compatibility depends on Pro-only behavior rather than the core Polylang API.

Polylang Pro 3.8.5 adds major behavior in three areas:

- translated and shared slugs;
- duplicate/sync workflows;
- ACF Pro integration.

Guard Pro-only code:

```php
if ( ! defined( 'POLYLANG_PRO' ) ) {
    return;
}
```

## Translated rewrite slugs

Polylang Pro translates rewrite slugs through strings translation. The model scans registered post types, archives, taxonomies, post formats, and miscellaneous bases such as `author`, `search`, `attachment`, `page`, and the front base.

It stores the computed map in the transient `pll_translated_slugs` and refreshes rewrite rules after string translations are saved.

Add your plugin's custom slug source with:

```php
add_filter(
    'pll_translated_slugs',
    static function ( array $slugs, PLL_Language $language, PLL_MO $mo ): array {
        $source = 'courses';

        $slugs['myplugin_courses']['slug'] = $source;
        $translated = $mo->translate( $source );
        $slugs['myplugin_courses']['translations'][ $language->slug ] = $translated ?: $source;

        return $slugs;
    },
    10,
    3
);
```

Rules:

- Register CPTs and taxonomies before `wp_loaded`; Pro initializes translated slugs on `wp_loaded` priority 1.
- Flush rewrite rules when your base slug changes, not on every request.
- Do not read `get_option( 'rewrite_rules' )` and mutate rules manually. Hook Polylang's slug filters and let the model rebuild.
- Expect object caches: Pro deletes the transient option row explicitly when an external object cache is active.

## Shared slugs

Polylang Pro can allow translated posts or terms to share the same slug in different languages. It filters slug uniqueness and query resolution by language.

Compatibility rule: never assume `post_name` or term slug is globally unique.

Bad:

```php
$post = get_page_by_path( $slug, \OBJECT, 'page' );
```

Safer:

```php
$post_id = pll_get_post( $source_post_id, $target_lang );
```

If you must query by slug, include language in the query:

```php
$query = new WP_Query( array(
    'name'      => sanitize_title( $slug ),
    'post_type' => 'book',
    'lang'      => $target_lang,
) );
```

Pro's shared post slug class adds joins and where clauses for name and pagename queries. Custom SQL must do the same through Polylang's model or avoid slug lookup entirely.

## Duplicate and sync workflows

Polylang Pro's sync model can copy or synchronize posts. It sets language early, saves translation groups, copies taxonomies and metas through Polylang sync services, and fires hooks:

- `pll_created_sync_post`
- `pll_save_post`
- `pll_post_synchronized`
- `pll_sync_post_fields`
- `pll_copy_taxonomies`
- `pll_copy_post_metas`
- `pll_translate_post_meta`

Use hooks instead of re-copying all data after the fact.

Example: exclude volatile meta from sync:

```php
add_filter(
    'pll_copy_post_metas',
    static function ( array $keys, bool $sync, int $from, int $to, string $lang ): array {
        if ( 'book' !== get_post_type( $from ) ) {
            return $keys;
        }

        return array_diff( $keys, array( '_myplugin_render_cache', '_myplugin_last_webhook_id' ) );
    },
    10,
    5
);
```

Example: translate stored IDs while copying:

```php
add_filter(
    'pll_translate_post_meta',
    static function ( $value, string $key, string $lang, int $from, int $to ) {
        if ( '_myplugin_related_book' !== $key || ! is_numeric( $value ) ) {
            return $value;
        }

        $translated = pll_get_post( (int) $value, $lang );
        return $translated ?: $value;
    },
    10,
    5
);
```

Do not call private Pro internals unless no public/hook-based integration exists. If you must interact with `PLL()->sync_post_model`, wrap it in `defined( 'POLYLANG_PRO' )`, `isset()`, and method checks because it is not a public stable API.

## ACF Pro integration

Polylang Pro's ACF integration requires ACF 6.0+. It is bootstrapped under `WP_Syntex\Polylang_Pro\Integrations\ACF`.

Important 3.7+ model:

- ACF field groups are not translated anymore.
- Field groups can be displayed by language using a custom ACF location rule.
- ACF labels are translated through strings translation.
- ACF custom field values are handled by Pro's strategy system, not by raw `post_meta` sync.

Polylang Pro adds a field setting named `translations` with these choices:

| Choice | Meaning |
|---|---|
| `ignore` | Do not copy/sync/translate this field. |
| `copy_once` | Copy when creating a translation, then allow divergence. |
| `translate` | Translate value through import/export/machine translation flows. |
| `translate_once` | Translate when creating/importing, then allow divergence. |
| `sync` | Keep synchronized across translations. |

Text-like fields get `translate` and `translate_once`; other fields typically get copy/sync choices.

## ACF relationship IDs

ACF fields often store post IDs, term IDs, media IDs, or nested arrays containing them. Pro's Dispatcher registers collectors and translators:

- `pll_collect_post_ids`
- `pll_collect_term_ids`
- `pll_translate_blocks_with_context`
- `pll_filter_translated_post`
- `acf/fields/relationship/query`
- `acf/fields/post_object/query`

If your custom ACF field type stores IDs in a custom shape, integrate with these collectors so Pro can export/import and sync them.

Pattern for a custom stored post ID:

```php
add_filter( 'pll_translate_post_meta', static function ( $value, $key, $lang ) {
    if ( '_myplugin_acf_extra_post' !== $key || ! is_numeric( $value ) ) {
        return $value;
    }

    return pll_get_post( (int) $value, $lang ) ?: $value;
}, 10, 3 );
```

For fields owned by ACF itself, do not duplicate ACF's own meta keys manually. Pro removes ACF metas from generic Polylang sync so its ACF strategy layer can handle them.

## ACF labels

ACF field-group, field, custom post type, and taxonomy labels can be translated. The feature can be disabled:

```php
add_filter( 'pll_enable_acf_labels_translation', '__return_false' );
```

Use this only when another system fully owns ACF label translation. Otherwise leave it enabled and keep labels as stable source strings.

You can extend the field label keys that Polylang translates:

```php
add_filter( 'pll_acf_field_labels_to_translate', static function ( array $labels ): array {
    $labels['my_custom_field_type'][] = 'button_label';
    return $labels;
} );
```

## Common mistakes

- Assuming ACF field groups are translated posts in Pro 3.7+. They are not.
- Copying raw ACF meta after Pro has already applied ACF strategies.
- Looking up translated content by slug without a language filter when shared slugs are enabled.
- Returning translated rewrite slugs after `wp_loaded` and wondering why rewrite rules do not change.
- Flushing rewrite rules on every request after changing translatable slugs.
- Synchronizing cache/transient/meta fields that should be language-specific.

## Cross-references

- Use `polylang-object-translations` for post/term language assignment and translation groups.
- Use `polylang-rest-headless` for Pro REST duplication and untranslated-post endpoints.
- Use `polylang-wc-compatibility` before applying generic Pro sync rules to products or orders.

## Verification

Local source checked against:

- Translated slug model: `wp-content/plugins/polylang-pro/src/modules/translate-slugs/translate-slugs-model.php`
- Shared slug query filters: `src/modules/share-slug/share-post-slug.php`
- Pro sync model and hooks: `src/modules/sync-post/sync-post-model.php`
- ACF integration README, field settings, dispatcher, and label filters: `src/integrations/ACF/*`

## References

- Official documentation: <https://polylang.pro/doc/developpers-how-to/>
- Official documentation: <https://polylang.pro/doc/strings-translation/>
- Verified source paths:
  - `wp-content/plugins/polylang-pro/src/pro.php`
  - `wp-content/plugins/polylang-pro/src/modules/translate-slugs/translate-slugs-model.php`
  - `wp-content/plugins/polylang-pro/src/modules/share-slug/share-post-slug.php`
  - `wp-content/plugins/polylang-pro/src/modules/share-slug/share-term-slug.php`
  - `wp-content/plugins/polylang-pro/src/modules/sync-post/sync-post-model.php`
  - `wp-content/plugins/polylang-pro/src/modules/sync-post/sync-post.php`
  - `wp-content/plugins/polylang-pro/src/integrations/ACF/README.md`
  - `wp-content/plugins/polylang-pro/src/integrations/ACF/Main.php`
  - `wp-content/plugins/polylang-pro/src/integrations/ACF/Field_Settings.php`
  - `wp-content/plugins/polylang-pro/src/integrations/ACF/Dispatcher.php`
  - `wp-content/plugins/polylang-pro/src/integrations/ACF/Labels/Field_Groups.php`
