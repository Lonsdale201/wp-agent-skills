---
name: fluentcart-cart-checkout
description: >-
  Implements and audits FluentCart cart mutation, custom/ghost items, fees,
  coupons, checkout fields, validation, shipping recalculation, order placement,
  and duplicate-submit protection. Use when working with CartResource, Cart,
  cart_hash or fct_cart_hash, fluent_cart_checkout_routes,
  fluent_cart_place_order, fluent_cart/cart/* or fluent_cart/checkout/* hooks,
  instant checkout, headless checkout, or any code that must prevent the browser
  from choosing price, entitlement, stock, shipping, tax, or ownership.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart cart and checkout

Keep the browser declarative: it may request an item, quantity, coupon, address,
and method, but the server must resolve every price and eligibility decision.

Read [checkout-contract.md](references/checkout-contract.md) before adding a
custom item, fee, checkout field, or nonstandard client.

## Use the actual transport

In Free 1.6.0 normal cart mutations use authenticated-by-nonce admin AJAX:

- action=fluent_cart_checkout_routes plus fc_checkout_action
- action=fluent_cart_place_order for order placement

The X-WP-Nonce header is accepted for action fluentcart or wp_rest. It provides
CSRF intent, not user identity or object ownership. Anonymous checkout remains
public.

The registered REST namespace contains checkout and public product routes, but
no active core /cart/add, /cart/update, or /cart/remove route. Do not implement a
headless client from generic documentation alone.

## Extend cart items safely

Prefer normal ProductVariation items. For a custom/ghost item:

1. Resolve a server-owned offer from the requested opaque item ID.
2. Validate availability, currency, quantity, customer eligibility, and mode.
3. Return a complete normalized item/variation from the documented custom-item
   filters.
4. Recompute the item on every quantity/revalidation path.
5. Never accept item_price, subtotal, discount, recurring amount, tax class,
   downloadable entitlement, or product title as authoritative client values.
6. Add a stable discriminator to prevent unrelated custom items from merging.

Relevant surfaces include fluent_cart/cart/validate_custom_item,
fluent_cart/cart_item_product_variation, and the custom-item quantity/change
hooks in Cart/CartResource. Verify the exact callback arguments at 1.6.0 before
registering.

## Add fees through Cart

Use Cart::addFee() with a stable key and addon-owned source. Keep calculation
pure and deterministic for the current cart context. Use removeFee() or
removeFeesBySource() when the condition no longer applies. Amounts are integer
minor units.

Do not persist a fee by editing estimated_total or a browser fragment. Fees are
recomputed and cached during the request; avoid recursion from
fluent_cart/cart/fees and call clearFeeCache() only when the underlying context
really changes.

## Validate at order placement

- Use fluent_cart/checkout/validate_before_process for whole-request rejection
  and return true or WP_Error.
- Use fluent_cart/checkout/validate_data for field-shaped errors after normal
  checkout normalization.
- Recheck product, stock, coupon, address, shipping method, tax, gateway, and
  customer rules server-side.
- Preserve existing errors and never expose provider secrets or internal
  exception details.
- Keep validation free of irreversible side effects; checkout can retry.

Order placement serializes concurrent first submissions with a MySQL named lock
keyed by cart_hash. Do not create a parallel order outside CheckoutApi merely to
obtain an order ID; that defeats the duplicate-submit protection.

## Treat cart identity correctly

- fct_cart_hash/cookie is a bearer pointer to a non-completed cart, not an
  authorization credential.
- Bind customer-only data to the resolved Customer/WP user, not only cart_hash.
- Clear Resource request caches between simulated requests/users in tests.
- Do not log complete cart hashes, payment tokens, full addresses, or checkout
  payloads.
- Expire or detach completed/stale carts through core behavior.

## Test the failure paths

Test anonymous and logged-in carts, stale hash, replayed request, two concurrent
place-order requests, zero payment, subscription-only restrictions, invalid
coupon, changed price/stock, invalid shipping method, payment create failure,
and retry after the transaction becomes failed.

## Cross-references

- Use fluentcart-payment-gateways for the PaymentInstance handoff.
- Use fluentcart-coupons-discounts for coupon rules and allocation.
- Use fluentcart-rest-headless for a custom client or endpoint.

## References

- Official cart/checkout hooks: <https://dev.fluentcart.com/hooks/actions/cart-checkout/>
- Official fee tutorial: <https://dev.fluentcart.com/modules/fee-system/>
- Official ghost product tutorial: <https://dev.fluentcart.com/modules/ghost-product-selling/>
- Verified Free source paths:
  - fluent-cart/api/Checkout/CheckoutApi.php
  - fluent-cart/api/Resource/FrontendResource/CartResource.php
  - fluent-cart/app/Models/Cart.php
  - fluent-cart/app/Hooks/Cart/WebCheckoutHandler.php
  - fluent-cart/app/Http/Routes/WebRoutes.php
  - fluent-cart/app/Http/Controllers/CheckoutController.php
  - fluent-cart/app/Helpers/CartHelper.php
