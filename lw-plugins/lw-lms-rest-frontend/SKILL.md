---
name: lw-lms-rest-frontend
description: Build a custom frontend against LW LMS's headless
  `/wp-json/lms/v1` REST API. Use for React, Vue, Astro, mobile, or
  theme code that calls `/lms/v1/courses`, `/courses/{id}`,
  `/lessons/{id}`, `/progress`, `/progress/course/{id}`, or
  `/download/{id}` and must handle gated `content`,
  `access.has_access`, `sections`, `lessons_without_section`,
  per-lesson `accessible`, progress payloads, nonce/app-password auth,
  and paid-course products/subscriptions/subscription_variations.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-lms
plugin-version-tested: "1.3.0"
php-min: "8.1"
last-updated: "2026-05-21"
docs:
  - https://github.com/lwplugins/lw-lms
source-refs:
  - wp-content/plugins/lw-lms/includes/Api/RestApi.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/CoursesController.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/LessonsController.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/ProgressController.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/DownloadController.php
  - wp-content/plugins/lw-lms/includes/Api/Transformers/CourseTransformer.php
  - wp-content/plugins/lw-lms/includes/Api/Transformers/LessonTransformer.php
  - wp-content/plugins/lw-lms/includes/Api/Transformers/ProgressTransformer.php
  - wp-content/plugins/lw-lms/includes/Access/AccessChecker.php
  - wp-content/plugins/lw-lms/includes/Meta/VideoParser.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressCalculator.php
---

# LW LMS: REST frontend consumer

For frontend developers consuming [LW LMS](https://github.com/lwplugins/lw-lms) data — building a course catalog, single-course page, lesson player, progress dashboard. The core `lw-lms` plugin is intentionally headless: no templates, no shortcodes, no blocks. You bring your own UI (React / Vue / Astro / mobile / WP theme template).

> **BETA NOTICE.** The plugin's README explicitly states "This plugin is under active development and is not recommended for production use." REST response shapes may shift between minor versions. Snapshot the response in tests, and review the plugin's CHANGELOG before upgrading. This skill is verified against **v1.3.0**.

> **What changed for the frontend in recent versions:**
> - **v1.3.0**: no breaking REST changes. Free-course access now implicitly creates an enrollment row server-side on first access (transparent to the frontend, but means downstream automation reacts to free enrollments — see backend skill).
> - **v1.2.16**: per-ability `output_schema` definitions exposed on the LW Site Manager surface. Does not affect `/lms/v1/...` REST shapes.
> - **v1.2.15**: paid-course `access` response now carries `subscription_variations` for variation-level WC subscription upsells (parent_id / variation_id / name / attributes / price / url). Render alongside `products` and `subscriptions` in your purchase gate.

## Misconception this skill corrects

> "I'll fetch `/lms/v1/courses/{id}` and render `response.content` directly into the lesson player."

Wrong assumption. `content` is **conditionally present** on the course response — only when the current user has access. Verified at [src/Api/Transformers/CourseTransformer.php:80-88](CourseTransformer.php):

```php
// Add content only if user has access.
if ( $has_access ) {
    $data['content'] = apply_filters( 'the_content', $post->post_content );
    if ( current_user_can( 'edit_posts' ) ) {
        $data['content_raw'] = $post->post_content;
    }
}
```

For a public visitor viewing a `paid` course they haven't bought, `response.content` is **undefined** (NOT empty string, NOT null — the key isn't in the response at all). Frontend code that does `response.content.split(...)` blows up on the first paid course it tries to display.

The right pattern: read `response.access.has_access` (always present), branch on it.

```js
// WRONG
const html = response.content;   // undefined for non-purchased paid courses
ReactDOM.render(<CourseContent html={html} />, ...);

// RIGHT
if (response.access.has_access) {
    return <CourseContent html={response.content} />;
} else {
    return <PurchaseGate
        type={response.access.type}
        products={response.access.products}
        subscriptions={response.access.subscriptions}
        subscriptionVariations={response.access.subscription_variations}
    />;
}
```

Other AI-prone misconceptions:

- "Sections nest the lessons; that's the only place lessons live." Not exactly — there's also `lessons_without_section`, an array of lessons attached to the course but not assigned to any section. A complete course outline iterates BOTH `sections[].lessons` AND `lessons_without_section`.
- "If `accessible: false`, the lesson UI should hide it." No — render it disabled / locked. The list endpoint deliberately exposes the full course structure (titles, durations, completion state) so the visitor can see what they'd unlock by purchasing. Hiding leaks no info but loses conversion signals.
- "Progress endpoint returns server time on `completed_at`." Yes, but the field is `null` for `not_started` / `in_progress` rows. Always feature-detect.
- "POST `/progress` with `{lesson_id, status}` is enough." No — `course_id` is REQUIRED, AND the server validates that the lesson actually belongs to the specified course. Verified at [ProgressController.php:148-155](ProgressController.php) — wrong course_id returns `400 invalid_request`.

## When to use this skill

Trigger when ANY of the following is true:

- Building a frontend (React, Vue, Astro, Next, mobile, theme template) that consumes lw-lms data.
- The diff calls `/wp-json/lms/v1/...` endpoints.
- The user asks "how do I display a course list / course detail / lesson / progress dashboard".
- Reviewing client-side code that renders course/lesson UI.
- Choosing between server-rendered (PHP template via `WP_REST_Request` → manual fetch) and client-rendered (SPA → fetch).

## REST API surface (verified)

**Namespace:** `lms/v1`. Mounted at `/wp-json/lms/v1/...`. Defined at [src/Api/RestApi.php:25](RestApi.php).

| Method | Path | Auth | Cap check | Purpose |
|---|---|---|---|---|
| `GET` | `/lms/v1/courses` | public | none | Paginated course list |
| `GET` | `/lms/v1/courses/{id}` | public | none (content gated by `has_access`) | Single course full data |
| `GET` | `/lms/v1/lessons/{id}` | public lookup, **403 without access** | access cascade | Single lesson |
| `GET` | `/lms/v1/progress` | logged-in | `is_user_logged_in()` | Current user's all progress entries |
| `GET` | `/lms/v1/progress/course/{id}` | logged-in | `is_user_logged_in()` | Current user's progress on one course |
| `POST` | `/lms/v1/progress` | logged-in | `is_user_logged_in()` + lesson access check | Upsert lesson status |
| `GET` | `/lms/v1/download/{id}` | public + access cascade | access check on parent course/lesson | Stream attachment file |

Verified at [src/Api/Controllers/](Controllers/) — `CoursesController`, `LessonsController`, `ProgressController`, `DownloadController`.

## Workflow

### 1. Course list — public catalog

```http
GET /wp-json/lms/v1/courses?per_page=12&page=1&category=php-fundamentals&level=beginner&search=oop
```

| Param | Default | Validation |
|---|---|---|
| `per_page` | 10 | int 1–100 |
| `page` | 1 | int ≥ 1 |
| `category` | `''` | sanitize_text_field, slug match |
| `level` | `''` | sanitize_text_field, slug match |
| `search` | `''` | sanitize_text_field |

Response shape (verified at [CourseTransformer.php:31-51](CourseTransformer.php)):

```json
{
  "data": [
    {
      "id": 42,
      "title": "PHP Object-Oriented Fundamentals",
      "slug": "php-oop-fundamentals",
      "excerpt": "Short summary.",
      "thumbnail": "https://site.com/wp-content/uploads/...-large.jpg",
      "categories": [
        { "id": 5, "name": "PHP", "slug": "php" }
      ],
      "level": { "id": 9, "name": "Beginner", "slug": "beginner" },
      "duration": "8h",
      "lesson_count": 24,
      "access": {
        "type": "paid",
        "has_access": false
      }
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

Notes:

- `level` may be `null` (no level taxonomy term).
- `categories` may be empty array.
- `thumbnail` is `false` if no featured image (WP behaviour from `get_the_post_thumbnail_url`).
- `access` on list items has only `type` + `has_access` — no `expires_at` / `products` / `subscriptions`. Those land on the SINGLE-course response.

### 2. Course detail — public read, content gated

```http
GET /wp-json/lms/v1/courses/42
```

Response shape (verified at [CourseTransformer.php:60-101](CourseTransformer.php)):

```json
{
  "id": 42,
  "title": "PHP Object-Oriented Fundamentals",
  "slug": "php-oop-fundamentals",
  "excerpt": "Short summary.",
  "thumbnail": "https://...",
  "categories": [...],
  "level": {...} | null,
  "duration": "8h",

  "access": {
    "type": "paid",
    "has_access": false,
    "requires": "purchase",
    "products":                [{"id": 200, "name": "PHP OOP Course", "price": "49.00", "url": "..."}],
    "subscriptions":           [{"id": 201, "name": "All-Access", "price": "19.00", "url": "..."}],
    "subscription_variations": [{"parent_id": 300, "variation_id": 305, "name": "All-Access — Yearly", "attributes": {"plan": "yearly"}, "price": "190.00", "url": "..."}]
  },

  "sections": [
    {
      "id": "sec_abc",
      "title": "Getting Started",
      "description": "",
      "order": 0,
      "lessons": [
        {
          "id": 100,
          "title": "What is OOP",
          "order": 0,
          "duration": "12 min",
          "preview": true,
          "accessible": true,
          "completed": false
        }
      ]
    }
  ],
  "lessons_without_section": [],
  "attachments": [],
  "progress": { "completed_count": 0, "total_lessons": 24, "percentage": 0 }
}
```

Conditional fields:

| Field | Present when |
|---|---|
| `content` | `access.has_access === true` |
| `content_raw` | `access.has_access === true` AND current user has `edit_posts` (editors only — raw markdown / Gutenberg blocks for an admin-side preview) |
| `access.expires_at` | paid course AND `has_access === true` (Unix timestamp) |
| `access.requires`, `access.products`, `access.subscriptions`, `access.subscription_variations` | paid course AND `has_access === false` |
| `attachments[]` | populated only if `has_access === true` (otherwise empty array) |
| `progress` | only when current user is logged in |

The `sections` and `lessons_without_section` arrays are ALWAYS present (full course outline), even for non-purchased paid courses. Per-lesson `accessible` is the gate: `accessible === false` means show the lesson title + duration but lock the link.

### 3. Lesson detail — auth required, 403 without access

```http
GET /wp-json/lms/v1/lessons/100
Authorization: Basic <base64(username:app-pwd)>
```

Response (verified at [LessonTransformer.php:28-52](LessonTransformer.php)):

```json
{
  "id": 100,
  "title": "What is OOP",
  "content": "<p>...</p>",
  "course": { "id": 42, "title": "PHP OOP Fundamentals" },
  "section": { "id": "sec_abc", "title": "Getting Started" } | null,
  "order": 0,
  "duration": "12 min",
  "video": {
    "url": "https://www.youtube.com/watch?v=...",
    "provider": "youtube",
    "video_id": "abc123",
    "embed": "https://www.youtube.com/embed/abc123",
    "duration": ""
  } | null,
  "attachments": [
    {
      "id": 250, "title": "Slides.pdf", "filename": "slides.pdf",
      "mime_type": "application/pdf", "size": 245678,
      "download_url": "https://site.com/wp-json/lms/v1/download/250"
    }
  ],
  "navigation": {
    "previous": { "id": 99, "title": "Previous lesson" } | null,
    "next":     { "id": 101, "title": "Next lesson" } | null
  }
}
```

Behaviors:

- **403** with `{code: 'forbidden', message: 'You do not have access to this lesson.'}` if `AccessChecker::has_lesson_access()` returns false.
- **404** if the lesson doesn't exist OR is not `publish` status.
- **`section: null`** for lessons not in a section (shown alongside sections in the parent course's `lessons_without_section` array).
- **`video: null`** if no video URL is set on the lesson.
- **`navigation.previous` / `.next`** is null for the first / last lesson respectively.
- **`content_raw`** is included for editors (current_user_can `edit_posts`) — same pattern as course response.
- The `embed` field on `video` is a ready-to-use URL: pass directly to `<iframe src={video.embed}>`.

### 4. Lesson video providers (verified)

`VideoParser` ([src/Meta/VideoParser.php](VideoParser.php)) auto-detects the provider from the URL:

| `provider` | `embed` shape |
|---|---|
| `youtube` | `https://www.youtube.com/embed/{video_id}` |
| `vimeo` | `https://player.vimeo.com/video/{video_id}` |
| `wistia` | (custom; check the plugin's parser output) |
| `self_hosted` | the original URL — render via `<video src>` |

The `provider` field is what your player should switch on:

```jsx
function LessonVideo({ video }) {
    if (!video) return null;

    if (video.provider === 'self_hosted') {
        return <video src={video.url} controls />;
    }

    // YouTube, Vimeo, Wistia → iframe
    return <iframe src={video.embed} allowFullScreen />;
}
```

### 5. Progress — read

```http
GET /wp-json/lms/v1/progress
X-WP-Nonce: <nonce>            (browser-side)
Cookie: wordpress_logged_in_*   (browser cookie auth)

# OR for headless:
Authorization: Basic <base64(user:app-pwd)>
```

Response (`ProgressTransformer::transform_collection` at [ProgressTransformer.php:23](ProgressTransformer.php)):

```json
{
  "data": [
    {
      "user_id":      5,
      "course_id":    42,
      "lesson_id":    100,
      "status":       "completed",
      "completed_at": "2026-04-15 10:30:00",
      "created_at":   "2026-04-14 09:00:00",
      "updated_at":   "2026-04-15 10:30:00"
    }
  ]
}
```

`completed_at` is `null` for `not_started` / `in_progress` rows. Always feature-detect before formatting.

```http
GET /wp-json/lms/v1/progress/course/42
```

Returns the same shape filtered to one course, plus `course_progress`:

```json
{
  "data": [...],
  "course_progress": {
    "completed_count": 5,
    "total_lessons": 24,
    "percentage": 21
  }
}
```

`course_progress.total_lessons` reads from the completion snapshot if the user is at 100%, otherwise from the live course size — see backend skill for snapshot semantics.

### 6. Progress — write (mark a lesson)

```http
POST /wp-json/lms/v1/progress
Content-Type: application/json

{
  "course_id": 42,
  "lesson_id": 100,
  "status":    "completed"
}
```

Required fields (verified at [ProgressController.php:197-218](ProgressController.php)):

- `course_id`: int > 0
- `lesson_id`: int > 0
- `status`: one of `not_started`, `in_progress`, `completed`

Server-side validation:

- **Auth** (`401` if not logged in)
- **Access**: `AccessChecker::has_lesson_access($lesson_id, $user_id)` — `403 forbidden` otherwise
- **Cross-validation**: lesson's `_lw_lms_lesson_course_id` must equal the body's `course_id` — `400 invalid_request` otherwise (prevents marking lesson X as part of course Y when the lesson actually belongs to course Z)

Response on success:

```json
{
  "success": true,
  "data": {
    "user_id": 5, "course_id": 42, "lesson_id": 100,
    "status": "completed", "completed_at": "2026-04-15 10:30:00",
    "created_at": "...", "updated_at": "..."
  },
  "course_progress": { "completed_count": 6, "total_lessons": 24, "percentage": 25 }
}
```

Errors:

- `401 unauthorized` — not logged in
- `403 forbidden` — no lesson access
- `400 invalid_request` — lesson doesn't belong to the specified course
- `500 update_failed` — DB write failed

### 7. Attachment downloads

```http
GET /wp-json/lms/v1/download/250
Authorization: Basic ...
```

Returns the file as `Content-Disposition: attachment; filename="..."` (binary stream — NOT JSON). The endpoint:

- Looks up the attachment's parent (course or lesson) by scanning `_lw_lms_attachments` meta.
- Runs `AccessChecker::has_course_access()` / `has_lesson_access()`.
- Fires the `lw_lms_attachment_downloaded` action on success.
- Returns `403 forbidden` (with access info) or `404 not_found` if no access / file missing.

For the frontend, use the `download_url` field present in `attachments[]` of course/lesson responses — it's already a fully-qualified `rest_url('lms/v1/download/{id}')`.

```jsx
function AttachmentLink({ attachment }) {
    return (
        <a href={attachment.download_url} download>
            {attachment.title}
            <span>{formatBytes(attachment.size)}</span>
        </a>
    );
}
```

### 8. Authentication options

| Use case | Auth method | How |
|---|---|---|
| Logged-in user in browser (WP theme template, Gutenberg-block-rendered widget) | Cookie + nonce | `wp.apiFetch` natively. Or manually: `headers: { 'X-WP-Nonce': wpApiSettings.nonce }`, `credentials: 'same-origin'`. |
| Headless SPA (separate domain) | Application Password (Basic auth) | `Authorization: Basic ${btoa(`${user}:${appPwd}`)}`. WP 5.6+ native; per-app revocable. |
| Mobile app | Application Password OR JWT (third-party plugin) | App password is simplest; JWT if you need shorter-lifetime tokens. |
| No auth (browsing public catalog) | none | Public list / single-course endpoints work without auth. |

For SPA / mobile, the typical flow:

1. User logs in via your custom UI (call `wp-json/jwt-auth/v1/token` or similar) → receive token.
2. Store token (NOT in localStorage if XSS-sensitive — use httpOnly cookie via your auth plugin).
3. Include token in `Authorization` header on every progress / lesson / download request.
4. On 401, clear token and redirect to login.

### 9. Building a "course outline" component (typical pattern)

```jsx
function CourseOutline({ courseId }) {
    const [course, setCourse] = useState(null);

    useEffect(() => {
        fetch(`/wp-json/lms/v1/courses/${courseId}`)
            .then(r => r.json())
            .then(setCourse);
    }, [courseId]);

    if (!course) return <Skeleton />;

    return (
        <div>
            <h1>{course.title}</h1>

            {course.access.has_access
                ? <CourseContent html={course.content} progress={course.progress} />
                : <PurchaseGate access={course.access} />}

            {course.sections.map(section => (
                <Section key={section.id} section={section} />
            ))}

            {course.lessons_without_section.length > 0 && (
                <LessonGroup
                    title="Additional lessons"
                    lessons={course.lessons_without_section}
                />
            )}

            {course.attachments.length > 0 && (
                <Attachments items={course.attachments} />
            )}
        </div>
    );
}

function Section({ section }) {
    return (
        <section>
            <h2>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
            <ul>
                {section.lessons.map(lesson => (
                    <LessonRow key={lesson.id} lesson={lesson} />
                ))}
            </ul>
        </section>
    );
}

function LessonRow({ lesson }) {
    const className = `lesson ${lesson.completed ? 'completed' : ''} ${lesson.accessible ? '' : 'locked'}`;

    if (lesson.accessible) {
        return (
            <li className={className}>
                <Link to={`/lessons/${lesson.id}`}>
                    {lesson.title}
                    {lesson.preview && <Badge>Preview</Badge>}
                    {lesson.completed && <Icon name="check" />}
                </Link>
                {lesson.duration && <span>{lesson.duration}</span>}
            </li>
        );
    }

    return (
        <li className={className}>
            <Icon name="lock" />
            {lesson.title}
            {lesson.duration && <span>{lesson.duration}</span>}
        </li>
    );
}
```

### 10. Marking a lesson complete with optimistic UI

```jsx
async function markLessonComplete(courseId, lessonId) {
    // Optimistic: update UI first
    setLocalStatus(lessonId, 'completed');

    try {
        const response = await fetch('/wp-json/lms/v1/progress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': wpApiSettings.nonce,
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                course_id: courseId,
                lesson_id: lessonId,
                status: 'completed',
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            // Roll back optimistic update
            setLocalStatus(lessonId, 'in_progress');
            handleError(err);
            return;
        }

        const data = await response.json();
        // Update course progress percentage from server's authoritative response
        setCourseProgress(data.course_progress);
    } catch (e) {
        setLocalStatus(lessonId, 'in_progress');
        handleError(e);
    }
}
```

Catch the cross-validation error specifically (`400 invalid_request`) — a stale `course_id` in the client state is the typical cause.

## Critical rules

- **BETA plugin.** Snapshot response shapes in tests, review CHANGELOG before upgrading. Per-version deltas may rename or restructure fields.
- **`response.content` is conditionally present.** Branch on `response.access.has_access`, NOT on `response.content`.
- **`content_raw` is editor-only.** Don't render it on a public-facing page even when present — it's the unparsed Gutenberg / markdown source.
- **`sections` + `lessons_without_section` together form the full course outline.** Iterate both.
- **Per-lesson `accessible` is the UI gate.** Render locked lessons disabled, not hidden — preview / paid signals matter.
- **`POST /progress` requires `course_id` AND `lesson_id` AND server-side cross-validates.** Stale client state with wrong course_id → 400.
- **`completed_at: null`** for non-completed rows. Feature-detect.
- **`navigation.previous` / `.next`** is null for first / last lesson. Don't render disabled prev/next without checking.
- **`video: null`** when no video set. Don't unconditionally render a player.
- **Attachment `download_url`** is fully-qualified — use as-is, don't reconstruct.
- **Cookie + nonce auth** for in-browser logged-in flows; **Application Password** for headless / mobile.
- **403 on `/lessons/{id}`** is the access-denied signal — surface it to the UI as "purchase required" or "log in" depending on `is_user_logged_in()` (which the frontend can also derive from the absence of a logged-in cookie).
- **`download_url` returns binary, NOT JSON.** Don't `await response.json()` on it.

## Common mistakes

```jsx
// WRONG — assuming content always present
const html = course.content.split('\n');
// undefined.split → TypeError on the first non-purchased paid course

// RIGHT — branch on access
const html = course.access.has_access ? course.content : null;

// WRONG — only iterating sections
return course.sections.map(s => <Section section={s} />);
// Misses lessons_without_section.

// RIGHT — both
return (<>
    {course.sections.map(s => <Section section={s} />)}
    {course.lessons_without_section.length > 0 &&
        <LessonGroup title="More" lessons={course.lessons_without_section} />}
</>);

// WRONG — hiding inaccessible lessons
section.lessons.filter(l => l.accessible).map(...)
// Loses conversion signal: visitors can't see what they'd unlock.

// RIGHT — render locked
section.lessons.map(l => l.accessible
    ? <UnlockedLesson lesson={l} />
    : <LockedLesson lesson={l} />)

// WRONG — POST /progress with only lesson_id
fetch('/wp-json/lms/v1/progress', {
    method: 'POST',
    body: JSON.stringify({ lesson_id: 100, status: 'completed' }),
});
// 400 missing course_id.

// RIGHT
fetch('/wp-json/lms/v1/progress', {
    method: 'POST',
    body: JSON.stringify({ course_id: 42, lesson_id: 100, status: 'completed' }),
});

// WRONG — forgetting nonce in browser AJAX
fetch('/wp-json/lms/v1/progress', {
    method: 'POST',
    body: JSON.stringify({...}),
    // (no X-WP-Nonce, no credentials)
});
// 401 even though the user has a valid login cookie.

// RIGHT
fetch('/wp-json/lms/v1/progress', {
    method: 'POST',
    headers: { 'X-WP-Nonce': wpApiSettings.nonce, 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({...}),
});

// WRONG — formatting completed_at unconditionally
<time>{new Date(progress.completed_at).toLocaleDateString()}</time>
// Invalid Date for not_started / in_progress rows.

// RIGHT
{progress.completed_at && (
    <time>{new Date(progress.completed_at).toLocaleDateString()}</time>
)}

// WRONG — JSON-parsing the download endpoint
const blob = await fetch(attachment.download_url).then(r => r.json());
// Throws — response is binary, not JSON.

// RIGHT — let the browser handle it via <a download> OR fetch as blob
window.location.href = attachment.download_url;
// or for client-side blob handling:
const blob = await fetch(attachment.download_url, { credentials: 'same-origin' }).then(r => r.blob());

// WRONG — assuming `level` is always present
<span>{course.level.name}</span>
// TypeError when course has no level term.

// RIGHT
{course.level && <span>{course.level.name}</span>}

// WRONG — assuming progress is always present
<ProgressBar value={course.progress.percentage} />
// undefined when user is NOT logged in.

// RIGHT
{course.progress && <ProgressBar value={course.progress.percentage} />}

// WRONG — building download URLs by concatenating
const url = `/wp-json/lms/v1/download/${attachment.id}`;
// Loses the site's REST URL prefix (might be /wp-json or /index.php?rest_route=...).

// RIGHT — use the response's download_url
<a href={attachment.download_url}>...</a>

// WRONG — switching on video.url to detect provider
if (video.url.includes('youtube')) renderYouTube();
// Brittle; the parser already extracted the provider.

// RIGHT — switch on video.provider
switch (video.provider) {
    case 'youtube':
    case 'vimeo':
    case 'wistia':
        return <iframe src={video.embed} />;
    case 'self_hosted':
        return <video src={video.url} controls />;
}

// WRONG — building a paywall from access.type alone
if (course.access.type === 'paid') showPaywall();
// Logged-in users WITH access also have type === 'paid'.

// RIGHT — branch on has_access
if (course.access.type === 'paid' && !course.access.has_access) showPaywall();

// WRONG — assuming attachments always returned
<AttachmentList items={course.attachments} />
// For non-purchased paid courses, attachments is [] — but the conditional render still works.
// The footgun is treating attachments[] as the FULL list when it's filtered server-side.

// RIGHT — UI handles empty arrays gracefully
{course.attachments.length > 0 && <AttachmentList items={course.attachments} />}
```

## Cross-references

- Run **`lw-lms-backend-extend`** for the EXTENDER's surface — the actions and filters this REST API fires, plus how to add server-side logic that integrates with the consumer.
- Run **`lw-lms-abilities`** for AI-agent/admin ability calls (`lw-lms/*`), which are separate from learner-facing REST.
- Run **`wp-rest-api`** for general WP REST patterns — pagination, nonce / app password auth, error response conventions.
- Run **`wp-i18n-audit`** if you're translating the consumer-side strings — most "Purchase required", "Locked" labels live in YOUR frontend code, not the API responses.
- Run **`wp-plugin-assets-loading`** if your frontend is a script enqueued via `wp_enqueue_script` (theme-side or block-frontend rendering).

## What this skill does NOT cover

- **Separate frontend plugins/themes.** This skill documents the core `lw-lms` REST contract only; do not assume any unfinished companion frontend plugin exists.
- **Server-side rendering of LW LMS data in WP themes.** You CAN consume the REST API server-side via `WP_REST_Request` → `rest_do_request`, but the canonical pattern here is client-rendered. For server-side, use `get_posts` style queries against the lw-lms CPTs directly.
- **Specific frontend frameworks.** This skill is tech-stack-agnostic — React / Vue / Astro / Svelte / Solid all consume the same JSON. Framework-specific patterns (data fetching libs, server components, etc.) are out of scope.
- **Live progress sync** (websockets, SSE). The API is request-response; for real-time, layer your own pub/sub.
- **Offline / PWA support.** Out of scope; cache-warming and IndexedDB strategies are framework concerns.
- **Internationalization of API responses.** The API returns whatever language the post was written in (no translation layer); use a multilingual plugin (WPML, Polylang) on the WP side.
- **Custom WP REST routes that extend `lms/v1`.** Use `register_rest_route` in your companion plugin (cross-ref `wp-rest-api`); don't try to monkeypatch the controllers.
- **Building a course AUTHOR / instructor UI.** This skill is the LEARNER side. Authors use wp-admin metaboxes that the plugin ships.
- **Payment processing flow** (cart → checkout → access grant). That's WooCommerce's job; lw-lms grants access via the `AccessGranter` on `woocommerce_order_status_completed`. Frontend just shows "Buy this course" → WC product page.

## References

- REST namespace: [includes/Api/RestApi.php:25](RestApi.php) — `NAMESPACE = 'lms/v1'`. Routes registered on `rest_api_init` at line 33.
- Courses controller: [includes/Api/Controllers/CoursesController.php](CoursesController.php) — list at lines 70-128, single at 136-160; permission `__return_true` at 40, 51 (public).
- Lessons controller: [includes/Api/Controllers/LessonsController.php](LessonsController.php) — single at 57-92; 403 on no access at 81-87.
- Progress controller: [includes/Api/Controllers/ProgressController.php](ProgressController.php) — `check_auth` at 76-85 (401 if not logged in), update at 133-190 with cross-validation 148-156.
- Download controller: [includes/Api/Controllers/DownloadController.php](DownloadController.php) — access check 104-126, file serve 200-219.
- Course transformer: [includes/Api/Transformers/CourseTransformer.php](CourseTransformer.php) — list shape 31-51, full shape 60-101 (conditional content at 80-88).
- Lesson transformer: [includes/Api/Transformers/LessonTransformer.php](LessonTransformer.php) — full shape 28-52, video shape from `_lw_lms_video` meta, navigation 146-175.
- Progress transformer: [includes/Api/Transformers/ProgressTransformer.php](ProgressTransformer.php) — collection 23-25, single 33-43.
- Access checker (verified cascade): [includes/Access/AccessChecker.php](AccessChecker.php) — open/free/paid logic at 33-79, lesson access at 88-116.
- Video parser: [includes/Meta/VideoParser.php](VideoParser.php) — provider auto-detection.
- README endpoints summary: [README.md](README.md) (partial, this skill is more complete).
