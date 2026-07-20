---
name: learndash-woocommerce-access
description: >-
  Build or audit the LearnDash WooCommerce integration that grants/revokes
  LearnDash course and group access from WooCommerce products, orders,
  refunds, subscriptions, switches, and order-item changes. Use when code
  mentions learndash-woocommerce, _related_course, _related_group,
  LearnDash\WooCommerce\Settings\Status_Access,
  learndash_woocommerce_enrollment_status_settings,
  _learndash_woocommerce_enrolled_courses_access_counter,
  add_course_access, remove_course_access, add_subscription_course_access,
  HPOS compatibility, silent enrollment queue, or variable product/variation
  course links.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "learndash-woocommerce"
  wp-skills-plugin-version-tested: "LearnDash WooCommerce 2.0.2 + LearnDash LMS 5.1.6.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-07"
---

# LearnDash WooCommerce access

Use this when WooCommerce products, orders, subscriptions, refunds, or product
variations must grant or revoke LearnDash course/group access.

The LearnDash WooCommerce bridge is not just "on completed order call
`ld_update_course_access()`". It tracks product relations, variable product
relations, configurable order/subscription statuses, partial refunds,
subscription switches, order item mutations, access expiration, silent queued
enrollment, and a per-user counter so one access source does not remove another.

## When to use this skill

Trigger when ANY of these appears:

- Plugin path/name `learndash-woocommerce`.
- Product meta `_related_course` or `_related_group`.
- User meta `_learndash_woocommerce_enrolled_courses_access_counter`.
- `LearnDash\WooCommerce\Settings\Status_Access`.
- Options `learndash_woocommerce_enrollment_status_settings`,
  `learndash_woocommerce_silent_course_enrollment_queue`, or
  `learndash_woocommerce_disable_access_removal_on_expiration`.
- Woo hooks around order status, refund, subscription status, subscription
  switch, order item added/deleted, customer change, or HPOS.

## Product relation model

LearnDash WooCommerce stores related LearnDash objects on the Woo product or
variation:

- `_related_course` is an array of LearnDash course IDs.
- `_related_group` is an array of LearnDash group IDs.
- Simple products store relations on the product ID.
- Variable and variable-subscription parents clear parent-level relations and
  store relations on each variation.
- Runtime order processing checks the variation ID first; if no variation ID is
  present, it checks the product ID.

When building a compatible importer/sync, preserve that shape:

```php
update_post_meta( $product_or_variation_id, '_related_course', array_map( 'absint', $course_ids ) );
update_post_meta( $product_or_variation_id, '_related_group', array_map( 'absint', $group_ids ) );
```

Do not store a scalar ID and do not attach courses only to a variable parent if
the product is sold through variations.

## Enrollment status settings

The bridge decides which Woo statuses grant or revoke access through
`LearnDash\WooCommerce\Settings\Status_Access`. That class reads the LearnDash
Woo settings option `learndash_woocommerce_enrollment_status_settings`.

Default grant statuses in 2.0.2:

- Orders: `wc-processing`, `wc-completed`.
- Subscriptions: `wc-active`, `wc-pending-cancel`, `wc-on-hold`.

The plugin hooks dynamically:

- Granted order statuses call course/group enrollment.
- Denied order statuses remove course/group access.
- `refunded` is handled through `woocommerce_order_refunded` so partial refunds
  can remove access only for refunded items.
- Granted subscription statuses add subscription course/group access.
- Denied subscription statuses remove it, except expired subscriptions can be
  skipped when `learndash_woocommerce_disable_access_removal_on_expiration` is
  `yes`.

Do not hard-code `completed` as the only access status in a compatibility
plugin. Read the status settings or hook after the bridge's own status actions.

## Order lifecycle behavior

The bridge grants/removes access from several surfaces:

- Order status changes.
- Partial and full refunds.
- Order deletion.
- Customer changes on processing/completed orders.
- New/deleted order items.
- Subscription status changes.
- Subscription renewal billing-cycle completion.
- Subscription switches.

It declares WooCommerce HPOS compatibility during `before_woocommerce_init`, so
compatible plugins should use Woo order CRUD (`wc_get_order()`,
`WC_Order::get_items()`, order item methods) rather than direct postmeta SQL.

## Access counter behavior

The user meta `_learndash_woocommerce_enrolled_courses_access_counter` prevents
one purchase/refund from revoking access that is still granted by another order
or subscription.

For courses:

- `update_add_course_access()` increments the counter.
- It calls `ld_update_course_access()` only if the user is not already enrolled,
  or if the existing access has expired and must be reset.
- `update_remove_course_access()` decrements the counter and revokes direct
  course access only when no counter entry remains for that course.

For groups:

- `update_add_group_access()` increments the counter and calls
  `ld_update_group_access()` only when the user is not already in the group.
- `update_remove_group_access()` decrements and removes group access only when
  no counter entry remains for that group.

If a custom plugin bypasses the bridge and calls `ld_update_course_access()` on
every order/refund, it can remove access while another valid order still exists.
Use LearnDash Woo's relationship/status model when the access source is Woo.

## Expiration and paid date

When granting from an order, the bridge checks whether the LearnDash course or
group product access already expired relative to the Woo order paid date. It can
remove instead of add access if the product's access window has elapsed.

When a course has no product start date, the bridge can set direct course
`access_from` from the order paid date through LearnDash's access-date API.
This matters for historical imports and delayed processing.

## Silent enrollment queue

When an order contains many related courses/groups, the bridge can enqueue work
in `learndash_woocommerce_silent_course_enrollment_queue` and process it from
its cron hook. The queue is intentionally non-autoloaded by the upgrade routine.

Do not assume access is synchronous for very large orders. If a custom workflow
needs immediate post-order access, inspect the queue and the bridge threshold
filter `learndash_woocommerce_process_silent_course_enrollment_queue_count`.

## Integration patterns

For a plugin that sells LearnDash access through normal Woo products:

1. Store `_related_course` and/or `_related_group` on the exact product or
   variation that is sold.
2. Let Woo order/subscription status transitions trigger LearnDash Woo.
3. Use Woo CRUD and HPOS-safe order APIs.
4. Avoid direct LearnDash grant/revoke calls unless the access source is not a
   Woo order/subscription handled by the bridge.
5. If you must reconcile access, honor the bridge counter before revoking.

For an admin/import tool:

1. Resolve whether the SKU maps to a product or variation.
2. Save arrays of integer LearnDash IDs in the expected meta keys.
3. Trigger normal Woo order status transitions or run a deliberate
   reconciliation command.
4. Log skipped guest orders, invalid users, missing courses/groups, and queued
   enrollments.

## Common mistakes to reject

- Hooking only `woocommerce_order_status_completed` and ignoring processing,
  refunds, subscription statuses, item changes, and settings.
- Reading relations only from the parent variable product.
- Storing scalar `_related_course` or `_related_group` values.
- Calling `ld_update_course_access()` directly on refund without checking the
  LearnDash Woo access counter.
- Assuming group access and course access use the same LearnDash helper.
- Using direct SQL against order posts/postmeta when HPOS is enabled.
- Allowing guest checkout for products that grant LearnDash access without a
  clear account-linking flow.

## Cross-references

- Use `learndash-course-access` for final course access checks and direct
  course grant/revoke behavior.
- Use `learndash-group-access` for group membership and group-course relation
  behavior.
- Use WooCommerce skills for generic HPOS, order lifecycle, subscriptions, and
  payment gateway behavior.

## References

Validated against LearnDash WooCommerce 2.0.2 and LearnDash LMS 5.1.6.1 local
source:

- `learndash-woocommerce/learndash_woocommerce.php`
- `learndash-woocommerce/includes/class-learndash-woocommerce.php`
- `learndash-woocommerce/src/App/Settings/Status_Access.php`
- `learndash-woocommerce/src/App/Admin/Pages/Sections/Settings_Enrollment_Status.php`
- `learndash-woocommerce/includes/class-cron.php`
- `learndash-woocommerce/includes/class-upgrade.php`
- `sfwd-lms/includes/course/ld-course-user-functions.php`
- `sfwd-lms/includes/ld-groups.php`
- Official documentation: <https://developers.learndash.com/>
- Verified source paths:
  - `wp-content/plugins/learndash-woocommerce/src/App/Modules/Retroactive_Access_Tool/Handler.php`
