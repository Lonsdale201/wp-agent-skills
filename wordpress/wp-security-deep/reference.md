# WordPress deep security reference

## Remote control-plane and executable response trust

Treat remote responses as attacker-controlled even when the request uses HTTPS,
authentication, and a fixed vendor host. Those controls protect transport and
identity; they do not make a compromised vendor response safe to execute.

Trace response fields into privileged sinks, especially:

- `$wpdb->query()`, `get_results()`, or another API that executes returned SQL;
- `include`/`require`, dynamic callbacks/classes, templates, regexes, or paths;
- `site_transient_update_plugins`, `plugins_api`, `download_url()`, archive
  extraction, or another plugin/theme installation path;
- capabilities, feature flags, redirect destinations, or security policy.

Remote-generated SQL is not made safe by `$wpdb->prepare()` around a few local
placeholders. It delegates the WordPress database user's full statement
authority to the remote service, and `get_results()` does not enforce read-only
semantics. Keep executable query definitions local and versioned; let the
service return only an allowlisted query ID plus schema-validated parameters.

For private updates, require valid TLS, an exact HTTPS host allowlist for both
metadata and package redirects, a bounded response, and a package signature or
digest rooted outside the same mutable response. A checksum supplied beside a
malicious package by the same compromised endpoint is not an independent trust
anchor. Never use `sslverify => false` as an environment workaround.

Classify the complete chain and state its trigger. A network/upstream attacker
who can return arbitrary SQL has database impact when the affected report runs;
a malicious package reaches PHP execution only when automatic or administrator-
initiated installation occurs. Do not describe either prerequisite as anonymous
direct RCE, but do not reduce a demonstrated update-to-code-execution chain to a
generic HTTP hardening note.

### Remediation invariant

Keep privileged policy and executable content local, minimize the remote
response vocabulary, validate its schema and semantics, and fail closed. For
reporting, map a remote `report_id` to a local query definition. For private
updates, validate metadata and package hosts independently and verify the package
against a separately trusted signing key or manifest.

### Tests

- Stub the HTTP response with valid JSON containing destructive SQL and assert
  that no SQL sink receives it.
- Return an HTTPS package URL on an unapproved host and through redirects; every
  hop must be rejected.
- Return a package and matching attacker-chosen checksum in the same response;
  installation must still fail without the independent trust anchor.
- Test invalid TLS, oversized/malformed metadata, unknown query/update IDs, and
  missing/extra fields as fail-closed cases.
