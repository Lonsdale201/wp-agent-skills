---
name: fluentcrm-event-tracking
description: Track and consume FluentCRM 3.x contact events from companion plugins. Covers the experimental event_tracking flag, FluentCrmApi('event_tracker')->track(), fc_event_tracking, repeatable counter semantics, subscriber resolution by subscriber/email/user/current contact, fluent_crm/event_tracked, the fluent_crm/track_event_activity action bridge, event_tracking advanced contact filters, event_tracking_keys option source, and FluentCampaign Pro's Tracking Event Recorded trigger / Add Event Tracking action. Use when a plugin records user activity, builds event-based automations, filters contacts by tracked events, or audits code touching EventTracker, Tracker, fluent_crm/event_tracked, or fc_event_tracking.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "FluentCRM 3.1.8 + FluentCRM Pro 3.1.8"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://developers.fluentcrm.com/database/orm/
source-refs:
  - wp-content/plugins/fluent-crm/app/Api/config.php
  - wp-content/plugins/fluent-crm/app/Api/Classes/Tracker.php
  - wp-content/plugins/fluent-crm/app/Models/EventTracker.php
  - wp-content/plugins/fluent-crm/app/Models/Subscriber.php
  - wp-content/plugins/fluent-crm/app/Hooks/Handlers/EventTrackingHandler.php
  - wp-content/plugins/fluent-crm/app/Hooks/Handlers/Integrations.php
  - wp-content/plugins/fluent-crm/app/Services/Helper.php
  - wp-content/plugins/fluent-crm/database/migrations/SubscriberEventTracking.php
  - wp-content/plugins/fluentcampaign-pro/app/Services/Funnel/Triggers/TrackingEventRecordedTrigger.php
  - wp-content/plugins/fluentcampaign-pro/app/Services/Funnel/Actions/AddEventTrackerAction.php
  - wp-content/plugins/fluentcampaign-pro/app/Services/Funnel/Conditions/FunnelConditionHelper.php
---

# FluentCRM: event tracking

Use this skill when a plugin wants to record product usage, LMS actions, purchase milestones, profile events, or any other contact activity into FluentCRM's event timeline and Pro automation conditions.

## Guard the feature

Event tracking is core FluentCRM code, but it is disabled by default behind the experimental setting:

```php
use FluentCrm\App\Services\Helper;

if (!function_exists('FluentCrmApi') || !Helper::isExperimentalEnabled('event_tracking')) {
    return;
}
```

`FluentCrmApi('event_tracker')->track()` returns `WP_Error('not_enabled', ...)` when the flag is off. Always handle `WP_Error`.

## Track an event

The API key is `event_tracker`:

```php
$event = FluentCrmApi('event_tracker')->track([
    'subscriber_id' => (int) $contactId,       // preferred when known
    'provider'      => 'my-plugin',
    'event_key'     => 'course_completed',
    'title'         => 'Course completed',
    'value'         => (string) $courseId,
], true);

if (is_wp_error($event)) {
    return;
}
```

Subscriber resolution order in `Tracker::track()`:

- `subscriber` object, when supplied
- `subscriber_id`
- `email`
- `user_id` converted to the WP user's email
- current contact cookie / current user through `fluentcrm_get_current_contact()`

Required fields are `event_key` and `title`. Both are truncated to 192 characters and sanitized. `provider` defaults to `custom`; `value` is sanitized as textarea text.

## Repeatable vs append-only

Second argument controls storage behavior:

```php
FluentCrmApi('event_tracker')->track($data, true);  // repeatable/default
FluentCrmApi('event_tracker')->track($data, false); // append a new row every time
```

With `$repeatable = true`, FluentCRM looks up an existing row by `(subscriber_id, event_key, title)`, updates `value`, increments `counter`, saves, and fires `fluent_crm/event_tracked`.

With `$repeatable = false`, it creates a new `fc_event_tracking` row every time and fires the same action.

There is no unique DB key for the repeatable lookup in 3.1.8; the counter is application-level, not an atomic financial counter. Use it for automation/activity state, not exact billing/accounting.

## Action bridge

`EventTrackingHandler` also registers:

```php
do_action('fluent_crm/track_event_activity', $data, $repeatable);
```

That delegates to `FluentCrmApi('event_tracker')->track()`, but `do_action()` discards the return value. Use the API method directly when you need the created `EventTracker` or `WP_Error`.

## Event hook

Every successful track fires:

```php
add_action('fluent_crm/event_tracked', function ($event, $subscriber) {
    // $event is FluentCrm\App\Models\EventTracker
    // $subscriber is FluentCrm\App\Models\Subscriber
}, 10, 2);
```

FluentCampaign Pro's "Tracking Event Recorded" trigger listens to this exact hook with `actionArgNum = 2`.

## Pro automation trigger and action

Pro trigger: `FluentCampaign\App\Services\Funnel\Triggers\TrackingEventRecordedTrigger`

- `triggerName = fluent_crm/event_tracked`
- requires event tracking to be enabled
- only runs for contacts with `status = subscribed`
- checks configured `event_key`
- checks `minimum_event_count` against `EventTracker.counter`
- supports Pro condition groups through `fluent_crm/event_tracking_condition_groups`
- uses `source_trigger_name = fluent_crm/event_tracked` and `source_ref_id = $event->id`

Pro action: `FluentCampaign\App\Services\Funnel\Actions\AddEventTrackerAction`

- action name `add_contact_event_tracker`
- parses SmartCodes in title/value with `fluent_crm/parse_campaign_email_text`
- calls `FluentCrmApi('event_tracker')->track($eventAtts, is_unique === yes)`

If you build a custom trigger/action around event tracking, still follow `fluentcrm-funnel-trigger` and `fluentcrm-funnel-action` for lifecycle and status rules.

## Contact filters and option source

`EventTrackingHandler` registers the advanced contact filter provider:

```php
fluentcrm_contacts_filter_event_tracking
```

Supported filter properties in 3.1.8:

- `event_tracking_key`
- `event_tracking_title`
- `event_tracking_value`
- `event_tracking_key_count`

The built-in option key for selectors is `event_tracking_keys`. It returns unique `event_key` values from `fc_event_tracking` as `[{id, title}]`.

Do not register your own `fluentcrm_ajax_options_event_tracking_keys` filter unless you intentionally override/extend the built-in source. The core handler registers it with one accepted argument, while custom option filters usually use the 3-argument pattern described in `fluentcrm-rest-options`.

## Privacy and safety

Event values are visible in the contact timeline widget and can feed automation conditions. Do not store access tokens, personal secrets, raw request bodies, or unbounded JSON blobs in `value`.

Good event shape:

```php
[
    'provider'  => 'lw-lms',
    'event_key' => 'lesson_completed',
    'title'     => 'Lesson completed',
    'value'     => (string) $lessonId,
]
```

Bad event shape:

```php
[
    'event_key' => 'webhook_payload',
    'title'     => 'Webhook payload',
    'value'     => wp_json_encode($_POST), // too large, may contain secrets
]
```

## Common mistakes

- Ignoring the experimental flag and treating `WP_Error('not_enabled')` as a model.
- Passing a WP user ID as `subscriber_id`. Use `user_id` for WP users, or resolve the FluentCRM contact first.
- Assuming repeatable tracking is DB-unique or atomic. It is a lookup/update convenience.
- Using a different hook for Pro automation. The trigger listens to `fluent_crm/event_tracked`, not `fluentcrm_event_tracked`.
- Storing translated labels as `event_key`. Keep `event_key` stable ASCII-like machine keys; put human text in `title`.

## Cross-references

- Use `fluentcrm-funnel-trigger` for custom event-driven automation triggers.
- Use `fluentcrm-funnel-action` for custom automation actions that write tracked events.
- Use `fluentcrm-smartcodes-segments` when event values appear in SmartCodes or Pro dynamic segments.
