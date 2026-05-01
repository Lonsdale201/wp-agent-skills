# jetformbuilder

Skills for **extending JetFormBuilder** — settings tabs, form sidebar panels, custom Form Actions, custom messages, action events, action item decorators, and external-API actions.

Use these when building a JFB companion plugin or wiring a CRM / API integration through a custom action.

## Skills

| Skill | Purpose |
|---|---|
| `jfb-settings-tab` | Register a custom tab in the JFB global Settings page (Vue + cx-vui), saved to `wp_options` via JFB's `Base_Handler` API. |
| `jfb-form-sidebar-panel` | Add a per-form settings panel to the JFB Gutenberg form editor sidebar — `register_post_meta` + `useMetaState` + `@wordpress/components`, including the dual-mode pattern when paired with global settings. |
| `jfb-form-action` | Register a custom Form Action (CRM subscribe, send to API, append to sheet) — `Base` action class + `do_action` + `Action_Exception`, action editor via `JetFBActions.addAction`, both field-mapping patterns (dynamic "Add row" and fixed-key) and multi-select via `FormLabeledTokenField`. |
| `jfb-action-messages` | Surface user-facing custom messages from a custom action — both the idiomatic registered-key path (form Messages panel integration) and the action-local pattern (per-action message fields with the `dsuccess\|` dynamic prefix). |
| `jfb-action-events` | Configure WHEN a custom action runs — declare `supported_events` / `unsupported_events` / `get_required_events`, subscribe to `GATEWAY.SUCCESS` / `BAD.REQUEST` / `DEFAULT.REQUIRED`, register a brand-new event class via `'jet-form-builder/event-types'` (e.g. `WEBHOOK.RECEIVED`). |
| `jfb-action-item-decorator` | Wrap every action item in the action editor with custom UI via the `'jet.fb.action.item'` filter — visual True/Always/False button group that mutates the action's `events` array, or any per-action toggle. |
| `jfb-action-external-api` | Read form data from `jet_fb_context()`, replace `%field%` macros in admin templates, call external HTTP APIs via `wp_remote_post`, write the response back into form context, dispatch outcome events — the full action data-flow lifecycle. |
