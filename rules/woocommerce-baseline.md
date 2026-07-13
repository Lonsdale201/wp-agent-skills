---
name: woocommerce-baseline
description: >
  Non-negotiable WooCommerce invariants for every Woo plugin/theme PHP task —
  CRUD over raw meta, HPOS-safe order access, Store API for block checkout, and
  money handling. Builds on wp-core-baseline; a full pass defers to the linked skills.
scope: global
globs:
  - "**/*.php"
always-apply: false
version: "1.1.0"
last-updated: "2026-07-14"
---

# WooCommerce baseline (always-on)

Invariants for every WooCommerce plugin/theme PHP task. Builds on `wp-core-baseline` — escaping, sanitization, nonces, and capability checks still apply; this layer adds the Woo-specific ones.

## Data access (CRUD, never raw meta)

- Read and write products through CRUD: `wc_get_product( $id )`, `$product->get_*()` / `set_*()`, `$product->save()`. Never use `get_post_meta()` / `update_post_meta()` for `_price`, `_stock`, `_sku`, and similar.
- Read and write orders through CRUD: `wc_get_order( $id )`, `$order->get_*()` / `set_*()`, `$order->save()`. An order ID is not guaranteed to be a post.
- Never query `wp_posts` / `wp_postmeta` for orders or products by hand. Use `wc_get_orders()` / `wc_get_products()` with args.

## HPOS (High-Performance Order Storage)

- Assume orders may live in custom tables, not `wp_posts`. Code must work under both HPOS and legacy storage.
- Declare compatibility from the main plugin file: `FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__ )` on `before_woocommerce_init`.
- For custom order queries, use `wc_get_orders()` args or HPOS-aware clauses — never assume a `wp_postmeta` JOIN.

## Store API & blocks

- Cart/Checkout blocks run on the **Store API** (`/wc/store/v1`), not the classic `woocommerce_checkout_*` POST flow. Don't assume classic hooks fire on block checkout.
- Add checkout fields via `woocommerce_register_additional_checkout_field()` / the Store API, never by injecting `<input>` HTML into block templates.
- Persist custom cart/order data through `woocommerce_store_api_*` hooks.

## Money & stock

- Format prices with `wc_price()`; never hardcode currency symbols or decimal counts.
- Normalize amounts with `wc_format_decimal()` and `wc_get_price_decimals()`. Never trust a client-submitted price — recalculate totals server-side.
- Change stock through `wc_update_product_stock()` or product setters, not raw `_stock` meta.

## Background work

- Never run slow work (remote API calls, imports, bulk recalculation) inline in checkout, order-status, or webhook hooks — queue it with Action Scheduler and pass scalar IDs, not objects.
- Job callbacks must be replay-safe: there is no exactly-once guarantee (crashes, retries, manual CLI runs). Idempotency lives in the callback / remote system, not in the scheduler.

## Templates & hooks

- Prefer WooCommerce hooks/filters over overriding templates.
- If you must override, copy into `yourtheme/woocommerce/` and keep the template's `@version` header current.

## When depth is needed (defer to skills)

- HPOS → `wc-hpos-compatibility`
- Store API / block checkout → `wc-store-api`
- Background jobs → `wc-action-scheduler-jobs`
- Logging → `wc-logging`
- REST → `wc-rest-api-v4`
- Emails → `wc-emails-classic`
- Product variations → `wc-variations-data`
- Classic template overrides → `classic-woocommerce-template-overrides`
