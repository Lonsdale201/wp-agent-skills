---
name: translatepress-email-notification-compatibility
description: Audit or implement TranslatePress-compatible WordPress plugin emails, WooCommerce emails, transactional notifications, cron/CLI emails, wp_mail usage, preferred-user-language delivery, trp_translate(), trp_switch_language(), trp_language user/order meta, and email gettext scanning. Use when code sends registration, order, membership, LMS, subscription, invoice, reminder, status, or admin-triggered emails that must arrive in the recipient's language.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "translatepress-multilingual"
  wp-skills-plugin-version-tested: "TranslatePress Multilingual 3.2.1 + Business 1.8.2"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-17"
---

# TranslatePress Email And Notification Compatibility

TranslatePress can translate `wp_mail()` subject/body, store a user's preferred language, and translate WooCommerce emails in the customer/admin language. Plugin code must render emails in a stable language context and avoid one-email-many-languages shortcuts.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin/theme sends user-facing email or notification content through `wp_mail()`, WooCommerce emails, custom mail transports, cron, WP-CLI, webhooks, or async jobs.
- Code renders email templates before calling `wp_mail()` or sends directly through an API that bypasses `wp_mail()`.
- The task mentions preferred user language, `trp_language`, `trp_always_use_this_language`, `trp_translate()`, `trp_switch_language()`, `trp_restore_language()`, `trp_switch_to_preffered_language()`, `trp_whitelisted_shortcodes_for_wp_mail`, `trp_woo_email_language`, WooCommerce Store API checkout emails, HPOS order meta, or "email text" in String Translation.

## Baseline checks

Verify the installed stack:

```bash
wp plugin list --fields=name,status,version | grep -E 'translatepress|woocommerce'
wp eval 'echo defined( "TRP_PLUGIN_VERSION" ) ? TRP_PLUGIN_VERSION : "missing";'
wp option get trp_settings --format=json
```

TranslatePress Multilingual 3.2.1 hooks `wp_mail` at priority `1` through `TRP_Translation_Render::wp_mail_filter()`. WooCommerce email language support is initialized on `init` and requires `WC_VERSION >= 6.8.0`.

## Prefer wp_mail for normal emails

If the plugin can use `wp_mail()`, do that. TranslatePress filters `subject` and `message`, runs whitelisted conditional language shortcodes, and switches to the first recipient's preferred language when that recipient is a registered user.

Good pattern:

```php
$subject = __( 'Your certificate is ready', 'myplugin' );
$message = myplugin_render_email_template( $certificate_id );

wp_mail( $user->user_email, $subject, $message, array( 'Content-Type: text/html; charset=UTF-8' ) );
```

Do not pre-render a translated body in one global language and then send it to multiple recipients. TranslatePress chooses one language per `wp_mail()` call, using the first recipient when multiple recipients are provided. Send separate emails when recipients may have different languages.

## Preferred user language

TranslatePress stores the front-end language preference in user meta:

- `trp_language`
- `trp_always_use_this_language`

The profile UI comes from `TRP_Preferred_User_Language`. Logged-in front-end visits update `trp_language` unless "Always use this language" is enabled.

When rendering custom email templates before `wp_mail()`, switch language during template rendering and restore it immediately:

```php
$language = get_user_meta( $user_id, 'trp_language', true );

if ( function_exists( 'trp_switch_language' ) && ! empty( $language ) ) {
    trp_switch_language( $language );

    try {
        $subject = __( 'Your renewal is due', 'myplugin' );
        $message = myplugin_render_email_template( $subscription_id );
    } finally {
        trp_restore_language();
    }
} else {
    $subject = __( 'Your renewal is due', 'myplugin' );
    $message = myplugin_render_email_template( $subscription_id );
}
```

Use this for custom transports that bypass `wp_mail()` or for templates that must be rendered before calling `wp_mail()`. Do not leave `TRP_LANGUAGE`, locale, or `plugin_locale` switched after rendering.

## Use trp_translate for isolated strings

Use `trp_translate()` when you need to translate a specific stored string or HTML fragment:

```php
if ( function_exists( 'trp_translate' ) ) {
    $message = trp_translate( $message, $language, true );
}
```

The third parameter defaults to `true`, which wraps output with `data-no-translation` to prevent over-translation if the result later appears in rendered HTML. Set it to `false` only when the translated string will not be detected again by TranslatePress.

Do not pass volatile personalized fragments as one whole translation unit if they change for every user. Split stable prose from variables.

## Conditional language shortcodes in email templates

For admin-editable email bodies, allow shortcodes so site owners can use current conditional language shortcodes:

```text
[language-include lang="en_US"]English content[/language-include]
[language-exclude lang="de_DE"]Not German content[/language-exclude]
```

TranslatePress core whitelists `trp_language`, `language-include`, and `language-exclude` in `wp_mail_filter()`. Keep `[trp_language]` only for legacy content; core marks it deprecated.

If the plugin manually runs shortcodes before `wp_mail()`, restrict the shortcode surface. Do not run arbitrary shortcodes in untrusted email content.

## Gettext and email template paths

Use normal WordPress i18n in PHP email templates:

```php
printf(
    '<p>%s</p>',
    esc_html__( 'Thanks for learning with us.', 'myplugin' )
);
```

TranslatePress gettext scanning marks strings as email text when file paths contain:

- `templates/emails/`
- `includes/emails/`
- `woocommerce/emails/`

If the plugin stores email templates in another path, extend the source-confirmed filter:

```php
add_filter( 'trp_email_paths_', static function ( array $paths ): array {
    $paths[] = 'resources/mail/';
    return $paths;
} );
```

This helps the String Translation email filter find those gettext strings. It does not replace normal `.pot` extraction or text-domain correctness.

## WooCommerce emails

TranslatePress core handles WooCommerce emails when WooCommerce is available:

- saves `trp_language` on classic checkout through `woocommerce_checkout_update_order_meta`;
- saves `trp_language` on Checkout Block/Store API through `woocommerce_store_api_checkout_update_order_meta`;
- stores the order id before common WooCommerce notification hooks;
- switches customer emails to order/user language and admin emails to the admin recipient locale;
- filters `trp_woo_email_language` before switching;
- reloads WooCommerce textdomain and bootstraps TranslatePress gettext when emails are sent outside normal page rendering.

For WooCommerce extensions:

- Use WooCommerce email classes/hooks where practical.
- Preserve the order's `trp_language` meta; do not overwrite it with the current admin language.
- Use WC order meta APIs for HPOS compatibility, not raw `wp_postmeta` SQL.
- If a custom email has unusual recipients, use `trp_woo_email_language` to correct the chosen language.
- Do not translate names, addresses, emails, order numbers, coupon codes, SKUs, payment IDs, or tracking numbers.

Custom language correction:

```php
add_filter( 'trp_woo_email_language', static function ( string $language, bool $is_customer_email, array $recipients, int $user_id ): string {
    if ( $is_customer_email || $user_id <= 0 ) {
        return $language;
    }

    $preferred = get_user_meta( $user_id, 'trp_language', true );
    return $preferred ?: $language;
}, 10, 4 );
```

## Async, cron, and CLI

Cron and webhook emails often run without a front-end request language. Explicitly choose a target language from durable data:

- recipient user meta `trp_language`;
- WooCommerce order meta `trp_language`;
- subscription/member/course enrollment owner language;
- default language fallback from TranslatePress settings.

Do not use the current request URL, cookie, or admin user's current language as the recipient language for delayed jobs.

## Test matrix

Test these paths before release:

- logged-in recipient with `trp_language` set;
- recipient with "Always use this language" enabled;
- guest WooCommerce order with `trp_language` order meta;
- admin-triggered order status email;
- WooCommerce Store API checkout email;
- cron/CLI delayed notification;
- multiple recipients with different languages, sent as separate emails;
- HTML email with variables, names, addresses, order numbers, and links.

## Critical rules

- Do not send one translated email body to recipients with different languages.
- Do not leave TranslatePress language switched after rendering custom templates.
- Do not translate machine identifiers, addresses, personal names, emails, tokens, order numbers, or payment data.
- Do not bypass `wp_mail()` unless you explicitly switch language and translate the body yourself.
- Do not read/write WooCommerce order language through raw post meta SQL in HPOS-compatible code.
- Do not add new `[trp_language]` content; prefer `[language-include]` and `[language-exclude]`.

## Cross-references

- Run **`translatepress-output-compatibility`** for visible HTML fragments, exclusion attributes, and user-facing text.
- Run **`translatepress-url-seo-compatibility`** for links inside emails that must point to translated pages/domains.
- Run **`wc-store-api`** for WooCommerce Checkout Block/Store API checkout workflows.
- Run **`wp-i18n-audit`** for gettext domains and translation-file correctness.

## References

- Core hook registration: `wp-content/plugins/translatepress-multilingual/class-translate-press.php`
- `wp_mail` filter source: `wp-content/plugins/translatepress-multilingual/includes/class-translation-render.php`
- Language switch helpers: `wp-content/plugins/translatepress-multilingual/includes/functions.php`
- Preferred user language source: `wp-content/plugins/translatepress-multilingual/includes/class-preferred-user-language.php`
- WooCommerce email source: `wp-content/plugins/translatepress-multilingual/includes/class-woocommerce-emails.php`
- Email gettext scanning: `wp-content/plugins/translatepress-multilingual/includes/string-translation/class-gettext-scan.php`
- Preferred language docs: <https://translatepress.com/docs/send-emails-in-users-preferred-language/>
- WooCommerce email docs: <https://translatepress.com/docs/translating-woocommerce-emails/>
- Translation function docs: <https://translatepress.com/docs/translation-function/>
- Verified source paths:
  - `wp-content/plugins/translatepress-multilingual/index.php`
  - `wp-content/plugins/translatepress-multilingual/readme.txt`
  - `wp-content/plugins/translatepress-multilingual/includes/string-translation/class-string-translation.php`
  - `wp-content/plugins/translatepress-multilingual/includes/string-translation/class-string-translation-helper.php`
  - `wp-content/plugins/translatepress-multilingual/includes/compatibility-functions.php`
