---
name: fluentcrm-custom-optin-forms
description: >-
  Builds and audits public custom subscription forms that create or update
  FluentCRM contacts and carry them through double opt-in. Covers explicit
  consent, server-owned list/tag mapping, pending and suppressed status policy,
  createOrUpdate, sendDoubleOptinEmail, list-specific confirmation settings,
  generic responses, abuse controls, confirmation hooks, and verified-only
  automations. Use when implementing a newsletter, lead-magnet, registration,
  checkout, headless, REST, or AJAX signup flow that references FluentCrmApi,
  pending, double opt-in, subscriber_confirmed_via_double_optin, lists, or tags.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-crm"
  wp-skills-plugin-version-tested: "3.1.13"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-25"
---

# FluentCRM custom subscription and double opt-in forms

Use this skill for a public form or API that owns its user interface but stores
contacts in FluentCRM. Keep the transport, consent policy, CRM mutation, email
request, and confirmation side effects separate.

Read [implementation-contract.md](references/implementation-contract.md) before
writing the endpoint or changing an existing contact's status.

## Core contract

`FluentCrmApi('contacts')->createOrUpdate()` does not send a double opt-in email.
The canonical core flow is:

```php
$contact = FluentCrmApi('contacts')->createOrUpdate([
    'email'  => sanitize_email($email),
    'status' => 'pending',
    'source' => 'my-plugin',
    'lists'  => $serverOwnedListIds,
    'tags'   => $serverOwnedTagIds,
], false, false);

if ($contact && $contact->status === 'pending') {
    $contact->sendDoubleOptinEmail();
}
```

FluentCRM then builds its tokenized confirmation URL, handles the public
confirmation request, changes `pending` to `subscribed`, resumes applicable
funnels, records a system note, and fires
`fluent_crm/subscriber_confirmed_via_double_optin`. Do not create a second token,
confirmation table, or confirmation route around this lifecycle.

Double opt-in, global/list-specific email settings, and the confirmation hook
are Free-core features. Site code and add-ons may filter post-confirmation
routing, but a custom signup integration must not require Pro for the base flow.

## Workflow

1. Require a clear affirmative consent value. Store the exact consent text or
   policy version and submission timestamp in the application's audit store when
   that evidence matters; FluentCRM does not preserve the original form wording.
2. Validate and normalize the email, then sanitize only explicitly mapped name
   and custom fields. Never accept `status`, `user_id`, `source`, list IDs, tag
   IDs, or detach operations directly from the public payload.
3. Resolve public choices through a server-owned map and verify every resulting
   list/tag exists. Passing strings to FluentCRM's attach helpers can create new
   lists/tags; numeric IDs are not an authorization boundary.
4. Inspect the existing contact before writing and apply the status matrix below.
5. Call `createOrUpdate()` with `$forceUpdate = false`. Attach the DOI-driving
   list before sending so list-specific settings can be selected.
6. Call `sendDoubleOptinEmail()` only when the resulting status is `pending`.
7. Return the same generic accepted response for existing, new, suppressed, and
   throttled addresses. Log bounded operational failures privately.
8. Put verified-only tags or downstream work on the confirmation hook, not on
   the initial form request.

## Existing-contact status matrix

| Existing status | Public opt-in behavior |
|---|---|
| none | Create as `pending`; send confirmation. |
| `pending` | Update safe fields/mappings; request a resend. Core suppresses successful resends for 150 seconds. |
| `subscribed` | Keep subscribed; update permitted mappings; do not demote or resend by default. |
| `transactional` | Explicit marketing consent may move it to `pending`; confirmation promotes it to subscribed. |
| `unsubscribed` | Only an explicit re-consent flow may call `updateStatus('pending')`, then send confirmation. Never force it directly to subscribed. |
| `bounced`, `complained`, `spammed` | Keep suppressed in a normal public form. Require a deliberate administrative/remediation policy before re-entry. |

The default non-forced `createOrUpdate()` protects subscribed and strict-status
contacts. Do not pass `true` for `$forceUpdate` merely to make a public form
"work"; that lets anyone resubscribe a suppressed address without proving
mailbox control.

## Lists, tags, and list-specific DOI

Attach source/interest lists and tags before email only when they are valid for a
pending contact. Their attach hooks fire immediately; they do not wait for
confirmation. If a tag means "verified subscriber", attach it here instead:

```php
add_action(
    'fluent_crm/subscriber_confirmed_via_double_optin',
    static function ($contact): void {
        $marker = fluentcrm_get_subscriber_meta(
            (int) $contact->id,
            '_my_plugin_pending_optin'
        );
        if (!$marker) {
            return;
        }

        fluentcrm_delete_subscriber_meta(
            (int) $contact->id,
            '_my_plugin_pending_optin'
        );
        $contact->attachTags([MY_PLUGIN_VERIFIED_TAG_ID]);
    },
    10,
    1
);
```

In 3.1.13, the double opt-in sender uses the contact's latest list pivot row,
ordered by `created_at DESC, id DESC`, to select list-specific settings. An
already-attached list is a no-op and does not become latest again. Therefore:

- prefer one explicit DOI-driving list per form;
- do not assume arbitrary request order selects the template;
- test existing multi-list contacts when a specific template/redirect matters;
- fall back to global DOI settings when list precedence would be ambiguous.

The email configuration must contain a confirmation activation link. Use
`#activate_link#` or FluentCRM's supported activation-button SmartCode; never
construct the secure URL yourself.

## Public endpoint security

An anonymous newsletter endpoint is intentionally public. A REST
`permission_callback` returning true can be correct for that narrow route, but it
does not make the handler safe. Enforce all of these inside the flow:

- required affirmative consent and strict field allowlists;
- server-owned list/tag/source/status mapping;
- per-IP and per-normalized-email throttling before creating contacts;
- bounded request size, field lengths, and work per request;
- honeypot, minimum-fill-time, CAPTCHA, or equivalent protection when abuse risk
  warrants it;
- generic responses that do not reveal whether an address already exists;
- no raw payloads, consent text, email addresses, or tokens in public errors;
- HTTPS and normal WordPress output escaping.

A WordPress REST nonce does not authenticate a logged-out visitor and is not a
replacement for abuse controls. Core's 150-second resend guard is per existing
contact after a successful send; it does not stop an attacker submitting many
new addresses.

## Send and confirmation semantics

Treat `sendDoubleOptinEmail() === false` as "not sent now", not as a failed
contact write. It can mean wrong status, the resend window, or invalid DOI email
configuration. A true return means the send path was invoked, not that remote
delivery or human intent was proven.

Scope confirmation callbacks with a plugin-owned marker (subscriber meta or the
application audit store); otherwise your callback also processes confirmations
started by unrelated forms/integrations. The confirmation hook fires only for the real `pending` to `subscribed`
transition. Replaying a link for an already subscribed contact does not fire it
again. Stale links cannot revive contacts currently in another suppressed
status. A clicked email link demonstrates link access, but automated mail
scanners can follow GET links; do not treat DOI as strong identity verification
for high-risk account actions.

## Audit checklist

- Confirm `createOrUpdate()` and `sendDoubleOptinEmail()` are separate calls.
- Confirm list/tag IDs never come directly from request data.
- Confirm `forceUpdate = true` is absent from anonymous paths.
- Test every status in the matrix, duplicate requests, and concurrent submits.
- Test missing/malformed DOI settings and a template without an activation link.
- Confirm pending contacts receive no marketing campaign email.
- Confirm pre-verification list/tag hooks cannot trigger unsafe side effects.
- Confirm the success response does not enumerate contacts.
- Confirm application throttling covers both existing and new addresses.
- Confirm confirmation and repeated/stale links produce the intended state.

## Cross-references

- Use `fluentcrm-contact-models` for the underlying contact/list/tag API.
- Use `wp-rest-api` when the form is transported through a custom REST route.
- Use `fluentcrm-funnel-trigger` when confirmation must start a custom automation.

## References

- Official Contact PHP API: <https://docs.fluentcrm.com/contact-php-api>
- Official double opt-in settings: <https://docs.fluentcrm.com/global-double-opt-in-settings>
- Official contact statuses: <https://docs.fluentcrm.com/fluentcrm-contacts-status>
- Verified source paths:
  - `fluent-crm/app/Api/Classes/Contacts.php`
  - `fluent-crm/app/Models/Subscriber.php`
  - `fluent-crm/app/Services/Libs/Mailer/Handler.php`
  - `fluent-crm/app/Hooks/Handlers/ExternalPages.php`
  - `fluent-crm/app/Services/ExternalIntegrations/FluentForm/Bootstrap.php`
  - `fluent-crm/app/Services/Helper.php`
