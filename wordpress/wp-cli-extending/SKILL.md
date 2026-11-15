---
name: wp-cli-extending
description: >-
  Build and review custom WordPress WP-CLI commands: guarded registration,
  PHPDoc or programmatic synopsis, argument types and global flag collisions,
  machine output, authorization, side-effect-free previews, bounded batches,
  command invocation and runtime verification. Also use for metadata cleanup,
  serialized search-replace, settings automation, migration safety, cache
  invalidation, or checking claims about native WP-CLI versus plugin commands.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.1.3"
  wp-skills-wp-version-tested: "7.1.3"
  wp-skills-toolchain-tested: "WP-CLI 2.12.0; PHP 8.3.31"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-15"
---

# Extend WP-CLI using verified command contracts

Start with the installed command's `wp help`, version and loaded packages. Native
commands already cover many maintenance tasks; a plugin command adds domain rules,
selection, preview and lifecycle coordination where those are actually needed.
Do not infer capabilities or safety guarantees from a comparison chart.

Read [native commands and bulk data](references/native-commands-and-bulk-data.md)
before metadata cleanup, database replacement, cache or resumability work. Read
[the worked command](reference.md) when implementing a command, and use
[the verification matrix](references/verification.md) before delivery.

## Registration and bootstrap

```php
if ( defined( 'WP_CLI' ) && WP_CLI ) {
    WP_CLI::add_command( 'myplugin', MyPlugin\CLI\Commands::class );
}
```

Load/autoload the command class safely. Registering a class string permits lazy
instantiation on invocation; constructing an object yourself does not. Keep
constructors cheap and side-effect-free. Public command methods become
subcommands; keep helpers private/protected. A method named `import_records`
keeps its underscore unless its PHPDoc declares `@subcommand import-records`.

Commands registered by active plugins normally run after WordPress loads. A real
`before_wp_load` command must be registered earlier, e.g. by a WP-CLI package or
`--require` file; an active plugin cannot move its registration before bootstrap
by adding an annotation. Do not access WP APIs before they are available.

## Synopsis and help are an executable interface

Declare arguments using PHPDoc or the documented `synopsis` registration argument
to `WP_CLI::add_command()`. Programmatic synopsis is supported; printing a usage
string inside a callback does not declare or validate arguments.

```php
/**
 * Import records from a file.
 *
 * ## OPTIONS
 *
 * <file>
 * : Path to an input file.
 *
 * [--dry-run]
 * : Prepare and validate without applying changes.
 *
 * [--batch-size=<n>]
 * : Maximum records per batch, from 1 to 1000.
 *
 * @subcommand import-records
 */
```

Give every option its own `: description`, separated by blank lines. In WP-CLI
2.12.0, an undescribed option next to a described option was omitted from the
parsed synopsis and rejected. A command with no parsed synopsis accepted the
same undeclared option: malformed docs do **not** reliably fail closed. Test both
`wp help` and invocation, including an unknown flag. Keep the first docblock line
a complete short summary; wrapped text can become the long description.

| Syntax | Meaning |
|---|---|
| `<name>` / `[<name>]` | Required / optional positional argument |
| `<name>...` / `[<name>...]` | Multiple positional arguments |
| `[--flag]` | Optional boolean flag |
| `[--key=<value>]` | Optional named value |
| `@subcommand name-with-hyphen` | Explicit subcommand name |

Do not promise repeatable custom named values from `[--key=<value>...]`. In the
tested release, repeating `--item=a --item=b` retained only `b`. Use positional
variadics or an explicitly parsed JSON/list input when multiple values are needed.

Global parameters are consumed by WP-CLI. Avoid business options named `--user`,
`--path`, `--url`, `--require`, `--exec` or `--context`; use `--target-user` etc.
The tested `--json` shorthand became `--format=json`, so it did not reach a custom
`json` option. Use `--payload` or a positional input for JSON data. Test collisions
against the installed release rather than treating this list as complete.

## Parse types and reject invalid inputs

Assigned values usually arrive as strings, while `--enabled` is boolean `true`
and `--no-enabled` is boolean `false`. `--enabled=no` is the string `"no"`:
`(bool) 'no'` would incorrectly enable it. Do not blindly cast unvalidated input.

- Boolean: accept a documented set using `FILTER_VALIDATE_BOOLEAN` with
  `FILTER_NULL_ON_FAILURE`; reject null/arrays/empty values unless explicitly valid.
- Integer: validate using `FILTER_VALIDATE_INT` plus min/max, check `false` with
  strict comparison. This rejects overflow as well as text; a regex alone does not.
- Choice: strict membership in an allowlist. PHPDoc `options:` can declare enums;
  retain domain validation in the shared service for non-CLI callers.
- Structured data: decode JSON only for declared structured fields; check JSON
  errors, shape, depth, unknown keys and bounds. A text name `"123"` stays text.
- Batch size: positive, bounded integer before reading or processing input.

Define whether out-of-range input errors or is clamped with a warning. Report the
actual stored value. Do not silently discard unknown fields or typoed options.

## Authorization and domain behavior

Choose an explicit trust policy. Native maintenance commands commonly trust the
shell operator; setting `--user` selects WP identity but does not universally add
capability checks to those commands. A custom command can require `--user` and
`current_user_can()`, as the worked example does. Neither policy replaces shell
access control. Never silently impersonate an arbitrary administrator.

Use the plugin's shared domain service for business validation, related writes,
audit events and plugin indexes. Native `wp option patch`/metadata commands use
WordPress APIs and can run loaded sanitizers, hooks and cache invalidation; they
may still bypass business logic that exists only in a plugin UI/REST controller.
They are not equivalent to raw SQL. See the bulk-data reference for the distinction.

Browser nonces are not a CLI authentication mechanism. Keep any trusted CLI-only
authorization path unreachable from REST/AJAX input, and preserve validation,
tenant/object scoping and content sanitization on that path.

## Preview, confirmation and output

`--dry-run` is a command-specific feature, not a universal WP-CLI switch. Implement
it explicitly with the same pure preparation/validation/selection as apply.
Preparation must not send HTTP requests, enqueue jobs, send mail, deliberately
invalidate application caches or mutate persistent domain state. Separate apply
side effects and disclose preview limitations; ordinary read-cache fills can occur.

Use `WP_CLI::confirm( $question, $assoc_args )` with a documented `--yes` option
for confirmation. Confirmation does not provide locking, rollback or a preview.
A declined confirmation may exit successfully: automation needing a distinct
cancel code must implement and test its own contract.

| Helper | Contract |
|---|---|
| `WP_CLI::line()` | Payload/plain stdout, including under `--quiet` |
| `WP_CLI::log()` / `success()` | Informational stdout, suppressed by `--quiet` |
| `WP_CLI::warning()` / `debug()` | Diagnostic stderr; debug requires `--debug` |
| `WP_CLI::error()` | Diagnostic and nonzero exit by default |
| `WP_CLI::error( $message, false )` | Reports error without stopping |
| `WP_CLI::halt( $code )` | Explicit exit code |

Machine output must contain only the requested payload. Do not append success
messages or progress text to JSON/CSV/porcelain output. Raw stdout is legitimate
for payloads; helpers are preferable for status and diagnostics.

For lists, declare only supported formats and validate them before calling
`WP_CLI\Utils\format_items( $format, $items, $fields )`. There is no universal
format set: native `search-replace` supports `table`/`count`, not JSON in 2.12.0.
Define stable fields, empty results, `--porcelain` and partial-failure exit codes.
Redact secrets from normal output and examples; a redacted export is not a backup.

## Invoking commands and lifecycle hooks

`WP_CLI::runcommand( $command, $options )` launches a subprocess by default.
Use `return => true` for stdout, `return => 'all'` for an object with `stdout`,
`stderr`, `return_code`; `exit_error => false` permits inspecting a failed command.
`parse => 'json'` requires a genuinely JSON-only payload.

```php
$result = WP_CLI::runcommand( 'core version', array(
    'return' => 'all',
    'exit_error' => false,
) );
if ( 0 !== $result->return_code ) {
    WP_CLI::error( 'Inner command failed.' );
}
```

Use `launch => false` only after accounting for shared globals, user/blog context,
caches and command lifecycle in the same process. Do not interpolate untrusted
values into command strings; use the documented escaping helpers and test the
target shell/platform. Treat `--require`/`--exec` and PHP input files as code.

WP-CLI's own `WP_CLI::add_hook()` system is separate from WP `add_action()`.
Common hooks include `before_wp_load`, `after_wp_load` and
`before_invoke:<command>` / `after_invoke:<command>`. Verify hook names/timing
against the installed WP-CLI source; do not invent an `after_run_command` hook
or assume an after hook runs after an exit/fatal. Use `try/finally` for ordinary
exceptions, plus durable lease recovery for process termination.

## Long-running operations

Stream input or page selected IDs using a stable cursor. `array_chunk()` of an
already-loaded dataset does not bound memory. Deleting while using offset paging
can skip rows; record selection and resume semantics. WP APIs may trigger hooks,
revisions and asynchronous work: include those in the operation's design.

Progress bars use `WP_CLI\Utils\make_progress_bar()` with `tick()` / `finish()`;
keep them out of machine payloads. Measure memory/query logging before clearing
caches. `$wpdb->queries` grows when query logging is enabled, not unconditionally.
Legacy `WP_CLI\Utils\wp_clear_object_cache()` is marked deprecated since 1.5.0;
its presence in 2.12.0 is not a recommendation for new code. Feature-check core
`wp_cache_flush_runtime()` and backend runtime-flush support when needed. Clearing
runtime state is not flushing every persistent backend. Never schedule broad
`wp cache flush` calls just because a command runs for more than 30 seconds.

Locks, checkpoints, idempotency and cache/index repair require explicit design
and failure tests; a CLI command or database transaction alone proves none of them.

## References

- [Worked command and bounded-import design](reference.md)
- [Native capabilities, metadata scope and bulk-operation safety](references/native-commands-and-bulk-data.md)
- [Verification procedure and tested behavior](references/verification.md)
- [Command registration](https://make.wordpress.org/cli/handbook/references/internal-api/wp-cli-add-command/)
- [Commands cookbook](https://make.wordpress.org/cli/handbook/guides/commands-cookbook/)
- [Internal APIs](https://make.wordpress.org/cli/handbook/references/internal-api/)
- [runcommand](https://make.wordpress.org/cli/handbook/references/internal-api/wp-cli-runcommand/)
- [WP-CLI 2.12.0 runtime utilities](https://github.com/wp-cli/wp-cli/blob/v2.12.0/php/utils.php)
- [Legacy WP utility deprecations](https://github.com/wp-cli/wp-cli/blob/v2.12.0/php/utils-wp.php#L360-L401)
