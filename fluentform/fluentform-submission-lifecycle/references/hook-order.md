# Fluent Forms submission hook order

This reference reflects Fluent Forms 6.2.7 server source. Re-audit the source
when upgrading because order and argument counts are behavioral contracts.

## Preparation

`SubmissionHandlerService::prepareHandler()`:

1. Loads the form or throws a validation exception.
2. Removes empty members from array inputs.
3. Resolves the special “Other” checkbox/radio keys.
4. Calls `FormFieldsParser::getEssentialInputs()` using browser keys.
5. Sanitizes recursively through `fluentFormSanitizer()` according to element.
6. Intersects data with parsed inputs plus `Helper::getWhiteListedFields()`.

Only declared/recognized fields proceed. Whitelisted protocol fields can proceed
but are excluded from `fluentform_entry_details` later.

## Validation order

`FormValidationService::validateSubmission()` performs:

1. `fluentform/before_form_validation` action.
2. Per-IP burst guard (`prevent_malicious_attacks`, default 5 submissions in 30
   seconds, both filterable).
3. form restrictions and deny-empty checks.
4. optional nonce verification.
5. reCAPTCHA, hCaptcha, and Turnstile checks.
6. `fluentform/input_data_{element}` for each present field.
7. `fluentform/validations` for rules/messages.
8. built-in validator and `fluentform/validation_error` when it fails.
9. per-field built-in validation and
   `fluentform/validate_input_item_{element}`.
10. `fluentform/validation_errors` for final cross-field errors.
11. registration/update/post validation extensions where applicable.
12. `ValidationException` when any error remains.

Pro 6.2.7 attaches advanced form validation to the final error filter. Do not
erase existing `$errors`, or Pro and other addons lose their results.

Spam checks follow normal validation. Depending on global settings a spam entry
may be stored and subsequent actions skipped.

## Insert preparation and persistence

`prepareInsertData()`:

1. Computes a per-form display serial from the latest row.
2. Applies `fluentform/insert_response_data` to accepted form data.
3. JSON-encodes that data into the submission row's `response`.
4. Adds request/user/browser/device/country/IP/timestamps.
5. Applies `fluentform/filter_insert_data` to the complete row.

The serial is a display sequence, not an idempotency key or authorization token.
Use the primary entry ID or your own opaque key for external deduplication.

`insertSubmission()` then fires:

1. `fluentform/before_insert_submission`
2. `fluentform/before_insert_payment_form` for payment forms
3. submission row insert
4. `fluentform/notify_on_form_submit`
5. `_entry_uid_hash` submission meta creation

The two before-insert hooks are actions. Returning data from their callbacks does
nothing. Throwing arbitrary exceptions there is a fragile validation strategy and
does not produce the standard field-error contract.

## Post-insert processing

`processSubmissionData()`:

1. Fires `fluentform/before_form_actions_processing`.
2. Applies `fluentform/submission_form_data`.
3. Writes the `fluentform_entry_details` projection.
4. Applies `fluentform/submission_form_data` again.
5. Fires deprecated/current `submission_inserted` hooks.
6. Marks `is_form_action_fired` meta.
7. Fires `fluentform/submission_inserted_{form-type}_form`.
8. Fires `fluentform/before_submission_confirmation`.
9. Builds and filters the confirmation response.

Core's global notification manager listens to `submission_inserted` and processes
enabled feed settings. Most feeds default to asynchronous processing through
`ff_scheduled_actions` and Action Scheduler.

Current code catches `Exception` around inserted-action processing and normally
does not roll back the saved row. Do not make a successful browser response your
only proof that an external side effect succeeded.

## Confirmation filters

- `fluentform/form_submission_confirmation`: change confirmation settings.
- `fluentform/submission_message_parse`: change same-page message before smart
  code parsing.
- `fluentform/redirect_url_value`: change the sanitized redirect URL.
- `fluentform/submission_confirmation`: change the final response array.

Validate redirects against an explicit allowlist when they depend on submitted
data. Do not place secrets or internal error detail in confirmation output.

## Pro partial submissions

Pro's draft path uses `fluentform_draft_submissions`, not
`fluentform_submissions`. Relevant Pro hooks include:

- `fluentform/partial_submission_added`
- `fluentform/partial_submission_step_completed`
- `fluentform/partial_submission_updated`
- `fluentform/partial_submission_deleted`
- `fluentform/before_partial_entry_deleted`
- `fluentform/after_partial_entry_deleted`

Treat draft payloads as incomplete and mutable. Scope lookups by form, entry/hash,
and authenticated user/ownership rules. A final normal submission may follow a
series of partial updates, so deduplicate analytics and external sync separately.

## Verification matrix

Test each extension with:

1. unknown field, missing field, zero-like value, nested array, oversized value;
2. field validation and cross-field validation failures;
3. anonymous and logged-in submissions;
4. CAPTCHA/spam rejection and “store spam but skip actions” mode;
5. duplicate/replayed requests;
6. an integration failure after the row exists;
7. same-page and redirect confirmations;
8. Pro partial draft versus final completed submission when Pro is supported.
