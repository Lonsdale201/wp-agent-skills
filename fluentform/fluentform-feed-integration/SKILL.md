---
name: fluentform-feed-integration
description: >-
  Builds and audits configurable third-party Fluent Forms feed integrations with
  IntegrationManagerController. Covers addon/global settings, per-form feed UI,
  field mapping, conditional execution, smart-code parsing, synchronous versus
  asynchronous dispatch, ff_scheduled_actions, Action Scheduler, result logging,
  credential handling, retries, and idempotency. Use when adding a CRM, webhook,
  messaging, storage, or external API connector; extending
  fluentform/get_available_form_integrations; handling
  fluentform/integration_notify_*; or reviewing an integration that currently
  sends remote requests directly from fluentform/submission_inserted.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluentform"
  wp-skills-plugin-version-tested: "6.2.7"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# Fluent Forms feed integrations

Use the Free-core feed manager when administrators need credentials, reusable
per-form feeds, field mapping, conditions, logs, and background delivery. Use a
plain `submission_inserted` listener only for small, non-configurable local work.

Read [integration-contract.md](references/integration-contract.md) before
implementing the manager class or deciding retry/idempotency behavior.

## Availability contract

`FluentForm\App\Http\Controllers\IntegrationManagerController`, feed metadata,
the notification manager, `ff_scheduled_actions`, and bundled Action Scheduler
are Free-core surfaces in 6.2.7. Mailchimp is a Free reference implementation.
Many shipped connectors under `fluentformpro/src/Integrations` are Pro-only, but
their existence does not make a third-party integration manager require Pro.

Use the current controller directly. These aliases are deprecated in 6.2.7:

- `FluentForm\App\Services\Integrations\IntegrationManager`
- `FluentForm\App\Services\Integrations\BaseIntegration`

## Decision point

Use a feed manager when at least one applies:

- admins create multiple destinations or mappings per form;
- delivery has form conditions or smart codes;
- credentials need a global connection screen;
- delivery should run asynchronously and appear in integration logs;
- a failed/replayed request needs an idempotency contract.

Use a direct hook for bounded local metadata/state changes with no settings UI.
Do not build a feed abstraction around a single pure calculation.

## Registration workflow

1. Bootstrap once on `fluentform/loaded`; require the controller class.
2. Choose three stable identifiers:
   - integration key for addon/global UI;
   - namespaced option key for connection settings;
   - feed settings key stored in `fluentform_form_meta` and used in the dynamic
     notification hook.
3. Extend `IntegrationManagerController`, call the parent constructor, set the
   description/logo/category, then call `registerAdminHooks()`.
4. Implement global settings and verify credentials server-side before setting
   `status => true`.
5. Implement integration availability, feed defaults, settings fields, and merge
   fields. Keep `enabled` and `conditionals` in the feed schema.
6. Implement `notify($feed, $formData, $entry, $form)` as an idempotent operation.
7. Report every terminal result through `fluentform/integration_action_result`.
8. Test disabled, unconfigured, condition-false, sync, async, timeout, retry, and
   duplicate delivery paths.

## Bootstrap

```php
use FluentForm\App\Http\Controllers\IntegrationManagerController;

add_action('fluentform/loaded', static function ($app): void {
    if (!class_exists(IntegrationManagerController::class)) {
        return;
    }

    new Acme_FluentForm_Integration($app);
}, 20, 1);
```

The constructor should use stable, namespaced keys:

```php
parent::__construct(
    $app,
    __('Acme CRM', 'acme-addon'),
    'acme_crm',
    '_acme_ff_crm_settings',
    'acme_crm_feeds',
    20
);

$this->description = __('Send selected entries to Acme CRM.', 'acme-addon');
$this->category    = 'crm';
$this->logo        = plugins_url('assets/acme.svg', ACME_ADDON_FILE);
$this->registerAdminHooks();
```

Do not change these keys after release without migrating the global option and
all form-meta feed rows.

## Notification contract

```php
public function notify($feed, $formData, $entry, $form)
{
    $entryId = (int) $entry->id;
    $values  = isset($feed['processedValues']) && is_array($feed['processedValues'])
        ? $feed['processedValues']
        : [];

    try {
        $result = $this->client()->upsertContact([
            'external_key' => 'ff-entry-' . $entryId,
            'email'        => sanitize_email((string) ($values['fieldEmailAddress'] ?? '')),
        ]);

        if (empty($result['ok'])) {
            throw new \RuntimeException('Remote service rejected the request.');
        }

        do_action(
            'fluentform/integration_action_result',
            $feed,
            'success',
            __('Delivered to Acme CRM.', 'acme-addon')
        );
    } catch (\Throwable $error) {
        do_action(
            'fluentform/integration_action_result',
            $feed,
            'failed',
            __('Acme CRM delivery failed.', 'acme-addon')
        );

        // Log bounded, redacted diagnostics; never expose credentials or payloads.
    }
}
```

`processedValues` contains the feed settings after Fluent Forms smart-code
parsing. `$formData` is the stored response data, and `$entry` is its parsed entry
view. Map explicit keys; do not forward the complete arrays by default.

## Async and failure semantics

Feeds default to asynchronous delivery. Fluent Forms writes a row to
`ff_scheduled_actions`, queues `fluentform/schedule_feed` through Action
Scheduler, marks the row `processing`, then dispatches
`fluentform/integration_notify_{settingsKey}`.

```php
add_filter(
    'fluentform/notifying_async_acme_crm',
    static fn($async, $formId) => true,
    10,
    2
);
```

The filter suffix is the integration key, while the notify action suffix is the
feed settings key. Do not interchange them.

Do not advertise automatic delivery guarantees that the implementation does not
provide. In 6.2.7 the queue increments `retry_count` and marks `processing`, but
the integration callback must still record a terminal result, and exception or
process-death recovery needs explicit testing. Use a stable remote idempotency key
derived from the entry/feed, bounded timeouts, and a documented retry policy.

## Security and data rules

- Store credentials only in the global option, with autoload disabled. Never copy
  API keys into per-form feed values, localized JavaScript, submission meta, or
  logs. Mask secrets when returning global settings to the UI.
- Verify credentials with a bounded server-side request before marking the
  connection configured. Use TLS verification and an allowlisted service origin.
- Sanitize global/feed settings on save. Escape labels/help HTML for its exact
  admin rendering context.
- If adding custom AJAX/REST routes, implement nonce/authentication, Fluent Forms
  capabilities, form-level authorization, and object-level ownership yourself.
- Never send password fields, payment tokens, file-system paths, hidden control
  keys, IP addresses, or the entire entry unless explicitly required and lawful.
- Validate mapped email/URL/ID types after smart-code expansion.
- Treat provider error bodies as untrusted and redact before logs or UI output.
- Keep `notify()` idempotent; Action Scheduler/manual retry or network ambiguity
  can deliver the same entry more than once.

## Pro boundary

Custom feed infrastructure is Free. A connector is Pro-dependent only when it
uses a Pro class, field, payment object, user-registration feed, post feed, or
other Pro-only capability. Guard that exact dependency with `class_exists()` or
`method_exists()` and provide a clear disabled state in the integration UI.

## Cross-references

- Use `fluentform-submission-lifecycle` for feed dispatch timing.
- Use `fluentform-entries-data` for entry fields, meta, and permissions.
- Use `wp-http-api-client` for outbound HTTP, SSRF controls, timeouts, and redaction.

## References

- Official Integration Manager Controller documentation: <https://developers.fluentforms.com/api/classes/integration-manager-controller/>
- Official integration hooks: <https://developers.fluentforms.com/hooks/actions/integration/>
- Verified Free source paths:
  - `fluentform/app/Http/Controllers/IntegrationManagerController.php`
  - `fluentform/app/Services/Integrations/FormIntegrationService.php`
  - `fluentform/app/Hooks/Handlers/GlobalNotificationHandler.php`
  - `fluentform/app/Services/Integrations/GlobalNotificationService.php`
  - `fluentform/app/Services/WPAsync/FluentFormAsyncRequest.php`
  - `fluentform/app/Services/Integrations/MailChimp/MailChimpIntegration.php`
- Verified Pro examples, required only for their features:
  - `fluentformpro/src/Integrations/ActiveCampaign/Bootstrap.php`
  - `fluentformpro/src/Integrations/WebHook/Bootstrap.php`
