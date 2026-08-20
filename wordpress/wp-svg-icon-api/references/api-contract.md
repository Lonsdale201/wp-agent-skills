# WordPress 7.1 SVG Icon API contract

## Registration return values

All public registration/unregistration helpers return `bool`. Check failures in tests. Expected `_doing_it_wrong()` cases include:

- invalid collection or icon name;
- duplicate identifier;
- icon registered before its collection;
- missing/non-string label;
- unsupported property key;
- neither or both of `content` and `file_path`.

## Sanitized SVG vocabulary in WP 7.1

| Element | Allowed attributes |
|---|---|
| `svg` | `class`, `xmlns`, `width`, `height`, `viewBox`, `aria-hidden`, `role`, `focusable` |
| `path` | `fill`, `fill-rule`, `d`, `transform` |
| `polygon` | `fill`, `fill-rule`, `points`, `transform`, `focusable` |

The allowlist is an implementation contract of the target release and can expand later. Always inspect the target core source before promising that a complex SVG is preserved.

Inline content is sanitized during `wp_register_icon()`. File content is sanitized on lazy read. `file_path` must resolve through `realpath()`, end in `.svg`, and be a readable regular file.

## Rendering behavior

`wp_get_icon( $name, $args )`:

- returns `''` when the icon cannot be resolved;
- defaults to `size => 24`, `class => ''`, `label => ''`;
- treats numeric `size` with `absint()` and sets both dimensions;
- adds every whitespace-separated class to the root SVG;
- removes decorative ARIA when a label is supplied;
- removes image ARIA and sets `aria-hidden`/`focusable` when no label is supplied.

## REST routes and permissions

| Route | Result |
|---|---|
| `GET /wp-json/wp/v2/icons` | All icons; supports search and collection query. |
| `GET /wp-json/wp/v2/icons/{collection}` | Icons in one collection. |
| `GET /wp-json/wp/v2/icons/{collection}/{icon}` | One icon. |
| `GET /wp-json/wp/v2/icon-collections` | All collections. |
| `GET /wp-json/wp/v2/icon-collections/{slug}` | One collection. |

The controller permits users who can `edit_posts` or can edit at least one REST-exposed post type. Missing collections/icons return 404-style `WP_Error` responses.

## Source paths

- `wp-includes/icons.php`
- `wp-includes/class-wp-icons-registry.php`
- `wp-includes/class-wp-icon-collections-registry.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-icons-controller.php`
- `wp-includes/rest-api/endpoints/class-wp-rest-icon-collections-controller.php`
