# Action Scheduler retries, batches, and CLI

This reference targets Action Scheduler 4.0.0 selected from WooCommerce 11.0.0. Use it after the main skill establishes identity, delivery, lifecycle, and table-ownership rules.

## Explicit retries and failure telemetry

Carry a bounded attempt number, use exponential backoff with optional jitter, and preserve remote idempotency across every attempt. Rethrow the original error after scheduling the retry so the failed attempt remains visible.

```php
add_action(
    'myplugin_import_order',
    static function ( int $order_id, int $attempt = 1 ): void {
        try {
            myplugin_import_order_from_remote( $order_id );
        } catch ( Throwable $error ) {
            if ( $attempt < 5 ) {
                $delay  = min( 15 * ( 2 ** max( 0, $attempt - 1 ) ), 15 * MINUTE_IN_SECONDS );
                $delay += wp_rand( 0, 30 );

                as_schedule_single_action(
                    time() + $delay,
                    'myplugin_import_order',
                    array(
                        'order_id' => $order_id,
                        'attempt'  => $attempt + 1,
                    ),
                    'myplugin'
                );
            }

            throw $error;
        }
    },
    10,
    2
);

add_action(
    'action_scheduler_failed_execution',
    static function ( int $action_id, Throwable $error, string $context ): void {
        wc_get_logger()->error(
            'Action Scheduler action failed.',
            array(
                'source'          => 'myplugin',
                'action_id'       => $action_id,
                'context'         => $context,
                'exception_class' => get_class( $error ),
            )
        );
    },
    10,
    3
);
```

Use retry jitter only when varied timing is acceptable. For deterministic tests, inject or filter the delay calculation rather than asserting an exact randomized timestamp. Never log the exception object wholesale when it may carry request payloads, credentials, or customer data.

## Bounded batch pattern

Prefer an immutable ID/timestamp cursor when the source can change while processing. This minimal offset example is appropriate only for a stable snapshot:

```php
add_action(
    'myplugin_rebuild_product_cache',
    static function ( int $offset = 0 ): void {
        $product_ids = myplugin_get_product_ids_for_rebuild( $offset, 100 );

        foreach ( $product_ids as $product_id ) {
            myplugin_rebuild_one_product_cache( (int) $product_id );
        }

        if ( 100 === count( $product_ids ) ) {
            as_schedule_single_action(
                time() + 30,
                'myplugin_rebuild_product_cache',
                array( 'offset' => $offset + 100 ),
                'myplugin'
            );
        }
    },
    10,
    1
);
```

## Verified WP-CLI command tree

Multiple plugins can bundle Action Scheduler. Inspect the selected runtime before diagnosing source-specific behavior:

```bash
wp action-scheduler version --all --path=/path/to/site
wp action-scheduler source --path=/path/to/site
wp action-scheduler source --all --path=/path/to/site
wp action-scheduler data-store --path=/path/to/site
wp action-scheduler runner --path=/path/to/site
wp action-scheduler status --path=/path/to/site
wp action-scheduler run --group=myplugin --batch-size=25 --batches=1 --path=/path/to/site
wp action-scheduler action list --group=myplugin --status=pending --path=/path/to/site
wp action-scheduler action get 123 --path=/path/to/site
wp action-scheduler action logs 123 --path=/path/to/site
wp action-scheduler action run 123 --path=/path/to/site
```

The runner accepts `--hooks`, `--group`, `--exclude-groups`, `--batch-size`, and `--batches`. Use `--force` only intentionally: it bypasses the concurrent-batch guard and can increase overlap.

Plain `source` reports the selected copy. `source --all` shows the registry, but duplicate physical copies registered under one version can be omitted; it is supporting evidence, not a complete filesystem inventory.
