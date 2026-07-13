---
name: rankmath-plugin-compatibility
description: >-
  Build or review optional Rank Math compatibility in third-party WordPress plugins and themes: bootstrap safely around rank_math/loaded, expose public CPTs and taxonomies, filter SEO title, description, robots, canonical and social metadata, register replacement variables, feed custom editor fields into content analysis, and support headless output. Use for Rank Math integrations, compatibility layers, custom content models, SEO metadata imports, rank_math/frontend/* or rank_math/opengraph/* hooks, rank_math_register_var_replacement(), and rank_math_content JavaScript filters. Do not use for JSON-LD graph design or sitemap providers; use the focused sibling skills.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "seo-by-rank-math"
  wp-skills-plugin-version-tested: "1.0.273"
  wp-skills-wp-version-tested: "7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-13"
---

# Rank Math plugin compatibility

Implement a soft, hook-based compatibility layer that keeps working when Rank Math is absent or a module is disabled. Prefer WordPress and documented Rank Math hooks over internal containers, direct output, or copied plugin logic.

## Workflow

1. Identify the content surface: singular CPT, taxonomy archive, virtual route, editor-only field, headless URL, or imported SEO metadata.
2. Confirm whether Rank Math is optional or a declared dependency. Keep it optional unless the product explicitly cannot function without it.
3. Register integration hooks early and idempotently.
4. Make frontend output and editor analysis agree, but do not confuse them: frontend PHP filters do not update the editor score, and editor JavaScript filters do not alter frontend tags.
5. Verify rendered HTML, not only stored meta or callback execution.
6. Test once with Rank Math active and once inactive.

## Bootstrap safely

`rank_math/loaded` fires while the Rank Math plugin file is loading, before its `plugins_loaded:14` initialization and before modules load on `after_setup_theme:2`. Handle both plugin load orders:

```php
function acme_rank_math_boot(): void {
	static $booted = false;
	if ( $booted || ! defined( 'RANK_MATH_VERSION' ) ) {
		return;
	}

	$booted = true;
	add_filter( 'rank_math/frontend/title', 'acme_rank_math_title' );
}

if ( did_action( 'rank_math/loaded' ) ) {
	acme_rank_math_boot();
} else {
	add_action( 'rank_math/loaded', 'acme_rank_math_boot' );
}
```

Apply these rules:

- Do not call `rank_math()` before `rank_math/loaded`.
- Do not assume `rank_math/loaded` means active modules are instantiated. Check module-dependent classes after `after_setup_theme` priority 2, or simply register their hooks and let inactive modules leave them unused.
- Use `RankMath\Helper::is_module_active( 'rich-snippet' )` for Schema and `'sitemap'` for XML sitemaps only when the helper exists. The Schema module ID is not `schema`.
- Do not instantiate Rank Math frontend, Paper, Schema, or Sitemap classes yourself during normal requests.
- Do not edit Rank Math files or load files from `RANK_MATH_PATH` manually; its Composer autoloader owns those classes.

## Make custom content discoverable

For a normal CPT or taxonomy, fix the WordPress registration before adding SEO overrides:

- Register indexable CPTs as `public` and `publicly_queryable`, with stable rewrites and canonical permalinks.
- Register public taxonomy archives so `is_taxonomy_viewable()` succeeds.
- Ensure singular and archive requests set the main query conditionals correctly. Rank Math chooses its Paper implementation from those conditionals.
- Treat `rank_math/excluded_post_types` and `rank_math/excluded_taxonomies` as list filters, despite their names. Preserve the array shape.
- Use `rank_math/metabox/add_seo_metabox` only for UI visibility. It does not make content indexable.
- Do not force private, capability-protected, duplicate, search-only, or noncanonical objects into Rank Math.

## Filter frontend metadata

Use the narrowest output filter and preserve its return type:

| Need | Hook | Return |
|---|---|---|
| document title | `rank_math/frontend/title` | string |
| meta description | `rank_math/frontend/description` | string |
| robots directives | `rank_math/frontend/robots` | associative array |
| advanced robots | `rank_math/frontend/advanced_robots` | associative array |
| canonical URL | `rank_math/frontend/canonical` | string/false |
| Open Graph type | `rank_math/opengraph/type` | string |
| Facebook image URL | `rank_math/opengraph/facebook/image` | string |
| Twitter image URL | `rank_math/opengraph/twitter/image` | string |
| Twitter card type | `rank_math/opengraph/twitter/card_type` | string |

Scope every callback to the intended query:

```php
function acme_rank_math_robots( array $robots ): array {
	if ( ! is_singular( 'acme_document' ) || ! acme_is_public_document() ) {
		return $robots;
	}

	$robots['index']  = 'index';
	$robots['follow'] = 'follow';
	return $robots;
}
add_filter( 'rank_math/frontend/robots', 'acme_rank_math_robots' );
```

Do not append a second `<title>`, canonical, robots tag, Open Graph block, or JSON-LD script on `wp_head`. Modify the owner plugin's value instead. Rank Math memoizes Paper values during a request, so register filters before `wp`/`rank_math/head` and keep callbacks deterministic. Returning an empty canonical removes its output; do that only for a deliberate no-canonical response.

## Register replacement variables

Register variables on the dedicated action. Use a globally unique ID and return, never echo, the replacement:

```php
add_action( 'rank_math/vars/register_extra_replacements', static function (): void {
	rank_math_register_var_replacement(
		'acme_reference',
		[
			'name'        => __( 'Document reference', 'acme' ),
			'description' => __( 'Current document reference.', 'acme' ),
			'variable'    => 'acme_reference',
			'example'     => 'DOC-1042',
		],
		static function ( array $var_args, $object ): string {
			$post_id = $object instanceof \WP_Post ? $object->ID : get_queried_object_id();
			return (string) get_post_meta( $post_id, '_acme_reference', true );
		}
	);
} );
```

Set `'nocache' => true` only for genuinely request-varying values. Do not use a user-specific, random, time-varying, or secret value in public SEO metadata.

## Feed custom fields into content analysis

The editor analyzer is separate from frontend metadata. Enqueue only on relevant editing screens with dependencies `wp-hooks` and `rank-math-analyzer`, then return plain analyzable text:

```js
wp.hooks.addFilter( 'rank_math_content', 'acme/seo', ( content ) => {
	const field = document.querySelector( '#acme-summary' );
	return field ? `${ content } ${ field.value }` : content;
}, 20 );
```

On field changes, debounce `rankMathEditor.refresh( 'content' )`. Never include hidden authorization data, secrets, raw JSON blobs, shortcodes that execute side effects, or unbounded HTML. The official documentation also names `rank_math_title`, but the distributed 1.0.273 build inspected for this skill did not expose a verifiable `wp.hooks.applyFilters( 'rank_math_title', ... )` call. Re-check the installed build before relying on that hook.

## Persist metadata only when required

Prefer runtime filters for computed values. For an explicit import or migration, core metadata writes such as `update_post_meta( $post_id, 'rank_math_title', $value )` can be appropriate, but:

- validate authorization and object ownership before accepting external values;
- preserve structured types such as the `rank_math_robots` array;
- distinguish absent, empty, inherited, and intentionally cleared values;
- avoid direct SQL so metadata caches and hooks remain coherent;
- do not read Rank Math metadata and then overwrite it later in the same request after Paper has memoized the old value;
- never overwrite administrator-authored SEO fields on every save unless that ownership contract is explicit.

## Headless compatibility

When Rank Math headless support is enabled, `GET /wp-json/rankmath/v1/getHead?url=<internal-url>` builds the same `rank_math/head` output after reconstructing the WordPress query. Ensure custom rewrites and query conditionals work in a fresh internal request. Do not expose an alternative unauthenticated URL-fetch proxy; Rank Math validates that the requested URL belongs to the site.

## Verification

- Request a representative singular, archive, paginated, noindex, password-protected, and 404 URL.
- Assert exactly one title, description, robots tag, canonical, Open Graph set, and Schema script where applicable.
- Confirm canonical URLs are absolute and agree with sitemap URLs.
- Confirm robots arrays contain keyed directives such as `['index' => 'noindex']`, not a numeric list.
- Edit the custom field and verify the analyzer refreshes without changing saved content unexpectedly.
- Disable Rank Math and confirm the host plugin neither fatals nor emits duplicate fallback SEO unless that fallback is intentional.

## Cross-references

- Use **`rankmath-schema-integration`** for JSON-LD graph entities and Schema.org relationships.
- Use **`rankmath-sitemap-integration`** for XML sitemap inclusion, exclusion, providers, and invalidation.
- Use **`wp-security-audit`** when metadata or custom editor fields accept request data.

## What this skill does not cover

- Rank Math PRO-only APIs unless their source is also available and tested.
- Search ranking guarantees, keyword strategy, or editorial SEO advice.
- Direct modification of Rank Math internals, database tables, or settings UI.

## References

- Official documentation: <https://rankmath.com/kb/filters-hooks-api-developer/>
- Official documentation: <https://rankmath.com/kb/content-analysis-api/>
- Official documentation: <https://rankmath.com/kb/make-theme-rank-math-compatible/>
- Verified source paths:
  - `rank-math.php`
  - `includes/frontend/paper/class-paper.php`
  - `includes/opengraph/`
  - `includes/replace-variables/class-manager.php`
  - `includes/template-tags.php`
  - `includes/rest/class-headless.php`
  - `assets/admin/js/custom-fields.js`
