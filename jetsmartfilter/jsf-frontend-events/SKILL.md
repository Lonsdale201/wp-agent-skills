---
name: jsf-frontend-events
description: >-
  Handle the JetSmartFilters frontend AJAX lifecycle and reinitialize behavior
  after provider DOM replacement. Use when JavaScript must react when filtering
  starts, rendered content updates, loading ends, or JSF initializes; when
  integrating sliders, galleries, analytics, accessibility, or other widgets;
  or when code references JetSmartFilters.events, ajaxFilters/start-loading,
  ajaxFilters/updated, ajaxFilters/end-loading, provider/content-rendered, or
  jet-filter-content-rendered.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-smart-filters"
  wp-skills-plugin-version-tested: "3.8.3.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-21"
---

# JetSmartFilters frontend events

Subscribe to the JSF event bus and scope every callback. For a listing, the
three essential lifecycle channels are:

| Channel | Callback arguments | Meaning |
|---|---|---|
| `ajaxFilters/start-loading` | `provider, queryId` | A real AJAX request started; preloader is active |
| `ajaxFilters/updated` | `provider, queryId, response, requestOptions` | Response was processed and provider DOM/fragments were updated |
| `ajaxFilters/end-loading` | `provider, queryId` | Loading teardown ran and the preloader was hidden |

Use `updated` to read or initialize the new DOM. Use `end-loading` for a
global “cycle finished” UI state. They are not aliases.

## Load a companion script after JSF

JSF enqueues its public script in `wp_footer` only on pages where filters were
rendered. Queue the bridge after JSF has enqueued itself and before footer
scripts print:

```php
add_action( 'wp_footer', static function (): void {
    if ( ! wp_script_is( 'jet-smart-filters', 'enqueued' ) ) {
        return;
    }

    wp_enqueue_script(
        'acme-jsf-bridge',
        plugins_url( 'assets/js/jsf-bridge.js', __FILE__ ),
        array( 'jet-smart-filters' ),
        '1.0.0',
        true
    );
}, 16 );
```

## Subscribe with provider/query scoping

```js
(() => {
  const targetProvider = 'jsf-listing';
  const targetQueryId = 'catalog-listing';

  const isTarget = (provider, queryId) =>
    provider === targetProvider && queryId === targetQueryId;

  const bind = () => {
    const bus = window.JetSmartFilters?.events;

    if (!bus?.subscribe) {
      return;
    }

    bus.subscribe('ajaxFilters/start-loading', (provider, queryId) => {
      if (!isTarget(provider, queryId)) return;
      document.querySelector('.catalog-shell')?.setAttribute('aria-busy', 'true');
    });

    bus.subscribe(
      'ajaxFilters/updated',
      (provider, queryId, response, requestOptions) => {
        if (!isTarget(provider, queryId)) return;
        initCatalogWidgets(document.querySelector('#catalog-listing'));
      }
    );

    bus.subscribe('ajaxFilters/end-loading', (provider, queryId) => {
      if (!isTarget(provider, queryId)) return;
      document.querySelector('.catalog-shell')?.setAttribute('aria-busy', 'false');
    });
  };

  if (window.JetSmartFilters?.events) {
    bind();
  } else {
    document.addEventListener('jet-smart-filters/before-init', bind, { once: true });
  }
})();
```

Make `initCatalogWidgets()` idempotent: destroy or detect an existing widget
before recreating it.

## Other useful events

- DOM `jet-smart-filters/before-init`: JSF global exists; filter discovery has
  not run.
- DOM `jet-smart-filters/inited`: initial filter groups are available.
- Bus `provider/content-rendered`: callback receives
  `provider, $provider` after provider HTML and builder integrations render.
  It has no query ID, so it is insufficient alone when several instances share
  a provider.
- Legacy jQuery `jet-filter-content-rendered`: document event with
  `event, $provider, filterGroup, provider, queryId`. Prefer the event bus in
  new code; keep this only for a legacy integration contract.
- A provider element may receive `jet-filter-data-updated` for providers that
  return data rather than HTML.

## Failure and concurrency rules

- A “start” event is not proof that content changed.
- In 3.8.3.1 a newer request aborts the previous XHR, and the abort path can
  skip `end-loading`. Do not maintain an unbounded global counter that assumes
  perfect start/end pairs.
- Key UI state by provider/query ID and make repeated cleanup harmless.
- `updated` fires on successful processing. Use application-level monitoring
  if failed AJAX requests must also be reported.
- Prefer delegated click/input handlers for elements inside the replaced
  wrapper.

## References

Verified against JetSmartFilters 3.8.3.1 source:

- `includes/filters/manager.php:22-112`
- `assets/js/public.js` channels `ajaxFilters/start-loading`,
  `ajaxFilters/updated`, `ajaxFilters/end-loading`,
  `provider/content-rendered`
- `assets/lib/jet-plugins/jet-plugins.js`
