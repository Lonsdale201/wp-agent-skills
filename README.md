# wp-agent-skills

A community-maintained collection of **agent skills** for WordPress plugin and theme development.

These skills give an AI coding assistant a concrete, version-tested playbook for common WordPress development tasks — security audits, scaffolding, REST API patterns, plugin-specific helpers (WooCommerce, JetEngine, JetFormBuilder, etc.) — so you spend less time re-explaining "the WordPress way" on every project.

> **Tool compatibility.** Plain Markdown + YAML frontmatter (the [Anthropic Skills](https://docs.anthropic.com/claude/docs/skills) shape). Primarily tested with **Claude Code** and **claude.ai**, but any agent runtime that consumes a `SKILL.md` (Cursor rules, Aider conventions, custom Agent SDK apps, etc.) can use the same files directly or with a thin adapter.

## What's a skill?

A skill is a folder with a `SKILL.md` file that tells the agent **when** to use it and **how** to do the work. The runtime loads it on demand based on the YAML `description` in the frontmatter.

This repo is **not** a plugin, runtime, or framework. It's documentation that an AI consumes. There's nothing to install in your WordPress site.

## Repository structure

Skills are grouped by domain. Each domain has its own README listing the skills it contains — open the domain you care about for the full table.

| Domain | What it covers |
|---|---|
| [`wordpress/`](wordpress) | Core WP topics that apply to any plugin or theme — security, i18n, REST API, the Abilities API, HTML/UTF-8 helpers, query cache. |
| [`plugin-scaffold/`](plugin-scaffold) | Building a new plugin from scratch — bootstrap, lifecycle, architecture, options storage, cron, hooks, rewrite rules, asset loading, Action Scheduler. |
| [`woocommerce/`](woocommerce) | WooCommerce core skills + extension-family skills (Subscriptions, Memberships, Stripe, etc.). |
| [`jetformbuilder/`](jetformbuilder) | Extending JetFormBuilder — settings tabs, form sidebar panels, custom Form Actions, action events, item decorators, external-API actions. |
| [`jet-engine/`](jet-engine) | Extending JetEngine — Dynamic Visibility conditions, Listings callbacks, Query Builder custom query types. |
| [`better-data/`](better-data) | **Contributor** skills for the [better-data](https://github.com/lonsdale201/better-data) PHP library. |
| [`better-route/`](better-route) | **Consumer** skills for the [better-route](https://github.com/Lonsdale201/better-route) PHP library. |
| [`lw-plugins/`](lw-plugins) | LW Plugins family — LW LMS, LW Site Manager. |
| [`wp-rocket/`](wp-rocket) | WP Rocket integration skills — cache invalidation and filter hooks for third-party plugins / themes. |
| [`redis-object-cache/`](redis-object-cache) | Redis Object Cache (`redis-cache`) integration — drop-in lifecycle, `WP_REDIS_*` config, `wp redis` CLI, and correct `wp_cache_*` usage with persistent object caching. |
| [`fluentcrm/`](fluentcrm) | Extending FluentCRM — funnel triggers / actions / benchmarks, `rest_selector` option lists, and the Free / Pro extension contract. |
| [`theme-development/`](theme-development) | Classic (non-FSE) PHP theme development — structure, template hierarchy, the Loop, menus, widgets, comments, media, the Customizer, assets, i18n, accessibility, security, and classic-theme WooCommerce integration. |
| [`translatepress/`](translatepress) | Making your own plugin/theme **TranslatePress-compatible** — translatable output and exclusions, URL/SEO/slug and Different-Domain behavior, language switchers and navigation, and recipient-language emails. Covers the free core plus the Business add-ons. |
| [`elementor/`](elementor) | Building **Elementor** addon plugins — registering Dynamic Tags, their controls and fallback behavior, AJAX item pickers for large datasets, and auditing deprecated Elementor APIs. Extends the free base classes and feature-detects Pro. |
| [`szamlazzhu/`](szamlazzhu) | Making your own WooCommerce extension cooperate with **Integration for Szamlazz.hu & WooCommerce** — invoice line items / XML / document timing and B2B VAT-number checkout, via the plugin's hooks and canonical data model rather than duplicating it. |
| [`dev-tooling/`](dev-tooling) | Testing & QA tooling for plugins/themes — PHPUnit (scaffold, harness, CI, writing tests), PHP_CodeSniffer + WordPress Coding Standards, and PHPStan, wired through Composer. The developer pipeline beside the code, not WP runtime APIs. |
| [`polylang/`](polylang) | Making your own plugin/theme **Polylang-compatible** — the guarded public language API, translated post/term groups via the model (not raw DB writes), Pro slugs / sync / ACF behavior, REST & headless `lang` semantics, string/option translation, and Polylang for WooCommerce data stores. Covers the free core plus Polylang Pro and Polylang for WooCommerce. |

New domain folders follow the same convention: top-level folder per plugin (or plugin family), one subfolder per skill, each containing at minimum a `SKILL.md`. Larger skills may also include `reference.md`, `examples/`, or `scripts/`.

The folder layout is the source of truth — there is intentionally no flat list of every skill in this README. As the collection grows, the per-domain READMEs scale, this file does not.

## Machine-readable index

The repository also publishes [`skills-index.json`](skills-index.json), a generated catalog of every skill, its domain, description, source path, raw `SKILL.md` URL, frontmatter metadata, and bundled resource files.

The index is intended for thin adapters, install scripts, websites, MCP servers, and other tooling that should not have to crawl the GitHub tree. It is generated from the folder layout:

```bash
npm install --no-save --no-package-lock js-yaml@4
node .github/scripts/build-skills-index.js
```

CI checks that `skills-index.json` stays in sync with the committed `SKILL.md` files.

## Using these skills

### Claude Code

Symlink (or copy) the skills into your global skills directory:

```bash
# clone once
git clone https://github.com/Lonsdale201/wp-agent-skills.git ~/wp-agent-skills

# symlink the ones you want
mkdir -p ~/.claude/skills
ln -s ~/wp-agent-skills/wordpress/wp-security-audit ~/.claude/skills/wp-security-audit
ln -s ~/wp-agent-skills/wordpress/wp-i18n-audit     ~/.claude/skills/wp-i18n-audit
# ...etc
```

Or symlink a whole domain at once if you want everything from it.

Per-project (skills only available inside a specific repo):

```bash
mkdir -p .claude/skills
ln -s ~/wp-agent-skills/wordpress/wp-security-audit .claude/skills/wp-security-audit
```

### claude.ai / Agent SDK

Upload the skill folder via the UI or SDK as documented in [Anthropic's skills docs](https://docs.anthropic.com/claude/docs/skills).

### Other agent runtimes

The format is markdown + YAML frontmatter, so most agent tools can consume it directly or with a thin adapter (e.g. symlink as a Cursor rule under `.cursor/rules/`, or include in an Aider read-list). The `name`, `description`, and body conventions are stable; only the host runtime's loading mechanism differs.

### Triggering a skill

Once installed, just ask the agent in natural language:

- *"Run a security audit on this plugin."*
- *"Check this file for i18n issues before I push."*
- *"Add a custom checkout field to WooCommerce."*

The skill's `description` matches your intent and the agent loads it automatically. You can also force one explicitly: *"Use the wp-security-deep skill on `class-rest-controller.php`."*

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what was added or updated and when. Entries are date-based — this is a continuously-evolving documentation collection, not a versioned release artifact.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for naming rules, the required frontmatter shape, the writing checklist, and the PR process.

There's a starter template at [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md).

## License

All skills in this repository are released under the MIT License unless a specific skill's folder declares otherwise. See [LICENSE](LICENSE).

This is a non-commercial community project. Skills are documentation, not executable software — but they shape what AI does in your codebase, so quality and clarity matter.
