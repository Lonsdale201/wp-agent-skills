---
name: wp-docker-compose-stack
description: >
  Build a custom docker-compose development stack for WordPress when wp-env's
  abstraction runs out — Redis object cache, Mailpit SMTP capture, custom PHP
  extensions (phpredis, Xdebug), php.ini overrides. Covers the official
  wordpress image's runtime-env config model (wp-config.php reads
  WORDPRESS_DB_* / WORDPRESS_CONFIG_EXTRA via getenv at request time, so every
  container sharing the volume — wp-cli included — needs the same environment,
  best shared via a YAML anchor), the mariadb healthcheck + service_healthy
  dependency, a wp-cli service as user 33:33, wiring the redis-cache plugin
  drop-in with WP_REDIS_HOST, why wp_mail silently fails (invalid
  wordpress@localhost From) and the phpmailer_init + Mailpit fix, pecl
  Dockerfiles for phpredis/Xdebug, and pinning image tags because
  wordpress:latest lags WP releases. Use when composing docker-compose.yml for
  WP, adding Redis/mail capture to local dev, or debugging a WP container
  where config env vars seem ignored.
license: GPLv2-or-later
metadata:
  wp-skills-author: "Soczó Kristóf"
  wp-skills-contact: "mailto:lonsdale201@hotmail.com"
  wp-skills-plugin: "wordpress"
  wp-skills-plugin-version-tested: "wordpress:latest image (WP 6.8.3 / PHP 8.3); mariadb:lts; redis-cache 2.8.0; Xdebug 3.5.3; Docker 29.3 / Compose v5.1"
  wp-skills-wp-version-tested: "7.0"
  wp-skills-php-min: "7.4"
  wp-skills-last-updated: "2026-07-14"
---

# A custom docker-compose stack for WordPress

Hand-write a compose stack when you need services the official tooling doesn't model: Redis object cache, SMTP capture, custom PHP extensions, production-like topology. **Default to `wp-env` first** (see `wp-env-local-dev`) — it covers plain plugin/block development with less to maintain. This skill is the escape hatch, grounded against a fully booted and verified stack (WordPress + MariaDB + Redis + Mailpit + wp-cli, drop-in connected, mail captured). The complete tested files are bundled under `examples/`.

## When to use this skill

- Writing or reviewing a `docker-compose.yml` for WordPress development.
- Adding **Redis** (object cache), **Mailpit** (mail capture), **Xdebug**, or php.ini overrides to a WP container setup.
- Debugging "my `WORDPRESS_CONFIG_EXTRA` / `WP_REDIS_HOST` is ignored" or "wp-cli sees different config than the site".
- `wp_mail` silently fails inside a container.
- A team needs a production-like local topology that `wp-env` can't express.

## The config model: env is read at request time

This is the load-bearing fact of the official `wordpress` image, and the source of most broken stacks. The generated `wp-config.php` does **not** bake values in — it calls `getenv_docker()` on every request, and `WORDPRESS_CONFIG_EXTRA` is `eval`'d from the environment at runtime.

Consequence (verified by hitting it): a **wp-cli container sharing the same volume gets none of that config unless it has the same environment variables**. Our `wp redis enable` failed with `Connection refused [tcp://127.0.0.1:6379]` because only the `wordpress` service had `WORDPRESS_CONFIG_EXTRA` with `WP_REDIS_HOST` — the wp-cli service silently fell back to defaults. Share the block with a YAML anchor:

```yaml
x-wp-environment: &wp-environment
  WORDPRESS_DB_HOST: db
  WORDPRESS_DB_USER: wordpress
  WORDPRESS_DB_PASSWORD: wordpress
  WORDPRESS_DB_NAME: wordpress
  WORDPRESS_CONFIG_EXTRA: |
    define( 'WP_REDIS_HOST', 'redis' );
    if ( ! defined( 'WP_DEBUG' ) ) { define( 'WP_DEBUG', true ); }
    define( 'WP_DEBUG_LOG', true );

services:
  wordpress:
    environment: *wp-environment
  wpcli:
    environment: *wp-environment
```

Two refinements, both verified:

- **Guard `WP_DEBUG` with `if ( ! defined(...) )`** — wp-cli defines it first and an unguarded define in `CONFIG_EXTRA` throws "Constant WP_DEBUG already defined" warnings on every cli call. (Alternative: the image's own `WORDPRESS_DEBUG: 1` env var toggles `WP_DEBUG` without touching `CONFIG_EXTRA`.)
- Other image env vars: `WORDPRESS_TABLE_PREFIX`, the `WORDPRESS_AUTH_KEY`…`WORDPRESS_NONCE_SALT` salts (auto-generated if omitted), and a `_FILE` suffix convention on all of them for Docker secrets.

## Baseline stack

Abbreviated (full tested file: `examples/docker-compose.yml`):

```yaml
services:
  db:
    image: mariadb:lts
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: wordpress
      MARIADB_ROOT_PASSWORD: root
    volumes: [ db_data:/var/lib/mysql ]
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 12

  wordpress:
    image: wordpress:latest        # pin in real projects — see below
    depends_on:
      db:
        condition: service_healthy
    ports: [ "8080:80" ]
    environment: *wp-environment
    volumes:
      - wp_data:/var/www/html
      - ./uploads.ini:/usr/local/etc/php/conf.d/uploads.ini
```

- **The healthcheck is not optional.** WordPress crashes into a restart loop if it races a still-initializing MariaDB; `condition: service_healthy` with mariadb's bundled `healthcheck.sh` (verified) removes the race.
- **Pin the image.** `wordpress:latest` lags WordPress releases — at test time it shipped **WP 6.8.3 / PHP 8.3** while the current release was 7.0.1 (which `wp-env` did install). Use an explicit tag like `wordpress:6.8-php8.3-apache`, and update WP itself via `wp core update` in the volume when needed.
- **php.ini overrides** are a one-line mount into `/usr/local/etc/php/conf.d/` — verified `upload_max_filesize`/`memory_limit` took effect. See `examples/uploads.ini`.
- For plugin development, add a bind mount: `./:/var/www/html/wp-content/plugins/my-plugin` (on top of the named volume).

## wp-cli as a service

```yaml
  wpcli:
    image: wordpress:cli
    user: "33:33"
    profiles: ["cli"]              # doesn't start with `up`, only via `run`
    depends_on:
      db: { condition: service_healthy }
    environment: *wp-environment
    volumes: [ wp_data:/var/www/html ]
```

```bash
docker compose run --rm wpcli wp core install \
  --url=http://localhost:8080 --title="Dev" \
  --admin_user=admin --admin_password=admin \
  --admin_email=admin@example.com --skip-email
```

- `user: "33:33"` matters: the Alpine-based cli image defaults to uid 82, the Debian Apache image serves as uid 33 (`www-data`). Verified: with 33:33, files wp-cli writes (plugin installs, the Redis drop-in) come out owned by `www-data` and stay editable by the web container.
- The `Failed to create directory '/.wp-cli/cache/'` warning is benign (uid 33 has no writable HOME); silence it with `HOME: /tmp` in the environment if it bothers you.
- Wait for first boot before installing: the `wordpress` container generates `wp-config.php` on first run — until then wp-cli has nothing to load.

## Redis object cache (verified end-to-end)

```yaml
  redis:
    image: redis:alpine
```

With `WP_REDIS_HOST` pointing at the service name (in the shared anchor above):

```bash
docker compose run --rm wpcli wp plugin install redis-cache --activate
docker compose run --rm wpcli wp redis enable
docker compose run --rm wpcli wp redis status   # → Status: Connected, Drop-in: Valid, Ping: PONG
```

The official image ships **no phpredis extension** — verified: the drop-in falls back to the plugin's bundled **Predis** client, which works fine for dev. For phpredis (production parity), a two-line Dockerfile (verified build): `FROM wordpress:latest` + `RUN pecl install redis && docker-php-ext-enable redis`. For what the object cache changes about `wp_cache_*` semantics, see `wp-redis-object-cache`.

## Mail capture with Mailpit (and why wp_mail fails first)

```yaml
  mailpit:
    image: axllent/mailpit
    ports: [ "8025:8025" ]         # web UI + API; SMTP is 1025 inside the network
```

Two things must both be fixed — verified by hitting each failure separately:

1. **WordPress doesn't speak SMTP by default** (and the container has no sendmail): route PHPMailer to Mailpit.
2. **The default From address is invalid in Docker.** With a `localhost` site URL, WP builds `From: wordpress@localhost`, which PHPMailer rejects (`Invalid address`) — so `wp_mail()` returns `false` *before any SMTP attempt*, with no output unless you listen to `wp_mail_failed`.

Drop this as an mu-plugin (`wp-content/mu-plugins/mailpit.php`):

```php
<?php
add_action( 'phpmailer_init', function ( $phpmailer ) {
	$phpmailer->isSMTP();
	$phpmailer->Host = 'mailpit';
	$phpmailer->Port = 1025;
} );
add_filter( 'wp_mail_from', fn() => 'dev@example.test' );
```

Verified: with both in place the message lands in Mailpit (UI at <http://localhost:8025>, scriptable via `GET /api/v1/messages`). When debugging, hook `wp_mail_failed` and print the `WP_Error` — it names the real cause.

## Xdebug

The official image has no Xdebug; add it with a Dockerfile (verified build, Xdebug 3.5.3 — full file: `examples/Dockerfile.xdebug`):

```dockerfile
FROM wordpress:latest
RUN pecl install xdebug && docker-php-ext-enable xdebug
```

Configure via a conf.d ini: `xdebug.mode=debug`, `xdebug.start_with_request=trigger`, `xdebug.client_host=host.docker.internal`, `xdebug.client_port=9003`. `host.docker.internal` reaches the IDE on Docker Desktop; on native Linux add it via `extra_hosts: ["host.docker.internal:host-gateway"]`.

## Critical rules

- **Every container that loads WordPress needs the same `WORDPRESS_*` environment** — the image resolves config from env at request time, not at install time. Use a YAML anchor; a config that "works on the site but not in wp-cli" is this bug.
- **Healthcheck the DB and gate WordPress on `service_healthy`** — `depends_on` alone only orders startup, it doesn't wait for MySQL to accept connections.
- **Pin image tags.** `wordpress:latest` lags WP releases and silently changes PHP major versions under you.
- **Run wp-cli as `user: "33:33"`** so written files stay owned by `www-data`; alpine-cli's default uid 82 leaves root-unfriendly ownership mismatches.
- **`wp_mail` in a container needs a valid From address AND an SMTP route** — fix both (`wp_mail_from` + `phpmailer_init`), and debug via `wp_mail_failed`, never by staring at a silent `false`.
- **Guard constants in `CONFIG_EXTRA`** (`if ( ! defined(...) )`) — wp-cli pre-defines some (WP_DEBUG) and unguarded defines warn on every invocation.
- **Named volumes for `/var/www/html` and the DB** — `docker compose down` keeps them, `down -v` is the deliberate wipe.

## Cross-references

- Run **`wp-env-local-dev`** first — if the project needs no custom services, the official tool is less to maintain.
- Run **`wp-redis-object-cache`** for correct `wp_cache_*` usage and drop-in lifecycle once Redis is wired.
- Run **`wp-phpunit-test-setup`** for the test harness; its wp-env route already includes the WP test suite, no extra compose service needed.

## What this skill does NOT cover

- Production hosting, TLS, scaling, or hardening — this is a development stack.
- `wp-env` itself (see `wp-env-local-dev`) and WordPress Playground.
- Node build tooling (Tailwind, @wordpress/scripts): run watchers on the host — file-watching through container mounts is slow and gains nothing locally; containerize builds only in CI.

## References

- Official wordpress image docs (env vars, variants, `_FILE` secrets): <https://hub.docker.com/_/wordpress>
- mariadb image healthcheck.sh: <https://mariadb.com/kb/en/using-healthcheck-sh/>
- Mailpit: <https://mailpit.axllent.org/>
- Redis Object Cache plugin: <https://wordpress.org/plugins/redis-cache/>
- Bundled, boot-verified files: `examples/docker-compose.yml`, `examples/uploads.ini`, `examples/Dockerfile.xdebug`, `examples/mu-plugin-mailpit.php`
