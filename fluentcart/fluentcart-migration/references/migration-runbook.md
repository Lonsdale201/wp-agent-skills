# FluentCart migration runbook

## Before the first write

- Record FluentCart Free/Pro/Migrator, source plugin, WordPress, PHP, database
  and Action Scheduler versions.
- Create restorable database and uploads backups; test the restore.
- Clone production to an isolated staging environment and disable outgoing
  email, webhooks and live gateway/system-subscription charging.
- Collect source counts and aggregates per type/status/currency/year.
- Export representative edge-case IDs for deterministic spot checks.
- Define write freeze/delta, DNS/client endpoint, rollback and legacy-retention
  procedures.

## EDD companion sequence

~~~text
can-migrate and stats
  -> products
  -> tax rates
  -> coupons
  -> payments in resumable batches
  -> fix reactivations and missing subscription UUIDs
  -> recount coupons, customers and subscriptions
  -> verify licenses
  -> save/compare migration summary
~~~

UI payment batches call migratePayments(page, 100, 25). The service records
last_order_page and resets per-batch caches. WP-CLI uses larger, non-time-boxed
batches and is preferable for large stores.

## Mapping requirements

For every target entity retain:

- source system and entity type;
- source primary ID and parent ID;
- target ID/UUID;
- migrated source version/schema;
- checksum or last source modification point where delta imports are required;
- result/status and redacted error.

Keep distinct maps for products, variations, terms, customers, orders,
transactions, subscriptions, licenses, files and coupons. Mapping one parent ID
does not prove every child was migrated.

## Reconciliation report

Compare at minimum:

| Area | Checks |
|---|---|
| Catalog | Product/variation/status/stock/download counts and sample files |
| Orders | Counts by status/type/currency plus gross/tax/discount/refund sums |
| Customers | Ownership, user links, purchase count/value/LTV after recount |
| Subscriptions | Status, owner mode, remote IDs, dates, bill count/times |
| Coupons | Code/type/value/restrictions/use count and applied snapshots |
| Licenses | Key/status/product/customer/subscription, limits and activations |
| Compatibility | Legacy download, renewal, license and webhook requests |

Investigate differences; do not normalize the source baseline until it matches
the exact inclusion rules used by the target query.

## Cutover

1. Stop or capture source writes and outbound side effects.
2. Take the final backup/checkpoint.
3. Resume the full/delta import from recorded state.
4. Reconcile and smoke-test with real representative accounts in test mode.
5. Switch traffic/integrations while retaining legacy compatibility endpoints.
6. Monitor failed jobs, webhooks, downloads, activations and renewal dates.
7. Remove legacy data/plugins only after the agreed retention and rollback
   window.

## Destructive reset warning

MigratorService::wipeMigratedData() invokes the FluentCart database refresh and
deletes all `fluent-products` posts and related migration markers. It is a
whole-target reset, not a selective rollback based on source maps.

- REST `/fct-migrator/v1/reset` calls resetMigration() and requires both
  `manage_options` and FLUENT_CART_DEV_MODE.
- `wp fluent_cart_migrator reset` checks FLUENT_CART_DEV_MODE and confirms.
- In 1.0.0, `wp fluent_cart_migrator migrate_from_edd --reset` confirms but
  calls wipeMigratedData() directly without the dev-mode check.

Treat all three as production-prohibited and restore from backup rather than
assuming reset preserves native FluentCart data.
