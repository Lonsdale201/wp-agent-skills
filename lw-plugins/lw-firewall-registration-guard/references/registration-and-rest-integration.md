# Registration and REST integration contract

This reference is verified against LW Firewall 1.5.4 and WordPress 7.1.

## Transport-independent validator

Keep input extraction outside the validator so form POST, AJAX and REST use the
same checks. Use server-owned field names and the registration replay scope.

```php
use LightweightPlugins\Firewall\Options;
use LightweightPlugins\Firewall\Rules\RegisterToken;
use LightweightPlugins\Firewall\Rules\RegisterTracker;

/**
 * @param array<string, mixed> $input
 */
function myplugin_check_lw_registration(array $input): true|WP_Error
{
    if (!class_exists(RegisterToken::class) || !class_exists(Options::class)) {
        return true; // Replace with fail-closed if LW Firewall is required.
    }

    if (!(bool) Options::get('enabled', true)
        || !(bool) Options::get('register_protect_enabled', true)
    ) {
        return true;
    }

    $honeypot = sanitize_text_field((string) ($input['lw_fw_url'] ?? ''));
    $token = sanitize_text_field((string) ($input['lw_fw_reg_token'] ?? ''));
    $valid = !(bool) Options::get('register_honeypot', true) || $honeypot === '';

    $storage = null;
    if ((bool) Options::get('register_single_use', true)
        && function_exists('lw_firewall_resolve_storage')
    ) {
        $storage = lw_firewall_resolve_storage((string) Options::get('storage', 'auto'));
    }

    $valid = $valid && RegisterToken::verify(
        $token,
        (int) Options::get('register_min_fill_time', 2),
        (int) Options::get('register_token_max_age', 3600),
        $storage,
        'reg'
    );

    if ($valid) {
        return true;
    }

    if (class_exists(RegisterTracker::class)) {
        RegisterTracker::record_reject();
    }

    return new WP_Error(
        'myplugin_registration_failed',
        __('Registration failed, please try again.', 'myplugin'),
        ['status' => 400]
    );
}
```

This mirrors current LW behavior: honeypot omission is accepted as empty. If a
custom protocol wants a stricter present-and-empty honeypot, check
`array_key_exists('lw_fw_url', $input)` as well; document that this is stricter
than the built-in guard.

## REST route shape

Register routes on `rest_api_init`. A public registration route still needs an
explicit permission callback; make the public policy visible rather than using
`__return_true` as an unexplained placeholder.

```php
register_rest_route('myplugin/v1', '/registrations', [
    'methods' => WP_REST_Server::CREATABLE,
    'permission_callback' => [MySignupPolicy::class, 'allows_public_registration'],
    'callback' => static function (WP_REST_Request $request) {
        $guard = myplugin_check_lw_registration([
            'lw_fw_url' => $request->get_param('lw_fw_url'),
            'lw_fw_reg_token' => $request->get_param('lw_fw_reg_token'),
        ]);

        if (is_wp_error($guard)) {
            return $guard;
        }

        // Validate email, password and product-owned enrollment policy here.
        // Create the user only after every check passes.
    },
    'args' => [
        'lw_fw_url' => ['type' => 'string', 'default' => ''],
        'lw_fw_reg_token' => ['type' => 'string', 'required' => true],
    ],
]);
```

`MySignupPolicy::allows_public_registration()` may intentionally return `true`
for anonymous visitors, but it should also own maintenance state, tenant/site
policy, invitation requirements, or any product-level registration switch. A
permission callback is authorization; token and rate-limit checks are abuse
controls and belong in the execution path.

## Bootstrap response

The server can supply a token alongside the client-visible form definition:

```php
$bootstrap['lwFirewall'] = [
    'enabled' => class_exists(RegisterToken::class)
        && (bool) Options::get('enabled', true)
        && (bool) Options::get('register_protect_enabled', true),
    'tokenName' => 'lw_fw_reg_token',
    'token' => class_exists(RegisterToken::class) ? RegisterToken::issue() : '',
    'honeypotName' => 'lw_fw_url',
    'honeypotEnabled' => (bool) Options::get('register_honeypot', true),
];
```

Do not cache a single token into a shared page or CDN response when single-use
is enabled. Every visitor receiving the cached value would contend for the same
replay key. Mark the bootstrap private/no-store or fetch it per session/request.

## Route-local rate limit

The worker's REST bucket is shared by every detected REST request from an IP.
Use a separate key for signup-specific control:

```php
use LightweightPlugins\Firewall\IpDetector;
use LightweightPlugins\Firewall\Rules\RateLimiter;

$storage = lw_firewall_resolve_storage((string) Options::get('storage', 'auto'));
$ip = IpDetector::get_ip();

if (!(new RateLimiter($storage))->is_allowed_key('myplugin_registration_' . $ip, 5)) {
    return new WP_Error(
        'myplugin_registration_limited',
        __('Registration failed, please try again later.', 'myplugin'),
        ['status' => 429]
    );
}
```

Run the rate check before expensive validation or external calls. Keep the key
namespace unique; never reuse worker keys such as `rest_<ip>`.

## Required tests

1. Valid POST and valid JSON request.
2. Missing token and invalid signature.
3. Token younger than the fill-time floor and older than the maximum age.
4. First and second use with single use enabled.
5. Two tokens issued in the same second and submitted by different clients.
6. Filled honeypot; optionally missing honeypot if the adapter requires presence.
7. Plugin inactive, master disabled, registration guard disabled, worker outdated.
8. Route-local limit and generic error response.
9. `/wp-json/myplugin/v1/registrations`, bare `/wp-json`, and
   `?rest_route=/myplugin/v1/registrations`.
10. Shared-ban enforcement under the site's actual auto-ban/login settings.

## Source anchors

- `includes/Rules/RegisterGuard.php`
- `includes/Rules/RegisterToken.php`
- `includes/Rules/RegisterTracker.php`
- `includes/Rules/RateLimiter.php`
- `includes/Options.php`
- `worker/lw-firewall-worker.php`
- WordPress core: `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`
