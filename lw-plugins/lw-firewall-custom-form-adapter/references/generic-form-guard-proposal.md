# Proposed generic form-guard contract

This is an upstream design proposal for a future LW Firewall release. It is
not part of LW Firewall 1.5.4, and companion plugins must not feature-detect or
call the names below until the plugin ships a documented equivalent.

## Goal and boundary

Let a companion plugin attach LW's honeypot, timing, replay and rate controls
to a public form without depending on fixed field names, `$_POST`, private
methods, registration counters or a particular HTML renderer.

The guard is an abuse-control layer. It must not replace route authorization,
cookie-CSRF protection, schema validation, upload policy, business rules,
idempotency, email verification or a high-assurance challenge where one is
required.

## Registration contract

A companion should register a stable, namespaced form ID during an explicit LW
registration hook:

```php
add_action(
    'lw_firewall_register_form_guards',
    static function (FormGuardRegistry $registry): void {
        $registry->register(
            'myplugin/contact-v1',
            new FormGuardPolicy(
                minimumAge: 2,
                maximumAge: 3600,
                singleUse: true,
                honeypot: true,
                rateLimit: 5,
                rateWindow: 300,
                storageFailure: StorageFailurePolicy::FailOpen,
            )
        );
    }
);
```

The registry must reject an empty/non-namespaced ID, duplicates, unknown policy
keys, invalid enum values and out-of-range integers. Policy is server-owned and
must never be selected from request input.

## Render-neutral issue result

Do not echo markup from the core service. Return an immutable descriptor:

```php
$proof = FormGuard::issue('myplugin/contact-v1');

$proof->tokenField();
$proof->token();
$proof->honeypotField();
$proof->expiresAt();
```

The caller decides whether to render escaped HTML, place the values in a REST
bootstrap response or pass them to a headless client. Anonymous bootstrap
responses must use `Cache-Control: private, no-store`; a single-use proof must
not be shared by a full-page/CDN cache.

## Token payload

Sign a versioned canonical payload containing at least:

```text
version
form_id
issued_at
random_nonce_id
```

Generate at least 128 bits of cryptographic randomness per issue. Bind the
form ID inside the signed payload and derive the replay key from both the form
ID and nonce ID. Do not bind the client IP by default: mobile networks, proxies
and privacy relays can legitimately change it between render and submit.

The current 1.5.4 timestamp-only token is not a suitable wire format for this
API because same-second renders collide and the caller's replay scope is not
signed.

## Transport-neutral validation

Accept caller-supplied data and request context rather than reading `$_POST`:

```php
$result = FormGuard::validate(
    'myplugin/contact-v1',
    $requestData,
    RequestContext::fromWordPressRequest()
);

if (!$result->allowed()) {
    return new WP_Error(
        'myplugin_form_rejected',
        __('The form could not be submitted. Please try again.', 'myplugin'),
        ['status' => $result->retryAfter() ? 429 : 400]
    );
}
```

Require the honeypot field to exist and be empty. Verify signature, exact form
binding, timing and atomic replay before any expensive or irreversible side
effect. Return a typed internal reason (`missing`, `honeypot`, `signature`,
`too_fast`, `expired`, `replay`, `rate_limited`, `storage_unavailable`) plus an
optional retry time; callers should normally expose one generic public error.

## Rate and storage contract

- Keep the form's counter key and window independent from global REST/filter
  buckets and the global `rate_window` option.
- Use one atomic create/increment primitive with consistent TTL semantics on
  APCu, Redis and file storage.
- Namespace backend keys by WordPress installation/network as well as form ID.
- Define the storage-outage policy per form. A public contact form may fail
  open; a high-impact action may choose a controlled fail-closed response.
- Expose backend health so adapters can log degradation without creating a
  write per hostile request.

## Extension hooks

Keep hooks observational or policy-bounded:

```text
lw_firewall_register_form_guards
lw_firewall_form_guard_request_context
lw_firewall_form_guard_result
```

Do not provide a filter that can replace the signed form ID, nonce ID, replay
key or server-owned policy with raw request values. Document callback timing,
argument shapes and whether a hook may change the verdict.

## Compatibility behavior

- The API must be additive; core registration and reset guards keep their
  existing contracts until an explicit migration release.
- Publish a capability/version feature check, not a check for private classes.
- Never call `RegisterTracker` for unrelated forms or record a generic failure
  as `register_spam`.
- Let each transport own its response format; the guard must not print or exit.

## Acceptance tests

1. Two proofs issued in the same second are different and both can succeed.
2. A proof issued for form A fails for form B before consuming either replay key.
3. Missing and filled honeypots fail; a present empty honeypot passes.
4. Too-young, expired, tampered and replayed proofs fail deterministically.
5. Parallel replay attempts yield exactly one success on every backend.
6. The same per-form limit/window behavior is observed on APCu, Redis and file.
7. HTML POST, admin-ajax, pretty REST, `?rest_route=` and headless input all use
   the same validation service without superglobal mutation.
8. Shared-cache responses cannot distribute one proof to several visitors.
9. Missing plugin, disabled master, unavailable storage and backend recovery
   follow the documented policy.
10. Public errors do not reveal which anti-bot check failed.

## Verified 1.5.4 source boundary

- `includes/Rules/RegisterToken.php`
- `includes/Rules/RegisterGuard.php`
- `includes/Rules/PasswordResetGuard.php`
- `includes/Rules/RateLimiter.php`
- `includes/Storage/StorageInterface.php`
- `includes/Options.php`
