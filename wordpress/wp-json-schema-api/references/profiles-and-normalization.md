# JSON Schema profiles and normalization

## Profile matrix

Both profiles include the historical REST schema keywords returned by
`rest_get_allowed_schema_keywords()`: descriptive fields, type/format/enum,
object and array shape, numeric/string/array limits, and `anyOf` / `oneOf`.

The `draft-04` profile additionally preserves:

- `$schema`, `id`, and `$ref`;
- parent-array `required`;
- `allOf` and `not`;
- `definitions` and `dependencies`;
- `additionalItems`.

The preparer only filters and normalizes the schema. Preservation is not a
claim that `rest_validate_value_from_schema()` implements every preserved
Draft 4 keyword.

## Before and after probe

Input:

```php
$schema = array(
	'type'       => 'object',
	'default'    => array(),
	'properties' => array(
		'name' => array(
			'type'              => 'string',
			'required'          => true,
			'sanitize_callback' => 'sanitize_text_field',
		),
		'note' => array(
			'type'     => 'string',
			'required' => false,
		),
	),
);

$prepared = wp_prepare_json_schema_for_client( $schema, 'draft-04' );
```

Expected properties of the result:

- `default` is an object when encoded to JSON;
- parent `required` is `array( 'name' )`;
- neither property retains a boolean `required`;
- `sanitize_callback` is absent.

Do not compare the object default to an array with strict equality. Confirm the
transport representation instead:

```php
$json = wp_json_encode( $prepared );
```

## Failure probes

- Pass an unknown profile and confirm it uses the REST subset.
- Supply an existing parent `required` array and confirm it remains unchanged.
- Nest object schemas in `items`, `additionalProperties`, and `oneOf` and check
  that private keys are removed recursively.
- Add a keyword through `wp_json_schema_allowed_keywords`; confirm it survives
  output but is not magically enforced by REST validation.
- Run the same filter beside another extension to detect request-global
  allowlist changes.
