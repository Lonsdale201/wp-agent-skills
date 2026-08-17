---
name: je-custom-content-types
description: >-
  Builds or audits third-party integrations with JetEngine Custom Content Types
  (CCT): resolving Factory instances, custom-table fields and service columns,
  Item_Handler create/update/delete hooks, safe queries, Query Builder, related
  single posts, REST routes and capability boundaries. Use when a plugin reads
  or mutates CCT rows, listens for CCT lifecycle events, exposes CCT data to a
  headless client, or diagnoses missing sanitation, bypassed hooks, unsafe raw
  deletion, public writes, ownership leaks, or CCT/query inconsistencies.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.14"
  wp-skills-wp-version-tested: "7.0.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-17"
---

# JetEngine Custom Content Types (CCT)

Integrate with registered CCT factories rather than treating CCT rows as posts.
Each CCT has a dedicated custom table, its own field schema, service columns,
handler lifecycle, query layer, and optional REST/single-post projection.

## When to use this skill

- Read, create, update, or delete items in an existing CCT.
- React to CCT lifecycle hooks from a companion plugin.
- Query CCT fields through PHP or Query Builder.
- Map a CCT item to its optional related single post.
- Enable or consume `jet-cct` REST routes.
- Audit capabilities, ownership, deletion effects, or direct database calls.

## Module timing and factory lookup

CCT module construction starts on `jet-engine/init`; its manager registers saved
CCT instances on WordPress `init` priority 10. Resolve a factory after that
point and fail closed when the module/type is absent.

```php
add_action('init', static function(): void {
    if (! class_exists(
        'Jet_Engine\\Modules\\Custom_Content_Types\\Module'
    )) {
        return;
    }

    $module  = \Jet_Engine\Modules\Custom_Content_Types\Module::instance();
    $factory = $module->manager
        ? $module->manager->get_content_types('my_records')
        : false;

    if (! $factory) {
        return;
    }

    // Register integration services that depend on this CCT.
}, 20);
```

Use `get_content_types()` with no slug to enumerate factories, but never select
a factory from untrusted input without an allowlist.

## Data model

CCT records are not `WP_Post` objects. A table contains `_ID`, `cct_status`,
`cct_author_id`, `cct_created`, `cct_modified`, optional
`cct_single_post_id`, and configured fields. Use:

```php
$db      = $factory->get_db();
$fields  = $factory->get_formatted_fields();
$item    = $db->get_item($item_id);
$handler = $factory->get_item_handler();
```

Validate the current item and field schema; CCT administrators can rename or
remove fields. Multi-value field types are safely decoded only for known
array-backed fields in 3.8.14. Never apply raw `unserialize()` to CCT values.

## Canonical create and update

Use `Item_Handler::update_item()` for normal mutations. Without `_ID` it
creates; with `_ID` it updates and merges the existing row before sanitation.

```php
$result = $handler->update_item(array(
    '_ID'        => $existing_id, // omit for create
    'title'      => sanitize_text_field($input['title'] ?? ''),
    'score'      => (int) ($input['score'] ?? 0),
    'cct_status' => 'publish',
));

if (is_wp_error($result)) {
    return $result;
}
if (! $result) {
    return new WP_Error('cct_write_failed', 'CCT write failed.');
}
```

The handler applies field-type sanitation, timestamps, status allowlisting,
related-single processing, and lifecycle hooks. Validate business rules,
authorization, required fields, allowed transitions, and foreign IDs before
calling it. On create, supply required/default-sensitive fields explicitly;
do not assume every configured UI default is inserted by programmatic calls.

The factory DB's output format is mutable and shared within the request. CCT
Query Builder sets it to `OBJECT`, while `Item_Handler` paths assume array rows.
If the same request queried object rows before mutating, normalize and restore:

```php
$db              = $factory->get_db();
$previous_format = $db->get_format_flag();
$db->set_format_flag(\ARRAY_A);
$db->reset_found_items_cache();

try {
    $result = $factory->get_item_handler()->update_item($payload);
} finally {
    $db->reset_found_items_cache();
    $db->set_format_flag($previous_format);
}
```

Hook only the target slug:

```text
jet-engine/custom-content-types/create-item/{slug}
jet-engine/custom-content-types/created-item/{slug}
jet-engine/custom-content-types/update-item/{slug}
jet-engine/custom-content-types/updated-item/{slug}
jet-engine/custom-content-types/delete-item/{slug}
```

`updated-item/{slug}` also fires after creation with an empty previous-item
array. Use `created-item/{slug}` when creation-only behavior is required. These
after hooks fire before `update_item()` performs its final DB-error/result
branch, and delete does not verify the low-level delete result before its hook.
They are lifecycle notifications, not transaction-commit guarantees. Require a
positive item ID, make side effects idempotent, and re-read/queue critical
external work after the mutation has been confirmed.

## Deletion is a privileged operation

`delete_item()` enforces the CCT's broad admin capability but can redirect or
terminate. `raw_delete_item()` is the programmatic primitive and performs no
access check. Authorize the actor and item before calling it.

```php
if (! current_user_can('delete_others_posts')) {
    return new WP_Error('forbidden', 'Not allowed.');
}

$item = $factory->get_db()->get_item($item_id);
if (! $item || ! my_plugin_user_may_delete_cct($item)) {
    return new WP_Error('forbidden_item', 'Not allowed for this item.');
}

$factory->get_item_handler()->raw_delete_item($item_id);
```

Raw deletion also permanently deletes `cct_single_post_id` when present. If
`delete_item_on_single_delete` is enabled, permanently deleting the related
single post deletes the CCT row too. Design cleanup hooks for both directions
and guard against recursive side effects. In 3.8.14, the low-level delete path
does not reset the DB object's in-request `_found_items` cache. A prior
`get_item($id)` can therefore remain visible on the same instance after the row
is gone. When same-request read-after-delete matters, call
`$factory->get_db()->reset_found_items_cache()` after deletion. Also normalize
the DB format to `ARRAY_A` before raw deletion when an earlier CCT query may
have selected object output; otherwise the handler can fail before deleting.

## Queries

Prefer the CCT DB API or Query Builder type `custom-content-type`; do not build
SQL with table/field/operator request values. Pass filter rows through
`$factory->prepare_query_args()` before `$db->query()`/`count()`.

```php
$rows = $factory->get_db()->query(
    $factory->prepare_query_args(array(
        array(
            'field'    => 'score',
            'operator' => '>=',
            'value'    => 10,
            'type'     => 'integer',
        ),
    )),
    25,
    0,
    array(array('orderby' => 'score', 'order' => 'DESC', 'type' => 'integer')),
    'AND'
);
```

Apply explicit limits. Query Builder supports nested groups, search, status,
offset/number/order, and returns row objects. Smart Filters may call
`set_filtered_prop()`; protected restrictions must narrow rather than disappear.

## REST security boundary

Enabled CCT routes use namespace `jet-cct`:

```text
GET    /jet-cct/{slug}
GET    /jet-cct/{slug}/{_ID}
POST   /jet-cct/{slug}
POST|PUT|PATCH /jet-cct/{slug}/{_ID}
DELETE /jet-cct/{slug}/{_ID}
```

An empty capability or literal `public` makes that operation public. The
defaults are public GET and `edit_posts` for create/update/delete, but only when
the corresponding route is enabled. Capability checks are global; they do not
enforce item ownership. Add separate object-level policy in your integration
when users may only access their own records. Never enable public mutation for
private, billable, licensed, or trusted workflow state.

Read [cct-query-rest-hooks.md](references/cct-query-rest-hooks.md) for exact REST
parameters, hook signatures, service columns, and query shapes.

## Verification

Test create, partial update, invalid status, missing/removed field, array-backed
field, create-versus-update hooks, handler error, unauthorized delete, linked
single deletion in both directions, zero-result/count queries, paging, public
and authenticated REST, per-item ownership, and response-field exposure.

## References

- Official CCT guide: <https://crocoblock.com/knowledge-base/articles/jetengine-how-to-create-a-custom-content-type/>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/module.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/manager.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/factory.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/item-handler.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/db.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/query-builder/query.php`
  - `wp-content/plugins/jet-engine/includes/modules/custom-content-types/inc/rest-api/public-controller.php`
