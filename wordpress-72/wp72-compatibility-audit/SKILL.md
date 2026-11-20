---
name: wp72-compatibility-audit
description: >-
  Audits a plugin or theme for WordPress 7.2 prerelease compatibility. Use for a 7.2 upgrade, RC or nightly test, or a developer migration review spanning assets, KSES, Abilities, REST, Interactivity, media, editor styles, admin icons, rewrites or platform changes. Records exact build evidence and separates shipped features from reverted proposals.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 compatibility audit

Use this workflow for the 7.2 release line. This prerelease domain supplements the
stable `wordpress/` skills until the final release is verified. Check the target
plugin's actual integrations and minimum supported version.

## Establish the candidate

1. Check the official [release archive](https://wordpress.org/download/releases/)
   and [nightly page](https://wordpress.org/download/nightly/). Download the newest
   relevant 7.2 build; trunk may already target another release.
2. Record the archive URL, retrieval date, SHA-256, running `wp core version`,
   PHP/database/browser versions and whether Gutenberg is active.
3. Read [coverage.md](references/coverage.md) for the developer change map and
   [candidate-status.md](references/candidate-status.md) for prerelease traps.
   Recheck the upstream notes when a newer candidate is available.
4. Exercise the relevant integration paths in a disposable site. Preserve real
   site data.

## Route by affected code

| Signals in the project | Read |
|---|---|
| Asset URL assembly, concatenation, jQuery warnings | `wp72-asset-loading` |
| HTML allowlists, KSES filters, parser comparisons | `wp72-html-kses` |
| Ability permissions, schema coercion, custom transports | `wp72-abilities-api` |
| Revision metadata, comments collection, CORS | `wp72-rest-api` |
| Interactive directives, stores, router navigation | `wp72-interactivity-api` |
| Components, Emotion, inspector controls, responsive styles | `wp72-editor-styles` |
| Server-defined DataViews/DataForm fields and actions | `wp72-entity-fields-actions` |
| Media frame, upload hooks, client-generated sub-sizes | `wp72-media-processing` |
| Toolbar/menu SVGs, Dashicons overrides, color schemes | `wp72-admin-icons` |
| Random redirects, SQL modes, site meta, application passwords | `wp72-platform-compatibility` |

Only load the relevant siblings. Start from the plugin's entry points, hooks,
bundled assets and minimum supported WordPress version. Use available language
services for JavaScript symbols and references.

## Exercise the actual integration

- Capture a stable-version baseline before changing the candidate.
- Test each relevant admin/frontend path, privileged and denied users, saved
  data, reloads and the browser console/network log.
- Test the site's real editor configuration: iframe, classic editor and
  Gutenberg can change which paths run.
- Use synthetic data and local notification interception. A return value alone
  does not prove browser behavior, delivery or remote integrations.
- Treat an API missing from an older documentation index as unverified; inspect
  the exact candidate source before calling it nonexistent.
- Keep source, PHP/REST runtime, HTTP and browser evidence separate. A skipped
  check remains uncovered.

## Report

For each issue, record: project file/line, trigger, observed behavior, expected
candidate contract, smallest compatible fix, regression check and evidence type.
Grade crashes, unsafe input handling and lost data as high priority; broken
interaction/layout as medium unless it blocks an essential task.

Close with the exact tested build and outstanding configurations. Do not claim
final 7.2 support, a full WCAG audit or every browser from a nightly smoke run.

## References

- [7.2 Field Guide](https://make.wordpress.org/core/2026/11/20/wordpress-7-2-field-guide/)
- [7.2 release schedule](https://make.wordpress.org/core/7-2/)
- [Change coverage](references/coverage.md)
- [Candidate status and promotion](references/candidate-status.md)

