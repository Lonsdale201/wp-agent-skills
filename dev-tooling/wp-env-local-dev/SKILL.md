---
name: wp-env-local-dev
description: >
  Run a local WordPress development environment with wp-env (the official
  @wordpress/env Docker wrapper) — the default choice for plugin and block
  development. Covers the npx @wordpress/env command (and the trap that bare
  "npx wp-env" installs an unrelated stub package), the .wp-env.json config
  (core, phpVersion, plugins, themes, mappings, config constants, ports,
  multisite, lifecycleScripts, .wp-env.override.json merge rules), the twin
  instances (dev on 8888, tests on 8889 with separate databases), running
  wp-cli via "wp-env run cli", the preinstalled PHPUnit + Composer + WP test
  suite in the tests instance, step debugging with "wp-env start --xdebug",
  and start/stop/clean/destroy lifecycle. Use when setting up local WP for a
  plugin or theme, when a .wp-env.json is present or needs writing, when the
  user asks for a quick WordPress sandbox with Docker, or before reaching for
  a hand-written docker-compose stack.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "wp-env 11.10.0; WP 7.0.1; Xdebug 3.5.3; Docker 29.3 / Compose v5.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-14"
---

# wp-env: the official local WordPress environment

`wp-env` (`@wordpress/env`) is the WordPress project's own Docker wrapper — the same tool core and Gutenberg development uses. For plugin/block development it beats a hand-written docker-compose file: one JSON file maps your plugin in, you get a dev site *and* a separate tests site with the WP PHPUnit suite preinstalled, and Xdebug is a flag. This skill covers configuring and driving it; when you need custom services (Redis, Mailpit, nginx), that is where its abstraction ends — switch to `wp-docker-compose-stack`.

## When to use this skill

- Setting up a local WordPress for **plugin, theme, or block development**.
- A `.wp-env.json` / `.wp-env.override.json` exists in the repo or needs writing.
- The user asks for a "quick local WP", a WordPress sandbox, or Docker-based WP dev.
- Wiring PHPUnit against a real WP test suite (the tests instance ships it).
- Before hand-rolling docker-compose for WordPress — wp-env is the default; compose is the escape hatch.

## Prerequisites and the `npx wp-env` trap

Docker must be installed and **running** (Docker Desktop on macOS/Windows — WSL2 backend recommended on Windows — or Docker Engine on Linux), plus Node.js LTS.

Invoke it as **`npx @wordpress/env`**. Bare `npx wp-env` in a project that doesn't have `@wordpress/env` installed downloads an **unrelated npm package named `wp-env`** — a stub that just prints "Please run the command 'npx @wordpress/env' instead" (verified: it resolves to `wp-env@1.0.1`, not the WordPress tool). The short `wp-env` command is only safe once the real package is a dev dependency, because then the local bin wins:

```bash
npm install --save-dev @wordpress/env
npx wp-env start        # now resolves to node_modules/.bin/wp-env — the real one
```

## Configure: `.wp-env.json`

Committed to the plugin/theme repo root. A minimal, verified plugin-dev config:

```json
{
	"core": null,
	"phpVersion": "8.3",
	"plugins": [ "." ],
	"config": {
		"WP_DEBUG": true,
		"WP_DEBUG_LOG": true
	}
}
```

`"plugins": [ "." ]` mounts the current directory into `wp-content/plugins/` and **activates it** — verified: the plugin shows `active` in `wp plugin list` and its hooks run on the frontend immediately; edits on the host are live, no sync step.

Key options:

| Option | Default | Notes |
|---|---|---|
| `core` | `null` | `null` = **latest production WordPress** (verified: installs the current release even while the `wordpress` Docker image still lags behind). Accepts a version, GitHub ref, local path, or zip URL to pin. |
| `phpVersion` | `null` | e.g. `"8.3"` — verified the container really runs it. `null` = the WP default. |
| `plugins` / `themes` | `[]` | Paths, zips, or GitHub refs; all get installed, plugins get activated. |
| `mappings` | `{}` | Arbitrary host-path → container-path mounts (e.g. a mu-plugin or a second plugin). |
| `config` | WP debug defaults | wp-config constants as JSON pairs. |
| `port` / `testsPort` | `8888` / `8889` | Host ports of the two instances; `WP_ENV_PORT` env var overrides. |
| `multisite` | `false` | Multisite install. |
| `phpmyadmin` | `false` | Optional phpMyAdmin service. |
| `lifecycleScripts` | `{}` | Commands on `afterStart`, `afterClean`, etc. — e.g. activate extra config, import seed data. |

`.wp-env.override.json` (gitignored) holds personal overrides: `config` and `mappings` **merge**, other keys (`plugins`, `themes`, `core`) **replace** — don't put one plugin in each file and expect both.

An `env` key can override settings per instance (`env.development` / `env.tests`) — e.g. different plugins in the tests site.

## The twin instances

`wp-env start` boots **two independent WordPress installs** (verified, first boot ~2 min, restarts faster):

- **Development** — <http://localhost:8888>, login `admin` / `password`. Your daily site.
- **Tests** — <http://localhost:8889>, its own MySQL. This is what PHPUnit runs against, so test-suite DB wipes never touch your dev content.

Each has its own MySQL container; the DB ports are exposed on random host ports (printed by `start`) if a GUI client is needed, or set `mysqlPort` to pin one.

## Daily commands

```bash
npx wp-env start              # boot / apply .wp-env.json changes
npx wp-env stop               # stop containers, keep everything
npx wp-env clean all          # reset the databases (dev, tests, or all)
npx wp-env destroy            # delete containers + volumes (asks; --force skips)

# wp-cli inside the containers — 'cli' targets dev, 'tests-cli' targets tests:
npx wp-env run cli wp plugin list
npx wp-env run cli wp user create editor editor@example.test --role=editor
npx wp-env run tests-cli wp option get siteurl        # → http://localhost:8889

# quote multi-arg commands as one string:
npx wp-env run cli "wp post create --post_type=page --post_title='Pricing'"

# run composer/phpunit from your plugin dir inside the container:
npx wp-env run cli --env-cwd=wp-content/plugins/my-plugin composer install
```

## PHPUnit: the tests instance is pre-wired

The `tests-cli` container ships **PHPUnit, Composer, and the WordPress PHPUnit test library** — verified: `WP_TESTS_DIR=/wordpress-phpunit` is set and `phpunit` is on the PATH. This removes the whole `install-wp-tests.sh` + throwaway-DB dance:

```bash
npx wp-env run tests-cli --env-cwd=wp-content/plugins/my-plugin phpunit
```

Point your `phpunit.xml` bootstrap at `getenv( 'WP_TESTS_DIR' )` and the suite runs against the tests instance's WordPress and database. For writing the tests themselves, and for the classic non-wp-env harness, see `wp-phpunit-test-setup`.

## Xdebug

```bash
npx wp-env start --xdebug                 # mode: debug (step debugging)
npx wp-env start --xdebug=profile,trace   # other modes, comma-separated
```

Verified: the restarted container reports Xdebug loaded (3.5.3 at test time). Configure the IDE to listen on **port 9003** with a path mapping from the wp-env WordPress sources to your local files. Without the flag, Xdebug is off — no need to "undo" it beyond a plain `start`.

## Critical rules

- **Use `npx @wordpress/env`, or install it as a dev dependency first** — bare `npx wp-env` in a bare project pulls an unrelated stub package, not the tool.
- **Docker must be running before any command** — the errors when it isn't are cryptic (connection refused on the Docker socket), not self-explanatory.
- **`core: null` tracks the latest production WordPress.** Pin `core` when the plugin must be tested against a specific version; re-run `start` after changing `.wp-env.json`.
- **Run PHPUnit against the tests instance** (`tests-cli`), never the dev one — the suite resets the database it points at.
- **`.wp-env.override.json` replaces `plugins`/`themes` wholesale** — merge semantics only apply to `config` and `mappings`.
- **`destroy` deletes volumes** (content, uploads, DB). Use `stop` for day-to-day; `clean` to reset databases only.

## Cross-references

- Run **`wp-docker-compose-stack`** when the project needs services wp-env doesn't model — Redis object cache, Mailpit, custom PHP extensions, nginx.
- Run **`wp-phpunit-test-setup`** for the PHPUnit harness details (polyfills, composer scripts, CI matrix) that apply on top of the tests instance.
- Run **`wp-phpcs-coding-standards`** — linting runs on the host, independent of wp-env; keep them separate concerns.

## What this skill does NOT cover

- Custom multi-service stacks (Redis, SMTP capture, nginx, phpredis) — that's `wp-docker-compose-stack`.
- Production hosting or deployment of any kind — wp-env is a development tool only.
- WordPress Playground / `wp-now` (browser-WASM sandboxes) — fine for throwaway demos, different tool.

## References

- wp-env documentation (canonical README): <https://github.com/WordPress/gutenberg/tree/trunk/packages/env>
- npm package: <https://www.npmjs.com/package/@wordpress/env>
- Block Editor Handbook — Getting started with wp-env: <https://developer.wordpress.org/block-editor/getting-started/devenv/get-started-with-wp-env/>
