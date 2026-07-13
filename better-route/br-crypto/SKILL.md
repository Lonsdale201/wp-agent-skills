---
name: br-crypto
description: Use Better Route 1.1 cryptographic helpers for secure random tokens, Hex/Base64/Base64URL encoding, strict Base64URL decoding, and constant-time secret comparison. Use when implementing nonces, state, PKCE, opaque tokens, or signature comparisons.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# Better Route crypto helpers

Use the library helpers instead of reimplementing small security primitives.

```php
use BetterRoute\Support\Crypto;
use BetterRoute\Support\CryptoEncoding;

$state = Crypto::token(32); // Base64URL by default.
$nonce = Crypto::token(32, CryptoEncoding::Base64Url);
$hex = Crypto::tokenHex(32);

$encoded = Crypto::base64UrlEncode($raw);
$decoded = Crypto::base64UrlDecode($encoded);

if (!Crypto::equals($expected, $provided)) {
    throw new \BetterRoute\Http\ApiException('Invalid token.', 401, 'invalid_token');
}
```

## Rules

- Pass entropy in bytes, not output-character count. The default 32 bytes provides 256 bits before encoding.
- `Crypto::token()` uses `random_bytes()` and accepts `CryptoEncoding::Hex`, `Base64`, or `Base64Url`, including their lowercase string values.
- `Crypto::base64UrlDecode()` validates alphabet, padding placement, length, and decoder success; catch `RuntimeException` at an input boundary if malformed input should become a client error.
- Use `Crypto::equals()` only with strings of the expected representation. Decode/normalize representations before comparing, but never perform lossy case normalization on secret material.
- Use `br-single-use-token` when a token must also be consumed atomically, `br-hmac-signature` for request signing, and `br-jwks-jwt-auth` for JWTs.

Do not use these helpers as password hashing, encryption, key derivation, or a substitute for a protocol-specific verifier.

Source references: `src/Support/Crypto.php`, `src/Support/CryptoEncoding.php`.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
