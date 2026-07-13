---
name: wc-shipping-providers
description: Extend WooCommerce core Order Fulfillments with a custom tracking provider. Covers the `fulfillments` feature gate, `AbstractShippingProvider`, provider registration and collision rules, tracking URL construction, country support, tracking-number parsing and ambiguity scores, REST exposure, input safety, and version guards. Use when a carrier must appear in fulfillment tracking or be auto-detected from tracking numbers.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WooCommerce fulfillment shipping providers

This is the provider registry for WooCommerce's Order Fulfillments feature. It is not a shipping-rate method and does not implement label purchasing or carrier API calls.

## Feature status

In WooCommerce 10.9.4, feature ID `fulfillments` is disabled by default and its feature UI is hidden. Classes existing on disk does not mean fulfillment UI/routes are active.

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

if ( ! FeaturesUtil::feature_is_enabled( 'fulfillments' ) ) {
    return;
}
```

Do not force-enable the feature from an extension. Guard integration and provide graceful no-op behavior when it is off or the provider base class is unavailable.

## Provider contract

The base class requires:

```text
get_key(): string
get_name(): string
get_icon(): string
get_tracking_url(string $tracking_number): string
```

Optional methods:

```text
get_shipping_from_countries(): array
get_shipping_to_countries(): array
can_ship_from/can_ship_to/can_ship_from_to
try_parse_tracking_number(number, from, to): ?array
```

An empty country list makes the base `can_ship_*` methods return false. Override with real ISO alpha-2 coverage when country matching matters.

## Provider class

```php
namespace MyPlugin\Fulfillment;

use Automattic\WooCommerce\Admin\Features\Fulfillments\Providers\AbstractShippingProvider;

final class ExampleCarrier extends AbstractShippingProvider {
    public function get_key(): string {
        return 'myplugin-example-carrier';
    }

    public function get_name(): string {
        return 'Example Carrier';
    }

    public function get_icon(): string {
        return plugins_url( 'assets/example-carrier.png', MYPLUGIN_FILE );
    }

    public function get_tracking_url( string $tracking_number ): string {
        return 'https://tracking.example/parcel/' . rawurlencode( $tracking_number );
    }

    public function get_shipping_from_countries(): array {
        return array( 'HU', 'AT', 'SK' );
    }

    public function get_shipping_to_countries(): array {
        return array( 'HU', 'AT', 'SK', 'DE', 'CZ' );
    }

    public function try_parse_tracking_number(
        string $tracking_number,
        string $shipping_from,
        string $shipping_to
    ): ?array {
        $tracking_number = strtoupper( trim( $tracking_number ) );

        if ( ! preg_match( '/^EX[A-Z0-9]{10}$/', $tracking_number ) ) {
            return null;
        }

        return array(
            'url'             => $this->get_tracking_url( $tracking_number ),
            'ambiguity_score' => $this->can_ship_from_to( $shipping_from, $shipping_to ) ? 95 : 70,
        );
    }
}
```

Keep `get_key()` globally unique and stable; stored fulfillment records and API responses use it as identity. Prefix a custom key. Names are display labels and can change; keys must not.

## Registration

The filter is `woocommerce_fulfillment_shipping_providers`:

```php
use Automattic\WooCommerce\Admin\Features\Fulfillments\Providers\AbstractShippingProvider;
use Automattic\WooCommerce\Utilities\FeaturesUtil;

add_action( 'woocommerce_init', static function (): void {
    if (
        ! FeaturesUtil::feature_is_enabled( 'fulfillments' ) ||
        ! class_exists( AbstractShippingProvider::class )
    ) {
        return;
    }

    add_filter( 'woocommerce_fulfillment_shipping_providers', static function ( array $providers ): array {
        $providers[] = MyPlugin\Fulfillment\ExampleCarrier::class;
        return $providers;
    }, 30 );
} );
```

Filter entries can be provider instances or subclass class strings. Class strings are resolved through WooCommerce's DI container. Invalid entries are silently skipped.

Resolution re-keys providers by `get_key()`. If two entries return the same key, the later resolved provider overwrites the earlier one. Treat a collision as a compatibility bug; never intentionally replace a core/third-party provider by copying its key.

## Tracking parser

`try_parse_tracking_number()` returns `null` for no match or:

```php
array(
    'url'             => 'https://...',
    'ambiguity_score' => 95,
)
```

WooCommerce collects matching providers and picks the highest numeric ambiguity score. Use narrow patterns and country context. Broad numeric regexes with high scores steal tracking numbers from other carriers.

Recommended confidence approach:

- 95-100: carrier-specific prefix plus valid check digit/length.
- 80-94: strong format, minor ambiguity.
- 60-79: generic fallback that should lose to a precise provider.
- `null`: unsupported format.

The scale is convention in current built-ins, not a formally versioned public enum. Test overlap against WooCommerce's bundled providers.

## URL and icon safety

- Encode the tracking number as a path/query component; never concatenate raw request text.
- Return HTTPS tracking URLs.
- Do not accept a caller-provided base URL.
- Return an absolute icon URL to a small, non-sensitive asset.
- `get_tracking_url( '__PLACEHOLDER__' )` is used to build the v4 provider response template, so the method must remain deterministic for placeholder input.

## REST representation

When the feature/routes are active, `GET /wc/v4/fulfillments/providers` returns each provider as:

```json
{
  "label": "Example Carrier",
  "icon": "https://.../example-carrier.png",
  "value": "myplugin-example-carrier",
  "url": "https://tracking.example/parcel/__PLACEHOLDER__"
}
```

The response filter is `woocommerce_rest_prepare_fulfillments_providers`. It is for response shaping, not provider registration. Register through the fulfillment provider filter so admin parsing and REST use the same source.

## Stability boundary

The provider base class lives under `Admin\Features\Fulfillments`, and the feature is still operationally gated. Guard class and feature availability, test each supported WooCommerce minor, and avoid importing internal manager/utility classes for business logic.

## Critical rules

- Do not confuse providers with `WC_Shipping_Method` rate calculation.
- Do not force-enable fulfillments.
- Use a stable prefixed provider key and avoid collisions.
- Return `null` for uncertain formats and use conservative scores.
- Encode tracking values and never log full sensitive payloads.
- Test provider list REST output, manual selection, auto-detection, and overlapping formats.

## Cross-references

- `wc-shipping-method` for checkout rates.
- `wc-rest-api-v4` for fulfillment endpoints and feature gating.
- `wc-order-lifecycle-and-items` for order fulfillment side effects.

## References

- Provider contract: `src/Admin/Features/Fulfillments/Providers/AbstractShippingProvider.php`.
- Registry resolution: `src/Admin/Features/Fulfillments/FulfillmentUtils.php`.
- Best-score parser: `src/Admin/Features/Fulfillments/FulfillmentsManager.php`.
- Verified source paths:
  - `wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/Fulfillments/Controller.php`
  - `wp-content/plugins/woocommerce/src/Internal/Features/FeaturesController.php`
