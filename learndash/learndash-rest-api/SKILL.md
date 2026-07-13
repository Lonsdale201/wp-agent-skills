---
name: learndash-rest-api
description: >-
  Build or audit LearnDash REST API integrations for courses, lessons, topics,
  quizzes, groups, users, course steps, enrollments, group memberships,
  progress, and the modern LearnDash REST manifest/OpenAPI docs. Use when code
  mentions ldlms/v2, learndash/v1, LearnDash_REST_API,
  learndash_rest_api_enabled, learndash-rest-api-controllers,
  sfwd-courses REST routes, /steps, /users, /groups, /course-progress,
  Learndash-Experimental-Rest-Api, or headless LearnDash clients.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "sfwd-lms"
  wp-skills-plugin-version-tested: "5.1.6.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-07"
---

# LearnDash REST API

Use this when building or reviewing a REST/headless integration for LearnDash.
Prefer source-verified routes and schemas over guessed endpoint shapes.

LearnDash 5.1.6.1 exposes two relevant REST surfaces:

- Classic LearnDash content/relationship endpoints under `ldlms/v2`.
- Newer manifest/OpenAPI/documentation endpoints under `learndash/v1`.

The v2 endpoints are still the practical surface for course, group, user,
progress, and course-steps CRUD. The `learndash/v1` manifest/docs surface is the
discovery contract and includes newer endpoint metadata.

## When to use this skill

Trigger when ANY of these appears:

- `/wp-json/ldlms/v2/`, `/wp-json/learndash/v1/`, `LearnDash_REST_API`,
  `learndash_rest_api_enabled`, or `learndash-rest-api-controllers`.
- REST work around `sfwd-courses`, `sfwd-lessons`, `sfwd-topic`, `sfwd-quiz`,
  `groups`, users, course progress, quiz progress, or assignments.
- Headless app needs course outlines, enrollments, group memberships, or
  progress data.
- API client gets 401/403, missing endpoint, wrong rest base, or malformed
  `/steps` payload errors.

## Enablement and namespaces

REST availability requires both:

- Constant `LEARNDASH_REST_API_ENABLED` true. The default is true.
- LearnDash REST settings section value `enabled = yes`.

`LearnDash_REST_API::enabled()` also exposes the
`learndash_rest_api_enabled` filter.

Classic LearnDash REST namespace defaults to `ldlms`; v2 routes use
`ldlms/v2`. The namespace constant is `LEARNDASH_REST_API_NAMESPACE`.

Do not hard-code every route base. LearnDash settings allow REST base overrides
for courses, lessons, topics, quizzes, groups, users, and relation subroutes.

Default important v2 bases:

- Courses: `/wp-json/ldlms/v2/sfwd-courses`
- Course steps: `/wp-json/ldlms/v2/sfwd-courses/{id}/steps`
- Course users: `/wp-json/ldlms/v2/sfwd-courses/{id}/users`
- Course groups: `/wp-json/ldlms/v2/sfwd-courses/{id}/groups`
- Groups: `/wp-json/ldlms/v2/groups`
- Group courses: `/wp-json/ldlms/v2/groups/{id}/courses`
- Group users: `/wp-json/ldlms/v2/groups/{id}/users`
- Users courses: `/wp-json/ldlms/v2/users/{id}/courses`
- Users groups: `/wp-json/ldlms/v2/users/{id}/groups`
- User course progress: `/wp-json/ldlms/v2/users/{id}/course-progress`

## Discovery workflow

For `learndash/v1`, do not guess parameters. The local source declares the
manifest as the mandatory discovery workflow.

Use:

- `GET /wp-json/learndash/v1/manifest`
- Follow each endpoint `href` to fetch the exact JSON schema.
- Or inspect `GET /wp-json/learndash/v1/docs/openapi`.

Most `learndash/v1` endpoints are experimental and require:

```http
Learndash-Experimental-Rest-Api: allow
```

The manifest and OpenAPI documentation endpoints are public and not
experimental in 5.1.6.1.

## Course steps endpoint

Creating lesson/topic/quiz posts is not enough to build a course outline.
Update the course steps relationship.

Endpoint:

```text
GET/POST /wp-json/ldlms/v2/sfwd-courses/{course_id}/steps
```

Read permission:

- Anonymous users are denied unless the filter
  `learndash_rest_course_steps_allow_anonymous_read` returns true.
- Admin users can read.
- Other logged-in users are denied by the controller.

Update permission:

- Requires `edit_courses`.

Expected update body shape is an object keyed by LearnDash post types. Lesson,
topic, and quiz IDs are object keys, not list items:

```json
{
  "sfwd-lessons": {
    "123": {
      "sfwd-topic": {
        "456": {
          "sfwd-quiz": {
            "789": {}
          }
        }
      },
      "sfwd-quiz": {}
    }
  },
  "sfwd-quiz": {
    "999": {}
  }
}
```

Common bug: sending `[123, 456]` arrays. The controller expects nested objects
where IDs are keys.

## Enrollment and relation endpoints

Course users:

- `GET /ldlms/v2/sfwd-courses/{id}/users`
- `POST /ldlms/v2/sfwd-courses/{id}/users` with `user_ids`
- `DELETE /ldlms/v2/sfwd-courses/{id}/users` with `user_ids`

The controller calls `ld_update_course_access()` for enrollment and rejects open
courses with `learndash_rest_rejected_course_open`. It can skip admin users
when admin auto-enroll is enabled.

User courses:

- `GET/POST/DELETE /ldlms/v2/users/{id}/courses`
- Individual course relation routes can update enrollment dates with
  `enrolled_at`.

Group courses:

- `GET/POST/DELETE /ldlms/v2/groups/{id}/courses` with `course_ids`.
- Mutations call `ld_update_course_group_access()`.

Group users:

- `GET/POST/DELETE /ldlms/v2/groups/{id}/users` with `user_ids`.
- Mutations call `ld_update_group_access()`.

User groups:

- `GET/POST/DELETE /ldlms/v2/users/{id}/groups` with `group_ids`.

Permission model:

- Most relation reads/writes require LearnDash admin permissions.
- Group leaders can read users for groups they administer.
- Group leaders are not generally allowed to mutate group users through these
  controllers.

## Extending REST safely

LearnDash's v2 REST loader registers controllers on `rest_api_init` and exposes
the controller list through `learndash-rest-api-controllers`. Prefer adding a
separate namespaced WP REST controller for custom app APIs unless the task
specifically needs to extend LearnDash's own route catalog.

For custom fields on LearnDash posts:

- Register real post meta with `show_in_rest` when possible.
- For LearnDash metabox settings, inspect `register_rest_fields()` in the v2
  posts controller and the specific post-type controller before inventing field
  names.
- Keep permission callbacks explicit. Do not expose course progress or
  enrollment writes publicly.

## Headless integration checklist

1. Check REST is enabled in constants and LearnDash settings.
2. Discover actual bases from settings or manifest/docs instead of assuming
   defaults on customized sites.
3. Authenticate with Application Password, cookie+nonce, OAuth/JWT layer, or a
   site-specific auth plugin.
4. Fetch course posts and then fetch `/steps` for the outline.
5. Use relation endpoints for enrollment/group changes, not raw usermeta.
6. Use progress endpoints for progress, not direct activity-table writes.
7. Respect pagination, batch limits, and per-item success/failure responses.
8. Cache read responses carefully and invalidate on post, access, group, and
   progress mutations.

## Common mistakes to reject

- Guessing `learndash/v1` request bodies without first reading manifest `href`
  details.
- Hard-coding route bases when LearnDash settings can change them.
- Creating lessons/topics but never updating course steps.
- Sending arrays to `/steps` instead of nested ID-keyed objects.
- Trying to enroll users into an open course through the course-users endpoint.
- Assuming group leaders can mutate all group REST relations.
- Exposing a custom public route that returns locked course content without
  checking `sfwd_lms_has_access()`.

## Cross-references

- Use `learndash-course-access` for final access checks and direct course
  enrollment semantics.
- Use `learndash-group-access` for group membership and group-course relation
  behavior.
- Use `learndash-woocommerce-access` for Woo-driven access changes.
- Use `wp-rest-api` for general WordPress REST security and schema patterns.

## References

Validated against LearnDash LMS 5.1.6.1 local source:

- `includes/rest-api/class-ld-rest-api.php`
- `includes/settings/settings-sections/class-ld-settings-section-general-rest-api.php`
- `includes/rest-api/v2/class-ld-rest-courses-steps-controller.php`
- `includes/rest-api/v2/class-ld-rest-courses-users-controller.php`
- `includes/rest-api/v2/class-ld-rest-users-courses-controller.php`
- `includes/rest-api/v2/class-ld-rest-groups-courses-controller.php`
- `includes/rest-api/v2/class-ld-rest-groups-users-controller.php`
- `includes/rest-api/v2/class-ld-rest-users-groups-controller.php`
- `src/Core/Modules/REST/V1/`
- `src/Core/Modules/REST/Documentation_Migration/`
- Official documentation: <https://developers.learndash.com/>
- Verified source paths:
  - `wp-content/plugins/sfwd-lms/includes/rest-api/v2/class-ld-rest-posts-controller.php`
  - `wp-content/plugins/sfwd-lms/includes/rest-api/v2/class-ld-rest-courses-controller.php`
