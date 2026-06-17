#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PARSED_PATH = path.join(ROOT, '.build', 'parsed.json');
const OUT_ROOT = path.join(ROOT, '.build', 'output');
const ERR_PATH = path.join(ROOT, '.build', 'error-comment.md');
const PR_BODY_PATH = path.join(ROOT, '.build', 'pr-body.md');

const ALLOWED_DOMAINS = new Set([
  'wordpress',
  'plugin-scaffold',
  'woocommerce',
  'jetformbuilder',
  'jet-engine',
  'better-data',
  'better-route',
  'lw-plugins',
  'wp-rocket',
  'redis-object-cache',
  'fluentcrm',
  'theme-development',
  'translatepress',
  'elementor',
]);

function emitOutput(key, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function errorAndExit(errors) {
  const lines = [
    'Thanks for the submission. The form failed validation — please edit the issue body to fix the items below, and the bot will retry automatically.',
    '',
    ...errors.map((e) => `- ${e}`),
    '',
    '_Re-saving the issue retriggers the bot._',
  ];
  fs.writeFileSync(ERR_PATH, lines.join('\n'));
  emitOutput('status', 'error');
  process.exit(0);
}

function readParsed() {
  const raw = fs.readFileSync(PARSED_PATH, 'utf8').trim();
  if (!raw) errorAndExit(['Could not read parsed issue body. Re-save the issue.']);
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    errorAndExit([`Form parse failed: ${e.message}`]);
  }
  return json;
}

function strOrEmpty(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(strOrEmpty).filter(Boolean).join('\n');
  return String(v).trim();
}

function isNoResponse(v) {
  const s = strOrEmpty(v).toLowerCase();
  return s === '' || s === '_no response_';
}

function valOrEmpty(v) {
  return isNoResponse(v) ? '' : strOrEmpty(v);
}

function humanizeName(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function indentList(items) {
  return items.map((u) => `  - ${u}`).join('\n');
}

function buildFrontmatter(fields) {
  const lines = ['---'];
  lines.push(`name: ${fields.name}`);
  // YAML block scalar for description to avoid quoting headaches
  lines.push('description: |');
  for (const l of fields.description.split('\n')) lines.push(`  ${l}`);
  lines.push(`author: ${fields.author}`);
  if (fields.contact) lines.push(`contact: ${fields.contact}`);
  lines.push(`plugin: ${fields.plugin}`);
  lines.push(`plugin-version-tested: "${fields.plugin_version_tested}"`);
  lines.push(`php-min: "${fields.php_min}"`);
  lines.push(`last-updated: "${new Date().toISOString().slice(0, 10)}"`);
  if (fields.docs.length) {
    lines.push('docs:');
    lines.push(indentList(fields.docs));
  }
  lines.push('---');
  return lines.join('\n');
}

function parseExamplesBlock(text) {
  if (!text) return [];
  const out = [];
  const re = /---\s*file:\s*([^\n]+?)\s*---\s*\n([\s\S]*?)(?=\n---\s*file:|\s*$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ filename: m[1].trim(), content: m[2].trim() + '\n' });
  }
  return out;
}

function safeExampleFilename(name) {
  // Whitelist: no leading dot, no path separators, no traversal, .md only.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.md$/.test(name)) return null;
  if (name.includes('..')) return null;
  return name;
}

function validateChecklist(checklist) {
  // Form output for checkboxes is the markdown body of "- [x] Item" / "- [ ] Item"
  // We require ALL options to be checked.
  const text = strOrEmpty(checklist);
  const total = (text.match(/^- \[[ xX]\]/gm) || []).length;
  const checked = (text.match(/^- \[[xX]\]/gm) || []).length;
  if (total === 0) {
    return ['Checklist is missing — re-save the form.'];
  }
  if (checked < total) {
    return [`All ${total} pre-submission checklist boxes must be checked (currently ${checked}/${total}).`];
  }
  return [];
}

function main() {
  const j = readParsed();

  const errors = [];

  // Required fields
  const name = valOrEmpty(j.name);
  const description = valOrEmpty(j.description);
  const author = valOrEmpty(j.author);
  const plugin = valOrEmpty(j.plugin);
  const plugin_version_tested = valOrEmpty(j.plugin_version_tested);
  const php_min = valOrEmpty(j.php_min);
  const body = valOrEmpty(j.body);
  const domain = valOrEmpty(j.domain);
  const domain_other = valOrEmpty(j.domain_other);
  const title = valOrEmpty(j.title);
  const contact = valOrEmpty(j.contact);
  const docsRaw = valOrEmpty(j.docs);
  const referenceMd = valOrEmpty(j.reference_md);
  const examplesRaw = valOrEmpty(j.examples);
  const checklist = j.checklist;

  if (!name) errors.push('`name` is required.');
  if (!description) errors.push('`description` is required.');
  if (!author) errors.push('`author` is required.');
  if (!plugin) errors.push('`plugin` is required.');
  if (!plugin_version_tested) errors.push('`plugin-version-tested` is required.');
  if (!php_min) errors.push('`php-min` is required.');
  if (!body) errors.push('`SKILL.md body` is required.');
  if (!domain) errors.push('`Domain folder` is required.');

  // Name format
  if (name) {
    if (!/^[a-z0-9-]{1,64}$/.test(name)) {
      errors.push(`Name "${name}" must match /^[a-z0-9-]{1,64}$/ (kebab-case, max 64 chars).`);
    }
    if (/^-|-$/.test(name)) {
      errors.push('Name must not start or end with a hyphen.');
    }
    if (/--/.test(name)) {
      errors.push('Name must not contain consecutive hyphens.');
    }
  }

  // Description length
  if (description && description.length > 1024) {
    errors.push(`Description is ${description.length} chars; max 1024.`);
  }
  if (description && /\bsee below\b/i.test(description)) {
    errors.push('Description must not say "see below" — the body is not loaded at selection time.');
  }
  if (description && /\bhelps with\b/i.test(description)) {
    errors.push('Description starting with "Helps with…" is too vague. State the task and concrete trigger signals.');
  }

  // Domain
  let resolvedDomain = domain;
  if (domain === 'other') {
    if (!domain_other) {
      errors.push('Domain = "other" requires `New domain name`.');
    } else if (!/^[a-z0-9-]{1,64}$/.test(domain_other)) {
      errors.push(`New domain "${domain_other}" must be kebab-case, [a-z0-9-], max 64 chars.`);
    } else {
      resolvedDomain = domain_other;
    }
  } else if (domain && !ALLOWED_DOMAINS.has(domain)) {
    errors.push(`Domain "${domain}" is not in the allow-list.`);
  }

  // plugin-version-tested format
  if (plugin_version_tested && !/^\d+(\.\d+)+(\s*-\s*\d+(\.\d+)+)?$/.test(plugin_version_tested)) {
    errors.push(`plugin-version-tested "${plugin_version_tested}" should look like "10.5" or "10.0 - 10.5".`);
  }

  // Body must NOT contain a frontmatter block
  if (body && /^---\s*$/m.test(body.split('\n').slice(0, 2).join('\n'))) {
    errors.push('Do not include a `---` frontmatter block in the body — the bot generates the frontmatter from form fields.');
  }

  // Folder collision
  if (name && resolvedDomain) {
    const target = path.join(ROOT, resolvedDomain, name);
    if (fs.existsSync(target)) {
      errors.push(`Path \`${resolvedDomain}/${name}/\` already exists in the repo. Pick a different name or open a PR to extend the existing skill.`);
    }
  }

  // Checklist
  errors.push(...validateChecklist(checklist));

  // Docs parse
  const docs = docsRaw
    ? docsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];
  for (const u of docs) {
    if (!/^https?:\/\//.test(u)) {
      errors.push(`docs entry must be an http(s) URL: "${u}".`);
    }
  }

  // Contact format (if present)
  if (contact && !/^https?:\/\//.test(contact) && !/^mailto:/.test(contact)) {
    errors.push(`contact must be an http(s) URL or mailto: "${contact}".`);
  }

  if (errors.length) errorAndExit(errors);

  // ---- Build files ----
  const titleResolved = title || humanizeName(name);
  const fm = buildFrontmatter({
    name,
    description,
    author,
    contact,
    plugin,
    plugin_version_tested,
    php_min,
    docs,
  });

  const skillBody = body.replace(/^# .+\n+/, '').trimEnd() + '\n';
  const skillMd = `${fm}\n\n# ${titleResolved}\n\n${skillBody}`;

  const skillDir = path.join(OUT_ROOT, resolvedDomain, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);

  if (referenceMd) {
    fs.writeFileSync(path.join(skillDir, 'reference.md'), referenceMd.trimEnd() + '\n');
  }

  const examples = parseExamplesBlock(examplesRaw);
  if (examples.length) {
    const safeExamples = [];
    for (const ex of examples) {
      const safeName = safeExampleFilename(ex.filename);
      if (!safeName) {
        errors.push(`examples filename "${ex.filename}" must be safe (single-segment, .md, no path traversal).`);
        continue;
      }
      safeExamples.push({ filename: safeName, content: ex.content });
    }
    if (errors.length) errorAndExit(errors);

    const examplesDir = path.join(skillDir, 'examples');
    fs.mkdirSync(examplesDir, { recursive: true });
    for (const ex of safeExamples) {
      const target = path.resolve(examplesDir, ex.filename);
      // Defense in depth: ensure target stays within examplesDir even after resolution.
      if (!target.startsWith(path.resolve(examplesDir) + path.sep)) {
        errorAndExit([`examples filename "${ex.filename}" resolves outside the examples directory.`]);
      }
      fs.writeFileSync(target, ex.content);
    }
  }

  // PR body
  const issueNumber = process.env.ISSUE_NUMBER || '';
  const issueAuthor = process.env.ISSUE_AUTHOR || '';
  const prLines = [
    `Closes #${issueNumber}`,
    '',
    `Submitted by @${issueAuthor} via the Submit a skill issue form.`,
    '',
    '## Skill',
    '',
    `- **Path:** \`${resolvedDomain}/${name}/\``,
    `- **Author:** ${author}${contact ? ` (${contact})` : ''}`,
    `- **Plugin:** ${plugin} — tested against ${plugin_version_tested}`,
    `- **PHP min:** ${php_min}`,
    examples.length ? `- **Examples files:** ${examples.length}` : null,
    referenceMd ? `- **Includes:** reference.md` : null,
    '',
    '## Reviewer checklist',
    '',
    '- [ ] Description loads correctly in a fresh agent session and the right skill matches.',
    '- [ ] No false positives / misses on a real plugin.',
    '- [ ] Frontmatter and writing style match the repo conventions (CONTRIBUTING.md).',
    '- [ ] Cross-references (if any) point to existing skills.',
    '- [ ] No emoji, no marketing language, imperative voice.',
    '',
    '<sub>This PR was generated by `.github/workflows/issue-to-pr.yml`. Editing the source issue retriggers the bot and updates this PR.</sub>',
  ].filter((x) => x !== null);
  fs.writeFileSync(PR_BODY_PATH, prLines.join('\n'));

  emitOutput('status', 'ok');
  emitOutput('slug', name);
  emitOutput('branch', `submission/${name}`);
}

main();
