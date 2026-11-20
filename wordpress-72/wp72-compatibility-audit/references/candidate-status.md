# Candidate status and final-release promotion

Verified on 2026-11-20 against the official nightly archive reporting
7.2-RC2-65695. The newest numbered prerelease in the official archive was
7.2-RC2 (2026-11-18). A nightly URL is mutable: retain its hash and version.

## Avoid outdated assumptions

| Claim | Candidate finding |
|---|---|
| wp_kses is removed | False: keep its public entry points. The implementation changes. |
| Legacy KSES is active because the function passes true to its filter | False after normal bootstrap: default-filters.php registers __return_false. |
| The HTML API alone sanitizes HTML | False: use a sanitization policy through KSES. |
| load-scripts/load-styles still concatenate with a deprecation notice | False: both respond 410 without bootstrapping WordPress. |
| 7.2 includes jQuery 4 | False: the tested scripts are jQuery 3.7.1 and Migrate 3.6.0. |
| The Secrets API ships in 7.2 | Reverted on 2026-11-17; wp_set_secret and WP_Secret are absent in the tested build. |
| asDangerousHTML makes user HTML safe | False: branding does not sanitize. |
| A capability-filtered ability discovery result proves execution permission | False: object/input-dependent checks still apply. |
| All media uploads now run in the browser | False: browser, device, isolation, screen and file gates retain classic paths. |

Do not migrate credentials to the reverted Secrets API or add its key/drop-in
configuration as a 7.2 prerequisite. A site that tested an earlier beta needs a
separate recovery plan with its original data and keys preserved; this package
does not automate credential recovery.

The scheduled final release is December 8 according to the current 7.2 schedule.
Release dates and future jQuery/component removal schedules must be rechecked.

## Promote after the final release

1. Download the final 7.2 archive, record its hash/version and compare the changed
   API/source files with this candidate.
2. Re-read updated dev notes and explicitly recheck reverted/deferred proposals.
3. Rerun the PHP/REST, HTTP, browser and multisite checks plus the affected plugin
   integrations. Do not carry nightly results forward as final-release evidence.
4. Merge deltas into the existing stable skills where their scopes match. Move
   genuinely new skills into wordpress/ with deliberate stable-name handling;
   avoid two skills competing for the same trigger.
5. Update tested-version metadata, source references, domain/root READMEs,
   changelog and generated index. Recheck relative links after moves.

Until then, keep these instructions and their evidence in wordpress-72/.

## Sources

- [Release archive](https://wordpress.org/download/releases/)
- [Release schedule](https://make.wordpress.org/core/7-2/)
- [Secrets API withdrawal notice](https://make.wordpress.org/core/2026/11/11/the-secrets-api-in-wordpress-7-2/)
- [Withdrawal changeset](https://core.trac.wordpress.org/changeset/65538)
