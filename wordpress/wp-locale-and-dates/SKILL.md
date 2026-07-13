---
name: wp-locale-and-dates
description: Handle dates, times, and numbers in WordPress plugins with
  the modern (5.3+) locale-aware helpers — `wp_date()`,
  `current_datetime()`, `wp_timezone()`, `get_gmt_from_date()` /
  `get_date_from_gmt()`, `mysql_to_rfc3339()`, `number_format_i18n()` —
  and avoid the legacy foot-guns (`current_time('timestamp')` returning
  offset-summed not-quite-Unix, `date_i18n` quirks, `mysql_to_rfc3339`
  not actually being RFC3339). Covers `timezone_string` vs `gmt_offset`
  fallback, choosing canonical UTC or paired core-style columns, REST dates,
  and locale-aware number formatting. Use for any plugin that stores,
  queries, or displays dates / numbers in multi-locale, multi-timezone
  installs.
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "5.3 - 7.0.1"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-10"
---

# WordPress Locale, Dates & Numbers

WP's date/time API has TWO eras: pre-5.3 (offset-summed timestamps, `date_i18n`, `current_time('timestamp')` — quirky, error-prone) and 5.3+ (true UTC timestamps, `DateTimeZone` objects, `wp_date`, `current_datetime`). Most plugins still write pre-5.3 code because that's what AI training data is full of. This skill is the modern recipe.

## When to use this skill

Trigger when ANY of the following is true:

- A plugin stores, queries, or displays dates / times — scheduled tasks, expiry dates, audit timestamps, log entries, "X minutes ago" labels, REST date fields.
- Code references `wp_date`, `current_datetime`, `current_time`, `date_i18n`, `wp_timezone`, `wp_timezone_string`, `get_gmt_from_date`, `get_date_from_gmt`, `mysql2date`, `mysql_to_rfc3339`, `iso8601_to_datetime`, `number_format_i18n`.
- Code calls `time()`, `date()`, `strtotime()` directly for site-display dates without considering timezone.
- The user reports: "wrong timezone on schedule emails", "WP-Admin shows EST but database has UTC", "Friday in Europe shows as Thursday in REST".

## The mental model — timestamps are UTC, formatting is local

Since WP 5.3, the rule is:

- **Timestamps stored in code (and Unix epoch in general) are UTC integers**. `time()` returns UTC. `wp_date()` accepts UTC and formats in a target timezone.
- **Core post date fields are paired by convention**: `post_date` is site-local
  and `post_date_gmt` is UTC. This does not mean every WordPress/plugin
  `DATETIME` is implicitly local; a SQL `DATETIME` has no timezone metadata.
- **The "site's timezone" is configurable** — `Settings → General → Timezone`. It's either `Europe/Budapest` (IANA name in `timezone_string`) or a manual `+02:00` offset (in `gmt_offset`). Use `wp_timezone()` / `wp_timezone_string()` — they handle the fallback for you (`wp-includes/functions.php:124-154`).

## Always reach for these (modern API)

| Need | Function | Notes |
|---|---|---|
| Current UTC timestamp | `time()` | Plain PHP. WP doesn't wrap. |
| Current local DateTimeImmutable | `current_datetime()` | Site timezone (5.3+) |
| Format a UTC timestamp for display | `wp_date( $format, $timestamp = null, $timezone = null )` | Default timezone = site. Default timestamp = now. Returns `false` on invalid input |
| Site timezone object | `wp_timezone()` | Returns `DateTimeZone`, never null |
| Site timezone string | `wp_timezone_string()` | IANA name OR `±HH:MM` offset |
| Convert site-local datetime → UTC | `get_gmt_from_date( $date_string, $format = 'Y-m-d H:i:s' )` | Takes a `Y-m-d H:i:s` string in site TZ, returns UTC. Validate input first |
| Convert UTC datetime → site-local | `get_date_from_gmt( $date_string, $format = 'Y-m-d H:i:s' )` | Mirror image. Validate input first |
| Locale-aware number | `number_format_i18n( $number, $decimals = 0 )` | Reads `$wp_locale->number_format['decimal_point' \| 'thousands_sep']` |

## Avoid these unless interfacing with legacy code

- **`current_time( 'timestamp' )`** — returns `time() + gmt_offset * 3600`. The result is **NOT a real Unix timestamp** — it's UTC summed with the site's offset. Pre-5.3 code uses it to feed `date()` directly. PHPCS flags it via `WordPress.DateTime.CurrentTimeTimestamp.Requested`. Use `time()` for UTC or `current_datetime()->getTimestamp()` for a proper local-now-as-UTC-int.
- **`date_i18n( $format, $timestamp_with_offset )`** — legacy wrapper around `wp_date`. Same trap as above: the `$timestamp` arg expects offset-summed values, not real UTC. `wp_date` is the cleaner replacement (`wp-includes/functions.php:179`).
- **`mysql_to_rfc3339( $date_string )`** — function name lies: source docblock explicitly says **"the output does NOT conform to RFC3339 format, which must contain timezone"** (`wp-includes/functions.php:7855`). It outputs `Y-m-d\TH:i:s` with no `Z` / no offset. Use it only if you specifically want WP's REST-compatible "local without offset" shape (that's the convention for REST `*_gmt` fields, despite the misleading name).

## Storing dates

### MySQL DATETIME columns

For new plugin tables, prefer one canonical UTC instant: a UTC `DATETIME` or a
Unix integer. Add a site-local companion only when interoperating with a core
schema/pattern or when a demonstrated local-time query/display requirement
justifies the duplication. Document the timezone semantics in the column name
and schema comments.

```php
$now_utc = current_datetime()->setTimezone( new DateTimeZone( 'UTC' ) );

$wpdb->insert( $wpdb->prefix . 'myplugin_events', array(
    'event_date_gmt' => $now_utc->format( 'Y-m-d H:i:s' ),
) );
```

If you only have a user-entered local date string (e.g. from a datepicker — see **`wp-admin-form-controls`**), convert at the boundary:

```php
$user_input = '2026-06-01 14:30:00';                      // assumed in site TZ
$gmt_string = get_gmt_from_date( $user_input );           // → 'Y-m-d H:i:s' in UTC
```

`get_gmt_from_date()` and `get_date_from_gmt()` are converters, not validators. On parse failure core returns `gmdate( $format, 0 )` (usually `1970-01-01 00:00:00`), so validate user input before conversion.

Local date-times can also be nonexistent or ambiguous across DST transitions.
For exact scheduling, parse with `wp_timezone()`, round-trip the formatted
value to detect normalization through a DST gap, and define a product policy
for repeated local times (ask for an offset/occurrence or reject ambiguity).
Date-only values do not identify an instant and should remain `Y-m-d` when
that is the real domain value.

### Storage as Unix integer

For event timestamps, expiry, etc., store as a `BIGINT` UTC integer (`time()`). Simple to query (`WHERE expires_at < UNIX_TIMESTAMP()`), no timezone ambiguity. Display-side, feed to `wp_date()`.

```php
$row = array( 'expires_at' => time() + DAY_IN_SECONDS * 30 );
// ...
$display = wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $row['expires_at'] );
```

`get_option( 'date_format' )` and `get_option( 'time_format' )` are the user-configured formats from `Settings → General`. Use them so a German site shows `01.06.2026` and a US one shows `06/01/2026`.

## Display

```php
// Now, in site timezone, with site's date format.
echo esc_html( wp_date( get_option( 'date_format' ) ) );

// A stored UTC timestamp, shown in site timezone (default).
echo esc_html( wp_date( 'Y-m-d H:i', $expires_at_int ) );

// Same timestamp, but force UTC display.
echo esc_html( wp_date( 'Y-m-d H:i', $expires_at_int, new DateTimeZone( 'UTC' ) ) );

// Localized numbers.
echo esc_html( number_format_i18n( 1234567.89, 2 ) );    // de_DE: "1.234.567,89"
```

`wp_date` localizes day/month names via `$wp_locale`, but it does not rearrange your format string. Use the site's `date_format` / `time_format` options for normal UI instead of hardcoding English-style ordering.

## REST API dates

WP REST returns dates as `*_gmt` and `*` fields. The `_gmt` field uses the `mysql_to_rfc3339` shape (no `Z`/offset — confusing but it's the convention). Don't try to fight it; emit the same shape from your custom REST routes:

```php
// In a REST callback that builds a response:
$response_data = array(
    'created_at'     => mysql_to_rfc3339( get_date_from_gmt( $row['created_at_gmt'] ) ),
    'created_at_gmt' => mysql_to_rfc3339( $row['created_at_gmt'] ),
);
```

For genuine ISO 8601 with offset (needed if a third-party API expects RFC3339-compliant), use `DateTimeImmutable::format( DateTimeInterface::ATOM )` (= `'Y-m-d\TH:i:sP'`) directly.

## Locale-aware numbers

`number_format_i18n( $number, $decimals = 0 )` uses `$wp_locale->number_format['decimal_point']` and `['thousands_sep']` (verified at `wp-includes/functions.php:424`). It does NOT do currency formatting — that's WC's `wc_price()` territory. For non-WC currency display, build your own around `number_format_i18n` + a currency symbol option.

```php
$total = 1234.5;
$displayed = number_format_i18n( $total, 2 ) . ' ' . esc_html( get_option( 'myplugin_currency_symbol', 'USD' ) );
```

## Locale file loading

Translation loading is its own topic — see **`wp-i18n-audit`**. `$wp_locale` is
initialized during core bootstrap, but plugins should not render user-facing
dates at file-load time. Generate UI on its normal lifecycle hook (`init` or a
later render hook), after locale and plugin translation setup is available.

## Critical rules

- **Treat `time()` results as UTC integers**. Pass them to `wp_date()` for display in site timezone, or `gmdate()` for UTC display. NEVER add the site offset to a `time()` value before formatting — that's the legacy `current_time('timestamp')` foot-gun.
- **`current_time( 'timestamp' )` is NOT a Unix timestamp**. It's `time() + offset * 3600`. PHPCS flags it. The correct replacement: `current_datetime()` for an object, `time()` for UTC int.
- **`mysql_to_rfc3339()` does NOT produce RFC3339**. The function name is wrong; it produces ISO 8601 without timezone. Source explicitly notes this. Use it for REST compatibility; use `DateTimeInterface::ATOM` for actually-RFC3339-compliant output.
- **Prefer one canonical UTC instant in custom tables**. Use paired local/UTC
  columns only for a documented interoperability or query requirement; when a
  local column exists, keep its UTC companion authoritative and synchronized.
- **`wp_timezone_string()` may return an IANA name OR a `±HH:MM` offset**. Don't assume IANA — sites with `gmt_offset` set but no `timezone_string` produce the offset form. `DateTimeZone()` accepts both, so use `wp_timezone()` (object) whenever possible.
- **Use `get_option('date_format')` + `get_option('time_format')` for user-facing display**, not hardcoded `'Y-m-d'`. Respects the site admin's preference.
- **Don't store locale-formatted strings**. Store machine values (`Y-m-d H:i:s` or UTC integers), then format at display. Locale-shaped strings are hard to query and migrate.
- **Do not render user-facing dates at plugin file load**. Use the normal
  `init`-or-later application/render lifecycle so locale setup is complete.

## Common AI mistakes

```php
// WRONG — uses pre-5.3 quirk; result is NOT a real Unix timestamp
$ts = current_time( 'timestamp' );
echo date( 'Y-m-d H:i', $ts );

// RIGHT — modern path
echo esc_html( wp_date( 'Y-m-d H:i' ) );
```

```php
// WRONG — date() in PHP uses server's PHP timezone (often UTC), not site's WP timezone
echo date( 'Y-m-d H:i', $created_at );

// RIGHT — wp_date respects site timezone setting
echo esc_html( wp_date( 'Y-m-d H:i', $created_at ) );
```

```php
// WRONG — adding offset to a UTC time twice; ends up double-shifted
$shifted = time() + (int) get_option( 'gmt_offset' ) * HOUR_IN_SECONDS;
echo date( 'H:i', $shifted );

// RIGHT — wp_date handles the timezone shift internally
echo esc_html( wp_date( 'H:i' ) );
```

```php
// WRONG — assumes IANA timezone; breaks when site uses gmt_offset
$tz = new DateTimeZone( get_option( 'timezone_string' ) );

// RIGHT — wp_timezone falls back to gmt_offset
$tz = wp_timezone();
```

```php
// WRONG — function name lies; produces ISO 8601 without TZ, NOT RFC3339
$rfc3339 = mysql_to_rfc3339( $datetime_string );  // for external API: WRONG

// RIGHT — actually-RFC3339
$rfc3339 = ( new DateTimeImmutable( $datetime_string, wp_timezone() ) )
    ->format( DateTimeInterface::ATOM );
```

## Cross-references

- See **`wp-i18n-audit`** for translation loading order — relevant because `$wp_locale->month` / `weekday` content depends on textdomain being loaded.
- See **`wp-admin-form-controls`** for the datepicker that emits `Y-m-d` strings, and the sanitize-callback strict validation that matches them.
- See **`wp-rest-api`** when emitting date fields in REST responses — match the `*_gmt` convention.

## What this skill does NOT cover

- Currency formatting. `number_format_i18n` formats numbers; currency display (locale-aware position of symbol, locale-specific separators) is its own topic. WC has `wc_price()`; non-WC plugins build a small wrapper.
- Custom calendar (Hijri, Buddhist, Jalali). WP only ships Gregorian. Use a third-party calendar library.
- Recurring schedules — see `wp-plugin-cron` + Action Scheduler skills.

## References

- `wp-includes/functions.php:78` — `current_time()`, including the PHPCS-flagged `'timestamp'` branch.
- `wp-includes/functions.php:101` — `current_datetime()` (5.3+, returns DateTimeImmutable).
- `wp-includes/functions.php:124` — `wp_timezone_string()` with `timezone_string` → `gmt_offset` fallback.
- `wp-includes/functions.php:152` — `wp_timezone()`.
- `wp-includes/functions.php:179` — `date_i18n()` (legacy wrapper around `wp_date`).
- `wp-includes/functions.php:243` — `wp_date()` (the modern entry point).
- `wp-includes/functions.php:424` — `number_format_i18n()`.
- `wp-includes/functions.php:7863` — `mysql_to_rfc3339()` with the "does NOT conform to RFC3339" docblock note.
- `wp-includes/formatting.php:3670` / `:3692` — `get_gmt_from_date()` / `get_date_from_gmt()`.
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_date/>
- Official documentation: <https://developer.wordpress.org/reference/functions/current_datetime/>
- Official documentation: <https://developer.wordpress.org/reference/functions/wp_timezone/>
- Official documentation: <https://make.wordpress.org/core/2019/09/23/date-time-improvements-wp-5-3/>
