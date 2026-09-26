# Hungarian Pickup Points for WooCommerce

Development and compatibility skills for **[Csomagpontok és Címkék WooCommerce-hez](https://wordpress.org/plugins/hungarian-pickup-points-for-woocommerce/)** (`hungarian-pickup-points-for-woocommerce`). They explain how another plugin can cooperate with pickup-point checkout, HPOS order data, shipping labels, and tracking without duplicating the plugin's provider APIs or checkout state.

Verified against plugin 4.2.8 on WooCommerce 11.1.2 and WordPress 7.1.2. Pickup-point selection and order storage are available in the free plugin. Carrier label generation, shipment tracking, status automation, and the built-in Számlázz.hu compatibility module are marked **PRO** where applicable.

## Skills

| Skill | Purpose | Edition |
|---|---|---|
| `vp-woo-pont-checkout-order-data` | Read and extend pickup-point selection across classic checkout and Checkout Blocks; use the canonical session, order-meta, shipping-address, provider/carrier, pricing, and Store API contracts. | Free + PRO |
| `vp-woo-pont-shipping-labels` | Prepare or generate labels safely, modify the normalized label payload, read parcel metadata, react to creation/removal, and distinguish remote voiding from local clearing. | PRO for ordinary carrier API labels; Kvikk has a separate configured path |
| `vp-woo-pont-tracking-automations` | Consume tracking events, Action Scheduler updates, customer tracking links, status/email automation hooks, and the built-in Számlázz.hu bridge. | PRO |
