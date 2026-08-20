# FluentCart 1.6.0 shipping and tax pipeline

## Checkout sequence

~~~text
server-owned cart lines
  -> current shipping/billing address
  -> applicable enabled zone methods
  -> validate selected method and calculate shipping
  -> resolve each line's effective tax class/inclusion mode
  -> destination tax rates, discounts, fees and shipping tax
  -> line/recurring/signup tax allocations
  -> cart/order totals and order-time tax snapshots
~~~

Shipping and tax must be recalculated together after any input that changes the
taxable base or destination.

## Core data

| Concern | Source |
|---|---|
| Shipping zones | fct_shipping_zones / ShippingZone |
| Methods and configured amount | fct_shipping_methods / ShippingMethod |
| Product shipping classes | fct_shipping_classes / ShippingClass |
| Tax class definitions | fct_tax_classes / TaxClass |
| Destination rates | fct_tax_rates / TaxRate |
| Historical applied rates | fct_order_tax_rates / OrderTaxRate |
| Product/variation calculation | TaxCalculator |
| Defaults, country maps and management | TaxManager and TaxModule |

ShippingMethod::getApplicableForCountry() includes the additional country-list
check required for zones whose region is selection. A raw query that only sees
the selection marker is insufficient.

## Address and selection trust boundary

The address is customer input, while configured zone membership, method state,
amount, class rules, tax settings and rates are server state. Re-resolve all of
them on checkout. A stored cart choice may become invalid after an address or
line-item change.

## Tax behaviors

TaxCalculator supports store defaults plus per-variation inclusion overrides.
Its tax_behavior values distinguish exclusive (1), inclusive (2), and mixed
(3). Mixed mode requires line-level interpretation; do not collapse it to the
current store default.

Compound taxes build on the current taxable amount plus earlier tax. Discounts
must reduce the correct taxable base before rate application. Subscription
lines additionally carry signup and recurring tax allocations.

## EU VAT extension checklist

1. Normalize country and VAT prefix without trusting the browser label.
2. Call a reliable validation provider with timeout and bounded retries.
3. Cache by normalized country/number for an appropriate short period.
4. Return the installed filter contract, not a guessed boolean.
5. Record enough order-time evidence for later invoice/audit use.
6. Recalculate and emit state changes only when reverse-charge status changes.
7. Test provider outage and ambiguous responses explicitly.

## Long-running processes

TaxCalculator keeps request memoization. Call resetCache() between simulated
requests, tenant/store switches, or fixture mutations in CLI workers and tests.
