---
name: fluentcart-downloads-storage
description: >-
  Implements and audits FluentCart downloadable products, entitlement checks,
  signed delivery URLs, download limits/expiry logs, Local/S3 storage, custom
  storage drivers, and Pro R2 behavior. Use when working with ProductDownload,
  OrderDownloadPermission, generateDownloadFileLink(), FileDownloader,
  fluent_cart/product_download/can_be_downloaded,
  fluent_cart/register_storage_drivers, customer download pages, subscription-
  gated files, private object storage, or preventing raw file-path disclosure.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart downloads and storage

Separate file metadata, commercial entitlement, signed delivery, and download
accounting. Possession of a path, download ID, or signed URL must not create a
new entitlement.

Read [download-delivery.md](references/download-delivery.md) before generating
links, changing access rules, or implementing a driver.

## Preserve the delivery chain

Use ProductDownload records to map product/variation availability to driver
metadata. Use Order::getDownloads() or the customer-profile flow to obtain
entitled files. Generate delivery links with
Helper::generateDownloadFileLink($download, $orderId).

For customer delivery always include the qualifying order ID. The helper signs
download_identifier, valid_till, and order_id. FileDownloader then validates
signature/time, successful payment, a matching product post on one supplied
order, subscription access validity, and the final can_be_downloaded filter
before dispatching to the storage driver.

Do not:

- expose Local file paths, S3/R2 keys, bucket names, or raw file_url values;
- build signed query strings manually;
- use the admin preview's order-less link as a customer entitlement link;
- cache signed URLs beyond their validity;
- assume a successful order grants every variation's files.

## Do not assume the active route enforces limits or login

The customer-profile listing is login/customer scoped before it generates the
URL. The resulting 1.6.0 signed URL is bearer authorization: FileDownloader
does not re-check the current WP user and does not enforce the configured
download_limit/download_expiry or update fct_order_download_permissions.

CustomerHelper contains limit/expiry/accounting code and DownloadService
registers a fluent_cart/before_download_check_permission_and_store_log
listener, but the active FileDownloader path does not emit that action in the
tested source. Treat OrderDownloadPermission accounting as unwired for this
route until a runtime test proves otherwise.

If the addon promises download limits, a customer-bound link, or single-use
delivery, implement an addon-owned atomic claim before issuing/streaming the
file and then delegate to the storage layer. Protect concurrent clicks and do
not increment a count merely for rendering a link. Re-audit core after upgrade
so enforcement is not accidentally duplicated.

Use fluent_cart/product_download/can_be_downloaded only to further constrain or
explicitly extend a verified order context. Inspect orders and download from the
payload; never return true for an unbound public identifier.

## Extend storage drivers

Extend BaseStorageDriver, provide a settings class/fields, hiddenSettingKeys,
driver implementation, connection verification, signed URL/download behavior,
and bucket support if required. Attach the registration listener by
fluentcart_loaded and call the driver instance's init() during
fluent_cart/register_storage_drivers. The action runs on init priority 9, before
fluent_cart/init, so registering its listener from fluent_cart/init is too late.

- Keep credentials in hidden settings and exclude them from REST/UI responses.
- Sanitize settings and verify connectivity without leaking provider errors.
- Enforce least-privilege bucket policy and private objects.
- Set a short provider URL expiry and validate filenames/content disposition.
- Prevent path traversal and cross-bucket/object access.
- Make upload/delete idempotent and distinguish missing from unauthorized.

Free 1.6.0 ships Local and S3. Cloudflare R2 is a Pro driver; Free only exposes a
promo descriptor.

## Subscription and license gates

Subscription downloads depend on Subscription::hasAccessValidity(), not merely
the existence of a subscription row. Pro licensing also filters downloads when
license validity applies. Compose restrictions; do not replace another module's
false decision with true unless the addon deliberately owns that entitlement.

## Test matrix

Test paid/unpaid/refunded order, signed-link reuse without login, wrong product/
variation, expired signature, tampered query, the source-confirmed absence or
presence of core limit/expiry accounting, addon limit concurrency, active/
expired subscription, valid/expired Pro license, missing object, disabled/
misconfigured driver, filename injection, and cached URL after expiry.

## Cross-references

- Use fluentcart-products-inventory for file-to-variation assignment.
- Use fluentcart-subscriptions-renewals for access validity.
- Use fluentcart-licensing-pro for licensed software delivery.

## References

- Verified Free source paths:
  - fluent-cart/app/Models/ProductDownload.php
  - fluent-cart/app/Models/OrderDownloadPermission.php
  - fluent-cart/app/Models/Order.php
  - fluent-cart/app/Http/Controllers/WebController/FileDownloader.php
  - fluent-cart/app/Services/FileSystem/DownloadService.php
  - fluent-cart/app/Helpers/Helper.php
  - fluent-cart/app/Helpers/CustomerHelper.php
  - fluent-cart/app/Hooks/Handlers/GlobalStorageHandler.php
  - fluent-cart/app/Modules/StorageDrivers/
- Verified Pro source path:
  - fluent-cart-pro/app/Modules/StorageDrivers/R2/
