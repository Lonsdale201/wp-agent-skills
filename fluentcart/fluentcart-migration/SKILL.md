---
name: fluentcart-migration
description: >-
  Plans, runs, extends, and audits migrations into FluentCart with the
  FluentCart Migrator companion plugin or Free-core WooCommerce migrator.
  Covers EDD 3 products, tax rates, coupons, customers, orders, transactions,
  subscriptions, downloads and licenses; source-to-target ID maps, resumable
  batches, WP-CLI, recount/verification, legacy endpoint compatibility,
  rollback, and destructive reset controls. Use for EDD/WooCommerce imports,
  custom source adapters, large-store cutovers, or migration integrity reviews.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart-migrator"
  wp-skills-plugin-version-tested: "1.0.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart migration

Run commerce migrations as staged, resumable data transformations with a
reconciliation report. Never test a destructive migration/reset first on the
only production copy.

Read [migration-runbook.md](references/migration-runbook.md) before executing or
extending a migration.

## Identify the correct migrator

The FluentCart Migrator 1.0.0 companion implements EDD 3.x migration. Its UI
lists WooCommerce and SureCart as coming soon; do not interpret those cards as
implemented adapters.

FluentCart Free 1.6.0 separately contains a WooCommerceMigrator module/CLI for
WooCommerce data. It is not the companion plugin's EDD pipeline and does not
imply complete order/subscription/gateway parity. Audit its exact source scope
before using it.

## Establish a cutover contract

Inventory source versions, table prefixes, currency and decimals, tax mode,
timezone, gateways, order statuses/types, customers, products/variations,
downloads, coupons, refunds, subscriptions, license data, and external
webhook/update URLs. Decide what is supported, transformed, retained only in
legacy storage, or explicitly excluded.

Back up database and files, clone to staging, freeze or record source writes,
and choose a repeatable delta strategy. A migration that takes hours without a
write-freeze or delta pass is not a complete cutover.

## Use the EDD pipeline in dependency order

Run and verify:

1. compatibility, source stats, store/currency/tax preflight;
2. products, variations, categories and downloads;
3. tax rates and coupon references;
4. payments/orders, customers, transactions, refunds, subscriptions/licenses;
5. fix/recount substeps and failed-item replay;
6. license verification and end-to-end checkout/download/renewal smoke tests.

The REST UI uses /fct-migrator/v1 with manage_options and time-boxes payment
work in 100-row pages for about 25 seconds before resuming. For large stores,
use the provided WP-CLI command, controlled process limits, and persistent logs.

## Make custom adapters idempotent

Maintain explicit source-type/source-ID to target-ID maps. Use a stable unique
source marker to update/reuse an already migrated entity. Never deduplicate a
customer by email or an order by a generated UUID without a documented conflict
policy.

Transform monetary values into FluentCart integer minor units with currency-
specific precision. Preserve original currency, gross/net/tax/discount/refund
allocations and exchange assumptions. Test zero- and three-decimal currencies;
do not multiply every source amount by 100 unconditionally.

Reset request-static migration/model caches between batches. Keep each batch
bounded and safe to resume after termination. Do not mark a step complete when
some rows failed without surfacing a replayable error manifest.

## Preserve external continuity

Migrated subscriptions may still be owned by their original gateway and remote
subscription IDs. Do not recreate charges or change billing owner during data
copy. Preserve webhook/payment lookup compatibility until all in-flight events
resolve.

The companion retains EDD license/download/renewal compatibility behavior.
Keep it active if legacy client URLs still target it, and audit those public
credential endpoints before cutover. EDD Software Licensing data requires
FluentCart Pro with its Licensing module.

## Verify before cleanup

Compare counts and monetary aggregates by currency/status/date, then sample
record graphs: product->variation->download, order->items->transaction->refund,
customer ownership, subscription->renewals, coupon usage, license->activations.
Run recount only after record relationships are correct.

Reset calls MigratorService::wipeMigratedData(), which refreshes FluentCart's
custom tables and deletes every fluent-products post, not merely rows proven to
come from EDD. The REST /reset path and dedicated WP-CLI reset subcommand require
FLUENT_CART_DEV_MODE, but the 1.0.0
`wp fluent_cart_migrator migrate_from_edd --reset` flag reaches the wipe after
confirmation without that dev-mode guard. Never run either form on production;
require a tested full backup and isolated staging environment.

## Test matrix

Test empty and large stores, rerun/resume at every boundary, crash mid-page,
duplicate source rows, email collisions, product/variation map loss, missing
files, multiple currencies, zero-decimal amounts, inclusive/exclusive tax,
coupon product restrictions, partial/full refunds, failed/pending orders,
recurring and reactivated subscriptions, license status/activations, old EDD
client URLs, gateway webhook fallback, source writes during cutover, verification
mismatch, rollback, and cleanup after the retention window.

## Cross-references

- Use fluentcart-extension-architecture for the target data model.
- Use fluentcart-orders-transactions for monetary/order invariants.
- Use fluentcart-subscriptions-renewals and fluentcart-licensing-pro for
  recurring/license continuity.

## References

- Verified companion source paths:
  - fluent-cart-migrator/Classes/MigratorService.php
  - fluent-cart-migrator/Classes/Commands.php
  - fluent-cart-migrator/Classes/Admin/RestApi.php
  - fluent-cart-migrator/Classes/EDD3/
  - fluent-cart-migrator/assets/js/components/
- Verified Free source paths:
  - fluent-cart/app/Modules/WooCommerceMigrator/
