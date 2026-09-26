---
name: lw-lms-quiz-integration
description: Builds, imports, consumes, and audits LW LMS 2.0.0 quizzes and attempt results. Use when working with `_lw_lms_quiz`, `POST /lms/v1/lessons/{id}/quiz`, `single`, `boolean`, or `open` questions, `require_quiz_pass`, quiz attempt history, throttling, `wp lw-lms lesson set-quiz|get-quiz|delete-quiz`, quiz hooks, CSV export, or the React admin results screen.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW LMS quiz integration

Use the canonical quiz schema, learner REST endpoint, and stored attempt history. Never expose stored correct answers to a learner.

## Canonical quiz document

```json
{
  "pass_percentage": 80,
  "shuffle_options": true,
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "prompt": "Choose one",
      "options": [
        { "id": "a", "text": "A", "correct": true },
        { "id": "b", "text": "B", "correct": false }
      ]
    },
    { "id": "q2", "type": "boolean", "prompt": "True?", "correct": true },
    { "id": "q3", "type": "open", "prompt": "Explain", "sample": "Example response" }
  ]
}
```

Question and option IDs must start with a letter and contain at most 64 letters, digits, underscores, or hyphens. Keep IDs stable across edits so attempt snapshots remain understandable. The normalizer rejects unknown keys and duplicate IDs instead of silently dropping them.

`single` needs at least two options and exactly one correct option. `boolean` needs a strict boolean `correct`. `open` is ungraded; an optional sample may be returned as guidance. A quiz with no scored questions passes at 100%.

## Import and inspect with WP-CLI

```bash
wp lw-lms lesson set-quiz 99 --file=quiz.json
cat quiz.json | wp lw-lms lesson set-quiz intro --file=-
wp lw-lms lesson get-quiz 99 --format=json
wp lw-lms lesson delete-quiz 99 --yes
```

`set-quiz` replaces the whole document. `get-quiz` includes correct answers, so treat its output as administrative data and do not publish logs. Deleting the quiz does not delete historical attempts.

## Learner REST

`GET /lms/v1/lessons/{id}` includes `quiz` or `null`. The public quiz contains pass percentage, shuffle flag, questions, stable option IDs, and the current user's `last_attempt`; it strips every `correct` key.

Submit answers:

```http
POST /wp-json/lms/v1/lessons/99/quiz
Content-Type: application/json
X-WP-Nonce: ...

{
  "answers": {
    "q1": "a",
    "q2": true,
    "q3": "Free text"
  }
}
```

Single-choice answers should use option IDs. A zero-based stored-order index remains accepted for clients written against 1.8.0, but new clients must use IDs because displayed options may be shuffled. Boolean answers must be JSON booleans. Open answers are capped at 5000 characters.

The response contains `score`, `scored_questions`, `percentage`, `passed`, `pass_percentage`, and per-question results. It reports correctness but does not reveal the expected single/boolean answer. Open results can include the sample.

The route requires login, readable lesson status, lesson access, and an unlocked drip state. Errors include `404 not_found`, `403 forbidden`, `403 lesson_locked`, `404 no_quiz`, and `429 quiz_rate_limited`.

## Completion gate

`require_quiz_pass` defaults to false. When enabled:

- a passing submission completes the lesson through `ProgressRepository`, including normal completion hooks;
- learner `POST /progress` cannot set that lesson to completed until a passing attempt exists;
- administrative progress operations remain an override.

Do not duplicate completion after a pass. Consume the returned result and refresh authoritative progress.

## Attempt limits and concurrency

LW LMS stores every accepted attempt in `wp_lms_quiz_attempts` with an answer/review snapshot. Defaults are 15 seconds between attempts and 20 attempts per rolling 24 hours for one user/lesson. A per-user/lesson atomic lock prevents parallel submissions from bypassing the check.

```php
add_filter( 'lw_lms_quiz_attempt_cooldown', static fn ( int $seconds, int $user_id, int $lesson_id ): int => 30, 10, 3 );
add_filter( 'lw_lms_quiz_daily_attempt_limit', static fn ( int $limit, int $user_id, int $lesson_id ): int => 10, 10, 3 );
```

Return zero only when unlimited attempts are an explicit product decision.

## Hooks

```php
add_action(
    'lw_lms_quiz_submitted',
    static function ( int $lesson_id, int $user_id, float $percentage, bool $passed ): void {
        // Record aggregate analytics without answer content.
    },
    10,
    4
);

add_action( 'lw_lms_quiz_passed', 'my_pass_handler', 10, 3 );
```

`lw_lms_quiz_passed` fires on every passing attempt, not only the first. Make downstream rewards idempotent.

## Admin results

The React admin lets `manage_lms` users filter attempts, open attempt detail, delete attempts, view question statistics, and export CSV. Correctness and learner email are admin-only; email visibility also requires `list_users`. CSV intentionally omits email.

Settings require `manage_options`. Learner-result routes use `manage_lms`. Preserve these boundaries in companion UI and routes.

## Critical rules

- Keep question and option IDs stable.
- Never render `_lw_lms_quiz` directly to learners.
- Never infer the correct answer from option order after shuffling.
- Treat CLI quiz output and admin attempt detail as sensitive.
- Preserve the cooldown and daily limit unless the product explicitly accepts brute-force attempts.
- Use quiz hooks for notifications or analytics; avoid raw-table polling when an action already exists.
- Treat attempt snapshots as historical records. Editing the current quiz must not rewrite them.

## Cross-references

- Use `lw-lms-rest-frontend` for the full lesson and progress contract.
- Use `lw-lms-drip-progression` when `lesson_locked` blocks quiz submission.
- Use `lw-lms-wp-cli-operations` for the full command catalog.
- Use `lw-lms-backend-extend` for privacy, access, and completion hooks.

## References

- Official repository: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `includes/Quiz/QuizNormalizer.php`
  - `includes/Quiz/QuizPublicView.php`
  - `includes/Quiz/QuizScorer.php`
  - `includes/Quiz/QuizSubmission.php`
  - `includes/Quiz/QuizThrottle.php`
  - `includes/Quiz/QuizSubmitLock.php`
  - `includes/Api/Controllers/QuizController.php`
  - `includes/Api/Admin/QuizAttemptsController.php`
  - `includes/CLI/LessonSetQuizCommand.php`
