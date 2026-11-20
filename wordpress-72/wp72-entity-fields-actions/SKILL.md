---
name: wp72-entity-fields-actions
description: >-
  Registers and audits WordPress 7.2 Entity Fields and Entity Actions for DataViews/DataForm integrations. Use for wp_register_entity_fields, wp_update_entity_fields, wp_register_entity_actions, their initialization hooks, script-module augmentation or the entity-fields/entity-actions REST discovery endpoints.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "https://github.com/Lonsdale201"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "7.2-RC2-65695"
  wp-skills-wp-version-tested: "7.2-RC2-65695"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-11-20"
---

# WordPress 7.2 Entity Fields and Actions

Use the server registries for serializable entity UI definitions. They complement
client DataViews/DataForm behavior; registration does not create storage, grant
permissions or implement a mutation endpoint.

## Register at the required lifecycle point

Register/update/unregister fields only on wp_entity_fields_api_init. Register or
unregister actions only on wp_entity_actions_api_init. Reads are available after
init has completed; an early read is refused rather than returning a ready list.
Feature-detect these new functions when supporting earlier cores.

```php
add_action( 'wp_entity_fields_api_init', static function () {
    wp_register_entity_fields(
        'my-plugin', 'postType', 'post',
        array( array(
            'id' => 'my-plugin-rating',
            'type' => 'text',
            'label' => __( 'Rating', 'my-plugin' ),
        ) )
    );
} );
```

The registration arguments are origin, entity kind, entity name, definitions and
an optional script-module ID. Use a stable plugin/theme origin and unique IDs.
Field registration/update returns the IDs accepted. Unregistration can remove all
definitions when its ID list is null: pass specific IDs for a scoped removal.

## Separate data from executable behavior

- PHP fields contain the serializable DataViews field subset: IDs, types,
  labels, elements and validation/filter metadata. React render/Edit components,
  getters/setters, sorting functions and eligibility functions belong in JS.
- A script module's default export maps field IDs to JS-only properties. Register
  the module with the same entity/definitions, then inspect
  wp_get_registered_entity_field_modules() for its scoped associations.
- Actions follow the same pattern: PHP describes IDs, labels, context and bulk
  presentation; callback, RenderModal, dynamic labels/icons and eligibility belong
  in the associated module.
- Use wp_get_registered_entity_fields()/wp_get_registered_entity_actions() for
  data inspection. Do not mutate registry internals or replay the init hook.
- Field collections are entity-scoped file declarations. Validate collection
  metadata/file boundaries against the exact candidate before adopting them;
  the basic registration smoke does not exercise collection loading.

## REST and authorization

The GET discovery routes /wp/v2/entity-fields and /wp/v2/entity-actions require
kind and name. Core checks entity-level capabilities: REST-exposed post types
use their edit_posts capability, taxonomies use manage_terms and root entities
use manage_options. Unknown/non-REST post types or taxonomies are not equivalent
to a public collection. Inspect the controller for custom-kind fallback rules.

Discovery does not authorize an action's eventual write. Validate selected
objects and capabilities again on the server when executing that action. Client
isEligible, hidden controls and supportsBulk do not enforce permissions.

## Verify

Check accepted IDs and entity/module associations, valid versus invalid entities,
admin/guest discovery and the actual consumer's rendered field/action. Test edit,
save/reload, bulk selection, denied objects and module loading in the intended
document. Keep a registry-only pass distinct from a working DataForm integration.

## References

- [Official core source](https://github.com/WordPress/wordpress-develop)
- Verified source: wp-includes/entity-fields.php, wp-includes/entity-actions.php,
  wp-includes/class-wp-entity-fields-registry.php,
  wp-includes/class-wp-entity-actions-registry.php,
  wp-includes/rest-api/endpoints/class-wp-rest-entity-fields-controller.php,
  wp-includes/rest-api/endpoints/class-wp-rest-entity-actions-controller.php.
- Related stable skill: wp-dataviews-dataform.
