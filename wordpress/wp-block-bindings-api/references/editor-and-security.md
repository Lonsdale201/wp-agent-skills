# Block Bindings editor and security reference

## Two registrations, two responsibilities

| Layer | Responsibility |
|---|---|
| PHP `register_block_bindings_source()` | Authoritative server/frontend value resolution |
| Editor `registerBlockBindingsSource()` | Editor preview, binding UI, and optional edit behavior |

A JavaScript-only source cannot make PHP render dynamic frontend values. A PHP-only source can render correctly but may provide a poor editing experience.

## Editor callbacks

- `getValues( { bindings, clientId, context, select } )` returns an object keyed by block attribute.
- `setValues( { bindings, clientId, context, dispatch, select } )` persists edited values. Treat `newValue` as untrusted and use an authorized data/REST layer.
- `canUserEditValue()` controls the editor experience, not server authorization.
- `getFieldsList()` returns picker entries with a `label`, compatible `type`, and source `args`.
- `usesContext` should match the server source. Do not redundantly redefine it in JavaScript when server registration already supplies it to the editor contract.

Use `useBlockBindingsUtils( clientId )` for binding metadata:

```js
import { useBlockBindingsUtils } from '@wordpress/block-editor';

const { updateBlockBindings, removeAllBlockBindings } =
	useBlockBindingsUtils( clientId );

updateBlockBindings( {
	content: {
		source: 'acme/catalog-field',
		args: { key: 'subtitle' },
	},
} );
```

## Threat model

Post content can be imported, edited through REST, copied from another site, or authored by a user with fewer privileges than the data source owner. Consequently:

- binding source names and args are not trusted configuration;
- object IDs in args must not override the actual rendering context without authorization;
- `canUserEditValue()` cannot replace a server capability check;
- the frontend callback must not reveal data merely because the editor previously allowed the binding;
- remote sources require URL allowlists, timeouts, caching, and SSRF-safe HTTP APIs.

## Portable fallback behavior

Keep static block content meaningful. Test these states:

1. plugin active and data exists;
2. plugin active but data is absent;
3. source rejects malformed args;
4. plugin/source disabled;
5. block copied to another site.

The content should remain valid HTML in every state.
