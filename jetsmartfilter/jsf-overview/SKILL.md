---
name: jsf-overview
description: >-
  Map a JetSmartFilters integration to the correct filter, provider, query ID,
  listing, frontend event, or extension API. Use when planning or reviewing JSF
  compatibility, diagnosing a filter that targets the wrong listing, choosing
  between JSF Listing hooks and a custom provider, or encountering
  JetSmartFilters, JetSmartFilterSettings, jsf-listing, content_provider, or
  jet-smart-filters hooks without knowing which layer owns the behavior.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-smart-filters"
  wp-skills-plugin-version-tested: "3.8.3.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-21"
---

# JetSmartFilters integration map

Use this as the router for JetSmartFilters work. Keep a single identity pair,
`provider/queryId`, from the filter controls through the request and the
rendered listing.

## Mental model

```text
filter control -> filter group (provider/queryId) -> parsed query args
               -> provider renders content -> frontend replaces/inserts DOM
```

| Layer | Owns | Use |
|---|---|---|
| Filter | User input and query-variable mapping | Existing JSF filter types and their settings |
| Filter group | All controls targeting one provider/query ID | Frontend state, AJAX, pagination, active filters |
| Provider | Locating and re-rendering the target HTML/data | Built-in provider or a registered custom provider |
| Query | Turning filter values into query arguments | Listing-specific filters or JSF query hooks |
| Listing | Initial query, item card, pagination statistics | JSF Listing, JetEngine Listing Grid, Woo archive, or another supported renderer |
| Frontend events | Loading state and post-render compatibility | `jsf-frontend-events` |

## Choose the narrowest extension point

- Configure a normal JSF Listing: use `jsf-listing-integration`.
- Run JavaScript when AJAX starts or finishes: use `jsf-frontend-events`.
- Modify which records a listing returns: use `jsf-query-hooks`.
- Expose an unsupported renderer or data source: use
  `jsf-custom-provider-query`.
- Do not create a custom provider merely to add one query condition. Providers
  own DOM replacement; query hooks own record selection.

## Identity rules

- A provider ID identifies a renderer, not a specific widget. The native JSF
  Listing provider is `jsf-listing`.
- The query ID identifies one instance of that provider. JSF defaults missing
  IDs to `default`.
- Every filter, pagination control, active-filter control, and listing intended
  to work together must resolve to the same pair.
- Two listings using the same provider need distinct query IDs. Otherwise
  requests, stored defaults, props, and frontend groups can collide.
- Scope PHP and JavaScript integrations by both values whenever both are
  available.

## Compatibility workflow

1. Record the plugin version and the target renderer.
2. Inspect the listing's provider and query ID in rendered attributes and
   `window.JetSmartFilterSettings`.
3. Verify the filter's content provider, query ID, apply type, and query
   variable.
4. Confirm the initial query works before testing AJAX.
5. Inspect the `jet_smart_filters` request and JSON response.
6. Verify DOM replacement, pagination props, empty results, rapid changes, and
   browser history.
7. Re-test source-derived hooks after a JSF upgrade; the frontend event bus is
   shipped in a minified bundle and is not a WordPress core API.

## Source-verified boundaries

The public frontend script is enqueued only when a filter marks JSF as used.
`JetSmartFilterSettings` then contains provider selectors, default queries,
provider settings, and pagination props. A companion script must therefore
feature-detect `window.JetSmartFilters` and should load only on pages that use
filters.

## References

Verified against JetSmartFilters 3.8.3.1 source:

- `jet-smart-filters.php:151-219,225-299`
- `includes/filters/manager.php:22-112`
- `includes/data.php:198-228`
- `includes/providers/manager.php:78-146`
- `includes/providers/jsf-listing.php:33-220`
- `assets/js/public.js`
