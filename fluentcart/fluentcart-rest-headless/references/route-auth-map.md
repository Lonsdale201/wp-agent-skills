# FluentCart 1.6.0 route and authentication map

## Source/runtime facts

- Main REST namespace: /fluent-cart/v2.
- An isolated /fluent-cart/v1/editor-autosave route is also registered; v1 is
  not a blanket alias for v2.
- Route truth: installed route files plus rest_get_server()->get_routes().
- Browser checkout also uses wp-admin/admin-ajax.php dispatchers.
- No generic core /cart/add, /cart/update, or /cart/remove REST routes were
  registered in the tested runtime.
- FluentCart Migrator uses a separate /fct-migrator/v1 namespace.

Pin route inventory in integration tests because public documentation examples
are not a versioned machine-readable contract.

## Authorization layers

| Route class | Authentication | Required object check |
|---|---|---|
| Store administration | WP user plus FluentCart capability policy | Resource/store scope |
| Customer portal | Logged-in WP user | FluentCart customer and object ownership |
| Public catalog | None where registered | Published/mode-safe field projection |
| Public checkout/payment | Cart/order flow state | Opaque pointer, amount/state and abuse checks |
| Addon endpoint | Addon-defined permission_callback | Explicit tenant/customer/object ownership |

A nonce mitigates CSRF for cookie-authenticated requests; it does not grant a
capability. Application Passwords authenticate a WP user over HTTPS; normal WP
capability and object authorization still apply.

## Custom endpoint pattern

~~~php
register_rest_route('my-addon/v1', '/orders/(?P<uuid>[a-z0-9-]+)', [
    'methods'             => WP_REST_Server::READABLE,
    'permission_callback' => 'my_addon_can_read_order',
    'args'                => [
        'uuid' => [
            'required'          => true,
            'sanitize_callback' => 'sanitize_text_field',
        ],
    ],
    'callback'            => 'my_addon_get_order',
]);
~~~

The permission callback must load or safely identify the object and check the
current user/customer relationship. The callback must repeat no weaker lookup
that loses that scope.

## Headless risk checklist

- Keep integer minor-unit money on the wire and document currency/scale.
- Do not accept product price, tax, shipping charge, discount, payment status,
  customer ID, or order ownership from the client.
- Bound page size and query complexity.
- Project fields intentionally; do not serialize an unrestricted model graph.
- Rate-limit login, checkout, coupon, payment-listener, license, and recovery
  surfaces according to their actual abuse risk.
- Return stable machine-readable errors without exposing SQL/provider detail.
- Make unsafe operations idempotent or require a replay key.
- Test CORS only when cross-origin clients are intentionally supported.
