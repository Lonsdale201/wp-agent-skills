---
name: wp-rest-api
description: Scaffold and audit inbound custom WordPress REST API endpoints
  registered with register_rest_route on rest_api_init. Covers explicit
  permission_callback intent, public-route review, object-level authorization,
  public telemetry/beacon abuse budgets, request-source precedence,
  args/JSON Schema validation and sanitization,
  WP_REST_Controller resources, bounded pagination and filters,
  WP_REST_Response/WP_Error contracts, register_rest_field, cookie auth with
  X-WP-Nonce, and REST vs admin-ajax decisions. Use for endpoint implementation,
  security review, 401/403 debugging, headless APIs, or admin-ajax migration.
  Trigger on register_rest_route, permission_callback, WP_REST_Request,
  WP_REST_Controller, register_rest_field, rest_ensure_response, or X-WP-Nonce;
  do not trigger merely for outbound wp_remote_* integrations.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-15"
---

# WordPress REST API: scaffold, review, secure

Use this skill for inbound REST endpoints. Prefer REST for new, versioned
plugin APIs and external clients. Keep outbound HTTP integrations in
`wp-http-api-client` and use `admin-ajax` only for a concrete legacy or
WP-admin-specific reason.

Read [reference.md](reference.md) for dispatch/auth debugging, controllers,
collections, `register_rest_field()`, and edge-case verification.

## Core execution model

Apply this order when reviewing behavior:

1. Core authentication handlers establish the current user or return an auth error.
2. `WP_REST_Server` matches `(namespace, route, method)`.
3. Core checks required args, validates registered args, then sanitizes them.
4. Core calls the endpoint's `permission_callback`.
5. Core calls the main `callback` only when permission succeeds.
6. Core converts `WP_Error` and other supported return values into a REST response.

Validation and sanitization therefore run before endpoint authorization. Keep
their callbacks cheap, deterministic, read-only, and safe for anonymous traffic.

## Review workflow

1. Inventory all inbound REST surfaces:

   ```bash
   rg -n "register_rest_route|register_rest_field|rest_api_init|WP_REST_Controller" .
   ```

2. Build a route matrix with namespace, path, method, callback, public/private
   intent, `permission_callback`, accepted args, and response fields.
3. Trace every security-sensitive identifier from its exact request source into
   the permission check and the write/read operation. Confirm both use the same
   value.
4. Trace declared and undeclared input into SQL, metadata, options, filesystem,
   HTTP, email, and object update calls. Reject mass assignment.
5. Verify output field allowlists, context, pagination bounds, and stable filters.
6. Test anonymous, low-privilege, authorized, invalid-input, not-found, and
   cross-object access cases. Confirm `GET`/`HEAD` are side-effect free; for
   writes, test method semantics and replay/retry behavior where relevant.
7. Report each finding with severity, route/method, file and line, exploit or
   failure path, evidence, and the smallest correct remediation. Separate
   confirmed exposure from defense-in-depth advice.

Treat unauthenticated privileged writes or sensitive reads as high/critical.
Treat missing object-level authorization, unbounded collections, mass assignment,
and cross-source identifier confusion as security findings, not style issues.

## Minimal endpoint scaffold

```php
add_action( 'rest_api_init', static function (): void {
    register_rest_route(
        'myplugin/v1',
        '/items/(?P<id>\d+)',
        array(
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => 'myplugin_get_item',
            'permission_callback' => static function ( WP_REST_Request $request ) {
                $url_params = $request->get_url_params();
                $post_id    = (int) ( $url_params['id'] ?? 0 );

                return current_user_can( 'read_post', $post_id );
            },
            'args'                => array(
                'id' => array(
                    'required' => true,
                    'type'     => 'integer',
                    'minimum'  => 1,
                ),
            ),
        )
    );
} );

/**
 * @return WP_REST_Response|WP_Error
 */
function myplugin_get_item( WP_REST_Request $request ) {
    $url_params = $request->get_url_params();
    $post_id    = (int) ( $url_params['id'] ?? 0 );
    $post       = get_post( $post_id );

    if ( ! $post ) {
        return new WP_Error(
            'myplugin_not_found',
            __( 'Item not found.', 'myplugin' ),
            array( 'status' => 404 )
        );
    }

    return rest_ensure_response(
        array(
            'id'    => $post->ID,
            'title' => get_the_title( $post ),
        )
    );
}
```

The exact-source lookup is intentional. Do not replace it with `$request['id']`
or `get_param( 'id' )` for an object identifier; merged body/query values have
higher priority than the URL value.

## Security and correctness rules

### Require explicit permission intent

Specify `permission_callback` for every endpoint. Since WordPress 5.5, omitting
it emits `_doing_it_wrong()`, but registration and dispatch continue. Missing or
empty permission callbacks are skipped, so the route is open at the endpoint
permission layer unless another layer or the main callback denies it.

- Use `__return_true` for a deliberately public route. It is not a vulnerability
  by itself.
- Never use unconditional public permission for a privileged write or sensitive
  read.
- Check object-level meta capabilities with the target ID:

  ```php
  current_user_can( 'edit_post', $post_id );
  current_user_can( 'edit_user', $user_id );
  ```

- Return `true`, `false`, `null`, or `WP_Error`. Core denies only exact `false`,
  `null`, or `WP_Error`; falsey values such as `0`, `''`, or `array()` can grant
  access. Prefer explicit `true` or a namespaced `WP_Error`.
- Keep permission callbacks read-only and idempotent. Core may call them again
  while generating the `Allow` header.
- Treat authentication and authorization separately. A valid REST nonce proves
  the cookie-authenticated request; it does not grant a capability.

For a public form, login, webhook, or callback route, verify the complete abuse
policy: bounded input, rate/resource limits, signature or token rules where
applicable, replay handling, and non-enumerating responses.

### Audit public telemetry and ingestion routes as resource APIs

An analytics beacon can be intentionally public and still expose an IDOR or
denial-of-service primitive. Review the complete per-request work budget, not
only `permission_callback`.

- Bound raw body bytes before expensive decoding where the application can do
  so; also enforce infrastructure/WAF limits because PHP receives the request
  after the web server.
- Give every nested string/number/array a schema. Use `maxLength`, numeric
  bounds, `maxItems`, accepted keys, and a custom depth/node budget when core's
  schema cannot express it. A 1–2 MiB JSON cap is usually far too generous for
  a beacon that should contain a few metrics.
- Count fan-out through hooks: dimension get-or-create queries, inserts per
  array element, goal evaluation, email, and outbound HTTP all belong to the
  anonymous request's cost. Queue slow or retriable remote delivery.
- Do not accept a sequential record ID as proof that an anonymous client owns
  the record. Return an opaque random/signed token or bind the record to a
  server-resolved session, then update with both resource and owner predicates
  such as `WHERE id = ? AND session_id = ?`.
- Rate-limit and quota by a proxy-safe identity, but keep storage and fan-out
  bounded even when attackers rotate IPs/cookies. Rate limiting is not a
  substitute for ownership or idempotency.
- Return deterministic `400`, `413`, `422`, and `429` errors. Malformed JSON or
  a scalar root must not fall through into PHP warnings/5xx responses.

Test cross-session record updates, replayed tokens, maximum and maximum+1 array
sizes, oversized/deep bodies, concurrent first beacons, and repeated requests
with outbound integrations enabled. Assert a documented upper bound on local
queries/writes and zero synchronous third-party calls on the public hot path.

### Declare and enforce the input contract

Declare every accepted URL, query, and body parameter in `args`. Undeclared
parameters are not stripped and remain readable from the request, so never pass
`get_params()` or an arbitrary JSON object directly into a model/update API.

```php
'args' => array(
    'email' => array(
        'required'          => true,
        'type'              => 'string',
        'format'            => 'email',
        'validate_callback' => 'rest_validate_request_arg',
        'sanitize_callback' => 'sanitize_email',
    ),
    'role' => array(
        'type'    => 'string',
        'enum'    => array( 'subscriber', 'contributor', 'author' ),
        'default' => 'subscriber',
    ),
    'count' => array(
        'type'    => 'integer',
        'minimum' => 1,
        'maximum' => 100,
    ),
),
```

When `type` exists and no custom `sanitize_callback` is set, core defaults to
`rest_parse_request_arg()`, which validates the registered schema and sanitizes
the value. A custom sanitizer replaces that fallback. Pair it with
`validate_callback => rest_validate_request_arg` or a custom validator, or
constraints such as `minimum`, `maximum`, `enum`, and `format` may not run.

Validation proves shape; sanitization normalizes data. Neither replaces
`$wpdb->prepare()`, capability checks, output policy, or business validation.

### Read from the intended parameter source

Use source-specific accessors for identifiers and security decisions:

- route capture: `$request->get_url_params()`
- query string: `$request->get_query_params()`
- JSON body: `$request->get_json_params()`
- form body: `$request->get_body_params()`
- uploaded files: `$request->get_file_params()`

`get_param()` and array access merge sources in this priority: JSON, form body,
query string, URL, defaults. Never authorize one source and mutate another.

### Return REST-native responses and errors

Return supported data or `WP_REST_Response` on success and `WP_Error` on
expected failure. Prefer explicit response objects when setting status, headers,
or links.

```php
return rest_ensure_response( $data );
return new WP_REST_Response( $data, 201, array( 'Location' => $location ) );
return new WP_Error( 'myplugin_invalid', '...', array( 'status' => 422 ) );
```

Do not call `wp_send_json_*()` in REST callbacks; it terminates execution and
bypasses normal REST response handling. Do not expose exception messages,
stack traces, SQL, paths, secrets, or internal class names in 5xx responses.

### Shape output explicitly

Do not expose unreviewed database rows, model objects, or metadata blobs.
Allowlist response fields and evaluate personal/sensitive data per route and
context. An email address is not safe merely because it was intentionally
selected. Escape values when a client renders them into HTML; do not HTML-escape
ordinary JSON data indiscriminately on the server.

### Use cookie authentication correctly

Cookie-authenticated browser requests need `_wpnonce` or `X-WP-Nonce` generated
for `wp_rest`. Without a nonce, core treats cookie auth as anonymous; an invalid
nonce returns `rest_cookie_invalid_nonce` with 403.

When WordPress enqueues its registered `wp-api-fetch` script, core installs the
REST nonce middleware automatically, including on the front end. A decoupled
bundle importing `@wordpress/api-fetch` from npm must configure nonce middleware
itself or use another authentication scheme. Application Passwords authenticate
external HTTPS requests but still require endpoint authorization; never ship
application credentials in public browser code.

### Use controllers for resource APIs

For several related collection/item routes, extend `WP_REST_Controller` instead
of duplicating registration, permission, schema, and response methods. Core
provides parameter helpers, not the actual query/filter/pagination behavior.
See [reference.md](reference.md#controllers-collections-and-pagination).

Use a unique versioned namespace such as `myplugin/v1`; add `v2` instead of
breaking an existing public contract in place.

## False-positive guards

- Do not report `__return_true` as a vulnerability without proving the route
  should be private or the public operation lacks necessary abuse controls.
- Do not treat a nonce as a substitute for capability/object authorization.
- Do not call a missing `permission_callback` exploitable until tracing global
  filters and callback-internal checks; still report the fail-open registration
  pattern because tooling cannot enforce the intended policy.
- Do not report validation errors returned before permission as an auth bypass;
  assess separately whether they leak sensitive schema/state or enable expensive
  anonymous work.
- Do not assume `401` versus `403` inconsistency: core normally returns 401 for
  unauthenticated denial and 403 for an authenticated but unauthorized user.
- Do not label an explicitly mapped database row unsafe without identifying a
  sensitive or unintended field. Report unreviewed broad exposure and its data.

## Cross-references

- Run `wp-security-audit` for the surrounding nonce, capability, input, SQL,
  filesystem, redirect, and output checks.
- Run `wp-security-secrets` for credentials, token issuance, or custom authentication.
- Run `wp-database-performance-audit` for large collections, count queries,
  OFFSET scaling, N+1 queries, caching, or direct database access.

## Out of scope

Do not design custom JWT/OAuth/signature protocols, complete CORS/WAF/proxy
policy, distributed rate limiting, or OpenAPI generation here. Do not audit
core-owned `wp/v2` contracts unless plugin code changes them.

## References

- Official documentation: <https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/>
- Official documentation: <https://developer.wordpress.org/reference/functions/register_rest_route/>
- Official documentation: <https://developer.wordpress.org/rest-api/extending-the-rest-api/controller-classes/>
- Official documentation: <https://developer.wordpress.org/rest-api/extending-the-rest-api/schema/>
- Official documentation: <https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/>
- Verified source paths:
  - `wp-includes/rest-api.php`
  - `wp-includes/rest-api/class-wp-rest-server.php`
  - `wp-includes/rest-api/class-wp-rest-request.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-controller.php`
  - `wp-includes/script-loader.php`
  - `wp-includes/capabilities.php`
