---
name: lw-seo-machine-readable-content
description: >-
  Configure, extend, or audit LW SEO 1.7.x XML sitemaps, robots.txt, llms.txt,
  llms-full.txt, per-object Markdown, Content Signals, and AI crawler rules.
  Use when code touches lw_seo_post_is_eligible, sitemap or Markdown filters,
  `/md`, `Accept: text/markdown`, Content-Signal headers, crawler policy,
  restricted content, or cache invalidation for machine-readable output.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "lw-seo"
  wp-skills-plugin-version-tested: "1.7.4"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# LW SEO machine-readable content

Treat the sitemap, llms files, Markdown endpoint, and Content Signals as separate outputs with one shared content eligibility boundary. Test what an anonymous visitor receives because llms caches are built logged out and served to everyone.

## Output map

| Output | Default | Main contract |
|---|---|---|
| `/sitemap.xml` | enabled | index plus per-type XML files |
| virtual `/robots.txt` additions | enabled | sitemap, llms links, crawler rules, Content Signal |
| `/llms.txt` | enabled | one section per enabled public post type |
| `/llms-full.txt` | disabled | concatenated Markdown, capped at 1 MiB |
| `/{object}/md` and `/markdown` | enabled for eligible objects | explicit Markdown response |
| `?format=md` | enabled for eligible objects | explicit Markdown response |
| `Accept: text/markdown` | negotiated | singular HTML URL can return Markdown |

Activation registers rewrite rules for enabled virtual endpoints. Toggling sitemap, llms.txt, or llms-full.txt schedules a soft rewrite flush for the next request.

## Apply the shared eligibility gate

A post is eligible only when it is published, has no password, belongs to a viewable post type, is not globally or individually noindex, and passes `lw_seo_post_is_eligible`. AI output also requires `ai-input` not to resolve to `no`.

Use the restrict-only filter for membership, LMS, intranet, or paid content:

```php
add_filter(
	'lw_seo_post_is_eligible',
	static function ( bool $eligible, WP_Post $post ): bool {
		if ( my_plugin_requires_entitlement( $post->ID ) ) {
			return false;
		}

		return $eligible;
	},
	10,
	2
);
```

This removes an otherwise eligible object from the sitemap, llms.txt, llms-full.txt, and Markdown endpoint. It cannot make an ineligible object public.

Do not rely only on `the_content` masking. llms-full.txt renders entries outside the normal singular main query. Mask descriptions with `get_the_excerpt` or `lw_seo_meta_description`, and exclude objects at the eligibility gate when no machine-readable trace should remain.

## Extend the sitemap safely

Use these filters:

- `lw_seo_sitemap_post_types( array $types )` for enabled type names;
- `lw_seo_sitemap_exclude_post( bool $exclude, int $post_id )` for one object;
- `lw_seo_sitemap_excluded_ids( int[] $ids, string $post_type )` for a batch;
- `lw_seo_sitemap_urls( array $items, string $name, int $page )` for final URL entries.

Keep each item shaped like `loc` plus optional `lastmod`, `changefreq`, and `priority`. Escape only at output; pass canonical absolute URLs to the filter.

After changing permalink or eligibility rules:

```bash
wp lw-seo sitemap info
wp lw-seo sitemap flush
```

Verify the index and one per-type file. A private test installation with `blog_public=0` intentionally omits the sitemap line from robots.txt even while the XML endpoint itself works.

## Operate llms.txt and its cache

Every enabled public post type gets its own section. Pages use menu order; other types use newest first. Per-section limits are clamped to 1-500. Non-public LW LMS `course` and `lesson` types are excluded by design.

Use the uncached preview while developing:

```bash
wp lw-seo llms info
wp lw-seo llms preview
wp lw-seo llms preview --full
wp lw-seo llms flush
```

The preview builds as user ID 0 without reading or writing the transient. The public documents use one-day transients and invalidate on relevant content, term, option, permalink, site identity, and plugin-version changes.

Use `lw_seo_llms_txt_post_types` to remove or rename sections. Preserve the `post_type => heading` mapping.

## Extend Markdown by object type

The frontmatter and body filters receive `WP_Post|WP_Term`. Do not type-hint the second argument as only `WP_Post`; term archive Markdown passes a `WP_Term`.

```php
add_filter(
	'lw_seo_markdown_frontmatter',
	static function ( array $data, WP_Post|WP_Term $object ): array {
		if ( $object instanceof WP_Post && 'event' === $object->post_type ) {
			$data['event_date'] = (string) get_post_meta( $object->ID, 'event_date', true );
		}

		return $data;
	},
	10,
	2
);
```

The available filters are:

- `lw_seo_markdown_is_supported( bool $supported, WP_Query $query )`;
- `lw_seo_markdown_frontmatter( array $data, WP_Post|WP_Term $object )`;
- `lw_seo_markdown_body( string $body, WP_Post|WP_Term $object )`;
- `lw_seo_markdown_output( string $output, WP_Post|WP_Term $object )`.

Explicit Markdown sends `text/markdown`, `nosniff`, `X-Robots-Tag: noindex`, a canonical Link header, and a token estimate. Negotiated Markdown also sends `Vary: Accept`, `Cache-Control: private, no-store`, and defines `DONOTCACHEPAGE` so a shared HTML cache does not serve Markdown to browsers.

Only `unfiltered_html` users may set the custom Markdown override because the plugin serves it verbatim. Preserve that capability gate in every custom editor or automation path.

## Resolve Content Signals

The three signals are `search`, `ai-input`, and `ai-train`, each with `yes`, `no`, or not specified. Resolution order is:

1. global option;
2. per-post or per-term override;
3. `lw_seo_content_signals` filter.

Only set values appear in the `Content-Signal` and legacy `X-Content-Signals` headers, the HTML meta tag, and robots.txt.

```php
add_filter(
	'lw_seo_content_signals',
	static function ( array $signals, WP_Post|WP_Term|null $object ): array {
		if ( $object instanceof WP_Post && my_plugin_is_training_restricted( $object->ID ) ) {
			$signals['ai-train'] = 'no';
		}

		return $signals;
	},
	10,
	2
);
```

Content Signals and robots.txt are policy declarations. They do not enforce authentication or prevent a non-compliant client from fetching a public URL.

## Verify response behavior

For every changed content type, test:

1. published public object is present in its sitemap and llms section;
2. draft, private, password-protected, noindex, and `ai-input=no` objects are absent;
3. entitled content is not leaked through description, llms-full, or custom Markdown;
4. `/md`, `/markdown`, query format, and Accept negotiation return the documented status and headers;
5. HTML and Markdown caches stay separated by `Vary` and `private, no-store`;
6. physical `robots.txt` is reported, because it bypasses WordPress's virtual filter;
7. a setting toggle survives a rewrite flush and cache flush.

## Cross-references

- Use `lw-seo-content-metadata` for head tags, object fields, and canonical filters.
- Use `lw-seo-automation-compatibility` for Site Manager, REST, Cookie, and LMS integration boundaries.
- Use `wp-plugin-rewrite-rules` when another plugin owns a competing root endpoint.

## References

- Plugin repository: <https://github.com/lwplugins/lw-seo>
- AI and llms settings: <https://github.com/lwplugins/lw-seo/blob/main/docs/settings-ai.md>
- Markdown endpoint: <https://github.com/lwplugins/lw-seo/blob/main/docs/markdown-endpoint.md>
- Sitemap settings: <https://github.com/lwplugins/lw-seo/blob/main/docs/settings-sitemap.md>
- Verified source paths:
  - `includes/Content/Eligibility.php`
  - `includes/Content/PostTypes.php`
  - `includes/Sitemap/PostProvider.php`
  - `includes/Sitemap/Sitemap.php`
  - `includes/LlmsTxt/Cache.php`
  - `includes/LlmsTxt/SectionCollector.php`
  - `includes/Markdown/Endpoint.php`
  - `includes/ContentSignals.php`
  - `includes/RobotsTxt.php`
