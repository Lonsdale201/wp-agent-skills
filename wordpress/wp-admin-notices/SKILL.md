---
name: wp-admin-notices
description: Render WordPress admin notices via the four core hooks
  (`admin_notices`, `network_admin_notices`, `user_admin_notices`,
  `all_admin_notices`) and the 6.4+ `wp_admin_notice()` /
  `wp_get_admin_notice()` helpers. Covers the four severity classes
  (`notice-error/-warning/-info/-success`), `is-dismissible`,
  per-user persisted dismissal via `user_meta` + REST endpoint, screen
  targeting via `get_current_screen()`, transient-backed flash notices
  after redirects, and the `wp_admin_notice_args` /
  `wp_admin_notice_markup` filters. Use for onboarding banners, post-save
  flashes, integration warnings, version-bump tours, or config nags.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.4 - 7.0"
php-min: "7.4"
last-updated: "2026-05-24"
docs:
  - https://developer.wordpress.org/reference/functions/wp_admin_notice/
  - https://developer.wordpress.org/reference/functions/wp_get_admin_notice/
  - https://developer.wordpress.org/reference/hooks/admin_notices/
---

# WordPress Admin Notices

The colored banner panels that appear above plugin admin pages. WP 6.4 added a proper helper (`wp_admin_notice()` / `wp_get_admin_notice()`) so you don't have to hand-write the `<div class="notice notice-X is-dismissible">` markup anymore. Most plugins still do. This skill is the modern recipe + the dismissal-persistence pattern that's the hard part.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin needs an admin banner: post-save success flash, integration warning, missing-config nag, version-bump tour, or first-run instructions.
- Code references `admin_notices`, `network_admin_notices`, `user_admin_notices`, `all_admin_notices`, `wp_admin_notice`, `wp_get_admin_notice`, `notice-error`, `notice-warning`, `notice-info`, `notice-success`, `is-dismissible`, `wp_admin_notice_args`.
- The user wants a "dismiss forever" button on a notice and is reaching for cookies / localStorage when user-meta is the right place.
- The user complains: "my notice shows on every admin page" / "I dismissed it but it came back".

## The four hooks — pick by audience

`wp-admin/admin-header.php:290-321` uses `if (is_network_admin()) / elseif (is_user_admin()) / else` to fire **exactly one** of the three context-specific hooks (at lines 299, 306, 313), then ALWAYS fires `all_admin_notices` at line 321 in addition. So on any given admin page render you get **two** hook fires: one context-specific + `all_admin_notices`.

| Hook | Fires when | Use when |
|---|---|---|
| `network_admin_notices` | `is_network_admin()` is true | Multisite Network Admin screens |
| `user_admin_notices` | `is_user_admin()` is true | "My Sites" / user-admin screens |
| `admin_notices` | Standard admin (neither of the above) | Almost every plugin notice |
| `all_admin_notices` | Always, in ADDITION to whichever of the three above ran | Cross-context notices (security warnings, license expired) |

Most plugins want **`admin_notices`** unless they have a clear reason for one of the others.

## Render markup the WP 6.4+ way

`wp_admin_notice( $message, $args )` (defined at `wp-includes/functions.php:9189`) emits the full `<div>` wrapper with the right classes and runs `wp_kses_post()` on the markup. Args (verified at `:9078`):

| Key | Type | Notes |
|---|---|---|
| `type` | string | `'error'`, `'warning'`, `'info'`, `'success'` — adds `notice-<type>` class. No spaces (WP throws `_doing_it_wrong`) |
| `dismissible` | bool | Adds `is-dismissible` (core JS handles the close button) |
| `id` | string | Sets `id="..."` for targeting from JS |
| `additional_classes` | string[] | Extra classes joined into the wrapper |
| `attributes` | array | Extra attrs on the wrapper |
| `paragraph_wrap` | bool | Default `true` — wraps message in `<p>` |

```php
add_action( 'admin_notices', static function (): void {
    if ( empty( get_option( 'myplugin_api_key' ) ) ) {
        wp_admin_notice(
            sprintf(
                /* translators: %s: settings page URL */
                __( 'My Plugin needs an API key. <a href="%s">Configure now</a>.', 'myplugin' ),
                esc_url( admin_url( 'admin.php?page=myplugin' ) )
            ),
            array(
                'type'        => 'warning',
                'dismissible' => false,
                'id'          => 'myplugin-api-key-missing',
            )
        );
    }
} );
```

If you specifically need just the markup string (e.g. to inject from a custom render path), use `wp_get_admin_notice()` with the same args — it returns the HTML without echoing. When you echo that string yourself, pass it through `wp_kses_post()` and keep dynamic `id` / attribute values sanitized.

## Targeting the right screen

`admin_notices` runs on every admin page. Without filtering you spam the user across the whole admin. Use `get_current_screen()` to narrow:

```php
add_action( 'admin_notices', static function (): void {
    $screen = get_current_screen();
    if ( ! $screen || 'toplevel_page_myplugin' !== $screen->id ) {
        return;
    }
    wp_admin_notice( __( 'Settings imported.', 'myplugin' ), array( 'type' => 'success' ) );
} );
```

Common screen IDs: `dashboard`, `plugins`, `edit-post`, `edit-{cpt}`, `post`, `post-new`, `toplevel_page_{slug}`, `settings_page_{slug}`, `{parent}_page_{slug}`.

## Persisted dismissal (per-user)

`is-dismissible` adds an X button but core ONLY hides the notice in the DOM — next page load shows it again. For "dismiss forever" persistence, store a flag in user meta and bail before rendering.

```php
// 1. Don't render if the user dismissed.
add_action( 'admin_notices', static function (): void {
    $user_id = get_current_user_id();
    if ( ! $user_id || get_user_meta( $user_id, 'myplugin_dismissed_v2_intro', true ) ) {
        return;
    }
    wp_admin_notice(
        __( 'My Plugin v2 is here. <a href="#" class="myplugin-dismiss-intro">Got it</a>', 'myplugin' ),
        array( 'type' => 'info', 'dismissible' => true, 'id' => 'myplugin-v2-intro' )
    );
} );

// 2. REST endpoint to record dismissal.
add_action( 'rest_api_init', static function (): void {
    register_rest_route( 'myplugin/v1', '/dismiss-notice/(?P<slug>[a-z0-9_-]+)', array(
        'methods'             => WP_REST_Server::EDITABLE,
        'permission_callback' => static fn () => is_user_logged_in(),
        'callback'            => static function ( WP_REST_Request $req ) {
            $slug = sanitize_key( $req['slug'] );
            update_user_meta( get_current_user_id(), 'myplugin_dismissed_' . $slug, 1 );
            return rest_ensure_response( array( 'ok' => true ) );
        },
    ) );
} );
```

```js
// 3. Client-side: capture either the built-in close button OR your "Got it" link.
// Enqueue this script with deps: array( 'wp-api-fetch' ).
jQuery( function ( $ ) {
    $( document ).on( 'click', '#myplugin-v2-intro .notice-dismiss, .myplugin-dismiss-intro', function ( event ) {
        event.preventDefault();
        wp.apiFetch( {
            path:   '/myplugin/v1/dismiss-notice/v2_intro',
            method: 'POST',
        } );
        $( '#myplugin-v2-intro' ).fadeOut( 100 );
    } );
} );
```

The `.notice-dismiss` button is generated by core JS when `is-dismissible` is set; bind to that AND any custom dismiss link inside the message.

## Flash notices after a redirect — use a transient

The Settings API handles its own "Settings saved" flash via `settings_errors()` — see **`wp-admin-settings-api`**. For non-Settings-API flows (custom admin form, after a bulk action redirect), use a per-user transient:

```php
// At the end of a successful POST handler:
set_transient( 'myplugin_flash_' . get_current_user_id(), array(
    'message' => __( 'Records imported.', 'myplugin' ),
    'type'    => 'success',
), 60 );
wp_safe_redirect( $back_url );
exit;

// On the next admin page render:
add_action( 'admin_notices', static function (): void {
    $key   = 'myplugin_flash_' . get_current_user_id();
    $flash = get_transient( $key );
    if ( ! is_array( $flash ) || empty( $flash['message'] ) ) {
        return;
    }
    delete_transient( $key );
    $type = sanitize_key( $flash['type'] ?? 'info' );
    if ( ! in_array( $type, array( 'error', 'warning', 'info', 'success' ), true ) ) {
        $type = 'info';
    }

    wp_admin_notice( esc_html( $flash['message'] ), array(
        'type'        => $type,
        'dismissible' => true,
    ) );
} );
```

Per-user keys avoid one user's flash leaking onto another's session.

## Customizing markup — `wp_admin_notice_args` / `wp_admin_notice_markup`

Both filter at `wp-includes/functions.php:9098` and `:9167`. Use the args filter to inject a default class on every notice your plugin emits; use the markup filter to wrap output (e.g. add an icon span).

```php
add_filter( 'wp_admin_notice_args', static function ( array $args, string $message ): array {
    if ( ! empty( $args['id'] ) && str_starts_with( $args['id'], 'myplugin-' ) ) {
        $args['additional_classes'] = array_merge(
            $args['additional_classes'] ?? array(),
            array( 'myplugin-notice' )
        );
    }
    return $args;
}, 10, 2 );
```

## Critical rules

- **Exactly one of the context-specific three fires per page render, plus `all_admin_notices` ALWAYS fires in addition**. Hooking BOTH `admin_notices` and `all_admin_notices` for the same notice produces duplicate output on standard admin pages. Pick one.
- **Always check `get_current_screen()` for plugin-scoped notices**. A bare `add_action( 'admin_notices', ... )` runs on every admin page including unrelated screens.
- **`is-dismissible` only hides client-side — it does NOT persist**. The dismiss button doesn't write anywhere. If you want "dismiss forever", you write the user meta yourself via a REST/AJAX endpoint.
- **Declare `wp-api-fetch` when dismissing through REST**. The admin nonce middleware is attached by that script; otherwise your dismiss call can fail or `wp.apiFetch` can be undefined.
- **The `type` arg must NOT contain spaces**. WP triggers `_doing_it_wrong` and the value still goes directly into `notice-<type>`, producing broken / extra classes.
- **Escape the message yourself**. `wp_admin_notice()` runs `wp_kses_post()` on the final markup — which allows `<a>` / `<strong>` / common HTML but strips dangerous tags. Inline user-controlled data with `esc_html()` / `esc_attr()` / `esc_url()` BEFORE passing to the function. The wrapper is not a sanitizer.
- **`wp_get_admin_notice()` returns raw markup**. It does not run `wp_kses_post()`; only `wp_admin_notice()` does that before echoing.
- **Flash transients must be per-user**. A global `myplugin_flash` key shows User B's "Imported!" notice to every admin on the next page load.
- **Don't render notices in cron / REST contexts**. Hooks like `admin_notices` only fire on admin page renders. A successful background job should write to a transient and let the next admin pageview surface it.

## Common AI mistakes

```php
// WRONG — hand-rolled markup, missing translator-safe wrapper, easy to drift from core CSS
echo '<div class="notice notice-success is-dismissible"><p>Saved!</p></div>';

// RIGHT — let core build the markup
wp_admin_notice( esc_html__( 'Saved!', 'myplugin' ), array( 'type' => 'success', 'dismissible' => true ) );
```

```php
// WRONG — runs on every admin page including unrelated screens
add_action( 'admin_notices', static fn () => wp_admin_notice( '…', array( 'type' => 'warning' ) ) );

// RIGHT — gate on the current screen
add_action( 'admin_notices', static function (): void {
    $s = get_current_screen();
    if ( $s && 'toplevel_page_myplugin' === $s->id ) {
        wp_admin_notice( '…', array( 'type' => 'warning' ) );
    }
} );
```

```php
// WRONG — "is-dismissible" with no persistence; reappears on every reload
wp_admin_notice( '…', array( 'type' => 'info', 'dismissible' => true ) );

// RIGHT — also gate on user meta + REST endpoint to record dismissal (see Persisted dismissal section)
```

```php
// WRONG — global flash key; one user's success leaks to all admins on next load
set_transient( 'myplugin_flash', $msg, 60 );

// RIGHT — scope per user
set_transient( 'myplugin_flash_' . get_current_user_id(), $msg, 60 );
```

## Cross-references

- See **`wp-admin-settings-api`** for `add_settings_error` / `settings_errors` — the Settings-API-native flash mechanism, which is the right tool when the notice belongs to an options page save.
- See **`wp-rest-api`** for the dismiss-notice endpoint shape — permission_callback + capability check.
- See **`wp-admin-list-table`** for `set_transient` flash usage after a bulk action redirect.

## What this skill does NOT cover

- Block editor notices (`wp.data.dispatch( 'core/notices' ).createSuccessNotice`). Different stack — React/Redux state, not the classic PHP banners.
- Network-admin notices via update-core / plugin-install routes. Those have their own machinery (`update-nag`, `core-major-auto-updates-notice`).

## References

- `wp-includes/functions.php:9078` — `wp_get_admin_notice()` definition with full `$args` shape.
- `wp-includes/functions.php:9189` — `wp_admin_notice()` echo helper (runs `wp_kses_post`, fires `wp_admin_notice` action before output).
- `wp-admin/admin-header.php:290-321` — the `if/elseif/else` that picks ONE of `network_admin_notices` (line 299) / `user_admin_notices` (306) / `admin_notices` (313), then unconditional `all_admin_notices` at line 321.
