# Bootstrap contracts and review mistakes

## Load sequence

The relevant sequence in `wp-settings.php` is:

```text
muplugins_loaded
  -> active plugin main files are included; their top-level code runs
  -> plugins_loaded
  -> after_setup_theme
  -> init
```

Registering hooks at plugin-file scope is normal. Calling another plugin's API,
performing request work, writing the database, or triggering translations there
is not. Defer cross-plugin integration until `plugins_loaded` or the provider's
documented readiness hook.

## Header matrix

| Field | Status | Purpose |
|---|---|---|
| `Plugin Name` | core-required | Makes the plugin discoverable in wp-admin. |
| `Plugin URI` | recommended | Plugin-site link. |
| `Description` | recommended | Summary under the plugin name. |
| `Version` | recommended | Release version; keep constants/artifacts aligned. |
| `Requires at least` | recommended | WordPress minimum checked at activation. |
| `Requires PHP` | recommended | PHP minimum checked at activation. |
| `Requires Plugins` | WP 6.5+ | Comma-separated dependency slugs. |
| `Author` / `Author URI` | recommended | Attribution. |
| `Text Domain` | recommended | Translation domain; normally folder slug. |
| `Domain Path` | conditional | Non-default relative language path. |
| `License` / `License URI` | recommended | Directory/reuse license declaration. |
| `Update URI` | non-directory plugins | Prevents an unrelated directory slug from overwriting it. |
| `Network` | multisite-only plugins | Restricts activation to network-wide use. |

The plugin directory imposes additional review requirements; the core parser's
minimal discovery rule is not a complete publication checklist.

## Review mistakes

Do not call a dependency before all active plugin files have loaded:

```php
// Wrong at plugin-file scope: provider may not be loaded yet.
$version = jet_form_builder()->version();
```

Do not translate a bootstrap-phase value before `after_setup_theme`:

```php
// Wrong at plugin-file scope on modern WordPress.
$message = __( 'My Plugin needs PHP 8.0+', 'my-plugin' );
```

Build raw requirement messages during activation and translate only when a
later admin notice is rendered. On activation failure, deactivate the plugin
and stop activation; merely returning leaves broken active state.

Keep business classes outside the bootstrap. New Composer code uses:

```text
src/Folders/FolderService.php
src/Rest/FoldersController.php
```

Do not scaffold `includes/class-folder-service.php` or define a long singleton
inside the main file.

Spell parser-recognized headers exactly: `Plugin URI` and `Author URI`, not
`Plugin URL` or `Author URL`.

Scope every fallback autoloader to the plugin namespace before mapping it to a
path. An autoloader that attempts to require a file for every unknown class can
collide with WordPress, other plugins, and Composer.

## Bootstrap i18n timing

Exactly two things load a translation without code from you, and only one of
them is recent:

- **The global location, on every supported version.**
  `wp-content/languages/plugins/my-plugin-<locale>.mo` (`.l10n.php` since 6.5) —
  where GlotPress / wp.org installs them. `WP_Textdomain_Registry` always
  searches `WP_LANG_DIR/plugins`.
- **Bundled inside the plugin — WP 6.8 and up only.** As `wp-settings.php` loads
  each active plugin it registers that plugin's language directory from the
  header via `WP_Textdomain_Registry::set_custom_path()`: the `Domain Path`
  value when present, **otherwise the plugin root**.

The version boundary is the part that bites. On **WP 6.7 and earlier**,
`WP_Textdomain_Registry::get_paths_for_domain()` returns only
`WP_LANG_DIR/plugins`, `WP_LANG_DIR/themes`, and paths registered by an explicit
`load_plugin_textdomain()` call — nothing ever looks inside the plugin folder,
so a `.mo` shipped in `<plugin>/languages/` simply never loads there, silently.

So call `load_plugin_textdomain()` when either holds:

- The plugin ships its own translations **and** its `Requires at least:` is
  below 6.8.
- The `.mo` files live somewhere the header does not point at.

Skip it when the plugin is wp.org-distributed (the global location covers it),
or when it declares 6.8+ and its `Domain Path` is correct. Calling it anyway is
harmless — on 6.8+ it just re-registers the same path. **`Domain Path` is
load-bearing, not decoration:** omit it and WP registers the plugin **root**, so
a `languages/` subfolder is invisible even on 6.8+.

When needed, register it on `init`:

```php
add_action( 'init', static function (): void {
    load_plugin_textdomain(
        'my-plugin',
        false,
        dirname( plugin_basename( MYPLUGIN_PLUGIN_FILE ) ) . '/languages'
    );
} );
```

On modern WordPress, early `load_plugin_textdomain()` mainly registers a path;
the notice is caused when `__()`, `_e()`, `esc_html__()`, or another translation
function triggers just-in-time loading before `after_setup_theme`. Keep
bootstrap/activation requirement messages raw and translate them only when a
later admin notice is rendered.

## Composer-free fallback

When Composer truly is unavailable, keep `src/Settings/SettingsTab.php` for
`MyPlugin\Settings\SettingsTab` and register a small namespace-scoped PSR-4
loader. Vendor third-party libraries deliberately. This can suit a tiny plugin,
but every additional dependency increases manual update and collision risk;
prefer a release ZIP containing Composer's production `vendor/` tree.
