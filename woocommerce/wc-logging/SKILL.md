---
name: wc-logging
description: Add production-safe WooCommerce logs with `wc_get_logger()`. Covers stable sources, severity levels and thresholds, structured context, correlation IDs, sensitive-data redaction, handler and retention behavior, volume control, custom handlers, and why logs are not durable business state. Use when adding diagnostics to gateways, webhooks, background jobs, imports, REST endpoints, or order integrations.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
source-refs:
  - wp-content/plugins/woocommerce/includes/wc-core-functions.php
  - wp-content/plugins/woocommerce/includes/class-wc-logger.php
  - wp-content/plugins/woocommerce/includes/class-wc-log-levels.php
  - wp-content/plugins/woocommerce/includes/abstracts/abstract-wc-log-handler.php
  - wp-content/plugins/woocommerce/includes/log-handlers/class-wc-log-handler-db.php
  - wp-content/plugins/woocommerce/includes/log-handlers/class-wc-log-handler-file.php
  - wp-content/plugins/woocommerce/src/Utilities/LoggingUtil.php
  - wp-content/plugins/woocommerce/src/Internal/Admin/Logging/Settings.php
---

# WooCommerce logging

Use WooCommerce's shared logger for operational diagnostics that merchants can inspect in WooCommerce Status logs. Logs are disposable observability data, never the only record that a payment, migration, export, or webhook completed.

## Basic pattern

```php
$logger = wc_get_logger();

$logger->info(
    'Order export queued.',
    array(
        'source'         => 'myplugin-export',
        'order_id'       => $order_id,
        'correlation_id' => $correlation_id,
        'attempt'        => $attempt,
    )
);
```

Always set a stable, plugin-prefixed `source`. Current file logging sanitizes it and expects at least three characters. Do not generate one source per order, user, request, or date; that fragments log browsing and creates excessive files/source records.

## Levels

| Level | Use |
|---|---|
| `debug` | Detailed development diagnostics; high volume and normally thresholded in production |
| `info` | Normal lifecycle milestones useful for operations |
| `notice` | Significant but expected condition |
| `warning` | Recoverable anomaly, fallback, retry, deprecation, or degraded behavior |
| `error` | Operation failed but the application remains usable |
| `critical` | A component or important workflow is unavailable |
| `alert` | Immediate operator action is required |
| `emergency` | Store/system is unusable |

Use the level methods (`debug()`, `info()`, `warning()`, `error()`) or `log()`. `WC_Logger::add()` is legacy and explicitly not the preferred API.

WooCommerce can disable logging globally and can set a minimum severity threshold. In 10.9.4 the default threshold is `none`, meaning all levels are accepted, but site settings or `WC_LOG_THRESHOLD` can change that. Never make application correctness depend on a log entry being handled.

## Structured context

Prefer a constant message plus small, allowlisted context:

```php
$logger->error(
    'Provider capture failed.',
    array(
        'source'             => 'myplugin-gateway',
        'order_id'           => $order->get_id(),
        'provider_reference' => myplugin_mask_reference( $provider_reference ),
        'provider_code'      => sanitize_key( $provider_code ),
        'correlation_id'     => $correlation_id,
    )
);
```

Current file-v2 handling JSON-encodes context other than `source`. Other handlers may format it differently, so pass serializable scalars/small arrays, not `WC_Order`, HTTP response objects, exceptions, resources, or closures.

Use a request/job correlation ID that is random and non-secret. Carry it across the initial request, Action Scheduler args, provider metadata, and log context where practical. It should help joins without identifying a customer.

## Sensitive-data boundary

Never log:

- passwords, API keys, OAuth secrets, bearer/provider tokens;
- cookies, Cart-Tokens, nonces, webhook signatures, authorization headers;
- PAN/card numbers, CVV, bank credentials, magnetic-stripe data;
- complete provider/webhook/REST request or response bodies;
- full email, phone, postal address, IP address, or unnecessary customer text;
- URLs containing secret or personal query parameters;
- raw SQL containing personal values.

Redact before calling the logger. A later filter is defense in depth, not permission to send secrets into the logging pipeline. Prefer provider error codes and masked references over `$exception->getMessage()` or exception objects because messages/stacks can contain request payloads, credentials, filesystem paths, and PII.

```php
function myplugin_mask_reference( string $value ): string {
    $value = preg_replace( '/[^A-Za-z0-9_-]/', '', $value );
    return strlen( $value ) > 6 ? '...' . substr( $value, -6 ) : '[redacted]';
}
```

## Gateway and webhook example

```php
try {
    $result = $client->capture( $provider_payment_id, $amount );
} catch ( Throwable $error ) {
    wc_get_logger()->error(
        'Capture request failed.',
        array(
            'source'          => 'myplugin-gateway',
            'order_id'        => $order_id,
            'exception_class' => get_class( $error ),
            'correlation_id'  => $correlation_id,
        )
    );

    throw new RuntimeException( 'Provider capture failed.' );
}
```

Do not return log detail to the customer. Customer/admin messages, private order notes, and diagnostic logs have different audiences.

## Volume and hot paths

- Do not log every product, cart calculation, price getter, REST schema call, or session read at `info`.
- Log batch/job start, aggregate result, retry, and final failure; use `debug` for bounded per-item detail.
- Avoid `backtrace => true` except targeted debugging: backtraces cost CPU/memory and expose paths.
- Do not serialize large arrays to context.
- Rate-limit repeated warnings for the same root cause.
- Remove temporary debug logging before release or keep it behind a plugin debug setting disabled by default.

Logging itself can fail because of permissions, disk, database, handler, or global settings. Never let a logging failure replace or mask the primary business exception.

## Retention and handlers

WooCommerce 10.9.4 defaults to file-v2 handling and 30-day retention, but merchants can change logging enabled state, handler, retention, and threshold. Cleanup runs on `woocommerce_cleanup_logs` through `wc_cleanup_logs()`.

Do not delete or rotate WooCommerce log files directly. Do not assume file paths; the active handler may use database storage or a custom implementation.

To add a handler, filter instances through `woocommerce_register_log_handlers` and implement `WC_Log_Handler_Interface`. Keep the default handler unless replacement is an explicit store policy. A custom remote handler must have strict timeouts/queueing, redaction, bounded retries, and must never block checkout.

`woocommerce_logging_class` replaces the shared logger and affects every WooCommerce extension. Do not use it for a plugin-local transport unless you intentionally own the store-wide logging contract.

## Filtering and suppression

`woocommerce_logger_log_message` runs per handler and returning `null` suppresses that entry for that handler. Global filters can affect unrelated plugins, so scope by `context['source']` and avoid broad message rewriting.

Use suppression only for deliberate redaction/volume policy. Do not hide payment or migration failures to make logs appear clean.

## Logs versus durable state

Store these in an owned model/order metadata, not only logs:

- provider event IDs and idempotency claims;
- migration/schema version and completed steps;
- export/import cursor and completion state;
- external order/payment identifiers;
- retry count when it controls business behavior;
- audit records required by policy.

The log can reference the durable record with an ID.

## Critical rules

- Always use a stable plugin-prefixed source.
- Log allowlisted structured context, not raw objects/payloads.
- Redact before logging and keep PII to the minimum.
- Choose levels semantically; production thresholds may drop low-severity entries.
- Keep logs bounded in hot paths and background loops.
- Never depend on a log as durable state or an idempotency lock.
- Never expose diagnostic messages directly to customers.

## Cross-references

- `wc-payment-gateway` for customer-safe gateway/webhook errors.
- `wc-action-scheduler-jobs` for job retries and aggregate logging.
- `wc-order-lifecycle-and-items` for durable order notes/meta versus diagnostics.

## References

- Shared logger and cleanup: `includes/wc-core-functions.php`.
- levels, thresholds, handlers, and filters: `includes/class-wc-logger.php`.
- default settings and retention: `src/Internal/Admin/Logging/Settings.php`.
