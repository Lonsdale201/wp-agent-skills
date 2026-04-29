---
name: bd-companion-plugin
description: Work on better-data-plugin-test — the companion plugin
  that exercises the better-data library against a live WordPress
  install. Plugin is intentionally NOT part of the library public API,
  so feel free to break its internals to demonstrate a point. Three
  test tiers — Smoke (regression; never tolerate FAIL), Stress (deep
  integration with OK/FAIL/NOTE findings — NOTE is for surfaced quirks
  worth documenting without blocking), and Admin pages (eyeball-level
  proof of behaviour, e.g. ShopSettingsPage rendering print_r($dto) to
  visually confirm Secret redaction). The Widget Shop fixture
  (bd_widget CPT + bd_order CPT + ShopSettingsDto) is the canonical
  realistic consumer; extend it rather than inventing a new fixture.
  CLI is the main driving surface — wp better-data {test, stress,
  seed, purge, inventory}. Use when changes go under
  wp-content/plugins/better-data-plugin-test/. Triggers on Smoke /
  Stress / Runner / Cli files in that path, "wp better-data" CLI
  invocations, "smoke / stress scenario" mentions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
---

# better-data: Companion plugin testbed

For library maintainers working in the integration testbed at `wp-content/plugins/better-data-plugin-test/`. The plugin's job is to verify better-data behavior against real WordPress — things that pure unit tests can't reach (cache primings, `metadata_exists` semantics, `wp_slash` round-trips, REST schema actually appearing in `WP_REST_Server`, locale switching, encryption key constants).

## Misconception this skill corrects

> "I'll add the new feature's integration test directly inside `better-data/tests/Unit/` so everything's in one place."

Wrong. `tests/Unit/` is the **WP-free** zone — every test there must run with `composer test` against a clean PHP environment, no WP bootstrap, no MySQL. That's intentional: contributors can run the unit suite in seconds. WP-aware behavior goes in the companion plugin, where there's a real WordPress to talk to.

The split:

| Concern | Lives in |
|---|---|
| Pure type coercion, attribute reflection, builder logic | `better-data/tests/Unit/` |
| `wp_slash` round-trip, `metadata_exists` semantics, REST registration | `better-data-plugin-test/src/Smoke/` |
| Multi-step scenarios (encrypt → store → fetch → decrypt → reveal), edge-case discovery | `better-data-plugin-test/src/Stress/` |
| Visual confirmation (admin page renders `print_r($dto)`) | `better-data-plugin-test/src/Admin/` |

Other AI-prone misconceptions:

- "I'll let the plugin depend on WooCommerce since it makes the Order fixture realistic." Wrong — the plugin must run on a clean WP install with NOTHING but better-data. WC, ACF, custom-fields plugins are out. The Widget Shop fixture (`bd_widget` CPT + `bd_order` CPT + `ShopSettingsDto`) IS the realistic consumer because it's self-contained.
- "If a stress scenario is flaky, I'll mark it as `NOTE` instead of fixing it." Wrong — `NOTE` is for documented quirks the library legitimately surfaces (e.g. "WP serializes integer-keyed arrays as objects in some contexts"). A flaky test is a `FAIL` waiting to happen; fix it.
- "I'll move the new behavior into the library after the plugin verifies it." Wrong direction — integration-only behavior STAYS in the plugin. The library stays shape-agnostic.

## When to use this skill

Trigger when ANY of the following is true:

- The diff modifies any file under `wp-content/plugins/better-data-plugin-test/`.
- Adding a new smoke or stress scenario.
- Adding a new CLI subcommand under `bin/wp better-data <subcommand>`.
- Adding a new admin page, fixture DTO, or seed/purge routine.
- Reviewing a PR that adds WordPress / WC / ACF as a Composer dep on the plugin.

## Workflow

### 1. Three test tiers — pick the right one

**Smoke — regression coverage.**

```
src/Smoke/
├── Runner.php              ← scenario list + dispatcher
└── Assertion.php           ← per-scenario assertions
```

Smoke scenarios run on every library change. They're short, focused, fast. A FAIL here means a regression — never ship over it. Add a smoke scenario for any new public behavior.

**Stress — deep integration.**

```
src/Stress/
├── Runner.php              ← scenario list + dispatcher
└── Finding.php             ← OK / FAIL / NOTE findings
```

Stress scenarios are longer-running, multi-step, edge-case-hunting. They produce three outcomes:

| Verdict | Meaning |
|---|---|
| `OK` | Library behaves as expected for this scenario |
| `FAIL` | Bug — blocks the change |
| `NOTE` | Discovery — library surfaces a quirk worth documenting (e.g. "PHP arrays with integer keys round-trip as JSON objects in this context") |

`NOTE` is the unique value-add: it lets a stress run discover and SURFACE library limits without failing.

**Admin pages — visual confirmation.**

```
src/Admin/
├── AdminPage.php           ← base
├── ShopSettingsPage.php    ← renders print_r($dto) post-hydration
├── …
```

Admin pages are eyeball-level proof. Use for:

- Visually confirming `Secret` renders as `'***'`.
- Confirming locale-switched email subject lines render in the right language.
- Manually playing with `Presenter` chains.

Not test scaffolding — they're for human verification.

### 2. The Widget Shop fixture is the canonical consumer

The plugin defines:

- `bd_widget` CPT — products in the fictional shop.
- `bd_order` CPT — orders.
- `ShopSettingsDto` — store-level settings (currency, tax, encrypted Stripe key).
- `WidgetDto`, `LineItemDto`, `OrderDto`, `CustomerDto`, `AddressDto` — see [src/Dto/](src/Dto/).

When you add a new feature:

1. Can it fit into the Widget Shop? (Yes for most things — sinks, sources, validation rules, presenter methods.) Extend the existing fixtures.
2. Does it genuinely need a new fixture? (E.g. testing a new SOURCE that doesn't fit the shop concept.) Add a fixture, but keep the dependency-tree minimal.

Adding a new CPT just for one test is over-fitting. Adding a new DTO that consumes existing CPTs is fine.

### 3. CLI subcommands

The plugin's main driving surface is CLI:

```bash
wp better-data smoke      # run all smoke scenarios
wp better-data stress     # run all stress scenarios
wp better-data seed       # populate the Widget Shop with sample data
wp better-data purge      # clear all bd_* posts and meta
wp better-data inventory  # list every DTO + scenario the plugin exposes
```

Existing files: [src/Cli.php](src/Cli.php), [src/StressCli.php](src/StressCli.php), [src/SeedCli.php](src/SeedCli.php), [src/PurgeCli.php](src/PurgeCli.php), [src/InventoryCli.php](src/InventoryCli.php).

Add a new subcommand when you have a coherent chunk of work that doesn't fit the existing five (e.g. `bench` for benchmark scenarios). Don't add one for a single scenario — that goes inside an existing tier.

### 4. Adding a stress scenario

```php
// src/Stress/EncryptionRotationScenario.php
namespace BetterDataPluginTest\Stress;

final class EncryptionRotationScenario
{
    public function run(): array  // list<Finding>
    {
        $findings = [];

        // 1. Set up: define BETTER_DATA_ENCRYPTION_KEY, encrypt + store a Secret.
        // 2. Define BETTER_DATA_ENCRYPTION_KEY_PREVIOUS = old key.
        // 3. Read back: should still decrypt under previous key.
        // 4. Re-write: should encrypt under new key.
        // 5. Read back: under new key.
        // 6. Verify the wp_options row's stored value uses the new key envelope.

        $findings[] = Finding::ok('round-trip under rotation works');
        $findings[] = Finding::note('previous-key rows are not auto-rewritten on read; lazy migration on write only');

        return $findings;
    }
}
```

Wire it into the runner:

```php
// src/Stress/Runner.php
public function scenarios(): array
{
    return [
        new RoundTripScenario(),
        // ...
        new EncryptionRotationScenario(),
    ];
}
```

### 5. Adding a smoke scenario

Smoke is more compact — assertion-style, no `Finding` objects:

```php
// src/Smoke/Runner.php — inside the scenario list:
$assertions->ok(
    'PostDto round-trips through PostSink + PostSource',
    fn () => $this->postRoundTrip(),
);
```

The assertion closure throws on failure or returns nothing on pass. Single-line scenario titles, single-step assertions.

### 6. Don't depend on WC / ACF / external plugins

The companion plugin's `composer.json` lists ONLY:

- `php: ^8.3`
- `lonsdale201/better-data` (path repository pointing back to `../../libraries/better-data`)

No WooCommerce, no ACF, no Composer packages outside the library. Reason: a contributor cloning the library + plugin should be able to run the smoke + stress suite on a clean WP install, no setup choreography. If the plugin grew a dep on WC, half the contributors couldn't reproduce.

### 7. Run order

```bash
# In the library:
vendor/bin/phpunit               # unit suite — must be green first
vendor/bin/phpstan analyse       # static analysis
vendor/bin/php-cs-fixer fix      # style

# In the plugin (against a real WP):
wp better-data purge             # clean slate
wp better-data seed              # populate the Widget Shop
wp better-data smoke             # regression
wp better-data stress            # deep integration

# Iterate on FAIL findings until clean.
```

A successful sequence is the ship-readiness check. Library unit + static + style green, plugin smoke 100% pass, stress 0 FAIL.

## Critical rules

- **Plugin is internal — break its internals as needed.** Not part of the library's public API; redesign freely to demonstrate a point.
- **Three test tiers, pick the right one.** Smoke = regression (never FAIL); Stress = integration (FAIL blocks, NOTE documents); Admin pages = visual confirmation.
- **`NOTE` is for documented quirks, not flaky tests.** A test that flakes is a FAIL waiting to happen — fix it.
- **Widget Shop is the canonical fixture.** Extend it; add new fixtures only when the new use case doesn't fit.
- **No deps beyond `better-data` itself.** Plugin must run on a clean WP install. No WC, no ACF, no third-party Composer packages.
- **CLI is the driving surface.** `wp better-data {test, stress, seed, purge, inventory}` covers the workflow; add a subcommand only for genuinely new categories.
- **Integration-only behavior STAYS in the plugin.** Don't promote a stress-only feature into the library.
- **Smoke green + 0 FAIL stress = ship-ready.** That's the gate.

## Common mistakes

```php
// WRONG — depending on WooCommerce in the plugin
// composer.json: "require": { "woocommerce/woocommerce-stubs": "^8.0" }
// Now contributors need WC installed to run the suite.

// RIGHT — keep the dep tree to better-data + WP

// WRONG — scenario marked NOTE because it's flaky
$findings[] = Finding::note('Sometimes the cache primes too late and we read a stale value');
// 🔴 a flake is a FAIL waiting to happen.

// RIGHT — fix it (add explicit cache priming, or design the scenario to be deterministic)
$findings[] = Finding::ok('cache primes correctly when explicitly warmed');

// WRONG — new CPT for one test
\register_post_type('bd_email_log', [...]);  // just to test EmailLogSink
// Bloats the fixture surface for everyone.

// RIGHT — extend the Widget Shop
// EmailLogDto becomes part of the bd_order CPT meta, or the bd_widget reviews flow.

// WRONG — promoting a plugin-only behavior into the library
// "OrderTotals helper grew useful — moving it into better-data/src/Helpers/"
// Library stays shape-agnostic; helpers are a consumer concern.

// RIGHT — keep it in the plugin

// WRONG — skipping wp better-data purge before stress
// Stale seed data from a previous run skews scenarios.

// RIGHT
wp better-data purge
wp better-data seed
wp better-data stress

// WRONG — putting integration-test code in the library
// better-data/tests/Integration/EncryptionRoundTripTest.php (requires WP bootstrap)
// Breaks the WP-free unit suite contract.

// RIGHT
// better-data-plugin-test/src/Stress/EncryptionRoundTripScenario.php
```

## Cross-references

- Run **`bd-data-object`** when adding a new fixture DTO under `src/Dto/`.
- Run **`bd-source-adapter`** + **`bd-sink`** when the scenario covers a new WP store integration — the plugin is where you verify cache primings work.
- Run **`bd-security`** for stress scenarios involving `Secret` / `#[Encrypted]` — the plugin is where leak probes against live WP run.

## What this skill does NOT cover

- Plugin distribution / packaging. The companion is repo-internal; it's not published.
- WordPress bootstrapping for the unit suite. Library unit tests must run WP-free.
- Performance benchmarking with realistic scale (10k posts, 1M meta rows). Stress is correctness-focused; benchmarks would be a separate `bench` subcommand.
- Plugin-level i18n. Plugin uses simple English strings; libraries' i18n behavior is in the library's tests.
- Admin UI design / UX. Admin pages exist for visual confirmation, not to demonstrate good UI.
- Multi-site behavior. WP multisite is an edge case for some sinks/sources; covered case-by-case in stress, not as a tier.

## References

- Plugin entry: [wp-content/plugins/better-data-plugin-test/better-data-plugin-test.php](better-data-plugin-test.php) — bootstrap, CPT registration, CLI hookup.
- Widget Shop fixtures: [wp-content/plugins/better-data-plugin-test/src/Dto/](src/Dto/) — `WidgetDto`, `OrderDto`, `LineItemDto`, `CustomerDto`, `AddressDto`, `ShopSettingsDto`, `EncryptedCredentialsDto`, `OptionalBeforeRequiredTrapFixture`.
- Smoke runner: [wp-content/plugins/better-data-plugin-test/src/Smoke/Runner.php](Runner.php) and [src/Smoke/Assertion.php](Assertion.php).
- Stress runner: [wp-content/plugins/better-data-plugin-test/src/Stress/Runner.php](Runner.php) and [src/Stress/Finding.php](Finding.php) — `Finding::ok`, `Finding::fail`, `Finding::note` factories.
- CLI: [wp-content/plugins/better-data-plugin-test/src/Cli.php](Cli.php), [src/StressCli.php](StressCli.php), [src/SeedCli.php](SeedCli.php), [src/PurgeCli.php](PurgeCli.php), [src/InventoryCli.php](InventoryCli.php).
- Admin pages: [wp-content/plugins/better-data-plugin-test/src/Admin/](src/Admin/) — `AdminPage` base + concrete pages.
