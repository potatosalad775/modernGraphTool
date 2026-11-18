# modernGraphTool verification map

What a visitor can do in the app, and how to prove each thing works. Read this index, then the
feature file for what you changed. The product-level description of each feature is in
`docs/src/content/docs/features/`; this map only says how to reach and drive it.

## Baseline

- The app is the Vite dev server that `mgt.mjs` starts, serving `defaults/config.js` and
  `defaults/data/`.
- It opens on the GRAPH panel with `Demo Variations var2` (L and R) and the
  `KEMAR DF (KB006x) Target`: three curves, page title
  `modernGraphTool - Demo Variations var2, KEMAR DF (KB006x) Target`.
- The visitor is a returning one: no tour opens. Viewport 1280x800, locale `en-US`.
- The shipped phone book includes `GZR HT5`, which the journeys use as a second device.

## Vocabulary

The page has three landmarks. Scope a locator to one of them, because a device name appears in
more than one.

- **Top bar**: `navigation "Top bar"`, with the site title and links.
- **Controls**: `region "Controls"`. Its `navigation "Panels"` has four buttons, `DEVICES`,
  `GRAPH`, `EQUALIZER` and `MISC`, and the open panel is the level-2 heading below it.
- **Graph**: `region "Frequency response graph"`: the graph image and the toolbar under it
  (`Normalization`, `Smoothing`, `Y-Axis Scale`, `Inspect`, `Freq. Guide`, `Average`,
  `Screenshot`, `Share`).

Below 1000px wide the panels are a carousel under the graph, and the graph toolbar moves into
the `GRAPH` panel as a collapsed `Graph Controls` section. Call `toolbar()` before pressing
`Share` or any other toolbar button: it opens that section when needed. Names stay the same.

## Conventions

- Find elements by role and accessible name. Use a CSS class only for the graph's SVG, which has
  no roles: `.fr-graph-phone-curve`, `.fr-graph-target-curve`, `.fr-graph-eq-curve`, and
  `svg text` for a curve's label.
- A number field commits on change. Fill it, then blur it.
- Every feature file has the same four sections: Sub-features, How to get to it (user POV),
  Driving it with mgt.mjs, Gotchas.
- A precondition the seed data lacks is a failure with its reason under Gotchas. Never weaken a
  journey to make it pass.

## Features

- [Select a device](./select-device.md): search, add to the graph, remove. Journey included.
- [Share link](./share-link.md): make a link, open it, get the same selection. Journey included.
- [Equalizer](./equalizer.md): add and edit a band, preamp, undo. Journey included.
- [Panels and tours](./panels-and-tours.md): switching panels, the first-visit tours. No journey
  yet.

Not mapped yet: target selection and Target Customizer, graph toolbar controls, upload, AutoEQ,
audio player, Hardware EQ and uniPEQ Link (they need a device), cross-site search, site selector.
