# fluentcart

Developer-extension skills for [FluentCart](https://fluentcart.com/)
(`fluent-cart`), its optional Pro addon (`fluent-cart-pro`), and the companion
FluentCart Migrator (`fluent-cart-migrator`). Use these when a third-party
plugin, headless client, payment provider, integration, fulfillment service, or
migration must cooperate with FluentCart's data and lifecycle instead of
bypassing it.

Grounded against FluentCart Free 1.6.0, FluentCart Pro 1.6.0, and FluentCart
Migrator 1.0.0 on WordPress 7.0.2 / PHP 8.3.30. Runtime smoke tests selected
Action Scheduler 4.0.0 in the local mixed-plugin environment. Each skill marks
its Free/Pro/Migrator boundary and prioritizes the installed source/runtime when
generic developer documentation differs from the tested release.

## Skills

| Skill | Purpose |
|---|---|
| `fluentcart-extension-architecture` | Bootstrap after the correct FluentCart lifecycle, use its container/models/services, understand CPT versus custom-table storage, preserve integer minor-unit money and store mode, and avoid direct-write/cache/version-boundary errors. |
| `fluentcart-products-inventory` | Extend products, details, variations, attributes, categories/brands, price/stock, fulfillment and downloads with correct parent/child identity, server-owned prices and atomic inventory changes. |
| `fluentcart-cart-checkout` | Add checkout validation, fields, custom items and fees while preserving cart-hash trust boundaries, recalculation, rate limiting, MySQL cart locking, retry behavior and server-owned totals. |
| `fluentcart-orders-transactions` | Read and mutate orders, transactions, refunds and independent order/payment/shipping statuses through lifecycle services; select public settlement hooks and build replay-safe fulfillment. |
| `fluentcart-payment-gateways` | Implement PaymentGatewayInterface/AbstractPaymentGateway providers, required gateway metadata, frontend confirmation, IPN/webhook handling, idempotency, refunds, saved methods and subscription capabilities. |
| `fluentcart-subscriptions-renewals` | Model automatic/manual/system collection, gateway- versus store-managed ownership, renewal invoices, saved-method system charges, retries, lifecycle hooks and access validity. |
| `fluentcart-customers-portal` | Resolve FluentCart customers separately from WP users, enforce email/user ownership, protect customer-profile resources, handle merges/guest linking and isolate request-static caches. |
| `fluentcart-downloads-storage` | Configure product downloads, order permissions and subscription/license gating; generate expiring order-bound links and extend Local/S3 or Pro R2 storage without exposing files. |
| `fluentcart-coupons-discounts` | Build fixed/percentage and virtual coupons, eligibility rules, priority/stacking, per-customer limits, recurring discounts and order snapshots; warns that accepted coupon enums do not prove a calculation implementation. |
| `fluentcart-shipping-tax` | Extend shipping zones/methods/classes and tax classes/rates, inclusive/exclusive/mixed behavior, compound/shipping tax, VAT validation, reverse charge and historical tax snapshots. |
| `fluentcart-rest-headless` | Build REST/AJAX, headless and mobile clients against the runtime `/fluent-cart/v2` inventory, WordPress authentication, policies, customer ownership, schemas, pagination, throttling and checkout state. |
| `fluentcart-integrations-jobs` | Build BaseIntegrationManager feeds and external automations with exact commerce triggers, `fct_scheduled_actions` plus Action Scheduler, provider idempotency, retries and stuck-job diagnostics. |
| `fluentcart-licensing-pro` | Extend the Pro Licensing module's entitlement lifecycle, site activation limits, customer/admin access, public client/update protocol and protected package delivery with explicit credential/token caveats. |
| `fluentcart-migration` | Run or extend EDD companion and Free-core WooCommerce migrations with source maps, resumable batches, WP-CLI, monetary transforms, recount/reconciliation, legacy endpoint continuity and rollback. |

## Recommended combinations

- Standard commerce addon: `fluentcart-extension-architecture` plus the narrow
  product, checkout, order, customer, and job skills it touches.
- New payment provider: `fluentcart-payment-gateways` +
  `fluentcart-orders-transactions`; add `fluentcart-subscriptions-renewals` for
  recurring or saved-method system charging.
- Headless/mobile storefront: `fluentcart-rest-headless` +
  `fluentcart-cart-checkout` + `fluentcart-customers-portal` +
  `fluentcart-payment-gateways`.
- Digital/licensed subscription: `fluentcart-downloads-storage` +
  `fluentcart-subscriptions-renewals` + `fluentcart-licensing-pro`.
- External CRM/LMS/fulfillment: `fluentcart-integrations-jobs` +
  `fluentcart-orders-transactions` and the appropriate customer/subscription
  skill.
- Store cutover: `fluentcart-migration` plus every target-domain skill needed
  by the source data being migrated.

## Verification notes

The tested developer documentation contains useful orientation but is not a
strict versioned route/gateway contract. In particular, 1.6.0 runtime route
inventory uses `/fluent-cart/v2`, does not register the generic `/cart/add`,
`/cart/update`, and `/cart/remove` REST examples, and gateway registration has
more metadata/response requirements than the shortest public example shows.
The affected skills therefore require source/runtime inventory after upgrades.
