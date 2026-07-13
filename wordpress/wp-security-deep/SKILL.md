---
name: wp-security-deep
description: Deep security audit for WordPress plugin/theme PHP code,
  covering issues beyond the basic sanitize/escape/nonce checklist —
  PHP object injection (unserialize), SSRF in remote requests, CSRF on
  state-changing GET handlers, mass assignment via $_POST loops,
  insecure file include / template injection, mail header injection,
  ZipSlip in archive extraction, type-juggling in auth comparisons,
  and TOCTOU race patterns in option/meta locks. Use after or
  alongside wp-security-audit when reviewing complex plugins, REST
  APIs, integrations that fetch remote URLs, file processors, or any
  code that handles uploads, archives, or self-rolled auth tokens.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-12"
---

# WordPress security audit — deep checks

Run AFTER `wp-security-audit` covers the basics (sanitize, escape,
nonce, capability, SQL prepare, AJAX nopriv, REST permission). This
skill catches the second-tier issues that static-analysis tools miss
and that a hurried review skips.

## When to use this skill

Trigger when the basic audit is clean but the code does any of:

- Calls `unserialize`, `maybe_unserialize` on stored or transmitted data.
- Calls `wp_remote_*`, `file_get_contents`, `curl_*`, `fopen` with a
  URL that could be influenced by input.
- Has admin pages or AJAX/REST handlers driven by `?action=` GET params
  that perform writes.
- Loops `$_POST` / `$_REQUEST` keys into `update_post_meta`,
  `update_user_meta`, `wp_update_user`, `wp_insert_post`, or similar.
- Includes/requires a path that contains any input-derived component.
- Sends mail with user-controlled `From`, `Cc`, `Bcc`, or custom headers.
- Extracts uploaded archives (`ZipArchive`, `PharData`, `tar`).
- Compares tokens, hashes, or secrets with `==` / `===` instead of
  `hash_equals`.
- Implements its own lock / counter via `get_option` + `update_option`.

## Audit checks

### 1. PHP object injection via unserialize

```php
// HIGH — attacker-controlled serialized payload → gadget chains
$data = unserialize( $_POST['payload'] );
```

Before assigning severity, identify who can write the **raw serialized bytes**,
whether classes and usable gadgets are loaded, and which magic method creates
the security effect. `maybe_unserialize( get_option(...) )` is not automatically
vulnerable; state the required writer instead of assuming either admin-only or
attacker-controlled storage.

Prefer JSON for network/user input. `allowed_classes => false` blocks normal
class instantiation but not huge/deep/cyclic graphs or unsafe later recursion;
also bound bytes, depth/nodes, accepted result type, and traversal.

For nested/double serialization, byte-length corruption, and transformed-key
collisions, apply **`wp-metadata-api`** rather than blind string replacement.

`Phar` deserialization: on **PHP < 8.0**, filesystem functions
(`file_exists`, `is_dir`, `filesize`, `fopen`, etc.) on a path using
the `phar://` stream wrapper would auto-unserialize the archive's
metadata, enabling object-injection gadget chains. PHP 8.0+ removed
this auto-unserialization (RFC: phar_stop_autoloading_metadata) — the
risk now requires an explicit `Phar::getMetadata()` call. So the
finding severity depends on the deployment's minimum PHP version:

- PHP 7.x supported: HIGH if any filesystem function is called with
  user-influenced paths. Strip `phar://` from input.
- PHP 8.0+ only: still flag explicit `Phar::getMetadata()` over
  user-controlled archives, plus any `unserialize()` of binary blobs.

**Fix:** JSON for transport; reject serialized user input when possible; if
legacy parsing is unavoidable, constrain classes, bytes, depth, graph traversal,
and accepted result types; never accept `phar://` from input on PHP 7.x.

### 2. SSRF in outbound requests

```php
// HIGH — internal network probe / cloud metadata exfil
$response = wp_remote_get( $_POST['webhook_url'] );
```

Flag missing exact HTTPS host allowlists, plain `wp_remote_*` on
user-influenced URLs, unbounded timeout/redirect/body size, disabled TLS
verification, and ignored `WP_Error`/HTTP statuses. Use `wp_safe_remote_*` so
core validates the initial URL and redirects. Do not accept a hand-rolled DNS
pre-check as complete protection: it has rebinding/TOCTOU and IPv6 pitfalls.
Arbitrary destinations need infrastructure egress controls as well. Apply the
full **`wp-http-api-client`** skill for implementation and test patterns.

### 3. CSRF on state-changing GET handlers

WP plugins commonly wire admin pages with `?action=delete&id=42`
links. These bypass `check_admin_referer` if the dev only added it
to POST handlers.

```php
// HIGH — GET with side effect, no nonce
if ( isset( $_GET['action'] ) && $_GET['action'] === 'delete' ) {
    delete_post( (int) $_GET['id'] );
}
```

**Rule:** any cookie-authenticated browser handler that writes MUST verify a
nonce regardless of HTTP method. Legacy action links can be built with
`wp_nonce_url( $url, 'delete_post_' . $id )` and verified with
`check_admin_referer( 'delete_post_' . $id )`; prefer POST forms for destructive
new UI. Signed webhooks, CLI, and cron use their own trust boundary rather than
a WordPress nonce.

### 4. Mass assignment

```php
// HIGH — user can set role, status, meta_input, etc.
wp_update_user( $_POST );
wp_insert_post( $_POST );

foreach ( $_POST as $key => $value ) {
    update_user_meta( $user_id, $key, $value );
}
```

**Fix:** explicit allowlist of accepted keys. Never spread
`$_POST` / `$_REQUEST` into a write function whose schema includes
privileged fields (`role`, `user_pass`, `post_status`, `post_author`,
`meta_input`, `tax_input`).

### 5. File include / template injection

```php
// HIGH — RCE
include $template_dir . '/' . $_GET['view'] . '.php';
locate_template( $_GET['t'] . '.php' );
```

**Fix:** allowlist:

```php
$allowed = [ 'list', 'edit', 'settings' ];
$view    = isset( $_GET['view'] ) && in_array( $_GET['view'], $allowed, true )
    ? $_GET['view'] : 'list';
include $template_dir . '/' . $view . '.php';
```

Even with `sanitize_file_name`, `..` and null bytes can survive. Only
allowlist is safe.

### 6. Mail header injection

```php
// HIGH — \r\n injection adds Bcc
wp_mail( 'admin@site.com', 'Hi', $body, "From: " . $_POST['email'] );
```

**Fix:** sanitize email + reject CRLF:

```php
$from = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
if ( ! $from || preg_match( '/[\r\n]/', $from ) ) {
    wp_die( 'Invalid sender', 400 );
}
wp_mail( 'admin@site.com', 'Hi', $body, [ 'From: ' . $from ] );
```

Pass headers as an array, not a concatenated string.

### 7. ZipSlip / archive extraction

```php
// HIGH — extracted file can escape with ../
$zip->extractTo( $target_dir );
```

**Preferred WordPress path:** initialize `WP_Filesystem()` and call core's
`unzip_file()`. Core validates each entry with `validate_file()`, calculates
required space, creates directories through the selected transport, and
returns `true|WP_Error`.

```php
require_once ABSPATH . 'wp-admin/includes/file.php';

if ( ! WP_Filesystem() ) {
    return new WP_Error( 'filesystem_unavailable', 'Filesystem unavailable.' );
}

$result = unzip_file( $archive_file, $target_dir );
if ( is_wp_error( $result ) ) {
    return $result;
}
```

This is not permission to unpack arbitrary uploads into a web-accessible
directory. Before extraction, impose compressed/uncompressed byte limits,
entry-count and extension/type policies; reject executable content when it is
not required. Extract to a fresh, non-public staging directory, inspect the
result, then move only expected regular files. `unzip_file()` skips invalid
paths but does not implement your product's content policy. For non-ZIP
formats or custom extractors, reject absolute/traversal paths, symlinks,
hardlinks, device nodes, and archive bombs, and containment-check every
destination before writing it.

### 8. Timing-safe comparison

```php
// MEDIUM — timing leak + type juggling
if ( $_GET['token'] == $stored_token ) { /* grant */ }

// '0e123...' == '0e456...' is true (scientific notation)
```

**Fix:** `if ( hash_equals( $stored_token, (string) $_GET['token'] ) )`.

Use for: API keys, password reset tokens, signed URLs, any secret
comparison. Not needed for IDs / user-visible values.

### 9. TOCTOU race on options/meta

```php
// MEDIUM — two simultaneous requests both pass the check
if ( ! get_option( 'myplugin_processing' ) ) {
    update_option( 'myplugin_processing', 1 );
    do_expensive_thing();
    update_option( 'myplugin_processing', 0 );
}
```

WP options have no atomic CAS. Mitigations:

- Use a transient with a short TTL only as a soft stampede hint. It is not an
  atomic correctness lock.
- For real exclusion: `$wpdb->query( "SELECT GET_LOCK('myplugin', 0)" )`
  and `RELEASE_LOCK`. MySQL-level, atomic.
- If correctness matters (billing, idempotency), use a unique-key
  insert as the gate: insert fails → another worker is in flight.

Flag the pattern, propose the lock approach. Don't claim certainty
about race windows without dynamic testing.

### 10. Direct file access guard

Top of every PHP file that has side effects on load:

```php
if ( ! defined( 'ABSPATH' ) ) { exit; }
```

Missing guard is LOW unless the file actually executes work at
top-level (most class files are fine). Flag explicitly for files in
`includes/` or `admin/` that do procedural work.

## Severity guide

Same as `wp-security-audit`. Object injection, SSRF on internal
network, RCE via include, ZipSlip → HIGH. CSRF on admin GET
typically HIGH (any logged-in admin clicking a link). TOCTOU,
timing → MEDIUM unless directly exploitable.

## Report format

Reuse the format from `wp-security-audit`. If both skills run, merge
findings into a single report grouped by severity, not by skill.

## Cross-references

- Run **`wp-security-audit`** first for the basic checklist
  (sanitize, escape, nonce, capability, SQL prepare).
- Run **`wp-security-secrets`** for hardcoded credentials, weak
  randomness in tokens, and password-storage issues — these are
  adjacent but distinct findings.
- Run **`wp-batch-mutation-audit`** for durable cursors, lost responses,
  retries, partial failures, and server-side exclusion.

## What this skill does NOT cover

- Cryptographic protocol correctness (custom JWT, signing schemes).
- Business-logic IDOR beyond capability/ownership checks.
- Third-party dependency CVEs (run `composer audit`).
- Batch retry/idempotency analysis beyond surface TOCTOU patterns.
- Server hardening (open_basedir, disable_functions, file perms).

## References

- WP Plugin Security Handbook: https://developer.wordpress.org/plugins/security/
- PHP unserialize advisory: https://www.php.net/manual/en/function.unserialize.php
- Phar metadata RFC (PHP 8.0): https://wiki.php.net/rfc/phar_stop_autoloading_metadata
- WP HTTP API request args: https://developer.wordpress.org/reference/classes/wp_http/request/
- Official documentation: <https://www.php.net/manual/en/function.hash-equals.php>
