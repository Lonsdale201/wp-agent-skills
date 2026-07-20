# WooCommerce core download contract

Version scope: WooCommerce 10.9.4, PHP 7.4+. Use this reference when auditing persistence, request authorization, delivery, REST exposure, or lifecycle maintenance.

## Product definition and storage

`WC_Product_Download` carries `id`, `name`, `file`, `enabled`, plus forward-compatible extra data. `WC_Product::set_downloads()` converts arrays to objects, generates a UUID when an array has no `download_id`, validates the files, and indexes the result by download ID.

Product data is persisted through Woo CRUD. The current CPT store uses:

| Product meta | Meaning |
|---|---|
| `_downloadable` | Whether the product is downloadable. |
| `_downloadable_files` | Map keyed by stable download ID; each entry includes name, file, enabled, and extra data. |
| `_download_limit` | Per-file count; `-1` becomes unlimited access. |
| `_download_expiry` | Days after grant/completion; `-1` means no expiry. |

Do not write this meta directly. Validation and future storage compatibility live in product CRUD.

For new/changed files, `check_is_valid()` enforces:

- enabled state;
- allowed MIME/extension for local server files;
- local existence;
- approved-directory membership when mode is enabled.

Absolute remote HTTP(S) URLs are considered remote and are not fetched to confirm existence. Shortcodes are allowed; approved-directory validation resolves them by default, but the shortcode provider remains responsible for safe output.

An invalid existing path is retained as disabled during hydration; a new or changed invalid path raises a product error. Never silently re-enable it.

## Approved directories and storage protection

Approved locations live in `{$wpdb->prefix}wc_product_download_directories`. Mode is stored in `wc_downloads_approved_directories_mode`; production installations normally use `enabled`.

The synchronizer discovers product download directories in Action Scheduler batches under:

```text
hook:  woocommerce_download_dir_sync
group: woocommerce-db-updates
```

Discovered paths may require administrator review before they are enabled. Use Woo's settings/UI and public product CRUD; `Automattic\WooCommerce\Internal\ProductDownloads\ApprovedDirectories\Register` is internal and is not a stable integration API.

Woo's protected upload directory is normally under `uploads/woocommerce_uploads`. Apache protection depends on the generated `.htaccess`; Nginx requires equivalent server configuration. Filename randomization and the approved-directory list do not prevent direct HTTP access.

## Entitlement tables

`{$wpdb->prefix}woocommerce_downloadable_product_permissions`:

| Column | Contract |
|---|---|
| `permission_id` | Primary key. |
| `download_id` | Stable product file ID, `varchar(36)`. |
| `product_id` | Product or variation ID. |
| `order_id`, `order_key` | The order that owns the grant. |
| `user_email`, `user_id` | Bearer-link identity plus optional account owner. |
| `downloads_remaining` | Numeric text or empty string for unlimited. |
| `access_granted`, `access_expires` | Grant and nullable expiry dates. |
| `download_count` | Successful/recorded attempt count. |

There is no unique constraint over order/product/download/customer. Application code must make retries idempotent.

`{$wpdb->prefix}wc_download_log` records timestamp, permission ID, nullable user ID, and IP address. It has an index but no foreign key to permissions. Delete through the customer-download data store so logs are cleaned too.

## Canonical grant calculation

`wc_downloadable_product_permissions( $order_id, $force )`:

1. Loads the order and checks its `download_permissions_granted` property unless forced.
2. For a processing order, stops when `woocommerce_downloads_grant_access_after_payment` is `no`.
3. Iterates downloadable order line items and current product files.
4. Calls `wc_downloadable_file_permission()` per file.
5. Sets the granted flag and fires `woocommerce_grant_product_download_permissions`.

`wc_downloadable_file_permission()` creates `WC_Customer_Download` data:

- actual product/variation ID;
- customer ID, billing email, order ID, and order key;
- product limit multiplied by line quantity, or empty string for unlimited;
- grant time and count zero;
- expiry days based on the order completion date when present, otherwise current time.

Important filters/actions:

| Hook | Purpose |
|---|---|
| `woocommerce_downloadable_file_permission` | Change the `WC_Customer_Download` object before save. |
| `woocommerce_downloadable_file_permission_data` | Change insert data; security/ownership integrations such as gifting use this layer. |
| `woocommerce_downloadable_file_permission_format` | Change SQL formats when insert data changes. |
| `woocommerce_grant_product_download_access` | Observe one saved permission. |
| `woocommerce_grant_product_download_permissions` | Observe the completed order-level grant. |

Do not use `$force = true` as deduplication. Core's admin and REST v4 reset flow deletes by order ID first, then force-grants.

## Availability and request authorization

`wc_get_customer_download_permissions()` asks the data store for non-expired/non-exhausted permission records. `wc_get_customer_available_downloads()` adds the final presentation checks:

1. related order exists;
2. `$order->is_download_permitted()` is true;
3. current product exists;
4. stable download ID still exists on that product;
5. file entry is enabled.

The front-end URL normally contains:

```text
download_file=<product-or-variation-id>
order=<order-key>
email=<customer-email>  OR  uid=<email-hash>
key=<download-id>
```

`WC_Download_Handler` then verifies, in substance:

1. product, download ID, and enabled file;
2. order key and email or constant-time email hash;
3. matching permission row;
4. related order's `is_download_permitted()` result;
5. remaining count and expiry;
6. login and `download_file` ownership capability when login is required and the permission has a user ID.

It fires `woocommerce_download_product`, tracks the attempt, and delegates to the configured delivery method. This URL is not a nonce and has no nonce lifetime.

## Delivery methods and request counting

| `woocommerce_file_download_method` | Behavior | Main risk |
|---|---|---|
| `force` | PHP streams the file. Default. | PHP worker/memory/I/O pressure for large files. |
| `xsendfile` | Delegates after authorization. | Requires correct web-server module/header mapping. |
| `redirect` | Sends the browser to the file URL. | Source URL becomes visible and may bypass all future checks. |

Remote force downloads can fall back to redirect only when `woocommerce_downloads_redirect_fallback_allowed` permits it. The inline setting changes `Content-Disposition` where Woo controls headers; it cannot control an external redirect target.

Tracking atomically increments `download_count`, decrements a finite remaining count, clamps at zero, and writes a log. Range requests can be tracked later through the unique `track_partial_download` Action Scheduler job after the configured window (30 minutes by default), preventing one segmented/iOS transfer from consuming many attempts. Therefore immediate counts can be temporarily behind reality.

## Settings that alter semantics

| Option | Typical default | Effect |
|---|---|---|
| `woocommerce_file_download_method` | `force` | Delivery implementation. |
| `woocommerce_downloads_require_login` | `no` | Adds account ownership enforcement only for permissions with a user ID. |
| `woocommerce_downloads_grant_access_after_payment` | `yes` | Allows processing orders to receive/access downloads. |
| `wc_downloads_approved_directories_mode` | install-dependent initialization, normally `enabled` | Enforces download-source allowlist. |
| `woocommerce_downloads_redirect_fallback_allowed` | `no` | Allows force mode to redirect when a remote file cannot be streamed. |
| `woocommerce_downloads_deliver_inline` | disabled | Uses inline browser display where Woo controls the response; redirects ignore it. |
| `woocommerce_downloads_add_hash_to_filename` | `yes` | Adds a unique suffix to newly uploaded filenames; not an authorization boundary. |
| `woocommerce_downloads_count_partial` | `yes` | Enables deferred counting behavior for partial/range downloads. |

Read defaults from the running Woo version; do not treat a missing option row as a literal `no` without checking the caller's fallback.

## REST and headless boundary

WC REST v3 exposes authenticated customer downloads at `GET /wc/v3/customers/{customer_id}/downloads`; it is a read-only projection and requires Woo customer read permission. The response can contain live download URLs and file data. Enforce ownership/capability on any custom proxy, avoid shared caches, redact telemetry, and use HTTPS.

WC REST v4 provides an authorized order action named `reset_download_permissions`. It follows delete-then-force-grant behavior. Plugin-defined public routes should not expose this operation without a strict capability and order-scope check.

Headless clients should receive the Woo-authorized URL only after authenticating to the application's own API. Do not expose raw `_downloadable_files` or storage URLs as a substitute for customer-download projection.

## Change and cleanup semantics

- Removing a download ID makes existing rows unusable but does not itself guarantee their physical deletion.
- Preserving an ID while changing its file makes existing permissions deliver the replacement.
- Core's `DownloadPermissionsAdjuster` handles a narrow simple-to-variable conversion case by copying equivalent permissions to matching child variations; it is not a general permission migration service.
- Order CRUD deletion calls the customer-download cleanup path. Direct order-table/post deletion does not provide that contract.
- New-account guest-order association can delete and regenerate download permissions with a user ID.
- Fully refunded line items are omitted from `WC_Order::get_downloadable_items()`.

For bulk migration, define an explicit policy for stable IDs, existing counts, expiry, removed files, rollback, and idempotency before touching customer data.

## Minimum regression matrix

Test all applicable cases:

- processing with grant-after-payment both enabled and disabled;
- completed order;
- finite limit, unlimited empty-string limit, exhausted permission;
- future and expired dates;
- logged-out guest, logged-in owner, logged-in different user;
- variation file and parent product distinction;
- removed ID, preserved ID with changed file, disabled invalid file;
- refunded line item;
- duplicate retry and explicit reset;
- range request/deferred tracking;
- direct storage URL versus authorized Woo URL;
- real Apache/Nginx/object-storage delivery for the configured method.
