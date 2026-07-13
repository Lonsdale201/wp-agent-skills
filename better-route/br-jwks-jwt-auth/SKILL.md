---
name: br-jwks-jwt-auth
description: Configure Better Route 1.1 RS256 or ES256 JWT verification from a local or HTTPS JWKS. Use when integrating OIDC/OAuth bearer tokens, selecting keys by kid, validating issuer/audience/lifetime, or operating JWKS caching and refresh behavior safely.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route JWKS JWT authentication

Use `Rs256JwksJwtVerifier` for asymmetric bearer JWTs and adapt it to the generic bearer middleware.

```php
use BetterRoute\Middleware\Auth\BearerTokenAuthMiddleware;
use BetterRoute\Middleware\Auth\JwtBearerTokenVerifierAdapter;
use BetterRoute\Middleware\Jwt\HttpJwksProvider;
use BetterRoute\Middleware\Jwt\Rs256JwksJwtVerifier;

$jwks = new HttpJwksProvider(
    jwksUri: 'https://issuer.example/.well-known/jwks.json',
    ttlSeconds: 3600,
    issuer: 'https://issuer.example',
    minimumRefreshIntervalSeconds: 30
);

$verifier = new Rs256JwksJwtVerifier(
    jwks: $jwks,
    leewaySeconds: 60,
    expectedIssuer: 'https://issuer.example',
    expectedAudience: 'my-api',
    requireExpiration: true,
    maxLifetimeSeconds: 3600,
    allowedAlgorithms: ['RS256'],
    kidMissRefreshCooldownSeconds: 30
);

$auth = new BearerTokenAuthMiddleware(
    verifier: new JwtBearerTokenVerifierAdapter($verifier),
    requiredScopes: ['orders:read']
);

$router->get('/orders', $handler)
    ->middleware([$auth])
    ->protectedByMiddleware('bearerAuth');
```

## Verification contract

- Require a non-empty JOSE `alg` and `kid`.
- Allow only explicitly configured `RS256` and/or `ES256`; `none`, `HS*`, and other algorithms are rejected.
- Match `kid` to exactly one usable signing key. Ambiguous, incompatible, or absent matches fail closed.
- Require `exp` by default. Setting `maxLifetimeSeconds` also requires `iat` and bounds `exp - iat`.
- Pin both `expectedIssuer` and `expectedAudience` for production integrations.
- Keep token size, clock leeway, and key-refresh cooldown bounded.

## Remote JWKS behavior

`HttpJwksProvider` accepts HTTPS URLs only and rejects URL credentials. Its WordPress transport uses `wp_safe_remote_get()`, TLS verification, a ten-second timeout, at most one redirect, and a 256 KiB response limit.

It caches sanitized public keys in memory and a transient. Refreshes use a persistent cooldown and, when `$wpdb` is available, a bounded MySQL named lock. A failed refresh preserves the last known-good cached key set. A `kid` miss can trigger a refresh, but the verifier has its own cooldown to prevent attacker-driven fetch storms.

The `better_route/jwks_refresh` action clears matching caches. Supply the provider `issuer` so a targeted action does not flush unrelated providers. `StaticJwksProvider` is appropriate for pinned or test keys.

## Operational checks

- Confirm WordPress HTTP SSRF protection is not bypassed with a custom `httpGet` callback.
- Exercise signing-key rotation: cached old key, new `kid`, refresh, then successful verification.
- Exercise refresh failure and verify the last known-good set remains usable.
- Test duplicate `kid`, wrong `kty`/`crv`, mismatched key `alg`/`use`, invalid signature, and stale token.
- Never fetch a JWKS URL selected by an untrusted request.

Source references: `src/Middleware/Jwt/HttpJwksProvider.php`, `src/Middleware/Jwt/Rs256JwksJwtVerifier.php`, `src/Middleware/Jwt/JwksKeySanitizer.php`, `src/Middleware/Auth/JwtBearerTokenVerifierAdapter.php`.
