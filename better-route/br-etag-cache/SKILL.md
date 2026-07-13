---
name: br-etag-cache
description: Add better-route 1.1 ETag and If-None-Match handling to GET or HEAD routes. Use for ETagMiddleware, strong or weak validators, custom etagResolver, WP_REST_Response preservation, comma-separated validators, wildcard matching, 304 responses, Cache-Control, proxy-stripped ETag troubleshooting, or reviewing conditional HTTP caching. The middleware skips WP_Error, 204, redirects, and non-2xx responses.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Middleware/Cache/ETagMiddleware.php
  - src/Http/Response.php
---

# better-route: ETag conditional reads

Use ETags on read routes to let clients revalidate a representation. They do not prevent duplicate writes; use idempotency for that.

```php
use BetterRoute\Middleware\Cache\ETagMiddleware;

$router->get('/catalog', $handler)
    ->publicRoute()
    ->middleware([new ETagMiddleware()]);
```

The default validator is a quoted SHA-1 of the JSON-encoded response body. It applies only to `GET`/`HEAD` results with status 200–299 except 204.

## 1.1 behavior

The middleware preserves Better Route `Response` and `WP_REST_Response` status/data. It adds the ETag through the appropriate response API instead of flattening the WordPress response.

It skips:

- returned `WP_Error`;
- non-2xx responses;
- `204 No Content`;
- non-GET/HEAD methods.

`If-None-Match` accepts:

- a single validator;
- a comma-separated validator list;
- weak or strong forms of the same opaque tag;
- `*`.

On a match, 1.1 returns `304` with no body and preserves cache-relevant source headers: `Cache-Control`, `Content-Location`, `Expires`, and `Vary`, plus the ETag.

The middleware computes and controls the final `ETag` header; do not rely on an existing handler ETag remaining unchanged.

## Cheap custom validators

For large responses, derive a validator from a stable version instead of hashing the full body:

```php
use BetterRoute\Http\RequestContext;

$etag = new ETagMiddleware(
    weak: false,
    etagResolver: static function (mixed $response, RequestContext $context): string {
        return (string) get_option('myapp_catalog_version', 0);
    },
);
```

Return the opaque value; the middleware quotes it. A returned already-quoted or `W/` value is normalized. Invalid quote/control bytes are replaced with a safe hash rather than reaching an HTTP header.

Use `weak: true` when byte differences may represent the same semantic representation:

```php
new ETagMiddleware(weak: true); // W/"..."
```

The default JSON hash follows array order. Deeply sort associative data before returning it, or use a stable version resolver, when construction order is nondeterministic.

## Cache-Control and privacy

ETag enables revalidation; it does not define freshness or sharing. Set Cache-Control separately:

```php
return new Response($data, 200, [
    'Cache-Control' => 'public, max-age=300',
]);
```

Use `private`/`no-store` as appropriate for user-specific data. Never let a shared CDN cache `/me` or another personalized URL merely because it has an ETag.

## Troubleshooting

Test both the public endpoint and the PHP/upstream origin. A reverse proxy, nginx/RunCloud rule, CDN, compression layer, or caching plugin may remove or rewrite an outbound ETag even when application-level matching still produces a correct 304.

Verify:

```bash
curl -i 'https://example.com/wp-json/myapp/v1/catalog'
curl -i 'https://example.com/wp-json/myapp/v1/catalog' \
  -H 'If-None-Match: "copied-tag"'
```

Also test `If-None-Match: W/"copied-tag"`, a comma-separated list, and `*`.

## Review checklist

- Attach only to GET/HEAD routes.
- Use a cheap stable resolver for large bodies.
- Set explicit Cache-Control and correct privacy semantics.
- Confirm WP REST response status/data/headers survive.
- Confirm 4xx/5xx and WP_Error do not gain an ETag.
- Confirm matched 304 has no body and retains cache headers.
- Inspect intermediary header behavior if ETag disappears externally.

## Related skills

- Use `br-idempotency` or `br-atomic-idempotency` for write retries.
- Use `br-cors-public-client` to expose `ETag` to browser JavaScript.
