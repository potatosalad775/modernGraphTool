# Graph Engine

D3.js lives in `GraphEngine.svelte.ts` with overlays:

- `GraphHandle.ts` — drag/zoom interaction
- `GraphInspection.ts` — hover inspection overlay
- `GraphEqOverlay.ts` — EQ curve rendering
- `GraphSpectrumOverlay.ts` — live audio spectrum

Initialize in `GraphContainer.svelte`'s `onMount` via `graphEngine.init(svgEl)` using
`bind:this={svgEl}`. **Never** `d3.select('#fr-graph')` — always pass the bound SVG element.

Viewbox 800×450. X: log 20–20000 Hz. Y: linear dB, configurable scale. React to store changes with
`$effect(() => frStore.size)` (SvelteMap is reactive).

No Tailwind inside SVG — the graph reads CSS vars from `defaults/theme.css`
(`--color-graph-bg`, `-grid-major`, `-grid-minor`, `-axis-label`, `-grid-text`, `-baseline`,
`-watermark-opacity`).

## Baseline

`graphStore.baselineMode` cycles `off` → `withoutAdjustment` → `withAdjustment` → `off` on
customizable targets, and simple `off` ↔ `withoutAdjustment` on phones / targets without cached
originals.

- `withoutAdjustment` — baseline = original pre-adjustment channels from
  `graphStore.targetOriginalData`. Slider changes on the baseline target appear as a delta **on the
  target line**; other curves stay stable.
- `withAdjustment` — baseline = current (adjusted) channels from `frStore`. The target line snaps
  flat; other curves shift with adjustments.
- Single source of truth: `baseline.ts` `resolveBaselineChannelData(uuid, mode)`. Both
  `GraphEngine.refreshBaselineData` and `PreferenceBound` go through it — **do not branch on
  `baselineMode` elsewhere**.
- `renormalizeAll` and `reSmoothAll` keep `targetOriginalData` aligned with `frStore.channels` so
  `withoutAdjustment` baselines stay at the same reference as the rest of the curves.

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
