---
name: lw-firewall-password-reset-protection
description: Integrate, configure, or audit LW Firewall's password-reset flood protection across core WordPress, WooCommerce, custom lost-password forms, REST handlers, administrator recovery, proof tokens, per-IP/account/global limits, alerts, and reset auto-bans. Use when code references `lostpassword_post`, `lostpassword_form`, `allow_password_reset`, `PasswordResetGuard`, `ResetLimiter`, `ResetPenalty`, `reset_*` options, `retrieve_password`, reset email floods, reset honeypots, `lw_fw_reset_token`, or `wp lw-firewall reset`.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-firewall"
  wp-skills-plugin-version-tested: "1.5.6"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-08-29"
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
| `allow_password_reset` | optionally refuse every privileged account when `reset_block_admins` is on |

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
`count > max`. A maximum of zero disables that axis. The target uses user ID, so
login, case variants resolved by WordPress, and email share a bucket.

**Evaluation order changed in 1.5.6:** `ResetLimiter::record()` now charges
**IP → target account → site-wide**, so the hourly email cap is charged last and
only by a request that has cleared everything else. Charging it first let
refused requests drain it: a flood against one account could exhaust the quota
and deny password resets to every other user until the window rolled over.
`record_rejected()` charges the sender's IP allowance only — bot traffic still
earns its own ban but no longer spends the target's allowance or the site's
email budget.

`PasswordResetGuard` returns immediately when core/Woo has already put an error
on the `WP_Error`, so unknown/empty accounts are not counted by this guard.

The site-wide counter is still a request budget rather than a count of emails
actually sent, but the 1.5.4 denial-of-service edge is closed: a request refused
on the IP or target axis no longer charges it.

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

## Verified v1.5.6 constraints

Fixed since this skill's 1.5.4 grounding — do not re-report these:

- **The proof token is now form-bound and per-render.** `RegisterToken` signs a
  per-render nonce and a scope into the payload, so tokens minted in the same
  second are no longer identical (a shared page cache used to hand one token to
  every visitor, and single-use rejected all but the first), and a token issued
  by one form can no longer be presented to another. `verify()` and `check()`
  take the scope as their fifth argument — pass the same scope you issued with.
- **The site-wide counter is charged last** (see above), so failed-proof and
  target-refused traffic no longer drains it.
- **`reset_block_admins` covers every privileged account**, not just the
  `administrator` role slug: multisite super admins and any custom role holding
  `manage_options` are included.
- **A reset ban is enforced whenever the firewall is on.** The worker's
  shared-ban lookup is no longer gated on `auto_ban_enabled` /
  `login_limit_enabled`, so `reset_auto_ban` alone now produces a real block.

Still true in 1.5.6:

- The honeypot checks only for a non-empty value; an omitted field is accepted.
- The proof token is enforced only on `wp-login.php`, because
  `lostpassword_form` is the only place it is rendered. Woo, custom and REST
  reset paths get the rate limits but no LW proof check.
- `reset_block_admins` answers differently for a privileged account, which
  allows administrator enumeration. Upstream lists this as known and not fixed:
  closing it needs the same generic-response handling as lost-password user
  enumeration.

Regression-test these around any companion behavior.

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
- Test same-second tokens and single-use replay on `wp-login.php`, and assert a
  reset-scope token is refused by the registration form (and vice versa).
- Verify that an indexed reset ban is actually enforced and removable.
- Assert that failed-proof and target-refused traffic does NOT charge
  `reset_all` — that ordering is the 1.5.6 fix and is easy to regress.
- Test `reset_block_admins` against a multisite super admin and a custom role
  holding `manage_options`, not only the `administrator` slug.

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
