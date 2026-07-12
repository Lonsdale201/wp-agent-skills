---
name: br-network-security
description: Use better-route 1.0.0 network security middleware for trusted-proxy client IP resolution and CIDR allowlists. Triggers on TrustedProxyClientIpResolver, ClientIpResolverInterface, CidrMatcher, IpAllowlistMiddleware, CF-Connecting-IP, X-Forwarded-For, REMOTE_ADDR, trusted proxy CIDRs, IP allowlist, webhook IP pinning, or replacing direct forwarded-header reads. Updated 2026-07-12.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.0.0"
php-min: "8.1"
last-updated: "2026-07-12"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Network/TrustedProxyClientIpResolver.php
  - src/Middleware/Network/ClientIpResolverInterface.php
  - src/Middleware/Network/CidrMatcher.php
  - src/Middleware/Network/IpAllowlistMiddleware.php
  - src/Http/ClientIpResolver.php
  - src/Middleware/RateLimit/RateLimitMiddleware.php
  - tests/SecurityPrimitivesTest.php
---

# better-route: Network security and IP allowlists

Use this when an endpoint depends on client IP, especially behind Cloudflare, nginx, a load balancer, or any reverse proxy. Never read forwarded headers directly in handlers.

## Trusted proxy resolver

```php
use BetterRoute\Middleware\Network\TrustedProxyClientIpResolver;

$resolver = new TrustedProxyClientIpResolver(
    trustedProxyCidrs: [
        '10.0.0.0/24',
        '2001:db8:1234::/48',
    ],
    forwardedHeaders: ['CF-Connecting-IP', 'X-Forwarded-For']
);

$ip = $resolver->resolve($request);
```

Forwarded headers are trusted only when the immediate `REMOTE_ADDR` matches `trustedProxyCidrs`.

**Since 1.0.0:** the resolver walks `X-Forwarded-For` **right-to-left** and returns the first address that is **not** a trusted proxy (the closest untrusted hop), falling back to `REMOTE_ADDR` when every hop is trusted. Earlier versions returned the **left-most** entry, which a client can forge behind an *appending* proxy (nginx `proxy_add_x_forwarded_for` appends the real peer, leaving any client-supplied value to its left) — that let a caller spoof its IP and defeat `IpAllowlistMiddleware`, rate-limit buckets, and audit IPs. Single-value overwriting headers such as `CF-Connecting-IP` are unaffected.

## IP allowlist middleware

```php
use BetterRoute\Middleware\Network\IpAllowlistMiddleware;

$allowlist = new IpAllowlistMiddleware(
    allowedCidrs: ['203.0.113.0/24', '2001:db8:feed::/48'],
    ipResolver: $resolver,
    failClosed: true
);

$router->post('/back-channel/logout', $handler)
    ->middleware([$allowlist])
    ->publicRoute();
```

## Rate limiter integration

`RateLimitMiddleware` accepts the new `ClientIpResolverInterface` in 0.6.0:

```php
$rateLimit = new RateLimitMiddleware(
    limiter: $limiter,
    limit: 60,
    windowSeconds: 60,
    clientIpResolver: $resolver
);
```

## Critical rules

- Single IP strings are accepted as CIDRs (`1.2.3.4` behaves like `/32`, IPv6 like `/128`).
- Header order matters; put the most authoritative proxy header first.
- `X-Forwarded-For` resolves to the closest **untrusted** hop (walked right-to-left, skipping `trustedProxyCidrs`), not the left-most entry — the left-most value is attacker-controllable behind an appending proxy. Falls back to `REMOTE_ADDR` when all hops are trusted. (Changed in 1.0.0; older versions took the left-most IP.)
- If IP is unresolvable and `failClosed: true`, `IpAllowlistMiddleware` rejects.
- Keep Cloudflare or provider CIDR lists current; stale proxy ranges cause false denials or unsafe trust.
- IP allowlists are not a replacement for request authentication when IPs are broad or dynamic; combine with HMAC when needed.

## Cross-references

- Use `br-rate-limiting` for throttling semantics and fixed-window stores.
- Use `br-hmac-signature` for signed requests when IP pinning is too brittle.
- Use `br-audit-enrichment` if safe client IP should be added to audit events.
