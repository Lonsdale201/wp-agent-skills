---
name: lw-lms-backend-extend
description: Backend extension contract for LW LMS v1.5.1. Use when extending enrollment, access, progress, certificates, automation, analytics, settings tabs, companion-plugin logic, `lw_lms_after_grant`, `lw_lms_after_revoke`, `lw_lms_pre_grant`, `AccessChecker`, `AccessRepository`, `AccessQueries`, `ProgressRepository`, `ProgressQueries`, `CompletionTracker`, `wp_lms_progress`, `wp_lms_access`, `_lw_lms_*` meta, or WooCommerce Memberships/Subscriptions access.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-lms
plugin-version-tested: "1.5.1"
php-min: "8.1"
last-updated: "2026-06-15"
docs:
  - https://github.com/lwplugins/lw-lms
source-refs:
  - wp-content/plugins/lw-lms/lw-lms.php
  - wp-content/plugins/lw-lms/includes/Plugin.php
  - wp-content/plugins/lw-lms/includes/Activator.php
  - wp-content/plugins/lw-lms/includes/Options.php
  - wp-content/plugins/lw-lms/includes/Admin/SettingsPage.php
  - wp-content/plugins/lw-lms/includes/Admin/Settings/TabInterface.php
  - wp-content/plugins/lw-lms/includes/Admin/UserProfile.php
  - wp-content/plugins/lw-lms/includes/Admin/UserProfile/EnrollmentHandler.php
  - wp-content/plugins/lw-lms/includes/Meta/CourseMeta.php
  - wp-content/plugins/lw-lms/includes/Meta/LessonMeta.php
  - wp-content/plugins/lw-lms/includes/Meta/SubscriptionVariationMeta.php
  - wp-content/plugins/lw-lms/includes/Access/AccessChecker.php
  - wp-content/plugins/lw-lms/includes/Access/AccessRepository.php
  - wp-content/plugins/lw-lms/includes/Access/AccessQueries.php
  - wp-content/plugins/lw-lms/includes/Access/AccessGranter.php
  - wp-content/plugins/lw-lms/includes/Access/AccessTable.php
  - wp-content/plugins/lw-lms/includes/Access/WooCommerceChecker.php
  - wp-content/plugins/lw-lms/includes/Access/SubscriptionVariationChecker.php
  - wp-content/plugins/lw-lms/includes/Access/MembershipChecker.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressRepository.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressQueries.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressCalculator.php
  - wp-content/plugins/lw-lms/includes/Progress/CompletionTracker.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotRepository.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotTable.php
  - wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotMigration.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/ProgressController.php
  - wp-content/plugins/lw-lms/includes/Api/Controllers/DownloadController.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Integration.php
  - wp-content/plugins/lw-lms/CHANGELOG.md
---

# LW LMS: backend extension contract

For companion plugins or themes extending LW LMS from PHP: enrollment automation, certificates, progress writes, access checks, custom settings tabs, analytics, admin tooling, and integrations with WooCommerce, WooCommerce Subscriptions, or WooCommerce Memberships.

> **BETA NOTICE.** The plugin README says the plugin is under active development and not recommended for production use. Pin a tested version and review `CHANGELOG.md` before upgrading. This skill is verified against local lw-lms **v1.5.1**.

## Version deltas that matter

- **v1.5.1**: maintenance release, no functional changes.
- **v1.5.0**: WooCommerce Memberships access. Paid courses can link membership plans through `_lw_lms_membership_plan_ids`. Active members get access at read time through `MembershipChecker`; no DB schema change and no access row is written.
- **v1.4.0**: WP-CLI operational workflow added. Use `lw-lms-wp-cli-operations` for those commands.
- **v1.4.0**: `lw_lms_settings_tabs` filter and `SettingsPage::get_settings_group()` added for companion settings tabs and shared `options.php` saving.
- **v1.4.0**: course REST `content` is public; only lesson content remains access-gated.
- **v1.3.0**: enrollment/progress hook contract added or centralized: `lw_lms_pre_grant`, `lw_lms_after_grant`, `lw_lms_after_revoke`, `ProgressRepository::mark_course_completed()`, read/write splits.

## Critical correction

Do **not** document `lw_lms_has_course_access` as a general paid-course override hook in v1.5.1.

`AccessChecker::has_course_access()` returns inside all standard access-type branches:

- `open` returns `true`;
- guest `free` or `paid` returns `false`;
- `free` logged-in users are lazily granted `source='free'` and return `true`;
- `paid` checks access rows, parent subscriptions, variation subscriptions, memberships, then legacy purchases and returns that result.

The `lw_lms_has_course_access` filter is only reached after those branches, effectively for non-standard access types. Older skill text that said "hook this filter to grant custom memberships after the paid cascade" was wrong for the current source.

For additive access in v1.5.1, prefer one of these:

- write a real row through `AccessRepository::grant()` when your integration grants access;
- use built-in WooCommerce Memberships by populating `_lw_lms_membership_plan_ids`;
- patch/extend the plugin if you need a true runtime access filter for paid/open/free courses.

`lw_lms_has_lesson_access` is more useful, but it is still not universal: it fires for open-course lessons and the normal course-access branch, but preview lessons return before that filter.

## Plugin identity

| Field | Value |
|---|---|
| Slug | `lw-lms` |
| Version | `1.5.1` |
| Min WordPress | `6.0` |
| Min PHP | `8.1` |
| Namespace | `LightweightPlugins\LMS` |
| Constants | `LW_LMS_VERSION`, `LW_LMS_FILE`, `LW_LMS_PATH`, `LW_LMS_URL` |
| Text domain | `lw-lms` |
| Meta prefix | `_lw_lms_` |
| Options row | `lw_lms_options` |
| DB version | `1.2.0` |

## Data model

Custom post types:

- `course`
- `lesson`

Taxonomies:

- `course_category`
- `course_tag`
- `course_level`

Custom tables:

| Table | Purpose |
|---|---|
| `wp_lms_progress` | Per-user lesson status: `user_id`, `course_id`, `lesson_id`, `status`, `completed_at` |
| `wp_lms_access` | Stored access rows: `user_id`, `course_id`, `source`, `source_id`, `granted_at`, `expires_at`, `status` |
| `wp_lms_completion_snapshots` | Lock-on-complete snapshots: `user_id`, `course_id`, `total_lessons`, `completed_at` |

Access table caveat: the unique key is `(user_id, course_id, source_id)`, not `(user_id, course_id, source, source_id)`. A grant with `source_id = null` can update an existing null-source-id row regardless of the new `$source`. Avoid treating `source` alone as a unique enrollment channel.

Course meta:

| Meta key | Type | Purpose |
|---|---|---|
| `_lw_lms_access_type` | string | `open`, `free`, or `paid` |
| `_lw_lms_product_ids` | array<int> | WooCommerce products that grant access on completed order |
| `_lw_lms_product_durations` | object | `product_id => days`; empty/unset means unlimited |
| `_lw_lms_subscription_ids` | array<int> | Parent subscription product IDs checked at runtime |
| `_lw_lms_subscription_variation_ids` | array<string> | `parent_id:variation_id` pairs checked at runtime |
| `_lw_lms_membership_plan_ids` | array<int> | WooCommerce Memberships plan IDs checked at runtime |
| `_lw_lms_preview_lesson_ids` | array<int> | Preview lesson IDs |
| `_lw_lms_course_sections` | array<object> | Section definitions |
| `_lw_lms_attachments` | array<object> | Course attachments |
| `_lw_lms_duration` | string | Display duration |
| `_lw_lms_instructor` | string | Instructor display text |

Lesson meta:

| Meta key | Type | Purpose |
|---|---|---|
| `_lw_lms_lesson_course_id` | int | Parent course ID |
| `_lw_lms_lesson_section_id` | string | Section ID or empty |
| `_lw_lms_lesson_order` | int | Sort order |
| `_lw_lms_video` | object | Parsed video data |
| `_lw_lms_attachments` | array<object> | Lesson attachments |
| `_lw_lms_duration` | string | Display duration |

Custom capabilities are added only to `administrator` on activation. Other roles must opt in through your own activation code.

## Hooks

### Actions

| Hook | Args | Fires |
|---|---|---|
| `lw_lms_after_grant` | `$user_id, $course_id, $source, $source_id, $expires_at` (5) | After `AccessRepository::grant()` inserts or updates successfully |
| `lw_lms_after_revoke` | `$user_id, $course_id, $source` (3) | After `AccessRepository::revoke()` flips an active row to `revoked` |
| `lw_lms_lesson_completed` | `$lesson_id, $user_id` (2) | When `ProgressRepository::upsert()` transitions a lesson to `completed` |
| `lw_lms_course_completed` | `$course_id, $user_id` (2) | Once, when `CompletionTracker::maybe_record()` writes the completion snapshot |
| `lw_lms_attachment_downloaded` | `$attachment_id, $user_id` (2) | After a protected attachment download passes access checks |

### Filters

| Hook | Args | Caveat |
|---|---|---|
| `lw_lms_pre_grant` | `$allow, $user_id, $course_id, $source, $source_id, $expires_at` (6) | Return `false` to abort `AccessRepository::grant()` before DB write |
| `lw_lms_has_course_access` | `$has_access, $course_id, $user_id` (3) | Not reached for normal `open`, `free`, or `paid` access types in v1.5.1 |
| `lw_lms_has_lesson_access` | `$has_access, $lesson_id, $user_id` (3) | Not reached for preview-lesson short-circuit |
| `lw_lms_settings_tabs` | `array<TabInterface> $tabs` (1) | Add/remove/reorder settings tabs; non-`TabInterface` values are dropped |

Always register callbacks with the right accepted-args value:

```php
add_action( 'lw_lms_after_grant', 'my_enrollment_handler', 10, 5 );
add_action( 'lw_lms_after_revoke', 'my_revoke_handler', 10, 3 );
add_filter( 'lw_lms_pre_grant', 'my_pre_grant_guard', 10, 6 );
```

## Access paths

| Path | Stored row? | Fires `lw_lms_after_grant`? |
|---|---:|---:|
| WooCommerce completed order through `AccessGranter` | yes, `source='woocommerce'` | yes |
| Admin user-profile grant | yes, `source='manual'` | yes |
| Free course first access by logged-in user | yes, `source='free'` | yes |
| Programmatic `AccessRepository::grant()` | yes | yes |
| Parent WC subscription active check | no | no |
| Variation-level WC subscription active check | no | no |
| WooCommerce Memberships active member check | no | no |
| Legacy WooCommerce purchase fallback | no | no |

If downstream automation must react to subscriptions or memberships, hook WooCommerce Subscriptions or WooCommerce Memberships lifecycle events directly, or write an access row yourself through `AccessRepository::grant()` when your integration decides access should become durable.

## Public PHP API

### Access writes

```php
use LightweightPlugins\LMS\Access\AccessRepository;

AccessRepository::grant(
    $user_id,
    $course_id,
    'manual',
    null,
    gmdate( 'Y-m-d H:i:s', strtotime( '+30 days' ) )
);

AccessRepository::revoke( $user_id, $course_id );
```

`grant()` fires `lw_lms_pre_grant` before writing and `lw_lms_after_grant` after a successful insert/update. `revoke()` only fires `lw_lms_after_revoke` when an active row was actually changed.

### Access reads

```php
use LightweightPlugins\LMS\Access\AccessChecker;
use LightweightPlugins\LMS\Access\AccessQueries;

$has_access = AccessChecker::has_course_access( $course_id, $user_id );
$info       = AccessChecker::get_access_info( $course_id, $user_id );
$has_row    = AccessQueries::has_active_access( $user_id, $course_id );
$free_row   = AccessQueries::has_active_access( $user_id, $course_id, 'free' );
$rows       = AccessQueries::get_user_enrollments( $user_id );
```

Use `AccessChecker` for the full built-in access cascade. Use `AccessQueries` only when you specifically need access-table rows.

### Progress writes

```php
use LightweightPlugins\LMS\Progress\ProgressRepository;

ProgressRepository::upsert( $user_id, $course_id, $lesson_id, 'completed' );
ProgressRepository::mark_course_completed( $user_id, $course_id );
ProgressRepository::delete( $user_id, $lesson_id );
```

`upsert()` fires `lw_lms_lesson_completed` only on transition to `completed`, then calls `CompletionTracker::maybe_record()`. `mark_course_completed()` enumerates published lessons assigned to the course and uses `upsert()` for each. `delete()` does not clear completion snapshots and does not fire hooks.

### Progress reads

```php
use LightweightPlugins\LMS\Progress\ProgressCalculator;
use LightweightPlugins\LMS\Progress\ProgressQueries;

$row       = ProgressQueries::get( $user_id, $lesson_id );
$rows      = ProgressQueries::get_course_progress( $user_id, $course_id );
$all       = ProgressQueries::get_user_progress( $user_id );
$completed = ProgressQueries::get_completed_lessons( $user_id, $course_id );
$summary   = ProgressCalculator::calculate( $user_id, $course_id );
```

`ProgressCalculator::calculate()` respects `wp_lms_completion_snapshots`: once a user reaches 100%, adding more lessons does not reduce their percentage below 100%.

## Settings extension

Since v1.4.0, companion plugins can add settings tabs without creating a second settings form.

```php
use LightweightPlugins\LMS\Admin\Settings\TabInterface;
use LightweightPlugins\LMS\Admin\SettingsPage;

add_filter( 'lw_lms_settings_tabs', static function ( array $tabs ): array {
    $tabs[] = new MyCompanionLmsTab();
    return $tabs;
} );

add_action( 'admin_init', static function (): void {
    if ( ! class_exists( SettingsPage::class ) ) {
        return;
    }

    register_setting(
        SettingsPage::get_settings_group(),
        'my_companion_lms_options',
        [
            'type'              => 'array',
            'sanitize_callback' => 'my_companion_sanitize_lms_options',
            'default'           => [],
        ]
    );
} );
```

The core form posts to `options.php` and calls `settings_fields( SettingsPage::get_settings_group() )`, so your registered option can save with the same nonce and submit button. Your tab object must implement `TabInterface`; otherwise `SettingsPage` filters it out.

## Common workflows

### React to enrollment

```php
add_action(
    'lw_lms_after_grant',
    static function ( int $user_id, int $course_id, string $source, ?int $source_id, ?string $expires_at ): void {
        MyAnalytics::track( 'lms_enrolled', compact( 'user_id', 'course_id', 'source' ) );
        MyDripScheduler::start( $user_id, $course_id );
    },
    10,
    5
);
```

This catches Woo completed orders, admin manual grants, free-course lazy grants, and your own `AccessRepository::grant()` calls. It does not catch live subscription, membership, or legacy purchase access checks.

### Abort a grant

```php
add_filter(
    'lw_lms_pre_grant',
    static function ( bool $allow, int $user_id, int $course_id, string $source, ?int $source_id, ?string $expires_at ): bool {
        if ( ! $allow ) {
            return false;
        }

        if ( MySeats::is_full( $course_id ) ) {
            return false;
        }

        return true;
    },
    10,
    6
);
```

Returning `false` prevents the DB write and prevents `lw_lms_after_grant`.

### Issue a certificate once

```php
add_action( 'lw_lms_course_completed', static function ( int $course_id, int $user_id ): void {
    MyCertificateGenerator::issue( $user_id, $course_id );
}, 10, 2 );
```

The completion snapshot makes this a one-shot event per user/course pair.

### Give access from another membership system

```php
if ( MyMembership::user_joined_plan( $user_id, 'pro' ) ) {
    \LightweightPlugins\LMS\Access\AccessRepository::grant(
        $user_id,
        $course_id,
        'my_membership',
        MyMembership::membership_id( $user_id ),
        null
    );
}
```

Do not rely on `lw_lms_has_course_access` for this in v1.5.1. It is not called for normal `paid` courses.

## Critical rules

- Use `AccessRepository::grant()` and `revoke()` for stored access changes. Direct SQL skips hooks.
- Use `ProgressRepository::upsert()` and `mark_course_completed()` for progress changes. Direct SQL skips completion hooks and snapshots.
- Do not call old read methods on repositories. Reads live in `AccessQueries` and `ProgressQueries`.
- `lw_lms_after_grant` needs 5 accepted args; `lw_lms_pre_grant` needs 6; `lw_lms_after_revoke` needs 3.
- Subscriptions, subscription variations, memberships, and legacy purchases are live checks unless your integration writes an access row.
- The access table unique key ignores `source`; be deliberate with `source_id`.
- `expires_at` is enforced on read by `AccessQueries::has_active_access()`. No expiry cron fires `lw_lms_after_revoke`.
- `ProgressRepository::delete()` does not delete completion snapshots. If an admin reset must also undo completion, call `ProgressSnapshotRepository::delete()` deliberately.
- `lw_lms_has_course_access` is not a reliable standard access override in v1.5.1.
- Add companion settings through `lw_lms_settings_tabs` plus `SettingsPage::get_settings_group()`, not a second unrelated form.

## Common mistakes

```php
// WRONG: invented hook name.
add_action( 'lw_lms_user_enrolled', 'my_handler', 10, 2 );

// RIGHT.
add_action( 'lw_lms_after_grant', 'my_handler', 10, 5 );
```

```php
// WRONG: direct progress write.
$wpdb->insert( $wpdb->prefix . 'lms_progress', [
    'user_id' => $user_id,
    'course_id' => $course_id,
    'lesson_id' => $lesson_id,
    'status' => 'completed',
] );

// RIGHT.
\LightweightPlugins\LMS\Progress\ProgressRepository::upsert(
    $user_id,
    $course_id,
    $lesson_id,
    'completed'
);
```

```php
// WRONG in v1.5.1: this will not grant normal paid-course access,
// because the course filter is not reached on the paid branch.
add_filter( 'lw_lms_has_course_access', static function () {
    return true;
}, 10, 3 );

// RIGHT: write an access row when your integration grants access.
\LightweightPlugins\LMS\Access\AccessRepository::grant(
    $user_id,
    $course_id,
    'my_integration',
    $external_access_id,
    null
);
```

```php
// WRONG: using source alone as an idempotency boundary.
AccessRepository::grant( $user_id, $course_id, 'free', null, null );
AccessRepository::grant( $user_id, $course_id, 'manual', null, null );

// Both use source_id null/0 for the same user/course. Use a meaningful
// source_id for external systems when you need separate rows.
```

## Cross-references

- Use `lw-lms-rest-frontend` for learner-facing `/wp-json/lms/v1` consumers.
- Use `lw-lms-abilities` for admin/agent `lw-lms/*` Abilities API calls.
- Use `lw-lms-wp-cli-operations` for operational CLI commands added in v1.4.0.
- Use `lw-lms-learndash-migration` for the one-time LearnDash migration.
- Use WooCommerce Subscriptions/Memberships specific skills when reacting to their lifecycle events.

## What this skill does NOT cover

- Public frontend rendering. Core lw-lms is headless.
- LearnDash import details.
- Custom REST route registration.
- Replacing the plugin's access calculator or progress calculator.
- Treating `WooCommerceChecker`, `SubscriptionVariationChecker`, or `MembershipChecker` as stable public services. Prefer `AccessChecker` or a stored grant.

## References

- Plugin entry: `lw-lms.php`.
- Main wiring: `includes/Plugin.php`.
- DB/tables/caps: `includes/Activator.php`, `includes/Access/AccessTable.php`, progress table classes.
- Access cascade and current filter placement: `includes/Access/AccessChecker.php`.
- Stored access writes: `includes/Access/AccessRepository.php`.
- Stored access reads: `includes/Access/AccessQueries.php`.
- Woo order grants: `includes/Access/AccessGranter.php`.
- Subscriptions and memberships: `includes/Access/WooCommerceChecker.php`, `SubscriptionVariationChecker.php`, `MembershipChecker.php`.
- Progress writes and hooks: `includes/Progress/ProgressRepository.php`, `CompletionTracker.php`.
- Settings extension: `includes/Admin/SettingsPage.php`, `includes/Admin/Settings/TabInterface.php`.
- Changelog source of version deltas: `CHANGELOG.md`.
