---
name: wp-plugin-hooks
description: Design custom action/filter hooks emitted by a plugin:
  action vs filter semantics, prefixed names, docblocks, parameter
  stability, *_ref_array forwarding, and deprecated hook migration. Use
  when adding, reviewing, evolving, or deprecating a public hook surface.
  Triggers on do_action, apply_filters, apply_filters_deprecated,
  do_action_deprecated, apply_filters_ref_array, do_action_ref_array,
  did_action, did_filter, or hook @since docblocks.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.5 - 6.9"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://developer.wordpress.org/plugins/hooks/
  - https://developer.wordpress.org/reference/functions/apply_filters/
  - https://developer.wordpress.org/reference/functions/do_action/
  - https://developer.wordpress.org/reference/functions/apply_filters_deprecated/
  - https://developer.wordpress.org/reference/functions/do_action_deprecated/
---

# WordPress plugin: custom hooks (the ones YOU emit)

This skill is about hooks the plugin **emits** as its public extension surface — the actions and filters other developers wire into to modify or react to the plugin's behavior. Using core WP hooks (`init`, `wp_enqueue_scripts`, `the_content`, etc.) is basic WP and out of scope; designing your own hooks well is what separates a plugin people can extend from one they have to fork.

A custom hook is part of your plugin's API contract. Once a third party builds on it, breaking the signature in a minor release is a backwards-incompatibility bug — same as renaming a public PHP method.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a `do_action` or `apply_filters` call that other plugins / themes will hook into.
- Reviewing a PR that introduces or modifies a custom hook.
- Evolving a hook signature across plugin versions (adding parameters, renaming, deprecating).
- Removing or renaming an existing hook — read the deprecation section before doing this.
- The diff contains: `do_action`, `apply_filters`, `apply_filters_deprecated`, `do_action_deprecated`, or a docblock starting with `Fires` / `Filters` above a hook call.

## Action vs filter — pick by semantics

Both are events your code emits during execution. The semantic difference:

| Hook type | Question it answers | What listeners do | Return |
|---|---|---|---|
| **Action** (`do_action`) | "This thing happened — anyone want to react?" | Side effects (log, send email, update meta, schedule cron). Don't return a value. | None |
| **Filter** (`apply_filters`) | "I have this value. Anyone want to modify it before I use it?" | Take the value, optionally transform it, return it. | The (possibly modified) value |

Concrete examples:

```php
// ACTION — "the user just submitted the form"; downstream side effects
do_action( 'myplugin/form_submitted', $form_id, $submission );
// Listeners: send Slack notification, log to audit table, dispatch webhook.

// FILTER — "here's the response message; anyone want to override?"
$message = apply_filters( 'myplugin/response_message', $default_message, $form_id );
// Listeners: replace the message based on form_id, append "(internal)" prefix.
```

If listeners might want to MUTATE the data flow, it's a filter. If they want to REACT to an event, it's an action. When in doubt: would removing all listeners change the plugin's output? Yes → filter. No → action.

## Naming — prefix everything, pick one separator

WP core mostly uses `underscore_style` names (`pre_get_posts`, `rest_pre_serve_request`). Slash-style names are common in plugin ecosystems for namespaced surfaces (`myplugin/before_request`), but they are not the dominant core convention. The hard rule: **prefix with the plugin slug** so collisions are impossible.

```php
// Slash-separated - visually clear that this is plugin-namespaced
do_action( 'myplugin/before_request', $payload );
apply_filters( 'myplugin/api_response', $response, $request );

// Underscore-separated - matches WP core convention
do_action( 'myplugin_before_request', $payload );
apply_filters( 'myplugin_api_response', $response, $request );
```

Pick one style and stay consistent across the plugin. Mixing `myplugin/before_request` and `myplugin_after_request` in the same plugin is confusing for documentation tools and developers searching the source.

## Document every hook with a docblock

The `@since` + `@param` block above each hook call is non-negotiable — IDE tooltips, source-search tools (`hooks.wp.org`, AI assistants suggesting hooks), and humans grepping for hooks all depend on it.

```php
/**
 * Fires before the AI request is sent.
 *
 * @since 1.2.0
 *
 * @param array  $payload The request payload.
 * @param string $context Reason for the request: 'verdict' or 'enrichment'.
 */
do_action( 'myplugin/before_request', $payload, $context );

/**
 * Filters the AI response message that will be shown to the user.
 *
 * @since 1.0.0
 * @since 1.3.0 Added the `$decision` parameter.
 *
 * @param string $message  The response message.
 * @param int    $form_id  ID of the form being processed.
 * @param bool   $decision The AI's TRUE/FALSE verdict.
 *
 * @return string Possibly modified message.
 */
$message = apply_filters( 'myplugin/response_message', $message, $form_id, $decision );
```

Conventions:

- **`Fires` for actions, `Filters` for filters** as the opening verb in the description (matches WP core docblocks; documentation generators grep for it).
- **`@since X.Y.Z`** for the version when the hook first appeared, plus a separate `@since` line for each later parameter addition.
- **Every parameter documented** with type and meaning. The first arg in a filter is always "the value being filtered".
- **For filters: `@return`** describes the return type — same shape as the input value (filters MUST preserve type).

## Parameter design

Three rules govern parameters that age well:

### 1. Order: most-likely-to-be-modified first

For filters, the first arg is always the value being filtered. For actions and filters alike, **arrange other args in order of likely use** — listeners often only want one or two pieces of context. If the form ID is the most useful piece for filtering, put it second.

```php
// Better — form_id is more often useful than the full submission array
apply_filters( 'myplugin/should_process', true, $form_id, $submission );

// Worse — listener has to accept submission they don't need to skip past
apply_filters( 'myplugin/should_process', true, $submission, $form_id );
```

### 2. Pass IDs and primitives, not heavy objects when avoidable

Listeners may only need the form ID; passing the whole `Form` object means every listener carries the full object even if they ignore it. When the work to fetch the object is cheap (small DB hit), pass the ID; when listeners always need the object anyway, pass it.

### 3. Keep the parameter count below 4

Beyond 4 args, listeners get unwieldy. If you find yourself wanting 5+ args, bundle them into an associative array:

```php
// 6-arg action — listeners must accept all six in order
do_action( 'myplugin/render', $template, $context, $vars, $depth, $strict, $cache_key );

// Better — single context array, listeners pick what they need
do_action( 'myplugin/render', array(
    'template'  => $template,
    'context'   => $context,
    'vars'      => $vars,
    'depth'     => $depth,
    'strict'    => $strict,
    'cache_key' => $cache_key,
) );
```

The trade-off: array-as-arg loses static analysis benefits. For 2-3 strongly-typed args, prefer separate parameters; for 5+ heterogeneous fields, bundle.

## `do_action_ref_array` / `apply_filters_ref_array` — when args are dynamic

The standard `do_action( $hook, ...$args )` and `apply_filters( $hook, $value, ...$args )` use variadic spread (PHP 5.6+). When you DON'T know the args at compile time — typically when proxying / forwarding hook calls — use the array variants:

```php
$args = array( $payload, $context, $extra );

// Spread variant — only when args are statically known
do_action( 'myplugin/event', $payload, $context, $extra );

// Array variant — args are an array dynamically
do_action_ref_array( 'myplugin/event', $args );
```

The naming `_ref_array` is historical. These functions accept the hook arguments as an array and pass that array to `WP_Hook`; they are primarily "args-as-array" variants. References only matter if the array elements themselves are references, so do not reach for these functions as a generic "make callback args mutable" tool. Verified in `wp-includes/plugin.php` `apply_filters_ref_array` / `do_action_ref_array`.

99% of plugin code uses the spread variants. Reach for the array variants only when forwarding (`apply_filters_deprecated` uses them internally for exactly this reason).

## The stability promise

Once a hook is documented and shipped:

- **Don't change parameter count or order** in minor / patch releases. Adding a NEW parameter at the END is OK with proper `@since` annotation; reordering or removing is a major version bump.
- **Don't change parameter types.** Going from `int $form_id` to `string $form_slug` is a breaking change.
- **Don't change return-type semantics for filters.** A filter that returned `string` shouldn't suddenly return `string|null`.
- **Don't move the hook to a different code path** that significantly changes timing. Listeners may rely on "this fires before X happens".

Track public hooks in your plugin's documentation / README under a "Hooks" section. Treat them with the same rigor as the public methods of a class.

## Deprecation pathway

When you genuinely must change or remove a hook, deprecate, don't delete. WordPress provides `apply_filters_deprecated` and `do_action_deprecated` (`wp-includes/plugin.php`, since WP 4.6) that fire the hook for any remaining listeners AND emit a `_deprecated_hook` notice (`wp-includes/functions.php`).

```php
// OLD HOOK (now deprecated): myplugin/old_response
// NEW HOOK: myplugin/response_message

// Step 1: emit BOTH hooks so existing listeners keep working.
$message = apply_filters( 'myplugin/response_message', $default, $form_id );

// Fire the deprecated hook with the same args; emits _deprecated_hook notice.
$message = apply_filters_deprecated(
    'myplugin/old_response',           // old hook name
    array( $message, $form_id ),       // args (as array)
    '1.5.0',                           // version when deprecated
    'myplugin/response_message',       // replacement
    'Use myplugin/response_message instead.' // optional message
);
```

For actions:

```php
do_action_deprecated(
    'myplugin/old_event',
    array( $payload ),
    '1.5.0',
    'myplugin/new_event'
);
```

The deprecation helpers short-circuit when no listener is attached (`has_filter` / `has_action` returns false), so they're cheap when nobody's listening. The notice fires only when someone IS still using the old hook — exactly when you want them informed.

Deprecation policy: keep the deprecated hook for at least one major version. `1.5.0` deprecates → `2.0.0` removes. Document the migration in the changelog.

## Critical rules

- **Action for events, filter for value transformations.** Don't use a filter for side effects or an action for "let me modify this".
- **Prefix every custom hook** with the plugin slug. Pick `slash/style` or `underscore_style`, stay consistent.
- **Docblock every hook** — `Fires` / `Filters` opening, `@since`, every `@param` typed and described, `@return` for filters.
- **Filters MUST preserve type.** A filter receiving `string` returns `string` (or you've designed it badly). Listeners who break the type get to fix their callbacks; you don't change the contract on them.
- **Parameter contract is your API.** No reordering, no type changes, no removals in non-major releases.
- **Deprecate via `apply_filters_deprecated` / `do_action_deprecated`**, never silent-delete a public hook.
- **Bundle 5+ args into an array** instead of growing the parameter list.

## Common mistakes

```php
// WRONG — action used as a filter (return value lost)
$result = do_action( 'myplugin/transform', $value ); // do_action returns void

// WRONG — filter that doesn't return the value
add_filter( 'myplugin/response_message', function ( $message ) {
    error_log( $message );        // side effect
    // missing: return $message;
} );
// Other listeners receive the previous value or null; chain breaks.

// WRONG — bare hook name, collides with the world
do_action( 'before_save', $data );

// WRONG — adding a parameter in the middle, breaking existing listeners
// v1.0
apply_filters( 'myplugin/response_message', $msg, $form_id );
// v1.1
apply_filters( 'myplugin/response_message', $msg, $context, $form_id ); // 💥

// RIGHT — append at the end, document with @since
apply_filters( 'myplugin/response_message', $msg, $form_id, $context );

// WRONG — silent removal
// (the hook just stops firing, listeners get no warning)

// RIGHT — deprecate first
$message = apply_filters_deprecated(
    'myplugin/old_response',
    array( $message, $form_id ),
    '1.5.0',
    'myplugin/response_message'
);

// WRONG — undocumented hook
do_action( 'myplugin/before_request', $payload );
// IDE / hooks search tools / AI assistants can't find or describe this hook.
```

## Cross-references

- Run **`wp-plugin-architecture`** — the hook-naming convention is part of broader plugin architecture. Schema/Constants centralization includes hook names for discoverability.
- Run **`wp-i18n-audit`** if any of your hooks pass translatable strings as args — translation timing rules apply to the values, not the hook names.
- Run **`wp-security-audit`** when your hook callback receives user input that downstream listeners will trust — document the sanitization expectation in the `@param` line.

## What this skill does NOT cover

- Using core WP hooks (`init`, `the_content`, `save_post`, etc.) — every WP plugin does this; not a custom-hook design topic.
- Hook priority gymnastics (`add_action( $hook, $cb, $priority )`) — basic WP, not a design topic for the plugin emitter.
- Removing core WP behavior via `remove_filter` / `remove_action` — adjacent topic, separate skill.
- Internal-only "hooks" used as a poor-man's event bus inside a single plugin (use proper service classes / observers instead — see `wp-plugin-architecture`).
- The `'all'` meta-hook (a debugging tool, not a design pattern).

## References

- Plugins Hooks Handbook: [developer.wordpress.org/plugins/hooks/](https://developer.wordpress.org/plugins/hooks/)
- `apply_filters` / `do_action`: `wp-includes/plugin.php`
- `apply_filters_deprecated` / `do_action_deprecated`: `wp-includes/plugin.php` (since WP 4.6)
- `_deprecated_hook` (the underlying notice trigger): `wp-includes/functions.php`
- `did_action` / `did_filter`: `wp-includes/plugin.php` — useful in tests / debugging to assert a hook fired.
