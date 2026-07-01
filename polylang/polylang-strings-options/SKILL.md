---
name: polylang-strings-options
description: "Register and translate plugin/theme strings and option values with Polylang 3.8.5. Covers pll_register_string admin-only behavior, pll__, pll_e, pll_esc_html__, pll_esc_attr__, pll_translate_string, string context/name strategy, multiline strings, pll_sanitize_string_translation with the 3.8 previous-value argument, PLL_Translate_Option recursive option keys, raw option protection, and why dynamic/generated strings should not be registered as source strings. Use when a plugin stores labels, email copy, settings text, widget copy, or frontend options that site admins must translate in Polylang."
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: polylang
plugin-version-tested: "Polylang 3.8.5"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-07-01"
docs:
  - https://polylang.pro/doc/function-reference/
  - https://polylang.pro/doc/strings-translation/
source-refs:
  - wp-content/plugins/polylang/src/api.php
  - wp-content/plugins/polylang/src/admin/admin-strings.php
  - wp-content/plugins/polylang/src/settings/table-string.php
  - wp-content/plugins/polylang/src/translate-option.php
  - wp-content/plugins/polylang/src/base.php
  - wp-content/plugins/polylang-wc/src/strings.php
---

# Polylang Strings and Options

Use this skill when a plugin or classic theme has administrator-configured copy that should be translated through Polylang's Languages > Translations screen.

Do not confuse three layers:

| Need | Use |
|---|---|
| Static developer strings in PHP | WordPress i18n: `__()`, `_x()`, etc. |
| Admin-configured single strings | `pll_register_string()` plus `pll__()` / `pll_translate_string()` |
| Admin-configured option arrays | `PLL_Translate_Option` |

## Guard and register strings

`pll_register_string()` exists in the public API, but the implementation only registers when `PLL()` is an admin object:

```php
function myplugin_register_polylang_strings(): void {
    if ( ! function_exists( 'pll_register_string' ) ) {
        return;
    }

    pll_register_string(
        'myplugin_checkout_heading',
        get_option( 'myplugin_checkout_heading', 'Complete your booking' ),
        'My Plugin',
        false
    );
}
add_action( 'admin_init', 'myplugin_register_polylang_strings' );
```

Register in admin/settings context, not only on the frontend. If you call `pll_register_string()` only during frontend rendering, the string will not be added to the strings table.

Parameters:

```php
pll_register_string( $name, $string, $context = 'Polylang', $multiline = false );
```

- `$name` is a stable internal label, not necessarily the displayed string.
- `$string` is the original source text.
- `$context` is the group shown in the strings table.
- `$multiline` controls textarea vs single-line input.

Polylang de-duplicates registered strings by `md5( $string )` internally. If two different options use the same source text, the translation is shared.

## Output translated strings

For the current language:

```php
$heading = get_option( 'myplugin_checkout_heading', '' );

if ( function_exists( 'pll__' ) ) {
    $heading = pll__( $heading );
}

echo esc_html( $heading );
```

Prefer the escaped helpers where possible:

```php
echo function_exists( 'pll_esc_html__' )
    ? pll_esc_html__( $heading )
    : esc_html( $heading );

printf(
    '<input placeholder="%s">',
    function_exists( 'pll_esc_attr__' ) ? pll_esc_attr__( $heading ) : esc_attr( $heading )
);
```

`pll_e()` is intentionally unescaped, like WordPress `_e()`. Do not use it for arbitrary option text unless you have already sanitized and intentionally allow HTML.

For a specific language that is not the current request language:

```php
$subject = function_exists( 'pll_translate_string' )
    ? pll_translate_string( $subject, $recipient_lang )
    : $subject;
```

This is useful for emails, exports, background jobs, and REST responses built for a known target language.

## Sanitize translations

Polylang runs `pll_sanitize_string_translation` before saving string translations. In 3.8.5 the filter receives five values:

```php
add_filter(
    'pll_sanitize_string_translation',
    static function ( $translation, $name, $context, $original, $previous ) {
        if ( 'My Plugin' !== $context ) {
            return $translation;
        }

        if ( 'myplugin_checkout_heading' === $name ) {
            return sanitize_text_field( $translation );
        }

        return wp_kses_post( $translation );
    },
    10,
    5
);
```

The `$previous` argument was added in Polylang 3.8 and is used by Polylang core to avoid breaking strings when the trimmed previous value matches the submitted translation.

## Translate option arrays

For structured options, use `PLL_Translate_Option`. It registers selected option values as strings, translates them when `get_option()` is called, protects raw option reads during updates, and can sanitize translated values.

Instantiate after Polylang is loaded on every request where translated reads are needed. The constructor also adds the runtime `option_{$name}` filter, so admin-only instantiation registers strings but leaves frontend and REST `get_option()` calls untranslated.

```php
add_action( 'init', static function (): void {
    if ( ! class_exists( 'PLL_Translate_Option' ) ) {
        return;
    }

    new PLL_Translate_Option(
        'myplugin_settings',
        array(
            'checkout_heading' => 1,
            'email'            => array(
                'subject' => 1,
                'body'    => 1,
            ),
        ),
        array(
            'context'           => 'My Plugin',
            'sanitize_callback' => static function ( $value, $name, $context, $original ) {
                return 'body' === $name ? wp_kses_post( $value ) : sanitize_text_field( $value );
            },
        )
    );
} );
```

Use a later plugin-specific hook when the option owner initializes later. Polylang for WooCommerce uses `woocommerce_init` for some Woo settings. Keep the same key map active in admin, frontend, and REST so registration and runtime filtering match.

Only keys are interpreted. Values in the key map can be any scalar. Nested arrays are supported.

Wildcards are supported through Polylang's format matcher:

```php
new PLL_Translate_Option(
    'myplugin_locations',
    array(
        '*' => array(
            'name'    => 1,
            'details' => 1,
        ),
    ),
    array( 'context' => 'My Plugin' )
);
```

Polylang for WooCommerce uses this pattern for pickup locations, shipping methods, and checkout-block payment settings.

## Raw vs translated options

After `PLL_Translate_Option` is active, `get_option( 'myplugin_settings' )` can return translated values for the current language. That is usually what templates need.

For settings persistence, migrations, diffing, or checksum logic, avoid accidentally comparing translated output. Either run your write logic before the translation filter is registered, or store canonical values from your settings form and let `PLL_Translate_Option` manage translation preservation.

Do not save translated frontend output back into the canonical option. The class explicitly protects against this during `pre_update_option_*`, but your own code can still cause drift if it mixes read and write phases.

## What not to register

Do not register:

- nonces, tokens, IDs, SKUs, hashes, license keys;
- strings that change per user or per request;
- already translated WordPress gettext strings;
- huge HTML pages or generated templates as one source string;
- JSON blobs that frontend code parses.

Register stable human-authored source text.

## Emails and background jobs

For recipient-language emails, do not rely on the current frontend language. Resolve the recipient language from user/order/subscription data, then call `pll_translate_string( $string, $lang )`.

```php
$body = get_option( 'myplugin_email_body', '' );

if ( function_exists( 'pll_translate_string' ) ) {
    $body = pll_translate_string( $body, $recipient_lang );
}

wp_mail( $email, $subject, wp_kses_post( $body ) );
```

## Common mistakes

- Registering strings only on frontend pages.
- Using `pll_e()` for untrusted option HTML.
- Creating one string name but changing its source text every request.
- Instantiating `PLL_Translate_Option` only on `admin_init` and expecting frontend or REST `get_option()` calls to be translated.
- Translating a stored option and then saving that translated value back as canonical.
- Forgetting the fifth `$previous` argument on `pll_sanitize_string_translation` callbacks.
- Expecting `pll_register_string()` to create translations immediately. It only registers the source string for admin translation.

## Cross-references

- Use `polylang-language-api` for current/default language detection.
- Use `polylang-rest-headless` for REST output language behavior.
- Use `polylang-wc-compatibility` for WooCommerce settings, shipping, gateway, and email strings.

## Verification

Local source checked against:

- Public string functions: `wp-content/plugins/polylang/src/api.php`
- Admin string registry: `src/admin/admin-strings.php`
- Save sanitization and 3.8 previous-value argument: `src/settings/table-string.php`
- Recursive option translation: `src/translate-option.php`
- Woo option usage examples: `wp-content/plugins/polylang-wc/src/strings.php`
