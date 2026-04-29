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
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.0 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/plugins/security/
  - https://www.php.net/manual/en/function.unserialize.php
  - https://www.php.net/manual/en/function.hash-equals.php
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

Even with `[ 'allowed_classes' => false ]`, prefer `json_decode` for
network/user input. `maybe_unserialize` on `get_option` is generally
safe (admin wrote it), but flag it on user-meta keys that any user
can write (custom registration forms, profile editors).

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

**Fix:** JSON for transport, allowlist classes if unserialize is
unavoidable, never accept `phar://` from input on PHP 7.x.

### 2. SSRF in outbound requests

```php
// HIGH — internal network probe / cloud metadata exfil
$response = wp_remote_get( $_POST['webhook_url'] );
```

**Preferred defense — host allowlist.** If the integration only ever
talks to a known set of hosts (Stripe, Slack, an internal API),
allowlist them:

```php
$url   = esc_url_raw( wp_unslash( $_POST['webhook_url'] ?? '' ) );
$parts = wp_parse_url( $url );

$allowed_hosts = [ 'api.stripe.com', 'hooks.slack.com' ];
if ( empty( $parts['host'] )
     || ! in_array( strtolower( $parts['host'] ), $allowed_hosts, true )
     || ! in_array( $parts['scheme'] ?? '', [ 'https' ], true ) ) {
    wp_die( 'Forbidden host', 403 );
}

$response = wp_remote_post( $url, [
    'timeout'             => 5,
    'redirection'         => 2,
    'reject_unsafe_urls'  => true,
] );
```

**Fallback — generic URL with IP-range filtering.** Only use this when
allowlisting is impossible (e.g. user-submitted webhook URLs). The
naive `gethostbyname()` check is **not enough**: it returns a single
IPv4 A record, missing AAAA records (IPv6 ::1, fc00::/7),
multi-record DNS responses, and post-redirect destinations. A correct
generic check needs:

```php
$host = strtolower( wp_parse_url( $url, PHP_URL_HOST ) );

// Reject literal IPs in private/reserved ranges before DNS
if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
    if ( ! filter_var( $host, FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
        wp_die( 'Forbidden host', 403 );
    }
}

// Resolve ALL records, not just the first A
$records = array_merge(
    dns_get_record( $host, DNS_A )  ?: [],
    dns_get_record( $host, DNS_AAAA ) ?: []
);
foreach ( $records as $r ) {
    $ip = $r['ip'] ?? $r['ipv6'] ?? '';
    if ( ! filter_var( $ip, FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
        wp_die( 'Forbidden host', 403 );
    }
}

$response = wp_remote_get( $url, [
    'timeout'            => 5,
    'redirection'        => 2,
    'reject_unsafe_urls' => true,
] );
```

Even this is incomplete — DNS rebinding can return safe records to
the resolver and unsafe records to the actual fetch. For full
protection you need to resolve once, fetch by IP with a `Host:`
header. WordPress's `reject_unsafe_urls` request arg does some
filtering via the `http_request_host_is_external` /
`http_request_host_is_allowed` filters, but is opt-in and not
sufficient on its own.

Flag when:
- No host allowlist when the integration only needs known endpoints.
- `gethostbyname()`-only check (audit ourselves: this skill's earlier
  versions had this same bug — IPv4-only, single-record, no redirect
  reverification).
- `redirection` not capped (default follows up to 5 — can chain into
  internal services after passing the initial check).
- `timeout` missing — DoS vector.
- `reject_unsafe_urls` not set on user-influenced URLs.

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

**Rule:** any handler that writes MUST verify a nonce regardless of
HTTP method. Action links must be built with `wp_nonce_url(
$url, 'delete_post_' . $id )` and verified with
`check_admin_referer( 'delete_post_' . $id )`.

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

**Fix:** reject suspicious entries explicitly, then containment-check
the resolved path with a trailing separator:

```php
$base_real = realpath( $target_dir );
if ( $base_real === false ) {
    wp_die( 'Invalid target', 500 );
}
$base_with_sep = rtrim( $base_real, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR;

for ( $i = 0; $i < $zip->numFiles; $i++ ) {
    $name = $zip->getNameIndex( $i );

    // Reject obvious traversal / absolute / drive prefixes
    if ( $name === false
         || $name === ''
         || strpos( $name, "\0" ) !== false
         || preg_match( '#(^|[/\\\\])\.\.([/\\\\]|$)#', $name )
         || preg_match( '#^([a-zA-Z]:|/|\\\\)#', $name )
    ) {
        wp_die( 'Malicious archive entry', 400 );
    }

    // Resolve intended target. Note: file does not exist yet, so
    // realpath() returns false — we manually normalize and then
    // require it to be inside $base_with_sep (with the trailing
    // separator, so /base does not pass for /base-evil).
    $candidate = $base_with_sep . $name;
    $normalized = $base_with_sep
        . ltrim( str_replace( '\\', '/', $name ), '/' );

    // After normalization, prefix-check against base+sep.
    if ( strncmp( $normalized, $base_with_sep, strlen( $base_with_sep ) ) !== 0 ) {
        wp_die( 'Archive escape attempt', 400 );
    }
}

// Optionally extract entries one at a time with stream filters that
// also reject symlinks (ZipArchive::extractTo does not honor symlinks
// portably; symlink-bearing archives are a separate audit).
$zip->extractTo( $target_dir );
```

Also: **never use `realpath()` for not-yet-existing paths** — it
returns `false` and the common fallback `$base . '/' . $name` is
exactly the unvalidated string the attacker controls. Always
normalize manually and prefix-check against `base + DIRECTORY_SEPARATOR`.

Reject symlinks, hardlinks, and entries whose archive metadata
indicates non-regular file types if your archive format exposes them.

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

- Use a transient with a short TTL as a soft lock — not perfect, but
  better than the above.
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

## What this skill does NOT cover

- Cryptographic protocol correctness (custom JWT, signing schemes).
- Business-logic IDOR beyond capability/ownership checks.
- Third-party dependency CVEs (run `composer audit`).
- Concurrency analysis beyond surface TOCTOU patterns.
- Server hardening (open_basedir, disable_functions, file perms).

## References

- WP Plugin Security Handbook:
  https://developer.wordpress.org/plugins/security/
- PHP unserialize advisory:
  https://www.php.net/manual/en/function.unserialize.php
- Phar metadata RFC (PHP 8.0): https://wiki.php.net/rfc/phar_stop_autoloading_metadata
- WP HTTP API request args: https://developer.wordpress.org/reference/classes/wp_http/request/
