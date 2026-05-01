---
name: br-auth-middleware
description: Pick and configure the right authentication middleware for
  a better-route endpoint — JwtAuthMiddleware (Bearer JWT, HS256 via
  Hs256JwtVerifier), BearerTokenAuthMiddleware (custom bearer tokens
  with a verifier callback), ApplicationPasswordAuthMiddleware (WP
  application passwords), CookieNonceAuthMiddleware (browser-based
  cookie + nonce auth). Critical v0.3.0 JWT defaults — exp claim is
  REQUIRED (pass requireExpiration: false to disable),
  WpClaimsUserMapper no longer maps sub by default (re-add it
  explicitly if your tokens use sub as user ID), expectedIssuer /
  expectedAudience enable strict iss/aud checks, maxLifetimeSeconds
  caps token lifetime, maxTokenLength rejects oversized tokens before
  parsing. Use ->protectedByMiddleware() at the route layer to defer
  authorization to the middleware pipeline. Use when adding
  authentication to an endpoint or group. Triggers on JwtAuthMiddleware,
  BearerTokenAuthMiddleware, ApplicationPasswordAuthMiddleware,
  CookieNonceAuthMiddleware, Hs256JwtVerifier, WpClaimsUserMapper.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Jwt/Hs256JwtVerifier.php
  - src/Middleware/Jwt/JwtAuthMiddleware.php
  - src/Middleware/Jwt/JwtVerifierInterface.php
  - src/Middleware/Auth/BearerTokenAuthMiddleware.php
  - src/Middleware/Auth/BearerTokenVerifierInterface.php
  - src/Middleware/Auth/ApplicationPasswordAuthMiddleware.php
  - src/Middleware/Auth/CookieNonceAuthMiddleware.php
  - src/Middleware/Auth/WpClaimsUserMapper.php
  - src/Middleware/Auth/ClaimsUserMapperInterface.php
  - src/Middleware/Auth/JwtBearerTokenVerifierAdapter.php
  - src/Middleware/Auth/AuthContext.php
  - src/Middleware/Auth/AuthIdentity.php
  - src/Router/RouteBuilder.php
---

# better-route: Authentication middleware

For developers protecting endpoints with authentication via better-route's middleware pipeline. Four middlewares cover the common patterns — JWT (server-issued tokens), application passwords (WP-native), custom bearer tokens (your own verifier), and cookie + nonce (browser-side).

## Misconception this skill corrects

> "I'll use `JwtAuthMiddleware` with my existing JWT tokens — they don't have an `exp` claim because they're long-lived."

Post-v0.3.0, `Hs256JwtVerifier` REQUIRES an `exp` claim by default ([src/Middleware/Jwt/Hs256JwtVerifier.php:23](Hs256JwtVerifier.php) — `requireExpiration = true`). Tokens without `exp` are rejected at line 116. The fix:

```php
// EITHER add exp to your tokens (preferred — long-lived no-exp tokens are a security smell):
$verifier = new Hs256JwtVerifier(secret: $secret);  // exp required, default

// OR explicitly disable for migration scenarios:
$verifier = new Hs256JwtVerifier(secret: $secret, requireExpiration: false);
```

The same release also removed `sub` from `WpClaimsUserMapper`'s default `idClaims` ([WpClaimsUserMapper.php:30](WpClaimsUserMapper.php)):

```php
array $idClaims = ['user_id', 'uid', 'wp_user_id'],
```

If your tokens use `sub` as the user identifier, re-add it explicitly:

```php
$mapper = new WpClaimsUserMapper(idClaims: ['sub', 'user_id', 'uid', 'wp_user_id']);
```

Other AI-prone misconceptions:

- "I'll combine `JwtAuthMiddleware` with `->permission(...)` for belt-and-suspenders." Wrong — pick one. Use `->protectedByMiddleware('jwt')` to defer to the middleware OR `->permission(callable)` for WP-cap checks. Combining means BOTH must pass; usually overshoots intent.
- "I'll bind the JWT middleware to a specific route via `->middleware(...)` and forget about route-layer permission." Wrong (post-v0.4.0) — `->middleware(...)` adds the JWT to the pipeline, but the WP permission layer still denies writes by default. You also need `->protectedByMiddleware()` to set WP permission to `__return_true`.
- "`CookieNonceAuthMiddleware` works for AJAX from logged-in browser users automatically." Almost — needs the request to carry an `X-WP-Nonce` header (or a body field) AND the user to be logged in. AJAX from logged-in users naturally carries WP cookies; you need to manually attach the nonce client-side via `wpApiSettings.nonce`.

## When to use this skill

Trigger when ANY of the following is true:

- The diff instantiates `JwtAuthMiddleware`, `BearerTokenAuthMiddleware`, `ApplicationPasswordAuthMiddleware`, or `CookieNonceAuthMiddleware`.
- The diff calls `Hs256JwtVerifier`, `WpClaimsUserMapper`.
- A route uses `->protectedByMiddleware(...)`.
- Tokens that worked pre-v0.3.0 now fail with `invalid_token`.

## Workflow

### 1. Choose the right middleware

| Use case | Middleware |
|---|---|
| Server-issued JWT tokens (HS256, you control the secret) | `JwtAuthMiddleware` + `Hs256JwtVerifier` |
| Custom bearer tokens (opaque tokens you verify against your DB / third-party) | `BearerTokenAuthMiddleware` + your `BearerTokenVerifierInterface` |
| Native WP authentication (admin tools, mobile apps using WP user accounts) | `ApplicationPasswordAuthMiddleware` |
| Browser-side AJAX from logged-in users | `CookieNonceAuthMiddleware` |

### 2. JWT auth (most common for SPA / mobile clients)

```php
use \BetterRoute\Middleware\Jwt\JwtAuthMiddleware;
use \BetterRoute\Middleware\Jwt\Hs256JwtVerifier;
use \BetterRoute\Middleware\Auth\WpClaimsUserMapper;

$verifier = new Hs256JwtVerifier(
    secret: 'your-secret-key',          // shared secret with the issuer
    leewaySeconds: 30,                  // clock-skew tolerance
    expectedIssuer: 'https://issuer.example.com',  // strict iss check (null = no check)
    expectedAudience: 'myapp',          // strict aud check (null = no check)
    requireExpiration: true,            // v0.3.0 default; reject tokens missing exp
    maxLifetimeSeconds: 3600,           // reject tokens with exp - iat > 3600 (1 hour cap)
    maxTokenLength: 8192,               // reject oversized tokens before parsing
);

$mapper = new WpClaimsUserMapper(
    idClaims: ['sub', 'user_id', 'uid', 'wp_user_id'],   // re-add 'sub' explicitly
);

$jwt = new JwtAuthMiddleware(
    verifier: $verifier,
    requiredScopes: ['api:read'],       // optional scope-based authorization
    userMapper: $mapper,
);

// Apply to a route group:
$router->group('/protected', function ($group) use ($jwt) {
    $group->get('/me', fn ($ctx) => Response::ok($ctx->user));
    $group->put('/me', $updateProfile)->protectedByMiddleware('jwt');
})->middleware($jwt);
```

For write routes, ALSO apply `->protectedByMiddleware()` at the route layer so the WP permission layer doesn't deny by default. The middleware does the actual auth; `->protectedByMiddleware()` just opens the WP gate.

### 3. JWT verifier flags (v0.3.0 reference)

| Constructor param | Default | Behavior |
|---|---|---|
| `secret` | required | HS256 secret. Compare against header alg `HS256`. |
| `leewaySeconds` | `0` | Clock skew tolerance for `nbf` / `exp` checks. |
| `expectedIssuer` | `null` | If set, `iss` claim must match exactly. |
| `expectedAudience` | `null` | If set, `aud` claim must match exactly (string or in array). |
| `requireExpiration` | `true` | Reject tokens without `exp`. Set to `false` only for migration. |
| `maxLifetimeSeconds` | `null` | If set, reject tokens with `exp - iat > maxLifetimeSeconds`. |
| `maxTokenLength` | `8192` | Reject oversized tokens before base64 decode (DoS guard). |

Verified at [Hs256JwtVerifier.php:21-25](Hs256JwtVerifier.php), enforcement at lines 42 (length), 116 (exp required), 140-145 (max lifetime), 154-180 (iss / aud).

### 4. Custom bearer tokens (opaque, DB-backed)

```php
use \BetterRoute\Middleware\Auth\BearerTokenAuthMiddleware;
use \BetterRoute\Middleware\Auth\BearerTokenVerifierInterface;

class MyTokenVerifier implements BearerTokenVerifierInterface
{
    public function verify(string $token): array
    {
        // Look up token in DB / third-party / cache
        $row = MyDb::get('SELECT user_id, scopes FROM api_tokens WHERE token = %s', $token);
        if ($row === null) {
            throw new \BetterRoute\Http\ApiException('Invalid token.', 401, 'invalid_token');
        }
        return [
            'sub'    => (string) $row->user_id,
            'scopes' => explode(' ', $row->scopes),
        ];
    }
}

$bearer = new BearerTokenAuthMiddleware(
    verifier: new MyTokenVerifier(),
    requiredScopes: ['orders:read'],
    userMapper: new WpClaimsUserMapper(idClaims: ['sub']),
);

$router->group('/api', function ($group) {
    // ...
})->middleware($bearer);
```

The verifier returns a "claims" array — same shape as JWT claims, even though the token is opaque. The downstream code (scope check, user mapping) is identical.

### 5. WordPress application passwords

```php
use \BetterRoute\Middleware\Auth\ApplicationPasswordAuthMiddleware;

$appPwd = new ApplicationPasswordAuthMiddleware();

$router->group('/api', function ($group) {
    // ...
})->middleware($appPwd);
```

The middleware reads the standard WP `Authorization: Basic <base64(username:password)>` header. Application passwords are WP 5.6+ native — users generate them in their profile, no plugin needed. Best for first-party tools and mobile apps with full WP user accounts.

### 6. Cookie + nonce (browser AJAX)

```php
use \BetterRoute\Middleware\Auth\CookieNonceAuthMiddleware;

$cookieAuth = new CookieNonceAuthMiddleware(
    nonceAction: 'wp_rest',     // default — matches wpApiSettings.nonce
    requireNonce: true,
    requireLoggedIn: true,
);

$router->group('/internal', function ($group) {
    // ...
})->middleware($cookieAuth);
```

Client-side, attach the nonce:

```js
fetch('/wp-json/myapp/v1/internal/widget', {
    headers: {
        'X-WP-Nonce': wpApiSettings.nonce,
    },
    credentials: 'same-origin',
});
```

`wpApiSettings.nonce` is automatically available when `wp_enqueue_script('wp-api')` runs OR when you've enqueued any script that depends on `wp-api-fetch` (which most Gutenberg / block editor pages do).

### 7. Combining middleware

Middleware chains run top-down. For "rate-limit before auth":

```php
$router->group('/api', function ($group) { /* ... */ })
    ->middleware([$rateLimit, $jwt]);   // rate limit first, then auth
```

For "auth before rate limit" (so authenticated users get a higher rate limit):

```php
->middleware([$jwt, $rateLimit])
```

The middleware order matters — `RateLimitMiddleware`'s default key resolver returns the authenticated user's ID when the auth middleware ran first. Without auth-before-rate-limit, the rate limiter falls back to anonymous keys.

## Critical rules

- **JWT `exp` claim REQUIRED by default (v0.3.0+).** Pass `requireExpiration: false` only for migration scenarios.
- **`WpClaimsUserMapper` does NOT include `sub` by default (v0.3.0+).** Re-add it explicitly via `idClaims: ['sub', ...]` if your tokens use `sub` as user ID.
- **Set `expectedIssuer` AND `expectedAudience` for production JWT.** Without them, any JWT signed with your secret is accepted, regardless of issuer / audience — no defense against cross-service token reuse.
- **`maxLifetimeSeconds` caps token age.** A token with `exp - iat = 86400 * 365` (a year-long token) bypasses your security policy if you don't cap.
- **`maxTokenLength: 8192` is the DoS guard** — rejects oversized tokens before parsing. Don't disable.
- **Always `->protectedByMiddleware()` at the route layer** for write routes when auth is via middleware — otherwise WP layer denies first (post-v0.4.0).
- **Middleware order matters.** Auth-before-rate-limit lets the rate limiter key on user ID; reversed order keys on anonymous IP.
- **`CookieNonceAuthMiddleware` requires the client to send `X-WP-Nonce`.** WP cookies alone aren't enough.
- **Custom bearer verifiers must throw `ApiException` (or return claims).** Returning `null` / `false` is undefined behavior.

## Common mistakes

```php
// WRONG — JWT verifier without exp requirement, no iss/aud check
$verifier = new Hs256JwtVerifier(
    secret: 'key',
    requireExpiration: false,
);
// Anyone with the secret can issue eternal tokens for any audience.

// RIGHT — production-grade
$verifier = new Hs256JwtVerifier(
    secret: 'key',
    expectedIssuer: 'https://my-issuer.example.com',
    expectedAudience: 'my-api',
    requireExpiration: true,
    maxLifetimeSeconds: 3600,
);

// WRONG — middleware applied but WP layer still denies
$router->post('/secure', $handler)->middleware($jwt);   // (no protectedByMiddleware)
// → 403 from WP layer; middleware never runs

// RIGHT — declare both
$router->post('/secure', $handler)
    ->protectedByMiddleware('jwt')
    ->middleware($jwt);
// (or apply via group middleware which handles this automatically)

// WRONG — assuming sub maps to user ID by default
$verifier = new Hs256JwtVerifier(secret: $key);
$middleware = new JwtAuthMiddleware($verifier, userMapper: new WpClaimsUserMapper());
// Token has 'sub' = '5' (user ID 5) but mapper looks for 'user_id'. User is anonymous in the request context.

// RIGHT — explicit idClaims with sub
$mapper = new WpClaimsUserMapper(idClaims: ['sub', 'user_id']);

// WRONG — combining permission and protectedByMiddleware
$router->post('/foo', $handler)
    ->permission(static fn () => current_user_can('edit_posts'))
    ->protectedByMiddleware('jwt');
// permission overrides the __return_true that protectedByMiddleware sets — middleware delegation lost.

// RIGHT — pick one
$router->post('/foo', $handler)
    ->protectedByMiddleware('jwt');

// WRONG — middleware order with rate limit before auth (when you want per-user limits)
->middleware([$rateLimit, $jwt])
// → rate limit keys on anonymous IP because auth hasn't run yet.

// RIGHT
->middleware([$jwt, $rateLimit])

// WRONG — application passwords without HTTPS
$middleware = new ApplicationPasswordAuthMiddleware();
// On HTTP, the password is sent base64-encoded in plaintext over the wire.

// RIGHT — only deploy on HTTPS

// WRONG — sharing JWT secret across multiple services
$verifier = new Hs256JwtVerifier(secret: $sharedSecret);   // ← also used by 3 other services
// Any compromise of one service compromises all.

// RIGHT — per-service secret OR upgrade to RS256 / asymmetric (better-route ships only HS256;
// for asymmetric, write a custom verifier implementing JwtVerifierInterface)

// WRONG — long-running tokens without rotation
maxLifetimeSeconds: 86400 * 30,   // 30-day tokens
// Plus no refresh-token flow → users with stolen tokens have a month of access.

// RIGHT — short-lived access tokens + refresh tokens
maxLifetimeSeconds: 3600,   // 1 hour
// (refresh-token implementation is your concern; better-route doesn't ship one)
```

## Cross-references

- Run **`br-routes`** for the route-layer `->protectedByMiddleware()` mechanics — auth middleware needs it for v0.4.0+ writes.
- Run **`br-rate-limiting`** for combining auth with rate limiting — middleware order matters.
- Run **`br-error-contract`** for the standard error envelope — auth failures return `401 invalid_token` shape.
- Run **`br-install-and-migrate`** for the v0.3.0 JWT breaking changes (exp, sub) summary.

## What this skill does NOT cover

- Token issuance / refresh-token flow. Better-route VERIFIES tokens; issuance is your responsibility (use any standard JWT library on your auth server).
- RS256 / ES256 / asymmetric JWT. Library ships HS256 only. For asymmetric, implement `JwtVerifierInterface` yourself.
- OAuth2 flows (authorization code, client credentials). Out of scope; pair better-route with an OAuth2 server.
- WP-side capability mapping. Once authenticated, the user is mapped via `WpClaimsUserMapper`; subsequent permission checks use `current_user_can` against the mapped user.
- Multi-factor auth. WP user accounts handle MFA via plugins; better-route consumes the resolved authenticated user.
- API-key-style auth (single static keys per consumer). Use `BearerTokenAuthMiddleware` with a verifier that matches against your keys table.

## References

- JwtAuthMiddleware: [libraries/better-route/src/Middleware/Jwt/JwtAuthMiddleware.php:24-29](JwtAuthMiddleware.php) — `__construct(verifier, requiredScopes, userMapper)`.
- Hs256JwtVerifier: [libraries/better-route/src/Middleware/Jwt/Hs256JwtVerifier.php:18-26](Hs256JwtVerifier.php) — full constructor with v0.3.0 defaults.
- WpClaimsUserMapper: [libraries/better-route/src/Middleware/Auth/WpClaimsUserMapper.php:29-35](WpClaimsUserMapper.php) — default `idClaims: ['user_id', 'uid', 'wp_user_id']` (post v0.3.0; sub removed).
- BearerTokenAuthMiddleware: [libraries/better-route/src/Middleware/Auth/BearerTokenAuthMiddleware.php:21-25](BearerTokenAuthMiddleware.php).
- BearerTokenVerifierInterface: [libraries/better-route/src/Middleware/Auth/BearerTokenVerifierInterface.php](BearerTokenVerifierInterface.php) — `verify(string): array`.
- ApplicationPasswordAuthMiddleware: [libraries/better-route/src/Middleware/Auth/ApplicationPasswordAuthMiddleware.php:26-](ApplicationPasswordAuthMiddleware.php).
- CookieNonceAuthMiddleware: [libraries/better-route/src/Middleware/Auth/CookieNonceAuthMiddleware.php:27-40](CookieNonceAuthMiddleware.php) — `nonceAction = 'wp_rest'`, `requireNonce = true`, `requireLoggedIn = true`.
