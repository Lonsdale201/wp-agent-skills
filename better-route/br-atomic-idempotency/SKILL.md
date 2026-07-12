---
name: br-atomic-idempotency
description: Use better-route 1.0.0 AtomicIdempotencyMiddleware for high-side-effect write endpoints where concurrent duplicate requests must not execute twice. Triggers on AtomicIdempotencyMiddleware, WpdbAtomicIdempotencyStore, ArrayAtomicIdempotencyStore, AtomicIdempotencyStoreInterface, idempotency_in_progress, Idempotency-Key for payment/order/subscription/account-like writes, or when reviewing retry-safe REST endpoints.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.0.0"
php-min: "8.1"
last-updated: "2026-07-12"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: Atomic idempotency

Use this when a write route must reserve an `Idempotency-Key` before the handler runs. This is stronger than `IdempotencyMiddleware`, which is still useful as a replay cache but stores only after handler completion.

## Pick the middleware

```php
use BetterRoute\Middleware\Write\AtomicIdempotencyMiddleware;
use BetterRoute\Middleware\Write\WpdbAtomicIdempotencyStore;

register_activation_hook(__FILE__, function (): void {
    (new WpdbAtomicIdempotencyStore())->installSchema();
});

$atomic = new AtomicIdempotencyMiddleware(
    store: new WpdbAtomicIdempotencyStore(),
    ttlSeconds: 900,
    requireKey: true
);
```

Use `WpdbAtomicIdempotencyStore` in production. `ArrayAtomicIdempotencyStore` is for tests and local single-process checks only.

**Since 1.0.0:** `WpdbAtomicIdempotencyStore` restricts `unserialize()` of the cached response to the library's `Response` class (`allowed_classes`), removing an object-injection sink; store plain arrays/scalars or `Response` objects.

## Route pattern

```php
$router->post('/actions/confirm', $handler)
    ->middleware([$jwt, $atomic])
    ->protectedByMiddleware('bearerAuth');
```

Order matters: auth first, atomic idempotency after auth. The default storage key includes route path, authenticated identity, and the client key.

## Behavior

- First matching request reserves the key, then runs the handler.
- Same key and same fingerprint while the first request is running returns `409 idempotency_in_progress`.
- Same key and same fingerprint after completion replays the stored response.
- Same key with a different fingerprint returns `409 idempotency_conflict`.
- Missing key returns `400 idempotency_key_required` when `requireKey: true`.
- Thrown exceptions release the reservation by default so a client can retry.

## Rules

- Use this for side-effectful writes. Keep `IdempotencyMiddleware` for low-risk replay caching or backwards-compatible adoption.
- Install the DB schema on activation before the route is used.
- Keep TTL long enough for realistic client retries.
- Return `BetterRoute\Http\Response` when clients need replay headers such as `Idempotency-Replayed: true`.
- Use a custom `keyResolver` for tenant-scoped APIs where user ID alone is not enough.
- Use a custom `fingerprintResolver` if query/body defaults include unstable values.

## Source refs

- `libraries/better-route/src/Middleware/Write/AtomicIdempotencyMiddleware.php`
- `libraries/better-route/src/Middleware/Write/WpdbAtomicIdempotencyStore.php`
- `libraries/better-route/src/Middleware/Write/AtomicIdempotencyStoreInterface.php`
- `libraries/better-route/src/Middleware/Write/AtomicIdempotencyRecord.php`
- `libraries/better-route/tests/WriteSafetyMiddlewareTest.php`
