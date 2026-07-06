---
name: br-error-contract
description: >-
  Reference for the standard better-route error envelope —
  every error response has shape {error: {code, message, requestId,
  details}}. Throw ApiException(message, status, errorCode, details)
  inside handlers; better-route's ErrorNormalizer wraps it. Critical
  v0.3.0 normalization — for status >= 500 from non-ApiException
  failures, message is normalized to 'Unexpected error.' and details
  is empty (internal exception class + message NO LONGER leak); for
  status === 400 from non-ApiException, details.exception still
  includes the class name (developer aid for misuse). Common error
  codes — validation_failed (400, fieldErrors), idempotency_key_required
  (400), invalid_token (401), insufficient permissions (403),
  not_found (404), idempotency_conflict / hpos_required / customer_exists
  (409), rate_limited (429), woo_unavailable (503). Use when handlers
  need to throw structured errors, or consumers need to interpret them.
  v0.6.0 adds opt-in OAuth RFC6749 error format via
  ->meta(['error_format' => 'oauth_rfc6749']) and OAuthErrorNormalizer.
  Triggers on ApiException, ErrorNormalizer, OAuthErrorNormalizer,
  error_format, oauth_rfc6749, fromThrowable, error envelope, fieldErrors.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Http/ApiException.php
  - src/Http/ConflictException.php
  - src/Http/PreconditionFailedException.php
  - src/Http/ErrorNormalizer.php
  - src/Http/OAuthErrorNormalizer.php
  - src/Http/ResponseNormalizer.php
  - src/Http/Response.php
  - src/Http/RequestContext.php
  - src/Resource/Resource.php
---

# better-route: Error contract reference

For developers writing handlers that throw structured errors, AND for AI agents / clients interpreting better-route's error responses. Every error in the system flows through `ErrorNormalizer::fromThrowable` and emerges as the same JSON envelope, with v0.3.0+ leak-prevention rules for unhandled exceptions.

0.6.0 adds an opt-in OAuth RFC 6749 style error format for OAuth-like routes. The default better-route envelope remains unchanged.

## Misconception this skill corrects

> "I'll just `throw new \RuntimeException('Database is down')` from my handler and the response will be a generic 500."

Half-true. It IS a 500, but the v0.3.0 normalization at [src/Http/ErrorNormalizer.php:22-24](ErrorNormalizer.php) deliberately scrubs the message:

```php
$message = $throwable instanceof ApiException || $status === 400
    ? ($throwable->getMessage() !== '' ? $throwable->getMessage() : 'Invalid request.')
    : 'Unexpected error.';
```

For non-`ApiException` throwables that produce status >= 500, the consumer sees `"Unexpected error."` regardless of what your exception said. The `details` object is also empty (line 19-21):

```php
$details = $throwable instanceof ApiException
    ? $throwable->details()
    : ($status === 400 ? ['exception' => $throwable::class] : []);
```

Reason: an unhandled `RuntimeException('Connection refused: db.internal:5432 user=app')` would leak internal infrastructure details to the consumer. Pre-v0.3.0 the message and class name leaked; v0.3.0+ scrubs them for 5xx.

For status 400 from non-`ApiException` (typically `\InvalidArgumentException` from your code), `details.exception` still contains the exception class name — a developer aid that helps trace a misuse without leaking 5xx detail.

To control the response, throw `ApiException` instead:

```php
// WRONG — leaks-or-scrubs depending on status
throw new \RuntimeException('Database is down');

// RIGHT — caller-controlled status, code, message, details
throw new \BetterRoute\Http\ApiException(
    message: 'Database temporarily unavailable.',
    status: 503,
    errorCode: 'database_unavailable',
    details: ['retryAfterSeconds' => 30],
);
```

Other AI-prone misconceptions:

- "I'll wrap my handler in try/catch and re-throw with a custom message." Wrong direction — the ErrorNormalizer already does this for you. Just throw `ApiException` and it lands in the response shape correctly.
- "The 400 details.exception field is a security leak." Half-true — it's intentionally exposed for developer-error scenarios (`\InvalidArgumentException` from your handler is a misuse, not a security event). Production consumers shouldn't display it; they're helped by it during integration.
- "The error envelope changes shape per error type." Wrong — every error has the same `{error: {code, message, requestId, details}}` shape. `details` may be empty `{}` or contain structured data; the wrapper is invariant.

## When to use this skill

Trigger when ANY of the following is true:

- A handler throws a custom exception.
- The user asks "how do I return a 4xx error from better-route".
- An AI agent / client needs to parse better-route error responses.
- Reviewing a PR that hand-rolls error responses instead of throwing `ApiException`.
- Triaging "my exception message leaks to the client" / "the response shows 'Unexpected error.' instead of my real message".

## Workflow

### 1. The envelope

Every error response from better-route:

```json
HTTP/1.1 <status>
Content-Type: application/json

{
  "error": {
    "code": "<machine-readable code>",
    "message": "<human-readable message>",
    "requestId": "<request ID for log correlation>",
    "details": { /* may be {} or have structured data */ }
  }
}
```

Verified at [ErrorNormalizer.php:25-37](ErrorNormalizer.php). The wrapper is invariant; `details` content varies.

### 1b. OAuth RFC6749 error format (v0.6.0 opt-in)

OAuth-style endpoints can opt into:

```php
$router->post('/oauth/token', $handler)
    ->meta(['error_format' => 'oauth_rfc6749'])
    ->publicRoute();
```

Error response shape:

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code is invalid."
}
```

Optional `error_uri` can be supplied through `ApiException` details:

```php
throw new ApiException(
    message: 'Authorization code is invalid.',
    status: 400,
    errorCode: 'invalid_grant',
    details: ['error_uri' => 'https://docs.example.com/oauth/errors#invalid_grant']
);
```

Only use this when a client expects RFC 6749 style responses. Do not switch normal application APIs away from the better-route envelope without a compatibility reason.

### 2. Throw ApiException for full control

```php
use \BetterRoute\Http\ApiException;

$router->get('/orders/{id}', function ($ctx) {
    $order = wc_get_order((int) $ctx->params['id']);
    if (!$order) {
        throw new ApiException(
            message: 'Order not found.',
            status: 404,
            errorCode: 'not_found',
            details: ['id' => $ctx->params['id']],
        );
    }

    if ($order->get_status() === 'pending-payment') {
        throw new ApiException(
            message: 'Order is awaiting payment; cannot be retrieved yet.',
            status: 409,
            errorCode: 'order_pending_payment',
            details: ['paymentLink' => $order->get_checkout_payment_url()],
        );
    }

    return Response::ok($this->mapOrder($order));
});
```

The constructor signature: `ApiException(string $message, int $status, string $errorCode, array $details = [])`.

`$message` reaches the consumer verbatim (no scrubbing for ApiException). `$errorCode` is your machine-readable code — clients switch on this, not on the human message. `$details` is for structured supplementary data.

### 3. Common error codes (verified)

| Status | Error code | Source | Meaning |
|---|---|---|---|
| 400 | `validation_failed` | Resource writeSchema | Per-field validation errors. `details.fieldErrors: {field: [msg, ...]}` |
| 400 | `idempotency_key_required` | IdempotencyMiddleware | requireKey: true and no `Idempotency-Key` header |
| 400 | `unknown_parameter` | Query parsers | Query string contains a param not in the allowlist |
| 400 | `invalid_request` | Default for non-ApiException 400 | `details.exception` includes class name |
| 401 | `invalid_token` | Auth middlewares | JWT / bearer token failed verification |
| 403 | (varies) | Permission callbacks | "Sorry, you are not allowed..." (WP default) or your custom message |
| 404 | `not_found` | Resource get / handler | Record doesn't exist |
| 409 | `idempotency_conflict` | IdempotencyMiddleware | Same key, different body (custom store implementations) |
| 409 | `hpos_required` | HposGuard | Order route called when HPOS not active |
| 409 | `customer_exists` | WooCustomerService | POST /customers with existing email |
| 429 | `rate_limited` | RateLimitMiddleware | `details.{limit, remaining, resetAt}` |
| 503 | `woo_unavailable` | Woo route registrar | WooCommerce not active |

### 4. Validation error shape

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Invalid request.",
    "requestId": "req_abc123",
    "details": {
      "fieldErrors": {
        "title": ["is too short"],
        "email": ["must be a valid email address"],
        "price": ["is too small"]
      }
    }
  }
}
```

`fieldErrors` maps each invalid field to a list of error messages (a field can fail multiple rules). Clients render per-field error messages by walking this map.

### 5. Rate-limit error shape

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded.",
    "requestId": "req_abc123",
    "details": {
      "limit": 60,
      "remaining": 0,
      "resetAt": 1714356060
    }
  }
}
```

Plus headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714356060
Retry-After: 45
```

`resetAt` is a Unix timestamp; clients sleep until then before retrying.

### 6. WP_Error normalization

If a handler returns a `WP_Error` instead of throwing, the normalizer at [ErrorNormalizer.php:39-69](ErrorNormalizer.php) wraps it into the same envelope:

```php
return new \WP_Error('my_code', 'My message', ['status' => 422, 'extra' => 'detail']);
```

→

```json
HTTP/1.1 422
{
  "error": {
    "code": "my_code",
    "message": "My message",
    "requestId": "req_abc123",
    "details": { "extra": "detail" }
  }
}
```

The `status` key is extracted; remaining `data` becomes `details`. Mostly for compat with WP REST conventions; new code should throw `ApiException` directly.

### 7. v0.3.0 normalization rules

| Source | Status | Message | Details |
|---|---|---|---|
| `ApiException` (any status) | as-thrown | as-thrown | as-thrown |
| `\InvalidArgumentException` | 400 | as-thrown (or "Invalid request.") | `{exception: "InvalidArgumentException"}` |
| Other throwable, status 400 | 400 | as-thrown | `{exception: <class>}` |
| Other throwable, status >= 500 | 500 | "Unexpected error." | `{}` (scrubbed) |
| `WP_Error` | from `data.status` or 500 | from `get_error_message` | from `data` minus `status` |

Verified at [ErrorNormalizer.php:13-37](ErrorNormalizer.php).

### 8. Client-side handling

```js
async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const json = await res.json();
        const err = json.error || {};
        // Switch on machine code, not human message
        switch (err.code) {
            case 'validation_failed':
                showFieldErrors(err.details.fieldErrors);
                break;
            case 'rate_limited':
                scheduleRetryAt(err.details.resetAt);
                break;
            case 'invalid_token':
                redirectToLogin();
                break;
            default:
                showGenericError(err.message);
        }
        throw new Error(err.message);
    }

    return res.json();
}
```

Always switch on `error.code` (stable contract), not `error.message` (human-readable, may change for i18n).

## Critical rules

- **Throw `ApiException` for caller-controlled errors.** Don't return error responses manually; the normalizer + envelope are the contract.
- **Errors are envelope-shaped: `{error: {code, message, requestId, details}}`** — invariant across status codes.
- **OAuth error shape is opt-in per route (v0.6.0).** Use `->meta(['error_format' => 'oauth_rfc6749'])`; otherwise the normal envelope is used.
- **Status >= 500 from non-ApiException scrubs message + details** (v0.3.0+ leak prevention). Don't rely on `RuntimeException::getMessage` reaching the client.
- **Status === 400 from non-ApiException keeps `details.exception`** as developer aid.
- **`requestId` is for log correlation** — every response (success and error) carries the same request ID. Surface it in client logs.
- **Switch on `error.code`, not `error.message`.** Code is a stable machine-readable identifier; message is i18n-able and may rephrase.
- **`fieldErrors`** is the canonical shape for per-field validation errors. Maps field name → list of error strings.
- **Rate-limit details include `resetAt`** (Unix timestamp). Plus headers — clients can use either.
- **`WP_Error` is normalized identically** for backwards-compat with WP REST conventions.
- **`InvalidArgumentException` becomes 400** automatically — useful for handler input validation.

## Common mistakes

```php
// WRONG — leaking internal details via RuntimeException
$router->get('/foo', function () {
    throw new \RuntimeException(sprintf(
        'Database query failed: %s on %s', $error, $sql
    ));
});
// → 500 with message "Unexpected error." (v0.3.0 scrubs); pre-v0.3 leaked the SQL.

// RIGHT — explicit ApiException with sanitized message
throw new ApiException(
    message: 'Database temporarily unavailable.',
    status: 503,
    errorCode: 'database_unavailable',
);

// WRONG — manual error response
return new Response([
    'success' => false,
    'error' => 'Not found',
], 404);
// Breaks the envelope; clients can't switch on stable .error.code.

// RIGHT — throw, let the normalizer build the envelope
throw new ApiException('Order not found.', 404, 'not_found');

// WRONG — switching client logic on error.message
if (json.error.message === 'Rate limit exceeded.') { /* ... */ }
// Brittle; one i18n change breaks the client.

// RIGHT — switch on code
if (json.error.code === 'rate_limited') { /* ... */ }

// WRONG — assuming validation_failed details is a flat array
{ "details": ["title is required", "price is too small"] }
// → wrong; format is fieldErrors map.

// RIGHT — fieldErrors per field
{ "details": { "fieldErrors": { "title": ["is too short"], "price": ["is too small"] } } }

// WRONG — using HTTP/2 status 422 for validation
throw new ApiException('...', 422, 'validation_failed');
// Better-route's standard for validation is 400. Some clients expect 400 specifically.

// RIGHT — 400 with code 'validation_failed'
throw new ApiException('Invalid request.', 400, 'validation_failed', [
    'fieldErrors' => $errors,
]);

// WRONG — assuming requestId is opaque
const reqId = json.error.requestId;
console.log(reqId);  // 'req_abc123' — fine for logging, not for security claims

// RIGHT — surface in client logs for support correlation
log.error(`API error: ${json.error.message} (request: ${json.error.requestId})`);

// WRONG — relying on details.exception for production logic
if (json.error.details.exception === 'InvalidArgumentException') { /* ... */ }
// Only present for status 400; absent for status 500 (post-v0.3.0). Brittle and reveals impl detail.

// RIGHT — switch on error.code
if (json.error.code === 'invalid_request') { /* ... */ }

// WRONG — caching error responses (stale 404 returned for resources that now exist)
$router->get('/items/{id}', $handler)
    ->middleware([new ETagMiddleware()]);
// Resource not found → 404 with body {error: ...}.
// ETagMiddleware skips non-2xx; OK. But if you cache 404 elsewhere, it persists past creation.

// RIGHT — caching layer should respect status code
```

## Cross-references

- Run **`br-routes`** for handler patterns that throw `ApiException`.
- Run **`br-write-schema`** for the `validation_failed` envelope produced by Resource validation.
- Run **`br-rate-limiting`** for the `rate_limited` envelope and headers.
- Run **`br-routes`** for route metadata patterns such as `->meta(['error_format' => 'oauth_rfc6749'])`.
- Run **`br-idempotency`** for `idempotency_key_required` and `idempotency_conflict`.
- Run **`br-woo-routes`** for Woo-specific codes like `hpos_required`, `customer_exists`, `woo_unavailable`.

## What this skill does NOT cover

- Localization of error messages. Library emits English; consumers translate at the i18n layer.
- Error reporting / monitoring (Sentry, Bugsnag). Hook into `wp_die_handler` or your own exception handler.
- Stack-trace exposure. Never expose to consumers; log on the server side via `error_log` or a logger.
- Custom error envelope shapes. The shape is invariant; if you need a different shape for legacy clients, transform at a proxy layer.
- HTTP/2 vs HTTP/3 status code semantics. Library is status-agnostic.
- WP REST API's own error shape (`code`, `message`, `data` flat). Better-route's normalizer wraps WP_Error into the better-route shape automatically.

## References

- ErrorNormalizer: [libraries/better-route/src/Http/ErrorNormalizer.php:11-37](ErrorNormalizer.php) — `fromThrowable(Throwable, string $requestId): Response`.
- Status / code / details / message mapping: [ErrorNormalizer.php:13-24](ErrorNormalizer.php).
- WP_Error normalization: [ErrorNormalizer.php:39-69](ErrorNormalizer.php) — `fromWpError(object, string)`.
- ApiException: [libraries/better-route/src/Http/ApiException.php](ApiException.php) — `class ApiException extends RuntimeException`. Constructor takes `(message, status, errorCode, details)`.
- ConflictException / PreconditionFailedException: [libraries/better-route/src/Http/ConflictException.php](ConflictException.php), [PreconditionFailedException.php](PreconditionFailedException.php) — typed shortcuts for 409 / 412.
- Validation error helper: [libraries/better-route/src/Resource/Resource.php:1453-1460](Resource.php) — `validationError(fieldErrors): ApiException` for `validation_failed` envelope.
