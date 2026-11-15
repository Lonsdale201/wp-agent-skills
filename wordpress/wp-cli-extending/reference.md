# Worked command and import design

## A complete, bounded settings example

This standalone example owns only `acme_demo_limit`. It deliberately requires an
explicit WordPress identity with `manage_options`; native maintenance commands do
not all enforce this policy. Load the file with `--require`, or put it behind your
plugin's CLI bootstrap. Existing plugins should call their shared settings service
instead of replacing that service with this simple `update_option()` example.

```php
<?php
if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
    return;
}

final class Acme_Demo_Command {
    /**
     * Set a demo limit after validation and confirmation.
     *
     * ## OPTIONS
     *
     * <limit>
     * : Integer from 1 to 1000.
     *
     * [--dry-run]
     * : Show the prepared change without writing.
     *
     * [--yes]
     * : Skip interactive confirmation.
     *
     * @subcommand set-limit
     */
    public function set_limit( array $args, array $assoc_args ): void {
        $this->authorize();
        $limit = $this->prepare_limit( $args[0] );
        $dry_run = filter_var(
            $assoc_args['dry-run'] ?? false,
            FILTER_VALIDATE_BOOLEAN,
            FILTER_NULL_ON_FAILURE
        );
        if ( null === $dry_run ) {
            WP_CLI::error( '--dry-run expects a boolean.' );
        }
        $before = get_option( 'acme_demo_limit', 10 );
        WP_CLI::log( sprintf( 'acme_demo_limit: %s -> %d', $before, $limit ) );
        if ( $dry_run ) {
            WP_CLI::success( 'Preview complete; no changes applied.' );
            return;
        }
        WP_CLI::confirm( 'Apply this change?', $assoc_args );
        $updated = update_option( 'acme_demo_limit', $limit, false );
        // false can mean unchanged, not only a failed write.
        if ( ! $updated && (string) get_option( 'acme_demo_limit' ) !== (string) $limit ) {
            WP_CLI::error( 'The setting could not be saved.' );
        }
        WP_CLI::success( 'Setting saved.' );
    }

    /**
     * Read the demo configuration.
     *
     * ## OPTIONS
     *
     * [--format=<format>]
     * : Output format.
     * ---
     * default: table
     * options:
     *   - table
     *   - csv
     *   - json
     *   - count
     * ---
     */
    public function show( array $args, array $assoc_args ): void {
        $this->authorize();
        WP_CLI\Utils\format_items(
            $assoc_args['format'] ?? 'table',
            array( array( 'key' => 'acme_demo_limit', 'value' => get_option( 'acme_demo_limit', 10 ) ) ),
            array( 'key', 'value' )
        );
    }

    private function authorize(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            WP_CLI::error( 'Select an authorized user with --user=<id|login|email>.' );
        }
    }

    private function prepare_limit( string $raw ): int {
        $value = filter_var( $raw, FILTER_VALIDATE_INT, array(
            'options' => array( 'min_range' => 1, 'max_range' => 1000 ),
        ) );
        if ( false === $value ) {
            WP_CLI::error( 'Limit must be an integer from 1 to 1000.' );
        }
        return $value;
    }
}

WP_CLI::add_command( 'acme-demo', Acme_Demo_Command::class );
```

```bash
wp --require=./acme-cli.php help acme-demo set-limit
wp --require=./acme-cli.php --user=cliadmin acme-demo set-limit 25 --dry-run
wp --require=./acme-cli.php --user=cliadmin acme-demo set-limit 25 --yes
wp --require=./acme-cli.php --user=cliadmin acme-demo show --format=json
```

Test absent user, unauthorized user, unknown option, `0`, `-1`, `ten`, integer
overflow, valid dry run, valid apply and unchanged apply. The example is a single
setting operation, without a concurrency or rollback guarantee. A production
service must also handle its filters, related writes and concurrent writers.

## Importers: bounded reading and truthful preview

Define these interfaces in the plugin; they are architectural roles, not WP-CLI APIs:

1. A streaming reader (e.g. `fgetcsv()` or `SplFileObject`) with byte/record limits,
   explicit encoding, headers, JSON shape and field bounds.
2. A pure `prepare(record, snapshot)` step shared by preview and apply. Validate
   references, permission scope, uniqueness and cross-field constraints here.
3. An `apply(plan)` domain service using supported storage APIs, plugin lifecycle
   events and a documented partial-failure policy.
4. A durable report with input identity/hash, selected target, schema/version,
   cursor, processed/skipped/failed counts and redacted before/after examples.

Validate batch size with `FILTER_VALIDATE_INT` and a positive min/max before
opening the input. Reading the whole file and then using `array_chunk()` is not
streaming. A successful parse is not a successful domain validation dry run.

For all-or-nothing **validation**, preflight the complete input before applying,
then reread a verified unchanged source or consume an immutable prepared plan.
This alone does not make writes transactional. Declare whether invalid records
abort everything or are skipped, and return nonzero for partial failures unless
the caller explicitly requested a documented tolerance policy.

Do not run apply and roll it back to implement preview: hooks, email, webhooks,
queue jobs and external services are not undone by a database rollback. Preview
is based on a snapshot and may become stale; revalidate affected state on apply.

## Reusing WP-CLI internals

Use the documented `synopsis` registration argument when a generated command
schema needs programmatic argument definitions. PHPDoc is the usual alternative.
Neither handwritten usage output nor a callback-only validator automatically
populates help.

For untrusted command arguments, avoid ad hoc string concatenation. Check the
installed escaping API (`WP_CLI\Utils\esc_cmd()`) and platform
behavior before invocation. A domain service call is often a simpler way to reuse
plugin behavior than invoking a second CLI command.

See [native commands and bulk data](references/native-commands-and-bulk-data.md)
for selection, serialization, cache and resumability contracts, and
[verification](references/verification.md) for the release checks.
