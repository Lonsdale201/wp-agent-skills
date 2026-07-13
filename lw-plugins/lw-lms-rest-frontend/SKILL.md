---
name: lw-lms-rest-frontend
description: Build a custom frontend against LW LMS's headless `/wp-json/lms/v1` REST API in lw-lms v1.5.1. Use for React, Vue, Astro, mobile, or theme code that calls `/courses`, `/courses/{id}`, `/lessons/{id}`, `/progress`, `/progress/course/{id}`, or `/download/{id}` and must handle public course content, lesson/access gating, paid-course products/subscriptions/subscription_variations/memberships, progress payloads, downloads, and nonce/app-password auth.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "1.5.1"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-06-15"
---

# LW LMS: REST frontend consumer

For frontend developers consuming LW LMS data: course catalog, course detail, lesson player, progress dashboard, and protected downloads. The core `lw-lms` plugin ships a headless REST API; it does not ship public templates, shortcodes, or blocks.

> **BETA NOTICE.** The plugin README says the plugin is under active development and not recommended for production use. Snapshot the JSON shapes in tests and review `CHANGELOG.md` before upgrading. This skill is verified against local lw-lms **v1.5.1**.

## Version deltas that matter

- **v1.5.1**: maintenance release, no functional REST changes.
- **v1.5.0**: paid-course denied `access` payload can include `memberships` when WooCommerce Memberships is active and the course has `_lw_lms_membership_plan_ids`.
- **v1.4.0**: course `content` in `/courses/{id}` is public marketing/about content. It is no longer gated behind `access.has_access`. Lesson content is still gated by `/lessons/{id}`.
- **v1.4.0**: open-course lessons remain accessible to guests even if marked as preview.
- **v1.3.0**: first logged-in access to a free course lazily writes a `source='free'` access row server-side; the REST consumer does not need to do anything special.
- **v1.2.15**: denied paid-course `access` payload can include `subscription_variations`.

## Misconception this skill corrects

> "I should use `course.content` as the access gate."

Wrong for v1.4.0+. `CourseTransformer::transform_full()` always includes the course `content`; this is the public course description. Use `course.access.has_access` and each lesson's `accessible` flag for gating.

```jsx
// WRONG: course content is public and is not proof of access.
if (course.content) {
    renderLessonPlayer();
}

// RIGHT: access comes from access.has_access and per-lesson accessible.
if (course.access.has_access) {
    return <CourseContent html={course.content} progress={course.progress} />;
}

return <PurchaseGate access={course.access} />;
```

Lesson body content still comes from `GET /lms/v1/lessons/{id}` and returns `403 forbidden` when `AccessChecker::has_lesson_access()` denies the request.

## REST API surface

Namespace: `lms/v1`, mounted at `/wp-json/lms/v1/...`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/lms/v1/courses` | public | Paginated public course list |
| `GET` | `/lms/v1/courses/{id}` | public | Single course detail; course content is public, lesson rows carry `accessible` |
| `GET` | `/lms/v1/lessons/{id}` | public route, access-gated body | Single lesson; 403 without lesson access |
| `GET` | `/lms/v1/progress` | logged-in | Current user's all progress rows |
| `GET` | `/lms/v1/progress/course/{id}` | logged-in | Current user's progress rows for one course plus course summary progress |
| `POST` | `/lms/v1/progress` | logged-in + lesson access | Upsert lesson status |
| `GET` | `/lms/v1/download/{id}` | public route, access-gated file | Stream protected attachment binary |

## Course list

```http
GET /wp-json/lms/v1/courses?per_page=12&page=1&category=php&level=beginner&search=oop
```

Parameters:

| Param | Default | Validation |
|---|---|---|
| `per_page` | `10` | integer `1..100` |
| `page` | `1` | integer `>= 1` |
| `category` | `''` | course category slug |
| `level` | `''` | course level slug |
| `search` | `''` | text search |

List response shape:

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
  "meta": {
    "total": 47,
    "pages": 4,
    "current_page": 1,
    "per_page": 12
  }
}
```

List items do not include products, subscriptions, subscription variations, memberships, expiry, sections, attachments, or progress. Fetch the single course for those.

## Course detail

```http
GET /wp-json/lms/v1/courses/42
```

Important fields:

| Field | Presence |
|---|---|
| `content` | Always present for published courses; public marketing/about description |
| `content_raw` | Editors only (`current_user_can( 'edit_posts' )`) |
| `sections` | Always present; each section contains lesson list rows |
| `lessons_without_section` | Always present; render after sections |
| `attachments` | Populated only when `access.has_access === true`, otherwise empty array |
| `progress` | Present for logged-in users |
| `access.expires_at` | Paid course with access row and non-empty expiry; MySQL datetime string |
| `access.products` | Denied paid course with linked WooCommerce products |
| `access.subscriptions` | Denied paid course with linked parent subscription products |
| `access.subscription_variations` | Denied paid course with linked subscription variation pairs |
| `access.memberships` | Denied paid course with linked WooCommerce Memberships plans |

Denied paid-course example:

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

Render the complete outline from both `sections[].lessons` and `lessons_without_section`. Do not hide locked lessons; render them as locked/disabled so users can see the syllabus.

## Lesson detail

```http
GET /wp-json/lms/v1/lessons/100
```

The route is public, but the response is access-gated:

- Open-course lessons are available to guests.
- Free/paid course lessons require course access unless the lesson is marked preview.
- Preview lessons require a logged-in user in the current source.
- No access returns `403 forbidden`.
- Missing/non-published lessons return `404 not_found`.

Lesson response shape:

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
  "navigation": {
    "previous": null,
    "next": { "id": 101, "title": "Next lesson" }
  }
}
```

`video` can be `null`; `section`, `navigation.previous`, and `navigation.next` can also be `null`. Switch video rendering on `video.provider`, not URL string matching.

## Progress

Read all current-user progress:

```http
GET /wp-json/lms/v1/progress
```

Read current-user progress for one course:

```http
GET /wp-json/lms/v1/progress/course/42
```

The course-scoped response adds `course_progress` from `ProgressCalculator::calculate()`:

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
  "course_progress": {
    "completed_lessons": 5,
    "total_lessons": 24,
    "percentage": 21
  }
}
```

Write progress:

```http
POST /wp-json/lms/v1/progress
Content-Type: application/json

{
  "course_id": 42,
  "lesson_id": 100,
  "status": "completed"
}
```

Required fields are `course_id`, `lesson_id`, and `status`. Status must be `not_started`, `in_progress`, or `completed`.

The server validates:

- logged-in user, else `401 unauthorized`;
- lesson access, else `403 forbidden`;
- lesson belongs to the submitted course, else `400 invalid_request`;
- DB write, else `500 update_failed`.

Success returns the saved progress row plus authoritative `course_progress`. Use the returned summary instead of recalculating client-side.

## Downloads

`download_url` fields point at `/lms/v1/download/{attachment_id}` and return a binary stream, not JSON. Use an `<a href>` for normal downloads or fetch as `blob()` if you need client-side handling.

The download endpoint locates the attachment by scanning `_lw_lms_attachments` on course/lesson posts, applies course/lesson access, fires `lw_lms_attachment_downloaded` on success, and then sends file headers.

## Authentication

| Context | Auth pattern |
|---|---|
| Public catalog and course detail | no auth |
| Logged-in browser UI | WordPress cookie + `X-WP-Nonce`, usually via `wp.apiFetch` |
| Headless/mobile | Application Password Basic auth, or a vetted JWT/OAuth layer |
| Downloads | same auth context as the protected course/lesson |

For browser `fetch`, include both nonce and credentials:

```js
await fetch('/wp-json/lms/v1/progress', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': wpApiSettings.nonce
  },
  body: JSON.stringify({ course_id: 42, lesson_id: 100, status: 'completed' })
});
```

## Critical rules

- Course `content` is public in v1.5.1; never use it as the access gate.
- Lesson detail and download endpoints are the protected surfaces.
- Iterate both `sections` and `lessons_without_section`.
- Render locked lessons disabled, not hidden.
- `access.memberships` is available only when WooCommerce Memberships functions exist and linked plans are configured.
- List endpoint access info is intentionally small; build purchase gates from the single-course response.
- `course_progress` uses `completed_lessons`, not `completed_count`.
- `completed_at` is `null` for non-completed rows.
- `content_raw` is editor-only source content; do not render it in public UI.
- `download_url` is already a full REST URL; do not reconstruct it by concatenating `/wp-json`.
- The download endpoint returns binary data; do not call `response.json()` on it.

## Common mistakes

```jsx
// WRONG: only iterating sections.
course.sections.map(section => <Section section={section} />);

// RIGHT: include orphan lessons too.
<>
  {course.sections.map(section => <Section key={section.id} section={section} />)}
  {course.lessons_without_section.length > 0 && (
    <LessonGroup lessons={course.lessons_without_section} />
  )}
</>
```

```jsx
// WRONG: old pre-1.4 assumption.
const canAccess = Boolean(course.content);

// RIGHT.
const canAccess = course.access.has_access;
```

```jsx
// WRONG: progress key from stale docs.
<ProgressBar value={data.course_progress.completed_count} />

// RIGHT.
<ProgressBar value={data.course_progress.completed_lessons} />
```

```js
// WRONG: POST body missing course_id.
fetch('/wp-json/lms/v1/progress', {
  method: 'POST',
  body: JSON.stringify({ lesson_id: 100, status: 'completed' })
});

// RIGHT.
fetch('/wp-json/lms/v1/progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': wpApiSettings.nonce },
  credentials: 'same-origin',
  body: JSON.stringify({ course_id: 42, lesson_id: 100, status: 'completed' })
});
```

## Cross-references

- Use `lw-lms-backend-extend` for hooks, access/progress repositories, and companion-plugin backend integration.
- Use `lw-lms-abilities` for admin/agent `lw-lms/*` Abilities API calls; those are not the learner-facing REST endpoints.
- Use `lw-lms-wp-cli-operations` for operational WP-CLI course, lesson, enrollment, revoke, and force-complete commands.
- Use `lw-lms-learndash-migration` for the one-time LearnDash migration command.

## What this skill does NOT cover

- A separate frontend plugin. This skill documents the core `lw-lms` REST contract only.
- Payment processing. Link to WooCommerce products/subscriptions/membership join URLs and let WooCommerce handle checkout.
- Custom REST route registration. Use normal WordPress `register_rest_route()` patterns in a companion plugin.
- Server-rendered theme templates. You can consume REST server-side, but direct CPT/meta queries are usually simpler in PHP templates.

## References

- REST namespace and route registration: `includes/Api/RestApi.php`.
- Course list/detail routes: `includes/Api/Controllers/CoursesController.php`.
- Lesson route and 403 behavior: `includes/Api/Controllers/LessonsController.php`.
- Progress routes and cross-validation: `includes/Api/Controllers/ProgressController.php`.
- Download route and binary response: `includes/Api/Controllers/DownloadController.php`.
- Course response shape and public `content`: `includes/Api/Transformers/CourseTransformer.php`.
- Lesson response shape: `includes/Api/Transformers/LessonTransformer.php`.
- Progress row shape: `includes/Api/Transformers/ProgressTransformer.php`.
- Paid access payload including memberships: `includes/Access/AccessChecker.php`, `includes/Access/MembershipChecker.php`.
- Official documentation: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `wp-content/plugins/lw-lms/includes/Access/SubscriptionVariationChecker.php`
  - `wp-content/plugins/lw-lms/includes/Access/WooCommerceChecker.php`
  - `wp-content/plugins/lw-lms/includes/Meta/VideoParser.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressCalculator.php`
  - `wp-content/plugins/lw-lms/CHANGELOG.md`
