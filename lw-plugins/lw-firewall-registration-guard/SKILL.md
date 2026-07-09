---
name: lw-firewall-registration-guard
description: Integrate custom WordPress registration forms with LW Firewall's registration spam protection. Use when code renders or validates custom signup forms, AJAX/REST registration endpoints, Woo/CRM/LMS registration flows, or files referencing `RegisterGuard::render_fields`, `RegisterGuard::validate`, `RegisterToken::issue`, `RegisterToken::verify`, `lw_fw_reg_token`, `lw_fw_url`, `registration_errors`, honeypot fields, proof-of-render tokens, single-use tokens, or spam auto-ban behavior.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-firewall
plugin-version-tested: "1.3.2"
php-min: "8.1"
last-updated: "2026-07-09"
docs:
  - https://github.com/lwplugins/lw-firewall
source-refs:
  - wp-content/plugins/lw-firewall/includes/Plugin.php
  - wp-content/plugins/lw-firewall/includes/Rules/RegisterGuard.php
  - wp-content/plugins/lw-firewall/includes/Rules/RegisterToken.php
  - wp-content/plugins/lw-firewall/includes/Rules/RegisterTracker.php
  - wp-content/plugins/lw-firewall/includes/Rules/AutoBanner.php
  - wp-content/plugins/lw-firewall/includes/Options.php
  - wp-content/plugins/lw-firewall/includes/helpers.php
  - wp-content/plugins/lw-firewall/tests/register-token-test.php
  - wp-content/plugins/lw-firewall/CHANGELOG.md
---

# LW Firewall: registration spam guard

Use this when a plugin/theme renders its own registration form and still wants
LW Firewall's proof-of-render token, honeypot, single-use replay protection, and
rejected-registration auto-ban.

LW Firewall automatically protects only the default WordPress registration form
via `register_form` and `registration_errors`, and only when `users_can_register`
is enabled. Custom forms must opt in.

## Core contract

Verified field names:

| Field | Purpose |
|---|---|
| `lw_fw_reg_token` | signed HMAC proof-of-render token |
| `lw_fw_url` | honeypot text field; must stay empty |

Verified public methods:

| Method | Use |
|---|---|
| `LightweightPlugins\Firewall\Rules\RegisterGuard::render_fields()` | echo hidden token and optional honeypot |
| `LightweightPlugins\Firewall\Rules\RegisterGuard::validate( WP_Error $errors )` | validate current `$_POST`, record reject, add generic error |
| `LightweightPlugins\Firewall\Rules\RegisterToken::issue()` | issue token for headless/custom rendering |
| `LightweightPlugins\Firewall\Rules\RegisterToken::verify()` | verify token manually |
| `LightweightPlugins\Firewall\Rules\RegisterTracker::record_reject()` | count reject and auto-ban after threshold |

Do not call private methods or edit `worker/lw-firewall-worker.php`.

## Preferred integration

If the form is server-rendered PHP, render fields directly inside the form:

```php
use LightweightPlugins\Firewall\Rules\RegisterGuard;

if ( class_exists( RegisterGuard::class ) ) {
	RegisterGuard::render_fields();
}
```

Then validate before creating the user:

```php
use LightweightPlugins\Firewall\Rules\RegisterGuard;

$errors = new WP_Error();

if ( class_exists( RegisterGuard::class ) ) {
	$errors = RegisterGuard::validate( $errors );
}

if ( $errors->has_errors() ) {
	return $errors;
}

// Create the user only after the guard passes.
```

This path keeps the plugin's own behavior intact: honeypot check, token age
check, optional single-use storage, reject counting, whitelist skip, and auto-ban
through the shared firewall ban store.

## Headless or REST form

If the form is not rendered by PHP output, issue the token server-side and send
it in the response that renders the form:

```php
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\RegisterToken;

$payload['lwFirewall'] = [
	'enabled'   => class_exists( RegisterToken::class ),
	'token'     => class_exists( RegisterToken::class ) ? RegisterToken::issue() : '',
	'tokenName' => 'lw_fw_reg_token',
	'honeyName' => 'lw_fw_url',
	'honeypot'  => (bool) Options::get( 'register_honeypot', true ),
];
```

Render the honeypot as a hidden/off-screen text input and submit both fields
with the registration request. Do not create a public "give me a token" endpoint
that can be spammed independently from the form render.

## Manual validation

Use manual validation only when `RegisterGuard::validate()` cannot fit the
handler shape:

```php
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\RegisterToken;
use LightweightPlugins\Firewall\Rules\RegisterTracker;

$honeypot = isset( $_POST['lw_fw_url'] )
	? sanitize_text_field( wp_unslash( $_POST['lw_fw_url'] ) )
	: '';

if ( Options::get( 'register_honeypot', true ) && '' !== $honeypot ) {
	RegisterTracker::record_reject();
	return new WP_Error( 'lw_fw_spam', __( 'Registration failed, please try again.', 'text-domain' ) );
}

$token = isset( $_POST['lw_fw_reg_token'] )
	? sanitize_text_field( wp_unslash( $_POST['lw_fw_reg_token'] ) )
	: '';

$storage = null;
if ( Options::get( 'register_single_use', true ) && function_exists( 'lw_firewall_resolve_storage' ) ) {
	$storage = lw_firewall_resolve_storage( (string) Options::get( 'storage', 'auto' ) );
}

$ok = RegisterToken::verify(
	$token,
	(int) Options::get( 'register_min_fill_time', 2 ),
	(int) Options::get( 'register_token_max_age', 3600 ),
	$storage
);

if ( ! $ok ) {
	RegisterTracker::record_reject();
	return new WP_Error( 'lw_fw_spam', __( 'Registration failed, please try again.', 'text-domain' ) );
}
```

Use a generic error. Do not tell bots whether the honeypot, token age, expiry, or
single-use check failed.

## Important behavior

- Missing token is spam.
- Filled honeypot is spam when `register_honeypot` is enabled.
- Token age lower than `register_min_fill_time` is spam.
- Token age higher than `register_token_max_age` is spam.
- Reused token is spam when `register_single_use` is enabled.
- `RegisterTracker::record_reject()` skips whitelisted IPs.
- After `register_ban_threshold` rejects, the IP is banned for `register_ban_duration`.
- Auto-ban is written to the same storage used by the MU-plugin worker, so later
  requests are blocked before WordPress fully loads.

## Checklist

- Render the guard fields inside every custom registration form.
- Preserve both fields through AJAX/REST serialization.
- Validate before calling `wp_insert_user()`, `wp_create_user()`, Woo customer
  creation, CRM contact creation, or LMS enrollment.
- Keep normal CSRF nonce/capability checks; LW Firewall token is anti-spam, not a WordPress nonce.
- Test too-fast submit, expired token, reused token, filled honeypot, and valid submit.
- Confirm whether your custom form should respect `users_can_register`; LW
  Firewall's automatic core hook does.

## Cross-references

- Run `wp-security-audit` for nonce/sanitization/escaping checks around the form.
- Run `lw-firewall-rate-limit-worker` when the endpoint also needs rate limiting.
- Run `wp-rest-api` if the form submits through a REST route.

## What this skill does NOT cover

- Captcha provider integration.
- Non-registration contact-form spam.
- Editing LW Firewall internals or the MU-plugin worker.
