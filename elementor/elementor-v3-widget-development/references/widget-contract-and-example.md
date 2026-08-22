# Classic Widget_Base contract and example

Read this reference when implementing a complete Elementor companion plugin, adding a frontend handler, or preparing a release test. The code targets the established classic widget API and PHP 7.4+. It does not use Atomic Widgets.

## Companion-plugin bootstrap

Keep the main file free of top-level references that require Elementor classes. Load the widget subclass only inside the registration callback, after the compatibility gate has passed.

```php
<?php
/**
 * Plugin Name: Acme Elementor Widgets
 * Description: Example classic Elementor widgets.
 * Version: 1.0.0
 * Requires at least: 6.8
 * Requires PHP: 7.4
 * Requires Plugins: elementor
 * Elementor tested up to: 4.2.3
 * Elementor Pro tested up to: 4.2.2
 * Text Domain: acme-elementor-widgets
 */

namespace Acme\ElementorWidgets;

defined( 'ABSPATH' ) || exit;

const VERSION = '1.0.0';
const MINIMUM_ELEMENTOR_VERSION = '3.5.0';

add_action( 'plugins_loaded', __NAMESPACE__ . '\\bootstrap' );

function bootstrap(): void {
    if ( ! did_action( 'elementor/loaded' ) ) {
        add_action( 'admin_notices', __NAMESPACE__ . '\\missing_elementor_notice' );
        return;
    }

    if (
        ! defined( 'ELEMENTOR_VERSION' ) ||
        version_compare( ELEMENTOR_VERSION, MINIMUM_ELEMENTOR_VERSION, '<' )
    ) {
        add_action( 'admin_notices', __NAMESPACE__ . '\\old_elementor_notice' );
        return;
    }

    add_action( 'elementor/elements/categories_registered', __NAMESPACE__ . '\\register_category' );
    add_action( 'elementor/widgets/register', __NAMESPACE__ . '\\register_widgets' );
    add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\\register_assets' );
}

function register_category( \Elementor\Elements_Manager $elements_manager ): void {
    $elements_manager->add_category(
        'acme-widgets',
        [ 'title' => esc_html__( 'Acme Widgets', 'acme-elementor-widgets' ) ]
    );
}

function register_widgets( \Elementor\Widgets_Manager $widgets_manager ): void {
    require_once __DIR__ . '/includes/class-card-widget.php';
    $widgets_manager->register( new Widgets\Card_Widget() );
}

function register_assets(): void {
    wp_register_style(
        'acme-card-widget',
        plugins_url( 'assets/css/card-widget.css', __FILE__ ),
        [],
        VERSION
    );

    wp_register_script(
        'acme-card-widget',
        plugins_url( 'assets/js/card-widget.js', __FILE__ ),
        [ 'elementor-frontend' ],
        VERSION,
        true
    );
}

function missing_elementor_notice(): void {
    echo '<div class="notice notice-warning"><p>' .
        esc_html__( 'Acme Elementor Widgets requires Elementor.', 'acme-elementor-widgets' ) .
        '</p></div>';
}

function old_elementor_notice(): void {
    echo '<div class="notice notice-warning"><p>' .
        esc_html__( 'Acme Elementor Widgets requires a newer Elementor version.', 'acme-elementor-widgets' ) .
        '</p></div>';
}
```

Notes:

- Set the minimum to the oldest version actually tested. `3.5.0` is used here because this sample intentionally depends on the modern manager hook.
- Keep `Elementor tested up to` as the newest verified version, not the minimum.
- `Requires Plugins` improves dependency handling but does not replace the runtime gate for unusual load orders, older WordPress versions, or programmatic execution.
- Register assets once. Do not register them in the widget constructor or enqueue them on every page.
- Add a Pro gate only around features that actually need Pro. A normal `Widget_Base` widget is a free-core integration.

## Complete classic widget

This example uses only built-in controls. It keeps the PHP renderer canonical, validates the HTML tag independently of the `SELECT`, and escapes content at output.

```php
<?php

namespace Acme\ElementorWidgets\Widgets;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Utils;
use Elementor\Widget_Base;

defined( 'ABSPATH' ) || exit;

final class Card_Widget extends Widget_Base {
    public function get_name(): string {
        return 'acme-card';
    }

    public function get_title(): string {
        return esc_html__( 'Acme Card', 'acme-elementor-widgets' );
    }

    public function get_icon(): string {
        return 'eicon-call-to-action';
    }

    public function get_categories(): array {
        return [ 'acme-widgets' ];
    }

    public function get_keywords(): array {
        return [ 'card', 'content', 'link' ];
    }

    public function get_style_depends(): array {
        return [ 'acme-card-widget' ];
    }

    public function get_script_depends(): array {
        return [ 'acme-card-widget' ];
    }

    protected function is_dynamic_content(): bool {
        // Safe here only because output is settings-derived. Elementor bypasses
        // element caching when a configured dynamic tag is present.
        return false;
    }

    protected function register_controls(): void {
        $this->start_controls_section(
            'section_content',
            [
                'label' => esc_html__( 'Content', 'acme-elementor-widgets' ),
                'tab'   => Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'title',
            [
                'label'       => esc_html__( 'Title', 'acme-elementor-widgets' ),
                'type'        => Controls_Manager::TEXT,
                'default'     => esc_html__( 'A useful card', 'acme-elementor-widgets' ),
                'label_block' => true,
                'dynamic'     => [ 'active' => true ],
            ]
        );

        $this->add_control(
            'title_tag',
            [
                'label'   => esc_html__( 'Title HTML tag', 'acme-elementor-widgets' ),
                'type'    => Controls_Manager::SELECT,
                'default' => 'h3',
                'options' => [
                    'h2' => 'H2',
                    'h3' => 'H3',
                    'h4' => 'H4',
                    'p'  => 'p',
                ],
            ]
        );

        $this->add_control(
            'description',
            [
                'label'   => esc_html__( 'Description', 'acme-elementor-widgets' ),
                'type'    => Controls_Manager::TEXTAREA,
                'default' => esc_html__( 'Explain the next action.', 'acme-elementor-widgets' ),
                'dynamic' => [ 'active' => true ],
            ]
        );

        $this->add_control(
            'link',
            [
                'label'       => esc_html__( 'Link', 'acme-elementor-widgets' ),
                'type'        => Controls_Manager::URL,
                'placeholder' => 'https://example.com/',
                'options'     => [ 'url', 'is_external', 'nofollow', 'custom_attributes' ],
            ]
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_style',
            [
                'label' => esc_html__( 'Card', 'acme-elementor-widgets' ),
                'tab'   => Controls_Manager::TAB_STYLE,
            ]
        );

        $this->add_control(
            'title_color',
            [
                'label'     => esc_html__( 'Title color', 'acme-elementor-widgets' ),
                'type'      => Controls_Manager::COLOR,
                'selectors' => [
                    '{{WRAPPER}} .acme-card__title' => 'color: {{VALUE}};',
                ],
            ]
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            [
                'name'     => 'title_typography',
                'selector' => '{{WRAPPER}} .acme-card__title',
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void {
        $settings = $this->get_settings_for_display();
        $title = trim( (string) ( $settings['title'] ?? '' ) );

        if ( '' === $title ) {
            return;
        }

        $tag = Utils::validate_html_tag( (string) ( $settings['title_tag'] ?? 'h3' ) );

        $this->add_render_attribute( 'card', 'class', 'acme-card' );
        $this->add_render_attribute( 'title', 'class', 'acme-card__title' );
        $this->add_inline_editing_attributes( 'title', 'none' );

        if ( ! empty( $settings['link']['url'] ) ) {
            $this->add_link_attributes( 'link', $settings['link'] );
        }
        ?>
        <article <?php $this->print_render_attribute_string( 'card' ); ?>>
            <<?php echo esc_attr( $tag ); ?> <?php $this->print_render_attribute_string( 'title' ); ?>>
                <?php echo esc_html( $title ); ?>
            </<?php echo esc_attr( $tag ); ?>>

            <?php if ( '' !== trim( (string) ( $settings['description'] ?? '' ) ) ) : ?>
                <p class="acme-card__description">
                    <?php echo esc_html( $settings['description'] ); ?>
                </p>
            <?php endif; ?>

            <?php if ( ! empty( $settings['link']['url'] ) ) : ?>
                <a class="acme-card__link" <?php $this->print_render_attribute_string( 'link' ); ?>>
                    <?php echo esc_html__( 'Learn more', 'acme-elementor-widgets' ); ?>
                </a>
            <?php endif; ?>
        </article>
        <?php
    }

    public function render_plain_content(): void {
        $settings = $this->get_settings_for_display();
        echo esc_html( (string) ( $settings['title'] ?? '' ) );
    }

    protected function content_template(): void {
        ?>
        <#
        const allowedTags = [ 'h2', 'h3', 'h4', 'p' ];
        const titleTag = allowedTags.includes( settings.title_tag ) ? settings.title_tag : 'h3';
        const title = _.escape( settings.title || '' );
        const description = _.escape( settings.description || '' );

        if ( ! title ) {
            return;
        }

        view.addRenderAttribute( 'card', 'class', 'acme-card' );
        view.addRenderAttribute( 'title', 'class', 'acme-card__title' );
        view.addInlineEditingAttributes( 'title', 'none' );
        #>
        <article {{{ view.getRenderAttributeString( 'card' ) }}}>
            <{{{ titleTag }}} {{{ view.getRenderAttributeString( 'title' ) }}}>{{{ title }}}</{{{ titleTag }}}>
            <# if ( description ) { #>
                <p class="acme-card__description">{{{ description }}}</p>
            <# } #>
            <# if ( settings.link && settings.link.url ) { #>
                <a class="acme-card__link" href="{{ elementor.helpers.sanitizeUrl( settings.link.url ) }}">
                    <?php echo esc_html__( 'Learn more', 'acme-elementor-widgets' ); ?>
                </a>
            <# } #>
        </article>
        <?php
    }
}
```

If the widget supports WYSIWYG output, define an HTML policy. Do not replace `esc_html()` with raw output merely because the editor produced the value. For a broad post-content policy use `wp_kses_post()`; for tighter components pass an explicit allowlist to `wp_kses()`.

If the widget runs shortcodes, current-user logic, time-sensitive logic, request-specific logic, or remote queries, remove the `is_dynamic_content(): false` override unless the cache contract has been proven separately.

## Frontend handler pattern

Use an idempotence marker on each Elementor scope. Namespace events and tear down an earlier binding before adding a new one.

```js
( ( $ ) => {
    class AcmeCardHandler extends elementorModules.frontend.handlers.Base {
        getDefaultSettings() {
            return { selectors: { link: '.acme-card__link' } };
        }

        getDefaultElements() {
            const selectors = this.getSettings( 'selectors' );
            return { $link: this.$element.find( selectors.link ) };
        }

        bindEvents() {
            this.elements.$link
                .off( 'click.acmeCard' )
                .on( 'click.acmeCard', () => {
                    this.$element.trigger( 'acme:card-activated' );
                } );
        }

        onDestroy() {
            this.elements.$link.off( '.acmeCard' );
        }
    }

    $( window ).on( 'elementor/frontend/init', () => {
        elementorFrontend.hooks.addAction(
            'frontend/element_ready/acme-card.default',
            ( $element ) => {
                elementorFrontend.elementsHandler.addHandler( AcmeCardHandler, { $element } );
            }
        );
    } );
} )( jQuery );
```

For a small behavior, a scoped callback is acceptable, but keep the same hook and idempotence rules. Do not assume a global DOM-ready callback will run for live editor replacements.

## Release test matrix

### Bootstrap and registration

- Elementor inactive: addon does not fatal and does not load the widget subclass.
- Elementor below minimum: addon does not register hooks and reports the requirement.
- Elementor Free only: the widget registers and renders.
- Elementor Pro active: the same classic widget behaves identically unless an explicitly Pro-only feature is enabled.
- Duplicate activation/load simulation: the widget is registered once.

### Control and persistence

- New instance defaults match their documented shapes.
- Save, reload editor, duplicate widget, copy/paste, export/import template, and revision restore preserve settings.
- Old instances still resolve after an addon update; widget and control IDs were not renamed.
- Invalid imported enum/tag values fall back through a server allowlist.
- Dynamic tags are checked in editor and published frontend.

### Output and security

- Empty and maximal content produce valid HTML.
- Text containing markup, quotes, URLs, and encoded entities is escaped for the intended context.
- Link target/rel/custom attributes are produced through `add_link_attributes()`.
- Media IDs are permission/visibility checked where the widget exposes non-public media.
- Buttons, links, headings, labels, focus order, keyboard activation, and ARIA state are meaningful.

### Assets and lifecycle

- A page without the widget does not request widget-only handles.
- One and multiple instances load each dependency once.
- The editor preview iframe loads frontend dependencies; editor-panel-only assets do not leak to frontend.
- JS initializes on first load and after control changes/rerenders without doubled events.
- Widget removal/re-addition does not leave stale global listeners.

### Performance and compatibility

- Rendering does not perform unbounded or per-row N+1 queries.
- A static cache declaration is tested across anonymous/logged-in users and changing requests.
- Optimized Markup on/off does not break selectors.
- Inline Font Icons on/off works when icons are in scope.
- PHP 7.4 and the newest supported PHP both pass lint/runtime tests.

## Grounding notes

- `Widgets_Manager::register()` stores the instance under its `get_name()` key. A collision can replace the registered object, so prefixing is correctness, not style.
- `Controls_Stack::get_settings_for_display()` resolves active settings and parsed dynamic settings.
- `Element_Base::add_link_attributes()` escapes the URL and rejects custom `href` and `on*` attributes through `Utils::parse_custom_attributes()`.
- `Widget_Base::render_content()` owns the optional inner wrapper and asset/runtime registration around the widget's `render()` output.
- `Element_Base::is_dynamic_content()` defaults to `true`; the false override opts into output caching eligibility.
- Elementor frontend fires `frontend/element_ready/{widgetType.skin}` from `assets/js/frontend.js`.
