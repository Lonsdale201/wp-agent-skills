# FluentCart 1.6.0 product contract

## Identifiers and storage

| Value | Meaning |
|---|---|
| Product.ID / post_id | WordPress post ID for fluent-products |
| ProductDetail.id | Internal detail row ID |
| ProductVariation.id | Purchasable variant ID used as cart/order object_id |
| variation_identifier | Combination identity, not the primary key |
| sku | Globally unique non-null SKU; maximum 30 chars in 1.6.0 |

ProductVariation includes item_price, compare_price, item_cost, payment_type,
fulfillment_type, item_status, sold_individually, downloadable,
shipping_class, stock fields, and other_info.

## Taxonomy versus attribute data

Use WP taxonomy APIs for:

- product-categories
- product-brands

Use FluentCart attribute resources/tables for configurable variation groups,
terms, mappings, and relations. A WordPress category/brand term is not a variant
attribute term.

## Pricing and recurring metadata

- Treat item_price, compare_price, item_cost, setup fees, and recurring amounts
  as minor units.
- payment_type distinguishes onetime and subscription behavior.
- Subscription terms such as repeat_interval, times, trial_days, and setup-fee
  flags are stored in variation other_info.
- ProductVariation normalizes installment to no when Pro is unavailable.

## Inventory state

| Field | Role |
|---|---|
| total_stock | configured total |
| available | currently available to reserve |
| on_hold | reserved by placed, unfulfilled order state |
| committed | fulfilled/committed stock |
| stock_status | in-stock or out-of-stock projection |
| manage_stock | whether the variant participates |
| backorders | whether normal stock shortage can be bypassed |

The StockManagement module reacts to order_created, order_paid, order_refunded,
order_updated, order_status_changed, and shipping_status_changed. Its callbacks
are stateful and use order stock_movement meta. Never emulate one callback by
blind arithmetic.

## Verification matrix

Test:

1. simple one-time digital, physical, and service variants;
2. subscription and setup-fee variants;
3. globally duplicated SKU;
4. unpublished product or inactive variation;
5. sold-individually and quantity greater than one;
6. managed stock at zero, backorder mode, and a status reversal;
7. bundle parent with an unavailable child;
8. detail/variant deletion and default-variation repair;
9. categories/brands versus custom attributes;
10. product list queries with bounded eager loading.
