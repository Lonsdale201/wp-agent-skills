---
name: lw-lms-backend-extend
description: Backend extension contract for the LW LMS plugin
  (lwplugins/lw-lms, BETA — README explicitly says "not recommended
  for production use"). Headless LMS — courses, lessons, sections,
  progress, access control. Custom hooks (verified) — three actions
  (lw_lms_attachment_downloaded, lw_lms_lesson_completed,
  lw_lms_course_completed) and two FILTERS for access override
  (lw_lms_has_course_access, lw_lms_has_lesson_access). 11 custom
  capabilities (manage_lms, edit_courses, etc.) added to admin role
  on activation. Three DB tables (wp_lms_progress, wp_lms_access,
  wp_lms_completion_snapshots). Optional Site Manager integration —
  the plugin itself demonstrates how to register lw-lms/* abilities
  via lw_site_manager_register_abilities. Use when extending the
  plugin (issuing certificates, custom access logic, gamification,
  custom analytics). Triggers on lw_lms_*, course / lesson CPTs,
  AccessChecker, ProgressRepository.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-lms
plugin-version-tested: "1.2.14"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://github.com/lwplugins/lw-lms
source-refs:
  - wp-content/plugins/lw-lms-main/lw-lms.php
  - wp-content/plugins/lw-lms-main/includes/Plugin.php
  - wp-content/plugins/lw-lms-main/includes/Activator.php
  - wp-content/plugins/lw-lms-main/includes/Options.php
  - wp-content/plugins/lw-lms-main/includes/PostTypes/Course.php
  - wp-content/plugins/lw-lms-main/includes/PostTypes/Lesson.php
  - wp-content/plugins/lw-lms-main/includes/Meta/CourseMeta.php
  - wp-content/plugins/lw-lms-main/includes/Meta/LessonMeta.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessChecker.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessRepository.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessGranter.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessTable.php
  - wp-content/plugins/lw-lms-main/includes/Access/WooCommerceChecker.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressRepository.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressCalculator.php
  - wp-content/plugins/lw-lms-main/includes/Progress/CompletionTracker.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotRepository.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotTable.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotMigration.php
  - wp-content/plugins/lw-lms-main/includes/Api/Controllers/ProgressController.php
  - wp-content/plugins/lw-lms-main/includes/Api/Controllers/DownloadController.php
  - wp-content/plugins/lw-lms-main/includes/SiteManager/Integration.php
  - wp-content/plugins/lw-lms-main/includes/SiteManager/LmsAbilities.php
  - wp-content/plugins/lw-lms-main/includes/SiteManager/LmsService.php
  - wp-content/plugins/lw-lms-main/CHANGELOG.md
---

# LW LMS: backend extension contract

For developers extending the [LW LMS](https://github.com/lwplugins/lw-lms) plugin from a companion plugin or theme — issuing certificates on completion, adding gamification, custom access policies, analytics integration, custom admin metaboxes that talk to the LMS data model. The plugin's backend is small and clean; this skill maps the verified extension surface so you know what to hook and what NOT to mutate directly.

> **BETA NOTICE.** The plugin's README explicitly states "This plugin is under active development and is not recommended for production use." Schema and hook signatures may shift between minor versions. Pin a tested version in production and review the CHANGELOG before upgrading. This skill is verified against v1.2.14.

## Misconception this skill corrects

> "It's just a CPT-and-meta plugin — I'll write directly to `_lw_lms_*` post meta and the `wp_lms_progress` table to integrate."

Wrong direction. The plugin already exposes the right contract through hooks; bypassing them creates fragile coupling that breaks across versions.

The two cases where AI assistants reach for direct DB access most often:

1. **"Mark a lesson complete from my plugin"** → don't `INSERT INTO wp_lms_progress`. Call `\LightweightPlugins\LMS\Progress\ProgressRepository::upsert($user_id, $course_id, $lesson_id, 'completed')`. The repository fires the `lw_lms_lesson_completed` and `lw_lms_course_completed` actions and updates the completion snapshot — direct INSERTs skip all of that.
2. **"Override course access for my membership plugin"** → don't write to `wp_lms_access` table. Hook the `lw_lms_has_course_access` filter. Verified at [src/Access/AccessChecker.php:78](AccessChecker.php) — the filter fires LAST in the access cascade, so any custom logic returns true even when the plugin's own checks return false.

Other AI-prone misconceptions:

- "The plugin emits no filters — it's like lw-site-manager." Wrong — lw-lms has TWO filters at `lw_lms_has_course_access` (line 78) and `lw_lms_has_lesson_access` (line 115). These are the canonical access-override seam.
- "Adding a lesson mid-course retroactively recalculates completion percentages." No — this is a documented design choice (1.2.14 added the lock-on-complete snapshot for exactly this reason). Users at 100% stay at 100%; new lessons become "extra material" for them.
- "Custom capabilities are managed via the WP roles UI." They're added to the `administrator` role on activation ([src/Activator.php:73-97](Activator.php)), but not auto-pushed to other roles. Custom roles have to opt in via `add_role` or `WP_Role::add_cap`.

## When to use this skill

Trigger when ANY of the following is true:

- The diff hooks `lw_lms_*` actions or filters.
- A companion plugin / theme wants to extend lw-lms (certificates, email automation, gamification, analytics).
- Someone proposes writing directly to `wp_lms_progress` / `wp_lms_access` / `_lw_lms_*` post meta from outside the plugin.
- Adding lw-lms abilities to the LW Site Manager hub.
- Reviewing custom code that calls `AccessChecker::has_course_access()` or `ProgressRepository`.

## Plugin identity (verified)

| Field | Value | Source |
|---|---|---|
| Slug | `lw-lms` | header |
| Version | `1.2.14` | [lw-lms.php:6](lw-lms.php) |
| Status | **BETA** | README line 3 |
| Min WP | 6.0 | header |
| Min PHP | 8.1 | header |
| Namespace | `LightweightPlugins\LMS` | [lw-lms.php:21](lw-lms.php) |
| Constants | `LW_LMS_VERSION`, `LW_LMS_FILE`, `LW_LMS_PATH`, `LW_LMS_URL` | [lw-lms.php:29-32](lw-lms.php) |
| Text domain | `lw-lms` | header |
| Meta prefix | `_lw_lms_` | [src/Options.php:25](Options.php) — `Options::META_PREFIX` |
| DB option | `lw_lms_options` | `Options::OPTION_NAME` |
| DB version | `1.2.0` | `Activator::DB_VERSION` |
| GitHub | <https://github.com/lwplugins/lw-lms> | header |

## Data model (verified)

**Custom post types** ([src/PostTypes/](PostTypes/)):

- `course` — top-level CPT
- `lesson` — child of course (admin menu nested under courses)

**Taxonomies** ([src/Taxonomies/](Taxonomies/)): `course_category`, `course_tag`, `course_level`.

**Custom DB tables** ([src/Activator.php:55-66](Activator.php)):

- `wp_lms_progress` — `(user_id, course_id, lesson_id, status, updated_at)`. The lesson-progress source of truth.
- `wp_lms_access` — `(user_id, course_id, granted_at, expires_at, source)`. Time-limited paid-course access (set by `AccessGranter` on WC order completion).
- `wp_lms_completion_snapshots` — `(user_id, course_id, total_lessons, completed_at)` UNIQUE on `(user_id, course_id)`. Lock-on-complete snapshot — total_lessons FROZEN at the moment the user first hit 100%.

**Custom capabilities** ([src/Activator.php:80-92](Activator.php)): `manage_lms`, `edit_courses`, `edit_others_courses`, `publish_courses`, `read_private_courses`, `delete_courses`, plus the same six for `lessons`. Added to `administrator` role on activation. Other roles must opt in.

**Post meta** (all `_lw_lms_*` prefix, all `register_post_meta`'d with `show_in_rest: true`):

| CPT | Meta key | Type | Purpose |
|---|---|---|---|
| course | `_lw_lms_access_type` | string | `open` / `free` / `paid` |
| course | `_lw_lms_product_ids` | array<int> | WC product IDs that grant access |
| course | `_lw_lms_subscription_ids` | array<int> | WC subscription IDs |
| course | `_lw_lms_product_durations` | object<int,int> | `product_id => days` for time-limited access |
| course | `_lw_lms_preview_lesson_ids` | array<int> | Lessons accessible without course access (logged-in users) |
| course | `_lw_lms_course_sections` | array<object> | `[{id, title, description, order}]` — drag-and-drop sections |
| course | `_lw_lms_attachments` | array<object> | `[{id, title, description}]` |
| course | `_lw_lms_duration` | string | Display string ("8h", "2 weeks") |
| course | `_lw_lms_instructor` | string | Display name |
| lesson | `_lw_lms_lesson_course_id` | int | Parent course ID — REQUIRED for access checks |
| lesson | `_lw_lms_lesson_section_id` | string | Section ID (or empty for orphan lessons) |
| lesson | `_lw_lms_lesson_order` | int | Sort order within section/course |
| lesson | `_lw_lms_video` | object | `{url, provider, video_id, embed, duration}` — auto-parsed by `VideoParser` |
| lesson | `_lw_lms_attachments` | array<object> | Same shape as course attachments |
| lesson | `_lw_lms_duration` | string | Display string |

## Custom hooks (verified)

### Actions

| Hook | Args | Fires at | Source |
|---|---|---|---|
| `lw_lms_attachment_downloaded` | `$attachment_id, $user_id` | After successful attachment download | [DownloadController.php:90](DownloadController.php) |
| `lw_lms_lesson_completed` | `$lesson_id, $user_id` | When lesson status transitions to `completed` | [ProgressController.php:171](ProgressController.php) |
| `lw_lms_course_completed` | `$course_id, $user_id` | When all lessons in a course are completed | [ProgressController.php:175](ProgressController.php) |
| `lw_plugins_overview_cards` | (none) | Family-shared admin overview hook (not lw-lms specific) | [Admin/ParentPage.php:140](ParentPage.php) |

### Filters

| Hook | Args | Default | Source |
|---|---|---|---|
| `lw_lms_has_course_access` | `$has_access, $course_id, $user_id` | `false` (only fires when none of the built-in cascade granted access) | [AccessChecker.php:78](AccessChecker.php) |
| `lw_lms_has_lesson_access` | `$has_access, $lesson_id, $user_id` | result of `has_course_access()` (or true for preview lessons + logged-in users) | [AccessChecker.php:115](AccessChecker.php) |

### Note on filter cascade

`lw_lms_has_course_access` fires AFTER:

1. `access_type === 'open'` → return true unfiltered
2. Not logged in for `free` / `paid` → return false unfiltered
3. `access_type === 'free'` + logged in → return true unfiltered
4. `access_type === 'paid'` → check `wp_lms_access` table → check WC subscription → check legacy WC purchase

Only when ALL four steps fail does the filter run with `$has_access = false`. This is the spot for "my custom membership plugin grants access" logic — return `true` and access is granted.

`lw_lms_has_lesson_access` fires AFTER preview check + course access check. Receives the result and lets you override (e.g. "this premium lesson requires its own gate beyond the course").

## Workflow

### 1. Issue a certificate on course completion

```php
add_action( 'lw_lms_course_completed', static function ( int $course_id, int $user_id ): void {
    if ( ! $course_id || ! $user_id ) {
        return;
    }

    $course = get_post( $course_id );
    if ( ! $course ) {
        return;
    }

    // Generate certificate PDF, store reference, email user, etc.
    MyCertificateGenerator::issue( $user_id, $course_id );
}, 10, 2 );
```

The action fires once per course completion. The progress snapshot at [src/Progress/CompletionTracker.php](CompletionTracker.php) ensures it doesn't re-fire if the user re-marks an already-completed lesson.

### 2. Custom access policy via filter

```php
add_filter( 'lw_lms_has_course_access', static function ( bool $has_access, int $course_id, int $user_id ): bool {
    if ( $has_access ) {
        return $has_access;   // pass-through if built-in cascade granted access
    }

    // Example: grant access to all "instructor" role users
    if ( $user_id && user_can( $user_id, 'manage_lms' ) ) {
        return true;
    }

    // Example: a custom membership plugin
    if ( MyMembershipPlugin::user_has_active_subscription( $user_id, [ 'pro', 'enterprise' ] ) ) {
        return true;
    }

    return $has_access;   // false; preserve the cascade default
}, 10, 3 );
```

**Important:** the cascade-pass-through pattern (`if ($has_access) return $has_access;`) is correct for ADDITIVE access logic. If you want REVOCATION (a user has access via the cascade but YOU want to deny), do the inverse:

```php
add_filter( 'lw_lms_has_course_access', static function ( bool $has_access, int $course_id, int $user_id ): bool {
    if ( ! $has_access ) {
        return $has_access;
    }
    if ( MyBlocklist::is_user_blocked( $user_id ) ) {
        return false;
    }
    return $has_access;
}, 10, 3 );
```

### 3. Lesson completion → custom analytics

```php
add_action( 'lw_lms_lesson_completed', static function ( int $lesson_id, int $user_id ): void {
    $course_id = (int) get_post_meta( $lesson_id, '_lw_lms_lesson_course_id', true );

    MyAnalytics::track( 'lesson_completed', [
        'user_id'   => $user_id,
        'lesson_id' => $lesson_id,
        'course_id' => $course_id,
        'timestamp' => time(),
    ] );
}, 10, 2 );
```

### 4. Marking a lesson complete from outside a REST request

```php
use \LightweightPlugins\LMS\Progress\ProgressRepository;
use \LightweightPlugins\LMS\Progress\ProgressCalculator;

// In a CLI command, cron, or another plugin:
ProgressRepository::upsert( $user_id, $course_id, $lesson_id, 'completed' );

// upsert() internally calls CompletionTracker::maybe_record() and the
// lw_lms_lesson_completed action fires automatically. If this completion
// pushes the user to 100%, lw_lms_course_completed also fires.
```

Don't issue raw SQL against `wp_lms_progress` — you'll skip the snapshot, the action hooks, and the calculator's cache invalidation.

### 5. Reading access state programmatically

```php
use \LightweightPlugins\LMS\Access\AccessChecker;

if ( AccessChecker::has_course_access( $course_id, $user_id ) ) {
    // ...
}

$access_info = AccessChecker::get_access_info( $course_id, $user_id );
// Returns: ['type', 'has_access', 'expires_at'?, 'requires'?, 'products'?, 'subscriptions'?]
```

Public static methods on `AccessChecker` are the supported read API. Use these instead of querying `wp_lms_access` directly — the cascade logic is non-trivial.

### 6. Site Manager integration — register custom lw-lms abilities

The plugin itself ships an example at [src/SiteManager/Integration.php](Integration.php):

```php
// Hook lw-site-manager's two extension actions:
add_action( 'lw_site_manager_register_categories', static function (): void {
    wp_register_ability_category( 'lms', [
        'label'       => __( 'LMS', 'mycompanion' ),
        'description' => __( 'Learning management system abilities', 'mycompanion' ),
    ] );
} );

add_action( 'lw_site_manager_register_abilities', static function ( object $permissions ): void {
    wp_register_ability( 'mycompanion-lms/list-courses', [
        'label'               => __( 'List Courses', 'mycompanion' ),
        'description'         => __( 'List all published courses.', 'mycompanion' ),
        'category'            => 'lms',
        'execute_callback'    => [ MyService::class, 'list_courses' ],
        'permission_callback' => $permissions->callback( 'can_edit_posts' ),
        'input_schema'        => [ /* ... */ ],
        'output_schema'       => [ /* ... */ ],
        'meta'                => [
            'show_in_rest' => true,
            'annotations'  => [ 'readonly' => true, 'destructive' => false, 'idempotent' => true ],
        ],
    ] );
} );
```

For the full pattern (including the `AbstractAbilitiesRegistrar` helpers) see **`lw-site-manager-extend-abilities`**.

### 7. Plugin loaded? Class exists guards

When your companion plugin requires lw-lms but you don't want to hard-fail without it:

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\LightweightPlugins\LMS\Plugin' ) ) {
        return;   // lw-lms not active; bail
    }

    // Hook lw-lms actions / filters here
    add_action( 'lw_lms_course_completed', 'mycompanion_issue_certificate', 10, 2 );
}, 11 );   // priority > 10 so lw-lms's plugins_loaded init has run
```

The plugin instantiates on `plugins_loaded` (default priority 10) — your hooks should register at priority 11+ to be safe.

## Critical rules

- **BETA plugin.** Pin a version, review CHANGELOG before upgrading. Schema can shift between minor versions.
- **Use `ProgressRepository::upsert()` to mutate progress, never raw SQL.** Skipping the upsert misses the completion snapshot AND the action hooks.
- **`lw_lms_has_course_access` is the access override seam.** Don't write to `wp_lms_access` from companion code; filter instead.
- **`lw_lms_has_lesson_access` for lesson-level overrides.** Receives the cascaded course-access result.
- **Pass-through pattern in access filters:** `if ($has_access) return $has_access;` — flip for revocation.
- **Lock-on-complete snapshot is a feature, not a bug.** Users at 100% stay at 100% even when lessons are added later.
- **Custom caps land on admin only on activation.** Other roles must opt in via `add_role` / `WP_Role::add_cap`.
- **Action hooks fire from the REST controller** ([ProgressController.php:171, 175](ProgressController.php)). If you mark progress via raw SQL bypassing the controller AND `ProgressRepository::upsert`, the actions don't fire.
- **`lw-lms-frontend-build` is the consumer skill** for the REST API surface — this skill is the EXTENDER's surface.
- **Site Manager integration is optional.** The plugin works fine standalone; the abilities only register when LW Site Manager is active (via the action hooks).
- **Hook at priority ≥ 11 on `plugins_loaded`** if you're depending on lw-lms classes being loaded.

## Common mistakes

```php
// WRONG — direct SQL into wp_lms_progress
global $wpdb;
$wpdb->insert( $wpdb->prefix . 'lms_progress', [
    'user_id'   => $user_id,
    'course_id' => $course_id,
    'lesson_id' => $lesson_id,
    'status'    => 'completed',
] );
// Skips: action hooks (lw_lms_lesson_completed, lw_lms_course_completed),
// the completion snapshot, the calculator cache.

// RIGHT — repository call
\LightweightPlugins\LMS\Progress\ProgressRepository::upsert(
    $user_id, $course_id, $lesson_id, 'completed'
);

// WRONG — querying wp_lms_access directly for "has access?" logic
global $wpdb;
$row = $wpdb->get_row( $wpdb->prepare(
    "SELECT expires_at FROM {$wpdb->prefix}lms_access WHERE user_id = %d AND course_id = %d",
    $user_id, $course_id
) );
$has_access = $row && ( ! $row->expires_at || $row->expires_at > time() );
// Misses: subscription check, legacy fallback, open/free access types.

// RIGHT
$has_access = \LightweightPlugins\LMS\Access\AccessChecker::has_course_access( $course_id, $user_id );

// WRONG — filter callback that ignores existing cascade
add_filter( 'lw_lms_has_course_access', function () {
    return true;   // "everyone has access" — even open/free/paid cascade now overridden
}, 10 );
// Likely not what you wanted; cascade still ran and would have returned the right answer.

// RIGHT — pass-through unless YOU have an opinion
add_filter( 'lw_lms_has_course_access', function ( $has_access, $course_id, $user_id ) {
    if ( $has_access ) return $has_access;          // cascade granted — leave it
    if ( my_logic_grants( $user_id, $course_id ) )  return true;   // additive grant
    return $has_access;                              // preserve cascade default (false)
}, 10, 3 );

// WRONG — assuming custom caps are on author role
$author = get_role( 'author' );
$author->add_cap( 'edit_courses' );   // does this in MY plugin
// Conflicts: if lw-lms ever adds caps to author role itself in a future version,
// you've duplicated the logic. Just call `add_cap` ONCE during activation.

// RIGHT — opt-in custom roles
register_activation_hook( __FILE__, function () {
    $instructor = get_role( 'instructor' );
    if ( $instructor && ! $instructor->has_cap( 'edit_courses' ) ) {
        $instructor->add_cap( 'edit_courses' );
        $instructor->add_cap( 'edit_lessons' );
    }
} );

// WRONG — hooking before plugins_loaded
add_filter( 'lw_lms_has_course_access', 'my_callback' );   // fired in main plugin file
// If your plugin loads BEFORE lw-lms, the hook is registered fine — but if you reference
// \LightweightPlugins\LMS\... classes inside, autoloader hasn't run yet.

// RIGHT — defer to plugins_loaded with priority 11+
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( '\LightweightPlugins\LMS\Plugin' ) ) return;
    add_filter( 'lw_lms_has_course_access', 'my_callback', 10, 3 );
}, 11 );

// WRONG — missing argument count on hook registration
add_action( 'lw_lms_course_completed', 'my_handler' );
function my_handler( $course_id ) { /* ... */ }
// $user_id silently null; second action argument is dropped.

// RIGHT — explicit count
add_action( 'lw_lms_course_completed', 'my_handler', 10, 2 );
function my_handler( int $course_id, int $user_id ) { /* ... */ }

// WRONG — assuming the lock-on-complete snapshot will reset on lesson add
add_action( 'save_post_lesson', function ( $post_id ) {
    // If lesson was just added, recalculate every user's percentage
    foreach ( get_users() as $u ) {
        recalculate_for_user( $u->ID );   // 🔴 fights the snapshot design
    }
} );
// LearnDash works the same way (per CHANGELOG note); the snapshot IS the design.

// RIGHT — let it be. Users at 100% stay at 100%. New lesson is "extra material" for them.
```

## Cross-references

- Run **`lw-lms-frontend-build`** for the REST API consumer side — courses, lessons, progress endpoints used to build a frontend on top of this plugin.
- Run **`lw-site-manager-extend-abilities`** when registering `lw-lms/*` abilities into the LW Site Manager hub — the plugin itself uses this contract at `src/SiteManager/Integration.php`.
- Run **`wp-plugin-options-storage`** for "post meta vs custom table vs option" decisions if you're storing companion-plugin data alongside lw-lms.
- Run **`wcs-subscription-hooks`** when integrating with `paid` access type via WC Subscriptions — the plugin checks `WooCommerceChecker::has_active_subscription()` which is `wcs_user_has_subscription()` underneath.

## What this skill does NOT cover

- **Frontend rendering.** lw-lms ships no public templates; the consumer side is `lw-lms-frontend-build`.
- **Per-CPT meta detailed editing UI.** Internal admin metaboxes (`CourseContentMetabox`, `LessonVideoMetabox`) are private; companion code should write meta via `update_post_meta` if needed but should NOT subclass / instantiate the metaboxes.
- **WP-CLI migration commands.** `wp lw-lms migrate-learndash` is one-time tooling; not part of the extension contract.
- **`Options::META_PREFIX` value mutation.** The prefix is a public class constant but treat it as read-only — mutating across plugins breaks every meta lookup.
- **Direct `WooCommerceChecker` consumption.** It's a private detail of the access cascade; use `AccessChecker::has_course_access()` instead.
- **Replacing `ProgressCalculator`.** No supported override; the snapshot logic is internal.

## References

- Plugin entry: [wp-content/plugins/lw-lms-main/lw-lms.php](lw-lms.php) — header, namespace, constants, `plugins_loaded` init.
- Main Plugin class: [includes/Plugin.php](Plugin.php) — `init_hooks` at line 70, `init_components` at 82, REST + access + WC + Site Manager wiring.
- Activator: [includes/Activator.php](Activator.php) — DB version `1.2.0` at line 25, table creation 55-66, custom caps 73-97.
- Action: `lw_lms_attachment_downloaded` at [includes/Api/Controllers/DownloadController.php:90](DownloadController.php).
- Actions: `lw_lms_lesson_completed` and `lw_lms_course_completed` at [includes/Api/Controllers/ProgressController.php:171,175](ProgressController.php).
- Filters: `lw_lms_has_course_access` at [includes/Access/AccessChecker.php:78](AccessChecker.php), `lw_lms_has_lesson_access` at [AccessChecker.php:115](AccessChecker.php).
- Access cascade order: [AccessChecker.php:33-79](AccessChecker.php) — open / free / paid (table → subscription → legacy) → filter.
- Progress repository: [includes/Progress/ProgressRepository.php](ProgressRepository.php) — `upsert()` is the canonical mutation entry; calls `CompletionTracker::maybe_record()` for snapshots.
- Site Manager integration example: [includes/SiteManager/Integration.php](Integration.php), [includes/SiteManager/LmsAbilities.php](LmsAbilities.php).
- Course meta: [includes/Meta/CourseMeta.php](CourseMeta.php) — 9 keys.
- Lesson meta: [includes/Meta/LessonMeta.php](LessonMeta.php) — 6 keys.
- CHANGELOG: [CHANGELOG.md](CHANGELOG.md) — v1.2.14 lock-on-complete, v1.2.12 site-manager integration, v1.2.0 manual enrollment, v1.1.0 time-limited access.
