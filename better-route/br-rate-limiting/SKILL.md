---
name: br-rate-limiting
description: Throttle better-route endpoints via RateLimitMiddleware
  with two backend choices — WpObjectCacheRateLimiter (preferred,
  needs persistent object cache like Redis or Memcached; throws
  RuntimeException at construction if wp_cache_* functions are
  unavailable) and TransientRateLimiter (fallback, uses WP transients;
  works without object cache but has higher write latency). Critical
  v0.3.0 default key is identity-aware — {provider}:user:{userId} →
  {provider}:sub:{subject} → 'guest', so authenticated users get a
  per-user limit and anonymous traffic keys on 'guest'. Pre-v0.3
  default was IP-based; pass an explicit keyResolver to preserve old
  keys. In 0.6.0 RateLimitMiddleware can use either legacy
  Http\ClientIpResolver or new TrustedProxyClientIpResolver /
  ClientIpResolverInterface with IPv4/IPv6 CIDRs. REMOTE_ADDR must be in
  trusted proxy CIDRs before any X-Forwarded-For / CF-Connecting-IP header is consulted. Use
  when adding throttling. Triggers on RateLimitMiddleware,
  WpObjectCacheRateLimiter, TransientRateLimiter, ClientIpResolver,
  TrustedProxyClientIpResolver.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/RateLimit/RateLimitMiddleware.php
  - src/Middleware/RateLimit/RateLimiterInterface.php
  - src/Middleware/RateLimit/RateLimitResult.php
  - src/Middleware/RateLimit/WpObjectCacheRateLimiter.php
  - src/Middleware/RateLimit/TransientRateLimiter.php
  - src/Http/ClientIpResolver.php
  - src/Middleware/Network/TrustedProxyClientIpResolver.php
  - src/Middleware/Network/ClientIpResolverInterface.php
  - src/Middleware/Network/CidrMatcher.php
  - src/Http/ApiException.php
---

# better-route: Rate limiting and client IP resolution

For developers protecting endpoints with rate limits — N requests per M seconds per identity. Two backend implementations cover the deployment matrix (in-memory object cache, transient fallback). For client IPs, 0.6.0 adds `TrustedProxyClientIpResolver`; the legacy `Http\ClientIpResolver` remains BC-safe.

## Misconception this skill corrects

> "I'll trust `$_SERVER['HTTP_X_FORWARDED_FOR']` directly to identify the client IP behind Cloudflare."

That's IP spoofing waiting to happen. Verified at [src/Http/ClientIpResolver.php:30-32](ClientIpResolver.php) — `ClientIpResolver` intentionally requires the immediate `REMOTE_ADDR` to be in `$trustedProxies` before consulting any forwarded-IP header. If `REMOTE_ADDR` isn't a trusted proxy, the resolver returns `REMOTE_ADDR` unchanged — ignoring `X-Forwarded-For` entirely.

The reason: any client can send any `X-Forwarded-For` header. If your code reads it without checking who's connecting, attackers spoof their IP to evade rate limits, fake audit logs, or bypass IP allowlists. The proxy chain is only trustworthy when the IMMEDIATE connection is from a known proxy.

```php
// WRONG — trust unauthenticated header
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'];

// RIGHT — trustedProxies gate
$resolver = new ClientIpResolver(
    trustedProxies: ['127.0.0.1', '10.0.0.5'],   // your reverse proxy / load balancer addresses
    trustedHeaders: ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR'],
);
$ip = $resolver->resolve();
```

Other AI-prone misconceptions:

- "I'll use `WpObjectCacheRateLimiter` everywhere — it's the recommended option." Half-true. It THROWS at construction if `wp_cache_*` functions are unavailable ([WpObjectCacheRateLimiter.php:21-25](WpObjectCacheRateLimiter.php)) — which is true for vanilla WP installs WITHOUT a persistent object cache plugin (Redis Object Cache, Memcached). On those installs, fall back to `TransientRateLimiter`.
- "Default v0.3.0 rate limit key is per-IP." Wrong (post-v0.3.0) — the default key is identity-aware: authenticated user's ID first, then `sub`, then `guest`. To preserve pre-v0.3 IP-based keys, pass an explicit `keyResolver`.
- "I'll combine `JwtAuthMiddleware` after `RateLimitMiddleware` so unauthenticated requests still get rate limited." Wrong order — when JWT runs AFTER rate limit, the rate-limit `keyResolver` doesn't see the authenticated user yet, so it falls back to `'guest'` (every authenticated user shares one bucket). Run JWT FIRST.
- "IP allowlists belong in a custom rate-limit key resolver." Wrong tool. Use `IpAllowlistMiddleware` from `br-network-security`; rate limiting throttles, allowlists authorize by network.

## When to use this skill

Trigger when ANY of the following is true:

- The diff instantiates `RateLimitMiddleware`, `WpObjectCacheRateLimiter`, `TransientRateLimiter`, `ClientIpResolver`, or `TrustedProxyClientIpResolver`.
- The user asks "how do I throttle this endpoint" / "rate limit per user".
- Reviewing PR with `$_SERVER['HTTP_X_FORWARDED_FOR']` or similar header reads in handler code.
- Triaging "users get rate-limited as if they were anonymous" — usually middleware ordering.

## Workflow

### 1. Pick a backend

```php
use \BetterRoute\Middleware\RateLimit\RateLimitMiddleware;
use \BetterRoute\Middleware\RateLimit\WpObjectCacheRateLimiter;
use \BetterRoute\Middleware\RateLimit\TransientRateLimiter;

// Preferred (Redis / Memcached / W3 Total Cache / etc. installed):
$limiter = new WpObjectCacheRateLimiter(group: 'myapp_rl');

// Fallback (no persistent object cache):
$limiter = new TransientRateLimiter(/* ... */);

$middleware = new RateLimitMiddleware(
    $limiter,
    limit: 60,           // 60 requests per window
    windowSeconds: 60,   // window = 60 seconds
);
```

`WpObjectCacheRateLimiter` throws `RuntimeException` at construction if `wp_cache_add` / `wp_cache_get` / `wp_cache_set` aren't all available. Catch the exception and fall back:

```php
try {
    $limiter = new WpObjectCacheRateLimiter();
} catch (\RuntimeException) {
    $limiter = new TransientRateLimiter();
}
```

### 2. Apply the middleware

```php
$router->group('/api', function ($group) {
    $group->get('/posts', $listPosts);
    $group->post('/posts', $createPost)
        ->protectedByMiddleware('jwt');
})->middleware([$jwt, $rateLimit]);   // ← order matters: JWT FIRST
```

JWT runs first, so the request context has `user.id` populated when the rate limiter computes its key. The default key resolver ([RateLimitMiddleware.php:21-29](RateLimitMiddleware.php)) is:

```php
fn (RequestContext $context): string
    => $context->routePath . '|' . $this->identityKey($context);
```

Where `identityKey` returns `{provider}:user:{userId}` for authenticated, `{provider}:sub:{subject}` for token-without-WP-user, and `'guest'` for anonymous.

### 3. On limit exceeded

The middleware throws `ApiException` with status 429:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded.",
    "details": {
      "limit": 60,
      "remaining": 0,
      "resetAt": 1714356060
    }
  }
}
```

Response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 23
X-RateLimit-Reset: 1714356060
```

In 0.5.0 `RateLimitMiddleware` wraps plain array handler results into `BetterRoute\Http\Response`, so these headers are preserved even if the handler returns `['data' => ...]`. Existing `Response` and `WP_REST_Response` outputs remain supported.

### 4. Custom key resolver (per-IP, per-route, per-tenant)

```php
$middleware = new RateLimitMiddleware(
    limiter: $limiter,
    limit: 100,
    windowSeconds: 60,
    keyResolver: function (\BetterRoute\Http\RequestContext $context): string {
        $ip = (new \BetterRoute\Http\ClientIpResolver(
            trustedProxies: ['127.0.0.1'],
        ))->resolve() ?? 'unknown';
        return $context->routePath . '|' . $ip;   // per-route, per-IP
    },
);
```

Common keying strategies:

| Strategy | keyResolver |
|---|---|
| Per-user (default v0.3+) | (omit) — uses identity-aware default |
| Per-IP | `fn ($ctx) => $ctx->routePath . '|' . $ipResolver->resolve()` |
| Per-API-key | `fn ($ctx) => $ctx->routePath . '|' . $ctx->user->apiKeyId` |
| Per-tenant | `fn ($ctx) => $ctx->routePath . '|tenant:' . $ctx->user->tenantId` |
| Global | `fn ($ctx) => 'global'` (one bucket for everyone — usually a bad idea) |

### 5. Behind proxies — the IP resolver

```php
use \BetterRoute\Http\ClientIpResolver;

$resolver = new ClientIpResolver(
    trustedProxies: ['127.0.0.1', '10.0.0.5'],   // your LB / reverse proxy
    trustedHeaders: ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP'],
);

$ip = $resolver->resolve();   // null if REMOTE_ADDR is unavailable
```

Resolution algorithm (verified at [ClientIpResolver.php:23-46](ClientIpResolver.php)):

1. Read `REMOTE_ADDR`. If empty, return null.
2. If `REMOTE_ADDR` is NOT in `$trustedProxies`, return `REMOTE_ADDR` (don't read forwarded headers).
3. Walk `$trustedHeaders` in order. For each, read the header value, split on comma, return the first valid IP.
4. If all forwarded headers are empty / invalid, return `REMOTE_ADDR`.

Default `$trustedHeaders`: `['HTTP_X_FORWARDED_FOR', 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP']`. Override the order if you have a specific deployment (e.g. CF in front of nginx → `HTTP_CF_CONNECTING_IP` first).

### 5b. v0.6.0 hardened resolver

For new code, prefer `TrustedProxyClientIpResolver` because it accepts IPv4/IPv6 CIDRs and implements `ClientIpResolverInterface`, which can be injected into `RateLimitMiddleware`:

```php
use \BetterRoute\Middleware\Network\TrustedProxyClientIpResolver;

$resolver = new TrustedProxyClientIpResolver(
    trustedProxyCidrs: ['10.0.0.0/24', '2001:db8:1234::/48'],
    forwardedHeaders: ['CF-Connecting-IP', 'X-Forwarded-For'],
);

$rateLimit = new RateLimitMiddleware(
    limiter: $limiter,
    limit: 60,
    windowSeconds: 60,
    clientIpResolver: $resolver,
);
```

Use the legacy `BetterRoute\Http\ClientIpResolver` only when preserving older constructor shapes is useful.

### 6. Layer rate limits

```php
// Global anonymous limit (low):
$globalLimiter = new RateLimitMiddleware($limiter, limit: 10, windowSeconds: 60);

// Authenticated bucket (higher):
$userLimiter = new RateLimitMiddleware($limiter, limit: 1000, windowSeconds: 60);

$router->group('/public', function ($group) { /* ... */ })
    ->middleware([$globalLimiter]);

$router->group('/api', function ($group) { /* ... */ })
    ->middleware([$jwt, $userLimiter]);
```

Public endpoints get a low anonymous limit. Authenticated API gets a much higher per-user limit. The two share the same `$limiter` instance (same backend store) but with different keys.

## Critical rules

- **`WpObjectCacheRateLimiter` requires a persistent object cache.** Throws `RuntimeException` at construction otherwise. Catch and fall back to `TransientRateLimiter`.
- **`TransientRateLimiter` works without object cache** but writes to `wp_options` — higher latency on hot endpoints.
- **Default v0.3.0 key is identity-aware.** `{provider}:user:{userId}` → `{provider}:sub:{subject}` → `'guest'`. Authenticated users get per-user; anonymous share `'guest'`.
- **Run auth middleware BEFORE rate limit** so the rate limiter sees the authenticated user. Reversed order keys on `'guest'` for everyone.
- **`ClientIpResolver` requires `REMOTE_ADDR` to be in `trustedProxies`** before reading forwarded headers. Otherwise spoofing is trivial.
- **Prefer `TrustedProxyClientIpResolver` for new 0.6.0 code.** It supports CIDRs and the shared `ClientIpResolverInterface`.
- **Default `trustedHeaders`** = `['HTTP_X_FORWARDED_FOR', 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP']`. Override the order based on your deployment.
- **`ClientIpResolver::resolve` returns null** if `REMOTE_ADDR` is unavailable. Handle the null case in your key resolver.
- **Limit-exceeded response is `429 rate_limited`** with `details.{limit, remaining, resetAt}`.
- **Successful response gets `X-RateLimit-*` headers.** Don't overwrite them in the handler.

## Common mistakes

```php
// WRONG — trusting forwarded headers without proxy gate
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rateLimitKey = 'user:' . $ip;   // WRONG: client controls $ip

// RIGHT — ClientIpResolver
$ip = (new ClientIpResolver(trustedProxies: ['127.0.0.1']))->resolve();
$rateLimitKey = 'user:' . ($ip ?? 'unknown');

// WRONG — middleware order reversed
$router->group('/api', fn ($g) => /* ... */)
    ->middleware([$rateLimit, $jwt]);
// All authenticated users share the 'guest' bucket because rate-limit ran before JWT.

// RIGHT
->middleware([$jwt, $rateLimit])

// WRONG — WpObjectCacheRateLimiter without fallback on hosts without object cache
$limiter = new WpObjectCacheRateLimiter();
// Throws on Bluehost / SiteGround / shared hosts without Redis.

// RIGHT — graceful fallback
try {
    $limiter = new WpObjectCacheRateLimiter();
} catch (\RuntimeException) {
    $limiter = new TransientRateLimiter();
}

// WRONG — global single-bucket limit
$middleware = new RateLimitMiddleware(
    $limiter,
    limit: 10,
    windowSeconds: 60,
    keyResolver: fn () => 'global',
);
// One user's traffic exhausts the bucket for everyone. DoS via single client.

// RIGHT — per-user OR per-IP keying

// WRONG — assuming default key is per-IP
$middleware = new RateLimitMiddleware($limiter, limit: 100, windowSeconds: 60);
// Pre-v0.3.0 was per-IP; v0.3.0+ is identity-aware. Authenticated users with the same IP
// (e.g. shared NAT) get separate buckets — usually what you want, but different from old behavior.

// RIGHT — explicit keyResolver to preserve old behavior IF you want it
keyResolver: fn ($ctx) => $ctx->routePath . '|' . ($ipResolver->resolve() ?? 'unknown')

// WRONG — trusting CF-Connecting-IP without confirming Cloudflare proxy IPs
new ClientIpResolver(
    trustedProxies: [],   // WRONG: empty
    trustedHeaders: ['HTTP_CF_CONNECTING_IP'],
);
// REMOTE_ADDR not trusted → resolver returns REMOTE_ADDR; CF header ignored. Backwards.

// RIGHT — list CF's IP ranges as trustedProxies
new ClientIpResolver(
    trustedProxies: ['<all of CF's IPv4 + IPv6 ranges>'],   // refresh from cloudflare.com/ips
    trustedHeaders: ['HTTP_CF_CONNECTING_IP'],
);

// WRONG — limit too aggressive on public endpoint
$globalLimit = new RateLimitMiddleware($limiter, limit: 5, windowSeconds: 60);
// Search engine crawlers + your CDN's revalidation requests hit the limit constantly.

// RIGHT — separate buckets for crawlers / authenticated, OR keying that excludes user-agent matches
```

## Cross-references

- Run **`br-auth-middleware`** for the auth middleware that should run BEFORE rate limit.
- Run **`br-network-security`** for trusted-proxy CIDRs and IP allowlists.
- Run **`br-routes`** for the middleware attachment patterns (`->middleware([...])`, group middleware).
- Run **`br-error-contract`** for the `429 rate_limited` envelope shape.
- Run **`br-idempotency`** when combining throttling with idempotency keys (different concerns; can co-exist).

## What this skill does NOT cover

- Distributed rate limiting across multiple WP installs / sites. The object cache is per-install; for cross-install, point all instances at a shared Redis.
- Token bucket / leaky bucket algorithms. The library uses fixed-window counting (simpler; some bursts cross window boundaries).
- Cost-weighted rate limiting (some endpoints "cost" more). Implement at the keyResolver / multiple middleware layer.
- IP allowlists / blocklists. Use `br-network-security` and `IpAllowlistMiddleware`.
- DDoS protection at the application layer. The library is a layer-7 limit; layer-3/4 attacks need network-level mitigation (Cloudflare, AWS Shield).
- Honest-user fingerprinting beyond IP + user ID. Browser fingerprinting is fragile and ethically questionable.

## References

- RateLimitMiddleware: [libraries/better-route/src/Middleware/RateLimit/RateLimitMiddleware.php:21-30](RateLimitMiddleware.php) — constructor with `limit: 60`, `windowSeconds: 60` defaults; default `keyResolver` at line 29.
- WpObjectCacheRateLimiter: [libraries/better-route/src/Middleware/RateLimit/WpObjectCacheRateLimiter.php:17-25](WpObjectCacheRateLimiter.php) — `group: 'better_route_rate_limit'`. Throws if `wp_cache_*` unavailable.
- TransientRateLimiter: [libraries/better-route/src/Middleware/RateLimit/TransientRateLimiter.php](TransientRateLimiter.php) — fallback for hosts without object cache; uses `get_transient` / `set_transient`.
- ClientIpResolver: [libraries/better-route/src/Http/ClientIpResolver.php:13-17](ClientIpResolver.php) — `trustedProxies = []`, `trustedHeaders = ['HTTP_X_FORWARDED_FOR', 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP']`.
- TrustedProxyClientIpResolver: [libraries/better-route/src/Middleware/Network/TrustedProxyClientIpResolver.php](TrustedProxyClientIpResolver.php) — CIDR-aware resolver for new 0.6.0 code.
- IP resolution: [ClientIpResolver.php:23-46](ClientIpResolver.php) — `resolve(?array $server = null)`, walks `$_SERVER` if no override.
- RateLimitResult: [libraries/better-route/src/Middleware/RateLimit/RateLimitResult.php](RateLimitResult.php) — `allowed`, `remaining`, `resetAt`.
- Cloudflare IP ranges: [https://www.cloudflare.com/ips/](https://www.cloudflare.com/ips/).
