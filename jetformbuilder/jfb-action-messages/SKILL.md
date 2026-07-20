---
name: jfb-action-messages
description: Surfaces user-facing custom messages from a JetFormBuilder
  custom Form Action — both the idiomatic path (register message types
  via 'jet-form-builder/form-messages/register' so they appear in the
  form's Messages panel and can be overridden globally per form) and
  the action-local path (custom message fields inside the action
  editor, dispatched via Action_Exception for errors or via context +
  'jet-form-builder/form-handler/after-send' + Messages_Manager::dynamic_success()
  for success messages). Use when a custom JFB action needs
  configurable messages for cases like "already subscribed",
  "duplicate row skipped", "API rate limited", or per-action
  success copy. Triggers on mentions of "JFB messages",
  "Action_Exception", "Base_Action_Messages",
  "jet-form-builder/form-messages/register", "_jf_messages",
  "dynamic_success", "add_context_once" with a message,
  "after-send" hook, or "custom action message".
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jetformbuilder"
  wp-skills-plugin-version-tested: "3.5.6"
  wp-skills-php-min: "7.4"
  wp-skills-api-stable-since: "3.0"
  wp-skills-last-updated: "2026-04-28"
---

# JetFormBuilder: custom messages from a Form Action

JFB has a centralized form-message system (the `_jf_messages` post meta + `Manager` class). Every form ships with a Messages panel where the admin can override the canonical message keys (`success`, `failed`, `validation_failed`, `invalid_email`, `empty_field`, `internal_error`, etc.). A custom action can hook into this system in two distinct ways, and the right choice depends on **where the admin should configure the text**.

This skill documents both mechanisms, explains when to use which, and shows the exact PHP+JS plumbing for each. Read it together with the **`jfb-form-action`** skill — that one covers the action class itself; this one is the message layer on top.

## API stability note

The form-messages `Manager`, the `'jet-form-builder/form-messages/register'` filter, the `Base_Action_Messages` abstract class, the `Action_Exception` lookup behavior, the `Messages_Manager::dynamic_success()` prefix convention, and the `'jet-form-builder/form-handler/after-send'` hook were all observed in JFB 3.5.x and are stable across the 3.x line. The `plugin-version-tested` value records last end-to-end verification only.

## When to use this skill

- A custom action needs to surface a user-facing message that the admin can configure (success, "already exists", "duplicate skipped", API-error fallback, etc.).
- The diff/files contain `Action_Exception`, `Base_Action_Messages`, `'jet-form-builder/form-messages/register'`, `add_context_once` with a message-like value, or `Messages_Manager::dynamic_success`.
- The user mentions "custom message" together with a JFB action.

## Two mechanisms — pick one per message

| | A. Form-level (registered) | B. Action-local |
|---|---|---|
| **Where the admin configures the text** | Form's "Messages" panel (one place, all forms see the same keys via JFB Messages UI) | The action's own settings inside the action editor |
| **Per-form override** | Yes (built-in via `_jf_messages`) | Yes (each action instance has its own setting) |
| **Per-action-instance override** | No (one form = one set of keys) | Yes |
| **Globalizable across plugins** | Yes (a translation plugin / migration tool can target a known key) | No (text is opaque to outsiders) |
| **Best for** | Errors that match a stable taxonomy (`email_exists`, `username_exists`, `not_authorized`) | Success copy, "duplicate skipped" copy, anything where each instance of the action wants its own wording |
| **Used by** | JFB core `Register_User_Action` (`email_exists`, `username_exists`) | `google-sheet-for-jetformbuilder`, `fluent-subscriptions-for-jetformbuilder` |

You can mix both in one action — register stable error keys via Mechanism A, expose freeform success copy via Mechanism B.

## Architecture in one paragraph

The JFB `Manager` (in `includes/form-messages/manager.php`) holds an associative array of message keys → resolved text, built from two sources at request time: the form's `_jf_messages` post meta (admin-configured per form) and the registered action message types (via the `'jet-form-builder/form-messages/register'` filter). When an action throws `Action_Exception( $code, $message )`, the form handler catches it and asks the `Manager` to resolve the user-visible text. If `$code` is a key the manager knows, the resolved text wins; if `$message` was passed, that string is used as-is (or as a fallback when the key isn't registered). For success cases, an action stores text via `$handler->add_context_once()` and a separate plugin-level handler hooks `'jet-form-builder/form-handler/after-send'` to overwrite the response with `Messages_Manager::dynamic_success( $message )`, which prefixes with `dsuccess|` so the rendering pipeline treats it as inline-supplied content and runs macro / placeholder expansion on it.

## Mechanism A — Register message types (idiomatic)

Use this when your action has a stable, named set of failure modes that admins should be able to translate or rephrase per form.

### Step A.1 — PHP: define a Base_Action_Messages subclass

```php
<?php
namespace MyPlugin\Actions\Messages;

use Jet_Form_Builder\Form_Messages\Actions\Base_Action_Messages;
use Jet_Form_Builder\Actions\Types\Base;

class SubscribeMessages extends Base_Action_Messages {

    public function is_supported( Base $action ): bool {
        return 'myplugin_subscribe' === $action->get_id();
    }

    protected function messages(): array {
        return array(
            'already_subscribed' => array(
                'label' => __( 'Already subscribed', 'myplugin' ),
                'value' => __( 'This email address is already subscribed.', 'myplugin' ),
            ),
            'crm_unreachable' => array(
                'label' => __( 'CRM unreachable', 'myplugin' ),
                'value' => __( 'CRM is temporarily unreachable. Please try again later.', 'myplugin' ),
            ),
            'rate_limited' => array(
                'label' => __( 'Rate limited', 'myplugin' ),
                'value' => __( 'Too many submissions. Please wait a minute.', 'myplugin' ),
            ),
        );
    }
}
```

The `label` is what the admin sees in the form's Messages panel. The `value` is the default text. Each key registered here becomes overridable per form in the JFB UI without any extra work.

### Step A.2 — PHP: register on the filter

```php
add_filter(
    'jet-form-builder/form-messages/register',
    function ( array $registered ): array {
        $registered[] = new \MyPlugin\Actions\Messages\SubscribeMessages();
        return $registered;
    }
);
```

### Step A.3 — PHP: throw `Action_Exception` with the key

```php
public function do_action( array $request, Action_Handler $handler ) {
    $email = $this->get_mapped_value( 'email', $request );

    if ( $this->already_subscribed( $email ) ) {
        // First arg is the registered key; second arg is optional fallback.
        throw new Action_Exception( 'already_subscribed' );
    }

    if ( $this->is_rate_limited() ) {
        throw new Action_Exception( 'rate_limited' );
    }

    try {
        $this->call_remote_api( $email );
    } catch ( \Throwable $e ) {
        // For unknown API errors, register a key OR fall back to a free-form
        // message string. The string path is fine for genuinely opaque cases.
        throw new Action_Exception(
            'crm_unreachable',
            sprintf( __( 'CRM error: %s', 'myplugin' ), wp_strip_all_tags( $e->getMessage() ) )
        );
    }
}
```

When the manager resolves the message, it looks up the first argument. If the admin overrode it in the form's Messages panel, the override wins. If not, your registered default wins. The second argument is the fallback text used only when neither resolution path yields anything.

### Step A.4 — UI behavior

Nothing to do on the JS side. The form editor's Messages panel reads from `_jf_messages` and from the registered action message types — your keys appear automatically in the panel under the action's section.

## Mechanism B — Action-local custom messages

Use this when the message text is genuinely per-instance (each action on the form gets its own copy), and especially when the admin wants the message UI **right next to the rest of the action's settings** rather than in a separate Messages panel.

This is the pattern used by `google-sheet-for-jetformbuilder` (success / duplicate-skip) and `fluent-subscriptions-for-jetformbuilder` (already-subscribed / existing-contact).

### Step B.1 — PHP: declare the message setting in `action_attributes()`

```php
public function action_attributes() {
    return array(
        // ... other settings ...
        'success_message'           => array( 'default' => '' ),
        'already_subscribed_message' => array( 'default' => '' ),
    );
}
```

### Step B.2 — JS: render plain text controls in the action editor

```js
// Inside your action editor component
el( TextareaControl, {
    label:    __( 'Success message (optional)', 'myplugin' ),
    help:     __( 'Leave empty to use the form default. Supports JFB macros.', 'myplugin' ),
    value:    settings.success_message || '',
    onChange: ( v ) => onChangeSetting( v, 'success_message' ),
} );

el( TextControl, {
    label:    __( 'Already-subscribed message (optional)', 'myplugin' ),
    value:    settings.already_subscribed_message || '',
    onChange: ( v ) => onChangeSetting( v, 'already_subscribed_message' ),
} );
```

Plain `TextControl` / `TextareaControl` is the convention — no JFB-shipped "message picker" component is required.

### Step B.3 — PHP: dispatch the message

**For error cases**, throw `Action_Exception` with the user's text directly:

```php
$message = trim( (string) ( $this->settings['already_subscribed_message'] ?? '' ) );
if ( '' === $message ) {
    $message = __( 'This email address is already subscribed.', 'myplugin' );
}
throw new Action_Exception( $message );
```

The user-typed text becomes the response message verbatim (no manager lookup — there's no key).

**For success cases**, use the context + after-send hook pattern:

```php
// In do_action() — store the message in the action context.
$message = trim( (string) ( $this->settings['success_message'] ?? '' ) );
if ( '' !== $message ) {
    $handler->add_context_once(
        $this->get_id(),
        array( 'myplugin_success_message' => $message )
    );
}
// ... action's actual work ...
```

Then, in your plugin's bootstrap (NOT inside the action class — this fires once globally), hook the after-send action:

```php
use Jet_Form_Builder\Form_Messages\Manager as Messages_Manager;

add_action(
    'jet-form-builder/form-handler/after-send',
    function ( $form_handler, bool $is_success ) {
        if ( ! $is_success || empty( $form_handler->action_handler ) ) {
            return;
        }

        $message = $form_handler->action_handler->get_context(
            'myplugin_subscribe',
            'myplugin_success_message'
        );
        if ( ! $message ) {
            return;
        }

        $form_handler->set_response_args(
            array(
                'status'  => Messages_Manager::dynamic_success( $message ),
                'message' => $message,
            )
        );
    },
    10,
    2
);
```

`Messages_Manager::dynamic_success( $msg )` returns the string `'dsuccess|' . $msg`. The form rendering pipeline recognizes this prefix, strips it, and uses the rest as the resolved message — bypassing the lookup that normal `success` would go through. This is how the action wins over the form's default success copy without permanently mutating the form-level configuration.

If your action needs to set a **failure** message via context (rare — usually you'd just throw), there's a parallel `Messages_Manager::dynamic_failed()` helper.

## The `dsuccess|` prefix — what it means

JFB's message resolution distinguishes three forms in `Manager::get_message_by_info()`:

1. **Plain key** (`'success'`, `'failed'`, custom registered keys) → look up in `_types`, return resolved text.
2. **Dynamic prefix** (`'dsuccess|...'`, `'dfailed|...'`) → strip prefix, treat the rest as the message verbatim.
3. **Anything else** → use as-is.

You don't need to construct the prefix manually; use the helper functions. But know it's there because:
- It's what your action's success message looks like in the response payload.
- If you log responses or write tests, you'll see the prefix in the wire data.

## Macros / placeholders inside messages

JFB's macros parser runs at render time on whatever message text the manager returns — both for registered messages and for dynamically-supplied ones. Common macros: `%form_id%`, `%user_id%`, `%post_id%`, `%field_id%` (any form field's submitted value), and many others depending on installed modules.

This means **admin-typed text in a custom message setting CAN include macros**, and they'll be expanded. Document this in the help text of your message field so admins know:

```js
el( TextareaControl, {
    label: __( 'Success message', 'myplugin' ),
    help:  __( 'Supports JFB macros, e.g. %email% or %form_id%.', 'myplugin' ),
    // ...
} );
```

Default text from your code (the `__()` fallback) typically doesn't include macros — keep them admin-driven.

## i18n — what's translatable

| Source | Translatable | Notes |
|---|---|---|
| `Base_Action_Messages` defaults (Mechanism A `value`) | Yes — wrap with `__()` | Standard gettext flow. |
| `Base_Action_Messages` labels (Mechanism A `label`) | Yes — wrap with `__()` | Shown in the form editor. |
| Admin-typed override in form Messages panel | No — stored as user content | If multilingual, use a translation plugin that targets `_jf_messages`. |
| Admin-typed text in action setting (Mechanism B) | No — stored as user content | Same caveat. |
| `__()`-wrapped fallbacks in `do_action()` | Yes | Standard gettext flow. |
| Third-party API error strings | No (typically English) | Wrap with `__()` for the prefix only: `sprintf( __( 'API error: %s' ), $api_msg )`. |

## Critical rules

- **Mechanism A keys are public identifiers** — once admins start overriding `'already_subscribed'` in production forms, renaming it strands their text. Treat keys like API contracts.
- **`is_supported()` MUST be tight** — return true only for your own action's `get_id()`. A loose check (e.g. matching a substring) registers your messages on every action and pollutes the Messages panel.
- **Don't register the same key twice** across multiple `Base_Action_Messages` classes. The last one wins, but the order is implementation-defined and brittle.
- **`Action_Exception` second argument is a fallback, not an override** — if you pass both a known key AND a message, the form-level configured text still wins for that key. Don't rely on the second arg to "force" a specific text.
- **For Mechanism B success messages, hook `after-send` ONCE at plugin bootstrap**, not inside `do_action()`. Hooking inside the action class accumulates duplicate listeners across requests.
- **Don't mutate `_jf_messages` directly from PHP at runtime** to "set a message" — that writes to post meta and persists. Use the dynamic prefix or registered keys.
- **Always trim and length-check user-typed message text** before storing in context — a 50KB message via copy-paste should not blow up the response payload.
- **Both mechanisms support macros**; if the admin has access to fill in PII via macros (e.g. `%email%`), make sure the message context is HTML-escaped at render. JFB's pipeline does this; don't disable it.

## Common pitfalls (failure modes inferred from the API contract)

- **Registered key works in dev, ignored in prod**: the `is_supported()` returns false because `get_id()` was changed. Cross-check the action ID exactly.
- **Custom success message never appears**: `$is_success` is false (the action threw), OR `add_context_once` was called with the wrong action ID, OR the after-send hook isn't registered (registered inside the action class instead of plugin bootstrap).
- **Message panel shows the action's keys but admin's overrides don't take effect**: form is saved against a stale meta cache; check `_jf_messages` post meta directly to verify storage.
- **Macros not expanded**: admin used `{email}` syntax instead of `%email%`. Document the correct delimiters in the help text.
- **`Action_Exception( $message )` (only one arg) treated as a key**: it is — JFB doesn't know which arg is which. If the string isn't a registered key, it's used as the fallback text and rendered verbatim. This is fine, but cluttering: prefer `Action_Exception( 'failed', $message )` for clarity when the text is meant to be the final copy.
- **Two plugins both register `'rate_limited'`**: the second registration wins. Namespace your keys (`'myplugin_rate_limited'`) when there's any risk of overlap.

## Cross-references

- Run **`jfb-form-action`** first — this skill assumes you already have a working action class with `do_action`, `Action_Handler`, and `action_attributes`.
- Run **`wp-i18n-audit`** on the action's PHP + JS message strings — message defaults are the most common spot for translation mistakes (text-domain mismatches, missing `__()`, ambiguous strings used in two contexts).

## What this skill does NOT cover

- The form-level Messages panel UI (built into JFB; not configurable from a plugin).
- Custom message rendering templates (`common/messages.php`) — touching that is theme-territory, out of scope.
- Inline field validation messages (those flow through a different subsystem driven by field block validation rules).
- Multilingual / WPML / Polylang integration of `_jf_messages` content — a translation plugin handles that against the storage; this skill is about producing the keys/text in the first place.
- Browser-side toast / banner styling — entirely controlled by the form's frontend renderer / theme.

## References

- Manager (resolution): `wp-content/plugins/jetformbuilder/includes/form-messages/manager.php`
- Action message manager (registration): `wp-content/plugins/jetformbuilder/includes/form-messages/action-messages-manager.php`
- Base action-messages class: `wp-content/plugins/jetformbuilder/includes/form-messages/actions/base-action-messages.php`
- `_jf_messages` post meta + canonical keys: `wp-content/plugins/jetformbuilder/modules/post-type/meta/messages-meta.php`
- Mechanism A reference (built-in): `wp-content/plugins/jetformbuilder/modules/actions-v2/register-user/messages/register-user-messages.php`
- Mechanism B reference (success path): `wp-content/plugins/google-sheet-for-jetformbuilder/includes/Plugin.php` (`maybe_adjust_response_message`)
- Mechanism B reference (error + success mix): `wp-content/plugins/fluent-subscriptions-for-jetformbuilder-main/src/Actions/FluentCrmSubscribeAction.php`
- Official documentation: <https://github.com/Crocoblock/developer-documentation/tree/main/03-jet-form-builder>
