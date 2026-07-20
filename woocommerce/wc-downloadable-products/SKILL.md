---
name: wc-downloadable-products
description: Implement, extend, or audit WooCommerce downloadable products and customer download access. Covers WC_Product_Download, stable download IDs, product CRUD, approved directories, the customer-download permission table and WC_Customer_Download CRUD, order-based grants and safe regeneration, limits and expiry, My Account and REST reads, bearer download URLs, download methods, logging, partial requests, and protected file storage. Use for _downloadable_files, wc_downloadable_product_permissions(), wc_downloadable_file_permission(), WC_Download_Handler, missing/duplicate/expired downloads, private digital files, or code that grants and revokes WooCommerce downloads.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.9.4"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-20"
---

# WooCommerce downloadable products

Use WooCommerce's product and customer-download objects. A downloadable product definition is not itself customer access, and a permission row is not sufficient unless the related order currently permits downloads.

## Start with the three-layer model

| Layer | Canonical representation | Answers |
|---|---|---|
| Product file | `WC_Product_Download` in `$product->get_downloads()` | What file can this product deliver? |
| Entitlement | `WC_Customer_Download` | Who may download which stable file ID, through which order, until when/how often? |
| Delivery | `WC_Download_Handler` | Does this request pass every check, how is the file served, and is the attempt counted? |

Never infer access from `_downloadable_files`, product ownership, or a permission row alone. Resolve the actual order and use its `is_download_permitted()` gate.

## Choose the task path

- Creating or changing product files: use product CRUD and preserve existing download IDs.
- Granting after purchase: let Woo's processing/completed lifecycle call `wc_downloadable_product_permissions()`.
- Adding one deliberate entitlement: call `wc_downloadable_file_permission()` with a real product and order.
- Regenerating an order: delete that order's existing permissions with the customer-download data store, then force the canonical grant.
- Displaying customer downloads: use `wc_get_customer_available_downloads()` or order downloadable-item APIs.
- Debugging security, storage, limits, REST, tracking, or duplicate rows: load [references/core-download-contract.md](references/core-download-contract.md).

## Create or update a downloadable product

```php
$product = new WC_Product_Simple();
$product->set_name( 'Field guide' );
$product->set_regular_price( '29.00' );
$product->set_virtual( true );
$product->set_downloadable( true );
$product->set_download_limit( 3 ); // -1 means unlimited.
$product->set_download_expiry( 30 ); // Days; -1 means no expiry.

$file = new WC_Product_Download();
$file->set_id( wp_generate_uuid4() );
$file->set_name( 'PDF guide' );
$file->set_file( $protected_download_url );

$product->set_downloads( array( $file ) );
$product->save();
```

`set_downloads()` validates new or changed paths. Local files must exist, use an allowed type, and pass Approved Download Directory checks when that feature is enabled. Remote absolute URLs are accepted without a remote existence request; shortcode providers must enforce their own validation.

For an existing file, reuse its ID:

```php
$downloads = $product->get_downloads();
$file      = $downloads[ $download_id ];
$file->set_name( 'Updated label' );
$file->set_file( $new_path );
$product->set_downloads( $downloads );
$product->save();
```

Since WooCommerce 3.3, generated download IDs are UUIDs, not file hashes. Replacing an ID strands old permission rows; preserving it intentionally moves existing entitlements to the new file. Treat that as an access migration decision, not a cosmetic edit.

## Grant access through the order lifecycle

Woo hooks `wc_downloadable_product_permissions()` to processing and completed statuses. It skips an already-granted order unless forced, respects the "grant after payment" setting for processing orders, and creates one permission per line-item file.

```php
// One explicit file permission. Product limits are multiplied by quantity.
$permission_id = wc_downloadable_file_permission(
	$download_id,
	$product,
	$order,
	$item->get_quantity(),
	$item
);
```

Do not call this repeatedly as an idempotent operation: the table has no unique constraint. Likewise, `$force = true` does not remove old rows.

Safe full regeneration:

```php
$store = WC_Data_Store::load( 'customer-download' );
$store->delete_by_order_id( $order->get_id() ); // Also removes related download logs.
$order->get_data_store()->set_download_permissions_granted( $order, false );
wc_downloadable_product_permissions( $order->get_id(), true );
```

Regeneration resets counters and expiry. Require an authorized admin action, log it, and never perform it on ordinary page loads.

## Read access at the correct level

```php
$available = wc_get_customer_available_downloads( $customer_id );
```

This is preferable to querying the table: it excludes exhausted/expired permissions, verifies the order's current download state, confirms that the product and stable file ID still exist, and rejects disabled files.

For diagnostics, `wc_get_customer_download_permissions()` returns permission objects filtered by the data store, but it is not the final display/access decision. Do not reconstruct download URLs from product meta.

## Secure the delivery boundary

Woo download links contain the order key, customer email (or hash), product ID, and download ID. They are bearer-like secrets, not WordPress nonces. Do not put them in public caches, analytics URLs, support screenshots, or logs.

- Prefer the Woo protected uploads directory or private object storage with controlled delivery.
- A Media Library/public object URL can bypass Woo's handler, limits, expiry, login requirement, and logs.
- Approved directories are a path allowlist, not web-server access control.
- Prefer `force` for local protected files, or correctly configured `xsendfile`/`X-Accel-Redirect` for scale.
- `redirect` exposes the source URL; use it only when the target is independently protected or intentionally public.
- The login-required setting only adds an ownership check when the permission has a nonzero user ID. Guest-order links remain bearer links.
- Never replace `woocommerce_download_product_filepath` from untrusted request input.

## Preserve lifecycle invariants

- Product variation permissions use the variation ID.
- `downloads_remaining = ''` means unlimited; do not coerce it to zero.
- Expiry is calculated from completion date when available, otherwise from grant time.
- Order deletion through Woo CRUD cleans permissions and logs; direct SQL can orphan data.
- Fully refunded line items are excluded from order downloadable items.
- Creating a customer account can reassign and regenerate guest-order permissions.
- Range requests may be counted later through Action Scheduler to avoid charging one segmented download multiple times.

## Audit checklist

1. Confirm file URLs cannot bypass Woo authorization.
2. Confirm download IDs remain stable unless revocation/migration is intended.
3. Confirm grants are idempotent and not duplicated by retries or forced calls.
4. Confirm the related order still controls access.
5. Test exhausted, expired, guest, logged-in wrong-user, refunded, removed-file, and disabled-file cases.
6. Test actual server delivery for `force`, `xsendfile`, or redirect; PHP-only tests cannot validate web-server protection.
7. Treat download URLs, order keys, customer email, and logs as sensitive data.

## Cross-references

- Use `wcs-subscription-downloads` when a `shop_subscription`, renewal, drip setting, linked downloadable product, switching, or WCS Gifting is involved.
- Use `wc-order-lifecycle-and-items` for order status, payment, refund, and item behavior.
- Use `wc-rest-api-v4` for the authenticated administrative Woo REST boundary.
- Use `wc-action-scheduler-jobs` for partial-download tracking or background reconciliation.

## Verified sources

- `wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-product.php`
- `wp-content/plugins/woocommerce/includes/class-wc-product-download.php`
- `wp-content/plugins/woocommerce/includes/class-wc-customer-download.php`
- `wp-content/plugins/woocommerce/includes/class-wc-download-handler.php`
- `wp-content/plugins/woocommerce/includes/wc-order-functions.php`
- `wp-content/plugins/woocommerce/includes/wc-user-functions.php`
- `wp-content/plugins/woocommerce/includes/data-stores/class-wc-customer-download-data-store.php`
- `wp-content/plugins/woocommerce/src/Internal/ProductDownloads/`
- `wp-content/plugins/woocommerce/src/Internal/RestApi/Routes/V4/Orders/ActionController.php`
