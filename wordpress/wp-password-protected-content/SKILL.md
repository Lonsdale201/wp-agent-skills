---
name: wp-password-protected-content
description: >-
  Implements and audits WordPress built-in password-protected posts, pages,
  and custom post types. Covers `post_password`, `post_password_required()`,
  `get_the_password_form()`, the `wp-login.php?action=postpass` handler,
  `wp-postpass_` cookie semantics, REST `password` requests, cache isolation,
  protected comments/feeds, and guarding custom meta, blocks, media, and API
  output. Use when extending the password form, changing cookie lifetime or
  protected titles, adding editor/role bypasses, building a headless reader,
  or reviewing leaks where content visibility relies on a post password. Do
  not use for user login, Application Password, membership, private-file auth,
  or an internal data store that merely reuses the `post_password` column.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-22"
---

# WordPress password-protected content

Implement or review WordPress's built-in shared-password gate without treating
it as user authentication or encrypted storage. Preserve the core form/cookie
contract, guard every custom output surface, and prevent caches from publishing
an unlocked representation.

Read [references/runtime-and-extension-contracts.md](references/runtime-and-extension-contracts.md)
when working on headless/REST access, replacing the form, changing bypass
policy, or auditing exactly which core surfaces are and are not protected.

## When to use this skill

- Code uses `post_password` or `has_password` to control public post, page,
  product, course, or custom-post-type visibility.
- A template, block, shortcode, widget, email, feed, export, REST route, or
  GraphQL resolver displays data belonging to a protected post.
- Code calls `post_password_required()`, `get_the_password_form()`,
  `get_the_content()`, or filters `the_password_form`.
- A theme changes the protected title, invalid-password message, form markup,
  or WordPress 7.1 block-theme styling.
- A headless or mobile client must read a protected post or its comments.
- A cache/CDN serves a different response before and after password entry.
- The requested feature needs one shared secret, and you must decide whether
  core post-password protection is strong enough.

Do not trigger merely for user-password/login code or because an internal data
store reuses the column, such as legacy Action Scheduler claim IDs or legacy
WooCommerce order keys. Verify the field's semantic purpose before auditing it.

## Choose the correct access primitive

Use the built-in post password only when all intended readers may share one
secret and disclosure of the post title/permalink is acceptable.

| Requirement | Appropriate mechanism |
|---|---|
| One shared secret gates ordinary post content | Core post password can fit. |
| Per-user grant/revocation, audit, expiry, ownership, subscription, or role | Authenticated users plus capability/entitlement policy. |
| Hide the post's existence from anonymous visitors | Private/custom status plus authorization, not only `post_password`. |
| Protect original media URLs or downloadable files | Authorized delivery outside public uploads or signed/controlled downloads. |
| High-value confidential data | Purpose-built authentication and authorization; do not rely on a shared post password. |

The password is stored as plaintext in `wp_posts.post_password`; the post body
is not encrypted. The browser cookie stores a salted PHPass hash, but acts as a
site-scoped proof for whichever post has the matching plaintext password. Core
has no per-reader identity, revocation list, attempt counter, or audit trail.

## Understand the core contract

1. A published post retains a non-empty `post_password` value.
2. Locked content renders `get_the_password_form()` rather than the body.
3. The form posts `post_password` and `redirect_to` to
   `wp-login.php?action=postpass`.
4. Core writes one `wp-postpass_` plus `COOKIEHASH` cookie for the site and
   redirects safely to the post.
5. `post_password_required( $post )` verifies that cookie hash against the
   post's current plaintext password.

The cookie is not keyed by post ID. Posts sharing a password unlock together;
entering a different password replaces the cookie, so only one distinct post
password works in that browser at a time. Logged-in users do not automatically
bypass the frontend check.

## Guard all custom output

Check the exact owning post before reading or rendering custom data:

```php
$post = get_post( $post_id );

if ( ! $post ) {
    return '';
}

if ( post_password_required( $post ) ) {
    // Let the owning post template render the core form once.
    return '';
}

return esc_html( (string) get_post_meta( $post->ID, '_acme_summary', true ) );
```

Use the same boundary for custom fields, blocks, shortcodes, related records,
downloads, JSON, email, exports, and secondary queries. Never infer access from
cookie presence alone; `post_password_required()` validates it.

Do not assume these operations enforce the gate:

- `get_post()`, `get_post_field()`, direct post content properties, and `$wpdb`;
- `get_post_meta()` or custom-table lookups;
- directly applying `the_content` to a raw content string;
- `get_the_post_thumbnail()`, attachment metadata, or a public uploads URL;
- a custom REST/GraphQL endpoint or search indexer.

Core template functions protect the ordinary content/excerpt path and several
comment, feed, block-binding, and block surfaces. That is not a general data-
access policy for plugin code.

## Extend the form without breaking it

Prefer styling or a surgical `WP_HTML_Tag_Processor` change over rebuilding the
entire form. This retains the action, redirect, unique label/input ID, error
announcement, translations, and WordPress 7.1 block-theme button classes:

```php
add_filter(
    'the_password_form',
    static function ( string $html, WP_Post $post, string $invalid_password ): string {
        $processor = new WP_HTML_Tag_Processor( $html );

        while ( $processor->next_tag( 'input' ) ) {
            if ( 'post_password' === $processor->get_attribute( 'name' ) ) {
                $processor->add_class( 'acme-post-password' );
                break;
            }
        }

        return $processor->get_updated_html();
    },
    10,
    3
);
```

If full replacement is unavoidable, preserve every contract listed in the
reference and test classic plus block themes. Filter output is a trusted
plugin/theme surface: escape translated text and attributes deliberately.

WordPress 7.1 wraps the submit control with `.wp-block-button` and applies
`.wp-block-button__link` plus the current button element class for block themes;
it also enqueues the registered `wp-block-button` style. A legacy full-form
replacement silently loses that improvement.

## Add bypasses as authorization policy

Scope `post_password_required` narrowly. For an editorial frontend preview, an
object-level edit capability is a defensible bypass:

```php
add_filter(
    'post_password_required',
    static function ( bool $required, WP_Post $post ): bool {
        if ( $required && current_user_can( 'edit_post', $post->ID ) ) {
            return false;
        }

        return $required;
    },
    10,
    2
);
```

Do not substitute `read_post` as a membership check: for an ordinarily
published post it is commonly true for logged-in readers and does not express
the intended entitlement. Prefer a dedicated capability or an explicit
object-level entitlement service. Remember that this filter influences every
caller, including comments, blocks, feeds, and REST preparation.

## Handle REST and headless clients deliberately

Prefer the core posts endpoint for core post fields. A single-item request may
supply the plaintext `password`; without it, `content.rendered` and
`excerpt.rendered` are empty and their `protected` flags are true. A wrong
supplied password returns `rest_post_incorrect_password` with HTTP 403. An
authenticated editor using `context=edit` can access content when allowed to
edit that post.

Passwords in query strings can enter browser history, proxy/CDN logs,
analytics, traces, and error reports. Require HTTPS, redact the parameter, do
not persist it in client state, and never shared-cache a successful response.
For higher-value or per-user content, use authenticated authorization rather
than extending the query-password design.

Custom endpoints must independently protect every additional field. A public
`permission_callback` followed by an unchecked meta/custom-table read bypasses
the post password even when the core posts response is correct.

## Isolate caches

Core sends no-cache headers for singular posts with a non-empty
`post_password`, whether currently locked or unlocked. Preserve them. A page
cache or CDN that serves before WordPress runs must also bypass protected URLs
or requests carrying a `wp-postpass_` cookie; never let unlocked HTML populate
an anonymous cache key.

Apply the same rule to REST responses, fragments, edge rendering, service
workers, and headless caches. Purging after a password change does not fix a
design that mixes locked and unlocked variants.

## Audit and test

Test observable behavior with a temporary protected post:

1. No cookie, malformed cookie, correct cookie, wrong cookie, and expired cookie.
2. Two posts sharing a password and two posts using different passwords.
3. Anonymous, subscriber, editor without cookie, and explicitly authorized
   bypass behavior.
4. Content, excerpt, title, comments, featured image/media, custom meta,
   dynamic blocks, related records, feeds, email, exports, and custom APIs.
5. REST with absent, correct, and wrong password; `view` versus permitted
   `edit` context; comment endpoints where applicable.
6. Classic and block themes, invalid-password announcement, keyboard/label
   behavior, duplicate forms, and WordPress 7.1 button classes.
7. Origin/page cache, CDN, query logs, browser history, password changes, and a
   direct public media URL.

Distinguish a content leak from a UI mismatch. Report file/line, post/output
surface, request identity and cookie/password state, cache layer, exposed data,
and the smallest policy-preserving fix.

## Severity guide

- **HIGH:** locked body, custom data, comments, export, or unlocked cached
  response is available without the password/authorized entitlement; a file
  claimed to be private remains publicly downloadable.
- **MEDIUM:** brute-force exposure without required controls, broad filter
  bypass, password-bearing URL leakage, or cache behavior that can mix variants
  under realistic infrastructure conditions.
- **LOW:** inaccessible form, lost invalid-password feedback, missing 7.1 theme
  styling, overly long cookie lifetime, or misleading protected-title output.
- **INFO:** the built-in shared-secret model cannot satisfy stated per-user,
  confidentiality, audit, or private-file requirements and needs redesign.

Do not label the core form's missing nonce as CSRF by itself. The handler changes
only the visitor's post-password cookie and does not grant server-side user
privileges. If a customization adds account, entitlement, or persistent state
changes, protect those mutations separately.

## Critical rules

- Treat post-password protection as presentation gating, not encryption or user
  authentication.
- Check the exact post with `post_password_required()` before every custom
  output surface.
- Do not reveal protected data through public media URLs, metadata, related
  tables, custom blocks, APIs, feeds, emails, or caches.
- Never test only cookie presence; verify through core or an equivalent explicit
  password check at an API boundary.
- Never shared-cache unlocked HTML or a successful password-bearing response.
- Preserve the form action, field names, safe redirect, accessibility, and 7.1
  block-theme behavior when customizing markup.
- Do not log plaintext post passwords or return `post_password` in public API
  responses.
- Prefer authenticated object-level authorization when requirements exceed one
  shared site-scoped secret.

## Cross-references

- Run **`wp-rest-api`** for a custom protected REST resource or headless route.
- Run **`wp-security-audit`** for capability, output, custom download, and
  endpoint review around the gate.
- Run **`wp-security-deep`** for rate limits, lockout DoS, cache/proxy, and
  secret-handling boundaries.

## What this skill does NOT cover

- WordPress login passwords, reset flows, Application Passwords, or Basic Auth.
- Membership, paywall, DRM, document-room, or per-user entitlement systems.
- Making public uploads private merely because their parent post is protected.
- Whole-site password protection or HTTP server authentication.

## References

- Detailed runtime, output, hook, REST, and extension contracts:
  [references/runtime-and-extension-contracts.md](references/runtime-and-extension-contracts.md)
- Official core references: [`post_password_required()`](https://developer.wordpress.org/reference/functions/post_password_required/),
  [`get_the_password_form()`](https://developer.wordpress.org/reference/functions/get_the_password_form/),
  and the [posts REST endpoint](https://developer.wordpress.org/rest-api/reference/posts/).
- WordPress 7.1 protected-form accessibility note: <https://make.wordpress.org/core/2026/08/13/accessibility-improvements-in-wordpress-7-1/>
- Verified WordPress 7.1 source paths:
  - `wp-includes/post-template.php`, `wp-login.php`, `wp-includes/class-wp.php`, `wp-includes/class-wp-query.php`, `wp-includes/comment.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`, `wp-includes/rest-api/endpoints/class-wp-rest-comments-controller.php`
  - `wp-includes/block-bindings/post-meta.php`, `wp-includes/block-bindings/post-data.php`
