---
name: fluentcart-licensing-pro
description: >-
  Implements and audits FluentCart Pro product licensing, license generation,
  activation limits, site activation/deactivation, customer/admin access,
  subscription validity, refunds, update checks, package delivery, and legacy
  EDD-compatible clients. Use when working with the Pro Licensing module,
  LicenseManager, LicenseHelper, fct_licenses, fct_license_activations,
  fluent_cart_action_* license endpoints, license lifecycle hooks, protected
  plugin downloads, local/staging activations, or license migrations.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart-pro"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart Pro licensing

This skill is Pro-only. Verify FluentCart Pro is active and the license module
is enabled before using its models, routes, tables, or hooks.

Read [licensing-protocol.md](references/licensing-protocol.md) before extending
generation, activation, update delivery, or client compatibility.

## Configure products through the module

Use the Licensing module's product settings and LicenseManager/LicenseHelper
services. Do not create keys or activation rows with ad-hoc SQL. The module
relates licenses to customer, order, product, variation, subscription, sites,
activations, and meta, and applies lifecycle rules to those relations.

Feature-detect ModuleSettings::isActive('license') and Pro classes after
fluent_cart/init. A product being downloadable or subscription-based does not
itself mean licensing is enabled for that variation.

## Follow the commerce lifecycle

The built-in handler generates licenses after fluent_cart/order_paid for
initial payment/subscription orders; extends validity on subscription renewal;
reactivates where appropriate; and disables/expires/deletes licenses according
to payment failure, full refund, validity expiry, order deletion, and module
policy.

Listen to license-specific hooks for addon side effects instead of duplicating
generation. Make extensions replay-safe: payment/webhook and repair flows may
re-enter lifecycle code. Preserve the distinction among active, disabled, and
expired plus the stored reason and previous status.

Do not revoke automatically on every transient renewal failure unless that is
the explicit access policy. Subscription grace, next billing date, cancellation
at period end, EOT, refund, and manual administration are separate decisions.

## Treat credentials and activations as bearer authority

License keys and activation hashes are secrets. Never log them in full, expose
them in public REST serializers, place them in analytics/referrers, or accept a
license ID alone as authorization. Normalize the site URL through LicenseHelper
and validate product/item binding on every check, activation, deactivation,
version, and package request.

Activation must be concurrency-safe around the limit. Test simultaneous first
activations and activation/deactivation races; a read-count-create-recount
sequence alone is not proof of atomic enforcement.

Customer-profile endpoints require WordPress login and must remain scoped to
the resolved FluentCart customer. Admin endpoints use LicensePolicy permissions
such as licenses/view, licenses/manage, and licenses/delete.

## Use the public protocol as installed

License client calls enter FluentCart's public action dispatcher and map to
check_license, activate_license, deactivate_license, get_license_version, and
download_license_package handlers. Match the installed request/response shape
and distinguish transport HTTP success from the returned license status/error.

Do not reuse fct_package as a general-purpose signed URL scheme. In the tested
1.6.0 source it is a base64-encoded credential payload, and the download parser
does not consume the appended expiry field as a verified cryptographic claim.
Use the built-in path only for required compatibility, keep TTL/authorization
under version-specific audit, and implement new protected delivery with a
server-held, tamper-evident, expiring token or opaque one-time record.

## Protect package and update delivery

- Store packages outside direct public access or behind controlled storage.
- Resolve the current entitled product/variation and valid activation again at
  download time.
- Validate expiry server-side and prevent path traversal/open redirects.
- Stream or redirect using the storage driver's safe contract.
- Rate-limit checks, activation, version and package endpoints.
- Avoid leaking whether arbitrary keys or customer emails exist.
- Record redacted audit events and provider/client version for reconciliation.

## Test matrix

Test disabled module/Pro absence, one-time and subscription products, quantity
and variation license settings, duplicate paid event, payment failure, full and
partial refund, renewal/grace/expiry/EOT/reactivation, key regeneration, limit
change, local/staging classification, normalized URL variants, concurrent limit
race, activation replay, wrong item/site/hash, customer cross-account access,
admin capability boundaries, expired/tampered package URL, update response, and
legacy EDD client compatibility.

## Cross-references

- Use fluentcart-subscriptions-renewals for validity timing.
- Use fluentcart-downloads-storage for protected files.
- Use fluentcart-rest-headless for public/customer/admin authorization.
- Use fluentcart-migration for EDD license migration.

## References

- Verified Pro source paths:
  - fluent-cart-pro/app/Modules/Licensing/Licensing.php
  - fluent-cart-pro/app/Modules/Licensing/Models/
  - fluent-cart-pro/app/Modules/Licensing/Services/LicenseManager.php
  - fluent-cart-pro/app/Modules/Licensing/Services/LicenseHelper.php
  - fluent-cart-pro/app/Modules/Licensing/Hooks/Handlers/
  - fluent-cart-pro/app/Modules/Licensing/Http/licensing-api.php
  - fluent-cart-pro/app/Http/Policies/LicensePolicy.php
