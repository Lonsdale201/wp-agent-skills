---
name: br-single-use-token
description: Configure Better Route 1.1 atomic single-use tokens for authorization codes, password resets, magic links, invitations, and email confirmation. Use when a token must be stored hashed and consumed no more than once across concurrent requests.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "1.1.0"
  wp-skills-php-min: "8.1"
  wp-skills-last-updated: "2026-07-13"
---

# Better Route single-use tokens

Use `SingleUseTokenMiddleware` when replay must be rejected atomically before the handler runs.

```php
use BetterRoute\Middleware\Write\SingleUseTokenMiddleware;
use BetterRoute\Middleware\Write\WpdbSingleUseTokenStore;

register_activation_hook(__FILE__, static function (): void {
    (new WpdbSingleUseTokenStore())->installSchema();
});

$singleUse = new SingleUseTokenMiddleware(
    store: new WpdbSingleUseTokenStore(),
    tokenSource: static fn ($request): ?string => $request->get_param('code'),
    hashSalt: MY_PLUGIN_SINGLE_USE_TOKEN_SALT,
    ttlSeconds: 300
);

$router->post('/oauth/token', $handler)
    ->middleware([$singleUse])
    ->protectedByMiddleware('singleUseToken');
```

Create a high-entropy raw token with `Crypto::token()`, deliver it over the intended secure channel, and call `storeToken($rawToken, $safeContext, $ttl)`. The middleware stores and looks up an HMAC-SHA256 token hash; successful consumption exposes the stored context as `singleUseToken`.

## Store selection

- Use `WpdbSingleUseTokenStore` as the general production choice and install its schema during activation/migration. Consumption is an atomic conditional `UPDATE`.
- Use `WpCacheSingleUseTokenStore` only with a persistent external object cache. It refuses the normal non-persistent WordPress cache because its add-lock would not be cross-request atomic.
- Use `ArraySingleUseTokenStore` only in tests or a genuinely single-process environment.

## Rules

- Configure a dedicated non-empty hash salt. If omitted under WordPress, Better Route derives one from `wp_salt('auth')`; explicit application separation is clearer for portable integrations.
- Do not put secrets or objects into stored context. The wpdb store uses `unserialize(..., ['allowed_classes' => false])`, but keep context data-only and minimal.
- Keep TTLs as short as the user flow permits.
- Consume before issuing credentials or performing any side effect. Consumption is intentionally not rolled back when the handler later fails.
- A previously consumed live token returns `409 single_use_token_reused`; unknown or expired tokens return `401 invalid_single_use_token`.
- Pair the route with rate limiting to slow token guessing.

Test two simultaneous consumes, expiration, unknown/reused tokens, schema absence, cache-store startup without a persistent cache, and handler failure after consumption.

Source references: `src/Middleware/Write/SingleUseTokenMiddleware.php`, `src/Middleware/Write/WpdbSingleUseTokenStore.php`, `src/Middleware/Write/WpCacheSingleUseTokenStore.php`.

## References

- Official documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/agents>
