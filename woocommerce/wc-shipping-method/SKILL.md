---
name: wc-shipping-method
description: Registers a custom WooCommerce shipping method with explicit
  control over which fields appear in the per-zone settings modal —
  extend WC_Shipping_Method, declare your fields in init_form_fields
  (and ONLY those fields, no unset / DOM hacks / CSS hides), set the
  $supports array to control whether the modal opens (omit
  'instance-settings' to suppress it entirely), register via the
  woocommerce_shipping_methods filter, load the class on
  woocommerce_shipping_init. Corrects the "this is React, removing
  fields is hard" misconception — the zone-method modal is Backbone
  with a PHP-rendered settings_html string; the field list is wholly
  PHP-controlled. Use when scaffolding a shipping method or when you
  want a feature-flag-only modal without WC defaults. Triggers on
  WC_Shipping_Method, woocommerce_shipping_methods,
  woocommerce_shipping_init, init_form_fields with shipping context,
  $supports shipping-zones, calculate_shipping, add_rate, or "remove
  default fields from shipping method".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.x"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://woocommerce.com/document/shipping-method-api/
  - https://github.com/woocommerce/woocommerce
source-refs:
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-shipping-method.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-settings-api.php
  - wp-content/plugins/woocommerce/includes/class-wc-shipping.php
  - wp-content/plugins/woocommerce/includes/shipping/free-shipping/class-wc-shipping-free-shipping.php
  - wp-content/plugins/woocommerce/includes/shipping/flat-rate/class-wc-shipping-flat-rate.php
  - wp-content/plugins/woocommerce/assets/js/admin/wc-shipping-zone-methods.js
---

# WooCommerce: register a custom shipping method

For plugins that add their own shipping logic to a WC store. The skill covers the registration flow plus — and this is the part AI assistants consistently get wrong — **how to control exactly which fields appear in the per-zone settings modal**, including the case where you want NO settings UI at all.

## Misconception this skill corrects

> "The WooCommerce shipping zones admin is React, so removing the default fields from a shipping method modal is hard."

It is not. The shipping-zone method settings modal is **Backbone**, not React. It opens a `WCBackboneModal` whose body is the `settings_html` string returned by `WC_Shipping_Method::get_admin_options_html()` — which calls `generate_settings_html()` on the array returned by `get_instance_form_fields()` ([wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-shipping-method.php:490](abstract-wc-shipping-method.php), [wp-content/plugins/woocommerce/assets/js/admin/wc-shipping-zone-methods.js:171-270](wc-shipping-zone-methods.js)).

This means the **field list is wholly PHP-controlled**. There is nothing on the JS side adding default fields. If your `instance_form_fields` array contains one field, the modal renders one field — no `unset()`, no DOM hack, no CSS-hide, no React-prop monkey-patching needed.

The newer React surfaces inside WC Admin (Analytics, Settings Editor, etc.) are unrelated to the shipping zones method modal — don't conflate them.

## When to use this skill

Trigger when ANY of the following is true:

- Scaffolding a new WC shipping method (carrier integration, custom-logic method, internal shipping rule).
- You want the per-zone settings modal to show ONLY a feature flag (or a subset of fields), not the WC defaults.
- You want a shipping method that registers in zones but exposes NO settings UI at all (the plugin owns config elsewhere — own admin page, external API, hardcoded rules).
- Reviewing a plugin where you see custom field-removal hacks (`unset( $form_fields['title'] )`, CSS `display: none`, JS DOM mutation) — those are antipatterns; this skill explains why.
- Debugging "my custom shipping method shows fields I never declared".

## Architecture in one paragraph

A WC shipping method is a PHP class extending `WC_Shipping_Method`, registered via the `woocommerce_shipping_methods` filter. The abstract initializes `$instance_form_fields = array()` — empty. **Nothing is auto-injected.** Your `init_form_fields()` populates exactly the fields you want; the modal renders exactly that list. Whether the modal opens at all is governed by `has_settings()` ([abstract-wc-shipping-method.php](abstract-wc-shipping-method.php)), which returns true if the method's `$supports` array includes `'instance-settings'`. Calculation runs through `calculate_shipping( $package )`, which calls `$this->add_rate()` for each rate.

## Minimal scaffold

### Bootstrap (main plugin file)

```php
/**
 * Plugin Name: My Shipping
 * Requires Plugins: woocommerce
 */

add_action( 'woocommerce_shipping_init', 'myplugin_load_shipping_method' );
add_filter( 'woocommerce_shipping_methods', 'myplugin_register_shipping_method' );

function myplugin_load_shipping_method(): void {
    require_once __DIR__ . '/includes/MyShippingMethod.php';
}

function myplugin_register_shipping_method( array $methods ): array {
    $methods['myplugin_shipping'] = 'MyShippingMethod';
    return $methods;
}
```

`woocommerce_shipping_init` is the canonical hook for loading shipping method classes — it fires after `WC_Shipping_Method` is loaded, avoiding the "class not found" race that happens if you load on `plugins_loaded`.

### Method class (variant A: feature-flag only modal)

```php
class MyShippingMethod extends WC_Shipping_Method {

    public function __construct( $instance_id = 0 ) {
        $this->id                 = 'myplugin_shipping';
        $this->instance_id        = absint( $instance_id );
        $this->method_title       = __( 'My Shipping', 'myplugin' );
        $this->method_description = __( 'Custom shipping logic for X.', 'myplugin' );

        // 'shipping-zones' = can be added to a zone (instance-based).
        // 'instance-settings' = the per-zone settings modal opens.
        // 'instance-settings-modal' = use the JS-driven modal (modern zones admin).
        $this->supports = array(
            'shipping-zones',
            'instance-settings',
            'instance-settings-modal',
        );

        $this->init_form_fields();
        $this->init_settings();

        // Hardcoded customer-facing label. To make it admin-editable, add a
        // 'title' entry to instance_form_fields and read $this->settings['title'].
        $this->title = __( 'My Shipping', 'myplugin' );

        add_action(
            'woocommerce_update_options_shipping_' . $this->id,
            array( $this, 'process_admin_options' )
        );
    }

    public function init_form_fields(): void {
        // ONLY the feature flag. WC adds nothing else.
        $this->instance_form_fields = array(
            'use_premium_logic' => array(
                'title'       => __( 'Use premium logic', 'myplugin' ),
                'label'       => __( 'Enable premium routing for this zone', 'myplugin' ),
                'type'        => 'checkbox',
                'description' => __( 'Routes through the plugin\'s premium engine.', 'myplugin' ),
                'default'     => 'no',
                'desc_tip'    => true,
            ),
        );
    }

    public function calculate_shipping( $package = array() ) {
        $use_premium = ( $this->get_option( 'use_premium_logic', 'no' ) === 'yes' );
        $cost        = $use_premium ? 25.0 : 10.0;

        $this->add_rate(
            array(
                'id'      => $this->get_rate_id(),
                'label'   => $this->title,
                'cost'    => $cost,
                'package' => $package,
            )
        );
    }
}
```

### Method class (variant B: NO settings UI at all)

When the plugin owns its config elsewhere (own admin page, external API, hardcoded rules), suppress the modal entirely:

```php
class MyExternalShippingMethod extends WC_Shipping_Method {

    public function __construct( $instance_id = 0 ) {
        $this->id           = 'myplugin_external_shipping';
        $this->instance_id  = absint( $instance_id );
        $this->method_title = __( 'My External Shipping', 'myplugin' );

        // Only 'shipping-zones'. NO 'instance-settings' = no modal opens,
        // no settings cog renders. Verified in has_settings() at
        // wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-shipping-method.php
        $this->supports = array( 'shipping-zones' );

        $this->title = __( 'Configured externally', 'myplugin' );

        // Still call init_settings() so $this->settings is an empty array
        // rather than null — avoids notices in any code reading $this->settings[*].
        $this->init_settings();
    }

    public function calculate_shipping( $package = array() ) {
        $cost = myplugin_compute_external_rate( $package );
        $this->add_rate(
            array(
                'id'      => $this->get_rate_id(),
                'label'   => $this->title,
                'cost'    => $cost,
                'package' => $package,
            )
        );
    }
}
```

## Critical rules

### 1. Field list is fully under your control

`WC_Shipping_Method` initializes `$instance_form_fields = array()` ([abstract-wc-shipping-method.php:112](abstract-wc-shipping-method.php)). Built-in methods (Free Shipping, Flat Rate, Local Pickup) populate the array entirely from their own `init_form_fields()` ([free-shipping/class-wc-shipping-free-shipping.php:101-143](class-wc-shipping-free-shipping.php) — a complete `title` / `requires` / `min_amount` / `ignore_discounts` declaration with nothing else added underneath).

Implication: to expose ONLY the fields you want, declare ONLY those fields. Do not:

- `unset( $this->instance_form_fields['title'] )` after the fact — fragile, breaks on future WC versions if internal structure shifts.
- Filter `woocommerce_shipping_instance_form_fields_{id}` to delete entries you yourself just declared — circular nonsense.
- Hide fields with CSS — they still post and save.
- Mutate the DOM with JS — the rendered HTML is server-generated, your script runs after; the fields are real.

### 2. `$supports` array controls modal availability

| `$supports` entry | Effect |
|---|---|
| `'shipping-zones'` | Method can be added to a zone (instance-based). |
| `'instance-settings'` | The per-zone settings modal exists for this method. |
| `'instance-settings-modal'` | Render via the JS-driven Backbone modal (modern zones admin). |
| `'settings'` | Legacy non-zone settings page. Most modern plugins don't need this. |

For a feature-flag-only modal: include all three (`shipping-zones`, `instance-settings`, `instance-settings-modal`).
For no settings UI at all: include only `shipping-zones`.

`has_settings()` ([abstract-wc-shipping-method.php](abstract-wc-shipping-method.php)) returns `$this->supports( 'instance-settings' )` for instance-based methods. Without that key, the cog icon doesn't render and the modal never opens.

### 3. `title` field is conventional but optional

Built-in WC methods include a `title` field so admins can rename "Flat rate" to "Standard delivery". You don't have to. If your method's customer-facing label is fixed (e.g. branded carrier name), hardcode `$this->title = __( 'Premium shipping', 'myplugin' )` in the constructor and skip the field.

If you DO want it admin-editable: add it to `instance_form_fields`, then `$this->title = $this->get_option( 'title' )` in the constructor.

### 4. Load the class on `woocommerce_shipping_init`

```php
add_action( 'woocommerce_shipping_init', 'myplugin_load_shipping_method' );
```

This action fires AFTER WC has loaded `WC_Shipping_Method`. Loading on `plugins_loaded` can race the WC bootstrap on some setups and produce "class WC_Shipping_Method not found".

### 5. Register via `woocommerce_shipping_methods` filter

```php
add_filter( 'woocommerce_shipping_methods', function ( $methods ) {
    $methods['myplugin_shipping'] = 'MyShippingMethod';
    return $methods;
} );
```

Array key = method ID (must match `$this->id`). Value = fully qualified class name. WC instantiates the class as needed (one instance per zone-method combination).

### 6. Always call `init_settings()` even with no fields

`init_settings()` populates `$this->settings` from saved DB values. Skipping it leaves `$this->settings` as `null`, causing notices in any read. With zero fields it's still cheap — call it.

### 7. `calculate_shipping()` minimum: one `add_rate` call

```php
public function calculate_shipping( $package = array() ) {
    $this->add_rate( array(
        'id'      => $this->get_rate_id(),
        'label'   => $this->title,
        'cost'    => 10.0,
        'package' => $package,
    ) );
}
```

`get_rate_id()` returns `<method_id>:<instance_id>` — guaranteed unique per zone-method combination. Don't roll your own ID.

`add_rate` accepts `'cost'` as a single value (per-order cost) or an array (per-item costs). See [abstract-wc-shipping-method.php `add_rate()`](abstract-wc-shipping-method.php) for the full args list (`taxes`, `calc_tax`, `meta_data`, `price_decimals`).

### 8. Save handler wiring

```php
add_action(
    'woocommerce_update_options_shipping_' . $this->id,
    array( $this, 'process_admin_options' )
);
```

Required for the legacy non-instance settings tab. For instance settings (per-zone), WC handles save through its own AJAX flow; the action above is harmless but not strictly necessary in modern installs. Include it for backward compatibility unless the method is `'shipping-zones'`-only AND you've confirmed your target WC version doesn't need it.

## Common mistakes

```php
// WRONG — field-removal via unset (fragile, breaks across WC versions)
public function init_form_fields(): void {
    parent::init_form_fields();
    unset( $this->instance_form_fields['title'] );
}

// RIGHT — just declare what you want
public function init_form_fields(): void {
    $this->instance_form_fields = array(
        'use_premium_logic' => array( /* ... */ ),
    );
}

// WRONG — DOM hack to hide fields
add_action( 'admin_print_footer_scripts', function () {
    echo '<script>jQuery("[name*=\"title\"]").hide();</script>';
} );

// WRONG — CSS hide
add_action( 'admin_head', function () {
    echo '<style>tr.title-field { display: none; }</style>';
} );

// WRONG — registering on plugins_loaded (class may not exist yet)
add_action( 'plugins_loaded', function () {
    require_once __DIR__ . '/MyShippingMethod.php';
} );

// RIGHT
add_action( 'woocommerce_shipping_init', function () {
    require_once __DIR__ . '/MyShippingMethod.php';
} );

// WRONG — leaving 'instance-settings' in $supports when there are no fields
$this->supports = array( 'shipping-zones', 'instance-settings' );
$this->instance_form_fields = array(); // empty modal opens, useless cog icon

// RIGHT — drop instance-settings to suppress the modal entirely
$this->supports = array( 'shipping-zones' );
```

## Testing the smoke result

After registering the method, verify in:

1. `/wp-admin/admin.php?page=wc-settings&tab=shipping&zone_id=N` — your method appears in the "Add shipping method" picker.
2. Click the method to open settings — modal contains EXACTLY the fields you declared (or no modal opens at all if `'instance-settings'` is omitted).
3. At checkout for an address in the zone, the rate appears with the cost from `calculate_shipping()`.

A simple smoke plugin demonstrating both variants (feature-flag-only and no-settings) is at `wp-content/plugins/test-shipping-method/` in this repo (if present) — useful as a reference scaffold.

## Cross-references

- Run **`wp-plugin-bootstrap`** for the surrounding plugin file (header, autoload, `Requires Plugins: woocommerce` declaration).
- Run **`wp-plugin-architecture`** for the broader includes/ folder structure if the plugin has more than this one method.
- Run **`wp-security-audit`** on `process_admin_options()` and the saved settings flow — admin-facing input.

## What this skill does NOT cover

- Shipping zone management itself (creating, editing, deleting zones) — that's WC core admin, not the plugin author's concern.
- Carrier API integration (rate fetching, label printing, tracking) — adjacent topic, depends on the carrier.
- Cart-level shipping logic beyond the per-method `calculate_shipping` (e.g. cross-method rules, shipping-class-aware pricing) — niche, out of scope.
- The WC Blocks checkout / Cart blocks integration. Methods registered via `WC_Shipping_Method` work with both classic and Blocks checkout for rate display, but Blocks-specific custom UI is a separate topic.
- Distance / weight / class-based rate matrices — flat-rate / table-rate plugins implement these inside their `calculate_shipping`; the structure is a regular PHP loop, no WC-specific scaffolding.

## References

- `WC_Shipping_Method` abstract — `wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-shipping-method.php`. Methods: `instance_form_fields`, `has_settings`, `get_admin_options_html`, `add_rate`.
- Free Shipping reference implementation — `wp-content/plugins/woocommerce/includes/shipping/free-shipping/class-wc-shipping-free-shipping.php`. Example of a method declaring its full field list explicitly.
- `wc-shipping-zone-methods.js` — `wp-content/plugins/woocommerce/assets/js/admin/wc-shipping-zone-methods.js`. Backbone modal source; confirms PHP-rendered `settings_html`, no React.
- [WooCommerce Shipping Method API docs](https://woocommerce.com/document/shipping-method-api/) — official guide; cross-check against current source for new `$supports` keys or hook additions.
