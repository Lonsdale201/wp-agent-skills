# Presenter context patterns

Use these examples when implementing output for more than one audience. Keep
presenters side-effect-free: no DB writes, no remote calls, no repository calls.

## REST presenter

```php
final class ProductPresenter {
    private ProductDto $product;

    public function __construct( ProductDto $product ) {
        $this->product = $product;
    }

    /** @return array<string,mixed> */
    public function for_rest(): array {
        return array(
            'id'         => $this->product->id(),
            'title'      => $this->product->title(),
            'price'      => $this->product->price(),
            'enabled'    => $this->product->enabled(),
            'created_at' => $this->product->created_at()
                ? $this->product->created_at()->format( \DateTimeInterface::ATOM )
                : null,
        );
    }
}
```

REST values are not HTML. Do not call `esc_html()` here.

## Admin table presenter

```php
/** @return array<string,string|int> */
public function for_admin_table(): array {
    return array(
        'id'      => $this->product->id(),
        'title'   => $this->product->title(),
        'price'   => number_format_i18n( $this->product->price(), 2 ),
        'status'  => $this->product->enabled()
            ? __( 'Enabled', 'my-plugin' )
            : __( 'Disabled', 'my-plugin' ),
    );
}
```

Escape when echoing:

```php
$row = ( new ProductPresenter( $dto ) )->for_admin_table();

echo '<td>' . esc_html( $row['title'] ) . '</td>';
echo '<td>' . esc_html( $row['price'] ) . '</td>';
echo '<td>' . esc_html( $row['status'] ) . '</td>';
```

## Rendered HTML helper

If the presenter returns HTML, make that explicit in the method name and escape
inside the method.

```php
public function render_status_badge_html(): string {
    $class = $this->product->enabled() ? 'myplugin-badge--ok' : 'myplugin-badge--muted';
    $label = $this->product->enabled()
        ? __( 'Enabled', 'my-plugin' )
        : __( 'Disabled', 'my-plugin' );

    return sprintf(
        '<span class="myplugin-badge %s">%s</span>',
        esc_attr( $class ),
        esc_html( $label )
    );
}
```

Do not include this HTML in `for_rest()`.

## Inline JS config

```php
/** @return array<string,mixed> */
public function for_js_config(): array {
    return array(
        'id'      => $this->product->id(),
        'title'   => $this->product->title(),
        'enabled' => $this->product->enabled(),
    );
}

wp_add_inline_script(
    'my-plugin-admin',
    'window.MyPluginProduct = ' . wp_json_encode( ( new ProductPresenter( $dto ) )->for_js_config() ) . ';',
    'before'
);
```

Never concatenate raw strings into JavaScript.

## Email variables

```php
/** @return array<string,string> */
public function for_email(): array {
    return array(
        'title'  => $this->product->title(),
        'price'  => number_format_i18n( $this->product->price(), 2 ),
        'status' => $this->product->enabled()
            ? __( 'enabled', 'my-plugin' )
            : __( 'disabled', 'my-plugin' ),
    );
}
```

The email template decides whether variables go into text or HTML and escapes
accordingly.

## Export presenter

```php
/** @return array<string,string|int|float> */
public function for_export(): array {
    return array(
        'id'      => $this->product->id(),
        'title'   => $this->product->title(),
        'price'   => $this->product->price(),
        'enabled' => $this->product->enabled() ? 'yes' : 'no',
    );
}
```

Exports need stable keys. Avoid translated keys unless the export is explicitly
human-facing and locale-specific.

## Redaction pattern

```php
final class ApiCredentialPresenter {
    private ApiCredentialDto $credential;

    public function __construct( ApiCredentialDto $credential ) {
        $this->credential = $credential;
    }

    public function for_rest(): array {
        return array(
            'name'    => $this->credential->name(),
            'api_key' => '***',
        );
    }

    public function for_private_admin( bool $can_reveal_secret ): array {
        if ( ! $can_reveal_secret ) {
            return $this->for_rest();
        }

        $api_key = $this->credential->api_key();

        return array(
            'name'    => $this->credential->name(),
            'api_key' => $api_key ? $api_key->reveal() : '',
        );
    }
}
```

The controller supplies the authorization decision. Do not call
`current_user_can()` deep inside generic presentation code unless the local
project already uses that convention.

## Collection presenter

```php
final class ProductCollectionPresenter {
    /** @var ProductDto[] */
    private array $products;

    /** @param ProductDto[] $products */
    public function __construct( array $products ) {
        $this->products = $products;
    }

    /** @return array<int,array<string,mixed>> */
    public function for_rest(): array {
        return array_map(
            static fn ( ProductDto $product ): array => ( new ProductPresenter( $product ) )->for_rest(),
            $this->products
        );
    }
}
```

Collection presenters replay the per-item presenter. They do not duplicate the
field mapping.
