# rules

Short, always-relevant WordPress **invariants** meant to be injected into every (or nearly every) agent turn — as opposed to [skills](../README.md), which the agent pulls in on demand.

## Rules vs. skills

The two are complementary, not competing:

| | **Rule** (this folder) | **Skill** (domain folders) |
|---|---|---|
| How it loads | **Pushed** — always-on, or auto-attached by file glob | **Pulled** — the agent's router matches the `description` and decides |
| Content | Invariants: "always / never", a few lines | Playbooks: how to do a specific task, in depth |
| Length | Tiny (a few hundred tokens) | 100–300 lines |
| Risk if it grows | Bloats every turn, dilutes focus | None — only loaded when relevant |

Rule of thumb: **if it's true for *every* task, it's a rule; if it only matters for *some* tasks, it's a skill.** A rule states the invariant and points at a skill for the full pass — it never duplicates the skill.

Because rules are always-on, they must stay short. There are deliberately only a handful, at most one or two per topic.

## Frontmatter

> **Not the SKILL.md schema — on purpose.** Skills in this repo follow the open [Agent Skills specification](https://agentskills.io/specification) (`name` / `description` / `metadata` with the `wp-skills-*` namespace). Rules do **not**: they are not skills, and their frontmatter keys below are a deliberate 1:1 mapping onto tool-specific rule formats (Cursor `globs` / `alwaysApply`, Copilot `applyTo`, Windsurf activation modes). Do not "migrate" these files to the skills schema — that would break the tool mappings documented below.

```yaml
---
name: wp-core-baseline          # identifier = filename
description: >                  # what it is / when it applies (used by glob-less tools to auto-attach)
  One paragraph.
scope: global                   # global = reusable on any WP project · project = repo-specific
globs:                          # file patterns that auto-attach the rule (see below)
  - "**/*.php"
always-apply: false             # true = always in context · false = attach only on matching globs
version: "1.0.0"
last-updated: "2026-07-01"
---
```

### Activation: `always-apply` vs `globs`

- `always-apply: true` — the rule is in context on every message. Use only for truly universal, tiny rules.
- `always-apply: false` + `globs` — the rule attaches only when a matching file is in scope. Preferred for code baselines: e.g. `**/*.php` means "only when PHP is on the table", so plain chat doesn't pay the token cost.

## Using these in your tool

There is no single cross-tool rules format, so treat the file here as the **canonical source** and drop it into your tool's location:

| Tool | Location | Maps to |
|---|---|---|
| Cursor | `.cursor/rules/<name>.mdc` | frontmatter `description`, `globs`, `alwaysApply` |
| Windsurf | `.windsurf/rules/<name>.md` | activation mode: *Always On* / *Glob* / *Model decision* / *Manual* |
| GitHub Copilot | `.github/instructions/<name>.instructions.md` | frontmatter `applyTo: "**/*.php"` |
| Claude Code | paste into `CLAUDE.md` (project) or `~/.claude/CLAUDE.md` (global) | always injected |
| Antigravity / Cline / others | the tool's Rules panel or rules dir | always-on or scoped, per the tool |

The frontmatter keys above map 1:1 onto those tools — `globs` → Cursor `globs` / Copilot `applyTo`, `always-apply` → Cursor `alwaysApply` / Windsurf *Always On*.

## A note on the skill references

Each rule ends with a "defer to skills" pointer (e.g. *"full security review → `wp-security-audit`"*). Those refer to skills in this repo. In a tool where those skills aren't installed, the pointer is a harmless no-op — the invariant still applies, it just won't auto-open the deeper playbook.

## Available rules

| Rule | Applies to | Purpose |
|---|---|---|
| `wp-core-baseline` | `**/*.php` | Non-negotiable WordPress security, i18n, and coding-standard invariants for every plugin/theme PHP task. |
| `woocommerce-baseline` | `**/*.php` | WooCommerce invariants — CRUD over raw meta, HPOS-safe order access, Store API for block checkout, money/stock handling. Builds on `wp-core-baseline`. |
