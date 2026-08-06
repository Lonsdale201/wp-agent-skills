---
name: learndash-course-progress
description: >-
  Build or audit LearnDash learner progress, step completion, course completion,
  quiz progress, resets, activity synchronization, and progress hooks. Use when
  code mentions learndash_process_mark_complete,
  learndash_process_mark_incomplete,
  learndash_process_user_course_progress_update,
  learndash_user_get_course_progress,
  learndash_user_progress_get_previous_incomplete_step,
  learndash_user_course_complete_all_steps, learndash_delete_course_progress,
  _sfwd-course_progress, _sfwd-quizzes, course_completed_*,
  learndash_user_activity, challenge-exam reset, or custom LMS progress APIs.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sfwd-lms"
  wp-skills-plugin-version-tested: "5.1.9"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# LearnDash course progress and completion

Treat progress as a coordinated lifecycle across progress usermeta, quiz
attempts, activity tables, completion timestamps, parent steps, hooks, and
group progress. Do not implement completion by changing one usermeta value.

## Choose the correct operation

| Need | Use |
|---|---|
| Read course totals/status | `learndash_user_get_course_progress( $user_id, $course_id, 'summary' )` |
| Read completion-order steps | `learndash_user_get_course_progress( $user_id, $course_id, 'co' )` |
| Check one step | `learndash_user_progress_is_step_complete( $user_id, $course_id, $step_id )` |
| Get a machine-safe course status | `learndash_course_status( $course_id, $user_id, true )` |
| Complete one lesson/topic/quiz and recalculate the course | `learndash_process_mark_complete()` |
| Mark a lesson/topic or its parents incomplete | `learndash_process_mark_incomplete()` |
| Apply an admin/import progress payload | `learndash_process_user_course_progress_update()` |
| Complete every step | `learndash_user_course_complete_all_steps()` |
| Destructively remove course and quiz history | `learndash_delete_course_progress()` after reviewing its scope below |

Always pass an explicit `$course_id` for shared lessons, topics, and quizzes.
The same step can belong to more than one course, so resolving only from the
step ID can read or mutate the wrong progress tree.

## Read progress without parsing labels

```php
$summary = learndash_user_get_course_progress( $user_id, $course_id, 'summary' );

$status    = $summary['status'] ?? 'not_started';
$completed = (int) ( $summary['completed'] ?? 0 );
$total     = (int) ( $summary['total'] ?? 0 );
```

Use status slugs `not_started`, `in_progress`, and `completed`. Do not compare
the localized default output of `learndash_course_status()` with English text;
pass `true` as its third argument when the value controls program logic.

The public progress model exposes several projections:

- `legacy`: lesson/topic tree plus summary fields; persisted in
  `_sfwd-course_progress`.
- `co`: flattened completion order with keys such as `sfwd-lessons:123`.
- `summary`: `completed`, `total`, and `status`.
- `activity`: source-verified activity-table projection; use it for reporting
  diagnostics, not as the primary completion gate.

## Complete a single step

```php
$completed = learndash_process_mark_complete(
    $user_id,
    $step_id,
    false,
    $course_id
);
```

Before writing, `learndash_process_mark_complete()` enforces progression,
incomplete children, lesson timers, assignment approval, external attendance,
and video completion. It then updates legacy progress, activity rows, the
course completion timestamp, parent steps, and the normal completion hooks.
When the course becomes complete, the `learndash_course_completed` action also
drives LearnDash's group-course progress synchronization.

Do not pass `$force = true` merely to make an integration succeed. Reserve it
for an authorized admin/import workflow that deliberately bypasses learner
progression requirements. Check course access separately with
`sfwd_lms_has_access()` when a custom endpoint acts for another user.

## Bulk or administrative progress updates

Use `learndash_process_user_course_progress_update()` for a complete admin or
import payload. It synchronizes lesson/topic activity, quiz attempts, course
completion, group progress, and completion actions.

```php
$course_progress = learndash_user_get_course_progress(
    $user_id,
    $course_id,
    'legacy'
);
$course_progress['lessons'][ $lesson_id ]             = 1;
$course_progress['topics'][ $lesson_id ][ $topic_id ] = 1;

$processed = learndash_process_user_course_progress_update(
    $user_id,
    array(
        'course' => array( $course_id => $course_progress ),
        'quiz'   => array(
            $course_id => array( $quiz_id => 1 ),
        ),
    ),
    false
);
```

Build the payload from the current `legacy` projection and change only the
intended values. Replacing it with a partial tree can make omitted steps
incomplete and reset their activity state.

`learndash_user_set_course_progress()` persists the legacy tree but does not
perform the full completion/activity/hook workflow. Use it only for tightly
controlled repairs where those side effects are intentionally handled.

## Incomplete-step contract in LearnDash 5.1.8+

`learndash_user_progress_get_previous_incomplete_step()` returns:

- the earliest incomplete step before the requested step; or
- `false` for invalid input or when every preceding step is complete.

Before 5.1.8, the all-clear case returned the requested `$step_id`. Never use
`$result === $step_id` as the success signal in new code.

```php
$blocker = learndash_user_progress_get_previous_incomplete_step(
    $user_id,
    $course_id,
    $step_id
);

if ( false !== $blocker ) {
    // Redirect or report the actual preceding blocker.
}
```

Use `learndash_user_progress_get_first_incomplete_step()`,
`learndash_user_progress_get_next_incomplete_step()`, and
`learndash_user_progress_get_all_incomplete_steps()` for navigation instead of
reconstructing course order from post dates.

## Mark incomplete and reset safely

Use `learndash_process_mark_incomplete()` for a lesson/topic or for propagating
a quiz becoming incomplete to its parent topic/lesson. It updates progress,
activity state, the course-completed timestamp, and fires
`learndash_mark_incomplete_process` for affected steps.

For a quiz attempt, remove or update the attempt through LearnDash's quiz
progress APIs first; merely marking its parent incomplete does not remove the
attempt, statistics, locks, graded items, or pass state.

Treat `learndash_delete_course_progress( $course_id, $user_id )` as destructive:

- It removes that course from `_sfwd-course_progress` and deletes
  `course_completed_{$course_id}`.
- It removes quiz history for quiz IDs found in attempts for that course,
  including ProQuiz statistics and toplist rows.
- It does not provide a transactional rollback and does not itself remove all
  lesson/topic/course activity rows. Reconcile/report activity deliberately if
  a custom full-reset workflow requires it.

In LearnDash 5.1.8+, resetting a challenge exam also resets the course stored in
`exam_challenge_course_passed`, falling back to the current course. Custom exam
reset UIs must reset the associated target course, not only delete the exam
activity record.

## Completion and activity hooks

| Event | Hook | Arguments |
|---|---|---|
| Before course completion | `learndash_before_course_completed` | one course-data array |
| Lesson completed | `learndash_lesson_completed` | one lesson-data array |
| Topic completed | `learndash_topic_completed` | one topic-data array |
| Quiz completed | `learndash_quiz_completed` | quiz-data array, `WP_User` |
| Course completed | `learndash_course_completed` | one course-data array |
| Step/course made incomplete | `learndash_mark_incomplete_process` | user ID, course ID, affected step ID |
| Any activity write | `learndash_update_user_activity` | normalized activity args array |

Use the semantic completion hooks for provisioning, certificates, CRM events,
or notifications. The generic activity hook also fires for access, exam,
reporting, and intermediate writes and is too broad without strict filtering.

Design consumers to be idempotent. Imports, manual edits, quiz recalculation,
parent auto-completion, and retries can revisit the same learner/course pair.

## REST and custom endpoint boundary

The `ldlms/v2/users/{id}/course-progress` routes are read-only projections in
LearnDash 5.1.9. They expose course headers, steps, and challenge-exam state;
they do not provide a general public progress-write endpoint.

For a custom write endpoint:

1. Require authentication and verify the actor may modify the target user.
2. Validate the course-step relationship in the supplied course context.
3. Call the LearnDash completion/update APIs above.
4. Return a fresh `summary`/`co` projection after the mutation.
5. Add an idempotency strategy for external imports or queued requests.

## Common mistakes to reject

- Updating `_sfwd-course_progress`, `_sfwd-quizzes`, or activity tables directly.
- Treating course access and course progress as the same state.
- Omitting `$course_id` for a shared step.
- Comparing localized course-status labels in program logic.
- Using `$force = true` for an untrusted learner request.
- Treating the 5.1.8+ `false` all-clear result as an error.
- Assuming a course reset automatically deletes every activity/report row.
- Firing provisioning from generic activity writes without filtering and
  idempotency.

## Cross-references

- Use `learndash-course-access` for enrollment, access windows, and the final
  authorization decision.
- Use `learndash-rest-api` for route discovery and general LearnDash REST
  permissions.
- Use `learndash-group-access` when group membership grants course access or
  group-progress summaries matter.

## References

Validated against LearnDash LMS 5.1.9 local source:

- `includes/classes/class-ldlms-model-user-course-progress.php`
- `includes/course/ld-course-progress.php`
- `includes/course/ld-activity-functions.php`
- `includes/ld-users.php`
- `includes/exam/ld-exam-functions.php`
- `includes/rest-api/v2/class-ld-rest-users-course-progress-controller.php`
- Official documentation: <https://developers.learndash.com/>
