---
name: wcs-subscription-downloads
description: WooCommerce Subscriptions built-in Subscription Downloads reference for linked downloadable products, the woocommerce_subscription_downloads table, file-sharing settings, permission grants/revokes, email/account lists, switch cleanup, optional zero-cost line items, and WCS Gifting ownership. Use for WC_Subscription_Downloads, shared or linked downloads, downloadable subscription access, or subscription download permissions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce-subscriptions
plugin-version-tested: "9.0.0"
woocommerce-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/subscriptions/develop/
source-refs:
  - wp-content/plugins/woocommerce-subscriptions/changelog.txt
  - wp-content/plugins/woocommerce-subscriptions/includes/class-wc-subscriptions-plugin.php
  - wp-content/plugins/woocommerce-subscriptions/includes/downloads/
  - wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-download-handler.php
---

# WooCommerce Subscriptions: subscription downloads

Use this when subscription products grant access to downloadable products that are not ordinary line items, or when debugging missing/duplicate download permissions on subscriptions.

## Misconception this skill corrects

> "Subscription downloads are just downloadable line items on the subscription."

WCS has a dedicated linked-downloadable-products feature. It stores subscription-product to downloadable-product mappings in its own table and can grant permissions without adding the downloadable product as a subscription line item.

## When to use this skill

Trigger when ANY of the following is true:

- The user mentions Subscription Downloads, shared downloadable products, linked downloadable products, downloadable file sharing, or downloads in subscription details.
- Code contains `WC_Subscription_Downloads`, `woocommerce_subscription_downloads`, `_subscription_linked_downloadable_products`, `_subscription_downloads_ids`, or `wc_subscription_linked_downloadable_products_search`.
- You are changing subscription status handling, switching, gifting, or emails and downloadable products are involved.

## Built-in feature status

The old WooCommerce Subscription Downloads plugin functionality is bundled into WooCommerce Subscriptions. WCS initializes it from `WC_Subscriptions_Plugin::init_downloads()` unless the standalone plugin is being activated or has already loaded `WC_Subscription_Downloads`.

If the standalone plugin is still active, WCS shows an admin notice and does not initialize the bundled subsystem. Do not load both implementations.

## Settings

WCS adds a "Downloads" section to WooCommerce > Settings > Subscriptions.

| Setting | Option expression | Meaning |
|---|---|---|
| Enable downloadable file sharing | `WC_Subscriptions_Admin::$option_prefix . '_enable_downloadable_file_linking'` | Enables linking simple/variable downloadable products to subscription products. Default `no`. |
| Show shared downloadable products in subscription details | `WC_Subscriptions_Admin::$option_prefix . '_downloads_add_line_items'` | Adds linked downloads as zero-cost subscription line items. Default `no`; disabling improves performance when many downloads are linked. |

When the feature is disabled, WCS still loads settings in admin, but it does not load the order/product/AJAX subsystems.

## Storage

Linked products are stored in:

```text
{$wpdb->prefix}woocommerce_subscription_downloads
```

Columns:

| Column | Meaning |
|---|---|
| `id` | Auto-increment row ID. |
| `product_id` | Downloadable product or downloadable variation ID. |
| `subscription_id` | Subscription product or subscription variation ID. |

Use WCS helpers instead of writing the table directly:

```php
$subscription_product_ids = WC_Subscription_Downloads::get_subscriptions( $downloadable_product_id );
$downloadable_product_ids = WC_Subscription_Downloads::get_downloadable_products( $subscription_product_id, $subscription_variation_id );
```

Direct table edits skip permission regeneration and product editor logic.

## Product editor flow

The admin product UI works from both directions:

| Product being edited | UI field | Stored relationship |
|---|---|---|
| Downloadable simple product or variation | Linked subscription products | This download is included with selected subscription products. |
| Simple subscription or subscription variation | Linked downloadable products | This subscription includes selected downloadable products. |

The save handlers validate nonces based on `WC_Subscription_Downloads_Products::EDITOR_UPDATE` and update the mapping table. Status changes and file changes revoke/regrant permissions for public downloadable products.

## Permission behavior

`WC_Subscription_Downloads_Order` hooks subscription status changes:

| Subscription status | Behavior |
|---|---|
| `active` | Grants download permissions for linked downloadable products. |
| `expired` | Revokes linked download permissions. |
| `cancelled` | Revokes linked download permissions. |

Permissions are granted through WooCommerce's downloadable permissions system, not through a custom entitlement table. WCS also removes duplicate downloadable items in subscription and customer download lists.

## Line item performance setting

WCS 8.5+ can grant download permissions without adding linked downloadable products as zero-cost line items on the subscription. This is controlled by:

```php
WC_Subscription_Downloads_Settings::add_line_items_enabled()
```

and the filter:

```php
woocommerce_subscriptions_add_downloadable_product_line_item
```

Use the filter only when you deliberately need linked products to appear as line items:

```php
add_filter( 'woocommerce_subscriptions_add_downloadable_product_line_item', function ( bool $add, WC_Product $product, WC_Subscription $subscription ): bool {
    return myplugin_requires_visible_download_line_items( $subscription->get_id() ) ? true : $add;
}, 10, 3 );
```

Do not assume linked downloads appear in `$subscription->get_items()`. Use `WC_Subscription_Downloads::get_subscription_linked_downloads( $subscription, $limit )` when you need the download projection for display.

## Emails and account display

`WC_Subscription_Downloads_Order::email_list_downloads()` adds available downloads after order tables for subscription-containing orders when the order permits downloads. The title is filterable:

```php
woocommerce_subscription_downloads_my_downloads_title
```

For account/subscription display, prefer Woo/WCS downloadable item APIs and `get_subscription_linked_downloads()` over reconstructing download URLs from product file meta.

## Switching and gifting

When a subscription item is switched, WCS revokes permissions tied to the old linked downloadable products, removes old linked downloadable line items where needed, and re-runs permission grants for the active subscription.

Gifted subscriptions add another ownership dimension. `WCSG_Download_Handler` can grant recipient permissions, optionally also granting purchaser permissions when the gifting download setting allows it. For gifted subscriptions, do not use `$subscription->get_user_id()` as the only download-access user. Check the gifting recipient through WCS Gifting helpers.

## Common mistakes

```php
// WRONG: assumes linked downloads are subscription line items.
foreach ( $subscription->get_items() as $item ) {
    $product = $item->get_product();
    if ( $product && $product->is_downloadable() ) {
        my_export_download( $product->get_id() );
    }
}

// RIGHT: read the linked download projection.
$linked = WC_Subscription_Downloads::get_subscription_linked_downloads( $subscription, 50 );
foreach ( $linked['downloads'] as $download ) {
    my_export_download( $download['product_id'], $download['download_id'] );
}

// WRONG: direct insert skips editor/status permission behavior.
$wpdb->insert( $wpdb->prefix . 'woocommerce_subscription_downloads', array(
    'product_id'      => $download_product_id,
    'subscription_id' => $subscription_product_id,
) );

// RIGHT: update through product editor logic or call a service that also regenerates permissions.
```

## Cross-references

- Use `wcs-data-model-switching-gifting` for switch payloads and WCS Gifting recipient storage.
- Use `wcs-subscription-hooks` for subscription status, switch, and gifting hooks.
- Use `wcs-renewal-scheduler` when renewal orders and download permissions interact with payment timing.
