---
name: fluentcrm-contact-models
description: Work with FluentCRM 3.x contact data through the public PHP API and ORM models. Covers Subscriber, Lists, Tag, User, ContactsQuery, createOrUpdate, list/tag attach and detach, custom fields, WP user linking, status protection, and contact hooks. Use when a plugin must create or update a contact, map a WP user, read or create lists/tags, apply tags/lists, query contacts or segments, or handle statuses such as subscribed, pending, transactional, unsubscribed, bounced, complained, and spammed. Triggers on FluentCrmApi('contacts'), Subscriber, Lists, Tag, User, ContactsQuery, attachLists, attachTags, updateStatus, fluent_crm/contact_.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-crm"
  wp-skills-plugin-version-tested: "FluentCRM 3.1.8"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-09"
---

# FluentCRM: contact, list, tag, and user models

Use this skill for companion plugins that need to write or query FluentCRM contacts. Prefer `FluentCrmApi()` wrappers for writes, and use the ORM models for reads, reports, migrations, and carefully scoped queries.

Verification note: this skill is based on FluentCRM core 3.1.8 source. The contact/list/tag/user APIs covered here are core APIs and do not require FluentCampaign Pro.

## When to use this skill

- Creating or updating contacts from a third-party plugin, webhook, form, order, LMS event, or user registration.
- Adding or removing FluentCRM lists/tags from a contact.
- Querying contacts by list, tag, status, SMS status, company, search, custom field, or advanced filter provider.
- Mapping a WordPress user to a FluentCRM contact.
- Reviewing code that touches `Subscriber::create()`, `Subscriber::updateOrCreate()`, `attachLists()`, `attachTags()`, `fluentcrm_subscriber_statuses()`, or `ContactsQuery`.

## API entry points

Guard companion plugin code and run after FluentCRM has loaded:

```php
if (!function_exists('FluentCrmApi')) {
    return;
}

$contactApi = FluentCrmApi('contacts');
$listApi    = FluentCrmApi('lists');
$tagApi     = FluentCrmApi('tags');
```

`app/Api/config.php` registers these keys: `contacts`, `tags`, `lists`, `extender`, `companies`, and `event_tracker`.

Prefer:

```php
$contact = FluentCrmApi('contacts')->createOrUpdate([
    'email'         => sanitize_email($email),
    'first_name'    => sanitize_text_field($firstName),
    'last_name'     => sanitize_text_field($lastName),
    'user_id'       => (int) $userId,
    'status'        => 'subscribed',
    'source'        => 'my-plugin',
    'lists'         => [3],
    'tags'          => [12],
    'custom_values' => [
        'plan' => sanitize_text_field($plan),
    ],
], false, false);
```

Do not create contacts with raw `$wpdb` inserts. Direct `Subscriber::create()` skips several integration-level behaviors. `FluentCrmApi('contacts')->createOrUpdate()` delegates to `Subscriber::updateOrCreate()`, syncs lists/tags/custom fields, links a WP user by email when possible, and fires the contact lifecycle hooks.

## Contact lookup

Use the API wrapper for common lookup:

```php
$contact = FluentCrmApi('contacts')->getContact($idOrEmail);
$contact = FluentCrmApi('contacts')->getContactByUserRef($userIdOrEmail);
$contact = FluentCrmApi('contacts')->getCurrentContact();
```

`getContactByUserRef($userId)` first checks `user_id`, then falls back to the WP user's email and saves the `user_id` on the contact if found. `Subscriber::getWpUser()` performs the inverse lookup and also removes duplicate `user_id` links from other contacts.

## Status rules

Use `fluentcrm_subscriber_statuses()` for the current status list. In FluentCRM 3.1.8 the local source returns:

```php
[
    'subscribed',
    'pending',
    'unsubscribed',
    'transactional',
    'bounced',
    'complained',
    'spammed',
]
```

`fluentcrm_subscriber_editable_statuses()` excludes `bounced`, `complained`, and `spammed`. `fluentcrm_strict_statues()` returns `unsubscribed`, `bounced`, `complained`, and `spammed`.

Important write behavior:

- Without `$forceUpdate`, an existing `subscribed` contact is not downgraded by incoming `status`.
- Existing `bounced`, `complained`, and `spammed` contacts keep their status unless forced.
- Incoming `unsubscribed` is always respected.
- Use `$contact->updateStatus($status)` for an explicit status change; it fires `fluent_crm/subscriber_status_changed` and the legacy `fluentcrm_subscriber_status_to_{status}` hook.

## Custom fields

Pass custom fields under `custom_values`:

```php
FluentCrmApi('contacts')->createOrUpdate([
    'email'         => $email,
    'custom_values' => [
        'customer_tier' => 'gold',
        'renewal_date'  => '2026-12-31',
    ],
], false, false);
```

The third `createOrUpdate()` argument maps to `syncCustomFieldValues($values, $deleteOtherValues)`. Keep it `false` for incremental updates. Passing `true` allows empty submitted values to delete existing custom field meta.

## Lists and tags

Create or update list/tag definitions through the API wrappers:

```php
$lists = FluentCrmApi('lists')->importBulk([
    [
        'title'       => 'Customers',
        'slug'        => 'customers',
        'description' => 'Imported from My Plugin',
    ],
]);

$tags = FluentCrmApi('tags')->importBulk([
    [
        'title' => 'VIP',
        'slug'  => 'vip',
    ],
]);
```

`importBulk()` sanitizes title/slug/description, upserts by slug, and fires both legacy and current hooks:

- Lists: `fluentcrm_list_created`, `fluent_crm/list_created`, `fluentcrm_list_updated`, `fluent_crm/list_updated`
- Tags: `fluentcrm_tag_created`, `fluent_crm/tag_created`, `fluentcrm_tag_updated`, `fluent_crm/tag_updated`

Apply or remove lists/tags on a saved contact:

```php
$contact->attachLists([3, 4]);
$contact->attachTags([12]);

$contact->detachLists([4]);
$contact->detachTags([12]);
```

In 3.1.8 `attachLists()` and `attachTags()` return early for unsaved subscribers, sanitize IDs, use per-row `INSERT IGNORE`, refresh the relation, and only fire added hooks for IDs that were actually new. `detachLists()` and `detachTags()` read fresh pivot state and only fire removed hooks for rows actually deleted. `attachCompanies()` / `detachCompanies()` follow the same pivot-table pattern for the experimental Companies module, but their current hooks are legacy helper functions only; use `fluentcrm-companies-model` for company-specific APIs and hooks.

Current attach/detach hooks:

- `fluent_crm/contact_added_to_lists`
- `fluent_crm/contact_added_to_tags`
- `fluent_crm/contact_removed_from_lists`
- `fluent_crm/contact_removed_from_tags`

The callback receives `($subscriber, $ids)` for current hooks. Legacy helper hooks still exist and pass the ID list first.

## Query contacts

Use `ContactsQuery` through the API for segment-like reads:

```php
$contacts = FluentCrmApi('contacts')->query([
    'with'          => ['tags', 'lists'],
    'search'        => 'john',
    'tags'          => [12],
    'lists'         => [3],
    'statuses'      => ['subscribed', 'transactional'],
    'sms_statuses'  => ['sms_subscribed'],
    'custom_fields' => true,
    'sort_by'       => 'created_at',
    'sort_type'     => 'DESC',
    'limit'         => 100,
])->get();
```

`ContactsQuery` allowlists sort columns before `orderBy()`. Do not pass unsanitized request values directly to ORM `orderBy()` in custom controllers.

For advanced filters, pass `filter_type => 'advanced'` and `filters_groups_raw`; FluentCRM formats groups and dispatches `do_action_ref_array('fluentcrm_contacts_filter_' . $providerName, [&$q, $items])`. Your custom advanced-filter provider must mutate the query by reference.

## Model notes

- `Subscriber` table: `fc_subscribers`; primary contact model; appended `full_name` and `photo`.
- `Subscriber.company_id` is the primary company pointer when the Companies module is enabled. Many-to-many company membership still lives in `fc_subscriber_pivot` with `object_type = FluentCrm\App\Models\Company`.
- `Lists` table: `fc_lists`; relation `subscribers()`, helpers `totalCount()` and `countByStatus()`.
- `Tag` table: `fc_tags`; relation `subscribers()`, helpers `totalCount()` and `countByStatus()`.
- `User` model maps the WordPress `users` table with primary key `ID`, hides `user_pass` and `user_activation_key`, and appends a contact-aware `photo`.

## Hooks to preserve

When replacing direct writes, ensure these still fire where relevant:

- `fluent_crm/contact_created`
- `fluent_crm/contact_updated`
- `fluent_crm/contact_email_changed`
- `fluent_crm/subscriber_status_changed`
- `fluent_crm/contact_custom_data_updated`

## What this skill does not cover

- Automation trigger/action/benchmark registration. Use `fluentcrm-funnel-trigger`, `fluentcrm-funnel-action`, or `fluentcrm-funnel-benchmark`.
- Email sequence enrollment and funnel subscriber state. Use `fluentcrm-automation-sequence-models`.
- Smart codes and dynamic segments. Use `fluentcrm-smartcodes-segments`.
- Companies / account records. Use `fluentcrm-companies-model`.
- Event tracking. Use `fluentcrm-event-tracking`.

## References

- FluentCRM docs: Subscriber, Lists, Tag, User, and Fluent ORM pages.
- Local source: `app/Api/Classes/Contacts.php`, `app/Models/Subscriber.php`, `app/Services/ContactsQuery.php`, `app/Functions/helpers.php`.
- Official documentation: <https://developers.fluentcrm.com/database/models/subscriber>
- Official documentation: <https://developers.fluentcrm.com/database/models/lists>
- Official documentation: <https://developers.fluentcrm.com/database/models/tag>
- Official documentation: <https://developers.fluentcrm.com/database/models/user>
- Official documentation: <https://developers.fluentcrm.com/database/orm/>
- Verified source paths:
  - `wp-content/plugins/fluent-crm/app/Api/config.php`
  - `wp-content/plugins/fluent-crm/app/Api/Classes/Lists.php`
  - `wp-content/plugins/fluent-crm/app/Api/Classes/Tags.php`
  - `wp-content/plugins/fluent-crm/app/Models/Lists.php`
  - `wp-content/plugins/fluent-crm/app/Models/Tag.php`
  - `wp-content/plugins/fluent-crm/app/Models/User.php`
