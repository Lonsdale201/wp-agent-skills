---
name: lw-firewall-custom-form-adapter
description: Design or audit an LW Firewall adapter for a custom public form that is not the built-in registration or lost-password form, or specify a future generic form-guard extension contract without claiming it already exists. Covers the absence of a generic guard, reusable `RegisterToken` and `RateLimiter` primitives, strict honeypot presence, developer-owned replay scopes, REST/headless transport, shared-cache safety, fail-open policy, and route-local abuse limits. Use for contact, lead, quote, application, custom signup, AJAX, or REST forms mentioning LW Firewall honeypots, timing tokens, proof fields, custom anti-bot adapters, or a generic form-protection API.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.4"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-27"
---

# LW Firewall custom-form adapter

LW Firewall 1.5.4 has dedicated guards for core registration and password
reset. It does not expose a generic “attach this firewall to any form” service,
field descriptor, render/validate interface, or form registry.

Use this skill only when a companion plugin deliberately builds an adapter from
the lower-level public classes. Do not present the adapter as a built-in generic
LW Firewall feature.

## Choose the correct contract

| Form | Current LW integration |
|---|---|
| Core WordPress registration | automatic `RegisterGuard` when its activation conditions pass |
| Custom user registration | use `lw-firewall-registration-guard` |
| Core lost password | automatic proof plus limits |
| Woo/custom lost password using canonical hook | rate limits; proof only on core `wp-login.php` |
| Arbitrary contact/lead/application form | no automatic honeypot or token |
| `/wp-json/` form endpoint | optional shared REST rate bucket only |

Do not invoke `RegisterGuard::validate()` for an unrelated form: it reads fixed
registration fields from `$_POST`, increments registration-specific rejection
counters, and can create a misleading `register_spam` ban.

## Reusable primitives and their limits

`RegisterToken::issue()` and `verify()` are public static methods, and
`RateLimiter` accepts a custom storage key. They are reusable only with a
version-pinned adapter and explicit fallback policy; their class names and
settings remain registration-oriented.

The token in v1.5.4 signs only a timestamp. A developer-provided `$scope` is
used solely in the replay-storage key, not in the signed token. Consequently a
token is not cryptographically bound to the custom form, route, field name,
user, or scope. Tokens minted in one second are identical and can collide under
single-use enforcement.

If form binding, cryptographic randomness, or high-assurance proof is required,
the current primitive is insufficient. Use a purpose-built random, signed,
form-bound protocol or an external challenge; do not hide the limitation behind
an adapter name.

## Minimal adapter pattern

Own the field names and require the honeypot to be present and empty. This is
stricter than the built-in LW guards, where omission is accepted.

```php
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\RegisterToken;

final class MyFormProof
{
    private const TOKEN = 'myplugin_form_proof';
    private const HONEYPOT = 'myplugin_company_url';
    private const SCOPE = 'myplugin_contact_v1';

    public static function issue(): array
    {
        if (!class_exists(RegisterToken::class)
            || !class_exists(Options::class)
            || !(bool) Options::get('enabled', true)
        ) {
            return [];
        }

        return [
            self::TOKEN => RegisterToken::issue(),
            self::HONEYPOT => '',
        ];
    }

    /** @param array<string, mixed> $input */
    public static function validate(array $input): true|WP_Error
    {
        if (!class_exists(RegisterToken::class)
            || !class_exists(Options::class)
            || !function_exists('lw_firewall_resolve_storage')
        ) {
            return true; // Change deliberately if this integration is mandatory.
        }

        if (!(bool) Options::get('enabled', true)) {
            return true;
        }

        if (!array_key_exists(self::HONEYPOT, $input)
            || (string) $input[self::HONEYPOT] !== ''
        ) {
            return self::failure();
        }

        $storage = lw_firewall_resolve_storage((string) Options::get('storage', 'auto'));
        $token = sanitize_text_field((string) ($input[self::TOKEN] ?? ''));
        $valid = RegisterToken::verify($token, 2, 3600, $storage, self::SCOPE);

        return $valid ? true : self::failure();
    }

    private static function failure(): WP_Error
    {
        return new WP_Error(
            'myplugin_form_rejected',
            __('The form could not be submitted. Please try again.', 'myplugin'),
            ['status' => 400]
        );
    }
}
```

`SCOPE` must be a developer-owned constant, never request input. It separates
the atomic replay counter but does not bind the signature. Own timing values in
the companion plugin; borrowing `register_*` options silently couples unrelated
forms to registration policy.

## Rendering and transport

- Server-rendered form: render both fields per response and escape attributes.
- REST/headless: deliver the proof in a private/no-store bootstrap response and
  extract it from `WP_REST_Request`; never use `RegisterGuard::validate()`.
- AJAX: validate before any database, mail, CRM, or remote side effect.
- Full-page/CDN cache: do not cache one single-use token for all visitors.

An anonymous token-mint route is necessarily public. Give it a dedicated rate
limit and do not treat successful minting as authentication or CSRF proof.

## Separate rate limit

The token is not a request-volume control. Use `RateLimiter::is_allowed_key()`
with a form-specific key and `IpDetector::get_ip()`. Return the transport's own
generic 429 contract rather than calling `RateLimiter::too_many()` when a JSON
envelope is required.

The global `protect_rest_api` toggle is shared across all detected `/wp-json/`
traffic, does not recognize `?rest_route=`, and does not know which route
submits this form.

`RateLimiter::is_allowed_key()` overrides the count limit only. Its window
still comes from the global `rate_window` option. A companion that needs an
independent window must call the selected storage's `increment()` with its own
bounded TTL or own a dedicated limiter abstraction.

## Upstream extension proposal

For a first-class LW Firewall feature, do not turn the private, `$_POST`-bound
registration guard into a growing list of form-specific hooks. Add a
transport-neutral form-guard contract with:

- a registered, developer-owned form ID and server-owned policy;
- a random per-render nonce signed together with version, form ID and issue time;
- strict honeypot presence plus emptiness;
- atomic, form-bound replay consumption;
- array/request input instead of direct superglobal reads;
- a structured verdict that callers translate into their own HTML/JSON error;
- independent per-form limit and window settings;
- explicit storage-failure and full-page-cache behavior.

Read [generic-form-guard-proposal.md](references/generic-form-guard-proposal.md)
for the proposed PHP contract, threat boundaries, hooks and acceptance tests.
That document is a design proposal for a later LW Firewall version, not an API
available in 1.5.4.

## Layers the adapter must not replace

- capability/authentication checks for non-public actions;
- CSRF nonce for cookie-authenticated state changes;
- server-side schema, sanitization, and business validation;
- upload controls and output escaping;
- duplicate/idempotency controls for expensive side effects;
- email verification, CAPTCHA/bot scoring, or provider abuse controls where required.

## Test matrix

- Valid, missing, filled, and omitted honeypot.
- Valid, tampered, too-young, expired, and replayed token.
- Two tokens issued in the same second for the same scope.
- Token minted for one adapter and submitted to another scope.
- Shared-cache delivery to multiple anonymous clients.
- Plugin inactive, helper unavailable, master disabled, and chosen fail policy.
- Form-specific rate threshold and atomic concurrency.
- Form-specific window behavior; do not assume the current `RateLimiter` owns it.
- POST, AJAX, pretty REST, and `?rest_route=` where supported.
- One generic public error with no check-specific oracle.

## Cross-references

- Use `lw-firewall-registration-guard` for user creation.
- Use `lw-firewall-password-reset-protection` for lost-password flows.
- Use `lw-firewall-rate-limit-worker` for request detection and local limits.
- Use `wp-rest-api` and `wp-security-audit` for endpoint security.

## References

- Official LW project: <https://github.com/lwplugins/lw-firewall>
- Verified LW plugin-root-relative sources:
  - `includes/Rules/RegisterToken.php`
  - `includes/Rules/RegisterGuard.php`
  - `includes/Rules/PasswordResetGuard.php`
  - `includes/Rules/RateLimiter.php`
  - `includes/Storage/StorageInterface.php`
  - `includes/Options.php`
  - `worker/lw-firewall-worker.php`
