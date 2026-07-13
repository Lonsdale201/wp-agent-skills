---
name: classic-template-hierarchy
description: Choose, create, or audit classic PHP WordPress template files for WP 7.0 using the template hierarchy. Covers `template-loader.php`, `index.php` fallback, `front-page.php` vs `home.php`, `page.php`, custom page templates, `single.php`, `singular.php`, `archive.php`, taxonomy/category/tag/author/date/search/404/attachment templates, `header.php`, `footer.php`, `comments.php`, `searchform.php`, `get_template_part()` with `$args`, child-theme override order, `template_include`, and why `template_redirect` should not include-and-exit. Use when deciding which classic template file to add or reviewing page.php/404.php/single/archive behavior.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Template Hierarchy

Use this when deciding which PHP template file a classic theme should contain, or when auditing why WordPress loads the wrong template.

This is a classic PHP theme skill. Do not apply FSE/block-template assumptions such as `templates/page.html`.

## When to Use This Skill

- Adding `page.php`, `single.php`, `archive.php`, `404.php`, or similar template files.
- Debugging front page vs blog index behavior.
- Converting static pages into WordPress templates.
- Creating custom page templates.
- Reviewing `template_include`, `template_redirect`, `get_template_part`, or child-theme override behavior.

## Loader Model in WP 7.0

`wp-includes/template-loader.php` checks query conditionals, asks a `get_*_template()` function for candidates, then falls back to `index.php`.

Important WP 7.0 details:

- The final path passes through `template_include`.
- WordPress resolves the returned template through `realpath()`.
- The final included template must be a readable `.php` or `.html` file.
- `wp_before_include_template` fires immediately before inclusion.

Do not include a template and call `exit` from `template_redirect`. Core's own docblock says template loading should be changed via `template_include` so later hooks still run.

## Child Theme Lookup

`locate_template()` searches:

1. Active stylesheet directory, usually child theme.
2. Parent template directory, when a child theme is active.
3. `wp-includes/theme-compat/` fallback for a few legacy files.

This means a child theme can override a parent template by adding the same relative file path.

## Main Template Files

| Request | Preferred classic files |
|---|---|
| Site front page | `front-page.php`, then the matching page/home flow, then `index.php` |
| Blog posts index | `home.php`, then `index.php` |
| Static page | custom page template, `page-{slug}.php`, `page-{id}.php`, `page.php`, `singular.php`, `index.php` |
| Single post/CPT | custom post template, `single-{post_type}-{slug}.php`, `single-{post_type}.php`, `single.php`, `singular.php`, `index.php` |
| CPT archive | `archive-{post_type}.php`, `archive.php`, `index.php` |
| Generic archive | `archive.php`, `index.php` |
| Category | `category-{slug}.php`, `category-{id}.php`, `category.php`, `archive.php`, `index.php` |
| Tag | `tag-{slug}.php`, `tag-{id}.php`, `tag.php`, `archive.php`, `index.php` |
| Custom taxonomy | `taxonomy-{taxonomy}-{term}.php`, `taxonomy-{taxonomy}-{term_id}.php`, `taxonomy-{taxonomy}.php`, `taxonomy.php`, `archive.php`, `index.php` |
| Author | `author-{nicename}.php`, `author-{id}.php`, `author.php`, `archive.php`, `index.php` |
| Date | `date.php`, `archive.php`, `index.php` |
| Search | `search.php`, `index.php` |
| 404 | `404.php`, `index.php` |
| Attachment | `{mime_type}-{sub_type}.php`, `{sub_type}.php`, `{mime_type}.php`, `attachment.php`, `singular.php`, `index.php` |

`front-page.php` is special: it wins for the site front page whether the front page is a static page or the posts index.

`home.php` is the blog posts index, not the homepage in every configuration.

## Template Responsibilities

| File | Responsibility |
|---|---|
| `index.php` | Final fallback. Should render a valid loop and no-results state. |
| `header.php` | Doctype, `<html>`, `<head>`, `wp_head()`, opening `<body>`, `wp_body_open()`, site header. |
| `footer.php` | Site footer, `wp_footer()`, closing body/html. |
| `front-page.php` | Bespoke front page layout. |
| `home.php` | Blog posts index. |
| `page.php` | Static WordPress pages. Not posts, not archives. |
| `single.php` | Single posts and CPTs when no more specific single template exists. |
| `singular.php` | Shared fallback for pages/posts/attachments before `index.php`. |
| `archive.php` | Shared fallback for taxonomy/date/author/post type archives. |
| `search.php` | Search results page. |
| `404.php` | Not-found response view; include search/navigation help. |
| `comments.php` | Comment list/form markup loaded by `comments_template()`. |
| `searchform.php` | Custom search form loaded by `get_search_form()`. |

## Thin Template Pattern

Keep top-level templates small. Let template parts carry repeated post markup.

```php
<?php
/**
 * Main fallback template.
 *
 * @package MyTheme
 */

get_header();
?>

<main id="primary" class="site-main">
    <?php if ( have_posts() ) : ?>
        <?php
        while ( have_posts() ) :
            the_post();

            get_template_part(
                'template-parts/content',
                get_post_type(),
                array(
                    'show_excerpt' => is_archive() || is_search(),
                )
            );
        endwhile;

        the_posts_pagination();
        ?>
    <?php else : ?>
        <?php get_template_part( 'template-parts/content', 'none' ); ?>
    <?php endif; ?>
</main>

<?php
get_footer();
```

`get_template_part( $slug, $name, $args )` searches `{$slug}-{$name}.php`, then `{$slug}.php`, and passes `$args` into the template. Use this instead of setting temporary globals for template parts.

## Custom Page Templates

WordPress scans PHP files in the theme root and one directory deep for `Template Name`.

```php
<?php
/**
 * Template Name: Landing Page
 * Template Post Type: page
 *
 * @package MyTheme
 */

get_header();

while ( have_posts() ) :
    the_post();
    get_template_part( 'template-parts/content', 'landing' );
endwhile;

get_footer();
```

Put these in `page-templates/` when there are several. Do not create `page-about.php` for editor-selectable layouts; use a custom page template header.

## Safe Template Overrides

To override the selected template globally or conditionally:

```php
add_filter( 'template_include', 'mytheme_template_include' );

function mytheme_template_include( string $template ): string {
    if ( ! is_singular( 'event' ) ) {
        return $template;
    }

    $event_template = locate_template( array( 'single-event.php' ) );

    return $event_template ?: $template;
}
```

Never build a template path directly from `$_GET`, `$_POST`, route segments, or unvalidated meta. Use fixed candidate lists and `locate_template()`.

## Required Header/Footer Hooks

`header.php`:

```php
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
```

`footer.php`:

```php
<?php wp_footer(); ?>
</body>
</html>
```

Missing `wp_head()` or `wp_footer()` breaks core, plugins, admin bar assets, and enqueued scripts/styles.

## Common Mistakes

- Treating `home.php` as the marketing homepage. It is the blog posts index.
- Putting all routes into `page.php`; posts, archives, search, and 404 use other hierarchy branches.
- Creating one-off `page-{slug}.php` files when the editor needs a reusable page template.
- Directly `include`-ing template files instead of using `get_header()`, `get_footer()`, `comments_template()`, or `get_template_part()`.
- Using `template_redirect` to include a file and `exit`.
- Returning request-controlled paths from `template_include`.
- Forgetting that child theme files override parent files by relative path.

## Cross-References

- Theme bootstrapping, folders, assets: `classic-theme-structure`
- Escaping, nonces, safe template output: `classic-theme-security-standards`
- Broader WP security review: `wp-security-audit`

## References

- Official documentation: <https://developer.wordpress.org/themes/classic-themes/basics/template-hierarchy/>
- Official documentation: <https://developer.wordpress.org/themes/classic-themes/basics/template-files/>
- Official documentation: <https://developer.wordpress.org/themes/classic-themes/templates/page-template-files/>
- Verified source paths:
  - `wp-includes/template-loader.php`
  - `wp-includes/template.php`
  - `wp-includes/general-template.php`
  - `wp-includes/class-wp-theme.php`
  - `wp-content/themes/storefront/index.php`
  - `wp-content/themes/storefront/page.php`
  - `wp-content/themes/storefront/404.php`
  - `wp-content/themes/generatepress/header.php`
