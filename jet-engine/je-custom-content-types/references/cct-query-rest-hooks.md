# CCT query, REST, and hook reference

Load this reference when implementing lifecycle listeners, Query Builder/CCT DB
filters, related single posts, or a headless client.

## Lifecycle signatures

```php
// Before insert.
do_action("jet-engine/custom-content-types/create-item/{$slug}", $item, $handler);

// After insert.
do_action("jet-engine/custom-content-types/created-item/{$slug}", $item, $item_id, $handler);

// Before update.
do_action("jet-engine/custom-content-types/update-item/{$slug}", $item, $previous, $handler);

// After update, and also after create with $previous = array().
do_action("jet-engine/custom-content-types/updated-item/{$slug}", $item, $previous, $handler);

// After row and optional linked single post are deleted.
do_action("jet-engine/custom-content-types/delete-item/{$slug}", $item_id, $item, $handler);
```

Global filters include:

```text
jet-engine/custom-content-types/item-to-update
jet-engine/custom-content-types/update-item/sanitize-field-value
jet-engine/custom-content-types/prepared-query-args
jet-engine/custom-content-types/user-has-access
jet-engine/custom-content-types/user-capability
```

Scope global filters by `$handler->get_factory()->get_arg('slug')`. A sanitation
filter receives value, field name, and field definition; it does not receive the
factory directly.

`created-item` and the create-path `updated-item` fire before the handler checks
the inserted ID and database error; update-path `updated-item` likewise precedes
the final error branch. Require a positive ID and do not interpret these hooks
as a transactional commit signal. The delete hook is also emitted without
checking the low-level delete result.

## Service fields and related posts

Core service fields:

```text
_ID
cct_status
cct_author_id
cct_created
cct_modified
cct_single_post_id (when single-post projection is configured)
```

Map a related post back to its row with:

```php
$item = $module->manager->get_item_for_post($post_id, $factory);
```

Check for `false`/empty return and do not equate the WordPress post ID with CCT
`_ID`. The linked post is a projection; choose one canonical write path to avoid
two systems overwriting each other.

After `raw_delete_item()`, reset the factory DB's found-item cache before a
same-request `get_item()` existence check. The 3.8.14 delete method removes the
database row but does not invalidate the `_found_items` array populated by an
earlier read. CCT Query Builder also leaves the shared DB format flag as
`OBJECT`; restore `ARRAY_A` and reset the cache before `Item_Handler` mutations,
then restore the caller's previous format in `finally`.

## CCT DB query rows

Simple row:

```php
array(
    'field'    => 'amount',
    'operator' => 'BETWEEN',
    'value'    => array(10, 100),
    'type'     => 'float',
)
```

Nested Query Builder group:

```php
array(
    'is_group' => true,
    'relation' => 'OR',
    'args'     => array(/* filter rows */),
)
```

Allowlisted relations are `AND`/`OR`. Operators and types are normalized by the
CCT DB layer. Still reject unknown field names and set finite limit/offset at
the integration boundary. In 3.8.10+, an incoming `_ID IN` filter is intersected
with an existing `_ID IN` restriction instead of replacing it.

Query Builder settings use type slug `custom-content-type` and keys including:

```text
content_type, status, args, relation, search_query,
offset, number, order
```

## REST configuration mapping

The internal names reflect legacy labels and are easy to confuse:

| Operation | Enable setting | Capability setting |
|---|---|---|
| list/single GET | `rest_get_enabled` | `rest_get_access` |
| create POST | `rest_put_enabled` | `rest_put_access` |
| update POST/PUT/PATCH | `rest_post_enabled` | `rest_post_access` |
| delete DELETE | `rest_delete_enabled` | `rest_delete_access` |

Permission logic returns true when the capability is empty or `public`; otherwise
it calls `current_user_can($capability)`. There is no built-in item-owner check.

List parameters include:

```text
configured field names
_cct_search
_cct_search_by (comma-separated allowed fields)
_limit
_offset
_orderby
_order
_ordertype
_filters (JSON-encoded query/filter structure)
```

When `_limit` is positive, response headers include `Jet-Query-Total` and
`Jet-Query-Pages`. In 3.8.9.1+, search-by fields are intersected with configured
CCT fields. Do not treat that as object authorization or a response-field
allowlist.

REST response transforms can be registered through:

```text
jet-engine/custom-content-types/rest-api/filters/{slug}
```

Query/limit/offset/order filters are:

```text
jet-engine/custom-content-types/rest-api/{slug}/get-items/query
jet-engine/custom-content-types/rest-api/{slug}/get-items/limit
jet-engine/custom-content-types/rest-api/{slug}/get-items/offset
jet-engine/custom-content-types/rest-api/{slug}/get-items/order
```

Apply finite maximums even if a client requests a larger limit. Strip internal
columns from public responses and test unauthenticated single-item enumeration.
