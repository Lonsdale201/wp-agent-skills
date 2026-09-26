---
name: lw-lms-rest-frontend
description: Builds learner frontends against LW LMS 2.0.0 `/wp-json/lms/v1`, including catalog status filters, access gates, linear/drip locks, quizzes, ready video HTML, progress, and signed protected downloads. Use for React, Vue, Astro, mobile, or theme clients calling `/courses`, `/lessons`, `/progress`, `/quiz`, or `/download` and handling `lesson_locked`, purchase requirements, non-published previews, or REST payload extension fields.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.0"
  wp-skills-last-updated: "2026-09-26"
---

# LW LMS REST frontend

Consume the headless learner API. The plugin ships no public templates, shortcodes, or blocks.

## Routes

Namespace: `lms/v1`.

| Method | Path | Gate |
|---|---|---|
| `GET` | `/courses` | public; non-published status filters need matching edit capability |
| `GET` | `/courses/{id}` | public for published; capable users can preview non-published |
| `GET` | `/lessons/{id}` | access, visibility, and drip lock |
| `GET` | `/progress` | current logged-in user |
| `GET` | `/progress/course/{id}` | current logged-in user |
| `POST` | `/progress` | login, course/lesson match, access, drip, optional quiz gate |
| `POST` | `/lessons/{id}/quiz` | login, access, drip, attempt limits |
| `GET` | `/download/{id}` | signed link, ownership, current access, visibility |

The React admin uses the separate `lw-lms/v1/admin/*` namespace. Do not call those routes from a learner frontend.

## Authentication

- Public catalog: no authentication.
- Logged-in browser: WordPress cookie, `credentials: 'same-origin'`, and `X-WP-Nonce`.
- Headless/mobile: Application Passwords or another reviewed authentication layer.
- Downloads: use the signed URL from the payload in the same user context.

```js
await fetch('/wp-json/lms/v1/progress', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': wpApiSettings.nonce,
  },
  body: JSON.stringify({ course_id: 42, lesson_id: 100, status: 'completed' }),
});
```

## Access and visibility

Course `content` is public marketing copy. It is not evidence of enrollment. Gate the player with `access.has_access` and each lesson row's `accessible` value.

Course list access checks do not lazily enroll a viewer in a free course. Opening the full free course can create the enrollment row.

`GET /courses` accepts `status=publish|private|draft|any`. A non-published request without the necessary type capability fails with `rest_forbidden_status`; authorized results are then filtered again by per-post capability. Treat the server's result as authoritative; do not emulate WordPress status capability logic in JavaScript.

Render both `sections[].lessons` and `lessons_without_section`. Keep inaccessible lessons visible as syllabus rows with lock state.

## Drip state

Course detail includes `progression`. Lesson rows include:

- `accessible`;
- `locked_reason`: `sequence`, `schedule`, or null;
- `available_at`: ISO 8601 or null;
- `completed`.

Locked lesson detail, progress, quiz, and download requests return `403 lesson_locked` with the same reason and time. Render server data; do not calculate schedules in the client.

## Lesson, video, and quiz

Lesson detail includes rendered `content`, editor-only `content_raw`, course/section, navigation, attachments, `quiz`, and `video`.

Since 1.9.1, `video.html` is ready-to-render player markup. When LW Cookie 1.7.1+ blocks the provider before consent, it can be a consent placeholder. Sanitize only according to your trusted-server rendering policy; do not rebuild embeds from the URL and bypass consent handling.

`quiz` contains no correct answers. Submit learner answers to `/lessons/{id}/quiz`; then refresh progress when a required passing quiz can complete the lesson. Use `lw-lms-quiz-integration` for the exact schema and limits.

## Signed downloads

`download_url` now includes a user-bound signature and expiry. Default lifetime is one hour. Do not cache it across users, persist it as the attachment URL, strip its query parameters, or reconstruct it from the attachment ID. The server rechecks current access and attachment ownership at use time.

The response is binary. Use a normal link or a blob response, never `response.json()`.

## Payload extensions

Companion plugins can add top-level fields through:

- `lw_lms_rest_course_list_item`;
- `lw_lms_rest_course`;
- `lw_lms_rest_lesson`.

Core fields cannot be replaced or removed. Make client parsers tolerate additional top-level keys while continuing to require documented core keys.

## Critical rules

- Use `access.has_access`; course `content` is public.
- Render `locked_reason` separately from entitlement denial.
- Treat `available_at` as the server's timestamp.
- Do not assume public route registration means public content.
- Treat `content_raw` as editor data.
- Use `course_progress.completed_lessons`, not `completed_count`.
- Use option IDs for quiz answers; displayed order may be shuffled.
- Refresh signed download URLs instead of storing them.
- Snapshot the JSON shapes in frontend tests because the plugin is still under active development.

## Detailed contract

Read [references/rest-response-contract.md](references/rest-response-contract.md) for collection parameters, response fields, progress errors, quiz response, and download behavior.

## Cross-references

- Use `lw-lms-drip-progression` for schedule configuration and diagnosis.
- Use `lw-lms-quiz-integration` for quiz authoring and attempt behavior.
- Use `lw-lms-backend-extend` for PHP hooks and payload filters.
- Use `lw-lms-abilities` for admin/agent operations; abilities are not learner REST.

## References

- Official repository: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `includes/Api/RestApi.php`
  - `includes/Api/Controllers/`
  - `includes/Api/Transformers/`
  - `includes/Api/LessonRestGuard.php`
  - `includes/Api/DownloadLink.php`
  - `includes/Video/EmbedRenderer.php`
