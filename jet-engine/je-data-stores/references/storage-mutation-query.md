# Data Store storage, mutation, and query reference

Load this reference for programmatic writes, custom store types, counter
integrity, Query Builder, or CCT-backed stores.

## Factory surface

Useful read/configuration methods:

```text
get_slug()
get_name()
get_size()
get_type()
get_arg($name)
is_user_store()
is_on_view_store()
can_count_posts()
get_count()
get_post_count($item_id)
get_store()
in_store($item_id)
```

Do not call `get_count()` or `in_store()` for a frontend-only local-storage
Factory. Its PHP `get()` method returns `null`, while those wrappers expect an
array. Branch on `$store->get_type()->is_front_store()` first.

Counter methods are public but low-level:

```text
increase_post_count($item_id)
decrease_post_count($item_id)
reset_all_post_counts()
```

Use them only after confirming a real membership transition. Replaying an add
must not increment twice; removing a missing item must not decrement.

## Frontend mutation sequence

Add in 3.8.14:

```text
verify post_id + matching store slug
read old count
before-add-to-store action
enforce max size; optionally evict oldest on-view item
apply filtered-id(..., 'add')
type->add_to_store()
increment item count only if returned store count grew
after-add-to-store action
filter fragments; JSON success
```

Remove in 3.8.14:

```text
verify post_id + matching store slug
read old count
apply filtered-id(..., 'remove')
type->remove()
before-remove-from-store action (already post-mutation)
decrement item count only if returned store count shrank
after-remove-from-store action
filter fragments; JSON success
```

Hooks receive the original visible item ID, store slug, and Factory. Storage may
receive a different ID through `filtered-id`, notably for CCT listing objects.

## Core hooks and filters

```text
jet-engine/data-stores/register-store-types
jet-engine/data-stores/register-stores
jet-engine/data-stores/store/data
jet-engine/data-stores/store-post-id
jet-engine/data-stores/filtered-id
jet-engine/data-stores/before-add-to-store
jet-engine/data-stores/after-add-to-store
jet-engine/data-stores/before-remove-from-store
jet-engine/data-stores/after-remove-from-store
jet-engine/data-stores/ajax-store-fragments
jet-engine/data-stores/pre-get-post-count
jet-engine/data-stores/custom-count-increased
jet-engine/data-stores/custom-count-decreased
jet-engine/data-stores/custom-reset-all-post-counts
```

Scope every global filter to the expected store slug/type. Return the incoming
value unchanged for other stores.

## Custom type registration

Load the subclass only from the registration callback because JetEngine loads
`Base_Store` immediately before firing the action:

```php
add_action(
    'jet-engine/data-stores/register-store-types',
    static function($manager): void {
        require_once __DIR__ . '/src/class-my-plugin-store.php';
        $manager->register_store_type(new My_Plugin_Store());
    }
);
```

Contract:

```php
abstract public function type_id();
abstract public function type_name();
abstract public function add_to_store($store_id, $item_id);
abstract public function remove($store_id, $item_id);
abstract public function get($store_id);
```

Return the resulting item count from add/remove. Make duplicate add and missing
remove idempotent. Protect writes with transactions/unique constraints when the
backend permits concurrent requests. `sanitize_store_item()` supports integer,
string, and JSON-encoded arrays, but the custom backend must define its own
round-trip shape and validation.

Optional browser-only contract:

```text
is_front_store() => true
js_add_to_store()
js_remove()
js_in_store()
js_get_store()
```

Treat generated JS as code: never interpolate an unescaped administrator/user
value into it.

## Query Builder

Type slug: `data-stores-query`.

Principal settings:

```text
store_slug
max_items
post__in (used by frontend-store bridge)
post/user query filter properties
```

Server stores resolve current IDs immediately. User stores build
`WP_User_Query` with `include`; post stores build `WP_Query` with `post__in` and
preserve store order. A CCT bridge can return CCT row objects instead.

When local storage is used, JetEngine writes an `is-front,{type},{slug}` marker
and obtains actual IDs from the browser request. Enforce published/object-level
visibility on server re-entry; browser IDs are untrusted.

## Counter integrity

Post items use post meta `jet_engine_store_count_{slug}`. User items use the
same suffix in user meta. CCT items use a generated service column whose hyphens
and spaces are converted to underscores.

Counts are denormalized. They drift when writes bypass Factory orchestration,
when a request partially fails, or when eviction does not run a decrement path.
Provide a repair/recount command for important displays. Clearing supported
stores in the admin resets counts first (3.8.11+); custom backends must make
clear and reset behavior complete and repeatable.

## Security review

- Inspect both `wp_ajax_...` and `wp_ajax_nopriv_...` registrations.
- Treat forwarded-IP headers and cookies/local storage as attacker-controlled.
- Do not reveal private posts/users/CCT rows merely because their IDs are stored.
- Cap store/query sizes and response cost.
- Do not use global page caches for personalized server-backed store output.
- Separate engagement metrics from audited business analytics.
