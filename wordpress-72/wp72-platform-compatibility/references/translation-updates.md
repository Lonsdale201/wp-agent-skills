# Translation update integrations

The candidate adds helpers in wp-includes/update.php for a stable update identity
and deferred translation selection. Read this when implementing an update manager;
ordinary translation calls do not need a migration.

- wp_get_translation_update_id($update) derives an ID from type, slug, language
  and version. Equivalent array/object data gives the same ID; a new version
  gives another identity. Do not use a plugin slug alone as the selection key.
- wp_get_translation_updates_by_id($updates = null) keys updates by this ID.
  Without an explicit list it uses the site's available translation updates.
- wp_get_deferred_translation_updates() reads deferred selections.
- wp_is_translation_update_deferred($update, $deferred_updates = null) checks the
  corresponding ID, optionally against a supplied list.
- wp_set_deferred_translation_updates($updates) replaces the stored selection;
  an empty list removes it. Preserve other selections when applying a partial
  UI change, and enforce the updater's capability/nonce contract.

This state is not evidence that an update was installed or that package delivery
succeeded. Verify installed translation files and the update result separately.
On multisite, inspect the site-option/network scope used by the exact candidate.

Check identity and deferred matching with synthetic data before changing stored
update selections.

## Sources

- [Official core source](https://github.com/WordPress/wordpress-develop)
- Verified source: wp-includes/update.php, wp-admin/update-core.php.
