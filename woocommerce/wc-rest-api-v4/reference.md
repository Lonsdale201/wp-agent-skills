# WooCommerce REST API v4 reference

Source-verified against WooCommerce 10.9.4. These are latent core controller routes: the 10.9.4 release build disables `rest-api-v4`, so they are absent unless the build feature is altered. Methods can be narrowed by permissions; use exact runtime route discovery and authenticated `OPTIONS` when available.

## Route catalog

| Resource | Route |
|---|---|
| Customers | `/wc/v4/customers`, `/wc/v4/customers/<id>` |
| Orders | `/wc/v4/orders`, `/wc/v4/orders/<id>` |
| Order notes | `/wc/v4/order-notes?order_id=<id>`, `/wc/v4/order-notes/<note_id>` |
| Refunds | `/wc/v4/refunds?order_id=<id>`, `/wc/v4/refunds/<refund_id>` |
| Products | `/wc/v4/products`, `/wc/v4/products/<id>`, `/wc/v4/products/batch` |
| Suggested products | `/wc/v4/products/suggested-products` |
| Related products | `/wc/v4/products/<id>/related` |
| Duplicate product | `POST /wc/v4/products/<id>/duplicate` |
| Shipping zones | `/wc/v4/shipping-zones`, `/wc/v4/shipping-zones/<id>` |
| Add zone method | `POST /wc/v4/shipping-zone-method` |
| Zone method item | `/wc/v4/shipping-zone-method/<instance_id>` |
| Fulfillments | `/wc/v4/fulfillments?order_id=<id>`, `/wc/v4/fulfillments/<id>` |
| Fulfillment providers | `/wc/v4/fulfillments/providers` |
| General settings | `/wc/v4/settings/general` |
| Account settings | `/wc/v4/settings/account` |
| Tax settings | `/wc/v4/settings/tax` |
| Email settings | `/wc/v4/settings/email` |
| Email collection/item | `/wc/v4/settings/emails`, `/wc/v4/settings/emails/<email_id>` |
| Payment gateway item | `/wc/v4/settings/payment-gateways/<gateway_id>` |
| Offline payment methods | `/wc/v4/settings/payments/offline-methods` |
| Product settings | `/wc/v4/settings/products` |
| Generic settings wrapper | `/wc/v4/settings/<group_id>`, `/wc/v4/settings/<group_id>/<id>`, `/wc/v4/settings/<group_id>/batch` |

## Deliberate absences

These common v3 surfaces are not v4 routes in WooCommerce 10.9.4:

- Product categories/tags/attributes and product variations.
- Coupons, taxes, shipping classes, reports, and system status.
- A payment-gateway settings collection route.
- Nested order notes/refunds/fulfillments under `/orders/<id>`.

Use `wc/v3` where it owns the resource.

## Hook prefix examples

The controller transforms hyphens, but not slashes:

```text
orders
woocommerce_rest_api_v4_orders_

shipping-zone-method
woocommerce_rest_api_v4_shipping_zone_method_

settings/emails
woocommerce_rest_api_v4_settings/emails_

settings/payment-gateways
woocommerce_rest_api_v4_settings/payment_gateways_
```

Append `collection_params`, `item_schema`, or `item_response` only when the concrete controller passes through the matching abstract method.

## Cache status

The v4 products controller wraps `get_suggested_products()` with `RestApiCache::with_cache()`. The feature can emit Woo cache status headers when enabled, but no code should assume a particular header or cache backend is present. Other v4 controllers in 10.9.4 do not call `with_cache()`.
