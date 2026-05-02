---
name: br-jwks-jwt-auth
description: Configure better-route 0.6.0 RS256/ES256 JWT verification from JWKS. Use when adding Rs256JwksJwtVerifier, JwksProviderInterface, HttpJwksProvider, StaticJwksProvider, JwtBearerTokenVerifierAdapter, strict JOSE kid matching, issuer/audience checks, JWKS transient cache, better_route/jwks_refresh, or OIDC/OAuth bearer token verification. Rejects none and HS* algorithms. Updated 2026-05-02.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Jwt/Rs256JwksJwtVerifier.php
  - src/Middleware/Jwt/JwksProviderInterface.php
  - src/Middleware/Jwt/HttpJwksProvider.php
  - src/Middleware/Jwt/StaticJwksProvider.php
  - src/Middleware/Jwt/JwksKeySanitizer.php
  - src/Middleware/Jwt/JwtVerifierInterface.php
  - src/Middleware/Auth/JwtBearerTokenVerifierAdapter.php
  - src/Middleware/Auth/BearerTokenAuthMiddleware.php
  - tests/SecurityPrimitivesTest.php
---

# better-route: JWKS JWT auth

Use this for OIDC/OAuth-style bearer JWTs signed with asymmetric keys. In better-route 0.6.0 the library ships `Rs256JwksJwtVerifier`, so do not write a custom verifier for normal `RS256` or `ES256` JWKS use cases.

## Pattern

```php
use BetterRoute\Middleware\Auth\BearerTokenAuthMiddleware;
use BetterRoute\Middleware\Auth\JwtBearerTokenVerifierAdapter;
use BetterRoute\Middleware\Jwt\HttpJwksProvider;
use BetterRoute\Middleware\Jwt\Rs256JwksJwtVerifier;

$jwks = new HttpJwksProvider(
    jwksUri: 'https://issuer.example.com/.well-known/jwks.json',
    ttlSeconds: 3600,
    issuer: 'https://issuer.example.com'
);

$verifier = new Rs256JwksJwtVerifier(
    jwks: $jwks,
    leewaySeconds: 60,
    expectedIssuer: 'https://issuer.example.com',
    expectedAudience: 'my-api',
    requireExpiration: true,
    maxLifetimeSeconds: 3600,
    allowedAlgorithms: ['RS256']
);

$auth = new BearerTokenAuthMiddleware(
    verifier: new JwtBearerTokenVerifierAdapter($verifier),
    requiredScopes: ['orders:read']
);
```

For write routes, still call `->protectedByMiddleware('bearerAuth')` so WordPress dispatches to the middleware pipeline.

## Critical rules

- `kid` in the JOSE header is required and must match exactly one usable JWKS key.
- On `kid` miss, the verifier calls `JwksProviderInterface::refresh()` once, then fails closed.
- Never fall back to "try every public key"; that accepts stale or unrelated keys.
- `allowedAlgorithms` supports `RS256` and `ES256`; `none` and `HS*` are rejected even if accidentally configured.
- `HttpJwksProvider` requires an `https` URI and uses `sslverify => true`.
- Private JWK fields are stripped by `JwksKeySanitizer`; JWKS should contain public keys only.
- Set `expectedIssuer` and `expectedAudience` in production.
- Keep `requireExpiration: true`; disabling it is a migration-only decision.

## JWKS cache invalidation

`HttpJwksProvider` listens for:

```php
do_action('better_route/jwks_refresh', 'https://issuer.example.com');
```

Use this from admin tooling after key rotation or when forcing a cache clear.

## Tests

Use `StaticJwksProvider` for unit tests:

```php
$verifier = new Rs256JwksJwtVerifier(
    new StaticJwksProvider([$publicJwk]),
    now: static fn (): int => 1700000000
);
```

## Cross-references

- Use `br-auth-middleware` for generic auth middleware choice and `protectedByMiddleware()` route intent.
- Use `br-error-contract` for the `401 invalid_token` response shape.
- Use `br-crypto` when generating nonces, state, PKCE values, or doing token-bound string compares.
