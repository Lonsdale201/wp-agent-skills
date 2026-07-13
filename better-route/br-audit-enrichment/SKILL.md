---
name: br-audit-enrichment
description: Configure Better Route 1.1 audit events and safe enrichment. Use when logging route outcomes, authenticated identity, hashed idempotency keys, trusted client IPs, domain action metadata, or ensuring telemetry failures cannot change API behavior.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
docs: https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# Better Route audit enrichment

Run authentication first, enrichment second, and audit logging around the downstream handler.

```php
use BetterRoute\Middleware\Audit\AuditEnricherMiddleware;
use BetterRoute\Middleware\Audit\AuditMiddleware;

$router->middleware([
    $auth,
    new AuditEnricherMiddleware(
        staticFields: ['resource' => 'account', 'action' => 'update'],
        clientIpResolver: $trustedProxyResolver,
        includeClientIp: true
    ),
    new AuditMiddleware($logger),
]);
```

`AuditEnricherMiddleware` writes to the context `audit` attribute. It copies the normalized authentication provider, user ID, and subject; hashes an `Idempotency-Key` with SHA-1 for correlation; optionally resolves client IP; and merges reviewed static fields. Existing fields are retained, while later enrichment values with the same name win.

`AuditMiddleware` logs success or error with route, method, status, duration, correlation metadata, and enrichment. Logger exceptions are swallowed deliberately: observability is best-effort and must not change a successful response or mask the application exception already in flight.

## Rules

- Never include bearer tokens, cookies, nonces, application passwords, HMAC secrets/signatures, payment data, full bodies, or raw idempotency keys.
- Treat SHA-1 here only as a non-secret correlation fingerprint, not as a security proof.
- Use a trusted-proxy-aware resolver before recording or acting on forwarded client IPs.
- Keep static values bounded and public-safe. Do not pass attacker-controlled payload arrays as static fields.
- Protect the log sink with access control, retention limits, rotation, and output escaping in viewers.
- Alert separately when the logging backend is unavailable; the request path intentionally will not fail.

Test successful responses, `ApiException`, unexpected exceptions, logger failure, missing authentication context, and spoofed forwarded headers.

Source references: `src/Middleware/Audit/AuditEnricherMiddleware.php`, `src/Middleware/Audit/AuditMiddleware.php`, `src/Observability/AuditEventFactory.php`.
