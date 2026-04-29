---
name: wc-shipping-providers
description: Register a custom WooCommerce shipping provider — extend
  AbstractShippingProvider and add it via the woocommerce_fulfillment_shipping_providers
  filter (WC 10.1+). Distinct from shipping methods (rate at checkout) — a
  provider is a carrier identity (UPS, FedEx, DHL, your custom carrier)
  used by the Fulfillments system for tracking URLs, tracking-number
  pattern detection, country-pair support, and the orders-list filter.
  Required methods get_key / get_name / get_icon / get_tracking_url, with
  optional shipping-from / shipping-to / try_parse_tracking_number.
  Registration accepts class names (resolved via the DI container) or
  pre-built instances, keyed by get_key. Use when integrating a private
  carrier, fulfillment service, or any tracking-aware shipping identity.
  Triggers on AbstractShippingProvider, woocommerce_fulfillment_shipping_providers,
  FulfillmentUtils::get_shipping_providers, "shipping provider" in
  WooCommerce context, or carrier tracking integration.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.7"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://github.com/woocommerce/woocommerce
source-refs:
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/Providers/AbstractShippingProvider.php
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/Providers/DHLShippingProvider.php
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/Providers/UPSShippingProvider.php
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/ShippingProviders.php
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/FulfillmentUtils.php
  - wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/FulfillmentsManager.php
---

# WooCommerce: custom shipping providers (Fulfillments)

For plugins that integrate a **carrier** with WooCommerce — UPS / FedEx / DHL / a national post / a private courier. A "shipping provider" in WC 10.1+ is a carrier identity tied into the Fulfillments system: tracking URL generation, tracking-number pattern detection, country-pair support, and admin filtering on the orders list. **Different from a shipping method**, which is a checkout-time rate calculator.

WC 10.7 ships ~70 built-in providers (DHL, FedEx, UPS, USPS, Royal Mail, La Poste, Deutsche Post, Australia Post, Canada Post, dozens of national posts, courier services). Adding a new one is a small abstract-class extension + one filter callback.

## Misconception this skill corrects

> "A shipping provider is a shipping method. I'll extend `WC_Shipping_Method`."

These are two different concepts:

| Concept | Class | When | Purpose |
|---|---|---|---|
| Shipping **method** | `WC_Shipping_Method` (sibling skill `wc-shipping-method`) | Checkout time | Calculate the rate the customer pays for shipping. |
| Shipping **provider** | `AbstractShippingProvider` (this skill) | Post-purchase / fulfillment time | Generate tracking URLs, parse tracking numbers, identify carriers on the admin orders list. |

The same store can use Free Shipping (method) at checkout and DHL (provider) for the actual fulfillment. They don't overlap or compete — they sit at different lifecycle stages.

## When to use this skill

Trigger when ANY of the following is true:

- Integrating a courier / carrier with WC Fulfillments — even a small national one not in the built-in list.
- Writing a plugin that needs to generate carrier-specific tracking URLs from tracking numbers.
- Building a "tracking number autocomplete" feature (parse the entered number → infer the carrier).
- The diff or file contains: `AbstractShippingProvider`, `woocommerce_fulfillment_shipping_providers`, `FulfillmentUtils::get_shipping_providers`, `Automattic\WooCommerce\Admin\Features\Fulfillments\Providers`.
- The user says "shipping provider" in a WC context — confirm whether they actually mean shipping method (checkout rate) or shipping provider (fulfillment carrier identity).

## API surface — the abstract class

`Automattic\WooCommerce\Admin\Features\Fulfillments\Providers\AbstractShippingProvider` ([src/Admin/Features/Fulfillments/Providers/AbstractShippingProvider.php](AbstractShippingProvider.php)):

**Required (abstract):**

```php
abstract public function get_key(): string;
abstract public function get_name(): string;
abstract public function get_icon(): string;
abstract public function get_tracking_url( string $tracking_number ): string;
```

**Optional (default implementations exist):**

```php
public function get_shipping_from_countries(): array { return array(); }
public function get_shipping_to_countries(): array   { return array(); }
public function can_ship_from( string $country_code ): bool;
public function can_ship_to( string $country_code ): bool;
public function can_ship_from_to( string $shipping_from, string $shipping_to ): bool;
public function try_parse_tracking_number( string $tracking_number, string $shipping_from, string $shipping_to ): ?array;
```

`try_parse_tracking_number` is the carrier-detection hook: given a tracking number string and a country pair, return either `null` (this isn't our format) or an array describing the parsed result (used by WC for autocompletion and ambiguity scoring).

## Minimal scaffold — register a custom provider

```php
namespace MyPlugin\Shipping;

use Automattic\WooCommerce\Admin\Features\Fulfillments\Providers\AbstractShippingProvider;

class MyCourierShippingProvider extends AbstractShippingProvider {

    public function get_key(): string {
        return 'mycourier';
    }

    public function get_name(): string {
        return 'My Courier';
    }

    public function get_icon(): string {
        // Absolute URL to a small carrier logo (typical: 64x64 PNG).
        return plugins_url( 'assets/images/mycourier.png', MYPLUGIN_PLUGIN_FILE );
    }

    public function get_tracking_url( string $tracking_number ): string {
        return sprintf(
            'https://track.mycourier.example/?tn=%s',
            rawurlencode( $tracking_number )
        );
    }

    // Optional — restrict to specific country pairs
    public function get_shipping_from_countries(): array {
        return array( 'HU' );
    }

    public function get_shipping_to_countries(): array {
        return array( 'HU', 'SK', 'AT', 'RO' );
    }

    // Optional — pattern-detect "is this a MyCourier tracking number?"
    //
    // Verified return shape (FulfillmentsManager.php lines 510-527):
    //   - 'url'             — string, the tracking URL. NOTE: it's 'url', not 'tracking_url'.
    //                         The Manager reads $result['url'] and exposes it as the
    //                         outer 'tracking_url' field on the public response.
    //   - 'ambiguity_score' — int, HIGHER means more confident match. Built-in providers
    //                         use values like 70 (loose match), 85-90 (typical strong
    //                         match), 92-98 (very specific format). Manager picks the
    //                         provider with the HIGHEST score when multiple match.
    public function try_parse_tracking_number(
        string $tracking_number,
        string $shipping_from,
        string $shipping_to
    ): ?array {
        if ( ! preg_match( '/^MC[0-9]{10}HU$/', $tracking_number ) ) {
            return null; // not our format
        }

        return array(
            'url'             => $this->get_tracking_url( $tracking_number ),
            'ambiguity_score' => 90, // strong match — exact regex with country anchor
        );
    }
}
```

Then register it via the filter:

```php
add_filter( 'woocommerce_fulfillment_shipping_providers', static function ( array $providers ): array {
    // Either pass a class name string (resolved via WC's DI container)…
    $providers[] = MyCourierShippingProvider::class;

    // …or pass a pre-built instance.
    // $providers[] = new MyCourierShippingProvider();

    return $providers;
} );
```

That's the entire surface. The provider now appears in the Fulfillments admin (provider dropdown when adding a tracking number to an order) and in the orders-list "Shipping provider" filter.

## How `get_shipping_providers()` resolves the filter

`FulfillmentUtils::get_shipping_providers()` ([src/Admin/Features/Fulfillments/FulfillmentUtils.php:417](FulfillmentUtils.php)) iterates the filter result and accepts either:

- An `AbstractShippingProvider` instance — used directly.
- A class name string — resolved via `wc_get_container()->get( $class )` (WC's DI container). Failure is silent (`continue` on Throwable).

It rejects entries that are neither — strings that aren't class names, scalars, anonymous arrays, etc. The final array is keyed by `get_key()`. **Two providers with the same key collide silently** — last-registered wins.

Because of the DI resolution, classes can have constructor dependencies (e.g. an HTTP client for live tracking lookups) that the container will inject — useful when the provider needs more than just the four abstract methods.

## Registering in the right place

The `woocommerce_fulfillment_shipping_providers` filter fires every time `FulfillmentUtils::get_shipping_providers()` is called — admin order detail render, orders-list filter, REST endpoint. Add the filter on `plugins_loaded` or your Plugin class's runtime registration phase.

```php
add_action( 'plugins_loaded', static function () {
    require_once __DIR__ . '/includes/MyCourierShippingProvider.php';
    add_filter( 'woocommerce_fulfillment_shipping_providers', /* ... */ );
}, 20 );
```

## Critical rules

- **`AbstractShippingProvider` ≠ `WC_Shipping_Method`.** Different concept, different lifecycle stage, different class hierarchy. If the goal is "show a rate at checkout", you need `WC_Shipping_Method` (sibling skill).
- **`get_key()` is the unique identifier** — keep it stable. Renaming it is a breaking change for orders that already store the key on their fulfillment records.
- **`get_tracking_url` MUST URL-encode the tracking number** to handle special characters and prevent URL injection.
- **`try_parse_tracking_number` returns `null` on no-match**, NOT an empty array. WC's detection logic distinguishes "didn't match" (null) from "matched with empty data" (array).
- **`ambiguity_score`: HIGHER = MORE CONFIDENT.** Verified in `FulfillmentsManager::get_best_parsing_result()` (line 561) — `$result['ambiguity_score'] > $best_score` picks the highest. Built-in carriers use 70 (loose / fallback patterns), 85-90 (typical strong matches), 92-98 (very specific formats). Use a high score for exact-regex matches, low for permissive heuristics that could match multiple carriers.
- **The result's `'url'` key is the tracking URL** — NOT `'tracking_url'`. The `FulfillmentsManager` reads `$result['url']` (line 522) and re-exposes it on the outer response as `tracking_url`. If you key it as `tracking_url` inside your provider's parse result, the carrier is recognised but the outer `tracking_url` field stays empty.
- **Two providers with the same `get_key()` collide silently.** Pick a slug-style key prefixed with your plugin / company name to avoid collisions with the built-ins (e.g. `mycompany-courier`, not just `mycourier`).
- **Country lists in `get_shipping_from_countries()` / `get_shipping_to_countries()` are ISO-3166-1 alpha-2 codes** — `'HU'`, `'DE'`, `'US'`. Same convention as `wc_get_country_locale()`.
- **The icon should be 64x64 or similar small PNG/SVG**, served over HTTPS. Used in admin UI carrier selection.
- **Use the DI container or a pre-built instance** — both work. For providers with no constructor dependencies, the class-string form is simplest.

## Common mistakes

```php
// WRONG — extending the wrong base class
class MyCourier extends WC_Shipping_Method { /* ... */ }
// This is a checkout-time rate calculator, not a fulfillment provider.

// WRONG — bare key collision with a built-in
public function get_key(): string {
    return 'dhl'; // already used by built-in DHLShippingProvider
}

// RIGHT — prefixed
public function get_key(): string {
    return 'mycompany-internal-courier';
}

// WRONG — returning empty array from try_parse_tracking_number when no match
public function try_parse_tracking_number( $tn, $from, $to ): ?array {
    if ( /* no match */ ) {
        return array(); // 🔴 WC treats this as "matched with empty data"
    }
}

// RIGHT — return null on no-match
public function try_parse_tracking_number( $tn, $from, $to ): ?array {
    if ( /* no match */ ) {
        return null;
    }
    return array( 'url' => $this->get_tracking_url( $tn ), 'ambiguity_score' => 90 );
}

// WRONG — wrong key name; carrier is detected but tracking URL stays empty
return array(
    'tracking_url'    => $this->get_tracking_url( $tn ), // 🔴 should be 'url'
    'ambiguity_score' => 90,
);

// WRONG — score inverted (treating 0 as "highest confidence")
return array(
    'url'             => $this->get_tracking_url( $tn ),
    'ambiguity_score' => 0, // 🔴 0 means LOWEST; this provider loses to any provider that returns ≥1
);

// RIGHT — high score for confident match
return array(
    'url'             => $this->get_tracking_url( $tn ),
    'ambiguity_score' => 90,
);

// WRONG — registering on rest_api_init or admin_init (too late for some uses)
add_action( 'rest_api_init', function () {
    add_filter( 'woocommerce_fulfillment_shipping_providers', /* ... */ );
} );

// RIGHT — registering on plugins_loaded so it's ready for any caller
add_action( 'plugins_loaded', function () {
    add_filter( 'woocommerce_fulfillment_shipping_providers', /* ... */ );
}, 20 );

// WRONG — non-URL-safe tracking number in URL
return 'https://track.example/?tn=' . $tracking_number;

// RIGHT — URL-encode user input
return 'https://track.example/?tn=' . rawurlencode( $tracking_number );

// WRONG — returning provider instances from get_icon
public function get_icon(): string {
    return MYPLUGIN_PLUGIN_PATH . 'assets/icon.png'; // server filesystem path, not a URL
}

// RIGHT — public URL
public function get_icon(): string {
    return plugins_url( 'assets/icon.png', MYPLUGIN_PLUGIN_FILE );
}
```

## Reading provider data at runtime

```php
use Automattic\WooCommerce\Admin\Features\Fulfillments\FulfillmentUtils;

$providers = FulfillmentUtils::get_shipping_providers();
// array<string, AbstractShippingProvider> keyed by provider get_key()

$dhl = $providers['dhl'] ?? null;
if ( $dhl ) {
    $url = $dhl->get_tracking_url( $tracking_number );
}

// Or programmatically iterate to find a carrier that matches a tracking number:
foreach ( $providers as $provider ) {
    $parsed = $provider->try_parse_tracking_number( $tn, 'HU', 'DE' );
    if ( $parsed !== null ) {
        // Found a match
        break;
    }
}
```

The returned providers are fully resolved instances — no further `wc_get_container()` calls needed.

## Cross-references

- Run **`wc-shipping-method`** when the goal is a checkout-time rate calculator (the typical "I want to add a custom shipping option" request).
- Run **`wc-hpos-compatibility`** if your provider stores per-order metadata — order writes go through `WC_Order::update_meta_data`, not direct postmeta.
- Run **`wp-plugin-bootstrap`** for the `Requires Plugins: woocommerce` declaration and the surrounding plugin file.

## What this skill does NOT cover

- The Fulfillments REST API endpoints (`/wc/v4/orders/<id>/fulfillments`, etc.) — adjacent topic; covered by the REST v4 skill if your plugin reads/writes fulfillments programmatically.
- Label generation, address printing, postage purchase flows — those are carrier-specific integrations the provider class doesn't standardize.
- The Fulfillments meta-box in the order edit screen — admin UI, separate concern.
- Live rate-fetching from the carrier API (used by some plugins to show real-time shipping rates) — that's a `WC_Shipping_Method` concern, not a provider concern.
- Webhook receivers from carriers (status updates, delivery confirmations) — also outside the provider class; usually a custom REST route on your end.

## References

- `AbstractShippingProvider`: [wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/Providers/AbstractShippingProvider.php](AbstractShippingProvider.php).
- Provider registry & filter: [wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/FulfillmentUtils.php:417](FulfillmentUtils.php) — `get_shipping_providers()` + the `woocommerce_fulfillment_shipping_providers` filter (`@since 10.1.0`).
- Static class-name → instance map of built-in providers: [wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/ShippingProviders.php](ShippingProviders.php) — ~70 entries, useful as a reference for naming conventions and key style.
- Reference implementation (DHL): [wp-content/plugins/woocommerce/src/Admin/Features/Fulfillments/Providers/DHLShippingProvider.php](DHLShippingProvider.php).
