# Change Log
All notable changes to the "animallogic-usd" extension will be documented in this file.

## [0.2.0]
- Open `.usdc` files as a read-only USDA preview when clicked in the VS Code explorer (custom editor redirects to the existing `usdc:` virtual document).
- Added the **USD: Open as USDA** command, also available from the explorer and editor tab context menus for `.usdc` and `.usd` files (including binary crate `.usd` files).
- Show an error message with guidance to set the `usd.cat` path when `usdcat` fails (for example on Windows, where the executable may be `usdcat.cmd`).
- Fixed asset-link resolution so USDC targets use `uri.with({ scheme: "usdc" })` instead of assigning to the immutable `uri.scheme` property.

## [0.1.0]
- Asset paths are now clickable links with asset resolution using `usdresolve`.
- Go To Definition works for prim paths within the same document.
- Open .usdc files as readonly .usda preview.
- Extended numeric highlighting to support hex (0x1234ABCD) and exponents (1.0e-2) syntax.

## [0.0.4]
- Added support for numeric highlighting (thanks @sho7noka)

## [0.0.3]
- Improved asset handling with support for triple-@ `@@@myserver?a1=foo.usd@267751@@@`

## [0.0.2]
- Added all known USD Types from [USD Documentation](https://graphics.pixar.com/usd/docs/api/_usd__page__datatypes.html)
- Added variables

## [0.0.1]
- Initial release
- Simple syntax highlithing
