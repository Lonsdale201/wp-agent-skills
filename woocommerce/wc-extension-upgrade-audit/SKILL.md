---
name: wc-extension-upgrade-audit
description: Audit a WooCommerce extension against a target WooCommerce release by diffing installed source, mapping public contracts, finding internal API dependencies, and running version-aware smoke tests. Covers hooks, CRUD timing, REST and Store API schemas, feature gates, templates, taxonomies, Action Scheduler, admin surfaces, caches, and companion gateways. Use before raising `WC tested up to`, after updating WooCommerce, or when an extension works on one Woo version but changes behavior on another.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "woocommerce"
  wp-skills-plugin-version-tested: "11.0.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-05"
---

# WooCommerce extension upgrade audit

Use this skill to produce evidence for compatibility, not merely to change a version header. Changelogs identify likely areas; installed release source and runtime behavior establish the contract actually shipped.

When the audit crosses from WooCommerce 10.9 or older to 11.0 or newer, read [references/woocommerce-11.md](references/woocommerce-11.md) before changing code.

## Workflow

### 1. Establish exact baselines

Record:

- source and target WooCommerce versions;
- WordPress and PHP versions;
- active HPOS, block checkout, email, fulfillment, and experimental feature states;
- bundled/active Action Scheduler version;
- companion extensions in scope, such as Stripe or Subscriptions.

Do not infer the runtime Action Scheduler version from WooCommerce's bundled directory alone. WordPress loads the newest registered copy.

### 2. Inventory the extension's contracts

Search its PHP, JavaScript, templates, tests, and build metadata for:

- Woo hooks and filters, including accepted argument counts;
- Woo CRUD classes, data stores, direct meta access, custom SQL, and internal namespaces;
- `/wc/v3`, `/wc/v4`, `/wc/store/v1`, AJAX, and `wc-ajax` consumers;
- template overrides and copied JS/CSS handles;
- feature IDs and raw option checks;
- product/order taxonomies and queried-object assumptions;
- Action Scheduler uniqueness, status, cleanup, and CLI assumptions;
- Checkout Blocks payment method registration and `@woocommerce/*` package contracts.

Classify each dependency as public documented API, public hook, de facto legacy surface, internal API, or copied implementation detail. Internal namespace use is an upgrade risk even if it still exists.

### 3. Diff behavior, not filenames

Compare the exact old and new release source around every inventoried contract. Check:

- hook position, argument order, return semantics, and whether persistence occurs before or after the hook;
- route method, permission callback, schema, defaults, normalization, and error status;
- default feature state for new installs versus upgraded stores;
- template version headers and required DOM/data attributes;
- cache invalidation and object lifetime;
- bundled-library semantic changes.

Do not assume an added source controller means a live route. Verify registration gates and the runtime route table.

### 4. Patch through stable boundaries

Prefer WooCommerce CRUD, public utility classes, documented hooks, and runtime feature/route discovery. Avoid importing `Automattic\WooCommerce\Internal` classes. Preserve fallback behavior when a target API is source-gated or experimental.

Do not force-enable core experimental features from an extension. Test the extension with the feature both off and on when the target version can expose either state.

### 5. Smoke the deployed matrix

At minimum verify:

- plugin activation and a request with `WP_DEBUG`/logging enabled;
- one create/read/update/delete round-trip for each owned Woo object;
- classic and block checkout surfaces used by the extension;
- HPOS authoritative and compatibility modes if orders are touched;
- exact REST routes and schemas after `rest_api_init`;
- scheduled-action enqueue, duplicate prevention, execution, failure, and cleanup;
- feature-gated paths in both states;
- templates or DOM integrations against the target files.

Use disposable records and remove them after the test. Never exercise real payment capture, refunds, outbound email, or destructive production jobs in a smoke test.

### 6. Report evidence and residual risk

State the exact versions tested, behaviors observed, files changed, tests run, and surfaces not exercised. Raise `WC tested up to` only after the declared supported matrix passes. A passing syntax check alone is not compatibility evidence.

## Related skills

Route to the narrow skill after inventory: `wc-hpos-compatibility`, `wc-store-api`, `wc-rest-api-v4`, `wc-action-scheduler-jobs`, `wc-checkout-block-payment-method`, `wc-product-crud-cache`, `wc-order-lifecycle-and-items`, `wc-shipping-method`, `wc-emails-classic`, or the relevant Stripe/Subscriptions skill.

## References

- [WooCommerce 11.0 compatibility breakpoints](references/woocommerce-11.md)
- Official developer releases: <https://developer.woocommerce.com/releases/>
- WooCommerce source releases: <https://github.com/woocommerce/woocommerce/releases>

