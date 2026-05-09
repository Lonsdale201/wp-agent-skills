---
name: fluentcrm-rest-options
description: Register a custom AJAX option list for FluentCRM trigger / action /
  benchmark editor pickers. Pairs `'type' => 'rest_selector', 'option_key' => '<key>'`
  in a settings field with a server-side `add_filter('fluentcrm_ajax_options_<key>',
  $callback, 10, 3)` callback. Filter signature is ($options, $search,
  $includedIds) — return an array of {id, title} pairs. The fallback
  apply_filters call lives in OptionsController::getAjaxOptions which
  the editor's REST hits as the user types or opens the picker.
  Important — pre-selected ids must always be returned (regardless of
  $search) or the editor renders saved values as raw IDs instead of
  human labels. Use when scaffolding any FluentCRM trigger / action /
  benchmark with a multi-select-like field. Triggers on fluentcrm_ajax_options_,
  rest_selector, option_key, getAjaxOptions, OptionsController.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "2.9.87"
api-stable-since: "2.5.9"
php-min: "7.4"
last-updated: "2026-05-09"
docs:
  - https://developers.fluentcrm.com/funnel-builder/custom-trigger/
source-refs:
  - app/Http/Controllers/OptionsController.php
  - app/Services/ExternalIntegrations/FluentCart/FluentCart.php
---

# FluentCRM: register a `rest_selector` option list

For developers building a custom FluentCRM trigger, action, or benchmark that needs a multi-select / single-select field whose options come from your plugin (target courses, target products, target post types, target whatever). The settings-field side declares `'type' => 'rest_selector', 'option_key' => 'my_things'`; the server side registers `add_filter('fluentcrm_ajax_options_my_things', $callback, 10, 3)`. This is a small focused contract — under 100 lines of code per integration — but it has one subtle "include pre-selected IDs" trap.

## API stability note

The `fluentcrm_ajax_options_*` filter family has been in place since FluentCRM 2.5.9 (per the docblock at [OptionsController.php:717](OptionsController.php)). The 3-argument signature `($options, $search, $includedIds)` and the `[{id, title}, ...]` return shape have not changed.

## Misconception this skill corrects

> "I'll filter the options by `$search` only — the picker handles the rest."

Wrong — the picker does NOT separately fetch labels for already-saved IDs. When the admin opens an existing trigger / action whose `course_ids` is `[42, 99]`, the editor calls the same `getAjaxOptions` REST endpoint with `$includedIds = [42, 99]` and an empty `$search`. If your filter callback only honours `$search`, IDs 42 and 99 get a search query of `''` against your filter — which most callbacks treat as "return everything matching empty string" (so the labels are present), but if you've added a `posts_per_page` cap the saved IDs may not appear in the result, and the editor renders the field as bare numbers.

The correct pattern: when `$includedIds` is non-empty, **bypass `$search` and load those specific IDs unconditionally**, then merge with the search-driven results. The canonical approach is to use `post__in` for CPT lookups so already-saved values always come back regardless of search range:

```php
public function get_my_things($options, $search, $includedIds)
{
    $includedIds = is_array($includedIds) ? array_filter(array_map('intval', $includedIds)) : [];

    $args = [
        'post_type'      => 'my_thing',
        'post_status'    => 'publish',
        'posts_per_page' => 50,
        'orderby'        => 'title',
        'order'          => 'ASC',
    ];

    if (!empty($search)) {
        $args['s'] = (string) $search;
    }
    if (!empty($includedIds)) {
        // CRITICAL — load pre-selected ids unconditionally so the editor
        // can render their human labels instead of raw numeric IDs.
        $args['post__in']       = $includedIds;
        $args['posts_per_page'] = -1;
    }

    foreach (get_posts($args) as $thing) {
        $options[] = ['id' => $thing->ID, 'title' => $thing->post_title];
    }

    return $options;
}
```

Other AI-prone misconceptions:

- **"The filter callback returns a `WP_Query` / array of `WP_Post` objects."** No — it must return `array<int, array{id: scalar, title: string}>`. The picker JSON-serialises the result; objects with private fields throw. Use `array_map` if you have model objects.
- **"`option_key` can be anything; the picker just calls my filter."** The filter is dispatched at [OptionsController.php:723](OptionsController.php) only as the fallback case. The controller has built-in handlers for ~30 known option keys (`woo_products`, `woo_categories`, `available_lists`, `tags`, `editable_statuses`, etc.). Pick a key prefixed with your plugin's slug to avoid collisions — e.g. `myplugin_things`, NOT just `things`.
- **"`$includedIds` is the search field's current value."** No — it's the CURRENTLY SAVED value of the field for the loaded sequence/funnel. The editor sends it on the FIRST options request so the picker can render labels for what's already in the form. As the admin types, subsequent requests use `$search` with empty / re-supplied `$includedIds`.
- **"The filter signature is 1 arg."** No — use `add_filter('fluentcrm_ajax_options_<key>', $cb, 10, 3)`. Default `add_filter` accepts only 1 arg; you MUST pass `3` as the 4th argument or `$search` and `$includedIds` will be silently null in your callback.
- **"Adding `'is_multiple' => true` to the field config is enough for multi-select."** Required for multi but not sufficient — the field type `'rest_selector'` is what triggers the picker UI. `'multi-select'` (a different type) preloads all options at once and doesn't hit your filter at all. For multi-select with AJAX search, use `'rest_selector'` + `'is_multiple' => true`.

## When to use this skill

Trigger when ANY of the following is true:

- The diff/files declare `'type' => 'rest_selector'` with an `'option_key'` you control.
- The diff calls `add_filter('fluentcrm_ajax_options_*', ...)`.
- A new FluentCRM trigger / action / benchmark needs to pick from your plugin's CPTs / objects / categories.
- Debugging "the picker shows raw IDs instead of names when I open a saved automation" — almost always Misconception #1 (no `$includedIds` handling).
- Debugging "my callback fires but `$search` is null" — Misconception #4 (missing `4th` arg in `add_filter`).

## The contract in one block

**Field declaration** (in your trigger's `getConditionFields()` or action's `getBlockFields()`):

```php
'thing_ids' => [
    'type'        => 'rest_selector',
    'option_key'  => 'myplugin_things',     // matches the filter suffix below
    'is_multiple' => true,                  // omit / false for single-select
    'clearable'   => true,                  // shows the "x" reset button
    'label'       => __('Target Things', 'my-plugin'),
    'placeholder' => __('Select Things', 'my-plugin'),
    'inline_help' => __('Leave blank to run on every Thing', 'my-plugin'),
],
```

**Server callback** (a single class collecting all `fluentcrm_ajax_options_*` callbacks for your plugin — mirror FluentCRM's own pattern):

```php
<?php
namespace MyPlugin\Support;

final class CustomControllers
{
    public function __construct()
    {
        add_filter('fluentcrm_ajax_options_myplugin_things', [$this, 'get_things'], 10, 3);
        // ... other custom option keys ...
    }

    public function get_things($options, $search, $includedIds)
    {
        if (!Dependency::isMyServiceActive()) {
            return $options;
        }

        $includedIds = is_array($includedIds) ? array_filter(array_map('intval', $includedIds)) : [];

        $args = [
            'post_type'      => 'my_thing',
            'post_status'    => 'publish',
            'posts_per_page' => 50,
            'orderby'        => 'title',
            'order'          => 'ASC',
        ];

        if (!empty($search)) {
            $args['s'] = (string) $search;
        }
        if (!empty($includedIds)) {
            $args['post__in']       = $includedIds;
            $args['posts_per_page'] = -1;
        }

        foreach (get_posts($args) as $thing) {
            $options[] = [
                'id'    => $thing->ID,
                'title' => $thing->post_title,
            ];
        }

        return $options;
    }
}
```

Instantiate `new CustomControllers()` from your plugin bootstrap on `plugins_loaded` — these filters don't have the timing constraint that triggers / actions do, since they're called on-demand from REST.

## Step by step

1. Pick an `option_key` that won't collide. Prefix with your plugin slug. Don't reuse FluentCRM's built-in keys (`woo_products`, `available_roles`, etc.) — those have hardcoded handlers in `OptionsController` that run BEFORE your filter and may short-circuit.
2. Declare the field with `'type' => 'rest_selector'` and the chosen `option_key` in your trigger / action settings.
3. Register the filter callback with **3 accepted args** (`add_filter(..., 10, 3)`).
4. In the callback: build a query honouring BOTH `$search` (user typed in the picker) AND `$includedIds` (already-saved values to render labels for). Return `array<int, array{id, title}>`.
5. Register the controller class on `plugins_loaded` (or any pre-`init` hook); it doesn't need to ride the `fluentcrm_loaded` priority-5 rule that triggers/actions do.

## Critical rules

- **Always honour `$includedIds`.** Pre-selected values must always come back, even if they don't match `$search`. Otherwise the picker renders `[42, 99]` instead of human labels.
- **Always pass `4` as the third arg to `add_filter`** (for the priority+accepted_args = `10, 3`). Forgetting this is the most common silent bug.
- **Return shape is `array<int, array{id, title}>`** — `id` is scalar (int or string), `title` is plain text (escape on output, not here). No `WP_Post` objects.
- **Guard with a dependency check.** Your filter fires on every `getAjaxOptions` REST request that matches the suffix, even when your plugin's feature is disabled. Return `$options` unchanged if not applicable.
- **Don't unbounded-list.** Cap with `posts_per_page` (50 is conventional). The picker is search-as-you-type; loading 5000 rows on the first request kills the editor.
- **Prefix your `option_key` with your plugin slug.** `lw_lms_courses`, `myplugin_widgets` — not `courses`, `widgets`. Built-in keys have hardcoded handlers in `OptionsController` that take precedence; non-prefixed keys risk silent collisions when FluentCRM adds a new built-in.

## Common mistakes

- **Forgetting `accepted_args = 3`.** `add_filter(..., 10)` makes `$search` and `$includedIds` null inside the callback, and the picker silently returns no options. Always pass `3` explicitly.
- **Using `'multi-select'` instead of `'rest_selector'`.** `'multi-select'` preloads all options once at editor render time and doesn't call your filter. Slow for large datasets and bypasses the search.
- **Passing the wrong shape.** `[$id => $title]` (associative) breaks the picker — it expects `[{id, title}]` (list of dicts).
- **Including HTML in `title`.** The picker renders `title` as plain text. HTML tags appear escaped to the admin. If you need formatted labels, do it client-side.
- **Skipping `array_filter(array_map('intval', $includedIds))`.** `$includedIds` arrives as strings from the JSON request; if you compare with `===` against integer post IDs the comparison fails. Cast at the entry point.

## Cross-references

- Run **`fluentcrm-funnel-trigger`** when the option list is consumed by a trigger condition field.
- Run **`fluentcrm-funnel-action`** when the option list is consumed by an action settings field.

## What this skill does NOT cover

- Tag / list / segment pickers — those use built-in keys (`tags`, `lists`, `segments`) handled in `OptionsController` directly; you don't register a filter for them.
- `'option_selectors'` field type — used for `editable_statuses`, `gender`, etc.; sourced from `Helper::getOptionSelectorOptions()` not the AJAX filter.
- Block-editor FluentCRM email designer option pickers — different system.

## References

- Filter dispatch site — `app/Http/Controllers/OptionsController.php:723`
- Reference callback (FluentCart product picker) — `app/Services/ExternalIntegrations/FluentCart/FluentCart.php:70-75`
- Built-in handlers for canonical keys (`woo_products`, `woo_categories`, etc.) — `app/Http/Controllers/OptionsController.php:289-720`
