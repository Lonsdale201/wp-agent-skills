# dev-tooling

Skills for the **testing & quality-assurance tooling** around a WordPress plugin or theme — not WordPress runtime APIs, but the developer pipeline you run beside the code: PHPUnit, PHP_CodeSniffer / WordPress Coding Standards, and PHPStan, wired through Composer and CI.

These are deliberately WordPress-specific: the value is in the WP test suite (`WP_UnitTestCase`, factories, the test DB), the WordPress Coding Standards rulesets, and the WordPress PHPStan stubs — not generic PHP tutorials. They are also **version-sensitive** (PHPUnit, WPCS 3.x, PHPStan 2.x move fast), so each skill pins the tested versions and prefers a "verify against your installed version" stance over hard-coding a number that ages.

## Skills

| Skill | Purpose |
|---|---|
| `wp-phpunit-test-setup` | Stand up the test harness: `wp scaffold plugin-tests` / `theme-tests` and the files it emits, `install-wp-tests.sh` (curl-based, no SVN) + the throwaway test DB, the **PHPUnit-9.x ceiling** of the WP core suite and `yoast/phpunit-polyfills`, composer `require-dev` / scripts, a GitHub Actions PHP×WP matrix with `shivammathur/setup-php`, and the modern `wp-env` / `wp-phpunit` alternatives. |
| `wp-phpunit-writing-tests` | Write the tests: `WP_UnitTestCase` and its snake_case `set_up()` / `tear_down()` (and why), per-test DB rollback, the factory system, WP assertions, HTTP mocking via `pre_http_request`, data providers / groups, and the key distinction that `WP_UnitTestCase` is an **integration** test while true unit tests use **Brain Monkey** or **WP_Mock**. Bundled `reference.md` has full runnable integration, Brain Monkey, and WP_Mock examples. |
| `wp-phpcs-coding-standards` | Lint with PHP_CodeSniffer + WordPress Coding Standards + PHPCompatibility: the exact (confusingly-named) composer packages and `allow-plugins` config, the `phpcs.xml.dist` ruleset (`WordPress` / `-Core` / `-Extra` / `-Docs`, `prefixes`, `text_domain`, `minimum_wp_version`, `testVersion`), `phpcs` (check) vs `phpcbf` (auto-fix), scoped `phpcs:ignore`, and the WPCS 2.x→3.x breaking renames. |
| `wp-phpstan-static-analysis` | Type/logic analysis with `szepeviktor/phpstan-wordpress`: the composer deps and what's pulled transitively, `phpstan/extension-installer`, the `phpstan.neon` config (levels 0–10 / `max`, the manual `extension.neon` include), why WordPress needs stubs and how to add WooCommerce stubs, the `--generate-baseline` workflow for legacy code, and the WP false positives the extension already fixes. |
