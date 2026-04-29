---
name: br-openapi
description: Generate and serve OpenAPI 3.1.0 documentation for a
  better-route API — collect contracts via $router->contracts(), pass
  to BetterRoute::openApiExporter()->export($contracts, $options) for
  the document, OR use OpenApiRouteRegistrar::register() to publish
  it as a live /openapi.json endpoint. Critical v0.3.0 default —
  OpenApiRouteRegistrar's permission is current_user_can(
  'manage_options'); the doc is admin-only by default. To make it
  public, pass 'permissionCallback' => static fn (): bool => true.
  strictSchemas: true throws InvalidArgumentException on unknown $ref
  components instead of substituting the v0.2.0 forgiving default
  ({type: object, additionalProperties: true}); strictSchemas: false
  preserves backwards-compat. Compose with WooCommerce schemas via
  BetterRoute::wooOpenApiComponents() and DTO schemas via
  BetterData\Route\BetterRouteBridge::openApiComponents(). Use when
  exporting OpenAPI docs. Triggers on OpenApiExporter, openApiExporter,
  OpenApiRouteRegistrar, openapi.json.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.4.0"
php-min: "8.1"
last-updated: "2026-04-29"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
---

# better-route: OpenAPI documentation

For developers exporting OpenAPI 3.1.0 documentation for a better-route API. Two paths — generate the document on demand (`OpenApiExporter::export(...)`) or publish it as a live REST endpoint (`OpenApiRouteRegistrar::register(...)`).

## Misconception this skill corrects

> "I added `OpenApiRouteRegistrar::register(...)` and now my staging environment's `/openapi.json` returns 401 to anonymous users — must be a permission cache bug."

It's not a cache bug — that's the v0.3.0 default. Verified at [src/OpenApi/OpenApiRouteRegistrar.php:39-41](OpenApiRouteRegistrar.php):

```php
$permissionCallback = $options['permissionCallback'] ?? static function (): bool {
    return function_exists('current_user_can') && current_user_can('manage_options');
};
```

The default permission is `current_user_can('manage_options')`. Pre-v0.3.0 the doc was public; the v0.3.0 release switched the default to admin-only because OpenAPI docs reveal the entire API surface — useful for internal tooling, dangerous for public exposure.

To restore public access:

```php
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: fn () => $router->contracts(openApiOnly: true),
    options: [
        'permissionCallback' => static fn (): bool => true,   // public
    ],
);
```

Other AI-prone misconceptions:

- "`strictSchemas: true` is the safest default — turn it on everywhere." Half-true. It throws `InvalidArgumentException` on `$ref` to unknown components ([OpenApiExporter.php:33-41](OpenApiExporter.php)). For an internal API where you control every schema reference, that's correct. For a multi-tenant scenario where consumers may pass partial schemas, strict mode breaks generation. Default `false` substitutes `{type: 'object', additionalProperties: true}` which is the forgiving v0.2.0 behavior.
- "I can publish OpenAPI from a `Resource::make` chain without going through the router." Wrong — pass either `Router::contracts()`, `Resource` instance, or a contract array to the registrar. Mixing types causes `InvalidArgumentException` at [OpenApiRouteRegistrar.php:99](OpenApiRouteRegistrar.php).
- "OpenAPI security schemes are derived from middleware automatically." Wrong — declare them explicitly via the `securitySchemes` and `globalSecurity` options. Better-route doesn't introspect your middleware to figure out auth schemes.

## When to use this skill

Trigger when ANY of the following is true:

- The diff calls `BetterRoute::openApiExporter()` or `OpenApiRouteRegistrar::register(...)`.
- The user asks "how do I generate OpenAPI for my better-route API".
- After v0.3.0 upgrade, the OpenAPI endpoint suddenly returns 401.
- Composing WooCommerce / better-data DTO schemas into the export.

## Workflow

### 1. Generate on demand (one-off export)

```php
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');
    // ... routes ...
    $router->register();

    if (defined('WP_CLI') && WP_CLI) {
        return;
    }

    if (!isset($_GET['__export_openapi'])) {
        return;
    }

    $exporter = \BetterRoute\BetterRoute::openApiExporter();
    $document = $exporter->export($router->contracts(), [
        'title'   => 'My API',
        'version' => 'v1.0.0',
    ]);

    header('Content-Type: application/json');
    echo json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
});
```

This is a hand-rolled "export on demand" via a query-string trigger. For production, use the registrar (next step).

### 2. Publish as a live endpoint

```php
use \BetterRoute\OpenApi\OpenApiRouteRegistrar;

add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');
    // ... routes ...
    $router->register();

    OpenApiRouteRegistrar::register(
        restNamespace: 'myapp/v1',
        contractsProvider: static fn () => $router->contracts(openApiOnly: true),
        options: [
            'title'   => 'My API',
            'version' => 'v1.0.0',
        ]
    );
});
```

Mounts at `GET /wp-json/myapp/v1/openapi.json`. Default permission: `current_user_can('manage_options')`.

To make it public:

```php
options: [
    'title'              => 'My API',
    'version'            => 'v1.0.0',
    'permissionCallback' => static fn (): bool => true,
]
```

To restrict to a custom capability:

```php
'permissionCallback' => static fn (): bool => current_user_can('view_api_docs'),
```

The `contractsProvider` is a callable so contracts are computed lazily — only when a client actually requests `openapi.json`. Saves on every page load.

`openApiOnly: true` ([Router::contracts](Router.php) parameter) excludes routes that opted out of OpenAPI inclusion (via `->meta(['openApiOnly' => false])`). Useful for internal-only routes that shouldn't appear in public docs.

### 3. Security schemes

```php
$document = $exporter->export($contracts, [
    'title'         => 'My API',
    'version'       => 'v1.0.0',
    'securitySchemes' => [
        'bearerAuth' => [
            'type'         => 'http',
            'scheme'       => 'bearer',
            'bearerFormat' => 'JWT',
        ],
        'apiKey' => [
            'type' => 'apiKey',
            'in'   => 'header',
            'name' => 'X-API-Key',
        ],
    ],
    'globalSecurity' => [
        ['bearerAuth' => []],   // bearer required globally; per-route override possible
    ],
]);
```

`securitySchemes` declares the auth methods. `globalSecurity` applies to every operation by default. Per-route overrides via `->protectedByMiddleware([['bearerAuth' => ['scope']]])` or `->publicRoute()` (clears security to `[]`).

### 4. strictSchemas

```php
$exporter->export($contracts, [
    'strictSchemas' => true,    // throws on unknown $ref
]);
```

When `true` and a route references `'#/components/schemas/UnknownThing'` that isn't defined in `components`, the exporter throws:

```
InvalidArgumentException: 'OpenAPI $ref points to unknown component schema "#/components/schemas/UnknownThing"'
```

When `false` (default — backwards-compat with v0.2.0), the unknown ref is replaced with `{type: 'object', additionalProperties: true}` — a valid OpenAPI document, but missing the actual shape.

Pick strict mode for internal APIs where you've cataloged every schema. Pick forgiving mode when consumers / extensions pass partial schemas you don't control.

### 5. Compose with WooCommerce + better-data DTO schemas

```php
$exporter = \BetterRoute\BetterRoute::openApiExporter();
$contracts = $router->contracts();

$wooComponents = \BetterRoute\BetterRoute::wooOpenApiComponents();
$dtoComponents = \BetterData\Route\BetterRouteBridge::openApiComponents([
    \MyPlugin\Dto\PostDto::class,
    \MyPlugin\Dto\CreatePostDto::class,
]);

$document = $exporter->export($contracts, [
    'title'         => 'My API',
    'version'       => 'v1.0.0',
    'strictSchemas' => true,
    'components'    => array_merge($wooComponents, $dtoComponents),
    'securitySchemes' => [/* ... */],
    'globalSecurity'  => [/* ... */],
]);
```

`wooOpenApiComponents()` returns the WooCommerce-specific schemas (Order, Product, Customer, Coupon shapes) so routes registered via `wooRouteRegistrar()` resolve their `$ref`s. `BetterRouteBridge::openApiComponents([...])` walks each DTO class and emits its REST schema — feed both into the `components` option.

### 6. Multiple sources in one document

```php
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: function () use ($router1, $router2, $resource) {
        return [
            ...$router1->contracts(openApiOnly: true),
            ...$router2->contracts(openApiOnly: true),
            ...$resource->contracts(),
        ];
    },
    options: [/* ... */]
);
```

Combine routes from multiple routers and resources into one OpenAPI document. The registrar's source detector ([OpenApiRouteRegistrar.php:99](OpenApiRouteRegistrar.php)) accepts arrays of contract objects, Router instances, or Resource instances. Mixing types of those sources throws `InvalidArgumentException`.

## Critical rules

- **Default permission for `OpenApiRouteRegistrar` is `manage_options`** ([OpenApiRouteRegistrar.php:39-41](OpenApiRouteRegistrar.php)). Public docs require `'permissionCallback' => static fn (): bool => true`.
- **`strictSchemas: true` throws on unknown `$ref`.** Use for internal APIs; default `false` substitutes `{type: 'object', additionalProperties: true}`.
- **`securitySchemes` and `globalSecurity` are explicit.** Better-route doesn't infer auth schemes from middleware.
- **`->publicRoute()` clears OpenAPI security to `[]`** for that operation; `->protectedByMiddleware($security)` sets per-operation security.
- **`contractsProvider` is a callable** — contracts compute lazily on request. Don't pass a pre-computed array; you'd snapshot at registration time.
- **`openApiOnly: true` filters out internal routes** marked via `->meta(['openApiOnly' => false])`.
- **`permissionCallback` must be callable.** Throws `InvalidArgumentException` otherwise ([OpenApiRouteRegistrar.php:42-44](OpenApiRouteRegistrar.php)).
- **`restNamespace` must match `vendor/version` format** — verified at [OpenApiRouteRegistrar.php:121](OpenApiRouteRegistrar.php).
- **OpenAPI 3.1.0 output** — most tooling (Swagger UI, Redoc, Postman) supports it; legacy 3.0.x consumers may need conversion.

## Common mistakes

```php
// WRONG — assuming OpenAPI is public by default (post-v0.3.0)
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: fn () => $router->contracts(),
);
// → /openapi.json returns 401 for anonymous users

// RIGHT — explicit public for documentation portals
options: ['permissionCallback' => static fn (): bool => true]

// RIGHT — explicit admin-only for internal docs
// (this is the default, no override needed)

// WRONG — passing pre-computed contracts (frozen at registration time)
$contracts = $router->contracts();   // computed at rest_api_init time
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: fn () => $contracts,
);
// → if routes are added after this point, doc misses them

// RIGHT — lazy callable
contractsProvider: fn () => $router->contracts(openApiOnly: true),

// WRONG — strictSchemas: true with extension-supplied DTOs
$exporter->export($contracts, ['strictSchemas' => true]);
// Some extension's $ref to '#/components/schemas/PluginXThing' isn't in components → throws.

// RIGHT — for extensible APIs, leave strictSchemas: false (default)
// OR explicitly merge in extension components

// WRONG — securitySchemes without globalSecurity
options: [
    'securitySchemes' => ['bearerAuth' => [...]],
    // no globalSecurity
]
// → security schemes defined but no operation references them; tooling shows "auth: none"

// RIGHT — declare both
options: [
    'securitySchemes' => ['bearerAuth' => [...]],
    'globalSecurity'  => [['bearerAuth' => []]],
]

// WRONG — invalid restNamespace format
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp',   // 🔴 missing version
);
// → InvalidArgumentException

// RIGHT — vendor/version format
restNamespace: 'myapp/v1'

// WRONG — permissionCallback as a string (function name as string IS callable in PHP, so this works,
// but the registrar's signature expects callable; pass the closure form for clarity)
options: ['permissionCallback' => 'is_user_logged_in']

// RIGHT — closure
options: ['permissionCallback' => static fn (): bool => is_user_logged_in()]

// WRONG — exposing internal routes in public OpenAPI
OpenApiRouteRegistrar::register(
    restNamespace: 'myapp/v1',
    contractsProvider: fn () => $router->contracts(),   // includes internal routes
    options: ['permissionCallback' => fn () => true],
);
// Public consumers see /api/internal/admin-tools-export.

// RIGHT — filter via openApiOnly + per-route opt-out
$router->get('/internal/admin', $h)->meta(['openApiOnly' => false]);
contractsProvider: fn () => $router->contracts(openApiOnly: true),
```

## Cross-references

- Run **`br-routes`** for `->protectedByMiddleware($security)` and `->publicRoute()` — they affect per-operation OpenAPI security.
- Run **`br-resource-cpt`** / **`br-resource-table`** for Resource-generated route contracts that auto-feed the exporter.
- Run **`br-woo-routes`** for `wooOpenApiComponents()` — WC schema bundle.
- See **`bd-better-route-bridge`** in the better-data folder for `BetterRouteBridge::openApiComponents([...])` — DTO schemas.

## What this skill does NOT cover

- OpenAPI 3.0.x export. Library emits 3.1.0; downgrading requires external conversion.
- AsyncAPI / GraphQL export. Out of scope.
- Postman collection import. Most tooling can import OpenAPI 3.1.0; collections specific to Postman would need a separate exporter.
- Live UI rendering (Swagger UI, Redoc, Stoplight). Library emits the document; mounting a UI is the consumer's choice.
- API versioning across multiple `restNamespace` (e.g. `/v1` vs `/v2` docs). Run two registrars or merge contracts manually.
- Schema diffing / breaking-change detection. External tooling (oasdiff, openapi-diff).

## References

- OpenApiExporter: [libraries/better-route/src/OpenApi/OpenApiExporter.php:33](OpenApiExporter.php) — `export(array $contracts, array $options): array`. Options docblock at lines 22-30. Default `strictSchemas: false` at line 41.
- OpenApiRouteRegistrar: [libraries/better-route/src/OpenApi/OpenApiRouteRegistrar.php:30-44](OpenApiRouteRegistrar.php) — `register(restNamespace, contractsProvider, options)`. Default permission at line 39-41 (`current_user_can('manage_options')`).
- restNamespace format guard: [OpenApiRouteRegistrar.php:121](OpenApiRouteRegistrar.php) — must be `'vendor/version'`.
- Source-type detection: [OpenApiRouteRegistrar.php:99](OpenApiRouteRegistrar.php) — accepts Router / Resource / contract list, throws on others.
- WooCommerce components: [libraries/better-route/src/Integration/Woo/WooOpenApiComponents.php](WooOpenApiComponents.php) — registered via `BetterRoute::wooOpenApiComponents()`.
- BetterRouteBridge::openApiComponents (better-data): [libraries/better-data/src/Route/BetterRouteBridge.php:349](BetterRouteBridge.php).
- OpenAPI 3.1 spec: [https://spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0).
