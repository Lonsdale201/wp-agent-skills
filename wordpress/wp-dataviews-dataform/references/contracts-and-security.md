# DataViews/DataForm contracts and security

## DataViews ownership boundary

The component owns rendering and interaction. The consumer owns:

- fetching and normalizing `data`;
- stable item IDs;
- controlled `view` and `selection` state;
- translating view changes into local or server-side operations;
- pagination totals and race control;
- action authorization and mutations;
- persistence and error handling.

`paginationInfo` contains `totalItems` and `totalPages`; it does not paginate the
dataset. For local data, use a tested local filter/sort/paginate pipeline. For a
REST-backed dataset, send only allowlisted query values and render the returned
page.

## Field review

Check every field for:

- unique `id`, meaningful `label`, and accurate scalar `type`;
- `getValue`/`setValue` symmetry for derived or nested data;
- correct `elements` value types (do not mix numeric and string IDs);
- server-supported sorting/filtering before enabling those controls;
- safe React rendering without `dangerouslySetInnerHTML`;
- visibility and read-only behavior that does not masquerade as authorization;
- deterministic formatters for dates, numbers, and locales;
- validation rules duplicated authoritatively on the server.

## Action review

DataViews actions can include eligibility, disabled state, bulk support,
callbacks, and modal rendering. Eligibility is evaluated in the browser and is
not a capability check. The server must reject unauthorized IDs even if an
attacker crafts the REST call directly.

For bulk writes, define whether the contract is best-effort or atomic. If the
server is best-effort, return item-level successes/errors and reconcile the
visible page. Do not remove all selected rows after a partial failure.

DataViewsPicker is narrower:

- controlled `selection` and `onChangeSelection` are required;
- only `pickerGrid` and `pickerTable` layouts are supported;
- only callback actions are supported, not `RenderModal`;
- `isEligible` is unsupported;
- all actions need `supportsBulk: true` for multi-selection;
- provide `itemListLabel` when no associated heading labels the listbox.

## Async race pattern

Use an `AbortController`, query-library cancellation, or a monotonically
increasing request token. When view A starts, view B starts, then A returns last,
discard A. Track loading and error state per current query, not globally.

## Version discipline

Treat the public package documentation and TypeScript definitions as the
contract. Do not unlock `privateApis`, import from core's built Site Editor
bundle, or select generated class names. Pin npm dependencies, rebuild asset
metadata, and test against the oldest and newest supported WordPress versions.

