---
name: wp-rest-api
description: Scaffolds and reviews custom WordPress REST API endpoints
  registered via register_rest_route on rest_api_init — namespace and
  version slug, permission_callback authorization (no unconditional public
  access for privileged writes), args schema with validate_callback /
  sanitize_callback / type / enum, object-level capability checks via
  current_user_can with object ID, responses with WP_REST_Response and
  WP_Error carrying an HTTP status, no raw DB rows / sensitive columns
  in responses, cookie auth via X-WP-Nonce, and REST vs admin-ajax decisions.
  Use when scaffolding or reviewing a REST endpoint, or
  migrating from admin-ajax. Triggers on register_rest_route,
  rest_api_init, permission_callback, WP_REST_Request, WP_REST_Response,
  WP_Error, X-WP-Nonce, rest_ensure_response, register_rest_field, or
  any file path containing /rest/ or /api/ in a WP plugin or theme.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/
  - https://developer.wordpress.org/reference/functions/register_rest_route/
  - https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
---

# WordPress REST API: scaffold, review, secure

For WordPress 4.7+ REST endpoints registered via `register_rest_route()`. This skill covers the full lifecycle of a custom endpoint — registration, authorization, input validation, response shaping, error handling — and the patterns that distinguish a clean endpoint from one that ships a vulnerability.

This is the **default** path for new server endpoints in modern WordPress. Use REST instead of `admin-ajax` unless you have a concrete reason (legacy interop, Heartbeat, etc.).

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a new REST endpoint or reviewing one in a PR.
- The diff or file contains: `register_rest_route`, `rest_api_init`, `WP_REST_Request`, `WP_REST_Response`, `WP_Error`, `permission_callback`, `register_rest_field`, `rest_ensure_response`, `X-WP-Nonce`.
- The user is migrating an `admin-ajax` handler to REST, or asking which to use.
- The user is debugging a `401`, `403`, or "Sorry, you are not allowed to do that" response.
- The plugin is going headless / mobile / external-integration heavy and needs a stable API contract.

## Architecture in one paragraph

Every REST endpoint is a `(namespace, route, method)` triple registered on `rest_api_init`. WP routes the request through `WP_REST_Server::dispatch()`, which runs `WP_REST_Request::has_valid_params()` (validate) and `WP_REST_Request::sanitize_params()` (sanitize) FIRST, then calls your `permission_callback` (returning `true` / `false` / `WP_Error`), then your `callback`. The callback returns a `WP_REST_Response` for success or a `WP_Error` for failure. Cookie-authenticated requests must include a `_wpnonce` query param or `X-WP-Nonce` header (the `wp-api` nonce, generated via `wp_create_nonce('wp_rest')`); other auth schemes — application passwords, OAuth, JWT — bypass the nonce.

**Order matters for security.** Because validation and sanitization run BEFORE the permission check, never put expensive lookups, DB writes, or other side effects inside a `validate_callback` / `sanitize_callback`. They run for unauthenticated requests too. Reserve those for the main `callback`, which only runs after permission has been granted.

## Workflow — minimal scaffold

```php
add_action( 'rest_api_init', static function (): void {
    register_rest_route(
        'myplugin/v1',
        '/items/(?P<id>\d+)',
        array(
            'methods'             => WP_REST_Server::READABLE, // 'GET'
            'callback'            => 'myplugin_get_item',
            'permission_callback' => static function ( WP_REST_Request $request ) {
                return current_user_can( 'read_post', (int) $request['id'] );
            },
            'args'                => array(
                'id' => array(
                    'required'          => true,
                    'type'              => 'integer',
                    'validate_callback' => static fn( $v ) => is_numeric( $v ) && (int) $v > 0,
                    'sanitize_callback' => 'absint',
                ),
            ),
        )
    );
} );

/**
 * @return WP_REST_Response|WP_Error
 */
function myplugin_get_item( WP_REST_Request $request ) {
    $id   = (int) $request['id'];
    $post = get_post( $id );

    if ( ! $post ) {
        return new WP_Error(
            'myplugin_not_found',
            __( 'Item not found.', 'myplugin' ),
            array( 'status' => 404 )
        );
    }

    return rest_ensure_response( array(
        'id'    => $post->ID,
        'title' => get_the_title( $post ),
    ) );
}
```

That snippet contains every required moving part — namespace + version, route with named param, method constant, `permission_callback`, `args` schema, response via `rest_ensure_response`, error via `WP_Error` with `status` data.

## Critical rules

### 1. `permission_callback` is REQUIRED, and `__return_true` is rarely correct

The single most common plugin-side vulnerability on wp.org. Rules:

- Do not use `__return_true` for privileged writes. It literally allows every
  caller through. A genuinely public write (contact/intake) still needs an
  explicit abuse policy; a signed webhook should verify its signature/replay
  contract in `permission_callback` rather than return true.
- It is normal for genuinely public read-only routes. Document the choice and
  apply cache/rate/response-size policy appropriate to the data.
- For state-changing routes, check at minimum a capability (`current_user_can('edit_posts')`) and ideally an object-level cap with the target ID:
  ```php
  'permission_callback' => fn( $req ) => current_user_can( 'edit_post', (int) $req['id'] ),
  ```
- When `permission_callback` returns `false` / `null`, WP wraps it in a `rest_forbidden` `WP_Error` whose status comes from `rest_authorization_required_code()` — that returns **401 if the user is logged out, 403 if logged in but unauthorized**. Returning a custom `WP_Error` with explicit `status` lets you control the code and the message; `false` is fine when the default is correct for your route.

### 2. Always declare an `args` schema

Each accepted parameter (URL, query string, body) needs an `args` entry. Otherwise input lands raw in `$request->get_param()` — no validation, no sanitization.

```php
'args' => array(
    'email' => array(
        'required'          => true,
        'type'              => 'string',
        'format'            => 'email',
        'validate_callback' => 'rest_validate_request_arg',
        'sanitize_callback' => 'sanitize_email',
    ),
    'role' => array(
        'required'          => false,
        'type'              => 'string',
        'enum'              => array( 'subscriber', 'contributor', 'author' ),
        'default'           => 'subscriber',
    ),
    'count' => array(
        'type'              => 'integer',
        'minimum'           => 1,
        'maximum'           => 100,
        // No custom sanitize_callback — when 'type' is set and no callback
        // is given, WP defaults to rest_parse_request_arg, which runs both
        // schema validation (minimum/maximum/enum/type) AND sanitization.
        // The moment you set your own sanitize_callback, that default is
        // replaced and the schema constraints become documentation only —
        // unless you also set 'validate_callback' => 'rest_validate_request_arg'.
    ),
),
```

`validate_callback` returns `true` / `false` / `WP_Error`. `sanitize_callback` runs after validation. Use built-ins (`absint`, `sanitize_text_field`, `sanitize_email`, `sanitize_key`, `rest_sanitize_boolean`) where possible — but if you set a custom `sanitize_callback`, ALSO set `'validate_callback' => 'rest_validate_request_arg'` (or your own validator) so schema constraints actually run. Otherwise `'minimum' => 1, 'maximum' => 100` is silently ignored.

### 3. Read input through `$request`, not `$_POST` / `$_GET`

`$request->get_param('foo')` returns the parameter from URL, query, or body, **already unslashed and run through your sanitize_callback**. Don't read superglobals inside REST callbacks — you bypass the schema.

For JSON bodies specifically: `$request->get_json_params()` returns the decoded array. WP also reads multipart and form-encoded automatically.

### 4. Return `WP_REST_Response` or `WP_Error`, never `wp_send_json_*`

`wp_send_json_*` is for `admin-ajax`. In REST, return objects:

```php
return rest_ensure_response( $data );        // 200 OK with $data as JSON
return new WP_REST_Response( $data, 201 );   // explicit status
return new WP_Error( 'code', 'message', array( 'status' => 422 ) ); // error
```

`WP_Error` codes should be namespaced (`myplugin_validation_failed`, not `validation_failed`). Status codes follow HTTP semantics: `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict, `422` semantic validation, `500` server error.

### 5. Don't leak sensitive columns

Never return raw `$wpdb->get_results()` rows — they contain `user_pass`, `user_activation_key`, internal meta. Build response objects explicitly:

```php
// WRONG — leaks user_pass and other private columns
return rest_ensure_response( $wpdb->get_row( ... ) );

// RIGHT — explicit allowlist
return rest_ensure_response( array(
    'id'    => (int) $user->ID,
    'name'  => $user->display_name,
    'email' => $user->user_email,
) );
```

### 6. Meta capabilities need the object ID

```php
// WRONG — meta cap without object: result is unreliable / not what you think
current_user_can( 'edit_post' )

// RIGHT — meta cap mapped to a specific object via map_meta_cap()
current_user_can( 'edit_post', $post_id )
```

`edit_post` / `delete_post` / `read_post` / `edit_user` etc. are **meta capabilities** — WP's `map_meta_cap()` resolves them to primitive caps PLUS object-ownership rules using the ID. Without the ID, the resolution is unreliable (it may pass for users who shouldn't have access to that specific object, or fail for ones who should). For any object-level route — single post, single user, single order, single subscription — always pass the relevant ID as the second argument.

### 7. Cookie-authenticated requests need a nonce

Browser-side requests using cookie auth need `_wpnonce` (query) or `X-WP-Nonce` (header) with the value from `wp_create_nonce('wp_rest')`. The official `@wordpress/api-fetch` package adds this automatically; manual `fetch()` calls must add it themselves.

```js
fetch( '/wp-json/myplugin/v1/items/42', {
    method: 'POST',
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': wpApiSettings.nonce, // localized via wp_localize_script
    },
    body: JSON.stringify( { ... } ),
} );
```

The official `@wordpress/api-fetch` package adds the nonce automatically **only inside the WordPress admin / block editor**, where WP localizes `wpApiSettings.nonce` and api-fetch reads it. In a **decoupled frontend** (headless app, public-site SPA, mobile client), you must set the nonce yourself — or use a different auth scheme entirely (Application Passwords, OAuth, JWT). Application passwords, OAuth, JWT don't need the nonce at all; the `Authorization` header itself carries the proof.

### 8. Treat the version segment as mandatory

`/myplugin/v1/items` — the `v1` is not enforced by WP at runtime, but treat it as a project policy. When you need a breaking change, ship `v2` alongside, deprecate `v1`, and remove it after a long migration window. NEVER change the contract of an existing versioned route — clients in the wild won't know.

## Common mistakes

```php
// WRONG — public write endpoint
register_rest_route( 'myplugin/v1', '/save', array(
    'methods'             => 'POST',
    'callback'            => 'save_thing',
    'permission_callback' => '__return_true', // Anyone can write.
) );

// WRONG — no args schema, raw input
function save_thing( WP_REST_Request $req ) {
    $title = $req['title'];                    // not validated, not sanitized
    $body  = $_POST['body'];                   // bypasses REST entirely
    update_post_meta( $req['id'], 'thing', $req['payload'] ); // mass assignment
}

// WRONG — leaks DB row
return $wpdb->get_row( "SELECT * FROM ..." );

// WRONG — uses admin-ajax response in a REST callback
wp_send_json_success( $data );  // writes JSON and terminates the request
```

Inside REST, `wp_send_json_*()` also triggers a `_doing_it_wrong()` notice. It
bypasses response linking, filters, headers, and the normal REST dispatch
pipeline; return a response/error object instead.

If you see any of these in a PR, block it and point at the correct pattern.

## REST vs admin-ajax — when to use which

| Use REST when | Use admin-ajax when |
|---|---|
| New endpoint, post-WP 4.7 | Maintaining an existing `wp_ajax_*` handler |
| Mobile / external clients call it | Internal admin-only AJAX inside a settings screen the rest of the WP admin already has |
| You need a versioned, documented contract | Heartbeat-style polling tied to the WP admin lifecycle |
| Headless / SPA frontend | Quick prototype that won't outgrow the codebase |

There is **no security argument** for `admin-ajax` over REST — both need their own nonce + capability story. The REST nonce (`wp_rest`) and capability (`permission_callback`) are simply better factored.

## Cross-references

- Run **`wp-security-audit`** on REST callbacks — the basic checklist (sanitize, escape, capability) applies just as much here as elsewhere.
- Run **`wp-security-deep`** when the route accepts URLs (SSRF), serialized payloads (object injection), or compares tokens (timing-safe).
- Run **`wp-security-secrets`** when the route handles auth, password reset, API keys, or any token issuance/verification.

## What this skill does NOT cover

- Deep authentication scheme design (custom JWT, OAuth flows, signing schemes)
  beyond cookie authentication, Application Passwords, and core defaults.
- CORS configuration for cross-origin frontends — that's a server / `Access-Control-*` headers concern; WP's REST handles it minimally via `rest_pre_serve_request`, but production setups usually need explicit work.
- Rate limiting — neither WP core nor this skill provides a complete policy;
  use a maintained application primitive and/or the reverse-proxy layer.
- Internal block-editor REST contracts (`wp/v2/blocks`, etc.) — those are core schemas; don't extend them, register your own namespace.
- OpenAPI / Swagger generation beyond the route/schema metadata core exposes.

## References

- [Adding custom REST endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/)
- [`register_rest_route()`](https://developer.wordpress.org/reference/functions/register_rest_route/)
- [REST API authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)
- [REST schema](https://developer.wordpress.org/rest-api/extending-the-rest-api/schema/)
