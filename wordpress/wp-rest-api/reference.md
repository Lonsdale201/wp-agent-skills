# WordPress REST API deep reference

Read this file when the main checklist is insufficient: dispatch/authentication
debugging, controller/resource design, collections and pagination,
`register_rest_field()`, parameter-source conflicts, or smoke testing.

## Contents

- [Dispatch and permission semantics](#dispatch-and-permission-semantics)
- [Argument schema behavior](#argument-schema-behavior)
- [Parameter-source precedence](#parameter-source-precedence)
- [Authentication matrix](#authentication-matrix)
- [Controllers, collections, and pagination](#controllers-collections-and-pagination)
- [`register_rest_field()` and response fields](#register_rest_field-and-response-fields)
- [Errors and response contracts](#errors-and-response-contracts)
- [Focused smoke tests](#focused-smoke-tests)
- [Core source map](#core-source-map)

## Dispatch and permission semantics

Use the following execution model for WordPress 7.0.1:

1. `WP_REST_Server::serve_request()` calls `check_authentication()`.
2. Authentication filters may set the current user or return `WP_Error`.
3. `dispatch()` matches the route and endpoint method.
4. `WP_REST_Request::has_valid_params()` checks JSON parsing, required args,
   registered validation callbacks, and any endpoint-level validator.
5. `WP_REST_Request::sanitize_params()` sanitizes every registered parameter
   occurrence in the request sources.
6. `respond_to_request()` calls a non-empty `permission_callback`.
7. The main callback runs only if no prior error exists.
8. `WP_Error` is converted and other results pass through
   `rest_ensure_response()`.

`register_rest_route()` checks for the presence of `permission_callback` only
to emit `_doing_it_wrong()`. It still registers the endpoint. During dispatch,
an empty/missing permission callback is skipped.

When a callback is present, core denies only when it returns:

- exact `false`;
- exact `null`; or
- `WP_Error`.

Other values, including `0`, `''`, and an empty array, are not denial values.
Require callbacks to return explicit booleans or `WP_Error`.

Do not mutate state in a permission callback. `rest_send_allow_header()` can
call permission callbacks again after dispatch to determine which methods to
advertise. A permission check must tolerate repeated execution.

## Argument schema behavior

Each endpoint's `args` map applies to parameters of the same name found in URL,
query, JSON, or form-body sources. Core does not reject unknown parameters.

Use these rules:

- `required => true` rejects a missing parameter unless a default supplies it.
- `validate_callback` runs before `sanitize_callback`.
- If `type` is present and `sanitize_callback` is absent,
  `WP_REST_Request::sanitize_params()` selects `rest_parse_request_arg()`.
- `rest_parse_request_arg()` validates against the registered schema and then
  sanitizes against that schema.
- A custom `sanitize_callback` disables that fallback. Add
  `validate_callback => rest_validate_request_arg` or a custom validator when
  schema constraints must still be enforced.
- WordPress implements a subset of JSON Schema Draft 4, not arbitrary modern
  JSON Schema keywords.

Keep validation pure. It executes for anonymous requests before endpoint
permission and may execute once for each source containing the parameter.
Perform ownership checks, remote requests, expensive queries, uniqueness
checks, writes, and atomic reservations after authorization.

For object payloads, declare nested `properties` and normally set
`additionalProperties => false` when the contract should reject unknown keys.
Even then, copy validated allowlisted fields into the write model rather than
mass-assigning the request.

## Parameter-source precedence

`WP_REST_Request::get_param()` and array access use this default priority:

1. JSON body, when the content type is JSON;
2. form body for `POST`, `PUT`, `PATCH`, or `DELETE`;
3. query string;
4. URL/route captures;
5. registered defaults.

This request can therefore match `/items/7` while `get_param( 'id' )` returns
`9` if the JSON body contains `{ "id": 9 }`.

For a route identity, use:

```php
$url_params = $request->get_url_params();
$item_id    = (int) ( $url_params['id'] ?? 0 );
```

For query and body contracts, use their source-specific accessors when source
matters. If merged access is intentional, prohibit duplicate names across
sources or test and document precedence. Ensure the permission callback and
main callback consume the same canonical identifier.

## Authentication matrix

| Client/authentication | Core behavior | Endpoint responsibility |
|---|---|---|
| Anonymous | Current user is normally ID 0 | Public intent or denial |
| Logged-in browser cookie + valid REST nonce | Core authenticates the cookie user | Capability/object authorization |
| Logged-in browser cookie, no REST nonce | Core resets current user to ID 0 for REST | Public intent or denial |
| Cookie + invalid REST nonce | Core returns `rest_cookie_invalid_nonce` 403 | None; callback does not run |
| Application Password over HTTPS | Core authenticates the application user | Capability/object authorization |
| Custom OAuth/JWT/signature plugin | Plugin-specific auth filter/middleware | Verify plugin contract and authorization |

The REST nonce action is `wp_rest`. Core accepts `_wpnonce` or `X-WP-Nonce` and
returns a refreshed `X-WP-Nonce` header after successful cookie authentication.

When the WordPress script registry prints `wp-api-fetch`, core adds
`createNonceMiddleware()` and the REST root middleware. This is not the same as
the legacy `wpApiSettings` localization used by `wp-api-request`/`wp-api`.
External npm bundles do not automatically inherit server-generated inline data.

CORS is a browser transport policy, not authentication or authorization.
Changing `Access-Control-Allow-Origin` does not make a public endpoint private.

## Controllers, collections, and pagination

Use `WP_REST_Controller` when a resource has collection, item, create, update,
and delete operations. Override only supported methods and their permission
checks. Keep route registration, schema, database preparation, response
preparation, and permission methods separate.

Useful base helpers include:

- `get_collection_params()` for `context`, `page`, `per_page`, and `search`;
- `get_endpoint_args_for_item_schema()` for create/update args derived from the
  item schema;
- `prepare_response_for_collection()` for compact item data and links;
- `filter_response_by_context()` for schema-context filtering;
- `add_additional_fields_schema()` for registered REST fields.

The base controller supplies parameter definitions, not data access. Implement:

- an allowlist mapping public filter names to safe query arguments;
- `per_page` bounds (core convention: default 10, maximum 100);
- deterministic sorting with a unique tie-breaker to avoid duplicates/skips;
- ownership/status visibility before returning items;
- an explicit total-count policy;
- `X-WP-Total` and `X-WP-TotalPages` when following core collection contracts;
- navigation links when helpful;
- response preparation for every item rather than raw model serialization.

Do not forward arbitrary query parameters into `WP_Query`, `meta_query`,
`tax_query`, `orderby`, SQL fragments, or custom repository filters. Validate
sort/filter enums and cap search length. For large mutable datasets, assess
OFFSET drift and keyset/cursor pagination instead of copying page/OFFSET
mechanically.

Counting can be more expensive than fetching one page. Do not add totals merely
for convention when the client does not need them; document a contract change
if omitting core-style totals.

## `register_rest_field()` and response fields

`register_rest_field()` adds `get_callback`, `update_callback`, and `schema` to
an existing REST object type. It does not accept its own
`permission_callback`; access starts with the parent controller's route
permission.

Apply these rules:

- Always provide a schema. Schema-less fields exist for backward compatibility
  but weaken discovery, context filtering, and write validation.
- Treat schema `context` as response shaping, not authorization.
- Do not expose a sensitive field merely because the parent post/user object is
  readable. Enforce field-specific visibility where the value is produced or
  use a better-suited registered meta/auth contract.
- Before adding `update_callback`, verify the parent update route's capability
  is sufficient for that field. Add a field-specific capability check when it
  is not.
- Keep callbacks free of N+1 queries. Collection responses may execute the field
  callback once per item; prime/cache data or support `_fields` effectively.
- Return `WP_Error` from an update callback on expected failure. Core stops
  processing additional fields when it receives one.
- Prefer `register_post_meta()`, `register_term_meta()`, or other registered meta
  with a complete `show_in_rest` schema when the value is ordinary metadata;
  use `register_rest_field()` for computed or custom-backed fields.

Review `_fields`, `_embed`, and `context` behavior. They affect shape and cost,
but do not create an authorization boundary.

## Errors and response contracts

A `WP_Error` with one error becomes a JSON object with `code`, `message`, and
`data`; the HTTP status is read from `data.status`, defaulting to 500 when no
numeric status exists. Multiple errors add `additional_errors`.

Use stable, namespaced codes that clients can branch on. Do not make clients
parse localized message text. Keep the same code/status/shape across equivalent
failure paths unless hiding object existence requires a deliberate 404 policy.

Use common status meanings consistently:

- 400: malformed or structurally invalid request;
- 401: unauthenticated request requiring authentication;
- 403: authenticated but not authorized, or invalid cookie nonce;
- 404: unavailable/not found under the route's disclosure policy;
- 409: current resource state conflicts with the operation;
- 412: failed conditional request/precondition;
- 422: structurally valid request with semantic field errors;
- 429: explicit rate policy rejected the request;
- 500: unexpected server failure without internal details.

WordPress converts returned `WP_Error`; it does not provide a general exception
contract for arbitrary callback throwables. Convert expected domain failures and
handle unexpected exceptions without leaking internals.

## Focused smoke tests

Use `WP_REST_Request` with `rest_get_server()->dispatch()` for fast in-process
tests. Register test routes on `rest_api_init` in a test bootstrap, then assert:

```php
$request = new WP_REST_Request( 'POST', '/myplugin/v1/items/7' );
$request->set_url_params( array( 'id' => 7 ) );
$request->set_query_params( array( 'id' => 8 ) );
$request->set_body_params( array( 'id' => 9 ) );

// Merged access is 9; URL-specific access is 7.
$this->assertSame( 9, $request->get_param( 'id' ) );
$this->assertSame( 7, $request->get_url_params()['id'] );
```

For every private route, test at least:

1. anonymous request denied;
2. authenticated user without capability denied;
3. authorized owner allowed;
4. authorized user targeting another owner's object denied when required;
5. missing/invalid required args rejected before callback;
6. unknown fields do not reach a mass-assignment sink;
7. repeated write behavior matches the idempotency/conflict contract;
8. maximum `per_page`, search length, and filter enums are enforced.

Also run an actual HTTP test when cookie, CORS, proxy, application password,
file upload, or web-server behavior is relevant; in-process dispatch does not
exercise the full transport stack.

## Core source map

- `wp-includes/rest-api.php`
  - `register_rest_route()` missing-permission notice
  - `rest_cookie_check_errors()` cookie nonce behavior
  - `rest_validate_request_arg()`, `rest_sanitize_request_arg()`,
    `rest_parse_request_arg()`
  - `rest_convert_error_to_response()`
- `wp-includes/rest-api/class-wp-rest-server.php`
  - `serve_request()`, `check_authentication()`, `dispatch()`,
    `respond_to_request()`
- `wp-includes/rest-api/class-wp-rest-request.php`
  - parameter order, validation, sanitization, and source-specific accessors
- `wp-includes/rest-api/endpoints/class-wp-rest-controller.php`
  - controller, collection, schema, and additional-field helpers
- `wp-includes/capabilities.php`
  - meta capability mapping and required object IDs
- `wp-includes/script-loader.php`
  - core `wp-api-fetch` REST root and nonce middleware setup

Official references:

- [Adding custom REST endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/)
- [Routes and endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/routes-and-endpoints/)
- [Controller classes](https://developer.wordpress.org/rest-api/extending-the-rest-api/controller-classes/)
- [REST schema](https://developer.wordpress.org/rest-api/extending-the-rest-api/schema/)
- [REST authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)
