# FluentCart 1.6.0 customer identity

## Identity graph

~~~text
WP_User (optional login)
   | user_id or verified email link
Customer
   |-- CustomerAddress rows
   |-- Orders -> items / transactions / order addresses
   |-- Subscriptions
   |-- Download permissions
   |-- Pro licenses and activations
~~~

Order addresses are snapshots. Updating a customer's primary address must not
silently rewrite historical invoice/order addresses.

## Current customer resolution

CustomerResource::getCurrentCustomer():

1. returns null for anonymous requests;
2. loads the current WP_User;
3. queries Customer where user_id matches OR email matches;
4. eager-loads billing/shipping addresses;
5. attaches user_id when an email match has no/different link;
6. optionally creates a Customer;
7. stores the result in a static runtime cache.

This makes email uniqueness and account-email changes security-sensitive.

## Ownership query pattern

Resolve the current customer first, then include customer_id in the same query
that resolves the opaque identifier. Avoid loading by UUID and checking later
when a scoped query is possible.

Return the same not-found response for absent and foreign objects. Apply
capability checks in addition to ownership for privileged/admin functions.

## Resource moves

A customer merge/change can affect orders, child renewal orders, transactions,
subscriptions, addresses, labels, download permissions, integrations, and Pro
licenses. Use source-verified core movement logic and listen to
customer_resources_moved for addon-owned foreign rows. Make the addon callback
transactional or resumable and idempotent by from/to customer IDs.

## Test matrix

Test anonymous, linked WP user, email-only legacy customer, email collision,
customer with two addresses, resource merge, user email change, deleted WP user,
two simulated users in one process, foreign UUID access, and multisite switching.
