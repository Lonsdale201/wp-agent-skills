---
name: wc-order-lifecycle-and-items
description: Work safely with WooCommerce order statuses, payment completion, status hooks, order items, line-item meta, totals, and stock side effects. Covers `payment_complete()` vs `update_status()`, `woocommerce_order_status_*` hook ordering and args, `woocommerce_order_status_changed`, `woocommerce_order_payment_status_changed`, `WC_Order_Item_Product`, `add_item()`, `calculate_totals()`, stock reduction/restoration hooks, HPOS-safe CRUD, and why not to instantiate base `WC_Order_Item`. Use when reacting to orders, adding/editing items, changing statuses, provisioning, fulfillment, stock logic, or debugging paid orders that skipped lifecycle side effects.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.8.0"
php-min: "7.4"
last-updated: "2026-05-27"
docs:
  - https://woocommerce.github.io/code-reference/classes/WC-Order.html
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-order.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-order.php
  - wp-content/plugins/woocommerce/includes/class-wc-order-item.php
  - wp-content/plugins/woocommerce/includes/class-wc-order-item-product.php
  - wp-content/plugins/woocommerce/includes/wc-order-functions.php
  - wp-content/plugins/woocommerce/includes/wc-stock-functions.php
  - wp-content/plugins/woocommerce/src/Internal/DataStores/Orders/OrdersTableDataStore.php
---

# WooCommerce order lifecycle and items

Use this when plugin code reacts to orders, changes statuses, creates or edits order items, changes totals, or depends on stock/payment side effects.

## Misconception this skill corrects

> "The payment succeeded, so I can just call `$order->update_status( 'completed' )`."

For a real payment success path, gateways should call `$order->payment_complete( $transaction_id )`. That clears the awaiting-payment session flag, sets transaction/date-paid data, chooses processing vs completed via `woocommerce_payment_complete_order_status`, saves, and fires `woocommerce_payment_complete`. `update_status()` only changes status.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin changes order status.
- A plugin reacts to `processing`, `completed`, `cancelled`, `failed`, `refunded`, or custom statuses.
- A gateway, webhook, fulfillment integration, ERP sync, license grant, stock adjustment, or provisioning flow touches orders.
- Code adds, removes, or edits order items.
- Code modifies item meta or order totals.
- The diff contains `payment_complete`, `update_status`, `set_status`, `woocommerce_order_status_`, `woocommerce_order_status_changed`, `woocommerce_order_payment_status_changed`, `WC_Order_Item_Product`, `add_item`, or `calculate_totals`.

## Status APIs

Use unprefixed statuses in order object APIs:

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order && $order->has_status( 'processing' ) ) {
    $order->update_status(
        'completed',
        __( 'Marked complete by MyPlugin.', 'myplugin' ),
        true
    );
}
```

`WC_Order::set_status()` stages the transition on the object. `WC_Order::update_status()` calls `set_status()` and saves immediately. The method docblock confirms no internal `wc-` prefix is required.

Gateway or webhook payment success:

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order && $provider_status === 'captured' ) {
    $order->payment_complete( $transaction_id );
}
```

Use `update_status( 'on-hold' )`, `update_status( 'failed' )`, or `update_status( 'cancelled' )` for non-success states.

## Status hook ordering

When a saved order status transition is processed, WooCommerce fires hooks in this order:

| Hook | Args | Notes |
|---|---|---|
| `woocommerce_order_status_{$to}` | `$order_id, $order, $status_transition` | Fires first. |
| status transition note | internal | Skipped for draft/new/checkout-draft origins. |
| `woocommerce_order_status_{$from}_to_{$to}` | `$order_id, $order` | Only when there is a previous status. |
| `woocommerce_order_status_changed` | `$order_id, $from, $to, $order` | General transition hook. |
| `woocommerce_order_payment_status_changed` | `$order_id, $order` | Only pending/failed to paid status. |

Use narrow hooks for narrow logic, and `woocommerce_order_status_changed` for transition-aware logic:

```php
add_action(
    'woocommerce_order_status_changed',
    static function ( int $order_id, string $from, string $to, WC_Order $order ): void {
        if ( 'processing' !== $to || 'processing' === $from ) {
            return;
        }

        as_enqueue_async_action(
            'myplugin_sync_paid_order',
            array( 'order_id' => $order_id ),
            'myplugin'
        );
    },
    10,
    4
);
```

Do not perform slow API calls directly inside status hooks. Enqueue a job and make the job idempotent.

## Order creation hooks

`woocommerce_new_order` is not a universal "checkout just started" hook. In WC 10.8 the CPT and HPOS stores skip normal new-order behavior for draft/new/checkout-draft transitions and fire it when the order becomes non-draft. For checkout-specific behavior, use checkout hooks such as `woocommerce_checkout_order_created` or `woocommerce_checkout_order_processed`.

## Add a product line item

Use concrete item classes. Do not instantiate base `WC_Order_Item`; WC 9.9+ warns against direct base-item instantiation.

```php
$order   = wc_get_order( $order_id );
$product = wc_get_product( $product_id );

if ( $order instanceof WC_Order && $product instanceof WC_Product ) {
    $price = (float) $product->get_price( 'edit' );

    $item = new WC_Order_Item_Product();
    $item->set_product( $product );
    $item->set_quantity( 1 );
    $item->set_subtotal( $price );
    $item->set_total( $price );
    $item->add_meta_data( '_myplugin_source', 'manual-adjustment', true );

    $order->add_item( $item );
    $order->calculate_totals();
    $order->save();
}
```

`add_item()` attaches the item to the order object and assigns a temporary item key until save. Recalculate totals after changing items, fees, shipping, discounts, or taxes.

## Edit existing line items

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order ) {
    foreach ( $order->get_items( 'line_item' ) as $item ) {
        if ( ! $item instanceof WC_Order_Item_Product ) {
            continue;
        }

        $item->add_meta_data( '_myplugin_exported', current_time( 'mysql', true ), true );
        $item->save();
    }

    $order->save();
}
```

For machine data, use private meta keys. For customer/admin-visible item meta, use readable labels.

## Stock side effects

WooCommerce already wires stock reduction and restoration to order lifecycle hooks:

- `wc_maybe_reduce_stock_levels()` runs on `woocommerce_payment_complete`, `woocommerce_order_status_completed`, `woocommerce_order_status_processing`, and `woocommerce_order_status_on-hold`.
- `wc_maybe_increase_stock_levels()` runs on `woocommerce_order_status_cancelled` and `woocommerce_order_status_pending`.
- Each line item stores `_reduced_stock` to avoid reducing stock twice.
- `woocommerce_order_item_quantity` filters the quantity used for stock reduction.
- `woocommerce_reduce_order_item_stock`, `woocommerce_reduce_order_stock`, and `woocommerce_restore_order_stock` let integrations observe changes.

Do not call `wc_reduce_stock_levels()` blindly in payment/webhook code. In the normal paid flow, `payment_complete()` and the status hooks already cover it. If you implement custom stock behavior, respect `_reduced_stock` and make the operation idempotent.

## HPOS-safe order data

Orders are not posts in HPOS mode. Use WooCommerce CRUD:

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order ) {
    $order->update_meta_data( '_myplugin_external_id', $external_id );
    $order->save();
}
```

Do not use `get_post_meta()`, `update_post_meta()`, `WP_Query` over `shop_order`, or direct `wp_postmeta` SQL for order state.

## Common mistakes

- Using `update_status( 'completed' )` as a payment success replacement for `payment_complete()`.
- Passing `wc-processing` to object methods that expect unprefixed statuses.
- Running slow fulfillment/API calls directly inside order status hooks.
- Instantiating `WC_Order_Item` instead of `WC_Order_Item_Product`, `WC_Order_Item_Fee`, `WC_Order_Item_Shipping`, `WC_Order_Item_Coupon`, or `WC_Order_Item_Tax`.
- Editing items and forgetting `calculate_totals()` and `save()`.
- Calling stock reduction manually after WooCommerce already did it.
- Saving order data through post meta instead of CRUD APIs.

## Cross-skill routing

- Payment gateway process and webhook success: `wc-payment-gateway`
- HPOS storage/query compatibility: `wc-hpos-compatibility`
- Background work from order hooks: `wc-action-scheduler-jobs`
- Cart/checkout line-item meta before order creation: `wc-cart-checkout-classic`
