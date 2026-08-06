# FluentCart 1.6.0 data and lifecycle map

## Bootstrap order

~~~text
plugin load -> core hook registrations
plugins_loaded -> fluentcart_loaded
init priority 9 -> storage drivers + fluent_cart/register_storage_drivers
init priority 10 (earlier callback) -> gateways + fluent_cart/register_payment_methods
init priority 10 (later callback) -> DB migration + fluent_cart/init
~~~

Attach payment/storage registration listeners at plugin load, plugins_loaded,
or fluentcart_loaded. Do not wait for fluent_cart/init for those two actions.

Use this map to orient an integration. Re-audit migrations and models after an
upgrade; table shape is not a stable public API.

## Runtime

1. fluent-cart.php defines Free constants and loads Composer plus boot/app.php.
2. plugins_loaded fires fluentcart_loaded with the Application instance.
3. ProductDataSetup boots after that hook.
4. Earlier init callbacks register storage drivers and payment methods.
5. The later core init callback runs DBMigrator::maybeMigrateDBChanges().
6. That callback then fires fluent_cart/init with the Application instance.

Pro 1.6.0 requires Free 1.6.0. The companion Migrator 1.0.0 loads only when
FLUENTCART_VERSION exists.

## Entity ownership

| Entity | Storage | Important relationship |
|---|---|---|
| Product | wp_posts, post type fluent-products | detail/variants link by post_id |
| ProductDetail | fct_product_details | one per product |
| ProductVariation | fct_product_variations | many per product; globally unique non-null SKU |
| ProductDownload | fct_product_downloads | product plus selected variation IDs |
| Cart | fct_carts | primary lookup is cart_hash |
| Customer | fct_customers | optional user_id plus email identity |
| Order | fct_orders | customer_id; optional parent_id for renewal |
| OrderItem | fct_order_items | order_id plus object_id variation |
| OrderTransaction | fct_order_transactions | order_id and optional subscription_id |
| Subscription | fct_subscriptions | parent_order_id, customer, product, variation |
| Coupon | fct_coupons | conditions/settings JSON |
| AppliedCoupon | fct_applied_coupons | immutable-ish order-time discount snapshot |
| Download permission | fct_order_download_permissions | customer/order/download accounting |
| ScheduledAction | fct_scheduled_actions | FluentCart integration queue, not Action Scheduler |

Additional tables cover addresses, order/product/customer/subscription meta,
tax rates/classes/order snapshots, shipping zones/methods/classes, attributes,
activities, labels, webhooks, and reports. Pro licensing adds fct_licenses,
fct_license_activations, fct_license_sites, and fct_license_meta.

## Identity rules

- Product IDs are WordPress post IDs; variation IDs are custom-table IDs.
- Order IDs are internal numeric IDs. uuid is an external-facing lookup value,
  but its database index is non-unique for legacy compatibility.
- Customer ID is not WP user ID.
- Subscription and transaction identifiers have their own namespaces.
- Never authorize a request solely because it knows a UUID or cart hash.

## Monetary rules

Orders, items, transactions, subscriptions, fees, tax, shipping, and coupon
allocations use integer minor units in business logic. Some ORM casts and
variation schema columns are double for historical reasons; do not introduce
floating-point arithmetic because of that implementation detail.

Use:

- FluentCart\App\Helpers\Helper::toCent() at decimal-input boundaries.
- Helper::toDecimal() or CurrencySettings at presentation boundaries.
- integers for sums, comparisons, refunds, discounts, shipping, and tax.

## Cache and long-running process rules

Some Resources use request-static caches. Reset them between simulated requests,
different users, or sites in CLI/tests:

- CustomerResource::resetCurrentCustomerRuntimeCache()
- Frontend CartResource::resetCartCache()
- TaxCalculator::resetCache() when its calculation context changes

Do not keep FluentCart model/application state across multisite switch_to_blog()
boundaries without re-resolving it.
