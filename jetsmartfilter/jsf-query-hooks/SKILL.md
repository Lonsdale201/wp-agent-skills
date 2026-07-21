---
name: jsf-query-hooks
description: >-
  Customize JetSmartFilters query arguments and native JSF Listing results
  without leaking changes across providers or listing instances. Use when
  adding mandatory constraints, changing posts_per_page, filtering listing
  items, handling a plain query variable, or reviewing
  jet-smart-filters/listing/render hooks, jet-smart-filters/query/request,
  query/add-var, query/meta-query-row, or query/final-query.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-smart-filters"
  wp-skills-plugin-version-tested: "3.8.3.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-21"
---

# Customize JetSmartFilters queries safely

Prefer the most local hook. Native JSF Listing filters expose the listing
object and can be scoped by saved listing ID. Generic query hooks affect the
shared JSF parser and require provider/query ID guards.

## Native JSF Listing hooks

Use the raw-args filter for stable defaults:

```php
add_filter(
    'jet-smart-filters/listing/render/raw-query-args',
    static function ( $args, $listing ) {
        if ( 123 !== (int) $listing->get_id() ) {
            return $args;
        }

        $args['posts_per_page'] = 12;
        $args['post_status']    = 'publish';

        return $args;
    },
    10,
    2
);
```

Important listing surfaces:

| Hook | Purpose |
|---|---|
| `listing/render/raw-query-args` | Modify stored args before query construction |
| `listing/render/get/query-settings` | Modify presentation/query settings |
| `listing/render/query` | Inspect or replace the query object |
| `listing/render/items` | Modify returned items before card rendering |
| `listing/render/init-listing` | React when one saved listing initializes |
| `listing/render/setup-query-object` | Publish each current item to dynamic renderers |
| `listing/render/reset-query-object` | Clear that item context |

Always return the same value type the filter received. If filtering
`listing/render/items`, preserve objects that the card renderer and query
type's `get_item_id()` understand.

## Generic parsed-query hook

`jet-smart-filters/query/final-query` receives only the parsed query array.
Read provider context from the JSF query manager:

```php
add_filter( 'jet-smart-filters/query/final-query', static function ( $query ) {
    $context = jet_smart_filters()->query->get_current_provider();

    if (
        ! is_array( $context )
        || 'jsf-listing' !== ( $context['provider'] ?? '' )
        || 'catalog-listing' !== ( $context['query_id'] ?? '' )
    ) {
        return $query;
    }

    $query['posts_per_page'] = min(
        48,
        max( 1, absint( $query['posts_per_page'] ?? 12 ) )
    );

    return $query;
} );
```

Do not use `final-query` as a global `pre_get_posts` replacement. If
provider context is unavailable, return unchanged.

## Parser hook map

- `jet-smart-filters/query/request`: raw request before JSF parses it; use only
  for a deliberate compatibility adapter.
- `jet-smart-filters/query/vars`: register an additional parsed query family.
- `jet-smart-filters/query/add-var`: transform a value for such an additional
  family; receives value, key, var, and query manager.
- `jet-smart-filters/query/meta-query-row`: validate/adjust one meta-query row.
- `jet-smart-filters/query/final-query`: last parsed argument array.
- `jet-smart-filters/apply-suffix/{filter_type}`: type-specific suffix
  processing.
- `jet-smart-filters/render/query-vars` and
  `jet-smart-filters/render/set-query-var`: reload/permalink parsing.

## Security and performance rules

- Allowlist field names, taxonomy names, sort keys, comparison operators, and
  directions. A JSF request is public input.
- Normalize arrays and bound page size, offset, and range values.
- Never concatenate request values into SQL. Return structured query args and
  let the target query API prepare them.
- Do not call a remote service or run an unbounded lookup in a hook invoked for
  every filter request.
- Merge `tax_query` and `meta_query` intentionally; a shallow assignment can
  remove the listing's existing constraints.
- Test both AJAX and reload paths, because they reconstruct context at
  different points.

## References

Verified against JetSmartFilters 3.8.3.1 source:

- `includes/query.php:55-150,390-475,565-782,1140-1180`
- `includes/render.php:117-220,297-343`
- `includes/listing/render/listing-base.php:89-183,335-366`
- `includes/listing/render/controller.php:18-120`
- `includes/providers/jsf-listing.php:118-220`
