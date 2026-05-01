---
name: br-etag-cache
description: HTTP-level response caching for better-route GET / HEAD
  endpoints via ETagMiddleware — computes a hash of the response body
  (sha1 of json_encode by default), emits an ETag response header, and
  returns 304 Not Modified with no body when the request's
  If-None-Match header matches. Critical scope rules — only applies to
  GET and HEAD; POST / PUT / PATCH / DELETE pass through unchanged
  (verified at src/Middleware/Cache/ETagMiddleware.php:28-30); only
  applies to 2xx-non-204 responses (verified at line 33-35) — 4xx /
  5xx / 204 / 3xx skip ETag. The default body-hash approach is
  appropriate for small JSON responses; for large or expensive bodies
  pass an etagResolver callable to compute the hash from a cheap
  source (e.g. last_modified timestamp + ID). weak: true emits a
  weak validator (W/"hash"). Use when adding HTTP cacheability to
  read endpoints. Triggers on ETagMiddleware, If-None-Match,
  304 Not Modified.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Cache/ETagMiddleware.php
  - src/Middleware/Cache/CachingMiddleware.php
  - src/Middleware/Cache/CacheStoreInterface.php
  - src/Middleware/Cache/TransientCacheStore.php
  - src/Middleware/MiddlewareInterface.php
  - src/Http/RequestContext.php
  - src/Http/Response.php
---

# better-route: ETag-based response caching

For developers adding HTTP-level cacheability to better-route GET / HEAD endpoints. The middleware emits an `ETag` header with a body hash, accepts `If-None-Match` from the client, and returns `304 Not Modified` (no body) when they match — saving bandwidth and letting CDNs cache responses across users.

## Misconception this skill corrects

> "I'll add `ETagMiddleware` to my POST endpoint so duplicate requests return 304."

Wrong tool. ETag is for read caching only. Verified at [src/Middleware/Cache/ETagMiddleware.php:28-30](ETagMiddleware.php) — non-GET / non-HEAD requests pass through unchanged. For "duplicate POSTs return cached response", use `IdempotencyMiddleware` (see `br-idempotency`) — different mechanism, different goal.

The middleware only applies to:

- HTTP method GET or HEAD ([line 53-61](ETagMiddleware.php) `isGetOrHead`).
- Response status 2xx but NOT 204 ([line 33-35](ETagMiddleware.php)) — 204 has no body, no ETag.

Other AI-prone misconceptions:

- "ETag is computed cheap, so I can add it everywhere." Half-true. The default ETag is `sha1(json_encode($body))` — not free. For a 50KB JSON response per request, that's ~50µs per request just hashing. For high-traffic endpoints, pass an `etagResolver` that reads a cheap source (last-modified timestamp).
- "ETag response header alone enables caching." Half-true. ETag enables CONDITIONAL caching (revalidate via If-None-Match). For unconditional caching, also set `Cache-Control` headers — the middleware doesn't do that.
- "`weak: true` means weak hashing." Wrong — `weak: true` emits a `W/"hash"` validator (HTTP weak ETag) which allows semantic equivalence rather than byte equivalence. The hash itself is the same sha1 either way.

## When to use this skill

Trigger when ANY of the following is true:

- The diff instantiates `ETagMiddleware`.
- A handler returns large JSON arrays that don't change often (catalog listings, public configs).
- Setting up CDN-friendly caching on a public REST endpoint.
- Reviewing a PR that hand-rolls `ETag` / `If-None-Match` logic.

## Workflow

### 1. Default usage (body hash)

```php
use \BetterRoute\Middleware\Cache\ETagMiddleware;

$etag = new ETagMiddleware();   // weak = false, etagResolver = null

$router->get('/profile/{id}', $handler)
    ->middleware([$etag]);
```

The middleware:

1. Calls `$next($context)` — gets the handler's response.
2. Computes the ETag — `'"' . sha1(json_encode($body)) . '"'` ([line 70-77](ETagMiddleware.php)).
3. Compares against `If-None-Match` from the request.
4. If match: returns `new Response(null, 304, ['ETag' => $etag])` — no body.
5. If miss: returns the response with the ETag header attached.

### 2. Custom `etagResolver` for cheap hashing

```php
$etag = new ETagMiddleware(
    weak: false,
    etagResolver: function (mixed $response, RequestContext $context): string {
        // Cheap hash from a known invariant — last-modified timestamp + ID
        $body = $response instanceof Response ? $response->body : $response;
        $id = $body['id'] ?? 0;
        $modified = $body['modified'] ?? 0;
        return "{$id}-{$modified}";   // the middleware quotes it: "5-1714356000"
    },
);
```

Use when:

- The body is large (1MB+) and re-hashing on every request is expensive.
- You have a cheap source-of-truth for "did this change" (DB column, cache key, file mtime).
- The body content has unstable serialization order — `json_encode` of an associative array can hash differently on different PHP runs / versions.

The resolver receives `($response, $context)` — return any string; the middleware wraps it in quotes (and `W/` prefix if `weak: true`).

### 3. Weak validators

```php
$etag = new ETagMiddleware(weak: true);
```

Emits `W/"<hash>"` instead of `"<hash>"`. Per RFC 7232, weak validators allow semantic equivalence — two responses that are byte-different but semantically equivalent (e.g. JSON with reordered keys) can match.

In practice for JSON APIs, the difference is negligible — most CDNs treat both the same. Default `weak: false` is correct for byte-exact validation.

### 4. Combine with Cache-Control for true cacheability

ETag alone enables revalidation: client sends `If-None-Match`, server may return 304. To actually cache without revalidating each time, the response also needs `Cache-Control`:

```php
$router->get('/catalog', function ($ctx) {
    $body = expensive_fetch();
    return new \BetterRoute\Http\Response(
        body: $body,
        status: 200,
        headers: [
            'Cache-Control' => 'public, max-age=300',   // cache for 5 minutes
        ]
    );
})->middleware([new ETagMiddleware()]);
```

Now the response is cached for 5 minutes by the client / CDN. After that, the client revalidates with `If-None-Match` — and the server returns 304 if the data hasn't changed. The cache extends until the data DOES change.

### 5. Group-level ETag

```php
$router->group('/public', function ($group) {
    $group->get('/featured', $featured);
    $group->get('/categories', $categories);
    $group->get('/posts', $posts);
})->middleware([new ETagMiddleware()]);
```

All three GETs get ETag treatment. Mid-request middleware decides whether to apply per-request based on method and status.

### 6. Skip ETag for specific routes in a group

```php
$router->group('/public', function ($group) {
    $group->get('/featured', $featured);
    $group->get('/now', $serverTime);   // changes every request — no cache benefit
})->middleware([new ETagMiddleware()]);
```

ETag still runs on `/now`, but since the body changes per request (new timestamp), the `If-None-Match` never matches. The middleware computes the hash and emits ETag, then 304 never fires. Slight overhead with no caching benefit.

To skip cleanly, attach the middleware per-route instead of per-group:

```php
$router->get('/featured', $featured)->middleware([new ETagMiddleware()]);
$router->get('/now', $serverTime);   // no ETag
```

## Critical rules

- **GET and HEAD only.** Other methods pass through unchanged ([ETagMiddleware.php:28-30](ETagMiddleware.php)).
- **2xx-non-204 only.** 304, 4xx, 5xx, 204 don't get an ETag header.
- **Default ETag is `"sha1(json_encode($body))"`.** Symmetric quoting (RFC 7232).
- **Weak validators (`weak: true`) emit `W/"hash"`.** Allow semantic equivalence; rarely needed for JSON APIs.
- **`etagResolver` is the cheap-hash escape hatch.** Use for large bodies or stable invariants.
- **ETag is conditional caching.** For unconditional caching, also set `Cache-Control`.
- **`json_encode` order can vary** — for stable hashing on rotating-key data, sort the array first or use an `etagResolver` based on a stable invariant.
- **The middleware respects existing `ETag` headers** in the response (it doesn't overwrite if your handler set one already — verify on your specific case).

## Common mistakes

```php
// WRONG — ETag on a write endpoint
$router->post('/articles', $handler)
    ->middleware([new ETagMiddleware()]);
// ETagMiddleware passes POST through unchanged. No effect, dead code.

// RIGHT — ETag on read endpoints only
$router->get('/articles', $listHandler)->middleware([new ETagMiddleware()]);

// RIGHT — for write idempotency, use IdempotencyMiddleware

// WRONG — expecting ETag alone to cache the response
$router->get('/catalog', $heavyHandler)
    ->middleware([new ETagMiddleware()]);
// First request: handler runs, ETag emitted. Second request without If-None-Match: handler
// runs AGAIN. ETag enables revalidation, not caching.

// RIGHT — combine with Cache-Control
$router->get('/catalog', function ($ctx) {
    return new Response(body: $data, headers: ['Cache-Control' => 'public, max-age=300']);
})->middleware([new ETagMiddleware()]);

// WRONG — default body-hash on a 5MB response
$router->get('/full-export', $hugeJsonHandler)
    ->middleware([new ETagMiddleware()]);
// Each request hashes 5MB → ~10ms hashing per request → noticeable on a high-RPS endpoint.

// RIGHT — etagResolver from a stable invariant
$router->get('/full-export', $hugeJsonHandler)
    ->middleware([new ETagMiddleware(
        etagResolver: fn ($response, $ctx) => (string) get_option('myapp_export_version', 0),
    )]);

// WRONG — assuming json_encode order is stable across PHP versions
// Same data hashes differently between PHP runs → ETag never matches → cache useless

// RIGHT — sort the data first OR use a stable invariant via etagResolver
function ($response) {
    $body = $response->body;
    ksort($body);   // stable key order
    return sha1(json_encode($body));
}

// WRONG — quoting the ETag manually
->headers(['ETag' => 'abc123'])
// HTTP requires ETag values to be quoted. The middleware adds quotes; you don't need to.

// RIGHT — return raw hash string, middleware quotes it
return $hash;   // middleware emits ETag: "$hash"

// WRONG — using ETag for per-user cached responses without varying by user
$etag = new ETagMiddleware();
$router->get('/me', $myProfile)->middleware([$etag]);
// Two different users get the same /me URL. CDN caches user A's response and serves it to user B.

// RIGHT — for per-user responses, ALSO set 'Cache-Control: private' so CDNs don't share:
return new Response(body: $myProfile, headers: [
    'Cache-Control' => 'private, max-age=60',
]);
// And ETag works correctly per user (each browser caches its own copy).
```

## Cross-references

- Run **`br-routes`** for the route-layer middleware attachment patterns (`->middleware([...])`, group middleware).
- Run **`br-idempotency`** when the goal is "duplicate POST returns cached result" (different mechanism, write side).
- Run **`br-rate-limiting`** when combining ETag with rate limits — the order matters for the per-user-vs-IP key.
- Run **`br-error-contract`** for how 304 differs from the error envelope (304 has no body; errors have `{error: ...}`).

## What this skill does NOT cover

- Last-Modified / If-Modified-Since semantics. ETag and Last-Modified are separate validators; the middleware ships ETag only.
- Cache-Control header configuration. The handler / route is responsible for setting `max-age`, `private`, etc.
- CDN-specific cache invalidation (Cloudflare purge API, etc.). External infrastructure.
- Per-user cache key derivation. Use `etagResolver` if you need per-user hashing.
- Compression / Vary headers. Set `Vary: Accept-Encoding` separately if needed.
- Browser cache flushing. Client-side concern.

## References

- ETagMiddleware: [libraries/better-route/src/Middleware/Cache/ETagMiddleware.php:11](ETagMiddleware.php) — `final class ETagMiddleware implements MiddlewareInterface`. Constructor at line 18-23 (`weak: false`, `etagResolver: null` defaults).
- GET/HEAD guard: [ETagMiddleware.php:28-30](ETagMiddleware.php) — `isGetOrHead` check.
- 2xx-non-204 guard: [ETagMiddleware.php:33-35](ETagMiddleware.php) — status range check.
- 304 short-circuit: [ETagMiddleware.php:38-40](ETagMiddleware.php) — `If-None-Match` comparison + 304 response.
- Default hash: [ETagMiddleware.php:70-77](ETagMiddleware.php) — `sha1(json_encode($body))` with `serialize` fallback.
- Quoting: [ETagMiddleware.php:81+](ETagMiddleware.php) — wraps in `"..."` (or `W/"..."` if weak).
- RFC 7232 (HTTP conditional requests): [https://tools.ietf.org/html/rfc7232](https://tools.ietf.org/html/rfc7232).
