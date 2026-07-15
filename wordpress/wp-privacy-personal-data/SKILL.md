---
name: wp-privacy-personal-data
description: Implement or audit WordPress plugin privacy integration with
  privacy-policy suggestions, personal-data exporters, and personal-data
  erasers. Covers wp_add_privacy_policy_content,
  wp_privacy_personal_data_exporters, wp_privacy_personal_data_erasers,
  paged callback contracts, retained-data messages, idempotent erasure,
  re-identification closure, collection-time validity, custom tables/meta/remote
  systems, retention, and multisite scope. Use when
  a plugin stores email addresses, IPs, user identifiers, profiles, form
  submissions, logs, analytics, orders, messages, or other personal data.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "4.9.6 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-15"
---

# WordPress Personal Data Privacy Integration

Use WordPress' Privacy tools so an administrator can export and erase data
owned by a plugin from Tools > Export Personal Data and Tools > Erase Personal
Data. This is an engineering contract, not legal advice or a claim of GDPR
compliance.

## Start with a data inventory

Before writing callbacks, trace every personal-data store and transfer:

- options, user/post/term/comment meta, CPTs, attachments, custom tables;
- logs, queues, transients, caches, generated exports, and backups;
- data keyed by email, user ID, order/customer ID, IP, cookie ID, or token;
- remote providers and webhooks controlled by the plugin;
- retention reason, expiry, and whether deletion would break legal records.

Exporters and erasers must cover the same inventory. Do not assume deleting a
`WP_User` removes plugin tables, files, remote copies, or denormalized logs.

## Verify the collection boundary

Capture personal data only after the host workflow has established that the
submission or business event is valid. Early hooks such as
`rest_request_before_callbacks` and priority-zero `wp_ajax_nopriv_*` observers
run before the target plugin's permission callback or action callback, including
its callback-level nonce, spam, business validation, and success logic. The REST
filter runs after core authentication and registered argument validation, but it
can still persist data from requests the endpoint later rejects.

Prefer the integration's documented post-success hook and verify the exact
form/list/action plus consent/feature state. Sanitization does not turn a failed
submission into a valid collection event. Test invalid, spam, unauthorized, and
downstream-failure paths and assert that they create no durable profile data.

## Suggest privacy-policy text

Register factual, conditional text from `admin_init`. Describe what is
collected, why, retention, recipients, and user choices. Do not paste a legal
guarantee or silently edit the site's published policy.

```php
add_action( 'admin_init', static function (): void {
    wp_add_privacy_policy_content(
        __( 'My Plugin', 'myplugin' ),
        wp_kses_post(
            '<p class="privacy-policy-tutorial">' .
            __( 'Suggested text: describe the data this plugin actually stores and sends.', 'myplugin' ) .
            '</p>'
        )
    );
} );
```

Keep the suggestion synchronized with feature flags. If telemetry or a remote
integration is optional, say when it is active and what leaves the site.

## Register a personal-data exporter

The filter receives all exporters. Add a stable, plugin-prefixed key and return
the array. The callback accepts an email and a 1-based page number.

```php
add_filter( 'wp_privacy_personal_data_exporters', static function ( array $exporters ): array {
    $exporters['myplugin-submissions'] = array(
        'exporter_friendly_name' => __( 'My Plugin submissions', 'myplugin' ),
        'callback'               => 'myplugin_export_personal_data',
    );
    return $exporters;
} );

function myplugin_export_personal_data( string $email, int $page = 1 ): array {
    $per_page = 100;
    $page     = max( 1, $page );
    $rows     = MyPlugin_Submission_Repository::find_by_email(
        sanitize_email( $email ),
        $per_page,
        ( $page - 1 ) * $per_page
    );
    $data = array();

    foreach ( $rows as $row ) {
        $data[] = array(
            'group_id'          => 'myplugin-submissions',
            'group_label'       => __( 'Form submissions', 'myplugin' ),
            'group_description' => __( 'Submissions stored by My Plugin.', 'myplugin' ),
            'item_id'           => 'submission-' . (int) $row->id,
            'data'              => array(
                array( 'name' => __( 'Email', 'myplugin' ), 'value' => (string) $row->email ),
                array( 'name' => __( 'Message', 'myplugin' ), 'value' => (string) $row->message ),
                array( 'name' => __( 'Created', 'myplugin' ), 'value' => (string) $row->created_at_gmt ),
            ),
        );
    }

    return array(
        'data' => $data,
        'done' => count( $rows ) < $per_page,
    );
}
```

Rules:

- Page results deterministically with a stable primary-key order.
- Keep batches bounded; callbacks run through repeated admin AJAX requests.
- Export user-facing values, not raw rows, secrets, hashes, or internal ACLs.
- Use stable `group_id` and unique `item_id`; translate labels, not IDs.
- Include records found by email and by the matching user ID where relevant.
- Return exactly `array( 'data' => array, 'done' => bool )` or `WP_Error`.

## Register a personal-data eraser

```php
add_filter( 'wp_privacy_personal_data_erasers', static function ( array $erasers ): array {
    $erasers['myplugin-submissions'] = array(
        'eraser_friendly_name' => __( 'My Plugin submissions', 'myplugin' ),
        'callback'             => 'myplugin_erase_personal_data',
    );
    return $erasers;
} );

function myplugin_erase_personal_data( string $email, int $page = 1 ): array {
    $result = MyPlugin_Submission_Repository::anonymize_next_batch(
        sanitize_email( $email ),
        100
    );

    return array(
        'items_removed'  => $result->changed > 0,
        'items_retained' => $result->retained > 0,
        'messages'       => array_map( 'sanitize_text_field', $result->messages ),
        'done'           => ! $result->has_more,
    );
}
```

The eraser response must contain all four keys. `items_removed` also covers
successful anonymization. `items_retained` means personal data was found but
kept; explain why in `messages` without leaking the retained data itself.

## Erasure design rules

- Make erasure idempotent. Re-running it must be safe and converge.
- Prefer anonymization when a business/legal record must remain; sever user
  links and remove direct identifiers that are not required.
- Close every re-identification path, not only the main row. Delete or
  irreversibly detach crosswalk/profile rows keyed by user ID, email, cookie ID,
  session ID, device fingerprint, order/customer ID, captcha/consent token, or
  deterministic hash. An anonymized entity is still identifiable when a
  secondary table can attach the same browser/account again on its next visit.
- Derive erasure fields from the same versioned registry/schema used by every
  data-producing integration. A hand-written generic PII list easily misses
  namespaces such as `form_email` or provider-specific address fields.
- Do not use offset pagination over a result set whose matching rows disappear
  as they are erased: page 2 can skip records. Re-query the next first batch,
  or use a stable cursor/processed marker and calculate `has_more` explicitly.
- Do not report `done => true` while matching erasable rows remain.
- Clean object caches and secondary indexes after direct custom-table writes.
- If a remote processor fails, retain locally required retry state and return a
  clear message; never claim complete erasure when one controlled store failed.
- Never erase another user's data from an unverified public endpoint. Core's
  privacy request UI owns confirmation, capabilities, and nonces.

## Retention and lifecycle

Privacy erasure, uninstall, and routine retention are different operations:

- Erasure targets one confirmed data subject and may retain required records.
- Retention jobs remove expired data for everyone according to policy.
- Uninstall removes plugin-owned configuration/data only when the product's
  uninstall policy says so; it is not a substitute for subject erasure.

Do not keep personal data in autoloaded options or permanent transients. Give
temporary exports/logs an expiry and cleanup path. Backups are usually managed
outside plugin callbacks; document their retention instead of pretending the
plugin erased them synchronously.

## Multisite and tests

Decide whether data belongs to one site, network tables, or both. Core runs a
site's registered callbacks in that site's context; do not silently iterate an
entire network without network authorization and a documented contract.

Test at least:

1. no matching data;
2. one row and more than one full batch;
3. registered user plus guest records sharing the email;
4. retained and partially failed records;
5. repeated erasure calls;
6. multisite scope and deleted-user records;
7. export output for accidental secrets/internal fields;
8. every integration-specific PII namespace and every profile/crosswalk type;
9. failed/spam/unauthorized submissions create no durable data;
10. a post-erasure request with the old cookie/fingerprint cannot reattach the
    anonymized entity.

## Critical rules

- Inventory first; exporter and eraser coverage must match actual storage.
- Keep callbacks paged, deterministic, idempotent, and truthful about `done`.
- Erase the re-identification graph and integration-specific PII namespaces,
  not just direct fields on the primary entity.
- Do not equate user deletion, uninstall, or DB-row deletion with complete
  personal-data erasure.
- Do not expose passwords, auth tokens, secret meta, or unrelated users' data.
- Add privacy-policy suggestions for collection and third-party transfers.

## Cross-references

- Use **`wp-security-audit`** for request handlers and authorization.
- Use **`wp-settings-storage-audit`** for retention/autoload storage choices.
- Use **`wp-http-api-client`** when privacy data is sent to or erased from a
  remote provider.

## Core references

- `wp-admin/includes/plugin.php`: `wp_add_privacy_policy_content()`.
- `wp-admin/includes/ajax-actions.php`: exporter/eraser response validation.
- `wp-includes/comment.php`: core paged exporter and eraser examples.
- `wp-admin/includes/privacy-tools.php`: export/erasure processing pipeline.

## References

- Official documentation: <https://developer.wordpress.org/plugins/privacy/adding-the-personal-data-exporter-to-your-plugin/>
- Official documentation: <https://developer.wordpress.org/plugins/privacy/adding-the-personal-data-eraser-to-your-plugin/>
- Official documentation: <https://developer.wordpress.org/plugins/privacy/suggesting-text-for-the-site-privacy-policy/>
