---
name: wcs-upgrade-compatibility
description: >-
  Audits WooCommerce Subscriptions integrations across release changes, with a
  verified 9.2.0 baseline. Covers deprecated settings APIs, REST field contracts,
  per-product gifting migration, item-removal ownership and nonce changes, APFS
  script loading and legacy plan identity, switching, renewal discounts, PayPal
  validation, and HPOS stale saves. Use when upgrading Subscriptions, reviewing
  its changelog, replacing deprecated WCS calls, or diagnosing behavior that
  changed after an update. Includes a disposable WP-CLI smoke plugin; payment
  settlement and browser checkout require separate tests.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "woocommerce-subscriptions"
  wp-skills-plugin-version-tested: "9.2.0"
  wp-skills-woocommerce-version-tested: "11.1.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-09-21"
---

# Subscriptions upgrade compatibility

Ground changes in the installed release source and targeted runtime evidence. Use the changelog to identify work, then distinguish removed APIs, deprecated compatibility shims, changed defaults, security boundaries and bug fixes. Do not mechanically delete every deprecated name: migration notes must still identify what to replace.

## Establish the comparison

Record WCS, WooCommerce, WordPress and PHP versions; authoritative order storage and synchronization; classic/Blocks checkout; gateways; and whether products use legacy subscription types or the subscription plans integrated since WCS 9.0. Read the release's full changelog, including intervening releases when upgrading from an older baseline.

Inventory the integration's hooks, settings reads/writes, template overrides, checkout/order-pay paths, plan IDs, order metadata and background actions. Separate public extension hooks from `Internal` classes. An indexed signature can lag a release: resolve disagreements against the exact installed source and record the evidence, rather than treating a missing lookup as removal.

## Replace deprecated settings integration

| Deprecated surface | 9.2 behavior | Migration |
|---|---|---|
| `WC_Subscriptions_Admin::add_subscription_settings_tab()` | Still adds a tab but emits a notice. Core now registers a `WC_Settings_Page` through `woocommerce_get_settings_pages`. | Remove companion code that registers WCS's own tab. Keep extension fields on established settings filters. |
| `WC_REST_Subscriptions_Settings` | Legacy mirror remains functional; autoloading the class itself emits deprecation. | Stop constructing or autoload-probing it. Use the existing `/wc/v3/settings/subscriptions` group. |
| `woocommerce_subscriptions_max_customer_suspension_range` | Deprecated callback still runs; its returned list is ignored. | Remove option-list logic. If overriding the effective limit, use `pre_option_woocommerce_subscriptions_max_customer_suspensions` with the canonical value contract. |
| `WCSG_Admin::get_gifting_option_text()` / `get_gifting_global_override_text()` | Describe a removed storewide default. | Remove consumers of those descriptions; use per-product gifting controls. |

The replacement `Settings_Page` implementation is under `Automattic\WooCommerce_Subscriptions\Internal`; its existence is **not** a stable class API to instantiate. Its output callback runs at priority **1**, before normal priority-10 callbacks. Audit code that tries to output before/after the built-in settings.

For upgrades crossing 9.1, also replace calls to deprecated `WC_Subscriptions_Cart::get_formatted_product_subtotal()` and `get_due_today_subtotal()`. Due-today presentation now uses `woocommerce_cart_item_subtotal`; direct `WC()->cart->get_product_subtotal()` receives standard Woo output.

## Preserve settings values and migrations

- REST suspension field `woocommerce_subscriptions_max_customer_suspensions` is now `number`, with no select options. The accepted stored values remain non-negative integers or `'unlimited'`; do not infer that the descriptor makes the value numeric-only.
- Early renewal defaults to enabled only when its option has never been saved. Preserve an explicit merchant choice.
- Turning off automatic payments takes effect only when manual renewals are accepted. REST/CLI can save inconsistent pairs; write both deliberately. The upgrade normalizes the previous child-only combination to preserve behavior.
- Gifting retains its feature switch but retires the storewide default. Existing products missing `_subscription_gifting` migrate from the old enabled default; explicit product choices survive. Newly created products default off. Verify migration completion and failures; do not bulk reset the catalog.
- Physical-product proration adds `physical-upgrade` / `physical` to recurring-price choices and `physical` to length proration. Keep existing virtual/all-product values.

Read [references/release-9.2.md](references/release-9.2.md) for the full release impact map, transitional gifting behavior and regression scenarios.

## Keep permissions and operation tokens aligned

`wcs_can_items_be_removed( $subscription, $user_id = 0 )` now passes the resolved user as the third argument to its filter, then checks `edit_shop_subscription_line_items`. A true filter return cannot authorize an otherwise unauthorized customer. Pass the owner explicitly in noninteractive contexts; actor `0` falls back to the current user. Do not add a global capability override to restore an obsolete UI control.

Test a customer-owned subscription with its owner, another customer and no current user. Treat ownerless/guest subscriptions separately: the source's capability mapping can compare owner ID 0 with user ID 0, so do not generalize the owned-subscription test into an unconditional anonymous-denial guarantee.

Removal and resubscribe URLs now use different operation-specific nonce actions. Use WCS URL builders; do not reuse tokens or mint ID-only nonces. Previously generated URLs fail verification. Reopen resubscribe links from My Account; an old removal Undo URL cannot simply be reissued. Keep capability checks in addition to nonces.

## Audit plans, switching and money

- Custom pages that render plan-selector markup must enqueue `wcsatt-frontend` via `WCS_ATT_Display::enqueue_frontend_script()` after registration and before footer scripts print. The helper is idempotent; do not rely on every page receiving the bundle or re-bootstrap APFS to load it.
- `WCS_ATT_Product::get_instance_id()` no longer reruns module initialization. Register modules during normal bootstrap, not as a side effect of looking up products.
- Legacy no-end-date plan keys regain matching. Use plan resolution rather than raw key equality; ambiguous canonical matches must not select an arbitrary plan. Re-test recurring/sign-up coupons and trial switching on migrated orders.
- `woocommerce_subscriptions_switch_is_identical_product` now receives seven arguments: `(identical, product_id, quantity, variation_id, subscription, item, is_same_plan)`. Older six-argument callbacks still work. On order-pay rebuilds the same-plan verdict is enforced after the filter; do not invent posted plan data where none exists.
- HPOS subscription saves now preserve unrelated properties changed by another loaded instance. Use CRUD, save only intended fields, and test two stale instances. This is not a transaction or a lock against conflicting writes to the same property.
- Verify renewal discounts in the order's tax basis, including manual discounts and tax-inclusive prices. A discount displayed in Blocks is not proof of the amount charged.
- `woocommerce_subscriptions_paypal_standard_expected_payment_amounts` receives `(amounts, subscription, transaction_details)`. Restrict additions to independently justified amounts; it is not a way to accept arbitrary notification amounts or bypass receiver/currency checks.

## Verify the integration

The [WP-CLI smoke example](examples/woo-skills-smoke/woo-skills-smoke.php) creates synthetic fixtures for WooCommerce 11.1.1 and WCS 9.2.0. Use a disposable installation with blocked network egress, intercepted mail and disabled cron/async queue runners. Set `WP_ENVIRONMENT_TYPE=local` and `WOO_SKILLS_SMOKE_ALLOW_WRITES=true`, activate the example, then run `wp woo-skills-smoke run --confirm-disposable`. Discard the environment afterward.

Test posts-based and HPOS storage separately. Add browser, gateway, tax and migration tests for the integration's actual scope; the CLI example does not cover these workflows. Keep run reports outside the skill collection.

## Cross-references

- `wc-coupon-types-rules` and `wc-coupon-dynamic` for core coupon definition, entitlement and historical-replay boundaries.
- `wc-hpos-compatibility` for order storage mode and CRUD rules.
- `wc-action-scheduler-jobs` for queue diagnostics without triggering real renewal charges.

## References

- [9.2 release impact map](references/release-9.2.md).
- [Disposable WP-CLI smoke example](examples/woo-skills-smoke/woo-skills-smoke.php).
- [Official Subscriptions 9.2 developer advisory](https://developer.woocommerce.com/2026/09/08/wc-subscriptions-9-2-0/).
- [Official product and version notes](https://woocommerce.com/products/woocommerce-subscriptions/).
- Installed WCS 9.2.0 `changelog.txt`; `includes/core/admin/class-wc-subscriptions-admin.php`; `includes/api/class-wc-rest-subscriptions-settings.php`; `includes/core/wcs-functions.php`; `includes/core/class-wcs-remove-item.php`; `includes/core/class-wcs-cart-resubscribe.php`; `includes/switching/class-wc-subscriptions-switcher.php`.
- Settings wrapper: `src/Internal/Admin/Settings/Settings_Page.php` (implementation evidence, not a public extension API).
