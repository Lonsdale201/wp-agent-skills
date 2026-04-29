# Contributing

Thanks for considering a contribution. This repo lives or dies on skill **quality**, not quantity. A small set of well-tuned skills beats a sprawling collection that triggers wrongly or contradicts itself.

## Submission flow

There are four ways to engage. Pick the one that matches your intent.

| Intent | Use | What happens |
|---|---|---|
| Submit a brand-new skill (with content) | **[Submit a skill](../../issues/new?template=new-skill.yml)** issue form | Bot validates the form, builds the SKILL.md, opens a PR against `contrib`. You can edit the issue to fix errors and it retries. |
| Report a problem with an existing skill | **[Report a skill problem](../../issues/new?template=report-skill.yml)** issue form | Maintainer triages; you (or a contributor) open a PR with the fix. |
| Ask a question | **[Question](../../issues/new?template=question.yml)** issue form | Conversation in the issue thread. |
| Suggest a skill that should exist (without writing it) | **[Request a skill](../../issues/new?template=request-skill.yml)** issue form | Maintainer evaluates demand and either picks it up or invites contributors. |
| Tiny fix to an existing skill (typo, link, version bump) | Direct PR against `contrib` | CI validates; maintainer merges. |
| Larger edit / refactor of an existing skill | Open a *Report a skill problem* or *Question* issue first to align on scope, then PR against `contrib` | Same as above. |

> Only the maintainer (`@Lonsdale201`) merges `contrib` → `main` periodically. Direct pushes to `main` are blocked by branch protection.

### Why is the *Submit a skill* form a hard requirement for new skills?

It guarantees frontmatter shape, runs pre-checks (kebab-case name, ≤1024-char description, name uniqueness, no duplicate folder, no path traversal in filenames, no obvious secrets), and produces a clean PR with the right path, label, and review checklist. Editing the issue retriggers the bot, so fixing validation errors is a one-click loop.

## Repository layout rules

- Skills live in domain folders: `wordpress/`, `woocommerce/`, `jetformbuilder/`. Add a new domain folder only when you have ≥2 skills for it; otherwise file under `wordpress/` and tag the plugin in frontmatter.
- One skill = one folder. Folder name = skill name = kebab-case.
- The SKILL.md filename is **uppercase** (`SKILL.md`), not `skill.md`. The runtime is case-sensitive on Linux.

## Required frontmatter

Every `SKILL.md` starts with this block:

```yaml
---
name: kebab-case-name
description: One paragraph (max ~1024 chars). Two things must be answered —
  WHAT the skill does, and WHEN Claude should use it. List concrete trigger
  signals (function names, file patterns, user phrasings) so the model
  picks it up without being asked by name.
author: Your Name
contact: https://github.com/<your-handle>   # or mailto:you@example.com
plugin: wordpress | woocommerce | jetformbuilder | <slug>
plugin-version-tested: "X.Y - X.Y"
php-min: "7.4"
last-updated: "YYYY-MM-DD"
docs:
  - https://...
---
```

### Field rules

- **`name`** — `[a-z0-9-]`, max 64 chars, MUST equal the folder name.
- **`description`** — the single most important field. See [Writing the description](#writing-the-description) below.
- **`author`** — required. Your real name or a stable handle you want associated with the skill. The Claude runtime ignores this field, but human readers (and PR reviewers) need to know who owns the content. Use the same form across your skills so a glance at the repo shows authorship continuity.
- **`contact`** *(optional, recommended)* — a single URL or `mailto:` where humans can reach the author with skill-specific issues. GitHub profile (`https://github.com/<handle>`) is the most useful form because issues / DMs / PRs are all reachable from one place. The Claude runtime ignores this field — it's purely a courtesy for human readers who want to flag a bug in your skill without filing a PR. If omitted, readers fall back to the repo's issue tracker.
- **`plugin`** — the WP slug or `wordpress` for core. Lowercase.
- **`plugin-version-tested`** — versions you actually ran the skill end-to-end against. Range or single. **This is NOT a "supported range" claim** — most WP/plugin APIs are stable for years and the skill almost certainly works on older and newer versions too. The field records "at least this works" so future maintainers know what's been verified. Update whenever you re-test.
- **`api-stable-since`** *(optional)* — if you know the underlying API has been stable since an earlier version, record it here. Saves users from worrying about version pinning when the API hasn't changed in five years. If you add this, also include a short "API stability note" paragraph at the top of the SKILL.md body explaining the situation.
- **`php-min`** — minimum PHP version the code samples support.
- **`last-updated`** *(optional, strongly recommended)* — ISO date `YYYY-MM-DD` of the last meaningful edit to the skill content. Bump this whenever you touch the workflow, the trigger list, or the code samples; do NOT bump for typo fixes alone. The Claude runtime ignores it; it exists so a future maintainer (or a user comparing two competing skills) can tell at a glance whether this one has been kept up to date. Skills older than ~12 months without a bump are candidates for re-verification — flag them in PR review rather than silently trusting.
- **`docs`** — optional list of URLs the skill links into. Useful for the model and for human readers.

Optional but supported by the WP-skills convention:
- **`wp-version-tested`**, **`source-refs`** (list of source paths inside the target plugin), **`license`**.

The Claude runtime ignores unknown keys, so add what you need for human discoverability — but keep it tidy.

## Writing the description

The `description` is what Claude reads to decide whether to load your skill. It's a router prompt, not a marketing blurb.

**Good:**

```yaml
description: Audits WP plugin PHP for missing nonce checks, capability
  checks, sanitization, output escaping, SQL preparation, AJAX nopriv
  exposure, and unsafe redirects. Use when reviewing PRs, before
  release, or when handling code that touches $_GET / $_POST,
  admin-ajax, register_rest_route, $wpdb->, or wp_redirect.
```

**Bad:**

```yaml
description: Helps with WordPress plugin security.
```

Rules:

1. State the task in one sentence at the top.
2. List trigger signals: function names, file patterns, user phrasings.
3. Be specific enough that a sibling skill in the same area doesn't also match. If two skills both say "WordPress security", neither will be picked correctly.
4. Don't reference the body ("see below"). The body is not loaded at selection time.
5. Stay under ~1024 characters. Long descriptions get truncated and waste the router's attention.

## Skill body structure

Aim for these sections, in order. Adapt as needed — they're a strong default, not a rigid template:

```markdown
# Skill title

One-paragraph hook explaining what the skill does and what it explicitly does NOT do.

## When to use this skill
Bulleted list of trigger conditions, redundant with the description but more specific.

## How to run / Audit checks / Workflow
The actual instructions to Claude. Imperative voice ("Verify X", "Check Y"), not descriptive ("This skill verifies X").

## Severity guide / Report format
If the skill produces output, define the format here so reports are consistent.

## Cross-references
Other skills the user should run alongside this one.

## What this skill does NOT cover
Explicit out-of-scope. Prevents Claude from overpromising.

## References
Links to docs, source, deeper reference files.
```

## Writing style

- **Imperative voice.** "Verify the nonce", not "The skill verifies the nonce". The SKILL.md is an instruction to the model.
- **Short.** Aim for 100-300 lines. If you're past 300, split into `reference.md` for the long material.
- **Code over prose.** A four-line before/after snippet beats a paragraph of explanation.
- **Cite source paths and hook names.** Concrete references age better than abstract advice.
- **No emoji, no decorative headers, no marketing tone.** This is technical documentation read by an AI.

## Progressive disclosure: when to split files

| SKILL.md size | What to do |
|---|---|
| < 150 lines | Single file, no split. |
| 150-300 lines | Single file, but reconsider the scope. |
| 300+ lines | Move detailed examples and deep reference into `reference.md`. The SKILL.md links to it. |
| Repeated boilerplate snippets | Move to `examples/` as separate files. |
| Deterministic, environment-independent operations | Add a `scripts/` folder and reference scripts from the SKILL.md. |

`reference.md` and `examples/` files are loaded by Claude only when the SKILL.md instructs it to read them. They don't cost context window unless used.

## When a script is appropriate

The WP ecosystem is heterogeneous (LocalWP, DDEV, wp-env, raw SSH, Bedrock, etc.). Most skills should be **prose only**.

Add a script only if it's:
- Environment-independent (regex over PHP source, JSON parsing, no `wp-cli` required), AND
- Deterministic in a way the model would otherwise hallucinate (e.g. `readme.txt` format validation).

Mark optional scripts as optional in the SKILL.md prose: *"If `scripts/check.sh` is available, run it; otherwise verify manually."*

## Cross-references between skills

Skills can mention each other. Use this when one skill's scope cleanly ends where another begins:

```markdown
## Cross-references
- Run `wp-security-audit` first for the basic checklist.
- Run `wp-security-secrets` whenever auth code is in scope.
```

Claude doesn't auto-invoke cross-referenced skills, but it surfaces them to the user as a follow-up suggestion. Don't over-link — three references is plenty.

## Testing your skill

Before opening a PR:

1. **Trigger test.** Drop the skill into your `~/.claude/skills/`. Open a fresh Claude Code session in a real plugin you didn't write. Ask a vague question that should match. Did the skill activate? Did the right one activate (and not a sibling)?
2. **Outcome test.** Run the skill on at least two real plugins (different sizes, different authors). Did the output match the report format you defined? Were there false positives? Misses?
3. **Cross-reference test.** If you added cross-references, verify the named skills exist with that exact name.
4. **Frontmatter validation.** Run `php -r 'require "vendor/autoload.php"; var_dump(\Symfony\Component\Yaml\Yaml::parse(file_get_contents("SKILL.md")));'` or any YAML linter. The frontmatter must parse.
5. **Re-read your description out of context.** If you didn't know what the skill did, would the description tell you?

## Pull request checklist

Copy this into your PR body:

- [ ] Skill folder name matches `name` in frontmatter.
- [ ] `author` field is set.
- [ ] `description` lists concrete triggers (functions, files, phrasings).
- [ ] `plugin-version-tested` reflects versions actually verified.
- [ ] SKILL.md is < 300 lines, or split with reference.md.
- [ ] Tested trigger activation in a fresh Claude Code session.
- [ ] Tested skill output on at least two real plugins.
- [ ] No emoji, no marketing language, imperative voice.
- [ ] Cross-references (if any) point to existing skill names.
- [ ] No hardcoded secrets, real user data, or proprietary code in examples.

## Maintaining existing skills

When you update an existing skill:

- Bump `plugin-version-tested` only if you actually re-tested.
- Bump `last-updated` whenever the workflow, triggers, or code samples meaningfully change. Don't bump for typo / link fixes.
- Add a one-line entry to the skill's `CHANGELOG.md` if the file exists. If not, the git log is sufficient.
- Avoid breaking changes to the skill `name` — that breaks every user's symlinks.

## What we don't accept

- Skills that wrap a single hook or function — too narrow. Aggregate.
- Skills that duplicate official WP documentation without adding judgment, severity, or workflow.
- Skills that recommend insecure patterns even as "alternatives".
- Skills that hardcode commercial / paid plugin source paths without an open-source equivalent.
- Skills with a `description` so vague every PR review triggers them.

## Questions

Open a discussion in the GitHub repo or file an issue tagged `question`.
