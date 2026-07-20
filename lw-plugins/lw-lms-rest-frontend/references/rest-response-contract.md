# LW LMS v1.6.0 REST response contract

Load this reference when implementing the learner-facing response parser or request builder. There was no route or schema change in v1.6.0; its paid-course filter changes only the server-calculated access decision.

## Course list

```http
GET /wp-json/lms/v1/courses?per_page=12&page=1&category=php&level=beginner&search=oop
```

| Param | Default | Validation |
|---|---|---|
| `per_page` | `10` | integer `1..100` |
| `page` | `1` | integer `>= 1` |
| `category` | `''` | course category slug |
| `level` | `''` | course level slug |
| `search` | `''` | text search |

```json
{
  "data": [
    {
      "id": 42,
      "title": "PHP Object-Oriented Fundamentals",
      "slug": "php-oop-fundamentals",
      "excerpt": "Short summary.",
      "thumbnail": "https://site.test/wp-content/uploads/course.jpg",
      "categories": [{ "id": 5, "name": "PHP", "slug": "php" }],
      "level": { "id": 9, "name": "Beginner", "slug": "beginner" },
      "duration": "8h",
      "lesson_count": 24,
      "access": { "type": "paid", "has_access": false }
    }
  ],
  "meta": { "total": 47, "pages": 4, "current_page": 1, "per_page": 12 }
}
```

List items omit products, subscriptions, subscription variations, memberships, expiry, sections, attachments, and progress. Fetch the single course for those.

## Course detail

```http
GET /wp-json/lms/v1/courses/42
```

| Field | Presence |
|---|---|
| `content` | Always present for published courses; public marketing/about description |
| `content_raw` | Editors only (`current_user_can( 'edit_posts' )`) |
| `sections` | Always present; each section contains lesson list rows |
| `lessons_without_section` | Always present; render after sections |
| `attachments` | Populated only when `access.has_access === true`, otherwise empty |
| `progress` | Present for logged-in users |
| `access.expires_at` | Paid course with an access row and non-empty expiry |
| `access.products` | Denied paid course with linked WooCommerce products |
| `access.subscriptions` | Denied paid course with linked parent subscriptions |
| `access.subscription_variations` | Denied paid course with linked variation pairs |
| `access.memberships` | Denied paid course with linked WooCommerce Memberships plans |

```json
{
  "id": 42,
  "title": "PHP Object-Oriented Fundamentals",
  "content": "<p>Public course description.</p>",
  "access": {
    "type": "paid",
    "has_access": false,
    "requires": "purchase",
    "products": [
      { "id": 200, "name": "PHP OOP Course", "price": "49.00", "price_formatted": "$49.00", "url": "...", "access_duration": 0 }
    ],
    "subscriptions": [
      { "id": 201, "name": "All Access", "price": "19.00", "price_formatted": "$19.00 / month", "url": "..." }
    ],
    "subscription_variations": [
      { "parent_id": 300, "variation_id": 305, "name": "All Access - Yearly", "attributes": {"attribute_plan": "yearly"}, "price": "190.00", "price_formatted": "$190.00 / year", "url": "..." }
    ],
    "memberships": [
      { "id": 77, "name": "Pro Members", "join": "https://site.test/product/pro-membership/" }
    ]
  },
  "sections": [
    {
      "id": "sec_intro",
      "title": "Getting Started",
      "description": "",
      "order": 0,
      "lessons": [
        { "id": 100, "title": "What is OOP", "order": 0, "duration": "12 min", "preview": true, "accessible": true, "completed": false }
      ]
    }
  ],
  "lessons_without_section": [],
  "attachments": [],
  "progress": { "completed_lessons": 0, "total_lessons": 24, "percentage": 0 }
}
```

Render both `sections[].lessons` and `lessons_without_section`. Show inaccessible lessons as locked/disabled instead of hiding the syllabus.

## Lesson detail

```http
GET /wp-json/lms/v1/lessons/100
```

- Open-course lessons are available to guests.
- Free/paid course lessons require course access unless marked preview.
- Preview lessons require a logged-in user in the current source.
- Denial returns `403 forbidden`; missing/non-published lessons return `404 not_found`.

```json
{
  "id": 100,
  "title": "What is OOP",
  "content": "<p>Lesson body.</p>",
  "course": { "id": 42, "title": "PHP OOP Fundamentals" },
  "section": { "id": "sec_intro", "title": "Getting Started" },
  "order": 0,
  "duration": "12 min",
  "video": { "url": "https://www.youtube.com/watch?v=abc123", "provider": "youtube", "video_id": "abc123", "embed": "https://www.youtube.com/embed/abc123", "duration": "" },
  "attachments": [
    { "id": 250, "title": "Slides.pdf", "filename": "slides.pdf", "mime_type": "application/pdf", "size": 245678, "download_url": "https://site.test/wp-json/lms/v1/download/250" }
  ],
  "navigation": { "previous": null, "next": { "id": 101, "title": "Next lesson" } }
}
```

`video`, `section`, `navigation.previous`, and `navigation.next` can be null. Switch video rendering on `video.provider`, not URL matching.

## Progress

```http
GET /wp-json/lms/v1/progress
GET /wp-json/lms/v1/progress/course/42
```

The course-scoped response adds the authoritative `course_progress` summary:

```json
{
  "data": [
    {
      "user_id": 5,
      "course_id": 42,
      "lesson_id": 100,
      "status": "completed",
      "completed_at": "2026-04-15 10:30:00",
      "created_at": "2026-04-14 09:00:00",
      "updated_at": "2026-04-15 10:30:00"
    }
  ],
  "course_progress": { "completed_lessons": 5, "total_lessons": 24, "percentage": 21 }
}
```

```http
POST /wp-json/lms/v1/progress
Content-Type: application/json

{
  "course_id": 42,
  "lesson_id": 100,
  "status": "completed"
}
```

`course_id`, `lesson_id`, and `status` are required. Status is `not_started`, `in_progress`, or `completed`. The server returns `401 unauthorized` for a guest, `403 forbidden` without lesson access, `400 invalid_request` when the lesson does not belong to the course, and `500 update_failed` on write failure. Success returns the saved row and authoritative `course_progress`.

## Downloads

`download_url` points at `/lms/v1/download/{attachment_id}` and returns a binary stream, not JSON. Use a normal link or fetch it as a blob. The controller scans `_lw_lms_attachments` on course/lesson posts, applies course/lesson access, fires `lw_lms_attachment_downloaded` on success, and sends file headers.
