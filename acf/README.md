# Advanced Custom Fields

Developer and integration skills for [Advanced Custom Fields](https://www.advancedcustomfields.com/)
Free (`advanced-custom-fields`) and ACF PRO (`advanced-custom-fields-pro`). Use
these when a plugin or theme defines ACF field groups, reads or writes ACF data,
renders values on the frontend, queries relational data, or adds a custom field
type.

Grounded against ACF Free 6.8.10 and ACF PRO 6.8.10 on WordPress 7.1.2. The
storage contracts were exercised with the bundled WP-CLI smoke plugin on PHP
8.3.30. Source references are relative to the root of the installed ACF plugin;
no test environment or machine paths belong in these skills.

## Free and PRO boundary

| Surface | Availability in 6.8.10 |
|---|---|
| `get_field()`, `update_field()`, local PHP/JSON field groups, field hooks, custom `acf_field` types | Free and PRO |
| Text, content, choice, relational, jQuery, layout fields, including Group | Free and PRO |
| Repeater, Flexible Content, Gallery, Clone | **ACF PRO** |
| Options Pages UI/API and ACF Blocks | **ACF PRO** |

ACF PRO contains the base plugin; do not require or activate Free and PRO at the
same time. A companion extension should feature-detect the exact function, class,
or field type it uses and report a clear dependency failure.

## Skills

| Skill | Purpose |
|---|---|
| `acf-field-group-development` | Define stable field groups in PHP or Local JSON, choose field names and keys, attach location rules, expose fields to REST deliberately, and keep Free/PRO field choices explicit. |
| `acf-value-storage-frontend` | Understand ACF's value row plus hidden field-key reference, target posts/users/terms/comments/options correctly, choose raw versus formatted reads, write safely, escape frontend output, and query only the raw shape actually stored. Includes the disposable smoke plugin. |
| `acf-relational-fields` | Implement Relationship, Post Object, User, and Taxonomy fields with correct ID/object return formats, bidirectional behavior, taxonomy side effects, reverse queries, and bounded frontend rendering. |
| `acf-pro-complex-fields` | Work with PRO-only Repeater, Flexible Content, Gallery, and Clone fields, including their flattened meta shapes, safe update arrays, frontend loops, escaping, cleanup, and performance limits. |
| `acf-pro-options-pages` | Register and consume PRO options pages without field-name collisions, capability mistakes, accidental autoload bloat, or confusion about `wp_options` prefixes and custom storage. |
| `acf-custom-field-type` | Build a custom field type on the Free `acf_field` API: registration, settings and input rendering, validation, storage transforms, formatted values, HTML escaping support, assets, and repeatable-input compatibility. |

## Recommended combinations

- New metadata model and frontend template: `acf-field-group-development` +
  `acf-value-storage-frontend`.
- Connected posts/users/terms: `acf-relational-fields` +
  `acf-value-storage-frontend`.
- Page-builder-like structured content: `acf-pro-complex-fields` +
  `acf-value-storage-frontend`.
- New editor control and value format: `acf-custom-field-type` +
  `acf-field-group-development`.
