---
name: wp-phpunit-test-setup
description: >
  Set up the PHPUnit test harness for a WordPress plugin or theme, the WP way.
  Covers `wp scaffold plugin-tests` / `wp scaffold theme-tests` and the files it
  generates (`phpunit.xml.dist`, `bin/install-wp-tests.sh`, `tests/bootstrap.php`,
  `tests/test-sample.php`, `.phpcs.xml.dist`, a CI workflow), installing the
  WordPress test suite with `install-wp-tests.sh` (curl-based, no SVN), the test
  database, `yoast/phpunit-polyfills`, the critical fact that the WP core test
  suite is capped at PHPUnit 9.x, composer `require-dev` / scripts wiring, a
  GitHub Actions PHP x WP matrix with `shivammathur/setup-php`, and the modern
  `wp-env` / `wp-phpunit/wp-phpunit` alternatives. Use when adding a test
  harness, wiring CI, or debugging install-wp-tests / bootstrap / PHPUnit-version
  problems. For writing the tests themselves see wp-phpunit-writing-tests.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "WP-CLI scaffold-command 2.x; PHPUnit 9.x; phpunit-polyfills 1.1; WP 7.0"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://make.wordpress.org/core/handbook/testing/automated-testing/
  - https://developer.wordpress.org/cli/commands/scaffold/plugin-tests/
  - https://make.wordpress.org/core/handbook/references/phpunit-compatibility-and-wordpress-versions/
  - https://github.com/Yoast/PHPUnit-Polyfills
source-refs:
  - https://github.com/wp-cli/scaffold-command
  - https://github.com/wp-cli/scaffold-command/blob/main/templates/install-wp-tests.sh
  - https://github.com/wp-cli/scaffold-command/blob/main/templates/plugin-github.mustache
  - https://github.com/WordPress/wordpress-develop
  - https://github.com/wp-phpunit/wp-phpunit
  - https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/
license: GPLv2-or-later
---

# WordPress PHPUnit test setup

Get a real WordPress integration test harness running for a plugin or theme. The fast path is WP-CLI's scaffolder, which generates the same layout WordPress core uses. This skill is the setup + CI half; writing the actual tests is `wp-phpunit-writing-tests`.

## When to use this skill

- Adding automated tests to a plugin/theme that has none.
- Wiring PHPUnit into CI (GitHub Actions, GitLab, etc.).
- Debugging `install-wp-tests.sh`, the test database, `tests/bootstrap.php`, or "wrong PHPUnit version" errors.
- Reviewing a repo's `phpunit.xml.dist`, `composer.json` test scripts, or CI matrix.

## The PHPUnit version reality (read this first)

The most common setup mistake: requiring PHPUnit 10 or 11. **The WordPress core PHPUnit test suite is capped at PHPUnit 9.x** — there is no PHPUnit 10/11/12 support in any WordPress version, including WP 7.0. See the official [compatibility table](https://make.wordpress.org/core/handbook/references/phpunit-compatibility-and-wordpress-versions/).

`WP_UnitTestCase`-based tests boot the real WordPress test suite, so they run on the PHPUnit version the suite supports — **PHPUnit 9.x for current WordPress**. The bridge across PHPUnit majors is **`yoast/phpunit-polyfills`**, a hard dependency of the WP test suite since WordPress 5.9.

Practical rule: pin PHPUnit to `^9` and `yoast/phpunit-polyfills` to the constraint your installed WordPress expects (the scaffolded CI uses `phpunit-polyfills:1.1`; WordPress core pins the `1.x` line). The polyfills package has newer majors (4.x), but match what the WP test suite bootstrap loads — do not assume the newest works. Verify against your WP version, do not guess.

## Scaffold the harness

```bash
wp scaffold plugin-tests my-plugin --ci=github
# or for a theme:
wp scaffold theme-tests my-theme --ci=github
```

Synopsis: `wp scaffold plugin-tests [<plugin>] [--dir=<dir>] [--ci=<provider>] [--force]`. The `--ci` provider is one of `circle` (default), `gitlab`, `bitbucket`, `github` — pass `--ci=github` for GitHub Actions.

It generates:

| File | Purpose |
|---|---|
| `phpunit.xml.dist` | PHPUnit configuration (test suite paths, bootstrap). |
| `bin/install-wp-tests.sh` | Downloads + configures the WP test suite and test DB. |
| `tests/bootstrap.php` | Loads the test suite and activates your plugin/theme for the run. |
| `tests/test-sample.php` | A starter test extending `WP_UnitTestCase`. |
| `.phpcs.xml.dist` | A starter PHP_CodeSniffer ruleset (see `wp-phpcs-coding-standards`). |
| CI config | e.g. a `.github/workflows/*.yml` for `--ci=github`. |

The scaffolder is the same tooling WordPress core and most plugins use, so the layout is familiar to contributors. Use `--force` only when intentionally regenerating.

## Install the WordPress test suite

```bash
bash bin/install-wp-tests.sh <db-name> <db-user> <db-pass> [db-host] [wp-version] [skip-database-creation]
# example:
bash bin/install-wp-tests.sh wordpress_test root '' localhost latest
```

The first three arguments are required; `db-host` defaults to `localhost`, `wp-version` to `latest`. Pass `true` as the sixth argument to skip creating the database (e.g. in CI where a service container already created it).

What it does:

- Downloads WordPress core to `/tmp/wordpress/` and the test library (`includes/` + `data/`) to `/tmp/wordpress-tests-lib/` (override with `WP_CORE_DIR` / `WP_TESTS_DIR`).
- **Downloads via `curl`/`wget` from the WordPress develop GitHub mirror — Subversion is no longer required** by the current script. (Older tutorials say "install SVN first"; that is outdated.)
- Writes `wp-tests-config.php` with your DB credentials.

The test suite uses a **separate, disposable database** — every test runs in a transaction that is rolled back, so the schema is reused but data never persists. Never point it at a real site DB.

## Run the tests

```bash
vendor/bin/phpunit                      # whole suite (or just `phpunit` if global)
vendor/bin/phpunit --filter Test_Foo    # one class
vendor/bin/phpunit --filter test_method # one method
vendor/bin/phpunit --group slow         # only @group slow
vendor/bin/phpunit --exclude-group slow # skip slow tests
```

`phpunit.xml.dist` points `bootstrap` at `tests/bootstrap.php` and defines the `tests/` testsuite. Commit `phpunit.xml.dist` (the `.dist` default); developers may override locally with an un-suffixed `phpunit.xml`.

## Composer wiring

The scaffolded plugin `composer.json` stays lean; add the test dependencies and scripts you actually run locally:

```json
{
  "require-dev": {
    "phpunit/phpunit": "^9",
    "yoast/phpunit-polyfills": "^1.1"
  },
  "scripts": {
    "test": "phpunit",
    "test:unit": "phpunit --testsuite unit"
  }
}
```

Keep `phpunit/phpunit` at `^9` to match the WP test suite. Add coding-standards and static-analysis dev-deps and scripts from `wp-phpcs-coding-standards` and `wp-phpstan-static-analysis` so `composer test`, `composer lint`, `composer fix`, and `composer analyze` form one QA entry point.

## CI — GitHub Actions matrix

A correct workflow installs PHP, spins up MySQL, runs `install-wp-tests.sh`, then PHPUnit, across a PHP x WP matrix:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_DATABASE: wordpress_test
          MYSQL_ROOT_PASSWORD: root
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping" --health-interval=10s
          --health-timeout=5s --health-retries=3
    strategy:
      matrix:
        php: ['8.2', '8.3', '8.4']
        wp: ['latest', '6.9']
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          tools: phpunit-polyfills:1.1
      - run: composer install --prefer-dist --no-progress
      - run: bash bin/install-wp-tests.sh wordpress_test root root 127.0.0.1 ${{ matrix.wp }} true
      - run: vendor/bin/phpunit
```

Choose matrix versions for what you actually support — check [php.net's supported versions](https://www.php.net/supported-versions.php) and your plugin's "Requires PHP" / "Requires at least" headers for current status, then test recent PHP against `latest` plus one older WP minor. Use `skip-database-creation = true` because the service container already created the DB.

## Modern alternative: wp-env / wp-phpunit

Two newer paths avoid the shell installer:

- **`@wordpress/env` (`wp-env`)** — a Docker-based local environment. Run tests through the CLI container, e.g. `wp-env run cli phpunit` (scope to a plugin with `--env-cwd=wp-content/plugins/my-plugin`). Good for "no local LAMP" setups.
- **`wp-phpunit/wp-phpunit`** — a Composer package that ships the WordPress core PHPUnit library as a managed dependency (no `install-wp-tests.sh`, no download step). You still supply DB config and a bootstrap that `require`s its autoloaded path.

Both still run on the same PHPUnit 9.x ceiling. Pick the classic `install-wp-tests.sh` for parity with WordPress core/most plugins; pick `wp-env`/`wp-phpunit` when you want a Composer- or Docker-native flow.

## Critical rules

- **Do not require PHPUnit 10/11.** The WP test suite is PHPUnit 9.x; use `yoast/phpunit-polyfills` and pin `phpunit/phpunit:^9`.
- **Do not assume SVN is needed** — the current `install-wp-tests.sh` uses curl against the GitHub mirror.
- **Never run the test suite against a production database.** Use a throwaway `*_test` DB; the suite rolls back per test but assumes it owns the DB.
- **Commit `phpunit.xml.dist` and `.phpcs.xml.dist`**, not the un-suffixed local overrides.
- **Match `phpunit-polyfills` to your WordPress version**; verify the constraint, don't copy a random number.
- **In CI, pass `skip-database-creation = true`** when a MySQL service already created the DB.

## Cross-references

- Run **`wp-phpunit-writing-tests`** to write the tests this harness runs (`WP_UnitTestCase`, factories, mocking, unit vs integration).
- Run **`wp-phpcs-coding-standards`** for the `.phpcs.xml.dist` the scaffolder drops in.
- Run **`wp-phpstan-static-analysis`** to add static analysis to the same composer/CI pipeline.
- Run **`wp-cli-extending`** for WP-CLI command authoring (the scaffolder is a WP-CLI command).

## References

- Automated Testing handbook: <https://make.wordpress.org/core/handbook/testing/automated-testing/>
- `wp scaffold plugin-tests`: <https://developer.wordpress.org/cli/commands/scaffold/plugin-tests/>
- PHPUnit/WordPress compatibility table: <https://make.wordpress.org/core/handbook/references/phpunit-compatibility-and-wordpress-versions/>
- `install-wp-tests.sh` template: <https://github.com/wp-cli/scaffold-command/blob/main/templates/install-wp-tests.sh>
- PHPUnit Polyfills: <https://github.com/Yoast/PHPUnit-Polyfills>
- `wp-phpunit/wp-phpunit`: <https://github.com/wp-phpunit/wp-phpunit>
- `@wordpress/env`: <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/>
