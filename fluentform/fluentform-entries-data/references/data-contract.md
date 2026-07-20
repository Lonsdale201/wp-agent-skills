# Fluent Forms entry data contract

This reference describes the 6.2.7 storage model and its practical extension
semantics.

## Relationships

```text
fluentform_forms.id
  ├─ fluentform_submissions.form_id
  │    ├─ fluentform_entry_details.submission_id
  │    ├─ fluentform_submission_meta.response_id
  │    ├─ fluentform_logs.source_id (source_type = submission_item)
  │    ├─ ff_scheduled_actions.origin_id (submission_action)
  │    └─ payment tables by submission_id when available
  └─ fluentform_form_meta.form_id
```

Pro drafts are stored separately in `fluentform_draft_submissions` and are not
normal `Submission` model records.

## Three representations of submitted data

### `fluentform_submissions.response`

JSON snapshot of accepted form data after `fluentform/insert_response_data`. This
is the main machine-readable submission payload used by entry rendering,
notifications, asynchronous feeds, printing, and reports.

### `fluentform_entry_details`

Search/report projection written after the main row. Scalar fields produce one
row. Arrays/objects produce rows with the same `field_name` and different
`sub_field_name` values; child values may be serialized.

Do not treat the projection as lossless:

- whitelisted protocol keys are excluded;
- empty strings and null are skipped;
- empty nested values are skipped with `empty()`, so nested zero-like values may
  be absent;
- the update helper uses falsey checks that can omit zero-like values;
- field definitions can change after the response was stored.

### `fluentform_submission_meta`

Addon/operational data keyed by `(response_id, meta_key)` in normal usage.
`Helper::setSubmissionMeta()` serializes values and `getSubmissionMeta()` safely
unserializes them. Meta is not automatically exposed like a form field, but it is
also not a secret store.

## API choices

### `fluentFormApi('forms')`

- `find($formId)` returns a form or null.
- `forms($args, $withFields)` lists forms.
- `entryInstance($formOrId)` returns `FluentForm\App\Api\Entry`.

### Form-scoped `Api\Entry`

- `entries($args, $includeFormats)` paginates one form.
- `entry($entryId, $includeFormats)` scopes by form and ID.
- `entryBySerial($serial, $includeFormats)` scopes by form and display serial.
- `report($statuses)` generates report data.

The display serial is only unique within its form and is not an authorization or
anti-enumeration token.

### `fluentFormApi('submissions')`

- `get($args)` lists submissions across forms.
- `find($submissionId)` finds globally by ID and assumes a row exists.
- payment transaction/subscription helpers are present in the Free API class but
  useful only when the relevant payment data/features exist.

The global API does not enforce a current-user capability or form ownership. Add
the policy at every externally reachable caller.

### Models and services

Use `FluentForm\App\Models\Submission` for controlled ORM queries and relations.
Use `SubmissionService` when behavior matters: status updates, delete lifecycle,
files, notes, user association, parsing, and hooks.

`SubmissionService::find()` parses an entry and, unless
`fluentform/auto_read_submission` returns false, changes status from `unread` to
`read`. This method is unsuitable for side-effect-free existence checks.

## Field definition mapping

`fluentform_forms.form_fields` stores the builder JSON. Use
`FormFieldsParser::getInputs()` for flattened inputs and
`getEntryInputs()` for top-level entry inputs. Do not parse the JSON ad hoc unless
you are writing a migration that intentionally preserves unknown schema.

For a compound key such as `names[first_name]`:

- the flattened input parser knows the bracket child;
- accepted response data normally contains a top-level `names` array;
- entry details store `field_name = names`, `sub_field_name = first_name`;
- display formatting is element-specific.

## Authorization patterns

For Fluent Forms admin-style operations:

- read forms/dashboard: `fluentform_dashboard_access`
- manage forms: `fluentform_forms_manager`
- read entries: `fluentform_entries_viewer`
- mutate entries: `fluentform_manage_entries`
- read/manage payments: `fluentform_view_payments` /
  `fluentform_manage_payments`

Prefer `Acl::hasPermission($permission, $formId)` to a bare capability when form
manager scoping matters. For a customer-facing view, add ownership checks such as
matching the entry's `user_id` to the authenticated user. Never let knowledge of
an entry UID/hash replace authorization for sensitive data.

## Safe list-query checklist

1. Normalize and authorize the form ID before building the query.
2. Bound `page` and `per_page`; reject pathological offsets where necessary.
3. Allowlist statuses and sort fields/directions.
4. Keep search length bounded and avoid unrestricted response JSON scans.
5. Select only fields the caller needs.
6. Remove IP, source URL, payment, hidden, and sensitive field values unless
   explicitly authorized.
7. Return pagination metadata and stable ordering with ID as a tie-breaker.
8. Cache aggregate reports only with form/user/permission context in the key.

## Consistent update checklist

There is no one-line public API in 6.2.7 that safely edits arbitrary response
fields and all projections for every addon. If a requirement truly needs it:

1. Fetch by both entry ID and form ID.
2. Authorize `fluentform_manage_entries` plus object ownership.
3. Parse and validate only allowlisted editable field names.
4. Merge with decoded `response` deliberately; preserve historical keys.
5. Encode with `wp_json_encode()` and check failure.
6. Update the response and affected detail rows as one consistency operation.
7. Set `updated_at`, create an audit log, and emit only documented hooks.
8. Decide whether notifications/integrations must be re-run; never do so
   implicitly.
9. Test arrays, empty strings, null, `0`, `"0"`, removed fields, and concurrent
   updates.

For normal derived values, doing the work once during submission is safer.
