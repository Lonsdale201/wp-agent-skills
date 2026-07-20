# Fluent Forms integration-manager contract

Read this before implementing the manager class. It records the Free 6.2.7
controller and dispatch behavior; provider-specific code remains the addon's
responsibility.

## Identifier map

Given:

```php
parent::__construct(
    $app,
    'Acme CRM',
    'acme_crm',
    '_acme_ff_crm_settings',
    'acme_crm_feeds',
    20
);
```

| Value | Role |
|---|---|
| `acme_crm` | addon/global-settings identifier and async-filter suffix |
| `_acme_ff_crm_settings` | WordPress option holding connection state |
| `acme_crm_feeds` | `fluentform_form_meta.meta_key` and notify-action suffix |
| `20` | registration priority |

The controller's `isEnabled()` checks Fluent Forms' global addon-module state.
When disabled, registration exposes the addon card but does not attach its feed
or notify hooks. Test the UI enable/disable transition.

## Required methods

The controller requires:

```php
public function getIntegrationDefaults($settings, $formId);
public function pushIntegration($integrations, $formId);
public function getSettingsFields($settings, $formId);
public function getMergeFields($list, $listId, $formId);
```

Most remote integrations also override:

```php
public function getGlobalFields($fields);
public function getGlobalSettings($settings);
public function saveGlobalSettings($settings);
public function notify($feed, $formData, $entry, $form);
```

`registerAdminHooks()` attaches the UI/feed hooks. It also attaches the dynamic
notify callback only when `isConfigured()` is true.

## Feed defaults

At minimum preserve the framework's expected control values:

```php
public function getIntegrationDefaults($settings, $formId)
{
    return [
        'name'       => '',
        'enabled'    => true,
        'fieldEmailAddress' => '',
        'merge_fields'      => [],
        'remote_tag' => '',
        'conditionals' => [
            'status'     => false,
            'type'       => 'all',
            'conditions' => [],
        ],
    ];
}
```

Feed settings are JSON in `fluentform_form_meta`. Avoid resources, closures,
objects, secrets, and unbounded blobs. Keep migrations for renamed keys.

`prepareIntegrationFeed()` converts string booleans and merges defaults. Do not
assume every historical feed already has current keys.

## Settings-field structure

The manager generates the form-feed UI from arrays. Verify component names
against the current Integration Feed Fields API and a bundled integration. A
typical start is:

```php
public function getSettingsFields($settings, $formId)
{
    return [
        'fields' => [
            [
                'key'         => 'name',
                'label'       => __('Feed name', 'acme-addon'),
                'required'    => true,
                'component'   => 'text',
                'placeholder' => __('Acme CRM feed', 'acme-addon'),
            ],
            [
                'key'                => 'merge_fields',
                'label'              => __('Map fields', 'acme-addon'),
                'component'          => 'map_fields',
                'field_label_remote' => __('Acme field', 'acme-addon'),
                'field_label_local'  => __('Form field', 'acme-addon'),
                // This misspelling is the Fluent Forms 6.2.7 schema key.
                'primary_fileds' => [
                    [
                        'key'           => 'fieldEmailAddress',
                        'label'         => __('Email address', 'acme-addon'),
                        'required'      => true,
                        'input_options' => 'emails',
                    ],
                ],
            ],
            [
                'key'       => 'conditionals',
                'label'     => __('Conditional logic', 'acme-addon'),
                'component' => 'conditional_block',
            ],
            [
                'key'            => 'enabled',
                'label'          => __('Status', 'acme-addon'),
                'component'      => 'checkbox-single',
                'checkbox_label' => __('Enable this feed', 'acme-addon'),
            ],
        ],
        'integration_title' => __('Acme CRM feed', 'acme-addon'),
        'button_require_list' => false,
    ];
}
```

Do not assume this simplified schema fits list/tag providers. Inspect the current
Mailchimp source and official field-component reference for dynamic option calls,
route handling, and merge-field shapes.

## Global settings

Return a masked value to the browser while retaining the real secret server-side.
On save:

1. distinguish “unchanged masked value” from a new credential;
2. sanitize identifier fields without corrupting secrets;
3. verify the credential against an allowlisted HTTPS endpoint;
4. handle timeout, authentication error, provider rate limit, and malformed JSON;
5. store with `update_option($key, $value, false)`;
6. never include raw provider error bodies in `wp_send_json_error()`.

Core's manager routes protect its own settings operations. Any additional custom
route or AJAX action is your security boundary and must repeat the relevant
nonce, capability, form-scope, and parameter validation.

## Dispatch order

On `fluentform/submission_inserted`, the global notification handler:

1. obtains enabled feed meta keys from
   `fluentform/global_notification_active_types`;
2. loads matching form-meta rows;
3. keeps `enabled` feeds whose `conditionals` pass;
4. filters each feed with `fluentform/integration_feed_before_parse`;
5. loads a parsed entry;
6. expands smart codes into `feed['processedValues']`;
7. chooses async/sync with `fluentform/notifying_async_{integrationKey}`;
8. queues or calls `fluentform/integration_notify_{settingsKey}`.

Async execution reloads the submission's response JSON and parsed entry. It is a
new request/process; do not depend on globals, current user, request cookies, or
in-memory state from form submission.

## Result and observability contract

Always call:

```php
do_action(
    'fluentform/integration_action_result',
    $feed,
    $status, // success or failed
    $boundedRedactedNote
);
```

When `scheduled_action_id` exists, core updates the queue row status/note. Keep
the note under 255 characters and useful to an administrator without including
personal data or provider secrets.

For deeper diagnostics, log a correlation ID, form ID, entry ID, feed ID,
provider status class, and attempt count. Put full sanitized diagnostics behind a
debug setting with retention limits.

## Reliability checklist

- External key/idempotency key is stable per entry and feed.
- Remote create operations become upsert or safely handle duplicate-key errors.
- Connect/read timeout is bounded; no request can hold PHP indefinitely.
- 2xx with malformed/negative business result is not marked success.
- 4xx permanent failures and 429/5xx transient failures are classified.
- Retry has a maximum attempt count and backoff; manual replay is safe.
- A PHP exception/process death cannot leave an invisible permanent “processing”
  row without monitoring/recovery.
- Deleting a form/feed/entry does not leave unsafe orphan work.
- Logs and queue payloads contain no credentials.

## Free and Pro examples

Use Free Mailchimp as the baseline for the controller/UI contract. Pro connectors
can illustrate provider-specific mapping, but importing their namespaces or
assuming their supporting routes/assets makes the addon Pro-dependent. Mark any
such dependency in code, readme, activation checks, and tests.
