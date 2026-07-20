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

## Required frontmatter (open Agent Skills format)

This collection follows the open [Agent Skills specification](https://agentskills.io/specification), so the skills work in Claude, Codex, and any other Agent Skills-compatible client. Only these top-level frontmatter keys are allowed:

`name`, `description` (required) · `license`, `compatibility`, `metadata`, `allowed-tools` (optional)

Everything collection-specific lives under `metadata` as **string → string** pairs in the `wp-skills-*` namespace. No other top-level key is accepted — CI rejects it.

Every `SKILL.md` starts with this block:

```yaml
---
name: kebab-case-name
description: >-
  One paragraph (max 1024 chars, hard limit). Two things must be answered —
  WHAT the skill does, and WHEN the agent should use it. List concrete
  trigger signals (function names, file patterns, user phrasings) so the
  model picks it up without being asked by name. No XML/HTML-tag-like
  angle-bracket sequences.
metadata:
  wp-skills-author: "Your Name"
  wp-skills-contact: "https://github.com/your-handle"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "X.Y - X.Y"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "YYYY-MM-DD"
---
```

### Field rules

- **`name`** — 1-64 chars of `[a-z0-9-]`, no leading/trailing/consecutive hyphens, MUST equal the folder name, and must not contain the reserved words "anthropic" or "claude".
- **`description`** — the single most important field. See [Writing the description](#writing-the-description) below.
- **`license`** *(optional, top-level — standard field)* — a short license name (`GPLv2-or-later`, `MIT`) or a reference to a bundled license file. Don't invent one; omit it to inherit the repo default.
- **`compatibility`** *(optional, top-level — standard field, max 500 chars)* — only for real runtime requirements (PHP version, system binaries, network access). Do NOT restate `wp-skills-plugin-version-tested` here; a tested version is not a minimum requirement. Most skills don't need this.
- **`allowed-tools`** *(optional, experimental)* — a single space-separated string of pre-approved tools. Don't add it unless the skill genuinely needs it.

### The `metadata` block (wp-skills-* namespace)

The spec defines `metadata` as a map from string keys to string values — **every value must be a quoted string** (including versions and dates), and lists or nested mappings are invalid. Keys are namespaced `wp-skills-*` so they can't collide with other skill collections.

- **`wp-skills-author`** — required. Your real name or a stable handle. Runtimes ignore it, but reviewers and human readers need to know who owns the content.
- **`wp-skills-contact`** *(optional, recommended)* — a single URL or `mailto:` where humans can reach the author. GitHub profile is the most useful form. If omitted, readers fall back to the repo's issue tracker.
- **`wp-skills-plugin`** — required. The WP plugin slug or `wordpress` for core. Lowercase.
- **`wp-skills-plugin-version-tested`** — required. Versions you actually ran the skill end-to-end against. Range or single. **This is NOT a "supported range" claim** — it records "at least this works". Update whenever you re-test.
- **`wp-skills-wp-version-tested`** *(optional)* — the WordPress core version verified against, when it matters separately from the plugin version.
- **`wp-skills-php-min`** — required. Minimum PHP version the code samples support.
- **`wp-skills-api-stable-since`** *(optional)* — if the underlying API has been stable since an earlier version, record it, and add a short "API stability note" paragraph in the body.
- **`wp-skills-last-updated`** *(strongly recommended)* — ISO date `YYYY-MM-DD` of the last meaningful edit. Bump when the workflow, triggers, or code samples change; not for typo fixes. Skills older than ~12 months without a bump are candidates for re-verification.

### Where did `docs:` and `source-refs:` go?

They are **body content now**, because the portable `metadata` mapping only holds strings, not lists. Put documentation URLs and the source paths you verified the skill against in the `## References` section at the bottom of the body:

```markdown
## References

- Official documentation: <https://developer.wordpress.org/...>
- Verified source paths:
  - `wp-content/plugins/<plugin>/includes/example.php`
```

Merge into the existing References section if the skill already has one — don't create a duplicate heading, and don't repeat URLs or paths already listed there.

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
5. Stay under 1024 characters — this is a hard limit in the Agent Skills spec, not a style preference.
6. No XML/HTML-tag-like `<...>` sequences — descriptions get embedded in XML prompt blocks by Agent Skills clients. Write `` `img` `` element instead of an angle-bracketed tag. PHP arrows (`->`, `=>`) are fine.
7. Write in third person ("Audits...", "Registers..."), imperative trigger clauses ("Use when...").

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
4. **Frontmatter validation.** The official reference validator is the primary check — install [`skills-ref`](https://github.com/agentskills/agentskills/tree/main/skills-ref) (Python: `pip install <path-to>/agentskills/skills-ref`) and run:

   ```bash
   skills-ref validate path/to/your-skill
   ```

   (On Windows set `PYTHONUTF8=1` — the reference tool reads files with the locale encoding.) Then run the repo validator, which layers the collection's own rules (wp-skills-* metadata, emoji-free, secrets scan) on top:

   ```bash
   node .github/scripts/validate-skill.js --all
   ```
5. **Re-read your description out of context.** If you didn't know what the skill did, would the description tell you?

## Pull request checklist

Copy this into your PR body:

- [ ] Skill folder name matches `name` in frontmatter.
- [ ] No non-standard top-level frontmatter keys (only name, description, license, compatibility, metadata, allowed-tools).
- [ ] `metadata.wp-skills-author` is set; all metadata values are quoted strings.
- [ ] `description` lists concrete triggers (functions, files, phrasings), is ≤1024 chars, and has no `<...>` tag-like sequences.
- [ ] `metadata.wp-skills-plugin-version-tested` reflects versions actually verified.
- [ ] Documentation URLs / verified source paths are in the body `## References` section, not the frontmatter.
- [ ] `skills-ref validate` passes on the skill folder.
- [ ] SKILL.md is < 300 lines, or split with reference.md.
- [ ] Tested trigger activation in a fresh Claude Code session.
- [ ] Tested skill output on at least two real plugins.
- [ ] No emoji, no marketing language, imperative voice.
- [ ] Cross-references (if any) point to existing skill names.
- [ ] No hardcoded secrets, real user data, or proprietary code in examples.

## Maintaining existing skills

When you update an existing skill:

- Bump `wp-skills-plugin-version-tested` only if you actually re-tested.
- Bump `wp-skills-last-updated` whenever the workflow, triggers, or code samples meaningfully change. Don't bump for typo / link fixes.
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
