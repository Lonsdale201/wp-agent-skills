---
name: wc-admin-inline-scripts
description: WooCommerce admin inline JavaScript and script-data migration
  guide for replacing deprecated wc_enqueue_js with wp_add_inline_script,
  registering/enqueueing handles on the right admin screen, preserving
  jQuery-ready behavior, passing PHP data safely with wp_json_encode, and
  avoiding footer-global queued JS. Use when code contains wc_enqueue_js,
  wc_print_js, woocommerce_queued_js, admin_footer inline JavaScript,
  wp_add_inline_script in WooCommerce admin screens, or small Woo settings
  modal/product/order admin script glue.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
source-refs:
  - wp-content/plugins/woocommerce/includes/wc-core-functions.php
  - wp-content/plugins/woocommerce/includes/wc-template-hooks.php
  - wp-content/plugins/woocommerce/includes/admin/class-wc-admin.php
  - wp-content/plugins/woocommerce/includes/admin/class-wc-admin-assets.php
  - wp-includes/functions.wp-scripts.php
  - wp-includes/class-wp-scripts.php
---

# WooCommerce: admin inline scripts

Use this when adding or reviewing small JavaScript glue in WooCommerce admin screens, settings pages, shipping modals, product edit screens, or order admin UI.

## Misconception this skill corrects

> "WooCommerce has `wc_enqueue_js()`, so use that for admin inline JS."

Do not use it. In WooCommerce 10.9.4 the function still exists, but it is deprecated since 10.4.0 with the replacement `wp_add_inline_script()`. It appends code to a global queue printed by `wc_print_js()` on `wp_footer` and `admin_footer`, wrapped in `jQuery(function($) { ... })`. That global footer queue is hard to scope, hard to dequeue, and not tied to a real script handle.

## When to use this skill

Trigger when ANY of the following is true:

- Code contains `wc_enqueue_js()`, `wc_print_js()`, or `woocommerce_queued_js`.
- Code echoes `<script>` tags from WooCommerce admin PHP callbacks.
- A Woo settings field, shipping method modal, product data tab, order screen, or custom Woo admin page needs a small script or PHP-to-JS data.
- You need to attach inline data to Woo admin handles such as `woocommerce_admin`, `wc-enhanced-select`, `wc-shipping-zones`, or a plugin-owned admin script.

## The rule

Use a registered/enqueued script handle and attach inline code to that handle:

```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'woocommerce_page_wc-settings' !== $hook_suffix ) {
        return;
    }

    $tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : '';

    if ( 'shipping' !== $tab ) {
        return;
    }

    wp_enqueue_script(
        'myplugin-wc-admin',
        plugins_url( 'assets/admin.js', __FILE__ ),
        array( 'jquery', 'woocommerce_admin' ),
        '1.0.0',
        array( 'in_footer' => true )
    );

    $settings = array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'myplugin_wc_admin' ),
    );

    wp_add_inline_script(
        'myplugin-wc-admin',
        'window.mypluginWcAdmin = ' . wp_json_encode( $settings ) . ';',
        'before'
    );
} );
```

Prefer a real JS file for behavior and `wp_add_inline_script( $handle, ... , 'before' )` for boot data. Use an inline-only handle only for tiny legacy glue:

```php
add_action( 'admin_enqueue_scripts', static function (): void {
    wp_register_script(
        'myplugin-wc-inline',
        false,
        array( 'jquery' ),
        '1.0.0',
        array( 'in_footer' => true )
    );

    wp_enqueue_script( 'myplugin-wc-inline' );

    wp_add_inline_script(
        'myplugin-wc-inline',
        "jQuery(function($){ $('.myplugin-field').trigger('change'); });",
        'after'
    );
} );
```

## Migration from `wc_enqueue_js()`

Old WooCommerce queued JS was automatically wrapped in jQuery-ready scope. `wp_add_inline_script()` does not add that wrapper. If the old code used `$` or expected the DOM to be ready, wrap it yourself:

```php
// WRONG: deprecated and global.
wc_enqueue_js( "$('.my-field').show();" );

// RIGHT: scoped to a handle and explicit about DOM-ready behavior.
wp_add_inline_script(
    'myplugin-wc-admin',
    "jQuery(function($){ $('.my-field').show(); });",
    'after'
);
```

If the script only passes data, do not use `jQuery(function($){ ... })`; attach a JSON-encoded object before the file:

```php
wp_add_inline_script(
    'myplugin-wc-admin',
    'window.mypluginWcAdmin = ' . wp_json_encode( $settings ) . ';',
    'before'
);
```

## Woo admin handles

Common handles from WooCommerce 10.9.4:

| Screen need | Existing handle |
|---|---|
| General Woo admin UI helpers | `woocommerce_admin` |
| Woo AJAX product/search selects | `wc-enhanced-select` |
| Shipping zones list | `wc-shipping-zones` |
| Shipping zone methods screen | `wc-shipping-zone-methods` |
| Shipping classes | `wc-shipping-classes` |

Attach behavior to your own handle unless you are only adding small configuration required before an existing Woo script runs. For custom admin pages outside Woo screens, enqueue the Woo handle you depend on explicitly.

## Guardrails

- Gate enqueues by `$hook_suffix`, screen, post type, or Woo settings tab. Do not load Woo admin glue across all admin pages.
- Do not pass `<script>` tags to `wp_add_inline_script()`; WordPress strips them and triggers doing-it-wrong.
- Do not string-concatenate untrusted PHP values into JavaScript. Use `wp_json_encode()`.
- Do not put CSS in inline JavaScript. Use `wp_add_inline_style()` against an enqueued style handle.
- Do not rely on `woocommerce_queued_js` to modify other plugins' inline JS. Prefer your own handle and event-based integration.

## Common mistakes

```php
// WRONG: admin footer echo bypasses dependencies, translations, nonces, and screen scoping.
add_action( 'admin_footer', static function (): void {
    echo '<script>window.myplugin = "' . esc_js( $_GET['x'] ?? '' ) . '";</script>';
} );

// RIGHT: enqueue on the target screen and JSON-encode data.
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'woocommerce_page_wc-settings' !== $hook_suffix ) {
        return;
    }

    wp_register_script( 'myplugin-wc-admin', false, array(), '1.0.0', array( 'in_footer' => true ) );
    wp_enqueue_script( 'myplugin-wc-admin' );

    wp_add_inline_script(
        'myplugin-wc-admin',
        'window.myplugin = ' . wp_json_encode( array( 'x' => sanitize_text_field( wp_unslash( $_GET['x'] ?? '' ) ) ) ) . ';',
        'before'
    );
} );
```

## Cross-references

- Use `wc-product-search-select` when the inline/admin script initializes Woo product search selects.
- Use `wc-shipping-method` when the JavaScript is supporting a custom shipping method settings UI.
- Use `wp-admin-form-controls` for generic WordPress admin controls such as datepicker, color picker, autocomplete, and pointers.
