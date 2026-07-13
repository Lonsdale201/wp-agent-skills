#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, 'skills-index.json');
const REPO_OWNER = process.env.SKILLS_INDEX_REPO_OWNER || 'Lonsdale201';
const REPO_NAME = process.env.SKILLS_INDEX_REPO_NAME || 'wp-agent-skills';
const REPO_REF = process.env.SKILLS_INDEX_REF || 'main';
const CHECK_ONLY = process.argv.includes('--check');

const ROOT_DIRS_TO_IGNORE = new Set([
  '.git',
  '.github',
  '.idea',
  '.vscode',
  'node_modules',
]);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativePath(filePath) {
  return toPosixPath(path.relative(ROOT, filePath));
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function lineCount(text) {
  if (text === '') {
    return 0;
  }
  return text.replace(/\r\n?/g, '\n').split('\n').length;
}

function parseFrontmatter(content, skillPath) {
  const normalized = content.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error(`${skillPath}: file must start with YAML frontmatter.`);
  }

  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error(`${skillPath}: frontmatter is missing a closing --- line.`);
  }

  const yamlText = normalized.slice(4, end);
  const body = normalized.slice(end + 5).replace(/^\n/, '');
  let data;

  try {
    data = yaml.load(yamlText) || {};
  } catch (error) {
    data = parseLooseFrontmatter(yamlText);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${skillPath}: frontmatter must parse to an object.`);
  }

  return { data, body };
}

function parseLooseFrontmatter(yamlText) {
  const data = {};
  const lines = yamlText.split('\n');
  let currentKey = null;
  let blockKey = null;
  let blockLines = [];

  function finishBlock() {
    if (blockKey !== null) {
      data[blockKey] = blockLines.join('\n').trimEnd();
      blockKey = null;
      blockLines = [];
    }
  }

  for (const line of lines) {
    if (blockKey !== null) {
      if (/^\s+/.test(line) || line.trim() === '') {
        blockLines.push(line.replace(/^\s{2}/, ''));
        continue;
      }
      finishBlock();
    }

    const topLevel = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topLevel) {
      currentKey = topLevel[1];
      let value = topLevel[2].trim();

      if (value === '|' || value === '>') {
        blockKey = currentKey;
        blockLines = [];
        data[currentKey] = '';
        continue;
      }

      if (value === '') {
        data[currentKey] = [];
        continue;
      }

      data[currentKey] = unquoteScalar(value);
      continue;
    }

    const listItem = line.match(/^\s*-\s*(.*)$/);
    if (listItem && currentKey !== null) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = data[currentKey] ? [String(data[currentKey])] : [];
      }
      data[currentKey].push(unquoteScalar(listItem[1].trim()));
      continue;
    }

    if (/^\s+/.test(line) && currentKey !== null && typeof data[currentKey] === 'string') {
      data[currentKey] = `${data[currentKey]} ${line.trim()}`.trim();
    }
  }

  finishBlock();
  return data;
}

function unquoteScalar(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function skillNameIsValid(name) {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name) && !name.includes('--');
}

function walkFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function classifyResource(relPath) {
  const basename = path.basename(relPath).toLowerCase();
  const parts = relPath.split('/');

  if (parts.includes('scripts')) {
    return 'script';
  }
  if (parts.includes('examples')) {
    return 'example';
  }
  if (parts.includes('references') || basename === 'reference.md') {
    return 'reference';
  }
  if (parts.includes('assets')) {
    return 'asset';
  }
  if (basename === 'readme.md') {
    return 'readme';
  }

  return 'resource';
}

function resourceInfo(filePath, skillDir) {
  const relToSkill = toPosixPath(path.relative(skillDir, filePath));
  const relToRepo = relativePath(filePath);
  const content = fs.readFileSync(filePath);

  return {
    path: relToSkill,
    repo_path: relToRepo,
    type: classifyResource(relToSkill),
    bytes: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function rawUrl(repoPath) {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_REF}/${repoPath}`;
}

function htmlUrl(repoPath) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/${REPO_REF}/${repoPath}`;
}

function blobUrl(repoPath) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/${REPO_REF}/${repoPath}`;
}

function discoverDomainDirs() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !ROOT_DIRS_TO_IGNORE.has(entry.name))
    .map((entry) => entry.name)
    .filter((domain) => {
      const domainDir = path.join(ROOT, domain);
      return fs.readdirSync(domainDir, { withFileTypes: true }).some((entry) => {
        return entry.isDirectory() && fs.existsSync(path.join(domainDir, entry.name, 'SKILL.md'));
      });
    })
    .sort((a, b) => a.localeCompare(b));
}

function loadSkill(domain, slug) {
  const skillDir = path.join(ROOT, domain, slug);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillRepoPath = relativePath(skillMdPath);
  const content = readUtf8(skillMdPath);
  const { data, body } = parseFrontmatter(content, skillRepoPath);

  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();

  if (!name) {
    throw new Error(`${skillRepoPath}: missing required frontmatter field "name".`);
  }
  if (!description) {
    throw new Error(`${skillRepoPath}: missing required frontmatter field "description".`);
  }
  if (!skillNameIsValid(name)) {
    throw new Error(`${skillRepoPath}: "name" must be lowercase kebab-case, 1-64 chars, with no leading/trailing/consecutive hyphens.`);
  }
  if (name !== slug) {
    throw new Error(`${skillRepoPath}: "name" (${name}) must match the folder name (${slug}).`);
  }
  if (body.trim() === '') {
    throw new Error(`${skillRepoPath}: skill body is empty.`);
  }

  // Open Agent Skills format: collection fields live under frontmatter
  // `metadata` as wp-skills-* string pairs. The index flattens them and
  // strips the namespace prefix so index consumers keep seeing the
  // pre-migration keys (author, plugin, plugin-version-tested, ...).
  // docs/source-refs moved into the body References section and are no
  // longer part of the index metadata.
  const metadata = {};
  if (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) {
    for (const [key, value] of Object.entries(data.metadata)) {
      metadata[key.replace(/^wp-skills-/, '')] = String(value);
    }
  }
  for (const key of ['license', 'compatibility', 'allowed-tools']) {
    if (data[key] !== undefined && data[key] !== null) {
      metadata[key] = String(data[key]);
    }
  }

  const resources = walkFiles(skillDir)
    .filter((filePath) => path.basename(filePath) !== 'SKILL.md')
    .map((filePath) => resourceInfo(filePath, skillDir));

  const resourceTypes = new Set(resources.map((resource) => resource.type));
  const skillDirRepoPath = `${domain}/${slug}`;

  return {
    slug,
    name,
    domain,
    description,
    path: skillDirRepoPath,
    skill_path: skillRepoPath,
    url: rawUrl(skillRepoPath),
    raw_url: rawUrl(skillRepoPath),
    html_url: blobUrl(skillRepoPath),
    directory_url: htmlUrl(skillDirRepoPath),
    metadata,
    resources,
    has_reference: resourceTypes.has('reference'),
    has_examples: resourceTypes.has('example'),
    has_scripts: resourceTypes.has('script'),
    skill_md: {
      bytes: Buffer.byteLength(content, 'utf8'),
      lines: lineCount(content),
      sha256: sha256(content),
    },
  };
}

function buildIndex() {
  const domains = discoverDomainDirs();
  const skills = [];
  const seen = new Map();

  for (const domain of domains) {
    const domainDir = path.join(ROOT, domain);
    const slugs = fs.readdirSync(domainDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((slug) => fs.existsSync(path.join(domainDir, slug, 'SKILL.md')))
      .sort((a, b) => a.localeCompare(b));

    for (const slug of slugs) {
      const skill = loadSkill(domain, slug);
      if (seen.has(skill.name)) {
        throw new Error(`${skill.skill_path}: duplicate skill name "${skill.name}" also used by ${seen.get(skill.name)}.`);
      }
      seen.set(skill.name, skill.skill_path);
      skills.push(skill);
    }
  }

  const domainSummaries = domains.map((domain) => {
    const readmePath = path.join(ROOT, domain, 'README.md');
    return {
      slug: domain,
      path: domain,
      readme_path: fs.existsSync(readmePath) ? `${domain}/README.md` : null,
      skill_count: skills.filter((skill) => skill.domain === domain).length,
    };
  });

  return {
    $schema: 'https://raw.githubusercontent.com/Lonsdale201/wp-agent-skills/main/schemas/skills-index.v1.json',
    schema_version: '1.0.0',
    repository: {
      owner: REPO_OWNER,
      name: REPO_NAME,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
      ref: REPO_REF,
    },
    source: {
      layout: '<domain>/<skill>/SKILL.md',
      skill_file: 'SKILL.md',
    },
    domain_count: domainSummaries.length,
    skill_count: skills.length,
    domains: domainSummaries,
    skills,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const json = stableJson(buildIndex());

  if (CHECK_ONLY) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error('skills-index.json is missing. Run: node .github/scripts/build-skills-index.js');
      process.exit(1);
    }

    const current = readUtf8(OUT_FILE).replace(/\r\n?/g, '\n');
    if (current !== json) {
      console.error('skills-index.json is out of date. Run: node .github/scripts/build-skills-index.js');
      process.exit(1);
    }

    console.log('skills-index.json is up to date.');
    return;
  }

  fs.writeFileSync(OUT_FILE, json, 'utf8');
  console.log(`Wrote ${relativePath(OUT_FILE)}.`);
}

main();
