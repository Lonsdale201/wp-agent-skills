# WordPress API Fetch Client deep reference

Read this file when the main workflow is insufficient: bundled-runtime
diagnosis, low-level return contracts, middleware interactions, media uploads,
or isolated request tests.

## Contents

- [Runtime bootstrap](#runtime-bootstrap)
- [Option and return contract](#option-and-return-contract)
- [Authentication and nonce refresh](#authentication-and-nonce-refresh)
- [Built-in middleware behavior](#built-in-middleware-behavior)
- [Pagination and response headers](#pagination-and-response-headers)
- [Error taxonomy](#error-taxonomy)
- [Cancellation, races, and retries](#cancellation-races-and-retries)
- [Media uploads](#media-uploads)
- [Testing and mocking](#testing-and-mocking)
- [Core source map](#core-source-map)

## Runtime bootstrap

### WordPress global

Enqueue `wp-api-fetch` through WordPress. In WordPress 7.0.1,
`wp_default_packages_inline_scripts()` attaches configuration to that registered
handle after the package loads. It registers:

- `createRootURLMiddleware( get_rest_url() )`;
- `createNonceMiddleware( wp_create_nonce( 'wp_rest' ) )`;
- `mediaUploadMiddleware`; and
- an `admin-ajax.php?action=rest-nonce` refresh endpoint.

Therefore, a script which declares `wp-api-fetch` as a dependency should use
`wp.apiFetch( { path: ... } )` directly. Do not duplicate this initialization.

The configuration is attached to the handle, not to every file named
`api-fetch.js`. Copying, concatenating, deregistering, or directly printing the
package can omit the inline setup.

### Externalized npm import

A source import does not prove that a private copy is shipped:

```js
import apiFetch from '@wordpress/api-fetch';
```

WordPress build tooling commonly externalizes `@wordpress/*` packages. Inspect
the generated asset manifest and bundle. If `.asset.php` declares
`wp-api-fetch`, enqueue its dependency list; the import resolves to the same
configured global instance.

```php
$asset = require ACME_PATH . 'build/index.asset.php';

wp_enqueue_script(
    'acme-app',
    plugins_url( 'build/index.js', ACME_PLUGIN_FILE ),
    $asset['dependencies'],
    $asset['version'],
    array( 'in_footer' => true )
);
```

Do not manually remove `wp-api-fetch` from generated dependencies merely because
the JavaScript syntax uses an import.

### Privately bundled npm copy

If the package is truly inside the plugin bundle, its instance does not receive
WordPress's handle-bound inline setup. Configure the REST root and the chosen
authentication model explicitly.

```js
import apiFetch from '@wordpress/api-fetch';

apiFetch.use( apiFetch.createRootURLMiddleware( window.acmeApi.root ) );
apiFetch.use( apiFetch.createNonceMiddleware( window.acmeApi.nonce ) );
```

Generate `root` with `rest_url()` and the same-origin cookie nonce with
`wp_create_nonce( 'wp_rest' )`. Serialize configuration with `wp_json_encode()`
into an inline script attached before the application handle; escape the inline
script context correctly. Do not invent `/wp-json/`, derive the root from
`site_url()`, or expose long-lived credentials.

This private instance also lacks core's handle-installed nonce refresh endpoint
and media middleware unless the application configures equivalent behavior.
Prefer externalization unless isolation is deliberate and tested.

## Option and return contract

Use the following matrix for WordPress 7.0.1's bundled package:

| Option | Meaning | Review concern |
|---|---|---|
| `path` | REST-relative path resolved by root middleware | Requires configured root; prefer a leading `/` for readability |
| `url` | Resolved or absolute URL | Confirm origin and intended authentication scope |
| `method` | Logical HTTP method, default `GET` | `PUT`/`PATCH`/`DELETE` may be method-overridden in transport |
| `data` | JSON-serialized request value | Do not combine with `body`; server still validates all fields |
| `body` | Fetch-compatible encoded body | Use for `FormData`, blob, stream, or pre-encoded content |
| `headers` | Additional request headers | Header names are case-insensitive; avoid secrets and global leakage |
| `parse` | Parse JSON when omitted/true; return raw response when false | Changes both success and non-2xx rejection shape |
| `signal` | `AbortSignal` forwarded to fetch | Abort is not server-side transaction cancellation |
| other fetch options | Forwarded to `fetch()` | Defaults include `credentials: include` and an REST-oriented `Accept` header |

The handler selects `url`, then `path`, then `window.location.href`. Never allow
both route fields to become accidentally undefined; that can request the current
page and produce a misleading `invalid_json` error.

With `parse` omitted or true:

- 2xx JSON resolves to the parsed value;
- `204` resolves to `null`;
- non-2xx JSON rejects with the parsed value;
- malformed or non-JSON content rejects with `invalid_json`.

With `parse: false`:

- 2xx resolves to a `Response`;
- non-2xx rejects with a `Response`;
- the caller owns body parsing and can consume it only once;
- package-level invalid-JSON normalization does not run.

Check `response.ok` only for a native/custom handler that resolves non-2xx
responses. The default api-fetch handler has already rejected them.

## Authentication and nonce refresh

Cookie authentication has two parts: the browser's WordPress login cookie and a
valid REST nonce in `X-WP-Nonce` (or `_wpnonce`). With no valid nonce, WordPress
sets the current user to anonymous even if the cookie exists. A nonce is not an
authorization decision; the route still checks capabilities and object access.

The configured WordPress instance reacts to a parsed
`rest_cookie_invalid_nonce` error by fetching its nonce endpoint, updating the
registered nonce middleware, and rerunning the original api-fetch request.
Account for these limits:

- `parse: false` rejects a raw response, so this error-code-based refresh path
  cannot recognize the nonce error;
- an isolated bundle needs its own refresh design;
- custom middleware or mocks that replace the error shape can disable refresh;
- a refresh failure returns the original nonce error;
- only use this flow for same-origin WordPress cookie authentication.

Do not retry arbitrary 401/403 responses as nonce failures. They can represent a
logged-out user, missing capability, object-level denial, or another auth scheme.

## Built-in middleware behavior

The package includes default middleware and WordPress attaches more to its
registered instance. Treat these behaviors as implementation details to verify
against the supported WordPress version:

### User locale

If neither `path` nor `url` already contains `_locale`, the package adds
`_locale=user`. Do not compare complete URLs without allowing for it. Specify an
intentional locale when the endpoint supports and requires one.

### Namespace and endpoint

Legacy `namespace` plus `endpoint` options are converted to `path`. Prefer an
explicit `path` in new code because it is easier to trace and test.

### HTTP method override

Logical `PATCH`, `PUT`, and `DELETE` requests are sent as `POST` with
`X-HTTP-Method-Override` containing the original method. A network trace showing
POST is not enough to report a method bug. Verify the header and server routing.

### Fetch all

When `path` or `url` contains the literal text `per_page=-1` and parsing remains
enabled, middleware:

1. changes the first request to `per_page=100`;
2. requests it with `parse: false` to read headers;
3. follows `Link` headers whose next relation matches `rel="next"`;
4. parses every page; and
5. concatenates all array results in memory.

This is client-side convenience, not a server guarantee. It can create a long,
serial request chain, large memory use, stale results, and partial-failure UX.
Use explicit bounded pagination in production UI and background processing.

When `parse: false`, fetch-all is bypassed and the original `per_page=-1` reaches
the endpoint. Do not use that combination to evade paging limits.

### Registration scope and ordering

`apiFetch.use()` prepends middleware to a module-level list. A later registration
currently executes before earlier registrations. Do not build correctness around
that internal ordering; compose dependent plugin behavior into one scoped
middleware or one request wrapper.

```js
wp.apiFetch.use( ( options, next ) => {
    const isAcmeRoute =
        typeof options.path === 'string' &&
        options.path.startsWith( '/acme/v1/' );

    if ( ! isAcmeRoute ) {
        return next( options );
    }

    return next( {
        ...options,
        headers: {
            ...options.headers,
            'X-Acme-Client': 'admin-ui',
        },
    } );
} );
```

Register once. Preserve existing headers and options. Never mutate caller-owned
objects in place, and never add authentication data to unrelated routes.

## Pagination and response headers

A conventional collection response exposes `X-WP-Total` and
`X-WP-TotalPages`. Use `parse: false` when the client needs them. Also consider
`Link` only when the route documents it; avoid duplicating fetch-all implicitly.

Validate numeric headers before using them. Missing or malformed headers should
not create `NaN` loops. Stop when the current page reaches a validated positive
total-page count or when a short page is the documented termination rule.

Keep the query stable across pages. A changing data set can duplicate or skip
items under offset pagination. For batch mutation or large scans, use the
server's stable keyset cursor or durable operation API instead of a browser loop.

Use `_fields` to reduce standard REST response payloads, but include every field
needed by rendering and state updates. `_embed` can trigger larger responses and
additional work; request it only when the UI consumes embedded resources.

## Error taxonomy

Handle at least these categories:

| Rejection | Shape | Client action |
|---|---|---|
| REST application/permission error | Parsed object, commonly `code`, `message`, `data.status` | Show a safe message; branch on stable `code`, not translated text |
| Invalid/non-JSON response | `{ code: 'invalid_json', message }` | Inspect proxy, PHP fatal, login HTML, cache, or wrong route |
| Offline | `{ code: 'offline_error', message }` | Preserve user state and offer an intentional retry |
| Other fetch failure | `{ code: 'fetch_error', message }` | Treat outcome as unknown; do not assume a write failed |
| Abort | `DOMException`/error with `name: 'AbortError'` | Suppress expected stale-read noise |
| `parse: false` non-2xx | `Response` | Read status/body once and normalize locally |
| Media post-processing failure | `{ code: 'post_process', message }` by default | Explain recovery without exposing internals |

Do not branch on `message`; it is user-facing and translatable. Treat unknown
objects defensively, and do not put raw HTML responses into the DOM.

## Cancellation, races, and retries

Use one of these strategies for replaceable reads:

- abort the preceding request with `AbortController`;
- increment a sequence number and apply only the latest response; or
- use a data layer that deduplicates and invalidates requests deliberately.

Abort plus a sequence guard is appropriate when a custom fetch handler or older
environment might not stop work promptly. Clear loading state only if the
settling request is still the active request.

For writes, distinguish three results:

1. a confirmed REST error means the server returned a known failure;
2. a confirmed success contains the route's stable response contract;
3. timeout, abort, offline, or transport failure leaves the mutation outcome
   unknown unless the operation can be queried by a stable key.

Only retry safe reads automatically. Retry a write only when the route supports
an idempotency key or the operation itself is provably idempotent. Back off and
bound retries; respect explicit server guidance when available.

## Media uploads

Send files with `FormData` and `body`, not `data`:

```js
const body = new FormData();
body.append( 'file', file, file.name );
body.append( 'title', title );

const attachment = await wp.apiFetch( {
    path: '/wp/v2/media',
    method: 'POST',
    body,
} );
```

Do not set `Content-Type`; the browser supplies the multipart boundary. Enforce
capability, size, extension/MIME, and content policy on the server. Client
`accept` attributes and MIME strings are not trust boundaries.

The WordPress-configured media middleware recognizes `POST` requests containing
`/wp/v2/media`. On certain 5xx responses with an
`X-WP-Upload-Attachment-ID`, it attempts the attachment post-processing route up
to five times and requests forced deletion after repeated failure. This recovery
does not replace plugin-owned cleanup for separate files or records.

Test large images, unsupported types, interrupted upload, post-processing
failure, and permission denial. Use `wp-file-upload-security` for the server-side
boundary.

## Testing and mocking

Prefer dependency injection at the application boundary:

```js
export async function loadItems( request = wp.apiFetch ) {
    return request( {
        path: '/acme/v1/items?per_page=20',
    } );
}
```

Unit tests can pass a focused fake and assert the logical api-fetch options. Add
an integration test against the configured WordPress instance to cover root URL,
nonce, permissions, middleware, and response headers.

`apiFetch.setFetchHandler()` replaces the singleton's bottom-level handler. Use
it only in an isolated test module/environment because there is no public reset
method. A handler sees options after middleware and must reproduce the resolved
or rejected contract expected by the caller.

Test a matrix appropriate to the feature:

- correct route, query encoding, method, JSON or multipart body;
- anonymous, authenticated-low-privilege, and authorized users;
- expired nonce and real permission denial;
- success JSON, `204`, REST 4xx, 5xx, invalid JSON, offline, and abort;
- raw header parsing and the final collection page;
- slow older response arriving after a newer one;
- double-submit and unknown write outcome;
- custom middleware leaving unrelated routes unchanged.

Do not make a unit mock always resolve ideal JSON. That hides the client bugs
api-fetch is expected to normalize.

## Core source map

Verify version-sensitive claims in these WordPress 7.0.1 files:

| Concern | Core source |
|---|---|
| Registered-handle root, nonce, refresh endpoint, media setup | `wp-includes/script-loader.php` (`wp_default_packages_inline_scripts`) |
| Default options, parsing, error normalization, middleware list | `wp-includes/js/dist/api-fetch.js` |
| Root and nonce middleware implementation | `wp-includes/js/dist/api-fetch.js` |
| Fetch-all, method override, locale, and media behavior | `wp-includes/js/dist/api-fetch.js` |
| Generated core package dependencies | `wp-includes/assets/script-loader-packages.php` |

Re-check source when the supported WordPress range changes. Package middleware
is client implementation, while REST permissions and validation remain server
contracts.

