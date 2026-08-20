---
name: je-dynamic-visibility-condition
description: >-
  Registers or audits a custom JetEngine Dynamic Visibility condition by
  extending Conditions\Base and using the conditions/register hook. Covers
  show/hide polarity, AND/OR behavior, listing-context value resolution,
  custom controls under condition_settings, groups, module timing, pure checks,
  and 3.8.14 silent listing-asset preload behavior. Use when a companion plugin
  adds visibility rules, a condition appears but evaluates backwards, custom UI
  values are missing, or listing/admin/AJAX rendering differs.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-engine"
  wp-skills-plugin-version-tested: "3.8.14"
  wp-skills-wp-version-tested: "7.0.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-17"
---

# JetEngine Dynamic Visibility condition

Implement a condition as a deterministic predicate that follows JetEngine's
show/hide contract. Do not use visibility as an authorization boundary: hidden
markup, REST data, files, and mutations still need server-side access checks.

## When to use this skill

- Add a condition to Dynamic Visibility in a JetEngine companion plugin.
- Diagnose reversed Show/Hide results or surprising AND/OR combinations.
- Read a listing object's post, term, user, comment, product, or custom field.
- Add condition-specific controls or a custom condition group.
- Audit render-time queries, global-state changes, or context-sensitive output.

## Workflow

1. Confirm JetEngine 3.8.14 and the Dynamic Visibility module are active.
2. Register only on
   `jet-engine/modules/dynamic-visibility/conditions/register`; do not instantiate
   the base class before JetEngine loads the module.
3. Give `get_id()` a stable, vendor-prefixed ID.
4. Compute the positive match in `check()`, then return its inverse for `hide`.
5. Use `get_current_value()` when the condition consumes JetEngine's Field UI.
6. Read custom controls from `$args['condition_settings'][<control-key>]`.
7. Keep `check()` pure and cheap. Cache remote/expensive data outside the render
   loop with a key that includes every relevant user/object/site dimension.
8. Test show and hide, AND and OR, listing and non-listing context, empty values,
   logged-in/out users, AJAX/load-more, and repeated calls.

## Minimal condition

Load the named class from the callback (or through a guarded autoloader), so its
parent exists when PHP parses it.

```php
add_action(
    'jet-engine/modules/dynamic-visibility/conditions/register',
    static function ($manager): void {
        require_once __DIR__ . '/src/class-owned-by-current-user.php';
        $manager->register_condition(new My_Plugin_Owned_By_Current_User());
    }
);
```

```php
use Jet_Engine\Modules\Dynamic_Visibility\Conditions\Base;

final class My_Plugin_Owned_By_Current_User extends Base {
    public function get_id() {
        return 'my_plugin_owned_by_current_user';
    }

    public function get_name() {
        return __('Owned by current user', 'my-plugin');
    }

    public function get_group() {
        return 'user';
    }

    public function is_for_fields() {
        return false;
    }

    public function need_value_detect() {
        return false;
    }

    public function check($args = array()) {
        $object = jet_engine()->listings->data->get_current_object();
        $match  = $object instanceof WP_Post
            && (int) $object->post_author === get_current_user_id();

        return 'hide' === ($args['type'] ?? 'show') ? ! $match : $match;
    }
}
```

JetEngine's checker expects each condition to honor `type`. For a positive
predicate `M`, return `M` for `show` and `! M` for `hide`. Do not invert again
for AND/OR; the checker combines each returned value.

## Field-aware conditions

`Base::get_current_value($args)` resolves the current listing object:

- `WP_Post` and exact `WC_Product`: post meta;
- `WP_User`: user meta;
- `WP_Term`: term meta;
- `WP_Comment`: comment meta;
- other listing objects: JetEngine listing-data property;
- non-listing field context: current post meta;
- macro/dynamic Field input: JetEngine macro output.

Use `adjust_values_type()` for JetEngine-compatible `numeric`, `date`,
`datetime`, or string comparison. Treat empty, missing, `0`, and `'0'`
explicitly; do not use `empty()` when zero is meaningful.

## Custom controls

```php
public function get_custom_controls() {
    return array(
        'my_plugin_roles' => array(
            'label'    => __('Allowed roles', 'my-plugin'),
            'type'     => 'select2',
            'multiple' => true,
            'default'  => array(),
            'options'  => wp_roles()->get_names(),
        ),
    );
}

public function check($args = array()) {
    $settings = $args['condition_settings'] ?? array();
    $roles    = isset($settings['my_plugin_roles'])
        ? (array) $settings['my_plugin_roles']
        : array();
    $match    = (bool) array_intersect($roles, wp_get_current_user()->roles);

    return 'hide' === ($args['type'] ?? 'show') ? ! $match : $match;
}
```

Control keys are not copied to the top-level `$args`. Prefix them to avoid
collisions. Use a built-in group slug (`general`, `jet-engine`, `user`, `posts`,
`date_time`, `listing`) or add a label through
`jet-engine/modules/dynamic-visibility/conditions/groups`.

## Security and reliability invariants

- Never grant access because an element is hidden or visible.
- Never change the current listing object, query globals, locale, or user from
  `check()` without restoring state in `finally`.
- Never emit output, redirect, mutate data, or call an unstable remote service.
- Avoid one database query per card in a Listing Grid; prefetch or cache.
- Do not bypass
  `jet-engine/modules/dynamic-visibility/condition/prevent-check`. JetEngine
  3.8.14 uses it while silently preloading listing assets.
- Return a boolean on every path and choose a safe failure result deliberately.

## Verification

Assert all four polarity/composition cases and run the same condition twice:

```text
show + match       => render
show + no match    => suppress
hide + match       => suppress
hide + no match    => render
```

Also verify a Listing Grid with load more and a builder preview. Check query
counts when the rule can appear on many cards.

## Deeper implementation reference

Read [implementation-reference.md](references/implementation-reference.md) when
implementing field comparisons, custom groups, context handling, or tests.

## References

- Official documentation: <https://crocoblock.com/knowledge-base/plugins/jetengine/>
- Crocoblock developer documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/01-jet-engine>
- Verified source paths:
  - `wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/base.php`
  - `wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/manager.php`
  - `wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions-checker.php`
  - `wp-content/plugins/jet-engine/includes/modules/dynamic-visibility/inc/conditions/week-days.php`
  - `wp-content/plugins/jet-engine/includes/components/listings/frontend.php`
