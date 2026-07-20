---
name: classic-theme-security-standards
description: Write or audit secure modern classic PHP WordPress theme code for WP 7.0. Covers template output escaping, `esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`, `wp_json_encode`, translation escaping, `wp_unslash` + sanitize input, validation, nonces and capability checks for theme forms, safe `template_include`/`get_template_part`, enqueued assets instead of inline tags, `$wpdb->prepare`, WPCS naming/filenames, namespacing/prefixing, no shorthand PHP tags, and no closing PHP tag. Use when reviewing `functions.php`, `header.php`, `page.php`, `404.php`, template parts, search/comment forms, or any classic theme code touching request data or dynamic output.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Security Standards

Use this when writing or reviewing PHP in a classic theme. Themes output most of the HTML on a site, so their main security failure mode is unsafe dynamic output.

This skill complements `wp-security-audit`; it is theme-specific and focused on templates, `functions.php`, template parts, and theme forms.

## When to Use This Skill

- Reviewing `header.php`, `footer.php`, `index.php`, `page.php`, `single.php`, `archive.php`, `404.php`, `comments.php`, or `template-parts/*.php`.
- Reviewing `functions.php` or `inc/*.php` in a theme.
- Theme code reads `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, or custom query vars.
- Theme code prints custom fields, options, term/user meta, search values, image URLs, classes, or inline JS.
- Theme code has a custom form, AJAX handler, `template_include` override, or direct SQL.

## Escape on Output

Escape at the last possible moment, based on context.

| Output context | Use |
|---|---|
| Text node | `esc_html( $value )` |
| HTML attribute | `esc_attr( $value )` |
| URL | `esc_url( $url )` |
| Textarea | `esc_textarea( $value )` |
| CSS class fragment | `sanitize_html_class( $class )`, then `esc_attr()` if composing attributes |
| Limited trusted HTML | `wp_kses_post( $html )` or `wp_kses( $html, $allowed_html )` |
| JavaScript data | `wp_json_encode( $data )` inside `wp_add_inline_script()` |
| Translation in text | `esc_html__( 'Text', 'mytheme' )` or `esc_html_e()` |
| Translation in attribute | `esc_attr__( 'Text', 'mytheme' )` or `esc_attr_e()` |

```php
<a class="card-link" href="<?php echo esc_url( get_permalink() ); ?>">
    <?php echo esc_html( get_the_title() ); ?>
</a>
```

Do not escape full editor content with `esc_html()`. For normal post content, use `the_content()` and let WordPress content filters run. For custom HTML fields, use `wp_kses_post()` or a narrower allowlist.

## Sanitize Input, Validate Meaning

Request data is slashed. Unslash first, then sanitize, then validate.

```php
$raw_layout = isset( $_GET['layout'] )
    ? wp_unslash( $_GET['layout'] )
    : 'grid';

$layout = sanitize_key( $raw_layout );

if ( ! in_array( $layout, array( 'grid', 'list' ), true ) ) {
    $layout = 'grid';
}
```

Sanitization changes shape; validation decides whether the value is allowed. Do both when values control template branches, queries, file choices, classes, or external URLs.

## Forms Need Nonces

Themes should rarely mutate data. If a theme includes a form that changes state, use a nonce and capability check where relevant.

```php
<form method="post">
    <?php wp_nonce_field( 'mytheme_profile_action', 'mytheme_profile_nonce' ); ?>
    <input type="text" name="display_name" value="">
    <button type="submit"><?php esc_html_e( 'Save', 'mytheme' ); ?></button>
</form>
```

```php
add_action( 'template_redirect', 'mytheme_handle_profile_form' );

function mytheme_handle_profile_form(): void {
    if ( empty( $_POST['mytheme_profile_nonce'] ) ) {
        return;
    }

    $nonce = sanitize_text_field( wp_unslash( $_POST['mytheme_profile_nonce'] ) );
    if ( ! wp_verify_nonce( $nonce, 'mytheme_profile_action' ) ) {
        wp_die( esc_html__( 'Invalid request.', 'mytheme' ), '', array( 'response' => 403 ) );
    }

    if ( ! is_user_logged_in() ) {
        wp_die( esc_html__( 'You must be logged in.', 'mytheme' ), '', array( 'response' => 403 ) );
    }

    if ( ! current_user_can( 'edit_user', get_current_user_id() ) ) {
        wp_die( esc_html__( 'You cannot edit this profile.', 'mytheme' ), '', array( 'response' => 403 ) );
    }

    $display_name = isset( $_POST['display_name'] )
        ? sanitize_text_field( wp_unslash( $_POST['display_name'] ) )
        : '';

    wp_update_user(
        array(
            'ID'           => get_current_user_id(),
            'display_name' => $display_name,
        )
    );
}
```

If the form is core search or comments, prefer `get_search_form()`, `comment_form()`, and core comment APIs instead of custom handlers.

## Safe Template Loading

Never include a PHP file based on request input.

```php
// Wrong: request-controlled file path.
include get_template_directory() . '/views/' . $_GET['view'] . '.php';
```

Use a fixed map or `locate_template()`:

```php
$view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : 'grid';

$templates = array(
    'grid' => 'template-parts/archive-grid.php',
    'list' => 'template-parts/archive-list.php',
);

get_template_part(
    str_replace( '.php', '', $templates[ $view ] ?? $templates['grid'] )
);
```

For full-template overrides, return a controlled path from `template_include`; do not include-and-exit from `template_redirect`.

## Assets and Inline Data

Do not hardcode `<script>` or `<link>` tags in templates. Use enqueues.

```php
wp_enqueue_script(
    'mytheme-main',
    get_theme_file_uri( 'assets/js/main.js' ),
    array(),
    MYTHEME_VERSION,
    array(
        'strategy'  => 'defer',
        'in_footer' => true,
    )
);
```

For inline configuration:

```php
wp_add_inline_script(
    'mytheme-main',
    'window.MyTheme = ' . wp_json_encode(
        array(
            'homeUrl' => home_url( '/' ),
            'isRtl'   => is_rtl(),
        )
    ) . ';',
    'before'
);
```

Do not pass `<script>` tags to `wp_add_inline_script()`; WordPress strips and warns.

## Database and Queries

Prefer WordPress APIs over SQL:

- `WP_Query`, `get_posts()`, `get_terms()`, `get_users()`.
- `get_post_meta()`, `get_term_meta()`, `get_user_meta()`.
- `update_post_meta()` only when the theme truly owns presentation-specific meta.

If SQL is unavoidable, use `$wpdb->prepare()`:

```php
global $wpdb;

$count = (int) $wpdb->get_var(
    $wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_status = %s",
        'post',
        'publish'
    )
);
```

Do not build SQL with concatenated request data.

## Coding Standards Baseline

- Use full PHP tags: `<?php`, never short tags.
- Do not close PHP-only files with `?>`.
- Prefix global functions/hooks with the theme slug, or use a unique namespace for non-template code.
- Use lowercase, hyphenated file names.
- Use `require_once` for mandatory includes.
- Text domain must match the `Text Domain` header.
- Escape translated strings with the context-specific helper.
- Keep feature code that should survive a theme switch in a plugin.

## Theme Review Checklist

- Every `echo`, `printf`, attribute interpolation, and custom field output has context-appropriate escaping.
- Request data uses `wp_unslash()` before sanitization.
- Values controlling templates/classes/query args are allowlisted.
- Mutating forms have nonce checks and permission checks.
- `template_include` returns only controlled, existing theme paths.
- Assets are enqueued; inline data uses `wp_json_encode()`.
- No direct SQL without `$wpdb->prepare()`.
- `header.php` has `wp_head()` and `wp_body_open()`; `footer.php` has `wp_footer()`.

## Cross-References

- Broader WP security checklist: `wp-security-audit`
- Secrets/key handling: `wp-security-secrets`
- Theme structure and asset placement: `classic-theme-structure`
- Template file selection: `classic-template-hierarchy`

## References

- Official documentation: <https://developer.wordpress.org/themes/advanced-topics/security/>
- Official documentation: <https://developer.wordpress.org/apis/security/>
- Official documentation: <https://developer.wordpress.org/apis/security/escaping/>
- Official documentation: <https://developer.wordpress.org/apis/security/sanitizing/>
- Official documentation: <https://developer.wordpress.org/coding-standards/wordpress-coding-standards/php/>
- Verified source paths:
  - `wp-includes/template-loader.php`
  - `wp-includes/template.php`
  - `wp-includes/general-template.php`
  - `wp-includes/functions.wp-scripts.php`
  - `wp-includes/formatting.php`
  - `wp-content/themes/storefront/404.php`
  - `wp-content/themes/generatepress/header.php`
