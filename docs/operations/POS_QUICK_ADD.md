# POS quick add

Status: implementation verified locally, 2026-10-27. Production release evidence
is recorded below.

The billing screen shows six quick-add buttons below the barcode/name search.
Each tap adds one unit through the existing cart handler and returns focus to
the scanner. Repeated taps increase the existing line's quantity.

The requested products were verified with read-only queries against the live
catalog. No products, stock, bills or financial records were changed.

| Product | Printed MRP | Barcode |
| --- | ---: | --- |
| small carry bag | 5 | 102030 |
| LARGE CARRY BAG | 10 | 101151 |
| Plastic glass | 20 | 19008 |
| Dras Ice Ice, 500 g | 50 | 757953692553 |
| Dras Ice Ice Cubes, 1 kg | 75 | 769807187498 |
| Dras Ice Cup | 30 | 726684841202 |

Only these six barcodes are configured. A bounded Firestore subscription supplies
current names, selling prices, stock and revisions; buttons display the current
selling price, which matched printed MRP for all six products at verification.
Inactive or removed products are omitted. Quick add waits for the initial server
snapshot. A subscription error hides its buttons and offers Retry while ordinary
scan/search remains available. Existing checkout/recovery and unresolved-product
guards also cover quick add.

Verification:

- PASS: TypeScript and focused ESLint.
- PASS: production build (existing large-chunk warning remains).
- PASS: 15 existing POS domain/payment/draft tests.
- PASS: actual POS page in an isolated browser fixture with stubbed repositories:
  all six buttons; seven units in six rows; total 195; scanner refocus; mobile
  width 390 and desktop width 1440 without horizontal page overflow.
- PASS: subscription failure removes buttons; search stays usable; Retry
  restores buttons; deactivating a product removes its shortcut.
- NOT RUN: authenticated production quick-add acceptance; production checkout was
  not exercised. Browser fixture results do not claim financial acceptance.

Review image: `output/playwright/pos-quick-add-buttons.png` (ignored local artifact).

## Production release

The user accepted the six-product preview: "yes add that, will these use our
existing products ?" The shortcuts reference the existing catalog barcodes above;
no product creation or data migration is involved.

The release source is an isolated archive of previously deployed commit
`1820b769bab568c7db2382b726470b418c8ec4b1`, with only `PosPage.tsx`,
`PosQuickAdd.tsx` and `posRepository.ts` changed. Every archived source file was
checked against its Git blob, allowing Windows line-ending conversion. Unrelated
local Telegram frontend changes were excluded. The Hosting manifest retains the
existing standalone Telegram page and its assets unchanged.

Release inspection found nonempty local-test login values in the previously
published main bundle. They were never printed or used to authenticate. The
release build uses only the six public Firebase settings. The normal Vite config
now also filters production environment variables to `VITE_FIREBASE_`, preserving
the development environment while excluding local login values from future builds.
Both normal and isolated builds passed a private-value scan. The old affected
JavaScript path is removed from the new Hosting manifest. **The affected test
account's password still needs rotation; no password or session was changed.**

The initial release `54d615e70e28b777` passed file hashes but failed the anonymous
browser smoke check because its custom environment replacement omitted Firebase
runtime configuration. The previous website version `5b021aabc2989d6d` was
restored at `2026-10-27T08:52:46.148Z`; its sign-in screen was verified. The build
was corrected to use Vite's normal environment-file loading with an explicit public
key prefix. The corrected isolated production build rendered the sign-in screen
with zero browser errors before republishing. This first attempt is a failed
release, not a passing browser check.

The final Hosting receipt and HTTP/asset checks are saved under ignored
`output/pos-quick-add/hosting-receipt.json` and `live-verification.json`.
Production verification is read-only. An authenticated user still needs to accept
the quick buttons on their real POS; no production bill was created for testing.

Final release: `sites/alphahub-f137b/versions/20aafa5de7d165e9`, published at
`2026-10-27T09:06:35.269Z`. The three served release files returned HTTP 200 and
matched their local SHA-256 hashes. The new main bundle is
`/assets/index-CzHdrB5w.js`; the Telegram owner page still returns HTTP 200. The old
affected JavaScript path now serves the SPA fallback rather than JavaScript, with
no old test-login values. The server-side manifest was verified before release.
An intermediate corrected-build upload returned HTTP 500 and was never released;
retrying completed successfully while the prior stable website stayed live.
The final public website rendered the sign-in screen using the expected main
bundle with zero page runtime errors. Temporary downloads containing the prior
login values were deleted after verification; secret values are absent from this
runbook and release evidence.

## Compact layout revision

The user requested a single row of smaller cards after reviewing the live layout.
`PosQuickAdd.tsx` now uses a non-wrapping horizontal row with 40px buttons, smaller
text and spacing, and single-line product names. Full names remain in the button
title and accessible label. On narrow screens the row scrolls horizontally;
the surrounding page does not overflow. Product identities and cart behavior are
unchanged.

TypeScript, focused ESLint and the isolated production build passed. Browser
checks verified six cards at the same vertical position with height 40px, mobile
horizontal scrolling at 390px, and three taps producing three units totaling 40.
The production candidate rendered the sign-in screen with zero runtime errors
before release. Local review images are
`output/playwright/pos-quick-add-compact-desktop.png` and
`output/playwright/pos-quick-add-compact-mobile.png`.

The release extends Hosting version `20aafa5de7d165e9`, preserving all previous
file hashes except `/index.html` and adding the new main JS/CSS. The Telegram
controls remain unchanged. Release evidence is in `output/pos-quick-add/compact/`.

Compact release `sites/alphahub-f137b/versions/72e628f7f11e1d3a` was published at
`2026-10-27T09:19:53.240Z`. Live HTML, JS and CSS returned HTTP 200 with matching
SHA-256 hashes; the new bundle is `/assets/index-EGhK80DS.js`. The published
sign-in screen rendered with zero runtime errors, and the Telegram controls still
returned HTTP 200. No production financial records were written.
