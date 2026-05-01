---
name: br-idempotency
description: Configure better-route idempotent write behavior. Use
  IdempotencyMiddleware for replay-cache semantics and use the separate
  br-atomic-idempotency skill / AtomicIdempotencyMiddleware for
  side-effectful writes where concurrent duplicate execution must be
  prevented. Client sends an Idempotency-Key header; the classic
  middleware caches the first completed response and returns it on
  retries within the TTL. Store options — ArrayIdempotencyStore
  (in-memory, tests), TransientIdempotencyStore (WP transients), and
  WpdbIdempotencyStore (custom DB table, recommended for production).
  Critical
  requirement — call WpdbIdempotencyStore::installSchema() once on
  plugin activation. Cross-database table names (containing .) are
  rejected by the table-name guard at WpdbIdempotencyStore.php:107.
  v0.3.0 default key is identity-aware — pass an explicit keyResolver
  to preserve pre-v0.3 keys. requireKey: true rejects requests without
  an Idempotency-Key header (400 idempotency_key_required). Use when
  duplicate-write protection is needed. Triggers on
  IdempotencyMiddleware, WpdbIdempotencyStore, Idempotency-Key.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.5.0"
php-min: "8.1"
last-updated: "2026-05-01"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Write/IdempotencyMiddleware.php
  - src/Middleware/Write/IdempotencyStoreInterface.php
  - src/Middleware/Write/ArrayIdempotencyStore.php
  - src/Middleware/Write/TransientIdempotencyStore.php
  - src/Middleware/Write/WpdbIdempotencyStore.php
  - src/Middleware/Write/AtomicIdempotencyMiddleware.php
  - src/Middleware/Write/WpdbAtomicIdempotencyStore.php
  - src/Http/ApiException.php
---

# better-route: Idempotent writes

For developers protecting POST / PUT / PATCH endpoints from duplicate writes — payment captures, order creation, anything that should run once even if the client retries due to network errors. The middleware honors the `Idempotency-Key` request header pattern (Stripe / Visa Acceptance / many SaaS APIs use the same convention).

## Misconception this skill corrects

> "Classic `IdempotencyMiddleware` is enough to prevent concurrent double execution."

Not for high-side-effect endpoints. Classic `IdempotencyMiddleware` checks the store, runs the handler, then stores the response. Two identical requests arriving at the same time can both see an empty store and both execute. For payment/order/subscription/account-like writes, use **`br-atomic-idempotency`** and `AtomicIdempotencyMiddleware`, which reserves before handler execution.

> "I'll use `ArrayIdempotencyStore` since it's the default and simplest."

`ArrayIdempotencyStore` keeps state in PHP memory FOR ONE REQUEST ONLY. The next request starts with an empty store. So duplicate detection works only within a single PHP process — not across requests, which is the whole point. It's a test fixture, not a production store.

The production options:

| Store | Survives | When to pick |
|---|---|---|
| `ArrayIdempotencyStore` | Single process | Unit tests only. |
| `TransientIdempotencyStore` | Until cache flush | OK if your object cache is persistent (Redis); risky on standard hosts where transients live in `wp_options` and a cache plugin can clear them. |
| `WpdbIdempotencyStore` | DB-persistent | **Production default.** Survives object-cache flushes and PHP restarts. |

For concurrent duplicate prevention, the production option is `WpdbAtomicIdempotencyStore` with `AtomicIdempotencyMiddleware`.

Other AI-prone misconceptions:

- "I'll set up `WpdbIdempotencyStore` once and it just works." Wrong — call `installSchema()` once on plugin activation. Without the table, every `INSERT` / `SELECT` fails. Verified at [WpdbIdempotencyStore.php:76](WpdbIdempotencyStore.php).
- "I can use a cross-database table by passing `'other_db.idempotency'`." Wrong — the table-name guard at [WpdbIdempotencyStore.php:104-110](WpdbIdempotencyStore.php) rejects names containing `.`. This prevents accidental cross-DB writes; if you genuinely need cross-DB, write a custom store.
- "Default v0.3.0 idempotency key is global." Wrong — it's identity-aware: `{provider}:user:{userId}` → `{provider}:sub:{subject}` → `'guest'`. Two different users sending the same `Idempotency-Key` get separate buckets, which is what you want.

## When to use this skill

Trigger when ANY of the following is true:

- The diff instantiates `IdempotencyMiddleware`, `WpdbIdempotencyStore`, `TransientIdempotencyStore`.
- The route needs retry replay but not pre-handler reservation.
- Setting up a payment / billing endpoint.
- The user asks "how do I prevent duplicate orders" / "Stripe-style idempotency".
- Plugin-activation code that needs `installSchema()`.

## Workflow

### 1. Choose the store

```php
use \BetterRoute\Middleware\Write\IdempotencyMiddleware;
use \BetterRoute\Middleware\Write\WpdbIdempotencyStore;

// Plugin activation: ensure the table exists
register_activation_hook(__FILE__, function (): void {
    (new WpdbIdempotencyStore())->installSchema();
});

// Runtime: instantiate the store + middleware
$store = new WpdbIdempotencyStore();
// or with a custom table name:
$store = new WpdbIdempotencyStore(table: 'myapp_idempotency');

$middleware = new IdempotencyMiddleware(
    store: $store,
    ttlSeconds: 600,        // 10-minute window
    requireKey: true,       // reject requests without Idempotency-Key
);
```

`installSchema()` runs `CREATE TABLE IF NOT EXISTS` for the idempotency table. Safe to call repeatedly. Best place is plugin activation (runs once per install), but you can also call it from a one-off setup script.

### 2. Apply to write routes

```php
$router->post('/payments', $createPaymentHandler)
    ->protectedByMiddleware('jwt')
    ->middleware([$jwt, $middleware]);
```

The middleware runs only for `POST` / `PUT` / `PATCH`. GET / DELETE / HEAD pass through unchanged.

### 3. Client-side header

```http
POST /wp-json/myapp/v1/payments HTTP/1.1
Authorization: Bearer ...
Idempotency-Key: 7c3a9b2e-4f81-4a23-8d1e-9c2b5f8e1d4a
Content-Type: application/json

{"amount": 1000, "currency": "USD"}
```

The client generates a unique key per logical operation (UUID v4 is canonical). On the FIRST request, the middleware:

1. Reads `Idempotency-Key`.
2. Computes the storage key: `{routePath}:{idempotencyKey}:{identityKey}`.
3. Calls `$store->get($storageKey)` — returns null (nothing cached yet).
4. Runs `$next($context)` → handler executes the payment.
5. Stores `$response` under the storage key with `ttlSeconds` TTL.

On the SECOND request with the SAME key:

1. Reads `Idempotency-Key` (same value).
2. Computes the same storage key.
3. `$store->get(...)` returns the cached response.
4. Middleware returns the cached response WITHOUT calling `$next` — handler doesn't run twice.

### 4. The TTL window

```php
new IdempotencyMiddleware($store, ttlSeconds: 600);   // 10 minutes
```

Verified at [IdempotencyMiddleware.php:31](IdempotencyMiddleware.php) — default is 300 seconds (5 minutes). Pick the TTL based on:

- **How long do clients reasonably retry?** Network hiccups → seconds. User-driven retries → minutes. Background job retries → hours.
- **Storage cost.** Long TTLs accumulate idempotency entries.
- **Replay-attack window.** Anyone with the cached response can replay it within the TTL — usually fine, since the response is the EXPECTED output anyway.

For payment endpoints, 24h+ is common (Stripe uses 24h). For low-stakes writes, 5-10 minutes is enough.

### 5. requireKey vs optional

```php
// Hard requirement — reject anything without Idempotency-Key
new IdempotencyMiddleware($store, requireKey: true);

// Optional — apply idempotency when key is present, pass through otherwise
new IdempotencyMiddleware($store, requireKey: false);
```

`requireKey: true` ([IdempotencyMiddleware.php:52-53](IdempotencyMiddleware.php)) throws `ApiException('Idempotency key is required.', 400, 'idempotency_key_required')` when the header is missing. Use for high-stakes writes (payments) where a missing key is a client bug.

`requireKey: false` (default) silently runs the handler when no key is present. Use for backwards-compatible adoption — clients that don't send the header still work; clients that do get duplicate protection.

### 6. Custom keyResolver

```php
$middleware = new IdempotencyMiddleware(
    store: $store,
    ttlSeconds: 600,
    requireKey: true,
    keyResolver: function ($request, string $idempotencyKey) {
        // Bucket by tenant ID instead of user ID
        return 'tenant:' . get_current_tenant_id() . ':' . $idempotencyKey;
    },
);
```

Use when the default identity-aware key (user ID / sub / guest) doesn't match your bucketing strategy — e.g. multi-tenant SaaS where the same user can act on behalf of multiple orgs.

### 7. Per-route TTL via separate middleware

```php
$paymentIdempotency = new IdempotencyMiddleware($store, ttlSeconds: 86400);  // 24h for payments
$generalIdempotency = new IdempotencyMiddleware($store, ttlSeconds: 600);    // 10m elsewhere

$router->post('/payments', $handler)
    ->protectedByMiddleware('jwt')
    ->middleware([$jwt, $paymentIdempotency]);

$router->post('/comments', $handler)
    ->protectedByMiddleware('jwt')
    ->middleware([$jwt, $generalIdempotency]);
```

One store, two middleware instances with different TTL configs.

## Critical rules

- **`WpdbIdempotencyStore::installSchema()` once on plugin activation.** Without the table, every operation fails.
- **Cross-database table names rejected** — table parameter must NOT contain `.`. Verified at [WpdbIdempotencyStore.php:104-110](WpdbIdempotencyStore.php). For cross-DB, write a custom store implementing `IdempotencyStoreInterface`.
- **`ArrayIdempotencyStore` is for tests only** — single-process, lost on next request.
- **Apply middleware to write routes only.** GET / HEAD / DELETE pass through unchanged but still cost the middleware overhead.
- **`requireKey: true` rejects with `400 idempotency_key_required`** when header missing. Use for high-stakes writes.
- **v0.3.0 default key is identity-aware.** Same `Idempotency-Key` from different users → different buckets. Pre-v0.3 was global; pass `keyResolver` to preserve old behavior.
- **TTL pruning is on-access.** Expired rows aren't garbage-collected by a cron; they're removed when read after expiration. So a row idle for years just sits there until someone tries the same key.
- **Cached response includes the original status code.** A 201 is returned 201 on retry; a 4xx error on the first request is also "remembered" and returned again. Decide if that's what you want for failed-but-deterministic flows.
- **Combine with auth middleware (auth FIRST).** Otherwise the idempotency key resolver can't distinguish users — everything keys on `'guest'`.

## Common mistakes

```php
// WRONG — ArrayIdempotencyStore in production
$store = new ArrayIdempotencyStore();   // 🔴 single-process; not what you want
$middleware = new IdempotencyMiddleware($store);

// RIGHT
$store = new WpdbIdempotencyStore();

// WRONG — forgetting installSchema
$store = new WpdbIdempotencyStore();
$middleware = new IdempotencyMiddleware($store);
// First request fails: table doesn't exist.

// RIGHT
register_activation_hook(__FILE__, function (): void {
    (new WpdbIdempotencyStore())->installSchema();
});

// WRONG — cross-DB table
$store = new WpdbIdempotencyStore(table: 'analytics_db.idempotency');   // 🔴 rejected

// RIGHT — same DB
$store = new WpdbIdempotencyStore(table: 'better_route_idempotency');

// WRONG — requireKey: true on backwards-compat upgrade
new IdempotencyMiddleware($store, requireKey: true);
// → existing clients (which don't send Idempotency-Key) suddenly fail with 400.

// RIGHT — phase in
// Stage 1 (release): requireKey: false; clients gradually adopt the header.
new IdempotencyMiddleware($store, requireKey: false);
// Stage 2 (after observed adoption): requireKey: true.
new IdempotencyMiddleware($store, requireKey: true);

// WRONG — middleware order
->middleware([$idempotency, $jwt])
// Idempotency keys on 'guest' for everyone (auth hasn't run); two different users with the
// same Idempotency-Key collide.

// RIGHT — auth first
->middleware([$jwt, $idempotency])

// WRONG — applying to GET endpoints "for safety"
$router->get('/orders', $listOrders)->middleware([$idempotency]);
// Middleware skips GET (correct), so this is no-op overhead.

// RIGHT — write methods only
$router->post('/orders', $createOrder)->middleware([$idempotency]);

// WRONG — short TTL on payment endpoint
new IdempotencyMiddleware($store, ttlSeconds: 60);
// Client retries after a 5-minute network outage → middleware no longer remembers,
// runs handler again, charges card twice.

// RIGHT — generous TTL for payments
new IdempotencyMiddleware($store, ttlSeconds: 86400);   // 24h

// WRONG — assuming the cached error response WON'T be cached
// Client sends bad request, gets 400. Retries with same key, gets the cached 400 — but in
// the meantime they fixed the request. Cached response returns the OLD 400.

// RIGHT — accept that idempotency caches whatever happened. If you want fresh attempts after
// the client fixes their bug, the client should rotate the Idempotency-Key for each new attempt.
// Or only cache 2xx via a custom store implementation.

// WRONG — no garbage collection plan for the table
// 24h TTLs + 1000 RPS → 86.4M rows after 24h, never auto-cleaned (pruned on access only).

// RIGHT — schedule a cron to delete expired rows:
add_action('myapp_idempotency_cleanup', function () {
    global $wpdb;
    $wpdb->query("DELETE FROM {$wpdb->prefix}better_route_idempotency WHERE expires_at < UNIX_TIMESTAMP()");
});
if (!wp_next_scheduled('myapp_idempotency_cleanup')) {
    wp_schedule_event(time(), 'hourly', 'myapp_idempotency_cleanup');
}
```

## Cross-references

- Run **`br-routes`** for write-route deny-by-default — idempotency middleware needs `->protectedByMiddleware()` or `->permission()`.
- Run **`br-auth-middleware`** for the auth middleware that should run BEFORE idempotency.
- Run **`br-rate-limiting`** for combining throttle + idempotency on the same endpoint (orthogonal concerns).
- Run **`br-error-contract`** for the `400 idempotency_key_required` and `409 idempotency_conflict` envelope shapes.
- Run **`br-atomic-idempotency`** for high-side-effect writes where concurrent duplicate execution must be blocked before the handler starts.

## What this skill does NOT cover

- Idempotency-Key generation on the client side. UUID v4 is the convention; any unique string works.
- Atomic reservation semantics. Use `AtomicIdempotencyMiddleware` / `br-atomic-idempotency` for that.
- Multi-region replication of the idempotency table. WP isn't multi-region native; replicate via DB-level mechanisms.
- Cleanup automation beyond on-access pruning. Schedule a WP cron if needed.
- Stripe-style idempotency-replay headers (`Idempotent-Replayed: true`). Better-route returns the cached response indistinguishably from a fresh response. Add a custom header if your client cares.

## References

- IdempotencyMiddleware: [libraries/better-route/src/Middleware/Write/IdempotencyMiddleware.php:29-33](IdempotencyMiddleware.php) — `__construct(store, ttlSeconds: 300, requireKey: false)`. Required-key throw at line 52-53 (`idempotency_key_required`).
- WpdbIdempotencyStore: [libraries/better-route/src/Middleware/Write/WpdbIdempotencyStore.php:11-15](WpdbIdempotencyStore.php) — `__construct(table: 'better_route_idempotency', prefix: null)`.
- Schema install: [WpdbIdempotencyStore.php:76+](WpdbIdempotencyStore.php) — `installSchema()` runs `CREATE TABLE IF NOT EXISTS` with TTL index.
- Cross-DB rejection: [WpdbIdempotencyStore.php:104-110](WpdbIdempotencyStore.php) — `tableName()` throws on `str_contains($table, '.')`.
- IdempotencyStoreInterface: [libraries/better-route/src/Middleware/Write/IdempotencyStoreInterface.php](IdempotencyStoreInterface.php) — `get(string): mixed`, `set(string, mixed, int)`, `delete(string)` for custom stores.
- Other stores: [libraries/better-route/src/Middleware/Write/ArrayIdempotencyStore.php](ArrayIdempotencyStore.php), [libraries/better-route/src/Middleware/Write/TransientIdempotencyStore.php](TransientIdempotencyStore.php).
