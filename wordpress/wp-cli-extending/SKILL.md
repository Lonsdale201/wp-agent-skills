---
name: wp-cli-extending
description: Add custom WP-CLI commands to a WordPress plugin via
  `WP_CLI::add_command( $name, $callable, $args )`. Covers the
  class-based command pattern with PHPDoc-driven synopsis, positional
  vs `--flag` args, I/O helpers (`success` / `log` / `warning` /
  `error` / `confirm` / `debug`), formatted output via
  `WP_CLI\Utils\format_items()` + `--format=table|csv|json|yaml|count`,
  progress bars with `WP_CLI\Utils\make_progress_bar()`,
  `WP_CLI::runcommand()` for invoking other commands, lifecycle hooks
  (`before_wp_load`, `before_invoke:<cmd>`, `after_invoke:<cmd>`),
  and the `defined( 'WP_CLI' ) && WP_CLI` registration guard. Use for
  plugin bulk import, data migration, queue dispatch, debug
  introspection, or any CLI surface.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "WP-CLI 2.10 - 2.11; WP 6.0 - 7.0"
php-min: "7.4"
last-updated: "2026-05-24"
docs:
  - https://make.wordpress.org/cli/handbook/references/internal-api/wp-cli-add-command/
  - https://make.wordpress.org/cli/handbook/references/internal-api/
  - https://make.wordpress.org/cli/handbook/guides/commands-cookbook/
  - https://make.wordpress.org/cli/handbook/guides/hook-system/
---

# WP-CLI: Extending with Custom Commands

WP-CLI is the maintenance / automation interface to a WordPress install. Almost no plugin ships CLI commands — even though `wp myplugin import`, `wp myplugin clear-cache`, `wp myplugin run-sync` are exactly what ops people want. The API is `WP_CLI::add_command()` and a class with PHPDoc-annotated methods.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin needs a CLI surface — bulk import / export, data migration, queue dispatch, debug introspection, scheduled-job force-run, cache clear, license activate.
- Code references `WP_CLI::add_command`, `WP_CLI::log`, `WP_CLI::success`, `WP_CLI::warning`, `WP_CLI::error`, `WP_CLI::confirm`, `WP_CLI::runcommand`, `WP_CLI::add_hook`, `WP_CLI\Utils\format_items`, `WP_CLI\Utils\make_progress_bar`, `WP_CLI\Utils\get_flag_value`.
- The user has a long-running admin task (`update_option` loop over 50k rows, AJAX-timing-out import) and wants to run it from terminal.
- Code is checking `if ( defined( 'WP_CLI' ) && WP_CLI )` and the body is empty / wrong.

## The bootstrap — guard, then register

```php
// In the plugin's main file or a dedicated CLI bootstrap.
if ( defined( 'WP_CLI' ) && WP_CLI ) {
    WP_CLI::add_command( 'myplugin', MyPlugin\CLI\Commands::class );
}
```

The class is instantiated **lazily** when WP-CLI dispatches a `myplugin ...` invocation. PHPDoc on each method is what drives synopsis / help. Public methods become subcommands. Method names are used as-is, so `import_licenses` registers `wp myplugin import_licenses` unless you add `@subcommand import-licenses`. Use `@subcommand` for normal hyphenated command names.

Full worked example (import + list with progress bar, dry-run, format args) lives in `reference.md`. The skeleton:

```php
namespace MyPlugin\CLI;

final class Commands {
    /**
     * One-line description.
     *
     * ## OPTIONS
     *
     * <file>
     * : Positional, required.
     *
     * [--dry-run]
     * : Optional flag.
     *
     * @subcommand import-licenses
     * @when after_wp_load
     */
    public function import_licenses( array $args, array $assoc_args ): void {
        [ $file ] = $args;
        $dry = (bool) \WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
        // ... work, with \WP_CLI::log() / success() / error() ...
    }
}
```

## PHPDoc drives the synopsis — get the format right

WP-CLI parses the docblock for command help / arg validation. The strict format:

| Line | Means |
|---|---|
| First paragraph | One-line short description (shown in `wp help myplugin`) |
| `## OPTIONS` | Begins the args section |
| `<name>` | Positional arg, required |
| `[<name>]` | Positional arg, optional |
| `[<name>...]` | Variadic positional |
| `--flag` | Boolean flag |
| `[--flag]` | Optional boolean flag |
| `[--key=<value>]` | Associative arg |
| `[--key=<value>...]` | Repeatable associative arg |
| `: description` | The next line is the description for the arg above |
| `## EXAMPLES` | Begins examples block |
| `@when before_wp_load` / `after_wp_load` | Controls when WP boots relative to the command (default: `after_wp_load`) |
| `@subcommand name-with-hyphen` | Exposes a PHP method under a CLI-safe command name |
| `@alias` | Alternate name for the command |

The arg pattern lines are NOT freeform — they MUST match WP-CLI's parser. Run `wp help myplugin import-licenses` to see what the parser made of your docblock; if the command is missing, check the method name / `@subcommand` tag first. If the `## OPTIONS` section looks wrong there, the docblock is malformed.

## I/O helpers — pick the right severity

Verified at `WP_CLI` class methods (reflection-confirmed):

```php
\WP_CLI::line( $msg );           // plain stdout; no log prefix
\WP_CLI::log( $msg );            // also plain stdout but suppressed by --quiet
\WP_CLI::success( $msg );        // green "Success: ..."
\WP_CLI::warning( $msg );        // yellow "Warning: ..."
\WP_CLI::error( $msg, true );    // red "Error: ..." AND exit non-zero (default)
\WP_CLI::error( $msg, false );   // print error but continue
\WP_CLI::debug( $msg );          // only printed with --debug flag
\WP_CLI::confirm( $question, $assoc_args ); // y/n prompt; auto-yes when $assoc_args contains --yes
\WP_CLI::halt( $code );          // exit with custom code
```

`error` exits by default — use it for "abort the command". `warning` does not exit.

## Formatted output — match the `--format` convention

Every WP-CLI command that lists data accepts `--format=<table|csv|json|yaml|count>`. Build your commands the same way. `WP_CLI\Utils\format_items( $format, $items, $fields )` does the work (signature verified via reflection).

```php
$format = \WP_CLI\Utils\get_flag_value( $assoc_args, 'format', 'table' );
\WP_CLI\Utils\format_items( $format, $items, array( 'id', 'name', 'expires_at' ) );
```

Declare the format enum in the PHPDoc with the `---` YAML-block syntax so WP-CLI validates user input — full example in `reference.md`:

```
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
```

## Invoking other commands — `runcommand`

Reflection-confirmed signature: `WP_CLI::runcommand( $command, $options = [] )`. Options:

| Option | Meaning |
|---|---|
| `launch` | `true` (default for `after_wp_load` boundary crossing): run in subprocess. `false`: run in current process (faster but shares state) |
| `return` | `true`: return the output as a string. `'stdout'` / `'stderr'` / `'return_code'`: return one piece. `false` (default): echo |
| `parse` | `'json'`: JSON-decode the captured output |
| `exit_error` | `false`: don't exit on non-zero return from the inner command |

```php
// Run another command and capture its JSON output.
$users = \WP_CLI::runcommand( 'user list --role=customer --format=json', array(
    'return' => true,
    'parse'  => 'json',
) );

// Fire-and-forget; let it print to terminal.
\WP_CLI::runcommand( 'cache flush' );
```

## Lifecycle hooks — `WP_CLI::add_hook`

Useful for plugins that need to run init logic before/after specific commands, or before WP loads at all:

| Hook | When |
|---|---|
| `before_wp_load` | Before any WP file is loaded |
| `after_wp_load` | After WP bootstrap, before commands run |
| `before_invoke:<command>` | Right before `<command>`; parent command hooks also fire for subcommands |
| `after_invoke:<command>` | Right after `<command>` |
| `before_run_command` | Before every command, after dispatch |
| `after_run_command` | After every command |

```php
WP_CLI::add_hook( 'before_invoke:myplugin import-licenses', static function () {
    \WP_CLI::log( 'Disabling Action Scheduler runners for the import...' );
    remove_action( 'action_scheduler_run_queue', 'ActionScheduler::run_queue' );
} );
```

## Long-running commands and progress bars

`WP_CLI\Utils\make_progress_bar( $message, $count, $interval = 100 )` returns a progress bar (`\cli\progress\Bar` from the `wp-cli/php-cli-tools` lib). Call `->tick()` (with optional increment) per item, `->finish()` at the end.

```php
$bar = \WP_CLI\Utils\make_progress_bar( 'Migrating', $total );
foreach ( $rows as $row ) {
    migrate_one( $row );
    $bar->tick();
}
$bar->finish();
```

For commands that take >30 seconds, flush WP object cache between batches and `wp_get_db_schema()`-style commands — the persistent `$wpdb` accumulates query log + cached results. Common pattern:

```php
foreach ( array_chunk( $ids, 500 ) as $chunk ) {
    process_chunk( $chunk );
    \WP_CLI\Utils\wp_clear_object_cache();  // utility function, reflection-confirmed
}
```

## Critical rules

- **Always guard registration with `defined( 'WP_CLI' ) && WP_CLI`**. Otherwise the `WP_CLI::add_command` call fatals on every web request — the class doesn't exist outside CLI runs.
- **Method visibility matters**. Only `public` methods are exposed as subcommands. `protected` / `private` helpers don't leak — use them freely.
- **Underscores are not automatically converted to hyphens**. A method named `import_licenses` registers as `import_licenses`; add `@subcommand import-licenses` when the CLI command should be hyphenated.
- **Register a class name, not an already-instantiated object, when you want lazy loading**. With a class string, WP-CLI reflects PHPDoc during registration/help and only constructs the class when the command is invoked. Constructors should still stay cheap because every real command run pays for them.
- **`@when after_wp_load` is the default**. Only use `@when before_wp_load` for genuinely WP-independent commands (config inspection, file scaffolding). Most plugin commands need WP loaded.
- **`WP_CLI::error()` exits with non-zero by default**. Pass `false` as the 2nd arg only when you genuinely want to print "Error:" but continue.
- **Format your output via `WP_CLI\Utils\format_items()`, not by `echo`**. Users expect `--format=json` to work; rolling your own table breaks pipelines and scripts.
- **Don't bypass `WP_CLI::log` with raw `echo`**. `echo` doesn't respect `--quiet`; logs always do.
- **Pass `$assoc_args` to `WP_CLI::confirm()` when you want `--yes` support**. Calling `confirm( $question )` prompts even if the user supplied `--yes`.
- **Don't query the database from `before_wp_load`**. `$wpdb` is not initialized yet. Use `after_wp_load` (the default) for anything touching WP state.
- **Don't `wp_die()` inside a CLI command** — it bypasses WP-CLI's error formatting and produces ugly stack traces. Use `WP_CLI::error()`.

## Common AI mistakes

See `reference.md` for before/after snippets covering: missing `defined('WP_CLI')` guard, hand-rolled synopsis logic instead of PHPDoc, raw `echo` instead of `WP_CLI::log/success/error`, hand-built tables that break `--format=json`, and `wp_die()` inside a CLI command.

## Cross-references

- See **`wp-plugin-cron`** when the CLI command's job is to dispatch background work — Action Scheduler / cron is the right destination, not "do it all in the CLI invocation".
- See **`wp-rest-api`** when the same logic also needs a REST surface — extract the core into a service class, expose via both CLI command and REST route.
- See **`wp-locale-and-dates`** for `wp_date()` output in command tables — locale-aware display matters in `--format=table`.

## What this skill does NOT cover

- Distributing the command as a standalone WP-CLI package (`composer.json`, `wp package install`). Plugin-shipped commands cover 95% of plugin needs.
- Writing your own custom output formatter (subclassing `WP_CLI\Formatter`). Almost never needed — `format_items` covers everything.
- The package authoring conventions (`wp-cli/dotenv-command` style). Out of scope.

## References

- `WP_CLI::add_command()` — reflection-verified signature `add_command( $name, $callable, $args = [] )`.
- `WP_CLI\Utils\format_items()` — reflection-verified `format_items( $format, $items, $fields )`.
- `WP_CLI\Utils\make_progress_bar()` — reflection-verified `make_progress_bar( $message, $count, $interval = 100 )`.
- `WP_CLI\Utils\get_flag_value()` — `get_flag_value( $assoc_args, $flag, $default = null )`.
- WP-CLI handbook (canonical docs): https://make.wordpress.org/cli/handbook/references/internal-api/
- WP-CLI hook system: https://make.wordpress.org/cli/handbook/guides/hook-system/
