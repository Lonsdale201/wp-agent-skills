---
name: lw-cookie-consent-integration
description: >-
  Integrate, operate, or audit LW Cookie 1.8.x consent state, script and embed
  blocking, Google Consent Mode, scanner, WP-CLI, WordPress hooks, JavaScript
  API, and LW Site Manager abilities. Use when code reads
  lw_cookie_is_category_allowed, calls LWCookie, renders consent-aware embeds,
  manages lw_cookie_options, automates lw-cookie/* abilities, or diagnoses
  tracker, Service Worker, multilingual, builder-preview, and
  youtube-nocookie.com behavior. This is an implementation reference, not a
  legal compliance certification.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "lw-cookie"
  wp-skills-plugin-version-tested: "1.8.2"
  wp-skills-wp-version-tested: "7.1.2"
  wp-skills-php-min: "8.2"
  wp-skills-last-updated: "2026-09-26"
---

# LW Cookie 1.8: consent integration and operations

Use LW Cookie's public hooks, browser API, REST routes, CLI, and abilities. Do not patch the plugin or infer legal compliance from a technical setting. Consent requirements depend on the site's processing, jurisdiction, vendor behavior, and legal basis.

## Binding requirements and storage

Read the plugin header rather than old README badges:

| Contract | Version 1.8.2 |
|---|---|
| WordPress | 6.6 or newer |
| PHP | 8.2 or newer |
| Main option | `lw_cookie_options` |
| Categories | `necessary`, `functional`, `analytics`, `marketing` |
| Site Manager namespace | `lw-cookie/*` |
| Public shortcode | `[lw_cookie_declaration]` |

`necessary` is always required. The three optional categories default to denied until consent is saved.

Do not write `lw_cookie_options` directly. The admin REST settings controller sanitizes field types, enums, colors, IDs, and declared-cookie rows. Direct `Options::save()` callers and the current Site Manager ability do not receive that complete controller validation.

## Read consent through the public filters

```php
$categories = apply_filters( 'lw_cookie_consent_categories', [] );
$has_choice = apply_filters( 'lw_cookie_has_consent', false );
$analytics  = apply_filters( 'lw_cookie_is_category_allowed', false, 'analytics' );
$consent_id = apply_filters( 'lw_cookie_consent_id', null );
```

Pass both documented arguments to `lw_cookie_is_category_allowed`. Treat an unknown category as denied.

These filters read the visitor's consent cookie. Do not let a full-page cache share consent-dependent HTML between visitors. A cache-safe integration renders the blocked form for everyone and lets the browser restore content after consent.

## Browser API and event

Use the global API after the plugin's frontend assets load:

```js
window.LWCookie.openPreferences();
window.LWCookie.acceptCategory( 'marketing' );

const state = window.LWCookie.getConsent();
const analyticsAllowed = window.LWCookie.isAllowed( 'analytics' );

window.addEventListener( 'lwCookieConsent', ( event ) => {
	const categories = event.detail.categories;
	const action = event.detail.action;
} );
```

Consent changes also push `lw_cookie_consent_update` to `dataLayer`, with `lw_cookie_consent` and `lw_cookie_action` fields.

Do not create a second consent cookie or mirror state in local storage. Use the plugin's state so policy-version expiry, revocation, and multi-tab synchronization stay consistent.

## Understand the two blocking switches

`script_blocking` and `content_blocking` are independent:

- `script_blocking`: blocks known tracker scripts and pixels until their category is granted. When disabled, tracker loading is left to the site's consent-mode strategy, while known tracking cookies still remain guarded.
- `content_blocking`: replaces known third-party embeds with placeholders until consent. When disabled, embeds load normally even if script blocking remains enabled.

The Service Worker is part of script/network blocking. Since 1.7.0 it serves a correct 200 fallback and uses the real webroot on subdirectory-core installations. Since 1.7.6 it refreshes after plugin updates and synchronizes consent across reloads and tabs. When diagnosing stale blocking, verify the registered worker, the current worker file, consent cookie visibility, and another tab's state before changing host lists.

## Current YouTube privacy-enhanced behavior

Version 1.8.2 maps both of these patterns to `marketing`:

- `youtube.com/embed`
- `youtube-nocookie.com/embed`

Therefore privacy-enhanced YouTube embeds are blocked while content blocking is enabled and marketing consent is absent. Public issue #10 asks to exempt `youtube-nocookie.com`; it is still open in the verified version.

Do not describe `youtube-nocookie.com` as automatically consent-free. Privacy-enhanced mode changes YouTube personalization behavior, but the iframe still contacts a third party and data-processing requirements remain site- and jurisdiction-specific. Keep the current blocking behavior until the plugin changes or the site owner makes an explicit, reviewed policy decision.

If testing a proposed exemption, verify at least:

1. network requests before playback and after playback;
2. cookies or storage written before interaction and after interaction;
3. IP/user-agent and other data sent to Google endpoints;
4. behavior for signed-in and signed-out visitors;
5. the site's consent notice and legal basis.

## Render a cache-safe custom embed

If a theme or plugin wants LW Cookie's placeholder behavior, render the iframe without `src`:

```html
<div class="lw-cookie-embed-block my-player__consent"><p class="lw-cookie-embed-block__msg">To watch this video, allow marketing content.</p><button type="button" class="lw-cookie-embed-block__btn">Accept and play</button></div><iframe data-lw-blocked="1" data-lw-category="marketing" data-lw-original-src="https://player.vimeo.com/video/123" style="display:none"></iframe>
```

Keep the placeholder as the iframe's immediately preceding sibling node; whitespace between them changes that relationship. Wire a custom button to `LWCookie.acceptCategory(category)` or open the preferences dialog.

For a visitor who has already consented, the server may render the plain iframe only when the response is not shared by a full-page cache. Rendering the blocked form is the safe cached default.

## Google Consent Mode

When `gcm_enabled` is on, LW Cookie emits Consent Mode v2 defaults before Google tags and sends updates through `dataLayer`, including GTM-only sites without a global `gtag` function.

Do not add another consent-default snippet after the plugin's guard. Competing defaults can race and reverse the state. Check the page source and tag sequence when signals look wrong.

When `script_blocking` is on, a granted category can require a reload so a previously suppressed script runs in document order. Embedded iframes can load in place. Account for that distinction in UI tests.

## LW Site Manager abilities

LW Cookie registers four abilities when LW Site Manager fires its extension hooks:

| Ability | Behavior |
|---|---|
| `lw-cookie/get-options` | Returns the merged option set. |
| `lw-cookie/set-options` | Updates only a fixed allowlist of keys. |
| `lw-cookie/get-consent-stats` | Aggregates action counts over a requested number of days. |
| `lw-cookie/scan-cookies` | Runs the HTTP header pre-scan and returns detected cookies/domains. |

All four use Site Manager's `can_manage_options` callback.

The current `set-options` allowlist covers the original banner/category text/colors, consent duration, both blocking switches, GCM, and floating-button fields. It does not cover every 1.8.2 option. Notably, newer layout/text fields, `hide_for_logged_in`, and `declared_cookies` are not writable through this ability.

`set-options` writes allowed values through `Options::save()` without the admin controller's complete field sanitization. Before calling it:

1. call `get-options`;
2. change only documented allowlisted keys;
3. validate booleans, integers, enum values, page IDs, and colors in the client;
4. read the options back and verify the result.

`scan-cookies` performs outbound work and refreshes scan data even though its metadata says idempotent. Do not retry it blindly on a timeout; inspect the current scan result first.

### REST versus MCP visibility

The four abilities set `show_in_rest`, so call them through the Abilities REST route:

```text
/wp-json/wp-abilities/v1/abilities/lw-cookie/get-options/run
```

In version 1.8.2 their metadata does not set `mcp.public`. LW Site Manager 1.5.0 automatically exposes only `site-manager/*`, so these `lw-cookie/*` abilities do not appear in its MCP discovery by default. Treat absence from MCP as the current contract, not as a missing registration.

To make them MCP-visible in a future plugin release, LW Cookie must add explicit metadata:

```php
'mcp' => [
	'public' => true,
	'type'   => 'tool',
],
```

Do not rename them into `site-manager/*` as a workaround.

## WP-CLI operations

The `wp lw-cookie` command group provides:

- `settings list|get|set|reset`
- `keys`
- `stats`
- `export`
- `clear-logs`
- `consent --consent-id=...|--ip=... [--delete]`

Use `settings set` only with keys reported by `keys` or the current defaults. `clear-logs`, `settings reset`, and `consent --delete` mutate or delete data; resolve the exact target and obtain user authorization before running them.

Consent exports contain identifiers and behavioral records. Keep them out of repositories, logs, screenshots, prompts, and public issue reports.

## Multilingual and builder behavior

With WPML, Polylang, or TranslatePress active, the 1.8 admin locks category and text source fields until the user chooses to unlock them. Saving locked fields leaves them untouched. Do not automate around the lock by overwriting the option directly.

The frontend banner is suppressed in supported builder canvases, including Bricks and Elementor. Use authorised preview mode (`?lw-cookie-preview=1`) or the live admin preview instead of assuming a builder canvas represents public behavior.

## Verification checklist

For an integration or regression report:

1. Record the plugin version, WordPress version, blocking switches, policy version, and active cache layer.
2. Test a new visitor, accepted visitor, rejected visitor, and revoked visitor.
3. Inspect network, cookies/storage, placeholders, console, Service Worker, and consent events.
4. Test with a warm full-page cache and in another tab.
5. For Google tags, verify default and update ordering in `dataLayer`.
6. For Site Manager, distinguish registry presence, REST visibility, and MCP visibility.
7. Reproduce public issue behavior against the released version before treating an issue report as the current implementation contract.

## Cross-references

- Use `lw-site-manager-overview` for Site Manager REST/MCP authentication and discovery.
- Use `lw-site-manager-extend-abilities` when changing how a companion namespace opts into MCP.
- Use `wp-security-audit` for public REST, cookie, scanner, remote-request, and data-export review.
- Use the relevant multilingual compatibility skill when changing translated source fields or page IDs.

## References

- Plugin repository: <https://github.com/lwplugins/lw-cookie>
- Open issue #10: <https://github.com/lwplugins/lw-cookie/issues/10>
- Settings reference: <https://github.com/lwplugins/lw-cookie/blob/main/docs/settings.md>
- Verified source paths:
  - `lw-cookie.php`
  - `includes/Options.php`
  - `includes/Hooks.php`
  - `includes/Blocking/KnownScripts.php`
  - `includes/Blocking/ServiceWorkerManager.php`
  - `includes/Integrations/GoogleConsentMode.php`
  - `includes/SiteManager/Integration.php`
  - `includes/SiteManager/CookieAbilities.php`
  - `includes/SiteManager/CookieService.php`
  - `includes/CLI/Commands.php`
