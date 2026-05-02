---
name: br-install-and-migrate
description: Install better-route into a WordPress project and migrate
  to v0.6.0 — composer VCS repository (NOT yet on Packagist), PHP 8.1+
  requirement, all route registration inside rest_api_init. Important —
  v0.4.0 raw Router write methods (POST / PUT / PATCH / DELETE) DENY by
  default at the WP permission layer; every write route now needs an
  explicit intent declaration via ->permission(callable),
  ->protectedByMiddleware($security), or ->publicRoute(). GET is
  unchanged. Older v0.3.0 breaking changes still apply when jumping
  from <0.3 — OpenAPI doc defaults to manage_options, custom-table
  resources are deny-by-default, JWT exp claim required, identity-aware
  default keys for cache / idempotency / rate-limit. v0.6.0 adds JWKS
  JWT verification, Crypto helpers, HMAC signatures, trusted-proxy
  IP/CIDR allowlists, single-use token stores, and opt-in OAuth error
  format. Use when adding better-route to a project, bumping the
  constraint to ^0.6.0, or
  triaging unintended 403s on writes after upgrade. Triggers on
  composer require better-route, ->permission, ->protectedByMiddleware,
  ->publicRoute, "better-route 403 on POST".
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: better-route
plugin-version-tested: "0.6.0"
php-min: "8.1"
last-updated: "2026-05-02"
docs:
  - https://lonsdale201.github.io/better-docs/docs/better-route/agents
  - https://github.com/Lonsdale201/better-route
source-refs:
  - src/Router/RouteBuilder.php
  - src/Resource/ResourcePolicy.php
  - src/Middleware/Jwt/Hs256JwtVerifier.php
  - src/Middleware/Jwt/Rs256JwksJwtVerifier.php
  - src/Middleware/Auth/HmacSignatureMiddleware.php
  - src/Middleware/Network/IpAllowlistMiddleware.php
  - src/Middleware/Write/SingleUseTokenMiddleware.php
  - src/Support/Crypto.php
  - src/Middleware/Auth/WpClaimsUserMapper.php
  - src/OpenApi/OpenApiRouteRegistrar.php
  - src/BetterRoute.php
  - composer.json
---

# better-route: Install and migrate to v0.6.0

For developers adding [better-route](https://github.com/Lonsdale201/better-route) to a WordPress project for the first time OR upgrading an existing install to v0.6.0. The install path is non-Packagist (composer VCS repository). v0.6.0 is additive, but older v0.3.0/v0.4.0 migration rules still matter: JWT `exp` is required by default, custom table resources deny by default, and write routes deny by default until intent is declared.

## Misconception this skill corrects

> "I bumped to v0.4.0, ran composer update, and now my POST endpoints return 403 — must be a WordPress capability config drift."

It's not your config. Verified at [src/Router/RouteBuilder.php:42-72](RouteBuilder.php) — better-route's RouteBuilder now requires an explicit permission declaration for every write method (POST / PUT / PATCH / DELETE). Without one, the router registers the route with a `__return_false`-equivalent permission callback, and WordPress returns 403 before your handler ever runs.

The fix is one of three explicit declarations per write route:

| Method | When to use |
|---|---|
| `->permission(callable)` | The route is gated by WordPress capabilities (`current_user_can('edit_posts')`). |
| `->protectedByMiddleware(string\|array\|null $security = null)` | Authentication is handled by a better-route auth middleware (`JwtAuthMiddleware`, `BearerTokenAuthMiddleware`, etc.) — defers authorization to the pipeline. |
| `->publicRoute()` | Intentionally public (webhooks, health endpoints, OAuth callback). Marks security as `[]` in OpenAPI. |

GET routes are unchanged — they remain public by default.

Other AI-prone misconceptions:

- "I'll add `better-route` to `composer.json` like any other package." Wrong — not on Packagist yet. You need a VCS repository entry.
- "I'm jumping from v0.2.x to v0.4.0 — I only need the v0.4.0 changelog." Wrong — the v0.3.0 breaking changes still apply (custom-table deny-by-default, JWT `exp` requirement, identity-aware default keys, OpenAPI doc admin-only). Walk through both.
- "v0.6.0 means I must migrate all HS256 JWTs to RS256." Wrong — `Hs256JwtVerifier` remains valid. Use `Rs256JwksJwtVerifier` for OIDC/OAuth/JWKS tokens.

## When to use this skill

Trigger when ANY of the following is true:

- The diff or task adds `better-route/better-route` to `composer.json`.
- The user asks "how do I install better-route" / "is it on Packagist".
- The diff bumps `better-route` from any older version to `^0.6.0`.
- After an upgrade, write routes return 403 with no other config change.
- The user asks about `->publicRoute()`, `->protectedByMiddleware()`, or "deny by default".

## Workflow

### 1. Install (fresh project)

PHP 8.1+ and Composer required. WordPress with REST API (the default — every modern install has it).

`composer.json`:

```json
{
  "require": {
    "better-route/better-route": "^0.6.0"
  },
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/Lonsdale201/better-route"
    }
  ],
  "prefer-stable": true
}
```

Then:

```bash
composer install
composer show better-route/better-route   # verify resolved version
```

The `repositories` block is required until the package lands on Packagist — without it, Composer can't find the package.

### 2. Bootstrap inside `rest_api_init`

```php
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');

    $router->get('/ping', fn () => \BetterRoute\Http\Response::ok(['pong' => true]));

    // ... more routes ...

    $router->register();
});
```

Every route registration must happen inside `rest_api_init`. Earlier hooks fire before WP's REST infrastructure exists; later hooks (`init`, `wp`) fire after route discovery is closed.

### 3. Verify quality commands work

```bash
php vendor/bin/phpunit         # composer test
php vendor/bin/phpstan analyse # composer analyse
php vendor/bin/phpcs             # composer cs-check
```

(Since v0.3.0 the convention switched from `vendor/bin/phpunit` to `php vendor/bin/phpunit` for cross-OS compatibility — both still work, the `php` prefix is the documented form.)

### 4. Upgrade path: older versions → v0.6.0

```bash
composer update better-route/better-route
```

Then walk the additive 0.6.0 checklist and the older breaking-change checklists.

#### v0.6.0 additive checklist

| Area | Action |
|---|---|
| RS256/ES256/OIDC JWT | Replace custom asymmetric verifiers with `Rs256JwksJwtVerifier` + `HttpJwksProvider` where appropriate. |
| Token compares / nonce / PKCE / CSRF | Prefer `Crypto::equals()` and `Crypto::token()` over ad hoc `!==` and `random_bytes` wrappers. |
| Webhooks/back-channel POSTs | Use `HmacSignatureMiddleware` and/or `IpAllowlistMiddleware`; keep `publicRoute()` explicit. |
| Auth codes / reset links / magic links | Use `SingleUseTokenMiddleware` with `WpdbSingleUseTokenStore` or `WpCacheSingleUseTokenStore`. |
| Rate limit behind proxies | Prefer `TrustedProxyClientIpResolver` for new code; legacy `Http\ClientIpResolver` remains valid. |
| OAuth-like error responses | Use `->meta(['error_format' => 'oauth_rfc6749'])` only where clients expect RFC6749 shape. |

#### v0.4.0 breaking-change checklist

| Area | Action required |
|---|---|
| Raw Router write routes (POST / PUT / PATCH / DELETE) | Add `->permission()`, `->protectedByMiddleware()`, OR `->publicRoute()`. Without one of those, the route returns 403. |

That's the entire v0.4.0 list at the route layer. Verified: [RouteBuilder.php:42-72](RouteBuilder.php).

#### v0.3.0 breaking-change checklist (still applies)

| Area | Action required |
|---|---|
| OpenAPI doc endpoint | Default permission is `manage_options`. To keep it public, pass `'permissionCallback' => static fn (): bool => true` to `OpenApiRouteRegistrar::register(...)`. |
| Custom table resources | Deny-by-default. Add `->policy(ResourcePolicy::publicReadPrivateWrite())` (or another preset) — without it, BOTH reads and writes 403. |
| JWT | `exp` claim required by default. Either ensure tokens include `exp`, or pass `requireExpiration: false` to `Hs256JwtVerifier`. |
| `WpClaimsUserMapper` | `sub` is no longer in default `idClaims`. Re-add it explicitly if your tokens use `sub` as the user identifier. |
| Woo customer endpoints | Restricted to users with the `customer` role; create / update / delete also require `create_users` / `edit_user` / `delete_user`. |
| Woo meta keys | Keys starting with `_` are no longer writable or returned. Pass `$allowProtected = true` only when intentional. |
| Default cache / idempotency / rate-limit keys | Identity-aware. If you depended on the old defaults, pass an explicit `keyResolver` to preserve keys. |

### 5. Verification after upgrade

```bash
# Endpoints that should be reachable still respond 200:
curl -i https://your-site/wp-json/myapp/v1/orders  # GET — unchanged
curl -i -X POST https://your-site/wp-json/myapp/v1/orders -H 'Authorization: Bearer ...'  # write — should NOT be 403 if you declared intent

# Auth flows still issue tokens with exp claim:
# decode the token, confirm "exp" is present and within maxLifetimeSeconds.

# OpenAPI doc visibility matches your intent:
curl -i https://your-site/wp-json/myapp/v1/openapi.json  # 401 if admin-only, 200 if you set permissionCallback to true
```

## Critical rules

- **NOT on Packagist** — install via Composer VCS repository pointing to `https://github.com/Lonsdale201/better-route`.
- **PHP 8.1+** — strict requirement.
- **All route registration goes inside `rest_api_init`.** Earlier and later hooks both miss the window.
- **v0.4.0 — every write route needs explicit intent.** `->permission()`, `->protectedByMiddleware()`, OR `->publicRoute()`. GET unchanged.
- **`->protectedByMiddleware()` defers permission to the middleware pipeline.** It internally sets the WP permission to `__return_true` and lets your `JwtAuthMiddleware` / `BearerTokenAuthMiddleware` actually do the auth check. Don't combine with `->permission()`.
- **`->publicRoute()` clears OpenAPI security for the operation.** Even if you have `globalSecurity` set in the OpenAPI export, a `publicRoute` shows up as unauthenticated. Use it only when that's intentional.
- **v0.3.0 breaking changes still apply** when jumping from <0.3. Custom-table policies, JWT `exp`, identity-aware default keys.
- **Use `php vendor/bin/<tool>`** for cross-OS compatibility (Windows lacks the executable bit on bash scripts).

## Common mistakes

```php
// WRONG — POST without intent declaration (post-v0.4.0)
$router->post('/articles', $createArticleHandler);
// → 403 from WP permission layer before $createArticleHandler runs

// RIGHT — pick one of three intents
$router->post('/articles', $createArticleHandler)
    ->permission(static fn () => current_user_can('edit_posts'));

$router->post('/secure/articles', $createArticleHandler)
    ->protectedByMiddleware('bearerAuth');

$router->post('/webhooks/intake', $webhookHandler)
    ->publicRoute();

// WRONG — declared BOTH protectedByMiddleware AND permission
$router->post('/foo', $handler)
    ->protectedByMiddleware('bearerAuth')
    ->permission(static fn () => current_user_can('edit_posts'));
// protectedByMiddleware already set permission to __return_true; the second call overrides.
// Pick one — middleware-or-permission, not both.

// WRONG — registering routes outside rest_api_init
add_action('init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');
    $router->get('/ping', fn () => Response::ok());
    $router->register();
});
// → routes silently missing because rest_api_init has already fired

// RIGHT
add_action('rest_api_init', function () {
    $router = \BetterRoute\BetterRoute::router('myapp', 'v1');
    $router->get('/ping', fn () => Response::ok());
    $router->register();
});

// WRONG — composer.json without repositories block
{
  "require": {
    "better-route/better-route": "^0.6.0"
  }
}
// composer install: "Could not find package better-route/better-route".

// RIGHT — VCS repository entry
{
  "require": { "better-route/better-route": "^0.6.0" },
  "repositories": [
    { "type": "vcs", "url": "https://github.com/Lonsdale201/better-route" }
  ]
}

// WRONG — assuming v0.4.0 fixes only need write-route updates after a v0.2 → v0.4 jump
// composer update; restart; QA: tokens fail because exp wasn't required in v0.2 → tokens never had it.

// RIGHT — walk BOTH checklists when jumping major-minor versions
```

## Cross-references

- Run **`br-routes`** for the full custom REST route registration patterns and the deny-by-default rule's mechanics.
- Run **`br-resource-table`** when upgrading custom-table resources — they need an explicit `->policy()` post-v0.3.0.
- Run **`br-auth-middleware`** when configuring JWT — `exp`-required default and `WpClaimsUserMapper` `sub`-removal both apply.
- Run **`br-jwks-jwt-auth`** for the new v0.6.0 RS256/ES256 JWKS verifier.
- Run **`br-hmac-signature`**, **`br-network-security`**, **`br-single-use-token`**, and **`br-crypto`** for the new v0.6.0 primitives.
- Run **`br-openapi`** when the OpenAPI doc endpoint suddenly returns 401 after upgrade.

## What this skill does NOT cover

- WordPress core install / setup. Assume a working WP REST API.
- Composer fundamentals (running `composer install`, lock-file management).
- Database migrations between versions — better-route doesn't ship schema migrations, but `WpdbIdempotencyStore::installSchema()` is documented in `br-idempotency`.
- Rollback strategy from v0.4.0 → v0.3.x. Pin to `~0.3.0` if you need to hold back.
- CI / CD configuration for running quality commands.

## References

- RouteBuilder permission methods: [libraries/better-route/src/Router/RouteBuilder.php:42-72](RouteBuilder.php) — `permission()`, `publicRoute()` (calls `permission(__return_true)` then sets security `[]` meta), `protectedByMiddleware()` (sets permission `__return_true` + meta `protectedByMiddleware: true`, optional `security` propagation).
- Hs256JwtVerifier defaults: [libraries/better-route/src/Middleware/Jwt/Hs256JwtVerifier.php:21-25](Hs256JwtVerifier.php) — `expectedIssuer = null`, `expectedAudience = null`, `requireExpiration = true`, `maxLifetimeSeconds = null`, `maxTokenLength = 8192`.
- ResourcePolicy presets: [libraries/better-route/src/Resource/ResourcePolicy.php:13-55](ResourcePolicy.php) — `publicReadPrivateWrite`, `adminOnly`, `capabilities`, `callbacks`.
- Release notes: [https://github.com/Lonsdale201/better-route/blob/main/CHANGELOG.md](https://github.com/Lonsdale201/better-route/blob/main/CHANGELOG.md).
