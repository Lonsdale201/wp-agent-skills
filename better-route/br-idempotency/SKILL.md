---
name: br-idempotency
description: Configure better-route 1.1 replay-cache idempotency with IdempotencyMiddleware and Idempotency-Key. Use for ArrayIdempotencyStore, TransientIdempotencyStore, WpdbIdempotencyStore, installSchema, identity-aware canonical keys, body fingerprints, key conflicts, replay headers, key validation, custom methods/resolvers, or choosing between classic and atomic idempotency. Use AtomicIdempotencyMiddleware instead when concurrent duplicate side effects must be prevented.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Middleware/Write/IdempotencyMiddleware.php
  - src/Middleware/Write/WpdbIdempotencyStore.php
  - src/Middleware/Write/TransientIdempotencyStore.php
  - src/Middleware/Write/StoredResponseCodec.php
---

# better-route: replay-cache idempotency

Use `IdempotencyMiddleware` when replaying a completed response is useful but simultaneous duplicate execution is acceptable or impossible at another layer. It checks the store, invokes the handler, and stores only after completion; it does not reserve first.

For payments, order creation, subscriptions, account provisioning, or any irreversible side effect, use `br-atomic-idempotency` instead.

## Production setup

```php
use BetterRoute\Middleware\Write\IdempotencyMiddleware;
use BetterRoute\Middleware\Write\WpdbIdempotencyStore;

register_activation_hook(__FILE__, static function (): void {
    (new WpdbIdempotencyStore())->installSchema();
});

$idempotency = new IdempotencyMiddleware(
    store: new WpdbIdempotencyStore(),
    ttlSeconds: 600,
    requireKey: true,
);

$router->post('/drafts', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->middleware([$auth, $idempotency]);
```

Store choices:

- Use `WpdbIdempotencyStore` as the durable production default and call `installSchema()`.
- Use `TransientIdempotencyStore` only when transient lifecycle/cache flush semantics are acceptable.
- Use `ArrayIdempotencyStore` only for tests or one-process checks; normal PHP requests do not share its state.

Cross-database wpdb table names containing `.` are rejected.

## 1.1 request contract

The middleware applies to `POST`, `PUT`, `PATCH`, and `DELETE` by default. Override `methods` if the route needs a different set.

`Idempotency-Key` must be printable ASCII and no longer than `maxKeyLength` (default 200). Missing required keys return `400 idempotency_key_required`; malformed keys return `400 idempotency_key_invalid`.

The default storage key deeply canonicalizes route, authenticated/native WordPress identity, and client key. The default fingerprint deeply canonicalizes route, method, identity, JSON/body params, and request params. Reordered associative keys remain equivalent; ordered lists remain order-sensitive.

On retry:

- same storage key + same fingerprint replays the stored response and adds `Idempotency-Replayed: true`;
- same storage key + changed fingerprint returns `409 idempotency_conflict`;
- two concurrent first requests can both execute because classic middleware has no reservation.

## Response behavior

`WP_REST_Response` is normalized to a Better Route response before storage so status, data, and string headers can be replayed safely. Returned `WP_Error` is not stored. Thrown exceptions are not stored because the middleware never reaches its store call.

A returned `Response` with a 4xx/5xx status is still a completed return value and can be cached. Decide whether that is appropriate; throw for transient failures or use a custom policy/store if only selected statuses should persist.

For wpdb replay, return arrays/scalars or `BetterRoute\Http\Response`; arbitrary domain objects are not a supported persisted response contract.

## Custom scope

```php
$idempotency = new IdempotencyMiddleware(
    store: $store,
    requireKey: true,
    keyResolver: static fn ($context, string $clientKey): string =>
        'tenant:' . current_tenant_id() . ':' . $clientKey,
    fingerprintResolver: static fn ($context): string =>
        hash('sha256', canonical_domain_payload($context->request)),
);
```

Custom resolvers own collision resistance and canonicalization. Include every security/business dimension that distinguishes operations; do not concatenate attacker-controlled fields with an ambiguous delimiter.

## Review checklist

- Choose atomic middleware when simultaneous duplicates would be unsafe.
- Run auth before idempotency; native WP identity is a fallback, not a replacement for route auth.
- Install the wpdb schema before traffic.
- Choose a TTL that covers real client retry delays.
- Keep keys bounded and generate one key per logical operation.
- Verify identical replay, changed-payload conflict, malformed key, missing key, and two concurrent first requests.
- Plan expired-row cleanup for high-volume wpdb tables; on-access expiry alone does not purge every unused old key.

## Related skills

- Use `br-atomic-idempotency` for reservation-before-handler semantics.
- Use `br-routes` for access intent and middleware ordering.
- Use `br-error-contract` for idempotency error codes.
