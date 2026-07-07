---
name: learndash-group-access
description: >-
  Build or audit LearnDash group membership, group-course access, group
  leaders, and hierarchical group behavior. Use when code mentions
  ld_update_group_access, ld_update_course_group_access,
  learndash_get_users_group_ids, learndash_get_groups_user_ids,
  learndash_group_enrolled_courses, learndash_user_group_enrolled_to_course,
  learndash_is_user_in_group, learndash_group_users_*,
  learndash_group_enrolled_*, group_*_access_from, or group leader access.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: sfwd-lms
plugin-version-tested: "5.1.6.1"
php-min: "7.4"
last-updated: "2026-07-07"
docs:
  - https://developers.learndash.com/
source-refs:
  - wp-content/plugins/sfwd-lms/includes/ld-groups.php
  - wp-content/plugins/sfwd-lms/includes/course/ld-course-user-functions.php
  - wp-content/plugins/sfwd-lms/src/Core/Models/Product.php
  - wp-content/plugins/sfwd-lms/includes/rest-api/v2/class-ld-rest-groups-courses-controller.php
  - wp-content/plugins/sfwd-lms/includes/rest-api/v2/class-ld-rest-groups-users-controller.php
  - wp-content/plugins/sfwd-lms/includes/rest-api/v2/class-ld-rest-users-groups-controller.php
---

# LearnDash group access

Use this when code needs to enroll users into groups, attach courses to groups,
manage group leaders, or answer "does this user get course access through a
group?"

LearnDash groups are not just taxonomy terms and not just post meta on a group.
In 5.1.6.1 the access model is three separate relationships:

- User -> group membership.
- Group -> course access.
- Group leader -> administrated group.

Course access through a group exists only when the user is in the group and the
group is attached to the course, then the group product start/end rules allow
access.

## When to use this skill

Trigger when ANY of these appears:

- `ld_update_group_access()`, `ld_update_course_group_access()`,
  `ld_update_leader_group_access()`, `learndash_is_user_in_group()`,
  `learndash_user_group_enrolled_to_course()`, or
  `learndash_get_users_group_ids()`.
- Usermeta keys `learndash_group_users_{$group_id}`,
  `group_{$group_id}_access_from`,
  `learndash_group_{$group_id}_enrolled_at`, or
  `learndash_group_leaders_{$group_id}`.
- Course postmeta keys `learndash_group_enrolled_{$group_id}` or
  `learndash_group_{$group_id}_enrolled_at`.
- Custom group dashboards, group leader portals, imports, CRMs, Woo bridges,
  memberships, cohort sync, or REST endpoints.

## Relationship map

### User -> group

The direct user-group relation is stored on the user:

- `learndash_group_users_{$group_id}` stores the group ID.
- `group_{$group_id}_access_from` stores the access start timestamp.
- `learndash_group_{$group_id}_enrolled_at` is historical enrollment time.

Use:

```php
ld_update_group_access( $user_id, $group_id );        // grant
ld_update_group_access( $user_id, $group_id, true );  // revoke
```

Or use the model wrapper:

```php
use LearnDash\Core\Models\Product;

$group_product = Product::find( $group_id );

if ( $group_product ) {
    $group_product->enroll( $user_id );
}
```

`ld_update_group_access()` creates access activity for courses currently
attached to the group, fires `ld_added_group_access` or
`ld_removed_group_access`, and clears user group/course transients.

### Group -> course

The group-course relation is stored on the course post:

- `learndash_group_enrolled_{$group_id}` stores the timestamp when the course
  was added to the group.
- `learndash_group_{$group_id}_enrolled_at` is a historical timestamp kept for
  reporting and should not be casually deleted.

Use:

```php
ld_update_course_group_access( $course_id, $group_id );        // attach
ld_update_course_group_access( $course_id, $group_id, true );  // detach
```

For whole-list replacement, use the diff helpers:

- `learndash_set_group_enrolled_courses( $group_id, $course_ids )`
- `learndash_set_course_groups( $course_id, $group_ids )`

They compute additions/removals and call `ld_update_course_group_access()` for
each delta.

### Leader -> group

Group leaders are not the same as group members. A leader can administer a group
without being enrolled as a learner.

Use:

```php
ld_update_leader_group_access( $leader_user_id, $group_id );
ld_update_leader_group_access( $leader_user_id, $group_id, true );
```

Read with:

- `learndash_is_group_leader_user( $user_id )`
- `learndash_get_administrators_group_ids( $leader_user_id )`

## Reading group access

Use the API that matches the question:

- User belongs to group now:
  `learndash_is_user_in_group( $user_id, $group_id )`.
- User's direct and inherited group IDs:
  `learndash_get_users_group_ids( $user_id )`.
- Group's users:
  `learndash_get_groups_user_ids( $group_id )` or
  `learndash_get_groups_users( $group_id )`.
- Group's courses:
  `learndash_group_enrolled_courses( $group_id )`.
- Course's groups:
  `learndash_get_course_groups( $course_id )`.
- User gets a course through a group:
  `learndash_user_group_enrolled_to_course( $user_id, $course_id )`.
- Effective group-course access timestamp:
  `learndash_user_group_enrolled_to_course_from( $user_id, $course_id )`.

Do not decide group course access by checking one meta key. The user must be in
the group, the group must be attached to the course, and the group `Product`
model must allow access.

## Hierarchical groups

When hierarchical groups are enabled, `learndash_get_users_group_ids()` expands
the returned group IDs through validated child groups. That means:

- A direct meta scan can miss inherited access.
- `learndash_is_user_in_group()` can return true because the expanded group list
  contains the group.
- Custom SQL that only checks `learndash_group_users_{$group_id}` is not enough
  for access decisions.

If the task is about reporting direct memberships, say so explicitly. If the
task is about access, use LearnDash's group APIs.

## Cache and transient caveats

Some older function signatures still expose `$bypass_transient`, but LearnDash
5.x has removed or narrowed transient behavior in several group helpers:

- `learndash_group_enrolled_courses()` no longer uses its old transient.
- `learndash_get_course_groups()` no longer uses its old transient.
- `learndash_get_groups_user_ids()` keeps the parameter for compatibility, but
  the current implementation does not rely on the old cached query.
- `ld_update_group_access()` clears `learndash_user_groups_{$user_id}` and
  `learndash_user_courses_{$user_id}`.

Do not add custom long-lived caches unless the invalidation story covers user
membership changes, group-course changes, hierarchy changes, and group leader
changes.

## Common mistakes to reject

- Writing `learndash_group_users_*` or `learndash_group_enrolled_*` meta
  directly instead of using the LearnDash helpers.
- Storing course IDs on the group post instead of attaching the group on the
  course postmeta.
- Assuming group leaders are enrolled learners.
- Removing historical `learndash_group_{$group_id}_enrolled_at`.
- Checking only direct membership when hierarchical groups can grant inherited
  access.
- Forgetting that group access can make `sfwd_lms_has_access()` true even when
  the user has no direct `course_{$course_id}_access_from`.

## Cross-references

- Use `learndash-course-access` for final course access decisions, expiration,
  direct course enrollment, and access-from dates.
- Use `learndash-woocommerce-access` when Woo products/orders/subscriptions
  grant LearnDash group access.
- Use `learndash-rest-api` for REST routes that manage group users, group
  courses, or user groups.

## References

Validated against LearnDash LMS 5.1.6.1 local source:

- `includes/ld-groups.php`
- `includes/course/ld-course-user-functions.php`
- `src/Core/Models/Product.php`
- `includes/rest-api/v2/class-ld-rest-groups-courses-controller.php`
- `includes/rest-api/v2/class-ld-rest-groups-users-controller.php`
- `includes/rest-api/v2/class-ld-rest-users-groups-controller.php`
