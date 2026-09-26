---
name: lw-seo-automation-compatibility
description: >-
  Automate or review LW SEO 1.7.x through WP-CLI, public REST, WordPress
  Abilities, and LW Site Manager MCP, and verify compatibility with LW Cookie
  1.8.x and headless LW LMS 2.0.x. Use when calling `wp lw-seo`, `lw-seo/*`
  abilities, `/wp-json/lw-seo/v1`, Site Manager discovery, SEO option or meta
  writes, or diagnosing cross-plugin privacy and exposure boundaries.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "lw-seo"
  wp-skills-plugin-version-tested: "1.7.4"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# LW SEO automation and compatibility

Choose the interface by audience. WP-CLI and abilities are administrative surfaces. The `lw-seo/v1` routes are public read-only headless output and must never be treated as an authorization layer.

## Verified compatibility matrix

| Plugin | Verified version | Result |
|---|---:|---|
| LW SEO | 1.7.4 | active release package; 196 shipped non-vendor files matched public source after line-ending normalization |
| LW Cookie | 1.8.3 | frontend banner and SEO tags coexist; SEO did not set a response cookie |
| LW LMS | 2.0.1 | headless `course` and `lesson` excluded from sitemap and llms collectors |
| LW Site Manager | 1.5.1 | all five SEO abilities registered, MCP-public, and present in discovery |

The live smoke ran on WordPress 7.1.2 and PHP 8.3.30. Recheck behavior after any plugin version changes.

## Use WP-CLI for deployment and operations

The main command groups are:

```text
wp lw-seo option get|set|list|reset
wp lw-seo sitemap info|flush
wp lw-seo llms info|preview|flush
wp lw-seo robots preview
wp lw-seo crawlers list
wp lw-seo redirect list|add|delete|import|export
wp lw-seo migrate rankmath|yoast
```

`option set` uses the settings sanitizer. Boolean values accept explicit true/false forms; map options accept JSON objects. A map write replaces the whole map, while a dot path updates one member:

```bash
wp lw-seo option set sitemap_post_types.event true
wp lw-seo option set llms_txt_post_types.internal_doc false
```

Read current values before mutation and read them back afterward. `option reset`, redirect deletes, imports, and migrations require an explicit change window and backup.

## Use the five Site Manager abilities

| Ability | Permission | Purpose |
|---|---|---|
| `lw-seo/get-meta` | `edit_posts` plus target read access | read post or term SEO fields |
| `lw-seo/set-meta` | `edit_posts` plus target edit access | update supplied fields only |
| `lw-seo/get-content-signals` | `edit_posts` plus target read access | resolved signal map |
| `lw-seo/get-markdown` | `edit_posts` plus target read access | rendered Markdown |
| `lw-seo/get-options` | `manage_options` | global merged options |

Version 1.7.4 marks each ability with `meta.mcp.public = true` and `type = tool`. LW Site Manager 1.5.1 discovery includes all five. Calls still pass the ability's own permission callback; MCP visibility is not authorization.

Direct PHP:

```php
$ability = wp_get_ability( 'lw-seo/set-meta' );

if ( $ability ) {
	$result = $ability->execute(
		[
			'post_id' => $post_id,
			'meta'    => [
				'title'       => 'Release notes %%sep%% %%sitename%%',
				'description' => 'A concise release summary.',
				'ai_train'    => 'no',
			],
		]
	);
}
```

Unknown fields are ignored. Signal values are limited to `yes`, `no`, or empty. A Markdown override without `unfiltered_html` is preserved and reported in `skipped`.

## Public REST boundary and current issue

The read-only namespace exposes post metadata, term metadata, author metadata, schema, and breadcrumbs. Published public content can be consumed without authentication.

LW SEO 1.7.4 has a confirmed access-control gap: its public REST callbacks accept any `publish` post without checking whether the post type is viewable, and the term callback does not check taxonomy visibility. With LW LMS 2.0.1, anonymous requests can receive SEO data for headless non-public courses, lessons, and private course taxonomies. This is tracked in [lw-seo issue #18](https://github.com/lwplugins/lw-seo/issues/18).

Until a fixed release is verified:

- do not expose `/wp-json/lw-seo/v1/meta/{id}`, `/schema/{id}`, or `/breadcrumbs/{id}` as an access-controlled content API;
- do not place sensitive summaries in SEO fields on non-public post types;
- use the authenticated `lw-seo/*` abilities or a companion endpoint with object-level permissions;
- gate or remove the affected public routes when the site stores sensitive headless content;
- retest anonymous course, lesson, password-protected post, and private-taxonomy requests after upgrading.

The sitemap, llms.txt, and Markdown eligibility layer already checks viewability and does not expose LW LMS's headless post types.

## LW Cookie compatibility

LW SEO's titles, metadata, JSON-LD, sitemap, llms, and Content Signals do not require consent. Do not delay SEO markup behind LW Cookie or classify it as analytics/marketing.

The two plugins share the LW Plugins admin hub but keep separate options, REST namespaces, and abilities. A frontend smoke should show both the SEO tags and `lw-cookie-notice` when the banner is enabled. An anonymous SEO page request should not gain a server-side consent cookie merely because LW SEO is active.

Content Signals describe allowed content use by agents. LW Cookie records a visitor's consent. Do not map one policy to the other.

## LW LMS compatibility

LW LMS 2.0.1 is backend-only. Its `course` and `lesson` post types are `public=false`, `publicly_queryable=false`, and `show_in_rest=true`. LW SEO correctly excludes them from public post type discovery, sitemap providers, llms sections, and Markdown URLs.

Use the LMS learner REST API for the course catalog and lesson content. Use `lw-lms/*` abilities for administrative automation. SEO meta can still be stored on those objects by an administrator, but there is no native public HTML page where LW SEO could render it.

LW LMS video consent is handled by its LW Cookie integration. It is independent of LW SEO and should not be implemented in an SEO hook.

## Verification sequence

1. Record exact versions and confirm the official release artifacts are active.
2. Run `wp lw-seo option list --format=json`, `sitemap info`, `llms info`, and `robots preview` without changing state.
3. Confirm all five `lw-seo/*` abilities are registered and carry MCP-public metadata.
4. Run a disposable ability write/read round trip on a public post, then delete the fixture.
5. Fetch the public page and check title, description, canonical, social tags, Content-Signal, Cookie banner, and Set-Cookie behavior.
6. Verify sitemap/llms collectors include the public fixture and exclude LMS course/lesson fixtures.
7. Probe the public REST routes anonymously for non-public content; apply the issue #18 containment until a fixed release passes.
8. Remove posts, terms, metadata, transients, temporary scripts, and application passwords created for the smoke.

## Cross-references

- Use `lw-seo-content-metadata` for title, description, canonical, schema, and storage contracts.
- Use `lw-seo-machine-readable-content` for sitemap, llms, Markdown, and Content Signals.
- Use `lw-site-manager-overview`, `lw-lms-abilities`, and `lw-cookie-consent-integration` for the companion surfaces.

## References

- Plugin repository: <https://github.com/lwplugins/lw-seo>
- WP-CLI guide: <https://github.com/lwplugins/lw-seo/blob/main/docs/cli.md>
- REST guide: <https://github.com/lwplugins/lw-seo/blob/main/docs/rest-api.md>
- Site Manager abilities: <https://github.com/lwplugins/lw-seo/blob/main/docs/site-manager-abilities.md>
- Public issue #18: <https://github.com/lwplugins/lw-seo/issues/18>
- WordPress Abilities API: <https://developer.wordpress.org/apis/abilities-api/>
- Verified source paths:
  - `includes/CLI/Bootstrap.php`
  - `includes/RestApi.php`
  - `includes/SiteManager/Integration.php`
  - `includes/SiteManager/SeoAbilities.php`
  - `includes/SiteManager/SeoService.php`
