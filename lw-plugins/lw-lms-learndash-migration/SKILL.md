---
name: lw-lms-learndash-migration
description: Plan, run, or review the LW LMS WP-CLI LearnDash migration command `wp lw-lms migrate-learndash` in lw-lms v1.6.0. Use when migrating `sfwd-courses` / `sfwd-lessons`, checking `--dry-run` / `--verbose`, verifying `_lw_lms_migrated_to` mappings, course sections, lesson order, WooCommerce product links, LearnDash video extraction, or safe reruns after partial migration.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-07-20"
---

# LW LMS LearnDash Migration

Use this for the one-time WP-CLI migration from LearnDash post types into LW LMS. The command copies course and lesson posts, maps key metadata, then builds a single LW LMS section per migrated course using LearnDash lesson order.

Verified against local lw-lms **v1.6.0**. Neither the v1.4.0 operational CLI release nor the v1.6.0 access-filter/source-revocation work changed the `migrate-learndash` command flow. Use `lw-lms-wp-cli-operations` for the non-migration commands.

## When to use this skill

Trigger this skill when ANY of the following is true:

- The user asks to migrate from LearnDash to LW LMS.
- Code or logs mention `wp lw-lms migrate-learndash`, `sfwd-courses`, `sfwd-lessons`, `ld_course_steps`, `_sfwd-courses`, or `_sfwd-lessons`.
- You need a dry-run checklist, rerun strategy, or post-migration verification.
- A diff touches `includes/CLI/Migration/`.

## Command

```bash
wp lw-lms migrate-learndash --dry-run --verbose
wp lw-lms migrate-learndash --verbose
```

The command is registered in `Plugin::register_cli_commands()` as `lw-lms migrate-learndash`. It runs only under WP-CLI.

## Workflow

1. Confirm both source and target plugins are present enough for data access: LearnDash data exists in `sfwd-courses`; LW LMS classes are active.
2. Take a database backup. This command creates posts and writes mappings; it does not implement rollback.
3. Run `--dry-run --verbose`. Review course count, lesson count, and skipped items.
4. Run the real migration once.
5. Verify mappings and frontend behavior before deleting or disabling LearnDash.

## What gets migrated

| Source | Target | Notes |
|---|---|---|
| `sfwd-courses` posts | `course` posts | title, content, excerpt, status, slug, menu order, thumbnail |
| LearnDash course price type | `_lw_lms_access_type` | mapped by `LearnDashData::map_access_type()` |
| Woo product links | `_lw_lms_product_ids` | reads direct `_related_course`, `_membership_product_id`, and postmeta reverse lookup |
| `kurzus-hossza` | `_lw_lms_duration` | local/custom duration meta supported by current migrator |
| `sfwd-lessons` posts | `lesson` posts | title, content, excerpt, status, slug, menu order, thumbnail |
| lesson `course_id` | `_lw_lms_lesson_course_id` | resolved through `_lw_lms_migrated_to` course mapping |
| LearnDash video URL, Elementor video, content embeds | `_lw_lms_video` | extracted by `VideoExtractor` |
| `ld_course_steps` lesson order | `_lw_lms_course_sections`, `_lw_lms_lesson_section_id`, `_lw_lms_lesson_order` | one generated section per migrated course |

Each migrated LearnDash post gets `_lw_lms_migrated_to = <new_id>`.

## Rerun behavior

The command is intentionally rerunnable, but not a full synchronization tool:

- Courses are skipped if an LW LMS course with the same title already exists; the mapping is refreshed.
- Lessons are skipped if a lesson with the same title already exists for the mapped LW LMS course; the mapping is refreshed.
- SectionBuilder rebuilds a single generated section from `ld_course_steps`.
- It does not delete target posts, remove stale mappings, migrate quizzes, certificates, groups, assignments, user progress, enrollments, or LearnDash-specific drip rules.

## Verification checklist

- Count migrated `course` and `lesson` posts against source `sfwd-courses` and `sfwd-lessons`.
- Spot-check `_lw_lms_migrated_to` on several source posts.
- Open several courses in wp-admin and verify access type, product IDs, duration, sections, lesson order, and thumbnails.
- Open several lessons and verify parent course, video data, and content.
- Test one migrated paid course through the LW LMS access checker and frontend.
- Check that all lessons referenced by `ld_course_steps` have mappings; missing mappings usually mean a lesson source post was missing or skipped unexpectedly.

## Critical rules

- Always dry-run first. The real command writes posts and meta immediately.
- Do not expect a rollback. Restore from backup if the target state is wrong.
- Do not run this as a recurring sync. It is migration tooling, not an importer.
- Do not assume LearnDash progress or enrollments are migrated; current source migrates course/lesson structure and selected metadata only.
- Preserve LearnDash until verification is complete; target posts keep only `_lw_lms_migrated_to` reverse references on the source.

## Cross-references

- Run `lw-lms-backend-extend` after migration when adding enrollment/progress automation to the new LMS.
- Run `lw-lms-rest-frontend` to validate learner-facing output against the core REST API.
- Run `lw-lms-wp-cli-operations` for the operational course, lesson, enrollment, revocation, and force-completion commands.
- Run `wp-security-audit` if modifying the migration command.

## What this skill does NOT cover

- LearnDash quiz, certificate, group, assignment, or user-progress migration.
- WooCommerce order/subscription history normalization.
- Frontend rendering or REST API consumption.

## References

- Command entry: `includes/CLI/MigrateLearnDashCommand.php`.
- Course migration: `includes/CLI/Migration/CourseMigrator.php`.
- Lesson migration: `includes/CLI/Migration/LessonMigrator.php`.
- Ordering/sections: `includes/CLI/Migration/SectionBuilder.php`.
- Source data helpers and mappings: `includes/CLI/Migration/LearnDashData.php`.
- Video extraction: `includes/CLI/Migration/VideoExtractor.php`.
- Official documentation: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `wp-content/plugins/lw-lms/includes/Plugin.php`
  - `wp-content/plugins/lw-lms/includes/CLI/Migration/PostCreator.php`
  - `wp-content/plugins/lw-lms/includes/CLI/Migration/MigrationLogger.php`
