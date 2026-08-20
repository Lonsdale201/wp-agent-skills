---
name: wp-block-registration-and-assets
description: >-
  Create or audit WordPress blocks registered through block.json, metadata
  collections, or PHP-only autoRegister. Covers register_block_type,
  register_block_type_from_metadata, API version 3, attributes and roles,
  dynamic rendering, wrapper attributes, editor/frontend asset fields,
  script modules, block supports, deprecations, transforms, variations, and
  WordPress 7.1 background.gradient, dimensions.minWidth, Custom HTML
  innerContent, List Item bindings, and always-iframed editor compatibility.
  Use when building a custom block, reviewing block metadata or render.php,
  adding design supports, fixing editor/frontend parity, or migrating block
  extensions to WordPress 7.1.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Block Registration and Assets

Treat `block.json` as the shared server/editor contract. Register from metadata,
let WordPress resolve generated asset files and supports, and keep the saved
markup compatible with the block's current and deprecated versions.

## Choose the registration model

| Need | Model |
|---|---|
| Normal editable block with custom editor UI | `block.json` plus JavaScript registration/build |
| Dynamic block with custom editor UI | metadata plus `render`/`render_callback` |
| Simple server-rendered fields, no custom editor JS | PHP `supports.autoRegister` on WordPress 7.0+ |
| Fixed composition of existing blocks | pattern or block variation |
| Dynamic value in a supported existing attribute | Block Bindings source |

Register on `init`. Prefer `register_block_type_from_metadata()` for one block
or `wp_register_block_metadata_collection()` plus metadata registration for a
compiled collection. Do not register the same block independently in PHP and
JavaScript with drifting attributes or supports.

```php
add_action( 'init', static function (): void {
	register_block_type_from_metadata( __DIR__ . '/build/card' );
} );
```

Use API version 3 for current blocks. Give every attribute a deliberate type,
default, and persistence model. Attribute `role: local` is editor-only and is
not serialized. Treat block attributes and inner markup as untrusted content.

## Dynamic rendering

Use a `render.php` file declared by `"render": "file:./render.php"`, or a
`render_callback`, when output depends on current data. Keep rendering pure,
cache repeated expensive reads, and return markup instead of echoing unrelated
output.

```php
$title = isset( $attributes['title'] ) ? (string) $attributes['title'] : '';
?>
<section <?php echo get_block_wrapper_attributes(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core returns escaped wrapper attributes. ?>>
	<h2><?php echo esc_html( $title ); ?></h2>
</section>
```

Use `get_block_wrapper_attributes()` so style engine output, alignment,
supports, and class names reach the outer element. Escape each plugin-owned
value for its final HTML context. Never trust the editor's preview, block
validation, or a hidden Inspector control as authorization.

## PHP-only blocks on WordPress 7.0+

For a simple dynamic block, set `supports.autoRegister` and provide a render
callback. Core can register the client representation and generate supported
Inspector controls from PHP attribute schemas. This is intentionally narrower
than a JavaScript block; use a normal build when edit behavior is custom.

```php
register_block_type(
	'acme/server-card',
	array(
		'title'           => __( 'Server card', 'acme' ),
		'attributes'      => array(
			'title' => array(
				'type'    => 'string',
				'label'   => __( 'Title', 'acme' ),
				'default' => '',
			),
		),
		'supports'        => array( 'autoRegister' => true ),
		'render_callback' => 'acme_render_server_card',
	)
);
```

Do not expect generated controls for `local` attributes or unsupported schema
types. Feature-detect this model or set the plugin's minimum WordPress version.

## Asset placement

Use metadata fields rather than global enqueues:

- `editorScript`: editor registration and edit UI;
- `script`: classic script loaded in both editor and frontend contexts;
- `viewScript`: classic frontend-only script;
- `viewScriptModule`: frontend script module, including Interactivity API code;
- `style`: content styles for frontend and editor canvas;
- `editorStyle`: canvas-only/editor presentation.

Consume the build-generated `.asset.php` dependency/version file. Do not load
editor UI code on every wp-admin screen, or put block content CSS only in the
parent editor document. WordPress 7.1 always iframes the post editor canvas.

## WordPress 7.1 block support changes

Opt in only when the block wrapper and save/render implementation can consume
the generated support attributes:

```json
{
  "apiVersion": 3,
  "supports": {
    "background": {
      "backgroundImage": true,
      "gradient": true
    },
    "dimensions": {
      "minWidth": true
    }
  }
}
```

- `background.gradient` stores at `style.background.gradient` and renders via
  `background-image`, allowing it to layer with a background image. It is
  separate from legacy `color.gradient`.
- `dimensions.minWidth` stores at `style.dimensions.minWidth`, renders
  `min-width`, and can use dimension presets.
- Optional controls are not necessarily shown by default. Use
  `__experimentalDefaultControls` only where the current block-support contract
  requires a default-visible control; do not rename stable support keys as
  experimental.
- `core/list-item` now supports a `content` Block Binding.

Test saved markup and dynamic output on the oldest supported WordPress. A block
saved with a new support still needs a coherent fallback when opened or
rendered where that support is unavailable.

## Variations, transforms, and Custom HTML

In 7.1, transforms can target a variation with `variationName`, and
`switchToBlockType()` accepts the target variation as its third argument.
Use stable `cloneSanitizedBlock()` and `sanitizeBlockAttributes()`; their
`__experimental*` aliases now warn.

Only `core/html` variations accept `innerContent`: static HTML fragments with a
`null` slot for each matching `innerBlocks` entry. The editable inner blocks are
locked inside the static shell. Do not advertise `innerContent` as a generic
custom-block variation API, and never use it to bypass KSES or capability
checks. Scripts in Custom HTML do not run in the editor preview.

## Compatibility and security checklist

- Register on `init`; assert that registration succeeded.
- Keep server/client attribute schemas, context, supports, and defaults equal.
- Use stable public package exports and metadata fields, not private editor APIs.
- Preserve fallback/saved content and declare deprecations for save-markup changes.
- Use wrapper attributes on the intended outer element.
- Authorize REST/Ajax writes server-side and sanitize stored data.
- Avoid remote requests and writes during render; cache repeatable reads.
- Test editor, frontend, REST raw/rendered content, reusable content, and failure fallbacks.
- Test 7.1's iframe, responsive styles, theme.json, RTL, keyboard, and multiple block instances.

Read `references/wp-71-block-contracts.md` for the 7.1 support paths,
Custom HTML variation shape, transforms, and migration probes.

## Related skills

- `wp-block-editor-iframe-compatibility` for canvas DOM and asset boundaries.
- `wp-block-bindings-api` for dynamic supported attributes.
- `wp-interactivity-api` for reactive frontend blocks.
- `block-theme-global-styles` for theme.json values and responsive states.
- `wp-plugin-assets-loading` for shared admin/frontend asset registration.

## References

- Read `references/wp-71-block-contracts.md` for the per-support contract table and asset-field matrix.
- `background.gradient` support: <https://make.wordpress.org/core/2026/07/26/new-block-support-in-wordpress-7-1-background-gradient-background-gradient/>
- `dimensions.minWidth` support: <https://make.wordpress.org/core/2026/07/26/new-block-support-in-wordpress-7-1-minimum-width/>
- Editable blocks inside Custom HTML: <https://make.wordpress.org/core/2026/07/23/editable-blocks-inside-the-custom-html-block/>
- Miscellaneous block editor changes in WordPress 7.1: <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
