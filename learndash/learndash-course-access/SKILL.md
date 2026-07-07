---
name: learndash-course-access
description: >-
  Build or audit LearnDash course access and enrollment logic. Use when code
  mentions sfwd_lms_has_access, ld_update_course_access,
  ld_course_access_from, ld_course_access_from_update,
  ld_course_access_expired, learndash_user_get_enrolled_courses,
  course_*_access_from, open/free/paynow/closed course price types, access
  expiration, course start/end dates, course access activity, or custom
  course-gated templates.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: sfwd-lms
plugin-version-tested: "5.1.6.1"
php-min: "7.4"
last-updated: "2026-07-07"
docs:
  - https://developers.learndash.com/
source-refs:
  - wp-content/plugins/sfwd-lms/includes/course/ld-course-user-functions.php
  - wp-content/plugins/sfwd-lms/includes/ld-users.php
  - wp-content/plugins/sfwd-lms/src/Core/Models/Product.php
  - wp-content/plugins/sfwd-lms/includes/course/ld-course-steps-functions.php
  - wp-content/plugins/sfwd-lms/includes/classes/class-ldlms-model-course-steps.php
---

# LearnDash course access

Use this when a plugin, theme, migration, checkout bridge, import, or custom
frontend needs to decide whether a user can access a LearnDash course or must
grant/revoke direct course enrollment.

Do not reduce LearnDash access to one usermeta key. In LearnDash 5.1.6.1, course
access can come from direct enrollment, group enrollment, open courses, sample
steps, admin auto-enroll, free/paynow settings, start/end dates, expiration
rules, and legacy access-list mode.

## When to use this skill

Trigger when ANY of these appears:

- `sfwd_lms_has_access()`, `ld_update_course_access()`,
  `ld_course_access_from()`, `ld_course_access_from_update()`,
  `ld_course_access_expired()`, `learndash_get_users_for_course()`, or
  `learndash_user_get_enrolled_courses()`.
- Usermeta keys like `course_123_access_from`,
  `learndash_course_123_enrolled_at`, or `learndash_course_expired_123`.
- A custom course page, lesson gate, import, CRM sync, Woo bridge, membership
  bridge, or REST endpoint that grants/removes course access.
- A bug report says "user is enrolled but cannot access", "group users cannot
  see course", "expired users still appear", or "open course behaves weirdly".

## Access decision chain

`sfwd_lms_has_access( $post_id, $user_id )` is the canonical yes/no gate.
It resolves the course for the passed post ID and then applies these broad
rules:

1. No related course can mean access allowed for non-course content.
2. Missing course post/status means no access.
3. Admin auto-enroll, sample steps, and open courses can grant access without
   usermeta enrollment.
4. Some free/paynow configurations can grant access without an explicit user.
5. Direct access uses `course_{$course_id}_access_from` usermeta.
6. Group access is checked through `learndash_user_group_enrolled_to_course()`.
7. Direct non-group access also respects the `Product` model start/end window.
8. Final access can be revoked by `ld_course_access_expired()`.
9. The result is filterable through `sfwd_lms_has_access`.

If the task is authorization, call the access API. Do not query only
`course_{$course_id}_access_from`, because group and open-course access will be
missed.

## Grant and revoke correctly

Modern LearnDash exposes `LearnDash\Core\Models\Product` for course/group
products. It delegates to the public access helpers and applies product-level
filters.

```php
use LearnDash\Core\Models\Product;

$product = Product::find( $course_id );

if ( $product ) {
    $product->enroll( $user_id );
    // $product->unenroll( $user_id );
}
```

The lower-level public helper is still the important compatibility surface:

```php
ld_update_course_access( $user_id, $course_id );        // grant
ld_update_course_access( $user_id, $course_id, true );  // revoke
```

`ld_update_course_access()` does more than write usermeta:

- On grant, it writes `course_{$course_id}_access_from` if missing.
- It records `learndash_course_{$course_id}_enrolled_at` as historical
  enrollment time.
- It creates/updates LearnDash user activity with `activity_type = access`.
- It fires `learndash_update_course_access`.
- It deletes the `learndash_user_courses_{$user_id}` transient.
- On revoke, it intentionally does not delete
  `learndash_course_{$course_id}_enrolled_at`, because reports use it.

Use `ld_course_access_from_update( $course_id, $user_id, $timestamp )` when the
task is changing the access start timestamp. It updates both access activity and
the direct access usermeta. Do not write that meta directly unless you are doing
a one-off repair and also handle cache/activity consequences.

## Read access state

Use the smallest API that matches the question:

- "Can this user access this course/lesson/topic now?" ->
  `sfwd_lms_has_access( $post_id, $user_id )`.
- "When did direct course access start?" ->
  `ld_course_access_from( $course_id, $user_id )`.
- "When does access expire?" ->
  `ld_course_access_expires_on( $course_id, $user_id )`.
- "Which courses is this user enrolled in?" ->
  `learndash_user_get_enrolled_courses( $user_id )`.
- "Which users have this course?" ->
  `learndash_get_users_for_course( $course_id )`.

Important query caveats:

- Open courses can return all users from `learndash_get_users_for_course()`
  unless admin users are excluded by the query settings.
- `learndash_user_get_enrolled_courses()` merges auto-enroll, open courses,
  legacy access-list courses, direct access meta, and group courses.
- In 5.1.6.1, the `$bypass_transient` parameter in
  `learndash_user_get_enrolled_courses()` is effectively forced to true before
  the function rebuilds the list. Do not build logic that depends on a cached
  response from that parameter.

## Expiration and start/end dates

Course expiration is handled by `ld_course_access_expired()` and
`ld_course_access_expires_on()`. When an access record is expired and processing
is allowed by `learndash_process_user_course_access_expire`, LearnDash marks
`learndash_course_expired_{$course_id}`, revokes direct course access, fires
`learndash_user_course_access_expired`, and may delete progress depending on
course settings.

The `Product` model adds course start/end behavior:

- `Product::has_started()` and `Product::has_ended()` affect direct enrolled
  paid/closed courses.
- Open products are not blocked by product start/end dates.
- Extended course access can override normal end-date behavior.
- Group-derived access can supply the effective start timestamp for a user.

If a custom plugin grants access from an order/import and needs a historical
date, set the access-from date through `ld_course_access_from_update()` after
granting access.

## Course structure is not access

Creating `sfwd-lessons`, `sfwd-topic`, or `sfwd-quiz` posts does not attach
them to a course structure. Course step order lives in LearnDash's course steps
model and related metadata. Use the course step APIs or REST `/steps` endpoint
when a task must build a usable course outline.

For course outline reads, use:

- `learndash_get_course_steps( $course_id )`
- `learndash_course_get_steps_count( $course_id )`
- `learndash_course_get_steps_by_type( $course_id, $post_type )`
- `learndash_course_get_children_of_step( $course_id, $step_id )`

## Common mistakes to reject

- Checking only `course_{$course_id}_access_from` to decide access.
- Granting/revoking by direct `update_user_meta()` or `delete_user_meta()`.
- Removing `learndash_course_{$course_id}_enrolled_at` during unenroll.
- Treating group enrollment as direct course enrollment.
- Assuming a course REST create/update request also creates the course outline.
- Ignoring course access expiration after a positive direct-meta check.
- Hooking custom logic only to post save when the real access source is Woo,
  REST, group changes, imports, or background jobs.

## Cross-references

- Use `learndash-group-access` for group membership, group-course links,
  hierarchical groups, and group leaders.
- Use `learndash-woocommerce-access` for Woo order/subscription/refund driven
  enrollment and LearnDash WooCommerce counters.
- Use `learndash-rest-api` for REST endpoints that enroll users, update course
  steps, or expose course data to headless clients.

## References

Validated against LearnDash LMS 5.1.6.1 local source:

- `includes/course/ld-course-user-functions.php`
- `includes/ld-users.php`
- `src/Core/Models/Product.php`
- `includes/course/ld-course-steps-functions.php`
- `includes/classes/class-ldlms-model-course-steps.php`
