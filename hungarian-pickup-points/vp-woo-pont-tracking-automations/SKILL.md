---
name: vp-woo-pont-tracking-automations
description: Integrate with PRO shipment tracking and automations in Csomagpontok és Címkék WooCommerce-hez. Covers Action Scheduler hook/group, parcel event storage, tracking links and customer-token privacy, tracking update/status/email hooks, provider-specific event codes, HPOS-safe reads, retry and cancellation behavior, custom tracking pages, and the built-in PRO Számlázz.hu mark-as-paid bridge. Use when syncing carrier events, changing order status, sending companion notifications, exposing tracking data, or connecting delivery events to another WooCommerce integration.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "hungarian-pickup-points-for-woocommerce"
  wp-skills-plugin-version-tested: "4.2.8"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-27"
---

# Tracking and automation integration

Shipment tracking, carrier-status synchronization, customer tracking pages, tracking emails, and status automations are **PRO** features. Feature-detect the runtime and settings; do not assume that the presence of the free plugin means tracking is enabled.

## Tracking state

| Order meta | Meaning |
|---|---|
| `_vp_woo_pont_parcel_number` | Tracking/parcel number created with the label. |
| `_vp_woo_pont_parcel_info` | Provider-normalized event array, newest-first in the built-in UI. |
| `_vp_woo_pont_parcel_info_time` | Last successful synchronization timestamp. |
| `_vp_woo_pont_tracking_link` | Random token for the plugin's customer tracking URL. Treat it as a secret. |
| `_vp_woo_pont_tracking_emails_sent` | Names of tracking emails already sent. |

Read them through `WC_Order::get_meta()`. A normalized event generally contains `event`, `date`, and optional `label`, but `event` values remain provider-specific. Do not compare raw GLS, Packeta, MPL, or Foxpost codes across carriers.

Use the public helpers for links:

```php
$order = wc_get_order( $order_id );
if ( $order instanceof WC_Order ) {
	$carrier_link = VP_Woo_Pont()->tracking->get_tracking_link( $order );
	$private_page = VP_Woo_Pont()->tracking->get_internal_tracking_link( $order );
}
```

The internal URL contains order ID plus `_vp_woo_pont_tracking_link`. Do not log, index, cache-share, or expose that token to unrelated users.

## Scheduler lifecycle

After `vp_woo_pont_label_created`, supported non-custom carriers schedule a recurring Action Scheduler job:

| Contract | Value |
|---|---|
| Hook | `vp_woo_pont_update_tracking_info` |
| Argument | `order_id` |
| Group | `vp_woo_pont` |
| Default interval | Two hours |

`vp_woo_pont_tracking_sync_interval( $seconds, $order, $provider )` changes the interval. Keep it large enough for carrier limits.

The updater cancels future work when the order is missing, the parcel number is absent, the sync deadline expires, or the latest normalized state is delivered. The default deadline is two weeks and can be changed through `vp_woo_pont_tracking_info_sync_deadline`.

Do not schedule a second independent polling loop for the same parcel. Attach to the update action or the saved-event hook.

## Consume successful updates

```php
add_action(
	'vp_woo_pont_tracking_info_updated',
	static function ( array $events, WC_Order $order, string $provider ): void {
		my_plugin_sync_delivery_events( $order->get_id(), $provider, $events );
	},
	10,
	3
);
```

This action fires after `_vp_woo_pont_parcel_info` and its timestamp are saved. Make the receiver idempotent using provider + parcel number + event code + event timestamp. A manual refresh and a scheduled refresh can observe the same data.

`VP_Woo_Pont_Tracking::find_new_events()` compares `date` and `event`; companion code should not assume labels are unique identifiers.

## Status and email automation

The plugin maps raw events to semantic states such as `shipped`, `delivery`, and `delivered` using each provider class. Extend behavior through hooks instead of calling the private mapper:

| Hook | Arguments | Use |
|---|---:|---|
| `vp_woo_pont_tracking_status_codes` | 1 | Add or adjust raw status labels by provider. |
| `vp_woo_pont_tracking_automation_refunded_statuses` | 1 | Protect additional terminal states from a later `completed` transition. |
| `vp_woo_pont_tracking_automation_target_status` | 6 | Change or suppress the target status for one matched event. |
| `vp_woo_pont_tracking_automation_after_status_change` | 4 | Run a follow-up after the plugin applies or intentionally suppresses the status. |
| `vp_woo_pont_trigger_tracking_email_automation_enabled` | 4 | Enable/disable email automation for the batch of new events. |
| `vp_woo_pont_trigger_tracking_email_shipped` | 2 | Gate the shipped email. |
| `vp_woo_pont_trigger_tracking_email_delivery` | 2 | Gate the home-delivery email. |
| `vp_woo_pont_trigger_tracking_email_pickup` | 2 | Gate the pickup-ready email. |

The dynamic email gates receive `( $enabled, $order )`. The global automation gate receives `( $enabled, $order, $provider, $new_events )`.

Returning `false` from `vp_woo_pont_tracking_automation_target_status` suppresses the order-status change; the after-status-change action still runs. Consumers must therefore inspect the automation and current order status instead of assuming a transition occurred.

## Customer tracking pages

The custom tracking page can render public shipment progress while hiding customer details. Full order/customer details are shown only when the current user owns the order or the request token matches `_vp_woo_pont_tracking_link`.

`vp_woo_pont_tracking_page_variables( $args, $order )` can add presentation data. Preserve the `logged_in` privacy flag and never set it true based only on an order ID.

The plugin adds `noindex`/`nofollow` to its configured tracking page. A companion SEO integration should preserve that behavior and avoid putting tokenized links in sitemaps or canonical URLs.

## Számlázz.hu bridge

When both plugins are active and Csomagpontok PRO is enabled, the bundled compatibility module provides:

- Számlázz.hu note conditions and placeholders for provider, point name, and tracking number.
- A tracking automation pseudo-status, `wc-szamlazz-mark-as-paid`.
- Interception of that pseudo-status so no WooCommerce order status is written.
- A follow-up call to `WC_Szamlazz()->generate_invoice_complete( $order_id )` after the matching tracking event.

This is a financial side effect. Do not add `wc-szamlazz-mark-as-paid` programmatically unless the merchant explicitly configured the carrier event that proves payment. Keep the invoice integration's own idempotency and document state checks in place.

## Critical rules

- Treat tracking tokens, customer addresses, phone numbers, event payloads, and carrier identifiers as protected order data.
- Never poll a provider from an anonymous REST/AJAX request.
- Use Action Scheduler and the existing group instead of WP-Cron loops.
- Do not translate raw provider event codes into universal meanings without the provider mapping.
- Keep event consumers idempotent and tolerant of reordered or repeated events.
- Do not mark invoices paid solely because a parcel exists; require the configured delivery/payment event.

## Smoke checklist

- With an authorized sandbox shipment, confirm label creation schedules one recurring action in group `vp_woo_pont`.
- Replay an identical tracking payload and confirm companion effects do not duplicate.
- Test shipped, pickup/home-delivery, delivered, cancelled, and refunded-order paths.
- Verify logged-out tracking pages do not reveal customer details without the token.
- Confirm the sync action is cancelled after the deadline or delivered state.
- If Számlázz.hu is connected, test the mark-as-paid pseudo-status on a non-production invoice flow.

## Cross-references

- Use `wc-action-scheduler-jobs` for queue inspection and retry design.
- Use `wc-hpos-compatibility` for order/event metadata.
- Use `szamlazzhu-document-xml-compatibility` for invoice generation and paid-state behavior.

## References

- Official plugin page: <https://wordpress.org/plugins/hungarian-pickup-points-for-woocommerce/>
- Action Scheduler API: <https://actionscheduler.org/api/>
- WooCommerce HPOS documentation: <https://woocommerce.com/document/high-performance-order-storage/>
- Verified source paths:
  - `includes/class-tracking.php`
  - `includes/class-labels.php`
  - `includes/class-helpers.php`
  - `includes/class-pro.php`
  - `includes/compatibility/class-compatibility.php`
  - `includes/compatibility/modules/class-vp-woo-pont-szamlazz.php`
