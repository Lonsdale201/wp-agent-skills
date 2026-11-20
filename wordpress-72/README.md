# WordPress 7.2 prerelease developer skills

Eleven WordPress 7.2 migration skills, kept separate from the stable wordpress/
domain until the final release.

**Verified candidate:** 7.2-RC2-65695 nightly, checked 2026-11-20.
The newest numbered release checked was 7.2-RC2. These are prerelease results.

| Skill | Use when |
|---|---|
| [wp72-compatibility-audit](wp72-compatibility-audit/SKILL.md) | Scoping an upgrade and routing to affected developer contracts |
| [wp72-asset-loading](wp72-asset-loading/SKILL.md) | Retired concatenation endpoints/settings and jQuery preparation |
| [wp72-html-kses](wp72-html-kses/SKILL.md) | New default HTML API-based KSES and legacy comparisons |
| [wp72-abilities-api](wp72-abilities-api/SKILL.md) | Capabilities, consistent prepared input and JSON object shapes |
| [wp72-rest-api](wp72-rest-api/SKILL.md) | Revision metadata, comment status arrays and CORS methods |
| [wp72-interactivity-api](wp72-interactivity-api/SKILL.md) | HTML branding, removed directives and router state |
| [wp72-editor-styles](wp72-editor-styles/SKILL.md) | Components/menus, CSS Modules, text shadows and responsive controls |
| [wp72-entity-fields-actions](wp72-entity-fields-actions/SKILL.md) | Server registries and permission-gated REST discovery for entity UI |
| [wp72-media-processing](wp72-media-processing/SKILL.md) | Expanded client media pipeline, isolation, hooks and quotas |
| [wp72-admin-icons](wp72-admin-icons/SKILL.md) | Inline SVGs, toolbar node icons and admin color overrides |
| [wp72-platform-compatibility](wp72-platform-compatibility/SKILL.md) | Random redirects, SQL modes, site meta and smaller core changes |

Start with the [change map](wp72-compatibility-audit/references/coverage.md).
Read [candidate caveats and final-release promotion](wp72-compatibility-audit/references/candidate-status.md)
before acting on a beta-era proposal. In particular, wp_kses remains public,
jQuery 4 does not ship here and the Secrets API was withdrawn from 7.2.

