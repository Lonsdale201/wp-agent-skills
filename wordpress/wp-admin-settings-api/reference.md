# Settings API Reference Examples

## Field Render Callbacks

```php
function myplugin_render_field_enabled(): void {
    $options = get_option( 'myplugin_options', array() );
    $value   = ! empty( $options['enabled'] );
    ?>
    <input type="hidden" name="myplugin_options[enabled]" value="0" />
    <input
        type="checkbox"
        id="myplugin_enabled"
        name="myplugin_options[enabled]"
        value="1"
        <?php checked( $value ); ?>
    />
    <span class="description"><?php esc_html_e( 'Turn the plugin on globally.', 'myplugin' ); ?></span>
    <?php
}

function myplugin_render_field_api_key(): void {
    $options = get_option( 'myplugin_options', array() );
    $configured = ! empty( $options['api_key'] );
    ?>
    <input
        type="password"
        id="myplugin_api_key"
        name="myplugin_options[api_key]"
        class="regular-text"
        value=""
        autocomplete="new-password"
    />
    <?php if ( $configured ) : ?>
        <label>
            <input type="checkbox" name="myplugin_options[clear_api_key]" value="1" />
            <?php esc_html_e( 'Remove the configured API key', 'myplugin' ); ?>
        </label>
    <?php endif; ?>
    <?php
}
```

## Tabs Pattern

```php
function myplugin_render_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'Not allowed.', 'myplugin' ), 403 );
    }

    $tabs = array(
        'general'      => __( 'General', 'myplugin' ),
        'integrations' => __( 'Integrations', 'myplugin' ),
        'advanced'     => __( 'Advanced', 'myplugin' ),
    );
    $requested_tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'general';
    $active        = isset( $tabs[ $requested_tab ] ) ? $requested_tab : 'general';
    ?>
    <div class="wrap">
        <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

        <nav class="nav-tab-wrapper">
            <?php foreach ( $tabs as $slug => $label ) :
                $url   = add_query_arg( array( 'page' => 'myplugin', 'tab' => $slug ), admin_url( 'options-general.php' ) );
                $class = 'nav-tab' . ( $slug === $active ? ' nav-tab-active' : '' );
                ?>
                <a href="<?php echo esc_url( $url ); ?>" class="<?php echo esc_attr( $class ); ?>">
                    <?php echo esc_html( $label ); ?>
                </a>
            <?php endforeach; ?>
        </nav>

        <?php settings_errors(); ?>

        <form method="post" action="options.php">
            <?php
            settings_fields( 'myplugin_' . $active );
            do_settings_sections( 'myplugin_' . $active );
            submit_button();
            ?>
        </form>
    </div>
    <?php
}
```

```php
$setting_args = array(
    'type'              => 'object',
    'default'           => array( 'enabled' => false, 'api_key' => '', 'log_level' => 'info' ),
    'show_in_rest'      => false,
    'sanitize_callback' => 'myplugin_sanitize_options',
);
register_setting( 'myplugin_general',      'myplugin_options', $setting_args );
register_setting( 'myplugin_integrations', 'myplugin_options', $setting_args );
register_setting( 'myplugin_advanced',     'myplugin_options', $setting_args );

add_settings_section( 'myplugin_section_general',      /* ... */ 'myplugin_general' );
add_settings_section( 'myplugin_section_integrations', /* ... */ 'myplugin_integrations' );
```

Use the same complete args in all three registrations. Re-registering the same
option name replaces its global metadata.

## REST Schema for Object Settings

```php
// Expose only non-secret settings. Keep API keys in a separate non-REST option.
register_setting( 'myplugin', 'myplugin_public_options', array(
    'type'         => 'object',
    'default'      => array( 'enabled' => false, 'log_level' => 'info' ),
    'show_in_rest' => array(
        'schema' => array(
            'type'       => 'object',
            'additionalProperties' => false,
            'properties' => array(
                'enabled'   => array( 'type' => 'boolean' ),
                'log_level' => array( 'type' => 'string', 'enum' => array( 'debug', 'info', 'warn', 'error' ) ),
            ),
        ),
    ),
    'sanitize_callback' => 'myplugin_sanitize_options',
) );
```

## Flash Messages

```php
function myplugin_sanitize_options( $input ): array {
    if ( $api_key_was_bad ) {
        add_settings_error(
            'myplugin_options',
            'api_key_invalid',
            __( 'The API key format is invalid.', 'myplugin' ),
            'error'
        );
    }

    if ( $cleared ) {
        add_settings_error(
            'myplugin_options',
            'cleared',
            __( 'Cache cleared.', 'myplugin' ),
            'success'
        );
    }

    return $clean;
}
```

```php
settings_errors( 'myplugin_options' );
```

## One Option Per Field

```php
register_setting( 'myplugin', 'myplugin_api_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
register_setting( 'myplugin', 'myplugin_log_level', array( 'sanitize_callback' => 'sanitize_key' ) );
```

Use this only when another plugin, integration, or operational workflow needs stable independent option names.

## Common Mistakes

```php
// WRONG: posts to own handler and loses core's nonce/cap/allowlist.
?>
<form method="post" action="">
    <input type="hidden" name="myplugin_save" value="1" />
    <?php wp_nonce_field( 'myplugin_save' ); ?>
    <input name="api_key" />
    <?php submit_button(); ?>
</form>
<?php
if ( isset( $_POST['myplugin_save'] ) ) {
    check_admin_referer( 'myplugin_save' );
    update_option( 'myplugin_api_key', sanitize_text_field( $_POST['api_key'] ) );
}

// RIGHT.
?>
<form method="post" action="options.php">
    <?php settings_fields( 'myplugin' ); ?>
    <?php do_settings_sections( 'myplugin' ); ?>
    <?php submit_button(); ?>
</form>
```

```php
// WRONG: register_setting only runs when this page is viewed.
function myplugin_render_settings_page() {
    register_setting( 'myplugin', 'myplugin_options', /* ... */ );
}

// RIGHT: admin_init runs on options.php submits too.
add_action( 'admin_init', static function () {
    register_setting( 'myplugin', 'myplugin_options', /* ... */ );
} );
```

```php
// WRONG: mismatched slugs.
register_setting( 'my_plugin', 'myplugin_options', /* ... */ );
add_settings_section( 'sec', 'General', $cb, 'myplugin' );
settings_fields( 'myplugin' );
do_settings_sections( 'my-plugin' );

// RIGHT: use one slug consistently.
register_setting( 'myplugin', 'myplugin_options', /* ... */ );
add_settings_section( 'sec', 'General', $cb, 'myplugin' );
settings_fields( 'myplugin' );
do_settings_sections( 'myplugin' );
```

```php
// WRONG: tab A's save wipes tab B's fields.
function myplugin_sanitize_options( $input ) {
    return array(
        'api_key'   => sanitize_text_field( $input['api_key'] ?? '' ),
        'log_level' => $input['log_level'] ?? 'info',
    );
}

// RIGHT: merge over existing.
function myplugin_sanitize_options( $input ) {
    $clean = get_option( 'myplugin_options', array() );
    if ( isset( $input['api_key'] ) ) {
        $clean['api_key'] = sanitize_text_field( $input['api_key'] );
    }
    if ( isset( $input['log_level'] ) ) {
        $clean['log_level'] = sanitize_key( $input['log_level'] );
    }
    return $clean;
}
```

```php
// WRONG: sanitize callback sends an email every save.
function myplugin_sanitize_options( $input ) {
    wp_mail( 'admin@example.com', 'Settings changed', '...' );
    return $clean;
}

// RIGHT: side effects belong in update_option_*.
add_action( 'update_option_myplugin_options', static function ( $old, $new ): void {
    if ( ( $old['api_key'] ?? '' ) !== ( $new['api_key'] ?? '' ) ) {
        wp_mail( 'admin@example.com', 'API key changed', '...' );
    }
}, 10, 2 );
```
