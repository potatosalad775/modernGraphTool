# Equalizer

A visitor builds a parametric EQ for one device and sees the equalized curve on the graph.

## Sub-features

- `eq-band-add` adds a band and switches the EQ on.
- `eq-band-edit` changes a band's type, frequency, gain and Q.
- `eq-preamp` shows the preamp that keeps the loudest boost from clipping.
- `eq-undo` undoes and redoes an edit.
- `eq-channel` scopes bands to both ears, left or right.
- `eq-import-export` reads and writes Equalizer APO text.

## How to get to it (user POV)

- Open the `EQUALIZER` panel, press `Add band`, type into the band's fields.
- With the `EQUALIZER` panel open, drag a band's handle on the graph.
- Press `Ctrl+Z` and `Ctrl+Shift+Z`, or `Del` on a selected band.

## Driving it with mgt.mjs

Preconditions:

- Baseline state. `Device to EQ` already names `Demo Variations var2`.

Run `node .claude/skills/verify-mgt/mgt.mjs run .claude/skills/verify-mgt/journeys/equalizer-band.mjs`.

- **Add.** `controls.getByRole('button', { name: 'Add band' }).click()`. A field labelled
  `Band 1 gain, dB` appears and `switch "EQUALIZER"` is checked.
- **Edit.** Fill and blur `Band 1 frequency, Hz` with `1000`, `Band 1 Q` with `1` and
  `Band 1 gain, dB` with `6`. The text `Preamp: -6.0 dB` appears, and a
  `.fr-graph-eq-curve` is attached to the graph a frame later: wait for it, do not count it.
- **Undo.** `page.keyboard.press('Control+z')`. The text `Preamp: 0.0 dB` returns.
- **Proof.** `shot('band-added')`, `shot('gain-set')`, `aria('gain-set', controls)`,
  `shot('undone')`.

## Gotchas

- A new band has no frequency. Until frequency, gain and Q are all filled, the band is not
  played and the preamp stays `0.0 dB`.
- The Equalizer panel is loaded lazily. `panel('EQUALIZER')` waits for its heading; the first
  switch after boot takes a moment longer than the others.
- On a first visit the equalizer tour opens over the panel. `boot()` dismisses it in advance.
- AutoEQ runs in a worker with a wasm engine. In the dev server it works, but only
  `npm run test:smoke` proves it against the built output and the security headers.
- Hardware EQ and uniPEQ Link need a real device or the uniPEQ app. They cannot be driven here.
