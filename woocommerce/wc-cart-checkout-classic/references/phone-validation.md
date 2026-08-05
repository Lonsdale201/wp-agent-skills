# WooCommerce 11.0 phone validation and formatting

WooCommerce 11.0 separates default shape validation, merchant policy, and formatting:

```php
add_filter(
    'woocommerce_validate_phone',
    static function ( bool $valid, string $phone, ?string $country ): bool {
        if ( ! $valid ) {
            return false;
        }

        return myplugin_phone_is_valid_for_country( $phone, $country );
    },
    10,
    3
);
```

- `WC_Validation::is_phone_format( $phone )` performs Woo's country-agnostic character/shape check and deliberately does not run filters.
- `WC_Validation::is_phone( $phone, $country )` applies `woocommerce_validate_phone( $valid, $phone, $country )`. Use this for checkout/account acceptance policy.
- `wc_format_phone_number( $phone )` applies `woocommerce_format_phone_number( $formatted, $original, $default_is_valid )`. Formatting is normalization/output, not authorization or proof of ownership.

The default shape check accepts an empty string; required-field validation is separate. Validate the raw domain value before formatting/storage, pass billing/shipping country when known, and do not assume a formatting filter changes what classic checkout or Store API accepts.
