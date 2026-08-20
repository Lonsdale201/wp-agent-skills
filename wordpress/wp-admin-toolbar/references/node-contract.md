# WP_Admin_Bar node contract

## Public workflow

Use `admin_bar_menu` and its `WP_Admin_Bar` argument. Public operations are:

- `add_node( $args )` / legacy alias `add_menu()`;
- `get_node( $id )`;
- `get_nodes()`;
- `remove_node( $id )` / legacy alias `remove_menu()`;
- `add_group( $args )` for grouped children.

Prefer the node methods over legacy aliases. Do not call internal underscored
methods or mutate the private node store.

## Node arguments

- `id`: required stable identifier; prefix plugin-owned IDs.
- `title`: rendered label/markup; keep it minimal and safe.
- `parent`: parent node ID or false for a root node.
- `href`: optional destination.
- `group`: whether the node is a group container.
- `meta`: supported presentation data including `html`, `class`, `rel`,
  `lang`, `dir`, `onclick`, `target`, `title`, `tabindex`, and `menu_title`.

Avoid `meta.html`, `onclick`, and rich `title` markup unless a reviewed public
contract truly requires them. Normal links are more robust across contexts.

## Lifecycle

Core creates the bar, registers default menus, fires `admin_bar_menu`, then
renders it. Choose a priority according to the parent/remove target. Use
`wp_before_admin_bar_render` only when code cannot express its ordering through
`admin_bar_menu`; it relies on the global bar and is harder to test.

The `show_admin_bar` filter controls visibility, but plugins should rarely hide
the whole toolbar. A user preference and editor modes can also affect presence.
