---
name: br-rate-limiting
description: Configure better-route 1.1 RateLimitMiddleware with atomic fixed-window storage. Use for WpObjectCacheRateLimiter, TransientRateLimiter, persistent external object cache checks, wp_cache_incr, MySQL named locks, identity/native WordPress/IP keys, trusted proxies, Retry-After and X-RateLimit headers, custom key resolvers, or diagnosing shared guest buckets and race-prone rate limiting.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Middleware/RateLimit/RateLimitMiddleware.php
  - src/Middleware/RateLimit/WpObjectCacheRateLimiter.php
  - src/Middleware/RateLimit/TransientRateLimiter.php
  - src/Support/RequestIdentity.php
  - src/Middleware/Network/TrustedProxyClientIpResolver.php
---

# better-route: rate limiting

Use a fixed-window limiter with an atomic backend. Pick the backend from deployment capabilities; do not silently fall back from an atomic store to a racy read/modify/write.

## Persistent object cache

```php
use BetterRoute\Middleware\RateLimit\RateLimitMiddleware;
use BetterRoute\Middleware\RateLimit\WpObjectCacheRateLimiter;

$rateLimit = new RateLimitMiddleware(
    limiter: new WpObjectCacheRateLimiter(group: 'myapp_rate_limit'),
    limit: 60,
    windowSeconds: 60,
);

$router->get('/account', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->middleware([$auth, $rateLimit]);
```

`WpObjectCacheRateLimiter` requires:

- WordPress cache functions;
- `wp_using_ext_object_cache() === true` when that function exists;
- `wp_cache_incr()`;
- a backend whose increment actually behaves atomically.

Construction or a failed increment throws. Use it with a verified Redis/Memcached-style persistent backend, not WordPress's request-local default object cache.

## Transient backend

```php
use BetterRoute\Middleware\RateLimit\TransientRateLimiter;

$rateLimit = new RateLimitMiddleware(
    limiter: new TransientRateLimiter(),
    limit: 20,
    windowSeconds: 60,
);
```

In default WordPress mode, `TransientRateLimiter` wraps the transient read/modify/write in a MySQL `GET_LOCK`/`RELEASE_LOCK` critical section. It requires global `$wpdb` and may throw when the lock cannot be acquired or state cannot be persisted.

If custom `getTransient`/`setTransient` callbacks are injected, also inject a real `synchronize` callback when requests can run concurrently. Without it, the custom mode executes unsynchronized.

## Default key in 1.1

The default key deeply canonicalizes the route and the first available identity:

1. auth middleware user ID;
2. auth subject;
3. explicit context/native logged-in WordPress user ID;
4. HMAC key identity;
5. resolved client IP;
6. `guest` only when no identity or IP is available.

This means cookie/application-password/native WordPress users get per-user buckets even without an `attributes['auth']` entry. Anonymous callers normally get per-IP rather than one global guest bucket.

Run auth before rate limiting when token identity should win over IP:

```php
->middleware([$auth, $rateLimit])
```

## Trusted client IP

Use `TrustedProxyClientIpResolver` behind proxies:

```php
use BetterRoute\Middleware\Network\TrustedProxyClientIpResolver;

$ipResolver = new TrustedProxyClientIpResolver(
    trustedProxyCidrs: ['10.0.0.0/24', '2001:db8:1234::/48'],
    forwardedHeaders: ['CF-Connecting-IP', 'X-Forwarded-For'],
);

$rateLimit = new RateLimitMiddleware(
    limiter: $limiter,
    limit: 60,
    windowSeconds: 60,
    clientIpResolver: $ipResolver,
);
```

The resolver reads a forwarded header only when immediate `REMOTE_ADDR` is trusted. For hop lists it walks right-to-left and returns the closest untrusted address, avoiding a client-forged leftmost value. Keep provider CIDRs current.

## Response contract

Allowed responses receive:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

Denied requests return `429 rate_limited`, the same rate-limit headers, and `Retry-After` calculated from reset time. Browser clients must include `Retry-After` in CORS `exposedHeaders` if JavaScript needs it.

The middleware preserves headers on Better Route responses, `WP_REST_Response`, and raw array/scalar results.

## Custom keys

```php
$rateLimit = new RateLimitMiddleware(
    limiter: $limiter,
    limit: 100,
    windowSeconds: 60,
    keyResolver: static fn ($context): string => hash('sha256', json_encode([
        'route' => $context->routePath,
        'tenant' => current_tenant_id(),
        'user' => get_current_user_id(),
    ], JSON_THROW_ON_ERROR)),
);
```

Include route/tenant/identity deliberately and use unambiguous structured encoding. A constant global key lets one caller exhaust the bucket for everyone.

## Review checklist

- Verify backend atomicity under concurrency.
- Run auth before the limiter for per-token/user limits.
- Configure trusted proxy CIDRs before trusting forwarded headers.
- Test first, last allowed, and first denied request; assert remaining/reset/retry headers.
- Test an anonymous caller from two IPs and two authenticated users.
- Monitor MySQL named-lock or cache increment failures; they are availability failures, not permission denials.
- Use upstream/CDN protection as well; PHP-level rate limiting is not volumetric DDoS mitigation.

## Related skills

- Use `br-network-security` for proxy/CIDR rules.
- Use `br-auth-middleware` for identity ordering.
- Use `br-cors-public-client` to expose rate-limit headers.
