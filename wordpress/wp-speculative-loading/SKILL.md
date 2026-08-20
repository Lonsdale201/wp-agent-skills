---
name: wp-speculative-loading
description: "Configure or audit WordPress speculative loading and Speculation Rules: prefetch/prerender mode, eagerness, safe URL exclusions, custom rules, per-link opt-out, cache/session correctness, and WordPress 7.1 host default constants. Use when a plugin owns frontend URLs, carts, logout/destructive links, personalized pages, navigation performance, or emits speculationrules."
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.8 - 7.1"
  wp-skills-wp-version-tested: "7.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-08-20"
---

# WordPress Speculative Loading

WordPress emits a browser `speculationrules` script in the frontend footer. Core enables it by default only for logged-out requests with pretty permalinks, then applies safe defaults and exclusions. Plugins should usually exclude sensitive plugin URLs, not replace Core's entire rule set.

## Configuration contract

`wp_get_speculation_rules_configuration()` returns:

- `null` when disabled; or
- `array( 'mode' => 'prefetch|prerender', 'eagerness' => 'conservative|moderate|eager' )`.

Filter the policy only when the plugin truly owns the site-wide decision:

```php
add_filter( 'wp_speculation_rules_configuration', static function ( $config ) {
    if ( is_page( 'member-dashboard' ) ) {
        return null;
    }
    return $config;
} );
```

The input may be `null`. Returning invalid data does not fail closed; Core sanitizes it back to defaults. Return `null` explicitly to disable.

## Exclude plugin-owned routes

Use root-relative path patterns and `*` wildcards:

```php
add_filter(
    'wp_speculation_rules_href_exclude_paths',
    static function ( array $paths, string $mode ): array {
        $paths[] = '/checkout/*';
        $paths[] = '/account/*';
        $paths[] = '/my-plugin/action/*';
        return $paths;
    },
    10,
    2
);
```

Core's own exclusions cannot be removed through this filter. Core excludes admin/login/content paths, query-string URLs on pretty-permalink sites, `rel="nofollow"`, and elements opted out by class.

For one link or subtree:

```html
<a class="no-prefetch no-prerender" href="/account/sign-out/">Sign out</a>
```

Under `prerender`, `.no-prefetch` also opts out because prerender includes fetching.

## Add a custom rule carefully

Use `wp_load_speculation_rules` and the passed rule collection. Its concrete class is Core-internal, so depend on the documented hook and `add_rule()` behavior rather than constructing or persisting the class yourself.

```php
add_action( 'wp_load_speculation_rules', static function ( $rules ): void {
    $rules->add_rule(
        'prefetch',
        'acme-next-page',
        array(
            'source'    => 'list',
            'urls'      => array( home_url( '/docs/next/' ) ),
            'eagerness' => 'moderate',
        )
    );
} );
```

Rule IDs must contain at least two characters: a lowercase letter followed by
one or more lowercase letters, digits, `_`, or `-`. A rule uses either `where`
(document source) or `urls` (list source), never both. `immediate` is permitted
only for list rules, not document-level rules.

## WordPress 7.1 host defaults

Core still defaults `auto` to `prefetch` + `conservative`. In 7.1, hosting operators can change what `auto` resolves to using either constants or same-named environment variables:

```php
define( 'WP_SPECULATIVE_LOADING_DEFAULT_MODE', 'prerender' );
define( 'WP_SPECULATIVE_LOADING_DEFAULT_EAGERNESS', 'moderate' );
```

The constant wins over the environment variable. Invalid values fall back to Core defaults, and `immediate` is not accepted as the site-wide default. Plugins should not define these operator-level constants. An explicit `wp_speculation_rules_configuration` filter value still takes precedence over the host's `auto` default.

## Safety model

Prefetch/prerender may issue a GET before the user intentionally navigates.

- GET routes must never mutate data, consume a one-time operation, log out a user, place an order, or trigger billing.
- Exclude carts, checkout, account actions, nonce-bearing actions, and highly personalized/session-sensitive pages.
- Ensure prerendered responses have correct cache headers and cannot be served across users.
- Do not add cross-origin URLs without reviewing privacy, authentication, and browser behavior.
- Do not assume unsupported browsers execute the rules; navigation must work normally without them.
- Keep rule sets small. Aggressive eagerness can waste bandwidth and backend capacity.

Read [references/rules-and-test-matrix.md](references/rules-and-test-matrix.md) for Core exclusions, validation, and test cases.

## Verification

1. Test logged-out pretty-permalink HTML and inspect the footer's `script[type="speculationrules"]` JSON.
2. Confirm logged-in and plain-permalink defaults are disabled unless another filter intentionally enables them.
3. Assert every state-changing GET is fixed or excluded; exclusion is defense-in-depth, not permission control.
4. Exercise configuration with `null`, malformed arrays, and valid explicit values.
5. Test host constants separately from plugin filters.
6. Observe requests and cache/session behavior in a browser that implements Speculation Rules.

## Related skills

- `plugin-scaffold/wp-plugin-assets-loading` for general frontend loading strategy.
- `wordpress/wp-http-api-client` for server-side prefetching; it is unrelated to browser speculation rules.
- `wordpress/wp-security-audit` for state-changing GET and authorization review.

## References

- Read `references/rules-and-test-matrix.md` for the rule shape, exclusion patterns and the verification matrix.
- WordPress 7.1 Field Guide: <https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/>
