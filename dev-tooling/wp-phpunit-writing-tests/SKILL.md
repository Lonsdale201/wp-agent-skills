---
name: wp-phpunit-writing-tests
description: >
  Write PHPUnit tests for a WordPress plugin or theme. Covers the integration
  base class `WP_UnitTestCase` and its snake_case `set_up()` / `tear_down()`
  fixtures (and why WordPress uses them via phpunit-polyfills), the per-test DB
  transaction rollback, the factory system (`self::factory()->post->create()`,
  `create_many()`, `create_and_get()`, `wpSetUpBeforeClass()`), WP assertions
  (`assertWPError`, `assertEqualSets`), HTTP mocking with the `pre_http_request`
  filter, data providers and `@group`, and the crucial distinction that
  `WP_UnitTestCase` is an INTEGRATION test (real WP + DB) while true unit tests
  need Brain Monkey or WP_Mock to mock WP functions. Use when authoring or
  reviewing tests, choosing unit vs integration, mocking HTTP/WP functions, or
  fixing fixture/factory mistakes. For scaffolding and CI see wp-phpunit-test-setup.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "PHPUnit 9.x; phpunit-polyfills 1.1; Brain Monkey 2.7; WP_Mock 1.1; WP 7.0"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-06-17"
---

# Writing WordPress PHPUnit tests

Once the harness is in place (`wp-phpunit-test-setup`), this skill is about the tests themselves: which base class, how to build fixtures, how to mock, and the integration-vs-unit decision that trips most people up.

## When to use this skill

- Writing the first real tests for a plugin/theme.
- Reviewing tests for correct fixtures, isolation, and mocking.
- Deciding between an integration test and a true unit test.
- Mocking outbound HTTP (`wp_remote_*`) or WP functions.

## Integration vs unit — get this right first

`WP_UnitTestCase` **boots the full WordPress environment and uses a real (test) database**, with each test wrapped in a transaction that is rolled back afterwards. Despite the name, that is an **integration test**, not a pure unit test. Use it when you need real WP behavior: DB writes, `WP_Query`, hooks firing against core, rewrite rules, user capabilities.

For **true unit tests** — fast, isolated, no WP boot, no DB — you mock WordPress functions with one of:

- **Brain Monkey** (`brain/monkey`, 2.7.x) — Mockery + Patchwork based; expressive `when()` / `expect()`.
- **WP_Mock** (`10up/wp_mock`, 1.1.x) — explicit per-function expectations, action/filter helpers.

Rule of thumb: test your **own** logic (a calculator, a formatter, a class method) as a unit test with mocked WP calls; test **interaction with WordPress** (it really saved the post, the hook really ran) as a `WP_UnitTestCase` integration test. Most plugins want both, in separate test suites.

## Integration tests: WP_UnitTestCase

### Fixtures are snake_case — and that matters

```php
class Test_My_Plugin extends WP_UnitTestCase {

    public function set_up(): void {
        parent::set_up();          // MUST be the first line
        // per-test arrange
    }

    public function tear_down(): void {
        // per-test cleanup
        parent::tear_down();       // MUST be the last line
    }

    public function test_it_does_a_thing(): void {
        $this->assertTrue( my_plugin_does_a_thing() );
    }
}
```

Use `set_up()` / `tear_down()` (snake_case), **not** PHPUnit's `setUp()` / `tearDown()`. Reason: PHPUnit 8 added a `void` return type to the camelCase fixtures, which breaks signature compatibility across PHP/PHPUnit versions. `yoast/phpunit-polyfills` (loaded by the WP test suite) exposes the snake_case variants and routes them to the correctly-typed camelCase methods per PHPUnit version. **Never** call `parent::setUp()` from a snake_case method — call `parent::set_up()`. Class-level fixtures are `set_up_before_class()` / `tear_down_after_class()`.

### The factory system

Build test data with factories instead of hand-inserting:

```php
$post_id  = self::factory()->post->create( [ 'post_title' => 'Hello' ] );
$post      = self::factory()->post->create_and_get();          // returns WP_Post
$user_id   = self::factory()->user->create( [ 'role' => 'editor' ] );
$tag_ids   = self::factory()->term->create_many( 3, [ 'taxonomy' => 'post_tag' ] );
$comment_id = self::factory()->comment->create( [ 'comment_post_ID' => $post_id ] );
```

`create()` returns an ID, `create_and_get()` the object, `create_many( $n, $args )` a batch. Factories exist for post, user, term, comment, attachment, and more. For fixtures shared across all tests in a class, create them once in the static hook and keep them in static properties:

```php
public static function wpSetUpBeforeClass( $factory ) {
    self::$author_id = $factory->user->create( [ 'role' => 'author' ] );
}
```

Use the `$factory` argument passed in (not `self::factory()`) inside `wpSetUpBeforeClass()`.

### WP-specific assertions and helpers

- `assertWPError( $thing )` / `assertNotWPError( $thing )`
- `assertEqualSets( $expected, $actual )` — equal regardless of order; `assertSameSets()` for strict.
- `go_to( $url )` — sets up the main query/environment for a URL, to test template/conditional-tag logic (`is_single()` etc.).

Because each test rolls back its transaction, you don't clean up created posts/users yourself — but you **do** restore global state you changed (options via `update_option` are fine; `$_GET`/`$_POST`/`$GLOBALS` you set should be reset in `tear_down()`).

## Mocking outbound HTTP

Don't hit the network in tests. Short-circuit `wp_remote_*` with the `pre_http_request` filter — returning a non-`false` value skips the real request:

```php
add_filter( 'pre_http_request', static function ( $preempt, $args, $url ) {
    if ( str_contains( $url, 'api.example.com' ) ) {
        return [
            'headers'  => [],
            'body'     => wp_json_encode( [ 'ok' => true ] ),
            'response' => [ 'code' => 200, 'message' => 'OK' ],
            'cookies'  => [],
            'filename' => null,
        ];
    }
    return $preempt;   // let other requests pass (or fail) normally
}, 10, 3 );
```

The returned array mirrors a real WP HTTP response: `headers`, `body`, `response` (`code` + `message`), `cookies`, `filename`. Read it back in code with `wp_remote_retrieve_body()` / `wp_remote_retrieve_response_code()` as usual. Remove the filter in `tear_down()` if you added it in a test.

## True unit tests: Brain Monkey / WP_Mock

When you isolate a class from WordPress, mock the WP functions it calls. Both libraries need their own setUp/tearDown and do **not** extend `WP_UnitTestCase`. See `reference.md` for full runnable examples; the shapes:

Brain Monkey:

```php
use Brain\Monkey;
use Brain\Monkey\Functions;

// ...inside your PHPUnit\Framework\TestCase subclass (NOT WP_UnitTestCase):
protected function setUp(): void {
    parent::setUp();
    Monkey\setUp();
}
protected function tearDown(): void {
    Monkey\tearDown();
    parent::tearDown();
}

public function test_uses_option(): void {
    Functions\when( 'get_option' )->justReturn( 'gold' );
    Functions\expect( 'update_option' )->once()->with( 'my_tier', 'gold' );
    ( new Tier_Sync() )->run();
}
```

WP_Mock:

```php
// ...inside your PHPUnit\Framework\TestCase subclass:
public function setUp(): void {
    parent::setUp();
    \WP_Mock::setUp();
}
public function tearDown(): void {
    \WP_Mock::tearDown();
    parent::tearDown();
}

public function test_reads_meta(): void {
    \WP_Mock::userFunction( 'get_post_meta', [
        'args'   => [ 123, '_my_key', true ],
        'return' => 'value',
    ] );
    $this->assertSame( 'value', ( new Reader() )->read( 123 ) );
}
```

Pure unit tests can run on a newer PHPUnit than the WP suite, but keep them in a **separate test suite** from the `WP_UnitTestCase` integration tests, which are pinned to PHPUnit 9.x.

## Test hygiene

- **AAA — Arrange, Act, Assert.** One behavior per test; a descriptive name (`test_user_can_subscribe_to_newsletter`).
- **Data providers** to avoid duplication: `@dataProvider email_cases` (with the WP suite on PHPUnit 9, use the `@dataProvider` / `@group` *annotations*; PHPUnit 10+ prefers `#[DataProvider]` / `#[Group]` *attributes* — relevant only for unit suites on newer PHPUnit).
- **`@group slow` / `@group integration`** so CI can split fast and slow runs.
- **Test behavior, not implementation** — assert observable outcomes, not private internals.

## Critical rules

- **`WP_UnitTestCase` is integration, not unit.** Reach for Brain Monkey / WP_Mock when you want isolation without a DB.
- **Use snake_case `set_up()` / `tear_down()`**; `parent::set_up()` first, `parent::tear_down()` last; never call the camelCase parent from them.
- **Build data with factories**, not raw `wp_insert_post` loops or `$wpdb`.
- **Never hit the network** — short-circuit with `pre_http_request` and return a full response array.
- **Don't rely on cleanup you didn't do for globals** — the DB rolls back, but `$_POST`/`$GLOBALS`/added filters do not.
- **Keep unit and integration tests in separate suites**; only the WP suite is locked to PHPUnit 9.x.

## Cross-references

- Run **`wp-phpunit-test-setup`** for the harness, `install-wp-tests.sh`, composer, and CI.
- Run **`wp-phpcs-coding-standards`** and **`wp-phpstan-static-analysis`** for the other two QA gates.
- Run **`wp-security-audit`** when writing tests that assert sanitization/escaping/capability behavior.
- See `reference.md` for full runnable integration, Brain Monkey, and WP_Mock examples plus a data-provider example.

## References

- Writing PHPUnit tests (handbook): <https://make.wordpress.org/core/handbook/testing/automated-testing/writing-phpunit-tests/>
- `pre_http_request`: <https://developer.wordpress.org/reference/hooks/pre_http_request/>
- PHPUnit Polyfills (why snake_case): <https://github.com/Yoast/PHPUnit-Polyfills> and <https://core.trac.wordpress.org/ticket/53911>
- Brain Monkey: <https://github.com/Brain-WP/BrainMonkey>
- WP_Mock: <https://github.com/10up/wp_mock>
- PHPUnit attributes vs annotations: <https://docs.phpunit.de/en/10.5/attributes.html>
- Related documentation: <https://github.com/WordPress/wordpress-develop/tree/trunk/tests/phpunit/includes>
