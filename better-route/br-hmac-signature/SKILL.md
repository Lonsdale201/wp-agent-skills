---
name: br-hmac-signature
description: Configure better-route 0.6.0 HmacSignatureMiddleware for signed server-to-server REST requests and webhooks. Use when adding X-Signature, X-Timestamp, X-Key-Id, HmacSecretProviderInterface, ArrayHmacSecretProvider, request body HMAC verification, timestamp replay window checks, multi-key rotation, or replacing unsigned public POST endpoints with shared-secret authentication. Updated 2026-05-02.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Middleware/Auth/HmacSignatureMiddleware.php
  - src/Middleware/Auth/HmacSecretProviderInterface.php
  - src/Middleware/Auth/ArrayHmacSecretProvider.php
  - src/Support/Crypto.php
  - tests/SecurityPrimitivesTest.php
---

# better-route: HMAC request signatures

Use this for server-to-server endpoints, webhooks, and back-channel calls where a bearer user token is not the right primitive. The middleware validates headers before the handler runs.

## Pattern

```php
use BetterRoute\Middleware\Auth\ArrayHmacSecretProvider;
use BetterRoute\Middleware\Auth\HmacSignatureMiddleware;

$hmac = new HmacSignatureMiddleware(
    secrets: new ArrayHmacSecretProvider([
        'primary' => getenv('MYAPP_WEBHOOK_SECRET'),
        'next' => getenv('MYAPP_WEBHOOK_SECRET_NEXT'),
    ]),
    signatureHeader: 'X-Signature',
    timestampHeader: 'X-Timestamp',
    keyIdHeader: 'X-Key-Id',
    replayWindowSeconds: 300,
    algorithm: 'sha256'
);

$router->post('/webhooks/provider', $handler)
    ->middleware([$hmac])
    ->publicRoute();
```

## Canonical input

The signature input is:

```text
timestamp + "\n" + method + "\n" + path + "\n" + sha256(body)
```

Default headers:

- `X-Signature`
- `X-Timestamp`
- `X-Key-Id`

Accepted signature encodings:

- lowercase hex
- uppercase hex
- base64
- base64url
- the same values prefixed with `sha256=`

## Critical rules

- Unknown key ID fails closed.
- Missing signature/timestamp/key-id fails closed with `401`.
- Timestamp outside `replayWindowSeconds` fails closed.
- Signature comparison uses `Crypto::equals()`.
- Keep secrets outside code; use constants/env/options managed by the host application.
- HMAC authenticates the sender and request body. It does not make the route private at the WordPress permission layer; pair public webhook routes with `->publicRoute()` deliberately.

## Cross-references

- Use `br-network-security` if the same route also needs a CIDR allowlist.
- Use `br-routes` for `publicRoute()` vs `protectedByMiddleware()` intent.
- Use `br-error-contract` for `401 invalid_signature` and `stale_signature` handling.
