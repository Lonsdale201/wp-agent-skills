---
name: wp-phpcs-coding-standards
description: >
  Set up and run PHP_CodeSniffer with the WordPress Coding Standards (WPCS) and
  PHPCompatibility on a plugin or theme. Covers the composer dev-dependencies and
  their exact (and confusingly-named) packages — `squizlabs/php_codesniffer`,
  `wp-coding-standards/wpcs`, `phpcompatibility/phpcompatibility-wp`,
  `dealerdirect/phpcodesniffer-composer-installer` — the required `allow-plugins`
  config, the `phpcs.xml.dist` ruleset (the `WordPress` / `-Core` / `-Extra` /
  `-Docs` standards, `prefixes`, `text_domain`, `minimum_wp_version`, `testVersion`),
  running `phpcs` (check) vs `phpcbf` (auto-fix), `phpcs -i`, `phpcs:ignore` /
  `disable` comments, and the WPCS 3.x breaking changes (sniff and property
  renames such as `minimum_supported_version` -> `minimum_wp_version`). Use when
  adding coding-standards linting, writing/auditing a ruleset, or fixing
  "standard not installed" / WPCS 2.x-to-3.x migration problems.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "WPCS 3.3; PHP_CodeSniffer 3.13; PHPCompatibilityWP 2.1; WP 7.0"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-17"
---

# WordPress coding standards with PHPCS

PHP_CodeSniffer (`phpcs`) checks code against a ruleset; `phpcbf` auto-fixes what it can. The WordPress Coding Standards (WPCS) are the rulesets; PHPCompatibility flags syntax that breaks on your minimum PHP version. This skill wires them up correctly — the package names and the WPCS 3.x renames are where people get stuck.

## When to use this skill

- Adding coding-standards linting to a plugin/theme (or to the `.phpcs.xml.dist` the test scaffolder dropped in).
- Writing or auditing a `phpcs.xml.dist` ruleset.
- Fixing "Referenced sniff … does not exist", "standard not installed", or `allow-plugins` errors.
- Migrating a ruleset from WPCS 2.x to 3.x.

## Install (exact packages — names are confusing)

```bash
composer config --no-plugins allow-plugins.dealerdirect/phpcodesniffer-composer-installer true
composer require --dev \
  wp-coding-standards/wpcs:"^3.0" \
  phpcompatibility/phpcompatibility-wp:"^2.1" \
  dealerdirect/phpcodesniffer-composer-installer:"^1.0"
```

Three things that trip people up, all verified:

- **`squizlabs/php_codesniffer` is still the correct Packagist name** even though the project moved to the `PHPCSStandards` GitHub org. WPCS pulls it in transitively, so you usually don't list it. **WPCS 3.x needs PHPCS `3.x`, not 4.x** — don't force `squizlabs/php_codesniffer:^4`.
- **The installer is still `dealerdirect/phpcodesniffer-composer-installer` on Packagist** (the repo is now `PHPCSStandards/composer-installer`, but the package name is unchanged). It auto-registers WPCS and PHPCompatibility with PHPCS, so you never run `phpcs --config-set installed_paths …` by hand.
- **PHPCompatibilityWP: use the stable `^2.1`.** The README advertises `^3.0@dev`, but 3.0 is alpha-only; pin `^2.1` for production unless you deliberately want the alpha.

Composer 2.2+ refuses to run the installer plugin unless it's in `allow-plugins` — the `composer config` line above does that; without it the standards won't register and `phpcs -i` won't list `WordPress`.

## The ruleset (`phpcs.xml.dist`)

PHPCS auto-discovers `.phpcs.xml`, `phpcs.xml`, `.phpcs.xml.dist`, or `phpcs.xml.dist` in the working dir. Commit the `.dist` default:

```xml
<?xml version="1.0"?>
<ruleset name="My Plugin">
    <description>Coding standards for My Plugin.</description>

    <!-- What to scan / skip -->
    <file>.</file>
    <exclude-pattern>/vendor/*</exclude-pattern>
    <exclude-pattern>/node_modules/*</exclude-pattern>
    <exclude-pattern>/tests/*</exclude-pattern>

    <!-- Only PHP; show sniff codes + progress -->
    <arg name="extensions" value="php"/>
    <arg value="sp"/>

    <!-- WordPress standards -->
    <rule ref="WordPress"/>

    <!-- PHP version floor for syntax compatibility -->
    <config name="testVersion" value="7.4-"/>
    <rule ref="PHPCompatibilityWP"/>

    <!-- Minimum WordPress version for deprecation sniffs (WPCS 3.x name) -->
    <config name="minimum_wp_version" value="6.5"/>

    <!-- Required: your global prefix(es) so PrefixAllGlobals passes -->
    <rule ref="WordPress.NamingConventions.PrefixAllGlobals">
        <properties>
            <property name="prefixes" type="array">
                <element value="my_plugin"/>
            </property>
        </properties>
    </rule>

    <!-- Your text domain so the i18n sniff passes -->
    <rule ref="WordPress.WP.I18n">
        <properties>
            <property name="text_domain" type="array">
                <element value="my-plugin"/>
            </property>
        </properties>
    </rule>
</ruleset>
```

The four standards to choose `ref` from:

| Standard | Scope |
|---|---|
| `WordPress` | Everything: Core + Extra + Docs. |
| `WordPress-Core` | Core formatting/style rules. |
| `WordPress-Extra` | Core + extra best-practice sniffs. |
| `WordPress-Docs` | Inline documentation (docblock) standards. |

Set `prefixes` and `text_domain` for your plugin or `PrefixAllGlobals` and `I18n` will flag everything. `testVersion` drives PHPCompatibility; `minimum_wp_version` drives WP deprecation sniffs.

## Run it

```bash
vendor/bin/phpcs                 # check, using the auto-discovered ruleset
vendor/bin/phpcbf                # AUTO-FIX fixable violations (Beautifier and Fixer)
vendor/bin/phpcs --standard=WordPress path/to/file.php
vendor/bin/phpcs -i              # list installed standards (expect WordPress, PHPCompatibilityWP, …)
```

`phpcs` reports; **`phpcbf` (PHP Code Beautifier and Fixer) is the auto-fixer.** Run `phpcbf` first to clear mechanical issues, then `phpcs` to see what needs manual attention. (Note: `phpcbf` ships with PHP_CodeSniffer; it is *not* PHP-CS-Fixer / `friendsofphp/php-cs-fixer`, which is a separate project with its own rules.) Add composer scripts so it joins the QA entry point:

```json
"scripts": {
  "lint": "phpcs",
  "fix": "phpcbf"
}
```

## Suppressing findings

Inline, scoped, and only with a reason:

```php
// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- value is pre-escaped above.
echo $already_escaped;

// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared -- static query, no user input.
$wpdb->query( 'TRUNCATE TABLE …' );
// phpcs:enable WordPress.DB.PreparedSQL.NotPrepared
```

Always target a specific sniff code, never a blanket `// phpcs:ignore`. **PHPCS 3.x has no built-in baseline file** (unlike PHPStan) — for legacy code, suppress with scoped comments or a third-party baseliner tool, and burn the suppressions down over time.

## WPCS 2.x → 3.x migration

If you inherit a ruleset that errors on WPCS 3.x, the usual causes (verified against the [WPCS 3.0 release notes](https://github.com/WordPress/WordPress-Coding-Standards/releases/tag/3.0.0)):

- **Property renames:** `minimum_supported_version` → `minimum_wp_version`; `custom_test_class_whitelist` → `custom_test_classes`; "whitelist" → "allowed" generally (e.g. `allowed_custom_properties`).
- **Sniffs moved out of the `WordPress.*` namespace** into PSR12 / Generic / Universal / NormalizedArrays — e.g. `WordPress.PHP.StrictComparisons` → `Universal.Operators.StrictComparisons`, `WordPress.CodeAnalysis.EmptyStatement` → `Generic.CodeAnalysis.EmptyPHPStatement`. A `<rule ref="WordPress.…">` pointing at a moved sniff now errors; update the ref or rely on the bundled standards.
- **Composer-only install** (PEAR/manual dropped); **PHPCS 3.7.2+ required**.

## Critical rules

- **`phpcs` checks, `phpcbf` fixes.** Run `phpcbf` to auto-resolve, then `phpcs` for the rest.
- **Get the package names right:** `squizlabs/php_codesniffer` and `dealerdirect/phpcodesniffer-composer-installer` are still the Packagist names despite the GitHub org move.
- **Pin WPCS `^3.0` with PHPCS `3.x`** (not 4.x); PHPCompatibilityWP stable is `^2.1` (3.0 is alpha).
- **Add `allow-plugins` for the installer** or the standards never register.
- **Always set `prefixes` and `text_domain`** in the ruleset for your plugin/theme.
- **Use `minimum_wp_version`**, not the removed `minimum_supported_version`, on WPCS 3.x.
- **Suppress by specific sniff code with a reason** — never a blanket ignore, and don't fake a baseline by disabling whole standards.

## Cross-references

- Run **`wp-phpunit-test-setup`** — the test scaffolder already drops a `.phpcs.xml.dist` and a composer/CI pipeline to extend.
- Run **`wp-phpstan-static-analysis`** for the static-analysis gate (PHPCS is style/standards; PHPStan is type/logic — use both).
- Run **`wp-i18n-audit`** for the `text_domain` and translation correctness the `WordPress.WP.I18n` sniff enforces.
- Run **`wp-security-audit`** — many WordPress sniffs (`EscapeOutput`, `NonceVerification`, `PreparedSQL`) overlap the security checklist.

## References

- WordPress Coding Standards: <https://github.com/WordPress/WordPress-Coding-Standards>
- WPCS 3.0 release notes (renames): <https://github.com/WordPress/WordPress-Coding-Standards/releases/tag/3.0.0>
- Customizable sniff properties: <https://github.com/WordPress/WordPress-Coding-Standards/wiki/Customizable-sniff-properties>
- PHP_CodeSniffer (PHPCSStandards): <https://github.com/PHPCSStandards/PHP_CodeSniffer>
- Composer installer: <https://github.com/PHPCSStandards/composer-installer>
- PHPCompatibilityWP: <https://github.com/PHPCompatibility/PHPCompatibilityWP>
- Related documentation: <https://github.com/PHPCSStandards/PHP_CodeSniffer/wiki/Advanced-Usage>
