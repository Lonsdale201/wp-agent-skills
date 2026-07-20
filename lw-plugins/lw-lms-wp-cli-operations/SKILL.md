---
name: lw-lms-wp-cli-operations
description: Use the LW LMS v1.6.0 operational WP-CLI commands added in v1.4.0. Covers `wp lw-lms course create|list|delete|set-section`, `wp lw-lms lesson create|list|assign`, `wp lw-lms enroll`, `wp lw-lms revoke`, `wp lw-lms force-complete`, argument resolution by ID/slug/login/email, enrollment/progress hook side effects, source-scoped revocation limitations, and common CLI footguns.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-07-20"
---

# LW LMS: WP-CLI operations

Use this for the day-to-day LW LMS WP-CLI commands introduced in v1.4.0 and verified against local lw-lms **v1.6.0**. v1.6.0 did not add a CLI command or option. This is not the LearnDash migration command; use `lw-lms-learndash-migration` for `wp lw-lms migrate-learndash`.

## When to use this skill

Trigger this skill when any of the following is true:

- A task mentions `wp lw-lms course`, `wp lw-lms lesson`, `wp lw-lms enroll`, `wp lw-lms revoke`, or `wp lw-lms force-complete`.
- You need to create/list/delete courses or lessons from CLI.
- You need to enroll/revoke a user or force-complete a course from CLI.
- A diff touches files under `includes/CLI/*Command.php` except `MigrateLearnDashCommand.php` and `includes/CLI/Migration/`.

## Command catalog

Registered in `Plugin::register_cli_commands()` only when `WP_CLI` is defined and truthy.

| Command | Purpose |
|---|---|
| `wp lw-lms course create` | Create a `course` post and set selected course meta |
| `wp lw-lms course list` | List courses, optionally filtered by access type/status |
| `wp lw-lms course delete` | Trash or permanently delete a course |
| `wp lw-lms course set-section` | Create or update one course section in `_lw_lms_course_sections` |
| `wp lw-lms lesson create` | Create a `lesson` post and assign it to a course |
| `wp lw-lms lesson list` | List lessons for one course, optionally filtered by section |
| `wp lw-lms lesson assign` | Assign/reassign an existing lesson to a course/section/order |
| `wp lw-lms enroll` | Grant stored access through `AccessRepository::grant()` |
| `wp lw-lms revoke` | Revoke stored access through `AccessRepository::revoke()` |
| `wp lw-lms force-complete` | Mark every published lesson in a course completed through `ProgressRepository::mark_course_completed()` |

## Reference resolution

`CliResolver` resolves:

- course references by numeric post ID or course slug;
- lesson references by numeric post ID or lesson slug;
- user references by numeric user ID, login, or email.

Resolver failures call `WP_CLI::error()` and halt the command. Callers can treat returned IDs as valid.

## Course commands

### Create

```bash
wp lw-lms course create --title="My Course" --access-type=paid --duration="8h"
wp lw-lms course create --title="Draft Course" --status=draft --porcelain
```

Options:

| Option | Notes |
|---|---|
| `--title=<title>` | Required |
| `--access-type=<open|free|paid>` | Default `free` |
| `--duration=<duration>` | Stored as `_lw_lms_duration` |
| `--status=<status>` | Default `publish` |
| `--excerpt=<excerpt>` | Saved to `post_excerpt` |
| `--content=<content>` | Saved to `post_content` |
| `--porcelain` | Outputs only the new course ID |

This command does not configure WooCommerce products, subscriptions, membership plans, preview lessons, or attachments.

### List

```bash
wp lw-lms course list
wp lw-lms course list --access-type=paid --format=json
wp lw-lms course list --format=ids
```

Options:

- `--access-type=<type>` filters by `_lw_lms_access_type`;
- `--status=<status>` defaults to `any`;
- `--per-page=<n>` defaults to `100`;
- `--format=<table|csv|json|yaml|count|ids>` defaults to `table`.

### Delete

```bash
wp lw-lms course delete 42
wp lw-lms course delete my-course --force
```

Without `--force`, WordPress trash behavior is used. The command does not clean orphaned lesson meta, access rows, progress rows, or completion snapshots. If you need full cleanup, build that explicitly.

### Set section

```bash
wp lw-lms course set-section 42 --id=sec_intro --title="Intro" --order=0
wp lw-lms course set-section my-course --id=sec_extra --description="Bonus material"
```

Re-running with the same `--id` updates the existing section. This command only mutates the course's `_lw_lms_course_sections` array. It does not move lessons into that section; use `lesson assign` for lesson assignment.

## Lesson commands

### Create

```bash
wp lw-lms lesson create --title="Intro" --course=42 --section=sec_intro --order=1
wp lw-lms lesson create --title="Intro" --course=my-course --content="<p>Body</p>" --porcelain
```

Options:

| Option | Notes |
|---|---|
| `--title=<title>` | Required |
| `--course=<course>` | Required; course ID or slug |
| `--section=<section-id>` | Optional; sanitized with `sanitize_key()` |
| `--order=<order>` | Default `0` |
| `--duration=<duration>` | Stored as `_lw_lms_duration` |
| `--status=<status>` | Default `publish` |
| `--content=<content>` | Saved to `post_content` |
| `--porcelain` | Outputs only the new lesson ID |

The command does not create the section. Create/update the section first with `course set-section` if the section should exist in the course outline.

### List

```bash
wp lw-lms lesson list --course=42
wp lw-lms lesson list --course=my-course --section=sec_intro --format=json
wp lw-lms lesson list --course=42 --format=ids
```

`--course` is required. Rows are ordered by `_lw_lms_lesson_order`.

### Assign

```bash
wp lw-lms lesson assign 99 --course=42 --section=sec_intro --order=2
wp lw-lms lesson assign intro-lesson --course=my-course --section=""
```

This sets `_lw_lms_lesson_course_id`, optionally `_lw_lms_lesson_section_id`, and optionally `_lw_lms_lesson_order`. Passing an empty string to `--section` clears the section.

## Enrollment commands

### Enroll

```bash
wp lw-lms enroll alice 42
wp lw-lms enroll alice@example.com my-course --expires-at="2027-01-01"
wp lw-lms enroll 7 my-course --source=my_integration
```

This command calls:

```php
AccessRepository::grant( $user_id, $course_id, $source, null, $expires_at );
```

Side effects:

- `lw_lms_pre_grant` can abort the command; the CLI reports an error if the grant returns false.
- `lw_lms_after_grant` fires on success with 5 args.
- Re-running can update an existing row's `granted_at` and `expires_at`.

Footgun: the command always passes `source_id = null`. The access table unique key is `(user_id, course_id, source_id)`, so changing `--source` alone does not guarantee a separate row. If your integration needs stable distinct rows, use PHP and pass a meaningful `source_id`.

`--expires-at` is parsed through `strtotime()` and stored as `Y-m-d H:i:s` using `gmdate()`. Prefer explicit full datetimes in automation.

### Revoke

```bash
wp lw-lms revoke alice 42
```

This calls `AccessRepository::revoke( $user_id, $course_id )`. It flips the first matching active row to `status='revoked'` and fires `lw_lms_after_revoke` only when a row was changed. If there is no active row, the command warns and exits without an error.

v1.6.0 added `AccessRepository::revoke_by_source()` to the PHP API, but this CLI command still has no `--source` or `--source-id` option and still calls the broad `revoke()`. For an integration-owned grant, use PHP and pass both the expected source and its stable external source ID:

```php
AccessRepository::revoke_by_source(
    $user_id,
    $course_id,
    'my_integration',
    $external_access_id
);
```

Omitting the fourth argument revokes all active rows for that source on the user/course, not only rows whose `source_id` is null.

Runtime subscription, membership, or legacy purchase access has no stored row to revoke. Revoke the upstream WooCommerce entitlement or change course meta if access comes from those live checks.

## Force-complete

```bash
wp lw-lms force-complete alice 42
wp lw-lms force-complete alice@example.com my-course
```

This calls `ProgressRepository::mark_course_completed( $user_id, $course_id )`.

Side effects:

- published lessons assigned to the course are upserted to `completed`;
- `lw_lms_lesson_completed` fires for lessons that transition to completed;
- `CompletionTracker::maybe_record()` can write the completion snapshot and fire `lw_lms_course_completed`;
- if no published lessons are found, the command warns.

This command does not enroll the user. It only writes progress.

## Critical rules

- These commands are registered only in WP-CLI.
- This skill does not cover `wp lw-lms migrate-learndash`; use `lw-lms-learndash-migration`.
- `course set-section` and `lesson assign` are separate operations. A section existing on the course does not automatically move lessons.
- `enroll` writes an access row and fires access hooks; subscription/membership live access does not.
- `revoke` changes only the first stored active row regardless of source; it does not expose the v1.6.0 source-scoped PHP API.
- Neither CLI nor PHP stored-row revocation removes live subscription, membership, or legacy-purchase entitlement.
- `force-complete` writes progress, not access.
- There is no dry-run flag for these operational commands.
- Use `--format=json` or `--format=ids` for scripts instead of parsing table output.

## Common mistakes

```bash
# WRONG: assumes set-section moves lessons.
wp lw-lms course set-section 42 --id=sec_intro --title="Intro"

# RIGHT.
wp lw-lms course set-section 42 --id=sec_intro --title="Intro"
wp lw-lms lesson assign 99 --course=42 --section=sec_intro --order=1
```

```bash
# WRONG: assumes source creates a distinct row.
wp lw-lms enroll alice 42 --source=free
wp lw-lms enroll alice 42 --source=manual

# RIGHT for distinct external rows: call AccessRepository::grant() in PHP with
# a non-null source_id from the external system.
```

```bash
# WRONG: assumes force-complete grants course access.
wp lw-lms force-complete alice 42

# RIGHT when both are needed.
wp lw-lms enroll alice 42
wp lw-lms force-complete alice 42
```

## Cross-references

- Use `lw-lms-backend-extend` for hook contracts and repository semantics.
- Use `lw-lms-learndash-migration` for `wp lw-lms migrate-learndash`.
- Use `lw-lms-rest-frontend` to validate how CLI changes appear in `/wp-json/lms/v1` responses.
- Use `lw-lms-abilities` for admin/agent Abilities API calls.

## References

- Command registration: `includes/Plugin.php`.
- Reference resolution: `includes/CLI/CliResolver.php`.
- Course commands: `CourseCreateCommand.php`, `CourseListCommand.php`, `CourseDeleteCommand.php`, `CourseSetSectionCommand.php`.
- Lesson commands: `LessonCreateCommand.php`, `LessonListCommand.php`, `LessonAssignCommand.php`.
- Access commands: `EnrollCommand.php`, `RevokeCommand.php`.
- Progress command: `ForceCompleteCommand.php`.
- Access hook side effects: `includes/Access/AccessRepository.php`.
- Progress hook side effects: `includes/Progress/ProgressRepository.php`.
- Official documentation: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `wp-content/plugins/lw-lms/CHANGELOG.md`
