# Graph Engine

D3.js lives in `GraphEngine.svelte.ts` with overlays:

- `GraphHandle.ts` — drag/zoom interaction
- `GraphInspection.ts` — hover inspection overlay
- `GraphEqOverlay.ts` — EQ curve rendering
- `GraphSpectrumOverlay.ts` — live audio spectrum
- `GraphCompareOverlay.ts` — History & Compare A/B ghost trace
- `baseline.ts` — the baseline state machine, data and compensation (below)
- `curve-traces.ts` — what a curve item draws (below); `curve-label.ts` names it

Initialize in `GraphContainer.svelte`'s `onMount` via `graphEngine.init(svgEl)` using
`bind:this={svgEl}`. **Never** `d3.select('#fr-graph')` — always pass the bound SVG element.

Viewbox 800×450. X: log 20–20000 Hz. Y: linear dB, configurable scale. React to store changes with
`$effect(() => frStore.size)` (SvelteMap is reactive).

No Tailwind inside SVG — the graph reads CSS vars from `defaults/theme.css`
(`--color-graph-bg`, `-grid-major`, `-grid-minor`, `-axis-label`, `-grid-text`, `-baseline`,
`-watermark-opacity`).

## Curves are drawn from stored data

`frStore` channels and sample runs are stored **already smoothed** at `graphStore.smoothValue`:
`DataProcessor` smooths on the way in, and `reSmoothAll` rebuilds from `_rawData` when the value
changes. `GraphEngine` and `GraphEqOverlay` bind them as-is. Don't reintroduce a draw-time
`FRSmoother.smooth` — smoothing is not idempotent, so it would blur every curve a second time on
every redraw (`utils/AGENTS.md`). Preference bounds are the exception: they are parsed raw files, and
`preference-bound-store` smooths them itself.

## Baseline

The **baseline** is the curve item every trace is drawn relative to. `baseline.ts` owns all of it;
`graphStore.baselineUUID` / `baselineMode` (`off` → `withoutAdjustment` → `withAdjustment`) are the
only state, and **the module is their only writer** — `baseline.cycle(uuid)` (the click) and
`baseline.restoreFromURL(saved)` (`?state=`). Nothing else assigns them, and there is no copy in the
engine: the data to subtract is derived on demand from those fields, `frStore` and
`targetOriginalData` (`baseline.channelData`), so it can't be stale and a baseline restored before
the graph mounts compensates the curves like any other.

- **Click cycle.** A phone, or a target with no cached original: off ↔ `withoutAdjustment` (so phones
  never reach `withAdjustment`). A customizable target (`targetOriginalData` has it): off →
  `withoutAdjustment` → `withAdjustment` → off. Clicking another item always starts it at
  `withoutAdjustment`, replacing the baseline.
- `withoutAdjustment` — baseline = original pre-adjustment channels from
  `graphStore.targetOriginalData`. Slider changes on the baseline target appear as a delta **on the
  target line**; other curves stay stable.
- `withAdjustment` — baseline = current (adjusted) channels from `frStore`. The target line snaps
  flat; other curves shift with adjustments.
- **Read the _effective_ baseline, never the raw store fields.** `baseline.uuid` / `mode` /
  `channelData` / `modeFor(uuid)` are `off`/null while the baseline item is absent from `frStore`.
  Removing the item doesn't clear the selection: it goes **dormant** (no compensation, no label, not in
  the URL, no list state) and the store fields stay, so undoing the removal — which restores the same
  uuid (`RemoveFRDataCommand`) — brings it back. A hidden item is still the baseline.
- **Which channel.** `resolveBaselineChannelData(uuid, mode)` is the single resolver — **don't branch on
  the mode elsewhere**. `phone` and `inserted-phone` use the channel they show (AVG when both L and R
  are shown); targets, `eq` and `inserted-eq` use AVG.
- **One compensation function.** `compensateAt(value, freq, baselineData)` — linear interpolation, end
  values held, uncompensated when empty — is used by the engine paths and envelope, the hover readout and
  the EQ, compare and preference-bound overlays. Don't write another interpolate-and-subtract. The engine
  reads the baseline untracked (some callers run inside effects); the EQ overlay and Inspection read the
  module directly, the compare and preference-bound overlays take `baseline.channelData` pushed by
  `GraphContainer`.
- **Redraws are `GraphContainer`'s.** One effect watches the effective baseline: a different
  selection (click, restore, dormant/back) animates the paths (`updateBaseline(true)`); the same
  baseline with different data (re-smooth, re-normalize, target adjustment, `targetOriginalData` edit)
  calls `refreshEveryFRCurves`, which the rAF coalesces with the `frStore` effect's own request. The
  EQ-nodes, compare and preference-bound effects read `baseline.channelData`, so they follow too. A
  caller changing the baseline needs to call nothing.
- `renormalizeAll` and `reSmoothAll` keep `targetOriginalData` aligned with `frStore.channels` so
  `withoutAdjustment` baselines stay at the same reference as the rest of the curves.

## `curve-traces.ts` — what an item draws

`curveTraces(obj, eqSource)` is the single answer to "which traces does this item put on screen?"
(a fill, runs, main channels — plain data, no stores or d3). **The engine, the labels
(`curve-label-rows.ts`) and the hover readout all consume it; don't re-derive a rule in a reader.**
Callers keep `hidden`, sort order and everything presentational: opacity, thickness, dash, `yOffset`,
baseline compensation. `listedTraces` is the order rows read in (main, then runs).

- Targets (`isTargetType`, so uploads too): one AVG trace, whatever `dispChannel` says. Everything
  else follows the phone rule; a `dispChannel` entry with no data is skipped.
- `eqSource` is `{ sample }` while the item is the enabled EQ source (`eqSourceContextFor` builds it
  from `eqStore`), else `null`.
- Run colours are `colors.samples[key] || colors.AVG`, in the legend and hover too.

## The EQ source ghost

While EQ is on, the source's fill and main traces are `ghost` and the engine dims them to 0.35 as
the "before" curve. With a sample run as the source (`eqStore.sourceSample`) the ghost is that run,
drawn in place of the average and even with the average toggled off — the EQ curve is the run plus
the bands, so ghosting the average would compare it against a curve it was never built from. Labels
and hover list it too, named by the run (`Phone (Center, AVG)`), not as the average.

## `GraphEqOverlay` and the channel scope

Band nodes follow `eqStore.channelScope`. Scoped to one ear the overlay draws that ear's **effective**
set — shared bands included, since they bend that curve too and hiding them would leave visible bumps
with no handle. Shared bands render hollow there because dragging one moves both ears, and that has
to be legible before the drag. `_pickChannelData` returns the scoped channel so nodes sit on the
curve they edit; positioning them on AVG floats them off it as soon as L and R diverge.

The d3 join key stays the band's index in the flat `eqStore.filters` array — narrowing the view must
never renumber it, or a drag in the R bucket edits an L band.

## The A/B ghost (`GraphCompareOverlay`)

While A and B are both picked and the live filters equal one of them (`compareGhostSide`), the other
side is drawn as a dashed trace. `GraphContainer` builds its curves with
`dataProvider.eqChannelsFor` — the same `#eqModifiedChannels` / `#processEqChannels` path as the
live EQ curve, so the two can't drift — in the channels the EQ curve shows, and pushes them in with
the EQ curve's `yOffset` and `baseline.channelData`. Nothing goes into `frStore`:
the ghost has no list row, no undo and no color of its own. Its stroke is `--color-graph-compare`,
falling back to `--color-graph-axis-label` for operator themes written before the token existed.
`repositionCurves` re-renders it with the other overlays. Its label is English, like every graph
label. "Add to graph" is the persistent counterpart: `dataProvider.insertEqCurve` inserts the same
curve as an `inserted-phone`.

## Testing this layer

`GraphEngine` is driven through a real `<svg>` attached to the document and `init(svgEl)`; the
overlays take a minimal fake engine exposing only what they read (see
`GraphPreferenceBoundOverlay.svelte.spec.ts` and `GraphEqOverlay.svelte.spec.ts`).

- **d3 rounds path coordinates to 3 decimals** — assert on parsed numbers with `toBeCloseTo`, never
  on a formatted substring of `d`.
- **d3-drag v3 binds `mousedown`, not pointer events**, and registers its move/up listeners on
  `event.view`. A synthetic `PointerEvent`, or a `MouseEvent` built without `view: window`, starts a
  drag that can never move or end — and the test then reads an unchanged store rather than failing
  outright, which looks like the component is fine. See the `drag()` helper in
  `GraphSoundRangeOverlay.svelte.spec.ts`.
- **rAF loops need `requestAnimationFrame` stubbed** so frames can be stepped deliberately. With a
  real rAF, "did `stop()` actually stop it?" is untestable — and a loop that outlives the player is
  the failure that matters. See `GraphSpectrumOverlay.svelte.spec.ts`.
