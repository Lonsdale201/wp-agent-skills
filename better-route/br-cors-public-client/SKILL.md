---
name: br-cors-public-client
description: Configure better-route 1.1 CORS for browser, mobile, and embedded WordPress REST clients. Use for CorsPolicy, CorsMiddleware, WordPressCorsBridge, allowed origins/methods/headers, credentials, OPTIONS preflight, Authorization, X-WP-Nonce, Idempotency-Key, If-Match, If-None-Match, X-Request-ID, core WordPress CORS conflicts, or cors_origin_denied errors. In 1.1 matched routes get authoritative bridge headers and every explicit OPTIONS route needs publicRoute or another permission intent.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Middleware/Cors/CorsMiddleware.php
  - src/Middleware/Cors/CorsPolicy.php
  - src/Middleware/Cors/WordPressCorsBridge.php
  - src/Middleware/WordPressRouteMiddlewareInterface.php
---

# better-route: CORS and preflight

Define an explicit origin policy and attach it before declaring the routes that should inherit it.

```php
use BetterRoute\Middleware\Cors\CorsMiddleware;
use BetterRoute\Middleware\Cors\CorsPolicy;

$cors = new CorsMiddleware(new CorsPolicy(
    allowedOrigins: ['https://app.example.com'],
    allowedMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowCredentials: true,
    maxAgeSeconds: 600,
));

$router->middleware([$cors]);

$router->get('/catalog', $catalog)->publicRoute();
$router->patch('/account', $update)
    ->protectedByMiddleware('cookieNonce')
    ->middleware([$cookieNonce]);

$router->options('/account', static fn () => null)
    ->publicRoute();
```

Router middleware is captured when each route is declared. Add global/group CORS before declaring those routes, or attach it per route.

## 1.1 WordPress bridge

`CorsMiddleware` implements `WordPressRouteMiddlewareInterface`. During `Router::register()`, every matched route is registered with `WordPressCorsBridge`.

The bridge:

- answers a matched preflight on `rest_pre_dispatch` before the normal route callback/middleware auth flow;
- returns `204` for allowed preflight;
- returns `403 cors_origin_denied` for a disallowed origin when rejection is enabled;
- removes WordPress core CORS headers for matched routes and emits the configured policy on `rest_pre_serve_request`;
- preserves unrelated `Vary` tokens while managing `Vary: Origin`.

This prevents WordPress core from broadening or contradicting the application allowlist. It affects only registered Better Route paths carrying this middleware.

Every raw route denies by default in 1.1. If an explicit `Router::options()` route is needed, call `publicRoute()` or another deliberate permission method. Keep business logic out of preflight handlers.

## Defaults

Default allowed request headers include:

- `Authorization`
- `Content-Type`
- `Idempotency-Key`
- `If-Match`
- `If-None-Match`
- `X-Request-ID`
- `X-WP-Nonce`

Default exposed response headers include `ETag`, `Idempotency-Replayed`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `X-Request-ID`.

Add `Retry-After` to `exposedHeaders` if browser JavaScript must read it from a `429` response.

## Validation and security

`CorsPolicy` validates configured origins, methods, request header names, response header names, and non-negative max age. Invalid tokens or header-injection characters throw during construction.

Never combine wildcard origin with credentials:

```php
// Throws InvalidArgumentException.
new CorsPolicy(['*'], allowCredentials: true);
```

Use `*` only for a non-credentialed public API. With credentials, list exact `http`/`https` origins. CORS is a browser policy, not authentication or CSRF protection; keep auth/nonce/signature middleware in place.

`rejectDisallowedOrigins: false` omits CORS headers for a disallowed origin instead of returning 403. Use that only when non-browser callers should continue and browsers should enforce the denial by absence of headers.

## Smoke checks

```bash
curl -i -X OPTIONS 'https://example.com/wp-json/myapp/v1/account' \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: PATCH' \
  -H 'Access-Control-Request-Headers: Authorization, Content-Type, If-Match'
```

Verify:

- allowed origin gets `204` and only configured CORS headers;
- denied origin gets 403 or no CORS headers according to policy;
- credentials never appear with `Access-Control-Allow-Origin: *`;
- normal success and error responses get the same authoritative allow-origin policy;
- WordPress core does not leave a second/conflicting allow-origin header.

## Related skills

- Use `br-routes` for raw OPTIONS access intent.
- Use `br-auth-middleware` for identity; CORS does not authenticate.
- Use `br-etag-cache` and `br-rate-limiting` when exposing their headers to browser code.
