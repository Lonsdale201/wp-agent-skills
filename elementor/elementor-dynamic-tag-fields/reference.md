# elementor-dynamic-tag-fields — reference

Supporting detail for the `elementor-dynamic-tag-fields` skill: the control-type catalog and a complete end-to-end `Data_Tag`.

## Control type catalog (`Elementor\Controls_Manager`)

Verified constants in [wp-content/plugins/elementor/includes/managers/controls.php](controls.php). These are the types commonly useful inside a dynamic tag's `register_controls()`:

| Constant | Value | Notes |
|---|---|---|
| `Controls_Manager::TEXT` | `'text'` | single-line string |
| `Controls_Manager::TEXTAREA` | `'textarea'` | multi-line string |
| `Controls_Manager::NUMBER` | `'number'` | supports `min` / `max` / `step` |
| `Controls_Manager::SELECT` | `'select'` | single choice; `options` is `[ value => label ]` |
| `Controls_Manager::SELECT2` | `'select2'` | searchable; add `'multiple' => true` for multi. **Preload only small sets** — see `elementor-dynamic-tag-ajax-select` |
| `Controls_Manager::SWITCHER` | `'switcher'` | on/off; set `return_value` + `label_on`/`label_off` |
| `Controls_Manager::CHOOSE` | `'choose'` | icon button group |
| `Controls_Manager::COLOR` | `'color'` | pairs with `COLOR_CATEGORY` |
| `Controls_Manager::MEDIA` | `'media'` | image/file; pairs with `IMAGE`/`MEDIA` category |
| `Controls_Manager::URL` | `'url'` | link; pairs with `URL_CATEGORY` |
| `Controls_Manager::DATE_TIME` | `'date_time'` | pairs with `DATETIME_CATEGORY` |
| `Controls_Manager::WYSIWYG` | `'wysiwyg'` | rich-text editor |
| `Controls_Manager::CODE` | `'code'` | code editor |
| `Controls_Manager::ICONS` | `'icons'` | icon picker (v2 icon library) |
| `Controls_Manager::GALLERY` | `'gallery'` | multiple images; pairs with `GALLERY_CATEGORY` |
| `Controls_Manager::REPEATER` | `'repeater'` | rows of sub-controls (build with `\Elementor\Repeater`) |
| `Controls_Manager::ALERT` | `'alert'` | static notice in the panel (no value) |
| `Controls_Manager::HEADING` | `'heading'` | section label (no value) |
| `Controls_Manager::RAW_HTML` | `'raw_html'` | static markup in the panel (no value) |
| `Controls_Manager::HIDDEN` | `'hidden'` | stored, not shown |

Line refs: TEXT 54, NUMBER 59, TEXTAREA 64, SELECT 69, SWITCHER 74, HIDDEN 84, HEADING 89, RAW_HTML 94, ALERT 109, COLOR 139, MEDIA 144, CHOOSE 159, WYSIWYG 169, CODE 174, URL 194, REPEATER 199, ICON 204, ICONS 209, GALLERY 214, SELECT2 224, DATE_TIME 229.

### Reading values back

- `$this->get_settings( 'key' )` — raw stored value.
- `$this->get_settings_for_display()` — full settings, parsed (use `['key']`); resolves nested dynamic values where applicable.
- `SWITCHER` returns the `return_value` (e.g. `'yes'`) when on, `''` when off.
- `SELECT2` multiple returns an array.
- `MEDIA` returns `[ 'id' => int, 'url' => string ]`; `URL` returns `[ 'url' => string, 'is_external' => '', 'nofollow' => '' ]`.

## Complete worked `Data_Tag` — author Twitter URL with fallback

A `Data_Tag` feeding a `URL` control, with a manually-wired fallback (Data_Tags get no automatic Before/After/Fallback — see the skill body).

```php
namespace MyPlugin\Tags;

use Elementor\Core\DynamicTags\Data_Tag;
use Elementor\Controls_Manager;
use Elementor\Modules\DynamicTags\Module as TagsModule;

class Author_Twitter_Url extends Data_Tag {

    public function get_name(): string {
        return 'myplugin-author-twitter-url';
    }

    public function get_title(): string {
        return esc_html__( 'Author Twitter URL', 'myplugin' );
    }

    public function get_group(): string {
        return 'myplugin';   // registered via register_group() — see elementor-dynamic-tag-register
    }

    public function get_categories(): array {
        return [ TagsModule::URL_CATEGORY ];   // feeds link controls
    }

    protected function register_controls(): void {
        // No automatic fallback on Data_Tag — register one whose type
        // matches the consuming control (URL here).
        $this->add_control( 'fallback', [
            'label' => esc_html__( 'Fallback URL', 'myplugin' ),
            'type'  => Controls_Manager::URL,
        ] );
    }

    protected function get_value( array $options = [] ) {
        $author_id = get_the_author_meta( 'ID' );
        $handle    = $author_id ? get_user_meta( $author_id, 'twitter', true ) : '';

        if ( $handle ) {
            return [
                'url'         => 'https://twitter.com/' . ltrim( $handle, '@' ),
                'is_external' => 'on',
                'nofollow'    => '',
            ];
        }

        // Manual fallback — the URL control value, or empty.
        return $this->get_settings( 'fallback' );
    }
}
```

## Complete worked `Tag` — reading time with automatic fallback

A `Tag` (echoes) automatically gets Before / After / Fallback in an "Advanced" section, and applies the fallback when `render()` outputs empty. The only contract: emit **nothing** when there's no value.

```php
namespace MyPlugin\Tags;

use Elementor\Core\DynamicTags\Tag;
use Elementor\Controls_Manager;
use Elementor\Modules\DynamicTags\Module as TagsModule;

class Reading_Time extends Tag {

    public function get_name(): string { return 'myplugin-reading-time'; }
    public function get_title(): string { return esc_html__( 'Reading Time', 'myplugin' ); }
    public function get_group(): string { return 'myplugin'; }
    public function get_categories(): array { return [ TagsModule::TEXT_CATEGORY ]; }

    protected function register_controls(): void {
        $this->add_control( 'wpm', [
            'label'   => esc_html__( 'Words / minute', 'myplugin' ),
            'type'    => Controls_Manager::NUMBER,
            'default' => 200,
            'min'     => 50,
        ] );
        $this->add_control( 'suffix', [
            'label'   => esc_html__( 'Suffix', 'myplugin' ),
            'type'    => Controls_Manager::TEXT,
            'default' => esc_html__( 'min read', 'myplugin' ),
        ] );
    }

    public function render(): void {
        $content = get_the_content();
        if ( '' === trim( $content ) ) {
            return;   // emit nothing → Elementor's Fallback control takes over
        }

        $wpm     = max( 50, (int) $this->get_settings( 'wpm' ) );
        $words   = str_word_count( wp_strip_all_tags( $content ) );
        $minutes = max( 1, (int) ceil( $words / $wpm ) );

        echo esc_html( $minutes . ' ' . $this->get_settings( 'suffix' ) );
    }
}
```

## Conditional controls

Use `'condition'` to show a control only for certain settings (same engine as widgets):

```php
$this->add_control( 'type', [
    'type'    => Controls_Manager::SELECT,
    'options' => [ 'billing' => 'Billing', 'shipping' => 'Shipping' ],
    'default' => 'billing',
] );
$this->add_control( 'billing_field', [
    'type'      => Controls_Manager::SELECT,
    'options'   => [ /* … */ ],
    'condition' => [ 'type' => 'billing' ],   // hidden unless type === billing
] );
```

Verified shape in `CustomerDetails` ([wp-content/plugins/dynamic-elementor-extension-main/dynamic-tags/woo-tags/CustomerDetails.php](CustomerDetails.php)) and `Internal_URL` (`condition` per query control).
