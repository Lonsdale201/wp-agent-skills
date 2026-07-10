# WCS switching payload reference

## Cart data

The cart item key is `subscription_switch`:

```php
$cart_item['subscription_switch'] = array(
    'subscription_id'             => 123,
    'item_id'                     => 456,
    'next_payment_timestamp'      => 1770000000,
    'upgraded_or_downgraded'      => 'upgraded',
    'first_payment_timestamp'     => 1771000000,
    'end_timestamp'               => 1780000000,
    'recurring_payment_prorated'  => true,
    'force_payment'               => true,
);
```

`item_id` is the replaced subscription line item. It can be empty when adding an item; `wcs_cart_contains_switches( 'add' )` detects that case.

## Order data

Switch orders persist `_subscription_switch_data`, keyed by subscription ID:

```php
$switch_data[ $subscription_id ] = array(
    'switches' => array(
        $switch_order_item_id => array(
            'remove_line_item' => 456,
            'add_line_item'    => 789,
            'switch_direction' => 'upgrade',
        ),
    ),
    'billing_schedule' => array(
        '_billing_period'   => 'month',
        '_billing_interval' => 1,
    ),
    'dates' => array(
        'update' => array(
            'next_payment' => '2026-06-01 00:00:00',
            'trial_end'    => 0,
            'end'          => '2027-06-01 00:00:00',
        ),
        'delete' => array( 'trial_end' ),
    ),
    'coupons'             => array( 111 ),
    'fee_items'           => array( 222 ),
    'shipping_line_items' => array( 333 ),
);
```

WCS can cancel older unpaid switch orders when a new switch order is created.

## Item types and meta

| Item type | Meaning |
|---|---|
| `line_item_pending_switch` | New staged subscription item. |
| `line_item_switched` | Archived replaced item. |
| `line_item_removed` | Removed subscription item. |
| `coupon_pending_switch`, `fee_pending_switch`, `shipping_pending_switch` | Staged recurring items. |
| `coupon_switched`, `fee_switched`, `shipping_switched` | Archived recurring items. |

| Item meta | Stored on | Purpose |
|---|---|---|
| `_switched_subscription_item_id` | New subscription item | Old item ID. |
| `_switched_subscription_new_item_id` | Old subscription item | New item ID. |
| `_switched_subscription_sign_up_fee_prorated` | Switch order item | Prorated sign-up fee part. |
| `_switched_subscription_price_prorated` | Switch order item | Prorated recurring-price part. |
| `_has_trial` | Pending switch item | New item has a trial. |

## Hooks

| Need | Hook/filter | Args |
|---|---|---|
| Product switchability | `wcs_is_product_switchable` | `$can, $product, $variation` |
| Item switchability | `woocommerce_subscriptions_can_item_be_switched` | `$can, $item, $subscription` |
| User eligibility | `woocommerce_subscriptions_can_item_be_switched_by_user` | `$can, $item, $subscription` |
| Switch URL | `woocommerce_subscriptions_switch_url` | `$url, $item_id, $item, $subscription` |
| Retain coupon | `woocommerce_subscriptions_retain_coupon_on_switch` | `$retain, $code, $coupon, $subscription` |
| Added to cart | `woocommerce_subscriptions_switch_added_to_cart` | `$subscription, $old_item, $cart_key, $cart_item` |
| Price/day | `wcs_switch_proration_old_price_per_day`, `wcs_switch_proration_new_price_per_day` | Calculator context. |
| Switch type | `wcs_switch_proration_switch_type` | `$type, $subscription, $cart_item, $old, $new` |
| Proration flags | `wcs_switch_should_prorate_recurring_price`, `wcs_switch_should_prorate_sign_up_fee` | `$bool, $switch_item` |
| Extra amount | `wcs_switch_proration_extra_to_pay` | `$extra, $subscription, $cart_item, $days, $switch_item` |
| Completion | `woocommerce_subscriptions_switch_completed` | `$order` |
| Item switched | `woocommerce_subscriptions_switched_item` | `$subscription, $new_item, $old_item` |
| Item relation | `woocommerce_subscription_item_switched` | `$order, $subscription, $new_id, $old_id` |

```php
add_filter( 'wcs_switch_proration_extra_to_pay', function ( $extra, WC_Subscription $subscription, array $cart_item, int $days, $switch_item ) {
    if ( $switch_item instanceof WCS_Switch_Cart_Item && $switch_item->is_switch_during_trial() ) {
        return 0;
    }

    return $extra;
}, 10, 5 );
```
