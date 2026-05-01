# lw-plugins

Skills covering the **LW Plugins family** (LW LMS, LW Site Manager). Use these when extending or building on top of these plugins.

## Skills

| Skill | Purpose |
|---|---|
| `lw-lms-backend-extend` | Backend extension contract for `lwplugins/lw-lms` (BETA — README explicitly says "not recommended for production use"). Headless LMS — courses / lessons / sections / progress / access control. Three verified custom actions (`lw_lms_attachment_downloaded`, `lw_lms_lesson_completed`, `lw_lms_course_completed`) and two access-override filters (`lw_lms_has_course_access`, `lw_lms_has_lesson_access`). 11 custom capabilities, three DB tables, optional Site Manager integration. |
| `lw-lms-frontend-build` | Build a frontend on top of `lwplugins/lw-lms` (also BETA). The plugin is intentionally HEADLESS — no shipped templates, shortcodes, or blocks; only a REST API at `/wp-json/lms/v1`. Six endpoints (public list/single, auth+access lessons / progress GET+POST / per-course progress / download). Single-course response includes content ONLY when `access.has_access === true`. |
| `lw-site-manager-overview` | Reference for `lwplugins/lw-site-manager` — a WP 6.9+ Abilities-API-native exposure layer that registers 120+ machine-callable abilities under `site-manager/*` for AI agents (Claude, ChatGPT, MCP clients) to discover and invoke. Calling pattern via `/wp-json/wp-abilities/v1/abilities/{namespace}/{ability}/run` with Application Password Basic auth. **Not** MainWP — different surface and security model (per-ability cap-checks). |
| `lw-site-manager-extend-abilities` | Add custom abilities to LW Site Manager via two action hooks (`lw_site_manager_register_categories`, `lw_site_manager_register_abilities` — second receives the central `PermissionManager` instance). Critical pattern — extend `AbstractAbilitiesRegistrar` to inherit the meta builders (`readOnlyMeta` / `writeMeta` / `destructiveMeta`) and schema builders (`paginationSchema` / `orderingSchema` / `idSchema` / `listOutputSchema` / etc.). |
