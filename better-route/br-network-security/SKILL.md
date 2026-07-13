---
name: br-network-security
description: Configure Better Route 1.1 trusted-proxy client IP resolution and CIDR allowlists. Use behind Cloudflare, nginx, load balancers, or reverse proxies when authorization, rate limiting, or audit data depends on the real client IP.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route network security

Never trust a forwarded-IP header merely because it exists. Configure every proxy hop that your infrastructure controls.

```php
use BetterRoute\Middleware\Network\IpAllowlistMiddleware;
use BetterRoute\Middleware\Network\TrustedProxyClientIpResolver;

$resolver = new TrustedProxyClientIpResolver(
    trustedProxyCidrs: ['10.0.0.0/24', '2001:db8:1234::/48'],
    forwardedHeaders: ['CF-Connecting-IP', 'X-Forwarded-For']
);

$allowlist = new IpAllowlistMiddleware(
    allowedCidrs: ['203.0.113.0/24'],
    ipResolver: $resolver,
    failClosed: true
);

$router->post('/back-channel/event', $handler)
    ->middleware([$allowlist])
    ->protectedByMiddleware('ipAllowlist');
```

## Resolution contract

- If `REMOTE_ADDR` is invalid or absent, resolution returns `null`.
- If `REMOTE_ADDR` is not a trusted proxy, it is the client address and all forwarded headers are ignored.
- If the immediate peer is trusted, the resolver checks configured headers in order.
- For a comma-separated forwarding chain it walks right-to-left and returns the closest address that is not one of the configured trusted proxies. This avoids trusting a client-injected leftmost value behind an appending proxy.
- When no usable untrusted forwarded address exists, it falls back to `REMOTE_ADDR`.

The header order is a trust decision. Prefer a provider-specific, overwriting header only when the immediate trusted proxy is guaranteed to set and scrub it. Otherwise use the forwarding-chain semantics and document the proxy topology.

## Rules

- Keep `failClosed: true` for access control.
- Treat an IP allowlist as defense in depth, not the only proof for a sensitive webhook. Combine it with HMAC or another authentication method.
- Use the same resolver for allowlisting, rate-limit identity, and audit enrichment to avoid contradictory client identities.
- Update trusted proxy ranges through a controlled deployment process; never accept them from request input.
- Test direct requests with spoofed headers, trusted and untrusted immediate peers, IPv4/IPv6 CIDRs, malformed chains, multiple trusted hops, and all-hops-trusted fallback.

Source references: `src/Middleware/Network/TrustedProxyClientIpResolver.php`, `src/Middleware/Network/CidrMatcher.php`, `src/Middleware/Network/IpAllowlistMiddleware.php`.
