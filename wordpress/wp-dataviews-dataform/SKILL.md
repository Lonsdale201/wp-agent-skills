---
name: wp-dataviews-dataform
description: >-
  Build or audit data-driven WordPress plugin interfaces with the public
  `@wordpress/dataviews` DataViews, DataViewsPicker, and DataForm components.
  Use for sortable/filterable/paginated admin datasets, item pickers, quick
  edit forms, field and action contracts, server-driven REST queries,
  validation, selection, accessibility, and WordPress 7.1 component migrations.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress DataViews and DataForm

Use the public package to build consistent dataset and editing interfaces. It
renders UI; it does not fetch, authorize, mutate, paginate, or persist records
for you.

## Choose the component

- `DataViews`: browse, search, filter, sort, paginate, select, and act on items.
- `DataViewsPicker`: controlled single- or multi-item selection. It supports
  only `pickerGrid` and `pickerTable`, and has a narrower action contract.
- `DataForm`: edit one record or a deliberately composed bulk-edit value.

Do not use these components to replace a simple settings field or a tiny static
list. Their value starts when fields, views, selection, or actions are reusable.

## WordPress build contract

Install `@wordpress/dataviews` and, when building with `@wordpress/scripts`,
import from its WordPress entry point:

```js
import { DataForm, DataViews } from '@wordpress/dataviews/wp';
```

Do not copy examples that import the package root unchanged into a WordPress
build. The official package explicitly requires `/wp` for that environment.
Ship the package CSS through the plugin build and declare `wp-components` as a
dependency of the plugin stylesheet. Never depend on private exports obtained
through `@wordpress/private-apis` or code copied from the Site Editor bundle.

## Keep the data flow controlled

```jsx
const [ view, setView ] = useState( {
	type: 'table',
	page: 1,
	perPage: 20,
	search: '',
	filters: [],
	sort: { field: 'title', direction: 'asc' },
	fields: [ 'status', 'updated' ],
} );

<DataViews
	data={ records }
	fields={ fields }
	view={ view }
	onChangeView={ setView }
	getItemId={ ( item ) => String( item.id ) }
	paginationInfo={ { totalItems, totalPages } }
	isLoading={ isLoading }
/>
```

The consumer owns every transition. Convert `view.page`, `perPage`, `search`,
`filters`, and `sort` into an allowlisted server query, fetch the matching page,
then return correct totals. Do not fetch every record and claim server
pagination. Reset or clamp an invalid page when filters reduce the result set.

Every item needs a stable unique ID. The default reads `item.id`; otherwise pass
`getItemId`. Never use an array index because sorting and pagination make
selection nondeterministic.

## Define fields once

A field is the shared read, sort, filter, render, edit, and validation contract.
Prefer declared `type`, `label`, `elements`, `filterBy`, and visibility flags.
Use `getValue`/`setValue` when the stored shape is nested, and custom `render`
or `Edit` only when the built-ins cannot express the behavior.

Rendering a label is not authorization. Treat all returned data as potentially
sensitive, and escape or render it as React text rather than injecting HTML.
For complete field/action shapes and picker restrictions, read
`references/contracts-and-security.md`.

## Actions and writes

- Use `isEligible` and `disabled` for UX, not security.
- Re-check capability and object ownership in the REST mutation callback.
- Use a nonce/cookie or application-password authentication appropriate to the
  client; DataViews adds none.
- Make bulk actions explicit with `supportsBulk`; handle partial failures and
  report per-item results rather than pretending the batch was atomic.
- Refresh or update local records only after the server confirms the write.

`DataViewsPicker` supports callback actions, not `RenderModal`; it does not
support `isEligible`. All actions must agree on `supportsBulk` for multi-select.
Its `selection` and `onChangeSelection` props are required.

## DataForm is an edit buffer

```jsx
const [ edits, setEdits ] = useState( {} );
const edited = { ...record, ...edits };

<DataForm
	data={ edited }
	fields={ fields }
	form={ { layout: { type: 'panel' }, fields: [ 'title', 'status' ] } }
	onChange={ ( nextEdits ) => setEdits( ( old ) => ( { ...old, ...nextEdits } ) ) }
	validity={ validity }
/>
```

`onChange` receives edits; it does not save them. Run client validation for
feedback and authoritative server validation on submit. Preserve unsaved edits
across query refreshes deliberately, and clear them only after success or an
explicit cancel.

## WordPress 7.1 compatibility

- WordPress component form controls now use a 40px default. Remove
  `__next40pxDefaultSize`; passing `false` no longer restores 36px.
- The deprecated `Navigation` component is removed; use `Navigator`.
- `__experimentalApplyValueToSides` is removed.
- Several Emotion-backed components moved toward SCSS modules. Do not depend on
  generated class names; `View`'s legacy `css` prop is a no-op.
- Non-paginated core-data entities now return all records. Do not keep a
  `per_page: -1` workaround as a correctness requirement, and review loops that
  assumed the former accidental ten-item slice.

## Test matrix

Test empty/loading/error states, one and many pages, filter + sort combinations,
page shrinkage, duplicate-looking labels with distinct IDs, keyboard-only
selection, screen-reader labels, unavailable actions, bulk partial failure,
server validation, authorization failure, network races, RTL, narrow viewports,
and reduced motion. Abort or ignore stale responses so a slow old query cannot
overwrite a newer view.

## Cross-references

- `wp-view-config-api` for Site Editor view configuration and persistence.
- `wp-rest-api` and `wp-api-fetch-client` for the server/client boundary.
- `wp-plugin-assets-loading` for generated asset files and dependencies.
- `wp-accessibility-audit` for keyboard, focus, labels, and live feedback.

## References

- DataViews package: <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-dataviews/>
- View persistence package: <https://developer.wordpress.org/block-editor/reference-guides/packages/packages-views/>
- WordPress 7.1 editor components: <https://make.wordpress.org/core/2026/07/23/editor-components-updates-in-wordpress-7-1/>
- WordPress 7.1 miscellaneous editor changes: <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>

