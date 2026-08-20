---
name: wp-block-bindings-api
description: "Create or audit WordPress Block Bindings sources that connect block attributes to post meta, post/term data, pattern overrides, custom tables, or remote data. Covers PHP source registration, editor registration, metadata.bindings markup, supported-attribute filters, context, editing callbacks, permissions, caching, and the WordPress 7.1 List Item addition."
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.5 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Block Bindings API

Block Bindings replace selected block attributes at render time from a registered data source. Use them when content should stay dynamic while remaining a normal block. They do not persist data by themselves and do not make an unsupported attribute bindable automatically.

## Decide before implementing

| Need | Use |
|---|---|
| Bind a supported block attribute to dynamic data | Block Bindings |
| Change the complete rendered structure | Dynamic block `render.php` |
| Store and validate a custom field | Metadata/REST registration plus a binding |
| Merely transform final HTML | Render filter or HTML API |

## Register the server source

Register on `init`. The name must be lowercase `namespace/name` and the callback must be callable.

```php
add_action( 'init', static function (): void {
    register_block_bindings_source(
        'acme/catalog-field',
        array(
            'label'              => __( 'Catalog field', 'acme' ),
            'uses_context'       => array( 'postId' ),
            'get_value_callback' => static function ( array $args, WP_Block $block, string $attribute ) {
                $allowed = array( 'sku', 'subtitle' );
                $key     = isset( $args['key'] ) ? sanitize_key( $args['key'] ) : '';

                if ( ! in_array( $key, $allowed, true ) ) {
                    return null;
                }

                $post_id = isset( $block->context['postId'] ) ? (int) $block->context['postId'] : 0;
                return $post_id ? get_post_meta( $post_id, '_acme_' . $key, true ) : null;
            },
        )
    );
} );
```

The callback receives binding `args`, the current `WP_Block`, and the target attribute name. The args originate in block content and are untrusted. Allowlist keys, validate IDs, and return `null` when no safe value is available.

## Bind the attribute

```html
<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"acme/catalog-field","args":{"key":"subtitle"}}}}} -->
<p>Fallback subtitle</p>
<!-- /wp:paragraph -->
```

Do not delete useful fallback markup. If the source is missing, disabled, or returns no usable value, a stable fallback makes the content more portable.

## Supported attributes in WordPress 7.1

Core's default list is:

| Block | Attributes |
|---|---|
| `core/paragraph` | `content` |
| `core/heading` | `content` |
| `core/list-item` | `content` (added in 7.1) |
| `core/image` | `id`, `url`, `title`, `alt`, `caption` |
| `core/button` | `url`, `text`, `linkTarget`, `rel` |
| `core/post-date` | `datetime` |
| `core/navigation-link`, `core/navigation-submenu` | `url` |

Query the truth with `get_block_bindings_supported_attributes( $block_type )`; do not freeze this table into plugin logic.

For a custom block or deliberately supported attribute, extend the list narrowly:

```php
add_filter( 'block_bindings_supported_attributes_acme/card', static function ( array $attributes ): array {
    $attributes[] = 'title';
    return array_values( array_unique( $attributes ) );
} );
```

Only expose attributes whose render pipeline correctly consumes the bound value. A filter entry alone cannot repair custom rendering that ignores parsed attributes.

## Editor registration is a separate concern

PHP registration makes frontend/server rendering work. Register the same source in the editor when users need previews, editing, or the binding picker. The editor contract can provide `getValues`, `setValues`, `canUserEditValue`, and, since 6.9, `getFieldsList`.

Use `useBlockBindingsUtils()` from `@wordpress/block-editor` to update or remove `metadata.bindings`; do not hand-mutate nested block attributes. Keep the source name and argument schema identical in PHP and JavaScript.

Read [references/editor-and-security.md](references/editor-and-security.md) before implementing editable bindings.

## Core sources

Prefer an existing Core source when it fits, notably `core/post-meta`, `core/post-data`, `core/term-data`, or `core/pattern-overrides`. For post meta, register the field correctly and expose it to REST/editor contexts as required. Protected meta is not made public merely because a block references it, but your custom callback can accidentally leak it if it skips authorization and context checks.

## Performance rules

Binding callbacks can run once per bound attribute for every rendered block.

- Never issue an uncached remote request per callback.
- Cache repeated lookups within the request by source arguments and object ID.
- Prime metadata/object caches for repeated objects where appropriate.
- Keep callbacks deterministic for the same render context; randomness breaks page caches and editor/frontend parity.
- Avoid writes, analytics events, or other side effects in `get_value_callback`.

## Security checklist

- Treat `args` and block markup as attacker-controlled input.
- Check the current object/site context; do not trust a `postId` supplied in args.
- Never return secrets or private metadata to public frontend output.
- Enforce capabilities in editor write paths and REST endpoints, not only in UI predicates.
- Sanitize for storage in the write API; escape at the final block output context.
- Do not return raw HTML for a plain string attribute unless that block's rendering contract safely handles it.

## Verification

1. Assert source registration after `init` with `get_block_bindings_source()`.
2. Render bound markup through `do_blocks()` and check the exact output.
3. Test unknown args, missing object context, deleted source, and `null` return.
4. Test editor preview separately from frontend rendering.
5. Measure query/request counts across a post with many bound blocks.
6. On 7.1, verify `core/list-item` content bindings and backward compatibility for older supported Core versions.

## Related skills

- `wordpress/wp-metadata-api` for registered post, user, term, and comment meta.
- `wordpress/wp-rest-api` for authorized editor write endpoints.
- `wordpress/wp-html-api` for safe rendered-markup changes.
- `wordpress/wp-interactivity-api` when the bound output also needs reactive frontend behavior.

## References

- Read `references/editor-and-security.md` for editor registration, editing callbacks, permission and caching detail.
- Miscellaneous block editor changes in WordPress 7.1 (List Item binding): <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
