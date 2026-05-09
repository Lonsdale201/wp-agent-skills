---
name: lw-lms-backend-extend
description: Backend extension contract for the LW LMS plugin
  (lwplugins/lw-lms, BETA — README explicitly says "not recommended
  for production use"). Headless LMS — courses, lessons, sections,
  progress, access control. Custom hooks (verified for v1.3.0) — six
  actions (lw_lms_after_grant, lw_lms_after_revoke,
  lw_lms_lesson_completed, lw_lms_course_completed,
  lw_lms_attachment_downloaded, plus the family-shared
  lw_plugins_overview_cards) and three filters
  (lw_lms_pre_grant, lw_lms_has_course_access, lw_lms_has_lesson_access).
  Single canonical enrollment event — lw_lms_after_grant fires for
  every grant path (Woo, manual admin, free, future subscription),
  no shim required. Public API is split read vs write — AccessRepository
  / ProgressRepository for writes, AccessQueries / ProgressQueries
  for reads. ProgressRepository::mark_course_completed(user_id, course_id)
  is the canonical force-complete entry. Three DB tables (wp_lms_progress,
  wp_lms_access, wp_lms_completion_snapshots). 11 custom capabilities
  (manage_lms, edit_courses, etc.) added to admin role on activation.
  Optional Site Manager / Abilities API integration. Use when extending
  the plugin (issuing certificates, custom access logic, gamification,
  custom analytics, FluentCRM-style enrollment automation). Triggers
  on lw_lms_*, course / lesson CPTs, AccessChecker, AccessRepository,
  AccessQueries, ProgressRepository, ProgressQueries, CompletionTracker.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-lms
plugin-version-tested: "1.3.0"
php-min: "8.1"
last-updated: "2026-05-06"
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
  - wp-content/plugins/lw-lms-main/includes/Meta/SubscriptionVariationMeta.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessChecker.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessRepository.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessQueries.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessGranter.php
  - wp-content/plugins/lw-lms-main/includes/Access/AccessTable.php
  - wp-content/plugins/lw-lms-main/includes/Access/WooCommerceChecker.php
  - wp-content/plugins/lw-lms-main/includes/Access/SubscriptionVariationChecker.php
  - wp-content/plugins/lw-lms-main/includes/Admin/UserProfile.php
  - wp-content/plugins/lw-lms-main/includes/Admin/UserProfile/EnrollmentHandler.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressRepository.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressQueries.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressCalculator.php
  - wp-content/plugins/lw-lms-main/includes/Progress/CompletionTracker.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotRepository.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotTable.php
  - wp-content/plugins/lw-lms-main/includes/Progress/ProgressSnapshotMigration.php
  - wp-content/plugins/lw-lms-main/includes/Api/Controllers/ProgressController.php
  - wp-content/plugins/lw-lms-main/includes/Api/Controllers/DownloadController.php
  - wp-content/plugins/lw-lms-main/includes/SiteManager/Integration.php
  - wp-content/plugins/lw-lms-main/includes/SiteManager/Abilities/AbilityPermissions.php
  - wp-content/plugins/lw-lms-main/CHANGELOG.md
---

# LW LMS: backend extension contract

For developers extending the [LW LMS](https://github.com/lwplugins/lw-lms) plugin from a companion plugin or theme — issuing certificates on completion, adding gamification, custom access policies, analytics integration, FluentCRM / email-automation enrollment funnels, custom admin metaboxes that talk to the LMS data model. The plugin's backend is small and clean; this skill maps the verified extension surface so you know what to hook and what NOT to mutate directly.

> **BETA NOTICE.** The plugin's README explicitly states "This plugin is under active development and is not recommended for production use." Schema and hook signatures may shift between minor versions. Pin a tested version in production and review the CHANGELOG before upgrading. This skill is verified against **v1.3.0**.

> **What changed in v1.3.0** (the version this skill targets):
> - **NEW** `lw_lms_after_grant` action (5 args) — fires after `AccessRepository::grant()` writes a row, regardless of source (Woo, manual, free, future subscription). Single canonical enrollment hook — replaces the v1.2.x shim pattern.
> - **NEW** `lw_lms_after_revoke` action (3 args) — fires only when an active row was actually flipped to revoked.
> - **NEW** `lw_lms_pre_grant` filter (6 args) — return false to abort a grant before any DB write.
> - **NEW** Free-course implicit enrollment — first time a logged-in user accesses a free course, a `source='free'` row is inserted (idempotent), so `lw_lms_after_grant` fires for free enrollments.
> - **NEW** `ProgressRepository::mark_course_completed(user_id, course_id)` — enumerates published lessons and upserts each as completed; the final upsert fires `lw_lms_lesson_completed` + `lw_lms_course_completed` naturally.
> - **MOVED** `lw_lms_lesson_completed` now fires from `ProgressRepository::upsert()`, and `lw_lms_course_completed` from `CompletionTracker::maybe_record()`. Previously they fired only from the REST controller, so CLI / cron / programmatic completions were silent. They are now centralized — every code path that mutates progress fires them.
> - **SPLIT** `AccessRepository` and `ProgressRepository` are now writes-only. Reads moved to `AccessQueries` / `ProgressQueries`. Direct callers of the read methods on the old class names should migrate.

## Misconception this skill corrects

> "It's just a CPT-and-meta plugin — I'll write directly to `_lw_lms_*` post meta and the `wp_lms_progress` / `wp_lms_access` tables to integrate."

Wrong direction. The plugin already exposes the right contract through hooks; bypassing them creates fragile coupling and **skips the action hooks downstream automation depends on.**

The cases where AI assistants reach for direct DB access most often, and the right alternative:

1. **"Mark a lesson complete from my plugin"** → don't `INSERT INTO wp_lms_progress`. Call `ProgressRepository::upsert($user_id, $course_id, $lesson_id, 'completed')`. Since v1.3.0 the upsert fires `lw_lms_lesson_completed` AND `CompletionTracker::maybe_record()` AND `lw_lms_course_completed` (when applicable) — direct INSERTs skip all of that.
2. **"Force-complete an entire course"** → don't loop `upsert` yourself. Call `ProgressRepository::mark_course_completed($user_id, $course_id)`. It enumerates published lessons, upserts each, the final upsert fires the completion hooks.
3. **"Override course access for my membership plugin"** → don't write to `wp_lms_access`. Hook the `lw_lms_has_course_access` filter at [AccessChecker.php:90](AccessChecker.php) — fires LAST in the access cascade, so any custom logic returns true even when the plugin's own checks return false.
4. **"Programmatically enroll a user in a course"** → don't write directly to `wp_lms_access`. Call `AccessRepository::grant($user_id, $course_id, 'manual', null, $expires_at)`. Since v1.3.0 it fires `lw_lms_after_grant` — direct INSERTs skip the hook AND skip the `lw_lms_pre_grant` filter that companion plugins may use to enforce blocklists / quotas.
5. **"Read whether a user has access"** → since v1.3.0 the read API moved. Call `AccessQueries::has_active_access($user_id, $course_id)` (optional `$source` argument for source-specific check), NOT `AccessRepository::has_active_access()`.

Other AI-prone misconceptions:

- **"There's a `lw_lms_user_enrolled` action."** Wrong name. The action is `lw_lms_after_grant` (5 args). It fires for every enrollment path (Woo, manual, free; subscription is checked at runtime in v1.3.0 — see "Subscription enrollment" below). AI assistants tend to invent the name `lw_lms_user_enrolled` from analogy with other LMS plugins; the real hook is named after the underlying operation.
- **"I'll catch enrollment by hooking `woocommerce_order_status_completed`."** That worked as a v1.2.x shim. Since v1.3.0 it's redundant and risky — `lw_lms_after_grant` already fires for the Woo path. Hooking the Woo event would double-fire your callback.
- **"`AccessRepository::grant()` doesn't fire any action."** Outdated — that was the v1.2.x reality, fixed in v1.3.0. If you read older docs/issues recommending shims, ignore them.
- **"The plugin emits no filters."** Wrong — three filters: `lw_lms_pre_grant` (abort grant), `lw_lms_has_course_access`, `lw_lms_has_lesson_access`. The pre-grant filter is the hook to use for blocklists, region restrictions, max-seats-per-course quotas.
- **"Adding a lesson mid-course retroactively recalculates completion percentages."** No — design choice (1.2.14 added the lock-on-complete snapshot). Users at 100% stay at 100%; new lessons become "extra material" for them.
- **"Custom capabilities are managed via the WP roles UI."** They're added to the `administrator` role on activation ([Activator.php:73-97](Activator.php)), but not auto-pushed to other roles. Custom roles have to opt in via `add_role` or `WP_Role::add_cap`.

## When to use this skill

Trigger when ANY of the following is true:

- The diff hooks `lw_lms_*` actions or filters.
- A companion plugin / theme wants to extend lw-lms (certificates, email automation, gamification, analytics, FluentCRM funnels).
- Someone proposes writing directly to `wp_lms_progress` / `wp_lms_access` / `_lw_lms_*` post meta from outside the plugin.
- Adding lw-lms abilities to the LW Site Manager hub or registering directly via the WP 6.9+ Abilities API.
- Reviewing custom code that calls `AccessChecker::has_course_access()`, `AccessQueries::*`, `ProgressRepository::*`, or `ProgressQueries::*`.

## Plugin identity (verified)

| Field | Value | Source |
|---|---|---|
| Slug | `lw-lms` | header |
| Version | `1.3.0` | [lw-lms.php:6](lw-lms.php) |
| Status | **BETA** | README line 3 |
| Min WP | 6.0 | header |
| Min PHP | 8.1 | header |
| Namespace | `LightweightPlugins\LMS` | header / autoload |
| Constants | `LW_LMS_VERSION`, `LW_LMS_FILE`, `LW_LMS_PATH`, `LW_LMS_URL` | [lw-lms.php](lw-lms.php) |
| Text domain | `lw-lms` | header |
| Meta prefix | `_lw_lms_` | [Options.php](Options.php) — `Options::META_PREFIX` |
| DB option | `lw_lms_options` | `Options::OPTION_NAME` |
| DB version | `1.2.0` | `Activator::DB_VERSION` |
| GitHub | <https://github.com/lwplugins/lw-lms> | header |

## Data model (verified)

**Custom post types** ([includes/PostTypes/](PostTypes/)):

- `course` — top-level CPT
- `lesson` — child of course (admin menu nested under courses)

**Taxonomies** ([includes/Taxonomies/](Taxonomies/)): `course_category`, `course_tag`, `course_level`.

**Custom DB tables** ([Activator.php](Activator.php)):

- `wp_lms_progress` — `(user_id, course_id, lesson_id, status, completed_at)`. The lesson-progress source of truth.
- `wp_lms_access` — `(user_id, course_id, source, source_id, granted_at, expires_at, status)`. Enrollment / access-grant rows. UNIQUE on `(user_id, course_id, source_id)`. Status is `active` or `revoked`. Source values: `'manual'`, `'woocommerce'`, `'free'` (since 1.3.0), and the future `'subscription'`.
- `wp_lms_completion_snapshots` — `(user_id, course_id, total_lessons, completed_at)` UNIQUE on `(user_id, course_id)`. Lock-on-complete snapshot — total_lessons frozen at the moment the user first hit 100%.

**Custom capabilities** ([Activator.php:80-92](Activator.php)): `manage_lms`, `edit_courses`, `edit_others_courses`, `publish_courses`, `read_private_courses`, `delete_courses`, plus the same six for `lessons`. Added to `administrator` role on activation. Other roles must opt in.

**Post meta** (all `_lw_lms_*` prefix, all `register_post_meta`'d with `show_in_rest: true`):

| CPT | Meta key | Type | Purpose |
|---|---|---|---|
| course | `_lw_lms_access_type` | string | `open` / `free` / `paid` |
| course | `_lw_lms_product_ids` | array<int> | WC product IDs that grant access |
| course | `_lw_lms_subscription_ids` | array<int> | WC parent-level subscription IDs |
| course | `_lw_lms_subscription_variation_ids` | array<string> | WC variation-level subscription pairs `parent_id:variation_id` (since 1.2.15) |
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

## Custom hooks (verified for v1.3.0)

### Actions

| Hook | Args | Fires at | Source |
|---|---|---|---|
| `lw_lms_after_grant` | `$user_id, $course_id, $source, $source_id, $expires_at` (5) | After `AccessRepository::grant()` writes (insert OR update). Single canonical enrollment event — fires for ALL paths that go through grant(). | [AccessRepository.php:121](AccessRepository.php) |
| `lw_lms_after_revoke` | `$user_id, $course_id, $source` (3) | After `AccessRepository::revoke()` flips an active row to revoked. Does NOT fire if there was nothing to revoke. | [AccessRepository.php:180](AccessRepository.php) |
| `lw_lms_lesson_completed` | `$lesson_id, $user_id` (2) | When `ProgressRepository::upsert()` writes status='completed' AND the previous state was not already 'completed'. Centralized — fires for REST, CLI, cron, programmatic, force-complete. | [ProgressRepository.php:84](ProgressRepository.php) |
| `lw_lms_course_completed` | `$course_id, $user_id` (2) | When `CompletionTracker::maybe_record()` first detects the user hit 100% (snapshot row was just written). Fires exactly once per user × course pair. | [CompletionTracker.php:57](CompletionTracker.php) |
| `lw_lms_attachment_downloaded` | `$attachment_id, $user_id` (2) | After successful attachment download via REST. | [DownloadController.php:90](DownloadController.php) |
| `lw_plugins_overview_cards` | (none) | Family-shared admin overview hook (not lw-lms-specific; also used by other LW plugins). | [Admin/ParentPage.php:140](ParentPage.php) |

### Filters

| Hook | Args | Default | Source |
|---|---|---|---|
| `lw_lms_pre_grant` | `$allow, $user_id, $course_id, $source, $source_id, $expires_at` (6) | `true` | [AccessRepository.php:53](AccessRepository.php) |
| `lw_lms_has_course_access` | `$has_access, $course_id, $user_id` (3) | `false` (only fires when none of the built-in cascade granted access) | [AccessChecker.php:90](AccessChecker.php) |
| `lw_lms_has_lesson_access` | `$has_access, $lesson_id, $user_id` (3) | result of `has_course_access()` (or true for preview lessons + logged-in users) | [AccessChecker.php:127](AccessChecker.php) |

### Enrollment cascade — what `lw_lms_after_grant` covers

| Path | `source` value | Fires `lw_lms_after_grant`? |
|---|---|---|
| WooCommerce order completed → `AccessGranter::handle_order_completed()` → `grant()` | `'woocommerce'` | yes |
| Admin user-profile manual grant → `EnrollmentHandler::process_grant()` → `grant()` | `'manual'` | yes |
| Free-course first access → `AccessChecker::has_course_access()` lazy `grant()` | `'free'` | yes (since 1.3.0) |
| Programmatic `AccessRepository::grant()` from companion code | whatever you pass | yes |
| WC Subscription access (parent-level via `WooCommerceChecker::has_active_subscription()`) | (no row) | no — checked at runtime, never written |
| WC Subscription variation access (`SubscriptionVariationChecker`) | (no row) | no — checked at runtime |

If you need to react to subscription activation/cancellation, hook WC Subscriptions directly — see **`wcs-subscription-hooks`**. The subscription paths are the only enrollment routes that don't fire `lw_lms_after_grant`. A future plugin version may add a SubscriptionAccessSync to write rows on `woocommerce_subscription_status_active`, at which point this gap closes.

### Note on filter cascade

`lw_lms_has_course_access` fires AFTER:

1. `access_type === 'open'` → return true unfiltered
2. Not logged in for `free` / `paid` → return false unfiltered
3. `access_type === 'free'` + logged in → lazy `grant()` (since 1.3.0) and return true unfiltered
4. `access_type === 'paid'` → check `wp_lms_access` (`AccessQueries::has_active_access`) → check parent subscription → check variation subscription → check legacy WC purchase

Only when ALL four steps fail does the filter run with `$has_access = false`. This is the spot for "my custom membership plugin grants access" logic — return `true` and access is granted.

`lw_lms_has_lesson_access` fires AFTER preview check + course access check. Receives the result and lets you override (e.g. "this premium lesson requires its own gate beyond the course").

## Public API — read vs. write split (since v1.3.0)

The repository / queries split is the v1.3.0 change most likely to break existing companion code that called `AccessRepository::has_active_access()` or `ProgressRepository::get()`. Migrate calls.

### Access — writes (`AccessRepository`)

| Method | Signature | Notes |
|---|---|---|
| `grant` | `(int $user_id, int $course_id, string $source = 'manual', ?int $source_id = null, ?string $expires_at = null): bool` | Fires `lw_lms_pre_grant` filter (abortable) + `lw_lms_after_grant` action. Idempotent on `(user_id, course_id, source_id)` — re-grant updates `granted_at` and `expires_at` on the existing row. |
| `revoke` | `(int $user_id, int $course_id): bool` | Flips the first matching active row to `status='revoked'`. Returns false if there was nothing active to revoke. Fires `lw_lms_after_revoke` only on success. |

### Access — reads (`AccessQueries`)

| Method | Signature | Notes |
|---|---|---|
| `has_active_access` | `(int $user_id, int $course_id, ?string $source = null): bool` | Optional `$source` argument restricts to a specific source. Use `'free'` to check the free-course implicit-enrollment row, etc. Excludes expired rows. |
| `get_user_access` | `(int $user_id, int $course_id): ?object` | Full row (id, source, source_id, granted_at, expires_at, status). Returns the row with the latest `expires_at`. |
| `get_user_enrollments` | `(int $user_id): array<int, object>` | All active access rows for a user, ordered by `granted_at` DESC. |

### Progress — writes (`ProgressRepository`)

| Method | Signature | Notes |
|---|---|---|
| `upsert` | `(int $user_id, int $course_id, int $lesson_id, string $status): bool` | Fires `lw_lms_lesson_completed` on transition to completed (NOT on re-marking already-completed). Always calls `CompletionTracker::maybe_record()` afterward, which fires `lw_lms_course_completed` once when the snapshot is first written. |
| `delete` | `(int $user_id, int $lesson_id): bool` | Deletes the row. No hooks. |
| `mark_course_completed` | `(int $user_id, int $course_id): bool` | Enumerates published lessons assigned to the course, upserts each as `'completed'`. The final upsert naturally triggers the completion hooks. Returns true if at least one row was written. |

### Progress — reads (`ProgressQueries`)

| Method | Signature | Notes |
|---|---|---|
| `get` | `(int $user_id, int $lesson_id): ?object` | Single row. |
| `get_course_progress` | `(int $user_id, int $course_id): array` | All progress rows for one user × course. |
| `get_user_progress` | `(int $user_id): array` | All progress rows for one user. |
| `get_completed_lessons` | `(int $user_id, int $course_id): array<int>` | Lesson IDs only. |

## Workflow

### 1. Single canonical enrollment event — react to "user enrolled in course"

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\LightweightPlugins\LMS\Access\AccessRepository' ) ) {
        return;
    }

    add_action(
        'lw_lms_after_grant',
        static function ( int $user_id, int $course_id, string $source, ?int $source_id, ?string $expires_at ): void {
            // Single canonical hook: fires for Woo, manual, free, and any
            // programmatic grant. Branch on $source if you need path-specific logic.
            MyDripScheduler::start( $user_id, $course_id );
            MyAnalytics::track( 'enrollment', compact( 'user_id', 'course_id', 'source' ) );
        },
        10,
        5    // CRITICAL: 5 args, otherwise everything past $user_id is silently dropped
    );
}, 11 );
```

This is the post-1.3.0 pattern. The v1.2.x shim that observed `woocommerce_order_status_completed` + `edit_user_profile_update` separately is no longer needed — delete that shim if you wrote one.

### 2. Block / abort an enrollment with `lw_lms_pre_grant`

```php
add_filter(
    'lw_lms_pre_grant',
    static function ( bool $allow, int $user_id, int $course_id, string $source, ?int $source_id, ?string $expires_at ): bool {
        if ( ! $allow ) {
            return $allow;     // someone earlier already aborted
        }

        if ( MyBlocklist::is_user_blocked( $user_id ) ) {
            return false;      // grant() returns early, no row written, no after_grant fired
        }

        if ( MySeats::is_full( $course_id ) ) {
            return false;
        }

        return $allow;
    },
    10,
    6    // 6 args
);
```

Returning `false` aborts the grant completely — no DB write, no `lw_lms_after_grant`. Useful for "max 50 seats per cohort", "blocklisted email domain", "country restriction".

### 3. Issue a certificate on course completion

```php
add_action( 'lw_lms_course_completed', static function ( int $course_id, int $user_id ): void {
    if ( ! $course_id || ! $user_id ) {
        return;
    }
    MyCertificateGenerator::issue( $user_id, $course_id );
}, 10, 2 );
```

Fires exactly once per user × course pair (snapshot prevents re-fire). Re-marking an already-completed lesson does not re-fire course_completed.

### 4. Custom access policy via filter

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

For REVOCATION (cascade granted access but YOU want to deny):

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

Note that for additive grants you can also use `lw_lms_pre_grant` (write a row) instead of filtering access checks — the row-based approach is more performant since it short-circuits the cascade at step 4 (`AccessQueries::has_active_access`) rather than running the cascade and then filtering.

### 5. Lesson completion → custom analytics

```php
add_action( 'lw_lms_lesson_completed', static function ( int $lesson_id, int $user_id ): void {
    $course_id = (int) get_post_meta( $lesson_id, '_lw_lms_lesson_course_id', true );
    MyAnalytics::track( 'lesson_completed', compact( 'lesson_id', 'user_id', 'course_id' ) );
}, 10, 2 );
```

Since v1.3.0 this fires from `ProgressRepository::upsert()` directly — covers REST, CLI, cron, force-complete, any code path that writes progress.

### 6. Force-complete an entire course (admin override, payment-fast-track, etc.)

```php
use \LightweightPlugins\LMS\Progress\ProgressRepository;

ProgressRepository::mark_course_completed( $user_id, $course_id );
```

Internal flow:

1. Enumerate published lessons assigned to the course (via `_lw_lms_lesson_course_id` meta query).
2. `upsert()` each as `'completed'`.
3. Each non-redundant upsert fires `lw_lms_lesson_completed`.
4. Final upsert triggers `CompletionTracker::maybe_record()` → snapshot row written → `lw_lms_course_completed` fires.

Returns `true` if at least one upsert succeeded. Idempotent (re-calling on a fully-completed course is a no-op for the hooks).

### 7. Programmatic enrollment with custom expiry

```php
use \LightweightPlugins\LMS\Access\AccessRepository;

AccessRepository::grant(
    $user_id,
    $course_id,
    'manual',                                     // or any custom source string
    null,                                         // source_id (e.g. order_id for woo)
    gmdate( 'Y-m-d H:i:s', strtotime( '+30 days' ) )  // expires in 30 days, or null for unlimited
);
```

Fires `lw_lms_pre_grant` filter (abortable) + `lw_lms_after_grant` action on success.

### 8. Reading access state programmatically

```php
use \LightweightPlugins\LMS\Access\AccessChecker;
use \LightweightPlugins\LMS\Access\AccessQueries;

// High-level: full cascade including subscriptions, legacy purchases, filter
if ( AccessChecker::has_course_access( $course_id, $user_id ) ) {
    // ...
}

// Detailed access info (type, expiry, requires, products, subscriptions, subscription_variations)
$access_info = AccessChecker::get_access_info( $course_id, $user_id );

// Low-level: just the access table row, no cascade
if ( AccessQueries::has_active_access( $user_id, $course_id ) ) {
    // ...
}

// Source-specific: was this user enrolled via the free-course implicit path?
if ( AccessQueries::has_active_access( $user_id, $course_id, 'free' ) ) {
    // ...
}

// All enrollments for a user (across all courses)
$rows = AccessQueries::get_user_enrollments( $user_id );
```

Use `AccessChecker::has_course_access()` when you need the full cascade (cheapest call site for "is this user allowed to see X"). Use `AccessQueries::has_active_access()` when you specifically want "does a row exist in `wp_lms_access`" — for example to distinguish a paid enrollment from an open course.

### 9. Site Manager / Abilities API integration

The plugin auto-registers `lw-lms/*` abilities via TWO mechanisms (since 1.2.16):

1. **Site Manager bridge** — preferred when [LW Site Manager](https://github.com/lwplugins/lw-site-manager) is active. Hook: `lw_site_manager_register_abilities`.
2. **Direct WP Abilities API** — fallback on `wp_abilities_api_init` (priority 20). Works without Site Manager, only requires WP 6.9+ Abilities API or the feature plugin.

Companion plugins that want to add their own `mycompanion-lms/*` abilities:

```php
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

### 10. Plugin-loaded guards

When your companion plugin requires lw-lms but you don't want to hard-fail without it:

```php
add_action( 'plugins_loaded', static function (): void {
    if ( ! class_exists( '\LightweightPlugins\LMS\Plugin' ) ) {
        return;   // lw-lms not active; bail
    }

    add_action( 'lw_lms_after_grant',     'mycompanion_handle_enrollment', 10, 5 );
    add_action( 'lw_lms_course_completed', 'mycompanion_issue_certificate', 10, 2 );
}, 11 );   // priority 11+ so lw-lms's plugins_loaded init has run
```

## Critical rules

- **BETA plugin.** Pin a version, review CHANGELOG before upgrading. Schema can shift between minor versions.
- **Use `ProgressRepository::upsert()` to mutate progress, never raw SQL.** Skipping the upsert misses the completion snapshot AND the action hooks (`lw_lms_lesson_completed`, `lw_lms_course_completed`).
- **Use `AccessRepository::grant()` / `revoke()` to mutate access, never raw SQL.** Skipping them misses `lw_lms_pre_grant`, `lw_lms_after_grant`, `lw_lms_after_revoke`.
- **Read API moved to `AccessQueries` / `ProgressQueries` in v1.3.0.** Old calls to `AccessRepository::has_active_access()` etc. are gone. Migrate.
- **`lw_lms_after_grant` registers with 5 args.** `lw_lms_after_revoke` with 3. `lw_lms_pre_grant` with 6. Forgetting the arg count silently drops parameters — `add_action( 'lw_lms_after_grant', $cb )` only passes `$user_id` to your callback.
- **`lw_lms_after_grant` is THE single enrollment event** since v1.3.0. Don't observe upstream events (`woocommerce_order_status_completed`, `edit_user_profile_update`) — that's the obsolete v1.2.x shim and will double-fire post-1.3.0.
- **Subscription paths still don't fire `lw_lms_after_grant`** — they're runtime checks via `WooCommerceChecker::has_active_subscription()` and `SubscriptionVariationChecker::has_active()`. To react to subscription lifecycle, hook WC Subscriptions directly.
- **`lw_lms_has_course_access` is the access override seam.** Don't write to `wp_lms_access` for "additive" access; either filter access checks or use `AccessRepository::grant()`.
- **`lw_lms_has_lesson_access` for lesson-level overrides.** Receives the cascaded course-access result.
- **Pass-through pattern in access filters:** `if ($has_access) return $has_access;` — flip for revocation.
- **Lock-on-complete snapshot is a feature, not a bug.** Users at 100% stay at 100% even when lessons are added later.
- **Custom caps land on admin only on activation.** Other roles must opt in via `add_role` / `WP_Role::add_cap`.
- **Hook at priority ≥ 11 on `plugins_loaded`** if you're depending on lw-lms classes being loaded.
- **Free-course implicit enrollment writes a row on first access** (since 1.3.0). If you query `wp_lms_access` and find a `source='free'` row, that's the lazy-grant — not necessarily a manual operation.

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
// Skips: lw_lms_lesson_completed, lw_lms_course_completed, the completion snapshot.

// RIGHT — repository call
\LightweightPlugins\LMS\Progress\ProgressRepository::upsert(
    $user_id, $course_id, $lesson_id, 'completed'
);

// WRONG — looping upsert manually for force-complete
foreach ( $course_lesson_ids as $lid ) {
    ProgressRepository::upsert( $user_id, $course_id, $lid, 'completed' );
}
// Works, but you re-implement the lesson enumeration. Use the helper.

// RIGHT — single call (since 1.3.0)
ProgressRepository::mark_course_completed( $user_id, $course_id );

// WRONG — direct SQL into wp_lms_access for enrollment
$wpdb->insert( $wpdb->prefix . 'lms_access', [
    'user_id'   => $user_id,
    'course_id' => $course_id,
    'source'    => 'manual',
    'status'    => 'active',
    /* ... */
] );
// Skips: lw_lms_pre_grant filter (companion plugins can't enforce blocklists),
// skips: lw_lms_after_grant action (downstream automation never fires).

// RIGHT — repository call (since 1.3.0)
\LightweightPlugins\LMS\Access\AccessRepository::grant(
    $user_id, $course_id, 'manual'
);

// WRONG — querying wp_lms_access directly for "has access?" logic
global $wpdb;
$row = $wpdb->get_row( $wpdb->prepare(
    "SELECT expires_at FROM {$wpdb->prefix}lms_access WHERE user_id = %d AND course_id = %d",
    $user_id, $course_id
) );
$has_access = $row && ( ! $row->expires_at || $row->expires_at > time() );
// Misses: subscription check, variation-subscription check, legacy fallback,
// open / free access types, the access filter.

// RIGHT — full cascade
$has_access = \LightweightPlugins\LMS\Access\AccessChecker::has_course_access( $course_id, $user_id );

// RIGHT (when you specifically want "is there an access table row?")
$has_row = \LightweightPlugins\LMS\Access\AccessQueries::has_active_access( $user_id, $course_id );

// WRONG — calling the OLD location of has_active_access
\LightweightPlugins\LMS\Access\AccessRepository::has_active_access( $user_id, $course_id );
// Method moved to AccessQueries in v1.3.0; this fatals.

// WRONG — hooking a non-existent enrollment action
add_action( 'lw_lms_user_enrolled', 'my_handler', 10, 2 );
// Hook is named lw_lms_after_grant (5 args), not lw_lms_user_enrolled.

// RIGHT
add_action( 'lw_lms_after_grant', 'my_handler', 10, 5 );
function my_handler( $user_id, $course_id, $source, $source_id, $expires_at ) { /* ... */ }

// WRONG — shimming with upstream events post-1.3.0
add_action( 'woocommerce_order_status_completed', 'my_woo_handler', 11 );
add_action( 'edit_user_profile_update', 'my_admin_handler', 11 );
// Both will run AND lw_lms_after_grant will also fire — duplicate processing.
// Delete the shim, hook lw_lms_after_grant instead.

// WRONG — filter callback that ignores existing cascade
add_filter( 'lw_lms_has_course_access', function () { return true; }, 10 );
// "Everyone has access" — open / free / paid cascade still ran; this just nukes the result.
// Likely not what you wanted.

// RIGHT — pass-through unless YOU have an opinion
add_filter( 'lw_lms_has_course_access', function ( $has_access, $course_id, $user_id ) {
    if ( $has_access ) return $has_access;          // cascade granted — leave it
    if ( my_logic_grants( $user_id, $course_id ) )  return true;   // additive grant
    return $has_access;                              // preserve cascade default (false)
}, 10, 3 );

// WRONG — assuming custom caps are on author role
$author = get_role( 'author' );
$author->add_cap( 'edit_courses' );
// In a future plugin version lw-lms might add caps to author itself; you'd duplicate.

// RIGHT — opt-in custom roles via your own activation hook
register_activation_hook( __FILE__, function () {
    $instructor = get_role( 'instructor' );
    if ( $instructor && ! $instructor->has_cap( 'edit_courses' ) ) {
        $instructor->add_cap( 'edit_courses' );
        $instructor->add_cap( 'edit_lessons' );
    }
} );

// WRONG — hooking without arg count
add_action( 'lw_lms_after_grant', 'my_handler' );
function my_handler( $user_id, $course_id, $source, $source_id, $expires_at ) { /* ... */ }
// $course_id..$expires_at are silently null because default $accepted_args = 1.

// RIGHT — explicit count
add_action( 'lw_lms_after_grant', 'my_handler', 10, 5 );

// WRONG — assuming the lock-on-complete snapshot resets when lessons are added
add_action( 'save_post_lesson', function ( $post_id ) {
    foreach ( get_users() as $u ) {
        recalculate_for_user( $u->ID );   // BAD - fights the snapshot design
    }
} );

// RIGHT — let it be. Users at 100% stay at 100%. New lesson is "extra material" for them.

// WRONG — hooking before plugins_loaded (in main plugin file)
add_filter( 'lw_lms_has_course_access', 'my_callback' );
// If your plugin loads BEFORE lw-lms, the filter is registered fine — but if you
// reference \LightweightPlugins\LMS\... inside, the autoloader hasn't run yet.

// RIGHT — defer to plugins_loaded with priority 11+
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( '\LightweightPlugins\LMS\Plugin' ) ) return;
    add_filter( 'lw_lms_has_course_access', 'my_callback', 10, 3 );
}, 11 );
```

## Cross-references

- Run **`lw-lms-frontend-build`** for the REST API consumer side — courses, lessons, progress endpoints used to build a frontend on top of this plugin.
- Run **`lw-site-manager-extend-abilities`** when registering `lw-lms/*` abilities into the LW Site Manager hub — the plugin itself uses this contract at `includes/SiteManager/Integration.php`.
- Run **`wp-plugin-options-storage`** for "post meta vs custom table vs option" decisions if you're storing companion-plugin data alongside lw-lms.
- Run **`wcs-subscription-hooks`** when integrating with `paid` access type via WC Subscriptions — the plugin checks `WooCommerceChecker::has_active_subscription()` and `SubscriptionVariationChecker::has_active()` at access-time, neither of which fires `lw_lms_after_grant`. To react to subscription lifecycle (activation, cancellation, renewal), hook WC Subscriptions directly.

## What this skill does NOT cover

- **Frontend rendering.** lw-lms ships no public templates; the consumer side is `lw-lms-frontend-build`.
- **Per-CPT meta detailed editing UI.** Internal admin metaboxes (`CourseContentMetabox`, `LessonVideoMetabox`) are private; companion code should write meta via `update_post_meta` if needed but should NOT subclass / instantiate the metaboxes.
- **WP-CLI migration commands.** `wp lw-lms migrate-learndash` is one-time tooling; not part of the extension contract.
- **`Options::META_PREFIX` value mutation.** The prefix is a public class constant but treat it as read-only — mutating across plugins breaks every meta lookup.
- **Direct `WooCommerceChecker` / `SubscriptionVariationChecker` consumption.** They're private details of the access cascade; use `AccessChecker::has_course_access()` instead.
- **Replacing `ProgressCalculator` or `CompletionTracker`.** No supported override; the snapshot logic is internal.
- **Subscription lifecycle as a first-class event in lw-lms.** Subscription access is checked at runtime, never recorded as a row, and `lw_lms_after_grant` does not fire for it. To react to subscription start / renewal / cancellation, hook WC Subscriptions directly. A future `SubscriptionAccessSync` would close this gap.
- **Un-enrollment via expiry cron.** `expires_at` is enforced at read time (`AccessQueries::has_active_access` excludes expired rows), not via a background job that fires `lw_lms_after_revoke`. Companion code that needs an expiry event should poll or use WP-Cron itself.

## References

- Plugin entry: [wp-content/plugins/lw-lms-main/lw-lms.php](lw-lms.php) — header, namespace, constants, `plugins_loaded` init.
- Main Plugin class: [includes/Plugin.php](Plugin.php) — `init_hooks`, `init_components`, REST + access + WC + Site Manager wiring.
- Activator: [includes/Activator.php](Activator.php) — DB version `1.2.0`, table creation, custom caps.
- **Filter `lw_lms_pre_grant` (6 args)**: [includes/Access/AccessRepository.php:53](AccessRepository.php).
- **Action `lw_lms_after_grant` (5 args)**: [includes/Access/AccessRepository.php:121](AccessRepository.php).
- **Action `lw_lms_after_revoke` (3 args)**: [includes/Access/AccessRepository.php:180](AccessRepository.php).
- **Action `lw_lms_lesson_completed` (2 args)**: [includes/Progress/ProgressRepository.php:84](ProgressRepository.php).
- **Action `lw_lms_course_completed` (2 args)**: [includes/Progress/CompletionTracker.php:57](CompletionTracker.php).
- **Action `lw_lms_attachment_downloaded` (2 args)**: [includes/Api/Controllers/DownloadController.php:90](DownloadController.php).
- **Filter `lw_lms_has_course_access`**: [includes/Access/AccessChecker.php:90](AccessChecker.php).
- **Filter `lw_lms_has_lesson_access`**: [includes/Access/AccessChecker.php:127](AccessChecker.php).
- Free-course implicit enrollment: [includes/Access/AccessChecker.php:51-60](AccessChecker.php) — lazy `AccessRepository::grant()` with `source='free'`.
- Access cascade order: [includes/Access/AccessChecker.php:33-91](AccessChecker.php) — open / free (with implicit grant) / paid (table → parent subscription → variation subscription → legacy) → filter.
- Force-complete helper: [includes/Progress/ProgressRepository.php:130-161](ProgressRepository.php) — `mark_course_completed()`.
- Read API: [includes/Access/AccessQueries.php](AccessQueries.php), [includes/Progress/ProgressQueries.php](ProgressQueries.php).
- Woo enrollment path: [includes/Access/AccessGranter.php](AccessGranter.php) — observes `woocommerce_order_status_completed`, calls `grant()` (which now fires `lw_lms_after_grant`).
- Manual enrollment path: [includes/Admin/UserProfile/EnrollmentHandler.php](EnrollmentHandler.php) — runs on `edit_user_profile_update` via `UserProfile::save()`, calls `grant()`.
- Subscription access (no enrollment row): [includes/Access/WooCommerceChecker.php](WooCommerceChecker.php), [includes/Access/SubscriptionVariationChecker.php](SubscriptionVariationChecker.php).
- Site Manager / Abilities API integration: [includes/SiteManager/Integration.php](Integration.php), [includes/SiteManager/Abilities/](Abilities/).
- Course meta: [includes/Meta/CourseMeta.php](CourseMeta.php), [includes/Meta/SubscriptionVariationMeta.php](SubscriptionVariationMeta.php).
- Lesson meta: [includes/Meta/LessonMeta.php](LessonMeta.php).
- CHANGELOG: [CHANGELOG.md](CHANGELOG.md) — v1.3.0 enrollment event + read/write split, v1.2.16 standalone Abilities API + output schemas, v1.2.15 variation-level subscriptions, v1.2.14 lock-on-complete snapshot, v1.2.0 manual enrollment, v1.1.0 time-limited access.
