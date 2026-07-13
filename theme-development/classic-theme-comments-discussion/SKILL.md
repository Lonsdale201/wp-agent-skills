---
name: classic-theme-comments-discussion
description: Build or audit classic theme comments output for WP 7.0. Covers `comments_template()`, `comments.php`, `post_password_required()`, `have_comments()`, `wp_list_comments()`, comment pagination, `comment_form()`, threaded comment reply script loading, closed-comment messaging, accessible comment navigation, escaping comment titles and labels, and common mistakes such as custom comment forms, missing password guards, loading `comment-reply` globally, broken callback walkers, or showing comments on unsupported post types.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-04"
---

# Classic Theme Comments and Discussion

Use this when adding or reviewing comments in a classic PHP theme: `comments.php`, comment list markup, comment pagination, the comment form, closed-comment states, and threaded reply behavior.

## When to Use This Skill

- Creating or editing `comments.php`.
- Calling `comments_template()` from `single.php`, `page.php`, or a singular template part.
- Styling `wp_list_comments()` output or replacing a comment callback.
- Loading `comment-reply`.
- Fixing missing comment pagination, password-protected post leaks, or inaccessible comment navigation.

## Call Comments From Singular Templates

In a singular template, call comments after the content when the post supports discussion.

```php
if ( comments_open() || get_comments_number() ) {
	comments_template();
}
```

Rules:

- Do not call `comments_template()` on archives or search templates.
- Check `comments_open()` or `get_comments_number()` before loading the template.
- If a custom post type does not support comments, do not force comments into its template.
- Keep the rendering code in `comments.php`.

`comments_template()` is designed for single/page contexts and returns early outside supported contexts unless `$withcomments` is set.

## comments.php Skeleton

Start with the password guard. This prevents comment content from leaking on protected posts.

```php
<?php
if ( post_password_required() ) {
	return;
}
?>

<section id="comments" class="comments-area" aria-label="<?php esc_attr_e( 'Comments', 'textdomain' ); ?>">
	<?php if ( have_comments() ) : ?>
		<h2 class="comments-title">
			<?php
			$comment_count = get_comments_number();

			printf(
				esc_html(
					_nx(
						'%1$s comment on "%2$s"',
						'%1$s comments on "%2$s"',
						$comment_count,
						'comments title',
						'textdomain'
					)
				),
				esc_html( number_format_i18n( $comment_count ) ),
				esc_html( get_the_title() )
			);
			?>
		</h2>

		<ol class="comment-list">
			<?php
			wp_list_comments(
				array(
					'style'      => 'ol',
					'short_ping' => true,
					'avatar_size' => 48,
				)
			);
			?>
		</ol>
	<?php endif; ?>

	<?php comment_form(); ?>
</section>
```

Rules:

- Use `post_password_required()` before output.
- Use `have_comments()` for the list state.
- Use `number_format_i18n()` for counts.
- Escape the post title when inserting it into a comment heading.
- Use `comment_form()` unless there is a very specific reason not to.

## Comment Pagination

If comment pagination is enabled, render navigation before and/or after the list.

```php
if ( get_comment_pages_count() > 1 && get_option( 'page_comments' ) ) :
	?>
	<nav class="comment-navigation" aria-label="<?php esc_attr_e( 'Comment navigation', 'textdomain' ); ?>">
		<h2 class="screen-reader-text"><?php esc_html_e( 'Comment navigation', 'textdomain' ); ?></h2>
		<div class="nav-previous"><?php previous_comments_link( esc_html__( 'Older comments', 'textdomain' ) ); ?></div>
		<div class="nav-next"><?php next_comments_link( esc_html__( 'Newer comments', 'textdomain' ) ); ?></div>
	</nav>
	<?php
endif;
```

Rules:

- Only show comment navigation when there is more than one comment page.
- Respect the `page_comments` option.
- Give comment navigation an accessible name.
- Do not build comment-page URLs manually.

## Comment List Output

Prefer core comment output unless the design truly needs custom markup.

```php
wp_list_comments(
	array(
		'style'       => 'ol',
		'short_ping'  => true,
		'avatar_size' => 48,
		'format'      => 'html5',
	)
);
```

Rules:

- `style => 'ol'` should match an ordered-list wrapper.
- Use `format => 'html5'` if the theme supports HTML5 comment markup.
- Avoid custom callbacks/walkers for simple class or avatar-size changes.
- If using a callback, escape author links, dates, edit links, and custom fields.
- Preserve reply links and moderation notices.

## Comment Form

Use `comment_form()` for the public comment form.

```php
comment_form(
	array(
		'title_reply_before' => '<h2 id="reply-title" class="comment-reply-title">',
		'title_reply_after'  => '</h2>',
	)
);
```

Rules:

- Do not hand-code a replacement form unless you are intentionally replacing core behavior.
- Core handles logged-in state, required fields, cookies consent, form action, hidden comment fields, and closed comments.
- If overriding fields, keep labels, `required` state, autocomplete attributes, and cookies consent behavior.
- Escape any custom labels or descriptions.

## Threaded Replies

Load `comment-reply` only when it can be used.

```php
add_action( 'wp_enqueue_scripts', 'mytheme_enqueue_comment_reply' );

function mytheme_enqueue_comment_reply() {
	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}
}
```

Rules:

- Do not enqueue `comment-reply` globally.
- The script belongs on `wp_enqueue_scripts`, not inside `comments.php`.
- Threaded comments also need compatible `wp_list_comments()` output and reply links.

## Closed Comments

Show a closed-comments message only when useful.

```php
if ( ! comments_open() && get_comments_number() && post_type_supports( get_post_type(), 'comments' ) ) :
	?>
	<p class="no-comments"><?php esc_html_e( 'Comments are closed.', 'textdomain' ); ?></p>
	<?php
endif;
```

Do not show "Comments are closed" on every page with no discussion.

## Review Checklist

- Singular templates call `comments_template()` only when needed.
- `comments.php` returns early for `post_password_required()`.
- Comment count headings are pluralized and escaped.
- Comment pagination respects `page_comments`.
- `wp_list_comments()` is used instead of raw comment loops.
- `comment_form()` is used instead of a hand-built form.
- `comment-reply` is conditionally enqueued.
- Closed-comment messaging is not noisy.
- Custom callbacks preserve reply links, moderation state, and escaping.

## Common Mistakes

- Forgetting the password-protected post guard.
- Building a custom public comment form and losing core hidden fields/consent behavior.
- Loading `comment-reply` on every frontend request.
- Rendering comment navigation when comments are not paginated.
- Echoing `get_the_title()` raw inside the comments heading.
- Using a `<div>` wrapper while asking `wp_list_comments()` for `style => 'ol'`.

## References

- Official documentation: <https://developer.wordpress.org/themes/classic-themes/templates/partial-and-miscellaneous-template-files/comment-template/>
- Official documentation: <https://developer.wordpress.org/reference/functions/comment_form/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_list_comments/>
- Verified source paths:
  - `wp-includes/comment-template.php`
  - `wp-includes/script-loader.php`
  - `wp-content/themes/storefront/comments.php`
  - `wp-content/themes/generatepress/comments.php`
