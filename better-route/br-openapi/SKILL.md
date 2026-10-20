---
name: br-openapi
description: Export and validate Better Route OpenAPI 3.1 documents from Router, Resource and Woo contracts. Use for OpenApiExporter, strictSchemas, nested references, unique operation IDs, WordPress regex paths and args, security schemes and overrides, native WP errors, response envelopes, Woo components or protected openapi.json endpoints.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-10-20"
---

# better-route: OpenAPI 3.1

Export collected contracts directly or publish a protected REST document endpoint.

## Export

```php
use BetterRoute\BetterRoute;

$contracts = array_merge(
    $router->contracts(openApiOnly: true),
    $resource->contracts(openApiOnly: true),
);

$document = BetterRoute::openApiExporter()->export($contracts, [
    'title' => 'My API',
    'version' => '1.0.0', // Your application's API version, independent of Composer.
    'serverUrl' => '/wp-json',
    'strictSchemas' => true,
    'components' => [
        'schemas' => [/* application schemas */],
    ],
]);
```

Contracts exist after route declarations for a Router and after `register()` for a Resource/Woo registrar result.

## Publish openapi.json

```php
use BetterRoute\OpenApi\OpenApiRouteRegistrar;

OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: static fn (): array => OpenApiRouteRegistrar::contractsFromSources([
        $router,
        $resource,
        $woo,
    ]),
    options: [
        'title' => 'My API',
        'version' => '1.0.0', // Your application's API version, independent of Composer.
        // Omit to keep the manage_options default.
        'permissionCallback' => static fn (): bool => current_user_can('view_api_docs'),
    ],
);
```

The registrar mounts `GET /wp-json/myapp/v1/openapi.json`. Its default permission is `current_user_can('manage_options')`. Make it public only deliberately:

```php
'permissionCallback' => static fn (): bool => true,
```

The provider must be callable and return a contract list. `contractsFromSources()`
accepts Router instances, Resource instances and raw contract lists. It passes
`openApiOnly: true` to Router/Resource sources by default; raw lists are shape-checked
and appended. The exporter subsequently applies its `includeExcluded` option.

## Route inclusion

Exclude a route with the actual metadata shape:

```php
$router->get('/internal', $handler)
    ->permission($adminPermission)
    ->meta(['openapi' => ['include' => false]]);
```

Then use `contracts(true)` or the exporter's default `includeExcluded: false`. The obsolete `meta(['openApiOnly' => false])` shape does not control inclusion.

## 1.1 parameter derivation

Executable WordPress route `args` automatically become OpenAPI path/query parameters:

```php
$router->get('/articles/(?P<id>\d+)', $handler)
    ->publicRoute()
    ->args([
        'id' => ['type' => 'integer', 'required' => true],
        'context' => ['type' => 'string', 'enum' => ['view', 'edit']],
    ]);
```

The exporter renders the path as `/myapp/v1/articles/{id}`, puts `id` in `path`, and `context` in `query`. It carries supported schema keys such as enum/default/format/items/min/max/length/pattern.

Explicit `meta.parameters` entries override a derived entry with the same `in` +
`name`. Header names compare case-insensitively; path/query/cookie names remain
case-sensitive. Derived parameters not overridden remain present. Use explicit
metadata for headers/cookies or richer descriptions, not to duplicate every `args` rule.

## Responses

Defaults are:

- POST: `201`;
- OPTIONS: `204` with no JSON body;
- other supported methods: `200`;
- `default`: `ErrorResponse`.

An explicit `meta.responses[status]` replaces the default at that same status:

```php
->meta([
    'responses' => [
        '202' => ['description' => 'Accepted'],
        'default' => ['$ref' => '#/components/responses/ErrorResponse'],
    ],
])
```

`HEAD` and `204` responses are emitted without content.

## Resource envelope schemas

Resource create/update responses are `{data: ...}` and must reference `<Resource>Response`. A get references `<Resource>` unless `uniformEnvelope(true)` is enabled, in which case it also references `<Resource>Response`. Lists use `<Resource>ListResponse`.

In strict mode provide, as applicable:

- `<Resource>`
- `<Resource>Input`
- `<Resource>Response`
- `<Resource>ListResponse`
- `DeleteResponse`

## Security

Declare schemes and document defaults explicitly:

```php
'securitySchemes' => [
    'bearerAuth' => [
        'type' => 'http',
        'scheme' => 'bearer',
        'bearerFormat' => 'JWT',
    ],
],
'globalSecurity' => [['bearerAuth' => []]],
```

`publicRoute()` and explicitly public Resource actions emit operation `security: []`. `protectedByMiddleware('bearerAuth')` or a list of security objects sets route metadata. Better Route does not infer a scheme definition from middleware; the component must still be supplied.

## Components and strict mode

`strictSchemas: true` rejects unresolved local schema references, including nested
`properties`, `items`, composition and `$defs`. Default `false` can supply permissive
placeholders for missing top-level component schemas; it is a compatibility aid,
not proof of a complete contract. Prefer strict mode before releasing clients.

Merge components recursively so Woo and application schema maps do not overwrite one another:

```php
'components' => array_replace_recursive(
    BetterRoute::wooOpenApiComponents(),
    $applicationComponents,
),
```

Woo 1.1 components match runtime strict payloads: money is string-typed, product input excludes derived `price`, customer create requires email, coupon create requires code, and nested objects reject unknown properties where runtime does.

Since 1.1.1, Woo line quantities use `number` (input `exclusiveMinimum: 0`); product stock is `number` or `null`, including negative values. Runtime also requires Woo's stock normalizer to preserve the requested value. Review/regenerate clients that assumed integers. Changing the library version does not automatically change the application's namespace or `info.version`.

Customer updates use a separate input schema without `username`. Metadata documents
map/list/null input forms; coupon custom discount types and native date clearing are
represented. `ErrorResponse` includes the native WordPress `{code,message,data}`
format in addition to the Better Route envelope.

## Collision and security validation

- PUT and PATCH have distinct generated operation IDs (`Update` and `Patch`).
  Regenerate clients that consumed the old duplicate IDs. Multiple Woo registrars
  can supply `operationIdPrefix`.
- Duplicate method/path operations, duplicate operation IDs and equivalent path
  templates such as `/items/{id}` versus `/items/{key}` throw.
- Every referenced security scheme must be defined with a recognized type.
  Malformed security requirements fail configuration. Use the complete external
  validator for required scheme fields, including HTTP `scheme`, and other
  document-level constraints beyond the runtime checks.
- WordPress named captures become path parameters, including balanced nested groups.
  Regex outside captures that cannot be represented as literal OpenAPI path segments
  is rejected; exclude those routes with `meta.openapi.include = false`.
- Runtime checks do not fetch external schema references or replace a complete
  OpenAPI validator. Serialize JSON and validate documents and representative bodies
  with an OpenAPI 3.1 / JSON Schema 2020-12 validator in the application's CI.

For manually registered Analytics reports attach both `WooAnalyticsOpenApi::args()`
and `::meta()`, then merge `BetterRoute::wooOpenApiComponents()`. These components
include Analytics schemas; authentication scheme definitions remain application-owned.

## Review checklist

- Protect the document endpoint unless public exposure is intentional.
- Use `openapi.include`, not `openApiOnly` metadata.
- Derive parameters from `args`; override rather than duplicate.
- Provide envelope schemas required by Resource runtime responses.
- Replace response codes intentionally and document error defaults.
- Define schemes plus global/per-operation security.
- Run strict export in CI and validate the emitted document with an OpenAPI 3.1 validator.

## Related skills

- Use `br-routes` for args, intent, and route metadata.
- Use `br-resource-cpt`/`br-resource-table` for Resource response shapes.
- Use `br-woo-routes` for Woo runtime contracts.

## References

- Verified source paths:
  - `src/OpenApi/OpenApiExporter.php`
  - `src/OpenApi/OpenApiRouteRegistrar.php`
  - `src/OpenApi/OpenApiDocumentValidator.php`
  - `src/OpenApi/OpenApiPath.php`
  - `src/Router/Router.php`
  - `src/Resource/Resource.php`
  - `src/Integration/Woo/WooOpenApiComponents.php`
  - `src/Integration/Woo/WooAnalyticsOpenApi.php`
