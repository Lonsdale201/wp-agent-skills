---
name: wcm-access-discounts
description: WooCommerce Memberships access, restriction, drip-content,
  product-grant, and member-discount playbook. Use when code checks
  whether a user can view/purchase content or products, changes scheduled
  access dates, customizes protected/public content, maps parent or
  variation products that grant membership access, applies member prices,
  reads original prices around discounts, or contains wc_memberships_user_can,
  wc_memberships_access_from_time, wc_memberships_user_has_member_discount,
  wc_memberships_get_member_product_discount,
  wc_memberships_get_discounted_price, or member discount badge hooks.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-memberships"
  wp-skills-plugin-version-tested: "1.29.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-06"
---

# WooCommerce Memberships: access and discounts

Use this when an integration needs to decide whether a user can access content/products, alter restriction behavior, adjust drip-content timing, grant access from products, or work with member prices. This is where generic WooCommerce or WordPress assumptions most often produce subtle bugs.

## Misconception this skill corrects

> "Membership access is a simple active-status check, and member discounts are just a product price filter."

Memberships combines plan rules, user membership status, access start time, delayed/dripped access, product/category restrictions, purchase restrictions, product grants, and price-adjustment filters. Use the public capability/discount APIs and the Memberships filters at the rule layer.

## When to use this skill

Trigger when ANY of the following is true:

- The user asks "can this member view/buy/access", "hide protected product", "drip content", "scheduled access", "member discount", "membership price", "grant access product", or "original price before discount".
- Code contains `wc_memberships_user_can()`, `wc_memberships_is_post_content_restricted()`, `wc_memberships_is_product_viewing_restricted()`, `wc_memberships_access_from_time`, `wc_memberships_user_object_access_start_time`, `wc_memberships_user_has_member_discount()`, `wc_memberships_get_member_product_discount()`, or `wc_memberships_get_discounted_price`.
- You are writing WooCommerce price filters in a store that uses Memberships.

## Access checks

Prefer `wc_memberships_user_can()` for final "can this user do this" decisions:

```php
if ( wc_memberships_user_can( $user_id, 'view', array( 'post' => $post_id ) ) ) {
    myplugin_show_content();
}

if ( wc_memberships_user_can( $user_id, 'purchase', array( 'product' => $product_id ) ) ) {
    myplugin_allow_purchase();
}
```

Useful public helpers:

| Need | API | Notes |
|---|---|---|
| Post content restricted? | `wc_memberships_is_post_content_restricted( $post_id )` | Tells whether Memberships restricts the object, not whether a specific user has access. |
| Term restricted? | `wc_memberships_is_term_restricted( $term_id, $taxonomy )` | Useful for category archives/custom taxonomies. |
| Product viewing restricted? | `wc_memberships_is_product_viewing_restricted( $product_id )` | Product-level viewing rules. |
| Product purchasing restricted? | `wc_memberships_is_product_purchasing_restricted( $product_id )` | Use if available in installed version for purchase-only rules. |
| User active member? | `wc_memberships_is_user_active_member( $user_id, $plan )` | Membership status check, not rule/object access. |
| User active or delayed member? | `wc_memberships_is_user_active_or_delayed_member( $user_id, $plan )` | Useful for drip UX where membership exists but access is not yet open. |

Do not replace `wc_memberships_user_can()` with a raw membership status check when the target object matters.

## Restriction and drip hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Change rule access start timestamp | `wc_memberships_access_from_time` | filter | `int $from_time, WC_Memberships_Membership_Plan_Rule $rule, WC_Memberships_User_Membership $membership` | Main drip-content timing extension point. Return a Unix timestamp. |
| Override object access start time | `wc_memberships_user_object_access_start_time` | filter | `int $access_time, array $args` | Override calculated access start time for a target object/rule args. |
| Force content public | `wc_memberships_is_post_public` | filter | `bool $public, int $post_id, string $post_type` | Bypass restrictions for selected content. |
| Public-content cache TTL | `wc_memberships_public_content_cache_expiration` | filter | `int $expiration` | Adjust cache lifetime for public-content lookups. |
| Products granting access | `wc_memberships_products_that_grant_access` | filter | `array $product_ids, int $object_id, string $rule_type, array $args, array $unfiltered` | Change product IDs shown as granting access to protected objects. |
| Products granting access to term query args | `wc_membership_get_products_that_grant_access_to_term_args` | filter | `array $args` | Note singular `wc_membership`. Adjust lookup query. |
| Feed restriction | `wc_memberships_is_feed_restricted` | filter | `bool $restricted` | Control restricted feed output. |
| Restrictable comment types | `wc_memberships_restrictable_comment_types` | filter | `string[] $types` | Include/exclude comment types from restriction behavior. |
| Rule object IDs | `wc_memberships_rule_object_ids` | filter | `array $ids, WC_Memberships_Membership_Plan_Rule $rule` | Adjust objects a rule applies to. |
| Rule priority | `wc_memberships_rule_priority` | filter | `int $priority, $rule` | Resolve conflicts between rules. |
| Rule access time | `wc_memberships_rule_access_start_time` | filter | `int $access_time, int $from_time, WC_Memberships_Membership_Plan_Rule $rule` | Lower-level rule access timing. |

There is not a single universal `wc_memberships_user_can` result filter to "just allow access". Change the rule inputs, public-content decision, access start time, or membership status intentionally.

For editor/admin automation that reads or updates per-post content restriction rows, use `wcm-abilities-api`: Memberships 1.29.0 exposes `post-restriction-rules-get` and `post-restriction-rules-update` abilities plus `/wc-memberships/v1/post-restriction-rules/{id}` routes. Those are rule-configuration APIs; `wc_memberships_user_can()` remains the final runtime access decision for frontend rendering, REST output, AJAX fragments, and headless responses.

## Boot-time safety

Do not call Memberships restriction APIs at file load or very early WordPress bootstrap just to decide whether to register your own plugin components. Memberships has hardened "translations loaded too early" paths during WP-Cron and WP-CLI; avoid reintroducing that pattern from integrations.

Safe timing:

- Register hooks/classes with a file-scope active check such as `class_exists( 'WC_Memberships_Loader' )`.
- Perform actual access checks inside request-time callbacks, REST/AJAX handlers, template rendering, WooCommerce price filters, or after normal WordPress initialization.
- Do not instantiate `SkyVerge\WooCommerce\Memberships\Restrictions` or read restriction mode only to decide whether your plugin should load.

## Product grants

| Need | Hook/API | Type | Use |
|---|---|---|---|
| Product in order grants plan access | `wc_memberships_access_granting_purchased_product_id` | filter | Choose parent/variation or multiple product IDs used for the grant. |
| Access granted from purchase | `wc_memberships_grant_membership_access_from_purchase` | action | React after purchase grants membership. Args include order/product/user/membership context. |
| Order grant metadata | `wc_memberships_get_order_access_granted_memberships()`, `wc_memberships_has_order_granted_access()`, `wc_memberships_set_order_access_granted_membership()` | API | Read or mark which memberships an order granted. |
| Force account at checkout | `wc_memberships_force_checkout_registration` | filter | Ensure a guest can become a user before access is granted. |

When a variable product grants access, check whether the plan expects the parent product, variation, or both. The grant filter is also used by checkout registration logic, so return IDs that really grant the selected plan.

## Member discount APIs

| Need | API | Notes |
|---|---|---|
| Product has any member discount | `wc_memberships_product_has_member_discount( $product )` | Product-level rule availability. |
| User has discount for product | `wc_memberships_user_has_member_discount( $product, $member )` | Use for current-user eligibility. `$member` can be user/membership context. |
| Get discount amount/rule | `wc_memberships_get_member_product_discount( $membership, $product, $formatted = false )` | For display or external sync. |
| Badge HTML | `wc_memberships_get_member_discount_badge( $product, $variation = false )` | Use rather than recreating badge markup. |

## Member discount hooks

| Need | Hook | Type | Args | Use |
|---|---|---|---|---|
| Stack discounts | `wc_memberships_allow_cumulative_member_discounts` | filter | `bool $allow, int $user_id, WC_Product $product` | Allow several plans/rules to cumulate. |
| User discount eligibility | `wc_memberships_is_user_eligible_for_member_discounts` | filter | `bool $eligible, int $user_id` | Global user-level discount gate. |
| Exclude product | `wc_memberships_exclude_product_from_member_discounts` | filter | `bool $excluded, WC_Product $product` | Product-level exclusion. |
| Discounted price | `wc_memberships_get_discounted_price` | filter | `$price, $base_price, int $product_id, int $user_id, WC_Product $product` | Final price extension point. Return numeric price-like value. |
| Rounding precision | `wc_memberships_discount_rounding_precision` | filter | `int $precision` | Match store/accounting needs. |
| Price filter priority | `wc_memberships_price_adjustments_filter_priority` | filter | `int $priority` | Coordinate with other dynamic pricing plugins. |
| Product discount rules for user | `wc_memberships_product_purchasing_discount_rules_for_user` | filter | `array $rules, WP_User $user, WC_Product $product` | Add/remove discount rules before price calculation. |
| Use discount format | `wc_memberships_member_prices_use_discount_format` | filter | `bool $use_discount_format` | Control sale/strike-through style. |
| Price HTML | `wc_memberships_get_price_html`, `wc_memberships_get_discounted_price_html`, `wc_memberships_get_price_html_before_discount`, `wc_memberships_get_price_html_after_discount` | filter | Customize displayed price HTML. |
| Sale price display | `wc_memberships_member_prices_display_sale_price` | filter | `bool $display_sale_price` | Control how sale price and member price interact. |
| Product sale state while discounted | `wc_memberships_product_is_on_sale_before_discount_excluded_filters` | filter | `array $filters` | Coordinate sale checks with price filters. |
| Badge HTML | `wc_memberships_member_discount_badge`, `wc_memberships_variation_member_discount_badge` | filter | Customize badge text/markup. |

## Price adjustment recursion safety

Memberships adjusts WooCommerce product prices through filters. If your code needs the original WooCommerce price while Memberships discounts are active, disable Memberships adjustments only around that read and re-enable them immediately.

```php
do_action( 'wc_memberships_discounts_disable_price_adjustments' );

$product = wc_get_product( $product_id );
$regular_price = $product ? $product->get_regular_price() : null;

do_action( 'wc_memberships_discounts_enable_price_adjustments' );
```

For price HTML only:

```php
do_action( 'wc_memberships_discounts_disable_price_html_adjustments' );
$html = $product->get_price_html();
do_action( 'wc_memberships_discounts_enable_price_html_adjustments' );
```

Do not leave adjustments disabled across template rendering, cart calculation, REST responses, or async callbacks.

## Common mistakes

```php
// WRONG: active membership is not the same as access to this protected object.
if ( wc_memberships_is_user_active_member( $user_id, $plan_id ) ) {
    echo get_post_field( 'post_content', $post_id );
}

// RIGHT: ask Memberships for access to the target object.
if ( wc_memberships_user_can( $user_id, 'view', array( 'post' => $post_id ) ) ) {
    echo apply_filters( 'the_content', get_post_field( 'post_content', $post_id ) );
}

// WRONG: custom price filter can double-discount or recurse through Memberships.
add_filter( 'woocommerce_product_get_price', function ( $price, $product ) {
    return wc_memberships_get_member_product_discount( get_current_user_id(), $product );
}, 10, 2 );

// RIGHT: use Memberships discount filters or APIs at their intended layer.
add_filter( 'wc_memberships_get_discounted_price', function ( $price, $base_price, $product_id, $user_id, $product ) {
    if ( myplugin_should_cap_member_price( $product_id, $user_id ) ) {
        return min( $price, 99 );
    }

    return $price;
}, 10, 5 );

// WRONG: drip access by comparing post dates or membership start meta yourself.
$can_view = strtotime( get_post_meta( $membership_id, '_start_date', true ) ) < time();

// RIGHT: alter access start time or call the final access API.
add_filter( 'wc_memberships_access_from_time', function ( $from_time, $rule, $membership ) {
    if ( myplugin_rule_uses_external_unlock( $rule ) ) {
        return myplugin_get_unlock_timestamp( $membership->get_user_id(), $rule );
    }

    return $from_time;
}, 10, 3 );
```

## Cross-references

- Use `wcm-membership-hooks` for creation, status transitions, profile fields, REST/webhooks, members area, CSV, admin, and Subscriptions-linked membership hooks.
- Use `wcm-data-model-subscriptions-link` when previous-purchase grant logic touches order storage; HPOS means raw `shop_order` post queries are unsafe.
- Use `wc-variations-pricing-filters` when combining Memberships discounts with custom variation price logic and cached variation price hashes.

## References

- Verified source paths:
  - `wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-capabilities.php`
  - `wp-content/plugins/woocommerce-memberships/src/Restrictions.php`
  - `wp-content/plugins/woocommerce-memberships/src/Restrictions/Posts.php`
  - `wp-content/plugins/woocommerce-memberships/src/Restrictions/Products.php`
  - `wp-content/plugins/woocommerce-memberships/src/class-wc-memberships-member-discounts.php`
  - `wp-content/plugins/woocommerce-memberships/src/functions/wc-memberships-functions-restrictions.php`
  - `wp-content/plugins/woocommerce-memberships/src/functions/wc-memberships-functions-member-discounts.php`
  - `wp-content/plugins/woocommerce-memberships/src/Posts/Abilities/`
