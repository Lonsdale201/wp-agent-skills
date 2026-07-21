#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const yaml = require('js-yaml');

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF || 'origin/contrib';

const ALLOWED_DOMAINS = new Set([
  'wordpress',
  'plugin-scaffold',
  'woocommerce',
  'jetformbuilder',
  'jet-engine',
  'jetsmartfilter',
  'better-data',
  'better-route',
  'lw-plugins',
  'wp-rocket',
  'redis-object-cache',
  'fluentcrm',
  'fluentform',
  'theme-development',
  'translatepress',
  'elementor',
  'szamlazzhu',
  'dev-tooling',
  'polylang',
  'wpml',
  'learndash',
  'rankmath',
]);

// Open Agent Skills format (https://agentskills.io/specification):
// only these top-level frontmatter keys are allowed. Everything
// collection-specific lives under `metadata` as string->string pairs
// in the wp-skills-* namespace.
const ALLOWED_TOP_LEVEL = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const REQUIRED_FRONTMATTER = ['name', 'description'];
const REQUIRED_METADATA = ['wp-skills-author', 'wp-skills-plugin', 'wp-skills-plugin-version-tested', 'wp-skills-php-min'];
const TAG_LIKE_RE = /<[A-Za-z!\/][^<>]*>/;

// Conservative emoji regex (skin tones, ZWJ sequences, common pictographs)
const EMOJI_RE = /[‼⁉⃣™ℹ↔-↙↩-↪⌚-⌛⌨⏏⏩-⏳⏸-⏺Ⓜ▪-▫▶◀◻-◾☀-➿⤴-⤵⬅-⬇⬛-⬜⭐⭕〰〽㊗㊙️]|[\u{1F000}-\u{1FFFF}]/u;

const SECRET_PATTERNS = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS secret key', re: /\baws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/i },
  { name: 'OpenAI / generic sk-* key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub token', re: /\bghp_[A-Za-z0-9]{36}\b|\bgho_[A-Za-z0-9]{36}\b|\bghs_[A-Za-z0-9]{36}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Generic private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];

// Dangerous code patterns. Matched only INSIDE fenced code blocks of
// matching languages, AND only when the block lacks a documentation
// signal (WRONG / BAD / etc.) — security-audit skills naturally label
// their antipatterns and won't trigger.
const DANGEROUS_PATTERNS = [
  { name: 'PHP eval()',                              re: /\beval\s*\(/,                                                                            langs: ['php'] },
  { name: 'PHP create_function() (deprecated, eval-like)', re: /\bcreate_function\s*\(/,                                                            langs: ['php'] },
  { name: 'PHP shell exec function',                 re: /\b(?:exec|system|shell_exec|passthru|proc_open|popen)\s*\(/,                              langs: ['php'] },
  { name: 'PHP backtick shell exec',                 re: /^[^\n]*=\s*`[^`\n]+`/m,                                                                  langs: ['php'] },
  { name: 'PHP preg_replace /e modifier',            re: /preg_replace\s*\(\s*['"][^'"]*\/[a-z]*e[a-z]*['"]/i,                                       langs: ['php'] },
  { name: 'PHP unserialize on user input',           re: /\bunserialize\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE|SERVER)/i,                              langs: ['php'] },
  { name: 'PHP extract on user input',               re: /\bextract\s*\(\s*\$_(?:GET|POST|REQUEST|COOKIE)/i,                                          langs: ['php'] },
  { name: 'PHP include/require with user input',     re: /\b(?:include|require)(?:_once)?\s*\(?\s*\$_(?:GET|POST|REQUEST|COOKIE)/i,                    langs: ['php'] },
  { name: 'JS eval()',                                re: /\beval\s*\(/,                                                                             langs: ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'] },
  { name: 'JS new Function() (eval-like)',            re: /\bnew\s+Function\s*\(/,                                                                   langs: ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'] },
];

// If any of these case-insensitive signals appears in the SAME code block
// as a dangerous-pattern match, treat it as a teaching example (no warning).
// Includes: explicit antipattern markers, attacker-context phrases, and the
// repo's severity-marker convention (`// HIGH —`, `# MEDIUM –`, etc.).
const DOC_SIGNAL_RE = /\b(?:WRONG|BAD|DON'?T|DO\s*NOT|AVOID|ANTI[- ]?PATTERN|INSECURE|UNSAFE|VULNERABL[EY]|EXPLOIT|INJECTION|VULN(?:ERABILIT(?:Y|IES))?|ATTACKER[- ]CONTROLLED|GADGET\s+CHAIN|MALICIOUS|NEVER\s+(?:do|use|run|call))\b|\b(?:HIGH|MEDIUM|LOW)\s*[—–-]/i;

const FENCE_RE = /^```([A-Za-z0-9_+-]*)\s*\n([\s\S]*?)^```\s*$/gm;

function sh(cmd) {
  return cp.execSync(cmd, { encoding: 'utf8' }).trim();
}

function changedFiles() {
  // Resolve a meaningful base SHA. For pull_request, the base ref is fetched.
  // For push, we compare against origin/contrib.
  let base;
  try {
    base = sh(`git merge-base HEAD ${BASE_REF}`);
  } catch (e) {
    // Brand-new branch with no merge-base; fall back to BASE_REF.
    base = BASE_REF;
  }
  const out = sh(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function listExistingSkills() {
  const skills = new Set();
  for (const d of ALLOWED_DOMAINS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir)) {
      const slugDir = path.join(dir, e);
      if (fs.statSync(slugDir).isDirectory() && fs.existsSync(path.join(slugDir, 'SKILL.md'))) {
        skills.add(e);
      }
    }
  }
  return skills;
}

function parseFrontmatter(content, filePath) {
  if (!content.startsWith('---')) {
    return { error: `${filePath}: file must start with YAML frontmatter (\`---\`).` };
  }
  const end = content.indexOf('\n---', 3);
  if (end < 0) return { error: `${filePath}: frontmatter not closed (\`---\` block).` };
  const yamlText = content.slice(3, end).replace(/^\r?\n/, '');
  const body = content.slice(end + 4).replace(/^\r?\n/, '');
  try {
    const data = yaml.load(yamlText);
    return { data: data || {}, body };
  } catch (e) {
    return { error: `${filePath}: frontmatter YAML parse error — ${e.message}` };
  }
}

function lineCount(s) {
  return s.split('\n').length;
}

function findEmoji(text) {
  const m = text.match(EMOJI_RE);
  return m ? m[0] : null;
}

function findSecret(text) {
  for (const p of SECRET_PATTERNS) {
    const m = text.match(p.re);
    if (m) return { name: p.name, sample: m[0].slice(0, 12) + '…' };
  }
  return null;
}

function findDangerousPatterns(text) {
  const findings = [];
  FENCE_RE.lastIndex = 0;
  let m;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const lang = (m[1] || '').toLowerCase();
    if (!lang) continue;
    const block = m[2];
    const isDoc = DOC_SIGNAL_RE.test(block);
    if (isDoc) continue;
    for (const p of DANGEROUS_PATTERNS) {
      if (!p.langs.includes(lang)) continue;
      const hit = block.match(p.re);
      if (hit) {
        // Approximate line in the file: count newlines up to the match start.
        const lineInFile = text.slice(0, m.index + hit.index).split('\n').length;
        findings.push({ name: p.name, sample: hit[0], line: lineInFile, lang });
      }
    }
  }
  return findings;
}

function findCrossRefs(body) {
  // matches: `slug-name` inside a "Cross-references" section, used as `name`
  // We look for inline-code mentions; it's a heuristic.
  const refs = new Set();
  const xref = body.match(/##+\s*Cross-references[\s\S]*?(?=\n##|\n\n#|$)/i);
  const region = xref ? xref[0] : '';
  for (const m of region.matchAll(/`([a-z0-9-]{3,})`/g)) {
    refs.add(m[1]);
  }
  return [...refs];
}

function validateSkillFolder(folderRel, errors, warnings, knownSkills) {
  const parts = folderRel.split('/');
  if (parts.length < 2) return;
  const [domain, slug, ...rest] = parts;

  if (!ALLOWED_DOMAINS.has(domain)) {
    errors.push(`${folderRel}: domain "${domain}" is not in the allow-list (or this is a new domain — open an issue first).`);
    return;
  }

  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    errors.push(`${folderRel}: slug "${slug}" must be kebab-case, [a-z0-9-], max 64 chars.`);
    return;
  }

  const skillDir = path.join(ROOT, domain, slug);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    errors.push(`${folderRel}: SKILL.md missing.`);
    return;
  }

  // Case sensitivity check (the file system on Linux runners is case-sensitive)
  const entries = fs.readdirSync(skillDir);
  if (!entries.includes('SKILL.md')) {
    errors.push(`${folderRel}: file must be named exactly \`SKILL.md\` (uppercase).`);
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const fm = parseFrontmatter(content, `${domain}/${slug}/SKILL.md`);
  if (fm.error) {
    errors.push(fm.error);
    return;
  }
  const data = fm.data;

  for (const k of REQUIRED_FRONTMATTER) {
    if (!data[k] || (typeof data[k] === 'string' && !data[k].trim())) {
      errors.push(`${domain}/${slug}/SKILL.md: missing required frontmatter field \`${k}\`.`);
    }
  }

  // Open format: no non-standard top-level keys.
  for (const k of Object.keys(data)) {
    if (!ALLOWED_TOP_LEVEL.has(k)) {
      errors.push(`${domain}/${slug}/SKILL.md: non-standard top-level frontmatter key \`${k}\` — move it under \`metadata\` (wp-skills-* namespace) or, for docs/source-refs, into the body \`## References\` section.`);
    }
  }

  if (data.name && data.name !== slug) {
    errors.push(`${domain}/${slug}/SKILL.md: \`name\` (\`${data.name}\`) must equal the folder name (\`${slug}\`).`);
  }
  if (typeof data.name === 'string') {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(data.name) || data.name.includes('--')) {
      errors.push(`${domain}/${slug}/SKILL.md: \`name\` must be 1-64 chars of [a-z0-9-], no leading/trailing/consecutive hyphens.`);
    }
    if (/anthropic|claude/i.test(data.name)) {
      errors.push(`${domain}/${slug}/SKILL.md: \`name\` must not contain the reserved words "anthropic" or "claude".`);
    }
  }

  if (typeof data.description === 'string') {
    // Spec hard limit (agentskills.io): 1-1024 characters.
    if (data.description.length > 1024) {
      errors.push(`${domain}/${slug}/SKILL.md: description is ${data.description.length} chars (spec maximum is 1024).`);
    }
    if (TAG_LIKE_RE.test(data.description)) {
      errors.push(`${domain}/${slug}/SKILL.md: description contains an XML/HTML-tag-like \`<...>\` sequence — descriptions are embedded in XML prompt blocks; spell the element name out instead.`);
    }
    if (/\bsee below\b/i.test(data.description)) {
      errors.push(`${domain}/${slug}/SKILL.md: description must not say "see below".`);
    }
    if (/\bhelps with\b/i.test(data.description)) {
      warnings.push(`${domain}/${slug}/SKILL.md: description starting with "Helps with…" is too vague.`);
    }
  }

  // metadata: flat string->string map, wp-skills-* namespaced keys.
  const meta = data.metadata;
  if (meta !== undefined) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      errors.push(`${domain}/${slug}/SKILL.md: \`metadata\` must be a mapping of string keys to string values.`);
    } else {
      for (const [mk, mv] of Object.entries(meta)) {
        if (typeof mv !== 'string') {
          errors.push(`${domain}/${slug}/SKILL.md: \`metadata.${mk}\` must be a string (quote versions/dates); lists and nested mappings are not allowed.`);
        }
        if (!mk.startsWith('wp-skills-')) {
          warnings.push(`${domain}/${slug}/SKILL.md: \`metadata.${mk}\` is outside the \`wp-skills-\` namespace — collection keys should be namespaced to avoid collisions.`);
        }
      }
    }
  }
  for (const k of REQUIRED_METADATA) {
    if (!meta || typeof meta !== 'object' || !String(meta[k] || '').trim()) {
      errors.push(`${domain}/${slug}/SKILL.md: missing required metadata field \`${k}\`.`);
    }
  }

  if (typeof data.compatibility === 'string' && data.compatibility.length > 500) {
    errors.push(`${domain}/${slug}/SKILL.md: \`compatibility\` is ${data.compatibility.length} chars (spec maximum is 500).`);
  }
  if (data['allowed-tools'] !== undefined && typeof data['allowed-tools'] !== 'string') {
    errors.push(`${domain}/${slug}/SKILL.md: \`allowed-tools\` must be a single space-separated string, not a YAML list.`);
  }

  const pvt = meta && typeof meta === 'object' ? meta['wp-skills-plugin-version-tested'] : undefined;
  if (typeof pvt === 'string' && !/^\d+(\.\d+)+(\s*-\s*\d+(\.\d+)+)?$/.test(pvt)) {
    warnings.push(`${domain}/${slug}/SKILL.md: \`wp-skills-plugin-version-tested\` "${pvt}" should look like "10.5" or "10.0 - 10.5".`);
  }

  // Body length / split rule. CONTRIBUTING recommends moving long material
  // into reference.md past 300 lines. Treat as warning so a typo PR on a
  // pre-existing oversize skill is not blocked by an unrelated structural
  // rule; the warning still shows up in the PR check log for review.
  const lines = lineCount(content);
  const hasReference = fs.existsSync(path.join(skillDir, 'reference.md')) || fs.existsSync(path.join(skillDir, 'references'));
  if (lines > 500) {
    warnings.push(`${domain}/${slug}/SKILL.md: ${lines} lines (the Agent Skills spec recommends keeping SKILL.md under 500 lines — split into references/).`);
  } else if (lines > 300 && !hasReference) {
    warnings.push(`${domain}/${slug}/SKILL.md: ${lines} lines and no reference file (CONTRIBUTING.md recommends progressive disclosure past 300 lines).`);
  }

  // Emoji / secrets in all .md files in the folder
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(md|markdown)$/i.test(e)) continue;
      const text = fs.readFileSync(p, 'utf8');
      const emoji = findEmoji(text);
      if (emoji) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        errors.push(`${rel}: contains emoji (${JSON.stringify(emoji)}). Skill text must be emoji-free.`);
      }
      const secret = findSecret(text);
      if (secret) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        errors.push(`${rel}: looks like a hardcoded secret (${secret.name}, sample: ${secret.sample}). Replace with a placeholder.`);
      }
      const dangers = findDangerousPatterns(text);
      for (const d of dangers) {
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');
        warnings.push(`${rel}:${d.line}: dangerous pattern in ${d.lang} code block — ${d.name} (\`${d.sample.trim()}\`). If this is a teaching example, label the block with WRONG/BAD/DON'T/AVOID/INSECURE in a comment.`);
      }
    }
  };
  walk(skillDir);

  // Cross-reference validity
  const refs = findCrossRefs(fm.body);
  for (const r of refs) {
    if (r === slug) continue;
    if (!knownSkills.has(r) && !/^(reference|examples|scripts)\.md?$/i.test(r)) {
      // Ignore obvious filenames; flag unknown skill names
      if (/^[a-z]+-[a-z0-9-]+$/.test(r) && r.split('-').length >= 2) {
        warnings.push(`${domain}/${slug}/SKILL.md: cross-reference \`${r}\` does not match any known skill in the repo.`);
      }
    }
  }

  if (rest.length > 0) {
    // changes inside subfolders are fine; nothing else to enforce here
  }
}

function main() {
  const validateAll = process.argv.includes('--all');
  const files = validateAll ? [] : changedFiles();
  const errors = [];
  const warnings = [];

  if (validateAll) {
    const known = listExistingSkills();
    const folders = [];
    for (const d of ALLOWED_DOMAINS) {
      const dir = path.join(ROOT, d);
      if (!fs.existsSync(dir)) continue;
      for (const e of fs.readdirSync(dir)) {
        if (fs.existsSync(path.join(dir, e, 'SKILL.md'))) folders.push(`${d}/${e}`);
      }
    }
    for (const folder of folders) validateSkillFolder(folder, errors, warnings, known);
    report(errors, warnings);
    return;
  }

  if (files.length === 0) {
    console.log('No changed files detected — nothing to validate.');
    return;
  }

  // Path scope check
  const offlimits = files.filter((f) => {
    if (f.startsWith('.github/')) return false; // workflow / template edits validated by review only
    if (f.startsWith('schemas/')) return false;
    if (f.startsWith('rules/')) return false; // always-on rules — not skills; reviewed by maintainer
    if (f === 'skills-index.json') return false;
    if (f === 'README.md' || f === 'CONTRIBUTING.md' || f === 'CHANGELOG.md' || f === 'SKILL_TEMPLATE.md' || f === 'LICENSE' || f === '.gitignore') return false;
    const top = f.split('/')[0];
    return !ALLOWED_DOMAINS.has(top);
  });
  if (offlimits.length) {
    for (const f of offlimits) {
      errors.push(`${f}: changes outside permitted paths (\`<domain>/<slug>/**\`, \`README.md\`, \`CONTRIBUTING.md\`, etc.).`);
    }
  }

  // Group changed files by skill folder
  const folders = new Set();
  for (const f of files) {
    const top = f.split('/')[0];
    if (!ALLOWED_DOMAINS.has(top)) continue;
    const parts = f.split('/');
    if (parts.length < 3) continue; // <domain>/<slug>/<file>
    folders.add(`${parts[0]}/${parts[1]}`);
  }

  const known = listExistingSkills();
  for (const folder of folders) {
    validateSkillFolder(folder, errors, warnings, known);
  }

  report(errors, warnings);
}

function report(errors, warnings) {
  if (warnings.length) {
    console.log('::group::Warnings');
    for (const w of warnings) console.log(`::warning::${w}`);
    console.log('::endgroup::');
  }

  if (errors.length) {
    console.log('::group::Errors');
    for (const e of errors) console.log(`::error::${e}`);
    console.log('::endgroup::');
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exit(1);
  }

  console.log(`✓ Validation passed. ${warnings.length} warning(s).`);
}

main();
