# Classic variation swatch rendering

This is a progressive-enhancement pattern for a classic WooCommerce variation form. It keeps the native select as the authoritative control.

## Append buttons without replacing the select

```php
add_filter(
    'woocommerce_dropdown_variation_attribute_options_html',
    function ( string $html, array $args ): string {
        $product  = $args['product'] ?? null;
        $taxonomy = isset( $args['attribute'] ) ? (string) $args['attribute'] : '';
        $options  = isset( $args['options'] ) && is_array( $args['options'] ) ? $args['options'] : array();
        $selected = isset( $args['selected'] ) ? (string) $args['selected'] : '';

        if ( ! $product instanceof WC_Product || ! taxonomy_exists( $taxonomy ) ) {
            return $html;
        }

        if ( ! myplugin_is_wc_visual_attribute_taxonomy( $taxonomy ) ) {
            return $html;
        }

        $terms = wc_get_product_terms( $product->get_id(), $taxonomy, array( 'fields' => 'all' ) );
        if ( empty( $terms ) || is_wp_error( $terms ) ) {
            return $html;
        }

        $out = '<div class="myplugin-wc-swatches" role="group" aria-label="' . esc_attr( wc_attribute_label( $taxonomy ) ) . '">';

        foreach ( $terms as $term ) {
            if ( ! in_array( $term->slug, $options, true ) ) {
                continue;
            }

            $visual = myplugin_get_wc_term_visual( (int) $term->term_id );
            $style  = '';

            if ( 'color' === $visual['type'] ) {
                $style = 'background-color:' . esc_attr( $visual['value'] );
            } elseif ( 'image' === $visual['type'] ) {
                $style = "background-image:url('" . esc_url( $visual['value'] ) . "')";
            }

            $out .= sprintf(
                '<button type="button" class="myplugin-wc-swatch" data-value="%1$s" aria-pressed="%2$s" aria-label="%3$s"><span class="myplugin-wc-swatch__visual" style="%4$s" aria-hidden="true"></span><span class="screen-reader-text">%5$s</span></button>',
                esc_attr( $term->slug ),
                $selected === $term->slug ? 'true' : 'false',
                esc_attr( sprintf( '%s: %s', wc_attribute_label( $taxonomy ), $term->name ) ),
                esc_attr( $style ),
                esc_html( $term->name )
            );
        }

        return $html . $out . '</div>';
    },
    20,
    2
);
```

## Synchronize availability and selection

```js
jQuery( function ( $ ) {
    $( document ).on( 'click', '.myplugin-wc-swatch', function () {
        const $button = $( this );
        const $wrap = $button.closest( '.value' );
        const $select = $wrap.find( 'select' );

        $select.val( $button.data( 'value' ) ).trigger( 'change' );
        $wrap.find( '.myplugin-wc-swatch' ).attr( 'aria-pressed', 'false' );
        $button.attr( 'aria-pressed', 'true' );
    } );

    $( '.variations_form' ).on( 'woocommerce_update_variation_values reset_data', function () {
        $( this ).find( '.value' ).each( function () {
            const $wrap = $( this );
            const $select = $wrap.find( 'select' );

            $wrap.find( '.myplugin-wc-swatch' ).each( function () {
                const value = String( $( this ).data( 'value' ) );
                const enabled = $select.find( 'option' ).filter( function () {
                    return this.value === value && ! this.disabled;
                } ).length > 0;

                $( this ).prop( 'disabled', ! enabled );
            } );

            $wrap.find( '.myplugin-wc-swatch' ).attr( 'aria-pressed', 'false' )
                .filter( function () {
                    return String( $( this ).data( 'value' ) ) === String( $select.val() || '' );
                } )
                .attr( 'aria-pressed', 'true' );
        } );
    } );
} );
```

Keep the select available to assistive technology. Buttons need visible focus. If the select is removed visually and semantically, this pattern is no longer sufficient; replace it with a complete radio-group/listbox interaction and keyboard model.
