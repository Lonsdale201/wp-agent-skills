# Example: AJAX handler — before / after

A realistic plugin pattern showing six findings in ~20 lines, then the
corrected version.

## Before (vulnerable)

```php
add_action( 'wp_ajax_nopriv_save_pref', 'myplugin_save_pref' );
add_action( 'wp_ajax_save_pref', 'myplugin_save_pref' );

function myplugin_save_pref() {
    $user_id = $_POST['user_id'];
    $color   = $_POST['color'];

    global $wpdb;
    $wpdb->query(
        "UPDATE {$wpdb->prefix}prefs SET color = '$color' WHERE user_id = $user_id"
    );

    echo "<div>Saved color: $color</div>";
    die();
}
```

Findings:

1. **HIGH — broken access control**: `wp_ajax_nopriv_*` exposes a
   user-data write to guests.
2. **HIGH — missing nonce**: no `check_ajax_referer`.
3. **HIGH — missing capability check**: any logged-in user can save for
   any other user (`$_POST['user_id']` is attacker-controlled).
4. **HIGH — SQL injection**: raw interpolation of `$color` and `$user_id`.
5. **HIGH — reflected XSS**: `echo "...$color..."` without escaping.
6. **LOW — wrong response**: `echo` + `die` instead of
   `wp_send_json_success`.

## After (fixed)

```php
add_action( 'wp_ajax_save_pref', 'myplugin_save_pref' );
// no nopriv: this is a per-user preference write

function myplugin_save_pref() {
    check_ajax_referer( 'myplugin_save_pref', 'nonce' );

    if ( ! is_user_logged_in() ) {
        wp_send_json_error( [ 'message' => 'Forbidden' ], 403 );
    }

    $user_id = get_current_user_id(); // never trust $_POST for identity
    $color   = isset( $_POST['color'] )
        ? sanitize_hex_color( wp_unslash( $_POST['color'] ) )
        : '';

    if ( ! $color ) {
        wp_send_json_error( [ 'message' => 'Invalid color' ], 400 );
    }

    global $wpdb;
    $wpdb->update(
        "{$wpdb->prefix}prefs",
        [ 'color' => $color ],
        [ 'user_id' => $user_id ],
        [ '%s' ],
        [ '%d' ]
    );

    wp_send_json_success( [ 'color' => $color ] );
}
```

Notes:

- Identity comes from `get_current_user_id()`, never the request body.
- `$wpdb->update` with format arrays is equivalent to `prepare`.
- `sanitize_hex_color` returns `null` for invalid input, giving a clean
  rejection path.
- `wp_send_json_*` sets `Content-Type: application/json` and exits.
