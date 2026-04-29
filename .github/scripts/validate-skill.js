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
  'better-data',
  'better-route',
]);

const REQUIRED_FRONTMATTER = ['name', 'description', 'author', 'plugin', 'plugin-version-tested', 'php-min'];

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

  if (data.name && data.name !== slug) {
    errors.push(`${domain}/${slug}/SKILL.md: \`name\` (\`${data.name}\`) must equal the folder name (\`${slug}\`).`);
  }

  if (typeof data.description === 'string') {
    if (data.description.length > 1024) {
      errors.push(`${domain}/${slug}/SKILL.md: description is ${data.description.length} chars; max 1024.`);
    }
    if (/\bsee below\b/i.test(data.description)) {
      errors.push(`${domain}/${slug}/SKILL.md: description must not say "see below".`);
    }
    if (/\bhelps with\b/i.test(data.description)) {
      warnings.push(`${domain}/${slug}/SKILL.md: description starting with "Helps with…" is too vague.`);
    }
  }

  if (typeof data['plugin-version-tested'] === 'string' &&
      !/^\d+(\.\d+)+(\s*-\s*\d+(\.\d+)+)?$/.test(data['plugin-version-tested'])) {
    warnings.push(`${domain}/${slug}/SKILL.md: \`plugin-version-tested\` "${data['plugin-version-tested']}" should look like "10.5" or "10.0 - 10.5".`);
  }

  // Body length / split rule
  const lines = lineCount(content);
  const hasReference = fs.existsSync(path.join(skillDir, 'reference.md'));
  if (lines > 300 && !hasReference) {
    errors.push(`${domain}/${slug}/SKILL.md: ${lines} lines and no reference.md. Move long material into reference.md (CONTRIBUTING.md → progressive disclosure).`);
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
  const files = changedFiles();
  const errors = [];
  const warnings = [];

  if (files.length === 0) {
    console.log('No changed files detected — nothing to validate.');
    return;
  }

  // Path scope check
  const offlimits = files.filter((f) => {
    if (f.startsWith('.github/')) return false; // workflow / template edits validated by review only
    if (f === 'README.md' || f === 'CONTRIBUTING.md' || f === 'SKILL_TEMPLATE.md' || f === 'LICENSE' || f === '.gitignore') return false;
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
