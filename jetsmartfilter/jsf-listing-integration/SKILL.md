---
name: jsf-listing-integration
description: >-
  Connect JetSmartFilters controls to a native JSF Listing or another supported
  listing with the correct provider, query ID, query variable, apply type, and
  pagination contract. Use when building a filterable listing, debugging a
  filter that updates the wrong widget or does nothing, configuring
  content_provider, _element_id, additional providers, pagination, AJAX,
  reload, or mixed filtering.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-smart-filters"
  wp-skills-plugin-version-tested: "3.8.3.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-21"
---

# Connect filters to a listing

Treat the provider/query ID pair as a foreign key. Most apparent AJAX bugs are
identity or query-variable mismatches.

## Native JSF Listing recipe

1. Create the listing and its item card, then place the JSF Listing
   widget/block/element on the page.
2. Set every filter's content provider to **JSF Listing**
   (`jsf-listing`).
3. Give the listing instance a stable, unique query ID. JSF uses the rendered
   `_element_id`; if no ID is available it falls back to `default`.
4. Put the same query ID on every related filter, Apply button, Remove
   Filters, Active Filters/Tags, and Pagination control.
5. Map each filter to a query variable supported by the listing query:
   taxonomy, meta, search, sort, alphabet, or an intentionally handled plain
   query variable.
6. Start with AJAX apply type. Use reload only when the destination query must
   be reconstructed during a normal page request; test mixed mode in both
   paths.
7. Test the unfiltered page, one filter, combined filters, reset, no results,
   pagination, back/forward navigation, and two rapid changes.

## Targeting matrix

| Symptom | First check |
|---|---|
| Nothing happens | The JSF public script loaded and provider is valid |
| Wrong listing changes | Query ID collision or missing query ID |
| AJAX works but reload does not | Provider's request path / query hook is not wired |
| First page works, pagination does not | Provider props or pagination control targets another pair |
| Results change but UI is stale | Post-render code did not use the JSF lifecycle events |
| Additional listing is unchanged | Additional provider pair was not configured explicitly |

Do not infer the query ID from a database listing ID. The native provider's
listing ID selects the saved listing definition; its query ID selects the
rendered instance.

## Native provider contract

The built-in provider uses:

- provider ID `jsf-listing`;
- wrapper selector `.jsf-listing`;
- item selector `.jsf-listing__item`;
- wrapper action `replace`;
- in-depth selector lookup enabled.

It stores the initial query and pagination statistics before the frontend
settings are localized. During AJAX it rebuilds the saved listing, merges the
parsed JSF arguments into the listing query object, and renders it.

Source compatibility warning: the 3.8.3.1 stored-settings key is misspelled
`lisitng_id`, and AJAX reads the same misspelling. Normal configuration code
should not touch it. Code that filters
`jet-smart-filters/providers/jsf-listing/stored-settings` must preserve that
exact key until the installed version changes it.

## Integration checklist

- Use unique IDs that are valid for the target builder and stable across page
  renders.
- Do not bind one pagination control to multiple query IDs.
- Prefer event delegation inside replaced content. Direct listeners disappear
  when the provider wrapper is replaced.
- Keep per-page limits bounded and return accurate `found_posts`,
  `max_num_pages`, and `page` for custom queries.
- If the renderer is not represented by a built-in provider, use
  `jsf-custom-provider-query`; changing CSS selectors alone is not a complete
  provider integration.

## References

Verified against JetSmartFilters 3.8.3.1 source:

- `includes/providers/jsf-listing.php:19-220`
- `includes/providers/base.php:15-101`
- `includes/providers/manager.php:24-146`
- `includes/filters/manager.php:64-111`
- `includes/listing/render/listing-base.php:31-183,335-366`
- `includes/listing/views/blocks/render.php`
- `includes/listing/views/widgets/listing.php`
- `includes/listing/views/bricks/listing.php`
