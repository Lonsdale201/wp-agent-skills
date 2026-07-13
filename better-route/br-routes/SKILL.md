---
name: br-routes
description: Register custom WordPress REST routes with better-route 1.1 Router and RouteBuilder. Use for Router::make or BetterRoute::router, get/post/put/patch/delete/options, permission, protectedByMiddleware, publicRoute, args, route middleware, groups, handler signatures, RequestContext, WP_REST_Request, route registration, or unexpected 403 responses. In 1.1 every raw route, including GET and OPTIONS, denies by default until its access intent is explicit.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# better-route: custom REST routes

Register the complete router during `rest_api_init` and declare the access intent of every route.

## Minimal public route

```php
use BetterRoute\Http\Response;
use BetterRoute\Router\Router;

add_action('rest_api_init', static function (): void {
    $router = Router::make('myapp', 'v1');

    $router->get('/ping', static fn (): Response => Response::ok(['pong' => true]))
        ->publicRoute();

    $router->register();
});
```

In 1.1 an omitted permission denies every raw route. This applies to `GET`, `HEAD`-style reads registered through the router, writes, and explicit `OPTIONS` routes.

Choose exactly one intent:

```php
// WordPress permission/capability gate.
$router->get('/admin/report', $handler)
    ->permission(static fn (): bool => current_user_can('manage_options'));

// Let middleware authenticate/authorize after WordPress dispatches.
$router->post('/account/orders', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->middleware([$jwt]);

// Deliberately anonymous. Also emits OpenAPI security: [].
$router->post('/webhooks/provider', $handler)
    ->publicRoute()
    ->middleware([$signature]);
```

Do not combine `protectedByMiddleware()` and `permission()` on one route. Both set the WordPress permission callback; the later call replaces the earlier intent.

## WordPress route patterns

Pass WordPress REST regex routes, not framework-style braces:

```php
$router->get('/articles/(?P<id>\d+)', $handler)
    ->publicRoute()
    ->args([
        'id' => [
            'required' => true,
            'type' => 'integer',
        ],
    ]);
```

`/articles/{id}` is an OpenAPI rendering, not a WordPress registration pattern.

WordPress validates and sanitizes registered `args` before `permission_callback` runs. Keep `validate_callback` and `sanitize_callback` cheap, deterministic, and side-effect free. Perform expensive or authorization-dependent validation in the handler or Resource `writeSchema()`.

## Handler argument rules

Use the signature deliberately:

```php
use BetterRoute\Http\RequestContext;

// Zero parameters.
static fn (): array => ['ok' => true];

// One untyped/non-RequestContext parameter receives WP_REST_Request.
static function ($request): array {
    return ['id' => (int) $request->get_param('id')];
}

// A RequestContext-compatible type receives RequestContext.
static function (RequestContext $context): array {
    return ['requestId' => $context->requestId];
}

// Two parameters always receive RequestContext, then the WP request.
static function (RequestContext $context, $request): array {
    return ['id' => (int) $request->get_param('id')];
}
```

A union containing `RequestContext` also selects the context for a one-parameter handler. A handler may require at most two parameters.

Callable forms supported by 1.1 include closures, callable objects, static `[ClassName::class, 'method']` handlers, and instantiable handler classes. If a non-static class handler needs constructor arguments, instantiate it through the plugin container and pass the object; the router will not invent dependencies.

Return a `BetterRoute\Http\Response`, `WP_REST_Response`, array/scalar, or `WP_Error`. Arrays/scalars become `200` responses. Throw `ApiException` for an intentional normalized error.

## Groups and middleware

```php
$router->group('/account', static function (Router $router) use ($jwt): void {
    $router->middleware([$jwt]);

    $router->get('/me', $me)->protectedByMiddleware('bearerAuth');
    $router->patch('/profile', $update)->protectedByMiddleware('bearerAuth');
});
```

Global middleware runs before group middleware, which runs before route middleware. Nested group state is unwound in a `finally` block in 1.1, so an exception while defining one group cannot leak its prefix or middleware into later routes.

## CORS preflight

An explicit preflight route also needs intent:

```php
$router->options('/account/profile', static fn () => null)
    ->publicRoute()
    ->middleware([$cors]);
```

When `CorsMiddleware` is attached, its WordPress bridge can answer a matched preflight before normal dispatch and replace WordPress core CORS headers. See `br-cors-public-client` for the policy rules.

## Registration and failures

Call `$router->register()` during `rest_api_init`. Better-route 1.1 throws a clear `RuntimeException` when:

- `register_rest_route()` is unavailable;
- registration is attempted before `rest_api_init` has fired; or
- WordPress returns `false` while registering a route.

Do not treat these as silent missing-route cases.

## Review checklist

- Mark every raw route with `permission()`, `protectedByMiddleware()`, or `publicRoute()`.
- Use `(?P<name>...)` WordPress path parameters and declare their `args`.
- Type a one-parameter handler as `RequestContext` only when it should receive the context; otherwise it receives the WP request.
- Put authentication middleware before identity-aware cache, rate-limit, and idempotency middleware.
- Keep `args` validation cheap because WordPress runs it before permission checks.
- Register the full router during `rest_api_init` and call `register()` once after declarations.
- Use `meta(['openapi' => ['include' => false]])` to omit a route from filtered OpenAPI contracts.

## Related skills

- Use `br-auth-middleware` for `protectedByMiddleware()` implementations.
- Use `br-cors-public-client` for browser preflight and authoritative CORS headers.
- Use `br-openapi` for contract export.
- Use `br-error-contract` for `ApiException` and normalized responses.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
- Verified source paths:
  - `src/Router/Router.php`
  - `src/Router/RouteBuilder.php`
  - `src/Router/WordPressRestDispatcher.php`
  - `src/Router/ArgumentResolver.php`
  - `src/Http/RequestContext.php`
