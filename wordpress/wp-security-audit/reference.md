# Security audit — extended reference

Read this file when the SKILL.md checklist is not enough — typically when
the user asks for explanations, when a finding is borderline, or when you
need a known-good fix to copy.

## 1. Nonce: the full lifecycle

### Form submission

```php
// In the form template
?>
<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
    <?php wp_nonce_field( 'myplugin_save_settings', 'myplugin_nonce' ); ?>
    <input type="hidden" name="action" value="myplugin_save_settings" />
    <input type="text" name="site_title" />
    <button type="submit">Save</button>
</form>
<?php

// In the handler
add_action( 'admin_post_myplugin_save_settings', function () {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( 'Forbidden', 403 );
    }
    if ( ! isset( $_POST['myplugin_nonce'] )
         || ! wp_verify_nonce(
                sanitize_key( wp_unslash( $_POST['myplugin_nonce'] ) ),
                'myplugin_save_settings'
            )
    ) {
        wp_die( 'Invalid request', 403 );
    }

    $title = isset( $_POST['site_title'] )
        ? sanitize_text_field( wp_unslash( $_POST['site_title'] ) )
        : '';

    update_option( 'myplugin_site_title', $title );

    wp_safe_redirect( admin_url( 'options-general.php?page=myplugin&updated=1' ) );
    exit;
} );
```

Note the order: capability → nonce → unslash → sanitize → write → redirect → exit.

### AJAX

```php
// Localize the nonce to JS
wp_localize_script( 'myplugin', 'MYPLUGIN', [
    'ajaxUrl' => admin_url( 'admin-ajax.php' ),
    'nonce'   => wp_create_nonce( 'myplugin_save' ),
] );

// Handler
add_action( 'wp_ajax_myplugin_save', function () {
    check_ajax_referer( 'myplugin_save', 'nonce' );

    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( [ 'message' => 'Forbidden' ], 403 );
    }

    $value = isset( $_POST['value'] )
        ? sanitize_text_field( wp_unslash( $_POST['value'] ) )
        : '';

    update_user_meta( get_current_user_id(), 'myplugin_value', $value );
    wp_send_json_success( [ 'saved' => true ] );
} );
```

`check_ajax_referer()` calls `wp_die` on failure — you don't need to
short-circuit manually.

## 2. Capability checks: object-level matters

Wrong:
```php
if ( current_user_can( 'edit_post' ) ) { /* always true for editors */ }
```

Right:
```php
if ( current_user_can( 'edit_post', $post_id ) ) { /* checks THIS post */ }
```

Common object-aware capabilities: `edit_post`, `delete_post`, `read_post`,
`edit_user`, `delete_user`, `edit_term`, `manage_term`.

Plugin-defined caps (WooCommerce: `edit_shop_order`, `manage_woocommerce`)
follow the same rule when an ID is meaningful.

## 3. Sanitization map by intent

| Data | Storage | Output |
|---|---|---|
| Plain text (one line) | `sanitize_text_field( wp_unslash( $x ) )` | `esc_html( $x )` |
| Multiline text | `sanitize_textarea_field( wp_unslash( $x ) )` | `nl2br( esc_html( $x ) )` |
| Email | `sanitize_email( wp_unslash( $x ) )` | `esc_html( $x )` |
| URL | `esc_url_raw( wp_unslash( $x ) )` | `esc_url( $x )` |
| Slug / key | `sanitize_key( wp_unslash( $x ) )` | `esc_attr( $x )` |
| Integer | `absint( $x )` or `(int) $x` | `(int) $x` |
| Float | `(float) $x` | `(float) $x` |
| HTML (limited) | `wp_kses_post( wp_unslash( $x ) )` | echo as-is |
| HTML attribute | sanitize per type | `esc_attr( $x )` |
| Hex color | `sanitize_hex_color( $x )` | `esc_attr( $x )` |
| Filename | `sanitize_file_name( $x )` | `esc_html( $x )` |
| JSON for `<script>` | structured array | `wp_json_encode( $x )` |

Do not HTML-escape before storage. Validate and sanitize input into a
canonical value, store that value, then escape once for the exact output
context. Pre-escaping creates corrupted/double-escaped data and still does not
protect a later, different output context.

### Exact-preservation tools

Sanitizers are lossy normalizers, not a universal proof of safety. Migration,
import/export, database repair, code-editor, and opaque meta tools can need to
preserve HTML, percent sequences, quotes, and backslashes exactly.

```php
$value = isset( $_POST['value'] ) && is_string( $_POST['value'] )
    ? wp_check_invalid_utf8( wp_unslash( $_POST['value'] ) )
    : '';

if ( '' === $value || strlen( $value ) > 65536 ) {
    wp_die( 'Invalid value', 400 );
}

// Use only through a prepared statement or an API with a defined slash contract.
// Escape by context if this value is ever rendered.
```

This is acceptable only when the feature defines the exact type/shape,
encoding, byte limit, allowed operation, safe storage sink, and output
escaping. It does not permit raw HTML output, dynamic SQL, arbitrary file paths,
or executable template content. Do not replace an opaque value with
`sanitize_text_field()` solely to satisfy a static-analysis warning.

## 4. Why `wp_unslash` matters

WP runs `add_magic_quotes()` on all superglobals at request init. Without
`wp_unslash`, a quote `'` becomes `\'` BEFORE sanitization, which:
- Breaks comparison logic.
- Stores the backslash literally in the DB.
- Lets an attacker craft input that survives escaping in unexpected ways.

Rule: recover string/array domain values from `$_GET / $_POST / $_COOKIE /
$_REQUEST` with `wp_unslash` before normalization. Do not apply `wp_unslash` to
data that did not cross WordPress's slashed superglobal boundary. Direct numeric
casts can validate a numeric request field without preserving quote characters.

## 5. SQL: prepared statements in detail

### Safe

```php
$wpdb->prepare(
    "SELECT id, name FROM {$wpdb->prefix}myplugin_items
     WHERE user_id = %d AND status = %s LIMIT %d",
    $user_id, $status, $limit
);
```

### Table/column names — `%i` plus a semantic allowlist

```php
$allowed_orderby = [ 'id', 'name', 'created_at' ];
$orderby = in_array( $orderby_input, $allowed_orderby, true )
    ? $orderby_input : 'id';
$order   = strtoupper( $order_input ) === 'DESC' ? 'DESC' : 'ASC';

$sql = $wpdb->prepare(
    "SELECT * FROM %i ORDER BY %i {$order} LIMIT %d",
    $wpdb->prefix . 'items',
    $orderby,
    $limit
);
```

`%i` is available since WordPress 6.2 and safely quotes identifiers. It does
not replace the allowlist: the allowlist is the authorization/business rule
for which identifiers the request may select. SQL keywords such as `ASC` and
`DESC` are not identifiers and must be selected from a fixed allowlist.

### LIKE

```php
$like = '%' . $wpdb->esc_like( $term ) . '%';
$wpdb->prepare( "SELECT * FROM x WHERE name LIKE %s", $like );
```

### IN clauses

```php
$ids          = array_map( 'absint', (array) $ids );
$ids          = array_values( array_filter( $ids ) );
if ( [] === $ids ) {
    return [];
}
$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
$sql          = $wpdb->prepare(
    "SELECT * FROM x WHERE id IN ($placeholders)", $ids
);
```

## 6. REST: the full secure pattern

```php
add_action( 'rest_api_init', function () {
    register_rest_route( 'myplugin/v1', '/items/(?P<id>\d+)', [
        [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'myplugin_rest_get_item',
            'permission_callback' => function ( $request ) {
                return current_user_can( 'read_post', (int) $request['id'] );
            },
            'args' => [
                'id' => [
                    'validate_callback' => static fn( $v ) => is_numeric( $v ) && (int) $v > 0,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ],
        [
            'methods'             => WP_REST_Server::EDITABLE,
            'callback'            => 'myplugin_rest_update_item',
            'permission_callback' => function ( $request ) {
                return current_user_can( 'edit_post', (int) $request['id'] );
            },
            'args' => [
                'id'    => [ 'sanitize_callback' => 'absint' ],
                'title' => [
                    'required'          => true,
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => static fn( $v ) => is_string( $v ) && strlen( $v ) <= 200,
                ],
            ],
        ],
    ] );
} );
```

Findings to flag in REST audits:
- `permission_callback => '__return_true'` on privileged writes, or a public
  write that lacks its required signature, token, or abuse controls.
- Missing `validate_callback` AND missing manual validation in handler.
- Returning `WP_User` objects directly — leaks `user_pass` hash, email,
  capabilities of other users.
- `register_rest_route` before `rest_api_init`. Core emits `_doing_it_wrong()`
  but still registers the route; treat this as lifecycle misuse, not a route
  that silently disappears.

## 7. AJAX nopriv: when is it actually correct?

Legitimate uses:
- Public search / filter endpoints that read public data only.
- Login / registration / password reset forms.
- Public contact forms (nonce for browser intent when useful, plus spam and
  rate-limit controls; a guest nonce is not guest authentication).

Illegitimate ("just in case") uses:
- Saving any user-specific preference.
- Anything that touches another user's data.
- Anything gated by capability — guests have none.

If you flag a `wp_ajax_nopriv_*` registration, ask: "what's the
legitimate guest use case?" If the answer is unclear, that's a HIGH
finding.

## 8. Open redirects

```php
// VULNERABLE
wp_redirect( $_GET['redirect_to'] );

// SAFE
$target = isset( $_GET['redirect_to'] )
    ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) )
    : '';
wp_safe_redirect( $target ); // limits to allowed hosts
exit;
```

`wp_safe_redirect` only allows the site's own host (extendable via
`allowed_redirect_hosts` filter). Always pair with `exit;`.

## 9. Path traversal

```php
$filename = sanitize_file_name( wp_unslash( $_GET['file'] ?? '' ) );

$base      = wp_upload_dir()['basedir'] . '/myplugin';
$base_real = realpath( $base );
if ( $base_real === false ) {
    wp_die( 'Invalid base', 500 );
}
$base_real = rtrim( $base_real, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR;

$path = realpath( $base_real . $filename );

// Trailing separator on BOTH sides is required — otherwise
// /var/.../myplugin would also match /var/.../myplugin-evil/ under
// a plain str_starts_with / strpos prefix check.
if ( $path === false
     || strncmp( $path . DIRECTORY_SEPARATOR, $base_real, strlen( $base_real ) ) !== 0
) {
    wp_die( 'Forbidden', 403 );
}

// safe to read $path
```

`sanitize_file_name` alone is not enough — `..%2f` and Unicode tricks
can survive. The `realpath` containment check is the actual guard,
**but only with a trailing-separator-aware comparison**: the naive
`strpos( $path, realpath( $base ) ) !== 0` is vulnerable to sibling
directories with the same prefix (`/srv/x` vs `/srv/x-evil`).

When possible, prefer an allowlist of file IDs over filename
parameters entirely:

```php
$id      = absint( $_GET['file_id'] ?? 0 );
$row     = $wpdb->get_row( $wpdb->prepare( "SELECT path FROM ... WHERE id = %d", $id ) );
$path    = $row ? realpath( $row->path ) : false; // path is plugin-controlled
```

This eliminates the user-controlled filename from the equation.

## 10. Severity guide

**HIGH** — exploitable by an unauthenticated attacker, or by any
logged-in user against another user / the whole site:
- SQL injection, stored XSS reachable by guests, missing auth on
  state-changing AJAX/REST, arbitrary file read/write/delete, RCE,
  privilege escalation, open redirect on auth flow.

**MEDIUM** — exploitable but conditioned (logged-in attacker with low
role, requires specific config, requires social engineering):
- Reflected XSS in admin, CSRF on settings change, stored XSS only
  visible to admins, info disclosure of non-secret data.

**LOW / Hardening** — best practice violation, no direct exploit
demonstrated:
- Missing `esc_attr` where the value is currently safe but could become
  unsafe, missing `wp_unslash` where input is numeric, debug code left
  in, weak validation that's caught downstream.

## 11. False positives — don't flag these

- `echo (int) $x;` — already escaped by cast.
- `echo $wpdb->prepare(...)` of a constant string — no input.
- `current_user_can` followed by `&&` short-circuit before write.
- `wp_kses_post` output of post content fetched via `get_the_content` —
  WP already filtered.
- Translations: `esc_html_e( 'Hello', 'td' )` — already escaped.
- `__()` used INSIDE `printf( '...%s...', esc_html( __( ... ) ) )`.
- Missing `sanitize_text_field()` on an exact-preservation value whose
  type/size/encoding, safe sink, and output escaping are all explicit.
