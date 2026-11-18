# Panels and tours

A visitor switches between the four control panels, and on a first visit is walked through the
page by a tour.

## Sub-features

- `panel-switch` opens `DEVICES`, `GRAPH`, `EQUALIZER` or `MISC`.
- `panel-keys` switches panel with the keys `1` to `4`.
- `tour-welcome` opens on a first visit and can be skipped or stepped through.
- `tour-equalizer` opens the first time the `EQUALIZER` panel is shown.

## How to get to it (user POV)

- Press a button in `navigation "Panels"`.
- Press `1`, `2`, `3` or `4` while focus is not in a field.
- Open the page with empty site data to get the welcome tour.
- Press `Show equalizer tour` in the `EQUALIZER` panel to replay that tour.

## Driving it with mgt.mjs

Preconditions:

- Baseline state for panel switching. `boot('/', { firstVisit: true })` for the tours.

No journey ships for this feature yet. The handles are:

- **Switch.** `panel('MISC')` clicks the nav button and waits for `heading "MISC"` at level 2.
- **Keys.** `page.keyboard.press('3')`, then wait for `heading "EQUALIZER"`.
- **Welcome tour.** After a first-visit boot, a `dialog "Welcome to modernGraphTool"` is open with
  `button "Skip"`, `button "Next"` and `button "Go to step 1"` to `"Go to step 6"`.
- **Equalizer tour.** After `panel('EQUALIZER')` on a first visit, a `dialog "Equalizer"` is open
  with five steps and `button "Skip"`.
- **Proof.** A screenshot of each tour step, and one after `Skip` with no dialog left.

## Gotchas

- A tour dialog covers the page. Every other journey depends on `boot()` dismissing both tours,
  which it does by setting `gt-tutorial-dismissed` and `gt-tutorial-eq-dismissed` in
  `localStorage` before the app loads.
- A panel unmounts when another opens. State that must survive the switch lives in a store, so a
  good check sets something in one panel, switches away and back, and reads it again.
- A deployment can switch the tour off in `config.js`. The shipped config leaves it on.
