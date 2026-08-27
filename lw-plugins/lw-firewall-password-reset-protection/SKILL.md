---
name: lw-firewall-password-reset-protection
description: Integrate, configure, or audit LW Firewall's password-reset flood protection across core WordPress, WooCommerce, custom lost-password forms, REST handlers, administrator recovery, proof tokens, per-IP/account/global limits, alerts, and reset auto-bans. Use when code references `lostpassword_post`, `lostpassword_form`, `allow_password_reset`, `PasswordResetGuard`, `ResetLimiter`, `ResetPenalty`, `reset_*` options, `retrieve_password`, reset email floods, reset honeypots, `lw_fw_reset_token`, or `wp lw-firewall reset`.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.4"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-27"
---

# LW Firewall password-reset protection

LW Firewall 1.5.1 added a reset-specific guard. Use this skill before changing
a lost-password form, calling `retrieve_password()` from a custom transport, or
tuning the reset limits.

## Activation and hook boundary

The reset guard initializes only when the MU worker is current, master
`enabled` is true, and `reset_protect_enabled` is true. It registers:

| Hook | Role |
|---|---|
| `lostpassword_form` | render `lw_fw_reset_token` and `lw_fw_confirm_url` on core `wp-login.php` |
| `lostpassword_post` | apply proof decision and three rate-limit axes before mail |
| `allow_password_reset` | optionally refuse the `administrator` role when `reset_block_admins` is on |

Core `retrieve_password()` and WooCommerce's account implementation both fire
`lostpassword_post` with `WP_Error` and `WP_User|false`, so their valid-account
requests share the rate limits. A custom form is covered only if its execution
path fires that hook with the expected objects, normally by calling the
canonical reset flow. Direct calls to `get_password_reset_key()` or custom mail
code bypass it.

## Proof versus rate-limit coverage

The proof token and honeypot are enforced only when `$GLOBALS['pagenow']` is
`wp-login.php`, because only `lostpassword_form` receives the fields. The
WooCommerce form, custom templates, AJAX, and REST requests receive rate-limit
protection but no LW proof check.

Do not copy the private field constants or call private `proof_ok()` as an
integration API. Use `lw-firewall-custom-form-adapter` if the custom UI needs a
token/honeypot layer, and record that this is companion-owned behavior rather
than automatic reset-guard coverage.

## Three counters

`ResetLimiter::record()` checks and increments in this order:

| Axis | Defaults | Key | Meaning |
|---|---:|---|---|
| IP | 5 per 900 seconds | `reset_ip_<ip>` | one requester |
| Global | 30 per hour | `reset_all` | all attempts that reach this axis, including some later-refused attempts |
| Target account | 3 per 3600 seconds | `reset_user_<user-id>` | one known account |

The first `max` attempts pass; the next is rejected because the comparison is
`count > max`. A maximum of zero disables that axis. IP short-circuits global
and target; global short-circuits target. The target uses user ID, so login,
case variants resolved by WordPress, and email share a bucket.

`PasswordResetGuard` returns immediately when core/Woo has already put an error
on the `WP_Error`, so unknown/empty accounts are not counted by this guard.

The global counter is incremented before the target-account counter. Once one
known account is over its target limit, later distributed attempts for that
account still consume the global allowance before returning `user`. After the
global maximum, the verdict changes to `global` and resets for every account
are refused. Therefore the current counter is not the documented count of
emails actually sent; treat it as a site-wide request budget with a distributed
denial-of-service edge.

## Exemptions and refusal behavior

Every reset check is bypassed for:

- WP-CLI;
- a currently authenticated user with `edit_users`;
- an IP matching `ip_whitelist`.

This keeps the Users-screen administrative reset action working. It also means
an authenticated REST request with `edit_users` is intentionally exempt.

Per-IP and failed-proof verdicts may trigger `reset_auto_ban`; account and
global limits never ban the last requester. Alerts use the Alerts-tab recipient
policy and are throttled once per verdict per hour. Public messages remain
generic within the proof/rate categories.

## Verified v1.5.4 constraints

- Reset and registration use the same timestamp-only `RegisterToken` format.
  The `reset` argument namespaces only the single-use key; it is not signed into
  the token and does not bind the token to the reset form.
- Tokens minted in the same second are identical. Two reset forms rendered in
  that second collide when single use is enabled.
- The honeypot checks only for a non-empty value; an omitted field is accepted.
- A failed proof is passed through the IP/global limiter before its verdict is
  overwritten to `spam`. Distributed valid-account spam can therefore consume
  the global allowance even though those failed-proof requests send no email.
- Requests already destined for a `user` refusal also increment the global
  counter first. Repeating one known target across enough IPs can exhaust the
  site-wide allowance after only the first target-limited emails were sent.
- A reset ban is enforced by the worker only when `auto_ban_enabled` or
  `login_limit_enabled` is also true; `reset_auto_ban` alone does not enable the
  worker's shared-ban lookup.

Treat these as current implementation facts and regression-test them around any
companion behavior. Do not advertise the token as form-bound human proof.

## Configuration and operations

```bash
wp lw-firewall reset status --format=json
wp lw-firewall reset on --proof --auto-ban --alert
wp lw-firewall reset on --block-admins
wp lw-firewall reset off
```

Important options:

```text
reset_protect_enabled
reset_ip_max / reset_ip_window
reset_user_max / reset_user_window
reset_global_max
reset_proof_enabled
reset_min_fill_time / reset_token_max_age / reset_single_use
reset_auto_ban / reset_ban_duration
reset_alert_enabled
reset_block_admins
```

`reset_block_admins` can lock the only administrator out of self-service reset.
Require a tested WP-CLI or second-administrator recovery path before enabling
it. `reset off` preserves the other values.

## Companion-form checklist

- Call the canonical `retrieve_password()` path; do not reproduce email/key logic.
- Confirm that `lostpassword_post` runs once and receives the expected objects.
- Do not assume Woo/custom/REST forms receive the LW token or honeypot.
- Keep anti-enumeration behavior consistent with the product's reset policy.
- Test valid account, invalid account, IP/global/target thresholds, and recovery after TTL.
- Test core, WooCommerce, custom POST, REST, privileged admin, CLI, and whitelisted IP.
- Test same-second tokens and single-use replay on `wp-login.php`.
- Verify that an indexed reset ban is actually enforced and removable.
- Test distributed failed-proof traffic against the global allowance.
- Test repeated target-limited traffic from changing IPs and assert how many
  actual emails versus `reset_all` increments occurred.

## Cross-references

- Use `lw-firewall-custom-form-adapter` for a custom proof UI.
- Use `lw-firewall-rate-limit-worker` for shared-ban and REST path behavior.
- Use `lw-firewall-management-abilities` for reset, alert, and ban operations.
- Use `wp-security-deep` for the surrounding reset-key, identity, and
  anti-enumeration security review.

## References

- Official project: <https://github.com/lwplugins/lw-firewall>
- Verified plugin-root-relative sources:
  - `includes/Plugin.php`
  - `includes/Options.php`
  - `includes/Rules/PasswordResetGuard.php`
  - `includes/Rules/ResetLimiter.php`
  - `includes/Rules/ResetPenalty.php`
  - `includes/Rules/RegisterToken.php`
  - `includes/Rules/AutoBanner.php`
  - `includes/CLI/ResetCommand.php`
  - `worker/lw-firewall-worker.php`
  - `docs/management.md`
  - `CHANGELOG.md`
