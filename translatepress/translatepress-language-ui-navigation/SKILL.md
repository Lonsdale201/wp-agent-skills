---
name: translatepress-language-ui-navigation
description: Build or audit TranslatePress language UI compatibility for WordPress themes/plugins. Use for custom language switchers, `[language-switcher]`, `trp_custom_language_switcher()`, `[language-include]`, `[language-exclude]`, legacy `[trp_language]`, per-language menus, Navigation Based on Language, conditional language content, Automatic User Language Detection popup/hello bar, translator accounts, Browse as User Role previews, admin bar visibility, and role-specific or logged-in/logged-out translated content.
author: Soczó Kristóf
contact: mailto:lonsdale201@hotmail.com
plugin: translatepress-multilingual + translatepress-business
plugin-version-tested: "TranslatePress Multilingual 3.2.1 + Business 1.8.2"
wp-version-tested: "7.0"
php-min: "7.4"
last-updated: "2026-06-17"
docs:
  - https://translatepress.com/docs/developers/custom-language-switcher/
  - https://translatepress.com/docs/addons/navigate-based-language/
  - https://translatepress.com/docs/addons/automatic-user-language-detection/
  - https://translatepress.com/docs/addons/browse-as-role/
source-refs:
  - wp-content/plugins/translatepress-multilingual/index.php
  - wp-content/plugins/translatepress-multilingual/readme.txt
  - wp-content/plugins/translatepress-multilingual/includes/functions.php
  - wp-content/plugins/translatepress-multilingual/includes/shortcodes.php
  - wp-content/plugins/translatepress-multilingual/includes/class-language-switcher.php
  - wp-content/plugins/translatepress-multilingual/includes/class-language-switcher-v2.php
  - wp-content/plugins/translatepress-business/readme.txt
  - wp-content/plugins/translatepress-business/add-ons-pro/navigation-based-on-language/class-navigation-based-on-language.php
  - wp-content/plugins/translatepress-business/add-ons-pro/navigation-based-on-language/includes/class-tp-nbl-walker-nav-menu.php
  - wp-content/plugins/translatepress-business/add-ons-pro/automatic-language-detection/class-automatic-language-detection.php
  - wp-content/plugins/translatepress-business/add-ons-pro/automatic-language-detection/includes/class-determine-language.php
  - wp-content/plugins/translatepress-business/add-ons-pro/translator-accounts/includes/class-translator-accounts.php
  - wp-content/plugins/translatepress-business/add-ons-pro/translator-accounts/includes/class-translator-accounts-activator.php
  - wp-content/plugins/translatepress-business/add-ons-pro/browse-as-other-roles/class-browse-as-other-role.php
license: GPLv2-or-later
---

# TranslatePress Language UI And Navigation

Use TranslatePress APIs and add-ons for language switchers, menu visibility, translator access, and language-detection UI. Theme/plugin code should not infer languages from URL segments when TranslatePress already exposes current-language URLs and Business add-ons can use different domains.

## When to use this skill

Trigger when ANY of the following is true:

- A theme/plugin needs a language switcher, language dropdown, flag list, current-language indicator, or language-specific menu behavior.
- Code uses `[language-switcher]`, `trp_custom_language_switcher()`, `[language-include]`, `[language-exclude]`, legacy `[trp_language]`, `_trp_menu_languages`, `wp_get_nav_menu_items`, `trp_view_as_values`, `translate_strings`, `trp_language`, `trp_lang_switch`, or Automatic User Language Detection.
- The task mentions Navigation Based on Language, Translator Accounts, Browse as User Role, role-specific content, logged-in/logged-out translation previews, admin bar Translate Site link, popup/hello bar conflicts, or per-language menu items.

## Prefer built-in switchers first

Use built-in TranslatePress switchers when design requirements are ordinary:

- default floating switcher from settings;
- menu language switcher item;
- `[language-switcher]` shortcode.

Only build a custom switcher when the theme needs custom markup or a component-system integration.

## Custom language switcher

Use `trp_custom_language_switcher()` when available:

```php
if ( function_exists( 'trp_custom_language_switcher' ) ) {
    $languages = trp_custom_language_switcher();

    echo '<nav class="my-language-switcher" data-no-translation aria-label="' . esc_attr__( 'Language', 'mytheme' ) . '">';
    foreach ( $languages as $language ) {
        printf(
            '<a href="%s" hreflang="%s"><img src="%s" alt="" /> <span>%s</span></a>',
            esc_url( $language['current_page_url'] ),
            esc_attr( str_replace( '_', '-', $language['language_code'] ) ),
            esc_url( $language['flag_link'] ),
            esc_html( $language['language_name'] )
        );
    }
    echo '</nav>';
}
```

The docs require `data-no-translation` on the wrapper so TranslatePress does not translate the switcher links themselves. The returned array includes language name, language code, short language name/slug, flag URL, and current-page URL for that language.

Do not compute switcher URLs manually from URL slugs. That breaks default-language subdirectory settings, unpublished languages, translated slugs, and Different Domain per Language.

## Conditional content

Prefer the current core conditional shortcodes:

```text
[language-include lang="en_US,fr_FR" enable_translation="yes"]Visible in selected languages[/language-include]
[language-exclude lang="de_DE" enable_translation="no"]Hidden in German and not translated elsewhere[/language-exclude]
```

`enable_translation="no"` wraps the content in `data-no-translation`, so use it only when the included content must remain literal.

The older shortcode still exists but is deprecated in core 3.2.1:

```text
[trp_language language="en_US"]English-only content[/trp_language]
```

Avoid adding new `[trp_language]` usage. Keep it only for legacy content until it can be migrated. Use conditional shortcodes for small editorial blocks only. For structural theme logic, prefer normal templates plus translated content. Do not hide checkout, account, legal, or accessibility-critical controls by language unless the business requirement is explicit.

## Navigation Based on Language

The add-on stores allowed languages in menu item meta `_trp_menu_languages` and filters front-end menu items through `wp_get_nav_menu_items`. It also hides children of hidden parents and passes visibility through `nav_menu_roles_item_visibility`.

Theme rules:

- Render menus with `wp_nav_menu()` or `wp_get_nav_menu_items()` so filters run.
- Do not query `wp_posts` menu items directly.
- Preserve menu item IDs and parent IDs; child hiding depends on them.
- If a custom walker filters items, run after TranslatePress or preserve its filtered item list.
- Test nested menu items where the parent is language-limited.

Plugin rules:

```php
$items = wp_get_nav_menu_items( $menu_id ); // lets TranslatePress hide language-limited items.
```

Do not read `_trp_menu_languages` and implement a parallel visibility system unless you must support a non-WP menu renderer.

## Translator Accounts

Translator Accounts creates/updates a `translator` role with:

- `translate_strings`
- `upload_files`

It also:

- forces admin bar visibility for users with `translate_strings` unless `trp_force_show_admin_bar_for_translator_accounts` returns false;
- removes the TranslatePress Settings admin-bar link for users who cannot `manage_options`;
- adds a `Translate Site` admin menu item for `translate_strings`.

If your plugin/theme hides the admin bar or blocks wp-admin for non-admin roles, allow `current_user_can( 'translate_strings' )` where the feature is only about translation access. Do not give translators plugin settings capabilities unless they need them.

## Browse as User Role

Browse as User Role adds all roles to the translation editor "View as" selector, adds nonces per role, and temporarily changes the current user role during preview with `trp_temporary_change_current_user_role`.

Compatibility rules:

- Use WordPress capability checks normally; the preview should see the same output as that role.
- Avoid irreversible side effects during front-end rendering because the translation editor loads pages as previews.
- Gate write actions behind POST, nonce, and capability checks; never run them merely because a role-specific page rendered.
- Test role-specific shortcodes, account dashboards, membership notices, and menu items in the translation editor.

## Automatic User Language Detection UI

Automatic User Language Detection:

- chooses a preferred language from browser language, IP, or configured fallback order;
- stores preference in the `trp_language` cookie;
- localizes `trp_language_cookie_data`;
- may append popup or hello-bar UI in `wp_footer`;
- strips repeated `trp_lang_switch` from current-page URLs;
- can sync language cookies across mapped domains through a public REST endpoint when Multiple Domains is configured.

Theme/plugin checks:

- Verify sticky headers, consent banners, modals, and chat widgets do not cover the popup/hello bar.
- Do not remove `wp_footer()`; the UI depends on it.
- Do not strip `trp_lang_switch` in custom JS unless you understand the switch flow.
- Do not assume a first-time visitor will stay on the first URL if the site uses direct redirect mode.
- Prefer popup/hello-bar mode over direct redirects when SEO/indexing matters.

## Test matrix

Run UI checks across:

- default language and every published secondary language;
- logged-out user;
- admin user;
- translator role user;
- a role-specific user if membership/account content exists;
- first visit without `trp_language` cookie;
- after manually switching language;
- mobile viewport with sticky header and menu open;
- Different Domain per Language enabled, if used.

## Critical rules

- Do not manually build language switcher URLs.
- Do not let TranslatePress translate the language switcher markup; wrap it with `data-no-translation`.
- Do not bypass `wp_nav_menu()`/`wp_get_nav_menu_items()` for menu output that should respect language visibility.
- Do not hide the admin bar from translators without preserving their TranslatePress access.
- Do not perform write actions during translation-editor preview or "Browse as role" rendering.
- Do not remove `wp_footer()` from themes.

## Cross-references

- Run **`translatepress-output-compatibility`** for dynamic strings, exclusions, AJAX fragments, and automatic translation behavior.
- Run **`translatepress-url-seo-compatibility`** for switcher URL targets, translated slugs, multiple domains, canonical, and sitemap behavior.
- Run **`translatepress-email-notification-compatibility`** for preferred user language and recipient-language emails.
- Run **`wp-accessibility-audit`** for switcher semantics, focus behavior, aria labels, and keyboard support.

## References

- Custom language switcher docs: <https://translatepress.com/docs/developers/custom-language-switcher/>
- Core switcher function source: `wp-content/plugins/translatepress-multilingual/includes/functions.php`
- Core conditional shortcode source: `wp-content/plugins/translatepress-multilingual/includes/shortcodes.php`
- Navigation Based on Language docs: <https://translatepress.com/docs/addons/navigate-based-language/>
- Automatic User Language Detection docs: <https://translatepress.com/docs/addons/automatic-user-language-detection/>
- Navigation add-on source: `add-ons-pro/navigation-based-on-language/class-navigation-based-on-language.php`
- Translator Accounts source: `add-ons-pro/translator-accounts/includes/class-translator-accounts.php`
- Browse as Role source: `add-ons-pro/browse-as-other-roles/class-browse-as-other-role.php`
