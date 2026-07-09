---
name: fluentcrm-smartcodes-segments
description: Add and parse FluentCRM 3.x SmartCodes and build Pro dynamic contact segments. Covers FluentCrmApi('extender')->addSmartCode, parser syntax, fallback/default values, transformers, funnel context smart codes, dynamic segment filters, and ContactsQuery advanced filter providers. Use when a plugin exposes custom merge tags, parses personalized text, adds automation context values, registers dynamic segments, or extends advanced contact filtering. Triggers on addSmartCode, fluent_crm/extended_smart_codes, fluent_crm/smartcode_group_callback_, Parser::parse, fluent_crm_funnel_context_smart_codes, fluentcrm_dynamic_segments, fluentcrm_dynamic_segment_, fluentcrm_contacts_filter_.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: fluent-crm
plugin-version-tested: "FluentCRM 3.1.8 + FluentCRM Pro 3.1.8"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-09"
docs:
  - https://developers.fluentcrm.com/modules/smart-code
  - https://developers.fluentcrm.com/helpers/parser
  - https://developers.fluentcrm.com/database/orm/
source-refs:
  - wp-content/plugins/fluent-crm/app/Api/config.php
  - wp-content/plugins/fluent-crm/app/Api/Classes/Extender.php
  - wp-content/plugins/fluent-crm/app/Hooks/filters.php
  - wp-content/plugins/fluent-crm/app/Services/Helper.php
  - wp-content/plugins/fluent-crm/app/Services/Libs/Parser/Parser.php
  - wp-content/plugins/fluent-crm/app/Services/Libs/Parser/ShortcodeParser.php
  - wp-content/plugins/fluent-crm/app/Http/Controllers/FunnelController.php
  - wp-content/plugins/fluent-crm/app/Services/ContactsQuery.php
  - wp-content/plugins/fluentcampaign-pro/app/Http/Controllers/DynamicSegmentController.php
  - wp-content/plugins/fluentcampaign-pro/app/Services/DynamicSegments/BaseSegment.php
  - wp-content/plugins/fluentcampaign-pro/app/Services/DynamicSegments/CustomSegment.php
---

# FluentCRM: SmartCodes and dynamic segments

Use this skill when a plugin needs to expose custom values inside FluentCRM emails, automation fields, templates, or Pro dynamic segments. Keep SmartCode parsing read-only and privacy-aware; these values can appear in outgoing emails.

Verification note: SmartCode registration and parsing are core FluentCRM 3.1.8 behavior. Dynamic segments are Pro behavior verified against local FluentCampaign Pro 3.1.8.

## When to use this skill

- Adding custom merge tags such as `{{my_plugin.plan_name}}`.
- Parsing personalized FluentCRM text outside the normal campaign send path.
- Adding context SmartCodes to automation editors for order, booking, LMS, or other event data.
- Registering a Pro dynamic segment or advanced contact filter provider.
- Reviewing code that hooks `fluent_crm/extended_smart_codes`, `fluent_crm/smartcode_group_callback_*`, `fluentcrm_dynamic_segments`, or `fluentcrm_contacts_filter_*`.

## Register SmartCodes

Use the public Extender API after FluentCRM init:

```php
add_action('fluent_crm/after_init', function () {
    if (!function_exists('FluentCrmApi')) {
        return;
    }

    FluentCrmApi('extender')->addSmartCode(
        'my_plugin',
        'My Plugin',
        [
            'plan_name'    => 'Plan Name',
            'renewal_date' => 'Renewal Date',
        ],
        function ($code, $valueKey, $defaultValue, $subscriber) {
            $userId = $subscriber ? (int) $subscriber->getWpUserId() : 0;
            if (!$userId) {
                return $defaultValue;
            }

            if ($valueKey === 'plan_name') {
                return get_user_meta($userId, 'my_plugin_plan', true) ?: $defaultValue;
            }

            if ($valueKey === 'renewal_date') {
                $date = get_user_meta($userId, 'my_plugin_renewal_date', true);
                return $date ? date_i18n(get_option('date_format'), strtotime($date)) : $defaultValue;
            }

            return $defaultValue;
        }
    );
});
```

The API key is `extender` in `app/Api/config.php`. `Extender.php` has an older docblock mentioning `extend`; use the registered config key unless you have runtime-tested an alias.

`addSmartCode()` adds UI metadata through `fluent_crm/extended_smart_codes` and parser behavior through `fluent_crm/smartcode_group_callback_{key}`. Its callback signature is:

```php
function ($code, $valueKey, $defaultValue, $subscriber) {
    return $defaultValue;
}
```

Do not use reserved group keys: `crm`, `other`, `contact`, `wp`, `fluentcrm`, `user`, `learndash`, `tutorlms`, `aff_wp`, `edd_customer`, `lifterlms`, `woo_customer`.

## Parser behavior

FluentCRM parses both syntaxes:

```text
{{group.key}}
##group.key##
```

Defaults use one pipe:

```text
{{contact.first_name|Friend}}
```

Transformers use double pipe:

```text
{{contact.first_name||ucfirst}}
{{contact.email||strtolower}}
```

Supported local transformers in 3.1.8 include `trim`, `ucfirst`, `strtolower`, `strtoupper`, `ucwords`, `concat_first`, `concat_last`, and `show_if`.

When rendering custom text yourself, use the same filter FluentCRM uses:

```php
$body = apply_filters('fluent_crm/parse_campaign_email_text', $body, $subscriber);
```

or call the parser directly:

```php
use FluentCrm\App\Services\Libs\Parser\Parser;

$body = Parser::parse($body, $subscriber);
```

Do not manually replace CRM unsubscribe and manage-subscription URLs early. `ShortcodeParser` intentionally leaves `crm.unsubscribe_url`, `crm.manage_subscription_url`, `crm.unsubscribe_html`, and `crm.manage_subscription_html` for a later parsing pass in email/external-page flows.

## Funnel context SmartCodes

Use `fluent_crm_funnel_context_smart_codes` when a SmartCode should appear only for specific automation trigger contexts.

```php
add_filter('fluent_crm_funnel_context_smart_codes', function ($codes, $triggerName, $funnel) {
    if ($triggerName !== 'my_plugin_event') {
        return $codes;
    }

    $codes[] = [
        'key'        => 'my_event',
        'title'      => 'My Event',
        'shortcodes' => [
            '{{my_event.name}}' => 'Event Name',
            '{{my_event.id}}'   => 'Event ID',
        ],
    ];

    return $codes;
}, 10, 3);
```

If context values depend on the current automation run, parse through your group callback and read `$subscriber->funnel_subscriber_id` when available. Built-in Woo parsers load `FunnelSubscriber::find($subscriber->funnel_subscriber_id)` and use `source_trigger_name` plus `source_ref_id` to resolve the current order or subscription. Always return `$defaultValue` if context is missing.

## Dynamic segments

Dynamic segments are Pro features. Register visible segment metadata with `fluentcrm_dynamic_segments`, and return a Subscriber-shaped query model from `fluentcrm_dynamic_segment_{slug}` when called with `model => true`.

```php
use FluentCrm\App\Models\Subscriber;

add_filter('fluentcrm_dynamic_segments', function ($segments) {
    $segments[] = [
        'id'          => 0,
        'slug'        => 'my_plugin_vip',
        'title'       => 'My Plugin VIP Contacts',
        'subtitle'    => 'Contacts with VIP flag in My Plugin',
        'is_system'   => true,
        'description' => 'Dynamic segment from My Plugin data.',
    ];

    return $segments;
});

add_filter('fluentcrm_dynamic_segment_my_plugin_vip', function ($segment, $segmentId, $config) {
    $model = Subscriber::where('status', 'subscribed')
        ->where('source', 'my-plugin');

    $segment = [
        'id'          => $segmentId,
        'slug'        => 'my_plugin_vip',
        'title'       => 'My Plugin VIP Contacts',
        'is_system'   => true,
        'description' => 'Dynamic segment from My Plugin data.',
    ];

    if (!empty($config['model'])) {
        $segment['model'] = $model;
    }

    if (!empty($config['contact_count'])) {
        $segment['contact_count'] = $model->count();
    }

    if (!empty($config['subscribers'])) {
        $segment['subscribers'] = !empty($config['paginate'])
            ? $model->paginate()
            : $model->get();
    }

    return $segment;
}, 10, 3);
```

Return an ORM query builder for `model`, not an array of contacts. `DynamicSegmentController` will add `with(['tags', 'lists'])`, search, optional commerce relation, allowlisted sort, custom fields, and pagination.

Campaign sending applies `where('status', 'subscribed')` to dynamic-segment models before selecting contacts. Admin previews may request other statuses depending on the UI path.

## Advanced filter providers

`ContactsQuery` dispatches advanced filter providers with:

```php
do_action_ref_array('fluentcrm_contacts_filter_' . $providerName, [&$q, $items]);
```

Register a provider by mutating the query by reference:

```php
add_action('fluentcrm_contacts_filter_my_plugin', function (&$query, $items) {
    foreach ((array) $items as $item) {
        $property = sanitize_key($item['property'] ?? '');
        $operator = sanitize_key($item['operator'] ?? '');
        $value    = $item['value'] ?? null;

        if ($property === 'vip' && $operator === '=') {
            $query->where('source', $value === 'yes' ? 'my-plugin-vip' : 'my-plugin');
        }
    }
}, 10, 2);
```

Keep provider SQL bounded and allowlist every property/operator. Do not interpolate request data into raw SQL.

## Safety checklist

- Return defaults for missing contacts, missing users, deleted orders, missing funnel runs, or disabled dependencies.
- Escape output at the final render boundary if you print parsed values in admin or frontend HTML.
- Do not expose private user meta or tokens through SmartCodes unless the email recipient is allowed to see them.
- Keep SmartCode callbacks fast; they may run once per recipient per field.
- Do not parse unsubscribe/manage URLs outside FluentCRM's send/external-page flow unless you know the target object has the required email/contact context.

## Cross-references

- Use `fluentcrm-contact-models` for Subscriber, Lists, Tag, User, and ContactsQuery basics.
- Use `fluentcrm-automation-sequence-models` when SmartCodes depend on `FunnelSubscriber` source metadata.
- Use `fluentcrm-rest-options` for editor picker option lists.

## References

- Local source: `Extender.php`, `ShortcodeParser.php`, `FunnelController.php`, `DynamicSegmentController.php`, `CustomSegment.php`, and `ContactsQuery.php`.
- FluentCRM docs: Smart Codes, Parser, and Fluent ORM.
