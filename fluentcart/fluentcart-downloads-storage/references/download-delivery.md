# FluentCart 1.6.0 download delivery

## Data layers

| Layer | Purpose |
|---|---|
| ProductDownload | File metadata, driver, path/key, variation mapping, limits |
| Order/Subscription/License | Commercial entitlement |
| Signed FluentCart URL | Short-lived delivery authorization for named context |
| Storage driver | Streams or redirects to the private object |
| OrderDownloadPermission | Intended customer/order/file count and expiry accounting; not wired into the active signed route in 1.6.0 |

## Signed delivery flow

~~~text
qualifying order/customer page
  -> select downloads for product and variation
  -> generateDownloadFileLink(download, order ID)
  -> signed site URL with validity
  -> FileDownloader validates signature and time
  -> reload download and qualifying paid order
  -> evaluate subscription/license/addon filter
  -> driver streams file or issues provider-signed redirect
~~~

Default FluentCart link validity is 60 minutes and is filterable through
fluent_cart/download_link_validity_in_minutes. S3/provider URL expiry has the
separate fluent_cart/download_expiration_minutes filter.

## Source-verified 1.6.0 enforcement boundary

The customer-profile controller requires login, scopes order items to the
current Customer, filters downloadable variation mappings, and then generates
an order-bound link. After generation, the URL is a bearer credential until
its signature expires.

FileDownloader checks the signed timestamp, download identifier, successful
order payment, matching product post_id, subscription validity, and the
can_be_downloaded filter. It does not re-check WP-user ownership, bind the file
to a concrete purchased variation, apply ProductDownload limit/expiry settings,
or update OrderDownloadPermission.

CustomerHelper::checkDownloadPermissionAndStoreLog() contains those additional
checks, and DownloadService registers it on
fluent_cart/before_download_check_permission_and_store_log. No active emitter
for that action was found in the tested tree. An addon requiring those promises
must add atomic enforcement and retest the core route after upgrades.

## Driver contract

BaseStorageDriver manages:

- metadata and settings routes;
- settings sanitization and hidden keys;
- active status;
- optional buckets;
- connection verification;
- driver discovery via fluent_cart/storage/get_global_storage_drivers.

The driver class returned by getDriverClass() performs actual file operations.
Never expose the driver instance or hidden credentials to public clients.

## Security checks

1. normalize and confine local paths;
2. reject directory traversal and null bytes;
3. use private object ACLs;
4. bind signed URLs to the minimum object/context;
5. validate response filenames;
6. avoid open redirects;
7. do not reveal whether a foreign object exists;
8. log only identifiers and redacted provider error codes.
