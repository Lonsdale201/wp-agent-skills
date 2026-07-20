---
name: fluentform-entries-data
description: >-
  Reads, relates, updates, and audits Fluent Forms forms, submissions, entry
  details, and submission meta from third-party plugins. Covers fluentFormApi,
  FormFieldsParser, Submission and SubmissionMeta models, form-scoped queries,
  response JSON versus normalized detail rows, pagination, capabilities,
  deletion hooks, and Free versus Pro tables. Use when building entry reports,
  exports, dashboards, REST endpoints, submission metadata, user-facing entry
  views, or code touching fluentform_submissions, fluentform_entry_details,
  fluentform_submission_meta, fluentFormApi('submissions'), or entryInstance().
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluentform"
  wp-skills-plugin-version-tested: "6.2.7"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# Fluent Forms entries and data model

Use Fluent Forms' API/model layer after enforcing your own authorization. Keep
the canonical response snapshot, query projection, and addon metadata separate.

Read [data-contract.md](references/data-contract.md) before writing entry data,
exposing it over REST, joining nested fields, or supporting Pro drafts/payments.

## Availability contract

| Data/API | Availability in 6.2.7 |
|---|---|
| forms, submissions, entry details, form/submission meta | Free |
| `fluentFormApi()`, `FormFieldsParser`, `Submission`, `SubmissionMeta` | Free |
| draft/partial submissions | Pro |
| order items, transactions, payment subscriptions and coupons | Payment/Pro feature dependent |

The PHP helpers perform data access, not request authorization. A successful
`fluentFormApi()` call does not prove the current user may see the result.

## Read one form's entries

```php
use FluentForm\App\Modules\Acl\Acl;

$formId = absint($requestedFormId);

if (!$formId || !function_exists('fluentFormApi')) {
    return new WP_Error('acme_unavailable', __('Fluent Forms is unavailable.', 'acme-addon'));
}

if (!Acl::hasPermission('fluentform_entries_viewer', $formId)) {
    return new WP_Error('acme_forbidden', __('You cannot view these entries.', 'acme-addon'), [
        'status' => 403,
    ]);
}

$form = fluentFormApi('forms')->find($formId);
if (!$form) {
    return new WP_Error('acme_not_found', __('Form not found.', 'acme-addon'), [
        'status' => 404,
    ]);
}

$page    = max(1, absint($requestedPage));
$perPage = min(100, max(1, absint($requestedPerPage)));

$result = fluentFormApi('forms')->entryInstance($form)->entries([
    'page'       => $page,
    'per_page'   => $perPage,
    'entry_type' => 'all',
    'sort_type'  => 'DESC',
    'search'     => sanitize_text_field((string) $requestedSearch),
]);
```

Use the form-scoped `entryInstance()` for a known form. The global
`fluentFormApi('submissions')` methods are useful for trusted internal reports,
but callers must constrain form IDs, user IDs, status, and page size themselves.

## Read a single form-scoped entry

```php
$entryResult = fluentFormApi('forms')
    ->entryInstance($form)
    ->entry(absint($entryId), false);

if (!$entryResult) {
    return new WP_Error('acme_entry_not_found', __('Entry not found.', 'acme-addon'), [
        'status' => 404,
    ]);
}

$entry    = $entryResult['submission'];
$response = is_array($entry->response) ? $entry->response : [];
```

Do not fetch by entry ID globally and authorize with a different form ID. Scope
the database lookup and permission decision to the same normalized form ID.

## Resolve field definitions and labels

```php
use FluentForm\App\Modules\Form\FormFieldsParser;

$inputs = FormFieldsParser::getEntryInputs($form, ['admin_label', 'raw']);
$labels = FormFieldsParser::getAdminLabels($form, $inputs);

foreach ($response as $name => $value) {
    $label = $labels[$name] ?? $name;
    // Escape $label and $value for their actual output context.
}
```

`attributes.name`, not the visible label, connects the field definition to the
response. Labels and fields can change after old submissions were stored, so
always provide a fallback for historical/removed keys.

## Store addon state as submission meta

```php
use FluentForm\App\Helpers\Helper;

$entryId = absint($entryId);
$formId  = absint($formId);

// First verify the entry belongs to $formId and the current operation is allowed.
Helper::setSubmissionMeta($entryId, '_acme_delivery_state', [
    'status'     => 'queued',
    'updated_at' => current_time('mysql'),
], $formId);

$state = Helper::getSubmissionMeta($entryId, '_acme_delivery_state', []);
```

Namespace meta keys. Store bounded operational data, not credentials or copied
entry payloads. `SubmissionMeta` serializes values and is not encrypted.

## Mutation policy

- Prefer submission-time filters when deriving a stored field value.
- For status changes and deletion, use `SubmissionService` so Fluent Forms hooks,
  files, logs, details, queued actions, and payment-related cleanup are considered.
- If an existing response must be edited, treat `response` JSON and affected
  `entry_details` rows as one consistency boundary. Validate against the current
  form, preserve unknown historical keys deliberately, update the timestamp, and
  emit the appropriate audit hook/log.
- Never update only `fluentform_entry_details`; normal entry rendering and feeds
  read `fluentform_submissions.response`.
- Never expose generic model `where`/sort/column inputs directly to a request.

## Security and performance rules

- Use `Acl::hasPermission('fluentform_entries_viewer', $formId)` for Fluent Forms
  admin semantics, plus any domain-specific ownership rule your endpoint needs.
  Use `fluentform_manage_entries` for mutations.
- Add nonce verification to cookie-authenticated writes; a nonce does not replace
  the capability/form-scope check.
- Return an explicit field allowlist. Entries can contain personal data, IP,
  source URLs, hidden fields, payment fields, and addon-injected values.
- Bound `per_page`, validate statuses, and use a fixed sort allowlist.
- Avoid `LIKE` searches over the large `response` JSON column for unbounded public
  queries. Use detail rows or an addon-owned indexed table for frequent reports.
- Do not use `SubmissionService::find()` for a read-only probe without noticing
  that it can mark `unread` entries as `read` by default in 6.2.7.
- Do not use `FluentForm\App\Models\Entry` as the primary model; the live model is
  `FluentForm\App\Models\Submission`, while `FluentForm\App\Api\Entry` is the
  form-scoped API wrapper.

## Pro boundary

Pro partial entries live in `fluentform_draft_submissions` and have a different
ownership/hash lifecycle. Do not merge them into completed-submission queries by
ID alone. Pro/payment records link through `submission_id`, but payment access
requires `fluentform_view_payments` or `fluentform_manage_payments` and must use
verified payment status, not merely the presence of a row.

## Cross-references

- Use `fluentform-submission-lifecycle` for creation-time data and hooks.
- Use `fluentform-custom-fields` for field-name and nested-value contracts.
- Use `wp-rest-api` when entries are exposed through a custom REST endpoint.

## References

- Official database schema: <https://developers.fluentforms.com/database/>
- Official model guide: <https://developers.fluentforms.com/database/models/>
- Official query builder guide: <https://developers.fluentforms.com/database/query-builder/>
- Verified Free source paths:
  - `fluentform/boot/globals.php`
  - `fluentform/app/Api/Form.php`
  - `fluentform/app/Api/Entry.php`
  - `fluentform/app/Api/Submission.php`
  - `fluentform/app/Models/Submission.php`
  - `fluentform/app/Models/EntryDetails.php`
  - `fluentform/app/Models/SubmissionMeta.php`
  - `fluentform/app/Services/Submission/SubmissionService.php`
- Verified Pro source path:
  - `fluentformpro/src/classes/StepFormEntries.php`
