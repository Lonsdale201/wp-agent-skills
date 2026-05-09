---
name: fluentcrm-funnel-action
description: Build a custom FluentCRM funnel action — a sequence step that
  runs per-contact when an automation reaches it — by extending
  BaseAction. Covers the three abstract methods (getBlock, getBlockFields,
  handle), the per-step handle($subscriber, $sequence, $funnelSubscriberId,
  $funnelMetric) signature, and the canonical skip / failure semantics —
  handle ONLY overrides status on early-return, because
  FunnelProcessor::processSequence already marks the sequence 'complete'
  BEFORE dispatch. Important — the status string canon is 'complete'
  (NOT 'completed'); both the sequence-subscriber row (via
  FunnelHelper::changeFunnelSubSequenceStatus) AND the FunnelMetric
  ($funnelMetric->status + ->save()) need updating on skip. Same
  lifecycle rule as triggers — register on fluentcrm_loaded priority
  below 10. Use when building integration actions. Triggers on
  BaseAction, fluentcrm_funnel_blocks, fluentcrm_funnel_block_fields,
  fluentcrm_funnel_sequence_handle_, changeFunnelSubSequenceStatus,
  funnelMetric, getBlockFields.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "2.9.87"
api-stable-since: "2.7"
php-min: "7.4"
last-updated: "2026-05-10"
docs:
  - https://developers.fluentcrm.com/funnel-builder/custom-action/
source-refs:
  - app/Services/Funnel/BaseAction.php
  - app/Services/Funnel/FunnelProcessor.php
  - app/Services/Funnel/FunnelHelper.php
  - app/Models/FunnelMetric.php
---

# FluentCRM: register a custom funnel action

For developers building a companion plugin that needs to add a step inside FluentCRM's automation funnel — "Enroll user to LMS course", "Issue Woo coupon", "Send to webhook", "Update post status". Each action is a block the admin drags into the funnel sequence; when a contact reaches the block, the handler runs once per (contact, sequence) tuple. Extends `FluentCrm\App\Services\Funnel\BaseAction`. Verified end-to-end against FluentCRM 2.9.87 source.

## API stability note

`BaseAction`, the `fluentcrm_funnel_blocks` / `fluentcrm_funnel_block_fields` filter pair, the per-action `fluentcrm_funnel_sequence_handle_{name}` action, and the `(subscriber, sequence, funnelSubscriberId, funnelMetric)` handler signature have been stable since 2.7. The implicit-complete pattern (FunnelProcessor sets sequence status `'complete'` before dispatching the handler — see Misconception #2 below) has been in place since 1.2 of the funnel processor.

## Misconception this skill corrects

> "I'll mark the sequence as `'completed'` from my handler when the work succeeds."

Two bugs in one sentence.

**Bug A: the canonical string is `'complete'`, not `'completed'`.** FluentCRM core writes `'complete'` everywhere — `FunnelProcessor::processSequence` at [FunnelProcessor.php:214](FunnelProcessor.php), the default in `FunnelHelper::changeFunnelSubSequenceStatus()` at [FunnelHelper.php:16](FunnelHelper.php), and every built-in action in `app/Services/Funnel/Actions/*.php`. Writing `'completed'` to the database does not break execution but the admin "complete" funnel-progress filter never matches your rows; the sequence appears unfinished forever in reports.

**Bug B: you don't need to mark anything as complete on success.** `FunnelProcessor::processSequence()` calls `FunnelHelper::changeFunnelSubSequenceStatus($funnelSubscriberId, $sequence->id, 'complete')` at [FunnelProcessor.php:214](FunnelProcessor.php) — **before** firing `do_action('fluentcrm_funnel_sequence_handle_' . $sequence->action_name, ...)` at [FunnelProcessor.php:223](FunnelProcessor.php). By the time your handler runs, the sequence is already marked `'complete'`. Your job is to override only when you want a different outcome:

- Returning normally → status stays `'complete'` (set by the processor)
- Early-return because a precondition failed → call `changeFunnelSubSequenceStatus(..., 'skipped')` AND set `$funnelMetric->status = 'skipped'`
- API call failed → same pattern with `'skipped'` (or `'failed'` — see "Status vocabulary" below)

Other AI-prone misconceptions:

- **"I'll register my action on `fluent_crm/after_init`."** Same timing bug as triggers. `BaseAction::register()` adds itself to two filters (`fluentcrm_funnel_blocks`, `fluentcrm_funnel_block_fields`) plus one action listener (`fluentcrm_funnel_sequence_handle_{name}`). The block / field filters drive the editor UI — load too late and the action picker shows your block but the editor renders an empty settings panel. The action listener powers runtime — load too late and reaching your block at runtime does nothing. **Register on `fluentcrm_loaded` priority below 10**, identical rule to triggers. See `fluentcrm-funnel-trigger` for the lifecycle diagram.
- **"I need to record success metrics in `$funnelMetric` myself."** No — the metric row was already created by `FunnelProcessor::recordFunnelMetric()` at [FunnelProcessor.php:213](FunnelProcessor.php) immediately before dispatching the handler. Your handler receives the live model. Write `$funnelMetric->notes = '...'` (visible in the admin's automation log row) and `$funnelMetric->status = '...'` (only on skip/failure overrides), then `$funnelMetric->save()`. Don't `new FunnelMetric()` yourself.
- **"`$subscriber->user_id` is the WP user ID."** Sometimes. The `Subscriber` model column `user_id` is the LINKED WP user, but it's `null` for guests. Use `$subscriber->getWpUserId()` which encapsulates the lookup (FluentCampaign Pro built-ins always go through this — [AddToCourseAction.php:76](AddToCourseAction.php) is the canonical example).
- **"The action runs every time the contact reaches the block."** Almost. `processSequence` checks `$funnelMetric->wasRecentlyCreated` at [FunnelProcessor.php:222](FunnelProcessor.php) — the handler fires only once per (contact, sequence) pair. If the same contact is re-enrolled in the funnel, they get a fresh metric row and the handler fires again. If the funnel re-uses the sequence (loop), the existing metric short-circuits the dispatch. Don't write idempotency logic in your handler unless you also handle re-enrollment yourself.
- **"`getBlockFields()` and `getBlock()` carry the same shape as triggers."** Different terminology, different filters. Triggers use `getTrigger()` + `getSettingsFields()` + `getConditionFields()` and feed `fluentcrm_funnel_triggers`. Actions use `getBlock()` + `getBlockFields()` and feed `fluentcrm_funnel_blocks` + `fluentcrm_funnel_block_fields`. Block payload shape uses `'category'` + `'title'` (NOT `'label'`); BaseAction stamps `'type' => 'action'` itself at [BaseAction.php:30](BaseAction.php).
- **"Block-level defaults belong in `getBlockFields`."** The `'settings'` key on the `getBlock()` return is what seeds new instances of the block in the editor. `getBlockFields()` shapes the editor form (labels, types, dependencies). Get the split wrong and you end up with editor fields that have no default value, or settings the editor doesn't know how to render.
- **"`getBlock()` without `'settings'` is fine — the editor reads defaults from `getBlockFields()`."** It is **not** fine, and this is the most painful failure mode in this contract. If `getBlock()` doesn't return a `'settings'` hash, the editor renders the action panel with an undefined settings object. The Vue components bind directly to `settings.<field_key>` — the FIRST field's setter call throws **`TypeError: Cannot read properties of undefined (reading '<field_key>')`** in `start.js`, the editor catches the throw and the panel renders empty. Any new action you ship MUST seed `'settings'` with one entry per field in `getBlockFields()['fields']`. The keys MUST match exactly. The values are the per-field defaults the admin sees on first drop.

## When to use this skill

Trigger when ANY of the following is true:

- Building an integration action that runs per-contact when a funnel reaches a sequence step (LMS enroll, coupon issue, CPT update, webhook fire, file generate).
- The diff/files reference `BaseAction`, `fluentcrm_funnel_blocks`, `fluentcrm_funnel_block_fields`, `fluentcrm_funnel_sequence_handle_*`, `changeFunnelSubSequenceStatus`, `$funnelMetric`.
- Reviewing code that registers actions on `fluent_crm/after_init` or `init`.
- Debugging "my action runs but the sequence is stuck on processing" — almost always a status-string typo (`'completed'` vs `'complete'`) or a missing `->save()` on `$funnelMetric`.
- Debugging **"the action panel renders empty when I drag the block in"** or a console error like `TypeError: Cannot read properties of undefined (reading 'product_id')` in `start.js` / `boot.js` — almost always a missing `'settings'` seed in `getBlock()`. See Misconception #6.

## Step 1 — Register on the right hook (same rule as triggers)

```php
<?php
namespace MyPlugin\Modules\Actions;

use HelloWP\MyPlugin\Support\Dependency;
use HelloWP\MyPlugin\Settings\SettingsRepository;

final class ActionManager
{
    public function __construct()
    {
        // Same lifecycle rule as triggers — register before
        // fluentcrm_addons_loaded fires so BaseAction's filters land in
        // place for the editor's first read. FluentCampaign Pro registers
        // its actions through IntegrationHandler at the same point.
        add_action('fluentcrm_loaded', [$this, 'registerActions'], 5);
    }

    public function registerActions(): void
    {
        if (Dependency::isMyServiceActive() && SettingsRepository::isEnabled('actions', 'do_thing')) {
            new DoThingAction();
        }
    }
}
```

`new DoThingAction()` invokes the parent constructor, which calls `register()` ([BaseAction.php:14-22](BaseAction.php)) — the two filter additions and the per-action listener register here.

## Step 2 — Extend BaseAction

```php
<?php
namespace MyPlugin\Modules\Actions;

use FluentCrm\App\Services\Funnel\BaseAction;
use FluentCrm\App\Services\Funnel\FunnelHelper;
use FluentCrm\Framework\Support\Arr;

final class DoThingAction extends BaseAction
{
    public function __construct()
    {
        $this->actionName = 'my_plugin_do_thing';
        $this->priority   = 20;
        parent::__construct();
    }

    public function getBlock()
    {
        return [
            'category'    => __('My Service', 'my-plugin'),
            'title'       => __('Do The Thing', 'my-plugin'),
            'description' => __('Calls My Service for the contact.', 'my-plugin'),
            'icon'        => 'fc-icon-trigger',
            // CRITICAL — 'settings' is the seed for new block instances. The
            // editor's Vue components bind directly to settings.<field_key>;
            // omit this and dragging the block in throws
            // `TypeError: Cannot read properties of undefined (reading
            // '<first_field>')` in start.js, leaving the panel empty.
            // Keys MUST match getBlockFields()['fields'] keys exactly.
            'settings'    => [
                'thing_id'        => '',
                'send_welcome'    => 'yes',
                'skip_for_public' => 'no',
            ],
        ];
    }

    public function getBlockFields()
    {
        return [
            'title'     => __('Do The Thing', 'my-plugin'),
            'sub_title' => __('Calls My Service for the contact.', 'my-plugin'),
            'fields'    => [
                'thing_id' => [
                    'type'        => 'rest_selector',
                    'option_key'  => 'my_plugin_things',  // pairs with fluentcrm_ajax_options_my_plugin_things filter
                    'is_multiple' => false,
                    'clearable'   => true,
                    'label'       => __('Select Thing', 'my-plugin'),
                    'placeholder' => __('Select Thing', 'my-plugin'),
                ],
                'skip_for_public' => [
                    'type'        => 'yes_no_check',
                    'check_label' => __('Skip if contact has no WP user account.', 'my-plugin'),
                ],
                'send_welcome' => [
                    'type'        => 'yes_no_check',
                    'check_label' => __('Send default WP welcome email if a new user is created.', 'my-plugin'),
                    'dependency'  => [
                        'depends_on' => 'skip_for_public',
                        'operator'   => '=',
                        'value'      => 'no',
                    ],
                ],
            ],
        ];
    }

    public function handle($subscriber, $sequence, $funnelSubscriberId, $funnelMetric)
    {
        $settings = $sequence->settings;
        $thingId  = (int) Arr::get($settings, 'thing_id');
        $userId   = $subscriber->getWpUserId();

        // SKIP path #1 — config invalid.
        if ($thingId <= 0) {
            $funnelMetric->notes  = __('Skipped: no thing selected.', 'my-plugin');
            $funnelMetric->status = 'skipped';
            $funnelMetric->save();
            FunnelHelper::changeFunnelSubSequenceStatus($funnelSubscriberId, $sequence->id, 'skipped');
            return false;
        }

        // SKIP path #2 — guest contact + admin asked to skip guests.
        if (!$userId && Arr::get($settings, 'skip_for_public') === 'yes') {
            $funnelMetric->notes  = __('Skipped: contact is not a WP user.', 'my-plugin');
            $funnelMetric->status = 'skipped';
            $funnelMetric->save();
            FunnelHelper::changeFunnelSubSequenceStatus($funnelSubscriberId, $sequence->id, 'skipped');
            return false;
        }

        // Real work goes here.
        $result = my_service_do_thing_for_user($userId, $thingId);

        if (is_wp_error($result)) {
            $funnelMetric->notes  = $result->get_error_message();
            $funnelMetric->status = 'skipped';
            $funnelMetric->save();
            FunnelHelper::changeFunnelSubSequenceStatus($funnelSubscriberId, $sequence->id, 'skipped');
            return false;
        }

        // SUCCESS path — DO NOT call changeFunnelSubSequenceStatus(..., 'complete').
        // FunnelProcessor::processSequence already wrote 'complete' at line 214
        // before dispatching us. Just leave a useful note and return.
        $funnelMetric->notes = __('Thing done successfully.', 'my-plugin');
        $funnelMetric->save();

        return true;
    }
}
```

## Step 3 — Status vocabulary

The two records that track action state and the strings each accepts:

| Record | Method to write | Canonical values |
|--|--|--|
| **Sequence <-> Subscriber** (`FunnelSubscriber` join) | `FunnelHelper::changeFunnelSubSequenceStatus($funnelSubscriberId, $sequenceId, $status)` | `'pending'`, `'complete'`, `'skipped'` |
| **Funnel metric row** (per-step audit log) | `$funnelMetric->status = '...'; $funnelMetric->save();` | `'pending'`, `'complete'`, `'skipped'`, `'failed'` |

Notes:

- **`'complete'` not `'completed'`.** Double-check every string literal against `FunnelProcessor::processSequence()` if unsure.
- **The metric row supports `'failed'`** — useful for logging unrecoverable errors distinctly from configuration skips. The sequence-subscriber record only has `'skipped'`. Map your retry semantics accordingly: `'failed'` on the metric tells the admin "this needs investigation"; `'skipped'` on the join tells the funnel "move past this step".
- **`'pending'` is the initial state**, set by `recordFunnelMetric` and `changeFunnelSubSequenceStatus` defaults. Don't write it from your handler.
- **Save the metric**. `$funnelMetric->save()` is what persists `notes` + `status` to disk; without it the admin's automation log shows blanks.

## Step 4 — How the registration plumbs through

Follow the chain from the editor click to your handler:

1. Admin opens the funnel editor → editor REST request → server filters via `fluentcrm_funnel_blocks` (your `pushBlock` adds your block to the picker, [BaseAction.php:24-35](BaseAction.php)) and `fluentcrm_funnel_block_fields` (your `pushBlockFields` adds your editor form schema, [BaseAction.php:37-43](BaseAction.php)).
2. Admin drags your block into the sequence + saves the funnel → the sequence row stores `action_name = 'my_plugin_do_thing'` plus the `settings` JSON.
3. At runtime, when a contact reaches your sequence step, `FunnelProcessor::processSequence()` runs:
   - `recordFunnelMetric` creates the metric row (status `'pending'`).
   - `changeFunnelSubSequenceStatus(..., 'complete')` flips the sequence-subscriber row to `'complete'`.
   - `do_action('fluentcrm_funnel_sequence_handle_' . $sequence->action_name, $subscriber, $sequence, $funnelSubscriberId, $funnelMetric)` ([FunnelProcessor.php:223](FunnelProcessor.php)) — your `handle()` runs.
4. Your handler does the work and overrides status only on skip/failure.

## Critical rules

- **Register on `fluentcrm_loaded` priority < 10.** Same rule as triggers. `fluent_crm/after_init` is too late for the block-filter side; the editor reads block lists earlier than that.
- **`actionName` is the unique action key.** Used to look up the editor block AND to namespace the per-action handler (`fluentcrm_funnel_sequence_handle_{name}`). Pick a globally-unique slug (prefix with your plugin namespace) — collisions silently overwrite the prior block.
- **Status string is `'complete'`** (the past-tense "completed" is wrong everywhere this contract lives). Same canon for both the sequence-subscriber row and the metric row.
- **Don't override status to `'complete'` on success.** Already done by the processor before dispatch. Writing it again is harmless but adds confusion to log readers comparing your handler against the built-ins, none of which do this.
- **Do override to `'skipped'` (or `'failed'` for the metric) on early-return.** Otherwise the admin sees the row stuck looking complete despite the skip note.
- **Save the metric.** `$funnelMetric->save()` is required after writing `notes` / `status`.
- **`$subscriber->getWpUserId()` not `$subscriber->user_id`.** The latter is null for guests; the former is the canonical lookup.
- **`getBlock()['settings']` keys MUST equal `getBlockFields()['fields']` keys.** The settings hash seeds new block instances; the fields hash drives the editor form. Misalignment = settings keys the editor can't render or fields with no default.
- **Plugin-presence detection MUST use a file-load-time symbol** — a top-level class declared in the dependency's main file (`class_exists('TopLevelClass')`) or a constant `define()`'d at file scope (`defined('CONST_NAME')`). NEVER `function_exists('helper')` — those helpers are typically declared inside the dependency's own `plugins_loaded` callback. Two plugins on `plugins_loaded:10` run in registration order (non-deterministic), so a function-based check passes when the dep loaded first and silently fails when it loaded second — your action then disappears from the editor's block picker on half the requests. Canonical example: WC Memberships → `class_exists('WC_Memberships_Loader')` (file scope, race-free) NOT `function_exists('wc_memberships')` (declared inside `init_plugin()` callback).

## Common mistakes

- **Skipping the `'settings'` seed in `getBlock()`.** Editor renders the action panel empty and the JS console throws `TypeError: Cannot read properties of undefined (reading '<your_first_field_key>')`. The fix is one block — copy every key from your `getBlockFields()['fields']` array into `getBlock()['settings']` with sensible defaults (`''` for text/select/rest_selector, `'no'` / `'yes'` for radio toggles, `0` or `1` for numeric, `[]` for multi-select arrays).
- **Calling `do_action('fluentcrm_funnel_sequence_handle_*')` from your own code.** That action is fired by `FunnelProcessor::processSequence` only. Calling it directly bypasses the metric record, the wasRecentlyCreated check (so it can fire infinitely), and the implicit `'complete'` status mark.
- **Using `'completed'` consistently.** The funnel report SQL filters for `'complete'`. The plugin's UI counts skipped + complete distinctly. `'completed'` rows fall outside both buckets.
- **Forgetting the `priority` fluentcrm-loaded value.** Default `add_action` priority is 10; FluentCampaign Pro uses an unspecified priority on `fluentcrm_loaded` (effectively 10). Set yours to 5 explicitly so order is deterministic when other addons co-exist.
- **Storing transient state in the action class.** `BaseAction::pushBlock` writes `$this->funnel = $funnel` ([BaseAction.php:26](BaseAction.php)) — that's per-request, per-funnel. Don't lean on `$this->whatever` to carry state between handler invocations; use `$sequence->settings` (admin-configured) and `$subscriber` / `$funnelMetric` (per-step).
- **Leaving long-running work in the handler synchronously.** The funnel processor runs in the request that triggered the funnel (or via Action Scheduler for delayed sequences). Long-running HTTP calls block downstream sequence dispatch. For external API calls, fire and forget via `wp_schedule_single_event` from inside `handle()`, then return.
- **Filter side effects without try/finally.** If your handle adds filters (`add_filter`) for the duration of an SDK call, wrap the call in try/finally and `remove_filter` in the finally branch. Otherwise an exception in the SDK leaves the filter installed for the rest of the request, polluting other actions in the same funnel run.
- **Using `function_exists()` for dep detection at registration time.** The classic load-order race — the helper function is declared inside the dep's own `plugins_loaded` callback, which may or may not have run by the time your `fluentcrm_loaded:5` listener fires. Symptom: the action appears in the editor on some installs / page loads and not others, no error, no log. Fix: switch to a file-scope `class_exists` or `defined` check (see Critical rules).
- **Pro-gating an action that doesn't actually need Pro.** `BaseAction` is in FluentCRM Free; many integration actions (LMS enrol, Memberships grant, simple Woo coupon) work without FluentCampaign Pro. Adding `Dependency::isFluentCRMProActive()` to the registration gate hides the action from Free users for no reason. Only require Pro when the action genuinely uses Pro-only APIs (sequence email scheduling, advanced reporting, conditional branching).

## Cross-references

- Run **`fluentcrm-funnel-trigger`** when registering the trigger that starts the funnel.
- Run **`fluentcrm-rest-options`** when your action uses `'type' => 'rest_selector'` for option pickers.

## What this skill does NOT cover

- **Triggers** (BaseTrigger). Different filter family, different lifecycle nuances. See `fluentcrm-funnel-trigger`.
- **Benchmarks** (BaseBenchMark — branching/wait nodes that gate later steps).
- Custom **smart codes** (`{{my_code.foo}}`).
- The funnel scheduler itself (Action Scheduler integration that runs delayed sequences).
- Block-editor email templates / styles — out of scope for the funnel layer.

## References

- [FluentCRM developer docs — custom actions](https://developers.fluentcrm.com/funnel-builder/custom-action/)
- BaseAction contract — `app/Services/Funnel/BaseAction.php`
- Implicit-complete + handler dispatch — `app/Services/Funnel/FunnelProcessor.php:211-225`
- Status helper canon (`'complete'` is the default) — `app/Services/Funnel/FunnelHelper.php:16`
- FunnelMetric model — `app/Models/FunnelMetric.php`
- Reference Pro action (skip-on-precondition pattern) — `fluentcampaign-pro/app/Services/Integrations/TutorLms/AddToCourseAction.php`
