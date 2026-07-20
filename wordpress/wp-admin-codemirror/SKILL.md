---
name: wp-admin-codemirror
description: Embed WordPress's bundled CodeMirror editor in admin pages via
  `wp_enqueue_code_editor()` and `wp.codeEditor.initialize()`. Covers MIME
  / file mode selection for CSS, JS, JSON, HTML, PHP, SQL, Markdown, and YAML;
  the `false` return when user profile syntax highlighting is disabled;
  passing settings to JS; the bare textarea ID requirement for
  `initialize( 'mytextarea', settings )`; reading values with
  `instance.codemirror.getValue()`; `wp_code_editor_settings`; and linter
  handles such as `csslint`, `htmlhint`, `htmlhint-kses`, and `jsonlint`.
  Use for custom CSS, snippets, JSON schemas, webhook previews, regex fields,
  or any plugin settings textarea that needs syntax highlighting.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress Admin CodeMirror (`wp.codeEditor`)

WP bundles CodeMirror 5 plus its linter add-ons. Plugins almost never use it because the entry point is one underused function (`wp_enqueue_code_editor`) and the JS init is split between two files. This skill is the bootstrap recipe.

## When to use this skill

Trigger when ANY of the following is true:

- The user is adding a `<textarea>` to admin for CSS / JSON / JS / HTML / PHP / SQL / regex / Markdown / YAML content and wants syntax highlighting (NOT the block editor).
- Code references `wp_enqueue_code_editor`, `wp_get_code_editor_settings`, `wp.codeEditor`, `wp.CodeMirror`, `wp_code_editor_settings`, `code-editor` script handle.
- The user is building a "custom CSS field", "snippet editor", "JSON config editor", "webhook payload field", "regex builder", "shortcode preview", "rules engine".
- The user mentions CodeMirror, Monaco, Ace, Prism specifically in a WP-admin context — and the answer is "use the bundled CodeMirror".

## The five-step bootstrap
```php
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    // 1. Only on your screen.
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }

    // 2. Ask WP to enqueue CodeMirror and bundle a settings snapshot for this MIME type.
    //    Use 'type' (MIME) or 'file' (extension sniff).
    $settings = wp_enqueue_code_editor( array( 'type' => 'text/css' ) );

    // 3. CRITICAL: $settings is false when the user has disabled syntax highlighting
    //    in their profile. Stop here; the textarea stays as a plain textarea.
    if ( false === $settings ) {
        return;
    }

    // 4. Enqueue YOUR admin script that calls wp.codeEditor.initialize().
    wp_enqueue_script(
        'myplugin-css-editor',
        plugins_url( 'assets/css-editor.js', MYPLUGIN_FILE ),
        array( 'code-editor', 'wp-i18n' ),
        MYPLUGIN_VERSION,
        array( 'in_footer' => true )
    );

    // 5. Pass the textarea ID and per-instance settings to your script.
    wp_add_inline_script(
        'myplugin-css-editor',
        'window.MyPluginCssEditor = ' . wp_json_encode( array(
            'id'       => 'myplugin_custom_css',
            'settings' => $settings,
        ) ) . ';',
        'before'
    );
} );
```

```js
// assets/css-editor.js
jQuery( function () {
    if ( ! window.wp || ! wp.codeEditor || ! window.MyPluginCssEditor ) {
        return;
    }
    wp.codeEditor.initialize(
        MyPluginCssEditor.id,
        MyPluginCssEditor.settings
    );
} );
```

When the first argument is a string, pass the bare textarea `id` with no `#`.
If you want to pass a CSS selector, pass a jQuery object instead: `wp.codeEditor.initialize( jQuery( '#myplugin_custom_css' ), settings )`.

```php
// In your settings view, the underlying field stays a plain <textarea>.
// Submit-time the form posts the textarea value as if CodeMirror weren't there.
?>
<textarea id="myplugin_custom_css" name="myplugin_options[custom_css]" rows="10" cols="60"><?php
    echo esc_textarea( $options['custom_css'] ?? '' );
?></textarea>
```

That's the whole flow for a native form submission. CodeMirror's
`EditorFromTextArea` saves its value back into the original `<textarea>` when
that form submits.

## Reading / writing programmatically

`wp.codeEditor.initialize()` returns an object with `.codemirror` (the underlying CodeMirror 5 instance with full API):

```js
const editor = wp.codeEditor.initialize( 'myplugin_custom_css' );

editor.codemirror.getValue();                          // current text
editor.codemirror.setValue( '/* new content */' );     // replace text
editor.codemirror.on( 'change', () => { /* ... */ } ); // change events
editor.codemirror.focus();
editor.codemirror.refresh();                           // call after un-hiding (tabs, accordion)
editor.updateErrorNotice();                            // force-refresh the linter notice
```

The `.refresh()` call is non-obvious and important — if your editor lives inside a hidden tab, accordion, or modal that's shown later, the editor renders at width=0 until you `refresh()` after it becomes visible.

## Picking the right `type` / `file`

`wp_enqueue_code_editor()` accepts either `type` (a MIME string) or `file` (a filename — extension is sniffed). The full per-MIME mode mapping lives in `wp_get_code_editor_settings()` (`wp-includes/general-template.php:4128`). Common values:

| Use case | Recommended call |
|---|---|
| CSS | `array( 'type' => 'text/css' )` |
| JavaScript | `array( 'type' => 'text/javascript' )` |
| JSON | `array( 'type' => 'application/json' )` |
| HTML | `array( 'type' => 'text/html' )` |
| PHP | `array( 'type' => 'application/x-httpd-php' )` |
| SQL | `array( 'type' => 'text/x-sql' )` |
| Markdown | `array( 'type' => 'text/x-markdown' )` |
| YAML | `array( 'type' => 'text/x-yaml' )` |
| Filename sniff | `array( 'file' => 'config.json' )` |

## Linter handles WP auto-enqueues

Based on the MIME and the final `codemirror.lint` setting, `wp_enqueue_code_editor()` registers the relevant linter (`wp-includes/general-template.php:4053-4090`):

| MIME / setting | Linter handles enqueued |
|---|---|
| CSS / SCSS / LESS with WP defaults | None — these modes default to `lint: false` |
| CSS / SCSS / LESS after you explicitly set `codemirror.lint: true` | `csslint` |
| HTML with default `lint: true` | `htmlhint`, `csslint`, plus `htmlhint-kses` if the user lacks `unfiltered_html` |
| PHP with WP defaults | None — PHP mode defaults to `lint: false` |
| PHP after you explicitly set `codemirror.lint: true` | `htmlhint`, `csslint`, plus `htmlhint-kses` if the user lacks `unfiltered_html` |
| JavaScript / JSON with default `lint: true` | `jsonlint`; JS lint settings also include the Espree module URL in current WP |

You don't enqueue these — listing them above is so you can predict what shows up in DevTools and so you know what's missing if you replace the default settings.

## Disabling the linter for a specific instance

Pass `lint: false` in the codemirror settings to suppress the gutter and the "X errors" notice:

```js
wp.codeEditor.initialize( 'read-only-preview', {
    codemirror: { readOnly: true, lint: false },
} );
```

## Customizing defaults globally — `wp_code_editor_settings` filter

When you want to change CodeMirror defaults for everyone (e.g. force 2-space indent, add a custom mode, disable a CSSLint rule for the whole admin), filter `wp_code_editor_settings`:

```php
add_filter( 'wp_code_editor_settings', static function ( array $settings, array $args ): array {
    if ( ( $args['type'] ?? '' ) !== 'text/css' ) {
        return $settings;
    }

    // Override CodeMirror options.
    $settings['codemirror']['indentUnit']     = 2;
    $settings['codemirror']['indentWithTabs'] = false;

    // Disable a specific CSSLint rule.
    $settings['csslint']['box-model'] = false;

    return $settings;
}, 10, 2 );
```

Defaults you'll usually want to keep (set in `wp_get_code_editor_settings()` itself, line 4128): `lineNumbers: true`, `lineWrapping: true`, `styleActiveLine: true`, `continueComments: true`, plus shortcuts `Ctrl-Space autocomplete`, `Ctrl-/ toggleComment`, `Ctrl-F findPersistent`.

## The two callbacks worth knowing

```js
wp.codeEditor.initialize( 'my-editor', {
    onChangeLintingErrors: function ( errorAnnotations, allAnnotations ) {
        // Disable the form's Save button while there are lint errors.
        const $save = jQuery( '#submit' );
        $save.prop( 'disabled', errorAnnotations.length > 0 );
    },
    onUpdateErrorNotice: function ( errorAnnotations, codemirror ) {
        // Custom UI for the error notice. WP shows its own by default.
    },
} );
```

`onChangeLintingErrors` is the right hook for "block save until valid" UX. Don't poll `.codemirror.state` from a setInterval — that's the AI-default but wrong pattern.

## Critical rules

- **Always guard against `wp_enqueue_code_editor()` returning `false`**. If the user has disabled syntax highlighting in their profile (`Users → Your Profile → Syntax Highlighting`), the call returns `false` and does NOT enqueue. Your follow-up `wp_enqueue_script( 'my-code-editor' )` would still load and throw `wp.codeEditor is not defined`. Defensive guard:

  ```php
  $settings = wp_enqueue_code_editor( array( 'type' => 'text/css' ) );
  if ( false === $settings ) {
      return; // Leave the plain <textarea> alone.
  }
  ```

  And in JS:

  ```js
  if ( ! window.wp || ! wp.codeEditor ) {
      return;
  }
  ```

- **Call `initialize()` inside `DOMContentLoaded`**. The function itself logs `console.warn('wp.codeEditor.initialize() ran too early...')` when called pre-DOMContentLoaded (`wp-admin/js/code-editor.js:417`). Wrap in `jQuery( function () { ... } )` or `document.addEventListener( 'DOMContentLoaded', ... )`.
- **Don't `wp_enqueue_code_editor()` globally**. It runs on every admin page-load and adds ~6 scripts + 1 stylesheet plus linters. Always gate on `$hook_suffix`.
- **The `<textarea>` must exist before `initialize()` runs**. CodeMirror replaces the textarea in the DOM — late-added textareas (e.g. in a repeater) need their own `initialize()` after insertion.
- **Don't re-initialize an already-initialized textarea**. Track instances; if you must re-init, call `instance.codemirror.toTextArea()` first to detach.
- **Native form submit is synchronized; arbitrary serialization is not**.
  `EditorFromTextArea` updates the original `<textarea>` for the form's native
  submit event. Before programmatically reading or serializing that textarea,
  call `instance.codemirror.save()` or use `getValue()` directly. It does not
  write the textarea on every editor change.

## Common mistakes

```js
// WRONG — assumes wp.codeEditor exists; throws when user disabled highlighting in profile
wp.codeEditor.initialize( 'snippet' );

// RIGHT — guard
if ( window.wp && wp.codeEditor ) {
    wp.codeEditor.initialize( 'snippet' );
}
```

```php
// WRONG — runs on every admin page
add_action( 'admin_enqueue_scripts', 'my_plugin_load_code_editor' );
function my_plugin_load_code_editor(): void {
    wp_enqueue_code_editor( array( 'type' => 'text/css' ) );
}

// RIGHT — gate on the screen
add_action( 'admin_enqueue_scripts', static function ( string $hook_suffix ): void {
    if ( 'settings_page_myplugin' !== $hook_suffix ) {
        return;
    }
    wp_enqueue_code_editor( array( 'type' => 'text/css' ) );
    // ...
} );
```

```js
// WRONG — editor inside hidden tab renders at width=0; user sees nothing
$tab.show();

// RIGHT — refresh after show
$tab.show();
instance.codemirror.refresh();
```

```php
// WRONG — using PHPCS / phpcbf style ruleset; CodeMirror uses CSSLint / JSHint / HTMLHint
$settings['codemirror']['phpcs'] = array( 'WordPress' );

// RIGHT — those linters don't exist client-side. Disable the lint if you only want highlighting.
$settings['codemirror']['lint'] = false;
```

## Cross-references

- See **`wp-plugin-assets-loading`** for the canonical `$hook_suffix` gate pattern.
- See **`wp-admin-form-controls`** for the sibling form controls (color picker, date picker, pointer) that often sit on the same settings page as a code field.
- See **`wp-admin-settings-api`** when the code field is part of a `register_setting()` options page; the sanitize_callback runs on the textarea value, which CodeMirror has already synced.

## What this skill does NOT cover

- The Customizer / block editor code-editing surfaces. Those use the same `wp.codeEditor` but the host integration differs.
- Replacing CodeMirror with Monaco or Ace. Out of scope — use the bundled one.
- Custom CodeMirror modes not bundled in core. WP ships CSS, JS, JSON, HTML mixed, PHP (clike), XML, Markdown, YAML, SQL, Stylus, SCSS, LESS, JSX. Anything else, you bundle yourself.
- Server-side validation of the submitted code. That's a sanitize_callback / `wp_kses` topic, not a CodeMirror topic.

## References

- `wp-includes/general-template.php:4039` — `wp_enqueue_code_editor()` source. The conditional script enqueues per MIME are at lines 4053-4090.
- `wp-includes/general-template.php:4128` — `wp_get_code_editor_settings()`; the default CodeMirror options + per-MIME mode mapping. Filter point at line 4478.
- `wp-admin/js/code-editor.js:416` — `wp.codeEditor.initialize()` definition; the DOMContentLoaded warning is line 417.
- `wp-includes/js/codemirror/` — the actual CodeMirror 5 distribution bundled with core.
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_enqueue_code_editor/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_get_code_editor_settings/>
- Official documentation: <https://developer.wordpress.org/reference/hooks/wp_code_editor_settings/>
- Official documentation: <https://codemirror.net/5/doc/manual.html>
