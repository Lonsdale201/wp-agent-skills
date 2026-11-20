# WordPress 7.2 developer coverage map

Read the note for the surface being changed, then inspect the exact candidate.
This map covers developer-facing changes rather than reproducing every bug ticket.
Use the integration checks below to verify the affected paths in the target site.

| Official note / change family | Skill | Required integration evidence |
|---|---|---|
| [Asset concatenation retirement](https://core.trac.wordpress.org/ticket/57548) | wp72-asset-loading | Old endpoints 410; own admin/iframe assets load independently |
| [jQuery preparation](https://make.wordpress.org/core/2026/11/17/preparing-for-jquery-4-with-wordpress-7-2/) | wp72-asset-loading | Runtime versions, exercised interactions and Migrate call stacks |
| [KSES rewrite](https://core.trac.wordpress.org/ticket/66208) | wp72-html-kses | Effective bootstrap filter, HTML API versus legacy corpus |
| [Abilities](https://make.wordpress.org/core/2026/11/19/abilities-api-updates-in-wordpress-7-2/) | wp72-abilities-api | Capability denial, prepared inputs, PHP/REST parity and JSON shape |
| [REST changes](https://make.wordpress.org/core/2026/11/17/rest-api-changes-in-wordpress-7-2/) | wp72-rest-api | Revision schema/data, comments authorization and actual CORS headers |
| [Interactivity](https://make.wordpress.org/core/2026/11/17/changes-to-the-interactivity-api-in-wordpress-7-2/) | wp72-interactivity-api | SSR/hydration, trusted HTML, expired directives and navigation |
| [Media](https://make.wordpress.org/core/2026/11/17/media-changes-in-wordpress-7-2/) | wp72-media-processing | Upload/sideload/finalize requests, isolation and fallback |
| [Admin SVG icons](https://make.wordpress.org/core/2026/11/05/svg-icons-in-the-admin-bar-and-menu-in-wordpress-7-2/) | wp72-admin-icons | Rendered toolbar/menu SVG, custom scheme and responsive states |
| [Text shadow](https://make.wordpress.org/core/2026/11/11/new-block-support-in-wordpress-7-2-text-shadow/) | wp72-editor-styles | Metadata support, generated CSS and saved editor/frontend output |
| [Editor menus](https://make.wordpress.org/core/2026/11/11/editor-the-options-and-view-menus-now-use-the-new-menu-component/) | wp72-editor-styles | Existing Slot/Fill, new menu location and keyboard behavior |
| [Editor components](https://make.wordpress.org/core/2026/11/10/editor-components-updates-in-wordpress-7-2/) | wp72-editor-styles | Palette roles, consumer styling and cross-document caches |
| [CSS Module collisions](https://make.wordpress.org/core/2026/11/16/update-bundled-wordpress-packages-and-wordpress-build-to-fix-css-module-class-name-collisions/) | wp72-editor-styles | Actual bundled versions, rebuilt output and coexisting copies |
| [Style-state controls](https://make.wordpress.org/core/2026/11/18/api-for-style-state-aware-block-styling-controls/) | wp72-editor-styles | State-specific updates preserve unrelated declarations |
| [Miscellaneous editor](https://make.wordpress.org/core/2026/11/18/miscellaneous-editor-changes-in-wordpress-7-2/) | wp72-editor-styles | Removed group prop, stylesheet imports and subscription behavior |
| [Random redirects](https://make.wordpress.org/core/2026/11/05/your-content-is-going-to-get-more-random/) | wp72-platform-compatibility | Eligibility, redirect destination, filters and empty results |
| [SQL mode](https://make.wordpress.org/core/2026/10/09/no_backslash_escapes-sql-mode-is-now-turned-off-by-default-in-wordpress-7-2/) | wp72-platform-compatibility | Session versus server mode, escaped-value round trip |
| [Miscellaneous core](https://make.wordpress.org/core/2026/11/19/miscellaneous-developer-changes-in-wordpress-7-2/) | wp72-platform-compatibility, wp72-admin-icons, wp72-asset-loading | Slashing/mail, multisite meta, local debug, VCS checkout, menus and compression |
| [Secrets API withdrawal](https://make.wordpress.org/core/2026/11/11/the-secrets-api-in-wordpress-7-2/) | Candidate status | Negative availability check; preserve old beta data |

## Additional changelog triage

Source inspection also identified Entity Fields/Actions, the AI embedding builder
and translation-update helpers beyond the guide's main sections. These are covered
by wp72-entity-fields-actions and the focused references in wp72-abilities-api and
wp72-platform-compatibility.

Use the [7.2 closed-ticket milestone](https://core.trac.wordpress.org/query?milestone=7.2&status=closed)
and the [official Gutenberg repository](https://github.com/WordPress/gutenberg)
for the target plugin's subsystems. The Field Guide describes editor changes from
Gutenberg 23.7 through 24.3; do not equate a later Gutenberg plugin release with
the bundled candidate.

For library, accessibility, PHP and performance fixes, inspect the actual source
and dependency manifest in the candidate. Exercise only relevant integrations and
name any untested PHP/device/cache topology. A changelog mention is not proof of a
new public extension API. Avoid adding generic duplicate skills for bug fixes.

Source anchors: wp-includes/version.php, script-loader.php, json-schema.php,
abilities-api/, interactivity-api/, media.php, icons.php, kses.php,
default-filters.php, class-wp-post-type.php, class-wpdb.php and the REST controllers.
