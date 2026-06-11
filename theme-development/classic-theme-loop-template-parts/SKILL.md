---
name: classic-theme-loop-template-parts
description: Build or audit classic theme loops and PHP template parts for WP 7.0 without block/FSE assumptions. Covers the main Loop with `have_posts()` and `the_post()`, archive/search/single/page content choices, `get_template_part()` with `$args`, `content-none.php`, `post_class()`, secondary `WP_Query` loops with `wp_reset_postdata()`, `rewind_posts()`, pagination, single post navigation, and common bugs such as `query_posts()`, nested loops without reset, raw globals in template parts, and missing no-results states.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-04"
docs:
  - https://developer.wordpress.org/themes/classic-themes/basics/the-loop/
  - https://developer.wordpress.org/themes/classic-themes/basics/template-tags/
source-refs:
  - wp-includes/query.php
  - wp-includes/class-wp-query.php
  - wp-includes/template.php
  - wp-includes/post-template.php
  - wp-includes/link-template.php
  - wp-content/themes/storefront/
  - wp-content/themes/generatepress/
---

# Classic Theme Loop and Template Parts

Use this when creating or reviewing the content rendering layer of a classic PHP WordPress theme: main loops, `content.php` style partials, archive cards, single post bodies, page bodies, empty states, and pagination.

This is not a block/FSE template-part skill. Use PHP template files and `get_template_part()`.

## When to Use This Skill

- Writing `index.php`, `home.php`, `archive.php`, `search.php`, `single.php`, `page.php`, or `404.php`.
- Moving repeated markup into `template-parts/content*.php`.
- Reviewing a nested `WP_Query`, featured-post section, related posts section, or custom loop.
- Fixing pagination, no-results output, post classes, content/excerpt choice, or "wrong global post" bugs.

## Main Loop Contract

For the main query, use WordPress' loop state. Do not replace it with `query_posts()`.

```php
<?php
get_header();
?>

<main id="main" class="site-main">
	<?php
	if ( have_posts() ) :
		while ( have_posts() ) :
			the_post();

			get_template_part( 'template-parts/content', get_post_type() );
		endwhile;

		the_posts_pagination();
	else :
		get_template_part( 'template-parts/content', 'none' );
	endif;
	?>
</main>

<?php
get_footer();
```

Rules:

- Call `the_post()` inside the `while ( have_posts() )` loop before template tags that depend on the global post.
- Include a no-results state. `template-parts/content-none.php` is the standard pattern.
- Keep the loop in template files; move per-post markup into template parts.
- Do not call `query_posts()` in themes. It mutates the main query and breaks pagination and conditionals.
- Do not manually set global `$post` unless a core API requires it and you fully restore state afterward.

## Template Part Pattern

Use `get_template_part()` for repeated per-post markup:

```php
get_template_part(
	'template-parts/content',
	get_post_type(),
	array(
		'heading_level' => is_singular() ? 'h1' : 'h2',
	)
);
```

`get_template_part( $slug, $name, $args )` searches for:

- `{$slug}-{$name}.php`
- `{$slug}.php`

Inside the template part, `$args` is available:

```php
<?php
$heading_level     = isset( $args['heading_level'] ) ? $args['heading_level'] : 'h2';
$allowed_headings  = array( 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' );
$heading_level     = in_array( $heading_level, $allowed_headings, true ) ? $heading_level : 'h2';
?>

<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">
		<?php the_title( '<' . $heading_level . ' class="entry-title">', '</' . $heading_level . '>' ); ?>
	</header>

	<div class="entry-content">
		<?php the_excerpt(); ?>
	</div>
</article>
```

Keep template parts presentation-focused. If a template part needs a lot of derived data, compute it before the call and pass a small `$args` array.

## Archive vs Singular Output

Choose output by context:

- Archives, search results, and post grids usually use `the_excerpt()` or a controlled custom summary.
- `single.php` and `page.php` usually use `the_content()`.
- After `the_content()` in singular views, call `wp_link_pages()` so paginated posts render all pages.
- Use `the_post_navigation()` for previous/next post links on single posts when the design needs it.
- Use `the_posts_pagination()` for archive/search/blog pagination.

Example singular body:

```php
<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">
		<?php the_title( '<h1 class="entry-title">', '</h1>' ); ?>
	</header>

	<div class="entry-content">
		<?php
		the_content();

		wp_link_pages(
			array(
				'before' => '<nav class="page-links" aria-label="' . esc_attr__( 'Post pages', 'textdomain' ) . '">',
				'after'  => '</nav>',
			)
		);
		?>
	</div>
</article>
```

## Secondary Queries

For related posts, featured cards, or sidebar sections, use a separate `WP_Query` and always reset post data afterward.

```php
$featured = new WP_Query(
	array(
		'post_type'           => 'post',
		'posts_per_page'      => 3,
		'ignore_sticky_posts' => true,
		'no_found_rows'       => true,
	)
);

if ( $featured->have_posts() ) :
	while ( $featured->have_posts() ) :
		$featured->the_post();
		get_template_part( 'template-parts/card', get_post_type() );
	endwhile;
endif;

wp_reset_postdata();
```

Rules:

- Use `wp_reset_postdata()` after any custom `WP_Query` loop that calls `$query->the_post()`.
- Use `no_found_rows => true` when pagination is not needed.
- Use `ignore_sticky_posts => true` for most curated secondary lists.
- If you only need IDs, request IDs and render intentionally; do not run full post setup by habit.
- Do not call `wp_reset_query()` unless you intentionally replaced the global query, which a theme should normally avoid.

## Rewinding the Main Loop

If you read posts from the main query once and need to render the same main query again, call `rewind_posts()`.

```php
if ( have_posts() ) {
	the_post();
	// Inspect the first post.
}

rewind_posts();

while ( have_posts() ) {
	the_post();
	get_template_part( 'template-parts/content', get_post_type() );
}
```

Use this sparingly. If the first pass is only for layout decisions, prefer deriving the decision from query context instead of consuming loop state.

## Required Theme Markup Hooks

Inside loop template parts:

- Use `post_class()` on the root post element.
- Use `the_ID()` for stable post element IDs.
- Use `the_title()` with explicit wrappers rather than echoing raw title data.
- Use `the_content()`, `the_excerpt()`, and thumbnail/template tags rather than rebuilding core output with raw fields.
- Escape any custom meta, options, term fields, or request-derived values before output.

## Review Checklist

- Main query uses `have_posts()` and `the_post()`.
- Empty results call a real no-results template.
- Archive/search pages do not dump full post content unless that is intentional.
- Singular templates use `the_content()` and handle `wp_link_pages()`.
- Pagination uses `the_posts_pagination()` or a deliberate equivalent.
- Secondary `WP_Query` loops call `wp_reset_postdata()`.
- No `query_posts()`.
- Template parts receive explicit `$args` when they need extra data.
- `post_class()` is preserved on post wrappers.
- No raw custom fields/options are echoed inside template parts.

## Common Mistakes

- Calling `the_post()` before checking `have_posts()` and then wondering why the first post disappears.
- Creating `content.php` but forgetting `content-none.php`.
- Using `get_template_part()` for business logic instead of presentation.
- Passing unescaped HTML through `$args` and echoing it blindly.
- Nesting a custom query inside the main loop without restoring post data.
- Building archive pagination from `$_GET['paged']` manually instead of using WordPress query state.
