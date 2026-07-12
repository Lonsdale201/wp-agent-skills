---
name: br-cors-public-client
description: Configure better-route 1.0.0 CORS and preflight support for public REST clients. Use when adding CorsMiddleware, CorsPolicy, Router::options(), Authorization or Idempotency-Key cross-origin requests, credentialed browser clients, app clients, OPTIONS routes, or debugging failed REST preflight requests.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.0.0"
php-min: "8.1"
last-updated: "2026-07-12"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: CORS and preflight

Use explicit CORS policy for browser or embedded clients. Do not rely on incidental WordPress defaults when the API needs `Authorization`, `Idempotency-Key`, `If-Match`, `X-Request-ID`, or credentials.

## Global middleware

```php
use BetterRoute\Middleware\Cors\CorsMiddleware;
use BetterRoute\Middleware\Cors\CorsPolicy;

$cors = new CorsMiddleware(new CorsPolicy(
    allowedOrigins: ['https://app.example.com'],
    allowCredentials: true
));

$router->middleware([$cors]);
```

Default allowed headers include:

- `Authorization`
- `Content-Type`
- `Idempotency-Key`
- `If-Match`
- `If-None-Match`
- `X-Request-ID`
- `X-WP-Nonce`

Default exposed headers include `ETag`, `Idempotency-Replayed`, `X-RateLimit-*`, and `X-Request-ID`.

## Explicit preflight route

`CorsMiddleware` can short-circuit `OPTIONS` requests, but the router must register an `OPTIONS` route for that path when WordPress would not otherwise dispatch it.

```php
$router->options('/account/payment-methods', static fn () => null)
    ->middleware([$cors]);
```

`Router::options()` is public by default in 0.5.0. Do not attach business handlers to preflight routes.

## Rules

- Prefer an origin allowlist. Use `*` only for non-credentialed public APIs.
- **Since 1.0.0:** `CorsPolicy` **throws `InvalidArgumentException` at construction** when `allowedOrigins` contains `*` together with `allowCredentials: true`. The wildcard-with-credentials combination is now rejected outright, not merely discouraged — it would otherwise reflect any origin back with `Access-Control-Allow-Credentials: true`. List explicit origins when credentials are enabled; `CorsPolicy` then echoes the matching request origin.
- Put CORS early in the middleware list so errors and short-circuits still get headers where possible.
- Keep allowed headers aligned with actual client needs; add custom headers deliberately.
- Keep CORS separate from authentication. CORS says which browser origins may call; auth says who the caller is.

## Source refs

- `libraries/better-route/src/Middleware/Cors/CorsMiddleware.php`
- `libraries/better-route/src/Middleware/Cors/CorsPolicy.php`
- `libraries/better-route/src/Router/Router.php`
- `libraries/better-route/tests/BuiltInMiddlewareTest.php`
- `libraries/better-route/tests/RouterPipelineTest.php`
