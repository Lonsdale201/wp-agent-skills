---
name: lw-lms-backend-extend
description: Backend extension contract for LW LMS v1.6.0. Use when extending enrollment, access, source-scoped revocation, progress, certificates, automation, analytics, settings tabs, companion-plugin logic, `lw_lms_after_grant`, `lw_lms_after_revoke`, `lw_lms_pre_grant`, `lw_lms_has_course_access`, `AccessChecker`, `AccessRepository`, `AccessQueries`, `ProgressRepository`, `ProgressQueries`, `CompletionTracker`, `wp_lms_progress`, `wp_lms_access`, `_lw_lms_*` meta, or WooCommerce Memberships/Subscriptions access.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-lms"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-07-20"
---

# LW LMS: backend extension contract

For companion plugins or themes extending LW LMS from PHP: enrollment automation, certificates, progress writes, access checks, custom settings tabs, analytics, admin tooling, and integrations with WooCommerce, WooCommerce Subscriptions, or WooCommerce Memberships.

> **BETA NOTICE.** The plugin README says the plugin is under active development and not recommended for production use. Pin a tested version and review `CHANGELOG.md` before upgrading. This skill is verified against local lw-lms **v1.6.0**.

## Version deltas that matter

- **v1.6.0**: `lw_lms_has_course_access` is reachable again as the final logged-in paid-course decision after all built-in checks. `AccessRepository::revoke_by_source()` adds source-scoped stored-access revocation. Minimum PHP is now 8.2.
- **v1.5.1**: maintenance release, no functional changes.
- **v1.5.0**: WooCommerce Memberships access. Paid courses can link membership plans through `_lw_lms_membership_plan_ids`. Active members get access at read time through `MembershipChecker`; no DB schema change and no access row is written.
- **v1.4.0**: WP-CLI operational workflow added. Use `lw-lms-wp-cli-operations` for those commands.
- **v1.4.0**: `lw_lms_settings_tabs` filter and `SettingsPage::get_settings_group()` added for companion settings tabs and shared `options.php` saving.
- **v1.4.0**: course REST `content` is public; only lesson content remains access-gated.
- **v1.3.0**: enrollment/progress hook contract added or centralized: `lw_lms_pre_grant`, `lw_lms_after_grant`, `lw_lms_after_revoke`, `ProgressRepository::mark_course_completed()`, read/write splits.

## v1.6.0 course-access filter contract

`AccessChecker::has_course_access()` now reaches `lw_lms_has_course_access` after the complete built-in paid-course cascade: access rows, parent subscriptions, variation subscriptions, WooCommerce Memberships, then legacy purchases. The callback receives the aggregate built-in result and has final say, so it can grant or deliberately deny logged-in paid-course access.

The filter is not universal:

- `open` returns `true` before the filter;
- anonymous `free` or `paid` access returns `false` before the filter;
- `free` access for a logged-in user lazily grants `source='free'` and returns `true` before the filter;
- logged-in `paid` access reaches the filter after all built-in checks.

Preserve a built-in grant unless the integration intentionally implements a denial policy:

```php
add_filter(
    'lw_lms_has_course_access',
    static function ( bool $has_access, int $course_id, int $user_id ): bool {
        if ( $has_access ) {
            return true;
        }

        return MyMembership::has_course_access( $user_id, $course_id );
    },
    10,
    3
);
```

This is a runtime decision only: returning `true` does not create an access row and does not fire grant/revoke actions. Keep the callback deterministic, side-effect-free, and fast. `CourseTransformer::transform_full()` currently calls `has_course_access()` directly and again through `get_access_info()`, so the filter runs twice while producing one full paid-course response. A time-varying result can make `access.has_access` disagree with lesson/attachment gating.

Use `AccessRepository::grant()` instead when the entitlement should be durable, auditable, expirable, or should fire enrollment automation.

`lw_lms_has_lesson_access` is more useful, but it is still not universal: it fires for open-course lessons and the normal course-access branch, but preview lessons return before that filter.

## Detailed contract reference

Read [references/backend-contract-details.md](references/backend-contract-details.md) when the task needs the plugin identity, CPT/taxonomy/table/meta map, exact repository read/write examples, settings-tab implementation, or expanded wrong/right examples. The access-filter, hook, workflow, and safety rules needed for normal extension work remain below.

## Hooks

### Actions

| Hook | Args | Fires |
|---|---|---|
| `lw_lms_after_grant` | `$user_id, $course_id, $source, $source_id, $expires_at` (5) | After `AccessRepository::grant()` inserts or updates successfully |
| `lw_lms_after_revoke` | `$user_id, $course_id, $source` (3) | After `revoke()` changes its first active row, or once after `revoke_by_source()` changes one or more matching rows |
| `lw_lms_lesson_completed` | `$lesson_id, $user_id` (2) | When `ProgressRepository::upsert()` transitions a lesson to `completed` |
| `lw_lms_course_completed` | `$course_id, $user_id` (2) | Once, when `CompletionTracker::maybe_record()` writes the completion snapshot |
| `lw_lms_attachment_downloaded` | `$attachment_id, $user_id` (2) | After a protected attachment download passes access checks |

### Filters

| Hook | Args | Caveat |
|---|---|---|
| `lw_lms_pre_grant` | `$allow, $user_id, $course_id, $source, $source_id, $expires_at` (6) | Return `false` to abort `AccessRepository::grant()` before DB write |
| `lw_lms_has_course_access` | `$has_access, $course_id, $user_id` (3) | Final logged-in paid-course result in v1.6.0; open/free/anonymous paths return before it; may execute more than once per request |
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

### Give runtime access from another membership system

```php
add_filter(
    'lw_lms_has_course_access',
    static function ( bool $has_access, int $course_id, int $user_id ): bool {
        return $has_access || MyMembership::has_course_access( $user_id, $course_id );
    },
    10,
    3
);
```

Use this only for a fast, deterministic live check. It affects logged-in paid access but writes no enrollment row and fires no enrollment lifecycle action.

### Persist access from another membership system

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

When that membership ends, revoke only the row owned by the integration:

```php
\LightweightPlugins\LMS\Access\AccessRepository::revoke_by_source(
    $user_id,
    $course_id,
    'my_membership',
    MyMembership::membership_id( $user_id )
);
```

## Critical rules

- Use `AccessRepository::grant()` and `revoke_by_source()` for integration-owned stored access changes. The broad `revoke()` changes only the first active row regardless of origin. Direct SQL skips hooks.
- Use `ProgressRepository::upsert()` and `mark_course_completed()` for progress changes. Direct SQL skips completion hooks and snapshots.
- Do not call old read methods on repositories. Reads live in `AccessQueries` and `ProgressQueries`.
- `lw_lms_after_grant` needs 5 accepted args; `lw_lms_pre_grant` needs 6; `lw_lms_after_revoke` needs 3.
- Subscriptions, subscription variations, memberships, and legacy purchases are live checks unless your integration writes an access row.
- The access table unique key and `grant()` lookup ignore `source`; use a stable, collision-resistant non-null `source_id` for external grants.
- `expires_at` is enforced on read by `AccessQueries::has_active_access()`. No expiry cron fires `lw_lms_after_revoke`.
- `ProgressRepository::delete()` does not delete completion snapshots. If an admin reset must also undo completion, call `ProgressSnapshotRepository::delete()` deliberately.
- `lw_lms_has_course_access` is the final logged-in paid-course decision in v1.6.0, but open/free/anonymous paths bypass it. Keep it deterministic, side-effect-free, and cheap.
- `revoke_by_source( ..., $source, null )` revokes every active row for that source, not only null-source-ID rows.
- Add companion settings through `lw_lms_settings_tabs` plus `SettingsPage::get_settings_group()`, not a second unrelated form.

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
- Official documentation: <https://github.com/lwplugins/lw-lms>
- Verified source paths:
  - `wp-content/plugins/lw-lms/includes/Options.php`
  - `wp-content/plugins/lw-lms/includes/Admin/UserProfile.php`
  - `wp-content/plugins/lw-lms/includes/Admin/UserProfile/EnrollmentHandler.php`
  - `wp-content/plugins/lw-lms/includes/Meta/CourseMeta.php`
  - `wp-content/plugins/lw-lms/includes/Meta/LessonMeta.php`
  - `wp-content/plugins/lw-lms/includes/Meta/SubscriptionVariationMeta.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressQueries.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressCalculator.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotRepository.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotTable.php`
  - `wp-content/plugins/lw-lms/includes/Progress/ProgressSnapshotMigration.php`
  - `wp-content/plugins/lw-lms/includes/Api/Controllers/ProgressController.php`
  - `wp-content/plugins/lw-lms/includes/Api/Controllers/DownloadController.php`
  - `wp-content/plugins/lw-lms/includes/SiteManager/Integration.php`
