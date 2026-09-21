# Subscriptions 9.2 release impact map

Baseline: Subscriptions 9.2.0 release source and its complete `changelog.txt`, with WooCommerce 11.1.1. This map identifies integration changes and the regression scenarios to verify.

## Settings and migration

| Change | Integration action and regression |
|---|---|
| Settings move to a single-column layout, a `WC_Settings_Page` wrapper and revised field composition. | Keep server-side settings integration independent of DOM selectors. Test custom fields in the actual renderer; inspect REST fields independently from display-only controls. The internal wrapper deduplicates REST groups/fields and preserves legacy option IDs. |
| Suspension controls no longer expose a 0-12 dropdown. | Store `0`, a non-negative integer, or `'unlimited'`; do not derive limits from a select list. The deprecated range filter still fires but cannot control the limit. Its suggested option filter changes the effective value, not the displayed option list. |
| Early-renewal default changes for stores with no saved choice; new-store switch label becomes `Switch`. | Distinguish an absent option from a saved false/no value. Do not overwrite merchant wording or saved renewal preferences on upgrade. |
| Automatic-payment-off depends on manual-renewal acceptance. | Test both options together. Existing child-only settings are normalized during upgrade; independent REST/CLI writes must maintain consistency. This setting is not permission to change existing customers' gateway mandates. |
| Per-product gifting replaces the global default; product bulk editing is added. | Preserve explicit `_subscription_gifting` choices. Verify migration progress, completion and failures, including catalog writes made during the upgrade. Do not assume that a new PHP version alone means the background migration finished. |
| Gifting migration has an upper product-ID bound and transitional fallback. | Existing unset products can temporarily inherit the old enabled default until settlement; products created after the migration boundary should remain off. A stalled/unstarted migration can retain fallback. Use the plugin's migration/repair flow; do not manufacture internal completion options. |
| APFS product migration continues after individual failures. | Inspect completion notices and logs; a completed run can leave failed products in one-time-only mode. Verify affected products manually before selling them again. |
| A 9.2 upgrade step repairs a missing subscription-downloads table. | Check upgrade completion and table availability on pre-8.1 upgrade paths. Do not recreate proprietary tables with guessed DDL or rerun every upgrader against production. |

Source anchors: `includes/class-wcs-customer-suspension-manager.php`, `includes/class-wcs-manual-renewal-manager.php`, `includes/core/upgrades/class-wcs-plugin-upgrade-9-2-0.php`, `includes/gifting/class-wcsg-admin.php`, `includes/core/class-wc-subscriptions-product.php`, `src/Internal/Admin/Settings/Settings_Page.php`.

## Account permissions and links

- Item-removal visibility now uses the same owner capability enforced by the handler. Gift recipients no longer receive an unusable control. The three-argument filter precedes the capability check, so a true return cannot replace authorization.
- Removal/undo and resubscribe use separate operation tokens. Test a fresh owner link, another customer's link, an ID-only legacy token and a token from the other operation. CLI nonce verification alone does not test redirects or browser handlers.
- Change-payment requests without `key` no longer generate an undefined-key warning. Order-pay requests with empty keys and nonexistent orders no longer fatal. Custom routes must still enforce ownership, key and nonce checks; absence of a warning is not authorization.
- Add-to-Subscription gives the same inability-to-edit notice for missing and inaccessible subscriptions. Preserve that disclosure boundary in companion endpoints.

Source anchors: `includes/core/wcs-functions.php`, `includes/core/class-wcs-remove-item.php`, `includes/core/class-wcs-cart-resubscribe.php`, `includes/core/class-wc-subscriptions-change-payment-gateway.php`, and the APFS management handlers under `includes/apfs/`.

## Plans and switching

The frontend plan bundle is registered on the normal script hook but enqueued when needed. Custom quick views, fragment renderers and custom product pages need the script before they attempt to initialize markup. `enqueue_frontend_script()` simply enqueues the registered handle; calling it does not replace missing registration/localization or initialize an already inserted browser fragment.

For Add-to-Subscription cart UI, `wcsatt_enqueue_cart_script` keeps its historical page-dependent default. In 9.2, returning true where the default was already true leaves the renderer responsible for enqueueing; changing true to false vetoes it. A forced true on a normally false page explicitly enqueues cart parameters and the bundle. Do not replace this with unconditional global loading.

Legacy unlimited-duration APFS plan keys now resolve to their current spelling. Exact matches win; canonical matching must remain unambiguous. The fix restores plan pricing, recurring/sign-up coupon eligibility and identical-plan detection. A switch from a formerly unrecognized legacy plan during its trial can now end the trial and charge the new plan; communicate the quote from the current calculation rather than relying on the old accidental zero amount.

| Switching change | Regression |
|---|---|
| Physical recurring-price and length proration options. | Virtual/physical products; upgrades and downgrades; sign-up fees; no-proration mode. |
| Same-plan filter receives a seventh argument. | Classic posted switch and order-pay rebuild without posted plan data. Same-plan truth is restored after callbacks on the latter. |
| Zero-total Blocks switches complete again with Woo 10.9+. | Verify switch relationship and resulting subscription, not only order completion. |
| Paying a pending/failed switch order now completes that switch. | My Account and invoice order-pay flow; no second subscription is created. |
| Instance-ID lookup no longer initializes modules. | Repeated product lookups must neither duplicate hooks nor rerun module filters. |

Source anchors: `includes/apfs/class-wcs-att-display.php`, `includes/apfs/class-wcs-att-product.php`, `includes/apfs/product/class-wcs-att-product-schemes.php`, `includes/switching/class-wc-subscriptions-switcher.php`, `includes/switching/class-wcs-switch-totals-calculator.php`.

## Coupon and tax boundaries

Use core coupons for their actual core semantics. WCS registers `recurring_fee`, `recurring_percent`, `sign_up_fee` and `sign_up_fee_percent`; these are product-family discount types with WCS calculation/validation behavior. A recurring coupon and a sign-up fee coupon target different charges. Do not rename either to core `fixed_cart`/`percent` to make validation pass.

WCS also creates virtual renewal types such as `renewal_cart`, `renewal_fee` and `renewal_percent` to reproduce renewal context. They are not merchant-facing discount types to create independently. Do not copy their session structures into a custom redemption service.

9.2 corrects tax-inclusive manual renewal-discount allocation and records the store's tax-entry basis on subscriptions created through the admin. The renewal subtotal and item calculation must use the same tax basis. Missing renewal context or a nonpositive allocation basis can yield zero discount and a diagnostic log rather than a fatal error; inspect actual amounts.

When crossing 9.1, include its Blocks renewal-coupon charge fix and recurring-percent sub-cent rounding fix. Build a matrix with signup versus recurring discount, trial versus no trial, fixed versus percentage, manual renewal, automatic renewal, admin-created subscription, tax-inclusive/exclusive entry, and classic/Blocks checkout. The shipped core-coupon fixture does **not** exercise this WCS renewal matrix.

Source anchors: `includes/core/class-wc-subscriptions-coupon.php`, `includes/core/class-wcs-cart-renewal.php`, `includes/core/admin/meta-boxes/class-wcs-meta-box-subscription-data.php` and `includes/apfs/` plan restoration. Verify the actual file layout in the installed release before relying on historical paths.

## PayPal and storage

PayPal Standard now checks receiver identity and currency for subscription notifications and also acceptable payment amounts before recording payments. A mismatch is not a successful renewal: an active subscription can move on hold, the profile can be suspended, and an invoice flow can establish a replacement profile. Do not mark a failed notification paid in an observer or broaden the expected-amount filter to match arbitrary incoming values.

The new `woocommerce_subscriptions_paypal_standard_expected_payment_amounts` filter has three arguments: expected amounts, subscription, unslashed transaction details. Treat the transaction payload as untrusted evidence; derive additional acceptable amounts from trusted subscription/payment history. Do not log the full payload.

Other PayPal corrections to test in sandbox:

- Optional empty receiver-email configuration no longer incorrectly holds Reference Transactions payments.
- Diagnostic logs omit payment-method-change authorization material; ordinary order debugging respects the gateway's debug setting.
- HPOS resubscribe orders strip inherited legacy PayPal payer/profile/transaction details.
- HPOS without compatibility mode recognizes replayed IPNs, restores previous-profile cancellation after payment-method changes, and records renewals using identity-token verification.

HPOS subscription data-store writes now select changed or missing properties using the orders meta table. Loading A and B, saving one property through A and another through stale B must preserve both. This does not solve concurrent changes to the same property or raw SQL bypasses.

Source anchors: `includes/core/gateways/paypal/`, especially `includes/class-wcs-paypal-standard-ipn-handler.php` within that gateway directory; `includes/core/data-stores/class-wcs-orders-table-subscription-data-store.php`.

## Remaining fixes and operational checks

| Release item | What to verify |
|---|---|
| Scheduled subscription event removed without a replacement now leaves better diagnostics. | Check `failed-scheduled-actions` logs against the subscription date and actual queue. Do not execute due payment jobs merely to obtain smoke evidence. |
| Renewal creation tolerates another plugin reading order status during background creation. | Exercise the actual observer on a disposable renewal fixture; no gateway charge. |
| Reports render HTML-containing product names as text. | Browser output escaping, including the Subscriptions by Product report. |
| Health-check completion counts scanned subscriptions correctly. | Distinguish scanned records from the smaller candidate set; do not report healthy totals based on shortlisted items. |
| Blocks recurring totals display included tax. | Browser display versus charged amounts, tax-inclusive stores. |
| HPOS parent-order trash displays a linked-subscription warning. | Admin confirmation and relationships after trash/restore. |
| Scheduled downloadable-product publication grants existing subscribers access; empty linked-product save no longer warns. | Publish via scheduled transition, verify permissions, then empty-link save. |
| Product CSV export no longer unserializes APFS plan meta twice. | Round-trip plan data through Woo's normal export/import; no extra unserialize call in companions. |

Do not turn these bug fixes into new globally installed workaround code. Remove a companion workaround only after identifying the same behavior in its tested release and reproducing the corrected path.

## Sources

- Installed WCS 9.2.0 `changelog.txt` sections 9.2.0 and 9.1.0, and the source anchors above.
- [Official 9.2 developer advisory](https://developer.woocommerce.com/2026/09/08/wc-subscriptions-9-2-0/).
- [Product version notes](https://woocommerce.com/products/woocommerce-subscriptions/).
