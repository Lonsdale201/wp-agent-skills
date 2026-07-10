---
name: wc-emails-classic
description: Add or customize classic WooCommerce transactional emails with `WC_Email`. Covers registration, constructor timing, templates and theme overrides, status notification triggers, locale handling, the WooCommerce 10.9 `send_notification()` guard, disabled/skipped/sent outcome hooks, HPOS-safe order data, and one-off styled mail. Use when adding an email type, overriding email templates, or debugging sends that bypass settings and logging.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: woocommerce
plugin-version-tested: "10.9.4"
php-min: "7.4"
last-updated: "2026-07-10"
docs:
  - https://woocommerce.com/document/template-structure/
source-refs:
  - wp-content/plugins/woocommerce/includes/emails/class-wc-email.php
  - wp-content/plugins/woocommerce/includes/class-wc-emails.php
  - wp-content/plugins/woocommerce/includes/emails/class-wc-email-customer-processing-order.php
  - wp-content/plugins/woocommerce/src/Internal/Email/EmailLogger.php
  - wp-content/plugins/woocommerce/templates/emails
---

# WooCommerce classic transactional emails

Choose the smallest extension point:

1. Change markup only: override a template in the theme.
2. Change existing email values: use settings or a targeted filter.
3. Add a new notification type: extend `WC_Email` and register it.

## Template override

```text
your-theme/woocommerce/emails/customer-processing-order.php
your-theme/woocommerce/emails/plain/customer-processing-order.php
```

Copy from WooCommerce's `templates/emails` tree and preserve the template version header. Theme overrides win over plugin/core templates and must be reviewed when WooCommerce reports them outdated.

For a plugin-owned custom email, set:

```php
$this->template_base = MYPLUGIN_PATH . 'templates/';
```

Users can still override that template through the theme's `woocommerce/` directory.

## Custom email class

```php
namespace MyPlugin\Email;

final class ShipmentReadyEmail extends \WC_Email {
    public function __construct() {
        $this->id             = 'myplugin_shipment_ready';
        $this->customer_email = true;
        $this->title          = __( 'Shipment ready', 'myplugin' );
        $this->description    = __( 'Sent when a shipment becomes ready.', 'myplugin' );
        $this->template_html  = 'emails/shipment-ready.php';
        $this->template_plain = 'emails/plain/shipment-ready.php';
        $this->template_base  = MYPLUGIN_PATH . 'templates/';

        $this->placeholders = array(
            '{order_number}' => '',
            '{order_date}'   => '',
        );

        add_action( 'myplugin_shipment_ready_notification', array( $this, 'trigger' ), 10, 2 );

        // Parent needs the stable ID and template properties to load settings.
        parent::__construct();

        // Properties depending on parent feature flags belong after this point.
    }

    public function get_default_subject(): string {
        return __( 'Order {order_number} is ready to ship', 'myplugin' );
    }

    public function get_default_heading(): string {
        return __( 'Your shipment is ready', 'myplugin' );
    }

    public function trigger( $order_id, $order = false ): void {
        $this->setup_locale();

        try {
            if ( $order_id && ! $order instanceof \WC_Order ) {
                $order = wc_get_order( $order_id );
            }

            if ( ! $order instanceof \WC_Order ) {
                return;
            }

            $this->object                         = $order;
            $this->recipient                      = $order->get_billing_email();
            $this->placeholders['{order_number}'] = $order->get_order_number();
            $this->placeholders['{order_date}']   = wc_format_datetime( $order->get_date_created() );

            // WC 10.9 standard guard: enabled + recipient + outcome hooks.
            $this->send_notification();
        } finally {
            $this->restore_locale();
        }
    }

    public function get_content_html(): string {
        return wc_get_template_html(
            $this->template_html,
            $this->template_args( false ),
            '',
            $this->template_base
        );
    }

    public function get_content_plain(): string {
        return wc_get_template_html(
            $this->template_plain,
            $this->template_args( true ),
            '',
            $this->template_base
        );
    }

    private function template_args( bool $plain ): array {
        return array(
            'order'              => $this->object,
            'email_heading'      => $this->get_heading(),
            'additional_content' => $this->get_additional_content(),
            'sent_to_admin'      => false,
            'plain_text'         => $plain,
            'email'              => $this,
        );
    }
}
```

Register with the mailer's class collection:

```php
add_filter( 'woocommerce_email_classes', static function ( array $emails ): array {
    $emails['myplugin_shipment_ready'] = new \MyPlugin\Email\ShipmentReadyEmail();
    return $emails;
} );
```

`WC_Emails` is a lazy singleton. The filter runs when its email collection is initialized, not as a general-purpose guarantee that every `init` callback has completed. Avoid request-specific work in the constructor.

## Trigger choice

For Woo order transitions, attach the email to a `_notification` action used by the email dispatcher, for example:

```php
add_action(
    'woocommerce_order_status_processing_to_completed_notification',
    array( $this, 'trigger' ),
    10,
    2
);
```

For a plugin-owned domain event, emit a stable action ending in `_notification` by convention and pass the ID plus object. Make the domain operation idempotent separately; an email is an observer, not the source of truth.

Non-notification status hooks are valid for business logic, but they are not a drop-in replacement for WooCommerce's email dispatch pipeline.

## The 10.9 send guards

`WC_Email::send_notification()` is protected for normal triggered emails. It:

1. Checks `is_enabled()` and fires `woocommerce_email_disabled` when false.
2. Checks `get_recipient()` and fires `woocommerce_email_skipped` with `no_recipient` when empty.
3. Calls `send()`, which fires `woocommerce_email_sent` with the mail result.

Do not duplicate the checks and call `send()` directly for a standard notification: that bypasses disabled/skipped observability and `EmailLogger` cannot report the real outcome.

`send_if_recipient()` intentionally bypasses the enabled setting for manually triggered sends such as a deliberate invoice resend. Use it only when that behavior is part of the product contract.

## Outcome hooks

| Hook | Arguments | Meaning |
|---|---|---|
| `woocommerce_email_disabled` | email ID, email object | Normal notification disabled |
| `woocommerce_email_skipped` | reason, email ID, email object | Not attempted, currently commonly no recipient |
| `woocommerce_email_sent` | success bool, email ID, email object | Mail callback attempted |

WooCommerce 10.9's `EmailLogger` observes these hooks with source `transactional-emails`. They are diagnostics, not order/payment domain events.

Relevant logging controls include `woocommerce_email_log_enabled`, `woocommerce_email_log_context`, and `woocommerce_email_log_add_order_note`. Never add recipient bodies, tokens, or unnecessary PII to log context.

## Locale and data

`setup_locale()` for customer emails switches to WooCommerce's configured site email locale, not automatically to a customer's preferred language. Always restore it, including early returns/exceptions.

Read orders through `WC_Order` getters and `get_meta()`. Never use post meta in email classes; HPOS may be authoritative.

## One-off styled mail

For a truly one-off message that does not need its own settings/enable state:

```php
$mailer = WC()->mailer();
$mailer->send(
    $recipient,
    $subject,
    $mailer->wrap_message( $heading, $safe_html ),
    array( 'Content-Type: text/html; charset=UTF-8' )
);
```

Do not use this shortcut for a recurring transactional type that merchants should be able to configure or disable.

## Critical rules

- Keep `$id` stable; saved email settings are keyed by it.
- Define ID/templates/placeholders/triggers before `parent::__construct()`.
- Use `send_notification()` for standard triggered emails in WooCommerce 10.9+.
- Wrap locale setup/restoration around every trigger.
- Escape template output and pass only explicit variables.
- Keep HTML and plain-text templates functional.
- Use order CRUD for HPOS compatibility.
- Treat outcome hooks as observability only.

## References

- Base class and send guards: `includes/emails/class-wc-email.php`.
- Registration collection: `includes/class-wc-emails.php`.
- Canonical trigger implementation: `includes/emails/class-wc-email-customer-processing-order.php`.
- Outcome logger: `src/Internal/Email/EmailLogger.php`.
