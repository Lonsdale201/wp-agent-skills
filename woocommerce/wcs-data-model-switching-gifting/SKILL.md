---
name: wcs-data-model-switching-gifting
description: WooCommerce Subscriptions data model, switching, and gifting reference for order/product types, schedule and relation storage, switch cart/order payloads, proration hooks, recipient data, and WCS 9.0 APFS plan markers. Use for shop_subscription, _schedule_next_payment, _subscription_switch_data, subscription_switch, _switched_subscription_item_id, wcsg_gift_recipients_email, _recipient_user, _wcsatt_schemes, or _wcsatt_scheme.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.0"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
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

## APFS / Subscription Plans storage in WCS 9.0+

All Products for Subscriptions is bundled into WooCommerce Subscriptions 9.0 as Subscription Plans. It can make ordinary product types behave as subscriptions through runtime meta and `woocommerce_is_subscription`.

| Storage | Key | Purpose |
|---|---|---|
| Option | `wcsatt_subscribe_to_cart_schemes` | Storewide plan definitions. |
| Product meta | `_wcsatt_schemes_status` | Product purchase mode: `disable`, `override`, or `inherit`. |
| Product meta | `_wcsatt_schemes` | Product-specific custom plans in override mode. |
| Product meta | `_wcsatt_storewide_selection_mode` | `all` or `specific` storewide plan selection. |
| Product meta | `_wcsatt_selected_storewide_plans` | Storewide plan IDs allowed for a specific product. |
| Product meta | `_wcsatt_force_subscription` | `yes` means disable one-time purchase when plans are active. |
| Product meta | `_wcsatt_disabled` | Legacy one-time-only flag maintained for compatibility. |
| Cart item data | `wcsatt_data.active_subscription_scheme` | Selected plan key, `false` for one-time, `null` for undefined/default. |
| Order item meta | `_wcsatt_scheme` | Selected plan key persisted on order/subscription line items. |
| Order item meta | `_wcsatt_scheme_id` | Legacy APFS plan key. |

Use `WCS_ATT_Product::get_subscription_scheme_mode()`, `WCS_ATT_Product::set_subscription_scheme_mode()`, `WCS_ATT_Product_Schemes::get_subscription_schemes()`, `WCS_ATT_Cart::get_subscription_scheme()`, and `WCS_ATT_Order::get_subscription_scheme()`. Do not infer APFS plans from the native `_subscription_*` product meta table above; APFS sets WCS-compatible values as runtime meta when a scheme is active.

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

## Switch payload and extension reference

Cart items use `subscription_switch`; switch orders persist `_subscription_switch_data`; staged/archive items use custom `*_pending_switch`, `*_switched`, and `line_item_removed` types. These payloads include item IDs, proration results, schedule changes, coupons, fees, and shipping lines and are not a stable shortcut for direct mutation.

Use [switching-reference.md](switching-reference.md) for exact payload shapes, item meta, and hook signatures. In WCS 8.8+, `wcs_switch_proration_extra_to_pay` has a fifth `$switch_item` argument; register accepted args `5` when that context matters.

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
- In WCS 9.0 APFS, the Subscription Plans product panel can also write the product-level gifting override while saving ordinary products sold via plans.
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
- Use `wcs-subscription-plans-apfs` for the full WCS 9.0 Subscription Plans / APFS plan API, REST endpoints, and headless cart behavior.
- Use `wcs-renewal-scheduler` for renewal dates, Action Scheduler, and payment retry timing.
- Use `wcs-subscription-downloads` for linked downloadable products, download permission grants/revokes, and the subscription downloads mapping table.
- Use `wcm-data-model-subscriptions-link` for Memberships CPT/meta and the Memberships-to-Subscriptions relation.

## References

- Official documentation: <https://woocommerce.com/document/subscriptions/develop/>
- Verified source paths:
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-core-plugin.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/data-stores/class-wcs-subscription-data-store-cpt.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/data-stores/class-wcs-orders-table-subscription-data-store.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscriptions-product.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-functions.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/core/wcs-switch-functions.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wc-subscriptions-switcher.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/switching/class-wcs-switch-totals-calculator.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/downloads/`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-product.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/product/class-wcs-att-product-schemes.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-cart.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/apfs/class-wcs-att-order.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcs-gifting.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-product.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-cart.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-checkout.php`
  - `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-recipient-management.php`
