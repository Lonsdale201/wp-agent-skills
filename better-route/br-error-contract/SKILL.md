---
name: br-error-contract
description: Produce and consume better-route 1.1 structured errors. Use for ApiException, Response, ErrorNormalizer, ResponseNormalizer, WP_Error conversion, OAuth RFC 6749 error_format, status/code/details/headers, Retry-After, validation_failed, idempotency/rate/optimistic-lock/Woo errors, leak prevention, or invalid response/header diagnostics. In 1.1 ApiException and Response validate status and headers, and WP_Error details are allowlisted.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/Http/ApiException.php
  - src/Http/ErrorNormalizer.php
  - src/Http/OAuthErrorNormalizer.php
  - src/Http/ResponseNormalizer.php
  - src/Http/Response.php
---

# better-route: error contract

Throw `ApiException` for deliberate caller-visible failures. Let unexpected throwables be scrubbed.

```php
use BetterRoute\Http\ApiException;

throw new ApiException(
    message: 'Order is temporarily locked.',
    status: 409,
    errorCode: 'order_locked',
    details: ['orderId' => $id],
    headers: ['Retry-After' => '5'],
);
```

The default envelope is:

```json
{
  "error": {
    "code": "order_locked",
    "message": "Order is temporarily locked.",
    "requestId": "req_...",
    "details": {"orderId": 42}
  }
}
```

Clients should branch on `error.code`, not message text.

## Normalization

| Source | Status/code/message/details |
|---|---|
| `ApiException` | Uses intentional values and headers. |
| `InvalidArgumentException` | `400 invalid_request`, `Invalid request.`, empty details. |
| Other throwable | `500 internal_error`, `Unexpected error.`, empty details. |
| `WP_Error` | Uses its code/message and valid `data.status`; details expose only allowlisted `data.params`. |

Unexpected exception class names and raw messages never reach the caller. Log internally; do not convert an unexpected exception to `ApiException` with its raw message.

`WP_Error` messages remain caller-visible for compatibility. Do not put SQL, paths, secrets, or debug data in a returned `WP_Error` message. Arbitrary error data is intentionally not copied into `details`; only the core REST validation `params` map is allowed.

## 1.1 validation

`ApiException` requires:

- status 400–599;
- non-empty error code matching `[A-Za-z0-9._:-]+`;
- valid HTTP header token names;
- header values without CR/LF.

`Response` accepts status 100–599 and applies the same header-name/value validation. Invalid configuration throws `InvalidArgumentException` before any header is emitted.

Use the fifth `headers` constructor argument for error metadata such as rate-limit headers. Do not call `header()` directly in a handler.

## OAuth error format

Opt in per route only when the client requires RFC 6749 shape:

```php
$router->post('/oauth/token', $handler)
    ->publicRoute()
    ->meta(['error_format' => 'oauth_rfc6749']);
```

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code is invalid."
}
```

Set `details.error_uri` to emit `error_uri`. Set `details.requestId` to boolean `true` to emit `request_id`; it is not included by default in OAuth format. ApiException headers are preserved.

## Common codes

- `400 validation_failed` with `details.fieldErrors`
- `400 unknown_parameter`
- `400 idempotency_key_required` / `idempotency_key_invalid`
- `401 invalid_token` / `invalid_signature`
- `403 insufficient_scope` / `forbidden` / `cors_origin_denied`
- `404 not_found`
- `409 idempotency_conflict` / `idempotency_in_progress`
- `409 coupon_exists` / `woo_line_items_locked` / `version_unavailable`
- `412 optimistic_lock_failed` or `precondition_failed`
- `428 precondition_required`
- `429 rate_limited` with `Retry-After` and `X-RateLimit-*`
- `503 hpos_required` / `woo_unavailable`

## Handler pattern

```php
$router->get('/orders/(?P<id>\d+)', static function ($request): array {
    $id = (int) $request->get_param('id');
    $order = wc_get_order($id);

    if (!$order) {
        throw new ApiException('Order not found.', 404, 'not_found', ['id' => $id]);
    }

    return ['data' => map_order($order)];
})->permission(static fn (): bool => current_user_can('manage_woocommerce'));
```

Do not return an ad hoc `['success' => false]` response; it bypasses the stable envelope. A returned `WP_REST_Response` is passed through, so its body is your responsibility.

## Review checklist

- Use ApiException only for sanitized caller-facing failures.
- Keep unexpected throwable details server-side.
- Validate clients against error codes and tolerate added detail keys.
- Never expect arbitrary WP_Error data in details.
- Assert 429 headers survive through WordPress and CORS exposure.
- Test OAuth and default formats independently.
- Reject response/error header injection in custom code.

## Related skills

- Use `br-write-schema` for validation detail shape.
- Use `br-rate-limiting`, `br-idempotency`, and `br-optimistic-locking` for subsystem errors.
