# WooCommerce 11.0 extension compatibility breakpoints

Version scope: WooCommerce 11.0.0, WordPress 6.9+, PHP 7.4+, bundled Action Scheduler 4.0.0. This is a targeted audit checklist, not a replacement for the exact release diff or runtime tests.

## High-impact public behavior

| Surface | WooCommerce 11.0 behavior | Extension action |
|---|---|---|
| Product editor | The in-core beta product editor is retired. The classic editor remains; experimental development moved out of the stable core surface. | Remove assumptions about the retired beta slots/components. Integrate with stable classic hooks or explicitly version an external editor dependency. |
| Shop query object | On the main Shop page, `get_queried_object()` now returns the Shop page `WP_Post`. | Audit code that expected a product archive/taxonomy object or `null`; branch by page/context and type-check. |
| Shipping classes | `product_shipping_class` is registered non-public with no frontend rewrite/query variable. Assignment and shipping calculations remain. | Do not expose archives, sitemaps, or public queries based on shipping classes. Use product CRUD/term APIs for rates. |
| Order item removal | `WC_Order::remove_order_items()` clears in memory and defers database deletion until `save()`; the post-removal hook follows persistence. | Save explicitly and audit hook timing/exception behavior. |
| Stock reservation | The public `wc_reserve_stock_for_order()` wrapper uses the configured hold duration; direct internal reservation defaults an omitted duration to 60 minutes. | Prefer the wrapper. Pass duration explicitly in version-pinned internal code. |
| Failed-order stock | Moving an order to `failed` now runs the normal stock-increase path, restoring quantities previously reduced on on-hold/asynchronous payments. | Remove duplicate extension restoration and test `_reduced_stock` idempotency across on-hold → failed. |
| Custom order statuses | Storage remains limited to 20 characters including `wc-`; Woo 11 warns on an overlong CPT status. | Keep custom unprefixed ASCII slugs at 17 characters or fewer and test both storage modes. |
| Fractional stock | Positive stock below `1` survives product validation when the default `intval` stock filter is deliberately replaced with `floatval`. | Merely appending `floatval` loses the fraction; audit cart/order/report code for integer casts. |
| Phone values | `WC_Validation::is_phone_format()`, `woocommerce_validate_phone`, and `woocommerce_format_phone_number` provide validation/normalization extension points. | Validate and format separately; do not treat formatting as authorization or proof of ownership. |
| Customer email verification | Matching historical guest orders are linked only after the current account email is verified. Public hooks are `woocommerce_customer_email_verified` and `woocommerce_customer_verify_email_notification`. | Do not claim orders early from an email match or touch internal verification meta/classes. Treat verification URLs as secrets. |
| Email preview | `woocommerce_email_preview_show_shipping_details` controls preview-only shipping details. | Tolerate nullable preview order/type; do not confuse preview output with real sends. |
| Cancelled-order email | Pending → cancelled now enters the core notification dispatcher and cancelled-order admin email. | Remove/deduplicate compatibility code that manually sent this notification. |
| Backorder stock email | Merchant setting `woocommerce_notify_backorder` and `woocommerce_should_send_backorder_notification` can suppress core backorder mail. | Preserve the incoming filter value; do not confuse email suppression with product backorder eligibility. |
| Abandoned-cart recovery | New experimental, default-off recovery email supports manual sends and optional two-hour scheduling for eligible pending checkout orders. | Suppress duplicate providers with `woocommerce_abandoned_cart_recovery_suppress`; preserve unsubscribe/privacy and do not touch internal scheduler/meta/table state. |

## Performance and cache behavior

- New stores enable `product_instance_caching`; upgraded stores retain their prior feature state.
- The `product_objects` group is request-local/non-persistent. Repeated `wc_get_product()` calls can avoid hydration but return clones; never depend on object identity.
- CRUD, WordPress post/meta cache hooks, and Woo stock/sales hooks invalidate the instance cache. Raw SQL bypasses these contracts.
- Audit tests with the feature explicitly enabled and disabled. See `wc-product-crud-cache`.

## Store API and REST behavior

- Product collection filters that accept ID arrays cap each array at 25 and normalize/deduplicate values. Split larger client requests or use an appropriate server-side integration.
- Decoded JSON values passed through additional Store API fields are no longer automatically unslashed. Do not double-unslash JSON strings.
- Existing-order checkout/payment validates submitted addresses before persistence; invalid addresses must not partially overwrite an order.
- `wc/v3` product and product-variation collection routes accept `image_size`; default is `full`, and unknown registered sizes fall back to full.
- Store API variation-by-ID/slug reads now require a published parent, and review collections exclude reviews of unpublished products. Preserve these disclosure boundaries in custom routes.
- Core `wc/v4` remains build-gated off in the 11.0.0 release even though controllers ship.
- Latent v4 adds `POST /wc/v4/refunds/preview`, protected by create-refund permissions. Source presence is not runtime availability.

## Products and frontend

- The experimental native variation gallery can enable for a 5% remote canary cohort when its explicit option is absent. Check `FeaturesUtil::feature_is_enabled( 'variation_gallery' )`, not only the option value.
- Global visual-attribute term slugs are constrained through Woo's 29-byte helper. Preserve uniqueness after byte-safe truncation.
- Visual attribute AJAX results can include color/image metadata. Keep consumers tolerant of absent optional fields.
- `woocommerce_term_recount_product_count` can adjust a term's stored product-count projection immediately before update. Keep callbacks bounded/deterministic and do not write count meta directly.

## HPOS

- `OrderUtil::custom_orders_table_data_sync_is_enabled()` is the cheap public check for the synchronization setting; it does not prove a particular order is already synchronized.
- Large-store eligible-status queries can use a UNION optimization. If `woocommerce_orders_table_query_sql` changes the generated SQL, WooCommerce skips that optimization. Audit raw SQL filters for correctness and performance.

## Action Scheduler 4.0 bundled by WooCommerce 11.0

- Unique scheduling now matches pending/running actions by exact hook, group, and serialized arguments. Argument types, order, and JSON representation matter.
- Failed actions are cleaned after roughly three months by default; completed/canceled actions retain the usual 31-day default.
- Cleanup is a dedicated daily job with batches/continuations. Use documented retention and failed-cleanup filters; do not assume failed history is permanent.
- Failed one-off actions are not automatically retried. Retry policy belongs to the job implementation.
- See `wc-action-scheduler-jobs` for mixed-version guidance.
- Action Scheduler tables remain on WooCommerce uninstall unless the site owner explicitly opts into their removal with `WC_REMOVE_ACTION_SCHEDULER`; extensions must not define it or drop shared queue tables.

## Minimum smoke assertions

1. `get_queried_object()` on Shop is a `WP_Post`.
2. `get_taxonomy( 'product_shipping_class' )->public` is false.
3. product CRUD is fresh with product instance caching both off and on.
4. `remove_order_items()` leaves persistence unchanged until `save()` and the after-hook occurs after save.
5. Store API rejects/normalizes collection arrays according to the 25-item schema.
6. `/wc/v4/refunds/preview` is absent while `rest-api-v4` is disabled.
7. Action Scheduler unique actions distinguish different argument payloads and reject an exact duplicate.
