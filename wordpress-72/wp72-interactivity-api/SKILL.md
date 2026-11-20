---
name: wp72-interactivity-api
description: >-
  Migrates WordPress 7.2 interactive blocks using data-wp-html, asDangerousHTML, wp_interactivity_as_dangerous_html and core/router state. Use for removed data-wp-ignore, two-hyphen directive IDs, negated function references, server HTML hydration or navigation loading indicators.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 Interactivity API

Audit server rendering and client hydration together. A successful PHP render
does not prove that a browser directive runs.

## HTML rendering

`data-wp-html` accepts explicitly branded HTML:
`asDangerousHTML()` in JavaScript and
`wp_interactivity_as_dangerous_html()` in PHP. Neither sanitizes.

- Sanitize untrusted HTML at its trust boundary, then brand the accepted value.
  Use context to select trusted state, not to carry arbitrary HTML for branding.
- A plain string does not render. Null/undefined empty the element.
- HTML inside this element is inert to Interactivity directives, but remains
  live browser HTML. Event attributes and unsafe markup remain dangerous.
- Do not combine it on the same element with `data-wp-text`, `data-wp-each` or
  `data-wp-router-region`; the HTML directive is ignored in that conflict.
- Server-branded HTML is rendered into the document and represented by
  `{ "wpServerHtml": true }` in client state, preserving the existing DOM until
  the value changes. A pending PHP-derived getter has a preservation path too.
- Branding depends on identity. JSON serialization, object spreading or copying
  into context does not preserve the trusted client object.
- Under Trusted Types, use a policy-owned `TrustedHTML` accepted by the wrapper.
  The package supplies no sanitization policy.

## Removed behavior

| Old | Migration |
|---|---|
| `data-wp-watch--setup` | `data-wp-watch---setup` |
| `data-wp-on--click--counter` | `data-wp-on--click---counter` |
| Negation of a function reference, e.g. `!actions.isEmpty` | Use a derived state getter, then `!state.isEmpty` |
| `data-wp-ignore` | Remove it and explicitly review hydration/DOM ownership |

Two hyphens still separate an event name (`data-wp-on--click`); three introduce a
unique ID. Fix the suffix, not every pair of hyphens. Deprecated
`data-wp-on-async` directives are not removed by this change.

## Router state

Use `core/router`'s `state.navigating` and `state.initiator`.
Both can initially be undefined. Test navigating by truthiness.
The initiator normally identifies the closest router region and can be supplied
to `actions.navigate( url, { initiator: 'plugin/region' } )`.

The initiator persists after navigation. Navigating becomes false on a later
frame than DOM insertion; the navigate promise can resolve earlier. Back/forward
cache navigation updates these fields; prefetch does not. The old
`state.navigation` remains deprecated in 7.2. Its 400ms loading-bar delay is not
the timing contract of the new state.

## Verify

Test SSR preservation, client replacement, rejected plain strings, inert nested
directives, valid versus expired suffixes, keyboard activation and two successive
navigations including back/forward. Record actual DOM/focus and console warnings,
and check production behavior where warnings are absent.

## References

- [7.2 Interactivity changes](https://make.wordpress.org/core/2026/11/17/changes-to-the-interactivity-api-in-wordpress-7-2/)
- Verified source: `wp-includes/interactivity-api/`,
  `wp-includes/js/dist/script-modules/interactivity/`,
  `wp-includes/js/dist/script-modules/interactivity-router/`.
- Related stable skill: `wp-interactivity-api`.

