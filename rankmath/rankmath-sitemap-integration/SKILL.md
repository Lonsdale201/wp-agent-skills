---
name: rankmath-sitemap-integration
description: >-
  Integrate third-party WordPress content with Rank Math XML and HTML sitemaps. Use when custom post types, taxonomies, virtual resources, external-table records, canonical overrides, images, authors, or custom statuses must be included or excluded; when code uses rank_math/sitemap/entry, rank_math/sitemap/providers, rank_math/sitemap/get_posts/*, rank_math/sitemap/post_count/*, rank_math/sitemap/xml_post_url, or sitemap cache invalidation; and when diagnosing empty pages, wrong counts, duplicate URLs, stale XML, pagination, query performance, or custom provider contracts. Covers standard content first, provider design, count/list parity, URL shape, and invalidation.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: seo-by-rank-math
plugin-version-tested: "1.0.273"
wp-version-tested: "7.0.1"
php-min: "7.4"
last-updated: "2026-07-13"
docs:
  - https://rankmath.com/docs/filters-and-hooks/admin/sitemap/
  - https://rankmath.com/kb/filters-hooks-api-developer/
source-refs:
  - includes/modules/sitemap/class-generator.php
  - includes/modules/sitemap/class-cache.php
  - includes/modules/sitemap/class-cache-watcher.php
  - includes/modules/sitemap/providers/interface-provider.php
  - includes/modules/sitemap/providers/class-post-type.php
  - includes/modules/sitemap/providers/class-taxonomy.php
---

# Rank Math sitemap integration

Use Rank Math's normal post-type and taxonomy providers whenever the resource has a real public WordPress URL. Add a custom provider only for content that cannot be represented correctly by those providers.

## Workflow

1. Classify the resource as a normal post, term, author, or genuinely custom URL collection.
2. Establish indexability and canonical ownership before touching the sitemap.
3. Prefer entry filters for small URL-level changes; use symmetric query filters only for database-level eligibility.
4. Add a provider only for a new sitemap type backed by a custom store or virtual resources.
5. Define deterministic ordering, pagination, dates, and cache invalidation together.
6. Verify the sitemap index, every page boundary, and rendered XML.

## Use the built-in provider first

A CPT normally needs no custom provider. Ensure it is public and viewable, give it stable local permalinks, then enable its sitemap in Rank Math settings. Rank Math already:

- includes published, non-password-protected content;
- skips objects resolved as `noindex`;
- excludes posts whose custom canonical differs from their permalink;
- paginates by the configured entries-per-page value;
- adds modification times and discovered images;
- invalidates standard post, term, and author sitemap caches through its watcher.

Do not use a sitemap filter to make private or noncanonical content appear indexable. Align the frontend robots and canonical decisions first.

## Select the narrowest filter

| Need | Hook | Contract |
|---|---|---|
| change or remove one URL entry | `rank_math/sitemap/entry` | array or empty; args include object type and object |
| change a post URL | `rank_math/sitemap/xml_post_url` | absolute local URL plus post |
| enrich/replace selected post object | `rank_math/sitemap/post_object` | object or false |
| exclude an entire CPT | `rank_math/sitemap/exclude_post_type` | boolean plus post type |
| exclude an entire taxonomy | `rank_math/sitemap/exclude_taxonomy` | boolean plus taxonomy |
| alter index entry | `rank_math/sitemap/index/entry` | index array plus kind and subtype |
| add custom providers | `rank_math/sitemap/providers` | array of provider objects |
| alter post list SQL | `rank_math/sitemap/get_posts/join` and `/where` | trusted SQL fragments |
| alter post count SQL | `rank_math/sitemap/post_count/join` and `/where` | matching trusted SQL fragments |
| change sitemap index slug | `rank_math/sitemap/index/slug` | slug; flush rewrites once |

Example entry exclusion:

```php
add_filter( 'rank_math/sitemap/entry', static function ( $url, $type, $object ) {
	if (
		'post' === $type &&
		$object instanceof \WP_Post &&
		'acme_document' === $object->post_type &&
		'1' === get_post_meta( $object->ID, '_acme_sitemap_hidden', true )
	) {
		return [];
	}

	return $url;
}, 10, 3 );
```

Avoid expensive uncached reads inside `rank_math/sitemap/entry`; it runs once per candidate URL.

## Keep count and list queries symmetric

When eligibility must be pushed into SQL, apply the same join and predicate to both count and page queries. Filtering only `get_posts/where` lets Rank Math count excluded rows, which creates sparse or empty sitemap pages. Filtering only `post_count/where` can truncate valid rows.

```php
function acme_rank_math_sitemap_join( string $join, $post_types ): string {
	if ( 'acme_document' !== $post_types ) {
		return $join;
	}

	global $wpdb;
	return $join . " INNER JOIN {$wpdb->postmeta} acme_visibility
		ON p.ID = acme_visibility.post_id
		AND acme_visibility.meta_key = '_acme_public' ";
}

function acme_rank_math_sitemap_where( string $where, $post_types ): string {
	return 'acme_document' === $post_types
		? $where . " AND acme_visibility.meta_value = '1' "
		: $where;
}

foreach ( [ 'get_posts', 'post_count' ] as $query ) {
	add_filter( "rank_math/sitemap/{$query}/join", 'acme_rank_math_sitemap_join', 10, 2 );
	add_filter( "rank_math/sitemap/{$query}/where", 'acme_rank_math_sitemap_where', 10, 2 );
}
```

These hooks append raw SQL. Never interpolate request data, untrusted meta keys, arbitrary column names, or user-controlled operators. Prefer registered content status or entry filtering when the dataset is small enough. Check aliases and argument shapes against the installed version; count may receive a string while compatibility paths can pass arrays.

## Add a custom provider only when necessary

The provider object must expose:

```php
public function handles_type( $type );
public function get_index_links( $max_entries );
public function get_sitemap_links( $type, $max_entries, $current_page );
```

Register it through `rank_math/sitemap/providers`. For optional compatibility, do not declare `implements RankMath\Sitemap\Providers\Provider` in an always-loaded file: that fatals when Rank Math is inactive. Either defer loading the class until `rank_math/loaded` and `interface_exists()` succeeds, or use the same three-method contract without the interface.

```php
add_filter( 'rank_math/sitemap/providers', static function ( array $providers ): array {
	$providers[] = new Acme_RankMath_Sitemap_Provider();
	return $providers;
} );
```

Provider rules:

- Let `handles_type()` return true for one collision-resistant type such as `acme-records`.
- Return index items as `['loc' => $url, 'lastmod' => $date]`.
- Return sitemap items as `['loc' => $url, 'mod' => $date, 'images' => []]`.
- Generate one index entry per page using `ceil( $total / $max_entries )` and the same total used by the page query.
- Treat `$current_page` as one-based. Compute offset as `( max( 1, $current_page ) - 1 ) * $max_entries`.
- Order rows by a stable unique tiebreaker, not modification time alone. Without it, equal timestamps can move between pages.
- Return absolute, same-site, canonical URLs. Rank Math's built-in post provider rejects external URLs; custom providers must enforce equivalent policy themselves.
- Return no secret, draft, deleted, tenant-inaccessible, or noindex records.
- Bound all page queries by `$max_entries`; never load the whole custom table for each sitemap page.

Use `RankMath\Sitemap\Router::get_base_url()` inside a running provider when its base URL filters and subdirectory handling are required. Guard all Rank Math class usage outside provider execution.

## Invalidate caches correctly

For standard posts, terms, and users, trigger normal WordPress mutations so Rank Math's Cache Watcher sees the change. If a custom visibility field changes without a normal object update, dispatch the tested public action where appropriate:

```php
do_action( 'rank_math/sitemap/invalidate_object_type', 'post', $post_id );
```

The tested free version has no generic public invalidation action for an arbitrary custom provider type. If a provider reads a custom table, invalidate after committed writes using a guarded compatibility boundary and test it on every supported Rank Math version:

```php
if ( class_exists( '\\RankMath\\Sitemap\\Cache' ) ) {
	\RankMath\Sitemap\Cache::invalidate_storage();
}
```

This clears all Rank Math sitemap storage, so debounce or defer it during bulk imports. Never clear on reads, on every request, or once per row. Do not disable all sitemap caching to compensate for missing invalidation.

## Prevent common correctness failures

- Do not include a URL whose frontend is `noindex`, redirected, noncanonical, unauthorized, or 404.
- Do not emit alternate-language duplicates without correct canonical/hreflang ownership.
- Do not add raw XML through `rank_math/sitemap/{type}_content` when a provider can return structured URL arrays.
- Do not change the sitemap slug without a one-time rewrite flush. Never call `flush_rewrite_rules()` on normal requests.
- Do not expect an entry filter to fix the page count; it runs after the database query.
- Do not assume an empty first page is harmless. It can produce empty output or a 404 while the index still links to it.
- Do not use the misspelled local hook `rank_math/sitemap/exlude_posts_with_canonical_urls` as a general exclusion API. It is a narrowly scoped compatibility filter in 1.0.273.

## Verification

- Fetch the sitemap index and confirm each custom child URL appears exactly once.
- Test totals at `0`, `1`, `max_entries`, `max_entries + 1`, and an exact multiple of `max_entries`.
- Decode or parse XML and verify escaped URLs, valid dates, no duplicates, and no external hosts.
- Fetch the last valid page and the next page; the latter must not expose stale or repeated entries.
- Change, delete, hide, and restore one source record; verify cache invalidation after each committed state.
- Compare every sampled sitemap URL with its HTTP status, canonical, and robots output.
- Run query profiling on a full page and check for per-entry N+1 metadata or remote calls.
- Disable the Sitemap module and Rank Math itself; the host plugin must remain functional.

## Cross-references

- Use **`rankmath-plugin-compatibility`** for CPT visibility, canonical, robots, and bootstrap rules.
- Use **`rankmath-schema-integration`** when sitemap content also owns structured data.
- Use **`wp-database-performance-audit`** for provider queries, indexes, raw SQL, pagination, and N+1 analysis.

## What this skill does not cover

- Rank Math PRO News/Video sitemap providers without installed source verification.
- IndexNow submission, Search Console submission, or crawl guarantees.
- General XML libraries unrelated to Rank Math's sitemap pipeline.
