---
name: classic-theme-media-images
description: Build or audit media and image output in classic WordPress themes on WP 7.0. Covers `add_theme_support( 'post-thumbnails' )`, `add_image_size()`, `set_post_thumbnail_size()`, `has_post_thumbnail()`, `the_post_thumbnail()`, `get_the_post_thumbnail()`, `wp_get_attachment_image()`, responsive `srcset` and `sizes`, `loading`/`decoding`/`fetchpriority`, attachment alt text, decorative images, theme asset images, regeneration requirements, and common mistakes such as hand-built `img` tags, full-size archive images, removed dimensions, and broken CLS.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Media and Images

Use this when adding or reviewing featured images, attachment images, custom image sizes, responsive image attributes, image accessibility, or theme asset images in a classic PHP theme.

## When to Use This Skill

- Adding featured image support.
- Rendering thumbnails in archives, cards, heroes, or singular templates.
- Registering custom image sizes.
- Replacing hand-built `<img>` tags with WordPress image functions.
- Fixing layout shift, oversized images, missing alt text, or broken responsive image output.

## Enable Featured Images

Enable post thumbnails during theme setup.

```php
add_action( 'after_setup_theme', 'mytheme_setup' );

function mytheme_setup() {
	add_theme_support( 'post-thumbnails' );
}
```

Rules:

- Register theme support on `after_setup_theme`.
- Use `add_theme_support( 'post-thumbnails', array( 'post', 'page' ) )` only when intentionally limiting post types.
- Do not assume featured image UI exists until support is declared.

## Register Image Sizes

Register reusable sizes in theme setup.

```php
add_action( 'after_setup_theme', 'mytheme_image_sizes' );

function mytheme_image_sizes() {
	set_post_thumbnail_size( 1200, 675, true );
	add_image_size( 'mytheme-hero', 1600, 900, true );
	add_image_size( 'mytheme-card', 640, 360, true );
	add_image_size( 'mytheme-portrait', 480, 640, array( 'center', 'top' ) );
}
```

Rules:

- Use named sizes for repeated layouts.
- Use hard crop only when the design truly needs fixed framing.
- Named sizes affect newly generated image metadata. Existing uploads need thumbnail regeneration.
- Do not register dozens of one-off sizes; each size increases storage and processing work.
- Prefix custom size names with the theme slug.

## Render Featured Images

Use core thumbnail functions.

```php
if ( has_post_thumbnail() ) {
	the_post_thumbnail(
		'mytheme-card',
		array(
			'class' => 'entry-card-image',
		)
	);
}
```

Rules:

- Use `has_post_thumbnail()` before rendering optional image areas.
- Use `the_post_thumbnail()` for direct output.
- Use `get_the_post_thumbnail()` when composing a larger string.
- Use appropriate sizes: cards should not use `full`.
- Keep width/height attributes unless there is a strong reason; they help prevent layout shift.
- Do not hand-build upload URLs from `_thumbnail_id` meta.

## Attachment Images

For attachment IDs, use `wp_get_attachment_image()`.

```php
echo wp_get_attachment_image(
	$attachment_id,
	'mytheme-card',
	false,
	array(
		'class' => 'media-card-image',
	)
);
```

Core adds useful defaults:

- `src`.
- `width` and `height`.
- attachment alt text from `_wp_attachment_image_alt`.
- image size classes.
- responsive `srcset` and `sizes` when metadata is available.
- loading optimization attributes such as `loading`, `decoding`, and `fetchpriority` when appropriate.

Do not replace this with a manual `<img src="...">` unless the image is not a WordPress attachment.

## Alt Text

Rules:

- Informative images need useful alt text.
- Decorative images should use empty alt text: `alt=""`.
- Featured images often need context-specific alt text. Attachment alt may be enough, but review it.
- Do not use the post title as a blind default for every image if it duplicates adjacent text.
- Do not keyword-stuff alt text.

For a linked post thumbnail in an archive card, the link text/title may already describe the post. In that case, an empty alt can avoid repetition:

```php
printf(
	'<a class="entry-card-link" href="%1$s">%2$s</a>',
	esc_url( get_permalink() ),
	get_the_post_thumbnail(
		get_the_ID(),
		'mytheme-card',
		array( 'alt' => '' )
	)
);
```

## Responsive and Performance Attributes

WordPress image functions can output `srcset`, `sizes`, `loading`, `decoding`, and `fetchpriority`.

Rules:

- Prefer CSS plus correct image sizes over manually overriding `srcset`.
- Pass a custom `sizes` attribute only when the default is wrong for the layout.
- Do not remove width/height attributes globally; that usually harms CLS.
- Avoid `full` images in archives, grids, related posts, and menus.
- Use `loading => 'eager'` or `fetchpriority => 'high'` only for the primary above-the-fold image.
- Do not set every image to eager/high priority.

Example hero image:

```php
the_post_thumbnail(
	'mytheme-hero',
	array(
		'class'         => 'hero-image',
		'loading'       => 'eager',
		'fetchpriority' => 'high',
	)
);
```

Use this only for the page's primary visual, not every singular featured image by default.

## Theme Asset Images

For static images shipped with the theme, use theme file helpers and normal escaping.

```php
<img
	src="<?php echo esc_url( get_theme_file_uri( 'assets/images/pattern.png' ) ); ?>"
	alt=""
	width="320"
	height="180"
>
```

Rules:

- Use `get_theme_file_uri()` for child-theme-overridable assets.
- Use `get_template_directory_uri()` only when the parent theme asset must not be overridden.
- Static theme images do not get attachment metadata, `srcset`, or media-library alt text automatically.
- Include explicit dimensions for static images when known.

## Background Images

When an image carries content, do not put it only in CSS background.

Rules:

- Use CSS background images for decoration.
- Use real `<img>` output for meaningful content.
- For Customizer-selected background/header images, validate URLs and escape with `esc_url()`.
- Avoid inline style attributes with unvalidated image URLs.

## Review Checklist

- Featured image support is declared on `after_setup_theme`.
- Custom image sizes are named, prefixed, and not excessive.
- Existing-upload regeneration is considered after adding sizes.
- Templates use `the_post_thumbnail()` or `wp_get_attachment_image()`.
- Archive/card layouts avoid `full` image size.
- Width/height attributes are preserved.
- Alt text is intentional for informative vs decorative images.
- Priority/eager loading is used only for primary above-the-fold images.
- Static theme images use theme file helpers and escaped URLs.
- No upload URLs are built manually from metadata.

## Common Mistakes

- Hand-building `<img>` tags for attachment IDs and losing `srcset`.
- Removing image dimensions globally to make CSS easier.
- Using full-size images in archive cards.
- Registering a new image size and forgetting existing uploads need regeneration.
- Setting every thumbnail to `loading="eager"` or `fetchpriority="high"`.
- Reusing post titles as alt text even when the adjacent title already names the link.

## References

- Official documentation: <https://developer.wordpress.org/themes/functionality/featured-images-post-thumbnails/>
- Official documentation: <https://developer.wordpress.org/themes/classic-themes/functionality/media/images/>
- Official documentation: <https://developer.wordpress.org/reference/functions/the_post_thumbnail/>
- Verified source paths:
  - `wp-includes/media.php`
  - `wp-includes/post-thumbnail-template.php`
  - `wp-includes/theme.php`
  - `wp-content/themes/storefront/inc/storefront-template-functions.php`
  - `wp-content/themes/generatepress/inc/structure/featured-images.php`
