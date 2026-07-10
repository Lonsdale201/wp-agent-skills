---
name: wp-security-secrets
description: Audits WordPress plugin/theme code for secret-handling and
  credential issues — hardcoded API keys, DB credentials, or signing
  secrets in source; weak randomness (rand, mt_rand, uniqid) used for
  security tokens, password reset links, nonces, or session IDs;
  password storage with md5/sha1/crypt instead of password_hash;
  insecure cookie flags (missing Secure, HttpOnly, SameSite) on
  sensitive cookies; secrets logged via error_log / var_dump in
  production code paths. Use before plugin release, when reviewing
  auth/registration/login features, when integrating third-party
  APIs, or when the user mentions "API key", "token", "session",
  "password reset".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 7.0.1"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://www.php.net/manual/en/function.password-hash.php
  - https://www.php.net/manual/en/function.random-bytes.php
  - https://developer.wordpress.org/reference/functions/wp_generate_password/
---

# WordPress secrets and credentials audit

A focused review for the secrets layer — what's stored, how it's
generated, how it's compared, how it leaks. Narrow scope by design;
run alongside `wp-security-audit` and `wp-security-deep`.

## When to use this skill

Trigger when:

- Reviewing auth, registration, password reset, or 2FA flows.
- The plugin integrates a third-party API (Stripe, SendGrid, OpenAI,
  GitHub etc.) — look for stored credentials.
- The user asks "is my API key safe", "how should I store this token".
- Before wp.org submission (hardcoded secrets are a guaranteed reject).
- The diff contains: `rand`, `mt_rand`, `uniqid`, `md5`, `sha1`,
  `password_hash`, `password_verify`, `setcookie`,
  `wp_generate_password`, `random_bytes`, `random_int`, `openssl_random_pseudo_bytes`,
  `update_option.*api_key`, `update_option.*secret`,
  `define.*KEY`, `define.*SECRET`.

## Audit checks

### 1. Hardcoded credentials in source

```php
// HIGH — anyone with repo read access has prod credentials
const STRIPE_SECRET = 'sk_live_4eC39HqLyjWDarjtT1...';
$api_key = 'AIzaSy...';
define( 'MYPLUGIN_API_TOKEN', 'ghp_xxx...' );
```

**Fix:** load from `wp-config.php` constants (server-deployed, not
in repo), an option (`get_option`) with admin-only write, or an env
var via `getenv()`. Provide a settings page for the user to enter
their own.

Search patterns:
- String literals matching common key prefixes: `sk_`, `pk_live_`,
  `AKIA`, `ghp_`, `xoxb-`, `AIza`, `Bearer `, `eyJ` (JWT),
  hex strings 32+ chars.
- `define( '...KEY...'`, `define( '...SECRET...'`, `define( '...TOKEN...'`
  with a non-empty literal.
- Long base64 strings in source (`[A-Za-z0-9+/]{40,}={0,2}`).

Flag any hit. Even "test" keys count — they get committed to prod.

### 2. Weak randomness for security tokens

```php
// HIGH — predictable
$token = md5( uniqid() );
$reset_key = mt_rand();
$session_id = uniqid( '', true );
```

`rand`, `mt_rand`, `uniqid` are NOT cryptographically secure. They're
seeded predictably and the output can be reconstructed.

**Fix — use one of:**

```php
// WP-native, seeded from random_bytes internally
$token = wp_generate_password( 32, false ); // alnum
$token = wp_generate_password( 64, true, true ); // alnum + special

// PHP-native
$token = bin2hex( random_bytes( 32 ) ); // 64 hex chars
$num   = random_int( 100000, 999999 ); // 6-digit OTP

// WP nonce (for CSRF only — not a long-lived token!)
$nonce = wp_create_nonce( 'action' );
```

**Don't confuse:**
- `wp_create_nonce` is a 10-char CSRF token, valid 12-24h. NOT for
  password resets, API keys, session IDs.
- `wp_generate_uuid4()` used `mt_rand()` through WordPress 6.9, but WordPress
  7.0+ uses `wp_rand()`, whose normal path uses `random_int()`. On a strict
  WP 7.0+ baseline it is suitable as an unguessable identifier. Dedicated
  `random_bytes()`/`wp_generate_password()` tokens remain clearer for
  credentials and give explicit entropy/encoding control. Do not assume the
  same property when supporting WordPress 6.9 or older.

### 3. Password storage

```php
// HIGH — broken
$hash = md5( $password );
$hash = sha1( $password . SALT );
$hash = crypt( $password ); // weak default algo
```

WordPress provides `wp_hash_password()` / `wp_check_password()` —
use these for WP user accounts. **Since WP 6.8** the default algorithm
is bcrypt (was PHPass / portable hash before). To work around bcrypt's
72-byte input limit, WP first HMAC-SHA384 pre-hashes the password,
base64-encodes the result, then runs `password_hash()` with
`PASSWORD_BCRYPT`, prefixing the output with `$wp` to distinguish it
from vanilla bcrypt. `wp_check_password()` still verifies legacy
PHPass hashes from older sites. `wp_check_password()` itself only verifies;
core authentication flows separately call `wp_password_needs_rehash()` and
`wp_set_password()` after a successful login. Therefore **don't reimplement
password storage for WP users**; use the core authentication flow and hashing
functions.

The algorithm and options are filterable (`wp_hash_password_algorithm`,
`wp_hash_password_options`) for sites that want argon2id or stronger
bcrypt cost — but a plugin should not change site-wide defaults unless
explicitly asked.

For non-WP-user passwords (custom auth, API client secrets):

```php
$hash = password_hash( $password, PASSWORD_DEFAULT );
// later
if ( password_verify( $input, $hash ) ) { /* ok */ }
if ( password_needs_rehash( $hash, PASSWORD_DEFAULT ) ) {
    // rehash and update store
}
```

`PASSWORD_DEFAULT` resolves to bcrypt across all currently shipped PHP
versions and may change in a future major PHP release — that's the
point of the constant. Always pair it with `password_needs_rehash()`
on verification to migrate stored hashes when the algorithm changes.
Allocate at least 255 bytes for the stored hash column to leave room
for future algorithm output growth. Never roll your own with `hash()`
+ `salt`.

For high-entropy random tokens such as API keys or recovery tokens, WordPress
6.8+ also provides `wp_fast_hash()` and `wp_verify_fast_hash()`. They use a
fast generic hash with a fixed domain-separation key, not a per-record salt,
and are appropriate when guessing is already infeasible because the input is
random and has at least 128 bits of entropy. They are **not** a replacement for
the deliberately slow `wp_hash_password()`/`wp_check_password()` path for
human-chosen passwords.

### 4. Cookie flags

```php
// MEDIUM/HIGH — readable by JS, sent over HTTP, sent cross-site
setcookie( 'session', $token, time() + 3600 );
```

**Fix:**

```php
setcookie( 'myplugin_session', $token, [
    'expires'  => time() + 3600,
    'path'     => COOKIEPATH ?: '/',
    'domain'   => COOKIE_DOMAIN ?: '',
    'secure'   => is_ssl(),
    'httponly' => true,
    'samesite' => 'Lax', // or 'Strict' for sensitive flows
] );
```

For WP's own auth, **don't roll your own**: use `wp_set_auth_cookie()` so core
owns session tokens, expiry, and its Secure/HttpOnly cookie behavior. Do not
claim that it explicitly sets SameSite: WordPress 7.0.1's auth-cookie calls do
not pass a SameSite attribute.

`SameSite=None` requires `Secure`. Also ensure `is_ssl()` is correct behind a
TLS-terminating reverse proxy; that is a hosting configuration concern, not a
reason for a plugin to guess or trust arbitrary forwarded headers.

Flag: any `setcookie` storing a token, session ID, or user identifier
without `secure` (when `is_ssl()`) and `httponly`.

### 5. Secrets in logs and debug output

```php
// MEDIUM — secrets in error_log, often shipped to log aggregators
error_log( 'API request: ' . print_r( $request, true ) ); // includes auth header
var_dump( $_SERVER ); // HTTP_AUTHORIZATION leaks
WP_CLI::log( "Token: $token" );
```

Flag:
- `error_log`, `var_dump`, `print_r`, `var_export` over variables
  named `*token*`, `*key*`, `*secret*`, `*password*`, `*auth*`,
  `$_SERVER`, full request bodies, or response objects with auth
  headers.
- `WP_DEBUG_LOG` enabled in production code path (not a check, but
  warn if `define( 'WP_DEBUG_LOG', true )` appears in plugin code —
  shouldn't be set by a plugin).

**Fix:** redact before logging:

```php
$safe = $request;
unset( $safe['headers']['Authorization'] );
$safe['body'] = '<redacted>';
error_log( wp_json_encode( $safe ) );
```

### 6. Storing API keys: option vs constant

Both are common — guidance:

- **Constant in `wp-config.php`**: best for site-owner-managed,
  rarely-changed secrets. Not in DB, not in repo, only readable by
  PHP. Document this in plugin readme.
- **Option (`update_option`)**: needed when the plugin offers a
  settings page. Acceptable, but:
  - Mark the option `autoload = false` if not needed every request.
  - Restrict the setting page to `manage_options`.
  - Don't `wp_send_json` or echo the option value back to non-admins.
- **User meta**: only for per-user tokens (e.g. user's own GitHub
  PAT). Never for site-wide secrets.

Flag: site-wide secrets stored in user meta, or settings pages
without a capability check.

### 7. Token comparison

Cross-reference with `wp-security-deep` check #8: any secret
comparison must use `hash_equals( $stored, (string) $given )`. Never
`==` or `===`.

## Severity guide

- **HIGH:** hardcoded secret in source, weak randomness for password
  reset / session token, password stored with md5/sha1, missing
  HttpOnly on session cookie.
- **MEDIUM:** secrets logged, cookie missing SameSite, weak randomness
  for non-secret IDs that gain meaning later.
- **LOW:** API key in option without `autoload = false`, no rotation
  story documented.

## Report format

Same as `wp-security-audit`. If hardcoded secrets are found, the
report MUST include a top-line warning recommending:

1. Revoke the leaked credential at the issuing service immediately.
2. Rotate to a new secret.
3. Rewrite git history to remove the secret (`git filter-repo` or
   BFG) — or accept that the secret is permanently compromised in
   the repo.
4. Move to `wp-config.php` constant or settings option.

State this even when the user only asked for a code review — leaked
secrets need real-world action, not just a code change.

## Cross-references

- **`wp-security-audit`**: basic sanitize/escape/nonce/capability.
- **`wp-security-deep`**: object injection, SSRF, CSRF on GET, mass
  assignment, file include, mail/zip injection, type juggling, race.

## What this skill does NOT cover

- Cryptographic protocol design (key derivation, signing schemes,
  envelope encryption).
- Secret scanning of git history (use `gitleaks`, `trufflehog`).
- Secret rotation processes / KMS integrations.
- Hardware token / 2FA flow correctness beyond storage.

## References

- PHP password hashing:
  https://www.php.net/manual/en/function.password-hash.php
- `random_bytes`:
  https://www.php.net/manual/en/function.random-bytes.php
- `wp_generate_password`:
  https://developer.wordpress.org/reference/functions/wp_generate_password/
- OWASP secret management:
  https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
