---
name: jsf-custom-provider-query
description: >-
  Extend JetSmartFilters with a custom provider for an unsupported renderer or
  a custom native JSF Listing query type for a non-post data source. Use when
  code must register on jet-smart-filters/providers/register or
  jet-smart-filters/listing/render/query-types/register, extend
  Jet_Smart_Filters_Provider_Base or the Listing Query_Types Base class, expose
  custom DOM selectors, merge filter args, or return pagination statistics.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "jet-smart-filters"
  wp-skills-plugin-version-tested: "3.8.3.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-21"
---

# Custom providers and listing query types

These are different extension axes:

- A **provider** teaches JSF where a renderer lives and how to produce its AJAX
  replacement.
- A **query type** teaches the native JSF Listing how to fetch and identify
  items from another data source.

Prefer a query type when the native JSF Listing/card renderer is suitable.
Create a provider only when the target renderer itself is unsupported.

## Register a provider

The provider base class is loaded immediately before the registration action,
so require the subclass inside that action:

```php
add_action(
    'jet-smart-filters/providers/register',
    static function ( $manager ): void {
        require_once __DIR__ . '/class-acme-provider.php';
        $manager->register_provider(
            Acme_JSF_Provider::class,
            __DIR__ . '/class-acme-provider.php'
        );
    }
);
```

The subclass must implement `get_name()`, `get_id()`,
`ajax_get_content()`, and `get_wrapper_selector()`. Override
`get_list_selector()`, `get_item_selector()`,
`get_wrapper_action()`, `in_depth()`, `id_prefix()`, or `is_data()`
only when the renderer needs different behavior.

```php
final class Acme_JSF_Provider extends Jet_Smart_Filters_Provider_Base {
    public function get_name() {
        return __( 'Acme Catalog', 'acme' );
    }

    public function get_id() {
        return 'acme-catalog';
    }

    public function get_wrapper_selector() {
        return '.acme-catalog';
    }

    public function get_item_selector() {
        return '.acme-catalog__item';
    }

    public function get_wrapper_action() {
        return 'replace';
    }

    public function in_depth() {
        return true;
    }

    public function ajax_get_content() {
        $settings = jet_smart_filters()->data->get_request_var( 'settings' );
        $query    = jet_smart_filters()->query->get_query_args();

        acme_render_catalog(
            is_array( $settings ) ? $settings : array(),
            is_array( $query ) ? $query : array()
        );
    }
}
```

During initial rendering, before JSF localizes frontend settings:

1. render a stable wrapper for the query ID;
2. store provider settings with
   `providers->store_provider_settings( $provider, $settings, $query_id )`;
3. store the unfiltered base query with
   `query->store_provider_default_query( $provider, $args, $query_id )`;
4. publish correct pagination props with
   `query->set_props( $provider, $props, $query_id )`.

Treat request settings and query values as untrusted. Allowlist settings used
to select templates or callbacks; never accept an arbitrary PHP callable or
file path.

## Register a native JSF Listing query type

The query base class is also loaded at its registration action:

```php
add_action(
    'jet-smart-filters/listing/render/query-types/register',
    static function (): void {
        require_once __DIR__ . '/class-inventory-query.php';

        \Jet_Smart_Filters\Listing\Render\Query_Factory::register_query_type(
            Acme\JSF\Inventory_Query::get_type(),
            Acme\JSF\Inventory_Query::class
        );
    }
);
```

The class extends
`Jet_Smart_Filters\Listing\Render\Query_Types\Base` and implements:

- static `get_type()` with a stable unique slug;
- protected `_get_items()` returning an array;
- `get_item_id( $item )` returning a stable ID.

Override `add_query_args()` when recursive array merging is wrong or when a
cached result must be invalidated. Override `get_stats()` to return accurate
`found_posts`, `max_num_pages`, and `page`; pagination cannot work
correctly with the base class's zero values.

Runtime registration does not add editor controls. A producer must save
`type => acme-inventory` in the listing query, or a tightly scoped
`listing/render/raw-query-args` filter must set it for the intended listing.

## Acceptance checks

- Provider and query-type IDs do not collide with built-ins.
- Two query IDs on one page remain independent.
- Initial and AJAX markup have the same wrapper contract.
- Empty results return valid markup/data and zeroed props.
- Filter values are normalized and bounded.
- Pagination totals match returned items.
- Rapid requests do not reuse stale cached query results.
- JSF deactivation does not fatal the companion plugin.

## References

Verified against JetSmartFilters 3.8.3.1 source:

- `includes/providers/base.php:15-160`
- `includes/providers/manager.php:78-146`
- `includes/data.php:198-228`
- `includes/filters/manager.php:64-111`
- `includes/listing/render/query-factory.php:12-90`
- `includes/listing/render/query-types/base.php:12-142`
- `includes/listing/render/query-types/posts.php:12-383`
- `includes/listing/render/listing-base.php:31-183,335-366`
