---
name: br-routes
description: Register custom REST routes via better-route's fluent
  Router — BetterRoute::router('vendor', 'v1') gives a Router with
  ->get / ->post / ->put / ->patch / ->delete / ->options returning a RouteBuilder
  for fluent options (->permission, ->protectedByMiddleware,
  ->publicRoute, ->meta, ->middleware). Critical v0.4.0 rule — POST /
  PUT / PATCH / DELETE without an explicit permission declaration deny
  by default at the WP layer (return 403 before the handler runs); GET
  and OPTIONS are public by default. Use ->permission(callable) for WP capability checks,
  ->protectedByMiddleware($security) when an auth middleware handles
  authentication, ->publicRoute() for intentionally public endpoints.
  Route handlers receive ID from URL route params first (query / body
  ID is consulted only when URL doesn't supply one). Inbound
  X-Request-ID is accepted only if it matches ^[A-Za-z0-9._:-]{1,128}$.
  Use when registering custom (non-WooCommerce) REST routes. Triggers
  on BetterRoute::router, $router->get/post/put/patch/delete/options, RouteBuilder.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.5.0"
php-min: "8.1"
last-updated: "2026-05-01"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
source-refs:
  - src/Router/Router.php
  - src/Router/RouteBuilder.php
  - src/Router/RouteDefinition.php
  - src/Router/RouteMeta.php
  - src/Router/WordPressRestDispatcher.php
  - src/Router/ArgumentResolver.php
  - src/Http/Response.php
  - src/Http/RequestContext.php
  - src/Http/ApiException.php
  - src/BetterRoute.php
---

# better-route: Custom REST routes (Router)

For developers registering custom REST endpoints via better-route's fluent Router. Covers route declaration, the v0.4.0 deny-by-default rule for write methods, route grouping with shared middleware, and how route parameters resolve.

## Misconception this skill corrects

> "I added `$router->post('/articles', $handler)` and the handler never runs — I get 403. Must be a CORS issue."

It's not CORS. Verified at [src/Router/RouteBuilder.php:42-72](RouteBuilder.php) — since v0.4.0, every write method (POST / PUT / PATCH / DELETE) requires an explicit permission declaration, otherwise the route registers with a deny-all permission callback and WordPress returns 403 before your handler ever runs.

The fix is one of three explicit declarations:

```php
$router->post('/articles', $handler)
    ->permission(static fn () => current_user_can('edit_posts'));   // WP capability check

$router->post('/secure', $handler)
    ->protectedByMiddleware('bearerAuth');                            // auth middleware handles it

$router->post('/webhooks/stripe', $handler)
    ->publicRoute();                                                  // intentionally public
```

GET and OPTIONS are unaffected — `$router->get('/foo', $handler)` and `$router->options('/foo', $handler)` stay public by default.

Other AI-prone misconceptions:

- "I'll combine `->protectedByMiddleware()` with `->permission(custom_logic)` for belt-and-suspenders auth." Wrong — `protectedByMiddleware()` ([RouteBuilder.php:63-70](RouteBuilder.php)) internally calls `$this->permission(static fn (): bool => true)` so the WP layer always allows the request through to the middleware pipeline. A subsequent `->permission(...)` overrides that, defeating the middleware delegation.
- "Route registration can happen anywhere — I'll register on `init` or `plugins_loaded` to avoid late-loading." Wrong — must be inside `rest_api_init`. Earlier hooks fire before WP's REST infrastructure is built.
- "URL `id`, query `id`, and body `id` are merged equally." Wrong — handlers receive route-URL `id` first; query / body `id` is consulted only when the URL doesn't provide one. This is the Router's parameter resolution order.

## When to use this skill

Trigger when ANY of the following is true:

- Calling `BetterRoute::router(...)`.
- Registering routes via `$router->{get, post, put, patch, delete, options}`.
- Reviewing a PR that adds REST routes via better-route.
- Triaging post-v0.4.0 403s on write endpoints.
- Setting up route groups with shared middleware.

## Workflow

### 1. Get a Router

```php
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');

    // ... routes ...

    $router->register();
});
```

The arguments are `vendor` and `version` — they form the REST namespace as `myapp/v1`. Mounted at `/wp-json/myapp/v1/...`.

### 2. Declare routes

Each method on `Router` returns a `RouteBuilder` for further configuration:

```php
$router->get('/ping', function ($context) {
    return \BetterRoute\Http\Response::ok(['pong' => true]);
});

$router->get('/articles/{id}', function ($context) {
    $id = (int) $context->params['id'];
    return \BetterRoute\Http\Response::ok(/* ... */);
});

$router->post('/articles', $createArticleHandler)
    ->permission(static fn () => current_user_can('edit_posts'));

$router->put('/articles/{id}', $updateArticleHandler)
    ->permission(static fn () => current_user_can('edit_posts'));

$router->delete('/articles/{id}', $deleteArticleHandler)
    ->permission(static fn () => current_user_can('delete_posts'));

$router->options('/articles', static fn () => null);   // preflight route, public by default
```

The handler signature is `function ($context): mixed`. Return:

- A `\BetterRoute\Http\Response` instance.
- A plain array → wrapped as 200 OK by `ResponseNormalizer`.
- A `WP_REST_Response` → passed through.
- A `\BetterRoute\Http\ApiException` (thrown) → normalized to the standard error envelope.

### 3. Pick the right intent for write routes

```php
// Pattern A — WordPress capability gate
$router->post('/articles', $handler)
    ->permission(static fn () => current_user_can('edit_posts'));

// Pattern B — auth middleware handles it
$router->post('/secure/articles', $handler)
    ->protectedByMiddleware('bearerAuth');

// With explicit OpenAPI security scopes:
$router->post('/secure/articles', $handler)
    ->protectedByMiddleware([['bearerAuth' => ['write:articles']]]);

// Pattern C — intentionally public
$router->post('/webhooks/stripe', $stripeWebhookHandler)
    ->publicRoute();

$router->post('/health', $healthHandler)
    ->publicRoute();
```

`->publicRoute()` ([RouteBuilder.php:51-57](RouteBuilder.php)) sets WP permission to `__return_true` AND clears the OpenAPI `security` meta to `[]` — so even when you have `globalSecurity: [['bearerAuth' => []]]` in the export, this route appears as unauthenticated.

`->protectedByMiddleware($security)` ([RouteBuilder.php:63-70](RouteBuilder.php)) sets WP permission to `__return_true` AND tags the route with `protectedByMiddleware: true` meta. The optional `$security` argument can be:

- `null` — defer to global OpenAPI security.
- A string → simple scheme name (e.g. `'bearerAuth'`).
- A list of OpenAPI security objects (e.g. `[['bearerAuth' => ['scope1']]]`) for scoped operations.

### 4. Group routes with shared middleware

```php
$router->group('/protected', function ($group) {
    $group->get('/me', fn ($ctx) => Response::ok($ctx->user));
    $group->get('/profile', $profileHandler);
    $group->put('/profile', $updateProfileHandler)
        ->permission(static fn () => is_user_logged_in());
})->middleware([$jwtAuth, $rateLimiter]);
```

Group middleware applies to every route inside the closure. The group itself is registered via the `Router::group(string $prefix, callable $callback): self` method ([Router.php:72](Router.php)).

### 5. Route parameter resolution

```php
// URL: /articles/{id}
$router->put('/articles/{id}', function ($ctx) {
    $id = (int) $ctx->params['id'];   // ← from URL
    return Response::ok();
});

// Body / query 'id' is consulted only when URL doesn't provide one.
// PUT /articles/5 with body {"id": 7, "title": "..."} → handler sees id = 5 from URL.
```

This is the better-route convention: URL > query/body. If you need both (e.g. update endpoint where the URL `id` is canonical and body has different fields), the URL `id` wins — body `id` collisions surface via `RequestParamCollisionException` when using the better-data bridge.

### 6. X-Request-ID propagation

Verified at [src/Router/Router.php:318-330](Router.php) — every request gets a `requestId`:

- If the inbound request has `X-Request-ID` header AND it matches `^[A-Za-z0-9._:-]{1,128}$`, use it.
- Otherwise, generate `'req_' . bin2hex(random_bytes(8))`.

The request ID surfaces in:

- `$context->requestId` inside the handler.
- The error envelope's `requestId` field.
- Audit log events.

Clients can correlate their request ID with server-side logs by reading the response's `X-Request-ID` header (when emitted) and the error response's `requestId` field.

### 7. Register and finalize

```php
$router->register();   // dispatches all collected routes to WP REST
```

Without `->register()`, no routes are actually wired to WordPress. The fluent declarations build up an in-memory list; `register()` walks the list and calls `register_rest_route` for each.

## Critical rules

- **Inside `rest_api_init` only.** Earlier or later hooks miss the WP REST registration window.
- **v0.4.0: write methods need explicit intent.** `->permission()`, `->protectedByMiddleware()`, OR `->publicRoute()`. GET is unchanged.
- **v0.5.0: OPTIONS routes are public by default.** Use them for explicit CORS preflight endpoints; keep business logic out of them.
- **Pick ONE of the three intents.** Don't combine `->protectedByMiddleware()` with `->permission()` — the second overrides the first.
- **`->publicRoute()` clears OpenAPI security to `[]`.** Even with `globalSecurity` set, this route shows as unauthenticated. Use only when intentional.
- **`->protectedByMiddleware()` defers auth to the middleware pipeline.** WP layer just lets the request through; your `JwtAuthMiddleware` / `BearerTokenAuthMiddleware` does the actual rejection.
- **URL params win over query / body params.** A handler at `/articles/{id}` always sees URL `id`; body `id` is ignored unless URL is empty.
- **Inbound `X-Request-ID` must match `^[A-Za-z0-9._:-]{1,128}$`.** Otherwise a fresh random ID is generated. Don't try to inject HTML / SQL fragments via that header.
- **`$router->register()` is mandatory.** Without it, no routes are created.
- **Group middleware applies to every route in the closure** — declare per-route only when you need a route-specific middleware on top of the group's.

## Common mistakes

```php
// WRONG — POST without intent (post-v0.4.0)
$router->post('/articles', $handler);
// → 403 from WP permission layer

// RIGHT — pick one intent
$router->post('/articles', $handler)
    ->permission(static fn () => current_user_can('edit_posts'));

// WRONG — combining intents
$router->post('/foo', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->permission(static fn () => current_user_can('edit_posts'));
// permission() overrides protectedByMiddleware's __return_true; middleware's auth check runs but
// the WP layer also runs the cap check. Now the request must satisfy BOTH — usually not what you wanted.

// RIGHT — protectedByMiddleware ALONE delegates to the middleware pipeline
$router->post('/foo', $handler)
    ->protectedByMiddleware('bearerAuth');

// WRONG — registering on init
add_action('init', function () {
    $router = BetterRoute::router('myapp', 'v1');
    $router->get('/ping', fn () => Response::ok());
    $router->register();
});
// → routes silently absent

// RIGHT — rest_api_init
add_action('rest_api_init', function () { /* ... */ });

// WRONG — forgetting register()
add_action('rest_api_init', function () {
    $router = BetterRoute::router('myapp', 'v1');
    $router->get('/ping', $handler);
    // (no $router->register())
});
// → no routes wired to WP

// RIGHT
$router->register();

// WRONG — assuming body 'id' wins on a PUT /articles/{id}
$router->put('/articles/{id}', function ($ctx) {
    $id = $ctx->params['id'] ?? $ctx->body['id'];   // WRONG: confusion: better-route already resolves URL > body
    // The URL 'id' is always in $ctx->params['id'] for matching routes.
});

// RIGHT — URL params live in $ctx->params
$id = (int) $ctx->params['id'];

// WRONG — registering routes globally instead of inside the rest_api_init closure
$router = BetterRoute::router('myapp', 'v1');
$router->get('/ping', $handler);
add_action('rest_api_init', fn () => $router->register());
// Some routes may register fine, but if any handler captures $router-level state at definition
// time, it's frozen at the wrong moment. Keep the WHOLE setup inside the action callback.

// RIGHT — full setup inside the callback
add_action('rest_api_init', function () {
    $router = BetterRoute::router('myapp', 'v1');
    $router->get('/ping', $handler);
    $router->register();
});

// WRONG — using publicRoute on a route that should require auth
$router->post('/api/admin-action', $handler)->publicRoute();
// WRONG: OpenAPI now shows this as unauthenticated; WP allows anonymous; handler must do its OWN auth

// RIGHT — admin actions go through permission() or protectedByMiddleware()
```

## Cross-references

- Run **`br-install-and-migrate`** for the v0.4.0 upgrade context — write-route deny-by-default mechanics.
- Run **`br-auth-middleware`** when picking what `->protectedByMiddleware()` delegates to (JWT, Bearer, etc.).
- Run **`br-resource-cpt`** / **`br-resource-table`** when the routes back a CPT / custom table — Resource handles the registration for you.
- Run **`br-error-contract`** for the response shape your handler should produce on errors.

## What this skill does NOT cover

- Resource-driven CRUD (`Resource::make`). Covered by `br-resource-cpt` / `br-resource-table` — those skills register routes automatically; this skill is for raw Router usage.
- WooCommerce route registration. Covered by `br-woo-routes`.
- Middleware authoring (writing your own). Library exposes `MiddlewareInterface`; the catalog of provided middleware is split across `br-auth-middleware`, `br-etag-cache`, `br-rate-limiting`, `br-idempotency`.
- WP capability design (which capabilities to require). WP-level concern.
- CORS, rate limiting, response caching at the route layer. Each is its own skill.

## References

- Router public API: [libraries/better-route/src/Router/Router.php:82-102](Router.php) — `get`, `post`, `put`, `patch`, `delete` (all return `RouteBuilder`); `group(prefix, callback)` at line 72; `middleware([...])` at 45; `register(?dispatcher)` at 151; `contracts(openApiOnly: bool)` at 129.
- RouteBuilder permission methods: [libraries/better-route/src/Router/RouteBuilder.php:42-72](RouteBuilder.php) — `permission(callable)` line 42 calls `setRoutePermission`; `publicRoute()` at 51 sets `permission(__return_true)` + meta `security: []`; `protectedByMiddleware($security = null)` at 63 sets `permission(__return_true)` + meta `protectedByMiddleware: true` + optional security.
- Request ID resolution: [libraries/better-route/src/Router/Router.php:318-336](Router.php) — `resolveRequestId(...)` validates inbound `X-Request-ID` against `^[A-Za-z0-9._:-]{1,128}$`, otherwise generates `req_<8-byte-hex>`.
- Response factory: [libraries/better-route/src/Http/Response.php](Response.php) — `Response::ok($data)`, `Response::created($data)`, `Response::noContent()`, etc.
- ApiException: [libraries/better-route/src/Http/ApiException.php](ApiException.php) — throw inside handler for normalized error envelopes.
