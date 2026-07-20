---
name: lw-lms-rest-frontend
description: Build a custom frontend against LW LMS's headless `/wp-json/lms/v1` REST API in lw-lms v1.6.0. Use for React, Vue, Astro, mobile, or theme code that calls `/courses`, `/courses/{id}`, `/lessons/{id}`, `/progress`, `/progress/course/{id}`, or `/download/{id}` and must handle public course content, lesson/access gating, paid-course products/subscriptions/subscription_variations/memberships, custom paid-access decisions, progress payloads, downloads, and nonce/app-password auth.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-07-20"
---

# LW LMS: REST frontend consumer

For frontend developers consuming LW LMS data: course catalog, course detail, lesson player, progress dashboard, and protected downloads. The core `lw-lms` plugin ships a headless REST API; it does not ship public templates, shortcodes, or blocks.

> **BETA NOTICE.** The plugin README says the plugin is under active development and not recommended for production use. Snapshot the JSON shapes in tests and review `CHANGELOG.md` before upgrading. This skill is verified against local lw-lms **v1.6.0**.

## Version deltas that matter

- **v1.6.0**: no route or JSON-schema change. A server-side `lw_lms_has_course_access` callback can now alter the final logged-in paid-course access decision after built-in access checks, which affects `access.has_access`, lesson accessibility, attachments, lesson detail, progress writes, and protected downloads.
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

In v1.6.0, a companion plugin may provide the final logged-in paid-course decision through `lw_lms_has_course_access`. Frontend code should continue to trust the server response; it must not reproduce membership or entitlement rules in JavaScript. Backend callbacks must be deterministic: the full-course transformer checks course access twice, so a changing result can make `access.has_access` disagree with lesson/attachment gating in one response.

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

## Detailed response contract

Read [references/rest-response-contract.md](references/rest-response-contract.md) when implementing request parameters, full JSON shapes, nullable fields, lesson errors, progress validation, or binary downloads. The route/auth/access decisions and client safety rules remain in this main skill.

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

- Course `content` is public in v1.4.0+; never use it as the access gate.
- A server-side v1.6.0 paid-access filter may change access without creating an enrollment row; the REST response remains the authority for the client.
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
