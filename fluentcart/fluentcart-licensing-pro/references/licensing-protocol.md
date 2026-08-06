# FluentCart Pro 1.6.0 licensing protocol

## Module boundary

The Pro module owns these records:

- fct_licenses: entitlement/key, owner, product/variation/order/subscription,
  status, limit and expiration;
- fct_license_sites: normalized installation identity and environment data;
- fct_license_activations: license-to-site binding and activation hash;
- fct_license_meta: extension metadata.

Use relationships/services so counts and lifecycle hooks remain consistent.

## Lifecycle map

~~~text
paid initial order -> generate configured product/variation licenses
subscription renewal/data update -> align license validity
subscription validity expiry -> expire
reactivation -> reactivate eligible disabled license
payment failure/full refund -> disable under current policy
order deletion -> delete unless filtered
customer merge/change -> move license ownership
~~~

LicenseGenerationHandler is the source of truth for exact event and order-type
conditions in the installed release. An addon should react to emitted license
events rather than running a second generator.

## Public client operations

| Operation | Minimum credential binding |
|---|---|
| check_license | key or activation hash, item, normalized site |
| activate_license | key, item, normalized site |
| deactivate_license | key, item, normalized site/activation context |
| get_license_version | license/activation context and item |
| download_license_package | validated entitlement and protected package |

These are intentionally public machine-to-machine endpoints. CSRF nonces do not
solve their authorization; the secret and object bindings do. Apply abuse
limits and avoid distinguishable enumeration responses where compatibility
allows.

## Package token warning

The 1.6.0 get-version handler builds fct_package by base64-encoding colon-
separated license, activation, site, product and expiry data. The corresponding
download parser reads the first four fields but does not visibly verify the
fifth expiry field. Base64 also supplies no integrity.

Consequences for extension work:

- do not describe this token as cryptographically signed;
- do not copy it into a new API;
- do not rely on the embedded timestamp without a source-confirmed check;
- re-audit the installed handler after every update;
- use an HMAC with constant-time verification and enforced expiry, or an opaque
  random server-side token, for new protocols.

Continue to validate current license status, product binding and activation at
download time even when a token is tamper-evident.

## Client compatibility

Version/update clients must tolerate the installed endpoint's status/error
conventions. HTTP 200 can carry an invalid license result in selected actions.
Parse both transport status and body fields, redact secrets from errors, and
back off rather than repeatedly activating after a network ambiguity.
