---
name: wc-shipping-method
description: Build a zone-based WooCommerce shipping method with `WC_Shipping_Method`. Covers deferred class loading, registration, instance settings and modal support flags, package-based calculation, unique rate IDs, decimal/tax handling, availability, save behavior, caching, and testing. Use when adding carrier rates, custom shipping rules, a feature-only settings modal, or a method with no per-zone settings UI.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce shipping method

WooCommerce calculates shipping per package. A method receives one package and adds zero or more rates for that package.

## Load and register

With Composer PSR-4 autoloading, defer registration until WooCommerce has loaded its shipping base class:

```php
add_action( 'woocommerce_shipping_init', static function (): void {
    add_filter( 'woocommerce_shipping_methods', static function ( array $methods ): array {
        $methods['myplugin_carrier'] = MyPlugin\Shipping\CarrierMethod::class;
        return $methods;
    } );
} );
```

The array key must match the class `$id`. Register a class name; WooCommerce creates one object per zone-method instance.

## Zone method scaffold

```php
namespace MyPlugin\Shipping;

use Automattic\WooCommerce\Utilities\NumberUtil;

final class CarrierMethod extends \WC_Shipping_Method {
    protected $cost = '0';

    public function __construct( $instance_id = 0 ) {
        $this->id                 = 'myplugin_carrier';
        $this->instance_id        = absint( $instance_id );
        $this->method_title       = __( 'My Carrier', 'myplugin' );
        $this->method_description = __( 'Calculated delivery by My Carrier.', 'myplugin' );
        $this->supports           = array(
            'shipping-zones',
            'instance-settings',
            'instance-settings-modal',
        );

        $this->init_form_fields();

        // get_option() reads instance settings lazily for declared instance fields.
        $this->title      = $this->get_option( 'title', __( 'My Carrier', 'myplugin' ) );
        $this->tax_status = $this->get_option( 'tax_status', 'taxable' );
        $this->cost       = $this->get_option( 'cost', '0' );
    }

    public function init_form_fields(): void {
        $this->instance_form_fields = array(
            'title' => array(
                'title'       => __( 'Name', 'myplugin' ),
                'type'        => 'text',
                'default'     => __( 'My Carrier', 'myplugin' ),
                'description' => __( 'Shown to customers at checkout.', 'myplugin' ),
                'desc_tip'    => true,
            ),
            'cost' => array(
                'title'             => __( 'Cost', 'myplugin' ),
                'type'              => 'text',
                'default'           => '0',
                'sanitize_callback' => static function ( $value ): string {
                    return NumberUtil::sanitize_cost_in_current_locale( $value );
                },
            ),
            'tax_status' => array(
                'title'   => __( 'Tax status', 'myplugin' ),
                'type'    => 'select',
                'default' => 'taxable',
                'options' => array(
                    'taxable' => __( 'Taxable', 'myplugin' ),
                    'none'    => _x( 'None', 'Tax status', 'myplugin' ),
                ),
            ),
        );
    }

    public function calculate_shipping( $package = array() ): void {
        if ( empty( $package['destination']['country'] ) ) {
            return;
        }

        $cost = wc_format_decimal( $this->cost );
        if ( '' === $cost || (float) $cost < 0 ) {
            return;
        }

        $this->add_rate( array(
            'id'      => $this->get_rate_id( 'standard' ),
            'label'   => $this->title,
            'cost'    => $cost,
            'package' => $package,
        ) );
    }
}
```

Declare extension-owned properties instead of relying on dynamic properties.

## Settings model

`instance_form_fields` fully controls the per-zone modal. WooCommerce does not inject a default title/cost field into custom methods.

| Support flag | Effect |
|---|---|
| `shipping-zones` | Method can be added to zones |
| `instance-settings` | Method has per-instance settings |
| `instance-settings-modal` | Use the current Backbone modal UI |
| `settings` | Legacy/global non-instance settings page |

For no modal, use only:

```php
$this->supports = array( 'shipping-zones' );
```

Do not hide unwanted fields with CSS/JavaScript or declare then unset them. Declare only the fields owned by the method.

`get_instance_option()` lazily calls `init_instance_settings()`. The base settings arrays already default to arrays; a method with no fields does not need `init_settings()` merely to avoid null notices.

## Saving settings

The shipping-zone AJAX flow calls the selected instance's `process_admin_options()` directly. This validates the `instance_id`, reads only declared fields, applies sanitizers, and updates the instance option.

The classic action wiring:

```php
add_action(
    'woocommerce_update_options_shipping_' . $this->id,
    array( $this, 'process_admin_options' )
);
```

is required for global/legacy settings. Built-in methods may register it for mixed compatibility, but a zone-only method does not depend on this action for modal saves.

## Package contract

Use the supplied package, not global cart assumptions:

```text
contents             cart lines in this package
contents_cost        package contents value
applied_coupons      active coupon codes
user                 shopper data
destination          country/state/postcode/city/address
cart_subtotal        package/cart subtotal context
```

A cart can be split into several packages. Calling `WC()->cart->get_cart()` inside calculation can price items that are not in the current package.

External carrier calls must have short timeouts and deterministic fallbacks. Cache by a bounded hash of normalized destination, package dimensions/weight/value, service settings, and currency. Never include full addresses or customer PII in logs/cache keys.

## Rate IDs and multiple services

`get_rate_id()` returns method and instance components. If one method emits multiple rates, pass a stable service suffix:

```php
$this->get_rate_id( 'standard' );
$this->get_rate_id( 'express' );
```

Without suffixes, later rates can collide. Never use a translated label as an ID.

## Costs and taxes

- Store costs as sanitized decimal strings; do not use localized raw input in calculations.
- Leave `taxes` unset in `add_rate()` to let WooCommerce calculate shipping taxes from cost and tax status.
- Pass `taxes => false` only for an intentionally non-taxable rate.
- Do not manually add tax to cost unless the contract explicitly supplies tax-inclusive rates and you correctly handle `woocommerce_shipping_prices_include_tax`.
- Avoid negative shipping rates; use discounts/coupons for discounts.

## Availability

Return no rates when requirements are not met. If overriding `is_available()`, retain parent/zone enablement behavior and evaluate only package-relevant rules. Sanitize destination data before sending it to a carrier.

## Testing

Test:

1. Add/remove method in several zones and save separate instance settings.
2. Guest and logged-in addresses, incomplete postcode, no-shipping destinations.
3. Multiple packages and multiple services from one instance.
4. Taxable/non-taxable stores, decimal separators, zero cost, coupons.
5. Carrier timeout/error, cache hit/miss, duplicate recalculation in one request.
6. Classic and Store API/Checkout Block rate display.

## Critical rules

- Register/load after `woocommerce_shipping_init`.
- Price the supplied package only.
- Give every emitted service a stable unique rate suffix.
- Sanitize settings and decimal values at the boundary.
- Do not perform unbounded carrier calls on every recalculation.
- Do not rely on a settings action for per-zone AJAX persistence.

## References

- Base settings/rate contract: `includes/abstracts/abstract-wc-shipping-method.php`.
- Zone method examples: `includes/shipping/free-shipping` and `includes/shipping/flat-rate`.
- Official documentation: <https://woocommerce.com/document/shipping-method-api/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-settings-api.php`
  - `wp-content/plugins/woocommerce/includes/class-wc-shipping.php`
  - `wp-content/plugins/woocommerce/includes/shipping/free-shipping/class-wc-shipping-free-shipping.php`
  - `wp-content/plugins/woocommerce/includes/shipping/flat-rate/class-wc-shipping-flat-rate.php`
