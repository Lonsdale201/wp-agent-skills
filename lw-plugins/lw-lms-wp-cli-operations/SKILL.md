---
name: lw-lms-wp-cli-operations
description: Operates LW LMS 2.0.0 with WP-CLI. Use for `wp lw-lms course`, `lesson`, `enroll`, `revoke`, `force-complete`, `drip status|set-start`, quiz import/export/delete, course or lesson drip settings, reference resolution, automation output formats, and understanding enrollment, completion, quiz, or lock side effects. Excludes the LearnDash migration workflow.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW LMS WP-CLI operations

Use the registered commands for repeatable administration. Use `lw-lms-learndash-migration` for `migrate-learndash`.

## Reference resolution

- Course and lesson: numeric post ID or slug.
- User: numeric ID, login, or email.
- Resolution errors stop the command through `WP_CLI::error()`.

## Command catalog

| Command | Purpose |
|---|---|
| `course create` | Create course; access type defaults to the configured `default_access_type` |
| `course list` | List by access type/status and machine format |
| `course delete` | Trash or force-delete the course post |
| `course set-section` | Create/update a section |
| `course set-drip` | Set free/linear progression and course enrollment delay |
| `lesson create` | Create and assign a lesson |
| `lesson list` | List lessons for a course/section |
| `lesson assign` | Reassign course, section, and order |
| `lesson set-quiz` | Replace quiz from JSON |
| `lesson get-quiz` | Output the stored quiz, including correct answers |
| `lesson delete-quiz` | Delete current quiz; preserve attempts |
| `lesson set-drip` | Set none/enrollment/previous rule |
| `enroll` | Durable access grant through the repository |
| `revoke` | Revoke every active stored access row for user/course |
| `force-complete` | Complete all published course lessons |
| `drip status` | Diagnose one learner's lock map |
| `drip set-start` | Set, reset-to-now, or clear one course clock |

## Course and lesson examples

```bash
wp lw-lms course create --title="Course" --status=draft --porcelain
wp lw-lms course list --status=any --format=json
wp lw-lms course set-section 42 --id=intro --title="Introduction" --order=0
wp lw-lms lesson create --title="Welcome" --course=42 --section=intro --order=1 --porcelain
wp lw-lms lesson assign welcome --course=42 --section=intro --order=2
wp lw-lms lesson list --course=42 --format=json
wp lw-lms course delete 42 --force
```

`course delete` removes the course post only. It does not cascade-delete lessons, access, progress, completion snapshots, or attempts. Plan cleanup deliberately.

Section IDs passed through CLI are normalized with `sanitize_key()`. Use lowercase identifiers consistently; an uppercase ID created through another interface will not compare equal after CLI normalization.

## Enrollment and completion

```bash
wp lw-lms enroll alice 42 --source=manual --expires="2026-12-31 23:59:59"
wp lw-lms revoke alice 42
wp lw-lms force-complete alice 42
```

`enroll` calls `AccessRepository::grant()` and fires grant hooks. The expiry is stored in the access table's UTC contract. Repeating a null-source-ID grant is idempotent within the same source in 2.0.0.

`revoke` is broad in 2.0.0: it revokes all active stored rows for that user/course and fires `lw_lms_after_revoke` for each row. It cannot remove live subscription, membership, or legacy-purchase entitlement. Use PHP `revoke_by_source()` when only one integration-owned row should end.

`force-complete` writes progress and completion hooks. It does not grant access and intentionally overrides learner pacing and quiz gates.

## Quiz commands

```bash
wp lw-lms lesson set-quiz 99 --file=quiz.json
cat quiz.json | wp lw-lms lesson set-quiz intro --file=-
wp lw-lms lesson get-quiz 99 --format=json
wp lw-lms lesson delete-quiz 99 --yes
```

The JSON normalizer is strict. `set-quiz` replaces the whole quiz. `get-quiz` exposes correct answers; do not send its output to learner logs. Deletion preserves attempt history.

## Drip commands

```bash
wp lw-lms course set-drip 42 --progression=linear --delay=2 --unit=day
wp lw-lms lesson set-drip 101 --mode=previous --delay=1 --unit=week
wp lw-lms drip status alice 42 --format=json
wp lw-lms drip set-start alice 42 --date="2026-09-01 09:00:00"
wp lw-lms drip set-start alice 42 --now
wp lw-lms drip set-start alice 42 --clear
```

Supported units are `hour`, `day`, `week`, and `month`; delays are `0..999`. A lesson rule on a free-progression course stays dormant. Read `lw-lms-drip-progression` before changing a real learner's clock.

## Automation rules

- Use `--porcelain` for created IDs.
- Use `--format=json`, `csv`, `yaml`, `count`, or `ids` where the command supports it; do not parse human tables.
- Capture IDs before destructive cleanup.
- Build a dry-run around your orchestration because operational commands have no common `--dry-run` flag.
- Do not run `get-quiz` in a public CI log.
- Verify frontend state after writes; command success proves persistence, not the complete learner experience.

## Cross-references

- Use `lw-lms-drip-progression` for schedule semantics and known 2.0.0 timezone behavior.
- Use `lw-lms-quiz-integration` for quiz schema and learner submissions.
- Use `lw-lms-backend-extend` for repository/hook semantics.
- Use `lw-lms-learndash-migration` for `wp lw-lms migrate-learndash`.
- Use `lw-lms-rest-frontend` to verify learner responses.

## References

- Official repository: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `includes/Plugin.php`
  - `includes/CLI/CliResolver.php`
  - `includes/CLI/*Command.php`
  - `includes/CLI/DripArgs.php`
  - `includes/Access/AccessRepository.php`
  - `includes/Progress/ProgressRepository.php`
