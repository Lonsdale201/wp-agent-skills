---
name: lw-firewall-registration-guard
description: Integrate custom WordPress registration forms and signup REST endpoints with LW Firewall's registration honeypot, signed timing token, single-use storage, rejection tracking, and rate limiting. Use when code creates users outside the core `wp-login.php?action=register` flow or references `RegisterGuard`, `RegisterToken`, `RegisterTracker`, `lw_fw_reg_token`, `lw_fw_url`, `registration_errors`, `wp_insert_user`, public registration REST routes, proof-of-render, honeypots, replay protection, or registration auto-bans.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.4"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-27"
---

# LW Firewall registration guard

Use this skill when a companion plugin owns the signup UI or transport. LW
Firewall automatically wires only the core WordPress registration form; a
custom PHP, AJAX, headless, WooCommerce, CRM, LMS, or REST flow must opt in.

Read [registration-and-rest-integration.md](references/registration-and-rest-integration.md)
before implementing a JSON endpoint or copying the manual validation adapter.

## Automatic coverage boundary

The plugin registers `RegisterGuard` only when all of these are true:

- the MU worker is installed and matches `LW_FIREWALL_VERSION`;
- the master `enabled` option is true;
- `register_protect_enabled` is true;
- WordPress `users_can_register` is true.

It then hooks `register_form` for rendering and `registration_errors` for
validation. A custom route that calls `wp_insert_user()` does not pass through
this guard automatically. Decide separately whether the custom product should
honour `users_can_register`.

## Verified public surface

| Contract | Current behavior |
|---|---|
| `RegisterGuard::render_fields()` | Echoes `lw_fw_reg_token` and, when enabled, `lw_fw_url` |
| `RegisterGuard::validate( WP_Error )` | Reads the current `$_POST`, records rejection, adds a generic error |
| `RegisterToken::issue()` | Returns a signed timestamp token |
| `RegisterToken::verify( $token, $min, $max, $storage, $scope )` | Checks signature, age and optional atomic single use |
| `RegisterTracker::record_reject()` | Counts non-whitelisted rejected registrations and may write a shared ban |

`RegisterGuard`'s field constants and spam predicate are private. Do not call
private methods or edit the copied MU worker.

## Classic server-rendered form

Respect the plugin settings because `render_fields()` and `validate()` do not
self-check the master or registration toggles:

```php
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\RegisterGuard;

$lw_guard_enabled = class_exists(RegisterGuard::class)
    && class_exists(Options::class)
    && (bool) Options::get('enabled', true)
    && (bool) Options::get('register_protect_enabled', true);

if ($lw_guard_enabled) {
    RegisterGuard::render_fields();
}
```

Before creating the user:

```php
$errors = new WP_Error();

if ($lw_guard_enabled) {
    $errors = RegisterGuard::validate($errors);
}

if ($errors->has_errors()) {
    return $errors;
}

// Validate the remaining business fields, then create the user.
```

This convenience path is valid only when the request data is in `$_POST`.

## REST and headless registration

`RegisterGuard::validate()` does not read `WP_REST_Request`; a JSON body can
therefore fail even when it contains the fields. Extract request parameters and
call `RegisterToken::verify()` manually, using the fixed registration scope
`reg` and `RegisterTracker::record_reject()` on failure. The reference contains
a transport-independent implementation.

Mint a token as part of the form/bootstrap response or through a narrowly
rate-limited bootstrap route. The token endpoint is public by necessity for an
anonymous signup and is not an authentication boundary.

`protect_rest_api` is only a shared per-IP rate limiter for URLs containing
`/wp-json/`. It does not validate signup fields, authorize user creation, or
target registration routes specifically. WordPress core's `wp/v2/users` create
route requires `create_users`; a deliberately public custom registration route
must implement its own permission policy and abuse controls. In v1.5.4 the
bare `/wp-json` index and alternate `?rest_route=/...` URL form are not detected
by the worker.

## Security meaning of the token

Keep normal CSRF, capability, authentication, validation, email-verification,
and account-policy checks. The LW token is an anti-automation signal, not a
WordPress nonce and not proof that a human submitted the form.

In v1.5.4 the signed payload contains only the issue timestamp:

- it is not bound to form ID, route, user, IP, field name, or `$scope`;
- `$scope` changes only the single-use storage key;
- tokens issued in the same second are identical;
- with single use enabled, two legitimate same-scope forms rendered in the
  same second collide and the second submit is rejected;
- a token accepted in one scope can also be accepted once in another scope;
- the honeypot rejects a non-empty value, but an omitted honeypot is treated as
  empty.

Treat these as verified 1.5.4 constraints. Do not describe the token as
form-bound or unforgeable proof of user interaction.

## Auto-ban caveat in 1.5.4

`RegisterTracker` writes `ban_<ip>` after `register_ban_threshold` failures.
The MU worker currently checks shared ban keys only when either
`auto_ban_enabled` or `login_limit_enabled` is on. A registration-only default
configuration can therefore list a `register_spam` ban without enforcing it on
the next request. Do not promise site-wide blocking without testing the actual
settings and worker behavior.

## Review checklist

- Feature-detect LW Firewall and define fail-open or fail-closed behavior.
- Respect `enabled` and `register_protect_enabled` in custom rendering and validation.
- Use `RegisterGuard` only for form-encoded `$_POST`; adapt JSON explicitly.
- Validate the guard before every user/customer/contact/enrollment write.
- Keep field names server-owned and return one generic signup failure.
- Add route-local rate limiting; the global REST toggle is coarse and optional.
- Test valid, missing, filled honeypot, too-fast, expired, replayed, and two
  same-second token submissions.
- Test `/wp-json/`, bare `/wp-json`, and `?rest_route=` transports separately.
- Verify that a recorded registration ban is actually enforced.

## Cross-references

- Use `lw-firewall-custom-form-adapter` for non-registration forms.
- Use `lw-firewall-rate-limit-worker` for worker detection and local counters.
- Use `lw-firewall-password-reset-protection` for lost-password flows.
- Use `wp-rest-api` for route permissions, schemas, authentication, and errors.

## References

- Official project: <https://github.com/lwplugins/lw-firewall>
- Verified plugin-root-relative sources:
  - `lw-firewall.php`
  - `includes/Plugin.php`
  - `includes/Options.php`
  - `includes/Rules/RegisterGuard.php`
  - `includes/Rules/RegisterToken.php`
  - `includes/Rules/RegisterTracker.php`
  - `includes/Rules/AutoBanner.php`
  - `worker/lw-firewall-worker.php`
  - `CHANGELOG.md`
