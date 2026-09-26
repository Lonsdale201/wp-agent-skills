# LW LMS 2.0.0 backend data contract

Load this reference when exact storage names or defaults are needed.

## Identity and requirements

| Field | Value |
|---|---|
| Plugin slug | `lw-lms` |
| Version | `2.0.0` |
| Minimum WordPress | `6.6` |
| Minimum PHP | `8.0` |
| Namespace | `LightweightPlugins\LMS` |
| Option row | `lw_lms_options` |
| Meta prefix | `_lw_lms_` |
| DB version | `1.3.0` |
| Custom capability | `manage_lms` |

Activation grants `manage_lms` to administrators. The admin settings route still requires `manage_options`.

## Tables

| Table | Purpose |
|---|---|
| `wp_lms_access` | Stored enrollments, grant source, UTC expiry, status |
| `wp_lms_progress` | Per-user lesson status and site-local completion time |
| `wp_lms_completion_snapshots` | Course completion snapshot |
| `wp_lms_quiz_attempts` | Attempt score, pass state, answer/review snapshot |

Use `$wpdb->prefix`; never assume `wp_`.

## Options and defaults

| Key | Default |
|---|---|
| `courses_per_page` | `10` |
| `enable_preview_lessons` | `true` |
| `default_access_type` | `free` |
| `auto_enroll_admins` | `false` |
| `quiz_pass_percentage` | `80` |
| `require_quiz_pass` | `false` |
| `woo_enabled` | `true` |
| `delete_data_on_uninstall` | `false` |

Removed options such as `show_progress_bar` are ignored by `Options::get_all()`.

## Course meta

- `_lw_lms_access_type`: `open`, `free`, or `paid`.
- `_lw_lms_product_ids`, `_lw_lms_product_durations`.
- `_lw_lms_subscription_ids`, `_lw_lms_subscription_variation_ids`.
- `_lw_lms_membership_plan_ids`.
- `_lw_lms_preview_lesson_ids`.
- `_lw_lms_course_sections`: ordered section objects; section rows may include a `drip` rule.
- `_lw_lms_progression`: `free` or `linear`.
- `_lw_lms_drip_delay`: course enrollment-delay rule.
- `_lw_lms_attachments`, `_lw_lms_duration`, `_lw_lms_instructor`.

## Lesson meta

- `_lw_lms_lesson_course_id`, `_lw_lms_lesson_section_id`, `_lw_lms_lesson_order`.
- `_lw_lms_video`, `_lw_lms_attachments`, `_lw_lms_duration`.
- `_lw_lms_quiz`: canonical quiz document.
- `_lw_lms_drip`: lesson drip rule.

## User meta

- `_lw_lms_course_start_{course_id}`: drip clock start timestamp. First stored value wins unless an administrator explicitly changes or clears it.
- `_lw_lms_quiz_{lesson_id}`: latest-attempt summary retained for compatibility; full history is in the attempts table.

## Uninstall and privacy

Uninstall preserves data by default. With `delete_data_on_uninstall` enabled, the uninstaller removes plugin tables, options, post/user meta, and registered content across the multisite-safe path.

The WordPress personal-data exporter includes LMS enrollment, progress, completion, and quiz data. Erasure removes historical learner data; active enrollments are kept unless `lw_lms_privacy_erase_active_enrollments` allows their removal.
