---
name: wc-cart-checkout-classic
description: Customize the classic WooCommerce cart and shortcode checkout with `woocommerce_add_cart_item_data`, `woocommerce_get_item_data`, `woocommerce_before_calculate_totals`, `woocommerce_cart_calculate_fees`, `woocommerce_checkout_fields`, `woocommerce_after_checkout_validation`, `woocommerce_checkout_create_order`, and `woocommerce_checkout_create_order_line_item`. Covers cart-key merging, stable meta keys, absolute price mutation, fees, classic checkout fields, HPOS-safe order saves, and the Checkout Block / Store API boundary. Use when adding product options, custom cart data, fees, classic checkout fields, validation, or debugging missing or duplicated cart/order item data.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/tutorial-customising-checkout-fields-using-actions-and-filters/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-cart.php
  - wp-content/plugins/woocommerce/includes/class-wc-checkout.php
  - wp-content/plugins/woocommerce/includes/class-wc-form-handler.php
  - wp-content/plugins/woocommerce/includes/wc-template-functions.php
  - wp-content/plugins/woocommerce/src/StoreApi/Utilities/CartController.php
---

# WooCommerce classic cart and checkout

Use this for the PHP/classic cart and shortcode checkout flow. It covers product add-to-cart customization, cart item data, calculated prices/fees, checkout fields, checkout validation, and copying cart data to orders.

It is not a Checkout Block UI skill. Some low-level cart hooks also run during Store API requests, but `woocommerce_checkout_fields` does not make fields appear in the Checkout Block. For block/headless cart state, use `wc-store-api`.

## Misconception this skill corrects

> "I added custom cart item data, so WooCommerce will automatically show it on the order."

Cart item data affects the cart key and lives in the cart/session. It is not automatically saved as order line-item meta. Display it with `woocommerce_get_item_data`, and copy it to the order line with `woocommerce_checkout_create_order_line_item`.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a product option from an add-to-cart form.
- Storing custom data on a cart item.
- Showing custom data in cart/checkout/order line items.
- Changing cart item price dynamically.
- Adding a handling, insurance, gift-wrap, or payment-related fee.
- Adding fields to classic checkout.
- Validating checkout data server-side.
- The diff contains `woocommerce_add_cart_item_data`, `woocommerce_get_item_data`, `woocommerce_before_calculate_totals`, `woocommerce_cart_calculate_fees`, `woocommerce_checkout_fields`, `woocommerce_after_checkout_validation`, or `woocommerce_checkout_create_order_line_item`.

## Cart item identity

`WC_Cart::add_to_cart()` applies `woocommerce_add_cart_item_data` before generating the cart ID. `WC_Cart::generate_cart_id()` includes product ID, variation ID, variation attributes, and every value in `$cart_item_data`.

That means:

- If two cart additions have the same product, variation, and cart item data, Woo merges quantities into one cart line.
- If cart item data differs, Woo creates a different cart line.
- Do not add a random unique value unless you intentionally want every add-to-cart click to be a separate line.

```php
add_filter(
    'woocommerce_add_cart_item_data',
    static function ( array $cart_item_data, int $product_id, int $variation_id, int $quantity ): array {
        if ( empty( $_POST['myplugin_engraving'] ) ) {
            return $cart_item_data;
        }

        $engraving = sanitize_text_field( wp_unslash( $_POST['myplugin_engraving'] ) );
        if ( '' === $engraving ) {
            return $cart_item_data;
        }

        $cart_item_data['myplugin_engraving'] = $engraving;

        // Only add this if identical configured items must never merge:
        // $cart_item_data['myplugin_line_uid'] = wp_generate_uuid4();

        return $cart_item_data;
    },
    10,
    4
);
```

The classic add-to-cart form path also applies `woocommerce_add_to_cart_validation`. Use it to reject invalid posted product options before the cart line is created.

## Display cart item data

`woocommerce_get_item_data` feeds `wc_get_formatted_cart_item_data()`, which is used by cart and checkout templates.

```php
add_filter(
    'woocommerce_get_item_data',
    static function ( array $item_data, array $cart_item ): array {
        if ( empty( $cart_item['myplugin_engraving'] ) ) {
            return $item_data;
        }

        $item_data[] = array(
            'name'  => __( 'Engraving', 'myplugin' ),
            'value' => esc_html( $cart_item['myplugin_engraving'] ),
        );

        return $item_data;
    },
    10,
    2
);
```

This is display only. It does not persist to the order.

## Copy cart data to order lines

Use `woocommerce_checkout_create_order_line_item` for per-item meta. Do not put line-item data into `woocommerce_checkout_update_order_meta`; that hook is order-level.

```php
add_action(
    'woocommerce_checkout_create_order_line_item',
    static function ( WC_Order_Item_Product $item, string $cart_item_key, array $values, WC_Order $order ): void {
        if ( empty( $values['myplugin_engraving'] ) ) {
            return;
        }

        $item->add_meta_data( 'myplugin_engraving', sanitize_text_field( $values['myplugin_engraving'] ), true );
    },
    10,
    4
);
```

Never translate a stored meta key: the key would change with the checkout locale. Keep a stable private key and deliberately expose a translated label where needed:

```php
add_filter( 'woocommerce_order_item_display_meta_key', static function ( string $label, WC_Meta_Data $meta ): string {
    return 'myplugin_engraving' === $meta->key ? __( 'Engraving', 'myplugin' ) : $label;
}, 10, 2 );
```

Keys beginning with `_` are omitted by storefront/e-mail formatted item meta. Use an underscore-prefixed key such as `_myplugin_config` only for machine data that should remain hidden; otherwise use a stable namespaced visible key and translate its display label as above.

## Dynamic cart item prices

`woocommerce_before_calculate_totals` runs whenever Woo recalculates totals. Set an absolute price every time; do not add to the current price repeatedly.

Store the base value when the cart item is created:

```php
add_filter(
    'woocommerce_add_cart_item_data',
    static function ( array $cart_item_data, int $product_id, int $variation_id ): array {
        $product = wc_get_product( $variation_id ?: $product_id );
        if ( $product instanceof WC_Product ) {
            // Choose the canonical base deliberately. View context includes active
            // runtime price filters; edit context means the stored raw value.
            $cart_item_data['myplugin_base_price'] = (float) $product->get_price();
        }
        return $cart_item_data;
    },
    20,
    3
);
```

Then set the calculated price:

```php
add_action(
    'woocommerce_before_calculate_totals',
    static function ( WC_Cart $cart ): void {
        if ( is_admin() && ! wp_doing_ajax() ) {
            return;
        }

        foreach ( $cart->get_cart() as $cart_item ) {
            if ( empty( $cart_item['myplugin_engraving'] ) || ! isset( $cart_item['myplugin_base_price'] ) ) {
                continue;
            }

            $cart_item['data']->set_price( (float) $cart_item['myplugin_base_price'] + 5.00 );
        }
    },
    20
);
```

Do not call `update_post_meta()` or product setters that save the product here. The product object in the cart line is a runtime object; the catalog product price should not be changed.

## Fees

Use `woocommerce_cart_calculate_fees` for cart-level fees. Do not add fees in `woocommerce_before_calculate_totals`.

```php
add_action(
    'woocommerce_cart_calculate_fees',
    static function ( WC_Cart $cart ): void {
        if ( is_admin() && ! wp_doing_ajax() ) {
            return;
        }

        if ( $cart->is_empty() ) {
            return;
        }

        $cart->add_fee( __( 'Handling', 'myplugin' ), 5.00, true, '' );
    }
);
```

Fees become `WC_Order_Item_Fee` items during checkout. They are not product line items.

Do not use a negative fee as a discount. It creates confusing tax/refund/accounting behavior; use a WooCommerce coupon or a purpose-built discount calculation.

## Classic checkout fields

`woocommerce_checkout_fields` modifies the field arrays for classic checkout sections: `billing`, `shipping`, `account`, and `order`.

```php
add_filter(
    'woocommerce_checkout_fields',
    static function ( array $fields ): array {
        $fields['billing']['billing_vat_id'] = array(
            'type'        => 'text',
            'label'       => __( 'VAT ID', 'myplugin' ),
            'required'    => false,
            'priority'    => 120,
            'autocomplete'=> 'off',
        );

        return $fields;
    }
);

add_action(
    'woocommerce_after_checkout_validation',
    static function ( array $data, WP_Error $errors ): void {
        if ( empty( $data['billing_vat_id'] ) ) {
            return;
        }

        if ( ! preg_match( '/^[A-Z0-9 -]{4,32}$/i', (string) $data['billing_vat_id'] ) ) {
            $errors->add( 'billing_vat_id', __( 'Enter a valid VAT ID.', 'myplugin' ) );
        }
    },
    10,
    2
);

add_action(
    'woocommerce_checkout_create_order',
    static function ( WC_Order $order, array $data ): void {
        if ( empty( $data['billing_vat_id'] ) ) {
            return;
        }

        $order->update_meta_data( '_billing_vat_id', sanitize_text_field( $data['billing_vat_id'] ) );
    },
    10,
    2
);
```

`woocommerce_checkout_create_order` runs before the checkout's first order save, so no reload or extra write is needed. The older `woocommerce_checkout_update_order_meta` hook receives an already-created order ID and costs an additional CRUD save.

Use Woo order APIs for HPOS compatibility. Never write checkout order data with `update_post_meta( $order_id, ... )`.

## Common mistakes

- Adding random cart item data unintentionally prevents quantity merging.
- Changing `$product->set_price( $product->get_price() + 5 )` in every totals calculation compounds the price.
- Saving product objects from cart hooks changes catalog data.
- Adding fees from `woocommerce_before_calculate_totals` instead of `woocommerce_cart_calculate_fees`.
- Expecting `woocommerce_checkout_fields` to render in Checkout Block.
- Saving line-item data in order meta instead of `woocommerce_checkout_create_order_line_item`.
- Trusting posted product/checkout fields without sanitizing and validating.
- Using `$_SESSION`; use `WC()->session` for cart/session state.

## Cross-skill routing

- Checkout Block, Store API cart, headless checkout: `wc-store-api`
- HPOS order storage concerns: `wc-hpos-compatibility`
- Customer/session persistence: `wc-customer-and-sessions`
- Payment gateway checkout processing: `wc-payment-gateway`
