---
name: fluentcrm-automation-sequence-models
description: Work with FluentCRM 3.x automation subscriber state and FluentCampaign Pro email sequences. Covers FunnelSubscriber, FunnelSequence, FunnelProcessor, FunnelHelper, FunnelMetric, Pro Sequence, SequenceMail, and SequenceTracker. Use when enrolling a contact into an automation funnel, resuming from a benchmark, reading funnel progress, subscribing or unsubscribing contacts from Pro email sequences, or avoiding confusion between automation steps and email sequences. Triggers on FunnelSubscriber, FunnelSequence, startFunnelSequence, startFunnelFromSequencePoint, Sequence::subscribe, SequenceTracker, fc_funnel_subscribers, fc_sequence_tracker.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-crm"
  wp-skills-plugin-version-tested: "FluentCRM 3.1.8 + FluentCRM Pro 3.1.8"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-09"
---

# FluentCRM: automation and email sequence models

Use this skill when code needs to start or inspect FluentCRM automations, or enroll contacts into FluentCampaign Pro email sequences. Keep these two systems separate: `FunnelSequence` is an automation step; `FluentCampaign\App\Models\Sequence` is a Pro email sequence stored in `fc_campaigns`.

Verification note: local source was FluentCRM core 3.1.8 and FluentCampaign Pro 3.1.8. Core 3.1.8 declares `FLUENTCRM_MIN_PRO_VERSION` as 3.1.8.

## When to use this skill

- Starting an automation funnel for a known contact or event.
- Resuming a funnel from a benchmark sequence point.
- Reading `fc_funnel_subscribers` progress, statuses, next sequence, or source metadata.
- Enrolling or removing contacts from a Pro email sequence.
- Reviewing code that writes directly to `fc_funnel_subscribers`, `fc_funnel_sequences`, or `fc_sequence_tracker`.

## Automation data model

`FluentCrm\App\Models\FunnelSubscriber` maps `fc_funnel_subscribers` and tracks one contact inside one automation funnel.

Core fillable fields:

```php
[
    'funnel_id',
    'subscriber_id',
    'status',
    'type',
    'next_sequence',
    'next_sequence_id',
    'last_sequence_id',
    'last_sequence_status',
    'last_executed_time',
    'next_execution_time',
    'starting_sequence_id',
    'source_trigger_name',
    'source_ref_id',
    'notes',
]
```

Common main statuses are `draft`, `pending`, `active`, `waiting`, `completed`, `cancelled`, and `skipped`. `active()` only scopes to `status = active`. Do not confuse the main `status` with `last_sequence_status`; `FunnelHelper::changeFunnelSubSequenceStatus()` writes `last_sequence_status = complete` when a normal step is processed. The benchmark direct-entry path can seed `last_sequence_status = completed` while creating a synthetic starting row; don't treat that as a value to write from action handlers.

Relations:

- `funnel()` -> `FluentCrm\App\Models\Funnel`
- `subscriber()` -> `FluentCrm\App\Models\Subscriber`
- `next_sequence_item()` -> `FunnelSequence`
- `last_sequence()` -> `FunnelSequence`
- `metrics()` -> `FunnelMetric` rows for the same contact

`FluentCrm\App\Models\FunnelSequence` maps `fc_funnel_sequences` and represents a step in the automation builder. Important fields are `funnel_id`, `parent_id`, `action_name`, `condition_type`, `type`, `status`, `conditions`, `settings`, `delay`, `c_delay`, and `sequence`. The model serializes and unserializes `settings` and `conditions`.

## Start a funnel safely

Do not directly insert `FunnelSubscriber` rows from a companion plugin. Use `FunnelProcessor::startFunnelSequence()`, which creates or finds the contact, handles pending/double-opt-in state, checks duplicates, creates the funnel subscriber, records the start hook, and processes immediate steps.

```php
use FluentCrm\App\Models\Funnel;
use FluentCrm\App\Services\Funnel\FunnelProcessor;

if (!function_exists('FluentCrmApi')) {
    return;
}

$contact = FluentCrmApi('contacts')->getContactByUserRef($userId);
$funnel  = Funnel::where('id', (int) $funnelId)
    ->where('status', 'published')
    ->where('type', 'funnels')
    ->first();

if ($contact && $funnel) {
    (new FunnelProcessor())->startFunnelSequence($funnel, [], [
        'source_trigger_name' => 'my_plugin_event',
        'source_ref_id'      => (int) $eventId,
    ], $contact);
}
```

When you do not yet have a contact, pass subscriber data as the second argument:

```php
(new FunnelProcessor())->startFunnelSequence($funnel, [
    'email'      => sanitize_email($email),
    'first_name' => sanitize_text_field($firstName),
    'status'     => 'subscribed',
], [
    'source_trigger_name' => 'my_plugin_event',
    'source_ref_id'      => (int) $eventId,
]);
```

Core manual attach uses the same pattern in `SubscriberController`: it filters contacts not already in the funnel and starts them with `source_trigger_name => fcrm_manual_attach`.

## Duplicate and status guards

`FunnelProcessor::startSequences()` calls `FunnelHelper::ifAlreadyInFunnel($funnelId, $subscriberId)` and also relies on a unique DB constraint on `(funnel_id, subscriber_id)`. Keep this path intact.

Processing later steps is status-gated. `processFunnelAction()` only processes contacts with status `subscribed` or `transactional` unless the funnel setting `__force_run_actions` is `yes`. Otherwise the funnel subscriber is marked `cancelled`.

The follow-up processor selects published funnels, due `next_execution_time`, and statuses from:

```php
apply_filters('fluent_crm/funnel_subscriber_statuses', ['active']);
```

In 3.1.8 it also has batch controls:

- `fluent_crm/funnel_processor_batch_limit`, default `200`
- `fluent_crm/funnel_processor_max_processing_seconds`, default `55`

## Resume from a benchmark

For benchmarks or goal-style entry points, use `startFunnelFromSequencePoint($startSequence, $subscriber, $args, $metricArgs)`. It records a `FunnelMetric`, starts from the benchmark point if allowed, or advances an existing funnel subscriber when the target point is ahead of the current progress.

Do not create a new funnel subscriber manually for benchmark resumes. The processor handles:

- `can_enter = no`
- already completed or cancelled funnels
- `starting_sequence_id`
- `last_sequence_id`
- `next_sequence_id`
- pending contacts

`recordFunnelMetric()` uses `FunnelMetric::firstOrCreate()` and catches a race where another process inserted the metric between select and insert.

## Read automation progress

Use ORM reads for reports and conditional logic:

```php
use FluentCrm\App\Models\FunnelSubscriber;

$runs = FunnelSubscriber::where('subscriber_id', (int) $contactId)
    ->with(['funnel', 'next_sequence_item', 'last_sequence'])
    ->orderBy('id', 'DESC')
    ->get();
```

Prefer read-only access unless you are implementing FluentCRM internals. If you must update a run, update only state fields you own and do not skip the processor's hook path for executing actions.

## Pro email sequences

`FluentCampaign\App\Models\Sequence` is a Pro email sequence. It maps `fc_campaigns` with a global scope `type = email_sequence`. Its child emails are `SequenceMail` rows, and each enrolled contact is tracked by `SequenceTracker` in `fc_sequence_tracker`.

Enroll contacts through `Sequence::subscribe()`:

```php
use FluentCampaign\App\Models\Sequence;
use FluentCampaign\App\Models\SequenceTracker;
use FluentCrm\App\Models\Subscriber;

$sequence = Sequence::find((int) $sequenceId);
$contact  = Subscriber::find((int) $contactId);

if ($sequence && $contact) {
    $already = SequenceTracker::where('campaign_id', $sequence->id)
        ->where('subscriber_id', $contact->id)
        ->first();

    if (!$already) {
        $sequence->subscribe([$contact]);
    }
}
```

`Sequence::subscribe()` loads `SequenceMail` rows ordered by delay, schedules first batch emails in `fc_campaign_emails`, parses subject/body smart codes with `fluent_crm/parse_campaign_email_text`, and creates or updates `SequenceTracker`.

Unsubscribe through the sequence model:

```php
$sequence->unsubscribe([(int) $contactId], 'Removed by My Plugin');
```

This marks the tracker `cancelled` and cancels scheduled sequence emails. Do not delete `SequenceTracker` directly unless you intentionally want the admin-controller behavior, which removes tracker rows without cancelling scheduled emails.

`SequenceTracker` has a global scope `type = sequence_tracker`; status defaults to `active`. `ofNextTrackers()` selects active due trackers by `next_execution_time <= current_time('mysql')`.

## Common mistakes

- Do not confuse `FunnelSequence` with `FluentCampaign\App\Models\Sequence`.
- Do not insert into `fc_funnel_subscribers` for normal integrations; call `FunnelProcessor`.
- Do not write `completed` through `changeFunnelSubSequenceStatus()` for normal action progress; that helper's default/canon is `complete`. Reserve `completed` for full automation run status and Pro email sequence tracker status.
- Do not enroll a contact into an email sequence twice. Check `SequenceTracker` first.
- Do not process unsubscribed contacts unless the funnel explicitly uses `__force_run_actions`.

## Cross-references

- Use `fluentcrm-funnel-trigger` when registering a new trigger in the automation builder.
- Use `fluentcrm-funnel-action` for custom action step classes.
- Use `fluentcrm-funnel-benchmark` for custom benchmark step classes.
- Use `fluentcrm-contact-models` for contact/list/tag CRUD before starting automations.

## References

- Local source: `FunnelProcessor.php`, `FunnelHelper.php`, `FunnelSubscriber.php`, `FunnelSequence.php`, Pro `Sequence.php`, and `SequenceTracker.php`.
- FluentCRM docs: FunnelSubscriber model, FunnelSequence model, and Fluent ORM.
- Official documentation: <https://developers.fluentcrm.com/database/models/funnelSubscriber>
- Official documentation: <https://developers.fluentcrm.com/database/models/funnelSequence>
- Official documentation: <https://developers.fluentcrm.com/database/orm/>
- Verified source paths:
  - `wp-content/plugins/fluent-crm/app/Models/Funnel.php`
  - `wp-content/plugins/fluent-crm/app/Models/FunnelMetric.php`
  - `wp-content/plugins/fluent-crm/app/Http/Controllers/SubscriberController.php`
  - `wp-content/plugins/fluentcampaign-pro/app/Models/SequenceMail.php`
  - `wp-content/plugins/fluentcampaign-pro/app/Http/Controllers/SequenceController.php`
