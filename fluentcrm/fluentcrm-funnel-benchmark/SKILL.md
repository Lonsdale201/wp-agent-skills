---
name: fluentcrm-funnel-benchmark
description: Build a custom FluentCRM funnel benchmark — a goal/wait point
  inside a sequence that pauses execution until a matching event occurs
  (tag applied, list joined, course completed, custom event). Extends
  BaseBenchMark. Covers the three abstract methods (getBlock,
  getBlockFields, handle), Optional vs Essential semantics, the can_enter
  direct-entry toggle, the assertCurrentGoalState filter, and
  FunnelProcessor::startFunnelFromSequencePoint as the canonical resume
  entry — NOT startFunnelSequence (that starts a new run). Important —
  same lifecycle rule as triggers (instantiate on fluentcrm_loaded
  priority below 10); benchmarks share the action listener with triggers
  via FunnelHandler::mapTriggers, so the init:2
  fluentcrm_funnel_arg_num_{name} timing applies. Use when a funnel
  needs to wait for a contact-state change.
  Triggers on BaseBenchMark, fluentcrm_funnel_benchmark_start_,
  assertCurrentGoalState, startFunnelFromSequencePoint, benchmarkTypeField,
  canEnterField.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "FluentCRM 3.1.8 + FluentCRM Pro 3.1.8"
api-stable-since: "2.6"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://developers.fluentcrm.com/funnel-builder/custom-benchmark/
source-refs:
  - app/Services/Funnel/BaseBenchMark.php
  - app/Services/Funnel/FunnelProcessor.php
  - app/Services/Funnel/Benchmarks/TagAppliedBenchmark.php
  - app/Hooks/Handlers/FunnelHandler.php
---

# FluentCRM: register a custom funnel benchmark

For developers building a funnel **wait point** — a node placed inside an automation that pauses the contact until a specific event matches the configured criteria (tag applied, course completed, payment received, custom event from your plugin). Unlike a trigger (which STARTS a funnel) or an action (which DOES something), a benchmark *gates* progress mid-flow. Extends `FluentCrm\App\Services\Funnel\BaseBenchMark`. Verified against FluentCRM 3.1.8.

## API stability note

`BaseBenchMark`, the registration triplet (`fluentcrm_funnel_blocks` + `fluentcrm_funnel_block_fields` + `fluentcrm_funnel_benchmark_start_{name}`), the `assertCurrentGoalState` filter, and `FunnelProcessor::startFunnelFromSequencePoint()` have been stable since FluentCRM 2.6.0 (when goal-state assertion was introduced). The Optional vs Essential semantics and the `can_enter` direct-entry mechanism are part of that 2.6 baseline.

## Misconception this skill corrects

> "Benchmarks are special wait nodes — they have their own action listener separate from triggers."

Wrong. Benchmarks listen on the **same** WP action as triggers — `FunnelHandler::mapTriggers()` handles both in one pass. After dispatching `fluentcrm_funnel_start_{triggerName}` for matching trigger funnels, it queries `FunnelSequence` for benchmark sequences with `action_name === $triggerName` whose funnel is published, and dispatches `fluentcrm_funnel_benchmark_start_{triggerName}` for each.

Practical consequences:

1. **The same `fluentcrm_funnel_arg_num_{name}` filter timing rule applies.** Instantiate on `fluentcrm_loaded` priority below 10. Hook on `fluent_crm/after_init` and your benchmark misses both active-trigger listener passes; hook too late in `init` and events fired by other `init` callbacks can be missed or reduced to the default one accepted arg.
2. **`triggerName` collision is fine** between a trigger and a benchmark — they coexist on the same action. `TagAppliedBenchmark::triggerName = 'fluentcrm_contact_added_to_tags'` is used by both the trigger flow ("Tag Applied" trigger that starts a funnel) and the benchmark flow ("Tag Applied" wait point).
3. **`fluentcrm_funnel_settings` option lifecycle includes benchmarks.** `resetFunnelIndexes()` queries published-funnel benchmark sequences — saving a funnel that uses your benchmark adds the trigger name to the listener registry.

Other AI-prone misconceptions:

- **"`triggerName` on a benchmark is the benchmark's identifier."** Wrong. `triggerName` is the WP action name the benchmark listens for — same semantics as `BaseTrigger::triggerName`. Pick a hook your plugin already fires (or an existing FluentCRM contact-state hook like `fluentcrm_contact_added_to_tags`); don't invent a name unique to the benchmark unless you're also firing `do_action('your_name', ...)` from a dispatcher.
- **"`getBlock()` doesn't need a `'settings'` key."** Same trap as BaseAction. The `'settings'` hash on the `getBlock()` return is the seed for new instances dragged into the funnel; the editor's Vue components bind directly to `settings.<field_key>`. Omit it and dragging the block in throws **`TypeError: Cannot read properties of undefined (reading '<your_first_field>')`** in `start.js`, leaving the panel empty. `BaseBenchMark::addBenchmark` at [BaseBenchMark.php:53-62](BaseBenchMark.php) does NOT inject defaults. Seed every field key, including the auto-rendered `type` (Optional/Essential) and `can_enter` (direct-entry) when you reference them via `$this->benchmarkTypeField()` / `$this->canEnterField()`.
- **"`handle()` on a benchmark is identical to a trigger's `handle()`."** Different signature — `handle($benchMark, $originalArgs)` where `$benchMark` is the FunnelSequence row of the benchmark step (not a Funnel). Inside the handler, after matching, call `(new FunnelProcessor())->startFunnelFromSequencePoint($benchMark, $subscriber)` — NOT `startFunnelSequence`. The latter starts a NEW funnel run; the former resumes the existing run from the matched benchmark.
- **"`assertCurrentGoalState` is optional."** Functionally yes (returns `$asserted` unchanged by default), but skipping it breaks the FluentCRM admin's "is the goal already met" UI for contacts already on the funnel — that filter is what reports back "yes, this contact has the tag" so the goal point appears completed.
- **"`Optional` vs `Essential` is just a label."** It changes funnel flow. **Optional**: contacts can pass through without hitting the goal — useful for analytics ("did they convert?"). **Essential**: contacts wait at the goal indefinitely until matched — used to gate downstream actions on a real event. The split is administered via the `type` field in settings (`'optional'` / `'required'`) and consumed by `FunnelProcessor` when deciding whether to advance past an unmet goal.
- **"`can_enter` is a UI cosmetic."** It's a real control flow toggle. With `'can_enter' => 'yes'`, contacts NOT on the funnel who match the trigger's criteria are inserted directly at the benchmark and continue from there. With `'no'`, the benchmark only matters for contacts already on the funnel. Default 'yes' for canonical behaviours like Tag Applied.

## When to use this skill

Trigger when ANY of the following is true:

- Building a custom benchmark for an event your plugin emits or that FluentCRM already emits but you want to surface as a goal node.
- Code references `BaseBenchMark`, `fluentcrm_funnel_benchmark_start_*`, `assertCurrentGoalState`, `startFunnelFromSequencePoint`, `benchmarkTypeField`, `canEnterField`.
- Reviewing benchmark code that calls `startFunnelSequence` instead of `startFunnelFromSequencePoint` — that's the most common semantic bug (see "Common mistakes").
- Debugging **"the goal panel renders empty when I drag the block in"** or a console error like `TypeError: Cannot read properties of undefined (reading '<field_key>')` in `start.js` / `boot.js` — almost always a missing `'settings'` seed in `getBlock()`. See "Misconception: `getBlock()` doesn't need a `'settings'` key".

## Triggers vs Actions vs Benchmarks — a one-line decider

- **Trigger** — starts a funnel from outside. The contact is not yet enrolled when the trigger fires.
- **Action** — does work for an already-enrolled contact at a specific sequence step.
- **Benchmark** — gates an already-enrolled contact's progress, waiting for a real event. May ALSO direct-enrol matching contacts when `can_enter === 'yes'`.

If you find yourself wanting "an action that conditionally pauses", you want a benchmark.

## Step 1 — Register on the right hook

```php
// Inside your TriggerManager / ActionManager / BenchmarkManager class:
add_action('fluentcrm_loaded', [$this, 'registerBenchmarks'], 5);
```

Same lifecycle constraint as triggers and actions. The `fluentcrm_funnel_arg_num_{name}` filter must be in place before FluentCRM's `init:2` early active-trigger listener pass. See `fluentcrm-funnel-trigger` for the lifecycle diagram.

## Step 2 — Extend BaseBenchMark

```php
<?php
namespace MyPlugin\Modules\Benchmarks;

use FluentCrm\App\Services\Funnel\BaseBenchMark;
use FluentCrm\App\Services\Funnel\FunnelProcessor;
use FluentCrm\Framework\Support\Arr;

final class MyEventBenchmark extends BaseBenchMark
{
    public function __construct()
    {
        // The WP action this benchmark listens for. If your plugin doesn't
        // already fire one, see Step 3 about dispatchers — pick a custom name
        // and do_action() it yourself from a bridge.
        $this->triggerName  = 'my_plugin_thing_happened';

        $this->actionArgNum = 2; // matches do_action('my_plugin_thing_happened', $thingId, $subscriber)
        $this->priority     = 20;

        parent::__construct();
    }

    public function getBlock()
    {
        return [
            'title'       => __('Thing Happened', 'my-plugin'),
            'description' => __('Wait until "thing" happens for the contact.', 'my-plugin'),
            'icon'        => 'fc-icon-tag_applied',
            // CRITICAL — 'settings' seeds new block instances. The editor's
            // Vue components bind directly to settings.<field_key>; omit
            // this and dragging the block in throws
            // `TypeError: Cannot read properties of undefined (reading
            // '<first_field>')` in start.js, leaving the panel empty.
            // Keys MUST match getBlockFields()['fields'] keys exactly,
            // including the auto-rendered `type` and `can_enter` fields.
            'settings'    => [
                'thing_ids' => [],
                'type'      => 'optional',  // 'required' for Essential
                'can_enter' => 'yes',       // 'no' to disable direct entry
            ],
        ];
    }

    public function getBlockFields($funnel)
    {
        return [
            'title'     => __('Thing Happened', 'my-plugin'),
            'sub_title' => __('Wait until selected things happen for the contact.', 'my-plugin'),
            'fields'    => [
                'thing_ids' => [
                    'type'        => 'rest_selector',
                    'option_key'  => 'my_plugin_things',
                    'is_multiple' => true,
                    'label'       => __('Target Things', 'my-plugin'),
                    'inline_help' => __('Leave blank to match any thing.', 'my-plugin'),
                ],
                'type'      => $this->benchmarkTypeField(),  // Optional vs Essential — provided by BaseBenchMark
                'can_enter' => $this->canEnterField(),       // direct-entry toggle — provided by BaseBenchMark
            ],
        ];
    }

    public function handle($benchMark, $originalArgs)
    {
        $thingId    = (int) ($originalArgs[0] ?? 0);
        $subscriber = $originalArgs[1] ?? null;

        if (!$thingId || !$subscriber) {
            return;
        }

        $settings  = $benchMark->settings;
        $thingIds  = (array) Arr::get($settings, 'thing_ids', []);

        // Empty filter → match anything. Otherwise must match one of the configured ids.
        if (!empty($thingIds) && !in_array($thingId, array_map('intval', $thingIds), true)) {
            return;
        }

        // Resume the funnel run from THIS benchmark — NOT startFunnelSequence.
        // startFunnelFromSequencePoint advances the existing funnel-subscriber
        // past the goal point; startFunnelSequence creates a NEW run.
        (new FunnelProcessor())->startFunnelFromSequencePoint($benchMark, $subscriber);
    }

    /**
     * Filter — called when FluentCRM needs to know whether a contact ALREADY
     * meets the goal criteria (e.g. they had the tag before they entered the
     * funnel). Used for the admin "is the goal complete?" indicator and for
     * deciding whether to skip past the goal automatically.
     */
    public function assertCurrentGoalState($asserted, $benchmark, $funnelSubscriber)
    {
        if (!$funnelSubscriber || !$funnelSubscriber->subscriber) {
            return $asserted;
        }

        // Replace this with the actual "does the contact already meet the
        // criteria?" check for your plugin's domain.
        $userId   = (int) ($funnelSubscriber->subscriber->user_id ?? 0);
        $thingIds = (array) Arr::get($benchmark->settings, 'thing_ids', []);

        if (empty($thingIds)) {
            return false; // nothing configured = nothing to assert
        }

        return my_plugin_user_has_any_thing($userId, $thingIds);
    }
}
```

## Step 3 — When to use a custom-named benchmark

Same rule as triggers: if a real WP action already exists with the right shape, set `triggerName` to that action name and you're done. Otherwise pick a unique name and dispatch from a bridge:

```php
add_action('my_real_plugin_event', function ($subscriberId, $thingId) {
    // Skip if no published funnel uses this benchmark.
    $hasActive = \FluentCrm\App\Models\FunnelSequence::where('action_name', 'my_plugin_thing_happened')
        ->whereHas('funnel', function ($q) { return $q->where('status', 'published'); })
        ->exists();
    if (!$hasActive) {
        return;
    }
    $subscriber = \FluentCrm\App\Models\Subscriber::find($subscriberId);
    if (!$subscriber) {
        return;
    }
    do_action('my_plugin_thing_happened', $thingId, $subscriber);
}, 20, 2);
```

Note the existence check uses `FunnelSequence` (not `Funnel`) and matches `action_name` — that's how `resetFunnelIndexes()` discovers benchmarks.

## Step 4 — How the registration plumbs through

1. `getBlock()` return is added to `fluentcrm_funnel_blocks` with `type === 'benchmark'` (set by `BaseBenchMark::addBenchmark` at [BaseBenchMark.php:53-62](BaseBenchMark.php)) — that's how the editor's "Goal" section sees your block.
2. `getBlockFields($funnel)` shapes the editor settings panel (returned via `fluentcrm_funnel_block_fields`).
3. Admin saves the funnel with your benchmark inside → `FunnelController` calls `resetFunnelIndexes()` which writes your `triggerName` into the `fluentcrm_funnel_settings` option.
4. When `do_action($triggerName, ...)` fires at runtime, `FunnelHandler::mapTriggers()` looks up benchmark `FunnelSequence` rows with `action_name === $triggerName` (published funnels only) and dispatches `do_action('fluentcrm_funnel_benchmark_start_'.$triggerName, $benchMark, $originalArgs)` for each.
5. `BaseBenchMark::register()` listens on that hook ([BaseBenchMark.php:24](BaseBenchMark.php)) → invokes your `handle($benchMark, $originalArgs)`.
6. Your handler matches criteria → `startFunnelFromSequencePoint($benchMark, $subscriber)` resumes the funnel.

The `assertCurrentGoalState` filter is dispatched separately when the admin loads a contact's funnel detail view, or when the funnel processor checks "is the goal already met" before deciding what to do.

## Critical rules

- **Register on `fluentcrm_loaded` priority < 10.** Same rule as triggers and actions. The `fluentcrm_funnel_arg_num_{name}` filter must land before the `init:2` early active-trigger listener pass.
- **`triggerName` is the WP action hook name**, identical semantics to BaseTrigger.
- **`actionArgNum` matches the hook's argument count.** Wrong value = silently dropped args inside `handle()` — same trap that bit triggers.
- **`handle()` calls `startFunnelFromSequencePoint`, not `startFunnelSequence`.** The former resumes the EXISTING run; the latter starts a NEW run.
- **Always seed `'settings'` in `getBlock()`** — one entry per `getBlockFields()['fields']` key. Without it the editor renders an empty panel and Vue throws `TypeError: Cannot read properties of undefined`. Same trap as BaseAction.
- **Defaults belong in `getBlock()['settings']`, not `getBlockFields()`.** Misalignment = settings keys with no default values.
- **Implement `assertCurrentGoalState` for any benchmark whose criteria can be true at the time the contact entered the funnel.** Tag-applied is the canonical example: a contact may already have the tag when they hit the wait point. Without the assertion, the admin UI shows the goal as pending forever.
- **Use `$this->benchmarkTypeField()` and `$this->canEnterField()` for the type/can_enter fields.** They render the canonical Optional/Essential and direct-entry UI; reinventing them confuses admins who know the standard widgets.
- **Don't fire `fluentcrm_funnel_benchmark_start_*` directly.** Same constraint as triggers — that action is dispatched by `FunnelHandler::mapTriggers()` only.

## Common mistakes

- **Calling `startFunnelSequence` instead of `startFunnelFromSequencePoint`.** Most common semantic bug — the contact gets re-enrolled in the funnel from the start instead of resuming past the goal. UI shows the same contact in the funnel twice with two different progress positions.
- **Hooking ordinary `init` priority for benchmark registration.** The block filters may still work when the editor opens, but the runtime listener can miss the `init:2` early pass. Subtler than the trigger version because the visible bug is "no contact ever passes the goal" rather than "trigger doesn't fire".
- **Returning `true` / `false` from `handle()` thinking it gates the funnel.** `handle()`'s return value is ignored. Match → call `startFunnelFromSequencePoint`. No match → return early; the funnel stays paused.
- **Forgetting `assertCurrentGoalState`.** Falls back to the BaseBenchMark default (returns `$asserted` unchanged) which means "no, the goal is never asserted from prior state". For tag-applied / list-applied / role-changed style benchmarks you almost certainly need a real implementation.
- **Treating `can_enter === 'yes'` as the default for all benchmarks.** It's the right default for "Tag Applied", "List Applied", "Course Completed" — anything where the goal CAUSES enrollment. For benchmarks like "Email Opened" inside a sequence that already started, you may want `'no'` so contacts who randomly open ANY email don't get inserted at the wait point.

## Cross-references

- Run **`fluentcrm-funnel-trigger`** for the trigger contract (the timing diagram lives there and applies here too).
- Run **`fluentcrm-funnel-action`** for actions (the per-step work nodes; benchmarks are wait/branch nodes between them).
- Run **`fluentcrm-rest-options`** when your benchmark uses `'rest_selector'` for option pickers.

## What this skill does NOT cover

- Funnel **conditions** (`funnel_condition` action — the if/else branch node). Different contract, related to but distinct from benchmarks.
- The **A/B testing** branching node (`funnel_ab_testing` — FluentCampaign Pro).
- Triggers (BaseTrigger). See `fluentcrm-funnel-trigger`.
- Actions (BaseAction). See `fluentcrm-funnel-action`.

## References

- BaseBenchMark contract — `app/Services/Funnel/BaseBenchMark.php`
- Resume entry point — `app/Services/Funnel/FunnelProcessor.php`
- Reference benchmark (Tag Applied) — `app/Services/Funnel/Benchmarks/TagAppliedBenchmark.php`
- Listener bootstrap + benchmark dispatch — `app/Hooks/Handlers/FunnelHandler.php`
- ResetFunnelIndexes (benchmark sequence discovery) — `app/Hooks/Handlers/FunnelHandler.php`
