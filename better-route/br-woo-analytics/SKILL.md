---
name: br-woo-analytics
description: Expose read-only WooCommerce Analytics with Better Route WooAnalyticsService. Use for supported reports, report-specific date and pagination contracts, native report permissions, comparison windows, historical import readiness, decimal-money DTOs or WooAnalyticsOpenApi helpers. CRUD, checkout eligibility and import execution are separate concerns.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "better-route"
  wp-skills-plugin-version-tested: "2.0.0"
  wp-skills-wp-version-tested: "6.9.4"
  wp-skills-php-min: "8.3"
  wp-skills-last-updated: "2026-10-20"
---

# Better Route WooCommerce Analytics

Use the report service for staff reporting over native WooCommerce Analytics.
Register only the reports the application needs; the CRUD registrar does not add them.

## Register a report

```php
use BetterRoute\BetterRoute;
use BetterRoute\Http\Response;
use BetterRoute\Integration\Woo\WooAnalyticsOpenApi;

add_action('rest_api_init', static function (): void {
    $analytics = BetterRoute::wooAnalyticsService();
    $router = BetterRoute::router('myapp', 'v1');
    $report = 'revenue/stats';
    $router->get('/analytics/revenue', static function ($request) use ($analytics, $report): Response {
        return new Response(
            $analytics->report($report, $request),
            200,
            ['Cache-Control' => 'private, no-store']
        );
    })
        ->permission(static fn (): bool => current_user_can('view_woocommerce_reports'))
        ->args(WooAnalyticsOpenApi::args($report))
        ->meta(WooAnalyticsOpenApi::meta($report));
    $router->register();
});
```

This example uses the current native WP user. Add the application's actual
authentication before accessing reports. JWT/Bearer middleware must establish the
native WP identity; `protectedByMiddleware()` declares intent but adds no auth.
Keep application rate limits and avoid shared response caches.

The service always enforces `view_woocommerce_reports` and dispatches through native
REST permission checks under that same user. Stock retains its extra native product
permissions. There is no loopback HTTP request, privilege elevation or import trigger.

## Reports and queries

Use `reports()` to obtain the fixed report list:

`revenue/stats`, `orders/stats`, `products`, `products/stats`, `categories`,
`customers`, `customers/stats`, `coupons`, `coupons/stats`, `taxes`, `stock`, `variations`.

- `after`/`before` are ISO8601 datetimes, defaulting to the last seven days in the
  shop timezone. Explicit offsets are converted to that timezone. The maximum window
  is 366 days, or 31 days for hourly intervals. Reversed windows fail.
- `compare_after` and `compare_before` must be supplied together. Each window is
  independently validated; comparison output is returned in `comparison`.
- Paginated reports accept `page` 1..10000 and `per_page` 1..100. Over-limit values
  fail rather than clamp. Use report-specific `orderby`, `order` and `segmentby`.
- `interval` is hour/day/week/month/quarter/year only for reports that support it.
  `customers/stats` maps dates to registration dates and accepts no pagination or
  interval. Stock accepts no dates or comparison window.
- Unsupported query keys fail, including WordPress globals `_locale`, `_fields`,
  `_embed` and `context`. Do not apply the CRUD parser's global-parameter allowance
  to Analytics. An adapter may remove a known transport-only key such as `_locale`;
  continue rejecting every other unsupported key rather than silently dropping all
  unknown parameters.

## Data and readiness

Responses contain `report`, allowlisted `data` and `meta`. Stats expose `totals` and
where applicable `intervals`; collections expose `items`. Monetary values are decimal
strings, including monetary averages. Non-monetary fractional averages remain numeric.
Empty metric maps serialize as objects.
Contact fields, native links and arbitrary extension properties are omitted.
`meta.totalUnit` distinguishes interval totals from collection items where paginated.

The service bounds returned collections and segment lists to 100 entries. This does
not bound every native grouping/query cost; use narrow reporting windows.

For historical reports, require enabled Analytics and native import readiness with
sufficient coverage for both requested windows. Unknown/running/incomplete state or
insufficient coverage returns `503 analytics_data_not_ready`. Initialize imports via
WooCommerce operations before using the API. `meta.readiness=idle` describes native
import state, not realtime synchronization. Stock does not require historical imports.
Disabled/unavailable reports return sanitized 503 errors; permissions return 403.

## OpenAPI and checks

Attach `WooAnalyticsOpenApi::args($report)` and `::meta($report)` as above. Merge
`BetterRoute::wooOpenApiComponents()` into strict export; it includes the report
schemas. Define the actual application security scheme separately.

Verify denied users, reports-only staff, each requested report, both comparison
windows, import-readiness failures and unauthorized query keys. Validate serialized
native response bodies against the exported document. A ready import flag alone
does not prove that all historical lookup rows were imported.

## Related skills

- Use `br-auth-middleware` for native identity binding.
- Use `br-openapi` for full document export and validation.
- Use `br-woo-routes` for administrative CRUD rather than reporting.

## References

- Documentation: <https://lonsdale201.github.io/better-docs/docs/better-route/woocommerce/analytics>
- Verified source paths:
  - `src/Integration/Woo/WooAnalyticsService.php`
  - `src/Integration/Woo/AnalyticsReports.php`
  - `src/Integration/Woo/AnalyticsQueryParser.php`
  - `src/Integration/Woo/AnalyticsResponseMapper.php`
  - `src/Integration/Woo/WooAnalyticsOpenApi.php`
  - `tests/smoke/woo-analytics-smoke.php`
