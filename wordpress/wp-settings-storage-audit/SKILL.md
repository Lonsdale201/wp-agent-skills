---
name: wp-settings-storage-audit
description: "Audit how WordPress plugins and classic themes store settings and configuration. Use when reviewing get_option/update_option/add_option/register_setting/settings_fields/options.php, Customizer add_setting/get_theme_mod/set_theme_mod, theme_mod vs option decisions, associative-array option schemas, keyed settings forms, sanitize_callback/validate_callback/defaults, show_in_rest schemas, autoload choices, update_option hooks, multisite site options, deprecated settings groups, or code that saves plugin settings, theme settings, feature flags, secrets, API config, Customizer values, or admin form data."
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-12"
---

# WP Settings Storage Audit

Use this skill to audit the persistence contract for plugin settings and classic theme settings. It complements UI-specific skills: `wp-admin-settings-api` explains how to render/save a classic admin form, `wp-plugin-options-storage` chooses the storage primitive, and `classic-theme-customizer` covers Customizer UI.

The core question is: can another developer safely predict where each setting is stored, what shape it has, when it is loaded, how it is sanitized, and which code path reacts after it changes?

## Verdicts

| Verdict | Meaning |
|---|---|
| Correct | Each setting has the right storage primitive, stable prefixed name, documented array shape, sanitize/validate/default path, intentional autoload, and safe read/write APIs. |
| Risky | The settings work but have weak schema, autoload bloat, tab wipe risk, unclear defaults, REST schema mismatch, or Customizer/plugin boundary issues. |
| Incorrect | The code stores durable state in the wrong primitive, trusts raw request data, bypasses nonce/capability checks, misuses unregistered options through `options.php`, stores plugin data in theme mods, or relies on deprecated behavior. |

## Audit Workflow

### 1. Classify the setting

Pick the primitive by ownership and access pattern:

| Data | Correct primitive |
|---|---|
| Site-wide plugin config, feature flags | One prefixed option per feature, usually an associative array |
| Per-user preference or dismissed state | User meta |
| Per-post/CPT data | Post meta registered with schema when exposed |
| Per-term data | Term meta |
| Cached recomputable value | Transient with TTL |
| Network-wide multisite config | Site option |
| Queryable, append-mostly, sortable records | Custom table |
| Theme presentation choice | `theme_mod` through Customizer |

Do not store plugin-owned business data, credentials, payment config, content models, or cross-theme app state in theme mods. Do not store per-user maps, logs, counters, or large datasets inside one global option.

### 2. Require a stable key and shape

Plugin option names must be prefixed and domain-scoped:

```php
const OPTION = 'myplugin_settings';
```

For coherent plugin settings read and saved together, prefer one
associative-array option per feature:

```php
$defaults = array(
    'enabled'       => false,
    'api_endpoint'  => '',
    'retry_minutes' => 15,
    'mode'          => 'safe',
);

$options = wp_parse_args( get_option( self::OPTION, array() ), $defaults );
```

Audit the array as a contract:

- every key has a default;
- every key has one type and one meaning;
- booleans are saved as booleans, IDs as integers, enums as allowlisted strings;
- unknown keys are dropped in sanitize unless forward compatibility is intentional;
- feature groups are split by domain, not by individual field;
- settings that are updated independently are not forced into one race-prone blob.

Separate scalar options are valid when fields have independent write cadence,
autoload policy, access control, secret handling, migration lifecycle, or atomic
update needs. Flag option-per-field storage only when it creates measurable
autoload/query sprawl or lacks a deliberate contract; do not call three small,
independent options incorrect by count alone.

Avoid anonymous JSON strings in options. WordPress already serializes arrays. If inner fields must be queried, sorted, paginated, aggregated, or partially updated, use a custom table.

### 3. Verify the Settings API or an equivalent custom handler

Prefer the Settings API for conventional classic plugin settings because it
centralizes registration, schema/sanitization, nonce fields, allowed options,
and REST integration:

```php
register_setting( 'myplugin', 'myplugin_settings', array(
    'type'              => 'object',
    'default'           => $defaults,
    'sanitize_callback' => 'myplugin_sanitize_settings',
    'show_in_rest'      => false,
) );
```

The Settings API form posts to core:

```php
<form method="post" action="options.php">
    <?php
    settings_fields( 'myplugin' );
    do_settings_sections( 'myplugin' );
    submit_button();
    ?>
</form>
```

For the Settings API path, audit these invariants:

- `register_setting()` runs on `admin_init`, not only when the page renders;
- `settings_fields( $option_group )` matches the first `register_setting()` argument;
- `do_settings_sections( $page )` matches `add_settings_section()` and `add_settings_field()`;
- field names use the option array shape, e.g. `myplugin_settings[retry_minutes]`;
- `sanitize_callback` receives the whole submitted option value;
- tabbed forms merge with the existing option so missing tab keys are not blanked.

A custom admin handler is also valid. Do not report it as insecure or incorrect
solely because it calls `update_option()` directly. Require equivalent controls:

- process only an intended POST action on a capability-gated admin page/handler;
- verify a purpose-specific nonce and capability before any write;
- explicitly allowlist fields and unslash, normalize, and validate by schema;
- reject arrays/scalars of the wrong shape and avoid mass assignment;
- preserve existing values deliberately when fields are absent or invalid;
- choose autoload intentionally when creating/changing options;
- redirect after success when resubmission on refresh would be harmful.

`register_setting()` is required for `options.php` and `/wp/v2/settings`
integration, not as a universal precondition for every safe custom form.

### 4. Sanitize as a schema

Sanitize callbacks should return the full clean option shape:

```php
function myplugin_sanitize_settings( $input ): array {
    $defaults = myplugin_default_settings();
    $existing = wp_parse_args( get_option( 'myplugin_settings', array() ), $defaults );
    $input    = is_array( $input ) ? $input : array();
    $clean    = $existing;

    $clean['enabled'] = ! empty( $input['enabled'] );

    if ( array_key_exists( 'retry_minutes', $input ) ) {
        $clean['retry_minutes'] = max( 1, min( 1440, absint( $input['retry_minutes'] ) ) );
    }

    if ( isset( $input['mode'] ) && in_array( $input['mode'], array( 'safe', 'fast' ), true ) ) {
        $clean['mode'] = $input['mode'];
    }

    return $clean;
}
```

Rules:

- sanitize on save and escape on output;
- call `add_settings_error()` for invalid user-facing values;
- keep previous values when an invalid submitted value should not overwrite a secret or working config;
- do not send emails, call external APIs, write files, or flush caches inside `sanitize_callback`;
- run side effects after a successful save with `update_option_{$option}`.

Core calls `sanitize_option( $option, $value )`, the registered `sanitize_option_{$option}` filters, then `pre_update_option_{$option}`, `pre_update_option`, `update_option`, `update_option_{$option}`, and `updated_option`.

### 5. Decide autoload deliberately

WP 7.0 uses the WP 6.6+ autoload model: `add_option()` and `update_option()` accept `true`, `false`, or `null`; internal stored values include `on`, `off`, `auto`, `auto-on`, and `auto-off`. The legacy strings `'yes'` and `'no'` are deprecated since 6.7.

Audit decisions:

- small settings read on most frontend requests can use `null` or explicit `true`;
- admin-only settings, large configs, reports, caches, and secrets should use `false`;
- never pass `'yes'` or `'no'`;
- use `wp_set_option_autoload()` or `wp_set_option_autoload_values()` when changing only autoload;
- remember `update_option( $name, $same_value, false )` returns early and will not change autoload;
- include `yes`, `on`, `auto-on`, and `auto` when auditing autoloaded rows.

Customizer `type => 'option'` settings can pass an `autoload` argument. Core defaults multidimensional Customizer option writes to autoload `true` unless overridden, so audit this explicitly for option-backed Customizer settings.

### 6. Expose REST settings only with schema

When settings are exposed through `/wp/v2/settings`, require `show_in_rest` schema that matches the stored value:

```php
'show_in_rest' => array(
    'schema' => array(
        'type'                 => 'object',
        'additionalProperties' => false,
        'properties'           => array(
            'enabled' => array(
                'type'    => 'boolean',
                'default' => false,
            ),
            'mode' => array(
                'type' => 'string',
                'enum' => array( 'safe', 'fast' ),
            ),
        ),
    ),
),
```

Important core behavior:

- REST settings require `manage_options`;
- REST writes still call `update_option()` and the setting sanitize path;
- `array` type settings shown in REST must define `show_in_rest.schema.items`;
- supported REST setting types are `number`, `integer`, `string`, `boolean`, `array`, and `object`;
- object schemas default additional properties to false when core builds the settings schema.

If lower-privileged users need to write only part of a setting, create a custom REST route with its own permission and validation instead of exposing the whole option through `/wp/v2/settings`.

### 7. Audit Customizer storage

For classic themes, `theme_mod` is the default:

```php
$wp_customize->add_setting( 'mytheme_layout', array(
    'type'              => 'theme_mod',
    'default'           => 'full',
    'sanitize_callback' => 'mytheme_sanitize_layout',
) );
```

Audit:

- use `theme_mod` for active-theme presentation choices;
- use `option` only when the value intentionally survives theme switches or is shared outside the theme;
- every setting has `sanitize_callback`, and semantic constraints use `validate_callback`;
- `get_theme_mod( $key, $default )` always has a default and output is escaped;
- option-backed Customizer settings that are rarely read set `autoload => false`;
- multidimensional IDs such as `mytheme_options[color]` are treated as one root option with subkeys.

Core stores theme mods in `theme_mods_{stylesheet}`. A theme switch changes which theme-mod option is read, so plugin-like data disappears by design.

### 8. Check deprecations and forbidden paths

Flag these:

- `register_setting()` / `add_settings_section()` / `add_settings_field()` using `misc` or `privacy` groups/pages;
- old `add_option_update_handler()` and `remove_option_update_handler()`;
- relying on unregistered options submitted to `options.php`;
- using deprecated option keys `blacklist_keys` or `comment_whitelist`;
- passing `'yes'` or `'no'` to autoload arguments;
- using `$new_whitelist_options` in new code instead of `$new_allowed_options`;
- posting unregistered options to `options.php` and relying on them to save;
- custom/raw admin forms missing the equivalent nonce, capability, field
  allowlist, schema validation, or safe write contract described above.

## Report Format

Report findings in this shape:

1. Storage map: option/theme_mod/meta/transient/custom-table names, owners, and shapes.
2. Findings: severity, file/line, bad behavior, and the WordPress rule it violates.
3. Fix plan: storage primitive, option name, array schema, sanitize/default merge, autoload, REST exposure, and update hooks.
4. Migration notes: old key to new key, default backfill, autoload correction, multisite scope, and uninstall cleanup.
5. Tests: admin save, tab save, invalid input, REST save if exposed, Customizer preview/save, frontend read, and autoload query.

## Cross-References

- Use `wp-admin-settings-api` for the classic plugin settings page scaffold.
- Use `wp-plugin-options-storage` before changing the storage primitive or adding custom tables.
- Use `classic-theme-customizer` for Customizer UI, preview, controls, and theme boundary details.
- Use `wp-security-secrets` when a setting stores API keys, tokens, or OAuth credentials.
- Use `wp-plugin-update-migrations` when moving old scalar options into a grouped option or changing autoload.

## References

- Official documentation: <https://developer.wordpress.org/plugins/settings/settings-api/>
- Official documentation: <https://developer.wordpress.org/reference/functions/register_setting/>
- Official documentation: <https://developer.wordpress.org/reference/functions/add_option/>
- Official documentation: <https://developer.wordpress.org/reference/functions/update_option/>
- Official documentation: <https://developer.wordpress.org/themes/customize-api/>
- Verified source paths:
  - `wp-includes/option.php`
  - `wp-admin/options.php`
  - `wp-admin/includes/template.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
  - `wp-includes/class-wp-customize-setting.php`
  - `wp-includes/class-wp-customize-manager.php`
  - `wp-includes/theme.php`
