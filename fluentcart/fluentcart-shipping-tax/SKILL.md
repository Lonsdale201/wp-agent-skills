---
name: fluentcart-shipping-tax
description: >-
  Implements and audits FluentCart shipping zones, methods, classes, checkout
  address matching, tax classes/rates, inclusive and exclusive prices,
  compound and shipping tax, per-variation overrides, EU VAT validation, and
  reverse charge. Use when extending ShippingMethod, ShippingZone,
  TaxCalculator, TaxManager, TaxModule, fct_shipping_methods, fct_tax_rates,
  fluent_cart/tax/validate_eu_vat_number, checkout shipping selection, carrier
  quotes, taxable fees, or historical order tax snapshots.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart shipping and tax

Treat shipping and tax as server-owned checkout calculations. A browser may
select an available method and provide an address; it must not decide the
method's eligibility, price, tax class, VAT result, or final total.

Read [shipping-tax-pipeline.md](references/shipping-tax-pipeline.md) before
adding carrier quotes, destination rules, tax overrides, or reverse charge.

## Resolve shipping from the current address

FluentCart stores zones, methods, and classes in its own tables. Use
ShippingMethod::getApplicableForCountry() or the shipping module's services so
selection zones are post-filtered by their country list and disabled/state-
inapplicable methods disappear.

Revalidate a selected method whenever country, state, postal code, cart lines,
shipping class, quantity, coupon, or store mode changes. Reject a stale method
instead of preserving a client-submitted amount. Keep amounts in integer minor
units.

Do not assume there is a stable abstract carrier-gateway SDK in 1.6.0. For live
quotes, keep provider calls in an addon-owned service, normalize results into
FluentCart's current shipping calculation contract, cache narrowly, enforce
timeouts, and retain a deterministic failure/fallback policy.

## Calculate tax through TaxCalculator

TaxCalculator resolves the effective product/variation tax class, destination
rates, category/store fallbacks, discounts, fees, shipping tax, subscription
signup/recurring amounts, inclusive/exclusive behavior, compound rates, and
rounding. Do not append tax by editing cart or order totals after this pipeline.

Preserve these invariants:

- product variation overrides take precedence over category/default mappings;
- mixed inclusive/exclusive carts can have tax_behavior 3;
- store-level behavior still governs shipping and fee treatment;
- taxable fees need an explicit tax decision;
- line and aggregate rounding must remain internally reconcilable;
- tax-disabled and zero-rate outcomes are different states.

Call TaxCalculator::resetCache() in long-running workers/tests that simulate
multiple stores or requests. Ordinary PHP requests get fresh in-memory caches.

## Handle VAT and reverse charge defensively

fluent_cart/tax/validate_eu_vat_number may supply third-party validation. Return
the exact shape expected by the installed TaxModule, validate country/prefix
consistency, use bounded network timeouts and caching, and fail according to an
explicit store policy. Never grant reverse charge solely because the submitted
VAT string is syntactically valid.

Treat fluent_cart/tax/reverse_charge_line_adjustment as a calculation filter,
not an authorization decision. Observe fluent_cart/tax/reverse_charge_applied
and reverse_charge_removed for replay-safe side effects only.

## Preserve historical evidence

Persisted order lines and OrderTaxRate records are order-time snapshots. Do not
recalculate old invoices from today's TaxRate, product category, address, or
shipping settings. Refunds must allocate from the stored order figures.

## Test matrix

Test all/selection/country zones, state inclusion, no method, disabled method,
shipping-class changes, free/paid shipping, quote timeout, stale selection,
tax disabled, zero/reduced/standard classes, variation override, inclusive,
exclusive and mixed carts, compound rates, taxable shipping/fees, fixed coupon
rounding, subscription signup/renewal, EU B2B validation success/failure/
timeout, reverse-charge add/remove, zero-decimal currency, and historical order
rendering after settings change.

## Cross-references

- Use fluentcart-cart-checkout for checkout mutation and locking.
- Use fluentcart-products-inventory for variation/class data.
- Use fluentcart-orders-transactions for snapshots and refunds.

## References

- Verified Free source paths:
  - fluent-cart/app/Modules/Shipping/
  - fluent-cart/app/Models/ShippingZone.php
  - fluent-cart/app/Models/ShippingMethod.php
  - fluent-cart/app/Models/ShippingClass.php
  - fluent-cart/app/Modules/Tax/TaxModule.php
  - fluent-cart/app/Modules/Tax/TaxCalculator.php
  - fluent-cart/app/Services/Tax/TaxManager.php
  - fluent-cart/app/Models/TaxClass.php
  - fluent-cart/app/Models/TaxRate.php
  - fluent-cart/app/Models/OrderTaxRate.php
