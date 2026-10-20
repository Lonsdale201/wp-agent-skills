---
name: br-php83-upgrade
description: Upgrade a Better Route consumer from 1.1.2 to 2.0 on PHP 8.3. Use when changing Composer constraints or PHP runtimes, checking readonly DTO dynamic properties, extending authentication interfaces with SensitiveParameter, diagnosing Override failures, or validating the new runtime before deployment. Earlier idempotency migrations remain in br-install-and-migrate.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-10-20"
---

# Better Route 2.0 / PHP 8.3 upgrade

Move an existing Better Route integration to the PHP 8.3 minimum without silently
changing its application API or weakening its authentication and write safeguards.

## Runtime and dependency change

1. Check web/FPM, CLI, cron and long-lived worker PHP versions independently. Upgrade
   all to at least 8.3 before installing 2.0; verify required host plugins/extensions.
2. Change `better-route/better-route` to `^2.0`, update the consumer lockfile and run
   `composer check-platform-reqs --no-dev` under the real deployment runtime. A
   `config.platform` override is a resolver input, not a runtime upgrade.
3. Deploy the matching dependency tree and restart long-lived workers. Smoke test
   the integration's real authorization, reads, writes and retry behavior.

An existing `^1.1` constraint does not install 2.0. PHP 8.1/8.2 consumers need the
older line and an explicit URL-bound Resource ownership policy until a compatible
security fix is installed; see `br-owned-resource-guards`.
The package is a Composer library; it has no standalone WordPress activation step.
For a host plugin that now requires this runtime, update that plugin's own declared
PHP requirement and deployment checks as well.

## Readonly object compatibility

These existing final DTO/policy classes become readonly classes:

- `Http\RequestContext`, `Http\Response`, `Router\RouteDefinition`;
- Woo `AnalyticsQuery`, `CustomerListQuery`, `CouponListQuery`, `OrderListQuery`,
  `ProductListQuery` and `CustomerRolePolicy`.

Declared fields were already readonly. Constructors, named parameters and values
remain unchanged; undeclared dynamic properties now throw. Replace custom property
attachments with `RequestContext::withAttribute()` or separate application state:

```php
$nextContext = $context->withAttribute('tenantId', $tenantId);
return $next($nextContext);
```

The original context remains unchanged. Readonly is shallow: an object referenced
by a DTO can still mutate. Do not treat these objects as deep security boundaries.

## Trace redaction and custom implementations

The library annotates sensitive parameters in concrete credential, JWT/claim,
signature and token-store methods, including nested helpers. Interface parameter
attributes do not propagate to implementations; annotate custom code explicitly:

```php
use BetterRoute\Middleware\Auth\BearerTokenVerifierInterface;

final class ApiTokenVerifier implements BearerTokenVerifierInterface
{
    #[\Override]
    public function verify(#[\SensitiveParameter] string $token): array
    {
        // Verify with the application's issuer/provider before returning claims.
        throw new \RuntimeException('Configure the application token verifier.');
    }
}
```

Redaction applies only to annotated argument frames. It does not scrub exception
messages, object properties, request bodies, globals or arguments passed onward to
PHP builtins, WordPress or external callbacks. Preserve production error-display
restrictions and logging redaction. Test thrown-error paths with argument collection
enabled in a disposable test process; inspect actual trace arguments as well as text.

`#[Override]` checks method implementations at class load time. Apply it to actual
interface/parent method overrides, excluding constructors and properties on PHP 8.3.
Typed constants retain their public names and values. These changes enforce contracts;
do not claim a measured performance gain without profiling the application's workload.

## Preserve existing contracts

Moving from 1.1.2 to 2.0 introduces no storage-schema, cache-key or idempotency-key
migration. Upgrades from older versions still require their earlier coordination;
follow `br-install-and-migrate`. Keep REST namespace and OpenAPI `info.version`
independent of the Composer major when the application's own contract is unchanged.

The ownership helper now authorizes the URL object that the handler uses; merged
query/body IDs cannot select a different object for the ownership decision.

## References

- Migration guide: <https://github.com/Lonsdale201/better-route/blob/main/MIGRATING.md>
- PHP Override: <https://www.php.net/manual/en/class.override.php>
- PHP SensitiveParameter: <https://www.php.net/manual/en/class.sensitiveparameter.php>
- PHP readonly classes: <https://www.php.net/manual/en/language.oop5.basic.php#language.oop5.basic.class.readonly>
- Verified source paths:
  - `composer.json`
  - `src/Http/RequestContext.php`
  - `src/Middleware/Auth/BearerTokenVerifierInterface.php`
  - `src/Middleware/Jwt/Hs256JwtVerifier.php`
  - `tests/Php83HardeningTest.php`
