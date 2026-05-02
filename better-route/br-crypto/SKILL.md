---
name: br-crypto
description: Use better-route 0.6.0 Crypto and CryptoEncoding helpers for secure random token generation, base64url encoding/decoding, hex tokens, and constant-time comparisons. Triggers on Crypto::token, Crypto::tokenHex, Crypto::equals, Crypto::base64UrlEncode, Crypto::base64UrlDecode, PKCE, nonce, state, CSRF token, HMAC compare, or replacing !== token comparisons. Updated 2026-05-02.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Support/Crypto.php
  - src/Support/CryptoEncoding.php
  - src/Middleware/Jwt/Hs256JwtVerifier.php
  - tests/SecurityPrimitivesTest.php
---

# better-route: Crypto helpers

Use this for small security primitives that should not be reimplemented in plugins: random tokens, base64url encoding, and constant-time comparisons.

## API

```php
use BetterRoute\Support\Crypto;
use BetterRoute\Support\CryptoEncoding;

$state = Crypto::token(32); // base64url by default
$nonce = Crypto::token(32, CryptoEncoding::Base64Url);
$hex = Crypto::tokenHex(32);

$encoded = Crypto::base64UrlEncode($raw);
$raw = Crypto::base64UrlDecode($encoded);

if (!Crypto::equals($expected, $provided)) {
    throw new \BetterRoute\Http\ApiException('Invalid token.', 401, 'invalid_token');
}
```

## Critical rules

- Use `Crypto::equals()` for PKCE verifier comparisons, nonce, state, CSRF, HMAC, and token-bound string comparisons.
- Do not use `!==` for secrets or attacker-controlled token strings.
- `Crypto::token()` uses `random_bytes()` and defaults to base64url.
- `Crypto::base64UrlDecode()` is strict and throws on malformed input.
- `CryptoEncoding` values are `Hex`, `Base64`, and `Base64Url`.

## Cross-references

- Use `br-single-use-token` when the token must be consumed once.
- Use `br-hmac-signature` for signed request verification.
- Use `br-jwks-jwt-auth` for JWT verification; do not hand-roll JWT crypto.
