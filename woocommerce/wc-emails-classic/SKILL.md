---
name: wc-emails-classic
description: Customize WooCommerce transactional emails the classic
  PHP-template way (NOT the block email editor) — extend WC_Email,
  declare $id / $title / $template_html / $template_plain / $placeholders,
  hook trigger() to a woocommerce_order_status_*_notification action,
  register via the woocommerce_email_classes filter. Plus the canonical
  template-override pattern (copy templates/emails/*.php to your theme's
  /woocommerce/emails/ folder; wc_get_template resolves them automatically),
  and the get_default_subject / get_default_heading override pattern for
  admin-customizable strings. Use when adding a new transactional email
  (custom shipped notification, vendor split, internal alert), overriding
  an existing template, or customizing strings that the admin Settings
  cannot reach. Triggers on WC_Email, woocommerce_email_classes,
  woocommerce_order_status_*_notification, wc_get_template_html,
  template_html / template_plain in WC context, "transactional email"
  / "send WooCommerce email programmatically".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.7"
php-min: "7.4"
last-updated: "2026-04-28"
docs:
  - https://woocommerce.com/document/template-structure/
source-refs:
  - wp-content/plugins/woocommerce/includes/class-wc-emails.php
  - wp-content/plugins/woocommerce/includes/emails/class-wc-email.php
  - wp-content/plugins/woocommerce/includes/emails/class-wc-email-customer-processing-order.php
  - wp-content/plugins/woocommerce/includes/wc-core-functions.php
  - wp-content/plugins/woocommerce/templates/emails/
---

# WooCommerce: classic transactional emails (`WC_Email`)

For plugins and themes that customize WooCommerce's transactional emails — order confirmations, refund notifications, shipping alerts, custom vendor / fulfillment notifications. This skill covers the **classic** PHP-template path: `WC_Email` class extension, template override, `wc_get_template_html`. The block email editor is a separate path; this skill is intentionally non-block.

## Misconception this skill corrects

> "I'll override the email by hooking into `wp_mail` or copying the template into my plugin folder."

Both paths fail. WooCommerce emails go through `WC_Email::send()` ([includes/emails/class-wc-email.php:1128](class-wc-email.php)), not the WP `wp_mail` directly — hooking `wp_mail` works for incidental tweaks but misses WC's email-framework features (admin Settings, reusable header/footer, plain-text fallback, locale switching). And templates resolve theme-first: `wc_locate_template` looks for `<theme>/woocommerce/<file>`, then `<theme>/<file>`, and only falls back to the `$default_path` (which is your plugin's `template_base` if you passed one, otherwise WC core's `templates/`). Plugin-shipped templates require setting `$this->template_base` so the fallback hits your file instead of WC core's.

To actually customize, you have three correct paths:
1. **Override an existing email's template** — drop a copy in `theme/woocommerce/emails/<file>.php`. Easiest, no PHP class.
2. **Override email strings via Settings** — admin types subject / heading / additional content into the WC settings UI; class reads from `$this->get_option(...)`.
3. **Add a brand-new email class** — your plugin needs a new email type WC doesn't have. Extend `WC_Email`, register via `woocommerce_email_classes` filter.

## When to use this skill

Trigger when ANY of the following is true:

- Adding a new transactional email (vendor split, fulfillment milestone, refund-request received, custom status change).
- Overriding an existing email template's HTML / plain text.
- Customizing email strings beyond what WC's Settings UI exposes.
- Reviewing PR code that touches `WC_Email`, `wc_get_template_html`, `woocommerce_email_classes`, or any `woocommerce_order_status_*_notification` action.
- Debugging "my custom email isn't firing" / "the template renders the default content even though I overrode it".

## Architecture in one paragraph

WC ships a singleton `WC_Emails` ([includes/class-wc-emails.php](class-wc-emails.php)) that loads a list of `WC_Email` subclasses on `init`, filterable via `woocommerce_email_classes`. Each class declares its own `$id`, customer-facing `$title`, `$template_html` / `$template_plain` paths (resolved via `wc_get_template_html`), and an enabled flag in admin. The class wires its own triggers — usually to `woocommerce_order_status_<from>_to_<to>_notification` actions — and renders into HTML / plain-text using the templates. The customer-facing subject and heading default to the values returned by `get_default_subject()` / `get_default_heading()`, overridable in admin via Settings → Emails. Templates can be overridden in `theme/woocommerce/emails/` without touching the class.

## Template override — the no-class path

```
your-theme/
└── woocommerce/
    └── emails/
        └── customer-processing-order.php   ← copy of templates/emails/customer-processing-order.php
        └── plain/
            └── customer-processing-order.php   ← plain-text version
```

Copy the file from `wp-content/plugins/woocommerce/templates/emails/<file>.php` (and `templates/emails/plain/<file>.php` for the plain version) into your active theme. WC's `wc_get_template_html()` resolves the theme override before falling back to its bundled copy.

This is the right path for cosmetic / structural changes (rearranging blocks, adding a notice, swapping the logo, restyling). No PHP plugin code required.

**Caveat: template overrides break across major WC versions.** When WC ships a new version of `customer-processing-order.php`, your override stays at the old version — and may render against new variables that don't exist or miss new features. The WP admin's Status page surfaces stale overrides; review yearly.

## Add a brand-new email class

For an email WC doesn't ship — e.g. "Order shipped via a specific carrier" or "Refund request received".

```php
namespace MyPlugin\Email;

class MyCustomEmail extends \WC_Email {

    public function __construct() {
        $this->id             = 'myplugin_custom';        // unique slug
        $this->customer_email = true;                      // false for admin-only emails
        $this->title          = __( 'Custom shipping update', 'myplugin' );
        $this->description    = __( 'Sent to the customer when their order ships via the priority lane.', 'myplugin' );
        $this->template_html  = 'emails/myplugin-custom.php';
        $this->template_plain = 'emails/plain/myplugin-custom.php';

        // template_base is the directory WC searches for the template files
        // when wc_get_template_html() is called. By pointing at your plugin's
        // templates/ folder, your template gets found even with no theme override.
        $this->template_base  = MYPLUGIN_PLUGIN_PATH . 'templates/';

        $this->placeholders = array(
            '{order_number}' => '',
            '{order_date}'   => '',
        );

        // Bind the email to a specific WC action. The action name is the
        // canonical "X happened, send notifications" hook WC fires.
        add_action( 'myplugin/order_priority_shipped_notification', array( $this, 'trigger' ), 10, 2 );

        // Required — call parent constructor LAST so settings are loaded.
        parent::__construct();
    }

    public function get_default_subject(): string {
        return __( 'Your {order_number} order has shipped (priority)', 'myplugin' );
    }

    public function get_default_heading(): string {
        return __( 'Your order is on the way', 'myplugin' );
    }

    /**
     * Build context, look up recipient, send.
     *
     * @param int           $order_id
     * @param \WC_Order|false $order
     */
    public function trigger( $order_id, $order = false ): void {
        $this->setup_locale();

        if ( $order_id && ! ( $order instanceof \WC_Order ) ) {
            $order = wc_get_order( $order_id );
        }

        if ( $order instanceof \WC_Order ) {
            $this->object                         = $order;
            $this->recipient                      = $order->get_billing_email();
            $this->placeholders['{order_number}'] = $order->get_order_number();
            $this->placeholders['{order_date}']   = wc_format_datetime( $order->get_date_created() );
        }

        if ( $this->is_enabled() && $this->get_recipient() ) {
            $this->send(
                $this->get_recipient(),
                $this->get_subject(),
                $this->get_content(),
                $this->get_headers(),
                $this->get_attachments()
            );
        }

        $this->restore_locale();
    }

    public function get_content_html(): string {
        return wc_get_template_html(
            $this->template_html,
            array(
                'order'              => $this->object,
                'email_heading'      => $this->get_heading(),
                'additional_content' => $this->get_additional_content(),
                'sent_to_admin'      => false,
                'plain_text'         => false,
                'email'              => $this,
            ),
            '',
            $this->template_base
        );
    }

    public function get_content_plain(): string {
        return wc_get_template_html(
            $this->template_plain,
            array(
                'order'              => $this->object,
                'email_heading'      => $this->get_heading(),
                'additional_content' => $this->get_additional_content(),
                'sent_to_admin'      => false,
                'plain_text'         => true,
                'email'              => $this,
            ),
            '',
            $this->template_base
        );
    }
}
```

Register the class:

```php
add_filter( 'woocommerce_email_classes', static function ( array $emails ): array {
    $emails['myplugin_custom'] = new \MyPlugin\Email\MyCustomEmail();
    return $emails;
} );
```

The filter callback runs once on `init`. The array key matches `$this->id`. WC instantiates the class, which registers its own trigger actions in the constructor.

## Triggering the email

Two paths:

**Path A — fire on a WC core status transition.** Bind your `trigger()` to one of the existing notification actions:

```php
add_action( 'woocommerce_order_status_processing_to_completed_notification', array( $this, 'trigger' ), 10, 2 );
```

The `_notification` suffix is WC convention. All `woocommerce_order_status_*_notification` actions receive `( $order_id, $order )`. WC dispatches them inside `WC_Order::set_status()` after the actual status change.

**Path B — fire on a custom event.** Define your own action in your plugin's logic and bind the email to it:

```php
// Somewhere in your plugin code:
do_action( 'myplugin/order_priority_shipped_notification', $order_id, $order );

// In the email class constructor:
add_action( 'myplugin/order_priority_shipped_notification', array( $this, 'trigger' ), 10, 2 );
```

The action name is yours. The `_notification` suffix is convention but not required for custom hooks.

## Template variables

The variables passed to `wc_get_template_html()` become local variables in the template. The standard set across WC's built-in emails:

- `$order` — the `WC_Order` instance
- `$email_heading` — the H1 to render
- `$additional_content` — admin-customizable text from Settings
- `$sent_to_admin` — bool, true for admin-targeted emails
- `$plain_text` — bool, true for the plain-text variant
- `$email` — the `WC_Email` instance (for accessing helpers like `$email->customer_note`)

Your template can call `wc_get_template( 'emails/email-header.php', array( 'email_heading' => $email_heading ) )` and `wc_get_template( 'emails/email-footer.php' )` to inherit the WC header/footer style — the standard pattern across all built-in emails.

## Critical rules

- **Extend `WC_Email`, not `WP_Mail` or rolling your own.** The framework gives you Settings UI, locale switching, plain-text fallback, header/footer reuse for free.
- **Register via `woocommerce_email_classes` filter** ([class-wc-emails.php:333](class-wc-emails.php)). The filter runs on `init`; your callback is the only entry point.
- **`$this->id` is unique and stable.** Once shipped, renaming it invalidates admin-saved settings (subject overrides, recipient overrides, enabled state). Treat it like a public API contract.
- **Set `$this->template_base = MYPLUGIN_PLUGIN_PATH . 'templates/'`** for plugin-shipped templates, otherwise `wc_get_template` only searches the theme + WC's own templates folder.
- **Call `parent::__construct()` LAST** in your constructor (after declaring `$id`, `$title`, etc.). The parent reads `$this->id` to load saved settings.
- **`setup_locale()` / `restore_locale()` around `send()`** — for customer emails (`$this->is_customer_email()`), switches the active locale to the **site's default locale** via `wc_switch_to_site_locale()` so transactional content is consistent regardless of the visitor's current language. Verified at [class-wc-email.php:421-423](class-wc-email.php): `if ( $switch_email_locale && $this->is_customer_email() && apply_filters( 'woocommerce_email_setup_locale', true ) ) { wc_switch_to_site_locale(); }`. It does NOT switch to a per-customer language. Built-in emails do this; new customer-facing emails should too.
- **`is_enabled()` + `get_recipient()` guard before `send()`.** Without it, disabled emails still fire and emails with empty recipients hard-error in `wp_mail`.
- **Hook trigger() to `_notification`-suffixed actions** for WC status transitions. Don't bind to `woocommerce_order_status_<status>` (without `_notification`) — that fires earlier in the pipeline, before the order is fully saved.
- **Templates in theme override plugin override WC core.** Document your template files as overridable; users will copy them into `theme/woocommerce/emails/`.

## Common mistakes

```php
// WRONG — registering email outside woocommerce_email_classes
add_action( 'init', function () {
    new MyCustomEmail();
} );
// The email class instantiates but never enters WC_Emails->emails array,
// so its Settings panel doesn't appear and the trigger may double-register.

// RIGHT
add_filter( 'woocommerce_email_classes', function ( $emails ) {
    $emails['myplugin_custom'] = new MyCustomEmail();
    return $emails;
} );

// WRONG — calling parent::__construct first
public function __construct() {
    parent::__construct(); // 🔴 reads $this->id before the child sets it
    $this->id = 'myplugin_custom';
}

// RIGHT — set props first, parent last
public function __construct() {
    $this->id = 'myplugin_custom';
    $this->title = '...';
    // ... set all properties ...
    parent::__construct();
}

// WRONG — missing template_base for plugin-shipped templates
$this->template_html = 'emails/myplugin-custom.php';
// (no template_base set) → wc_get_template_html searches only theme + WC core

// RIGHT
$this->template_base = MYPLUGIN_PLUGIN_PATH . 'templates/';

// WRONG — binding trigger to non-notification action
add_action( 'woocommerce_order_status_completed', array( $this, 'trigger' ), 10, 2 );
// Fires too early in some contexts; WC's own emails always use the _notification suffix.

// RIGHT
add_action( 'woocommerce_order_status_processing_to_completed_notification', array( $this, 'trigger' ), 10, 2 );

// WRONG — sending without is_enabled / get_recipient guard
$this->send( $this->get_recipient(), $this->get_subject(), $this->get_content(), $this->get_headers(), $this->get_attachments() );
// Disabled email still fires; empty recipient throws.

// RIGHT
if ( $this->is_enabled() && $this->get_recipient() ) {
    $this->send( /* ... */ );
}

// WRONG — hardcoding subject in the class
public function get_default_subject() {
    return 'Your order has shipped'; // not translatable, not admin-overridable
}

// RIGHT — translatable, admin can override in Settings → Emails
public function get_default_subject() {
    return __( 'Your {order_number} order has shipped', 'myplugin' );
}
```

## Sending programmatically (one-off)

If you need to send a WC-styled email NOT tied to a `WC_Email` subclass — e.g. a one-off notification that doesn't warrant a class — pass through `WC_Emails`:

```php
$mailer = WC()->mailer();
$mailer->send(
    'recipient@example.com',
    'Subject line',
    $mailer->wrap_message( 'Heading', '<p>Body HTML</p>' ), // wraps in WC header/footer
    array(),  // headers
    array()   // attachments
);
```

`WC()->mailer()` returns the `WC_Emails` singleton. The `wrap_message` helper applies the same header/footer template the regular emails use, so the one-off keeps the brand styling.

## Cross-references

- Run **`wc-payment-gateway`** when the email is tied to payment events — the gateway calls `payment_complete()` which fires status transitions which fire `_notification` actions.
- Run **`wc-hpos-compatibility`** if the email reads custom order meta — `$order->get_meta()` (HPOS-aware), not `get_post_meta` against the order ID.
- Run **`wp-i18n-audit`** on email strings — translatable strings need text-domain consistency, and email-context translation has timing nuances (`setup_locale` switches the site locale mid-request).

## What this skill does NOT cover

- **Block email editor** — explicitly out of scope. The `BlockEmailRenderer` (WC 10.5+) and `woocommerce_email_block_template_html` filter are the modern alternative; sibling skill if there's demand.
- Email deliverability (SPF / DKIM / DMARC, SMTP plugins, transactional providers like SendGrid). Server-side / WP-level concerns.
- HTML email styling beyond what WC's bundled `emails/email-styles.php` provides.
- Custom unsubscribe / one-click unsubscribe header support (RFC 8058) — WC core doesn't ship this; provider-specific.
- Email log / queue plugins — observation layer above the framework.

## References

- Abstract: [wp-content/plugins/woocommerce/includes/emails/class-wc-email.php:33](class-wc-email.php) — `WC_Email extends WC_Settings_API`.
- Registration filter: [wp-content/plugins/woocommerce/includes/class-wc-emails.php:333](class-wc-emails.php) — `apply_filters( 'woocommerce_email_classes', ... )`.
- Reference implementation: [wp-content/plugins/woocommerce/includes/emails/class-wc-email-customer-processing-order.php](class-wc-email-customer-processing-order.php) — canonical `__construct` + `trigger` + `get_content_html` pattern.
- Built-in email list: [wp-content/plugins/woocommerce/includes/emails/](emails/) — 14+ classes covering processing, completed, refunded, cancelled, on-hold, fulfillment lifecycle, customer note, customer invoice, admin new-order.
- `wc_get_template_html` / `wc_locate_template`: [wp-content/plugins/woocommerce/includes/wc-core-functions.php:386-422](wc-core-functions.php) — resolution order is theme-override-first, then `default_path`: (1) `<theme>/woocommerce/<file>` (`locate_template` with `WC()->template_path()`), (2) `<theme>/<file>` (`locate_template` bare), (3) `$default_path . $file` — which is the plugin's `template_base` if you passed one to `wc_get_template_html`, otherwise WC core's `wp-content/plugins/woocommerce/templates/`. The plugin's `template_base` is the FALLBACK for unoverridden templates, NOT a first-priority lookup — theme overrides always win.
