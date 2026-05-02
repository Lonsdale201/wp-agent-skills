---
name: br-single-use-token
description: Use better-route 0.6.0 SingleUseTokenMiddleware and stores for auth codes, reset links, magic links, email confirmation tokens, or any token that must be consumed exactly once. Triggers on SingleUseTokenMiddleware, SingleUseTokenStoreInterface, WpdbSingleUseTokenStore, WpCacheSingleUseTokenStore, ArraySingleUseTokenStore, token replay, single-use code, one-time token, or auth-code TOCTOU fixes. Updated 2026-05-02.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Write/SingleUseTokenMiddleware.php
  - src/Middleware/Write/SingleUseTokenStoreInterface.php
  - src/Middleware/Write/WpdbSingleUseTokenStore.php
  - src/Middleware/Write/WpCacheSingleUseTokenStore.php
  - src/Middleware/Write/ArraySingleUseTokenStore.php
  - tests/SecurityPrimitivesTest.php
---

# better-route: Single-use tokens

Use this when a token must be atomically consumed before a handler continues. Common examples: OAuth authorization codes, password reset tokens, magic links, invite tokens, and email confirmation tokens.

## Pattern

```php
use BetterRoute\Middleware\Write\SingleUseTokenMiddleware;
use BetterRoute\Middleware\Write\WpdbSingleUseTokenStore;

register_activation_hook(__FILE__, static function (): void {
    (new WpdbSingleUseTokenStore())->installSchema();
});

$singleUse = new SingleUseTokenMiddleware(
    store: new WpdbSingleUseTokenStore(),
    tokenSource: static fn ($request): ?string => $request->get_param('code'),
    hashSalt: MYAPP_SINGLE_USE_TOKEN_SALT,
    ttlSeconds: 300
);

$router->post('/oauth/token', $handler)
    ->middleware([$singleUse])
    ->publicRoute();
```

Store a token before it is used:

```php
$singleUse->storeToken($rawCode, [
    'client_id' => $clientId,
    'redirect_uri' => $redirectUri,
    'subject' => $userId,
], ttlSeconds: 120);
```

## Store choices

- `WpdbSingleUseTokenStore`: production default when DB writes are acceptable; call `installSchema()` on activation.
- `WpCacheSingleUseTokenStore`: object-cache lock plus transient-backed record; useful when DB table migration is not desired.
- `ArraySingleUseTokenStore`: tests only.

## Critical rules

- Never store raw token values. Use `storeToken()` or `hashToken()` with a dedicated salt.
- Use a salt dedicated to the token class or application; do not reuse OAuth client secrets as storage salts.
- Consume before issuing side effects. If consume returns null, fail closed.
- A reused token returns conflict semantics (`single_use_token_reused`).
- Unknown or expired tokens fail as invalid.
- Keep TTL short for auth codes; use longer TTL only for flows such as password reset where product requirements demand it.

## Cross-references

- Use `br-atomic-idempotency` for retry-safe side-effectful writes; that is different from one-time token consumption.
- Use `br-crypto` for generating the raw one-time token.
- Use `br-error-contract` for `401 invalid_single_use_token` and `409 single_use_token_reused`.
