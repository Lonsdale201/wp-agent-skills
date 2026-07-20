---
name: wp-security-audit
description: Audits WordPress plugin or theme PHP code for the most common
  security mistakes — missing nonce checks, capability checks, input
  normalization/validation, output escaping, unslashing, SQL preparation, AJAX nopriv
  exposure, file/path traversal, and unsafe redirects. Use when reviewing
  pull requests, before releasing a plugin, when the user asks "is this
  secure", or when handling code that touches $_GET / $_POST / $_REQUEST /
  $_COOKIE / $_FILES / $_SERVER, admin-ajax / admin-post, REST endpoints,
  options, user meta, custom DB queries, or file uploads.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-12"
---

# WordPress security audit

A defensive checklist-driven review for WP plugin and theme PHP. Goal:
catch the boring, repeatable mistakes that ship to production because no
one ran through the basics. This is **not** a substitute for a real
security review of cryptography, business logic, or third-party deps.

## When to use this skill

Trigger this skill when ANY of the following is true:

- The user asks for a security review, audit, or "is this safe".
- The diff or file under discussion contains: `$_GET`, `$_POST`,
  `$_REQUEST`, `$_COOKIE`, `$_FILES`, `$_SERVER`, `wp_unslash`,
  `wp_verify_nonce`, `check_admin_referer`, `current_user_can`,
  `add_action( 'wp_ajax`, `add_action( 'admin_post`,
  `register_rest_route`, `$wpdb->`, `update_option`, `update_user_meta`,
  `wp_redirect`, `wp_safe_redirect`, `file_get_contents`, `move_uploaded_file`.
- The user is preparing a plugin for release or wp.org submission.
- The user is reviewing a contributor's PR.

## How to run the audit

Work through the **Critical checks** below in order. For each finding:

1. State the file and line.
2. Name the issue using its conventional WP terminology
   (e.g. "missing nonce", "unescaped output", "broken access control").
3. Show the offending code (1–3 lines).
4. Show the fix.
5. Mark severity: **HIGH** (exploitable now), **MEDIUM** (exploitable under
   conditions), **LOW** (hardening / best practice).

Do NOT silently rewrite the file. Produce a report first; only edit if the
user asks you to apply fixes.

## Critical checks

### 1. Nonce verification on state-changing requests

Any cookie-authenticated browser handler that *writes* (saves an option,
updates meta, deletes a post, sends an email, or mutates anything) must
verify request intent with a nonce.

- Forms: `wp_nonce_field( 'action_name', '_wpnonce' )` →
  `check_admin_referer( 'action_name' )` in handler.
- AJAX: `wp_create_nonce( 'action_name' )` → `check_ajax_referer( 'action_name', 'nonce' )`.
- REST: rely on cookie auth + the built-in `_wpnonce` (`wp-api` nonce) for
  logged-in routes; for `permission_callback` use a real capability check.

A nonce is not authentication or authorization. Signed webhooks,
Application Password/OAuth clients, cron, and WP-CLI use their own trust
boundary instead of a WordPress nonce. Guest nonces do not identify a guest;
public writes also need abuse controls such as throttling, replay protection,
or CAPTCHA where appropriate. A cacheable, read-only public endpoint does not
automatically need a nonce.

**Common mistake:** verifying the nonce inside an `if` whose `else` branch
still does the write. The nonce check must short-circuit.

### 2. Capability checks (authorization)

Authentication ≠ authorization. A logged-in subscriber is still a user.

- Admin actions: `current_user_can( 'manage_options' )` or a more
  specific capability (`edit_posts`, `edit_post` with object ID,
  `manage_woocommerce` etc.).
- Object-level actions MUST pass the object ID:
  `current_user_can( 'edit_post', $post_id )` — the ID-less form is wrong.
- REST `permission_callback` must enforce the route's actual access policy.
  `__return_true` is dangerous on privileged writes, but can be intentional
  for genuinely public endpoints. Signed webhook routes should verify the
  signature before mutation, preferably in `permission_callback`.

### 3. Input: unslash → normalize when needed → validate

WordPress slashes superglobals. First recover the domain value, then choose
lossy normalization only when the field's meaning permits it, and always
validate the semantic contract:

```php
$raw      = isset( $_POST['email'] ) ? wp_unslash( $_POST['email'] ) : '';
$email    = sanitize_email( $raw );
if ( ! is_email( $email ) ) { /* reject */ }
```

- Missing `wp_unslash` before normalization can leak transport slashes into
  stored data. Do not unslash values that did not come from a slashed boundary.
- Choose the normalizer by field meaning: text, textarea, email, URL, key,
  integer, allowed HTML, and filesystem path need different contracts. See the
  extended `reference.md` map.
- Never trust `$_SERVER['HTTP_*']` headers without sanitizing; they're
  attacker-controlled.

Sanitization is not a ritual and is often lossy. Migration, import/export,
database repair, code-editor, and opaque meta-value tools may need to preserve
HTML, percent sequences, quotes, or backslashes exactly. Do not recommend
`sanitize_text_field()` merely to silence a sniff. Require strict type/shape,
encoding/size/domain validation, a safe sink, and escaped output. See
`reference.md` for the exact-preservation pattern.

### 4. Output escaping (XSS)

Escape **at the point of output**, in the right context:

- HTML body: `esc_html( $x )`
- HTML attribute: `esc_attr( $x )`
- URL in `href`/`src`: `esc_url( $x )`
- Inside `<script>` JSON: `wp_json_encode( $x )`, never raw concatenation
- Translated strings with placeholders: escape the **template** AND
  the **substituted value** separately. `esc_html__()` only escapes
  the static template; `printf( esc_html__( '%s', 'td' ), $name )` is
  XSS if `$name` contains markup. Correct form:
  `printf( esc_html__( 'Hello, %s', 'td' ), esc_html( $name ) )`.
- Already-HTML content (post content): `wp_kses_post( $x )`

`echo $foo;` where `$foo` came from input or DB without escaping → XSS.
This is the most common finding in plugin audits.

### 5. SQL: always prepare

```php
// WRONG
$wpdb->get_results( "SELECT * FROM x WHERE id = $id" );

// RIGHT
$wpdb->get_results( $wpdb->prepare( "SELECT * FROM x WHERE id = %d", $id ) );
```

- `%d` integers, `%f` floats, `%s` strings, `%i` table/column identifiers
  (WordPress 6.2+). Still use a semantic allowlist for user-selected columns,
  tables, and sort directions: `%i` quotes an identifier but does not decide
  whether that identifier is allowed by the feature.
- `LIKE` needs `$wpdb->esc_like()` BEFORE `prepare()`:
  `$like = '%' . $wpdb->esc_like( $term ) . '%';`
- Prefer WP_Query / get_posts / get_users over raw SQL where possible.

### 6. AJAX endpoints

Two hooks, two meanings — confuse them and you ship a vulnerability:

- `wp_ajax_{action}` — fires only for **logged-in** users.
- `wp_ajax_nopriv_{action}` — fires for **logged-out** users.

Rules:
- Register `nopriv` ONLY if the feature is genuinely meant for guests
  (e.g. public search, login form). Never copy-paste both registrations
  "to be safe".
- Cookie-authenticated writes need `check_ajax_referer()`. Public read-only
  handlers do not automatically need a nonce; use one only when it protects
  a browser action, and never treat a guest nonce as authorization.
- The `nopriv` handler must NOT perform actions that only logged-in users
  should do (saving prefs, accessing other users' data, etc.).
- End with `wp_send_json_success` / `wp_send_json_error`, not `echo` + `die`.

### 7. admin-post and form handlers

`admin_post_{action}` and `admin_post_nopriv_{action}` follow the same
rules as AJAX. Plus: redirect with `wp_safe_redirect()` + `exit;`. Never
redirect with `wp_redirect( $_GET['redirect_to'] )` without validating
against an allowlist — that's an open-redirect.

### 8. REST API routes

```php
register_rest_route( 'myplugin/v1', '/save', [
    'methods'             => 'POST',
    'callback'            => 'myplugin_save',
    'permission_callback' => function () {
        return current_user_can( 'manage_options' );
    },
    'args' => [
        'id' => [
            'required'          => true,
            'type'              => 'integer',
            'minimum'           => 1,
            'validate_callback' => 'rest_validate_request_arg',
            'sanitize_callback' => 'absint',
        ],
    ],
] );
```

Findings to flag:
- `permission_callback` missing, or `__return_true` on a non-public route.
- No `args` schema and no equivalent validation in the callback. A route may
  validate manually, but a schema is preferred because it is discoverable
  and runs consistently before permission and endpoint callbacks.
- Returning raw DB rows including sensitive columns (`user_pass`,
  `user_activation_key`, private meta).

### 9. File operations

- Uploads: validate MIME via `wp_check_filetype_and_ext()`, store via
  `wp_handle_upload()`, never trust the client-provided extension or MIME.
- Path joins with user input: after building, `realpath()` and check the
  result starts with the intended base dir. Otherwise: path traversal.
- Never `include` / `require` a path containing user input.

### 10. Secrets and information disclosure

- No API keys or DB credentials in the plugin source. Use options or
  constants in `wp-config.php`.
- `WP_DEBUG_DISPLAY` should be off in prod; flag any `var_dump`,
  `print_r`, `error_log( $sensitive )` left in handlers.
- Don't leak stack traces, full SQL, or user enumeration via error
  messages ("user not found" vs "wrong password" — pick one).

### 11. Redirects

- Use `wp_safe_redirect()` for any URL that may be influenced by input.
- Always `exit;` after a redirect — execution continues otherwise.

### 12. Cron and background jobs

- `wp_schedule_event` callbacks run with no current user. If the job
  performs privileged work, do not trust any "stored intent" without
  re-validating; treat persisted user input as untrusted.

## False-positive guards

- Accept exact preservation when its validation, sink, and output contracts are
  explicit.
- Do not require a nonce for read-only public endpoints, cron, WP-CLI, or signed
  non-cookie requests; identify the actual trust boundary.
- Do not flag code-generated `IN` placeholders as injection when the placeholder
  string contains only generated `%s`/`%d` tokens and all values reach
  `$wpdb->prepare()`.

## What this skill does NOT cover

- Cryptographic correctness (key derivation, signing schemes).
- Business-logic flaws (race conditions, IDOR beyond capability checks).
- Retry/idempotency/partial-failure flaws in bulk writes — use
  **`wp-batch-mutation-audit`**.
- Metadata slashing/revision/multi-row/serialization — use **`wp-metadata-api`**.
- Third-party library CVEs — run `composer audit` separately.
- Frontend JS XSS — different skill.
- Server / hosting hardening (file perms, disable_functions, etc.).
- Object injection, SSRF, CSRF on GET, mass assignment, file include,
  mail/zip injection, timing comparison, TOCTOU races — these are
  covered by **`wp-security-deep`**. Run it after this one.
- Hardcoded credentials, weak randomness for tokens, password
  storage, cookie flags, secrets in logs — covered by
  **`wp-security-secrets`**. Run it whenever auth or third-party
  integrations are in scope.

State this scope and recommend applicable deeper skills in the report footer.

## Report format

```
# Security audit: <plugin name>
Scope: <files reviewed>
Date: <YYYY-MM-DD>

## HIGH
1. <file>:<line> — <issue>
   <code>
   Fix: <code>

## MEDIUM
...

## LOW / Hardening
...

## Out of scope
- <thing not checked>
```

## References

- Detailed examples of each finding type, before/after: `reference.md`
- Real-world snippets with the fix applied: `examples/`
- WordPress core: [Plugin Security Handbook](https://developer.wordpress.org/plugins/security/) and [Roles and Capabilities](https://wordpress.org/documentation/article/roles-and-capabilities/)
- Official documentation: <https://developer.wordpress.org/apis/security/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_verify_nonce/>
- Official documentation: <https://developer.wordpress.org/reference/functions/current_user_can/>
