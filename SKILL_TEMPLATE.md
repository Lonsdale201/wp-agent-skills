---
name: your-skill-name
description: >-
  One paragraph that answers WHAT this skill does and WHEN the agent
  should load it. List concrete triggers — function names, file
  patterns, user phrasings — so the model picks it up without being
  asked by name. Stay specific: "Audits WP plugin code for X when
  reviewing PRs or files containing Y, Z" beats "Helps with WP
  plugins". Hard maximum 1024 characters, and no XML/HTML-tag-like
  angle-bracket sequences (descriptions are embedded in XML prompt
  blocks).
metadata:
  wp-skills-author: "Your Name"
  wp-skills-contact: "mailto:you@example.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 6.7"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-04-28"
---

<!--
Frontmatter follows the open Agent Skills specification
(https://agentskills.io/specification): only name, description, license,
compatibility, metadata, and allowed-tools may appear top-level.
Collection-specific data lives under `metadata` as string -> string pairs
in the wp-skills-* namespace — quote every value, including versions and
dates; no lists or nested mappings. Documentation URLs and verified source
paths belong in the "## References" body section at the bottom, not in the
frontmatter.
-->

# Skill title

One-paragraph hook: what this skill does, who it's for, and one sentence on what it explicitly does NOT do.

## When to use this skill

Trigger this skill when ANY of the following is true:

- The user asks "...".
- The diff or file contains: `function_name`, `$_SUPERGLOBAL`, `wp_*` call, etc.
- The user is preparing to do X (release, refactor, integration).

(Be specific. Vague triggers cause false activations.)

## How to run / Workflow

Imperative steps for Claude to follow.

1. Read X.
2. Check Y.
3. For each finding, output Z.

Use code blocks for required snippets. Show before/after when correcting common mistakes.

```php
// WRONG
echo $_GET['name'];

// RIGHT
echo esc_html( wp_unslash( $_GET['name'] ?? '' ) );
```

## Critical rules

- Bullet list of non-negotiable rules.
- Each rule should be testable from source code alone.
- Include the WHY when it isn't obvious — Claude judges edge cases better with reasons.

## Severity guide (if the skill produces findings)

- **HIGH** — exploitable / breaks production.
- **MEDIUM** — exploitable under conditions.
- **LOW** — hardening / best practice.

## Report format (if the skill produces a report)

```
# <Skill name> report
Scope: <files reviewed>
Date: <YYYY-MM-DD>

## HIGH
1. <file>:<line> — <issue>
   <code>
   Fix: <code>
```

## Cross-references

- Run **`other-skill-name`** when [condition].
- See **`another-skill`** for [adjacent topic].

(Three references max. Cross-references work as suggestions; Claude does not auto-invoke them.)

## What this skill does NOT cover

- Explicit out-of-scope item.
- Another out-of-scope item.

(State scope clearly. This prevents the skill from overpromising.)

## References

- Official documentation: <https://developer.wordpress.org/...>
- Verified source paths:
  - `wp-content/plugins/<plugin>/includes/example.php`
- Detailed examples and edge cases: `reference.md` or `references/` (only if the skill is split).
- Real-world snippets: `examples/` (only if the skill has examples).

(Documentation URLs and source paths the skill was grounded against live
here — the open format's `metadata` only allows string values, so lists
like these belong in the body.)
