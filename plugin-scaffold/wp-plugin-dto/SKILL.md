---
name: wp-plugin-dto
description: Design and review native DTOs in WordPress plugins without
  requiring better-data - immutable data carriers, explicit from_array
  hydration, strict coercion instead of unchecked casts, WP_Error
  validation failures, sensitive-field discipline, nested DTO arrays, and
  clear separation from repositories, WP models, presenters, REST
  controllers, and HTML views. Use when a plugin introduces FooDto,
  request DTOs, settings DTOs, value objects, admin-row data shapes, REST
  response source objects, or when reviewing code that passes raw arrays,
  stdClass, WP_Post, WC_Order, $_POST, post meta, or option arrays through
  multiple layers. Mentions better-data only as an optional higher-level
  library; this skill is for native implementations.
author: Soczo Kristof
contact: mailto:lonsdale201@hotmail.com
plugin: wordpress
plugin-version-tested: "6.3 - 6.9"
php-min: "7.4"
last-updated: "2026-04-29"
docs:
  - https://developer.wordpress.org/plugins/security/securing-input/
  - https://developer.wordpress.org/plugins/security/validating-sanitizing-escaping/
  - https://developer.wordpress.org/reference/classes/wp_error/
  - https://developer.wordpress.org/reference/functions/wp_unslash/
---

# WordPress plugin: native DTOs

For plugin code that moves structured data between request input, options,
meta, custom tables, external APIs, REST controllers, admin screens, cron jobs,
and presenters. A DTO gives that data one named shape instead of leaking raw
arrays across the plugin.

This skill is intentionally **better-data-free**. If the project already uses
better-data, run `bd-data-object`; otherwise use this native pattern.

## When to load references

- Need a complete PHP 7.4 / PHP 8.1 DTO implementation, nested DTO, enum-like value set, or secret value object: read [references/native-dto-patterns.md](references/native-dto-patterns.md).
- Refactoring a controller/repository that currently passes raw arrays, `$_POST`, `WP_Post`, meta arrays, or option arrays around: read [references/before-after-raw-array.md](references/before-after-raw-array.md).

## Misconception this skill corrects

> "A DTO is just an array with nicer comments."

Wrong direction. A DTO is a small immutable boundary object with a named schema,
explicit defaults, and one hydration path. It prevents common AI mistakes:
unchecked `(int)` casts, `empty()` swallowing `0`, `isset()` hiding intentional
`null`, dynamic properties, leaking secrets through `to_array()`, and passing
`$_POST` or raw post meta directly to business logic.

## When to use this skill

Trigger when ANY of the following is true:

- Introducing `FooDto`, `FooData`, `SettingsData`, `RequestData`, `Payload`, or a value object.
- A repository, REST controller, admin page, cron job, or WooCommerce hook currently passes large associative arrays around.
- Data comes from `$_GET`, `$_POST`, REST params, options, post meta, user meta, term meta, custom tables, `WP_Post`, `WP_User`, or WooCommerce objects.
- Reviewing hydration / normalization code with casts like `(int)`, `(bool)`, `intval`, `settype`, `empty`, `isset`, `get_object_vars`, or dynamic property assignment.
- Presenter or REST response code needs a stable input object.

## Layer boundaries

| Layer | Responsibility |
|---|---|
| Source / repository | Read WP objects, options, meta, request params, API responses. Knows WordPress. |
| DTO | Hold normalized values. No DB writes, no HTML, no hooks, no global reads. |
| Validator | Decide whether the DTO is acceptable. Returns `true` or `WP_Error`. |
| Presenter | Convert DTO to arrays / JSON-ready values for REST, admin, JS config, email. |
| View / template | Escape and echo HTML. |

The DTO may contain small normalization helpers, but it should not call
`get_post_meta()`, `update_option()`, `wp_remote_get()`, `add_action()`, or echo
anything.

## Minimal class shape

Prefer PHP 7.4-compatible immutable objects unless the plugin has a higher
minimum PHP version. Use PHP 8.1 `readonly` only when the plugin declares PHP
8.1+.

```php
namespace MyPlugin\Dto;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class ProductDto {
    private int $id;
    private string $title;

    public function __construct( int $id = 0, string $title = '' ) {
        $this->id    = $id;
        $this->title = $title;
    }

    /** @param array<string,mixed> $data @return self|WP_Error */
    public static function from_array( array $data ) {
        $errors = new WP_Error();
        $id     = self::to_int( $data['id'] ?? 0, 'id', $errors );
        $title  = self::to_string( $data['title'] ?? '', 'title', $errors );

        if ( '' === $title ) {
            $errors->add( 'missing_title', 'Product title is required.' );
        }
        if ( $errors->has_errors() ) {
            return $errors;
        }

        return new self( $id, $title );
    }

    /** @return array<string,mixed> */
    public function to_array(): array {
        return array(
            'id'    => $this->id,
            'title' => $this->title,
        );
    }

    public function id(): int { return $this->id; }
    public function title(): string { return $this->title; }

    private static function to_int( $value, string $field, WP_Error $errors ): int {
        if ( is_int( $value ) ) {
            return $value;
        }
        if ( is_string( $value ) && preg_match( '/^-?\d+$/', $value ) ) {
            return (int) $value;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be an integer.', $field ) );
        return 0;
    }

    private static function to_string( $value, string $field, WP_Error $errors ): string {
        if ( is_string( $value ) ) {
            return $value;
        }
        if ( is_scalar( $value ) ) {
            return (string) $value;
        }
        $errors->add( 'invalid_' . $field, sprintf( '%s must be a string.', $field ) );
        return '';
    }
}
```

Use [references/native-dto-patterns.md](references/native-dto-patterns.md) for
the full pattern: floats, booleans, DateTime, nested DTO collections, secrets,
`with()`, and PHP 8.1 variants.

## Hydration rules

- **One entry point.** Use `from_array()` or named factories like `from_post( WP_Post $post )`, `from_option( array $option )`, `from_request( WP_REST_Request $request )`.
- **Sanitize at the input boundary, validate in/near the DTO.** For `$_POST`, use `wp_unslash()` first, then a field-specific sanitizer.
- **Use allowlists.** Read only known keys. Do not keep unknown keys unless the DTO has a deliberate `extra` property.
- **Use `array_key_exists()` when `null` is meaningful.** `isset( $data['expires_at'] )` treats explicit `null` as absent.
- **Avoid `empty()` for typed fields.** `empty( '0' )` and `empty( 0 )` are true.
- **Coerce deliberately.** `(int) 'abc'` becomes `0`; `(bool) 'false'` becomes `true`. Reject surprising input with `WP_Error`.
- **Nested arrays become nested DTOs.** Do not leave `items` as random arrays when the plugin expects item shape.
- **No dynamic properties.** PHP 8.2 deprecates them. Declare every property.
- **Defaults are explicit.** Every constructor argument has a sensible default or is nullable.

## Sensitive fields

DTOs often carry API keys, tokens, customer emails, or internal notes.

- Keep secrets nullable: absence is `null`, not an empty secret string.
- Do not include secrets in `to_array()` unless the method name says so, e.g. `to_private_array()`.
- Prefer a tiny value object for credentials; see [references/native-dto-patterns.md](references/native-dto-patterns.md#secret-value-object).
- Let the presenter decide whether a field is redacted for REST/admin/export.

## Critical rules

- **DTO is immutable.** No setters. Use `with()` to produce a changed copy.
- **DTO is not a repository.** No `get_post_meta()`, no `update_option()`, no `$wpdb`, no HTTP calls.
- **DTO is not a presenter.** No HTML, no escaping, no `wp_send_json()`, no `rest_ensure_response()`.
- **Hydration is explicit and allowlisted.** Never `foreach ( $data as $key => $value ) { $dto->$key = $value; }`.
- **Validation returns `WP_Error` or throws only for programmer errors.** User input failures are normal and reportable.
- **Use field-specific coercion.** Do not use unchecked `(int)`, `(bool)`, `intval`, `settype`, or `empty()`-driven normalization.
- **Keep parameter/property names stable.** Renaming `created_at` to `createdAt` is a breaking change unless every caller and presenter is updated.
- **For PHP 8.1 enums, use `tryFrom()` and handle null.** For PHP 7.4-compatible plugins, use constants plus explicit `in_array( ..., true )`.

## Common mistakes

```php
// WRONG - unchecked casts hide bad input.
$dto = new ProductDto( (int) $_POST['id'], (float) $_POST['price'] );

// WRONG - dynamic property hydration.
foreach ( $row as $key => $value ) {
    $dto->{$key} = $value;
}

// WRONG - empty() rejects valid values.
if ( empty( $data['quantity'] ) ) {
    return new WP_Error( 'missing_quantity', 'Quantity is required.' );
}

// WRONG - leaking secrets by dumping all object properties.
return get_object_vars( $dto );
```

## Cross-references

- Run **`wp-plugin-presenter`** when converting this DTO into REST/admin/JS/email output.
- Run **`wp-plugin-architecture`** when deciding folder placement, namespaces, or by-feature vs by-type organization.
- Run **`wp-plugin-options-storage`** when the DTO represents an option payload.
- Run **`bd-data-object`** only if the project intentionally uses the better-data library. better-data automates many of these rules; this skill is the native no-library version.

## What this skill does NOT cover

- HTML templates and escaping strategy after presentation.
- Database schema migrations or custom table repositories.
- better-data attributes, sources, sinks, or presenter builder APIs.
- REST route registration; use the REST-specific plugin skill if present.

## References

- [references/native-dto-patterns.md](references/native-dto-patterns.md) - complete DTO implementation patterns.
- [references/before-after-raw-array.md](references/before-after-raw-array.md) - refactoring raw arrays into DTOs.
- WordPress input security: `wp_unslash()`, sanitization, validation, and escaping.
- `WP_Error` for user-input validation failures.
