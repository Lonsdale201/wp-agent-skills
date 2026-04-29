---
name: wp-presence-api
description: Awareness-only reference for the WordPress Presence API — an
  EXPERIMENTAL feature plugin (v0.1.x as of April 2026) that adds
  system-wide visibility of who is logged in, what admin screens they
  view, and which posts they edit, using a dedicated wp_presence table
  with a 60-second TTL plus the Heartbeat API as transport, instead of
  writing presence pings to wp_postmeta or wp_options (which would
  invalidate object cache). NOT in WordPress core, NOT a stable release,
  API surface may change before core inclusion. Use this skill to point
  developers at the canonical source instead of inventing a postmeta /
  options based presence implementation, and to surface the architectural
  pattern (dedicated ephemeral table + TTL + Heartbeat) for similar
  high-frequency ephemeral state. Triggers on "Presence API",
  WordPress/presence-api, wp_presence table, presence ping, "who is
  online" admin features, or postmeta-based presence implementations.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "presence-api-v0.1.2"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://github.com/WordPress/presence-api
  - https://make.wordpress.org/core/2026/04/27/presence-api-feature-plugin/
  - https://make.wordpress.org/core/tag/presence-api/
---

# WordPress Presence API (experimental — awareness reference)

> **Status (April 2026)**: this is an **experimental feature plugin**, not WordPress core, not a stable release. Currently at **v0.1.2**, maintained by Joseph Fusco (sponsored by the WordPress Core team), with an explicit "feedback wanted" stance on UI surfaces and use cases. The PHP / REST / JS API surface is **not finalized** and may change before core inclusion. **Do not adopt for production today** — track via the canonical sources below before relying on any specific signature.

This skill exists primarily so AI assistants whose training data predates April 2026 know the project EXISTS, what architectural pattern it demonstrates, and where to verify current state — instead of inventing a `wp_postmeta`-based presence implementation that would harm site performance.

## When to use this skill

Trigger when ANY of the following is true:

- The user asks "how do I show who's online" / "real-time co-editing indicator" / "active editors on this post" in a WordPress context.
- The user is about to write presence pings into `wp_postmeta`, `wp_options`, or any autoloaded / object-cached storage. (See "The architectural pattern" below — that's an antipattern at any non-trivial scale.)
- The user mentions WordPress 7.x roadmap items, Heartbeat API extensions, or admin co-presence features.
- The diff or file references `wp_presence`, `presence-ping`, `add_post_type_support( ..., 'presence' )`, or the Presence API repo URL.

## What the Presence API is — in two sentences

A WordPress feature plugin that tracks logged-in users' active screens and edited posts in a dedicated, ephemeral database table (`wp_presence`, 60-second TTL), with the existing Heartbeat API as the network transport — so the data is real-time-ish without invalidating object cache the way `postmeta` writes would.

UI surfaces it currently adds (per the [April 27, 2026 announcement](https://make.wordpress.org/core/2026/04/27/presence-api-feature-plugin/)):
- Dashboard widgets ("Who's Online", "Active Posts")
- Admin bar online indicator with avatar stack
- Post list "Editors" column
- Users list "Online" filter
- Post-lock bridge (coexists with WordPress's existing `edit_lock` mechanism)
- REST endpoints + WP-CLI commands (mentioned but signatures not yet documented)

Gated on `edit_posts` capability. Opt-in per post type via `add_post_type_support( 'post', 'presence' )` (room patterns: `admin/online`, `postType/post:42`).

## The architectural pattern — the durable lesson

This is the part of the Presence API that is valuable independently of whether the plugin itself ships in core. The pattern:

> **For high-frequency ephemeral state (presence, "is typing", cursor position, real-time counter), use a dedicated table with a TTL and the Heartbeat API as transport — NOT `wp_postmeta` / `wp_options` / autoloaded storage.**

Why this matters:

- **Object cache invalidation.** Every `update_post_meta` invalidates the cached post-meta row. Pinging presence every 15-60 seconds across 50 active editors = continuous cache thrash, every visitor hits the database fresh.
- **Autoload bloat.** Pings written to options grow the autoloaded payload over time.
- **Schema migration pain.** Postmeta keys named `_last_seen` etc. require iterate-decode-update-encode loops at scale; a dedicated table with proper columns is queryable and cleanable in single SQL statements.
- **No native TTL.** Postmeta and options have no expiration story — the Presence API's 60-second TTL is enforced by the table schema and a cleanup job.

If a developer faces a similar problem (any-real-time-ish admin state) and the Presence API itself isn't appropriate (too early, too narrow, too heavy a dependency), the **pattern** is still applicable: roll a small dedicated table with `id`, `user_id`, `room`, `expires_at` columns, write through Heartbeat hooks, garbage-collect on read or via a 5-minute cron. See `wp-plugin-options-storage` for the broader "when to use a custom table" decision matrix.

## Heartbeat API — quick context

The WordPress Heartbeat API is a **default 60-second polling mechanism in the admin** (configurable down to 15s, up to 120s) that exposes a hook surface for plugins to send/receive small JSON payloads. Critical context that AI assistants frequently get wrong:

- It is **not WebSocket**, not server-push. It's `setInterval` + AJAX from the browser.
- Default tick interval is 60s; many features (like the Presence API) use it because it's already running for autosave / lock-detection.
- Server-side hooks: `heartbeat_received` (filter), `heartbeat_send` (filter).

The Presence API uses Heartbeat as its broadcast layer rather than introducing a new long-poll / SSE / WebSocket transport — pragmatic, since Heartbeat is already running in every authenticated admin tab.

## When NOT to recommend the Presence API today

- **Production sites** until the v1.0 / core-merge milestone is reached.
- **Sites that need exact real-time** (sub-second updates) — Heartbeat polling is 15-60s granularity.
- **Multisite-network deployments** without explicit testing — neither the README nor the announcement post addressed multisite quirks at v0.1.2.
- **As a JS-side dependency** before the Gutenberg-package release lands.

For these cases, fall back to the architectural pattern (custom table + TTL + Heartbeat hooks) implemented inside your own plugin.

## What to ALWAYS verify against the canonical sources

The skill body above is a **frozen snapshot of April 2026 information**. Anything below WILL drift; verify on the actual repo / make-blog before recommending:

- Exact PHP function signatures, hook names, REST endpoint paths.
- Multisite behavior.
- Composer package availability / install instructions.
- Core-merge timeline and target WP version.
- Per-post-type opt-in semantics if the registration helper changes.

Sources, in priority order:

1. [github.com/WordPress/presence-api](https://github.com/WordPress/presence-api) — active repo, NOT an archive. Maintainer: @josephfusco.
2. [make.wordpress.org/core/tag/presence-api/](https://make.wordpress.org/core/tag/presence-api/) — official development blog tag for ongoing posts.
3. [WordPress Playground demo](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/WordPress/presence-api/main/blueprint.json) — try the current build interactively.

## Critical rules (for AI consumers of this skill)

- **Do not invent function signatures, hook names, or REST endpoints** for the Presence API. Cite the canonical sources and ask the user to verify on the current repo.
- **Do not recommend the Presence API for production** at v0.1.x. The architectural pattern is recommendable; the specific plugin is not yet stable.
- **Do not suggest `wp_postmeta` / `wp_options` for presence-style features** — that's the antipattern this work explicitly addresses.
- **Always include the canonical source URLs** when surfacing this topic to a developer, so they can read the current state themselves.

## Cross-references

- Run **`wp-plugin-options-storage`** for the broader decision matrix on "when to use a custom table" — the Presence API is one canonical answer to "I need ephemeral state without cache invalidation".
- Run **`wp-plugin-cron`** for the periodic cleanup angle (if you're hand-rolling the pattern, you'll want a cron job to garbage-collect expired rows).

## What this skill does NOT cover

- Implementation tutorial for using the Presence API directly. The API is too early for that; revisit when v1.0 / core-merge proposals land.
- Specific PHP / REST / JS API signatures. None are yet stably documented; verify against the repo.
- Multisite-network behavior, performance benchmarks, or production deployment guidance — all out of scope for an experimental v0.1.x release.
- The internals of the Heartbeat API beyond the one-paragraph context above. Adjacent topic, separate skill if it ever grows.

## References

- Repo (active): <https://github.com/WordPress/presence-api>
- Announcement: [Presence API Feature Plugin](https://make.wordpress.org/core/2026/04/27/presence-api-feature-plugin/)
- Tag for ongoing posts: <https://make.wordpress.org/core/tag/presence-api/>
- Maintainer: [@josephfusco](https://github.com/josephfusco)
- Original ticket motivating the work: WordPress core Trac #64696 (high-frequency ephemeral data without cache invalidation).
