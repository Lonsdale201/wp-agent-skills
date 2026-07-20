---
name: wcs-subscription-downloads
description: Implement, extend, or audit WooCommerce Subscriptions download access. Distinguishes ordinary downloadable subscription line items from the bundled linked Subscription Downloads feature; covers WCS_Download_Handler, shop_subscription-owned permissions, renewal de-duplication, new-file drip behavior, subscription status access gates, the woocommerce_subscription_downloads catalog mapping, active/cancel/expire grants and revokes, counter resets, optional zero-cost line items, projections, switching, emails, and WCS Gifting. Use for missing or duplicate subscription downloads, WC_Subscription_Downloads, linked/shared files, drip downloadable content, subscription renewal access, or downloadable permissions tied to a subscription.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.0.1"
  wp-skills-woocommerce-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce Subscriptions downloads

Start by identifying which of WCS's two download models is in use. Both ultimately use WooCommerce's core customer-download permission table and delivery handler, but their product relationships and refresh behavior differ.

## Choose the correct model

| Model | Product setup | Relationship source | Permission owner |
|---|---|---|---|
| Ordinary downloadable subscription | The subscription product/variation itself is downloadable and has files | Actual subscription line item | `shop_subscription` object |
| Linked Subscription Downloads | A separate simple/variable downloadable product is linked to a subscription product | `woocommerce_subscription_downloads` mapping table | `shop_subscription` object |

Do not collapse these models. A normal downloadable subscription product does not need the linked-download feature. A linked product may grant permissions without appearing in `$subscription->get_items()`.

Use `wc-downloadable-products` first when the question concerns core file objects, stable IDs, storage security, bearer URLs, download methods, limits, expiry, or the permission table itself.

## Ordinary downloadable subscription items

`WCS_Download_Handler` runs after Woo grants files on a parent, renewal, or switch order. For each downloadable subscription item, it:

1. finds the related `WC_Subscription` objects;
2. grants every current product file on the subscription if that exact subscription/product/download row is absent;
3. removes the same product's temporary permissions from the originating order;
4. marks the subscription's download permissions as granted.

The durable grant therefore uses the subscription ID and subscription order key. A paid renewal should not create a fresh duplicate row when that file permission already exists.

Do not assume that a permission row means current access. `WC_Subscription::is_download_permitted()` normally returns true only for `active` and `pending-cancel`; account projection and the core download handler call this gate.

| Subscription status | Row may remain? | Customer access? |
|---|---:|---:|
| `active` | Yes | Yes |
| `pending-cancel` | Yes | Yes, until the subscription ends |
| `on-hold` | Yes | No |
| `pending` | Yes | No |
| `expired` | Model-dependent cleanup | No |
| `cancelled` | Model-dependent cleanup | No |

Email rendering has temporary exceptions because WCS may generate an email before the subscription reaches its final active state. Never copy that display-only exception into a custom API authorization decision.

Permanent subscription deletion removes its ordinary permission rows. Switching or removing a subscription product revokes permissions for the replaced product. In WCS 9.0.1 these revocation paths use direct permission-table deletes; see the orphan-log caveat below.

## New files and drip behavior

When a new stable download ID is added to an ordinary downloadable subscription product, WCS finds subscriptions for that product and grants the missing file permission. Existing IDs are not re-granted.

The option:

```text
woocommerce_subscriptions_drip_downloadable_content_on_renewal
```

defaults to `no`.

- `no`: existing subscriptions receive a newly added file immediately.
- `yes`: WCS blocks the immediate grant through `woocommerce_process_product_file_download_paths_grant_access_to_new_file`; the next processed renewal supplies access.

The filter is also used for related orders, so custom callbacks must inspect the supplied `WC_Order`/`WC_Subscription` rather than assuming one object type. Drip applies to newly added file IDs, not a general per-file release-date scheduler.

## Linked Subscription Downloads feature

The former standalone WooCommerce Subscription Downloads plugin is bundled into WCS. `WC_Subscriptions_Plugin::init_downloads()` loads the bundled feature unless the standalone implementation is being activated or has already defined `WC_Subscription_Downloads`. Do not run both.

Settings under WooCommerce > Settings > Subscriptions:

| Option | Default | Meaning |
|---|---|---|
| `woocommerce_subscriptions_enable_downloadable_file_linking` | `no` | Loads linked-product order/product/AJAX behavior. |
| `woocommerce_subscriptions_downloads_add_line_items` | `no` | Shows linked products as zero-cost subscription line items. Disable for less work on large link sets. |

Admin settings still load while linking is disabled, but runtime linked-download subsystems do not.

## Linked mapping is catalog data

`{$wpdb->prefix}woocommerce_subscription_downloads` has:

| Column | Meaning |
|---|---|
| `id` | Auto-increment primary key. |
| `product_id` | Linked downloadable product or variation catalog ID. |
| `subscription_id` | Subscription product or variation catalog ID, not a customer's subscription instance. |

There is no unique product/subscription pair constraint and no foreign key. Avoid direct writes: duplicates are possible, and SQL changes skip permission recalculation.

Read relationships with:

```php
$subscription_product_ids = WC_Subscription_Downloads::get_subscriptions( $downloadable_product_id );

$downloadable_product_ids = WC_Subscription_Downloads::get_downloadable_products(
	$subscription_product_id,
	$subscription_variation_id
);
```

The admin product editor supports both directions. Use its validated save path, or build an explicit service that deduplicates mappings and performs the same revoke/regrant behavior. These WCS classes are bundled implementation APIs, so guard availability and regression-test upgrades.

## Linked permission lifecycle

`WC_Subscription_Downloads_Order` listens to subscription status changes:

| New status | Linked behavior |
|---|---|
| `active` | Revokes existing linked-product rows, grants every current enabled file again, optionally adds a zero-cost line item. |
| `expired` | Revokes linked-product rows. |
| `cancelled` | Revokes linked-product rows. |
| other status | Does not mutate linked rows; the subscription access gate still denies non-permitted statuses. |

Two consequences matter:

- Reactivating a subscription resets linked-file counts and expiry because permissions are deleted and recreated.
- Saving/updating a linked downloadable product causes the product handler to revoke related permissions and regrant them when the product status is public. This can also reset counts/expiry even if the file list did not materially change.

There is also a confirmed cleanup defect in WCS 9.0.1: `WCS_Download_Handler::revoke_downloadable_file_permission()`, permanent subscription cleanup, and linked-product revoke handlers delete permission rows with direct SQL. `wc_download_log` has no foreign key cascade, so tracked permissions can leave orphan log rows after revocation/regrant. A local smoke run reproduced this during linked active refresh.

Do not copy this deletion pattern. Extension code should resolve the affected permission IDs and delete them through the Woo customer-download data store, which removes their logs, or perform an explicitly transactional logs-first cleanup. Audit existing data read-only with:

```sql
SELECT COUNT(*)
FROM wp_wc_download_log AS logs
LEFT JOIN wp_woocommerce_downloadable_product_permissions AS permissions
	ON permissions.permission_id = logs.permission_id
WHERE permissions.permission_id IS NULL;
```

Use the actual table prefix. Do not automatically delete historical rows without a retention decision and backup.

Do not use linked permission rows as an immutable audit ledger. If counters must survive reactivation or product updates, add a separate durable business ledger and a tested restore policy rather than patching the core table ad hoc.

## Line items and display projection

Permissions are granted whether or not linked products become line items. The default is no line items. The decision is available through:

```php
WC_Subscription_Downloads_Settings::add_line_items_enabled();
```

and:

```php
add_filter(
	'woocommerce_subscriptions_add_downloadable_product_line_item',
	function ( bool $add, WC_Product $product, WC_Subscription $subscription ): bool {
		return myplugin_needs_visible_linked_items( $subscription->get_id() ) ? true : $add;
	},
	10,
	3
);
```

For account/headless display, query the projection instead of line items:

```php
$linked = WC_Subscription_Downloads::get_subscription_linked_downloads( $subscription, 50 );

foreach ( $linked['downloads'] as $download ) {
	my_render_download( $download );
}

$total_linked_products = $linked['total_products']; // Count before the limit.
```

The projection returns nothing when the subscription does not permit downloads, deduplicates catalog IDs, batch-loads published products, and then resolves actual permission-backed files. The limit counts linked products, not individual files.

Never generate a link from the mapping table or product file URL alone. The actual Woo permission row and subscription access gate remain authoritative.

## Switching, email, and gifting

- A switch removes old linked line items where present, revokes old linked permissions, and re-runs the active grant for the new item.
- `WC_Subscription_Downloads::get_order_downloads()` and the linked projection produce Woo-compatible permission URLs for emails/account views.
- `woocommerce_subscription_downloads_my_downloads_title` changes the linked downloads heading, not authorization.
- WCS Gifting alters `woocommerce_downloadable_file_permission_data` so the recipient can own the permission and, depending on settings, the purchaser may also receive one. Do not equate entitlement owner with `$subscription->get_user_id()`.

## Common failure patterns

```php
// WRONG: linked products need not be line items.
foreach ( $subscription->get_items() as $item ) {
	if ( $item->get_product() && $item->get_product()->is_downloadable() ) {
		export_file_url( $item->get_product() );
	}
}

// WRONG: the mapping table's subscription_id is not a WC_Subscription instance ID.
$customer_subscription = wcs_get_subscription( $mapping_row->subscription_id );

// WRONG: a stored permission does not bypass the status gate.
$allowed = ! empty( $permission_row );

// RIGHT: use the order/subscription access gate and a permission-backed projection.
$allowed   = $subscription->is_download_permitted();
$downloads = $allowed
	? WC_Subscription_Downloads::get_subscription_linked_downloads( $subscription, 50 )
	: array( 'downloads' => array(), 'total_products' => 0 );
```

## Regression matrix

Test both models separately:

1. Initial paid order and first permission ownership.
2. Successful renewal without duplicate ordinary permissions.
3. New file with drip off, then with drip on through the next processed renewal.
4. `active`, `pending-cancel`, `on-hold`, reactivation, `expired`, and `cancelled` transitions.
5. Linked-product save/status/file change and expected counter-reset policy.
6. Switch from parent/variation A to B.
7. Zero-cost line items both disabled and enabled.
8. Gift recipient, purchaser setting, and wrong-user access.
9. Stable file-ID replacement/removal, limit, expiry, and direct-storage URL security from `wc-downloadable-products`.
10. Revocation/regrant and permanent deletion with a `wc_download_log` orphan check.
11. High link counts with a finite projection limit.

## Cross-references

- Use `wc-downloadable-products` for the core file, entitlement, delivery, security, and REST contract.
- Use `wcs-data-model-switching-gifting` for switch payloads and gifting ownership data.
- Use `wcs-subscription-hooks` for status, renewal, switch, and gifting hooks.
- Use `wcs-renewal-scheduler` for renewal payment timing and failure recovery.

## Verified sources

- `wp-content/plugins/woocommerce-subscriptions/changelog.txt`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wcs-download-handler.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/class-wcs-drip-downloads-manager.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/core/class-wc-subscription.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/downloads/class-wc-subscription-downloads.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/downloads/class-wc-subscription-downloads-order.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/downloads/class-wc-subscription-downloads-products.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/downloads/class-wc-subscription-downloads-settings.php`
- `wp-content/plugins/woocommerce-subscriptions/includes/gifting/class-wcsg-download-handler.php`
