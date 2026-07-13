---
name: fluentcrm-companies-model
description: Work with FluentCRM 3.x Companies / account records from companion plugins. Covers the experimental company_module flag, FluentCrmApi('companies'), Company model fields, createOrUpdate, owner_id as Subscriber ID, custom company fields in meta.custom_values, primary company vs many-to-many company membership, attachContactsByIds / detachContactsByIds, company hooks, and company-aware contact filters. Use when a plugin must sync organizations/accounts, attach contacts to companies, read company segments, add automation company actions, or audit code touching fc_companies, company_id, attachCompanies, or fluent_crm/company_ hooks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-crm"
  wp-skills-plugin-version-tested: "FluentCRM 3.1.8"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-09"
---

# FluentCRM: Companies model and contact-company relations

Use this skill when a plugin needs to sync B2B account/company records into FluentCRM or attach contacts to existing companies. Companies are core FluentCRM 3.1.8 code, but the UI/automation surface is behind the experimental `company_module` setting.

## Guard the feature

For UI, automation actions, or user-visible sync flows, check the module flag:

```php
use FluentCrm\App\Services\Helper;

if (!function_exists('FluentCrmApi') || !Helper::isCompanyEnabled()) {
    return;
}
```

`Helper::isCompanyEnabled()` reads `_fluentcrm_experimental_settings['company_module'] === 'yes'`. The low-level API does not hard-block writes when the flag is off, so do not create surprise company data from a hidden integration unless the admin opted in.

## API entry points

`app/Api/config.php` registers the API key as `companies`:

```php
$companiesApi = FluentCrmApi('companies');
```

Create or update a company:

```php
$company = FluentCrmApi('companies')->createOrUpdate([
    'name'        => sanitize_text_field($accountName),
    'email'       => sanitize_email($billingEmail),
    'website'     => esc_url_raw($website),
    'type'        => 'Customer',
    'industry'    => sanitize_text_field($industry),
    'owner_id'    => (int) $fluentContactId, // Subscriber ID, not WP user ID
    'custom_values' => [
        'external_account_id' => sanitize_text_field($externalId),
    ],
]);
```

Important behavior from `Companies::createOrUpdate()`:

- Existing company lookup is by `id` when provided, otherwise by exact `name`.
- `owner_id` is a FluentCRM `Subscriber` ID. It is not a WordPress user ID.
- Setting `owner_id` attaches that contact to the company and sets the contact's primary `company_id` if empty.
- `custom_values` are formatted by `CustomCompanyField` and stored under serialized `Company.meta['custom_values']`.
- Create fires `fluent_crm/company_created`; update fires `fluent_crm/company_updated`.

Do not call `FluentCrmApi('companies')->getCompany($name)` for name lookup. The method name says `$idOrName`, but the 3.1.8 source checks `id` for numeric values and `email` for strings. For name lookup use:

```php
use FluentCrm\App\Models\Company;

$company = Company::where('name', $name)->first();
```

## Data model

`Company` maps `fc_companies`. Core fields include:

```php
name, owner_id, industry, type, email, phone, website,
address_line_1, address_line_2, postal_code, city, state, country,
timezone, employees_number, description, logo,
linkedin_url, facebook_url, twitter_url, date_of_start, meta
```

Relations:

- `Company::subscribers()` uses `fc_subscriber_pivot` with `object_type = FluentCrm\App\Models\Company`.
- `Company::owner()` belongs to a `Subscriber` through `owner_id`.
- `Company::notes()` stores company notes in `fc_subscriber_notes` with status `_company_note_`.
- `Subscriber::company()` points to the primary company via `fc_subscribers.company_id`.
- `Subscriber::companies()` is the many-to-many relation through the pivot table.

Treat `company_id` as the primary/display company only. A contact can belong to multiple companies through `Subscriber::companies()`.

## Attach and detach contacts

Prefer the API wrapper for bulk changes:

```php
$result = FluentCrmApi('companies')->attachContactsByIds(
    [(int) $contactId],
    [(int) $companyId]
);

if (!$result) {
    // At least one company ID was invalid, no subscribers were found, or input was empty.
}
```

`attachContactsByIds()` validates that every requested company ID exists. It attaches all valid companies to each subscriber and sets the first company as primary only when `company_id` is empty.

Detach:

```php
FluentCrmApi('companies')->detachContactsByIds([$contactId], [$companyId]);
```

Detach behavior:

- If a detached contact was the company owner, `owner_id` is cleared.
- If the detached company was the contact's primary `company_id`, FluentCRM promotes the first remaining related company or sets `company_id = null`.

For a single loaded contact, `Subscriber::attachCompanies()` and `detachCompanies()` are safe ORM-level helpers: they guard unsaved subscribers, cast IDs to ints, use per-row `INSERT IGNORE` / DELETE, refresh the relation, and only fire events for actual changes.

## Hooks

Company record hooks:

- `fluent_crm/company_created` with `($company, $data)`
- `fluent_crm/company_updated` with `($company, $data)`
- `fluent_crm/before_company_delete` with `($company)`
- `fluent_crm/company_deleted` with `($companyId)`
- `fluent_crm/company_type_to_{type}` with `($company, $oldType)`
- `fluent_crm/company_category_to_{industry}` with `($company, $oldIndustry)`

Contact-company pivot hooks are legacy underscore hooks only in 3.1.8:

- `fluentcrm_contact_added_to_companies` with `($companyIds, $subscriber)`
- `fluentcrm_contact_removed_from_companies` with `($companyIds, $subscriber)`

Do not invent slash aliases for the pivot hooks; they are not emitted in the current source.

## Query and segment contacts by company

For simple reads:

```php
use FluentCrm\App\Models\Subscriber;

$contacts = Subscriber::with(['companies'])
    ->filterByCompanies([(int) $companyId])
    ->get();
```

`ContactsQuery` / advanced filters support company-aware properties:

- segment relation `companies`
- `company_industry`
- `company_type`

Keep custom controllers bounded and allowlisted. Do not query serialized `Company.meta` for reporting unless you accept full-table scans.

## Automation company actions

Core 3.1.8 registers `ApplyCompanyAction` and `DetachCompanyAction` only when `Helper::isCompanyEnabled()` is true. If a companion action depends on Companies, follow the same guard and seed `getBlock()['settings']` with a company field default:

```php
'settings' => [
    'company' => null,
],
```

The built-in action field uses:

```php
'type'       => 'option_selectors',
'option_key' => 'companies',
```

That option key is provided by `OptionsController::companies()` and returns `[{id, title}]`.

## Common mistakes

- Using WP user IDs as `owner_id`. It must be a FluentCRM `Subscriber` ID.
- Assuming `getCompany('Acme')` searches by name. It searches by email for strings.
- Setting only `Subscriber.company_id` and skipping the pivot relation. The contact then has a primary company but is missing from `Company::subscribers()`.
- Writing `Company.meta` manually. Use `custom_values` through the API so `CustomCompanyField` formats field values consistently.
- Creating visible company integrations while `company_module` is disabled.

## Cross-references

- Use `fluentcrm-contact-models` for contact/list/tag basics.
- Use `fluentcrm-funnel-action` when adding a custom company-aware automation action.
- Use `fluentcrm-rest-options` when creating a custom company-like picker.

## References

- Official documentation: <https://developers.fluentcrm.com/database/orm/>
- Verified source paths:
  - `wp-content/plugins/fluent-crm/app/Api/config.php`
  - `wp-content/plugins/fluent-crm/app/Api/Classes/Companies.php`
  - `wp-content/plugins/fluent-crm/app/Models/Company.php`
  - `wp-content/plugins/fluent-crm/app/Models/CompanyNote.php`
  - `wp-content/plugins/fluent-crm/app/Models/CustomCompanyField.php`
  - `wp-content/plugins/fluent-crm/app/Models/Subscriber.php`
  - `wp-content/plugins/fluent-crm/app/Services/Helper.php`
  - `wp-content/plugins/fluent-crm/app/Http/Controllers/CompanyController.php`
  - `wp-content/plugins/fluent-crm/app/Services/Funnel/Actions/ApplyCompanyAction.php`
  - `wp-content/plugins/fluent-crm/app/Services/Funnel/Actions/DetachCompanyAction.php`
  - `wp-content/plugins/fluent-crm/database/migrations/CompaniesMigrator.php`
  - `wp-content/plugins/fluent-crm/database/migrations/Subscribers.php`
