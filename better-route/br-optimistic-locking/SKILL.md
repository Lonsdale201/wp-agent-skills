---
name: br-optimistic-locking
description: Configure Better Route 1.1 optimistic locking for REST writes with If-Match or version parameters and an atomic per-resource critical section. Use when preventing stale updates, lost writes, or two cooperating Better Route requests from passing the same version check concurrently.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# Better Route optimistic locking

Use optimistic locking on updates or deletes where overwriting a newer state is unsafe. Resolve the current version from storage while the critical section is held.

```php
use BetterRoute\Middleware\Write\CallbackOptimisticLockVersionResolver;
use BetterRoute\Middleware\Write\OptimisticLockMiddleware;
use BetterRoute\Middleware\Write\WpdbOptimisticLockCriticalSection;

$lock = new OptimisticLockMiddleware(
    versionResolver: new CallbackOptimisticLockVersionResolver(
        static function ($context): string|int|null {
            $id = (int) $context->request->get_param('id');
            return my_current_record_version($id);
        }
    ),
    required: true,
    headerName: 'if-match',
    paramName: 'version',
    criticalSection: new WpdbOptimisticLockCriticalSection(timeoutSeconds: 2)
);

$router->patch('/records/(?P<id>\d+)', $handler)
    ->middleware([$auth, $lock])
    ->protectedByMiddleware('bearerAuth');
```

The middleware prefers `If-Match`, then falls back to the configured request parameter. It accepts quoted or weak ETag-like values by normalizing `W/"value"` to `value`; numeric values become strings. `*` accepts any available current version.

## Response contract

- Missing precondition with `required: true` returns `428 Precondition Required`.
- A supplied version that differs from current storage returns `412 optimistic_lock_failed` with expected/current details.
- An unavailable current version returns `409 version_unavailable`.
- Lock acquisition failure throws and becomes an internal failure unless the application maps it deliberately.
- On success, context attribute `optimisticLock` contains `expected`, `current`, and `atomic: true`.

## Atomicity boundary

The default `WpdbOptimisticLockCriticalSection` derives a MySQL named lock from route path plus canonicalized URL parameters. It holds that lock around both the current-version read and the downstream handler. Concurrent Better Route writers using the same route identity cannot both pass the same stale check.

This is a cooperative lock, not a database-wide compare-and-swap:

- External writers, direct SQL, background jobs, and different routes can still race unless they use the identical lock discipline.
- Route parameters must uniquely and consistently identify the stored resource. A write identity hidden only in body/query data is not included by the default lock name.
- The handler must actually advance the version after a successful mutation.
- MySQL named locks are connection-scoped. Keep the protected handler bounded and never perform slow remote I/O inside it.

For storage shared with uncontrolled writers, implement a true conditional update such as `UPDATE ... WHERE id = ? AND version = ?` and verify one affected row, or provide a custom `OptimisticLockCriticalSectionInterface` aligned with that storage.

## Checks

- Send no precondition, a matching version, a stale version, weak/quoted versions, and `*`.
- Run two concurrent requests with the same version and assert only one mutation succeeds.
- Verify two different resource IDs do not share a lock and equivalent parameter ordering does.
- Exercise lock timeout and handler exceptions; the named lock must release in `finally`.
- Verify every mutation path, including jobs and alternate endpoints, follows the chosen concurrency contract.

Source references: `src/Middleware/Write/OptimisticLockMiddleware.php`, `src/Middleware/Write/WpdbOptimisticLockCriticalSection.php`, `src/Middleware/Write/CallbackOptimisticLockVersionResolver.php`.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
