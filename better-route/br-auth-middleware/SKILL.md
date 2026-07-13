---
name: br-auth-middleware
description: Configure Better Route 1.1 authentication with JWT, custom bearer tokens, WordPress Application Passwords, or cookie nonces. Use when protecting routes, mapping verified claims to WordPress users, enforcing scopes, or consuming the shared AuthContext identity.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route authentication middleware

Select authentication by client type, attach it as middleware, and mark every raw route as middleware-protected. Better Route 1.1 denies every raw route by default, including `GET` and `OPTIONS`.

```php
use BetterRoute\Middleware\Jwt\Hs256JwtVerifier;
use BetterRoute\Middleware\Jwt\JwtAuthMiddleware;

$auth = new JwtAuthMiddleware(
    verifier: new Hs256JwtVerifier(
        secret: MY_PLUGIN_JWT_SECRET,
        expectedIssuer: 'https://issuer.example',
        expectedAudience: 'my-api',
        maxLifetimeSeconds: 3600
    ),
    requiredScopes: ['orders:read']
);

$router->get('/orders/(?P<id>\d+)', $handler)
    ->middleware([$auth])
    ->protectedByMiddleware('bearerAuth');
```

## Choose the middleware

- Use `JwtAuthMiddleware` with `Hs256JwtVerifier` for first-party HS256 tokens.
- Use `BearerTokenAuthMiddleware` with `JwtBearerTokenVerifierAdapter` and `Rs256JwksJwtVerifier` for RS256/ES256 JWKS tokens. Follow `br-jwks-jwt-auth`.
- Use `BearerTokenAuthMiddleware` with a custom `BearerTokenVerifierInterface` for opaque or externally verified bearer tokens.
- Use `ApplicationPasswordAuthMiddleware` for server-to-server WordPress Application Password Basic authentication.
- Use `CookieNonceAuthMiddleware` for same-site browser requests with a logged-in WordPress cookie and `X-WP-Nonce`. Keep both `requireNonce` and `requireLoggedIn` enabled unless a separately reviewed design requires otherwise.

`protectedByMiddleware()` tells the WordPress permission callback to let the request reach the middleware pipeline. It does not add authentication by itself: the authentication middleware must also be attached. The optional name describes the OpenAPI security scheme.

## JWT verification rules

- `exp` is required by default. Do not disable `requireExpiration` for normal production tokens.
- When `maxLifetimeSeconds` is set, both `iat` and `exp` are required and `exp - iat` must not exceed the limit.
- Set `expectedIssuer` and `expectedAudience` in production.
- Keep `maxTokenLength` bounded; the default is 8192 bytes.
- Required-scope wildcards are server-controlled. A token-supplied granted scope ending in `*` expands authority only when `allowGrantedScopeWildcards: true`; keep that opt-in off unless the issuer contract requires it.

## WordPress user mapping

`WpClaimsUserMapper` defaults to numeric `user_id`, `uid`, and `wp_user_id` claims. It deliberately does not interpret `sub` as a WordPress user ID and leaves email/login lookup disabled.

Prefer an issuer-scoped custom `sub` resolver. If email mapping is unavoidable, explicitly pass `emailClaims` and retain `requireEmailVerified: true`. Enable login-name mapping only for a fully controlled issuer. A mapped positive user ID also becomes the native WordPress current user.

## Shared identity

Successful built-in authentication writes a normalized identity into `RequestContext::$attributes['auth']` with `provider`, `userId`, `subject`, and `scopes`. JWT/bearer claims and useful user fields are exposed through other context attributes. Ownership guards, rate-limit identity selection, and audit enrichment consume this shared contract; do not invent a parallel identity attribute.

## Checks

- Test missing, malformed, expired, future, wrong-issuer, wrong-audience, and over-lifetime tokens.
- Test every missing required scope and ensure a token-provided wildcard cannot widen authority unexpectedly.
- Test routes without `protectedByMiddleware()` fail closed.
- Never log bearer tokens, Basic credentials, cookies, nonces, or complete claims payloads.

Source references: `src/Middleware/Jwt/*`, `src/Middleware/Auth/*`, `src/Router/RouteBuilder.php`.
