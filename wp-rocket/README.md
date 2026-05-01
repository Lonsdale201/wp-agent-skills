# wp-rocket

Integration skills for [WP Rocket](https://wp-rocket.me) (paid third-party caching plugin, not on Packagist). Use when your plugin / theme needs to play nicely with WP Rocket on installs that have it.

## Skills

| Skill | Purpose |
|---|---|
| `wp-rocket-cache-invalidation` | Programmatically clear WP Rocket cache from a third-party plugin / theme — the `rocket_clean_*` function family (`rocket_clean_post`, `rocket_clean_files`, `rocket_clean_term`, `rocket_clean_user`, `rocket_clean_home`, `rocket_clean_minify`, `rocket_clean_cache_busting`, `rocket_clean_domain`, `rocket_clean_cache_dir`). Detection rule — feature-detect via `function_exists('rocket_clean_post')` OR `defined('WP_ROCKET_VERSION')` since not every site has it. Don't raw-unlink the cache dir; `wp_cache_flush()` is the WP object cache (unrelated). |
| `wp-rocket-cache-rejection-and-filters` | Customize WP Rocket behavior via filter hooks — exclude URIs / cookies / user agents / REST API namespaces from caching, configure CDN URL rewrites, extend lazy load, override capability requirements, hook into Action Scheduler integration. `rocket_cache_reject_uri` takes URI patterns (regex-like), NOT full URLs. The `rocket_buffer` filter is the FULL HTML output filter — extremely powerful but dangerous (one fatal in the callback breaks every cached page until WP Rocket is disabled). |
