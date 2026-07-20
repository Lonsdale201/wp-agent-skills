---
name: wc-sequential-order-numbers-pro
description: >-
  Build or audit compatibility with WooCommerce Sequential Order Numbers Pro.
  Use when code prints, stores, searches, imports, exports, invoices, emails,
  syncs, or filters WooCommerce order numbers, especially around
  $order->get_order_number(), wc_seq_order_number_pro(),
  find_order_by_order_number(), _order_number, _order_number_formatted,
  wc_sequential_order_numbers_formatted_order_number, HPOS order meta,
  REST-created orders, Checkout Block draft orders, free-order sequences, or
  WooCommerce Subscriptions renewal orders.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce-sequential-order-numbers-pro"
  wp-skills-plugin-version-tested: "1.21.9"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-woocommerce-version-tested: "10.9.3"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-07"
---

# WooCommerce Sequential Order Numbers Pro compatibility

Use this skill when a WooCommerce plugin must cooperate with Sequential Order
Numbers Pro (SONP). The core rule is simple: the WooCommerce order ID remains
the database primary key; the sequential order number is the human-facing
business number.

## Mental model

- Treat `$order->get_id()` as the immutable internal identifier.
- Treat `$order->get_order_number()` as the display/order-document number.
- Do not build UI, emails, PDFs, CSVs, invoices, ERP payloads, or customer
  messages from `#{$order_id}` when SONP may be active.
- Do not parse the formatted number back into an ID. It may have prefixes,
  suffixes, date/time tokens, leading zeroes, or a free-order identifier.
- Do not write `_order_number*` meta directly unless you are repairing data in
  a controlled migration.

## Plugin contract

SONP 1.21.9 stores and uses these internal fields:

- `_order_number`: numeric sequential portion for normal orders.
- `_order_number_formatted`: complete visible order number.
- `_order_number_free`: separate sequence for skipped/free orders.
- `_order_number_meta`: internal snapshot of format settings; do not depend on
  this as an integration contract.

Relevant options include `woocommerce_order_number_start`,
`woocommerce_order_number_prefix`, `woocommerce_order_number_suffix`,
`woocommerce_order_number_length`, `woocommerce_order_number_skip_free_orders`,
`woocommerce_free_order_number_prefix`, `woocommerce_free_order_number_start`,
and the `woocommerce_order_number_current` / `woocommerce_order_number_free_current`
performance-mode counters.

Relevant public surfaces:

- `$order->get_order_number()` via the `woocommerce_order_number` filter.
- `wc_seq_order_number_pro()->find_order_by_order_number( $number )`.
- `wc_seq_order_number_pro()->set_sequential_order_number( $order )` for rare
  programmatic-order repair after the order exists and is not a checkout draft.
- `wc_seq_order_number_pro()->format_order_number(...)` when building previews,
  not when reading an existing order.

Extension filters: `wc_sequential_order_numbers_formatted_order_number`,
`wc_sequential_order_numbers_is_free_order`,
`wc_sequential_order_numbers_performance_mode`, and
`wc_sequential_order_numbers_generate_sequential_order_number_query`.

## Detection and display

Check after plugins are loaded:

```php
$sonp_active = function_exists( 'wc_seq_order_number_pro' );
```

Avoid requiring plugin files manually. Use this everywhere humans see an order
number:

```php
$order = wc_get_order( $order_id );

if ( $order instanceof WC_Order ) {
	$display_number = $order->get_order_number();
}
```

Audit account/admin pages, emails, PDFs, invoices, REST responses, webhooks,
exports, ERP/CRM payloads, support tools, order tracking forms, and public
shortcodes.

Keep both values when syncing externally:

```php
[
	'order_id'              => $order->get_id(),
	'display_order_number'  => $order->get_order_number(),
]
```

Use `order_id` for idempotency and internal joins; use `display_order_number`
for customer-facing references.

## Lookup by customer-entered order number

Prefer SONP's helper when available:

```php
function myplugin_find_order_id_by_display_number( string $number ): int {
	$number = ltrim( trim( $number ), '#' );

	if ( function_exists( 'wc_seq_order_number_pro' ) ) {
		return (int) wc_seq_order_number_pro()->find_order_by_order_number( $number );
	}

	$order = wc_get_order( $number );

	return $order instanceof WC_Order ? $order->get_id() : 0;
}
```

If writing your own fallback search, use `wc_get_orders()` and
`_order_number_formatted`, not `WP_Query` over `shop_order` posts:

```php
$ids = wc_get_orders( [
	'return'     => 'ids',
	'limit'      => 1,
	'meta_query' => [
		[
			'key'   => '_order_number_formatted',
			'value' => ltrim( trim( $number ), '#' ),
		],
	],
] );
```

Do not strip non-digits unless the UX explicitly searches only the numeric
portion. Prefixes and suffixes are valid order-number data.

The helper can fall back to native order IDs for legacy/unassigned orders. If
the workflow must match only visible SONP numbers, query `_order_number_formatted`
directly.

## Creating orders programmatically

Use WooCommerce CRUD and normal lifecycle hooks. SONP assigns numbers on
checkout update, `woocommerce_new_order`, status changes out of draft,
admin-created orders, REST insert hooks, and WooCommerce Deposits-created
orders.

Avoid reading the order number too early in the same request. If your plugin
needs it immediately after creation, run later than SONP or after the order has
been saved:

```php
add_action( 'woocommerce_new_order', function ( $order_id ) {
	$order = wc_get_order( $order_id );

	if ( $order instanceof WC_Order ) {
		$number = $order->get_order_number();
	}
}, 20 );
```

Checkout Block orders may exist as `checkout-draft` / `wc-checkout-draft`; do
not force a number onto drafts.

If a legacy importer creates a real order and bypasses all Woo hooks, call:

```php
if ( function_exists( 'wc_seq_order_number_pro' ) ) {
	wc_seq_order_number_pro()->set_sequential_order_number( $order );
}
```

Only do this after the order has an ID and a non-draft status. Never call it on
cloned orders before clearing copied SONP meta.

## HPOS rules

- Use `WC_Order` CRUD methods and `wc_get_orders()`.
- Do not query `$wpdb->postmeta` for order numbers.
- Do not assume `shop_order` posts exist for every order.
- Do not sort/search admin orders with raw `request` filters only; HPOS order
  screens use their own list-table/query filters.

Add admin search via WooCommerce order queries or HPOS-aware filters.

## Subscriptions and copied orders

Subscriptions are not normal orders. SONP deliberately removes its meta when an
order is copied to a `WC_Subscription`, and renewal orders receive their own
sequential order numbers.

When cloning, renewing, splitting, importing, or resubscribing orders, exclude:

```php
$sonp_meta = [
	'_order_number',
	'_order_number_formatted',
	'_order_number_free',
	'_order_number_meta',
];
```

Duplicated order numbers are a hard accounting and support problem.

## Free orders

If `woocommerce_order_number_skip_free_orders` is `yes`, free orders can use a
separate sequence and visible prefix. In that mode `_order_number` may be `-1`
for sorting while the visible number comes from `_order_number_formatted`.

Use `$order->get_order_number()` for display and do not assume `_order_number`
is always the customer-facing number.

Adjust free-order classification only with
`wc_sequential_order_numbers_is_free_order`, and keep that filter deterministic.

## Custom formatting

Use `wc_sequential_order_numbers_formatted_order_number` for stable,
merchant-wide or order-specific tokens:

```php
add_filter(
	'wc_sequential_order_numbers_formatted_order_number',
	function ( string $formatted, string $number, int $order_id, string $prefix, string $suffix ): string {
		if ( $order_id <= 0 ) {
			return $formatted; // settings preview or no order context
		}

		return $formatted;
	},
	10,
	5
);
```

Avoid request-specific values, random values, customer language, or mutable
order state unless assignment-time dependence is intentional.

## Performance mode

`wc_sequential_order_numbers_performance_mode` switches generation from a
max-meta scan to a current-number option. Use it only for large stores after
testing imports, deletions, and concurrency behavior.

If performance mode is enabled, do not reset current-number options casually,
do not expect deleted latest numbers to be reused, test concurrent programmatic
creation, and avoid filtering generation SQL without DB-level review.

## Audit checklist

Search the target plugin for `$order->get_id()`, `$order->id`, `order_id`,
`#`, `get_post_meta`, `update_post_meta`, `$wpdb->postmeta`, `shop_order`,
`_order_number*`, `woocommerce_order_number`, `woocommerce_new_order`, invoice,
PDF, email, export, webhook, ERP, CRM, sync, tracking, and subscription
copy/renewal logic.

Classify findings:

- **Bug**: customer-facing output uses internal order ID.
- **Bug**: search accepts visible order numbers but only calls `wc_get_order()`.
- **Bug**: clone/import code copies `_order_number*` meta.
- **Bug**: HPOS site uses direct `postmeta` / `shop_order` queries.
- **Risk**: external system stores only formatted number as the primary key.
- **Risk**: order number read before SONP assignment hook has run.

## Test matrix

Verify HPOS on/off, normal checkout, Checkout Block draft-to-real order,
admin-created order, REST-created order, skipped free order, subscription
renewal, formatted-number search with prefix/suffix/zeroes, emails/PDFs,
invoices, exports, webhooks, and sync retry paths.

## Cross-references

- Use `wc-hpos-compatibility` when the target code queries order tables.
- Use `wc-order-lifecycle-and-items` when the target code creates or mutates
  orders and order items.
- Use `wcs-subscription-hooks` when subscription renewal/copy behavior matters.
- Use `wc-rest-api-v4` when exposing order numbers through custom REST routes.

## References

- Official documentation: <https://docs.woocommerce.com/document/sequential-order-numbers/>
- Official documentation: <https://woocommerce.com/products/sequential-order-numbers-pro/>
- Verified source paths:
  - `wp-content/plugins/woocommerce-sequential-order-numbers-pro/woocommerce-sequential-order-numbers-pro.php`
  - `wp-content/plugins/woocommerce-sequential-order-numbers-pro/class-wc-seq-order-number-pro.php`
  - `wp-content/plugins/woocommerce-sequential-order-numbers-pro/src/REST_API.php`
  - `wp-content/plugins/woocommerce-sequential-order-numbers-pro/src/Lifecycle.php`
  - `wp-content/plugins/woocommerce-sequential-order-numbers-pro/changelog.txt`
