---
name: fluentcart-rest-headless
description: >-
  Implements and audits FluentCart REST, AJAX, headless, mobile, and external
  client integrations. Covers the source-verified /fluent-cart/v2 routes,
  FluentCart router policies, WordPress cookie/nonces and application
  passwords, customer ownership, public checkout endpoints, cart-hash trust,
  custom register_rest_route endpoints, schema validation, pagination, rate
  limits, cache resets, and documentation drift. Use for REST clients, SPA or
  mobile storefronts, customer portals, webhooks, custom resources, or exposed
  FluentCart data.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart REST and headless clients

Inventory the routes registered by the installed version before designing a
client. FluentCart 1.6.0 registers its main REST API under /fluent-cart/v2, but
not every browser checkout operation is a REST resource.

Read [route-auth-map.md](references/route-auth-map.md) before exposing data or
building a headless/mobile client.

## Do not derive routes from generic examples

The official developer pages currently contain examples that alternate v1 and
v2 and describe generic cart endpoints not registered by the tested 1.6.0
runtime. The main API is v2, while an isolated v1 editor-autosave route also
exists; never rewrite a route's version globally. Use
rest_get_server()->get_routes(), the installed route files, and controller code
as the contract for a pinned version.

In 1.6.0, checkout/cart mutations also use authenticated or public WordPress
AJAX dispatchers such as fluent_cart_checkout_routes and
fluent_cart_place_order. There is no source/runtime-confirmed generic
/fluent-cart/v2/cart/add, /cart/update, or /cart/remove family. A headless
client must either reproduce the supported checkout transport precisely or add
an addon-owned REST facade that delegates to the same server services.

## Apply authentication and ownership separately

- Admin routes use FluentCart router policies/capabilities.
- Customer routes require an authenticated WordPress user, then controllers
  scope records to the resolved FluentCart customer.
- Public checkout/product/payment endpoints still require object-level checks,
  opaque identifiers, state validation, and abuse controls.
- A cart hash is a bearer pointer for cart continuity, not customer identity.

For same-origin JavaScript, use WordPress cookie authentication with a
wp_rest nonce. For external trusted clients, WordPress Application Passwords
provide Basic Auth over HTTPS. OAuth/JWT requires a separately installed and
audited authentication provider; it is not supplied by FluentCart core.

Never rely on CustomerFrontendPolicy alone as order ownership: it establishes
login, while the controller/query must constrain the requested object.

## Build addon endpoints safely

Register an addon-owned namespace with register_rest_route(). Always provide a
permission_callback, argument schema/validation/sanitization, bounded
pagination, explicit response fields, and stable WP_Error codes/statuses.
Delegate business changes to FluentCart resources/services instead of direct
table writes.

Do not call a FluentCart controller merely to inherit authorization: policies
are attached by FluentCart's router registration. Recreate the required
capability/ownership check in the addon route.

Add per-principal or per-resource throttling to sensitive public endpoints.
The installed source does not establish a single fixed global rate limit for
all FluentCart REST routes, so do not repeat documentation claims about one.

## Design headless checkout as a state machine

1. Fetch current product/variation data and minor-unit prices.
2. Create/resume only the intended cart; keep its hash confidential.
3. Patch address, coupon and shipping data through supported server logic.
4. Render current server totals and validation errors.
5. Place the order once, honoring lock/rate-limit responses.
6. Complete the gateway's redirect/client-confirmation contract.
7. Treat provider webhook/order state as settlement authority.

Never mark an order paid from a client success page. Make retries and network
replays idempotent.

## Cache and response discipline

Models/helpers have request-static caches. In REST unit tests, CLI loops, or
long-running workers simulating multiple users, call the available resetCache()
methods before crossing identity/store boundaries. Do not leak ORM models,
secrets, gateway metadata, cart hashes, license keys, or unrestricted order
meta through a convenience serializer.

## Test matrix

Test anonymous/customer/admin/application-password requests; expired/missing
nonce; another customer's UUID; guessed cart hash; invalid enum/amount; excess
page size; duplicate place order; concurrent cart requests; checkout AJAX or
facade parity; free and paid orders; gateway redirect; webhook-before-return;
rate-limit response; long-running cache isolation; and route inventory after a
FluentCart upgrade.

## Cross-references

- Use fluentcart-customers-portal for identity and ownership.
- Use fluentcart-cart-checkout for checkout locking and revalidation.
- Use fluentcart-payment-gateways for provider completion/webhooks.

## References

- Official REST overview: <https://dev.fluentcart.com/api/>
- Verified Free source paths:
  - fluent-cart/app/Http/Routes/api.php
  - fluent-cart/app/Http/Routes/frontend_routes.php
  - fluent-cart/app/Http/Routes/routes.php
  - fluent-cart/app/Http/Routes/WebRoutes.php
  - fluent-cart/app/Http/Controllers/
  - fluent-cart/app/Http/Policies/
  - fluent-cart/app/Services/Permission/
  - fluent-cart/boot/app.php
