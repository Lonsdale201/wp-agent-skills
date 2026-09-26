---
name: lw-lms-drip-progression
description: Configures and diagnoses LW LMS 2.0.0 linear progression and drip schedules. Use when a request mentions drip or drop lessons, `lesson_locked`, `locked_reason`, `available_at`, `_lw_lms_course_start_*`, `wp lw-lms course set-drip`, `lesson set-drip`, `drip status`, enrollment/previous delays, section pacing, or the `lw_lms_lesson_locks` filter.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW LMS drip and linear progression

Use the plugin's progression model and diagnostic command. Do not reproduce the schedule in frontend code.

## Model

- `free`: any accessible lesson can open in any order; stored drip rules are dormant.
- `linear`: the prior lesson must be complete, then course, section, and lesson time constraints are combined. The latest opening time wins.
- Course delay supports `enrollment` mode.
- Section and lesson rules support `none`, `enrollment`, and `previous`.
- Units are `hour`, `day`, `week`, and `month`; the integer delay is `0..999`.
- `previous` with delay zero remains an active rule: open as soon as the prior prerequisite is complete.

The course outline places sectionless lessons first, then ordered sections and their lessons. Orphan lessons that name a missing section are omitted from the drip sequence until the assignment is corrected.

## Configure from WP-CLI

```bash
wp lw-lms course set-drip 42 --progression=linear --delay=2 --unit=day
wp lw-lms lesson set-drip 101 --mode=enrollment --delay=1 --unit=week
wp lw-lms lesson set-drip 102 --mode=previous --delay=3 --unit=day
wp lw-lms lesson set-drip 103 --mode=none
```

A lesson rule saved on a `free` course stays dormant and the command warns about it. Switch the course to `linear` to enforce sequence and schedule.

Inspect one learner:

```bash
wp lw-lms drip status alice 42
wp lw-lms drip status alice 42 --format=json
```

The rows contain `position`, `lesson_id`, `title`, `section`, `rule`, `state`, `reason`, `available_at`, and `completed_at`.

Control the learner's course clock only for administrative correction or testing:

```bash
wp lw-lms drip set-start alice 42 --date="2026-09-01 09:00:00"
wp lw-lms drip set-start alice 42 --now
wp lw-lms drip set-start alice 42 --clear
```

Clearing means the next access creates a new clock. It does not restore an earlier grant timestamp manually removed from user meta.

## Clock rules

The clock is stored in `_lw_lms_course_start_{course_id}`. The first grant wins. For an existing stored enrollment, LW LMS recovers the earliest grant time. Runtime-only subscription or membership access starts on first visit because no access row exists.

Do not reset this meta on a repeated grant. `CourseStart::on_grant()` intentionally preserves the first value.

## REST contract

`GET /lms/v1/courses/{id}` adds:

- top-level `progression` (`free` or `linear`);
- each lesson row's `accessible`;
- `locked_reason`: `sequence`, `schedule`, or `null`;
- `available_at`: ISO 8601 time or `null`.

While locked, lesson detail, progress writes, quiz submission, and protected downloads return:

```json
{
  "code": "lesson_locked",
  "message": "This lesson is not available yet.",
  "data": {
    "status": 403,
    "locked_reason": "schedule",
    "available_at": "2026-10-01T09:00:00+02:00"
  }
}
```

Render `sequence` as waiting for a prerequisite. Render `schedule` against the server-provided timestamp. Do not calculate a second client-side timetable.

## Exemptions

LW LMS leaves a lesson open when it is already complete or marked preview. It skips all course locks for an open course, optional staff access, or a completed-course snapshot. Users without course entitlement are denied by access before pacing matters. Administrative force-complete and Site Manager progress operations can write past learner pacing.

## Extending locks

The filter receives the complete map:

```php
add_filter(
    'lw_lms_lesson_locks',
    static function ( array $locks, int $course_id, int $user_id ): array {
        // Add or remove narrowly scoped entries.
        return $locks;
    },
    10,
    3
);
```

Each entry is keyed by lesson ID and contains `reason` and `available_at` (Unix timestamp or null). Returning a non-array becomes an empty map, which opens all lessons.

## Verified 2.0.0 limitation

On a non-UTC WordPress timezone, a completion timestamp used by a `previous` rule is currently shifted by the site's UTC offset. A zero-delay next lesson can therefore remain `schedule`-locked for that offset. The 2.0.0 live test on `Europe/Budapest` returned an opening time two hours after the just-recorded completion. Treat exact previous-completion schedules as affected until the plugin fixes its site-local MySQL timestamp conversion.

## Diagnostic workflow

1. Confirm the course uses `linear` progression.
2. Run `wp lw-lms drip status <user> <course> --format=json`.
3. Check course entitlement and Staff Access before changing rules.
4. Check the stored course start and the earliest durable grant.
5. Confirm the preceding lesson/section is actually complete.
6. Compare server time, WordPress timezone, `completed_at`, and `available_at` when a schedule appears offset.
7. Check preview and course-completion exemptions.
8. Inspect `lw_lms_lesson_locks` callbacks last.

## Cross-references

- Use `lw-lms-rest-frontend` for the complete learner REST shape.
- Use `lw-lms-wp-cli-operations` for the full command catalog.
- Use `lw-lms-quiz-integration` when quiz pass controls completion.
- Use `lw-lms-backend-extend` for access/progress repositories and hook contracts.

## References

- Official repository: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `includes/Drip/CourseStart.php`
  - `includes/Drip/CoursePlan.php`
  - `includes/Drip/LessonLocks.php`
  - `includes/Drip/LessonScheduler.php`
  - `includes/Drip/DripTime.php`
  - `includes/Api/LessonLockError.php`
  - `includes/CLI/DripStatusCommand.php`
  - `includes/CLI/DripSetStartCommand.php`
