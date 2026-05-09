---
name: fluentcrm-overview
description: Orient skill for FluentCRM extension development. Covers the
  Free / Pro split (FluentCRM = funnel chassis; FluentCampaign Pro =
  integrations + advanced actions / benchmarks), plugin paths and
  constants, the bootstrap order (fluentcrm_loaded →
  fluentcrm_addons_loaded → fluent_crm/after_init), the model layer
  (Subscriber, Funnel, FunnelSequence, FunnelSubscriber, FunnelMetric),
  the global helpers (FluentCrmApi, fluentCrmDb, FunnelHelper), the
  contact lifecycle hooks (fluent_crm/contact_created, _updated,
  _email_changed, _custom_data_updated), the smart-code extension filter
  (fluent_crm/extended_smart_codes), and a decision matrix for picking
  the right extension contract. Use when scaffolding a new FluentCRM
  integration, choosing which contract to extend, or asking where
  things live. Triggers on FluentCrmApi, fluentCrmDb, FunnelHelper,
  fluent_crm/contact_, fluent_crm/extended_smart_codes, FLUENTCRM,
  FLUENTCAMPAIGN.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "2.9.87"
api-stable-since: "2.7"
php-min: "7.4"
last-updated: "2026-05-10"
docs:
  - https://developers.fluentcrm.com/
source-refs:
  - fluent-crm.php
  - boot/app.php
  - app/Functions/helpers.php
  - app/Models/Subscriber.php
  - app/Services/Helper.php
  - app/Api/Classes/Extender.php
---

# FluentCRM: developer overview

Pick this skill first when starting a new FluentCRM extension or when you don't yet know which contract to extend. It's the orient layer; it doesn't teach any single extension point in depth — it lays out the file map and points you at the focused skills (`fluentcrm-funnel-trigger`, `fluentcrm-funnel-action`, `fluentcrm-funnel-benchmark`, `fluentcrm-rest-options`).

## Plugin identity

| Field | Value | Source |
|--|--|--|
| Slug | `fluent-crm` | header |
| Version | `2.9.87` | [fluent-crm.php:6](fluent-crm.php) |
| Pro slug | `fluentcampaign-pro` | header |
| Pro version | `2.9.86` | [fluentcampaign-pro.php](fluentcampaign-pro.php) |
| Boot constant | `FLUENTCRM` ('fluentcrm') | [fluent-crm.php:20](fluent-crm.php) |
| Pro constant | `FLUENTCAMPAIGN_PLUGIN_VERSION` | [fluentcampaign-pro.php](fluentcampaign-pro.php) |
| Path constant (Free) | `FLUENTCRM_PLUGIN_PATH` | [fluent-crm.php:22](fluent-crm.php) |
| Path constant (Pro) | `FLUENTCAMPAIGN_PLUGIN_PATH` | [fluentcampaign-pro.php:20](fluentcampaign-pro.php) |
| Min PHP (verified) | 7.4 | composer.json |

**Active-detection** — never test for `class_exists('FluentCRM')` (no such class). Use:

```php
public static function isFluentCRMActive(): bool {
    return defined('FLUENTCRM');
}

public static function isFluentCRMProActive(): bool {
    return defined('FLUENTCAMPAIGN_PLUGIN_VERSION')
        && version_compare(FLUENTCAMPAIGN_PLUGIN_VERSION, '2.8.0', '>=');
}
```

(The `2.8.0` floor is the BaseTrigger / BaseAction lifecycle stability point. Drop it if your code only uses model APIs.)

### Active-detection canon for OTHER plugins (load-order trap)

Triggers / actions / benchmarks register on `fluentcrm_loaded:5`, which fires from FluentCRM's own `plugins_loaded:10` callback. Any dep check in your registrar runs at that point — and **only** symbols declared at FILE LOAD are guaranteed available. WordPress runs `plugins_loaded:10` callbacks in plugin registration order (non-deterministic across installs), so any symbol that's only set up INSIDE another plugin's `plugins_loaded` callback is racy.

**Safe** (declared at file load — top-level scope, no conditional require):

| Plugin | Use | Why |
|--|--|--|
| WooCommerce | `class_exists('WooCommerce')` | `woocommerce.php` includes `class-woocommerce.php` at file scope |
| FluentCampaign Pro | `defined('FLUENTCAMPAIGN_PLUGIN_VERSION')` | `fluentcampaign-pro.php` requires `fluentcampaign_boot.php` at file scope, which `define()`s the constant |
| WC Memberships | `class_exists('WC_Memberships_Loader')` | top-level loader class, `WC_Memberships` itself is loaded inside `init_plugin()` and is racy |
| LW LMS | `class_exists('LightweightPlugins\\LMS\\Plugin')` | autoloader registered at file scope |
| Jet Engine | `class_exists('Jet_Engine')` | top-level class declaration |

**Unsafe** (declared inside the dep's own callback — DO NOT use at registration time):

```php
// WRONG — wc_memberships() function is declared inside Memberships's
// plugins_loaded:10 callback. If your registrar runs before Memberships's
// callback, function_exists returns false and your action is silently
// excluded from the editor.
return function_exists('wc_memberships');

// RIGHT — WC_Memberships_Loader is at file scope.
return class_exists('WC_Memberships_Loader');
```

If the dep's main object only exists post-init, find a top-level loader/registrar to test against (every well-formed plugin has one).

## Free vs Pro at a glance

| Capability | Free (FluentCRM) | Pro (FluentCampaign) |
|--|--|--|
| Contacts, lists, tags, segments | Yes | Yes |
| Email campaigns, sequences, templates | Yes | Yes |
| Forms, opt-ins | Yes | Yes |
| Funnel **triggers** (BaseTrigger) | Yes — register from any plugin | Yes — many built-in (Tutor, LearnDash, LifterLMS, EDD, WishlistMember, AffiliateWP, Woo Subscriptions) |
| Funnel **actions** (BaseAction) | Yes — register from any plugin | Yes — many built-in (advanced Woo, sequence add/remove, custom field updates) |
| Funnel **benchmarks** (BaseBenchMark) | Yes — register from any plugin | Yes — additional built-ins |
| Conditional / A-B branching node | No | Yes |
| Companies module | Yes | Yes |
| Webhook receiver / sender | Yes | Yes |
| SMTP / mail driver layer | Free uses WP mail / Fluent SMTP | Pro adds advanced reporting |

The four extension contracts (trigger, action, benchmark, smart code) are **all in Free**. Pro is mostly built-in integrations + UI features. A companion plugin extending Free works against Pro automatically.

## Bootstrap order

```
plugins_loaded:10           ← your plugin instantiates its bootstrap
        ↓
fluentcrm_loaded            ← do_action('fluentcrm_loaded') from boot/app.php:41
                              REGISTER triggers / actions / benchmarks HERE (priority < 10)
                              FluentCampaign Pro's IntegrationHandler runs here too
        ↓
fluentcrm_addons_loaded     ← do_action('fluentcrm_addons_loaded') from boot/app.php:42
                              FunnelHandler::handle runs (actions.php:76)
                                 → reads fluentcrm_funnel_settings option
                                 → for each saved trigger name:
                                     $argNum = apply_filters('fluentcrm_funnel_arg_num_'.$name, 1)
                                     add_action($name, ..., 10, $argNum)   ← LOCKED IN
        ↓
init:1000                   ← do_action('fluent_crm/after_init') from boot/app.php:44-46
                              TOO LATE for argNum filters
        ↓
... runtime events fire ...
```

**The single timing rule** — register every trigger / action / benchmark on `fluentcrm_loaded` priority < 10. Hooking on `fluent_crm/after_init` or `init` causes silent multi-arg drops. See `fluentcrm-funnel-trigger` for the explanation.

## File map

```
fluent-crm/
├── fluent-crm.php                   ← header + bootstrap entry
├── boot/
│   ├── app.php                      ← framework init, fluentcrm_loaded / addons_loaded dispatch
│   └── …
├── app/
│   ├── Api/
│   │   ├── Classes/Extender.php     ← public API surface (smart code extender, contact API)
│   │   └── Classes/Contact.php      ← fluentCrmApi('contacts') backend
│   ├── Functions/helpers.php        ← FluentCrmApi(), fluentCrmDb(), fluentCrmTimestamp(), …
│   ├── Hooks/
│   │   ├── actions.php              ← built-in `add_action` registrations
│   │   ├── filters.php
│   │   └── Handlers/                ← Funnel, Subscriber, Campaign, etc. handlers
│   ├── Http/Controllers/            ← REST endpoints (FunnelController, OptionsController, …)
│   ├── Models/                      ← Subscriber, Funnel, FunnelSequence, …
│   ├── Services/
│   │   ├── Funnel/
│   │   │   ├── BaseTrigger.php
│   │   │   ├── BaseAction.php
│   │   │   ├── BaseBenchMark.php
│   │   │   ├── FunnelProcessor.php
│   │   │   └── FunnelHelper.php
│   │   ├── Helper.php
│   │   └── Libs/Parser/             ← smart code parser
│   └── Views/
└── ...

fluentcampaign-pro/
├── fluentcampaign-pro.php
└── app/
    ├── Hooks/Handlers/IntegrationHandler.php   ← initFunnelActions / initBenchmarks / initTriggers
    └── Services/Integrations/
        ├── TutorLms/CourseEnrollTrigger.php    ← canonical trigger reference
        ├── TutorLms/AddToCourseAction.php      ← canonical action reference
        ├── WooCommerce/                        ← deep Woo integration
        ├── LearnDash/, LifterLms/, EDD/, AffiliateWP/, WishlistMember/
        └── …
```

## Models you will touch

| Model | Class | Notes |
|--|--|--|
| Subscriber | `FluentCrm\App\Models\Subscriber` | Core contact. `getWpUserId()`, `tags`, `lists`, `email`, `status` |
| Funnel | `FluentCrm\App\Models\Funnel` | An automation. `status` ∈ `{published, draft, archived}` |
| FunnelSequence | `FluentCrm\App\Models\FunnelSequence` | A step inside a funnel. `action_name` keys into your block. `type` ∈ `{action, benchmark, conditional}` |
| FunnelSubscriber | `FluentCrm\App\Models\FunnelSubscriber` | Join: contact <-> funnel. Tracks current sequence position |
| FunnelMetric | `FluentCrm\App\Models\FunnelMetric` | Per-step audit row. `status` ∈ `{pending, complete, skipped, failed}` |
| Tag | `FluentCrm\App\Models\Tag` | Many-to-many with Subscriber via SubscriberPivot |
| Lists | `FluentCrm\App\Models\Lists` | Same |
| Webhook | `FluentCrm\App\Models\Webhook` | Inbound webhook receivers |

The status string canon is **`'complete'`, NOT `'completed'`** — see `fluentcrm-funnel-action` for the gotcha.

## Global helpers

```php
// API surface — preferred over direct Model writes
FluentCrmApi('contacts')->createOrUpdate($data);
FluentCrmApi('contacts')->getContact($emailOrId);

// Database query builder — bypasses Eloquent for raw queries
fluentCrmDb()->table('fc_subscribers')->where('email', $email)->first();

// FunnelHelper — the single most-used utility from companion plugins
FunnelHelper::prepareUserData($wpUserId);             // builds $subscriberData skeleton
FunnelHelper::getSubscriber($emailOrUserId);          // resolves Subscriber model
FunnelHelper::ifAlreadyInFunnel($funnelId, $subId);   // dedupe guard
FunnelHelper::removeSubscribersFromFunnel($funnelId, $subIds);  // restart helper
FunnelHelper::getUpdateOptions();                     // canonical "if exists" radio options
FunnelHelper::changeFunnelSubSequenceStatus($funnelSubId, $sequenceId, 'complete');
FunnelHelper::maybeExplodeFullName($subscriberData);  // splits "John Doe" → first/last name
FunnelHelper::createWpUserFromSubscriber($subscriber, $sendWelcomeEmail);
```

`FluentCrmApi`, `fluentCrmDb`, `FluentCrm` (service container) all defined at [helpers.php](helpers.php).

## Contact lifecycle hooks

Every contact-state change fires both a legacy underscore-named action AND a new slash-named action (introduced in 2.8). Hook the slash version in new code; the underscore versions are deprecated but still fire for backwards compatibility:

| Modern hook | Legacy alias (deprecated) | Args | Source |
|--|--|--|--|
| `fluent_crm/contact_created` | `fluentcrm_contact_created` | `$subscriber` | [Subscriber.php:970-971, 1145-1146](Subscriber.php) |
| `fluent_crm/contact_updated` | `fluentcrm_contact_updated` | `$subscriber, $dirtyFields` | [Subscriber.php:1006-1007, 1148](Subscriber.php) |
| `fluent_crm/contact_email_changed` | (no alias) | `$subscriber, $oldEmail` | [Subscriber.php:1095](Subscriber.php) |
| `fluent_crm/contact_custom_data_updated` | `fluentcrm_contact_custom_data_updated` | `$newValues, $subscriber, $updateValues` | [Subscriber.php:669-670](Subscriber.php) |

Useful when you need to react to subscriber state independent of funnels — e.g. mirror contact data to an external CRM.

## Smart-code extension

Custom template tags like `{{my_plugin.foo}}` register through the `fluent_crm/extended_smart_codes` filter ([Helper.php:329](Helper.php), [Extender.php:108](Extender.php)). The `Extender` API:

```php
FluentCrmApi('extender')->addSmartCode(
    'my_plugin',                                    // namespace key
    __('My Plugin Tokens', 'my-plugin'),            // group title
    [
        'my_plugin.contact_score' => 'Contact Score',
        'my_plugin.last_purchase' => 'Last Purchase Date',
    ],
    function ($code, $valueKey, $defaultValue, $subscriber) {
        // Resolve $valueKey for $subscriber. Return string.
        if ($valueKey === 'contact_score') {
            return (string) get_user_meta($subscriber->user_id, 'my_score', true);
        }
        return $defaultValue;
    }
);
```

Smart codes are evaluated at email render time AND inside dynamic field tokens for actions like "Update Custom Field". Fallback for unknown codes is `apply_filters('fluentcrm_smartcode_fallback', $matches[0], $subscriber)` — useful for legacy `{{tag}}` shapes.

## Funnel layer architecture

```
                ┌──────────────────────────────────────────┐
                │  Trigger fires (a real WP action)        │
                │  e.g. lw_lms_after_grant, tutor_after_   │
                │       enrolled, woocommerce_new_order    │
                └────────────────────┬─────────────────────┘
                                     │
                ┌────────────────────▼─────────────────────┐
                │  FunnelHandler::mapTriggers              │
                │  (FunnelHandler.php:105-141)             │
                │  - looks up published funnels with       │
                │    matching trigger_name                 │
                │  - dispatches fluentcrm_funnel_start_*   │
                │  - looks up published BENCHMARK          │
                │    sequences with matching action_name   │
                │  - dispatches fluentcrm_funnel_benchmark_│
                │    start_*                               │
                └────────┬──────────────────────┬──────────┘
                         │                      │
              ┌──────────▼──────────┐  ┌────────▼──────────┐
              │ BaseTrigger::handle │  │ BaseBenchMark::    │
              │  → startFunnelSequ- │  │  handle            │
              │    ence (NEW run)   │  │  → startFunnelFrom │
              │                     │  │    SequencePoint   │
              │                     │  │    (RESUME)        │
              └──────────┬──────────┘  └────────┬──────────┘
                         │                      │
                    ┌────▼──────────────────────▼────┐
                    │ FunnelProcessor::processSequence│
                    │ (loops over sequence steps)     │
                    │  - sequence type 'action'       │
                    │      → fluentcrm_funnel_        │
                    │        sequence_handle_*        │
                    │      → BaseAction::handle()     │
                    │  - sequence type 'benchmark'    │
                    │      → wait                     │
                    │  - sequence type 'conditional'  │
                    │      → branch (Pro)             │
                    └─────────────────────────────────┘
```

## Decision matrix — pick the right contract

| You want to... | Extend |
|--|--|
| Start an automation when X happens | **Trigger** — `fluentcrm-funnel-trigger` |
| Do work for a contact at a sequence step | **Action** — `fluentcrm-funnel-action` |
| Pause the funnel until X happens, then resume | **Benchmark** — `fluentcrm-funnel-benchmark` |
| Add a multi-select picker field to any of the above | **REST options filter** — `fluentcrm-rest-options` |
| Add `{{my_code.foo}}` template tags | **Smart code extender** — see "Smart-code extension" above |
| React to contact state without a funnel | **Contact lifecycle hooks** — see table above |
| Add a custom REST endpoint | **WP REST API** — FluentCRM has no special wrapper; use `register_rest_route` |
| Add a custom contact field | FluentCRM admin → Settings → Contact Custom Fields. No code path. |

## Critical rules

- **Always hook `fluentcrm_loaded` priority < 10 for trigger / action / benchmark registration.** The single most-bitten timing trap.
- **Always seed `'settings'` in `getBlock()` for actions and benchmarks.** One key per `getBlockFields()['fields']` key. Without it the editor renders an empty panel and the JS console throws `TypeError: Cannot read properties of undefined`. Triggers don't have this trap (defaults come from the abstract `getFunnelSettingsDefaults()` / `getFunnelConditionDefaults()` methods).
- **Status string canon is `'complete'`** (not `'completed'`). Applies to every `changeFunnelSubSequenceStatus` and `$funnelMetric->status`.
- **Use `getWpUserId()` not `->user_id`** when reading the WP user from a `Subscriber` instance.
- **Use `FluentCrmApi('contacts')->createOrUpdate()`** rather than directly instantiating `Subscriber` model in companion code. The API encapsulates list/tag attachment, double-optin handling, and lifecycle hook firing.
- **Pin Pro version detection on `2.8.0`** if you depend on the modern lifecycle. Older Pro releases predate stable BaseAction semantics.
- **Don't catch `fluentcrm_funnel_start_*` directly.** Always go through BaseTrigger; FluentCRM may add validation around that hook in future versions, and going around BaseTrigger means missing `prepareEditorDetails` (`__force_run_actions` injection, etc.).
- **Plugin-presence detection MUST use a file-load-time symbol.** `class_exists('TopLevelClassFromMainFile')` or `defined('CONST_NAME')`. NEVER `function_exists()` for symbols declared inside another plugin's `plugins_loaded` callback — non-deterministic load order makes the check pass on some installs and fail on others. See "Active-detection canon" above for the per-plugin canonical list.

## Common mistakes

- **Confusing the underscore vs slash hook variants** — both fire today, but `fluentcrm_*` is on the deprecation track. New integrations should hook `fluent_crm/*`.
- **Reaching for `class_exists('FluentCRM')`** to detect the plugin. There's no such class. Use `defined('FLUENTCRM')`.
- **Bootstrap-instantiating triggers / actions on `plugins_loaded`** without the `fluentcrm_loaded` indirection. FluentCRM may not be loaded yet at `plugins_loaded`; even if it is, your `BaseTrigger::register()` runs before FluentCRM's own boot, so the filters target an environment that isn't fully wired.
- **Calling internal model methods like `Subscriber::find()` from outside FluentCRM**. Stable, but the model behaviour changes between minor versions. Prefer `FluentCrmApi('contacts')->getContact()` for reads.
- **Using `function_exists('helper_fn')` to gate dep-aware registration.** The classic load-order race — works on installs where the dep loads first, silently breaks on installs where it loads second. Symptom: trigger / action appears in the editor on some sites and not others, no error. Always use the file-scope class / constant canon listed in "Active-detection canon".
- **Pro-gating an action that doesn't actually need Pro.** `BaseAction` is in FluentCRM Free — many integration actions work without Pro. Only require `isFluentCRMProActive()` when the action genuinely uses Pro-only APIs (advanced reporting, sequence email scheduling, conditional branching).

## Cross-references

- Run **`fluentcrm-funnel-trigger`** for the trigger contract + the timing-trap deep dive.
- Run **`fluentcrm-funnel-action`** for the action contract + status-string canon.
- Run **`fluentcrm-funnel-benchmark`** for benchmark / goal-point contract.
- Run **`fluentcrm-rest-options`** for the `rest_selector` option filter pattern.

## What this skill does NOT cover

- Email-campaign rendering / templates.
- The block-editor email designer.
- Webhook receiver / sender configuration.
- Pro-only branching (conditional / A-B test) — separate contract.
- SMTP / mail driver integration.
- The CRM admin UI / Vue app.

## References

- [FluentCRM developer docs root](https://developers.fluentcrm.com/)
- Plugin entry — `fluent-crm.php`
- Bootstrap order — `boot/app.php:41-46`
- Model layer index — `app/Models/`
- Funnel services — `app/Services/Funnel/`
- Global helpers — `app/Functions/helpers.php`
- Pro integration handler — `fluentcampaign-pro/app/Hooks/Handlers/IntegrationHandler.php`
- Reference Pro trigger — `fluentcampaign-pro/app/Services/Integrations/TutorLms/CourseEnrollTrigger.php`
- Reference Pro action — `fluentcampaign-pro/app/Services/Integrations/TutorLms/AddToCourseAction.php`
