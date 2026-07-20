---
name: wp-dependency-security-audit
description: Audit third-party PHP and JavaScript dependencies bundled with a
  WordPress plugin or theme, including Composer/npm packages, copied minified
  browser libraries, prefixed/vendorized PHP, CDN assets, and components with no
  manifest. Inventories version evidence, verifies current official security
  advisories and fixed ranges, traces vulnerable APIs to attacker-controlled
  inputs, separates an affected version from a reachable exploit, and produces
  an upgrade/SBOM plan. Use for release security reviews, vendor directories,
  composer.lock/package-lock files, assets/lib bundles, source maps, license
  headers, `composer audit`, npm advisories, GHSA/CVE reports, or unknown-version
  third-party code.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-15"
---

# WordPress dependency security audit

Inventory and rate third-party code that ships with a plugin/theme. Do not stop
at Composer: WordPress products often copy minified JS or prefix PHP namespaces
and remove the manifests that package-manager audit tools need.

## Audit workflow

1. Inventory every production dependency and record the evidence for its name,
   version, source, load path, and runtime context.
2. Run available lockfile/package-manager audits without rewriting lockfiles.
3. For each component, verify affected/fixed ranges against current primary
   upstream advisories and release notes.
4. Trace the advisory's vulnerable API from plugin input to the exact call.
5. Rate the plugin-specific reachability and impact separately from the
   upstream advisory's base severity.
6. Recommend a compatible fixed version, containment, tests, and an SBOM/update
   process. State unknowns instead of converting them into “no vulnerability.”

## Build a complete inventory

Search beyond obvious manifests:

```bash
rg --files | rg '(^|/)(composer\.(json|lock)|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|vendor/composer/installed\.(json|php)|assets/.+\.(js|css)(\.map)?)$'
rg -n -i 'version|@license|sourceMappingURL|copyright|github\.com|npmjs\.com' assets vendor
```

Record each component with one of these confidence levels:

- **exact:** lockfile/installed metadata or an unmodified upstream release banner;
- **inferred:** namespace, banner, source-map, API shape, or hash strongly matches
  a release but no authoritative local manifest exists;
- **unknown:** name or fork is visible but the release cannot be established.

Do not infer safety from a renamed namespace. PHP-Scoper/prefixing avoids class
collisions; it does not patch upstream code. Likewise, concatenation/minification
does not create a new secure version.

Separate production/runtime packages from development-only tools. Confirm what
the distributed artifact actually contains rather than trusting root manifests
that may exclude or replace files during the release build.

## Use package-manager audits as one input

When the matching lockfile exists, use read-only audit commands supported by the
installed tool/version, for example `composer audit --locked` or the appropriate
npm audit command. Do not run `composer update`, `npm install`, or an auto-fix as
part of an audit unless dependency mutation was explicitly requested.

Package-manager output cannot cover:

- copied `assets/js/lib/*.min.js` files absent from `package-lock.json`;
- prefixed or partially copied PHP without Composer installed metadata;
- custom forks whose version string still resembles upstream;
- stale binary databases, WASM, fonts, executables, or build artifacts;
- advisories published after a local/offline vulnerability database snapshot.

## Verify advisories with current primary sources

Security status and latest fixed versions change. When they matter, browse the
official upstream repository security advisory, vendor bulletin, package
registry, and release notes. Prefer the upstream advisory over an aggregator.
Record the advisory/CVE/GHSA identifier, publication/update date, exact affected
range, fixed range, vulnerable methods/features, and upstream severity vector.

Do not claim that a project has no vulnerabilities merely because one search,
repository security tab, or audit tool returned none. Report the sources and
date checked, plus any version-identification gap.

If a release claims “security fixes” without a public advisory, treat the fixed
scope as unknown; do not invent the vulnerability or affected range.

## Trace reachability, not only version presence

For every matched advisory, answer:

1. Is the affected code included and loaded in the shipped artifact?
2. Does the plugin call one of the vulnerable APIs/features?
3. Which argument/property must the attacker control according to the advisory?
4. Can anonymous, authenticated, administrator-controlled, stored, or remote
   input reach that argument without being replaced by trusted generated data?
5. Where does execution occur: public PHP request, worker/cron, wp-admin browser,
   frontend visitor browser, CLI, or build time?
6. What user interaction and configuration are required?
7. Does WordPress/plugin code add a real containment boundary, and is it tested?

Example reasoning: an affected image parser is present and `addImage()` is
called, but the only argument is a PNG generated from a local canvas. Report the
affected component and required upgrade, but do not call it a confirmed remote
exploit unless attacker-controlled data can shape the vulnerable input format.
Conversely, a stored profile field passed into a vulnerable HTML parser from an
admin export can establish a lower-privilege-to-admin path even though the
library runs only in wp-admin.

Upstream CVSS describes the vulnerable package in its general deployment model.
Plugin severity must reflect this concrete call path while still noting the
upstream score.

## Check supply-chain and loading controls

- Maintain a machine-readable SBOM or lockfile for every shipped component,
  including manually copied browser assets and prefixed PHP.
- Store upstream source/release URL, exact version, license, local modifications,
  and update owner. A version banner alone is not a repeatable update process.
- Prefer locally bundled WordPress-registered libraries when they satisfy the
  requirement. Avoid shipping duplicate stale copies.
- For CDN assets, require fixed versions, HTTPS, an exact origin, Subresource
  Integrity plus appropriate `crossorigin`, and a documented outage/fallback
  policy. SRI verifies bytes; it does not make a vulnerable version safe.
- Do not fetch executable dependency updates dynamically in normal requests.
  Private plugin/library updates need the remote control-plane checks from
  `wp-security-deep`.

## Remediation and verification

Prefer upgrading to a currently supported fixed release rather than carrying a
silent local patch. Review breaking changes and compatibility between coupled
packages, such as a core JS library and its plugin/adapter. Remove obsolete
copies so WordPress does not enqueue the vulnerable file through another handle.

When immediate upgrade is impossible:

- disable the vulnerable feature or remove attacker control at the documented
  argument boundary;
- add explicit type/byte/depth/format limits from the upstream workaround;
- record the exception owner, expiry, affected version, compensating tests, and
  upgrade target.

Test the upstream proof-of-concept shape safely against the plugin boundary, not
production. Also test ordinary functionality, malformed input, maximum sizes,
all enqueue/build variants, cache busting, and that the old version string/hash
is absent from the final distributable artifact.

## False-positive guards

- An affected version is a real dependency finding, but it is not automatically
  a confirmed plugin exploit. Show the vulnerable call and controllable input.
- A code path that is unreachable today still requires an upgrade/exception;
  rate it lower and state that future use can reactivate the advisory.
- An old version is not a vulnerability without a matching advisory or concrete
  defect. Report unsupported/stale maintenance separately.
- Lack of a version manifest is an inventory risk, not proof of a CVE.
- Do not treat development-only packages as remotely reachable production code
  unless the release artifact or build service exposes them.

## Severity guide

- **CRITICAL/HIGH:** a known affected version has a demonstrated low-privilege
  path to code execution, sensitive disclosure, privilege change, or major
  resource exhaustion in the plugin's deployed context.
- **MEDIUM:** affected code ships and the API is used, but exploitability needs
  admin interaction/configuration or current input construction blocks the
  advisory payload without a durable guarantee.
- **LOW:** affected but unloaded/unreachable code, or bounded hardening where a
  supported fixed version should still replace it.
- **INFO/UNKNOWN:** stale/unversioned component without a verified advisory;
  requires inventory or upstream identification work.

## Report format

For each component report local file, detected version and confidence, source,
advisory link/ID, affected/fixed ranges, upstream severity, vulnerable API,
plugin call path and input owner, prerequisites, plugin-specific severity,
containment, upgrade target, and verification test. Keep “version affected” and
“exploit confirmed” as separate fields.

## Cross-references

- Use **`wp-security-deep`** when remote metadata, SQL, or an update channel can
  alter executable policy/code.
- Use **`wp-http-api-client`** for CDN/download hosts, redirects, TLS, response
  limits, and temporary-file cleanup.
- Use **`wp-file-upload-security`** when a vulnerable parser processes uploads,
  archives, SVG, media, or remote sideloads.

## What this skill does NOT cover

- Malware attribution or full reverse engineering of intentionally obfuscated code.
- General PHP/JavaScript code security outside third-party component boundaries.
- Automatically changing lockfiles or choosing breaking upgrades without tests.
- WordPress core's own coordinated security-update process.

## References

- Composer audit command: <https://getcomposer.org/doc/03-cli.md#audit>
- npm audit command: <https://docs.npmjs.com/cli/commands/npm-audit>
- GitHub repository security advisories: <https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories>
- WordPress script registration: <https://developer.wordpress.org/reference/functions/wp_register_script/>
