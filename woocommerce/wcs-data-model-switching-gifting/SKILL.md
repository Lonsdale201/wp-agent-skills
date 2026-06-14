---
name: wcs-data-model-switching-gifting
description: WooCommerce Subscriptions data model, switcher, and gifting
  reference for exact order type names, product type slugs, subscription
  meta keys, schedule/date keys, related-order relation meta, switch cart
  data, switch order data, switched item types/meta, proration hooks, and
  WCS Gifting recipient storage. Use when code reads or writes
  shop_subscription, subscription, variable-subscription,
  subscription_variation, _billing_period, _schedule_next_payment,
  _subscription_switch_data, _subscription_switch, subscription_switch,
  _switched_subscription_item_id, wcsg_gift_recipients_email,
  _recipient_user, _recipient_user_email_address, wcsg_recipient, or when
  an agent needs the full WooCommerce Subscriptions switcher/gifting flow.
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-subscriptions
plugin-version-tested: "8.8.1"
php-min: "7.4"
last-updated: "2026-06-14"
source-refs:
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-core-plugin.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/data-stores/class-wcs-subscription-data-store-cpt.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/data-stores/class-wcs-orders-table-subscription-data-store.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-product.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-functions.php
  - wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-switch-functions.php
  - wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wc-subscriptions-switcher.php
  - wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wcs-switch-totals-calculator.php
  - wp-content/plugins/woocommerce-subscriptions/includes/downloads/
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcs-gifting.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-product.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-cart.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-checkout.php
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-recipient-management.php
---

# WooCommerce Subscriptions: data model, switching, gifting

Use this when exact storage names or switch/gift internals matter. Prefer WCS CRUD functions and `WC_Subscription` methods for writes; use raw keys only for audits, migrations, debugging, or compatibility glue.

## Core names

| Entity | Name/key | Notes |
|---|---|---|
| Subscription order type | `shop_subscription` | Registered with `wc_register_order_type()`, class `WC_Subscription`. In CPT storage it is a post type; in HPOS it is an order type. |
| Simple subscription product type | `subscription` | `WC_Product_Subscription::get_type()`. |
| Variable subscription product type | `variable-subscription` | `WC_Product_Variable_Subscription::get_type()`. |
| Subscription variation product type | `subscription_variation` | `WC_Product_Subscription_Variation::get_type()`. |
| Action Scheduler group | `wc_subscription_scheduled_event` | Used for subscription scheduled events. |

Subscription statuses are WooCommerce order statuses with `wc-` prefix in storage: `wc-pending`, `wc-active`, `wc-on-hold`, `wc-cancelled`, `wc-switched`, `wc-expired`, and `wc-pending-cancel`. Object APIs usually use unprefixed values.

## Subscription meta keys

These keys map to `WC_Subscription` props in both CPT and HPOS subscription data stores.

| Meta key | Prop/date key | Purpose |
|---|---|---|
| `_billing_period` | `billing_period` | `day`, `week`, `month`, or `year`. |
| `_billing_interval` | `billing_interval` | Billing interval integer. |
| `_suspension_count` | `suspension_count` | Customer/admin suspension count. |
| `_cancelled_email_sent` | `cancelled_email_sent` | Cancellation email guard. |
| `_requires_manual_renewal` | `requires_manual_renewal` | Manual renewal flag. |
| `_trial_period` | `trial_period` | Trial period unit. |
| `_last_order_date_created` | `last_order_date_created` | Last related parent/renewal order created date used by WCS. |
| `_schedule_start` | `start` / `schedule_start` | Subscription start datetime. |
| `_schedule_trial_end` | `trial_end` / `schedule_trial_end` | Trial end datetime. |
| `_schedule_next_payment` | `next_payment` / `schedule_next_payment` | Next renewal datetime. |
| `_schedule_cancelled` | `cancelled` / `schedule_cancelled` | Cancellation datetime. |
| `_schedule_end` | `end` / `schedule_end` | End/expiration datetime. |
| `_schedule_payment_retry` | `payment_retry` / `schedule_payment_retry` | Retry datetime. |
| `_subscription_switch_data` | `switch_data` | Switch order execution payload. |

Use `WC_Subscription::update_dates()`, `delete_date()`, setters like `set_billing_period()`, and `save()`. Directly updating these meta keys can desync validation and scheduled actions.

## Product subscription meta

Subscription product data lives on `product` or `product_variation` posts.

| Meta key | Purpose |
|---|---|
| `_subscription_price` | Recurring price. |
| `_subscription_sign_up_fee` | Sign-up fee. |
| `_subscription_period` | Billing period. |
| `_subscription_period_interval` | Billing interval. |
| `_subscription_length` | Subscription length. |
| `_subscription_trial_period` | Trial period unit. |
| `_subscription_trial_length` | Trial length. |
| `_subscription_gifting` | Product-level gifting override: `enabled`, `disabled`, or empty for global setting. |
| `_subscription_one_time_shipping` | One-time shipping flag. |
| `_subscription_payment_sync_date` | Renewal synchronization setting. |

Use `WC_Subscriptions_Product` helpers such as `get_price()`, `get_period()`, `get_interval()`, `get_length()`, `get_trial_length()`, `get_sign_up_fee()`, and `get_gifting()`.

## Related order relation meta

WCS relates ordinary orders to subscriptions with order meta and relation stores. Do not infer relation from parent ID alone.

| Meta key | Relation |
|---|---|
| `_subscription_renewal` | Renewal order to subscription. |
| `_subscription_switch` | Switch order to subscription. |
| `_subscription_resubscribe` | Resubscribe order to subscription. |

Use `wcs_get_subscription_ids_for_order()`, `wcs_get_subscriptions_for_order()`, `wcs_get_subscriptions_for_renewal_order()`, `wcs_get_subscriptions_for_switch_order()`, and `$subscription->get_related_orders()`.

## Switcher flow

Switching replaces or adds subscription line items through checkout. It is not a simple product ID update.

1. A user clicks the switch link printed in My Account by `WC_Subscriptions_Switcher::print_switch_link()`.
2. The link points to the product/grouped product URL with `switch-subscription`, `item`, and `_wcsnonce` query args.
3. `subscription_switch_handler()` validates ownership, nonce, and item switchability.
4. `validate_switch_request()` blocks non-subscription products and identical product/variation/quantity switches.
5. `set_switch_details_in_cart()` adds cart item data under `subscription_switch`.
6. `WCS_Switch_Totals_Calculator` calculates proration, switch direction, first payment timestamp, and possible prepaid-term changes.
7. Checkout line item meta records prorated amounts on the switch order and switched item links on subscription items.
8. `process_checkout()` creates `_subscription_switch_data` on the switch order and may create pending switch items on the existing subscription.
9. When the switch order is paid/completed, `complete_subscription_switches()` applies the payload to the subscription.
10. WCS fires `woocommerce_subscriptions_switch_completed` and item-level switch actions after completion.

## Custom switch flows

WCS does not expose a simple customer REST endpoint for "switch this subscription item to that product". The built-in switcher is a cart/checkout/order-completion flow. Custom account UI, AJAX, or REST layers must wrap that flow or deliberately reproduce its order payload.

Safe pattern:

1. Verify the current user can switch the exact subscription item with `WC_Subscriptions_Switcher::can_item_be_switched_by_user()`.
2. Build a temporary cart/session context for the current user and add the replacement product with `subscription_switch` cart item data.
3. Let `WCS_Switch_Totals_Calculator` calculate prorations, `first_payment_timestamp`, `end_timestamp`, `force_payment`, and switch direction.
4. Return preview totals from the calculated cart/order data, not from hand-written price math.
5. On confirmation, create the switch order with the same `_subscription_switch_data` shape WCS checkout writes.
6. If an immediate payment is due, process it through the gateway/order payment flow; if no payment is due, complete/apply the switch through WCS completion logic.
7. Let `complete_subscription_switches()` apply the change and let WCS fire its normal hooks.

Do not implement switching by directly calling `$subscription->remove_item()` and `$subscription->add_product()` from a customer action. That bypasses switch orders, prorations, tax/fee/coupon handling, old item archival, pending switch item types, cancellation of older unpaid switch orders, and completion hooks.

For read-only previews or eligibility checks, it is fine to expose custom endpoints that return allowed products, switchable item IDs, and WCS-calculated preview totals. For writes, prefer a service that uses WCS cart/checkout objects internally.

## Switch cart data

The cart item key is `subscription_switch`. Typical shape:

```php
$cart_item['subscription_switch'] = array(
    'subscription_id'        => 123,
    'item_id'                => 456,
    'next_payment_timestamp' => 1770000000,
    'upgraded_or_downgraded' => 'upgraded', // or downgraded/crossgraded, after calculation
    'first_payment_timestamp' => 1771000000, // after proration calculation
    'end_timestamp'          => 1780000000, // when length changes
    'recurring_payment_prorated' => true,
    'force_payment'          => true,
);
```

`item_id` is the subscription line item being replaced. When adding an item to a subscription without replacing one, `item_id` can be empty and `wcs_cart_contains_switches( 'add' )` is relevant.

## Switch order data

Switch orders store `subscription_switch_data`, persisted as `_subscription_switch_data` on the order. Shape by subscription ID:

```php
$switch_data[ $subscription_id ] = array(
    'switches' => array(
        $switch_order_item_id => array(
            'remove_line_item'  => 456,
            'add_line_item'     => 789,
            'switch_direction'  => 'upgrade',
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

WCS can cancel older unpaid switch orders for the same subscription when a new switch order is created.

## Switched item types and meta

WCS uses custom order item types during and after switch execution.

| Item type | Meaning |
|---|---|
| `line_item_pending_switch` | New line item staged on a subscription before switch completion. |
| `line_item_switched` | Old subscription line item archived after replacement. |
| `line_item_removed` | Removed subscription line item. |
| `coupon_pending_switch`, `fee_pending_switch`, `shipping_pending_switch` | Staged recurring coupon/fee/shipping items. |
| `coupon_switched`, `fee_switched`, `shipping_switched` | Archived old recurring coupon/fee/shipping items. |

Important item meta:

| Item meta | Stored on | Purpose |
|---|---|---|
| `_switched_subscription_item_id` | New subscription line item | Old subscription item ID. |
| `_switched_subscription_new_item_id` | Old subscription line item | New subscription/order line item ID. |
| `_switched_subscription_sign_up_fee_prorated` | Switch order line item | Portion of order line total from prorated sign-up fee. |
| `_switched_subscription_price_prorated` | Switch order line item | Portion of order line total from prorated recurring price. |
| `_has_trial` | Pending switch item | Marks new item with trial. |

## Switch extension points

| Need | Hook/filter | Args |
|---|---|---|
| Check product switchability | `wcs_is_product_switchable` | `$is_switchable, $product, $variation` |
| Check item switchability | `woocommerce_subscriptions_can_item_be_switched` | `$can, $item, $subscription` |
| Check user can switch item | `woocommerce_subscriptions_can_item_be_switched_by_user` | `$can, $item, $subscription` |
| Switch URL | `woocommerce_subscriptions_switch_url` | `$url, $item_id, $item, $subscription` |
| Switch link markup/text/classes | `woocommerce_subscriptions_switch_link`, `woocommerce_subscriptions_switch_link_text`, `woocommerce_subscriptions_switch_link_classes` | Link context. |
| Retain coupons | `woocommerce_subscriptions_retain_coupon_on_switch` | `$retain, $coupon_code, $coupon, $subscription` |
| Switch added to cart | `woocommerce_subscriptions_switch_added_to_cart` | `$subscription, $existing_item, $cart_item_key, $cart_item` |
| Proration price/day | `wcs_switch_proration_old_price_per_day`, `wcs_switch_proration_new_price_per_day` | Calculator context. |
| Switch type | `wcs_switch_proration_switch_type` | `$type, $subscription, $cart_item, $old_price_per_day, $new_price_per_day` |
| Prorate recurring/sign-up fee | `wcs_switch_should_prorate_recurring_price`, `wcs_switch_should_prorate_sign_up_fee` | `$bool, $switch_item` |
| Extra amount | `wcs_switch_proration_extra_to_pay` | `$extra, $subscription, $cart_item, $days_in_old_cycle, $switch_item` in WCS 8.8+ |
| Completion | `woocommerce_subscriptions_switch_completed` | `$order` |
| Item switched | `woocommerce_subscriptions_switched_item` | `$subscription, $new_order_item, $old_subscription_item` |
| Subscription item switched | `woocommerce_subscription_item_switched` | `$order, $subscription, $new_item_id, $old_item_id` |

Use an accepted-args value of `5` when the switch cart item object matters:

```php
add_filter( 'wcs_switch_proration_extra_to_pay', function ( $extra, WC_Subscription $subscription, array $cart_item, int $days_in_old_cycle, $switch_item ) {
    if ( $switch_item instanceof WCS_Switch_Cart_Item && $switch_item->is_switch_during_trial() ) {
        return 0;
    }

    return $extra;
}, 10, 5 );
```

Older callback signatures still receive the first four arguments, but do not infer missing switch context from cart data when the 5th argument is available.

## Gifting storage

Gifting is included in Subscriptions. It lets purchaser and recipient differ.

| Storage | Key | Purpose |
|---|---|---|
| Cart item data | `wcsg_gift_recipients_email` | Recipient email before checkout/subscription creation. |
| Subscription meta | `_recipient_user_email_address` | Recipient email captured at subscription creation before a user is resolved. |
| Subscription meta | `_recipient_user` | Recipient user ID after account lookup/creation. Primary gifted-subscription marker. |
| Parent order item meta | `_wcsg_cart_key` | Links checkout order item to the recurring cart/subscription item. |
| Parent order item meta | `wcsg_recipient` | Value format `wcsg_recipient_id_{user_id}`. |
| Parent order item meta | `wcsg_deleted_recipient_data` | JSON snapshot used after recipient deletion. |
| User meta | `wcsg_update_account` | Recipient account setup/update flag. |
| User meta | `wcsg_recipient_just_reset_password` | Recipient onboarding flag. |

Gifted subscriptions are detected by `WCS_Gifting::is_gifted_subscription()`: true when `_recipient_user` exists or `_recipient_user_email_address` is present.

## Gifting flow

1. Product page/cart/checkout collects recipient email when `WCSG_Product::is_giftable()` is true.
2. Cart item stores `wcsg_gift_recipients_email`; gifting is blocked for renewal and switch cart items.
3. Checkout uses recipient email in recurring cart keys so different recipients produce separate subscriptions.
4. `woocommerce_checkout_subscription_created` writes `_recipient_user_email_address` to the subscription.
5. On parent order processing/completion, recipient management finds or creates the recipient user, writes `_recipient_user`, adds `wcsg_recipient` to the matching parent order item, and updates shipping fields from recipient user meta.
6. Recipients are granted view/pay/suspend/cancel capabilities for gifted subscriptions, but cannot change payment method.
7. `_recipient_user` is not copied to renewal orders.

Product giftability:

- Global enablement comes from WCSG admin settings.
- Product-level override is `_subscription_gifting`: `enabled`, `disabled`, or empty for global.
- Variable subscription parent returns giftable to render UI; each variation decides final `gifting` variation data.
- Product page gifting UI is suppressed during switching (`switch-subscription` query arg).

## Memberships integration for gifts

If WooCommerce Memberships is active and a giftable subscription product grants a plan:

- Membership access is granted to the recipient when order item meta has `wcsg_recipient`.
- Purchaser access is skipped unless the same product was also purchased for the purchaser.
- The created `wc_user_membership` still stores `_subscription_id`.
- Because one order can contain the same product for multiple recipients, link the membership to the recipient's subscription, not just the first subscription in the order.

## Common mistakes

```php
// WRONG: direct date meta write can desync Action Scheduler.
update_post_meta( $subscription_id, '_schedule_next_payment', '2026-06-01 00:00:00' );

// RIGHT:
$subscription = wcs_get_subscription( $subscription_id );
$subscription->update_dates( array( 'next_payment' => '2026-06-01 00:00:00' ), 'gmt' );

// WRONG: treating a switch as a product meta update.
$subscription->remove_item( $old_item_id );
$subscription->add_product( wc_get_product( $new_product_id ) );

// RIGHT: use WCS switch flow or reproduce its order payload deliberately.
$is_switch = wcs_order_contains_switch( $order );

// WRONG: gifted subscription recipient is not the subscription customer.
$recipient_id = $subscription->get_user_id();

// RIGHT:
$recipient_id = WCS_Gifting::get_recipient_user( $subscription );
```

## Cross-references

- Use `wcs-subscription-hooks` for general lifecycle hook selection.
- Use `wcs-renewal-scheduler` for renewal dates, Action Scheduler, and payment retry timing.
- Use `wcs-subscription-downloads` for linked downloadable products, download permission grants/revokes, and the subscription downloads mapping table.
- Use `wcm-data-model-subscriptions-link` for Memberships CPT/meta and the Memberships-to-Subscriptions relation.
