# FluentCart 1.6.0 checkout contract

## Normal flow

~~~text
cart mutation / checkout data patch
  -> cart item/coupon/shipping/tax recalculation
  -> place-order rate limit
  -> cart-hash MySQL lock
  -> load or create draft order
  -> server validation and address/customer normalization
  -> order/items/transaction/subscription persistence
  -> OrderCreated event and stock reservation
  -> PaymentInstance
  -> selected gateway
  -> provider redirect/client confirmation or settled response
~~~

CheckoutController applies a 5-attempt/60-second place_order_attempt limiter.
CheckoutApi also locks by the cart hash. These controls do not replace gateway
idempotency, webhook deduplication, or addon-specific abuse limits.

## Cart storage

fct_carts stores cart_data, checkout_data, coupons, UTM data, customer/user
links, order_id, stage, group, and cart_hash. The cookie is fct_cart_hash with
SameSite=Lax. Its value is intentionally accessible to frontend JavaScript and
must not be treated as authentication.

## Key extension surfaces

| Need | Surface |
|---|---|
| Reject before processing | fluent_cart/checkout/validate_before_process |
| Add normalized field errors | fluent_cart/checkout/validate_data |
| Change patch data | fluent_cart/checkout/before_patch_checkout_data |
| Add fees | Cart::addFee and fluent_cart/cart/fees |
| Validate custom instant item | fluent_cart/cart/validate_custom_item |
| Resolve non-database item during update | fluent_cart/cart_item_product_variation |
| Observe cart item changes | fluent_cart/cart/cart_data_items_updated |
| Modify rendered checkout | fluent_cart/views/checkout_page_* hooks |

Rendering hooks do not change the durable calculation contract.

## Retry and idempotency

- The lock prevents concurrent creation/charge for the same cart.
- Existing draft order/transaction data can be reused across retries.
- A server-side gateway creation WP_Error changes a pending transaction to
  failed so the next attempt receives a new payment attempt/idempotency seed.
- Client-side provider declines can follow a different retry path.
- Addon validation filters can run repeatedly and must be side-effect free.

## Custom item checklist

Return server-owned values for object_id, post_id or owning object, title,
quantity rules, payment_type, fulfillment_type, item_price, compare price,
tax/shipping/download flags, recurring metadata, and any merge discriminator
required by the use case. Validate every value against the current customer and
store mode.
