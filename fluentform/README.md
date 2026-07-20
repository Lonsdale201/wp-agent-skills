# fluentform

Developer-extension skills for [Fluent Forms](https://fluentforms.com/)
(`fluentform`) and its optional Pro addon (`fluentformpro`). Use these when a
third-party plugin must add fields, validate or react to submissions, read entry
data, or provide a configurable external integration without bypassing Fluent
Forms' parser, lifecycle, ACL, or queue model.

Grounded against Fluent Forms Free 6.2.7 and Fluent Forms Pro 6.2.7 on WordPress
7.0.2. Every skill contains an explicit Free/Pro boundary. The main extension
contracts are Free; a Pro dependency is claimed only for a source-verified Pro
field, draft/payment feature, class, or table.

## Skills

| Skill | Purpose |
|---|---|
| `fluentform-custom-fields` | Build custom form-builder inputs with the Free `BaseFieldManager` contract: component schema, safe frontend rendering, `attributes.name` mapping, parser registration, conditional support, normalization, server validation, response formatting, assets/accessibility, and nested-value tests. Marks shipped phone/dynamic/chained/repeater/upload/etc. implementations as Pro without making the base API look Pro-only. |
| `fluentform-submission-lifecycle` | Select the correct hook from accepted-key parsing and sanitization through validation, response JSON, row/detail persistence, notifications/feeds, and confirmation. Corrects the misleading idea that the post-validation `before_insert_submission` action is the normal validation surface; calls out the twice-applied `submission_form_data` filter, non-transactional side effects, payment-status boundary, and Pro partial-draft lifecycle. |
| `fluentform-entries-data` | Read and manage forms/submissions with `fluentFormApi`, `FormFieldsParser`, `Submission`, `SubmissionMeta`, and form-scoped ACL. Explains canonical `response` JSON versus lossy `entry_details`, historical field-label drift, side-effecting reads, bounded queries, consistent mutation/deletion, and separate Pro draft/payment records. |
| `fluentform-feed-integration` | Build a configurable connector with Free-core `IntegrationManagerController`: global credentials, per-form feed schema and mappings, conditions, smart-code expansion, async `ff_scheduled_actions`/Action Scheduler dispatch, result logging, idempotency, failure recovery, and the exact integration-key versus settings-key hook suffixes. |

## Recommended combinations

- New custom input: `fluentform-custom-fields` +
  `fluentform-submission-lifecycle`.
- Entry dashboard or API: `fluentform-entries-data` + `wp-rest-api` where REST is
  involved.
- CRM/webhook/provider addon: `fluentform-feed-integration` +
  `wp-http-api-client` + `fluentform-submission-lifecycle`.
