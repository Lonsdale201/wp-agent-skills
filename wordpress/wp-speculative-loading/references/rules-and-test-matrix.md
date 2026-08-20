# Speculation Rules reference

## Core main rule

Core builds one document rule for same-site links and excludes:

- `/wp-*.php` and `/wp-admin/*`;
- uploads, content, plugin, template, and stylesheet roots;
- all query strings when pretty permalinks are active;
- nonce-like query parameters on plain-permalink sites;
- `a[rel~="nofollow"]`;
- `.no-prefetch` / `.no-prerender` elements and descendant links.

Additional paths from `wp_speculation_rules_href_exclude_paths` are merged with the non-removable base set, deduplicated, and prefixed for subdirectory installs.

## Valid values

| Field | Values |
|---|---|
| mode | `prefetch`, `prerender` |
| eagerness | `conservative`, `moderate`, `eager`, plus `immediate` for list rules only |
| source | `document`, `list` |

A rule must contain exactly one of:

- `where` for a document rule; or
- `urls` for a list rule.

## Test matrix

| Context | Expected default |
|---|---|
| Logged out + pretty permalinks | enabled, `prefetch` + `conservative` unless overridden |
| Logged in | disabled |
| Plain permalinks | disabled |
| Filter returns `null` | disabled |
| Filter returns invalid, non-null data | enabled with sanitized defaults, even if the original context was disabled |
| 7.1 valid host override + filter uses `auto` | host default |
| Explicit valid filter values | explicit filter values |

Also test subdirectory WordPress, multisite path prefixes, page-cache hits, session cookies, and a browser without Speculation Rules support.
