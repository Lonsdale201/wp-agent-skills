---
name: wp-admin-list-table
description: Build WordPress admin tables by extending `WP_List_Table`.
  Covers the required `require_once`, constructor `singular` / `plural` /
  `ajax` args, `prepare_items()`, `get_columns()`, `column_cb()`,
  `column_default()`, `get_sortable_columns()`, `get_bulk_actions()`,
  `process_bulk_action()`, `extra_tablenav()`, pagination with
  `set_pagination_args()`, row actions, search, views, Screen Options
  per-page settings, sortable `orderby` / `order`, and the plugin CSRF gap,
  calling `check_admin_referer( 'bulk-' . $this->_args['plural'] )` before
  acting on `current_action()`. Use for license keys, jobs, logs, audit
  records, subscriptions, or any plugin record list needing WP-native UI.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "6.0 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress Admin List Table (`WP_List_Table`)

`WP_List_Table` is the base class behind every WP admin list — Posts, Pages, Users, Comments, Plugins. It is not declared `abstract`, but it is designed to be subclassed. Extending it gets you sortable columns, bulk actions, search, pagination, view filters, row actions, screen options, and the WP-native look — for free, with a few required overrides.

Two things make this hard for plugins. First, the class is in `wp-admin/includes/` and is NOT autoloaded — you must `require_once` it. Second, the bulk-action flow has a security gap that most plugins miss, producing the canonical "delete any record by visiting a crafted URL" CSRF.

## When to use this skill

Trigger when ANY of the following is true:

- The user is building an admin screen that lists plugin records (license keys, queued jobs, log entries, custom CPT meta dashboards, audit trails, sync history) and wants the WP-native table look.
- Code references `WP_List_Table`, `prepare_items`, `get_columns`, `column_default`, `column_cb`, `get_sortable_columns`, `get_bulk_actions`, `process_bulk_action`, `set_pagination_args`, `row_actions`, `extra_tablenav`, `search_box`, `screen_option`, `manage_$screen_columns_hidden`.
- The user says "I want a table like the Posts screen" / "with bulk delete" / "sortable by date" / "per-page in Screen Options".
- A code review surfaces a bulk-delete or bulk-anything path that doesn't `check_admin_referer( 'bulk-…' )`.

## The contract — what you MUST override, what you CAN override

| Method | Required? | Purpose |
|---|---|---|
| `prepare_items()` | YES | Query your data, set `$this->items`, call `set_pagination_args()`, set `$this->_column_headers` |
| `get_columns()` | YES | Return `[ slug => label ]` map of columns to render |
| `column_default( $item, $col )` | Recommended | Fallback renderer for any column without its own method |
| `column_<slug>( $item )` | Optional | Per-column renderer for the column named `<slug>` |
| `column_cb( $item )` | Required IF you have bulk actions | Renders the row checkbox |
| `get_sortable_columns()` | Optional | Return `[ col => [ orderby_slug, default_desc ] ]` |
| `get_bulk_actions()` | Optional | Return `[ action_slug => label ]` to show the bulk dropdown |
| `process_bulk_action()` | Optional — but you write it if you have bulk actions | Read `current_action()` and act; this is where the CSRF lives |
| `extra_tablenav( $which )` | Optional | Adds filters above the table (status dropdown, date filter) |
| `no_items()` | Optional | Custom "no records" text |
| `get_views()` | Optional | The `All | Active | Archived` filter links above the table |

## The full bootstrap

### 1. Require the class

This class is in `wp-admin/includes/` and is NOT autoloaded outside of admin screens that already include it. ALWAYS:

```php
if ( ! class_exists( 'WP_List_Table' ) ) {
    require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
}
```

The cleanest place: at the top of the file that defines your subclass, OR inside the page-render callback if you only render the table conditionally.

### 2. The subclass

Implement a subclass that sets `singular` / `plural`, fills `$this->items` in `prepare_items()`, sets `_column_headers`, renders a checkbox column when bulk actions exist, and verifies the bulk nonce inside `process_bulk_action()`.

The full production-style subclass example lives in `reference.md`. Keep this security shape in the main skill:

```php
protected function process_bulk_action(): void {
    $action = $this->current_action();
    if ( ! $action ) {
        return;
    }

    check_admin_referer( 'bulk-' . $this->_args['plural'] );

    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'You are not allowed to do that.', 'myplugin' ), 403 );
    }

    $ids = array_filter( array_map( 'absint', (array) ( $_REQUEST['license'] ?? array() ) ) );
    // Act on $ids here.
}
```

### 3. The page render

Wrap a table with state-changing bulk actions in a `<form method="post">` so
the generated `_wpnonce`, selected IDs, and action post back to the same page.
Keep the `page` field so admin routing reaches the right callback. A separate
GET search/filter form is also valid when bookmarkable filter URLs matter.

```php
function myplugin_render_licenses_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'You are not allowed to access this page.', 'myplugin' ), 403 );
    }

    $table = new MyPlugin_License_Table();
    $table->prepare_items();
    ?>
    <div class="wrap">
        <h1 class="wp-heading-inline"><?php esc_html_e( 'Licenses', 'myplugin' ); ?></h1>
        <a href="<?php echo esc_url( admin_url( 'admin.php?page=myplugin-licenses&action=add' ) ); ?>" class="page-title-action">
            <?php esc_html_e( 'Add new', 'myplugin' ); ?>
        </a>

        <form method="post">
            <?php
            // Keep the page query var so the form action stays on this screen.
            // The bulk-action nonce field is emitted automatically inside ->display().
            ?>
            <input type="hidden" name="page" value="myplugin-licenses" />
            <?php
            $table->search_box( __( 'Search licenses', 'myplugin' ), 'license' );
            $table->display();
            ?>
        </form>
    </div>
    <?php
}
```

### 4. Screen Options — per-page count

The "Screen Options" tab at the top of admin pages can let users pick how many rows per page. WP persists this to user meta automatically. Register on the screen load hook.

```php
add_action( 'load-toplevel_page_myplugin-licenses', static function (): void {
    add_screen_option( 'per_page', array(
        'label'   => __( 'Licenses per page', 'myplugin' ),
        'default' => 20,
        'option'  => 'myplugin_licenses_per_page',
    ) );
} );

// Persist only this option through its scoped dynamic filter.
add_filter(
    'set_screen_option_myplugin_licenses_per_page',
    static function ( $status, string $option, $value ): int {
        return max( 1, min( 200, (int) $value ) );
    },
    10,
    3
);
```

`get_items_per_page( $option, $default )` (inherited from `WP_List_Table`) reads the per-user value back. Match the slug exactly.

## The bulk-action security gap — the #1 plugin CSRF

When `WP_List_Table::display()` renders the form, it emits a hidden `_wpnonce` field with action `'bulk-' . $this->_args['plural']`. The class itself does NOT verify this nonce — your subclass's `process_bulk_action()` must.

```php
// WRONG — accepts any GET request and deletes records
protected function process_bulk_action(): void {
    if ( 'delete' === $this->current_action() ) {
        MyPlugin_Repo::bulk_delete( $_POST['ids'] ?? array() );
    }
}

// RIGHT — verify nonce, then capability, then sanitize
protected function process_bulk_action(): void {
    $action = $this->current_action();
    if ( ! $action ) {
        return;
    }
    check_admin_referer( 'bulk-' . $this->_args['plural'] );
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'You are not allowed to do that.', 'myplugin' ), 403 );
    }
    $ids = array_map( 'absint', (array) ( $_REQUEST['license'] ?? array() ) );
    // ...
}
```

The nonce action string is constructed from your `plural` constructor arg. If you set `'plural' => 'licenses'`, the nonce action is `'bulk-licenses'`. If you set it inconsistently (one place `licenses`, another `license`), nonce verification silently fails. Pick one and use it.

**Row actions are the same vulnerability surface**. Core has legacy nonced
GET action links; if you use that pattern, `wp_nonce_url()` each record and
verify it before acting. For new destructive UI, prefer a small POST form or
an authenticated REST request so GET remains safe/idempotent:

```php
$revoke_url = wp_nonce_url(
    add_query_arg( array( 'action' => 'revoke', 'id' => $item['id'] ), admin_url( 'admin.php?page=myplugin-licenses' ) ),
    'revoke-license-' . $item['id']
);

// On the receiving side:
if ( isset( $_GET['action'] ) && 'revoke' === $_GET['action'] ) {
    $id = absint( $_GET['id'] ?? 0 );
    check_admin_referer( 'revoke-license-' . $id );
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( __( 'Not allowed.', 'myplugin' ), 403 );
    }
    MyPlugin_License_Repo::revoke( $id );
    wp_safe_redirect( admin_url( 'admin.php?page=myplugin-licenses' ) );
    exit;
}
```

## Views and filters

Use `get_views()` for `All | Active | Archived` links above the table and `extra_tablenav( 'top' )` for dropdown filters between bulk actions and the table header. See `reference.md` for complete examples. `prepare_items()` then reads the selected `$_GET` vars and applies them to the query.

## AJAX list tables

`WP_List_Table` supports AJAX (`ajax => true` in the constructor) but the docs are thin and you have to wire it manually — handle the `wp_ajax_*` callback, return the rendered table HTML, swap on the client. For 95% of plugin use cases, **don't bother with AJAX** — a regular form post is faster to ship and faster for users (one round-trip vs JS scaffolding). Add AJAX later if you genuinely need inline updates.

## Critical rules

- **`require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php'`** before extending. The class is NOT autoloaded everywhere.
- **`check_admin_referer( 'bulk-' . $this->_args['plural'] )`** before acting on any bulk action. This is the #1 plugin CSRF surface.
- **Every per-row mutation needs request-intent verification**. Prefer POST;
  when maintaining a legacy GET link, nonce it with a per-record action and
  verify the identical action before the mutation.
- **`current_user_can()` is NOT a substitute for a nonce**. The nonce catches CSRF; the cap check catches privilege escalation. You need both.
- **Sanitize `orderby` against a whitelist**, never pass directly to SQL `ORDER BY`. Either compare against `get_sortable_columns()` or use a hardcoded `in_array()`.
- **Set `_column_headers` to a 4-element array** when you want hidden columns / primary column to work — `[ columns, hidden, sortable, primary ]`. The 3-element shorthand still works but you lose the row-actions hover anchor.
- **Pluralize `plural` consistently**. Core uses it for the table classes and the bulk-action nonce suffix (`bulk-{$plural}`). Row checkbox names are your responsibility in `column_cb()`; the usual convention is `name="{$singular}[]"`.
- **Don't query the DB inside `column_<slug>()`**. Those run per-row; an N+1 query happens silently. Resolve all needed joins in `prepare_items()`.
- **Don't render anything before `display()`**. `prepare_items()` reads `$_GET`/`$_REQUEST`, but the actual `<form>` and `<table>` come from `display()`. If you echo headings in between, fine; just don't dump rows.

## Common AI mistakes

See `reference.md` for before/after examples: missing `require_once`, missing bulk nonce/cap checks, raw `orderby` SQL injection, N+1 column renderers, and calling `set_pagination_args()` before counting items.

## Cross-references

- See **`wp-admin-settings-api`** when a list-table page also has a settings form on the same screen — typical for "Records" + "Settings" tabs.
- See **`wp-plugin-assets-loading`** for the `$hook_suffix` enqueue gate (relevant when adding inline-edit JS or custom column scripts).
- See **`wp-security-audit`** for a broader sweep of admin CSRF / capability check patterns; this skill is the list-table-specific subset.
- See **`wp-admin-postbox-sortable`** when the list-table page lives alongside metaboxes (rare but happens).

## What this skill does NOT cover

- AJAX list tables. Possible (`ajax => true` + a `wp_ajax_*` handler that returns rendered HTML) but rarely worth the complexity over a standard form-post page.
- Inline edit / quick edit. That's a `inline-edit-post.js` topic — distinct API, not a `WP_List_Table` method.
- Replacing the core Posts list table. Filterable but messy; use `manage_{$post_type}_posts_columns` + `manage_{$post_type}_posts_custom_column` for column additions instead.
- React-rendered admin lists. If you've committed to a React island, use `@wordpress/components` `<Table>` or `@tanstack/table` — `WP_List_Table` is server-rendered PHP.

## References

- `wp-admin/includes/class-wp-list-table.php` — the base class. Method registrations start at line 87.
- `wp-admin/includes/class-wp-list-table.php:138` — constructor with `singular` / `plural` / `ajax` / `screen` args.
- `wp-admin/includes/class-wp-list-table.php:300` — `prepare_items()` "must be overridden" error.
- `wp-admin/includes/class-wp-list-table.php:311` — `set_pagination_args()`, the contract for pagination data.
- `wp-admin/includes/class-wp-list-table.php:559` — `get_bulk_actions()`.
- `wp-admin/includes/class-wp-list-table.php:634` — `current_action()` — reads `$_REQUEST['action']`; core admin JS mirrors the bottom bulk-action selector into the top control before submit.
- `wp-admin/includes/class-wp-list-table.php:655` — `row_actions()` for the hover-menu.
- `wp-admin/includes/class-wp-list-table.php:978` — `get_items_per_page()`.
- `reference.md` — complete subclass, view/filter snippets, and common mistakes.
- Official documentation: <https://developer.wordpress.org/reference/classes/wp_list_table/>
- Official documentation: <https://developer.wordpress.org/reference/functions/add_screen_option/>
- Official documentation: <https://developer.wordpress.org/reference/functions/check_admin_referer/>
