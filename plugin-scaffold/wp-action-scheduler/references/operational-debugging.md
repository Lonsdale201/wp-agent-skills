# Action Scheduler operational debugging

Use this reference when jobs are late, duplicated, failed, stuck, or invisible.
Examples target Action Scheduler 3.9.3.

## First checks

1. Confirm the callback is registered on every request.
2. Confirm the scheduled action hook, args, and group match the callback and
   queries.
3. Check the admin UI: Tools -> Scheduled Actions.
4. Use WP-CLI to list the queue.

```bash
wp action-scheduler action list --group=myplugin --format=table
wp action-scheduler action list --group=myplugin --status=failed
wp action-scheduler action list --hook=myplugin/process_order --status=pending
```

If actions are pending but not running, inspect runner conditions. Action
Scheduler normally runs via `action_scheduler_run_queue` every minute through
WP-Cron and also dispatches async admin-context loopback requests.

## Run a controlled batch

```bash
wp action-scheduler run --group=myplugin --batch-size=25 --batches=1
```

Use hook filtering when only one job type should run:

```bash
wp action-scheduler run --hooks=myplugin/process_order --batch-size=10 --batches=1
```

Use `--force` only when you understand why concurrent batch limits were hit:

```bash
wp action-scheduler run --group=myplugin --batch-size=25 --batches=1 --force
```

## Inspect one action

```bash
wp action-scheduler action get 123 --format=json
wp action-scheduler action logs 123
wp action-scheduler action run 123
```

If the log says no callbacks are registered, the plugin scheduled an action but
does not register `add_action( $hook, ... )` in the runner context.

## Common statuses

- `pending`: waiting to run or due but not claimed yet.
- `in-progress`: claimed/running.
- `complete`: callback finished without throwing.
- `failed`: callback threw or validation/fatal monitoring marked failure.
- `canceled`: canceled before execution.

## Duplicate jobs

Symptoms:

- Multiple pending rows with same hook/group.
- Same external side effect happens more than once.

Likely causes:

- No `$unique = true` on modern AS for a global hook+group singleton.
- Guard used wrong args or wrong group.
- Activation scheduled repeatedly without a guard.
- Callback re-enqueues itself without a cursor/state gate.
- Manual rerun from admin or WP-CLI.

Debug:

```bash
wp action-scheduler action list --hook=myplugin/process_order --group=myplugin --status=pending
```

Fix:

- Add `$unique = true` only for jobs that must have at most one pending/running
  copy per hook+group.
- Use `as_has_scheduled_action( $hook, $args, $group )` before scheduling on
  per-entity jobs where args distinguish the entity.
- Add durable callback idempotency (`_processed` meta, custom table unique key,
  status transition check, or external idempotency key).

## Failed jobs

Failed actions are useful; do not hide them by catching every exception and
returning success.

Use this callback shape:

```php
try {
    myplugin_do_remote_work( $entity_id );
} catch ( MyPlugin_Permanent_Skip $e ) {
    return;
} catch ( Throwable $e ) {
    throw $e;
}
```

Return only when the action is genuinely complete or permanently unnecessary.
Throw when the operator should see and investigate the failure.

## Args are too long

The 3.9.3 DB store can store larger encoded args in `extended_args`, but it
still validates encoded args against an 8000-character limit. Older stores can
be stricter. If you see an error about `ActionScheduler_Action::$args too long`,
stop passing payloads. Store payloads in a custom table, option, transient, or
external API, then pass only an ID/cursor.

Bad:

```php
as_enqueue_async_action( 'myplugin/import', $full_payload, 'myplugin' );
```

Good:

```php
$batch_id = myplugin_store_import_payload( $payload );
as_enqueue_async_action( 'myplugin/import', array( 'batch_id' => $batch_id ), 'myplugin' );
```

## Schema/table problems

Action Scheduler 3.9.3 DB store table base names:

- `actionscheduler_actions`
- `actionscheduler_claims`
- `actionscheduler_groups`
- `actionscheduler_logs`

They are prefixed by `$wpdb->prefix`, e.g. `wp_actionscheduler_actions`.

If tables are missing or mismatched:

```bash
wp action-scheduler fix-schema
wp action-scheduler system data-store
```

Do not ship plugin code that writes these tables directly. Use direct SQL only
for emergency diagnostics or one-off repair scripts with a backup.

## Cleanup

Action Scheduler has cleanup behavior, but busy sites may still need explicit
CLI maintenance during incidents.

```bash
wp action-scheduler clean --status=complete,canceled --before='31 days ago'
wp action-scheduler clean --status=failed --before='90 days ago' --batch-size=100
```

Do not automatically delete failed actions from plugin runtime code. Failed
actions are operational evidence.

## Runner tuning

Avoid tuning globals as a first response. Fix callback duration, chunking, and
idempotency first.

Relevant filters in 3.9.3:

- `action_scheduler_queue_runner_batch_size` defaults web runner batches to 25.
- `action_scheduler_queue_runner_concurrent_batches` defaults concurrent
  batches to 1.
- `action_scheduler_queue_runner_time_limit` controls queue runner time limit.
- `action_scheduler_run_schedule` controls the WP-Cron schedule for
  `action_scheduler_run_queue`.

Only add these filters in site-specific operational plugins or documented
enterprise deployments. A distributed plugin should not globally raise queue
throughput without knowing the host capacity.

## Production incident checklist

- List failed actions by group/hook.
- Inspect one failed action and logs.
- Confirm callbacks are registered in WP-CLI context.
- Run a tiny batch with `--batch-size=1 --batches=1`.
- Check whether failures are transient or permanent.
- Fix the callback, then rerun selected failed actions manually if appropriate.
- Add idempotency before rerunning side-effect jobs.
- Clean old complete/canceled rows only after the queue is healthy.
