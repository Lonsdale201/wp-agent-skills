---
name: acf-pro-options-pages
description: >-
  Builds and reviews ACF PRO options pages and their global value storage.
  Covers acf_add_options_page registration, capabilities, menu and location
  rules, default and custom post_id prefixes in wp_options, hidden field-key
  references, autoload cost, frontend reads, field-name collisions, and
  migrations. Use when adding site-wide settings, header/footer content, brand
  configuration, or debugging options that leak between ACF options pages.
  Requires ACF PRO; reading ordinary WordPress options is outside this skill.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "advanced-custom-fields-pro"
  wp-skills-plugin-version-tested: "6.8.10"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-26"
---

# ACF PRO options pages

Options Pages are an **ACF PRO** feature. They provide an admin screen and field
location; their values live in `wp_options`, not in a special ACF table. Default
options pages share the same `options` storage target, so page separation in the
menu does not isolate duplicate field names.

## Register a page with explicit policy

```php
add_action( 'acf/init', static function (): void {
    if ( ! function_exists( 'acf_add_options_page' ) ) {
        return;
    }

    acf_add_options_page( array(
        'page_title'    => __( 'Brand settings', 'acme-brand' ),
        'menu_title'    => __( 'Brand settings', 'acme-brand' ),
        'menu_slug'     => 'acme-brand-settings',
        'capability'    => 'manage_options',
        'redirect'      => false,
        'post_id'       => 'option_acme_brand',
        'autoload'      => false,
        'update_button' => __( 'Save brand settings', 'acme-brand' ),
    ) );
} );
```

Then attach a field group with an Options Page location rule whose value matches
the menu slug. Keep registration and field definitions in the same owning plugin
so the page cannot exist without its schema.

`edit_posts` is the ACF default capability. That is often too broad for global
configuration. Choose a capability from the feature's authorization model and
recheck it on any custom save, REST, AJAX, or CLI path.

## Understand option names

With the default `post_id` of `options`, a field named `support_phone` produces:

```text
options_support_phone   = <raw value>
_options_support_phone  = field_acme_support_phone
```

With `post_id => 'option_acme_brand'`, the same field produces:

```text
option_acme_brand_support_phone   = <raw value>
_option_acme_brand_support_phone  = field_acme_support_phone
```

The underscore option is ACF's field-key reference. Keep it aligned with the
value option. Do not call `get_option( 'support_phone' )` and assume it is the ACF
value; use `get_field()` with the same storage target or intentionally address
the fully prefixed raw option.

## Read and render from the same target

```php
$storage = 'option_acme_brand';

$phone = get_field( 'acme_support_phone', $storage );
if ( is_string( $phone ) && '' !== $phone ) {
    printf(
        '<a href="%s">%s</a>',
        esc_url( 'tel:' . preg_replace( '/[^0-9+]/', '', $phone ) ),
        esc_html( $phone )
    );
}
```

The common `'option'` and `'options'` aliases target default `options` storage.
They do not target a custom `post_id`. Centralize a custom storage identifier in
one constant or method and reuse it for field definitions, reads, writes, tests,
and migrations.

## Prevent page collisions

Two pages using default storage and the same field name read and overwrite the
same option. Choose one of these models:

- globally unique field names across all default options pages;
- a distinct custom `post_id` per independent page/tenant/brand;
- intentionally shared fields, documented as shared state.

Changing `post_id` later is a data migration. Copy both the raw value and its
reference by reading through the old ACF target and writing through
`update_field( $field_key, $value, $new_target )`; then verify and remove the old
options according to the rollback plan.

## Control autoload and size

ACF PRO 6.8.10 defaults an options page's `autoload` setting to `false`. Enabling
it can improve access to a small set of values used on nearly every request, but
it also adds those option rows to WordPress's autoloaded option set.

- Keep large Repeaters, Flexible Content, galleries, and rarely used settings
  non-autoloaded.
- Measure total autoloaded option size before and after enabling it.
- Avoid storing caches, logs, queues, or frequently changing operational state
  in an ACF options page.
- Do not assume ACF's formatted-value cache replaces WordPress option/object
  cache design.

## Free/PRO degradation

`acf_add_options_page()` and the Options Pages UI require **ACF PRO**. A plugin
whose core behavior depends on the page should show one clear administrator
notice and disable only that feature when the function is absent. Do not create
a lookalike page that writes incompatible option names under ACF Free.

## Verification

1. Log in with an allowed administrator and a role that must be denied.
2. Save a scalar, an empty value, and each complex value used by the page.
3. Inspect the expected prefixed option and underscore reference.
4. Render on a frontend request without an admin global screen.
5. Confirm a second options page cannot collide unintentionally.
6. Measure autoload growth and object-cache behavior where relevant.
7. Exercise import/CLI writes with the exact custom storage target.

## Cross-references

- `acf-field-group-development` for options-page location rules and schema ownership.
- `acf-value-storage-frontend` for raw/formatted values and safe output.
- `acf-pro-complex-fields` when global settings contain Repeaters or Flexible Content.

## References

- [Official Options Page documentation](https://www.advancedcustomfields.com/resources/options-page/).
- [Official guide to values from an options page](https://www.advancedcustomfields.com/resources/get-values-from-an-options-page/).
- [Official ACF PRO feature overview](https://www.advancedcustomfields.com/pro/).
- Verified ACF PRO 6.8.10 source paths:
  - `pro/options-page.php`
  - `pro/admin/admin-options-page.php`
  - `pro/locations/class-acf-location-options-page.php`
  - `pro/acf-ui-options-page-functions.php`
- Verified shared source paths:
  - `includes/acf-meta-functions.php`
  - `src/Meta/Option.php`
