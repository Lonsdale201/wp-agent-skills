# Native DTO patterns

Use these examples when implementing a DTO rather than only reviewing one. Keep
the DTO dependency-free and WordPress-light: validation can use `WP_Error`, but
data access belongs in repositories and controllers.

## Full PHP 7.4 DTO

```php
namespace MyPlugin\Dto;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class ProductDto {
    private int $id;
    private string $title;
    private float $price;
    private bool $enabled;
    private ?\DateTimeImmutable $created_at;

    public function __construct(
        int $id = 0,
        string $title = '',
        float $price = 0.0,
        bool $enabled = false,
        ?\DateTimeImmutable $created_at = null
    ) {
        $this->id         = $id;
        $this->title      = $title;
        $this->price      = $price;
        $this->enabled    = $enabled;
        $this->created_at = $created_at;
    }

    /** @param array<string,mixed> $data @return self|WP_Error */
    public static function from_array( array $data ) {
        $errors     = new WP_Error();
        $id         = self::to_int( $data['id'] ?? 0, 'id', $errors );
        $title      = self::to_string( $data['title'] ?? '', 'title', $errors );
        $price      = self::to_float( $data['price'] ?? 0, 'price', $errors );
        $enabled    = self::to_bool( $data['enabled'] ?? false, 'enabled', $errors );
        $created_at = self::to_datetime( $data['created_at'] ?? null, 'created_at', $errors );

        if ( '' === $title ) {
            $errors->add( 'missing_title', 'Product title is required.' );
        }
        if ( $price < 0 ) {
            $errors->add( 'invalid_price', 'Product price must be zero or greater.' );
        }
        if ( $errors->has_errors() ) {
            return $errors;
        }

        return new self( $id, $title, $price, $enabled, $created_at );
    }

    /** @return array<string,mixed> */
    public function to_array(): array {
        return array(
            'id'         => $this->id,
            'title'      => $this->title,
            'price'      => $this->price,
            'enabled'    => $this->enabled,
            'created_at' => $this->created_at ? $this->created_at->format( \DateTimeInterface::ATOM ) : null,
        );
    }

    /** @param array<string,mixed> $changes @return self|WP_Error */
    public function with( array $changes ) {
        return self::from_array( array_merge( $this->to_array(), $changes ) );
    }

    public function id(): int { return $this->id; }
    public function title(): string { return $this->title; }
    public function price(): float { return $this->price; }
    public function enabled(): bool { return $this->enabled; }
    public function created_at(): ?\DateTimeImmutable { return $this->created_at; }

    private static function to_int( $value, string $field, WP_Error $errors ): int {
        if ( is_int( $value ) ) {
            return $value;
        }
        if ( is_string( $value ) && preg_match( '/^-?\d+$/', $value ) ) {
            return (int) $value;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be an integer.', $field ) );
        return 0;
    }

    private static function to_float( $value, string $field, WP_Error $errors ): float {
        if ( is_int( $value ) || is_float( $value ) ) {
            return (float) $value;
        }
        if ( is_string( $value ) && preg_match( '/^-?\d+(\.\d+)?$/', $value ) ) {
            return (float) $value;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be a number.', $field ) );
        return 0.0;
    }

    private static function to_string( $value, string $field, WP_Error $errors ): string {
        if ( is_string( $value ) ) {
            return $value;
        }
        if ( is_scalar( $value ) ) {
            return (string) $value;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be a string.', $field ) );
        return '';
    }

    private static function to_bool( $value, string $field, WP_Error $errors ): bool {
        if ( in_array( $value, array( true, 1, '1', 'true', 'yes', 'on' ), true ) ) {
            return true;
        }
        if ( in_array( $value, array( false, 0, '0', 'false', 'no', 'off', '' ), true ) ) {
            return false;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be a boolean.', $field ) );
        return false;
    }

    private static function to_datetime( $value, string $field, WP_Error $errors ): ?\DateTimeImmutable {
        if ( null === $value || '' === $value ) {
            return null;
        }
        if ( $value instanceof \DateTimeImmutable ) {
            return $value;
        }
        if ( $value instanceof \DateTimeInterface ) {
            return new \DateTimeImmutable( $value->format( \DateTimeInterface::ATOM ) );
        }
        if ( is_string( $value ) ) {
            try {
                return new \DateTimeImmutable( $value );
            } catch ( \Exception $e ) {
                $errors->add( 'invalid_' . $field, sprintf( '%s must be a valid datetime.', $field ) );
                return null;
            }
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be a valid datetime.', $field ) );
        return null;
    }
}
```

## PHP 8.1+ readonly variant

Use only when the plugin declares PHP 8.1+.

```php
final readonly class ProductDto {
    public function __construct(
        private int $id = 0,
        private string $title = '',
        private float $price = 0.0,
    ) {}

    public function id(): int { return $this->id; }
    public function title(): string { return $this->title; }
    public function price(): float { return $this->price; }
}
```

Still keep `from_array()` explicit. Do not switch to reflection hydration unless
the project has a tested hydrator; that is exactly where weaker AI models often
miss defaults, nullability, and type coercion.

## Nested DTO collections

```php
final class OrderDto {
    /** @var OrderItemDto[] */
    private array $items;

    /** @param OrderItemDto[] $items */
    public function __construct( array $items = array() ) {
        $this->items = $items;
    }

    /** @param array<string,mixed> $data @return self|WP_Error */
    public static function from_array( array $data ) {
        $errors = new WP_Error();
        $items  = array();

        foreach ( (array) ( $data['items'] ?? array() ) as $index => $raw_item ) {
            if ( ! is_array( $raw_item ) ) {
                $errors->add( 'invalid_item', sprintf( 'Item %d must be an array.', $index ) );
                continue;
            }

            $item = OrderItemDto::from_array( $raw_item );
            if ( is_wp_error( $item ) ) {
                $errors->merge_from( $item );
                continue;
            }

            $items[] = $item;
        }

        if ( $errors->has_errors() ) {
            return $errors;
        }

        return new self( $items );
    }
}
```

If the WordPress minimum lacks `WP_Error::merge_from()` in the target project,
loop over `$item->get_error_codes()` and add messages manually.

## Enum-like value sets

For PHP 7.4-compatible plugins, use class constants:

```php
final class ExportFormat {
    public const CSV  = 'csv';
    public const JSON = 'json';

    public static function normalize( string $value ): string {
        return in_array( $value, array( self::CSV, self::JSON ), true ) ? $value : self::CSV;
    }
}
```

For PHP 8.1+, use backed enums:

```php
enum ExportFormat: string {
    case Csv = 'csv';
    case Json = 'json';
}

$format = ExportFormat::tryFrom( $raw ) ?? ExportFormat::Csv;
```

## Secret value object

```php
final class SecretString {
    private string $value;

    public function __construct( string $value ) {
        $this->value = $value;
    }

    public function reveal(): string {
        return $this->value;
    }

    public function __toString(): string {
        return '***';
    }
}
```

Use `?SecretString $api_key = null` in DTOs. Do not use an empty secret as the
default because consumers cannot distinguish "absent" from "set to empty".
