# ABA PayWay and KHQR assets

Place only the official, unmodified assets exported from ABA's merchant
integration Figma guideline in this directory.

The connected Figma account currently has view-only access to ABA's file. The
Figma connector requires edit access for inspection and export, so no unofficial
or recreated ABA artwork has been added.

Source guideline:

- `https://www.figma.com/design/xS8d19OkA9jMh4gGsxUZPe/`

Before adding an asset:

1. Ask the file owner to grant the connected Figma account edit access.
2. Export the exact production asset from the guideline.
3. Preserve its aspect ratio, clear space, color, and filename where possible.
4. Record the exported filename and Figma node ID in this file.
5. Do not place merchant credentials, QR payloads, or customer information here.

The checkout renders PayWay's returned `qrString` as a crisp native QR and keeps
the returned `qrImage` as a compatibility fallback. Its surrounding receipt
uses text only and does not recreate ABA or PayWay brand marks. Add logos only
when exact approved files can be exported from ABA's guideline.
