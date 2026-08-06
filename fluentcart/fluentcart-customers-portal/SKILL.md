---
name: fluentcart-customers-portal
description: >-
  Implements and audits FluentCart customer identity, WP_User linkage,
  addresses, ownership checks, account creation, customer-scoped queries, and
  custom portal endpoints. Use when working with Customer, CustomerResource,
  getCurrentCustomer(), fct_customers, customer-profile REST routes,
  fluent_cart_api() customer-dashboard endpoint registration, customer merges or email
  changes, portal menus, order/subscription ownership, or long-running tests
  that switch users.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "fluent-cart"
  wp-skills-plugin-version-tested: "1.6.0"
  wp-skills-wp-version-tested: "7.0.2"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-06"
---

# FluentCart customers and portal

Treat Customer as the commerce identity and WP_User as an optional login
identity. Enforce ownership for every customer-facing object.

Read [customer-identity.md](references/customer-identity.md) before changing
email/user links, moving resources, or exposing customer data.

## Resolve identity safely

- Customer rows live in fct_customers and may link to WP users by user_id.
- Orders, subscriptions, addresses, licenses, statistics, and labels reference
  Customer IDs, not WP user IDs.
- CustomerResource::getCurrentCustomer() first resolves the logged-in WP user by
  user_id or matching email and may attach that user_id to the existing row.
- Passing true may create a Customer from the current WP user.
- Email matching is a linking operation. Validate verified ownership and
  duplicate/merge consequences before changing an address.

Use Customers/CustomerResource and the normal resource-moving hooks for
coordinated changes. Do not update order and subscription customer_id values
piecemeal.

## Enforce object ownership

CustomerFrontendPolicy only proves that a WP user is logged in. It does not
authorize an arbitrary order, subscription, address, download, or license.

For every custom handler:

1. resolve CustomerResource::getCurrentCustomer();
2. query the requested object with customer_id equal to that customer;
3. reject absent/mismatched objects without revealing whether another customer
   owns them;
4. authorize the requested mutation separately;
5. use FluentCart lifecycle methods for the mutation.

Never authorize solely by UUID, license key, address ID, download ID, or portal
URL.

## Add a portal page

Register at fluent_cart/init or later. Use a unique kebab-case slug that is not
dashboard, purchase-history, subscriptions, licenses, downloads, or profile.

~~~php
fluent_cart_api()->addCustomerDashboardEndpoint('acme-benefits', [
    'title'           => __('Benefits', 'acme-addon'),
    'render_callback' => static function (): void {
        $customer = \FluentCart\Api\Resource\CustomerResource::getCurrentCustomer();
        if (!$customer) {
            return;
        }

        echo '<div>' . esc_html__('Your benefits', 'acme-addon') . '</div>';
    },
]);
~~~

The render callback receives no arguments and echoes content inside the logged-in
portal shell. Escape output and recheck any resource ownership inside it. A
page_id can be supplied instead, but its content must still avoid exposing
unscoped customer data.

## Keep caches request-scoped

CustomerResource caches the current customer statically. Call
resetCurrentCustomerRuntimeCache() between simulated users/requests in PHPUnit,
WP-CLI loops, workers, or multisite switches. Do not let one user's cached
Customer bleed into another iteration.

## Handle account and email changes

- Do not create duplicate WP users merely because an order is paid; core may
  create/link an account according to store/order policy.
- Normalize and validate email, then search both Customer and WP_User collision
  cases.
- Move all connected resources through the normal move/change operation.
- React to fluent_cart/customer_email_changed and
  fluent_cart/customer_resources_moved only after verifying their payload.
- Recount customer statistics after repair/import, not on every read.
- Never include PII in public cache keys, logs, HTML data attributes, or URLs.

## Cross-references

- Use fluentcart-rest-headless for customer-facing endpoints.
- Use fluentcart-orders-transactions for customer order queries.
- Use fluentcart-licensing-pro for Pro license ownership.

## References

- Official customer hooks: <https://dev.fluentcart.com/hooks/actions/customers-users/>
- Verified Free source paths:
  - fluent-cart/app/Models/Customer.php
  - fluent-cart/api/Customers.php
  - fluent-cart/api/Resource/CustomerResource.php
  - fluent-cart/api/Resource/CustomerAddressResource.php
  - fluent-cart/app/Http/Policies/CustomerFrontendPolicy.php
  - fluent-cart/app/Http/Controllers/FrontendControllers/
  - fluent-cart/api/FluentCartGeneralApi.php
  - fluent-cart/app/Hooks/Handlers/ShortCodes/CustomerProfileHandler.php
  - fluent-cart/app/Hooks/Handlers/UserHandler.php
