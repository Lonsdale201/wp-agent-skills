# wp-phpunit-writing-tests — reference

Full runnable examples for the `wp-phpunit-writing-tests` skill: a complete integration test, a Brain Monkey unit test, a WP_Mock unit test, and a data-provider example.

## Complete integration test (`WP_UnitTestCase`)

```php
<?php
/**
 * @group integration
 */
class Test_My_Plugin_Subscriptions extends WP_UnitTestCase {

    /** @var int */
    protected static $author_id;

    public static function wpSetUpBeforeClass( $factory ) {
        self::$author_id = $factory->user->create( [ 'role' => 'author' ] );
    }

    public function set_up(): void {
        parent::set_up();
        update_option( 'my_plugin_enabled', '1' );
    }

    public function tear_down(): void {
        delete_option( 'my_plugin_enabled' );
        parent::tear_down();
    }

    public function test_subscriber_meta_is_saved(): void {
        // Arrange
        $post_id = self::factory()->post->create( [
            'post_author' => self::$author_id,
            'post_status' => 'publish',
        ] );

        // Act
        my_plugin_subscribe( $post_id, 'reader@example.com' );

        // Assert
        $subscribers = get_post_meta( $post_id, '_my_plugin_subscribers', true );
        $this->assertEqualSets( [ 'reader@example.com' ], $subscribers );
    }

    public function test_subscribe_rejects_invalid_email(): void {
        $post_id = self::factory()->post->create();
        $result  = my_plugin_subscribe( $post_id, 'not-an-email' );

        $this->assertWPError( $result );
        $this->assertSame( 'invalid_email', $result->get_error_code() );
    }

    public function test_archive_query_lists_only_published(): void {
        self::factory()->post->create_many( 3, [ 'post_status' => 'publish' ] );
        self::factory()->post->create_many( 2, [ 'post_status' => 'draft' ] );

        $this->go_to( home_url( '/' ) );

        $this->assertTrue( is_home() );
        $this->assertCount( 3, get_posts( [ 'numberposts' => -1 ] ) );
    }
}
```

Note: the created posts/users and the `update_option` change are all undone by the per-test transaction rollback and `tear_down()`; only state outside the DB needs manual restoration.

## HTTP mock inside an integration test

```php
public function test_remote_sync_handles_200(): void {
    $filter = static function ( $preempt, $args, $url ) {
        return [
            'headers'  => [],
            'body'     => wp_json_encode( [ 'status' => 'ok', 'id' => 42 ] ),
            'response' => [ 'code' => 200, 'message' => 'OK' ],
            'cookies'  => [],
            'filename' => null,
        ];
    };
    add_filter( 'pre_http_request', $filter, 10, 3 );

    $result = my_plugin_remote_sync();

    remove_filter( 'pre_http_request', $filter, 10 );
    $this->assertSame( 42, $result['id'] );
}
```

## Brain Monkey unit test (no WP, no DB)

`composer require --dev brain/monkey`

```php
<?php
use PHPUnit\Framework\TestCase;
use Brain\Monkey;
use Brain\Monkey\Functions;

final class Tier_Calculator_Test extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_gold_tier_from_option(): void {
        // Stub a WP function's return value.
        Functions\when( 'get_option' )->justReturn( 1500 );

        // Assert a WP function is called once with given args.
        Functions\expect( 'update_user_meta' )
            ->once()
            ->with( 7, 'tier', 'gold' );

        ( new Tier_Calculator() )->assign_tier( 7 );
    }

    public function test_filter_is_applied(): void {
        Functions\expect( 'apply_filters' )
            ->once()
            ->with( 'my_plugin_tier', 'gold', 7 )
            ->andReturn( 'platinum' );

        $this->assertSame( 'platinum', ( new Tier_Calculator() )->filtered_tier( 7 ) );
    }
}
```

`when()` stubs a return value; `expect()` sets a call expectation (count, args, return). Brain Monkey uses Patchwork to redefine already-defined functions, so it works even if WordPress is partly loaded.

## WP_Mock unit test

`composer require --dev 10up/wp_mock`

Bootstrap (in `tests/bootstrap-unit.php`): `require_once 'vendor/autoload.php'; WP_Mock::bootstrap();`

```php
<?php
use PHPUnit\Framework\TestCase;

final class Meta_Reader_Test extends TestCase {

    public function setUp(): void {
        parent::setUp();
        \WP_Mock::setUp();
    }

    public function tearDown(): void {
        \WP_Mock::tearDown();
        parent::tearDown();
    }

    public function test_reads_post_meta(): void {
        \WP_Mock::userFunction( 'get_post_meta', [
            'times'  => 1,
            'args'   => [ 123, '_my_key', true ],
            'return' => 'stored-value',
        ] );

        $this->assertSame( 'stored-value', ( new Meta_Reader() )->read( 123 ) );
    }

    public function test_registers_hook(): void {
        \WP_Mock::expectActionAdded( 'init', [ \WP_Mock\Functions::type( Plugin::class ), 'boot' ] );

        ( new Plugin() )->register();

        $this->assertConditionsMet();
    }
}
```

`WP_Mock::userFunction()` mocks a WP function with optional `times`/`args`/`return`; the action/filter helpers (`expectActionAdded`, `expectFilterAdded`, `onFilter`, `expectAction`) assert hook wiring. End hook-expectation tests with `$this->assertConditionsMet();`.

## Data provider example

With the WP integration suite (PHPUnit 9.x) use the annotation form:

```php
/**
 * @dataProvider email_cases
 */
public function test_email_validation( string $input, bool $expected ): void {
    $this->assertSame( $expected, my_plugin_is_valid_email( $input ) );
}

public function email_cases(): array {
    return [
        'plain valid'   => [ 'a@b.com', true ],
        'missing tld'   => [ 'a@b', false ],
        'empty'         => [ '', false ],
        'spaces'        => [ ' a@b.com ', false ],
    ];
}
```

On a pure-unit suite running PHPUnit 10+, the same provider is wired with an attribute instead:

```php
#[\PHPUnit\Framework\Attributes\DataProvider('email_cases')]
public function test_email_validation( string $input, bool $expected ): void { /* ... */ }
```
