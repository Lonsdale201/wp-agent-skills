---
name: lw-lms-abilities
description: Consumer and reviewer reference for LW LMS Abilities API registrations in lw-lms v1.5.1. Use when calling or auditing `lw-lms/list-courses`, `lw-lms/get-course`, `lw-lms/get-progress`, `lw-lms/set-progress`, `lw-lms/get-options`, `/wp-json/wp-abilities/v1/abilities/lw-lms/.../run`, Site Manager bridge integration, standalone WP 6.9+ Abilities API fallback, ability `input_schema` / `output_schema`, or AI-agent access to LMS course/progress data.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: lw-lms
plugin-version-tested: "1.5.1"
php-min: "8.1"
last-updated: "2026-06-15"
docs:
  - https://github.com/lwplugins/lw-lms
  - https://developer.wordpress.org/apis/abilities-api/
source-refs:
  - wp-content/plugins/lw-lms/includes/SiteManager/Integration.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Abilities/CourseAbilities.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Abilities/ProgressAbilities.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Abilities/OptionsAbilities.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Abilities/AbilityPermissions.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Abilities/AbilityMeta.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Schema/OutputSchemas.php
  - wp-content/plugins/lw-lms/includes/SiteManager/Service/
  - wp-content/plugins/lw-lms/docs/site-manager-abilities.md
---

# LW LMS Abilities API

Use this when an AI agent, MCP client, REST consumer, or reviewer works with the machine-callable `lw-lms/*` abilities. This is not the learner-facing `/wp-json/lms/v1` REST API and not the companion-plugin extension hook map; it is the admin/agent-facing ability surface.

## When to use this skill

Trigger this skill when ANY of the following is true:

- The request mentions `lw-lms/list-courses`, `lw-lms/get-course`, `lw-lms/get-progress`, `lw-lms/set-progress`, or `lw-lms/get-options`.
- Code calls `/wp-json/wp-abilities/v1/abilities/lw-lms/.../run`.
- A user asks how Claude, ChatGPT, MCP, or another AI agent can inspect or mutate LMS course/progress data.
- A diff touches `includes/SiteManager/Integration.php`, `includes/SiteManager/Abilities/`, `OutputSchemas`, or the ability service classes.
- You need to decide whether to call Abilities API vs `/wp-json/lms/v1`.

## Verified registration model

LW LMS v1.5.1 registers abilities in two modes. The v1.4.0 WP-CLI/settings work and the v1.5.0 WooCommerce Memberships access work did not add new `lw-lms/*` abilities.

1. Site Manager bridge: hooks `lw_site_manager_register_categories` and `lw_site_manager_register_abilities`, receives the Site Manager `PermissionManager`, and registers into category `lms`.
2. Standalone fallback: hooks `wp_abilities_api_categories_init` and `wp_abilities_api_init` at priority 20. `did_action()` guards prevent duplicate registration when Site Manager is active.

Do not claim Site Manager is required for LMS abilities. Since v1.2.16, WordPress 6.9+ Abilities API or the feature plugin is enough.

## Ability catalog

| Ability | Type | Permission key | Input | Output |
|---|---|---|---|---|
| `lw-lms/list-courses` | readonly | `can_edit_posts` | `per_page`, `page` | `success`, `courses`, `total`, `total_pages`, `page`, `per_page` |
| `lw-lms/get-course` | readonly | `can_edit_posts` | required `course_id` | `success`, `course` with sections and lessons |
| `lw-lms/get-progress` | readonly | `can_edit_posts` | required `user_id`, `course_id` | summary plus lesson status map |
| `lw-lms/set-progress` | write | `can_edit_posts` | required `user_id`, `course_id`, `lesson_id`, `status` | `success`, `message` |
| `lw-lms/get-options` | readonly | `can_manage_options` | empty object | `success`, `options` |

`set-progress` accepts only `completed`, `in_progress`, or `not_started`. Reverting from `completed` is a write that loses the completion timestamp for that row; do not treat it as harmless even though `AbilityMeta::write()` marks writes idempotent.

## Calling pattern

Abilities use the core Abilities API route, not the LMS REST namespace:

```bash
curl -X POST "https://site.example/wp-json/wp-abilities/v1/abilities/lw-lms/get-progress/run" \
  -u 'admin:xxxx xxxx xxxx xxxx' \
  -H 'Content-Type: application/json' \
  -d '{"input":{"user_id":7,"course_id":42}}'
```

The request body must wrap arguments in `input`. Direct PHP is also valid:

```php
$ability = wp_get_ability( 'lw-lms/set-progress' );
$result  = $ability->execute(
    [
        'user_id'   => 7,
        'course_id' => 42,
        'lesson_id' => 55,
        'status'    => 'completed',
    ]
);
```

## Critical rules

- Use Abilities API for admin/agent operations; use `/wp-json/lms/v1` for learner-facing frontend data.
- Feature-detect with `function_exists( 'wp_register_ability' )` or `wp_get_ability( 'lw-lms/list-courses' )`; the plugin silently skips abilities when the API is unavailable.
- Permission keys map through Site Manager when present. Standalone fallback maps `can_edit_posts` to `edit_posts`, `can_manage_options` to `manage_options`, and `can_edit_users` to `edit_users`.
- `lw-lms/get-course` returns admin/agent data, not access-gated learner content. Do not expose it directly to public learners.
- `lw-lms/set-progress` calls `ProgressRepository::upsert()`, so completion hooks and snapshots still run. Do not replace it with raw SQL.
- Trust `OutputSchemas` over the older prose docs when shape details differ; v1.2.16 added `total_pages`, `page`, and `per_page` to `list-courses`.

## Common mistakes

```bash
# WRONG: LMS learner REST namespace, not an ability run route.
curl -X POST https://site.example/wp-json/lms/v1/get-progress

# RIGHT:
curl -X POST https://site.example/wp-json/wp-abilities/v1/abilities/lw-lms/get-progress/run \
  -d '{"input":{"user_id":7,"course_id":42}}'
```

```php
// WRONG: assume Site Manager must be active.
if ( ! class_exists( '\LightweightPlugins\SiteManager\Plugin' ) ) {
    return;
}

// RIGHT: check the ability/API you actually need.
if ( function_exists( 'wp_get_ability' ) && wp_get_ability( 'lw-lms/list-courses' ) ) {
    // Call it.
}
```

## Cross-references

- Run `lw-lms-backend-extend` when adding companion hooks around enrollment, access, or progress.
- Run `lw-site-manager-overview` when consuming the broader `site-manager/*` ability surface.
- Run `wp-abilities-api` for the underlying WordPress Abilities API mechanics.

## What this skill does NOT cover

- Public learner UI and course rendering. Use `lw-lms-rest-frontend` for the core REST API contract.
- Registering arbitrary third-party Site Manager abilities. Use `lw-site-manager-extend-abilities`.
- LearnDash migration. Use `lw-lms-learndash-migration`.

## References

- Registration bridge and fallback: `includes/SiteManager/Integration.php`.
- Ability definitions: `includes/SiteManager/Abilities/CourseAbilities.php`, `ProgressAbilities.php`, `OptionsAbilities.php`.
- Permission fallback: `includes/SiteManager/Abilities/AbilityPermissions.php`.
- Output schemas: `includes/SiteManager/Schema/OutputSchemas.php`.
- Service behavior and `WP_Error` codes: `includes/SiteManager/Service/`.
