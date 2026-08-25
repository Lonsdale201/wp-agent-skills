# Custom opt-in implementation contract

Read this reference when implementing the public transport and application
service. The examples target PHP 7.4, WordPress 7.1, and FluentCRM 3.1.13.

## Responsibility map

| Layer | Owns |
|---|---|
| Form/client | Accessible fields, affirmative consent UI, no trusted IDs/status. |
| WordPress endpoint | Shape validation, request bounds, abuse controls, generic response. |
| Application service | Field allowlist, list/tag mapping, status policy, idempotent CRM call. |
| FluentCRM | Contact persistence, pivots/hooks, DOI email, secure confirmation URL, status transition. |
| Application audit store | Consent wording/version, lawful basis when needed, submission correlation and retention. |

Do not let the browser cross these boundaries. Hidden fields are still
attacker-controlled.

## Transport-independent service pattern

Keep configured list/tag IDs in trusted server configuration. If the form offers
interests, map stable public slugs to those IDs before calling this service.

```php
<?php

final class Acme_FluentCRM_Optin_Service
{
    /**
     * @param array $input Sanitized transport data.
     * @param int[] $configuredListIds Existing FluentCRM list IDs.
     * @param int[] $configuredTagIds Existing FluentCRM tag IDs.
     * @return array|WP_Error
     */
    public function subscribe(array $input, array $configuredListIds, array $configuredTagIds)
    {
        if (!function_exists('FluentCrmApi')) {
            return new WP_Error('crm_unavailable', __('Subscription is temporarily unavailable.', 'acme'));
        }

        $email = sanitize_email((string) ($input['email'] ?? ''));
        if (!$email || !is_email($email) || empty($input['consent'])) {
            return new WP_Error('invalid_request', __('Please provide a valid email and consent.', 'acme'));
        }

        // These arrays came from server configuration, never from raw request IDs.
        $listIds = array_values(array_unique(array_filter(array_map('intval', $configuredListIds))));
        $tagIds  = array_values(array_unique(array_filter(array_map('intval', $configuredTagIds))));

        // Validate configured IDs during settings save and again here if settings
        // can become stale after a list/tag is deleted.
        $listIds = $this->existingIds('lists', $listIds);
        $tagIds  = $this->existingIds('tags', $tagIds);

        $api = FluentCrmApi('contacts');
        $existing = $api->getContact($email);
        $previousStatus = $existing ? (string) $existing->status : '';

        // Do not let a public form touch deliverability/complaint suppressions.
        if (in_array($previousStatus, ['bounced', 'complained', 'spammed'], true)) {
            return ['accepted' => true, 'mail_requested' => false];
        }

        $contactData = [
            'email'      => $email,
            'first_name' => sanitize_text_field((string) ($input['first_name'] ?? '')),
            'last_name'  => sanitize_text_field((string) ($input['last_name'] ?? '')),
            'status'     => 'pending',
            'lists'      => $listIds,
            'tags'       => $tagIds,
            'custom_values' => $this->allowedCustomValues($input),
        ];

        // Preserve the acquisition source of existing contacts.
        if (!$existing) {
            $contactData['source'] = 'acme-newsletter';
        }

        $contact = $api->createOrUpdate($contactData, false, false);

        if (!$contact) {
            return new WP_Error('crm_write_failed', __('Subscription is temporarily unavailable.', 'acme'));
        }

        // Non-forced createOrUpdate correctly preserves unsubscribed. The user's
        // affirmative submission starts re-consent, but confirmation still owns
        // the transition to subscribed.
        if ($previousStatus === 'unsubscribed' && $contact->status === 'unsubscribed') {
            $contact = $contact->updateStatus('pending');
        }

        $mailRequested = false;
        if ($contact->status === 'pending') {
            // Scope the later confirmation hook to this integration. Store only
            // bounded workflow state here; keep full consent evidence in the
            // application's audit store.
            fluentcrm_update_subscriber_meta(
                (int) $contact->id,
                '_acme_pending_newsletter_optin',
                time()
            );
            $mailRequested = (bool) $contact->sendDoubleOptinEmail();
        }

        return [
            'accepted'       => true,
            'mail_requested' => $mailRequested,
            // Keep contact ID/status server-side; do not return them publicly.
        ];
    }

    private function existingIds($apiKey, array $ids)
    {
        if (!$ids) {
            return [];
        }

        $rows = FluentCrmApi($apiKey)->getInstance()
            ->whereIn('id', $ids)
            ->get(['id']);

        return array_values(array_map('intval', $rows->pluck('id')->toArray()));
    }

    private function allowedCustomValues(array $input)
    {
        $values = [];

        if (isset($input['locale'])) {
            $values['preferred_locale'] = sanitize_key((string) $input['locale']);
        }

        return $values;
    }
}
```

If the product's policy permits bounced/complained/spammed re-entry, implement a
separate privileged remediation operation. Do not silently broaden the public
service by passing `$forceUpdate = true`.

## Public REST route pattern

The route is anonymous by design. Keep its authority narrow: it may only request
a newsletter opt-in with server-selected mappings.

```php
add_action('rest_api_init', static function (): void {
    register_rest_route('acme/v1', '/newsletter/subscribe', [
        'methods'             => WP_REST_Server::CREATABLE,
        'permission_callback' => '__return_true',
        'args' => [
            'email' => [
                'required'          => true,
                'sanitize_callback' => 'sanitize_email',
                'validate_callback' => static function ($value): bool {
                    return is_string($value) && (bool) is_email($value);
                },
            ],
            'first_name' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'last_name' => [
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'consent' => [
                'required'          => true,
                'sanitize_callback' => 'rest_sanitize_boolean',
                'validate_callback' => static function ($value): bool {
                    return rest_sanitize_boolean($value) === true;
                },
            ],
        ],
        'callback' => static function (WP_REST_Request $request) {
            $email = (string) $request->get_param('email');

            // Implement a bounded store backed by a persistent cache or DB.
            // Hash personal data in rate-limit keys; do not use raw email/IP.
            if (acme_optin_rate_limited($email, $_SERVER['REMOTE_ADDR'] ?? '')) {
                return new WP_REST_Response([
                    'message' => __('If eligible, check your inbox for the next step.', 'acme'),
                ], 202);
            }

            $result = (new Acme_FluentCRM_Optin_Service())->subscribe(
                $request->get_params(),
                acme_optin_list_ids(),
                acme_optin_tag_ids()
            );

            if (is_wp_error($result)) {
                // Log only a bounded error code/correlation ID. Keep the public
                // response generic so it cannot enumerate contacts or config.
                acme_log_optin_error($result->get_error_code());
            }

            return new WP_REST_Response([
                'message' => __('If eligible, check your inbox for the next step.', 'acme'),
            ], 202);
        },
    ]);
});
```

`__return_true` is acceptable here because anyone may request this single,
bounded operation. It would not be acceptable on contact lookup, list browsing,
status mutation, arbitrary tagging, resend-by-contact-ID, or administrative
routes.

Do not rely on `X-WP-Nonce` for anonymous abuse prevention. Add application rate
limits before the CRM write, and use a honeypot/CAPTCHA or edge protection when
the site's threat model requires it.

## Confirmation-only work

Use the core hook for state that must never exist on a merely pending contact:

```php
add_action(
    'fluent_crm/subscriber_confirmed_via_double_optin',
    static function ($contact): void {
        $requestedAt = (int) fluentcrm_get_subscriber_meta(
            (int) $contact->id,
            '_acme_pending_newsletter_optin'
        );

        if (!$requestedAt) {
            return;
        }

        fluentcrm_delete_subscriber_meta(
            (int) $contact->id,
            '_acme_pending_newsletter_optin'
        );
        $contact->attachTags([ACME_VERIFIED_NEWSLETTER_TAG_ID]);
        do_action('acme/newsletter_verified', (int) $contact->id);
    },
    10,
    1
);
```

Make the callback idempotent even though FluentCRM emits this hook only on the
actual confirmation transition. Other integrations or maintenance tools may
invoke your downstream event independently. Expire abandoned markers according
to the application's retention policy; do not let per-contact workflow meta grow
without cleanup.

## List-specific settings trap

`Handler::sendDoubleOptInEmail()` calls
`Helper::latestListIdOfSubscriber($contactId)`. That query selects one pivot row
with `created_at DESC, id DESC`. Consequences:

- one contact can have many lists but only one list-specific DOI config wins;
- newly inserted lists with equal timestamps are resolved by the largest pivot
  ID, normally the last successful insert;
- attaching an existing relationship uses `INSERT IGNORE`, so its timestamp and
  precedence do not change;
- global settings are used when the winning list is configured to use global DOI
  or has no usable list-specific settings.

Do not detach and reattach a list merely to force precedence: that fires removal
and addition hooks and can alter automations. Prefer a clear single-list form,
global DOI settings, or an explicitly designed filter-based customization.

## Smoke-test matrix

Intercept email with `fluent_crm/is_simulated_mail`; never send test mail to a
real address.

1. New address: pending, configured list/tag attached, exactly one DOI render.
2. Immediate duplicate: still pending, no duplicate pivot, resend returns false.
3. Confirmation URL: HTTP success and persisted status becomes subscribed.
4. Replayed confirmation: remains subscribed and confirmation-only work is not
   duplicated.
5. Existing subscribed: never demoted to pending.
6. Existing transactional: enters pending only after explicit marketing consent.
7. Existing unsubscribed: re-enters pending, never directly subscribed.
8. Bounced/complained/spammed: remains suppressed under the default policy.
9. Deleted/config-stale list/tag: no orphan or attacker-selected association.
10. Missing consent, invalid email, oversized payload, honeypot, and rate limit:
    no CRM mutation or mail request.
11. Missing activation link or invalid DOI configuration: private diagnostic,
    same generic public response.

Clean up the test contact and its list/tag definitions after the run.
