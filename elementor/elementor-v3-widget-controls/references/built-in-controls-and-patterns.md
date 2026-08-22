# Built-in classic controls and rendering patterns

Read this reference when the implementation depends on a control's returned value shape, responsive CSS, conditions, dynamic tags, group controls, or repeaters. All classes listed here are available in Elementor Free 4.2.3 unless explicitly noted.

## Control catalog

`Elementor\Controls_Manager` exposes these classic control constants in the tested source:

| Family | Constants | Typical value |
|---|---|---|
| Plain data | `TEXT`, `NUMBER`, `TEXTAREA`, `WYSIWYG`, `CODE`, `HIDDEN` | scalar string/number-like value |
| Choice | `SELECT`, `SELECT2`, `CHOOSE`, `SWITCHER` | scalar; `SELECT2` can return a list when `multiple` is true |
| Panel-only UI | `HEADING`, `RAW_HTML`, `DIVIDER`, `POPOVER_TOGGLE` | layout/instruction rather than business content |
| Style/data | `COLOR`, `SLIDER`, `DIMENSIONS`, `TEXT_SHADOW`, `DATE_TIME` | scalar or compound shape |
| Media | `MEDIA`, `GALLERY`, `ICONS` | attachment/icon arrays |
| Collection | `REPEATER` | list of row maps |

The source also registers internal section/tab/WP-widget controls. Do not use internal manager controls merely because their constants or classes are discoverable.

## Value-shape table

### Scalars

| Control | Common returned value | Required consumer check |
|---|---|---|
| `TEXT`, `TEXTAREA`, `WYSIWYG`, `CODE`, `HIDDEN` | string | Cast defensively; escape or KSES at output |
| `NUMBER` | number-like scalar | `is_numeric()`, cast, clamp to the business range |
| `SELECT`, `CHOOSE` | selected option key | Strict allowlist; never trust the editor options alone |
| `SWITCHER` | configured `return_value`, normally `'yes'`, or empty | Compare strictly to the declared return value |
| `COLOR` | CSS color string | Prefer a `selectors` declaration; validate if used in custom output |
| `DATE_TIME` | date/time string | Parse against the expected format/timezone before business use |

`SELECT2` returns a scalar in single mode and an array in multiple mode. Normalize explicitly rather than accepting both accidentally.

### Compound values

```php
// URL
[
    'url'               => '',
    'is_external'       => '',
    'nofollow'          => '',
    'custom_attributes' => '',
]

// MEDIA
[
    'id'   => '',
    'url'  => '',
    'size' => '',
]

// ICONS
[
    'value'   => '',
    'library' => '',
]

// SLIDER
[
    'size'  => '',
    'unit'  => 'px',
    'sizes' => [],
]

// DIMENSIONS
[
    'top'      => '',
    'right'    => '',
    'bottom'   => '',
    'left'     => '',
    'unit'     => 'px',
    'isLinked' => true,
]
```

`GALLERY` is a list of attachment-like arrays. `REPEATER` is a list of row maps and Elementor adds a stable `_id` to each row.

Defaults must use the same shape. A common broken URL default is `'default' => 'https://example.com'`; the correct form is:

```php
'default' => [
    'url'         => 'https://example.com/',
    'is_external' => true,
    'nofollow'    => true,
],
```

## Dedicated renderers

### URL

```php
if ( ! empty( $settings['link']['url'] ) ) {
    $this->add_link_attributes( 'cta', $settings['link'] );
    ?>
    <a <?php $this->print_render_attribute_string( 'cta' ); ?>>
        <?php echo esc_html( $settings['label'] ); ?>
    </a>
    <?php
}
```

`add_link_attributes()` handles URL escaping, target, nofollow, and Elementor's parsed custom-attribute format. In 4.2.3, custom attributes cannot override `href` and `on*` event attributes are rejected. Still do not interpret URL settings as proof that the destination is authorized or public.

### Media

Prefer WordPress attachment rendering when an ID exists:

```php
$image_id = absint( $settings['image']['id'] ?? 0 );

if ( $image_id ) {
    echo wp_get_attachment_image( $image_id, 'large', false, [
        'class' => 'acme-card__image',
    ] );
} elseif ( ! empty( $settings['image']['url'] ) ) {
    ?>
    <img class="acme-card__image" src="<?php echo esc_url( $settings['image']['url'] ); ?>" alt="">
    <?php
}
```

Use `Group_Control_Image_Size::get_attachment_image_html()` when the editor must choose registered/custom image sizes. Do not expose a private attachment merely because an editor saved its ID.

### Icons

```php
if ( ! empty( $settings['icon']['value'] ) ) {
    \Elementor\Icons_Manager::render_icon(
        $settings['icon'],
        [ 'aria-hidden' => 'true' ]
    );
}
```

Use an accessible text label for an action or remove `aria-hidden` and provide a meaningful icon label only when the icon itself conveys unique content. Never hardcode a Font Awesome `i` element; Inline Font Icons can replace font icons with SVG and omit font CSS on the published frontend.

## Dynamic tags

Enable compatible dynamic content deliberately:

```php
$this->add_control(
    'title',
    [
        'label'   => esc_html__( 'Title', 'acme' ),
        'type'    => \Elementor\Controls_Manager::TEXT,
        'dynamic' => [ 'active' => true ],
    ]
);
```

Some control classes declare a default dynamic category/property (URL, media, slider, and others). Do not guess a category constant or force a type-incompatible tag. Review the concrete control class and the dynamic tag's declared category.

Render with `get_settings_for_display()`. Elementor then resolves configured tags and filters inactive settings. Escape the resolved result; the tag's source does not make the result safe for every HTML context.

## Conditions

### Simple conditions

```php
'condition' => [
    'layout' => [ 'stacked', 'inline' ],
    'icon!'  => '',
],
```

The `!` suffix expresses inequality in the simple condition syntax. Use arrays for accepted values. Keep simple conditions readable; use `conditions` for explicit operators.

### Advanced conditions

```php
'conditions' => [
    'relation' => 'and',
    'terms'    => [
        [ 'name' => 'enabled', 'operator' => '===', 'value' => 'yes' ],
        [ 'name' => 'count', 'operator' => '>=', 'value' => 2 ],
    ],
],
```

Documented operators are `==`, `!=`, `!==`, `in`, `!in`, `contains`, `!contains`, `<`, `<=`, `>`, `>=`, and `===`. The default relation and operator are `and` and `===`.

Condition scope matters:

- A top-level control may depend on another top-level control.
- A repeater inner field may depend on another field in the same row.
- A repeater inner field cannot depend on a main/top-level control.
- Hiding does not erase the stored value or authorize the corresponding output.

## Selectors and responsive controls

### Selector placeholders

| Placeholder | Use |
|---|---|
| `{{WRAPPER}}` | The current widget wrapper; always scope custom widget CSS here |
| `{{VALUE}}` | Scalar control value or mapped dictionary value |
| `{{SIZE}}` / `{{UNIT}}` | Unit-control members such as Slider/Dimensions |
| `{{CURRENT_ITEM}}` | Current repeater row's generated class |

Use a dictionary to map stored semantic keys to CSS:

```php
$this->add_control(
    'alignment',
    [
        'label'    => esc_html__( 'Alignment', 'acme' ),
        'type'     => \Elementor\Controls_Manager::CHOOSE,
        'options'  => [
            'start'  => [ 'title' => esc_html__( 'Start', 'acme' ), 'icon' => 'eicon-text-align-left' ],
            'center' => [ 'title' => esc_html__( 'Center', 'acme' ), 'icon' => 'eicon-text-align-center' ],
            'end'    => [ 'title' => esc_html__( 'End', 'acme' ), 'icon' => 'eicon-text-align-right' ],
        ],
        'default'  => 'start',
        'selectors_dictionary' => [
            'start' => 'start',
            'center' => 'center',
            'end' => 'end',
        ],
        'selectors' => [
            '{{WRAPPER}} .acme-card' => 'text-align: {{VALUE}};',
        ],
    ]
);
```

Use `add_responsive_control()` for CSS that Elementor can emit at its configured breakpoints. Avoid using a responsive control to choose server-rendered semantic markup: PHP renders one response, while device variants are represented in generated CSS/settings. Do not construct internal `_tablet`/`_mobile` keys manually.

## Group controls

The tested Free source includes these common group control families:

- Typography
- Background
- Border
- Box Shadow
- Text Shadow
- Text Stroke
- CSS Filter
- Image Size

Use the class's `get_type()` and a unique name:

```php
$this->add_group_control(
    \Elementor\Group_Control_Border::get_type(),
    [
        'name'     => 'card_border',
        'selector' => '{{WRAPPER}} .acme-card',
    ]
);
```

A group creates multiple internal setting keys. Do not read guessed keys such as `card_border_width` unless the public group contract explicitly requires it. Prefer its generated selectors/helper.

## Repeater pattern

```php
$repeater = new \Elementor\Repeater();

$repeater->add_control(
    'text',
    [
        'label'   => esc_html__( 'Text', 'acme' ),
        'type'    => \Elementor\Controls_Manager::TEXT,
        'default' => esc_html__( 'List item', 'acme' ),
    ]
);

$repeater->add_control(
    'link',
    [
        'label' => esc_html__( 'Link', 'acme' ),
        'type'  => \Elementor\Controls_Manager::URL,
    ]
);

$repeater->add_control(
    'color',
    [
        'label'     => esc_html__( 'Color', 'acme' ),
        'type'      => \Elementor\Controls_Manager::COLOR,
        'selectors' => [
            '{{WRAPPER}} {{CURRENT_ITEM}} .acme-list__text' => 'color: {{VALUE}};',
        ],
    ]
);

$this->add_control(
    'items',
    [
        'label'       => esc_html__( 'Items', 'acme' ),
        'type'        => \Elementor\Controls_Manager::REPEATER,
        'fields'      => $repeater->get_controls(),
        'title_field' => '{{{ text }}}',
        'default'     => [
            [ 'text' => esc_html__( 'First item', 'acme' ) ],
        ],
    ]
);
```

Safe PHP rendering:

```php
$items = is_array( $settings['items'] ?? null ) ? $settings['items'] : [];

if ( $items ) {
    echo '<ul class="acme-list">';

    foreach ( $items as $index => $item ) {
        $text = trim( (string) ( $item['text'] ?? '' ) );
        if ( '' === $text ) {
            continue;
        }

        $text_key = $this->get_repeater_setting_key( 'text', 'items', $index );
        $link_key = 'item_link_' . $index;

        $this->add_render_attribute( $text_key, 'class', 'acme-list__text' );
        $this->add_inline_editing_attributes( $text_key, 'none' );

        echo '<li class="elementor-repeater-item-' . esc_attr( $item['_id'] ?? '' ) . '">';

        if ( ! empty( $item['link']['url'] ) ) {
            $this->add_link_attributes( $link_key, $item['link'] );
            echo '<a ' . $this->get_render_attribute_string( $link_key ) . '>';
        }

        echo '<span ' . $this->get_render_attribute_string( $text_key ) . '>' . esc_html( $text ) . '</span>';

        if ( ! empty( $item['link']['url'] ) ) {
            echo '</a>';
        }

        echo '</li>';
    }

    echo '</ul>';
}
```

The concatenated attribute strings above are already escaped by Elementor's attribute renderer; annotate that fact for PHPCS rather than escaping the whole attribute string again. If direct echo makes review harder, switch to PHP template blocks and `print_render_attribute_string()`.

Do not perform a database or HTTP lookup inside each row. Gather all IDs first, validate/bound the count, fetch in one operation, then map results back by stable ID.

## Output policy matrix

| Setting use | Minimum handling |
|---|---|
| Plain visible text | `esc_html()` |
| Attribute value | `add_render_attribute()` or `esc_attr()` |
| URL control | `add_link_attributes()`; otherwise `esc_url()` |
| Limited rich text | `wp_kses()` with component allowlist |
| General post-like rich text | `wp_kses_post()` if that broad policy is intended |
| HTML tag name | strict allowlist or `Elementor\Utils::validate_html_tag()` |
| CSS class suffix | strict allowlist plus namespaced prefix |
| Number | numeric check, cast, min/max clamp |
| Attachment | `absint()`, visibility/permission rule, attachment renderer |
| Icon | `Icons_Manager::render_icon()` |

Never use `print_unescaped_setting()` for ordinary addon output. It is intentionally unescaped and shifts the full safety proof onto the caller.

## Elementor 4.x optimized control-stack caveat

Do not use a bulk frontend/CLI control listing as proof that a style control failed to register. With control optimization active, `Controls_Manager::add_control_to_stack()` stores controls recognized as style controls in a separate `style_controls` stack. `Controls_Stack::get_controls()` merges that stack only when `Performance::is_use_style_controls()` is true for the current context.

The single-control lookup deliberately checks both stacks:

```php
$gap = $widget->get_controls( 'item_gap' );

if ( ! $gap ) {
    throw new RuntimeException( 'The expected style control is missing.' );
}
```

Therefore:

- Use `get_controls( 'known-id' )` for a registration assertion.
- Inspect the editor configuration when testing panel visibility.
- Do not assert that `array_keys( $widget->get_controls() )` is a complete schema in every frontend/CLI context.
- Do not build production behavior by inventorying internal control stacks; consume documented settings and widget APIs.

This split is an optimization detail, not a second control-registration API. Continue to call `add_control()`, `add_responsive_control()`, and `add_group_control()` normally.

## Grounding notes

- Control constants and registrations: `includes/managers/controls.php`.
- Value shapes: `includes/controls/url.php`, `media.php`, `icons.php`, `slider.php`, `dimensions.php`, and `gallery.php`.
- Sections, selectors, responsive/group methods, display settings, render attributes, and the optimized split-stack lookup: `includes/base/controls-stack.php`.
- Style-control stack classification: `includes/managers/controls.php`.
- URL attributes: `includes/base/element-base.php` and `includes/utils.php::parse_custom_attributes()`.
- Repeater `_id`, `get_controls()`, and defaults: `includes/elements/repeater.php` and `includes/controls/repeater.php`.
- Native models: `includes/widgets/heading.php` for a compact widget and `includes/widgets/icon-list.php` for repeater rendering.
