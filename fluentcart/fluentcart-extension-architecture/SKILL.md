---
name: fluentcart-extension-architecture
description: >-
  Designs and audits third-party FluentCart extensions against the real 1.6.0
  bootstrap, hybrid WordPress-post/custom-table data model, monetary units,
  Free/Pro boundary, and public helper APIs. Use when starting a FluentCart
  addon, choosing between hooks, models, Resource APIs, REST, or direct
  WordPress APIs, checking fluentcart_loaded or fluent_cart/init timing,
  diagnosing missing classes, or reviewing code that reads or writes fct_*
  commerce records.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart extension architecture

Establish the correct integration boundary before writing business logic. Do not
transpose WooCommerce CRUD, cart, session, order, or subscription assumptions
onto FluentCart.

Read [data-and-lifecycle-map.md](references/data-and-lifecycle-map.md) when the
change touches more than one entity or persists commerce state.

## Bootstrap safely

- Declare FluentCart as an integration dependency in the addon's own admin UX.
- Register classes and hooks no earlier than plugins_loaded.
- Use fluentcart_loaded when FluentCart's application object is required.
- Use fluent_cart/init for components that need FluentCart's init-time routes,
  modules, CPT, taxonomies, or migrated schema.
- Attach listeners for fluent_cart/register_storage_drivers and
  fluent_cart/register_payment_methods by fluentcart_loaded at the latest.
  Those registration actions run on init before fluent_cart/init in 1.6.0, so
  adding their listeners inside fluent_cart/init misses the event.
- Feature-detect Pro with FLUENTCART_PRO_PLUGIN_VERSION or the exact Pro class.
  Do not infer Pro from a saved option.
- Recheck the minimum core/Pro version pair before using a newly added method.

~~~php
add_action('fluent_cart/init', static function ($app): void {
    if (!defined('FLUENTCART_VERSION')) {
        return;
    }

    // Register this addon's FluentCart hooks here.
});
~~~

The two lifecycle names are intentionally inconsistent:
fluentcart_loaded has no underscore after fluent; fluent_cart/init does.

## Select the right persistence layer

| Data | Canonical layer |
|---|---|
| Product title/content/status | WordPress post APIs or ProductResource |
| Product detail, variants, attributes, stock | FluentCart Resource/service APIs |
| Orders, items, transactions, subscriptions | FluentCart models/resources and lifecycle services |
| Categories and brands | WordPress taxonomy APIs using FluentCart taxonomy names |
| Plugin settings | StoreSettings, ModuleSettings, or fluent_cart_* option helpers |
| Addon-owned state | Addon-owned table/options with explicit foreign identifiers |

Use Resource APIs for coordinated writes. Models are suitable for scoped reads
and documented model operations, but a raw model save can bypass validation,
secondary rows, counters, stock movements, event dispatch, remote gateway work,
or cache invalidation.

Never write fct_* rows with ad hoc SQL in normal request code. Restrict direct
SQL to migrations, bounded reports, or repairs that explicitly reproduce all
required invariants.

## Preserve core invariants

- Treat monetary inputs and totals as integer minor units. In 1.6.0,
  Helper::toCent('12.34') yields 1234. Use FluentCart formatting helpers only
  at display boundaries.
- Keep store mode attached to every integration. Never mix test and live
  transactions, provider objects, cache keys, or reports.
- Treat an order's status, payment_status, and shipping_status as separate
  state dimensions.
- Treat Customer as a commerce identity distinct from WP_User.
- Treat cart_hash, order UUID, transaction UUID, and subscription UUID as
  lookup tokens, not authorization by themselves.
- Design callbacks and outbound effects for replay. Webhooks, checkout retries,
  Action Scheduler, and internal queues can execute more than once.
- Preserve filter inputs and return the documented type. Scope every dynamic
  hook to the intended product, order, gateway, or integration key.

## Extension workflow

1. Record the installed Free, Pro, and companion-plugin versions.
2. Identify the owning entity and the service that normally mutates it.
3. Trace the controller/service to the final event rather than choosing a hook
   by name alone.
4. Confirm callback arguments and timing from source at the installed version.
5. Add dependency guards and Free/Pro feature detection.
6. Enforce authorization, object ownership, validation, and monetary units at
   the addon's boundary.
7. Test live/test separation, anonymous/authenticated paths, retries,
   concurrent submission, and an interrupted background job.

## Documentation accuracy rule

Treat the installed source and registered runtime routes as authoritative.
FluentCart's current developer pages contain some stale v1 URLs, generic cart
endpoints, fixed rate-limit claims, and a gateway example that omits metadata
required by GatewayManager in 1.6.0. Verify any copied example before shipping.

## Cross-references

- Use fluentcart-products-inventory for catalog and stock changes.
- Use fluentcart-orders-transactions for order events and status transitions.
- Use fluentcart-rest-headless for HTTP clients and custom endpoints.

## References

- Official developer documentation: <https://dev.fluentcart.com/>
- Official database documentation: <https://dev.fluentcart.com/database/>
- Verified Free source paths:
  - fluent-cart/fluent-cart.php
  - fluent-cart/boot/app.php
  - fluent-cart/boot/globals.php
  - fluent-cart/api/FluentCartGeneralApi.php
  - fluent-cart/api/Resource/
  - fluent-cart/app/Models/
  - fluent-cart/database/Migrations/
- Verified Pro source path:
  - fluent-cart-pro/fluent-cart-pro.php
