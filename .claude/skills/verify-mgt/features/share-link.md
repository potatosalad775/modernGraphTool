# Share link

A visitor copies a link that reopens the page with the same devices, targets and display state.

## Sub-features

- `share-make` builds the link for the current selection.
- `share-open` restores the selection when the link is opened as a new visit.
- `share-state` carries the EQ, baseline, Y offsets and Y scale in a `state=` parameter.
- `share-address` keeps the address bar in step with the selection (`URL.AUTO_UPDATE_URL`).

## How to get to it (user POV)

- Press `Share` in the graph toolbar. The link is copied to the clipboard.
- Copy the address bar, which updates as the selection changes.
- Open a link someone posted: `/?share=<names>` with an optional `&state=<...>`.

## Driving it with mgt.mjs

Preconditions:

- Baseline state, then `GZR HT5` added from the `DEVICES` panel.

Run `node .claude/skills/verify-mgt/mgt.mjs run .claude/skills/verify-mgt/journeys/share-link.mjs`.

- **Make.** `toolbar()`, then `page.getByRole('button', { name: 'Share' }).click()`. A `dialog "Share link"` opens
  with a `textbox "Share link"` whose value starts with `<origin>/?share=`.
- **Open.** `boot(link.slice(origin.length))`. The page title contains `GZR HT5` and an
  `svg text` containing `GZR HT5` is on the graph.
- **Proof.** `shot('link')` with the dialog open, `shot('restored')` after the second boot.

## Gotchas

- The dialog appears because a headless browser refuses the clipboard. In a browser that allows
  it, the button shows a copied state and no dialog. The journey relies on the refusal.
- `boot()` on the same page is a full navigation, which is what opening a link is. Do not test
  restore by reading the address bar of the first page.
- Device names with `+`, `&` or non-ASCII characters are the historical source of bugs here.
  `untrusted-input.property.spec.ts` covers the codec; this journey covers the page around it.
- A language switch in `MISC` reloads the page and restores from `sessionStorage`, not from the
  link. That is a separate path with no journey yet.
