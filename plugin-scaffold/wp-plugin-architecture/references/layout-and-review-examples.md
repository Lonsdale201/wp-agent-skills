# Plugin architecture layouts and review examples

## Choose one folder scheme

Use a by-type layout for a small-to-medium plugin with a few cohesive features:

```text
src/
├── Plugin.php
├── Schema.php
├── Admin/
├── Content/
├── Frontend/
├── Rest/
├── Setup/
└── Api/
```

Use a by-feature layout once several domains evolve independently:

```text
src/
├── Plugin.php
├── Schema.php
├── Documents/
│   ├── DocumentPresenter.php
│   ├── DocumentRepository.php
│   └── DocumentService.php
├── Folders/
│   └── FolderService.php
├── Rest/
│   ├── DocumentsController.php
│   └── FoldersController.php
└── Frontend/
    ├── Assets.php
    └── ListShortcode.php
```

Do not place some domains under generic `Actions/` and others under feature
folders. When a by-type directory accumulates unrelated feature classes,
refactor the complete `src/` convention instead of introducing a second scheme.

Keep one class per file. `MyPlugin\Folders\FolderService` maps to
`src/Folders/FolderService.php`. `includes/class-folder-service.php` is a
legacy convention to preserve only when migration cost outweighs its benefit.

## Review examples

Centralize repeated storage keys:

```php
// Wrong: one typo silently reads a different key.
update_post_meta( $post_id, '_myplugin_settings', $value );
get_post_meta( $post_id, '_myplugin_setings', true );

// Right: one source of truth.
update_post_meta( $post_id, Schema::META_SETTINGS, $value );
```

Use the correct enqueue hook and gate the page:

```php
// Wrong: asset registration/mutation from an unrelated lifecycle hook.
add_action( 'init', static function (): void {
    wp_enqueue_script( 'myplugin-frontend' );
} );

// Right: frontend hook plus content gate.
add_action( 'wp_enqueue_scripts', static function (): void {
    if ( ! has_block( 'myplugin/contact' ) ) {
        return;
    }
    wp_enqueue_script( 'myplugin-frontend' );
} );
```

Prefer explicit dependencies over a reflexive singleton:

```php
$client = new HttpClient( $api_key, $base_url );
$client->post( '/things', $payload );
```

Prefix every public extension hook:

```php
do_action( 'myplugin/before_save', $data );
```

Do not emit a generic `before_save` hook whose ownership cannot be identified.
