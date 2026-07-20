---
name: classic-theme-structure
description: Build or audit a modern classic PHP WordPress theme structure for WP 7.0 without FSE/block-theme assumptions. Covers required `style.css` + `index.php`, `functions.php` as bootstrap, `after_setup_theme`, `wp_enqueue_scripts`, `get_theme_file_uri/path`, `wp_head`, `wp_body_open`, `wp_footer`, recommended `assets/`, `inc/`, `template-parts/`, `page-templates/`, `languages/`, child-theme-safe paths, theme supports, menus, sidebars, and what belongs in a plugin instead of a theme. Use when scaffolding/reviewing a non-FSE theme, converting static HTML to a theme, or deciding where theme files/hooks belong.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Structure

Use this when creating or reviewing a classic PHP WordPress theme. This skill deliberately avoids FSE/block-theme architecture: no `templates/*.html` as the primary rendering layer, no Site Editor assumptions, and no Gutenberg/block development workflow.

The target is a secure, maintainable classic theme for WP 7.0.

## When to Use This Skill

- Scaffolding a new classic theme.
- Converting static HTML/CSS into a WordPress theme.
- Reviewing a theme folder for bad structure, missing hooks, direct asset tags, or business logic in `functions.php`.
- The work mentions `style.css`, `index.php`, `functions.php`, `header.php`, `footer.php`, `template-parts`, `after_setup_theme`, `wp_enqueue_scripts`, or classic theme files.

## Runtime Minimum vs Practical Minimum

WordPress recognizes a classic theme with:

- `style.css` in the theme root, with a valid theme header.
- `index.php` in the theme root, as the final template fallback.

For real projects, also include:

- `functions.php` for bootstrap/hooks.
- `header.php` and `footer.php`.
- `404.php`, `page.php`, `single.php`, `archive.php`, `search.php`.
- `comments.php` if comments are supported.
- `screenshot.png` for admin display and distribution.

Do not create a block theme by accident. A classic theme's fallback template is root `index.php`, not `templates/index.html`.

## Recommended Folder Layout

```text
mytheme/
|-- style.css
|-- functions.php
|-- index.php
|-- header.php
|-- footer.php
|-- 404.php
|-- page.php
|-- single.php
|-- archive.php
|-- search.php
|-- comments.php
|-- screenshot.png
|-- assets/
|   |-- css/
|   |-- js/
|   |-- images/
|   `-- fonts/
|-- inc/
|   |-- setup.php
|   |-- enqueue.php
|   |-- template-tags.php
|   |-- template-functions.php
|   `-- customizer.php
|-- template-parts/
|   |-- content.php
|   |-- content-page.php
|   |-- content-none.php
|   `-- content-search.php
|-- page-templates/
|   `-- full-width.php
`-- languages/
```

Keep root templates thin. Put repeatable PHP helpers in `inc/`, repeatable markup in `template-parts/`, and static assets in `assets/`.

## style.css Header

`style.css` must live in the theme root. WordPress parses its header through `WP_Theme`.

```css
/*
Theme Name: MyTheme
Theme URI: https://example.com/mytheme
Author: Example Team
Description: A classic PHP WordPress theme.
Version: 1.0.0
Requires at least: 7.0
Tested up to: 7.0
Requires PHP: 7.4
License: GNU General Public License v2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: mytheme
Domain Path: /languages
*/
```

For a child theme, add `Template: parent-theme-folder-name`.

## functions.php as Bootstrap

`functions.php` loads on frontend and admin. In a child theme, the child `functions.php` loads before the parent `functions.php`.

Use it as a bootstrap, not as a 2,000-line application file:

```php
<?php
/**
 * Theme bootstrap.
 *
 * @package MyTheme
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'MYTHEME_VERSION', wp_get_theme()->get( 'Version' ) );

require_once get_template_directory() . '/inc/setup.php';
require_once get_template_directory() . '/inc/enqueue.php';
require_once get_template_directory() . '/inc/template-tags.php';
require_once get_template_directory() . '/inc/template-functions.php';
```

Use `get_template_directory()` for parent-theme code includes. Use `get_theme_file_path()` when child themes should be able to override a file.

Do not put custom post types, business rules, payment logic, CRM sync, or data migrations in a theme. If the feature should survive a theme switch, build a plugin.

## Theme Setup

Register theme support and theme-owned features on `after_setup_theme`.

```php
<?php
/**
 * Setup theme defaults.
 *
 * @package MyTheme
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'after_setup_theme', 'mytheme_setup' );

function mytheme_setup(): void {
    load_theme_textdomain( 'mytheme', get_template_directory() . '/languages' );

    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'automatic-feed-links' );
    add_theme_support(
        'html5',
        array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'script', 'style' )
    );

    register_nav_menus(
        array(
            'primary' => __( 'Primary Menu', 'mytheme' ),
            'footer'  => __( 'Footer Menu', 'mytheme' ),
        )
    );
}
```

Register widget areas on `widgets_init`, not in global scope:

```php
add_action( 'widgets_init', 'mytheme_register_sidebars' );

function mytheme_register_sidebars(): void {
    register_sidebar(
        array(
            'name'          => __( 'Sidebar', 'mytheme' ),
            'id'            => 'sidebar-1',
            'before_widget' => '<section id="%1$s" class="widget %2$s">',
            'after_widget'  => '</section>',
            'before_title'  => '<h2 class="widget-title">',
            'after_title'   => '</h2>',
        )
    );
}
```

## Assets

Never hardcode `<link>` or `<script>` tags in templates. Enqueue assets on `wp_enqueue_scripts`.

```php
add_action( 'wp_enqueue_scripts', 'mytheme_enqueue_assets' );

function mytheme_enqueue_assets(): void {
    wp_enqueue_style(
        'mytheme-style',
        get_stylesheet_uri(),
        array(),
        MYTHEME_VERSION
    );

    $script = 'assets/js/main.js';
    $path   = get_theme_file_path( $script );

    wp_enqueue_script(
        'mytheme-main',
        get_theme_file_uri( $script ),
        array(),
        file_exists( $path ) ? filemtime( $path ) : MYTHEME_VERSION,
        array(
            'strategy'  => 'defer',
            'in_footer' => true,
        )
    );
}
```

Use child-theme-safe helpers:

| Need | Function |
|---|---|
| Active theme stylesheet URL | `get_stylesheet_uri()` |
| Child override first, then parent URL | `get_theme_file_uri( 'assets/js/main.js' )` |
| Child override first, then parent path | `get_theme_file_path( 'inc/file.php' )` |
| Parent theme URL only | `get_parent_theme_file_uri( 'assets/css/base.css' )` |
| Parent theme path only | `get_template_directory() . '/inc/file.php'` |

## Required Hooks in Templates

`header.php` must include:

- `language_attributes()` on `<html>`.
- `bloginfo( 'charset' )` or equivalent charset meta.
- `wp_head()` before `</head>`.
- `body_class()` on `<body>`.
- `wp_body_open()` immediately after `<body>`.

`footer.php` must include `wp_footer()` before `</body>`.

Without these, plugins and WordPress core cannot enqueue scripts/styles, inject metadata, render admin bar assets, or hook accessibility integrations correctly.

## Structural Rules

- Prefix global functions with the theme slug, or use a unique namespace for non-template helper code.
- Do not close PHP-only files with `?>`.
- Use lowercase, hyphenated file names for ordinary files.
- Use `require_once` for mandatory includes.
- Use `get_template_part( 'template-parts/content', 'page', $args )` instead of global variables for reusable markup.
- Keep templates focused on presentation. Query manipulation belongs in hooks such as `pre_get_posts`, and portable site features belong in plugins.

## What This Skill Does Not Cover

- Block themes, FSE, `theme.json`, block templates, block patterns, and Site Editor workflows.
- Deep template hierarchy decisions; use `classic-template-hierarchy`.
- Detailed escaping/security review; use `classic-theme-security-standards` and `wp-security-audit`.

## References

- Official documentation: <https://developer.wordpress.org/themes/classic-themes/>
- Official documentation: <https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/>
- Official documentation: <https://developer.wordpress.org/themes/classic-themes/basics/main-stylesheet-style-css/>
- Official documentation: <https://developer.wordpress.org/themes/core-concepts/custom-functionality/>
- Official documentation: <https://developer.wordpress.org/themes/core-concepts/including-assets/>
- Verified source paths:
  - `wp-includes/template-loader.php`
  - `wp-includes/template.php`
  - `wp-includes/general-template.php`
  - `wp-includes/theme.php`
  - `wp-includes/link-template.php`
  - `wp-includes/functions.wp-scripts.php`
  - `wp-includes/functions.wp-styles.php`
  - `wp-includes/class-wp-theme.php`
  - `wp-content/themes/storefront/`
  - `wp-content/themes/generatepress/`
