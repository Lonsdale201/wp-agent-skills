---
name: lw-lms-backend-extend
description: Extends LW LMS 2.0.0 from PHP without bypassing its access, progress, quiz, drip, download, privacy, or WooCommerce contracts. Use when code calls `AccessChecker`, `AccessRepository`, `ProgressRepository`, works with `lw_lms_after_grant`, `lw_lms_after_revoke`, `lw_lms_pre_grant`, `lw_lms_has_course_access`, `lw_lms_rest_*`, protected attachments, staff access, manual enrollment, or `_lw_lms_*` data.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW LMS backend extension contract

Extend LW LMS through its repositories and hooks. Keep learner REST, quizzes, drip scheduling, and bulk CLI work in the sibling skills named below.

LW LMS remains a headless plugin under active development. Pin the tested version and review its changelog before deployment.

## Version 2.0 changes that affect extensions

- `AccessChecker::has_course_access()` has a third `$record_enrollment` argument. Course listings pass `false`, so merely listing free courses no longer creates enrollment rows.
- `AccessRepository::grant()` now deduplicates null-source-ID grants per source. `revoke()` revokes every active stored row for the user/course; use `revoke_by_source()` when ownership matters.
- WooCommerce grants on `processing` and `completed`; it revokes on fully refunded, `cancelled`, or `failed` access and handles partial line refunds.
- `manage_lms` grants access to overview, enrollments, and quiz results. Settings still require `manage_options`.
- The old `lw_lms_settings_tabs` filter and `SettingsPage::get_settings_group()` extension contract were removed by the React admin. Add a separate companion settings screen.
- Download URLs are signed, expire after one hour by default, and are re-authorized when used.
- Privacy export/erase and deleted-user cleanup cover enrollments, progress, completion snapshots, quiz attempts, and drip clock user meta.

## Hook contract

### Actions

| Hook | Accepted args | Meaning |
|---|---:|---|
| `lw_lms_after_grant` | 5 | `$user_id, $course_id, $source, $source_id, $expires_at`; successful insert or update |
| `lw_lms_after_revoke` | 3 | `$user_id, $course_id, $source`; once for each row revoked |
| `lw_lms_lesson_completed` | 2 | `$lesson_id, $user_id`; transition to completed |
| `lw_lms_course_completed` | 2 | `$course_id, $user_id`; first completion snapshot |
| `lw_lms_attachment_downloaded` | 2 | `$attachment_id, $user_id`; authorized download |
| `lw_lms_quiz_submitted` | 4 | `$lesson_id, $user_id, $percentage, $passed`; every stored attempt |
| `lw_lms_quiz_passed` | 3 | `$lesson_id, $user_id, $percentage`; every passing attempt |

### Filters

| Hook | Accepted args | Rule |
|---|---:|---|
| `lw_lms_pre_grant` | 6 | Return false to abort the write before hooks |
| `lw_lms_has_course_access` | 3 | Final logged-in paid-course decision; open/free/anonymous paths can return earlier |
| `lw_lms_has_lesson_access` | 3 | Lesson decision; preview short-circuit can return earlier |
| `lw_lms_admin_access_capability` | 1 | Capability used by optional Staff Access; default `manage_lms` |
| `lw_lms_rest_course_list_item` | 3 | Add new top-level list-item fields only |
| `lw_lms_rest_course` | 4 | Add new top-level course fields only |
| `lw_lms_rest_lesson` | 3 | Add new top-level lesson fields only |
| `lw_lms_lesson_locks` | 3 | Filter the lock map keyed by lesson ID |
| `lw_lms_download_link_ttl` | 1 | Signed-download lifetime in seconds; default 3600 |
| `lw_lms_video_html` | 2 | Filter ready-to-render video HTML and lesson ID |
| `lw_lms_quiz_attempt_cooldown` | 3 | Seconds between attempts; default 15, zero disables |
| `lw_lms_quiz_daily_attempt_limit` | 3 | Attempts per rolling 24 hours; default 20, zero disables |
| `lw_lms_privacy_erase_active_enrollments` | 2 | Whether erasure may remove active enrollment rows |

REST payload filters cannot override or remove core keys. `PayloadExtension::merge()` keeps the original value and accepts only added top-level keys.

## Access decisions

Call `AccessChecker` for the complete entitlement decision:

```php
use LightweightPlugins\LMS\Access\AccessChecker;

$can_open = AccessChecker::has_course_access( $course_id, $user_id );

// Read-only catalog calculation: do not lazily enroll a free-course viewer.
$catalog_access = AccessChecker::has_course_access( $course_id, $user_id, false );
```

Use `AccessRepository` for durable grants:

```php
use LightweightPlugins\LMS\Access\AccessRepository;

AccessRepository::grant(
    $user_id,
    $course_id,
    'my_membership',
    $external_membership_id,
    $expires_at_utc
);

AccessRepository::revoke_by_source(
    $user_id,
    $course_id,
    'my_membership',
    $external_membership_id
);
```

Use a stable non-null source ID for independently owned external grants. The table unique key remains `(user_id, course_id, source_id)` and does not include `source`.

Staff Access is a runtime bypass controlled by `auto_enroll_admins`; it does not create rows. Live subscription, membership, and legacy purchase checks also create no rows and fire no grant/revoke hooks.

## Progress writes

Write through `ProgressRepository`, never through SQL:

```php
use LightweightPlugins\LMS\Progress\ProgressRepository;

ProgressRepository::upsert( $user_id, $course_id, $lesson_id, 'completed' );
ProgressRepository::mark_course_completed( $user_id, $course_id );
```

Validate that the lesson belongs to the course before programmatic writes. The REST and Abilities paths do this; the low-level repository trusts its caller. A completion write fires lesson completion, clears the request-local drip lock cache, and may create the one-time course snapshot.

`ProgressRepository::delete()` does not remove the completion snapshot. Decide explicitly whether an administrative reset should also call `ProgressSnapshotRepository::delete()`.

## Protected downloads

Do not build `/download/{id}` URLs manually. Use the REST payload's signed `download_url`. At download time LW LMS checks signature, expiry, current user, current course/lesson ownership, post visibility, and current access. Revoking access invalidates an otherwise unexpired link.

If changing the TTL, keep it bounded:

```php
add_filter( 'lw_lms_download_link_ttl', static fn ( int $seconds ): int => 15 * MINUTE_IN_SECONDS );
```

## Critical rules

- Register the exact accepted-argument counts shown above.
- Preserve an existing paid grant in additive access filters: `return $has_access || my_check();`.
- Keep access filters fast, deterministic, and side-effect-free; one response can ask more than once.
- Use `revoke_by_source()` for one integration. Broad `revoke()` now revokes all active stored rows.
- Store expiry timestamps in UTC. `granted_at` and progress timestamps are site-local in the current schema.
- Add payload fields; do not attempt to replace `access`, `quiz`, `sections`, `progress`, or other core keys.
- Return a valid lock map from `lw_lms_lesson_locks`; a non-array becomes an empty map and opens every lesson.
- Do not reintroduce the removed settings-tab API.

## Cross-references

- Use `lw-lms-rest-frontend` for learner-facing REST consumers.
- Use `lw-lms-quiz-integration` for quiz schema, scoring, throttling, and result administration.
- Use `lw-lms-drip-progression` for course clocks, linear sequence, schedules, and lock errors.
- Use `lw-lms-wp-cli-operations` for operational commands.
- Use `lw-lms-abilities` for Site Manager and WordPress Abilities API calls.
- Use `lw-lms-learndash-migration` for the one-time LearnDash importer.

## References

- Official repository: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `includes/Access/AccessChecker.php`
  - `includes/Access/AccessRepository.php`
  - `includes/Access/AccessGranter.php`
  - `includes/Progress/ProgressRepository.php`
  - `includes/Api/DownloadLink.php`
  - `includes/Api/DownloadAccess.php`
  - `includes/Api/Transformers/PayloadExtension.php`
  - `includes/Privacy/PrivacyHooks.php`
  - `includes/Admin/SettingsPage.php`
