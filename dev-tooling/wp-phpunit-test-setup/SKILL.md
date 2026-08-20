---
name: wp-phpunit-test-setup
description: >
  Set up the PHPUnit test harness for a WordPress plugin or theme, the WP way.
  Covers `wp scaffold plugin-tests` / `wp scaffold theme-tests` and the files it
  generates (`phpunit.xml.dist`, `bin/install-wp-tests.sh`, `tests/bootstrap.php`,
  `tests/test-sample.php`, `.phpcs.xml.dist`, a CI workflow), installing the
  WordPress test suite with the current tarball-and-SVN `install-wp-tests.sh`, the
  disposable test database, `yoast/phpunit-polyfills`, the critical fact that the WP core test
  suite is capped at PHPUnit 9.x, composer `require-dev` / scripts wiring, a
  GitHub Actions PHP x WP matrix with `shivammathur/setup-php`, and the modern
  `wp-env` / `wp-phpunit/wp-phpunit` alternatives. Use when adding a test
  harness, wiring CI, or debugging install-wp-tests / bootstrap / PHPUnit-version
  problems. For writing the tests themselves see wp-phpunit-writing-tests.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-toolchain-tested: "WP-CLI scaffold-command 2.x; PHPUnit 9.x; phpunit-polyfills 1.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress PHPUnit test setup

Get a real WordPress integration test harness running for a plugin or theme. The fast path is WP-CLI's scaffolder, which generates the same layout WordPress core uses. This skill is the setup + CI half; writing the actual tests is `wp-phpunit-writing-tests`.

## When to use this skill

- Adding automated tests to a plugin/theme that has none.
- Wiring PHPUnit into CI (GitHub Actions, GitLab, etc.).
- Debugging `install-wp-tests.sh`, the test database, `tests/bootstrap.php`, or "wrong PHPUnit version" errors.
- Reviewing a repo's `phpunit.xml.dist`, `composer.json` test scripts, or CI matrix.

## The PHPUnit version reality (read this first)

The most common setup mistake: requiring PHPUnit 10 or 11 for a
`WP_UnitTestCase` integration suite. **WordPress 7.1's core test library remains
on PHPUnit 9.x**: the official matrix assigns PHPUnit 9 to WordPress 7.1 on PHP
7.4 through 8.5, and core's `phpunit.xml.dist` uses the PHPUnit 9.2 schema.
Check the official [compatibility table](https://make.wordpress.org/core/handbook/references/phpunit-compatibility-and-wordpress-versions/)
for each WordPress/PHP branch instead of extrapolating from the newest PHP.

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
- Downloads release builds of core as WordPress.org tarballs, but uses `svn export`
  for the matching `wordpress-develop` test `includes/` and `data/`; nightly/trunk
  core also uses SVN. The generated installer therefore needs `curl` or `wget`,
  `tar`, an SVN client, and MySQL client tools as applicable.
- Treat generated CI as a starting point and inspect it together with the
  installer. Generator/runner versions may assume tools such as SVN are already
  installed, use an outdated PHP/WP matrix, or emit a malformed matrix
  expression. Confirm `${{ matrix.php-version }}` (or your chosen key), install
  missing clients explicitly, and validate the workflow before relying on it.
- Writes `wp-tests-config.php` with your DB credentials.

The test suite uses a **separate, disposable database** that it assumes it may
modify and clean. Core test cases and factories perform cleanup, but there is no
universal per-test transaction/rollback guarantee for plugin code, custom
tables, raw SQL, or external side effects. Never point it at a real site DB.

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

Both still need a WordPress test-library/PHPUnit combination that the selected
WordPress branch supports. Pick `install-wp-tests.sh` for a small conventional
CI harness; pick `wp-env`/`wp-phpunit` when a Docker- or Composer-native flow is
a better fit. None of these choices removes the disposable-database requirement.

## WordPress 7.1 CI guidance

Core's own 7.1 CI reduced redundant database combinations while retaining PHP
coverage. Apply the principle, not core's exact matrix: test the minimum and
maximum supported PHP/WP boundaries on every change, then schedule broader
database and intermediate-version coverage when risk justifies it. Avoid a full
Cartesian product that delays feedback without exercising a distinct boundary.

## Critical rules

- **Do not require PHPUnit 10/11/12 for the WordPress 7.1 integration suite.** Use PHPUnit 9.x and `yoast/phpunit-polyfills`; a separate pure-unit suite may choose a newer PHPUnit.
- **Inspect the generated workflow and installer together.** Release core uses
  a tarball, while test-library files (and nightly/trunk core) still require SVN;
  also verify every generated matrix expression and supported-version boundary.
- **Never run the test suite against a production database.** Use a throwaway `*_test` DB; the suite assumes it owns and may reset that database.
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
- WordPress 7.1 leaner PHPUnit CI: <https://make.wordpress.org/core/2026/07/30/leaner-steadier-phpunit-runs-for-upcoming-releases/>
- Related documentation: <https://github.com/wp-cli/scaffold-command/blob/main/templates/plugin-github.mustache>
- Related documentation: <https://github.com/WordPress/wordpress-develop>
