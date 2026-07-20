---
name: br-atomic-idempotency
description: Configure better-route 1.1 AtomicIdempotencyMiddleware for side-effectful POST, PUT, PATCH, or DELETE routes where concurrent duplicate execution must be prevented. Use for WpdbAtomicIdempotencyStore, lease-aware reservations, reservation_token schema migration, Idempotency-Key validation, idempotency_in_progress/conflict/replay behavior, safe stored responses, releaseOnThrowable, Woo write idempotency, or retry-safe payment/order/subscription/account operations.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# better-route: atomic idempotency

Use atomic idempotency for writes whose side effect must not execute twice under concurrent retries. It reserves before invoking the handler; classic `IdempotencyMiddleware` only stores after completion.

## Production setup

```php
use BetterRoute\Middleware\Write\AtomicIdempotencyMiddleware;
use BetterRoute\Middleware\Write\WpdbAtomicIdempotencyStore;

register_activation_hook(__FILE__, static function (): void {
    (new WpdbAtomicIdempotencyStore())->installSchema();
});

$atomic = new AtomicIdempotencyMiddleware(
    store: new WpdbAtomicIdempotencyStore(),
    ttlSeconds: 86400,
    requireKey: true,
);

$router->post('/payments', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->middleware([$auth, $atomic]);
```

Run `installSchema()` for both new installs and 1.0 upgrades. The 1.1 table has a per-reservation `reservation_token`; the installer creates or migrates that column.

Use `ArrayAtomicIdempotencyStore` only in tests or non-WordPress single-process checks.

## Behavior

- First request reserves the canonical route + identity + client key and runs the handler.
- Same key and fingerprint while reserved returns `409 idempotency_in_progress`.
- Same key with a different fingerprint returns `409 idempotency_conflict`.
- Completed identical retry replays status/body/headers and adds `Idempotency-Replayed: true`.
- Missing key returns `400 idempotency_key_required` when required.
- Invalid, non-printable, or overlong keys return `400 idempotency_key_invalid`; default maximum length is 200.

The default fingerprint deeply canonicalizes route, method, identity, and request params. Associative key order does not change it; list order remains meaningful. Native logged-in WordPress users, auth middleware identities, and HMAC key identities scope defaults safely.

## Failure semantics

In 1.1 `releaseOnThrowable` defaults to `false`. A thrown exception can occur after an irreversible external side effect but before the response is recorded, so the reservation remains `in_progress` until TTL rather than allowing a dangerous automatic retry.

Set `releaseOnThrowable: true` only if the complete operation is transactional/rollback-safe or the handler is known to fail before any side effect:

```php
new AtomicIdempotencyMiddleware(
    store: $store,
    releaseOnThrowable: true,
);
```

Returned `WP_Error` values are not serialized and leave the reservation uncertain. They are normalized after the middleware pipeline.

## Stored response contract

The wpdb store serializes a data-only envelope with `allowed_classes => false`:

- arrays, scalars, and null are supported;
- `BetterRoute\Http\Response` is decomposed into body/status/string headers;
- `WP_REST_Response` is normalized into the same safe Response form;
- arbitrary objects/resources inside the body are rejected.

Do not return domain objects from idempotent handlers; map them to data first.

Lease-aware completion and release include the unpredictable reservation token. A stale request therefore cannot complete or delete a newer reservation that reused the same key after expiry.

## WooCommerce registrar

When Woo idempotency is enabled in WordPress, `WooRouteRegistrar` uses atomic idempotency across orders, products, customers, and coupons. Without a custom store it installs/migrates the wpdb store once per schema version. Installation failure is surfaced; it does not silently degrade to an array store.

```php
'idempotency' => [
    'enabled' => true,
    'requireKey' => true,
    'ttlSeconds' => 86400,
    // 'store' => $customAtomicStore,
],
```

Any custom Woo store must implement `AtomicIdempotencyStoreInterface`.

## Review checklist

- Put authentication before atomic idempotency.
- Install/migrate the wpdb schema before serving traffic.
- Choose TTL for the longest realistic uncertain/retry window.
- Keep the default fail-closed `releaseOnThrowable: false` unless retry safety is proven.
- Return data-only responses.
- Load-test two simultaneous identical requests; exactly one handler may run.
- Test same key with a changed body and verify `idempotency_conflict`.
- Use a custom key/fingerprint resolver only when tenant/domain scope cannot be expressed by the default identity-aware canonical form.

## Related skills

- Use `br-idempotency` for lower-risk replay-cache semantics.
- Use `br-woo-routes` for registrar integration.
- Use `br-error-contract` for 400/409 response shapes.

## References

- Verified source paths:
  - `src/Middleware/Write/AtomicIdempotencyMiddleware.php`
  - `src/Middleware/Write/WpdbAtomicIdempotencyStore.php`
  - `src/Middleware/Write/LeaseAwareAtomicIdempotencyStoreInterface.php`
  - `src/Middleware/Write/StoredResponseCodec.php`
