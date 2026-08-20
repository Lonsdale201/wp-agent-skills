# Comments and Notes migration reference

## Query patterns

```php
// Public comments only.
$comments = get_comments(
    array(
        'post_id' => $post_id,
        'status'  => 'approve',
        'type'    => 'comment',
    )
);

// Authorized editorial Notes only.
if ( current_user_can( 'edit_post', $post_id ) ) {
    $notes = get_comments(
        array(
            'post_id' => $post_id,
            'status'  => 'all',
            'type'    => 'note',
        )
    );
}
```

For Note children, preserve `type => note` and `status => all`; otherwise default comment-query behavior can hide part of the thread or mix types.

## 7.1 notification migration

Review every `notify_post_author` callback:

| Callback behavior | 7.1 consequence |
|---|---|
| Always returns `false` | still suppresses notifications |
| Returns incoming value unchanged | now receives a strict boolean with approval already represented |
| Always returns `true` | can force mail for pending, spam, and trashed comments |
| Strictly compares to string `'1'` | wrong in 7.1; compare boolean or inspect the comment |
| Assumes filter runs for invalid ID | no longer runs |

## Ping environment matrix

| Environment | 7.1 default |
|---|---|
| `production` | pings available under normal settings |
| `staging` | incoming/outgoing pings disabled |
| `development` | incoming/outgoing pings disabled |
| `local` | incoming/outgoing pings disabled |

The `wp_should_disable_pings_for_environment` filter can disable production or re-enable non-production. If another plugin filters it, test the effective value, not merely `wp_get_environment_type()`.

Same-site auto-approval applies only to verified pingbacks whose source URL maps to a published local post. It does not apply to trackbacks.
