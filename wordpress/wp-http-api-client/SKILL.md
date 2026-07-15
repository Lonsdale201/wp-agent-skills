---
name: wp-http-api-client
description: Implement or audit outbound HTTP integrations in WordPress with
  wp_remote_request, wp_safe_remote_get/post/request, bounded timeouts,
  redirects and response sizes, host allowlists, JSON handling, authentication
  redaction, retries, idempotency, streaming downloads, and test hooks. Use
  when a plugin calls an external API, webhook destination, feed, license
  server, OAuth endpoint, remote file, private update service, remote report
  definition, or accepts a URL that WordPress fetches.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-15"
---

# WordPress HTTP API Client

Use the WordPress HTTP API instead of cURL or URL-enabled filesystem calls.
Core selects a transport, verifies TLS by default, follows WordPress proxy and
debug hooks, and returns a consistent `array|WP_Error` contract.

## Pick the request function

| Situation | Function |
|---|---|
| Fixed, plugin-owned URL | `wp_remote_get/post/request()` after an exact host configuration check |
| User/admin-influenced URL | `wp_safe_remote_get/post/request()` |
| Large file download | `download_url()` or `stream => true` with cleanup |
| Inbound webhook | A REST route with signature/replay verification, not an HTTP client call |

The `wp_safe_remote_*` variants set `reject_unsafe_urls` and validate the
initial destination plus redirects with `wp_http_validate_url()`. Prefer them
whenever any part of the URL is configurable.

## A production JSON request

```php
function myplugin_fetch_customer( int $customer_id ) {
    $base  = untrailingslashit( (string) get_option( 'myplugin_api_base' ) );
    $parts = wp_parse_url( $base );

    if ( 'https' !== ( $parts['scheme'] ?? '' )
         || 'api.example.com' !== strtolower( $parts['host'] ?? '' ) ) {
        return new WP_Error( 'myplugin_invalid_api_host', 'Invalid API host.' );
    }

    $response = wp_safe_remote_get(
        $base . '/v1/customers/' . rawurlencode( (string) $customer_id ),
        array(
            'timeout'             => 8,
            'redirection'         => 2,
            'limit_response_size' => 256 * KB_IN_BYTES,
            'headers'             => array(
                'Accept'        => 'application/json',
                'Authorization' => 'Bearer ' . myplugin_get_api_key(),
            ),
        )
    );

    if ( is_wp_error( $response ) ) {
        return new WP_Error(
            'myplugin_api_transport',
            __( 'The remote service could not be reached.', 'myplugin' ),
            array( 'cause' => $response->get_error_code() )
        );
    }

    $status = wp_remote_retrieve_response_code( $response );
    if ( 200 !== $status ) {
        return new WP_Error(
            'myplugin_api_status',
            __( 'The remote service returned an unexpected response.', 'myplugin' ),
            array( 'status' => $status )
        );
    }

    $content_type = (string) wp_remote_retrieve_header( $response, 'content-type' );
    if ( ! str_starts_with( strtolower( $content_type ), 'application/json' ) ) {
        return new WP_Error( 'myplugin_api_content_type', 'Expected JSON.' );
    }

    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $data ) ) {
        return new WP_Error( 'myplugin_api_json', 'Invalid JSON response.' );
    }

    return $data;
}
```

Validate the decoded schema before using values. An HTTP 200 and valid JSON do
not prove the expected fields/types are present.

## Keep executable policy out of remote responses

Classify every response field as data or control-plane input. A fixed HTTPS host
and valid authentication do not justify executing whatever that host returns.

Do not let a response directly provide:

- SQL passed to `$wpdb->query()`, `get_results()`, or a report executor;
- PHP/template content, callback/class names, local paths, or capabilities;
- an unrestricted plugin/theme update package URL;
- a redirect, webhook destination, or secondary download host outside an exact
  semantic allowlist.

Keep report queries and privileged decisions local and versioned. Prefer a small
remote vocabulary such as `report_id`, typed filter values, and feature states;
map the ID to local code after strict schema/enum/range validation. A `SELECT`
prefix check or SQL parser is not a durable sandbox, and read-only intent should
also be enforced with database privilege separation where practical.

For private updates, validate metadata and package hosts independently, recheck
every redirect, and verify a release signature/digest against a separately
trusted key or manifest. TLS protects the channel but does not contain a
compromised vendor. Apply `wp-security-deep` to rate the full SQL/update-to-code
execution chain and its trigger.

## Sending JSON

```php
$response = wp_safe_remote_post( $url, array(
    'timeout'     => 8,
    'redirection' => 0,
    'headers'     => array(
        'Content-Type'  => 'application/json',
        'Accept'        => 'application/json',
        'Authorization' => 'Bearer ' . $token,
        'Idempotency-Key' => $operation_uuid,
    ),
    'body' => wp_json_encode( $payload, JSON_UNESCAPED_SLASHES ),
) );
```

Do not send a PHP array as `body` while declaring JSON; WordPress will otherwise
form-encode it. Check `wp_json_encode()` failure for payloads that can contain
invalid UTF-8.

## SSRF boundary

An exact HTTPS host allowlist is the strongest application-level rule. Match
the parsed host exactly, not with `str_contains()` or an unsafe suffix check
that accepts `api.example.com.attacker.test`. If subdomains are required,
accept the base host or a `.`-delimited suffix and still constrain scheme/port.

`wp_safe_remote_*` blocks many private/reserved destinations and revalidates
redirects, but core URL validation is not a complete defense against every
resolver, IPv6, DNS-rebinding, or hosting-network scenario. For arbitrary
user-selected URLs, combine it with short limits and infrastructure egress
controls/a fixed outbound proxy. Never disable the check through broad
`http_request_host_is_external` or `http_allowed_safe_ports` filters.

## Time, size, and redirect budgets

- Set a short request-specific `timeout`; the default is not a product SLA.
- Cap `redirection`, often at 0 for credential-bearing POSTs and 1-2 for GETs.
- Set `limit_response_size` for bounded text/JSON responses.
- For large files, stream to a temporary file rather than buffering in PHP.
- Treat `blocking => false` as best-effort dispatch, not guaranteed delivery;
  no response body/status is available to prove remote acceptance.
- Move slow/retriable integrations to Action Scheduler, WP-Cron, or a queue
  instead of blocking an admin/front-end request.

## Errors, retries, and idempotency

Always handle both transport failure (`WP_Error`) and HTTP status. Do not leak
raw provider bodies to users; they can contain internals or reflected input.
Log a redacted request ID/status/error code, never Authorization/Cookie headers
or complete personal-data payloads.

Retry only bounded, transient failures such as selected network errors, 429,
and some 5xx responses. Honor `Retry-After` where practical and use backoff with
jitter. Never automatically retry a non-idempotent write unless the provider
supports an idempotency key or the operation has another deduplication gate.

## Credentials and privacy

- Prefer Connectors, environment variables, or `wp-config.php` constants for
  production credentials; DB settings are sometimes required for admin UX.
- Never put secrets in URLs, because URLs leak into logs and caches.
- Require explicit feature/admin intent before spending quota or sending site
  content. A configured site-wide connector is not consent for every plugin.
- Document personal-data transfers and retention; run the privacy skill.

## Downloads and cleanup

`download_url()` uses `wp_safe_remote_get()` and returns a temporary filename
or `WP_Error`. It does not install, validate, or delete the file for you.

```php
require_once ABSPATH . 'wp-admin/includes/file.php';

$tmp = download_url( $url, 30 );
if ( is_wp_error( $tmp ) ) {
    return $tmp;
}

try {
    // Validate extension, real MIME, size, and product-specific content here.
    return myplugin_import_downloaded_file( $tmp );
} finally {
    if ( file_exists( $tmp ) ) {
        wp_delete_file( $tmp );
    }
}
```

Do not infer trust from a remote `Content-Type` or filename. Use the file upload
security skill before sideloading into Media Library.

## Test and observe

- Use `pre_http_request` in tests to return deterministic fake responses.
- Assert timeout, host, headers, body, error/status, malformed JSON, 429/5xx,
  oversized response, redirect, and cleanup behavior.
- Inject syntactically valid but malicious control fields (`sql`, `download_url`,
  callback/path values) and assert they cannot reach an executable sink.
- Use `http_api_debug` only for redacted diagnostics; never dump full requests.
- Do not set `sslverify => false`, including in local examples. Fix CA/proxy
  configuration instead.

## Critical rules

- Use WP HTTP functions; never raw cURL or `file_get_contents( $url )`.
- Use `wp_safe_remote_*` plus an allowlist for configurable destinations.
- Bound timeout, redirects, and response size; handle `WP_Error` and status.
- Keep TLS verification enabled and redact secrets/personal data.
- Retry only when the operation is demonstrably idempotent.
- Validate decoded response structure and downloaded file content.
- Keep executable SQL, update trust, callbacks, and authorization policy local.

## Cross-references

- Use **`wp-security-deep`** for SSRF review.
- Use **`wp-security-secrets`** and **`wp-connectors-api`** for credentials.
- Use **`wp-file-upload-security`** for downloaded/sideloaded files.
- Use **`wp-privacy-personal-data`** for external personal-data transfers.

## Core references

- `wp-includes/http.php`: safe wrappers and URL validation.
- `wp-includes/class-wp-http.php`: request arguments and response contract.
- `wp-admin/includes/file.php`: `download_url()` and temporary-file cleanup.

## References

- Official documentation: <https://developer.wordpress.org/plugins/http-api/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_safe_remote_request/>
- Official documentation: <https://developer.wordpress.org/reference/classes/wp_http/request/>
