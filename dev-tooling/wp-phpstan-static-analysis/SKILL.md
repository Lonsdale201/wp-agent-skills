---
name: wp-phpstan-static-analysis
description: >
  Run PHPStan static analysis on a WordPress plugin or theme using
  `szepeviktor/phpstan-wordpress`. Covers the composer dev-dependencies and what
  is pulled transitively (`phpstan/phpstan` ^2.0, `php-stubs/wordpress-stubs`),
  the optional `phpstan/extension-installer` that auto-registers the extension,
  the `phpstan.neon.dist` config (level 0-10 / `max`, `paths`, the
  `vendor/szepeviktor/phpstan-wordpress/extension.neon` include when not using
  the installer), why WordPress needs stubs, adding WooCommerce stubs
  (`php-stubs/woocommerce-stubs`) for cross-plugin analysis, the
  `--generate-baseline` workflow for legacy code, common WP false positives the
  extension fixes (apply_filters arg counts, is_wp_error narrowing, hook
  callbacks, dynamic constants), and running with `--level` / `--memory-limit`.
  Use when adding static analysis, writing phpstan.neon, raising the level, or
  taming WP-specific PHPStan errors.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "PHPStan 2.x; phpstan-wordpress 2.0.3; wordpress-stubs 6.6+; WP 7.0"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://github.com/szepeviktor/phpstan-wordpress
  - https://phpstan.org/user-guide/rule-levels
  - https://phpstan.org/user-guide/baseline
  - https://github.com/php-stubs/wordpress-stubs
source-refs:
  - https://github.com/szepeviktor/phpstan-wordpress/blob/master/extension.neon
  - https://github.com/szepeviktor/phpstan-wordpress/blob/master/examples/phpstan.neon.dist
  - https://github.com/php-stubs/woocommerce-stubs
  - https://github.com/phpstan/extension-installer
license: GPLv2-or-later
---

# PHPStan static analysis for WordPress

PHPStan catches type errors, dead code, and bad calls without running anything. It doesn't load WordPress, so it needs **stubs** for core's functions/classes — `szepeviktor/phpstan-wordpress` provides those plus WP-aware rules. This skill wires it up and tames the WP-specific noise. PHPCS (`wp-phpcs-coding-standards`) covers style; PHPStan covers types/logic — run both.

## When to use this skill

- Adding static analysis to a plugin/theme.
- Writing or reviewing `phpstan.neon` / `phpstan.neon.dist`.
- Raising the analysis level on existing code (and baselining the backlog).
- Killing WP-specific false positives (`apply_filters` arg counts, `is_wp_error()`, `$wpdb`, conditional constants).

## Install

```bash
composer require --dev szepeviktor/phpstan-wordpress
composer require --dev phpstan/extension-installer   # recommended: auto-registers the extension
```

`szepeviktor/phpstan-wordpress` (2.0.3) pulls in **`phpstan/phpstan` `^2.0`** and **`php-stubs/wordpress-stubs`** transitively — you don't add those yourself. It requires PHPStan 2.0+.

`phpstan/extension-installer` is a Composer plugin that auto-includes any installed `phpstan-extension` package's config, so you don't hand-wire the include. Composer 2.2+ needs it in `allow-plugins`:

```json
{
  "config": {
    "allow-plugins": {
      "phpstan/extension-installer": true
    }
  }
}
```

## Configure (`phpstan.neon.dist`)

**With `extension-installer`**, the config is minimal — the extension auto-registers:

```neon
parameters:
    level: 5
    paths:
        - my-plugin.php
        - includes/
```

**Without `extension-installer`**, include the extension manually (exact path, verified):

```neon
includes:
    - vendor/szepeviktor/phpstan-wordpress/extension.neon
parameters:
    level: max
    paths:
        - my-plugin.php
        - includes/
    ignoreErrors:
        # WP filter functions use func_get_args(); calling with extra args is fine.
        - '#^Function apply_filters(_ref_array)? invoked with [34567] parameters, 2 required\.$#'
```

You normally do **not** set `bootstrapFiles` for WP core — the extension already loads `php-stubs/wordpress-stubs`. Add `bootstrapFiles` only for extra stubs (see WooCommerce below) or your own define-shims.

### Levels

PHPStan has **levels 0–10** (0 loosest, 10 strictest; level 10 was added in PHPStan 2.0). `max` is an alias for the highest. Start where the code passes (often 5), commit that, then raise one level at a time. Don't jump to `max` on a legacy plugin — baseline instead (below).

## Stubs, and cross-plugin analysis

PHPStan can't see WordPress, so `wordpress-stubs` supplies typed, implementation-free declarations of core functions/classes. The package is versioned to the WordPress version it was generated from.

To analyze code that calls **another plugin's** API (e.g. WooCommerce), add that plugin's stubs and register them:

```bash
composer require --dev php-stubs/woocommerce-stubs
```

```neon
parameters:
    bootstrapFiles:
        - vendor/php-stubs/woocommerce-stubs/woocommerce-stubs.php
```

`php-stubs/woocommerce-stubs` depends on `wordpress-stubs`, so WP stubs come along. Without the right stubs, PHPStan reports "unknown function/class" for every external call.

## The baseline workflow (legacy code)

Don't fight thousands of pre-existing errors. Snapshot them and only gate new/changed code:

```bash
vendor/bin/phpstan analyse --generate-baseline
```

This writes `phpstan-baseline.neon` (every current error). Include it:

```neon
includes:
    - phpstan-baseline.neon
```

Now CI is green, but any **new** error fails the build. Over time, fix entries and regenerate a smaller baseline, or raise the level behind the baseline. This is how you adopt PHPStan (or a higher level) on an existing plugin without a giant rewrite.

## WP-specific false positives the extension handles

`phpstan-wordpress` already fixes the usual WordPress noise — don't suppress these by hand:

- **`apply_filters()` "invoked with N parameters, 2 required"** — WP filters use `func_get_args()`; the bundled `ignoreErrors` regex (above) covers it.
- **Loose return types** — dynamic return-type extensions narrow `apply_filters()`, `esc_sql()`, `wp_parse_url()`, `shortcode_atts()`, `wp_slash()`, and more.
- **`is_wp_error()` narrowing** — after `if ( is_wp_error( $x ) )`, PHPStan knows `$x` is a `WP_Error` (vs the success type) in each branch.
- **Hook callbacks** — `HookCallbackRule` validates `add_action()`/`add_filter()` callback signatures; `HookDocsRule` validates the docblocks on `apply_filters()`/`do_action()` calls.
- **WordPress constants** — the extension's `dynamicConstantNames` list (`WP_DEBUG`, `WP_DEBUG_LOG`, `WP_DEBUG_DISPLAY`, `SCRIPT_DEBUG`, `ABSPATH`, `WP_CONTENT_DIR`, `WP_PLUGIN_DIR`, …) plus its `WpConstantFetchRule` tell PHPStan those WordPress constants may be conditionally (re)defined, so it won't wrongly narrow `if ( WP_DEBUG )`-style checks.
- **Early-terminating functions** — `wp_send_json*` and `wp_nonce_ays` are known to end execution, so PHPStan won't flag "undefined variable after" them.

One it can't infer for you: **`global $wpdb;`**. Annotate it where used:

```php
global $wpdb;
/** @var \wpdb $wpdb */
```

## Run it

```bash
vendor/bin/phpstan analyse                       # uses phpstan.neon(.dist)
vendor/bin/phpstan analyse -l 8 includes/        # override level + path
vendor/bin/phpstan analyse --memory-limit 1G     # large plugins + stubs eat RAM
```

Add a composer script so it joins the QA entry point alongside `phpcs`/`phpunit`:

```json
"scripts": {
  "analyze": "phpstan analyse"
}
```

## Critical rules

- **Install `szepeviktor/phpstan-wordpress`** (it brings PHPStan 2.0 + WP stubs) — don't hand-assemble stubs.
- **Use `phpstan/extension-installer`** (and `allow-plugins`) so the extension auto-registers; otherwise add the `extension.neon` include manually.
- **Pick a level the code passes, commit, raise gradually.** `max` on legacy code without a baseline is noise, not signal.
- **Baseline legacy errors** with `--generate-baseline` so only new/changed code is gated.
- **Add the right stubs for cross-plugin calls** (e.g. `php-stubs/woocommerce-stubs`) or every external symbol is "unknown".
- **Don't suppress the known WP patterns by hand** — the extension already handles `apply_filters` arg counts, `is_wp_error()`, hooks, constants. Annotate `global $wpdb` with `/** @var \wpdb $wpdb */`.

## Cross-references

- Run **`wp-phpcs-coding-standards`** for the complementary style/standards gate (PHPCS = style, PHPStan = types/logic).
- Run **`wp-phpunit-test-setup`** to add PHPStan to the same composer scripts and CI matrix.
- Run **`wp-plugin-architecture`** when PHPStan findings point at structural issues (untyped boundaries, god objects).
- Run **`wp-security-audit`** — PHPStan catches type bugs, not security ones; pair them.

## References

- phpstan-wordpress: <https://github.com/szepeviktor/phpstan-wordpress>
- Rule levels: <https://phpstan.org/user-guide/rule-levels>
- The baseline: <https://phpstan.org/user-guide/baseline>
- WordPress stubs: <https://github.com/php-stubs/wordpress-stubs>
- WooCommerce stubs: <https://github.com/php-stubs/woocommerce-stubs>
- Extension installer: <https://github.com/phpstan/extension-installer>
