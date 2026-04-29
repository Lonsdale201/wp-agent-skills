---
name: wc-coupon-dynamic
description: Synthesize WooCommerce coupons at runtime without creating
  shop_coupon posts in the DB — via the woocommerce_get_shop_coupon_data
  filter, the hidden-but-powerful virtual-coupon mechanism. Filter fires
  inside WC_Coupon::__construct, and a non-false return becomes a fully
  functional coupon read through read_manual_coupon. Plus custom
  discount types via woocommerce_coupon_discount_types and
  woocommerce_coupon_get_discount_amount, and the validation triple
  woocommerce_coupon_is_valid / _is_valid_for_cart / _is_valid_for_product.
  Use when implementing rule-driven coupons (auto-apply X% to logged-in
  users, code-pattern detection like LOYALTY-42, external CRM integration
  that hands out codes), without populating wp_posts. The AI-deficient
  pattern; most LLMs don't know dynamic coupons exist. Triggers on
  woocommerce_get_shop_coupon_data, woocommerce_coupon_discount_types,
  woocommerce_coupon_get_discount_amount, read_manual_coupon, virtual
  coupon, dynamic coupon in WC context.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.7"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://woocommerce.com/document/woocommerce-coupons/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-coupon.php
  - wp-content/plugins/woocommerce/includes/class-wc-discounts.php
  - wp-content/plugins/woocommerce/includes/wc-coupon-functions.php
  - wp-content/plugins/woocommerce/includes/class-wc-cart.php
---

# WooCommerce: dynamic / virtual coupons

For plugins that issue, validate, or synthesize coupons at runtime — without populating `shop_coupon` posts in `wp_posts`. The pattern is hidden but supported by WC since the early days: hook `woocommerce_get_shop_coupon_data`, return a coupon-data array, and WC treats it as a fully-valid coupon for the rest of the request lifecycle.

This is the **single most AI-deficient WC topic**. LLMs default to "create a `shop_coupon` post via `wp_insert_post`" because that's what's documented. The dynamic path is faster (no DB write), more flexible (rules-based), and used by every serious WC discount / promotions plugin in the ecosystem.

## Misconception this skill corrects

> "To programmatically issue a coupon, I'll `wp_insert_post( 'shop_coupon', ... )` and `update_post_meta` for the discount fields."

That works for permanent codes, but it's wrong for:

- **Pattern-driven codes** (e.g. "every code matching `LOYALTY-{user_id}` gives 10%") — populating the DB with millions of posts is absurd.
- **Per-user / per-session codes** that don't outlive the request.
- **Auto-applied conditional discounts** ("if cart contains 3 of category X, add a virtual 'BUY3' code").
- **External-system codes** validated against a CRM / partner API — you don't want a stale local `shop_coupon` post that contradicts the source of truth.

The right path is `woocommerce_get_shop_coupon_data`, which lets `WC_Coupon::__construct( $code )` resolve to your filtered data without ever touching the DB.

## When to use this skill

Trigger when ANY of the following is true:

- Implementing a coupon system that issues codes from rules (loyalty tier, referral, partner integration).
- Building a "code pattern" feature — codes follow a regex / template, not stored as individual posts.
- Validating coupon codes against an external service (CRM, marketing automation).
- Adding a brand-new coupon discount type (`'buy_x_get_y'`, `'tiered_percentage'`).
- Reviewing code that creates `shop_coupon` posts in bulk — likely the wrong tool.
- The diff or file contains: `woocommerce_get_shop_coupon_data`, `woocommerce_coupon_discount_types`, `woocommerce_coupon_get_discount_amount`, `read_manual_coupon`, `WC_Coupon::__construct` with a string code argument.

## Mental model

When customer enters a code at checkout (or `WC_Cart::apply_coupon()` runs), WC instantiates `new WC_Coupon( $code )`. Inside the constructor ([class-wc-coupon.php:122-127](class-wc-coupon.php)):

```php
// This filter allows custom coupon objects to be created on the fly.
$coupon = apply_filters( 'woocommerce_get_shop_coupon_data', false, $data, $this );

if ( $coupon ) {
    $this->read_manual_coupon( $data, $coupon );
    return;
}

// (otherwise look up the shop_coupon post by code…)
```

The check is a PHP truthy test (`if ( $coupon )`), not `!== false` — so any falsey return (`false`, `null`, `0`, empty `array()`, empty string) skips `read_manual_coupon` and falls through to the DB lookup. To trigger the virtual-coupon path you must return a **non-empty array**.

If your filter returns a non-empty array, WC populates the `WC_Coupon` instance from that array via `read_manual_coupon` and **never touches the DB**. The coupon is "virtual" — it has no `id`, no `shop_coupon` post, but it's a fully-valid `WC_Coupon` for cart calculation, validation, and display.

Also note the second filter argument is `$data` — typed `int|string|WC_Coupon` in the constructor signature. By the time the filter fires, the `WC_Coupon` short-circuit has already returned ([class-wc-coupon.php:117-121](class-wc-coupon.php)), so in your filter `$data` is `int|string` (post ID or code). Don't typehint it as `string`.

The class docblock confirms ([class-wc-coupon.php:467](class-wc-coupon.php)):

> *"If the filter is added through the woocommerce_get_shop_coupon_data filter, it's virtual and not in the DB."*

## Minimal scaffold — pattern-based virtual coupon

```php
add_filter( 'woocommerce_get_shop_coupon_data', static function ( $data, $code ) {
    if ( $data !== false ) {
        return $data; // someone earlier already resolved it
    }

    if ( ! is_string( $code ) ) {
        return $data; // post-ID lookup — not our virtual flow
    }

    // Match codes like "LOYALTY-42" → 10% off for user ID 42.
    if ( preg_match( '/^LOYALTY-(\d+)$/i', $code, $matches ) ) {
        $user_id = (int) $matches[1];

        // Validate against your real source of truth (user existence, role,
        // loyalty tier, …). Return false to make WC reject the code.
        $user = get_user_by( 'id', $user_id );
        if ( ! $user || ! user_can( $user, 'customer' ) ) {
            return false;
        }
        if ( get_current_user_id() !== $user_id ) {
            return false; // code only valid for that specific user
        }

        // Field shape — see "The data array contract" below for full options.
        return array(
            'discount_type'  => 'percent',
            'amount'         => 10,
            'individual_use' => true,
            'description'    => __( 'Loyalty discount', 'myplugin' ),
        );
    }

    return false; // not our code; let other filters / DB lookup handle it
}, 10, 2 );
```

That's it. Customer types `LOYALTY-42` at checkout, `WC_Coupon( 'LOYALTY-42' )` resolves through your filter, the cart applies 10% off, the order stores "LOYALTY-42" as the used code in the order's coupon list — and no `shop_coupon` post ever existed.

## The data array contract

`read_manual_coupon` ([class-wc-coupon.php:854](class-wc-coupon.php)) defines what fields it accepts. Source-verified key list:

| Field | Type | Notes |
|---|---|---|
| `discount_type` | string | `'percent'`, `'fixed_cart'`, `'fixed_product'`, or any custom type registered via `woocommerce_coupon_discount_types`. |
| `amount` | numeric string | The discount amount. Interpreted per `discount_type`. |
| `individual_use` | bool | If true, can't be combined with other coupons. |
| `product_ids` | array of int | Products this coupon applies to (empty = all). |
| `excluded_product_ids` | array of int | Products this coupon does NOT apply to. |
| `product_categories` | array of int | Term IDs (`product_cat`) this coupon applies to. |
| `excluded_product_categories` | array of int | Excluded category term IDs. |
| `exclude_sale_items` | bool | If true, doesn't apply to items already on sale. |
| `usage_limit` | int | Total uses (mostly meaningless for virtual coupons). |
| `usage_limit_per_user` | int | Per-user limit (your filter must enforce). |
| `limit_usage_to_x_items` | int | Cap on number of items the coupon affects. |
| `usage_count` | int | Pre-existing usage count. |
| `expiry_date` | string / WC_DateTime | Expiry. |
| `email_restrictions` | array of string | Allowed billing emails. |
| `free_shipping` | bool | Grant free shipping in addition to the discount. |
| `minimum_amount` | numeric | Cart subtotal minimum. |
| `maximum_amount` | numeric | Cart subtotal maximum. |
| `description` | string | Admin-facing explanation. |

`read_manual_coupon` also tolerates legacy field names with `wc_doing_it_wrong` notices — stick to the canonical names listed above.

## Custom discount types

By default, WC ships three discount types ([wc-coupon-functions.php:23](wc-coupon-functions.php)):

```php
return apply_filters(
    'woocommerce_coupon_discount_types',
    array(
        'percent'       => __( 'Percentage discount', 'woocommerce' ),
        'fixed_cart'    => __( 'Fixed cart discount', 'woocommerce' ),
        'fixed_product' => __( 'Fixed product discount', 'woocommerce' ),
    )
);
```

Add a new type:

```php
add_filter( 'woocommerce_coupon_discount_types', static function ( array $types ): array {
    $types['buy_x_get_y'] = __( 'Buy X get Y free', 'myplugin' );
    return $types;
} );
```

A new type appears in the admin coupon dropdown AND can be used in `discount_type` of virtual coupons. But the type by itself doesn't compute anything — you also need to teach WC how to apply the discount via `woocommerce_coupon_get_discount_amount` ([class-wc-discounts.php:392](class-wc-discounts.php)):

```php
add_filter( 'woocommerce_coupon_get_discount_amount', static function (
    $discount, $price_to_discount, $cart_item, $single, WC_Coupon $coupon
) {
    if ( $coupon->get_discount_type() !== 'buy_x_get_y' ) {
        return $discount; // not our type, leave alone
    }

    // Compute and return the discount amount per item.
    // $price_to_discount is the per-item price WC is offering you to discount.
    // Return the discount amount (NOT the discounted price).
    // Example: free if cart has ≥ 3 of category X.
    if ( /* cart matches buy-X condition */ ) {
        return (float) $price_to_discount; // 100% discount for this item
    }
    return 0;
}, 10, 5 );
```

Most plugin authors stop at the standard three types — they're flexible enough. Custom types are for genuinely novel discount math (buy-one-get-one, tiered percentage, weight-based, etc.).

## Validation hooks — gate when virtual coupons apply

Three filter points control whether a coupon (virtual OR real) is valid in a given context:

```php
// Overall coupon validity (e.g. user has not yet exceeded their LOYALTY redemptions)
add_filter( 'woocommerce_coupon_is_valid', static function ( bool $valid, WC_Coupon $coupon, WC_Discounts $discounts ): bool {
    if ( ! preg_match( '/^LOYALTY-/', $coupon->get_code() ) ) {
        return $valid;
    }
    if ( ! is_user_logged_in() ) {
        throw new Exception( __( 'Loyalty codes require login.', 'myplugin' ) );
    }
    return $valid;
}, 10, 3 );

// Cart-level validity for "cart" type coupons
add_filter( 'woocommerce_coupon_is_valid_for_cart', static function ( bool $valid, WC_Coupon $coupon ): bool {
    // Custom logic: maybe the cart must include a specific category
    return $valid;
}, 10, 2 );

// Per-product validity for product-type coupons
add_filter( 'woocommerce_coupon_is_valid_for_product', static function ( bool $valid, $product, WC_Coupon $coupon, array $values ): bool {
    // Custom logic per product
    return $valid;
}, 10, 4 );
```

Throwing an `Exception` with a translated message inside `woocommerce_coupon_is_valid` is the canonical way to surface a user-facing error reason — WC catches the exception and displays the message.

## Scoping — make sure your filter is only doing what it needs

`woocommerce_get_shop_coupon_data` fires every time `new WC_Coupon( $code )` is instantiated, which can happen many times per request (every cart fetch, every checkout render, every order edit). Two rules:

1. **Always check `$data !== false` at the top.** If a previous filter already resolved this code, return `$data` immediately — don't override another plugin's resolution.
2. **Match by code prefix / pattern early.** Don't run heavy DB / API calls on every coupon constructor. The cheap regex check happens first; the expensive lookup runs only when the code matches.

```php
add_filter( 'woocommerce_get_shop_coupon_data', static function ( $data, $code ) {
    if ( $data !== false ) return $data;        // RULE 1
    if ( strpos( $code, 'LOYALTY-' ) !== 0 ) return false; // RULE 2 — fast bail
    return myplugin_resolve_loyalty_coupon( $code );
}, 10, 2 );
```

For external-API resolution (CRM lookup, partner check), cache the result per request via a static map or a transient — otherwise checkout becomes O(N) API calls.

## Critical rules

- **Return `false` from the filter when you don't want to handle the code.** WC checks `if ( $coupon )` — truthy test, not `!== false`. Any falsey value (`false`, `null`, `0`, empty `array()`) falls through to the DB lookup; a non-empty array activates the virtual path. Returning `false` is the canonical "I don't handle this code" signal because it preserves the upstream `false` default and makes precedence-chain checks (`$data !== false`) work for the next filter in line.
- **Always handle the `$data !== false` precedence chain.** Multiple plugins may filter the same hook; pass through.
- **Match the code as early and cheaply as possible.** A single regex / `strpos` check before any DB / API work.
- **Use the field-shape contract from `read_manual_coupon`** — canonical names, correct types (arrays of ints not strings, booleans not yes/no).
- **Custom discount type → also wire `woocommerce_coupon_get_discount_amount`.** Adding to the types list alone doesn't compute anything.
- **Validation throws inside `woocommerce_coupon_is_valid`** to surface user-facing reasons. Returning false silently hides the cause.
- **Virtual coupons have no `usage_limit` enforcement automatically.** WC's tracker increments the post's `_usage_count` meta — there's no post for a virtual coupon. Implement your own per-user / per-code tracking if needed (transient, custom table, external system).
- **Don't try to use `WC_Coupon::save()` on a virtual coupon.** It tries to write a `shop_coupon` post; either prevent saves or let it create a post (defeats the purpose).
- **Test BOTH the cart code-entry flow AND the order-edit "add coupon" flow.** They both go through `WC_Coupon::__construct( $code )` — your filter applies in both cases, but admin context is different.

## Common mistakes

```php
// WRONG — returning a non-false-but-empty truthy isn't possible (empty array IS falsey),
// but returning a NON-empty malformed array IS the real trap:
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    if ( $code === 'TEST' ) {
        return array( 'foo' => 'bar' ); // truthy → read_manual_coupon runs with no discount_type / amount
    }
    return $data;
}, 10, 2 );
// Result: cart applies a "coupon" with zero discount, no error surfaced. Stick to the canonical field names.

// WRONG — typehinting the second arg as string
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, string $code ) {
    // Fatal in PHP 8 when WC calls new WC_Coupon( $post_id ) with int $data
} );

// RIGHT — accept mixed, narrow with is_string() before regex / strpos
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    if ( $data !== false ) return $data;
    if ( ! is_string( $code ) ) return $data; // post-ID path
    // …
    return false; // means "I don't handle this code"
}, 10, 2 );

// WRONG — overriding earlier filter results
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    return array( 'discount_type' => 'percent', 'amount' => 10 ); // ignores $data, breaks chains
}, 10, 2 );

// RIGHT — pass through
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    if ( $data !== false ) return $data;
    if ( /* not my code */ ) return false;
    return array( /* ... */ );
}, 10, 2 );

// WRONG — heavy DB query on every coupon constructor
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    $row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM big_table WHERE code = %s", $code ) );
    if ( ! $row ) return $data;
    return array( /* ... */ );
}, 10, 2 );

// RIGHT — cheap prefix check first
add_filter( 'woocommerce_get_shop_coupon_data', function ( $data, $code ) {
    if ( $data !== false ) return $data;
    if ( strpos( $code, 'PRT-' ) !== 0 ) return false; // bail without DB call
    $row = $wpdb->get_row( /* ... */ );
    return $row ? array( /* ... */ ) : false;
}, 10, 2 );

// WRONG — registering a custom type without computing it
add_filter( 'woocommerce_coupon_discount_types', function ( $types ) {
    $types['my_special_type'] = __( 'Special', 'myplugin' );
    return $types;
} );
// Customer applies code with 'my_special_type', cart total doesn't change.
// (No woocommerce_coupon_get_discount_amount handler registered.)

// WRONG — silent failure in validation
add_filter( 'woocommerce_coupon_is_valid', function ( $valid, $coupon ) {
    if ( /* condition fails */ ) return false; // user gets generic "coupon invalid" error
}, 10, 2 );

// RIGHT — throw with a translated message
add_filter( 'woocommerce_coupon_is_valid', function ( $valid, $coupon ) {
    if ( /* condition fails */ ) {
        throw new Exception( __( 'This code requires a logged-in account.', 'myplugin' ) );
    }
    return $valid;
}, 10, 2 );

// WRONG — using yes/no strings instead of booleans
return array(
    'individual_use' => 'yes', // 🔴 read_manual_coupon expects bool, will emit doing_it_wrong
);

// RIGHT
return array(
    'individual_use' => true,
);
```

## Tracking usage for virtual coupons

`shop_coupon`-backed coupons store `_usage_count` and `_used_by` post meta automatically. Virtual coupons have no post, so usage tracking is YOUR responsibility:

```php
add_action( 'woocommerce_order_status_completed', static function ( int $order_id ): void {
    $order = wc_get_order( $order_id );
    if ( ! $order ) return;

    foreach ( $order->get_coupon_codes() as $code ) {
        if ( strpos( $code, 'LOYALTY-' ) !== 0 ) continue;

        // Increment your own counter — option, custom table, transient, or CRM.
        $key = 'myplugin_loyalty_used_' . sanitize_key( $code );
        $count = (int) get_option( $key, 0 );
        update_option( $key, $count + 1, false );
    }
} );
```

The `woocommerce_coupon_is_valid` filter then reads this counter to enforce per-code or per-user limits.

## Cross-references

- Run **`wc-payment-gateway`** when the discount logic interacts with payment authorization (e.g. partial-payment codes that require special gateway handling).
- Run **`wp-plugin-options-storage`** for the storage layer of usage tracking — counter options vs custom table decision matrix.
- Run **`wp-security-audit`** if the filter validates against external user input (referrer URL, query string, posted data) — sanitize before passing to the resolver.

## What this skill does NOT cover

- Block-based cart / checkout integration. Virtual coupons work in classic AND block checkout — both go through `WC_Cart::apply_coupon()` → `new WC_Coupon( $code )` → the filter. No block-specific work needed.
- Coupon-restriction rules ecosystem plugins (Smart Coupons, Advanced Coupons, etc.) — they use the same filter under the hood, but their UIs are outside scope.
- Bulk-generating thousands of unique codes for marketing campaigns. If you need a code-per-user with anti-replay, virtual coupons + a separate code-issuance table is the right pattern; the issuance UI is not in scope.
- WooCommerce Subscriptions renewal coupon logic — separate.
- Currency conversion / multi-currency on coupon amounts — handled at the cart total level.

## References

- The `woocommerce_get_shop_coupon_data` filter call site: [wp-content/plugins/woocommerce/includes/class-wc-coupon.php:122](class-wc-coupon.php) — verified in `WC_Coupon::__construct`.
- `read_manual_coupon` field shape contract: [wp-content/plugins/woocommerce/includes/class-wc-coupon.php:854](class-wc-coupon.php) — accepts canonical field names, normalizes legacy variants with `wc_doing_it_wrong`.
- The "virtual and not in the DB" docblock: [wp-content/plugins/woocommerce/includes/class-wc-coupon.php:467](class-wc-coupon.php).
- Discount types registration: [wp-content/plugins/woocommerce/includes/wc-coupon-functions.php:23](wc-coupon-functions.php) — `woocommerce_coupon_discount_types` filter.
- Custom discount computation: [wp-content/plugins/woocommerce/includes/class-wc-discounts.php:392](class-wc-discounts.php) — `woocommerce_coupon_get_discount_amount` filter, fired per cart item per coupon.
- Validation filters: [wp-content/plugins/woocommerce/includes/class-wc-discounts.php:1148](class-wc-discounts.php) (`woocommerce_coupon_is_valid`), [class-wc-coupon.php:983](class-wc-coupon.php) (`woocommerce_coupon_is_valid_for_cart`), [class-wc-coupon.php:1032](class-wc-coupon.php) (`woocommerce_coupon_is_valid_for_product`).
