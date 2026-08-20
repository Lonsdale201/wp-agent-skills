# WordPress 7.1 theme.json reference

## Viewport normalization

`WP_Theme_JSON::get_viewport_media_queries()` exposes core's normalized media queries. Theme authors normally declare data rather than call the method, but it is useful in tests.

| Input | Result |
| --- | --- |
| no `settings.viewport` | `@mobile: width <= 480px`; `@tablet: 480px < width <= 782px` |
| only valid `mobile: 640px` | only `@mobile: width <= 640px` |
| only valid `tablet: 64rem` | only `@tablet: width <= 64rem` |
| invalid values only | both core defaults |
| tablet less than/equal to mobile | mobile retained, tablet omitted |

The public helper accepts `include_desktop => true`, producing `@desktop` above the largest retained breakpoint. `@desktop` is not an authored theme.json style-state key in the normal two-breakpoint schema; base styles are the desktop/default layer.

## Valid state placement

Responsive nodes are valid in these main positions:

```text
styles.blocks.<block>.@mobile
styles.blocks.<block>.@tablet
styles.blocks.<block>.@mobile.elements.<element>
styles.blocks.<block>.@mobile.:hover        # only allowlisted blocks
styles.elements.<element>.@mobile
styles.blocks.<block>.variations.<name>.@mobile
styles.blocks.<block>.variations.<name>.@mobile.blocks.<inner-block>
```

Pseudo-states can also sit inside the supported `core/navigation-link.-current` custom state. Use valid state names exactly; theme.json sanitization drops unknown structures.

## 7.1 property map

| Capability | Enable under `settings` | Supply under `styles` / block style attributes |
| --- | --- | --- |
| Background gradient | `background.gradient` | `background.gradient` |
| Minimum width | `dimensions.minWidth` | `dimensions.minWidth` |
| Visibility editor control | `blockVisibility.allowEditing` | block visibility data is editor/block behavior, not CSS authorization |
| Text shadow | no matching global UI support flag | `typography.textShadow` |

`typography.textShadow` is accepted by the theme.json style engine in WordPress 7.1 but does not imply that every block exposes a dedicated editor control.

## Safe extension rules

- Keep `version` at the current theme.json schema version (`3` in WordPress 7.1).
- Treat editor UI feature flags as UI policy, not content access policy.
- Use presets for reusable tokens and direct style values for intentional one-offs.
- Do not concatenate untrusted input into gradients, URLs, custom CSS, or text shadows.
- Do not rely on undocumented keys surviving `WP_Theme_JSON::remove_insecure_properties()`.
- Test server-generated CSS; a value visible in raw JSON may have been sanitized out.

## Test probes

```php
$queries = WP_Theme_JSON::get_viewport_media_queries(
    array(
        'mobile' => '40rem',
        'tablet' => '64rem',
    ),
    array( 'include_desktop' => true )
);

// @mobile  => @media (width <= 40rem)
// @tablet  => @media (40rem < width <= 64rem)
// @desktop => @media (width > 64rem)
```

For end-to-end testing, parse a minimal theme.json-shaped array with `WP_Theme_JSON`, request the block style nodes, and assert the generated rules. Also inspect the browser at exact boundary widths because inclusive range syntax matters.
