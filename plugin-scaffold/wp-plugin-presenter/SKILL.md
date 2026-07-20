---
name: wp-plugin-presenter
description: Design and review native presenter classes in WordPress
  plugins without requiring better-data - converting DTOs or domain
  objects into REST arrays, admin table rows, JS config payloads, email
  variables, and public view models with allowlisted fields, context
  methods, redaction by default, locale/date/number formatting, no DTO
  mutation, and correct WordPress escaping boundaries. Use when adding
  FooPresenter, response mappers, admin-row arrays, wp_send_json payloads,
  rest_ensure_response data, wp_add_inline_script config, or when code
  returns raw DTOs, WP_Post, WC_Order, get_object_vars, json_encode, or
  unescaped HTML from controllers.
metadata:
  wp-skills-author: "Soczo Kristof"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.3 - 6.9"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-04-29"
---

# WordPress plugin: native presenters

For plugin code that turns DTOs / domain objects into output shapes. A
presenter chooses fields, computes labels, formats dates/numbers, redacts
sensitive values, and returns arrays that controllers can send to REST, AJAX,
admin tables, JS config, email templates, exports, or views.

This skill is intentionally **better-data-free**. If the project already uses
better-data, run `bd-presenter`; otherwise use this native pattern.

## When to load references

- Need complete REST/admin/JS/email/export presenter examples, collection presenter, or redaction pattern: read [references/presenter-context-patterns.md](references/presenter-context-patterns.md).
- Refactoring a controller that returns raw DTOs, raw arrays, `WP_Post`, `WC_Order`, `get_object_vars()`, or pre-escaped REST payloads: read [references/before-after-controller-output.md](references/before-after-controller-output.md).

## Misconception this skill corrects

> "The DTO already has `to_array()`, so the controller can return that everywhere."

Wrong. `to_array()` is usually the DTO's canonical data snapshot. REST output,
admin table rows, export rows, JS config, and email variables have different
audiences and redaction rules. A presenter makes those contexts explicit
instead of letting every controller hand-edit arrays.

## When to use this skill

Trigger when ANY of the following is true:

- Adding or reviewing `FooPresenter`, `FooViewModel`, `ResponseMapper`, `AdminRow`, `JsonPresenter`, or similar classes.
- REST/AJAX code returns arrays derived from DTOs, `WP_Post`, `WP_User`, WooCommerce objects, options, or custom table rows.
- Code calls `wp_send_json_success()`, `rest_ensure_response()`, `wp_add_inline_script()`, or builds admin table rows.
- A DTO has sensitive fields and the output needs redaction.
- A controller currently contains formatting, labels, computed fields, or output-specific conditionals.

## Layer boundaries

| Layer | Responsibility |
|---|---|
| DTO | Normalized data. No audience-specific output. |
| Presenter | Context-specific arrays and computed fields. No DB writes. |
| Controller | Permission check, nonce/REST validation, calls presenter, sends response. |
| View/template | Escapes and echoes HTML. |

Presenter output for REST/JSON should be raw JSON-safe primitives, not
pre-escaped HTML. Presenter output for an HTML-only view may include already
escaped markup, but the method name must make that clear, e.g.
`render_badge_html()`.

## Minimal class shape

```php
namespace MyPlugin\Presenter;

use MyPlugin\Dto\ProductDto;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class ProductPresenter {
    private ProductDto $product;

    public function __construct( ProductDto $product ) {
        $this->product = $product;
    }

    /** @return array<string,mixed> */
    public function for_rest(): array {
        return array(
            'id'      => $this->product->id(),
            'title'   => $this->product->title(),
            'enabled' => $this->product->enabled(),
        );
    }

    /** @return array<string,string|int> */
    public function for_admin_table(): array {
        return array(
            'id'     => $this->product->id(),
            'title'  => $this->product->title(),
            'status' => $this->product->enabled() ? __( 'Enabled', 'my-plugin' ) : __( 'Disabled', 'my-plugin' ),
        );
    }
}
```

Use explicit context methods instead of a generic `to_array( $context )` until
the contexts genuinely share most of the same shape. Method names make reviews
easier: `for_rest()`, `for_admin_table()`, `for_export()`, `for_email()`,
`for_js_config()`.

## Output rules by context

- **REST/AJAX:** return unescaped scalars, arrays, and nulls. Let WP JSON-encode them.
- **Admin table / template:** presenter chooses values; view escapes with `esc_html()`, `esc_attr()`, `esc_url()`, or `wp_kses_post()`.
- **Inline JS config:** pass presenter output through `wp_json_encode()` inside `wp_add_inline_script()`.
- **Email:** present subject/body variables separately from HTML template rendering.
- **Export:** use stable machine-readable keys and raw scalar values unless the export is explicitly human-facing.

See [references/presenter-context-patterns.md](references/presenter-context-patterns.md)
for complete examples.

## Redaction by default

Presenter methods should be public-safe by default. Sensitive values require
explicit opt-in:

```php
public function for_admin_table(): array {
    return array(
        'name'    => $this->credential->name(),
        'api_key' => '***',
    );
}

public function for_private_admin( bool $can_reveal_secret ): array {
    if ( ! $can_reveal_secret ) {
        return $this->for_admin_table();
    }

    $api_key = $this->credential->api_key();

    return array(
        'name'    => $this->credential->name(),
        'api_key' => $api_key ? $api_key->reveal() : '',
    );
}
```

The controller passes `$can_reveal_secret = current_user_can( 'manage_options' )`;
the presenter applies that already-made authorization decision. Do not create
convenience methods like `reveal_all()` or include secrets in a generic
`for_rest()` response.

## Critical rules

- **Presenter never mutates the DTO.** Compute output values into arrays.
- **Allowlist fields.** Never `get_object_vars( $dto )`, `json_encode( $dto )`, or return raw WP/WC objects.
- **One context, one method.** `for_rest()` and `for_admin_table()` should not share a leaky "everything" array.
- **Redact sensitive fields by default.** Explicit reveal only in narrowly named methods, and pass the authorization decision in from the controller.
- **Escape at the final HTML boundary.** REST/AJAX/JS config arrays are not HTML.
- **Do not put HTML in REST payloads.** If a method returns HTML, name it `render_*_html()` and escape inside it.
- **Keep DB and WP writes out.** Presenter may call formatting/i18n helpers, but not repositories, `update_option()`, `$wpdb`, or remote APIs.
- **Collections replay per-item presenters.** No duplicated mapping logic.

## Common mistakes

```php
// WRONG - exposes every public property and misses redaction.
return get_object_vars( $dto );

// WRONG - REST payload contains HTML from an admin use case.
return array( 'status' => '<span class="badge">Enabled</span>' );

// WRONG - escaping too early for JSON.
return array( 'title' => esc_html( $dto->title() ) );

// WRONG - side effect in presenter.
update_option( 'myplugin_last_presented', time() );
```

## Cross-references

- Run **`wp-plugin-dto`** when the presenter input is still a raw array or unclear object.
- Run **`wp-plugin-architecture`** when deciding folder placement, namespaces, or by-feature vs by-type organization.
- Run **`wp-plugin-assets-loading`** when passing presenter output into `wp_add_inline_script()`.
- Run **`bd-presenter`** only if the project intentionally uses the better-data library. better-data automates builder-style presentation; this skill is the native no-library version.

## What this skill does NOT cover

- DTO hydration and validation. Use `wp-plugin-dto`.
- Template partial organization or block rendering architecture.
- better-data Presenter internals.
- REST route registration and permission callbacks.

## References

- [references/presenter-context-patterns.md](references/presenter-context-patterns.md) - complete presenter context examples.
- [references/before-after-controller-output.md](references/before-after-controller-output.md) - controller refactor examples.
- `rest_ensure_response()` for REST controllers.
- `wp_send_json_success()` / `wp_send_json_error()` for AJAX.
- `wp_json_encode()` and `wp_add_inline_script()` for safe JS config.
- Official documentation: <https://developer.wordpress.org/plugins/security/validating-sanitizing-escaping/>
- Official documentation: <https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/>
- Official documentation: <https://developer.wordpress.org/reference/functions/rest_ensure_response/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_json_encode/>
