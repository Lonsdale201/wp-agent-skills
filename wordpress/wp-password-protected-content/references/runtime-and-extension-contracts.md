# Runtime and extension contracts

Read this reference when replacing the form, implementing headless access,
adding bypass policy, or auditing a suspected leak. The contracts below are
verified against WordPress 7.1 source and runtime behavior.

## Runtime sequence and data model

### Storage and creation

- `wp_posts.post_password` is `varchar(255)` and stores the post password in
  plaintext. It is unrelated to a user's hashed `user_pass` value.
- Some legacy systems reuse this generic posts-table column for internal data,
  such as an Action Scheduler claim ID or an order key. Apply this skill only
  when the value participates in WordPress content visibility.
- `wp_insert_post()` and `wp_update_post()` accept `post_password`. They do not
  authorize the caller; the calling handler must already be authorized.
- Core admin handling removes a submitted post password when the user lacks the
  post type's `publish_posts` capability.
- `wp_insert_post()` clears `post_password` when it stores a private post.
  Private visibility and shared-password visibility are separate models.
- Clearing `post_password` removes the gate. Changing it invalidates the old
  cookie for that post because the stored hash no longer verifies.

The editor UI and database field allow up to 255 characters. Do not promise a
larger value merely by changing a frontend input's attributes.

### Submission and cookie

The core form posts to:

```text
wp-login.php?action=postpass
```

Its relevant contract is:

```text
method:       POST
field:        post_password
redirect:     redirect_to, normally the exact post permalink
cookie name:  wp-postpass_{COOKIEHASH}
default TTL:  10 days
```

The WordPress 7.1 handler:

1. obtains `redirect_to` from POST or the referrer;
2. hashes the unslashed submitted value with portable PHPass;
3. writes the site-wide cookie;
4. derives the Secure flag from the redirect URL's scheme; and
5. performs a safe redirect.

The handler does not first resolve a post or verify its password. A wrong value
still becomes the new cookie; the redirected post detects that it does not
match. Core's cookie contains a reusable hash rather than the plaintext, but
WordPress 7.1 does not set it HttpOnly or attach an explicit SameSite attribute.
Treat XSS as capable of stealing this proof. It is not account authentication
or a high-assurance secret store.

### Verification

`post_password_required( $post )` behaves as follows:

1. no stored post password means access is not required;
2. a missing cookie means the password is required;
3. a cookie that does not begin with WordPress's portable `$P$B` prefix is
   rejected;
4. `PasswordHash( 8, true )->CheckPassword()` compares the post's plaintext
   password to the cookie hash; and
5. `post_password_required` filters the resulting boolean with the `WP_Post`.

Consequences:

- one cookie is shared across the site, not keyed by post ID;
- equal post passwords unlock each other;
- submitting another distinct password replaces the first proof;
- logged-in users, administrators included, do not automatically bypass the
  frontend gate; and
- cookie presence alone never proves access.

## Built-in output matrix

| Surface | WordPress 7.1 default behavior | Extension risk |
|---|---|---|
| Singular title | Remains visible and uses `protected_title_format` while `post_password` is non-empty, even after unlocking. | A custom title API can omit the disclosure marker or expose confidential title text. |
| `get_the_content()` | Returns the password form while locked. | Reading `$post->post_content`, `get_post_field()`, or filtering a raw string bypasses the gate. |
| `get_the_excerpt()` | Returns the protected-post message while locked. | Raw `post_excerpt` remains directly readable. |
| Post classes | Uses `post-password-required` while locked and `post-password-protected` after unlock. | Do not use CSS class state as authorization. |
| Core post-content rendering | Respects the gate. | Custom block renderers and secondary data must guard their owning post. |
| Core post-data/post-meta block bindings | Return their protected fallback or no value while locked. | Other dynamic sources, custom bindings, and direct meta reads are not automatically covered. |
| Comments | Core display and submission flows block access while the parent post is locked. | Custom comment queries and public APIs can bypass the parent check. |
| Feeds and enclosures | Core feed paths suppress protected content/enclosures. | Custom feeds, podcast XML, and webhooks must implement the same policy. |
| Logged-out search | `WP_Query` search excludes password-protected posts. Logged-in search does not apply that exclusion. | Custom search/index services may reveal title, excerpt, or fields. |
| Featured images and attachments | A template helper or public uploads URL is not a universal private-file boundary. | The original file may remain directly downloadable. |
| Meta and custom tables | Direct reads return the stored values. | Always guard the parent post before output. |
| `get_post()`, post properties, `$wpdb` | Return raw stored data. | These are data APIs, not authorization APIs. |
| Core posts REST response | Public `view` requests keep rendered content/excerpt empty until the password is accepted; their `protected` flags remain true. | Extra registered fields and custom routes need their own guard. |

Also review menus, cards, related-content widgets, schema/OpenGraph metadata,
sitemaps, emails, exports, webhooks, analytics payloads, search documents, and
AI/vector indexes. A protected primary template does not secure these secondary
representations.

## Hook contracts

### `post_password_required`

```php
apply_filters( 'post_password_required', bool $required, WP_Post $post );
```

Use this only for a deliberate authorization rule. Scope it to the exact post,
post type, request context, and object-level capability or entitlement. A broad
`return false` changes every caller, including REST preparation, comments,
blocks, and feeds.

### `the_password_form`

```php
apply_filters(
    'the_password_form',
    string $output,
    WP_Post $post,
    string $invalid_password
);
```

A full replacement must preserve:

- POST to `site_url( 'wp-login.php?action=postpass', 'login_post' )`;
- hidden `redirect_to` with the exact permalink;
- input name `post_password`;
- a unique label/input ID such as `pwbox-{post ID}`;
- accessible label and submit controls;
- visible and announced invalid-password feedback;
- translated and escaped text/attributes; and
- the WordPress 7.1 block-theme button wrapper and classes where applicable.

Multiple protected components can otherwise emit duplicate IDs or multiple
forms. Prefer one owning form boundary or preserve core's post-specific ID.

### `the_password_form_incorrect_password`

```php
apply_filters(
    'the_password_form_incorrect_password',
    string $incorrect_password_text,
    WP_Post $post
);
```

WordPress considers the password invalid when the raw referrer equals the post
permalink and a postpass cookie exists. The returned string is inserted into
trusted form markup, so escape custom text yourself:

```php
add_filter(
    'the_password_form_incorrect_password',
    static function ( string $text, WP_Post $post ): string {
        return esc_html__( 'That password did not match. Try again.', 'acme' );
    },
    10,
    2
);
```

### `post_password_expires`

```php
apply_filters( 'post_password_expires', time() + 10 * DAY_IN_SECONDS );
```

The value is an absolute Unix timestamp, not a duration. Return `0` for a
session cookie. The filter receives no post ID, so a post-specific TTL needs a
separate flow or carefully controlled request context.

```php
add_filter(
    'post_password_expires',
    static function (): int {
        return time() + HOUR_IN_SECONDS;
    }
);
```

### `protected_title_format`

The format normally contains one `%s` placeholder for the original title:

```php
add_filter(
    'protected_title_format',
    static function (): string {
        return __( 'Restricted: %s', 'acme' );
    }
);
```

This filter changes presentation only. It neither grants access nor hides the
title.

### `login_form_postpass`

This action fires in `wp-login.php` before core handles the submission. It can
support telemetry or global abuse controls, but it is not post-specific because
core has not resolved a target post. Never log the submitted password. If a
custom flow mutates account, entitlement, or persistent state, apply its own
nonce and authorization controls.

The core post-password form has no nonce. That alone is not a privilege-
escalation CSRF: by default, submission only replaces the current visitor's
postpass cookie. Treat added state-changing behavior separately.

## REST and headless behavior

For a core post at `/wp-json/wp/v2/posts/{id}`:

| Request state | Expected result |
|---|---|
| Anonymous `context=view`, no password/cookie | HTTP 200; rendered content/excerpt empty, `protected: true`. |
| Anonymous `context=view`, wrong non-empty `password` | `rest_post_incorrect_password`, HTTP 403. |
| Anonymous `context=view`, correct plaintext `password` | HTTP 200 with rendered protected fields. |
| Same-origin client with a matching postpass cookie | The ordinary `post_password_required()` path can satisfy the gate without repeating the query parameter. |
| Authenticated user with permitted `context=edit` | Access is based on the post's edit capability; the password field is exposed only in edit context. |

The `password` parameter is a read-time proof, not the cookie's PHPass hash.
Sending the hash as the REST password is incorrect.

Query parameters are liable to enter browser history, proxy/access logs, CDN
keys, analytics, traces, and error reports. Require HTTPS, redact `password`,
avoid persisting it in application state, and prevent shared caching of a
successful response. For an SPA, consider a same-origin server-side exchange;
for a mobile or high-value system, prefer authenticated object authorization.

Core comment routes accept the parent post password where applicable. Constrain
comment collection requests to the exact parent post, and retest both listing
and creation. Do not assume an unrelated custom comment endpoint inherits that
behavior.

Custom endpoint anti-patterns include:

- a public `permission_callback` followed by unchecked post/meta/table reads;
- accepting a password but comparing it with loose equality;
- treating a postpass cookie's existence as proof;
- returning `post_password` to help a client compare locally;
- caching the unlocked response under the same URL/key as the locked response;
- exposing an attachment URL that bypasses the endpoint entirely; and
- using `read_post` as a paid-access or membership entitlement.

When a custom endpoint is justified, separate route permission from
representation gating: authorize the caller, resolve the exact owning object,
verify its access policy, and only then prepare fields.

## Queries and listings

`WP_Query` supports selection filters, not password authentication:

```php
new WP_Query( array( 'has_password' => true ) );
new WP_Query( array( 'has_password' => false ) );
new WP_Query( array( 'post_password' => 'shared-value' ) );
```

`has_password` selects rows with or without a stored password.
`post_password` selects rows with an exact stored plaintext value. Neither
proves that the current request may reveal those rows' protected fields.

For every listing, decide independently whether locked posts should be:

- omitted entirely;
- shown with title/permalink but no protected excerpt/data; or
- shown only after the exact post passes its access check.

Do not rely on core's anonymous search exclusion for archives, custom SQL,
REST collections, third-party indexing, or logged-in users.

## Cache contract

For a singular post with non-empty `post_password`, core's `WP::send_headers()`
sends no-cache headers whether the current cookie is locked or unlocked. This
helps only when the request reaches WordPress.

| Variant | Safe cache treatment |
|---|---|
| No cookie, locked HTML | Do not mix with unlocked HTML; obey no-cache. |
| Correct cookie, unlocked HTML | Private/no-store or equivalent; never shared-cache. |
| Wrong or malformed cookie | Locked response; do not create a reusable unlocked variant. |
| Password changed, old cookie | Verification fails and the post locks again. Purge any stale external representation. |
| Expired cookie | Locked response. |
| Correct REST `password` | Do not shared-cache; redact query/log data. |
| Direct public media URL | Assume public until a separate delivery control proves otherwise. |

At an edge cache, bypass protected post URLs and requests carrying a cookie
whose name begins `wp-postpass_`. Apply equivalent isolation to fragments,
service workers, static generation, mobile caches, preview systems, and search
indexes. Cache purging is not a substitute for preventing cross-variant reuse.
