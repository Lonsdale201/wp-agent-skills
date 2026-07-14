---
name: wp-strauss-namespace-prefixing
description: >
  Bundle Composer dependencies inside a WordPress plugin without conflicts by
  prefixing their namespaces, classnames, and constants with Strauss
  (brianhenryie/strauss, the maintained Mozart successor). Covers why shared
  vendor libraries collide between plugins (one PHP process, first-registered
  autoloader wins), running Strauss as a pinned strauss.phar from composer
  scripts (post-install-cmd / post-update-cmd, include-autoloader on
  post-autoload-dump) rather than require --dev, the extra.strauss config
  (target_directory vendor-prefixed, namespace_prefix, classmap_prefix,
  constant_prefix, packages, exclude_from_prefix, override_autoload,
  delete_vendor_packages, update_call_sites), loading
  vendor-prefixed/autoload.php, release/CI builds, and migrating from Mozart.
  Use when a plugin ships Guzzle, Monolog, an SDK, or any Composer runtime
  dependency, when two plugins fatal on conflicting library versions, or when
  composer.json contains extra.strauss or extra.mozart.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "Strauss 0.28.1 (2026-07-11); WP 7.0"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-14"
---

# Strauss: prefix bundled Composer dependencies

WordPress loads every active plugin into **one PHP process**, and for any given class name, whichever plugin's Composer autoloader registers first wins. If your plugin bundles Guzzle 7 and another plugin bundles Guzzle 6, one of you silently runs the other's version — best case a subtle bug, worst case a fatal. **Strauss** solves this by copying your runtime dependencies into `vendor-prefixed/` and rewriting their namespaces, classnames, and constants so they are unique to your plugin (`GuzzleHttp\Client` becomes `My_Plugin\GuzzleHttp\Client`). This skill wires Strauss into the Composer lifecycle and the release build. It is about *bundling isolation*, not autoloading your own plugin code.

## When to use this skill

- A distributed plugin ships **any Composer runtime dependency** (`require`, not `require-dev`) — HTTP clients, SDKs, loggers, parsers.
- Two plugins **fatal or misbehave together** with "Cannot redeclare class", wrong-version method signatures, or `Uncaught Error: Call to undefined method` on a vendor class.
- `composer.json` contains `extra.strauss` or `extra.mozart` (reviewing or extending an existing setup).
- Migrating off **Mozart** (Strauss began as a Mozart fork and reads the Mozart config for a seamless migration).
- Setting up the release/CI build for a plugin whose `vendor/` is gitignored.

## Install: pinned phar via composer scripts (recommended)

The upstream-recommended install is the **phar**, downloaded on demand and run from composer scripts — not `composer require --dev brianhenryie/strauss`. The phar keeps Strauss's own dependency tree (`composer/composer`, `symfony/console`, `nikic/php-parser`, `monolog`, …) out of your dev autoloader, where it could conflict with your own dev tools.

Create `bin/` (with a `.gitkeep`), add `bin/strauss.phar` to `.gitignore`, then:

```json
"scripts": {
    "prefix-namespaces": [
        "sh -c 'test -f ./bin/strauss.phar || curl -o bin/strauss.phar -L -C - https://github.com/BrianHenryIE/strauss/releases/latest/download/strauss.phar'",
        "@php bin/strauss.phar",
        "@composer dump-autoload"
    ],
    "post-install-cmd": [
        "@prefix-namespaces"
    ],
    "post-update-cmd": [
        "@prefix-namespaces"
    ],
    "post-autoload-dump": [
        "@php bin/strauss.phar include-autoloader"
    ]
}
```

Every `composer install` / `composer update` now regenerates the prefixed tree automatically — nobody has to remember a manual step.

For **reproducible CI builds**, pin a release instead of `latest`:

```
https://github.com/BrianHenryIE/strauss/releases/download/0.28.1/strauss.phar
```

Strauss follows WordPress's PHP floor ("this project will not increase its minimum required PHP version ahead of WordPress"); it runs on PHP 7.4+.

## Configure (`composer.json` → `extra.strauss`)

Strauss works zero-config — `namespace_prefix` and `classmap_prefix` are inferred from your `composer.json` `name`/`autoload`, and `packages` defaults to everything in `require`. Set them explicitly anyway so the prefix is deliberate:

```json
"extra": {
    "strauss": {
        "target_directory": "vendor-prefixed",
        "namespace_prefix": "My_Plugin\\Vendor\\",
        "classmap_prefix": "My_Plugin_Vendor_",
        "constant_prefix": "MYPLUGIN_",
        "packages": [],
        "update_call_sites": false,
        "delete_vendor_packages": false
    }
}
```

Key options and their defaults:

| Option | Default | What it does |
|---|---|---|
| `target_directory` | `vendor-prefixed` | Where prefixed copies land. |
| `namespace_prefix` | inferred | Prepended to every namespace (`GuzzleHttp\` → `My_Plugin\Vendor\GuzzleHttp\`). |
| `classmap_prefix` | inferred | Prepended to **global** (non-namespaced) classes. |
| `constant_prefix` | empty | Prepended to `define()`d constants. Empty = constants are **not** prefixed. |
| `packages` | all of `require` | Which packages to process. Dev tools in `require-dev` are never touched — that's correct, don't add them. |
| `update_call_sites` | `false` | `true` / `false` / array of paths. `true` rewrites references to the prefixed classes in your own `autoload` paths; an array (e.g. `["includes", "templates"]`) scopes it. CLI: `--updateCallSites=includes,templates`. |
| `delete_vendor_packages` | `false` | Removes the originals from `vendor/` after copying, so the unprefixed classes can't load by accident (and don't ship twice). |
| `override_autoload` | `{}` | Replace a package's broken/missing `autoload` key so Strauss can process it. |
| `exclude_from_copy` / `exclude_from_prefix` | empty | Each accepts `packages`, `namespaces`, `file_patterns` (regex). Use `exclude_from_prefix.namespaces` only for deliberately shared interop namespaces. |
| `exclude_constants` | empty | Same shape plus a literal `constants` list. |
| `namespace_replacement_patterns` | `{}` | Regex-based custom renames when a plain prefix isn't enough. |
| `include_root_autoload` | `false` | Makes the Strauss autoloader also load your project's root autoload, so you require only one file. |

## Autoloading after prefixing

Strauss generates its own autoloader in the target directory. Two equivalent wirings:

```php
// Option A — require it directly in the main plugin file:
require_once __DIR__ . '/vendor-prefixed/autoload.php';
```

Option B — the `post-autoload-dump` script above runs `strauss include-autoloader`, which appends the include to `vendor/autoload.php`, so your existing single `require vendor/autoload.php` keeps working.

With `delete_vendor_packages: true`, Strauss writes `vendor/composer/autoload_aliases.php` so the *old* class names still resolve during development (your test suite, existing references). That file is a **dev convenience only — never include it in production code**: shipping it re-creates exactly the global-name collision you ran Strauss to avoid.

## Your own code must use the prefixed names

Prefixing rewrites the *library*; something must also rewrite (or hand-write) *your* references to it:

```php
// WRONG — resolves to whichever plugin's Guzzle registered first
use GuzzleHttp\Client;

// RIGHT — your isolated copy
use My_Plugin\Vendor\GuzzleHttp\Client;
```

- Either write the prefixed names directly (new code), or set `update_call_sites` and let Strauss rewrite your call sites (existing code).
- **Grep for string class references** afterwards: `class_exists( 'GuzzleHttp\Client' )`, class names in config arrays, `::class`-less factory strings. Static analysis and rewriters see these unreliably — review them by hand.
- **Objects that cross plugin boundaries don't match prefixed type-hints.** If your public API accepts, say, a PSR-3 logger from *another* plugin, `My_Plugin\Vendor\Psr\Log\LoggerInterface` will reject the caller's unprefixed `Psr\Log\LoggerInterface`. That boundary must either use unprefixed interfaces (`exclude_from_prefix.namespaces`) — accepting the shared-version risk for that one namespace — or not type-hint the vendor interface at all.

## Release / CI workflow

- `vendor/` gitignored (typical): gitignore `vendor-prefixed/` too. CI runs `composer install` (the scripts build the prefixed tree), then zips the plugin **with `vendor-prefixed/`** — and with `vendor/` only if the autoloader wiring needs it (Option B) or `delete_vendor_packages` trimmed it to safe remnants.
- Test the result before shipping: `php bin/strauss.phar --dry-run` previews without writing; `--info` / `--debug` raise verbosity.
- The distributed zip must never contain an unprefixed copy of a runtime dependency — that is the whole point. `delete_vendor_packages: true` is the cleanest guarantee.

## Migrating from Mozart

Strauss is a Mozart fork and **reads your existing Mozart configuration** from `composer.json`, so the swap is: replace the Mozart package/phar with Strauss, run it, verify the output, then move the config to `extra.strauss` at leisure. What you gain over Mozart: a single output directory mirroring vendor structure, a generated `autoload.php`, `files` autoloader support, constant prefixing, license-respecting file headers, and active maintenance.

**PHP-Scoper** is the other alternative: it scopes an *entire codebase* (built for shipping phars) with PHP config files, while Strauss prefixes *only the bundled dependencies* in place, configured from `composer.json` — for the WordPress-plugin case, Strauss is the direct fit.

## Critical rules

- **Any distributed plugin that bundles Composer runtime dependencies must prefix them.** Unprefixed `vendor/` in a public plugin is a collision waiting for the second plugin that bundles the same library.
- **Run Strauss from composer scripts** (`post-install-cmd` / `post-update-cmd`), not by hand — a manually skipped run ships unprefixed classes.
- **Pin the phar release in CI** for reproducible builds; `latest` is fine for local dev.
- **Wire the autoloader deliberately** — either `require vendor-prefixed/autoload.php` or `strauss include-autoloader` on `post-autoload-dump`. Missing wiring fails only at runtime, on the first vendor class.
- **Never ship `autoload_aliases.php`** or any unprefixed duplicate of a processed package. Prefer `delete_vendor_packages: true` in release builds.
- **Prefix only `require`** (the default): PHPUnit, PHPCS, PHPStan and friends stay unprefixed in `vendor/`.
- **Audit string class references and plugin-boundary type-hints** after prefixing — the two places a mechanical rewrite can't decide for you.

## Cross-references

- Run **`wp-plugin-bootstrap`** for where the autoloader require belongs in the main plugin file and load order.
- Run **`wp-phpcs-coding-standards`** and exclude `vendor-prefixed/` from the ruleset — generated copies of third-party code are not yours to lint.
- Run **`wp-phpunit-test-setup`** to slot the prefix-namespaces script into the same composer-scripts QA pipeline and CI.

## What this skill does NOT cover

- Autoloading or namespacing **your own plugin code** (that is plain PSR-4 in `composer.json` `autoload`).
- Site-internal/bespoke plugins where you control every installed plugin — prefixing is still good hygiene there, but the conflict risk that forces it is a *distribution* problem.
- PHP-Scoper configuration details.

## References

- Strauss repository and README: <https://github.com/BrianHenryIE/strauss>
- Releases (phar downloads): <https://github.com/BrianHenryIE/strauss/releases>
- Mozart (predecessor): <https://github.com/coenjacobs/mozart>
- PHP-Scoper (whole-codebase alternative): <https://github.com/humbug/php-scoper>
