# wp-cli-extending — Reference: full examples

Long-form examples kept out of `SKILL.md` for brevity. The main skill is the
contract + critical rules; this file is the worked code.

## Full command class — import + list with all the right idioms

```php
namespace MyPlugin\CLI;

final class Commands {

    /**
     * Imports licenses from a CSV file.
     *
     * ## OPTIONS
     *
     * <file>
     * : Path to CSV file.
     *
     * [--dry-run]
     * : Parse and report counts without writing.
     *
     * [--batch-size=<n>]
     * : Rows per chunk. Default: 100.
     *
     * ## EXAMPLES
     *
     *     wp myplugin import-licenses ./batch.csv --batch-size=500
     *     wp myplugin import-licenses ./batch.csv --dry-run
     *
     * @subcommand import-licenses
     * @when after_wp_load
     */
    public function import_licenses( array $args, array $assoc_args ): void {
        [ $file ] = $args;
        $dry_run    = (bool) \WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
        $batch_size = (int)  \WP_CLI\Utils\get_flag_value( $assoc_args, 'batch-size', 100 );

        if ( ! is_readable( $file ) ) {
            \WP_CLI::error( "Cannot read file: $file" );
        }

        $rows  = \MyPlugin\License\Importer::parse( $file );
        $total = count( $rows );
        \WP_CLI::log( sprintf( 'Parsed %d rows.', $total ) );

        if ( $dry_run ) {
            \WP_CLI::success( 'Dry run complete. No changes written.' );
            return;
        }

        $progress = \WP_CLI\Utils\make_progress_bar( 'Importing', $total );
        foreach ( array_chunk( $rows, $batch_size ) as $chunk ) {
            \MyPlugin\License\Importer::write_chunk( $chunk );
            $progress->tick( count( $chunk ) );
        }
        $progress->finish();

        \WP_CLI::success( sprintf( 'Imported %d licenses.', $total ) );
    }

    /**
     * Lists active licenses.
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
     *   - yaml
     *   - count
     * ---
     *
     * [--fields=<fields>]
     * : Limit output to specific fields (comma-separated).
     *
     * @subcommand list-licenses
     */
    public function list_licenses( array $args, array $assoc_args ): void {
        $items  = \MyPlugin\License\Repo::all_active();
        $fields = ! empty( $assoc_args['fields'] )
            ? array_map( 'trim', explode( ',', $assoc_args['fields'] ) )
            : array( 'id', 'key', 'product', 'expires_at' );

        $format = \WP_CLI\Utils\get_flag_value( $assoc_args, 'format', 'table' );

        \WP_CLI\Utils\format_items( $format, $items, $fields );
    }
}
```

## Common before/after AI mistakes

```php
// WRONG — fatals on every web request (WP_CLI class doesn't exist there)
WP_CLI::add_command( 'myplugin', MyClass::class );

// RIGHT — guard
if ( defined( 'WP_CLI' ) && WP_CLI ) {
    WP_CLI::add_command( 'myplugin', MyClass::class );
}
```

```php
// WRONG — invents synopsis in code; WP-CLI parser ignores it, help is wrong
public function import( $args, $assoc_args ) {
    if ( empty( $assoc_args['file'] ) ) {
        echo "Usage: wp myplugin import --file=<path>\n";
        return;
    }
}

// RIGHT — declare in PHPDoc; WP-CLI shows usage and validates
/**
 * ## OPTIONS
 *
 * --file=<path>
 * : The CSV file.
 */
public function import( $args, $assoc_args ) { /* ... */ }
```

```php
// WRONG — raw echo doesn't respect --quiet, gets no colour, no exit code
echo "Done.\n";
echo "ERROR: something went wrong\n";

// RIGHT — use WP-CLI helpers
\WP_CLI::success( 'Done.' );
\WP_CLI::error( 'Something went wrong.' );   // also exits non-zero
```

```php
// WRONG — hand-built table; --format=json now broken for scripts
foreach ( $items as $row ) {
    printf( "%-10s %s\n", $row['id'], $row['name'] );
}

// RIGHT — let WP-CLI format it; users get table/csv/json/yaml for free
\WP_CLI\Utils\format_items(
    \WP_CLI\Utils\get_flag_value( $assoc_args, 'format', 'table' ),
    $items,
    array( 'id', 'name' )
);
```

```php
// WRONG — wp_die in a CLI command produces an HTML / fatal-looking output
if ( ! current_user_can( 'manage_options' ) ) {
    wp_die( 'Not allowed.' );
}

// RIGHT — WP-CLI error
if ( ! current_user_can( 'manage_options' ) ) {
    \WP_CLI::error( 'Not allowed.' );
}
```
