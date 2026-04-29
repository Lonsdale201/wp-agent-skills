---
name: jfb-action-external-api
description: How to read submitted JetFormBuilder form data from a custom
  action, transform it (including %macro% replacement of admin-typed
  templates), call an external HTTP API, write the response back into
  the form context for downstream actions to use, and dispatch JFB
  events based on the API outcome. Use when building a custom action
  that integrates with a third-party service (LLM call, webhook, CRM,
  payment processor, geolocation lookup) and needs the action to
  behave as a node in a data-flow graph rather than a one-shot leaf.
  Triggers on mentions of "jet_fb_context", "update_request", "has_field",
  "get_value", "wp_remote_post" with form data, "macro replacement", or
  "API call from action".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: jetformbuilder
plugin-version-tested: "3.5.6"
api-stable-since: "3.0"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://jetformbuilder.com/documentation/
  - https://developer.wordpress.org/reference/functions/wp_remote_post/
source-refs:
  - includes/context/context.php
---

# JetFormBuilder: action — read form data, call external API, write result back

Most custom JFB actions follow the same data-flow shape: pull values out of the submitted form, optionally interpolate admin-typed templates with `%field%` macros, hit an external HTTP API, transform the response, write it back into the form context so downstream actions can read it, and (optionally) dispatch a custom JFB event based on the outcome to fan out to conditional follow-up actions.

This skill covers that full lifecycle inside `do_action()`. It complements **`jfb-form-action`** (which covers the action class structure) and **`jfb-action-events`** (which covers event dispatch). This one is specifically about the **PHP-side data flow** — the API surface JFB exposes for read/write/macro/dispatch from inside an action.

## API stability note

The `jet_fb_context()` global (with `get_value`, `update_request`, `has_field`, `resolve_request`), `Tools::sanitize_text_field()`, and the `Tab_Handler_Manager::instance()->options( $tab_id )` accessor have been stable across JFB 3.x in source observed. The WordPress HTTP API (`wp_remote_post`, `wp_remote_retrieve_body`, `WP_Error` handling) is WP core. The `plugin-version-tested` value records last end-to-end verification.

## When to use this skill

- A custom action calls a third-party HTTP API as part of its work.
- An action needs to read multiple form fields and interpolate them into a request body or instructions string.
- The admin should be able to write templates like `"Verify %email% for order %order_id%"` and have JFB substitute the field values.
- The API response should be written back into the form context so other actions can use it (for example, a "ChatGPT Decision" action writing the answer into a hidden form field that a "Send Email" action then includes).
- The action should branch the action chain based on the API response (success/failure/decision).
- The diff/files contain `jet_fb_context()`, `update_request`, `wp_remote_post`, `wp_remote_retrieve_body`, `WP_Error`, or macro substitution patterns like `%[a-z_]+%`.

## Architecture in one paragraph

JFB exposes the live form submission as a singleton via `jet_fb_context()`. From inside `do_action( array $request, Action_Handler $handler )`, the `$request` parameter is an associative array of field IDs to current values, but the **same data is also available** through `jet_fb_context()->get_value( $field_id )` — and the context is the source of truth: subsequent actions read from it. To **write** a value back (so downstream actions see it), call `jet_fb_context()->update_request( $value, $field_id )`. Admin-typed templates with `%field%` placeholders are interpolated by a small replacer that calls `jet_fb_context()->has_field()` and `get_value()`. External API calls go through WordPress's HTTP API (`wp_remote_post` etc.) with proper timeout, header, and error handling — never `file_get_contents` or `curl_*` directly. API credentials come from the plugin's settings tab via `Tab_Handler_Manager::instance()->options( $tab_id )`. Outcome branching is done by dispatching a custom event through `jet_fb_events()->execute( EventClass::class, $form_id )` — this fans out the chain without the action knowing which followups exist.

## Step 1 — read the form data

There are two correct ways to read a field's submitted value, with different semantics:

```php
public function do_action( array $request, Action_Handler $handler ) {
    $email = $request['email_field_id'] ?? '';                 // direct from request
    $email = jet_fb_context()->get_value( 'email_field_id' );  // through context
}
```

**Use `$request[...]`** when reading values that won't be changed by previous actions in the chain (most common case — submitted-as-is data).

**Use `jet_fb_context()->get_value( $field_id )`** when:
- A previous action might have called `update_request()` to mutate a value (e.g. a translation action overwriting a field with a translated copy).
- You want to write back later — for symmetry, read through the same API.
- You want to fall through `has_field()` cleanly when the field doesn't exist on the form.

`get_value()` returns the current context value (post any updates). `$request` is the snapshot passed to your `do_action`. They diverge only when intermediate actions mutate; if you control the chain, both work. If in doubt, **prefer the context API** — it's the source of truth.

## Step 2 — sanitize and validate

Form data has been validated by JFB's field rules but **NOT sanitized for your specific output target**. Your action is responsible for sanitization that fits how the data leaves your code.

```php
$email = sanitize_email( (string) $email );
if ( ! is_email( $email ) ) {
    throw new Action_Exception(
        __( 'Provided email is not valid.', 'myplugin' )
    );
}

// For text passed to an external API (no HTML expected):
$instructions = sanitize_textarea_field( $this->settings['instructions'] ?? '' );

// For values that act as identifiers (no whitespace, no special chars):
$external_id = Tools::sanitize_text_field( $request['external_id'] ?? '' );

// For numeric IDs:
$user_id = absint( $request['user_id'] ?? 0 );
```

`Tools::sanitize_text_field()` is JFB's wrapper that trims plus does the standard `sanitize_text_field` work. Use it for action settings that the user typed in the editor.

## Step 3 — macro replacement (`%field_id%` in admin templates)

A common pattern: the admin types a template like `"Hi %first_name%, your order %order_id% is ready"` in an action setting, and you substitute the form's actual field values at runtime. The replacer reads `jet_fb_context()` so it stays in sync with any mutations from upstream actions.

```php
private function replace_macros( string $template ): string {
    if ( false === strpos( $template, '%' ) ) {
        return $template;
    }

    return preg_replace_callback(
        '/%(?P<name>[a-zA-Z0-9\-_]+)%/',
        static function ( $match ) {
            $field = $match['name'];

            if ( ! jet_fb_context()->has_field( $field ) ) {
                return $match[0]; // leave the placeholder as-is
            }

            $value = jet_fb_context()->get_value( $field );

            if ( is_array( $value ) || is_object( $value ) ) {
                $value = wp_json_encode( $value );
            }

            return (string) $value;
        },
        $template
    );
}
```

Notes:

- **Regex matches `[a-zA-Z0-9\-_]+`** for the macro name — adjust if your field IDs allow other characters, but JFB field IDs are normally constrained to this set.
- **Skip the early-out (`strpos`) at your peril** — without it, every empty-template render runs a regex pass.
- **Unknown macro is left literal**, not stripped. The admin should see `%not_a_field%` in the output if they typo'd, not silently nothing.
- **Array / object values get JSON-encoded** because they have to become a string. If your context expects something else (CSV, comma-joined), customize the inner branch.
- **The macro replacer is `static`** — it has no instance state. Make it a private method or a free function.

JFB ships its own macro / preset / dynamic-value subsystems for richer cases (date formatters, computed values, related-post lookups). If your needs grow past simple field substitution, look into `jet_fb_dynamic_value()` or the macros module instead of expanding this regex.

## Step 4 — call the external API (WP HTTP API)

Always use `wp_remote_*` — never `file_get_contents`, `curl_init`, `fopen` for HTTP. WordPress's HTTP API handles transport selection, proxy config, SSL verify, and timeout consistently across hosts.

```php
private function call_external_api( array $payload ): array {
    $settings = $this->get_api_settings();
    $api_key  = trim( (string) ( $settings['api_key'] ?? '' ) );

    if ( '' === $api_key ) {
        throw new Action_Exception(
            __( 'API key is missing. Configure it in the plugin settings.', 'myplugin' )
        );
    }

    $response = wp_remote_post(
        'https://api.example.com/v1/endpoint',
        array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type'  => 'application/json',
                'Accept'        => 'application/json',
            ),
            'body'    => wp_json_encode( $payload ),
            'timeout' => 30,
        )
    );

    if ( $response instanceof \WP_Error ) {
        throw new Action_Exception(
            sprintf(
                /* translators: %s: HTTP error message */
                __( 'API request failed: %s', 'myplugin' ),
                $response->get_error_message()
            )
        );
    }

    $code = (int) wp_remote_retrieve_response_code( $response );
    $body = (string) wp_remote_retrieve_body( $response );

    if ( $code < 200 || $code >= 300 ) {
        throw new Action_Exception(
            sprintf(
                /* translators: 1: HTTP status code, 2: response body excerpt */
                __( 'API returned %1$d: %2$s', 'myplugin' ),
                $code,
                wp_strip_all_tags( substr( $body, 0, 200 ) )
            )
        );
    }

    $decoded = json_decode( $body, true );
    if ( ! is_array( $decoded ) ) {
        throw new Action_Exception(
            __( 'API returned a non-JSON response.', 'myplugin' )
        );
    }

    return $decoded;
}
```

Critical points:

- **`timeout`** — set explicitly. WP default is 5 seconds which is too short for many APIs. 30 seconds is reasonable for most LLM/CRM calls; raise only if you know the upstream is slower.
- **`headers`** — always include `Content-Type` for POST bodies, and `Accept` for clarity. `Authorization` for any auth scheme.
- **`body`** — `wp_json_encode`, never plain `json_encode` (the WP wrapper handles charsets and edge cases).
- **`WP_Error` handling** — `wp_remote_*` returns either an array on success OR a `WP_Error` on transport failure. Always check.
- **HTTP status code** — `wp_remote_retrieve_response_code` is the canonical way to read it. Convert to int, check the 2xx range. A 200-OK with malformed body still throws below.
- **Body excerpt in error message** — `substr( $body, 0, 200 )` + `wp_strip_all_tags` keeps user-visible errors short and HTML-safe. Don't dump the full body — APIs sometimes return huge HTML error pages.
- **Throw `Action_Exception`, not `Exception`** — JFB only translates `Action_Exception` to user-facing messages.

For **SSRF protection** when the URL is admin-configurable (e.g. webhook URLs the user types in), additionally validate the URL host against an allowlist or use the `reject_unsafe_urls` request arg. See `wp-security-deep` for the full SSRF discussion.

## Step 5 — write the result back into form context

When your action produces data that downstream actions should see (e.g. ChatGPT writes its answer into a hidden field, a translation action replaces a value with its translated form), use `update_request`:

```php
$answer = $api_response['choices'][0]['message']['content'] ?? '';
$answer = sanitize_textarea_field( $answer );

jet_fb_context()->update_request( $answer, $target_field_id );
```

Key semantics:

- **`update_request( $value, $field_id )`** — argument order is `(value, field_id)`, NOT `(field_id, value)`. Easy to flip.
- **Writing to a non-existent field is silent** — the value is stored and `has_field` will return true after, but nothing visible in the form. To verify before writing, call `has_field` first.
- **Subsequent actions read the new value** via both `$request[ $field_id ]` (their `do_action`'s `$request` is re-resolved from context) AND `jet_fb_context()->get_value( $field_id )`. Both are in sync after `update_request`.
- **Save Record action** snapshots the request at submission end — values you write here will be in the saved submission.

If your action ALSO wants to pass non-field metadata to specific downstream actions (e.g. an internal API transaction ID, a calculated score), use `$handler->add_context_once( $this->get_id(), [...] )` instead. That's keyed by action type, not exposed as a form field, and accessible via `$handler->get_context( $action_type, $key )` in later actions.

## Step 6 — dispatch outcome events

Once you have the API result and have written it back, branch the chain by dispatching a custom event. Each branch can have its own followups (different actions wired to different events).

```php
use MyPlugin\Events\ApiSuccessEvent;
use MyPlugin\Events\ApiFailureEvent;

if ( $api_response['ok'] ?? false ) {
    jet_fb_events()->execute( ApiSuccessEvent::class, $handler->get_form_id() );
} else {
    jet_fb_events()->execute( ApiFailureEvent::class, $handler->get_form_id() );
}
```

Important caveats from observed production usage:

- **Save the action handler's position** before dispatching, restore after — the dispatch reuses the action handler and shifts its iteration cursor, which can confuse the surrounding chain:

```php
$previous_position = $handler->get_position();

try {
    jet_fb_events()->execute( $event_class, $handler->get_form_id() );
} finally {
    if ( $previous_position ) {
        $handler->set_current_action( $previous_position );
    } else {
        $handler->set_current_action( $this->_id );
    }
}
```

- **Pass the form ID** as the second argument. Some event executors need it.
- **Events must be registered** server-side via `'jet-form-builder/event-types'` filter (see `jfb-action-events`).
- **Listeners must opt-in** to the event in the editor — this is the standard `provideEvents` flow OR the action item decorator pattern (see `jfb-action-item-decorator`).

## Step 7 — credentials: read from settings tab, not constants

API keys and similar secrets should live in the plugin's settings tab (admin-managed, stored in `wp_options`). Don't hardcode, don't ship `wp-config.php` constants for plugin features — those are for the site owner.

```php
private function get_api_settings(): array {
    $defaults = array(
        'api_key' => '',
        'model'   => 'gpt-4',
        'enable_log' => false,
    );

    return array_merge(
        $defaults,
        Tab_Handler_Manager::instance()->options( 'myplugin-api-tab', array() )
    );
}
```

`Tab_Handler_Manager::instance()->options( $tab_id, $defaults )` reads the JFB settings tab's stored options — see `jfb-settings-tab` for how to register the tab itself. This pattern keeps the action code agnostic to where the credentials live, and makes it trivial for site admins to rotate keys.

## Step 8 — debug logging (gated)

Production actions called from form submissions can flood logs if you log indiscriminately. Gate logs behind a settings flag:

```php
private function should_log(): bool {
    static $enabled = null;
    if ( null !== $enabled ) {
        return $enabled;
    }
    $options = Tab_Handler_Manager::instance()->options( 'myplugin-api-tab', array() );
    $enabled = ! empty( $options['enable_log'] );
    return $enabled;
}

private function log( string $message ): void {
    if ( ! $this->should_log() ) {
        return;
    }
    error_log( '[MyPlugin] ' . $message );
}
```

The `static $enabled` cache avoids re-reading options on every log call within one request.

**What to log:**
- Request payload (sanitized — strip `Authorization` headers, redact secrets)
- API response status code and a short excerpt of the body
- Final outcome / decision

**What NOT to log:**
- API keys, tokens, full headers
- PII unless the user has opted in
- Full response bodies for high-volume endpoints

See `wp-security-secrets` for the full secrets-in-logs discussion.

## End-to-end example: complete `do_action()`

```php
/**
 * @throws Action_Exception
 */
public function do_action( array $request, Action_Handler $handler ) {
    // 1. Read settings (template + target field).
    $instructions = sanitize_textarea_field( $this->settings['instructions'] ?? '' );
    $target_field = Tools::sanitize_text_field( $this->settings['fields_map']['answer'] ?? '' );

    if ( '' === $target_field ) {
        throw new Action_Exception(
            __( 'Target field is required.', 'myplugin' )
        );
    }

    // 2. Macro-replace admin templates.
    $prompt = $this->replace_macros( $instructions );

    // 3. Call the API.
    $response = $this->call_external_api( array(
        'prompt' => $prompt,
        'model'  => $this->get_api_settings()['model'],
    ) );

    // 4. Sanitize + write the result back into form context.
    $answer = sanitize_textarea_field( $response['answer'] ?? '' );
    jet_fb_context()->update_request( $answer, $target_field );

    // 5. Dispatch outcome event.
    $previous_position = $handler->get_position();
    try {
        $event_class = ( $response['decision'] ?? false )
            ? \MyPlugin\Events\DecisionTrueEvent::class
            : \MyPlugin\Events\DecisionFalseEvent::class;

        jet_fb_events()->execute( $event_class, $handler->get_form_id() );
    } finally {
        if ( $previous_position ) {
            $handler->set_current_action( $previous_position );
        } else {
            $handler->set_current_action( $this->_id );
        }
    }
}
```

This shape — settings → macro → API → context write → event dispatch — covers the vast majority of integration actions. Most of the implementation effort is steering the API specifics; the JFB-side glue is constant.

## Critical rules

- **`jet_fb_context()` is the source of truth, not `$request`** — both work for reading, but if upstream actions might mutate, prefer `get_value`. For writes, ALWAYS use `update_request` (NOT direct array mutation).
- **`update_request( $value, $field_id )` argument order is value-first.** Easy to mix up.
- **Sanitize at the boundary** — even though JFB validates form fields, your action sends data to a different system with different rules. `sanitize_text_field`, `sanitize_email`, `absint`, `wp_kses_post` for HTML, `Tools::sanitize_text_field` for action settings.
- **Use `wp_remote_*` for HTTP, never `curl` / `file_get_contents` / `fopen` with URLs.** WP's HTTP API is the only correct path on multi-host environments.
- **Always set explicit `timeout`** — the default 5s breaks LLM and slow-CRM use cases.
- **Throw `Action_Exception` for failure**, never raw `Exception`. JFB only displays `Action_Exception` messages to the user.
- **Save and restore handler position around `jet_fb_events()->execute()`** — the dispatch shifts the iteration cursor.
- **API keys come from the settings tab via `Tab_Handler_Manager`** — never hardcode, never `wp-config.php` constants for plugin-feature credentials.
- **Gate `error_log` behind a settings flag** — production logs flood otherwise.
- **Strip secrets before logging** — `Authorization` headers, API keys, full bodies of auth-related endpoints.
- **Validate URL host for SSRF** when the URL is user-configurable — see `wp-security-deep`.
- **Macros come from `%field_id%`** — JFB field ID format. Don't invent your own delimiter; admins expect this convention.

## Common pitfalls (failure modes inferred from the API contract)

- **`update_request` writes nothing visible**: target field doesn't exist on the form. Verify with `has_field` first, OR document that the field is required.
- **Macro replacer eats `%`-signs in non-template text**: the regex matches greedily over `%foo%`. If your text legitimately contains percent characters, escape them in the admin help text (`100%%`) or use a different delimiter.
- **API call hangs the form submission for 30 seconds**: timeout is set, but the user is still waiting. Consider deferring slow calls to a background task (Action Scheduler) and dispatching events on completion. Out of scope here, but worth knowing.
- **Action throws on non-2xx, but the user only sees "Submit failed"**: `Action_Exception` was caught somewhere upstream OR a generic `\Exception` was thrown instead. Always use `Action_Exception` with a clear, translatable message.
- **`jet_fb_context()->get_value` returns null for a known field**: the form was submitted before that field was rendered (conditional block hid it). Use `??` to fall through to a default; do not throw.
- **Downstream actions don't see the updated value**: `update_request` was called with arguments swapped (`field_id` first, `value` second). Re-check argument order.
- **Event dispatched but no listener runs**: events not registered, OR listeners haven't opted-in via `provideEvents` / decorator. See `jfb-action-events`.
- **API key visible in error log**: logging the full request body without redaction. Add a redactor before the log call.

## Cross-references

- Run **`jfb-form-action`** first — this skill assumes a working action class with `action_attributes`, `action_data`, etc.
- Run **`jfb-action-events`** to register the events your action dispatches.
- Run **`jfb-action-item-decorator`** if you also want the visual TRUE/FALSE/Always toggle on every action (the canonical UI for action-event branching).
- Run **`jfb-settings-tab`** to register the settings tab where API credentials live.
- Run **`wp-security-deep`** for SSRF protection when API URLs are user-configurable.
- Run **`wp-security-secrets`** before release — credentials must come from the settings tab, never hardcoded.
- Run **`wp-i18n-audit`** to verify all error messages are translatable.

## What this skill does NOT cover

- Background / async API calls (Action Scheduler integration is a separate topic).
- Streaming API responses (Server-Sent Events, WebSocket) — out of scope.
- Multi-step API flows (OAuth, refresh tokens) — describe the storage of the refresh token, then this skill applies for each call.
- Idempotency keys / retries — depends on upstream API; not JFB-specific.
- File uploads from the form to an external API — possible but with different sanitization (`wp_check_filetype`, `wp_handle_upload` first).
- Rate limiting from your side — depends on the API; consider transients with TTL.

## References

- `chatgpt-for-jetformbuilder` plugin: production reference. See `includes/Actions/ChatgptDecisionAction.php` for the full pattern (`do_action`, `replace_macros`, `call_chatgpt`, `should_log`, settings tab integration).
- WP HTTP API: https://developer.wordpress.org/reference/functions/wp_remote_post/
- `jet_fb_context()` source: `wp-content/plugins/jetformbuilder/includes/context/context.php`
