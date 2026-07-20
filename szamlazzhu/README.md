# szamlazzhu

Compatibility skills for **[Integration for Szamlazz.hu & WooCommerce](https://wordpress.org/plugins/integration-for-szamlazzhu-woocommerce/)** (`integration-for-szamlazzhu-woocommerce`) — the WooCommerce ↔ [Számlázz.hu](https://www.szamlazz.hu) invoicing bridge.

These are skills for making **your own** WooCommerce extension cooperate with the Számlázz.hu integration, not for re-implementing it. The plugin already owns the Számlázz.hu Agent request, the invoice XML, PDF storage, order meta, automations, IPN, and Woo webhooks — a crossover plugin should hook that contract (filters/actions, HPOS-safe order meta, the canonical VAT-number data model) rather than sending its own invoice or duplicating checkout state. Use when invoice line items / XML / document timing or B2B VAT-number checkout must stay consistent with what Számlázz.hu receives. Verified against plugin 6.2.2 on WooCommerce 10.9.4.

## Skills

| Skill | Purpose |
|---|---|
| `szamlazzhu-document-xml-compatibility` | Cooperate with document generation instead of duplicating it: the `WC_Szamlazz()->generate_invoice()` mental model and document-type → order-meta map, the extension points by timing (`wc_szamlazz_before_generate_invoice_check` hard guard, `wc_szamlazz_invoice_line_item` per-`<tetel>`, `wc_szamlazz_xml` final XML, `wc_szamlazz_after_invoice_success` / `wc_szamlazz_document_created`), blocking vs deferring auto-generation, HUF vs foreign-currency rounding and keeping net/VAT/gross/unit consistent, Action Scheduler deferral (`wc-szamlazz` group), Pro webhooks/IPN and order-number mapping, multilingual line text, and HPOS-safe order access. |
| `szamlazzhu-vat-checkout-compatibility` | Keep B2B VAT/tax-number checkout consistent across surfaces: the canonical data contract (classic field `wc_szamlazz_adoszam`, order meta `_billing_wc_szamlazz_adoszam` + `_wc_szamlazz_adoszam_data`, user meta, Store API namespace `wc-szamlazz-vat-number`, session `vat-number-data`), reading the number HPOS-safely, mapping another plugin's VAT field into the invoice via `wc_szamlazz_xml_adoszam` / `_eu`, populating canonical meta at checkout, classic vs Checkout-Block/Store-API flows, NAV/VIES validation filters and EU VAT exemption (session-only), subscription-renewal meta copying, and treating VAT numbers as protected billing data. |
