# Before / after: raw arrays to DTO

Use this reference when refactoring code that passes request arrays, meta arrays,
or option payloads through multiple layers.

## Before: controller owns parsing, validation, and storage shape

```php
function myplugin_save_product() {
    check_admin_referer( 'myplugin_save_product' );

    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'Forbidden.', 'my-plugin' ), 403 );
    }

    $raw = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification.Missing

    $data = array(
        'id'      => isset( $raw['id'] ) ? absint( $raw['id'] ) : 0,
        'title'   => isset( $raw['title'] ) ? sanitize_text_field( $raw['title'] ) : '',
        'price'   => isset( $raw['price'] ) ? (float) $raw['price'] : 0.0,
        'enabled' => ! empty( $raw['enabled'] ),
    );

    if ( '' === $data['title'] ) {
        wp_safe_redirect( add_query_arg( 'error', 'missing_title', wp_get_referer() ) );
        exit;
    }

    update_post_meta( $data['id'], '_myplugin_product', $data );
}
```

Problems:

- Controller knows storage shape.
- `(float) 'abc'` silently becomes `0.0`.
- `empty()` collapses absent, false, `0`, and `'0'`.
- Every future consumer must rediscover the same keys and rules.

## After: controller checks authority, DTO owns shape

```php
function myplugin_save_product() {
    check_admin_referer( 'myplugin_save_product' );

    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'Forbidden.', 'my-plugin' ), 403 );
    }

    $dto = ProductDto::from_request_array( wp_unslash( $_POST ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing

    if ( is_wp_error( $dto ) ) {
        wp_safe_redirect(
            add_query_arg(
                'error',
                rawurlencode( $dto->get_error_code() ),
                wp_get_referer()
            )
        );
        exit;
    }

    ( new ProductRepository() )->save( $dto );

    wp_safe_redirect( remove_query_arg( 'error', wp_get_referer() ) );
    exit;
}
```

```php
final class ProductDto {
    public static function from_request_array( array $raw ) {
        return self::from_array(
            array(
                'id'      => $raw['id'] ?? 0,
                'title'   => isset( $raw['title'] ) ? sanitize_text_field( $raw['title'] ) : '',
                'price'   => $raw['price'] ?? 0,
                'enabled' => $raw['enabled'] ?? false,
            )
        );
    }
}
```

```php
final class ProductRepository {
    public function save( ProductDto $dto ): void {
        update_post_meta(
            $dto->id(),
            '_myplugin_product',
            array(
                'title'   => $dto->title(),
                'price'   => $dto->price(),
                'enabled' => $dto->enabled() ? 'yes' : 'no',
            )
        );
    }
}
```

Controller responsibilities stay small: nonce, capability, redirect/response.
DTO responsibilities stay shape-focused. Repository responsibilities stay
storage-focused.

## REST variant

```php
public function update_item( \WP_REST_Request $request ) {
    $dto = ProductDto::from_array(
        array(
            'id'      => $request->get_param( 'id' ),
            'title'   => $request->get_param( 'title' ),
            'price'   => $request->get_param( 'price' ),
            'enabled' => $request->get_param( 'enabled' ),
        )
    );

    if ( is_wp_error( $dto ) ) {
        return $dto;
    }

    $this->repository->save( $dto );

    return rest_ensure_response(
        ( new ProductPresenter( $dto ) )->for_rest()
    );
}
```

Register REST route `args` for schema-level sanitization, then let the DTO
enforce domain rules that the schema cannot express cleanly.
