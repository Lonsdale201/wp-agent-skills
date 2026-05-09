---
name: fluentcrm-funnel-trigger
description: Build a custom FluentCRM funnel trigger by extending
  BaseTrigger. Covers the four abstract methods (getTrigger,
  getFunnelSettingsDefaults, getSettingsFields, handle), the auto-injected
  __force_run_actions field, the canonical isProcessable / run_multiple /
  ifAlreadyInFunnel guard, the fluentcrm_funnel_will_process_{name}
  filter parity, source_trigger_name / source_ref_id metadata for
  FunnelProcessor::startFunnelSequence. Important — register on
  fluentcrm_loaded priority below 10, NEVER on fluent_crm/after_init.
  FunnelHandler::handle runs on fluentcrm_addons_loaded and locks in
  actionArgNum=1 if fluentcrm_funnel_arg_num_{name} is absent —
  multi-arg hooks like lw_lms_after_grant silently drop args past the
  first. Use when scaffolding a CRM integration. Triggers on BaseTrigger,
  fluentcrm_funnel_triggers, fluentcrm_funnel_start_,
  fluentcrm_funnel_arg_num_, FunnelProcessor, FunnelHelper,
  fluentcrm_funnel_settings, source_trigger_name.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "2.9.87"
api-stable-since: "2.7"
php-min: "7.4"
last-updated: "2026-05-10"
docs:
  - https://developers.fluentcrm.com/funnel-builder/custom-trigger/
source-refs:
  - app/Services/Funnel/BaseTrigger.php
  - app/Services/Funnel/FunnelProcessor.php
  - app/Services/Funnel/FunnelHelper.php
  - app/Hooks/Handlers/FunnelHandler.php
  - app/Hooks/actions.php
  - boot/app.php
---

# FluentCRM: register a custom funnel trigger

For developers building a companion plugin that needs to start a FluentCRM automation when something happens (course enrolled, SaaS webhook arrived, custom CPT published, third-party event). Extends `FluentCrm\App\Services\Funnel\BaseTrigger` and registers via the `fluentcrm_funnel_triggers` filter chain. This skill maps the contract verified end-to-end against FluentCRM 2.9.87 source, with the lifecycle order written out in full because **timing is where this contract silently breaks**.

## API stability note

The `BaseTrigger` abstract class, the `fluentcrm_funnel_triggers` / `fluentcrm_funnel_start_*` / `fluentcrm_funnel_editor_details_*` / `fluentcrm_funnel_arg_num_*` hook family, and the `FunnelProcessor::startFunnelSequence()` entry point have been stable across the 2.7+ line. The `fluentcrm_funnel_settings` option (the registry of trigger names FluentCRM listens on) and `FunnelHandler::resetFunnelIndexes()` are internal implementation details that have not changed shape since the FunnelHandler was introduced.

## Misconception this skill corrects

> "I'll register my trigger on `fluent_crm/after_init` like the other addons do — it's a clean post-boot hook."

Wrong hook. **`fluent_crm/after_init` runs on `init` priority 1000** ([boot/app.php:44-46](boot/app.php)). FluentCRM's own `FunnelHandler::handle` runs on `fluentcrm_addons_loaded` ([actions.php:76](actions.php)), which fires **immediately after** `fluentcrm_loaded` ([boot/app.php:41-42](boot/app.php)) — i.e. before any `init` hook. By the time `fluent_crm/after_init` fires, FunnelHandler has already read the trigger registry option and added action listeners to your trigger names, and it has already evaluated `apply_filters('fluentcrm_funnel_arg_num_{name}', 1)` ([FunnelHandler.php:75](FunnelHandler.php)) — **with your filter not yet registered**, so `$argNum` falls back to `1` and only the first argument from your hook ever reaches `handle()`.

The visible bug: a trigger like `lw_lms_after_grant` (which fires with 5 args) gets only `$user_id` delivered. `$courseId = (int) ($originalArgs[1] ?? 0)` becomes `0`. Any guard `if ($courseId <= 0) return;` silently drops every event.

The fix is one line: register on `fluentcrm_loaded` priority 5 instead of `fluent_crm/after_init`. FluentCampaign Pro's `IntegrationHandler` follows this pattern; that's why all its built-in triggers (Tutor LMS, LearnDash, LifterLMS, WishlistMember, Affiliate WP, Woo Subscriptions) work correctly.

Other AI-prone misconceptions:

- **"I'll fire `fluentcrm_funnel_start_{my_trigger}` directly to start the funnel."** No. That action is dispatched by `FunnelHandler::mapTriggers()` after it has already validated that a published funnel matches the trigger name. Calling it directly bypasses the funnel lookup, the per-funnel sequence config, and the benchmark dispatch. **Always go through `(new FunnelProcessor())->startFunnelSequence($funnel, $subscriberData, [...])`** at the end of your `handle()` method.
- **"`triggerName` is a label."** It is the **literal WP action hook name**. FluentCRM's FunnelHandler does `add_action($triggerName, ...)` ([FunnelHandler.php:76](FunnelHandler.php)). Either set `triggerName` to a real WP action that already fires (e.g. `tutor_after_enrolled`), or pick a custom name and fire `do_action('my_custom_event', $arg1, $arg2)` yourself from a bridge — see "Custom-name pattern" below.
- **"FluentCRM listens to my hook the moment my plugin loads."** Wrong. FluentCRM only adds a listener for trigger names present in the `fluentcrm_funnel_settings` WP option ([FunnelHandler.php:59-79](FunnelHandler.php)). That option is rebuilt by `resetFunnelIndexes()` ([FunnelHandler.php:144-170](FunnelHandler.php)), which runs when a funnel is created / updated / status-changed via `FunnelController`. **No published funnel using your trigger name → no listener → your trigger silently doesn't fire.** When you ship a new trigger, the user must publish (or re-save) at least one funnel using it before listeners exist.
- **"Setting `actionArgNum` is enough."** It is necessary but not sufficient. The integer is fed into a filter (`fluentcrm_funnel_arg_num_{name}`) registered by `BaseTrigger::register()`. The filter has to be in place **before** FunnelHandler reads it — see Misconception #1.
- **"I need to add the `__force_run_actions` toggle myself."** No — `BaseTrigger::prepareEditorDetails()` injects it automatically ([BaseTrigger.php:53-69](BaseTrigger.php)). Just declare your trigger-specific fields; the "Run actions even if contact is unsubscribed" toggle appears at the bottom of the settings panel for free.
- **"`isProcessable` is just business-logic filtering."** It also enforces the standard "If contact already in this funnel, skip / restart" semantics that every built-in trigger implements. Skip the `FunnelHelper::ifAlreadyInFunnel` guard and your trigger creates duplicate `FunnelSubscriber` rows on every event. See "Canonical isProcessable" below.

## When to use this skill

Trigger when ANY of the following is true:

- Building a companion plugin that needs to start a FluentCRM automation in response to a third-party event (LMS enrollment, SaaS webhook, CPT publish, payment processed, custom WP action).
- The diff/files reference `BaseTrigger`, `fluentcrm_funnel_triggers`, `fluentcrm_funnel_start_*`, `FunnelProcessor::startFunnelSequence`, `FunnelHelper::prepareUserData`, `FunnelHelper::ifAlreadyInFunnel`.
- Debugging "my trigger appears in the picker but the automation never runs" — almost always a timing issue (Misconception #1) or a missing-publish issue (Misconception #3).
- Reviewing code that hooks `fluent_crm/after_init` to register triggers.

## Lifecycle in one diagram

```
plugins_loaded:10            ← your plugin instantiates its bootstrap
        ↓
fluentcrm_loaded             ← do_action('fluentcrm_loaded') from boot/app.php:41
                               REGISTER TRIGGERS HERE (priority < 10)
        ↓
fluentcrm_addons_loaded      ← do_action('fluentcrm_addons_loaded') from boot/app.php:42
                               FunnelHandler::handle() runs (actions.php:76)
                                 → reads fluentcrm_funnel_settings option
                                 → for each saved trigger name:
                                     $argNum = apply_filters('fluentcrm_funnel_arg_num_'.$name, 1)
                                     add_action($name, ..., 10, $argNum)   ← LOCKED IN HERE
        ↓
init:1000                    ← do_action('fluent_crm/after_init') from boot/app.php:44-46
                               TOO LATE for argNum filters
        ↓
... runtime events fire ...
```

The single rule: **`fluentcrm_funnel_arg_num_{name}` filter must be in place before `fluentcrm_addons_loaded` fires.** The simplest way to guarantee that is to register your `BaseTrigger` subclass on `fluentcrm_loaded` priority 5 (or earlier).

## Step 1 — Register on the right hook

```php
<?php
namespace MyPlugin\Modules\Triggers;

use HelloWP\MyPlugin\Support\Dependency;
use HelloWP\MyPlugin\Settings\SettingsRepository;

final class TriggerManager
{
    public function __construct()
    {
        // CRITICAL — fluentcrm_loaded fires before fluentcrm_addons_loaded.
        // FunnelHandler::handle() runs on fluentcrm_addons_loaded and locks
        // in actionArgNum from the fluentcrm_funnel_arg_num_{name} filter at
        // that moment; if our BaseTrigger subclasses haven't registered yet
        // the filter doesn't exist, $argNum falls back to 1, and triggers
        // with multiple hook args break silently.
        add_action('fluentcrm_loaded', [$this, 'registerTriggers'], 5);
    }

    public function registerTriggers(): void
    {
        if (Dependency::isMyServiceActive() && SettingsRepository::isEnabled('triggers', 'my_event')) {
            new MyEventTrigger();
        }
    }
}
```

`new MyEventTrigger()` invokes the parent constructor, which calls `register()` ([BaseTrigger.php:14-33](BaseTrigger.php)) — that's where the four filter / action / arg-num registrations happen.

## Step 2 — Extend BaseTrigger

```php
<?php
namespace MyPlugin\Modules\Triggers;

use FluentCrm\App\Services\Funnel\BaseTrigger;
use FluentCrm\App\Services\Funnel\FunnelHelper;
use FluentCrm\App\Services\Funnel\FunnelProcessor;
use FluentCrm\Framework\Support\Arr;

final class MyEventTrigger extends BaseTrigger
{
    public function __construct()
    {
        // Real WP action — fired from somewhere else (your plugin, a third
        // party, WP core). FluentCRM will add_action() to this name.
        $this->triggerName  = 'my_plugin_thing_happened';

        // priority for the fluentcrm_funnel_triggers filter (controls picker order)
        $this->priority     = 12;

        // Argument count this hook fires with. Verified against the do_action
        // call site — see Step 4 if you control the dispatch.
        $this->actionArgNum = 3;

        parent::__construct();
    }

    public function getTrigger()
    {
        return [
            'category'    => __('My Service', 'my-plugin'),
            'label'       => __('Thing Happened', 'my-plugin'),
            'description' => __('Fires when "the thing" happens in My Service.', 'my-plugin'),
            'icon'        => 'fc-icon-trigger',
        ];
    }

    public function getFunnelSettingsDefaults()
    {
        return [
            'subscription_status' => 'subscribed',
        ];
    }

    public function getSettingsFields($funnel)
    {
        return [
            'title'     => __('Thing Happened (My Service)', 'my-plugin'),
            'sub_title' => __('Starts when My Service emits the event.',  'my-plugin'),
            'fields'    => [
                'subscription_status' => [
                    'type'        => 'option_selectors',
                    'option_key'  => 'editable_statuses',
                    'is_multiple' => false,
                    'label'       => __('Subscription Status', 'my-plugin'),
                    'placeholder' => __('Select Status', 'my-plugin'),
                ],
                'subscription_status_info' => [
                    'type'       => 'html',
                    'info'       => '<b>' . __('Pending status sends double-optin email.', 'my-plugin') . '</b>',
                    'dependency' => [
                        'depends_on' => 'subscription_status',
                        'operator'   => '=',
                        'value'      => 'pending',
                    ],
                ],
            ],
        ];
    }

    public function getFunnelConditionDefaults($funnel)
    {
        return [
            'update_type'  => 'update', // skip_all_actions | skip_update_if_exist | update
            'thing_ids'    => [],
            'run_multiple' => 'no',
        ];
    }

    public function getConditionFields($funnel)
    {
        return [
            'update_type' => [
                'type'    => 'radio',
                'label'   => __('If Contact Already Exists?', 'my-plugin'),
                'help'    => __('What happens when the contact is already in the database.', 'my-plugin'),
                'options' => FunnelHelper::getUpdateOptions(),
            ],
            'thing_ids' => [
                'type'        => 'rest_selector',
                'option_key'  => 'my_plugin_things',  // see fluentcrm-rest-options skill
                'is_multiple' => true,
                'label'       => __('Target Things', 'my-plugin'),
                'inline_help' => __('Leave blank to run on every event.', 'my-plugin'),
            ],
            'run_multiple' => [
                'type'        => 'yes_no_check',
                'label'       => '',
                'check_label' => __('Restart automation multiple times for the same contact.', 'my-plugin'),
                'inline_help' => __('Without this, contacts already in the funnel are skipped.', 'my-plugin'),
            ],
        ];
    }

    public function handle($funnel, $originalArgs)
    {
        $userId  = (int) ($originalArgs[0] ?? 0);
        $thingId = (int) ($originalArgs[1] ?? 0);

        if ($userId <= 0 || $thingId <= 0) {
            return;
        }

        $subscriberData = FunnelHelper::prepareUserData($userId);
        $subscriberData['source'] = __('My Service', 'my-plugin');

        if (empty($subscriberData['email']) || !is_email($subscriberData['email'])) {
            return;
        }

        $willProcess = $this->isProcessable($funnel, $thingId, $subscriberData);

        // Required parity with FluentCampaign Pro triggers — third-party
        // plugins use this filter to add their own gating without forking.
        $willProcess = apply_filters(
            'fluentcrm_funnel_will_process_' . $this->triggerName,
            $willProcess, $funnel, $subscriberData, $originalArgs
        );

        if (!$willProcess) {
            return;
        }

        // Merge funnel-level settings (subscription_status etc.) into subscriberData
        // and translate to the wire format FunnelProcessor expects.
        $subscriberData = wp_parse_args($subscriberData, $funnel->settings);
        $subscriberData['status'] = !empty($subscriberData['subscription_status'])
            ? $subscriberData['subscription_status']
            : 'subscribed';
        unset($subscriberData['subscription_status']);

        (new FunnelProcessor())->startFunnelSequence($funnel, $subscriberData, [
            'source_trigger_name' => $this->triggerName,
            'source_ref_id'       => $thingId,
        ]);
    }

    private function isProcessable($funnel, int $thingId, array $subscriberData): bool
    {
        $conditions = (array) $funnel->conditions;

        if (Arr::get($conditions, 'update_type') === 'skip_all_if_exist'
            && FunnelHelper::getSubscriber($subscriberData['email'])
        ) {
            return false;
        }

        $thingIds = Arr::get($conditions, 'thing_ids', []);
        if (!empty($thingIds) && !in_array($thingId, array_map('intval', (array) $thingIds), true)) {
            return false;
        }

        $subscriber = FunnelHelper::getSubscriber($subscriberData['email']);
        if ($subscriber && FunnelHelper::ifAlreadyInFunnel($funnel->id, $subscriber->id)) {
            $multipleRun = Arr::get($conditions, 'run_multiple') === 'yes';
            if ($multipleRun) {
                FunnelHelper::removeSubscribersFromFunnel($funnel->id, [$subscriber->id]);
            } else {
                return false;
            }
        }

        return true;
    }
}
```

## Step 3 — When to use a real WP action vs a custom one

Two valid shapes:

**Real WP action (preferred when one exists).** Set `$triggerName` to the action name a third-party plugin / WP core / your own plugin already fires. FluentCRM picks it up automatically:

```php
$this->triggerName  = 'tutor_after_enrolled';   // real Tutor LMS hook
$this->actionArgNum = 2;                        // matches do_action('tutor_after_enrolled', $courseId, $userId)
```

No bridging needed.

**Custom action with a bridge (for synthesised / filtered events).** When the underlying event needs filtering before the trigger runs (e.g. "only fire on order created, not on every status change"), pick a unique custom name and fire it yourself:

```php
// In a separate "dispatcher" class loaded on fluentcrm_loaded too:
add_action('woocommerce_new_order', function ($orderId, $order) {
    // Skip if no published funnel uses this trigger — saves DB lookups.
    $hasActiveFunnel = \FluentCrm\App\Models\Funnel::where('status', 'published')
        ->where('trigger_name', 'my_custom_woo_status_changed')
        ->exists();
    if (!$hasActiveFunnel) {
        return;
    }

    do_action('my_custom_woo_status_changed', $orderId, $order);
}, 22, 2);
```

The trigger class then listens on `my_custom_woo_status_changed` with `actionArgNum = 2`. Same lifecycle rules apply — register on `fluentcrm_loaded` priority 5.

## Step 4 — How FluentCRM connects the dots

Follow the chain:

1. Your `getTrigger()` return value is filtered into `fluentcrm_funnel_triggers` ([BaseTrigger.php:21](BaseTrigger.php)) — that's how the picker UI sees your trigger.
2. When the admin saves a funnel using your trigger name, `FunnelController` calls `FunnelHandler::resetFunnelIndexes()` which writes your trigger name into the `fluentcrm_funnel_settings` option ([FunnelHandler.php:144-170](FunnelHandler.php)).
3. On the next request, `FunnelHandler::handle()` reads that option and adds the listener: `add_action($triggerName, ..., 10, $argNum)` ([FunnelHandler.php:75-79](FunnelHandler.php)) where `$argNum = apply_filters('fluentcrm_funnel_arg_num_'.$triggerName, 1)`.
4. When `do_action($triggerName, ...args)` fires, the listener calls `mapTriggers()` which dispatches `do_action("fluentcrm_funnel_start_{$triggerName}", $funnel, $originalArgs)` ([FunnelHandler.php:120](FunnelHandler.php)).
5. That action is what `BaseTrigger::register()` listens on at `fluentcrm_funnel_start_{$triggerName}` ([BaseTrigger.php:25](BaseTrigger.php)) → invokes your `handle($funnel, $originalArgs)`.

Two important consequences:

- The trigger only fires for **published** funnels (`Funnel::where('status', 'published')` — [FunnelHandler.php:109](FunnelHandler.php)). Drafts do nothing.
- The listener is registered ONCE per request. Adding triggers later in the lifecycle (e.g. on `init`) means your filter wasn't there when `$argNum` was captured — see the timing diagram.

## Critical rules

- **Register on `fluentcrm_loaded` priority < 10.** Not `fluent_crm/after_init`. Not `init`. Not `plugins_loaded` directly (your plugin's bootstrap on `plugins_loaded` should set up the `add_action('fluentcrm_loaded', ...)` chain, not register triggers eagerly — FluentCRM may not be loaded yet on `plugins_loaded`).
- **`triggerName` is the WP action hook name**, not a label. Use the real third-party action when one exists; use a custom name + your own dispatcher when you need filtered events.
- **`actionArgNum` must match what `do_action()` actually passes.** If the hook fires with 5 args (e.g. `lw_lms_after_grant`), set 5; if it fires with 2, set 2. Wrong value = silently dropped args inside `handle()`.
- **Always go through `FunnelProcessor::startFunnelSequence`** ([FunnelProcessor.php:66](FunnelProcessor.php)) at the end of `handle()`. Never `do_action('fluentcrm_funnel_start_*')` yourself; FluentCRM's `mapTriggers` is the only legitimate caller.
- **Pass `source_trigger_name` and `source_ref_id`** in the third arg of `startFunnelSequence` — the funnel report UI keys off these to show "started by event X / ref Y".
- **Always implement the `ifAlreadyInFunnel` guard.** Without it, every event re-enrols the same contact and creates duplicate `FunnelSubscriber` rows. The canonical pattern is in Step 2; copy it verbatim and adjust the field reads.
- **Always include the `apply_filters('fluentcrm_funnel_will_process_' . $triggerName, ...)` line.** Third-party plugins (and your own future code) use this filter to gate execution; missing it breaks the parity with FluentCampaign Pro triggers and surprises integrators.
- **`__force_run_actions` is auto-injected by BaseTrigger.** Don't redeclare it. Don't reference its semantics in your settings UI either — the parent class adds the toggle and its inline help.
- **Tell the user to (re)publish the funnel after install.** A new trigger doesn't appear in the listener registry until at least one funnel using it is published. The first time you ship the trigger, instruct the admin to open the funnel in the editor and click Save / Update — that triggers `resetFunnelIndexes()`.
- **Status string canon is `'complete'`, not `'completed'`.** Doesn't apply to triggers (it applies to actions — see `fluentcrm-funnel-action`), but your trigger may dispatch into actions later, and the canon is shared.
- **Plugin-presence detection MUST use a file-load-time symbol** — a top-level class declared in the dependency's main file (`class_exists('TopLevelClass')`) or a constant `define()`'d at file scope (`defined('CONST_NAME')`). NEVER `function_exists('helper')` — those helpers are typically declared inside the dependency's own `plugins_loaded` callback. Two plugins on `plugins_loaded:10` run in registration order (non-deterministic), so a function-based check passes when the dep loaded first and fails when it loaded second — the trigger silently disappears from the picker on half the requests. If the dep's main class only exists post-init, find a top-level loader/registrar (e.g. WC Memberships exposes `WC_Memberships_Loader` at file scope while `WC_Memberships` itself is loaded inside `init_plugin()`).

## Common mistakes

- **Hooking `init` priority N for trigger registration.** Catches the editor side (the trigger appears in the picker) but loses the runtime side (argnum filter too late, `__force_run_actions` field appears but every multi-arg event drops args silently).
- **Forgetting the dispatcher class for custom-name triggers.** The trigger class registers FluentCRM's listeners, but FluentCRM doesn't fire your custom hook. You need a separate small class hooked on the underlying event that calls `do_action('my_custom_event', ...)`.
- **`prepareUserData(0)` for guest events.** `prepareUserData` is fine with `0` — it returns an empty array — but you must merge an explicit `email` into the result yourself before checking `is_email`. Otherwise you drop guest-driven events that have a valid email but no WP user (e.g. anonymous review submissions, public form integrations).
- **Hardcoding `subscription_status = 'subscribed'`.** The admin sets this per-funnel via the auto-injected status field; respect it. The settings merge in `handle()` (`wp_parse_args($subscriberData, $funnel->settings)`) is what wires it through.
- **Not gating the dispatcher with `Funnel::where('status', 'published')`.** Without the gate, your dispatcher does work on every event even when no automation listens. Cheap to check, common-sense optimisation.
- **Storing trigger-specific state in `$funnel->settings` vs `$funnel->conditions`.** `settings` = funnel-level config that maps onto subscriber data (status, source). `conditions` = per-event gating (target IDs, run_multiple). Get the split wrong and the editor renders fields in the wrong panel.
- **Using `function_exists()` for dep detection at registration time.** The classic load-order race — the helper function is declared inside the dep's own `plugins_loaded` callback, which may or may not have run by the time your `fluentcrm_loaded:5` listener fires. Symptom: the trigger appears in the picker on some installs / page loads and not others. Fix: switch to a file-scope `class_exists` or `defined` check (see Critical rules).

## Cross-references

- Run **`fluentcrm-funnel-action`** when you need to add a custom block in the funnel sequence (an action that fires per step, not per event).
- Run **`fluentcrm-rest-options`** when your trigger or action uses `'type' => 'rest_selector'` for option pickers — you'll need to register the corresponding `fluentcrm_ajax_options_{key}` filter.
- See **`fluentcrm-overview`** (when written) for the full lifecycle / Free vs Pro / file map context.

## What this skill does NOT cover

- Building custom funnel **actions** (BaseAction) — see `fluentcrm-funnel-action`.
- Building custom **benchmarks** (BaseBenchMark, the "wait for X" branching nodes) — separate contract, separate registration filter.
- Custom **smart codes** / template tags (`{{my_code.foo}}`).
- The `fluent_crm/contact_*` lifecycle hooks (subscriber state changes outside the funnel system).
- Free vs Pro feature splits — the trigger contract is identical in both, only the editor UI varies.
- Block-editor email templates / styling — out of scope for the funnel layer.

## References

- [FluentCRM developer docs — custom triggers](https://developers.fluentcrm.com/funnel-builder/custom-trigger/)
- BaseTrigger contract — `app/Services/Funnel/BaseTrigger.php`
- FunnelProcessor entry point — `app/Services/Funnel/FunnelProcessor.php:66`
- Helper utilities (prepareUserData, ifAlreadyInFunnel, getUpdateOptions, removeSubscribersFromFunnel, getSubscriber, maybeExplodeFullName) — `app/Services/Funnel/FunnelHelper.php`
- Listener bootstrap + `mapTriggers` — `app/Hooks/Handlers/FunnelHandler.php`
- Bootstrap order (`fluentcrm_loaded` → `fluentcrm_addons_loaded` → `fluent_crm/after_init`) — `boot/app.php:41-46`
- `FunnelHandler@handle` registration on `fluentcrm_addons_loaded` — `app/Hooks/actions.php:76`
- Reference Pro trigger (canonical pattern) — `fluentcampaign-pro/app/Services/Integrations/TutorLms/CourseEnrollTrigger.php`
