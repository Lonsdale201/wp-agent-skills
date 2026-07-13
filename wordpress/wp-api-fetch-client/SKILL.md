---
name: wp-api-fetch-client
description: Implement and audit browser-side WordPress REST clients with the bundled wp-api-fetch script handle, wp.apiFetch, and @wordpress/api-fetch. Covers PHP enqueue dependencies, WordPress-global versus bundled npm initialization, path/url/data/body/parse/signal options, cookie authentication and X-WP-Nonce, parsed REST errors, raw response headers and pagination, cancellation, stale-response protection, middleware side effects, media uploads, and request mocks. Use when plugin or theme JavaScript calls core or custom REST endpoints, replaces fetch or jQuery.ajax, or debugs nonce, 401/403, invalid_json, pagination, duplicate requests, or REST races. Trigger on wp-api-fetch, wp.apiFetch, @wordpress/api-fetch, apiFetch.use, createNonceMiddleware, createRootURLMiddleware, setFetchHandler, or parse:false; do not use for server-side wp_remote_* calls.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-13"
---

# WordPress API Fetch Client

Use this skill for JavaScript that calls inbound WordPress REST routes. Use
`wp-rest-api` for server route registration and authorization. Keep outbound
PHP integrations in `wp-http-api-client`.

Read [reference.md](reference.md) for standalone npm bootstrapping, the full
option/return contract, middleware behavior, media uploads, and test patterns.

## Choose the actual runtime

Determine what reaches the browser; do not infer it from an import alone.

| Runtime | How to recognize it | Required setup |
|---|---|---|
| WordPress global | PHP depends on `wp-api-fetch`; code calls `wp.apiFetch` | Core supplies REST root, nonce, nonce-refresh endpoint, and media middleware |
| Externalized npm import | Source imports `@wordpress/api-fetch`; generated `.asset.php` includes `wp-api-fetch` | Enqueue the asset dependencies; the import resolves to the configured WordPress global |
| Privately bundled npm copy | Bundle contains its own `@wordpress/api-fetch`; no `wp-api-fetch` dependency | Configure root and authentication middleware for that instance |

Prefer the WordPress-provided instance inside a plugin or theme. It avoids a
duplicate client and preserves site-specific REST roots, including subdirectory
and `?rest_route=` installations.

## Enqueue the configured WordPress client

Declare the handle as a dependency. Add `wp-url` when calling its helpers
directly. Prefer a build-generated asset manifest when one exists.

```php
add_action(
    'admin_enqueue_scripts',
    static function ( string $hook_suffix ): void {
        if ( 'tools_page_acme-items' !== $hook_suffix ) {
            return;
        }

        wp_enqueue_script(
            'acme-items',
            plugins_url( 'assets/items.js', ACME_PLUGIN_FILE ),
            array( 'wp-api-fetch', 'wp-url' ),
            ACME_VERSION,
            array( 'in_footer' => true )
        );
    }
);
```

Do not hard-code `/wp-json/` and do not print another nonce when this configured
instance is sufficient. Loading the package file manually is not equivalent to
enqueueing the registered `wp-api-fetch` handle: core attaches its runtime
middleware through inline scripts on that handle.

## Build requests from explicit inputs

Use `path` for a WordPress REST-relative route. Use `url` only when an absolute
or already-resolved REST URL is intentional. Build query strings with
`wp.url.addQueryArgs()` rather than string concatenation.

```js
const path = wp.url.addQueryArgs( '/acme/v1/items', {
    page: 1,
    per_page: 20,
    status: 'active',
} );

const items = await wp.apiFetch( { path } );

const created = await wp.apiFetch( {
    path: '/acme/v1/items',
    method: 'POST',
    data: {
        title: form.elements.title.value,
    },
} );
```

Use `data` for a JSON request. It is serialized and sent with
`Content-Type: application/json`. Use `body` for `FormData`, blobs, or another
pre-encoded body; do not set a multipart `Content-Type` manually because the
browser must add its boundary. Do not supply both `data` and `body`.

Treat client validation as usability only. The route must validate, authorize,
and sanitize independently.

## Understand authentication boundaries

For a logged-in, same-origin browser request, the configured WordPress instance
sends cookies (`credentials: include`) and an `X-WP-Nonce` REST nonce. The nonce
protects cookie authentication against CSRF; it does not grant a capability and
does not replace the route's `permission_callback`.

Apply these rules:

- require the server permission callback to perform capability and object-level
  authorization;
- never ship an Application Password, API secret, or service token to browser
  JavaScript;
- do not treat a missing nonce as a client bug on an intentionally public route;
- diagnose 401/403 from the response code and server permission policy before
  regenerating nonces blindly;
- remember that a cross-origin client needs an explicit authentication and CORS
  design; the same-origin cookie flow is not portable by itself.

## Preserve the response contract

With the default `parse: true`, successful JSON is returned directly, `204`
returns `null`, and a non-2xx REST response rejects with the parsed object,
usually containing `code`, `message`, and `data.status`.

```js
try {
    await wp.apiFetch( {
        path: `/acme/v1/items/${ itemId }`,
        method: 'DELETE',
    } );
} catch ( error ) {
    if ( error?.name === 'AbortError' ) {
        return;
    }

    const message =
        typeof error?.message === 'string'
            ? error.message
            : 'The request could not be completed.';

    showError( message );
}
```

Do not assume every rejection is a parsed REST error. Aborts remain
`AbortError`; transport failures become `fetch_error` or `offline_error`; invalid
JSON becomes `invalid_json`; and `parse: false` rejects with the raw `Response`
for non-2xx status codes.

Never render `error.message` with `innerHTML`. Use a text sink or a WordPress
notice component and keep sensitive diagnostics in restricted server logs.

## Read headers and paginate deliberately

Set `parse: false` when response status or headers are part of the contract, then
parse the body exactly once.

```js
const response = await wp.apiFetch( {
    path: wp.url.addQueryArgs( '/acme/v1/items', {
        page,
        per_page: 50,
        _fields: 'id,title,status',
    } ),
    parse: false,
} );

const items = await response.json();
const total = Number( response.headers.get( 'X-WP-Total' ) ?? 0 );
const totalPages = Number( response.headers.get( 'X-WP-TotalPages' ) ?? 0 );
```

Use a bounded `per_page`, expose stable totals on collection routes, and stop at
the reported final page. Do not use `per_page=-1` as shorthand for convenience:
the package's built-in fetch-all middleware can convert it to pages of 100,
follow every `Link: rel="next"`, and merge the entire collection in memory.

## Cancel stale reads and contain write ambiguity

Pass an `AbortSignal` for replaceable reads such as live search. Aborting the
browser wait does not prove that the server stopped processing the request.

```js
let activeController;

async function searchItems( search ) {
    activeController?.abort();
    activeController = new AbortController();

    try {
        return await wp.apiFetch( {
            path: wp.url.addQueryArgs( '/acme/v1/items', {
                search,
                per_page: 20,
            } ),
            signal: activeController.signal,
        } );
    } catch ( error ) {
        if ( error?.name === 'AbortError' ) {
            return null;
        }
        throw error;
    }
}
```

Debounce noisy reads and abort or sequence-guard old requests so a slower old
response cannot overwrite a newer state. For writes, disable duplicate submit
controls, expose pending state, and design server mutations for replay or an
idempotency key where lost responses matter. Do not automatically retry a write
after an arbitrary timeout or transport error.

## Treat middleware as page-global behavior

`apiFetch.use()` changes the shared instance. Register middleware once during
bootstrap, not during component render. Scope custom behavior to the intended
namespace; an unconditional header, retry, cache, or response transform can
affect WordPress core and every other plugin request on that page.

Account for package behavior before reporting a bug:

- the user locale middleware adds `_locale=user` unless already present;
- `PUT`, `PATCH`, and `DELETE` are transported as `POST` with
  `X-HTTP-Method-Override`;
- the fetch-all middleware special-cases the literal `per_page=-1`;
- the WordPress-configured instance can refresh an invalid REST nonce and retry;
- its media middleware has special recovery behavior for `POST /wp/v2/media`.

Do not rely on internal middleware order. Inspect the effective request when a
proxy, service worker, test mock, or custom middleware changes behavior.

## Audit workflow

1. Inventory usage and enqueue paths:

   ```bash
   rg -n "wp-api-fetch|wp\.apiFetch|@wordpress/api-fetch|apiFetch\.(use|setFetchHandler)|create(Nonce|RootURL)Middleware|parse:\s*false" .
   ```

2. Identify the effective runtime: configured global, externalized import, or
   isolated bundled copy.
3. Trace every caller's `path`/`url`, method, query, JSON/body, and expected
   response into the corresponding server route.
4. Verify cookie/nonce assumptions without confusing nonce presence with
   authorization.
5. Check error shapes, `204`, invalid JSON, raw `Response`, and abort handling.
6. Check pagination bounds, `_fields`, repeated requests, stale-response races,
   unbounded fetch-all, and unnecessary duplicate package bundles.
7. For writes, test double-clicks, lost responses, retry ambiguity, and stable UI
   recovery. For uploads, test `FormData`, size limits, MIME policy, and cleanup.
8. Test anonymous, expired-nonce, low-privilege, authorized, invalid-input,
   not-found, 4xx, 5xx, offline, abort, and slow-response cases as applicable.

Report the browser call site and server route together. Distinguish a confirmed
security or correctness flaw from a build/configuration suspicion.

## False-positive guards

- Do not report a missing manual `X-WP-Nonce` when the registered WordPress
  handle supplies nonce middleware.
- Do not report `path` as an unresolved URL when root middleware is configured.
- Do not claim that a REST nonce authorizes the operation; inspect the server
  permission callback.
- Do not report method override as an accidental POST without checking
  `X-HTTP-Method-Override`.
- Do not call native `fetch()` inherently wrong when streaming, cross-origin, or
  non-REST behavior requires it; verify the omitted WordPress behavior explicitly.
- Do not treat `parse: false` as a security bypass. It changes the client return
  and error shape, not server enforcement.

## Related skills

- `wp-rest-api` — route registration, validation, permissions, and response design.
- `wp-plugin-assets-loading` — screen-scoped enqueueing and build asset manifests.
- `wp-security-audit` — end-to-end authorization, output, and browser trust review.

## References

- [@wordpress/api-fetch](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-api-fetch/)
- [REST API authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)
- [wp_enqueue_script()](https://developer.wordpress.org/reference/functions/wp_enqueue_script/)
- Verified source paths:
  - `wp-includes/script-loader.php`
  - `wp-includes/js/dist/api-fetch.js`
  - `wp-includes/assets/script-loader-packages.php`
