# Custom rewrite rules and endpoints

## Complete custom-rule pattern

```php
function myplugin_register_rewrites(): void {
    add_rewrite_rule(
        '^track/([a-z0-9]+)/?$',
        'index.php?myplugin_track=$matches[1]',
        'top'
    );
}

add_action( 'init', 'myplugin_register_rewrites' );

add_filter( 'query_vars', static function ( array $vars ): array {
    $vars[] = 'myplugin_track';
    return $vars;
} );

add_action( 'template_redirect', static function (): void {
    $token = get_query_var( 'myplugin_track' );
    if ( '' === $token ) {
        return;
    }

    myplugin_render_track_page( sanitize_key( $token ) );
    exit;
} );

register_activation_hook( __FILE__, static function (): void {
    myplugin_register_rewrites();
    flush_rewrite_rules();
} );
```

`top` places the rule before default rules; `bottom` places it after them. Keep
the regex anchored and as narrow as the route requires. WordPress removes a
query variable that is neither registered through `query_vars` nor introduced
with `add_rewrite_tag()`.

`template_redirect` is appropriate for custom frontend rendering/redirects.
Use `parse_request` only when the request must be short-circuited before the
main query. Use `register_rest_route()` for a JSON API so it has explicit
methods, schemas, authorization, errors, and authentication integration.

## Endpoint suffix pattern

```php
add_action( 'init', static function (): void {
    add_rewrite_endpoint( 'print', EP_PERMALINK | EP_PAGES );
} );

add_action( 'template_redirect', static function (): void {
    if ( '' === get_query_var( 'print', '' ) || ! is_singular() ) {
        return;
    }

    myplugin_render_print_view( get_queried_object_id() );
    exit;
} );
```

The third parameter can be `false` to avoid query-var registration or a string
to use another query-var name. Common masks are `EP_PERMALINK`, `EP_PAGES`,
`EP_ROOT`, `EP_CATEGORIES`, `EP_TAGS`, and `EP_AUTHORS`; use `EP_ALL` only when
every permastruct genuinely needs the suffix.

## Review failures

- `flush_rewrite_rules()` inside `init` regenerates and may rewrite files on
  every request.
- Registering a CPT only at runtime but flushing without invoking the same
  registration callback during activation builds a cache without its rules.
- Omitting the activation flush produces 404s until Permalinks is saved.
- Omitting `query_vars` makes `get_query_var()` appear empty after a match.
- A rewrite handler returning JSON is usually a low-level replacement for a
  proper REST route and its permission/schema contract.
- An option update hook must compare only URL-affecting old/new values before a
  soft flush; do not flush after every settings save.
