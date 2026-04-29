---
name: bd-better-route-bridge
description: Compose better-data DTOs with the better-route library —
  use BetterRouteBridge::{get, post, put, patch, delete} to register a
  REST route that hydrates the request into a DTO, validates, calls
  the handler with (DataObject, mixed $request), and presents returned
  DataObject values through Presenter with PresentationContext::rest().
  Critical contract — the bridge is method-name based (talks to Router
  / RouteBuilder by duck-typing) so better-data does NOT take a hard
  Composer dependency on better-route. URL-owned fields go into
  routeFields option (e.g. ['id']) — those are merged from URL params
  AND rejected from JSON / body / query buckets via
  RequestParamCollisionException; this is the route-side equivalent of
  RequestSource::noCollision. Use when wiring DTO-backed REST endpoints,
  feeding DTO schemas into better-route's OpenAPI exporter, or moving
  request data from a route handler into a better-data DataObject.
  Triggers on BetterRouteBridge::get/post/put/patch/delete,
  routeFields, RequestParamCollisionException, OpenAPI / OpenApi DTO
  schema in better-data.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-data
plugin-version-tested: "phase-9"
php-min: "8.3"
last-updated: "2026-04-29"
docs:
  - https://github.com/lonsdale201/better-data
  - https://github.com/lonsdale201/better-route
---

# better-data: Composing with better-route

For developers using better-data and better-route together — DTO-backed REST endpoints, OpenAPI generation from DTO schemas, request hydration into typed `DataObject` instances inside route handlers. The integration seam is the optional `BetterRouteBridge` ([src/Route/BetterRouteBridge.php](BetterRouteBridge.php)); using it correctly keeps the data layer free of router concerns and the router layer free of data-shape concerns.

## Misconception this skill corrects

> "I'll just use `register_rest_route` directly inside my better-data consumer code, parse `WP_REST_Request` myself, and call `MyDto::fromArray($request->get_params())`."

That works for one route. For an API of 10+ routes, it duplicates the request-parsing, validation, route-owned-field, and Presenter-projection wiring at every callsite. The bridge centralizes that pipeline:

1. Register the route on `better-route`'s `Router` via the appropriate HTTP-verb method.
2. On request, hydrate a `WP_REST_Request`-shaped object into the DTO (URL params, JSON body, query string — buckets resolved per `source` option).
3. Reject collisions: a route-owned field like `id` (in the URL `/posts/{id}`) MUST NOT also appear in the JSON body — `RequestParamCollisionException` ([line 194, 680](BetterRouteBridge.php)).
4. Validate the DTO via the `BuiltInValidator`.
5. Call the handler with `(DataObject $dto, mixed $request)`.
6. If the handler returns a `DataObject`, present through `Presenter::for($dto)->context(PresentationContext::rest())`.

Other AI-prone misconceptions:

- "I'll add `better-route/better-route` as a hard runtime dep of better-data so the bridge always works." Wrong — the bridge is deliberately duck-typed by method name ([class docblock at lines 21-26](BetterRouteBridge.php)) so better-data installs without better-route. Don't break that.
- "Permission and middleware concerns are data-layer, so I'll put `permissionCallback` inside the DTO." Wrong — those are route-owned and pass through the bridge's `$options` to better-route's `RouteBuilder`. The data layer doesn't care who's allowed; the route layer does.
- "I'll reimplement better-route's Resource DSL inside better-data so consumers only need one library." Wrong — the bridge composes; it doesn't replace either side. Keep the boundary.

## When to use this skill

Trigger when ANY of the following is true:

- The diff or PR registers a REST route AND uses a `DataObject` for request parsing or response shaping.
- Calls to `BetterRouteBridge::{get, post, put, patch, delete}`.
- The diff modifies `src/Route/BetterRouteBridge.php`.
- OpenAPI exporter setup that includes DTO schemas.
- The consumer asks "how do I get a DTO from `WP_REST_Request`?" or "how do I avoid duplicating request parsing across 20 routes?".

## Workflow

### 1. Read better-route's flow first when behavior is unclear

Don't edit `better-route` from a better-data PR. The relevant files in the sibling repo:

- `../better-route/README.md` — overview.
- `../better-route/src/Router/Router.php` — main entry.
- `../better-route/src/Router/RouteBuilder.php` — fluent builder for one route.
- `../better-route/src/OpenApi/OpenApiExporter.php` — schema export.

Use the bridge as the integration seam; if you find yourself wanting to change better-route to make the bridge work, that's a sign the bridge needs to absorb the concern instead.

### 2. Register a read route

```php
use BetterData\Route\BetterRouteBridge;
use MyPlugin\Dto\PostDto;

$router = my_plugin_get_router();  // returns the better-route Router instance

BetterRouteBridge::get(
    $router,
    '/posts/{id}',
    PostDto::class,
    function (PostDto $dto, $request) {
        // $dto is hydrated from URL params (id in particular)
        // $request is the original better-route / WP_REST_Request-ish object
        return PostDto::fromPost($dto->id);  // re-hydrate from store, return for projection
    },
    [
        'routeFields'        => ['id'],  // 'id' lives in the URL, not in body / query
        'permissionCallback' => 'is_user_logged_in',
    ],
);
```

The handler returns a `DataObject`. The bridge wraps the response through `Presenter::for($returned)->context(PresentationContext::rest())->toArray()`, applying `Sensitive` / `Secret` redaction automatically.

### 3. Register a write route

```php
BetterRouteBridge::post(
    $router,
    '/posts',
    CreatePostDto::class,
    function (CreatePostDto $dto, $request) {
        $id = $dto->saveAsPost();  // via HasWpSinks
        return PostDto::fromPost($id);
    },
    [
        // No routeFields — entire DTO comes from JSON body
        'permissionCallback' => fn () => current_user_can('edit_posts'),
    ],
);
```

For `POST` / `PUT` / `PATCH`, the body is the canonical source. Validation runs before the handler — if the DTO has `#[Rule\Required]` on a missing field, the bridge returns a 4xx with the validation report.

### 4. URL-owned fields and the collision guard

Verified at [BetterRouteBridge.php:244-249, 661-680](BetterRouteBridge.php):

```php
// In options:
['routeFields' => ['id', 'slug']]

// At dispatch time:
self::assertNoRouteFieldCollisions($request, ['id', 'slug']);
// Throws RequestParamCollisionException::forFields(['id']) if 'id' appears in BOTH the URL and the JSON body.
```

Why: a request `PUT /posts/5` with `{"id": 7, "title": "..."}` is ambiguous — does the user want to update post 5 with the new id 7, or did they accidentally include a stale id? The bridge rejects the request to surface the bug. This is the route-side equivalent of `RequestSource::noCollision` for JSON/body/query buckets.

### 5. Bucket selection via `source` option

The `source` option (default `'auto'`) controls where the bridge looks for non-route fields:

| Value | Meaning |
|---|---|
| `'auto'` | Pick by HTTP method — body for write, query for read |
| `'merged'` | Merge JSON + body + query into one bag (loose) |
| `'json'` | Only the JSON-decoded body |
| `'body'` | Form-encoded body |
| `'query'` | URL query string |
| `'url'` | Only the URL params (degenerate — combine with `routeFields`) |

For most routes, `'auto'` is correct. Use a specific value when you need to lock down where data comes from (security-sensitive endpoint that ignores query strings, etc.).

### 6. Generate `args` and `meta` automatically

Better-route's `RouteBuilder` accepts `args(...)` (REST args schema) and `meta(...)` (request metadata). The bridge fills both from the DTO automatically:

```php
// Inside register():
$args = MetaKeyRegistry::toRestArgs($dtoClass);   // produces the args spec
$meta = MetaKeyRegistry::toJsonSchema($dtoClass); // produces JSON schema
```

For OpenAPI integration:

```php
$exporter = BetterRoute::openApiExporter();
$components = BetterRouteBridge::openApiComponents([
    PostDto::class,
    CreatePostDto::class,
    UpdatePostDto::class,
]);
$exporter->addComponents($components);
```

`openApiComponents` ([line 349](BetterRouteBridge.php)) walks each DTO class, extracts its REST schema via `RestSchemaBuilder`, and returns a `components.schemas`-shaped array.

### 7. Permission and middleware stay route-owned

```php
BetterRouteBridge::post($router, '/posts', CreatePostDto::class, $handler, [
    'permissionCallback' => fn () => current_user_can('edit_posts'),
    'middlewares'        => [
        new RateLimitMiddleware(60, 'minute'),
        new AuditLogMiddleware('post_create'),
    ],
]);
```

The bridge passes both options straight to better-route's `RouteBuilder::permissionCallback(...)` and `->middleware(...)`. Don't introduce auth-related abstractions in the data layer.

### 8. Tests

Bridge unit tests ([tests/Unit/BetterRouteBridgeTest.php](BetterRouteBridgeTest.php)) use fake `Router` / `RouteBuilder` / request objects — no WP, no real better-route required. The fakes implement the duck-typed methods (`get`, `post`, `args`, `meta`, etc.) and assert the bridge invokes them with the expected arguments.

Live-WP behavior (real `register_rest_route`, real WP request parsing) goes in the companion plugin's smoke / stress suite.

```bash
vendor/bin/phpunit --filter BetterRouteBridge
vendor/bin/phpstan analyse --memory-limit=1G
vendor/bin/php-cs-fixer fix
wp better-data stress --filter BridgeRoute
```

## Critical rules

- **Use the bridge as the integration seam, not direct `register_rest_route` from data-layer code.** Centralizes hydration, validation, route-fields, and Presenter projection.
- **Method-name duck typing.** The bridge talks to `Router` / `RouteBuilder` by method name; don't add a hard Composer dependency on `better-route/better-route`. Better-data must install standalone.
- **`routeFields` for URL-owned fields.** Always set when the DTO has a parameter that's bound to a URL placeholder. Without it, you get JSON-body-vs-URL collisions silently.
- **`RequestParamCollisionException` is loud and intentional.** Don't catch and ignore — the request is genuinely ambiguous.
- **Permission and middleware stay route-owned.** Pass through the `$options` bag; don't introduce auth abstractions in better-data.
- **Don't reimplement better-route's Resource DSL.** The bridge composes existing primitives.
- **`MetaKeyRegistry::toRestArgs` / `toJsonSchema`** generate the schema; don't duplicate that work in the consumer.
- **Returned DTO → Presenter::rest() projection automatically.** Don't manually `->toArray()` from the handler — that bypasses sensitive-field redaction.
- **Bridge tests use fakes.** Don't require WP or better-route in unit tests.

## Common mistakes

```php
// WRONG — register_rest_route directly, bypassing the bridge
\register_rest_route('myplugin/v1', '/posts/(?P<id>\d+)', [
    'callback' => function (\WP_REST_Request $req) {
        $dto = PostDto::fromArray((array) $req->get_params());  // 🔴 no routeFields, no validation, no projection
        return PostDto::fromPost($dto->id)->toArray();          // 🔴 bypasses Presenter redaction
    },
]);

// RIGHT — through the bridge
BetterRouteBridge::get($router, '/posts/{id}', PostDto::class,
    fn (PostDto $dto) => PostDto::fromPost($dto->id),
    ['routeFields' => ['id']],
);

// WRONG — hard Composer dep on better-route
// composer.json: "require": { "better-route/better-route": "^1.0" }
// Now better-data can't be installed standalone for testing.

// RIGHT — soft dep, duck-typed
// composer.json: "suggest": { "better-route/better-route": "Optional REST router integration" }

// WRONG — missing routeFields
BetterRouteBridge::put($router, '/posts/{id}', UpdatePostDto::class, $handler, [
    // No 'routeFields' option
]);
// Request: PUT /posts/5 with {"id": 7, "title": "..."} — handler gets DTO with id=7, the URL '5' is silently lost.

// RIGHT
BetterRouteBridge::put($router, '/posts/{id}', UpdatePostDto::class, $handler, [
    'routeFields' => ['id'],  // forces id from URL, rejects collision in body
]);

// WRONG — auth in the DTO
final readonly class PostDto extends DataObject {
    public function __construct(
        public int $id = 0,
        public string $title = '',
    ) {
        if (!\current_user_can('edit_posts')) {  // 🔴 DTO is data shape, not auth gate
            throw new \RuntimeException('Unauthorized');
        }
    }
}

// RIGHT — auth in the bridge options
BetterRouteBridge::put($router, '/posts/{id}', PostDto::class, $handler, [
    'permissionCallback' => fn () => \current_user_can('edit_posts'),
    'routeFields'        => ['id'],
]);

// WRONG — manual ->toArray() in the handler
function (PostDto $dto) {
    return PostDto::fromPost($dto->id)->toArray();  // bypasses Presenter
}

// RIGHT — return the DTO; bridge presents
function (PostDto $dto) {
    return PostDto::fromPost($dto->id);
}
// Bridge applies Presenter::for($returned)->context(PresentationContext::rest())->toArray()
// → Sensitive / Secret fields automatically redacted.

// WRONG — duplicating schema generation
function ($dto) {
    return [
        'id' => ['type' => 'integer'],
        'title' => ['type' => 'string'],
        // ... handwritten REST schema
    ];
}

// RIGHT — let MetaKeyRegistry handle it
$args = MetaKeyRegistry::toRestArgs($dtoClass);
```

## Cross-references

- Run **`bd-data-object`** when designing the DTO that backs a route — DTO + route design co-evolve.
- Run **`bd-presenter`** when the route response needs custom shaping beyond default redaction (computed fields, locale switching).
- Run **`bd-security`** when the route DTO carries `Secret` / `#[Sensitive]` fields — verify Presenter redaction is in effect at the response boundary.

## What this skill does NOT cover

- Better-route's own routing semantics (uri patterns, middleware ordering, openapi customization). Read `../better-route/README.md`.
- Caching of REST responses. Better-route handles cache headers; the data layer doesn't.
- WebSocket / SSE / streaming responses. Bridge is request-response only.
- Rate limiting, throttling — better-route middlewares.
- Authentication mechanisms (JWT, OAuth, …) — `permissionCallback` consumes the resolved current user; auth is upstream.
- GraphQL / RPC bindings. Bridge is REST-only.

## References

- Bridge file: [libraries/better-data/src/Route/BetterRouteBridge.php](BetterRouteBridge.php) — `final class BetterRouteBridge`. Class docblock with the duck-typing rationale at lines 21-26.
- HTTP verb entry points: [BetterRouteBridge.php:55-110](BetterRouteBridge.php) — `get`, `post`, `put`, `patch`, `delete` — all delegate to `register()`.
- Route-field collision: [BetterRouteBridge.php:661-680](BetterRouteBridge.php) — `assertNoRouteFieldCollisions` throws `RequestParamCollisionException`.
- Source bucket selection: [BetterRouteBridge.php:48](BetterRouteBridge.php) — `SOURCES = ['auto', 'merged', 'json', 'body', 'query', 'url']`.
- OpenAPI integration: [BetterRouteBridge.php:349](BetterRouteBridge.php) — `openApiComponents(array $dtoClasses): array`.
- `MetaKeyRegistry::toRestArgs` / `toJsonSchema`: [libraries/better-data/src/Registration/MetaKeyRegistry.php](MetaKeyRegistry.php) — schema generation.
- `RequestSource::noCollision`: [libraries/better-data/src/Source/RequestSource.php](RequestSource.php) — the source-side collision guard the bridge mirrors.
