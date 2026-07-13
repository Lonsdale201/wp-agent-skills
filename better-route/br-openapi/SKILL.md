---
name: br-openapi
description: Generate or serve better-route 1.1 OpenAPI 3.1 documents from Router/Resource/Woo contracts. Use for OpenApiExporter, OpenApiRouteRegistrar, contracts, contractsFromSources, route args to parameters, explicit parameter overrides, custom responses, OPTIONS 204, strictSchemas, components, securitySchemes, globalSecurity, publicRoute security, Resource response envelopes, Woo schemas, or openapi.json permissions.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "1.1.0"
php-min: "8.1"
last-updated: "2026-07-13"
source-refs:
  - src/OpenApi/OpenApiExporter.php
  - src/OpenApi/OpenApiRouteRegistrar.php
  - src/Router/Router.php
  - src/Resource/Resource.php
  - src/Integration/Woo/WooOpenApiComponents.php
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
    'version' => 'v1.1.0',
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
        'version' => 'v1.1.0',
        // Omit to keep the manage_options default.
        'permissionCallback' => static fn (): bool => current_user_can('view_api_docs'),
    ],
);
```

The registrar mounts `GET /wp-json/myapp/v1/openapi.json`. Its default permission is `current_user_can('manage_options')`. Make it public only deliberately:

```php
'permissionCallback' => static fn (): bool => true,
```

The provider must be callable and return a contract list. `contractsFromSources()` accepts a mixed list of Router instances, Resource instances, and contract lists and filters each source with `openApiOnly: true` by default.

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

Explicit `meta.parameters` entries override a derived entry with the same case-insensitive `in` + `name`; derived parameters not overridden remain present. Use explicit metadata for headers/cookies or richer descriptions, not to duplicate every `args` rule.

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

`strictSchemas: true` throws when a referenced `#/components/schemas/...` is absent. Default `false` inserts a permissive object schema for compatibility. Prefer strict mode for a controlled API contract.

Merge components recursively so Woo and application schema maps do not overwrite one another:

```php
'components' => array_replace_recursive(
    BetterRoute::wooOpenApiComponents(),
    $applicationComponents,
),
```

Woo 1.1 components match runtime strict payloads: money is string-typed, product input excludes derived `price`, customer create requires email, coupon create requires code, and nested objects reject unknown properties where runtime does.

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
