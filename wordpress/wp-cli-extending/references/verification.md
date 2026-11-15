# Verify the installed CLI and the custom operation

Do not call a source review, help screen or successful process exit an end-to-end
pass. Record the exact version, command, exit status and observed stored state.

## Repeatable verification procedure

1. Record `wp --info`, `wp core version`, PHP/database versions, packages, target
   site/blog and object-cache backend. Check `wp help <command>` for supported flags.
2. Use an isolated disposable installation and synthetic records. Never run
   destructive smoke tests against customer data. Scope cleanup to the fixture.
3. Exercise help, aliases, lazy registration and web requests without `WP_CLI`.
   Test malformed synopsis, unknown flags, global flag collisions and repeated
   named options. A passing help render does not prove callback validation.
4. Test absent/low-privilege/authorized identities under the chosen trust policy.
   Check bool flags and string values, invalid/overflow/range inputs, unknown keys,
   JSON errors and unsupported output formats before any write.
5. Snapshot affected records and lifecycle counters. Preview must leave storage
   and external-effect counters unchanged; compare its plan with actual apply.
6. Capture stdout and stderr separately. Parse JSON payloads, including empty
   results and `--quiet`; check nonzero exits and partial-failure counts.
7. Seed duplicate metadata values, sibling keys, publish/draft/trash/auto-draft
   records and revisions. Test exact selection and preservation of exclusions.
8. Test serialized arrays/keys/objects and malformed data according to the promised
   policy. Verify cache and plugin index freshness by reading through the app.
9. If lock/checkpoint/rollback guarantees are offered, kill the process around
   writes/checkpoints, restart it and run concurrent clients from every writer
   surface. Include external effects in duplicate detection.
10. For high volume, measure peak memory, batch/query counts and timing with a
    representative dataset. An elapsed-time threshold is not a cache policy.

## Measured baseline, 2026-11-15

The disposable Docker lab used WP-CLI **2.12.0**, WordPress **7.1.3**, PHP
**8.3.31**, MariaDB **10.11**, single-site and default in-process object cache.
These are observed behaviors on that stack, not a compatibility matrix:

| Probe | Observation |
|---|---|
| Class-string registration | Help did not construct the command; invocation did. |
| Boolean options | Bare flag was `true`, negated flag `false`, assigned `no` remained a string. |
| Repeated named option | Only the last value remained, even with an ellipsis in its declaration. |
| Global flags | `--user` selected WP identity and was consumed; `--json` became `--format=json`. |
| Malformed PHPDoc | Adjacent undescribed option was rejected; an entirely absent parsed synopsis accepted undeclared input. |
| Native option update | Loaded option sanitizer and `updated_option` listener executed with the default WP user ID 0. |
| Cache behavior | Raw SQL left primed metadata stale; explicit invalidation and API updates produced fresh reads. |
| Query log | With `SAVEQUERIES` false, the tested query did not accumulate in `$wpdb->queries`. |
| Native metadata | Explicit meta/status selection worked; nonempty-value deletion preserved other values; `--all` deleted every key on one object. |
| Empty delete value | An empty string removed all values for the key, not only its empty row. |
| Native option patch | Loaded sanitizer and `updated_option` listener ran; a sibling field was preserved. |
| Native preview | Unsupported delete `--dry-run` was rejected; search-replace dry-run preserved data and its log contained before/after context. |
| Native replacement | Unsupported `--where`/JSON format rejected; column-wide apply changed sibling meta keys; serialized values changed while array keys remained. |
| Internal invocation | Captured stdout/stderr/return_code were available; failed inner command returned nonzero without exiting when requested. |

Persistent Redis/Memcached behavior, multisite isolation, large-volume performance
and an arbitrary plugin's concurrency/index implementation were not established
by these probes. Test them separately when the delivered operation depends on them.
