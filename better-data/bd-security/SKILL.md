---
name: bd-security
description: >
  Apply better-data's security discipline when touching
  Secret, EncryptionEngine, #[Sensitive], #[Encrypted],
  MetaKeyRegistry::register, RequestSource guards, or user_pass
  handling. Loud-over-silent — missing key throws, tampered ciphertext
  throws, unknown strict-whitelist field throws, colliding route-owned
  field throws; silent degradation is the worst outcome for security.
  Symmetric end-to-end — encrypt on write, decrypt on read; redact on
  toArray, reveal explicitly via $secret->reveal() inside compute()
  closures (the audit point); a new leak path needs a SecretTest leak
  probe. Never cache the raw key — EncryptionEngine re-reads
  BETTER_DATA_ENCRYPTION_KEY on every call so rotation works.
  Constant-time comparison — hash_equals, never == or ===. Use when
  any of those primitives is in the diff. Triggers on EncryptionEngine,
  Secret, Sensitive, Encrypted, RequestSource, BETTER_DATA_ENCRYPTION_KEY.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
source-refs:
  - src/Secret.php
  - src/Encryption/EncryptionEngine.php
  - src/Attribute/Encrypted.php
  - src/Attribute/Sensitive.php
  - src/Registration/MetaKeyRegistry.php
  - src/Source/RequestSource.php
  - src/DataObject.php
  - src/Exception/DecryptionFailedException.php
  - src/Exception/SecretSerializationException.php
---

# better-data: Security-sensitive changes

For library maintainers touching anything in better-data's security perimeter — `Secret`, `EncryptionEngine`, `#[Sensitive]`, `#[Encrypted]`, `RequestSource` guards, password handling. Mistakes in this perimeter aren't bugs that show up in tests; they're regressions that ship plaintext to disk or leak credentials in logs.

## Misconception this skill corrects

> "I'll add a debug-mode that logs the encrypted value's plaintext when developer mode is on — it's only for development."

Don't. The security-feature-with-bypass is the worst outcome — caller assumes redaction is universal, log infrastructure picks up the "debug" path in production by accident, plaintext lands in CloudWatch / Sentry / wp-debug.log forever. The discipline is no-bypass: `Secret`'s `__toString` returns `'***'` ([src/Secret.php:84-87](Secret.php)), `jsonSerialize` returns `'***'` ([src/Secret.php:89-92](Secret.php)), `__debugInfo` (controls `var_dump` / `print_r`) returns `['value' => '***']` ([src/Secret.php:99-103](Secret.php)), `__serialize` THROWS `SecretSerializationException` ([src/Secret.php:105-109](Secret.php)).

The throwing `__serialize` is deliberate — a caller serialized a `Secret` has already made a security-relevant mistake. Relaxing it to redact instead would silently let the bug ship. The exception forces them to either `->reveal()` explicitly (audit point) or rethink the flow.

Other AI-prone misconceptions:

- "I'll cache the encryption key in a static property to avoid re-reading the constant on every call." Wrong — `EncryptionEngine` deliberately re-reads on every call ([src/Encryption/EncryptionEngine.php:53-54](EncryptionEngine.php)) so key rotation via `BETTER_DATA_ENCRYPTION_KEY_PREVIOUS` actually works. A process-long cache defeats rotation.
- "`==` and `===` are fine for comparing two `Secret`s; the constant-time stuff is paranoia." Wrong — string compare is timing-dependent and leaks length / first-byte equality through repeated probing. `Secret::equals` uses `hash_equals` ([src/Secret.php:78-82](Secret.php)). Always.
- "If decryption fails, return null and the caller falls back to the default." Wrong — silent failure on decrypt is worse than an exception. A caller that gets `null` instead of the expected secret may treat it as "user never set a key" and proceed. `EncryptionEngine::decrypt` throws `DecryptionFailedException` ([src/Encryption/EncryptionEngine.php:109,130](EncryptionEngine.php)).

## When to use this skill

Trigger when ANY of the following is true:

- The diff touches `src/Secret.php`, `src/Encryption/EncryptionEngine.php`, `src/Attribute/Encrypted.php`, `src/Attribute/Sensitive.php`.
- The diff touches `MetaKeyRegistry::register`, route-owned-field handling, or `RequestSource` guards.
- New code introduces a `Secret` typed property OR `#[Encrypted]` attribute.
- New code calls `EncryptionEngine::encrypt` / `decrypt` / `looksEncrypted`.
- New code introduces password handling (`user_pass`, hash storage, comparison).
- Reviewing a PR that adds a "debug mode" / "verbose log" / "for development" flag near sensitive material.

## Workflow

### 1. Threat model first (in the PR description or a code comment)

Write down explicitly:

- **What is this change preventing?** (e.g. "API tokens stored as plaintext in `wp_options`.")
- **What remains un-prevented?** (e.g. "Plaintext key in PHP memory between hydration and use; an attacker with PHP memory access can still read it.")
- **What's the threat model?** (e.g. "Database compromise, log file exposure. NOT defending against in-memory attackers — that requires HSM-grade key management.")

The goal: a future contributor reads the comment and knows whether their proposed change preserves or breaks the model.

### 2. Loud over silent

Every degradation must throw. The catalog:

| Condition | Throws |
|---|---|
| Encryption key constant not defined | `RuntimeException` |
| `decrypt` called on garbage | `DecryptionFailedException` |
| `decrypt` called with tampered ciphertext (GCM auth tag mismatch) | `DecryptionFailedException` |
| Secret `__serialize` invoked | `SecretSerializationException` |
| `MetaKeyRegistry::register` collision (one key, two DTOs) | `RuntimeException` |
| `RequestSource::noCollision` finds an unexpected route-owned field in the body | `RequestParamCollisionException` |
| `strict` mode + unknown DTO field in incoming data | `UnknownFieldException` |

If you add a security feature, add a corresponding throw. Don't ship a flag that converts the throw into a warning.

### 3. Symmetric end-to-end

Every encrypt has a matching decrypt, every redact has a matching reveal. Lookup table:

| Write side | Read side |
|---|---|
| `SinkProjection::prepareValue` encrypts when `#[Encrypted]` | `AttributeDrivenHydrator` decrypts when `#[Encrypted]` |
| `Presenter::toArray` redacts `Secret` / `#[Sensitive]` | Explicit `$secret->reveal()` inside `compute()` closure |
| `OptionSink::projectForStorage` encrypts | `OptionSource` decrypts |
| `__serialize` throws | `__unserialize` throws — symmetric blockage |

If you add an encrypt path, you MUST add the matching decrypt path in the same PR. The reverse is also true. Asymmetry is a security regression because it preserves DATA but loses CONFIDENTIALITY.

### 4. Never cache the raw key

The pattern at [src/Encryption/EncryptionEngine.php:53-54](EncryptionEngine.php) is:

```php
private const CONST_PRIMARY = 'BETTER_DATA_ENCRYPTION_KEY';
private const CONST_PREVIOUS = 'BETTER_DATA_ENCRYPTION_KEY_PREVIOUS';
```

Each `encrypt` / `decrypt` call reads the constant fresh. NO static property holds the resolved key. Reason: rotation. The runbook is:

1. Define `BETTER_DATA_ENCRYPTION_KEY` with the new key.
2. Define `BETTER_DATA_ENCRYPTION_KEY_PREVIOUS` with the old key.
3. Wait for the rotation period (lazy migration: every read decrypts under the old key, every write re-encrypts under the new).
4. Eventually undefine `BETTER_DATA_ENCRYPTION_KEY_PREVIOUS`.

If you cached the key in a static, step 1 doesn't take effect until the PHP process restarts — which can be hours after the constant changes. Don't cache.

### 5. Constant-time comparison

Any string comparison involving secret material:

```php
// WRONG — timing oracle
if ($candidate === $stored) { /* ... */ }

// RIGHT
if (\hash_equals($stored, $candidate)) { /* ... */ }
```

`Secret::equals` is the canonical example ([src/Secret.php:78-82](Secret.php)). For password verification, use `password_verify` (which is constant-time by design).

### 6. Unit-test contract for security changes

Three probes minimum:

```php
public function test_tampering_throws(): void
{
    $ciphertext = EncryptionEngine::encrypt('hello');
    // Flip one byte after the bd:v1: prefix
    $tampered = substr($ciphertext, 0, 8) . 'X' . substr($ciphertext, 9);

    $this->expectException(DecryptionFailedException::class);
    EncryptionEngine::decrypt($tampered, 'field');
}

public function test_missing_key_throws(): void
{
    // ensure the constant is undefined for this test
    $this->expectException(RuntimeException::class);
    EncryptionEngine::encrypt('hello');
}

public function test_secret_does_not_leak_via_dump_or_json_or_serialize(): void
{
    $secret = new Secret('sk_live_supersecret');

    $this->assertSame('***', (string) $secret);
    $this->assertSame('"***"', \json_encode($secret));
    $this->assertStringNotContainsString('sk_live', \print_r($secret, true));
    $this->assertStringNotContainsString('sk_live', \var_export($secret, true));

    $this->expectException(SecretSerializationException::class);
    \serialize($secret);
}
```

Add a leak probe for any new property / class that wraps secret material. The probe should `print_r` / `var_dump` / `json_encode` / `serialize` and assert the raw value isn't present.

### 7. Stress scenario for the WP boundary

The companion plugin's stress suite covers live-WP behavior:

- DTO hydrated from `wp_options` round-trips: option row contains ciphertext, hydrated DTO contains a `Secret`, reveal returns the original.
- REST response for a DTO with `Secret` shows `'***'` (consumer never sees plaintext over the wire).
- `wp_options` row inspection (raw `SELECT`) returns ciphertext, not plaintext.

```bash
wp better-data stress --filter Secret
```

A `FAIL` finding here blocks the change. A `NOTE` is acceptable but documented.

### 8. Run the full check

```bash
vendor/bin/phpunit
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
wp better-data stress
```

## Critical rules

- **Loud over silent.** Every security degradation throws. No "soft fail with warning", no "log and return null".
- **Symmetric end-to-end.** Encrypt requires decrypt. Redact requires explicit reveal. New write path requires new read path.
- **Never cache the encryption key.** `EncryptionEngine` re-reads the constant per call; key rotation depends on it.
- **`hash_equals` for any comparison involving secret material.** `==` and `===` are timing oracles.
- **`Secret::__serialize` throws — do not relax to redact.** The exception forces explicit `->reveal()` (audit point) or rethink.
- **No "debug mode" that logs plaintext.** Even conditionally. The flag inevitably runs in production.
- **Threat model in the PR description or a code comment.** Future contributors need to know what's protected and what isn't.
- **Tamper probe + leak probe** in unit tests for any change touching `Secret` / `EncryptionEngine`.
- **`MetaKeyRegistry::register` collisions throw.** Two DTOs claiming the same `meta_key` is a programming error, not a coexistence-via-overwrite scenario.
- **`RequestSource` strict mode whitelist throws on unknown fields.** Don't relax to "ignore unknown" — the strict mode IS the security boundary.
- **Constant-time comparison for password equality.** Use `password_verify` for hashes; `hash_equals` for raw secret comparison.

## Common mistakes

```php
// WRONG — debug-mode plaintext logging
public function decrypt(string $ciphertext, string $field): string
{
    $plaintext = self::actualDecrypt($ciphertext);
    if (\defined('BETTER_DATA_DEBUG') && BETTER_DATA_DEBUG) {
        \error_log("Decrypted {$field}: {$plaintext}");  // 🔴 plaintext to log
    }
    return $plaintext;
}

// RIGHT — no plaintext-leaking branches at all

// WRONG — silent failure on decrypt
public function decrypt(string $ciphertext, string $field): ?string
{
    try {
        return self::actualDecrypt($ciphertext);
    } catch (\Throwable) {
        return null;  // 🔴 caller can't tell garbage data from missing data
    }
}

// RIGHT — let it throw
public function decrypt(string $ciphertext, string $field): string
{
    return self::actualDecrypt($ciphertext);
    // throws DecryptionFailedException on tampered / wrong-key / garbage
}

// WRONG — caching the key
class EncryptionEngine
{
    private static ?string $cachedKey = null;

    private static function getKey(): string
    {
        return self::$cachedKey ??= \constant(self::CONST_PRIMARY);  // 🔴 rotation broken
    }
}

// RIGHT — fresh read every call
private static function getKey(): string
{
    return \constant(self::CONST_PRIMARY);  // O(1) constant lookup; not worth caching
}

// WRONG — equality with ===
if ($candidate === $secret->reveal()) {  // 🔴 timing oracle
    grant_access();
}

// RIGHT
if ($secret->equals($candidate)) {  // hash_equals under the hood
    grant_access();
}

// WRONG — relaxing __serialize to redact
public function __serialize(): array
{
    return ['value' => '***'];  // 🔴 silent: caller's serialized blob looks "fine"
}

// RIGHT — throw, force explicit reveal at the call site
public function __serialize(): array
{
    throw SecretSerializationException::forSerialize();
}

// WRONG — encrypt-only
class SinkProjection {
    static function prepareValue(...): mixed {
        if ($encrypted) return EncryptionEngine::encrypt($value);
        return $value;
    }
}
class AttributeDrivenHydrator {
    static function hydrate(...): DataObject {
        // forgot to call EncryptionEngine::decrypt
        return $dto;
    }
}
// Result: stored ciphertext, hydrated ciphertext-as-string. Looks like garbage on read.

// RIGHT — symmetric pair lands in the same PR
```

## Cross-references

- Run **`bd-attribute`** when adding a new security-relevant attribute (e.g. `#[RedactInLogs]`) — wire write-side and read-side together.
- Run **`bd-sink`** + **`bd-source-adapter`** when extending encryption to a new store — both sides land in the same PR.
- Run **`bd-better-route-bridge`** if the change affects how secret-bearing DTOs cross the REST boundary — verify `Presenter::rest()` redaction is still in effect.

## What this skill does NOT cover

- Choosing a different cipher (`aes-256-gcm` is the current default; changing it is out of scope and would be a breaking change for stored ciphertexts).
- Key management infrastructure (HSM, AWS KMS, Vault). Library reads PHP constants; integrating with a key store is a consumer concern.
- HTTPS / TLS configuration. WP / hosting layer.
- Login auth / session handling. WP-level concerns; better-data consumes the resolved current user.
- Side-channel attacks beyond timing (cache, branch prediction, …). Not in threat model.
- GDPR / data-subject-rights tooling. The library is data-shape-only; export/erasure is a consumer responsibility.

## References

- `Secret`: [libraries/better-data/src/Secret.php:60-120](Secret.php) — `final class Secret`, `__toString` returns `'***'` (line 84-87), `jsonSerialize` returns `'***'` (89-92), `__debugInfo` returns `['value' => '***']` (99-103), `__serialize` throws (105-109), `__unserialize` throws (111-117), `equals` uses `hash_equals` (78-82), `reveal` (70-73).
- `EncryptionEngine`: [libraries/better-data/src/Encryption/EncryptionEngine.php](EncryptionEngine.php) — `BETTER_DATA_ENCRYPTION_KEY` (line 53), `BETTER_DATA_ENCRYPTION_KEY_PREVIOUS` (54), `looksEncrypted` (137), `decrypt` throws `DecryptionFailedException` (109, 130).
- `#[Encrypted]` attribute: [libraries/better-data/src/Attribute/Encrypted.php](Encrypted.php) — pure data carrier; logic is in projection / hydration.
- `#[Sensitive]` attribute: [libraries/better-data/src/Attribute/Sensitive.php](Sensitive.php) — read by `Presenter::sensitiveFieldNames`.
- Idempotent decrypt: [libraries/better-data/src/DataObject.php:173-184](DataObject.php) — `looksEncrypted` + `Encrypted` attribute check.
- `MetaKeyRegistry`: [libraries/better-data/src/Registration/MetaKeyRegistry.php](MetaKeyRegistry.php) — collision throws.
