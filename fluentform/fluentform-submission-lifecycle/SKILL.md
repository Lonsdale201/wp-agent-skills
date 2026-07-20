---
name: fluentform-submission-lifecycle
description: >-
  Implements and audits Fluent Forms server-side submission behavior from parsed
  field data through sanitization, validation, persistence, entry details,
  notifications, integrations, and confirmation. Selects the correct
  fluentform/input_data_*, fluentform/validation_errors,
  fluentform/insert_response_data, fluentform/submission_inserted, and
  fluentform/submission_confirmation hook and explains their timing. Use when
  adding cross-field validation, normalizing submitted values, reacting to an
  entry, debugging missing submission data, preventing duplicate side effects,
  or distinguishing a Pro partial draft from a completed submission.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluentform"
  wp-skills-plugin-version-tested: "6.2.7"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# Fluent Forms submission lifecycle

Choose hooks from the actual server-side order. Browser data is untrusted, and
an action that sounds “before insert” is not a replacement for validation.

Read [hook-order.md](references/hook-order.md) before changing stored values,
adding a remote side effect, handling payment forms, or reacting to Pro drafts.

## Canonical lifecycle

```text
raw serialized request
  -> form field parsing and accepted-key allowlist
  -> recursive Fluent Forms sanitization
  -> restrictions / CAPTCHA / input normalization / validation
  -> spam checks
  -> response-data and insert-row filters
  -> submission row insert
  -> before-actions hook
  -> entry-details projection
  -> submission-inserted hooks and feeds
  -> confirmation filters
```

Unknown request keys are removed before validation unless explicitly placed on
Fluent Forms' protocol-key allowlist. The accepted `$formData` is therefore not
the same object as raw `$_POST` or the controller's parsed input.

## Hook selection

| Need | Use | Important timing |
|---|---|---|
| Normalize one element before rules | `fluentform/input_data_{element}` | Before validator |
| Change rule/message definitions | `fluentform/validations` | Before validator |
| Add cross-field errors | `fluentform/validation_errors` | Before rejection/insert |
| Change accepted response data | `fluentform/insert_response_data` | After validation, before JSON encode |
| Change DB row columns | `fluentform/filter_insert_data` | Low-level, immediately before insert |
| Observe imminent insert | `fluentform/before_insert_submission` | Action, after validation; cannot return changed data |
| React to a durable entry | `fluentform/submission_inserted` | Row and entry details exist |
| Change browser confirmation | `fluentform/submission_confirmation` | Last response stage |

Do not use `fluentform/before_insert_submission` for normal validation. In 6.2.7
it is an action after `handleValidation()` and receives `$insertData` by value.
Use validation filters so the browser gets field-shaped errors and no row is
created.

## Form-scoped cross-field validation

```php
add_filter(
    'fluentform/validation_errors',
    static function ($errors, $formData, $form, $fields) {
        if ((int) $form->id !== 42) {
            return $errors;
        }

        $start = (string) ($formData['start_date'] ?? '');
        $end   = (string) ($formData['end_date'] ?? '');

        if ($start !== '' && $end !== '' && $end < $start) {
            $errors['end_date'][] = __(
                'The end date must not precede the start date.',
                'acme-addon'
            );
        }

        return $errors;
    },
    10,
    4
);
```

Use exact field names from the form definition. Preserve existing errors and
return an array keyed by the input name. Validate dates or numbers semantically;
the short comparison above is valid only for normalized ISO dates.

## Stored-value transformation

```php
add_filter(
    'fluentform/insert_response_data',
    static function ($formData, $formId, $inputConfigs) {
        if ((int) $formId !== 42 || !isset($formData['customer_code'])) {
            return $formData;
        }

        $formData['customer_code'] = strtoupper(
            sanitize_text_field((string) $formData['customer_code'])
        );

        return $formData;
    },
    10,
    3
);
```

This filter runs after field validation. Revalidate any materially changed value,
or normalize it earlier with `input_data_{element}`. Never inject secrets,
payment tokens, raw request bodies, or unbounded payloads into `response`.

## Durable side effects

```php
add_action(
    'fluentform/submission_inserted',
    static function ($entryId, $formData, $form): void {
        if ((int) $form->id !== 42) {
            return;
        }

        $alreadyDone = \FluentForm\App\Helpers\Helper::getSubmissionMeta(
            $entryId,
            '_acme_synced',
            false
        );

        if ($alreadyDone) {
            return;
        }

        // Queue a bounded background job with $entryId as its idempotency key.
    },
    20,
    3
);
```

Prefer Fluent Forms feed integrations for configurable external delivery. If a
plain hook is enough, queue slow HTTP/email work and design for replay. Do not
assume the full submission process is one database transaction.

## Security and correctness rules

- Treat Fluent Forms sanitization as input normalization, not authorization or
  business validation. Enforce ownership/capabilities in privileged custom flows.
- Public forms do not become authenticated because a WordPress nonce exists.
  In 6.2.7 submission nonce verification defaults off; rate limits, CAPTCHA,
  validation, and service-specific anti-abuse controls remain relevant.
- Keep `fluentform/submission_form_data` pure: current 6.2.7 applies it twice in
  `processSubmissionData()`. Never send mail, charge, or call an API from it.
- Preserve existing filter data. Do not replace another addon's fields or errors.
- Scope every callback by form ID and, where needed, element key or form type.
- Use namespaced slash hooks. Deprecated underscore aliases remain for
  compatibility but should not be used in new code.
- Do not treat `notify_on_form_submit` as “all processing completed”; it fires
  directly after the submission row insert and before entry-detail recording.

## Pro boundary

Normal completed submissions and the hooks above are Free-core behavior.
`fluentform_draft_submissions`, Save Progress, partial-entry administration, and
the `fluentform/partial_submission_*` hooks are Pro features in 6.2.7. A partial
draft is not a completed entry and must not trigger fulfillment, enrollment,
charging, or irreversible delivery.

Payment fields exist in the Free codebase, but gateway execution, order items,
transactions, recurring subscriptions, and several payment hooks depend on the
configured payment feature/addon. Do not infer successful payment from
`submission_inserted`; react to the appropriate verified payment-status hook.

## Cross-references

- Use `fluentform-custom-fields` for element-specific normalization/validation.
- Use `fluentform-entries-data` for response, detail-row, and meta semantics.
- Use `fluentform-feed-integration` for configurable asynchronous delivery.

## References

- Official submission lifecycle: <https://developers.fluentforms.com/submission-lifecycle/>
- Official submission actions: <https://developers.fluentforms.com/hooks/actions/submission/>
- Official submission filters: <https://developers.fluentforms.com/hooks/filters/submission/>
- Verified Free source paths:
  - `fluentform/app/Http/Controllers/SubmissionHandlerController.php`
  - `fluentform/app/Services/Form/SubmissionHandlerService.php`
  - `fluentform/app/Services/Form/FormValidationService.php`
  - `fluentform/app/Services/Submission/SubmissionService.php`
  - `fluentform/app/Hooks/Handlers/GlobalNotificationHandler.php`
- Verified Pro source paths:
  - `fluentformpro/src/classes/DraftSubmissionsManager.php`
  - `fluentformpro/src/classes/StepFormEntries.php`
