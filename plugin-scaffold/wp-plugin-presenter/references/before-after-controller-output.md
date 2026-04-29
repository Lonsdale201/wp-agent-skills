# Before / after: controller output to presenter

Use this reference when controllers return raw objects, raw arrays, or
pre-escaped JSON payloads.

## Before: REST callback leaks storage shape

```php
public function get_item( \WP_REST_Request $request ) {
    $post = get_post( absint( $request['id'] ) );

    if ( ! $post ) {
        return new WP_Error( 'not_found', 'Not found.', array( 'status' => 404 ) );
    }

    return rest_ensure_response(
        array_merge(
            get_object_vars( $post ),
            get_post_meta( $post->ID )
        )
    );
}
```

Problems:

- Exposes `WP_Post` internals.
- Leaks all meta, including private/internal keys.
- Response shape changes when storage changes.
- No redaction boundary.

## After: repository -> DTO -> presenter

```php
public function get_item( \WP_REST_Request $request ) {
    $dto = $this->repository->find( absint( $request->get_param( 'id' ) ) );

    if ( is_wp_error( $dto ) ) {
        return $dto;
    }

    return rest_ensure_response(
        ( new ProductPresenter( $dto ) )->for_rest()
    );
}
```

The repository decides how to read WordPress storage. The DTO defines the
canonical shape. The presenter defines the public response.

## Before: pre-escaped REST data

```php
return rest_ensure_response(
    array(
        'title' => esc_html( $dto->title() ),
        'url'   => esc_url( $dto->url() ),
    )
);
```

Problem: JSON consumers receive HTML-escaped strings. That is not the REST
contract; it is an HTML rendering concern.

## After: raw REST data, escaped HTML view

```php
return rest_ensure_response(
    ( new ProductPresenter( $dto ) )->for_rest()
);
```

```php
$row = ( new ProductPresenter( $dto ) )->for_admin_table();

echo '<a href="' . esc_url( $row['url'] ) . '">'
    . esc_html( $row['title'] )
    . '</a>';
```

## Before: AJAX mixes business and output

```php
add_action( 'wp_ajax_myplugin_product', function (): void {
    check_ajax_referer( 'myplugin_product', 'nonce' );

    $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
    $post = get_post( $id );

    if ( ! $post ) {
        wp_send_json_error( array( 'message' => 'Missing product.' ), 404 );
    }

    wp_send_json_success(
        array(
            'id'    => $post->ID,
            'title' => esc_html( get_the_title( $post ) ),
            'html'  => '<strong>' . esc_html( get_the_title( $post ) ) . '</strong>',
        )
    );
} );
```

Problems:

- REST-like data and HTML fragment are mixed.
- Escaped title is returned as JSON data.
- No reusable presenter for REST/admin.

## After: presenter has separate contexts

```php
add_action( 'wp_ajax_myplugin_product', function (): void {
    check_ajax_referer( 'myplugin_product', 'nonce' );

    $dto = ( new ProductRepository() )->find( isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0 ); // phpcs:ignore WordPress.Security.NonceVerification.Missing

    if ( is_wp_error( $dto ) ) {
        wp_send_json_error( array( 'message' => $dto->get_error_message() ), 404 );
    }

    $presenter = new ProductPresenter( $dto );

    wp_send_json_success(
        array(
            'product' => $presenter->for_rest(),
            'badge'   => $presenter->render_status_badge_html(),
        )
    );
} );
```

If the endpoint is a pure API, omit `badge`. If the endpoint is specifically a
partial-render endpoint, the `render_*_html()` method name makes that explicit.
