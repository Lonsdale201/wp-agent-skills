# LW LMS 2.0.0 REST response contract

## Course collection

```http
GET /wp-json/lms/v1/courses?per_page=12&page=1&category=php&level=beginner&search=oop&status=publish
```

| Parameter | Default | Values |
|---|---|---|
| `per_page` | configured `courses_per_page` | `1..100` |
| `page` | `1` | integer 1+ |
| `category` | empty | category slug |
| `level` | empty | level slug |
| `search` | empty | search text |
| `status` | `publish` | `publish`, `private`, `draft`, `any`; capability-gated |

List items include `id`, `title`, `slug`, `status`, `excerpt`, `thumbnail`, taxonomies, duration, lesson count, and compact `access`. The wrapper is:

```json
{
  "data": [],
  "meta": { "total": 0, "pages": 0, "current_page": 1, "per_page": 12 }
}
```

## Course detail

Important fields:

```json
{
  "id": 42,
  "status": "publish",
  "content": "<p>Public course description.</p>",
  "access": { "type": "paid", "has_access": false, "requires": "purchase" },
  "progression": "linear",
  "sections": [
    {
      "id": "intro",
      "lessons": [
        {
          "id": 100,
          "accessible": false,
          "locked_reason": "schedule",
          "available_at": "2026-10-01T09:00:00+02:00",
          "completed": false
        }
      ]
    }
  ],
  "lessons_without_section": [],
  "attachments": [],
  "progress": { "completed_lessons": 0, "total_lessons": 1, "percentage": 0 }
}
```

Denied paid access can add `products`, `subscriptions`, `subscription_variations`, and `memberships`. Attachment rows appear only with access and carry signed `download_url` values.

## Lesson detail

```json
{
  "id": 100,
  "title": "Introduction",
  "content": "<p>Lesson body.</p>",
  "course": { "id": 42, "title": "Course" },
  "section": { "id": "intro", "title": "Intro" },
  "order": 1,
  "duration": "12 min",
  "video": {
    "url": "VIDEO_URL",
    "provider": "youtube",
    "video_id": "abc",
    "embed": "EMBED_URL",
    "duration": "",
    "html": "<div>...</div>"
  },
  "attachments": [],
  "navigation": { "previous": null, "next": null },
  "quiz": null
}
```

Missing or unreadable posts return `404 not_found`. Entitlement denial returns `403 forbidden`. Drip denial returns `403 lesson_locked` with `locked_reason` and `available_at`.

## Progress

`GET /progress/course/{id}` returns rows plus:

```json
{
  "course_progress": {
    "completed_lessons": 5,
    "total_lessons": 24,
    "percentage": 21
  }
}
```

`POST /progress` requires `course_id`, `lesson_id`, and status `not_started`, `in_progress`, or `completed`. Common errors:

| Error | Status | Meaning |
|---|---:|---|
| `unauthorized` | 401 | guest |
| `forbidden` | 403 | no lesson access |
| `lesson_locked` | 403 | pacing lock |
| `quiz_not_passed` | 403 | required quiz has not passed |
| `invalid_request` | 400 | lesson/course mismatch or invalid status |
| `update_failed` | 500 | persistence failure |

## Quiz submission

```json
{
  "answers": { "q1": "option_a", "q2": true, "q3": "Text" }
}
```

Successful response:

```json
{
  "score": 2,
  "scored_questions": 2,
  "percentage": 100,
  "passed": true,
  "pass_percentage": 80,
  "results": {
    "q1": { "correct": true },
    "q2": { "correct": true },
    "q3": { "scored": false, "sample": "Example" }
  }
}
```

The response never returns the correct single-choice or boolean answer.

## Downloads

Use the complete `download_url`. It is a signed, expiring URL to `/lms/v1/download/{attachment_id}`. The controller checks:

1. signature and expiry;
2. bound current user;
3. attachment ownership by an LMS course or lesson;
4. readable post status;
5. current course/lesson access and drip state;
6. actual local file.

Success streams binary content and fires `lw_lms_attachment_downloaded`.
