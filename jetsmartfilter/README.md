# jetsmartfilter

Developer skills for integrating and extending **JetSmartFilters**
(`jet-smart-filters`). These skills cover the provider/query-ID contract,
filterable JSF Listings, the frontend AJAX lifecycle, narrowly scoped PHP query
hooks, and the custom provider/query-type APIs.

Grounded against the locally installed JetSmartFilters 3.8.3.1 source. The
frontend event bus is shipped in a minified bundle, so source-derived event
contracts should be smoke-tested again after plugin upgrades.

## Skills

| Skill | Purpose |
|---|---|
| `jsf-overview` | Route an integration to the correct filter, provider, query ID, listing, event, or extension layer. |
| `jsf-listing-integration` | Connect filters, pagination, and active controls to a listing without provider/query-ID collisions. |
| `jsf-frontend-events` | Handle AJAX start, successful DOM update, loading teardown, initialization, and post-render reinitialization. |
| `jsf-query-hooks` | Customize native listing and parsed JSF query arguments with provider/query-ID scoping and input bounds. |
| `jsf-custom-provider-query` | Register an unsupported renderer as a provider or add a non-post query type to native JSF Listings. |

## Recommended combinations

- Normal filterable JSF Listing: `jsf-listing-integration` +
  `jsf-frontend-events`.
- Mandatory query constraints: `jsf-listing-integration` +
  `jsf-query-hooks`.
- Unsupported renderer or data source: `jsf-custom-provider-query` +
  `jsf-frontend-events`.
