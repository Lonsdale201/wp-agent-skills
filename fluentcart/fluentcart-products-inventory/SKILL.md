---
name: fluentcart-products-inventory
description: >-
  Implements and audits FluentCart products, details, variations, pricing,
  custom attributes, taxonomies, downloadable flags, bundles, and stock
  movements. Use when creating or updating fluent-products records, calling
  ProductResource or ProductVariationResource, adding variation types, syncing
  product-categories or product-brands, reacting to product_updated,
  product_variations_changed, product_stock_changed, or preventing direct
  fct_product_* writes from desynchronizing inventory.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart products and inventory

Maintain the whole product aggregate: WordPress post, product detail, variants,
attribute relations, media/download data, tax/shipping configuration, and stock.

Read [product-contract.md](references/product-contract.md) before implementing a
writer, importer, bundle, custom variation type, or inventory sync.

## Understand the aggregate

- Product is a model over wp_posts and is globally scoped to post type
  fluent-products.
- ProductDetail and ProductVariation live in fct_product_details and
  fct_product_variations.
- Categories and brands are WP taxonomies product-categories and
  product-brands.
- Variant attributes use FluentCart's fct_attribute_* tables. Do not model them
  as WordPress terms.
- A variation ID is the purchasable object_id used by cart/order items. Do not
  substitute the parent product ID.
- Prices remain minor-unit values even though variation price columns and ORM
  casts are double.

## Write through coordinated APIs

Prefer ProductResource and ProductVariationResource for product-editor-like
mutations. Use Taxonomy for FluentCart taxonomy synchronization. Use native
WordPress post functions only when the change truly affects only post fields.

Do not create a complete product with wp_insert_post() alone. It leaves detail,
variation, pricing, and relationship rows absent. Do not update stock columns
independently; available, on_hold, committed, total_stock, stock_status, and the
product-level stock availability must stay coherent.

For batch import:

1. Normalize all amounts to integer minor units.
2. Create or map product posts.
3. create details and variants through Resource/service code;
4. map custom attributes separately from WP taxonomies;
5. attach downloads/media;
6. validate SKU uniqueness and purchasability;
7. dispatch or reproduce the normal product/variation change path;
8. verify counts and orphan rows after the batch.

## Observe the right event

| Need | Hook/event |
|---|---|
| General product save | fluent_cart/product_updated |
| Product editor variant save | fluent_cart/product/variants_updated |
| Variant set changed and default may be invalid | fluent_cart/product_variations_changed |
| Stock changed | fluent_cart/product_stock_changed |
| Extend supported variation types | fluent_cart/variation_types |
| Adjust data accepted during variant save | fluent_cart/product/variant_save_data |

Do not use a display/render hook as a durable catalog event. Scope callbacks by
post ID and make external synchronization replay-safe.

## Inventory rules

- Check ProductVariation::canPurchase() or the normal cart validation path
  before accepting a quantity.
- Honor sold_individually, manage_stock, backorders, item_status, parent publish
  status, and bundle-child availability.
- Let StockManagement react to order lifecycle events. It moves units between
  available, on_hold, and committed and records order meta stock_movement.
- Do not reduce stock again on order_paid if order_created already reserved it.
- Test status reversals, refunds, canceled/failed orders, physical delivery,
  digital orders, bundles, and repeated events.
- Feature-detect the stock_management module; its advanced behavior can be off.

## Query efficiently

- Eager-load detail and variants when rendering lists.
- Query product posts through Product/ProductResource, not WP_Query plus one
  custom query per row.
- Avoid hydrating every variant for ID/count-only jobs.
- Bound batch size and advance by a stable numeric ID for long-running work.
- Keep test/live reporting filters when product statistics join orders.

## Free/Pro boundary

The product, variant, custom attribute, stock, download, and recurring-plan base
models are Free in 1.6.0. Pro adds installments and promotional/order-bump
features; do not make all subscription-priced products or all promotions
Pro-only.

## Cross-references

- Use fluentcart-cart-checkout for purchasability and custom cart items.
- Use fluentcart-downloads-storage for downloadable files.
- Use fluentcart-shipping-tax for class and tax behavior.

## References

- Official model documentation: <https://dev.fluentcart.com/database/models/>
- Verified Free source paths:
  - fluent-cart/app/CPT/FluentProducts.php
  - fluent-cart/app/Models/Product.php
  - fluent-cart/app/Models/ProductDetail.php
  - fluent-cart/app/Models/ProductVariation.php
  - fluent-cart/api/Resource/ProductResource.php
  - fluent-cart/api/Resource/ProductVariationResource.php
  - fluent-cart/api/Taxonomy.php
  - fluent-cart/app/Modules/StockManagement/StockManagement.php
  - fluent-cart/app/Events/ProductVariationsChanged.php
  - fluent-cart/app/Events/StockChanged.php
