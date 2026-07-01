---
name: wp-core-baseline
description: >
  Non-negotiable WordPress security, i18n, and coding-standard invariants that
  apply to every plugin/theme PHP task. This is the always-on baseline; when a
  task needs a full pass, the linked skills take over.
scope: global
globs:
  - "**/*.php"
always-apply: false
version: "1.0.0"
last-updated: "2026-07-01"
---

# WordPress core baseline (always-on)

Invariants that hold for every WordPress plugin/theme PHP task, regardless of what was asked. This is not a tutorial — when a task needs depth, defer to the linked skill.

## Security (never skip)

- Escape every dynamic value at the point of output: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()` for allowed HTML. Escape late (on output), not on assignment.
- Sanitize and unslash every request value before use: `wp_unslash()` then a matching `sanitize_*()` on `$_GET` / `$_POST` / `$_REQUEST` / `$_COOKIE` / `$_SERVER`.
- Guard every state-changing action with a nonce **and** a capability check: `check_admin_referer()` / `wp_verify_nonce()` + `current_user_can()`. `is_admin()` is not authorization.
- Use `$wpdb->prepare()` for every query with dynamic values. Never concatenate input into SQL.
- REST: never `'permission_callback' => '__return_true'` on a route that writes. Check capabilities per object.
- Treat `wp_ajax_nopriv_*` and any public endpoint as attacker-reachable.

## Internationalization

- Wrap every user-facing string in a translation function (`__()`, `esc_html__()`, `_e()`, `_x()`) with a single string-literal text domain equal to the plugin/theme slug.
- Never pass a variable or concatenation as the string or the text domain. Use `printf()` / `sprintf()` placeholders (`%s`, `%1$s`).
- Do not call translation functions before `init` (WP 6.7+ warns on early loading).

## Standards & architecture

- Prefix or namespace everything global — functions, classes, hooks, option keys, globals — with a unique plugin prefix.
- Never edit WordPress core or another plugin/theme. Extend through hooks and filters.
- Start every PHP file with an `ABSPATH` guard: `defined( 'ABSPATH' ) || exit;`.
- Load JS/CSS with `wp_enqueue_script()` / `wp_enqueue_style()`, not hardcoded `<script>` / `<link>` tags.

## When depth is needed (defer to skills)

- Security review → `wp-security-audit`, then `wp-security-deep`, `wp-security-secrets`.
- i18n pass → `wp-i18n-audit`.
- Coding standards / CI → `wp-phpcs-coding-standards`.
- REST endpoints → `wp-rest-api`.
