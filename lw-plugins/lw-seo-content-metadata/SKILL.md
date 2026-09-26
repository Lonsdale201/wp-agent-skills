---
name: lw-seo-content-metadata
description: >-
  Build, extend, or audit LW SEO 1.7.x titles, descriptions, canonical URLs,
  robots directives, Open Graph, Twitter cards, schema, breadcrumbs, post and
  term metadata, template variables, and custom post type support. Use when a
  companion plugin needs to set or filter `_lw_seo_*` values, add SEO behavior
  for custom content, protect restricted summaries, or diagnose duplicate or
  missing head metadata.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "lw-seo"
  wp-skills-plugin-version-tested: "1.7.4"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# LW SEO content metadata

Use LW SEO's public options, metadata helpers, and filters when another plugin owns the content model. Do not duplicate the plugin's head tags or write serialized option arrays from request data.

## Binding contract

| Contract | LW SEO 1.7.4 |
|---|---|
| WordPress | 6.6 or newer |
| PHP | 8.2 or newer |
| Main option | `lw_seo_options` |
| Post and term meta prefix | `_lw_seo_` |
| Settings screen | **LW Plugins -> SEO** |
| Public REST namespace | `lw-seo/v1` |
| Ability namespace | `lw-seo/*` |

The React settings screen depends on WordPress 6.6's `react-jsx-runtime`. Treat the declared minimum as a runtime requirement.

## Store per-object values through the plugin contract

The supported post and term fields are:

| Field | Stored key | Value |
|---|---|---|
| SEO title | `_lw_seo_title` | template-aware string |
| Description | `_lw_seo_description` | plain text |
| Robots | `_lw_seo_noindex`, `_lw_seo_nofollow` | `'1'` or absent |
| Canonical | `_lw_seo_canonical` | absolute URL |
| Social | `_lw_seo_og_title`, `_lw_seo_og_description`, `_lw_seo_og_image` | plain text or image URL |
| Content Signals | `_lw_seo_search`, `_lw_seo_ai_input`, `_lw_seo_ai_train` | `yes`, `no`, or absent |
| Markdown override | `_lw_seo_markdown_content` | raw override; `unfiltered_html` required |

For code running with LW SEO active, prefer its helpers:

```php
use LightweightPlugins\SEO\Options;

Options::set_post_meta( $post_id, 'title', 'A complete title %%sep%% %%sitename%%' );
Options::set_post_meta( $post_id, 'description', 'A concise search description.' );

$title = (string) Options::get_post_meta( $post_id, 'title' );
```

`Options::set_post_meta()` and `set_term_meta()` delete an empty value. Do not call them until LW SEO has loaded, and do not make a companion plugin depend on these internal classes when ordinary WordPress metadata plus public filters is enough.

For agent or remote writes, use `lw-seo/set-meta`; it sanitizes known fields, rejects unknown fields, enforces object-level editing, and applies the `unfiltered_html` gate to the Markdown override.

## Resolve output in the same order as LW SEO

For singular content, a per-object value wins over the content-type template. A custom title replaces the whole document title, so include the site name in the value when wanted.

Template variables include `%%title%%`, `%%sitename%%`, `%%sitedesc%%`, `%%sep%%`, `%%excerpt%%`, `%%author%%`, `%%category%%`, `%%term_title%%`, date variables, search text, and pagination variables. `%%excerpt%%` runs through `get_the_excerpt()`; a membership or paywall integration can mask it there.

Use the final description filter when the visibility rule depends on the current object:

```php
add_filter(
	'lw_seo_meta_description',
	static function ( string $description, WP_Post $post, string $context ): string {
		if ( my_plugin_is_restricted( $post->ID ) ) {
			return '';
		}

		return $description;
	},
	10,
	3
);
```

The contexts are `meta`, `og`, `twitter`, `schema`, `markdown`, and `llms`. This filter also covers manually entered descriptions.

Filter the canonical URL rather than printing a second tag:

```php
add_filter(
	'lw_seo_canonical_url',
	static function ( string $url, $object ): string {
		if ( $object instanceof WP_Post_Type && 'event' === $object->name ) {
			return strtok( $url, '?' );
		}

		return $url;
	},
	10,
	2
);
```

Returning an empty canonical suppresses LW SEO's tag. On singular pages, WordPress core's canonical remains when LW SEO prints none.

## Custom post types and taxonomies

LW SEO automatically considers post types with `public => true` that also pass `is_post_type_viewable()`. Public custom taxonomies with viewable archives can be enabled for sitemap output. For a headless or private type, keep `public` and `publicly_queryable` false; do not turn them on merely to obtain SEO fields.

When adding metadata UI to a custom model, keep ownership clear:

1. Register the model and its capabilities in the owning plugin.
2. Let LW SEO provide its editor panel where WordPress supports it.
3. Use the public filters for computed output.
4. Use the eligibility filter to remove restricted entries from every machine-readable output.
5. Test the anonymous frontend, not only an administrator preview.

LW LMS 2.0.1 intentionally registers `course` and `lesson` as non-public headless types. They do not belong in LW SEO's sitemap or llms.txt. Manage learner-facing discovery in the LMS frontend or its REST API.

## Schema and breadcrumbs

LW SEO prints its own JSON-LD graph and breadcrumb markup. Extend the owning content through documented filters and content metadata; do not print a second `WebSite`, `Article`, canonical, or breadcrumb graph without checking the final page source.

The public helpers are:

```php
echo wp_kses_post( \LightweightPlugins\SEO\lw_seo_breadcrumbs() );
echo do_shortcode( '[lw_breadcrumbs]' );
```

Use one rendering path per location. The shortcode and function produce the same navigation.

## Conflict and restriction checks

LW SEO suppresses its head output when Yoast SEO, Rank Math, or All in One SEO is active. A companion integration must not assume the settings being present means the tags are printed.

Before shipping a content integration, verify:

1. exactly one document title, canonical, description, Open Graph set, and Twitter set;
2. custom values replace templates as intended;
3. paginated archives keep a self-referencing canonical;
4. password-protected and restricted excerpts are absent;
5. private or headless content does not appear in sitemap, llms.txt, or Markdown;
6. both block editor and classic editor save paths preserve unrelated fields;
7. frontend output is escaped and URLs are valid.

## Cross-references

- Use `lw-seo-machine-readable-content` for sitemap, robots.txt, llms.txt, Markdown, and Content Signals.
- Use `lw-seo-automation-compatibility` for WP-CLI, REST, Site Manager, LW Cookie, and LW LMS boundaries.
- Use `wp-security-audit` when public REST or raw Markdown output changes.

## References

- Plugin repository: <https://github.com/lwplugins/lw-seo>
- Developer hooks: <https://github.com/lwplugins/lw-seo/blob/main/docs/developers.md>
- Template variables: <https://github.com/lwplugins/lw-seo/blob/main/docs/template-variables.md>
- Verified source paths:
  - `lw-seo.php`
  - `includes/Options.php`
  - `includes/Content/PostDescription.php`
  - `includes/Meta/HeadMeta.php`
  - `includes/Meta/TitleFilter.php`
  - `includes/Schema/Schema.php`
  - `includes/Breadcrumbs.php`
