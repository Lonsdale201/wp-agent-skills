# WordPress 7.1 block contracts

## Support paths

| Capability | `block.json` opt-in | Attribute/style path | CSS output |
|---|---|---|---|
| Background gradient | `supports.background.gradient` | `style.background.gradient` | `background-image` |
| Minimum width | `supports.dimensions.minWidth` | `style.dimensions.minWidth` | `min-width` |
| List Item binding | no new block opt-in | `metadata.bindings.content` on `core/list-item` | bound list-item content |

The new background gradient may be combined with a background image as
comma-separated `background-image` layers. When that support and value are
active, Core suppresses the older Color-panel gradient to avoid duplicate
controls. Existing `color.gradient` data remains supported.

## Custom HTML variation slots

```js
wp.blocks.registerBlockVariation( 'core/html', {
	name: 'acme-callout-shell',
	title: 'Callout shell',
	innerContent: [ '<aside class="acme-callout">', null, '</aside>' ],
	innerBlocks: [
		[ 'core/paragraph', { content: 'Editable content' } ],
	],
} );
```

Each `null` corresponds positionally to an `innerBlocks` entry. The contract is
specific to `core/html`; other block types ignore `innerContent`. Verify exact
serialization round trips and KSES behavior for the author role being supported.

## 7.1 package migrations

- Use a transform object's `variationName` when the target is a particular
  variation rather than only a base block type.
- `switchToBlockType( blocks, targetName, variationName )` supports the same
  explicit target.
- Replace `__experimentalCloneSanitizedBlock` with `cloneSanitizedBlock`.
- Replace `__experimentalSanitizeBlockAttributes` with
  `sanitizeBlockAttributes`.
- Direct `pasteHandler()` consumers should re-test Markdown edge cases because
  Core's internal parser changed from Showdown to Marked/CommonMark-GFM behavior.
- Paragraph `editableRoot` work can change native event targets. Filters adding
  editing event props to `editor.BlockListBlock` should test the pseudo
  SyntheticEvent bridge instead of assuming the original DOM target.

## Deferred features are not 7.1 contracts

Do not write a compatibility path that assumes React 19, real-time
collaboration, or removal of the Classic block. Those changes did not ship in
WordPress 7.1.

## Verification probes

1. Assert `WP_Block_Type_Registry::get_instance()->is_registered()` after
   `init` and inspect the final server block type.
2. Parse and render fixture markup with `parse_blocks()` and `do_blocks()`.
3. Compare saved markup before/after editing and exercise declared deprecated
   block versions.
4. Confirm metadata asset handles resolve and are absent on unrelated screens.
5. Inspect wrapper classes/styles for every enabled support.
6. Test Custom HTML slot markup with an author affected by unfiltered HTML rules.
7. Run editor console tests with deprecated/experimental export use treated as
   a failure.

## Primary sources

- <https://make.wordpress.org/core/2026/07/26/new-block-support-in-wordpress-7-1-background-gradient-background-gradient/>
- <https://make.wordpress.org/core/2026/07/26/new-block-support-in-wordpress-7-1-minimum-width/>
- <https://make.wordpress.org/core/2026/07/23/editable-blocks-inside-the-custom-html-block/>
- <https://make.wordpress.org/core/2026/08/04/miscellaneous-block-editor-changes-in-wordpress-7-1/>
- Core: `wp-includes/blocks.php`, `class-wp-block-type.php`,
  `block-supports/background.php`, `block-supports/dimensions.php`.

