# woocommerce

Skills for **WooCommerce core and the WooCommerce extension family** — WC itself, plus official extensions like Subscriptions, Memberships, the Stripe gateway, etc.

Use these when extending Woo or building an integration that touches Woo data.

## WooCommerce core

| Skill | Purpose |
|---|---|
| `wc-shipping-method` | Register a custom shipping method with explicit control over which fields appear in the per-zone settings modal — extend `WC_Shipping_Method`, declare fields in `init_form_fields()` (no `unset` / DOM hacks / CSS hides), use `$supports = array( 'shipping-zones' )` to suppress the modal entirely. Corrects the "this is React, removing fields is hard" misconception — the zone-method modal is Backbone, field list is fully PHP-controlled. |
| `wc-product-search-select` | Build a WooCommerce-style AJAX product picker (`class="wc-product-search"` + `data-action="woocommerce_json_search_products_and_variations"`) — products AND variations through WC's built-in endpoint, server-side pre-render of saved options via `wc_get_product()->get_formatted_name()`, no manual enqueue on WC admin screens (auto-enqueued), explicit enqueue for non-WC pages. Solves the "load all 20k products into a `<select>`" antipattern. |
| `wc-hpos-compatibility` | Make a plugin HPOS-compatible (default-on in WC 10.x) — declare via `FeaturesUtil::declare_compatibility` on `before_woocommerce_init`, replace direct `$wpdb->postmeta` / `WP_Query` order code with `wc_get_orders` + `WC_Order::get_meta`, build admin hook names dynamically via `OrderUtil::get_order_admin_screen`. Solves the "my plugin worked on dev but finds no orders on prod" silent breakage. |
| `wc-variations-data` | Read, query, and write WooCommerce variations correctly — `WC_Product_Variable` (parent) vs `WC_Product_Variation` (child) class split, the `wc_var_prices_<id>` cache, the right programmatic-creation sequence (`set_parent_id` + `set_attributes` + `save` + `wc_delete_product_transients` + `WC_Product_Variable::sync`), the three-level stock model. Solves "I added a variation programmatically and the parent's price range / stock didn't update." |
| `wc-variations-pricing-filters` | Mutate variation prices via filters — pick the right layer (`woocommerce_product_get_price` vs `woocommerce_product_variation_get_price` vs the `woocommerce_variation_prices_*` aggregation family), and CRITICAL: filter `woocommerce_get_variation_prices_hash` whenever your logic depends on context outside the default cache key. Solves both "min/max range doesn't update" and "everyone gets the first user's cached discount" bugs. |
| `wc-shipping-providers` | Register a custom carrier identity for the WC Fulfillments system (WC 10.1+) — extend `AbstractShippingProvider` (4 abstract methods: `get_key` / `get_name` / `get_icon` / `get_tracking_url`), register via `woocommerce_fulfillment_shipping_providers` filter. Distinct from shipping methods — providers are post-purchase tracking-aware carrier identities, NOT checkout-time rate calculators. |
| `wc-rest-api-v4` | Use WooCommerce REST API v4 (namespace `wc/v4`, since WC 10.2) — verified route catalog, hook prefix `woocommerce_rest_api_v4_<route>_*`, when to pick v4 over v3 (DELETE on shipping zones, fulfillments CRUD, segmented settings, ID-sortable customers), and the rule that the v4 `AbstractController` is `Internal\` (NOT a public extension surface — plugin-defined routes still use `WP_REST_Controller`). |
| `wc-payment-gateway` | Register a custom payment gateway — extend `WC_Payment_Gateway`, implement `process_payment` returning `array(result, redirect)`, optional `process_refund`, declare features in `$supports`, register via `woocommerce_payment_gateways`. The `payment_complete` vs `update_status` distinction (canonical paid-order state machine vs status-only flip) and the always-forgotten `WC()->cart->empty_cart()` after success. Webhook receiver via `wc-api`. |
| `wc-emails-classic` | Customize WC transactional emails the classic PHP-template way (NOT block editor) — extend `WC_Email`, register via `woocommerce_email_classes`, hook `trigger()` to `_notification` actions, use `wc_get_template_html` with `template_base`. Plus the theme `woocommerce/emails/<file>.php` override path that doesn't need a class. |
| `wc-coupon-dynamic` | Synthesize WC coupons at runtime via `woocommerce_get_shop_coupon_data` — no `shop_coupon` posts needed. The hidden virtual-coupon mechanism for rule-driven codes (LOYALTY-{ID}, partner CRM, auto-apply discounts), custom discount types, and the validation triple `woocommerce_coupon_is_valid_*`. The single most AI-deficient WC topic. |
| `wc-customer-and-sessions` | Use WC's session and customer APIs — `WC()->session` (cookie + `wp_woocommerce_sessions` table) for visitor data, `WC()->customer` for the active customer context including guests, `new WC_Customer($user_id)` for one-off loads. Replaces the broken `$_SESSION` / `setcookie` / user_meta-for-guests patterns AI defaults to. |

## WooCommerce Subscriptions

| Skill | Purpose |
|---|---|
| `wcs-subscription-hooks` | Curated WooCommerce Subscriptions hook map — choose the right action/filter for subscription creation, status transitions, date changes, renewal orders, scheduled payments, payment retries, gateway events, switching, gifting, related orders, REST/API responses, and account/admin UI. Solves the "hook ordinary order status or raw AS/meta" mistake. |
| `wcs-renewal-scheduler` | WooCommerce Subscriptions renewal timing and scheduler playbook — safely change `next_payment`/trial/end dates with `WC_Subscription::update_dates()`, understand `woocommerce_scheduled_subscription_payment`, renewal order creation, gateway charge hooks, retry rules, and when to use success/failure hooks instead of scheduled-payment time. |
| `wcs-data-model-switching-gifting` | WCS storage and switcher/gifting reference — exact order type names, product type slugs, subscription meta keys, schedule/date keys, related-order relation meta, switch cart data, switch order data, switched-item types/meta, proration hooks, and WCS Gifting recipient storage. Use when an agent needs the full WCS switcher/gifting flow without guessing meta keys. |

## WooCommerce Memberships

| Skill | Purpose |
|---|---|
| `wcm-membership-hooks` | Curated WooCommerce Memberships hook map — user membership creation/saves/status transitions, purchase/free-signup grants, profile fields, REST API, webhooks, members-area templates, CSV/admin hooks, and Subscriptions-linked memberships. Solves the "membership is just post/meta" mistake. |
| `wcm-access-discounts` | WooCommerce Memberships access and discount playbook — use `wc_memberships_user_can()` for target access, alter restriction/drip rules at the right hook layer, map products that grant access, and avoid double-discount/recursion bugs around member prices. |
| `wcm-data-model-subscriptions-link` | WooCommerce Memberships storage and relationship map — plan/user-membership CPTs, post statuses, plan/user-membership meta keys, rule storage, profile-field storage, order grant meta, and the WCS-linked membership relation. Use when an agent needs exact Memberships CPT/meta names without guessing. |

## WooCommerce extensions

| Skill | Purpose |
|---|---|
| `wc-stripe-add-payment-method` | Skill for the fragile My Account payment-methods and add-payment-method flows of the WooCommerce Stripe Gateway. Covers Woo account templates, `payment-methods.php`, `form-add-payment-method.php`, Stripe card/token UI, saved cards, SetupIntent, Payment Element/UPE, billing details, WC payment tokens, and Subscriptions change-payment-method compatibility. |
