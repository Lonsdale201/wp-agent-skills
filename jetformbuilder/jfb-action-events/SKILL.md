---
name: jfb-action-events
description: Configures the JetFormBuilder action events system — the
  named events (DEFAULT.PROCESS, DEFAULT.REQUIRED, GATEWAY.SUCCESS,
  GATEWAY.FAILED, BAD.REQUEST, ON.DYNAMIC_STATE, never) that decide
  WHEN a Form Action runs. Covers declaring supported / unsupported /
  required events on a custom action, the validation precedence inside
  Base_Event::is_valid_action(), the multi-event subscription model
  the action editor exposes, and how to register a brand-new event
  type via the 'jet-form-builder/event-types' filter using Base_Event,
  Base_Action_Event, or Base_Gateway_Event. Use when an action needs
  to run only on payment callbacks, only on validation failure, only
  on a specific conditional state, after another action's hidden flow,
  or when the plugin needs to define its own event class (e.g. for
  inbound webhooks). Triggers on mentions of "JFB events", "action
  events", "GATEWAY.SUCCESS", "DEFAULT.PROCESS", "supported_events",
  "unsupported_events", "get_required_events", "Base_Event",
  "Base_Gateway_Event", "jet-form-builder/event-types",
  "before-trigger-event", "add_hidden".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: jetformbuilder
plugin-version-tested: "3.5.6"
api-stable-since: "3.0"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://jetformbuilder.com/documentation/
source-refs:
  - includes/actions/events/base-event.php
  - includes/actions/events/base-action-event.php
  - includes/actions/events/base-gateway-event.php
  - includes/actions/events-list.php
  - includes/actions/events-manager.php
  - includes/actions/types/base.php
---

# JetFormBuilder: action events — when does an action run?

A JFB Form Action doesn't just "run on submit" — it runs on a **named event**, and the form admin can pick (in the action editor) which event(s) trigger each action instance. Built-in events cover the common cases (form submitted, form validation failed, payment gateway success/failure, conditional state activated). Plugins can register their own events for specialized triggers (inbound webhooks, scheduled CRON, third-party callbacks).

This skill is the companion to **`jfb-form-action`**. That one covers the action class itself; this one is the *when* layer.

## API stability note

The `Base_Event` / `Base_Action_Event` / `Base_Gateway_Event` hierarchy, the `'jet-form-builder/event-types'` registration filter, the `'jet-form-builder/before-trigger-event'` / `'jet-form-builder/after-trigger-event'` hooks, and the action-side `supported_events()` / `unsupported_events()` / `get_required_events()` overrides have been stable across JFB 3.x in the source observed. The `plugin-version-tested` value records last end-to-end verification only.

## When to use this skill

- An action should run only on payment callbacks, not on plain submit.
- An action should run on validation failure (e.g. log invalid attempts).
- An action should run on conditional-block state changes.
- The plugin needs a brand-new event type (webhook receiver, scheduled task, custom integration callback).
- The diff/files contain `supported_events`, `unsupported_events`, `get_required_events`, `Base_Event`, `Base_Gateway_Event`, `'jet-form-builder/event-types'`, `add_hidden`, `'GATEWAY.SUCCESS'`, `'DEFAULT.REQUIRED'`.

## Architecture in one paragraph

JFB's `Events_Manager` holds a registry of event classes (each with a stable `get_id()` slug). When the form runs, the form handler calls `jet_fb_events()->execute( SomeEvent::class )` — this looks up the event, gets its executor, iterates the form's actions, and runs each action whose `is_valid_action()` returns true. The action's selected events are stored as part of the form's `_jf_actions` post meta (each action carries an `events` array). The validation logic in `Base_Event::is_valid_action()` checks three things in order: (1) is the action explicitly blacklisted from this event via `unsupported_events()`? (2) is the action explicitly whitelisted via `supported_events()`? (3) did the user pick this event for this action in the form editor? All three must pass. `get_required_events()` is the escape hatch that auto-injects events into the action's selection without the user touching anything (used for actions that MUST run on a particular event regardless).

**JS-side visibility is a separate layer.** The PHP-side event registry exposes ALL events to the JS (via `jetFormEvents.types`), but the per-action event picker only shows events that fall into one of four categories: marked `'always' => true`, matched as a gateway event, marked as dynamic, or advertised by another action on the same form via the `provideEvents` JS callback. Plugin-specific events almost always rely on category 4 — the dispatching action declares the events in its action registration config (via the `jfb-form-action` Step 4 wrapper that handles both modern `jfb.actions.registerAction` and legacy `JetFBActions.addAction`). This is documented in detail below; getting it wrong is the most common reason a freshly-registered event "doesn't appear" even though the PHP side is correct.

## The seven built-in events

| Event ID | Class | Fires when | Auto-fires? | Dispatcher | Notes |
|---|---|---|---|---|---|
| `DEFAULT.PROCESS` | `Default_Process_Event` | Form validates and submit succeeds | YES | `Form_Handler::send_form()` | The default event for actions. If you don't override `supported_events()`, your action defaults to running here. |
| `DEFAULT.REQUIRED` | `Default_Required_Event` | After form submit (always — like a `finally`) | YES | `Form_Handler::send_response()` | **Label is misleading** ("When validation of request is failed") — the event runs unconditionally at the end of every submit. The built-in `Save_Record` action is wired here. |
| `GATEWAY.SUCCESS` | `Gateway_Success_Event` | Payment gateway IPN confirms payment | NO | Gateway module callback handler | Only runs when the form has a payment gateway and the user completes payment. Your action must explicitly opt in via the editor. |
| `GATEWAY.FAILED` | `Gateway_Failed_Event` | Gateway returns failure / cancellation | NO | Gateway module return-URL handler | Same: only runs on actual gateway failure callbacks. |
| `BAD.REQUEST` | `Bad_Request_Event` | Form validation fails | NO | Within `DEFAULT.PROCESS` cycle | Useful for logging invalid attempts, alerting on captcha failures, etc. |
| `ON.{STATE}` | `On_Dynamic_State_Event` | A conditional block state activates | NO | Conditional block JS via AJAX | The event ID is dynamic — `ON.{state_name}`. Used for "run this when section X becomes visible". |
| `never` | `Never_Event` | Never automatically | NEVER | (no executor) | Pseudo-event for hidden actions added via `add_hidden()`. The action exists but only runs when another action invokes it programmatically. |

`DEFAULT.PROCESS` and `DEFAULT.REQUIRED` are marked `'always' => true` in their `to_array()` — they always appear in the event picker UI for every action. The others appear only if conditions are right (e.g. gateway events appear only on forms that have a gateway configured).

## Step 1 — Action declares which events it supports

The base class defaults are permissive — an action without overrides supports every event the user picks:

```php
// includes/actions/types/base.php (defaults)
public function unsupported_events(): array { return array(); }
public function supported_events(): array   { return array(); }
public function get_required_events(): array { return array(); }
```

Override on a per-action basis:

```php
use Jet_Form_Builder\Actions\Events\Default_Process\Default_Process_Event;
use Jet_Form_Builder\Actions\Events\Default_Required\Default_Required_Event;
use Jet_Form_Builder\Actions\Events\Gateway_Success\Gateway_Success_Event;
use Jet_Form_Builder\Actions\Events\Gateway_Failed\Gateway_Failed_Event;
use Jet_Form_Builder\Actions\Events\Bad_Request\Bad_Request_Event;

class CrmSubscribeAction extends Base {

    // Whitelist: action only makes sense on these events.
    public function supported_events(): array {
        return array(
            Default_Process_Event::class,
            Gateway_Success_Event::class,
        );
    }

    // Blacklist: never run on these.
    // IMPORTANT: include both class names AND event ID strings.
    // JFB's recursion guard checks both forms internally — class-name-only
    // is enough for the standard validation pass, but the dispatch-time
    // recursion guard (when an action's do_action() dispatches one of its
    // own events) compares against the event ID string. Include both to
    // cover both checks.
    public function unsupported_events(): array {
        return array(
            // Class names — for the standard event/action validation:
            Default_Required_Event::class,
            Bad_Request_Event::class,
            // ALSO include event ID strings — for runtime recursion guard
            // when this action dispatches its own custom events:
            'MYPLUGIN.SUCCESS',
            'MYPLUGIN.FAILURE',
        );
    }

    // Auto-required: always run on these regardless of UI selection.
    public function get_required_events(): array {
        return array(); // typical: empty — let the user choose
    }
}
```

**When to use which:**

- `supported_events()` — the action only makes sense on a closed list. CRM subscribe shouldn't run on `BAD.REQUEST`, payment-recipient action shouldn't run on `DEFAULT.PROCESS`. Listing the supported set rejects all others.
- `unsupported_events()` — the action *generally* runs, but should explicitly skip a few cases. More open-ended than `supported_events()`. **For recursion protection on actions that dispatch their own events, include both class names AND event ID strings** — the standard validation pass uses class names, but the runtime recursion guard compares against event IDs.
- `get_required_events()` — the action MUST run on event X even if the user didn't pick X. Used sparingly, mostly by actions whose presence implicitly requires a setup step (e.g. a "save submission" action that's pointless without `DEFAULT.REQUIRED`).

If you set both `supported_events` and `unsupported_events` non-empty, both filters apply: an event must be in `supported_events` AND not in `unsupported_events`.

## Step 2 — Validation precedence (what `is_valid_action()` actually checks)

Read this carefully — order matters:

```
1. Is this action's class in the event's $unsupported list (filterable via
   'jet-form-builder/events/base-unsupported-events')?
   → YES: skip.

2. Did the action override unsupported_events() to include this event class?
   → YES: skip.

3. Did the action override supported_events() with a non-empty list, and is
   this event NOT in it?
   → YES: skip.

4. Did the form admin select this event for this action instance in the editor
   (or did get_required_events() auto-add it)?
   → NO: skip.

→ All four pass: action runs.
```

The user-selection check is the last filter, not the first — this means `supported_events()` / `unsupported_events()` are guards that prevent the user from making invalid choices in the first place (and act as a safety net if a stale form config references an event the action no longer supports).

## Step 3 — JS-side: event picker shows only valid events

JFB localizes the action's `supported_events` and `unsupported_events` into JS. The action editor's "Events" multi-select renders only the events that pass these filters. The user can pick one or more — the action runs if **any** of the picked events fires.

You don't write JS for this — JFB's editor handles it from the PHP declarations. Verify in the editor that your action only offers the events you intended.

## Step 4 — Subscribing to gateway events

For a CRM action that should also create the contact when payment succeeds:

```php
public function supported_events(): array {
    return array(
        Default_Process_Event::class,    // create on plain submit (free forms)
        Gateway_Success_Event::class,    // create on paid submit (after payment)
    );
}

public function do_action( array $request, Action_Handler $handler ) {
    // Detect which event you're running under, if behavior differs.
    $current_event = jet_fb_events()->get_current_event();
    if ( $current_event && $current_event->get_id() === 'GATEWAY.SUCCESS' ) {
        // Gateway-specific data is now in jet_fb_gateway_current()
        $payment = jet_fb_gateway_current()->get_response();
        // ... attach payment metadata to the CRM record
    }

    // Common path:
    $this->push_to_crm( $request );
}
```

Gateway events fire from the gateway module's IPN/return-URL callback handler, **not** from the original form submit request. That means:
- Cookies, current user, headers from the form submit are gone.
- `jet_fb_context()->resolve_request()` returns the persisted form data, not live POST.
- The action runs in a separate HTTP request — execution time and memory limits reset.
- Errors thrown here don't show up in the form's submit response (the user has already seen "redirecting to PayPal..."); they go to logs and to the redirect page configured by the gateway.

## Step 5 — Subscribing to BAD.REQUEST

```php
public function supported_events(): array {
    return array(
        Default_Process_Event::class,
        Bad_Request_Event::class,
    );
}

public function do_action( array $request, Action_Handler $handler ) {
    $current_event = jet_fb_events()->get_current_event();

    if ( $current_event && $current_event->get_id() === 'BAD.REQUEST' ) {
        // Log invalid attempts, alert on captcha failure, etc.
        // Don't throw — BAD.REQUEST already means the user sees an error;
        // throwing here just complicates the flow.
        $this->log_invalid_attempt( $request );
        return;
    }

    // Normal happy path:
    $this->process( $request );
}
```

Common usage: rate-limit / fraud-detection actions, captcha-failure logging, security event emission.

## Step 6 — `add_hidden()` and the `never` event

When one action needs to programmatically invoke another (e.g. "if X happens, also fire Y"), the secondary action shouldn't appear in the user's UI. Use `add_hidden()`:

```php
// In bootstrap or another action's flow:
\MyPlugin\Actions\InternalCleanup::add_hidden(); // events default to ['never']
```

The action gets registered, gets a unique ID, but its event list is `['never']` — so no event ever validates against it. It runs only when explicitly invoked by another action's flow.

The built-in `Save_Record` is the canonical example — it's added hidden in the gateway flow so that submission records are saved after payment confirmation, without the user having to wire it up.

## Step 7 — Register a brand-new event

Two layers: subclass the right base, then register via the filter.

### Subclass the right base

| Base class | When to use |
|---|---|
| `Base_Event` | Generic event with no payment / gateway context. The "default" choice for plugin-defined events (webhook received, scheduled tick, third-party callback). |
| `Base_Action_Event` | Empty marker subclass — semantic only. Use it (in place of `Base_Event`) when your event represents "user-triggered or workflow" rather than infrastructure. JFB itself uses this distinction in some UI grouping; it's optional but considered good form. |
| `Base_Gateway_Event` | Required if the event represents a payment gateway callback (success / failure / refund / chargeback). Must implement `get_gateway()` and `get_scenario()`. |

### Minimal custom event

```php
<?php
namespace MyPlugin\Events;

use Jet_Form_Builder\Actions\Events\Base_Event;
use MyPlugin\Executors\Webhook_Received_Executor;

class Webhook_Received_Event extends Base_Event {

    public function get_id(): string {
        return 'WEBHOOK.RECEIVED';
    }

    public function get_label(): string {
        return __( 'When an inbound webhook arrives', 'myplugin' );
    }

    public function get_help(): string {
        return __( 'Runs when MyPlugin receives a verified webhook for this form.', 'myplugin' );
    }

    public function executors(): array {
        return array( new Webhook_Received_Executor() );
    }
}
```

The executor is what actually iterates and runs matched actions. The simplest possible executor:

```php
<?php
namespace MyPlugin\Events;

use Jet_Form_Builder\Actions\Events\Base_Executor;

final class MyMinimalExecutor extends Base_Executor {
    public function is_supported(): bool {
        return true;
    }
}
```

That's it — `Base_Executor` provides the iteration loop; you only need `is_supported()`.

**Don't reuse `Default_Process_Executor` for custom events.** It fires the `'jet-form-builder/actions/before-send'` and `'jet-form-builder/actions/after-send'` hooks. If your plugin already listens to `'after-send'` (e.g. for response-message overrides as documented in `jfb-action-messages`), reusing that executor will fire your handler a second time and your custom-message logic will run twice. Always write a minimal own executor for custom events that fire from inside another action's flow.

### Register the event

```php
add_filter(
    'jet-form-builder/event-types',
    function ( array $events ): array {
        $events[] = new \MyPlugin\Events\Webhook_Received_Event();
        return $events;
    }
);
```

### Dispatch it from your code

```php
// Wherever your verified webhook lands:
jet_fb_events()->execute( \MyPlugin\Events\Webhook_Received_Event::class );
```

The executor pulls the form's actions, filters by `is_valid_action`, and runs each that matches.

### Critical: advertise the event from the JS side via `provideEvents`

PHP registration via `'jet-form-builder/event-types'` is **necessary but not sufficient**. The JFB action editor's event picker (the multi-select where the form admin chooses which events trigger an action) does NOT show your event by default. It only shows events that are:

1. Marked `'always' => true` in the event's `to_array()` (built-in core events).
2. Gateway events when a payment gateway is configured matching the scenario.
3. Dynamic events (`On_Dynamic_State_Event` style).
4. **Events advertised by an action on the form via the `provideEvents` JS callback**.

Custom plugin events almost always fall into category 4. The action that DISPATCHES the event (in our example, the action that receives the webhook and calls `jet_fb_events()->execute(...)`) must declare it in its JS editor registration. Use the **single-call wrapper from `jfb-form-action` Step 4** — it routes to `jfb.actions.registerAction` (modern) or `JetFBActions.addAction` (legacy) without dual-registering:

```js
// 'registerAction' here is the wrapper from jfb-form-action Step 4 —
// NOT the raw window.jfb.actions.registerAction.
registerAction(
    'myplugin_webhook_handler',
    WebhookActionEditor,
    {
        category: 'integration',
        docHref:  'https://example.com/docs/webhook',
        // Advertise events this action dispatches so OTHER actions on
        // the same form can pick them up in the Events match selector.
        provideEvents: ( settings ) => [
            'WEBHOOK.RECEIVED',
            'WEBHOOK.FAILED',
        ],
    }
);
```

`provideEvents` receives the action's current settings — you can return a *different* list based on configuration (e.g. only advertise `WEBHOOK.FAILED` if the user enabled error reporting). Return an array of event ID strings (the `get_id()` value of each event class). The wrapper passes `provideEvents` through to whichever underlying API is active; both honour it.

**Do NOT add a separate `wp.data.dispatch('jet-forms/actions').registerAction(...)` mirror call.** Older versions of this skill recommended that pattern; on JFB versions that ship the modern action editor, the dual call corrupts the editor data store and triggers `JSON.parse "[object Object]"` failures in `form.builder.js` when the form admin opens an action's Conditions tab. One registration through the wrapper is enough.

Without `provideEvents`, the events exist in the global registry, the PHP-side dispatch works, the executor runs, but the form admin **cannot select them** in the editor — so no action ever gets `events: [...]` set against them, and `Base_Event::is_valid_action()` rejects every action because the user-selection check fails.

If your action's `provideEvents` shouldn't depend on settings, ignore the argument and return a constant array. If your event should appear universally (every form, even without your action present), use `'always' => true` in the event's `to_array()` instead — but that's rarely what you want for plugin-specific events.

## Available extension hooks

| Hook | Type | When | Use case |
|---|---|---|---|
| `jet-form-builder/event-types` | filter | At event registry build | Add custom event classes. |
| `jet-form-builder/events/base-unsupported-events` | filter | Inside `Base_Event::is_valid_action()` | Programmatically blacklist actions from events at runtime (e.g. license-gated). |
| `jet-form-builder/before-trigger-event` | action | Before any event executes | Logging, telemetry, conditional bypass. |
| `jet-form-builder/after-trigger-event` | action | After any event completes | Cleanup, post-execution analytics. |
| `jet-form-builder/before-do-action/{action_id}` | action | Before a specific action runs | Per-action interception; replace input, mutate context. |
| `jet-form-builder/gateways/on-payment-success` | action | Before `GATEWAY.SUCCESS` actions run | Gateway-level setup (load tx data into context). |
| `jet-form-builder/gateways/on-payment-failed` | action | Before `GATEWAY.FAILED` actions run | Same for failure path. |
| `jet-form-builder/default-process-event/executors` | filter | When `DEFAULT.PROCESS` collects executors | Replace the default submit handler (advanced). |

## Critical rules

- **The `DEFAULT.REQUIRED` label lies** — it says "When validation of request is failed" but actually runs as a `finally` block. Document this in your help text if you expose the choice to users; otherwise admins assume it only runs on errors.
- **`get_required_events()` is the only way** to force an event onto an action without UI selection — be sparing. If you find yourself returning multiple required events, the action probably has too much responsibility; split it.
- **Gateway events run in a separate request** — don't assume cookies, current user, or live POST. Use `jet_fb_context()` and `jet_fb_gateway_current()`.
- **Never throw `Action_Exception` from a `BAD.REQUEST` handler** — the user already sees an error response from the validation failure. Throwing piles a second error on top and the message that wins is implementation-dependent.
- **Use `Base_Gateway_Event` only for actual gateway callbacks** — using it for non-payment events misleads the UI grouping and the gateway hooks (`on-payment-*`) won't fire correctly.
- **Custom event IDs SHOULD use the `DOMAIN.EVENT` uppercase pattern** for built-in-style events (`WEBHOOK.RECEIVED`, `CRON.TICK`) and lowercase for special pseudo-events like `never`. This is convention only, but matches JFB's own style.
- **`add_hidden()` actions don't appear in the editor** — debugging "why doesn't this action run?" is harder; document any hidden actions your plugin adds.
- **Don't dispatch built-in events from your own code** — calling `jet_fb_events()->execute( Default_Process_Event::class )` from a webhook handler will run all the form's actions on a request the form handler didn't validate. Define your own event and dispatch that.
- **Custom events MUST be advertised via `provideEvents` on the JS side**, otherwise they never appear in the action editor's event picker even though they're registered in PHP. The dispatching action declares them via the registration config (single call through the modern `jfb.actions.registerAction` or legacy `JetFBActions.addAction` — see `jfb-form-action` for the wrapper pattern). Without this step, you can register the event server-side cleanly, dispatch it cleanly, but no admin can ever wire a form to it because the selection UI won't list it. **Do NOT mirror the registration via `wp.data.dispatch('jet-forms/actions').registerAction(...)` as a backup** — older skill versions advised this; on JFB versions that ship the modern action editor, the dual call corrupts the editor data store.
- **`unsupported_events()` for self-dispatched events should include both class names AND event ID strings** — JFB's recursion guard checks both forms in different code paths. Returning only class names lets the recursion guard fail open at runtime, allowing the action to wire to its own dispatched event and recurse infinitely.

## Common pitfalls (failure modes inferred from the API contract)

- **Action set up correctly but never runs**: in form editor, the user didn't pick any event for the action — the events multi-select was left empty. Check the form's `_jf_actions` post meta to verify the action's `events` array is non-empty.
- **Custom event registered in PHP but not visible in the action editor's multi-select**: the dispatching action's JS registration is missing `provideEvents`. The PHP-side filter (`'jet-form-builder/event-types'`) puts the event in the global store, but the per-action picker only lists events that are `always: true`, gateway-matched, dynamic, or advertised via `provideEvents` from another action on the form. Add `provideEvents: () => ['MY.EVENT_ID']` to the dispatching action's registration config (in the wrapper from `jfb-form-action` Step 4).
- **Event you registered doesn't show in the editor's multi-select**: the registration filter isn't running (registered too late / outside the right hook), OR `to_array()` throws (like `Never_Event` does intentionally), OR you're missing `provideEvents` (see above).
- **`supported_events()` whitelist of 1 event but UI shows 3 options**: a stale form-meta has events the action no longer supports. The validation pass still rejects them at runtime, but the editor shows them until the form is re-saved.
- **`get_required_events()` not auto-adding**: `Events_List::create()` merges them at action save time, not at execution time — re-saving the form is required after changing the required-events list, OR you need to programmatically migrate existing forms.
- **Custom event runs but action doesn't**: action's `supported_events()` doesn't include your custom event class. Either omit `supported_events()` (default permissive) or add it explicitly.
- **Gateway event fires twice**: the gateway module's IPN handler ran twice (e.g. PayPal sandbox retry behavior, or an out-of-order success+IPN combo). Make `do_action()` idempotent — check by transaction ID before processing.
- **Hidden action runs from the wrong context**: another action invoked it but didn't set up the expected request data. `add_hidden()` actions should validate their inputs explicitly, not assume the caller did.
- **Action recurses or runs twice on its own dispatched event**: `unsupported_events()` returns only the event class name(s), missing the event ID string(s). The validation pass succeeds with the class check, but the dispatch-time recursion guard expects ID strings. Add both forms — see Step 1 example.
- **Editor shows JSON.parse "[object Object]" crash on form.builder.js when configuring conditions on actions**: dual action registration (modern + legacy at the same time) — see `jfb-form-action` skill for the single-call wrapper. This is not strictly an events issue but commonly surfaces when wiring up custom events to actions.

## Cross-references

- Run **`jfb-form-action`** first — this skill assumes a working action class. Events configure WHEN an existing action runs, not what it does.
- Run **`jfb-action-messages`** alongside — gateway events often need their own success/failure copy ("Subscription started after payment", "Payment cancelled, you weren't charged").
- Run **`wp-security-audit`** on any handler that dispatches events from external sources (webhook receivers, callbacks) — verify signatures before calling `jet_fb_events()->execute()`. Otherwise you've built an unauthenticated trigger for every form action on the site.

## What this skill does NOT cover

- Writing payment gateway integrations (a separate JFB subsystem with its own base classes, REST endpoints, and IPN verification — out of scope here).
- The conditional-block UI that drives `ON.DYNAMIC_STATE` (a JFB-specific frontend concept; this skill only covers consuming the event server-side).
- Cron / scheduled action dispatch — JFB doesn't ship this; if you want time-based events, you write the dispatcher (e.g. `wp_schedule_event` calls `jet_fb_events()->execute()` against your custom event).
- Multi-form / cross-form event propagation — events are scoped to the form being processed.
- Replacing the action chain's executor wholesale — possible via `'jet-form-builder/default-process-event/executors'` but that's framework-modification territory.

## References

- Base event class: `wp-content/plugins/jetformbuilder/includes/actions/events/base-event.php`
- Action-event marker: `wp-content/plugins/jetformbuilder/includes/actions/events/base-action-event.php`
- Gateway event base: `wp-content/plugins/jetformbuilder/includes/actions/events/base-gateway-event.php`
- Events list / collection: `wp-content/plugins/jetformbuilder/includes/actions/events-list.php`
- Events manager / registration: `wp-content/plugins/jetformbuilder/includes/actions/events-manager.php`
- Action-side support methods: `wp-content/plugins/jetformbuilder/includes/actions/types/base.php`
- Default process event: `wp-content/plugins/jetformbuilder/includes/actions/events/default-process/default-process-event.php`
- Default required event: `wp-content/plugins/jetformbuilder/includes/actions/events/default-required/default-required-event.php`
- Gateway success event: `wp-content/plugins/jetformbuilder/includes/actions/events/gateway-success/gateway-success-event.php`
- Gateway failed event: `wp-content/plugins/jetformbuilder/includes/actions/events/gateway-failed/gateway-failed-event.php`
- Bad request event: `wp-content/plugins/jetformbuilder/includes/actions/events/bad-request/bad-request-event.php`
- Never event (hidden actions): `wp-content/plugins/jetformbuilder/includes/actions/events/never/never-event.php`
- Dynamic state event: `wp-content/plugins/jetformbuilder/includes/actions/events/on-dynamic-state/on-dynamic-state-event.php`
