---
name: br-hmac-signature
description: Configure Better Route 1.1 HMAC authentication for webhooks and server-to-server REST requests. Use when signing request timestamps, methods, paths, raw bodies, optional query strings, rotating key IDs, or consuming the shared HMAC AuthContext identity.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# Better Route HMAC request signatures

Use HMAC for a shared-secret webhook or back-channel client. Attach the middleware and mark the raw route as middleware-protected; HMAC is authentication, not a public-route exception.

```php
use BetterRoute\Middleware\Auth\ArrayHmacSecretProvider;
use BetterRoute\Middleware\Auth\HmacSignatureMiddleware;

$hmac = new HmacSignatureMiddleware(
    secrets: new ArrayHmacSecretProvider([
        'primary' => MY_PLUGIN_WEBHOOK_SECRET,
        'next' => MY_PLUGIN_WEBHOOK_SECRET_NEXT,
    ]),
    replayWindowSeconds: 300,
    algorithm: 'sha256',
    signQueryString: true
);

$router->post('/webhooks/provider', $handler)
    ->middleware([$hmac])
    ->protectedByMiddleware('hmacAuth');
```

## Canonical string

The client must sign the exact raw request body and construct:

```text
timestamp + "\n" + UPPERCASE_METHOD + "\n" + path + "\n" + sha256(rawBody)
```

With `signQueryString: true`, append a fifth line containing the recursively key-sorted query encoded by PHP `http_build_query()`. Both client and server must use the same nested-array and space-encoding rules. Query parameters are unsigned by default, so enable this option or keep every security-relevant value in the signed body.

Default headers are `X-Signature`, `X-Timestamp`, and `X-Key-Id`. The signature accepts hex, Base64, or Base64URL, optionally prefixed with `<algorithm>=`. Prefer one documented client encoding even though the server accepts several.

## Security rules

- Generate high-entropy secrets and keep them out of source control and logs.
- Rotate keys by accepting old and new key IDs briefly; remove the old key after rollout.
- Use HTTPS. HMAC authenticates content but does not encrypt it.
- A timestamp window limits delayed replay but does not prevent two identical requests inside the window. Combine writes with atomic idempotency or a single-use-token store when duplicate execution is unsafe.
- Sign the raw transmitted bytes. JSON re-encoding, changed whitespace, or a different path causes a legitimate signature to fail.
- Never choose the secret from request data except through a reviewed `HmacSecretProviderInterface` key-ID lookup.

After verification, Better Route 1.1 writes `provider: hmac` and `subject: <key-id>` into the shared `auth` context and adds an `hmac` attribute. Audit and rate-limit middleware can use that identity.

Test missing headers, unknown key ID, malformed and out-of-window timestamps, altered body/path/query, key rotation, and an unsigned-route configuration mistake.

Source references: `src/Middleware/Auth/HmacSignatureMiddleware.php`, `src/Middleware/Auth/HmacSecretProviderInterface.php`, `src/Middleware/Auth/ArrayHmacSecretProvider.php`.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
