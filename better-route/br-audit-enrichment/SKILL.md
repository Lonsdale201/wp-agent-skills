---
name: br-audit-enrichment
description: Enrich better-route 0.5.0 audit events with safe operational metadata. Use when adding AuditEnricherMiddleware, AuditMiddleware context fields, auth user/provider metadata, hashed Idempotency-Key logging, resource/action audit fields, or reviewing sensitive REST write routes that need traceable but redacted audit events.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.5.0"
php-min: "8.1"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: Audit enrichment

Use audit enrichment when the standard route/method/status/duration event is not enough to debug or review sensitive operations.

## Pattern

```php
use BetterRoute\Middleware\Audit\AuditEnricherMiddleware;
use BetterRoute\Middleware\Audit\AuditMiddleware;

$router->middleware([
    $jwt,
    new AuditEnricherMiddleware([
        'resource' => 'account',
        'action' => 'update',
    ]),
    new AuditMiddleware($logger),
]);
```

`AuditEnricherMiddleware` writes safe fields to `RequestContext::$attributes['audit']`. `AuditMiddleware` merges that array into success/error events.

## Fields

The enricher can add:

- `authProvider`
- `authUserId`
- `authSubject`
- `idempotencyKey` as `sha1(raw-key)`, not the raw header
- optional `clientIp`
- static fields passed by the route, group, or integration

## Rules

- Run auth before audit enrichment if auth fields are needed.
- Hash idempotency keys; do not log raw keys.
- Keep payment tokens, card data, secrets, cookies, bearer tokens, and full request bodies out of audit events.
- Add stable domain fields such as `resource`, `action`, and public-safe resource IDs.
- Use a private logger destination. Client error responses stay scrubbed; audit logs can be more useful but still need redaction.

## Source refs

- `libraries/better-route/src/Middleware/Audit/AuditEnricherMiddleware.php`
- `libraries/better-route/src/Middleware/Audit/AuditMiddleware.php`
- `libraries/better-route/src/Observability/AuditEventFactory.php`
- `libraries/better-route/tests/BuiltInMiddlewareTest.php`
