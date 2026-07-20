# LW LMS v1.6.0 backend contract details

Load this reference when exact data-model fields, PHP calls, settings integration, or expanded error examples are required. The parent skill contains the access decision model, hooks, workflows, and critical rules.

## Plugin identity

| Field | Value |
|---|---|
| Slug | `lw-lms` |
| Version | `1.6.0` |
| Min WordPress | `6.0` |
| Min PHP | `8.2` |
| Namespace | `LightweightPlugins\LMS` |
| Constants | `LW_LMS_VERSION`, `LW_LMS_FILE`, `LW_LMS_PATH`, `LW_LMS_URL` |
| Text domain | `lw-lms` |
| Meta prefix | `_lw_lms_` |
| Options row | `lw_lms_options` |
| DB version | `1.2.0` |

## Data model

Custom post types are `course` and `lesson`. Taxonomies are `course_category`, `course_tag`, and `course_level`.

| Table | Purpose |
|---|---|
| `wp_lms_progress` | Per-user lesson status: `user_id`, `course_id`, `lesson_id`, `status`, `completed_at` |
| `wp_lms_access` | Stored access rows: `user_id`, `course_id`, `source`, `source_id`, `granted_at`, `expires_at`, `status` |
| `wp_lms_completion_snapshots` | Lock-on-complete snapshots: `user_id`, `course_id`, `total_lessons`, `completed_at` |

The access unique key is `(user_id, course_id, source_id)`, not `(user_id, course_id, source, source_id)`. `grant()` also looks up an existing row without matching `source` and does not replace the stored source during an update. A reused or null `source_id` can reactivate a row owned by another source while leaving the old `source`. Use meaningful, collision-resistant non-null IDs for external grants.

Course meta:

| Meta key | Type | Purpose |
|---|---|---|
| `_lw_lms_access_type` | string | `open`, `free`, or `paid` |
| `_lw_lms_product_ids` | array<int> | WooCommerce products granting access on completed order |
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

Custom capabilities are added only to `administrator` on activation. Other roles must opt in through companion activation code.

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

AccessRepository::revoke_by_source(
    $user_id,
    $course_id,
    'my_integration',
    $external_access_id
);
```

`grant()` fires `lw_lms_pre_grant` before writing and `lw_lms_after_grant` after a successful insert/update. `revoke()` changes only the first active row it finds, regardless of source. Prefer `revoke_by_source()` for integration-owned grants.

With a non-null `$source_id`, `revoke_by_source()` matches that exact source and source ID. With `null`, it revokes all active rows for that source on the user/course, including non-null IDs. It fires `lw_lms_after_revoke` once per successful method call, not once per row. `false` means either no matching active row or a database failure. Stored-row revocation cannot remove live subscription, membership, or legacy-purchase access.

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

Use `AccessChecker` for the complete built-in cascade. Use `AccessQueries` only for access-table rows.

### Progress writes and reads

```php
use LightweightPlugins\LMS\Progress\ProgressCalculator;
use LightweightPlugins\LMS\Progress\ProgressQueries;
use LightweightPlugins\LMS\Progress\ProgressRepository;

ProgressRepository::upsert( $user_id, $course_id, $lesson_id, 'completed' );
ProgressRepository::mark_course_completed( $user_id, $course_id );
ProgressRepository::delete( $user_id, $lesson_id );

$row       = ProgressQueries::get( $user_id, $lesson_id );
$rows      = ProgressQueries::get_course_progress( $user_id, $course_id );
$all       = ProgressQueries::get_user_progress( $user_id );
$completed = ProgressQueries::get_completed_lessons( $user_id, $course_id );
$summary   = ProgressCalculator::calculate( $user_id, $course_id );
```

`upsert()` fires `lw_lms_lesson_completed` only on transition to `completed`, then calls `CompletionTracker::maybe_record()`. `mark_course_completed()` enumerates published lessons and uses `upsert()`. `delete()` fires no hook and does not clear completion snapshots. Once a completion snapshot records 100%, adding lessons does not lower the calculated percentage.

## Settings extension

Since v1.4.0, companion plugins can share the main settings form:

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

The core form posts to `options.php` and calls `settings_fields( SettingsPage::get_settings_group() )`. The tab object must implement `TabInterface`; otherwise it is filtered out.

## Expanded wrong/right examples

```php
// WRONG: invented hook name and argument count.
add_action( 'lw_lms_user_enrolled', 'my_handler', 10, 2 );

// RIGHT.
add_action( 'lw_lms_after_grant', 'my_handler', 10, 5 );
```

```php
// WRONG: direct progress write skips repository behavior.
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
// WRONG: discards valid built-in paid access when the external system says no.
add_filter( 'lw_lms_has_course_access', static function ( bool $has_access, int $course_id, int $user_id ): bool {
    return MyMembership::has_course_access( $user_id, $course_id );
}, 10, 3 );

// RIGHT for additive runtime access.
add_filter( 'lw_lms_has_course_access', static function ( bool $has_access, int $course_id, int $user_id ): bool {
    return $has_access || MyMembership::has_course_access( $user_id, $course_id );
}, 10, 3 );
```

```php
// WRONG: source alone is not an idempotency boundary.
AccessRepository::grant( $user_id, $course_id, 'free', null, null );
AccessRepository::grant( $user_id, $course_id, 'manual', null, null );

// Use a stable, meaningful non-null source_id for separate external rows.
```

```php
// WRONG: may revoke a row belonging to another grant source.
AccessRepository::revoke( $user_id, $course_id );

// RIGHT: revoke only this integration's grant.
AccessRepository::revoke_by_source(
    $user_id,
    $course_id,
    'my_integration',
    $external_access_id
);
```
