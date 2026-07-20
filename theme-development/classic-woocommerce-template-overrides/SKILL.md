---
name: classic-woocommerce-template-overrides
description: Create or audit WooCommerce template overrides in a classic PHP theme. Covers the `yourtheme/woocommerce/` override path, `WC()->template_path()`, `wc_get_template()`, `wc_get_template_part()`, `woocommerce.php`, `single-product.php`, `archive-product.php`, taxonomy templates, `WC_TEMPLATE_DEBUG_MODE`, template `@version` headers, WooCommerce Status outdated-template checks, hook/filter-first customization, child themes, escaping, and when not to override cart/checkout/account/email templates.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "10.8.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-14"
---

# Classic WooCommerce Template Overrides

Use this when a classic theme needs to change WooCommerce markup. Prefer hooks and filters first. Use template overrides only when the required markup change cannot be done safely through hooks.

## When to Use This Skill

- Creating `yourtheme/woocommerce/*.php` files.
- Reviewing outdated Woo templates after a Woo update.
- Deciding whether to override `archive-product.php`, `content-product.php`, `single-product.php`, cart, checkout, account, or email templates.
- Debugging why a Woo template override is ignored.
- Migrating copied templates to hook/filter customizations.

## Override Lookup

Woo looks for theme overrides in the active theme using `WC()->template_path()`, which defaults to `woocommerce/`.

Typical paths:

```text
yourtheme/
|-- woocommerce/
|   |-- archive-product.php
|   |-- content-product.php
|   |-- single-product.php
|   |-- content-single-product.php
|   |-- loop/
|   |   `-- add-to-cart.php
|   `-- single-product/
|       `-- product-image.php
```

Rules:

- Copy from `wp-content/plugins/woocommerce/templates/`.
- Preserve the relative path under `woocommerce/`.
- Keep the template header and `@version` line.
- Preserve `defined( 'ABSPATH' ) || exit;`.
- Preserve core hooks unless the change explicitly replaces that behavior.

## Hook/Filter First

Most Woo frontend templates are hook skeletons. Customize with hooks before copying templates.

Example: move single product price after excerpt.

```php
add_action( 'after_setup_theme', 'mytheme_single_product_summary_order' );

function mytheme_single_product_summary_order() {
	remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 10 );
	add_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 25 );
}
```

Rules:

- Use `remove_action()` with the exact callback and priority from `wc-template-hooks.php`.
- Add custom output on Woo hooks with a prefixed function.
- Use filters such as `woocommerce_loop_add_to_cart_args`, `woocommerce_product_tabs`, or `woocommerce_output_related_products_args` when they fit.
- Do not override a whole template to change one class, priority, label, or count.

## Template Loader Files

Woo's supported classic loader can resolve:

- `woocommerce.php` as a broad catch-all.
- Page template slug for shop page templates.
- `single-product-{slug}.php`.
- Product taxonomy templates such as `taxonomy-product_cat-{slug}.php`.
- `archive-product.php`.
- `single-product.php`.
- Template-part overrides through `wc_get_template_part()`, for example `content-product.php`.

Rules:

- Avoid `woocommerce.php` for modern themes; it is broad and can hide more specific templates.
- Prefer focused overrides such as `woocommerce/content-product.php` or `woocommerce/single-product/meta.php`.
- Do not mix root-level Woo templates and `woocommerce/` overrides unless you understand loader order.
- Product taxonomy templates must preserve archive loop hooks.

## Outdated Template Discipline

Every copied Woo template is a maintenance contract.

Workflow:

1. Check WooCommerce > Status > System Status for outdated templates.
2. Compare the theme override against the same file in the installed Woo version.
3. Copy the new template from `wp-content/plugins/woocommerce/templates/`.
4. Reapply only the theme-specific changes.
5. Keep the new `@version` header.
6. Retest product types, notices, account/cart/checkout flows, and accessibility.

Rules:

- Do not silently edit the `@version` number without merging upstream changes.
- Do not delete hooks just because they appear empty; plugins depend on them.
- Do not remove `woocommerce_output_all_notices` hooks from customer-flow templates.
- Avoid overriding checkout/cart/account templates for layout-only changes.

## WC_TEMPLATE_DEBUG_MODE

`WC_TEMPLATE_DEBUG_MODE` forces Woo to ignore theme overrides and use plugin templates.

Use it to answer:

- Is a bug caused by the theme override or Woo core?
- Which custom template is responsible?
- Does the latest core template behave correctly?

Do not leave debug mode enabled in production.

## Child Themes

Child themes override Woo templates before parent themes because WordPress `locate_template()` checks the stylesheet directory first.

Rules:

- Put site-specific overrides in a child theme or customization plugin.
- Parent theme Woo overrides should be minimal and release-maintained.
- Do not edit a vendor parent theme's Woo templates directly.

## Escaping and Data Access

Rules:

- Keep Woo CRUD objects: use `$product->get_name()`, `$product->get_price_html()`, `$product->get_permalink()`, not raw postmeta.
- Preserve Woo escaping where templates intentionally output filtered HTML.
- Escape new custom output by context.
- Preserve accessibility attributes and `.screen-reader-text` spans in copied templates.
- Preserve nonce, notices, hidden inputs, and form actions in cart/checkout/account templates.

## High-Risk Overrides

Avoid or heavily review:

- `checkout/form-checkout.php`.
- `checkout/payment.php`.
- `cart/cart.php`.
- `myaccount/form-login.php`.
- `single-product/add-to-cart/variable.php`.
- `single-product/product-image.php`.
- Email templates, especially with Woo 10.x email improvements.

These templates carry payment, account, accessibility, JavaScript, or compatibility contracts.

## Review Checklist

- The theme declares Woo support.
- The override path matches Woo's `templates/` relative path.
- The override is necessary; hooks/filters were considered first.
- Template `@version` matches the installed Woo template after merging.
- Core hooks and notices are preserved.
- Forms retain hidden fields, nonces, labels, and ARIA/live regions.
- Product data comes from Woo CRUD methods.
- Child-theme behavior is understood.
- `WC_TEMPLATE_DEBUG_MODE` has been used to isolate override bugs when needed.

## Common Mistakes

- Copying all Woo templates into a theme "just in case".
- Editing `@version` to silence the status warning without merging upstream.
- Removing hooks that plugins use.
- Overriding `woocommerce.php` and accidentally flattening product/archive differences.
- Breaking variation add-to-cart JavaScript by rewriting `variable.php`.
- Losing accessible labels/live regions from modern Woo templates.

## References

- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/template-structure/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/fixing-outdated-woocommerce-templates/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/classic-theme-developer-handbook/>
- Official documentation: <https://developer.woocommerce.com/docs/theming/theme-development/set-up-a-child-theme/>
- Verified source paths:
  - `wp-content/plugins/woocommerce/includes/class-wc-template-loader.php`
  - `wp-content/plugins/woocommerce/includes/wc-core-functions.php`
  - `wp-content/plugins/woocommerce/includes/wc-template-hooks.php`
  - `wp-content/plugins/woocommerce/templates/archive-product.php`
  - `wp-content/plugins/woocommerce/templates/content-product.php`
  - `wp-content/plugins/woocommerce/templates/content-single-product.php`
  - `wp-content/plugins/woocommerce/templates/single-product.php`
  - `wp-content/plugins/woocommerce/includes/rest-api/Controllers/Version2/class-wc-rest-system-status-v2-controller.php`
