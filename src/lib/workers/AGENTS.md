# src/lib/workers/ — AutoEQ off the main thread

Four files, over the [`@potatosalad775/turboeq`](https://github.com/potatosalad775/turboEQ) npm
package:

| File                | What it is                                                                      |
| ------------------- | ------------------------------------------------------------------------------- |
| `autoeq-client.ts`  | `runAutoEQInWorker(source, target, request)` — the only entry point callers use |
| `autoeq.worker.ts`  | Message shim. `run-autoeq` in, `autoeq-result` / `autoeq-error` out             |
| `autoeq-request.ts` | The request vocabulary, `FitMode` and `planBands`. No engine behind it          |
| `autoeq-engine.ts`  | turboEQ (wasm) with `utils/equalizer.ts` as the fallback                        |

## Two optimizers, and why the wasm one is first

`utils/equalizer.ts` is the CrinGraph lineage: greedy coordinate descent, one filter at a time on a
quantized frequency grid, no perceptual stage. turboEQ is a Zig port of the original AutoEq —
gradient-based joint optimization of every parameter at once, behind a perceptual stage that
smooths, protects narrow dips, limits slope to 18 dB/oct and caps positive gain at 6 dB.

turboEQ is two orders of magnitude faster and fits closer from eight bands up; the TypeScript engine
still wins at five on IEMs (see "Benchmarks" and "Open items" below). turboEQ also returns the band
count it was asked for — the TypeScript one drops bands in its prune pass, so "ask 8, get 7" is normal there and
impossible in turboEQ. **That exact count is the cheapest proof in a browser test that the wasm
actually loaded**, which is what `autoeq-client.svelte.spec.ts` leans on.

**The fallback fires on any failure, not just a missing module.** The TypeScript engine tolerates
input turboEQ rejects outright — a null source curve optimizes against silence rather than
throwing — and callers depend on that. A reply carries `engine`, and `EqAutoEq` shows a one-line
notice when it says `'typescript'`, so a worse fit never arrives unannounced. It also switches
auto-apply off (`services/autoeq-service.svelte.ts`) — ~1.7 s per run can't chase a tilt slider.

**A fallback says why: `fallback: 'unavailable' | 'rejected'`.** Load failure versus turboEQ
refusing this request. Only `'unavailable'` hides the fit-mode control — the TypeScript engine
ignores `fit` and always fits the way exact match does. **Don't hide it on any fallback:**
treble-safe with an fc window above 10 kHz is `'rejected'`, and switching to exact match is the
user's way out; hiding the control that caused the fallback strands them.

**The fallback does not fit graphic EQs.** It places bands freely, so its answer would sit off the
sliders — which is why AutoEQ was unavailable in graphic mode before turboEQ. A graphic request that
turboEQ fails comes back `engine: 'none'` with empty `filters`, and the service must not write them:
that empty list would wipe the EQ.

## The three things that used to be wrong here

- **Band count.** mGT counts rows, shelves included; turboEQ counts peaking bands with the shelves
  outside that number. `planBands` is the one place the subtraction happens. Getting it wrong is
  silent — the result is still a plausible EQ, just not the size that was asked for.
- **Ranges are bounds, not a clamp.** The user's frequency, Q and gain windows are handed over as
  per-band bounds, so the fit lands inside them. Clamping the answer afterwards
  (`eq-constraint-clamp.ts`) is for hand-edited filters; against an AutoEQ result it is a no-op,
  which is the point.
- **A graphic EQ is a pinned bank.** fc and Q come from the preset's own bands and only gain is
  optimized, so nothing has to be snapped onto the grid afterwards — snapping moves every filter
  off the frequency it was optimized at. AutoEQ is therefore available in graphic mode, which it
  used to refuse.

## Exact match is the default fit

turboEQ fits AutoEq's objective by default, and AutoEq is cautious in the treble: it smooths over two
octaves above ~8 kHz, limits the correction to 18 dB/oct, scores only the mean level above 10 kHz,
keeps every band below 10 kHz and caps the correction's largest boost at 6 dB. Its objective also
penalizes peaking bands steeper than ~18 dB/oct and smooths the target a fifth of an octave after
the slope limit. That is right for a rig nobody trusts up there and wrong for a user lining the
EQ'd curve up against the target on the graph — which is what mGT is, and what the
CrinGraph-lineage engine always did.

`fit: 'exact'` (the default; `settingsStore.autoEqOptions.exactMatch`) is passed straight to turboEQ,
whose `EXACT_MATCH_OPTIONS` turn all of that off: `lossFlattenF: Infinity`, `trebleWindowSize: 1/12`,
`maxSlope: Infinity`, `sharpnessPenalty: false`, `equalizationWindowSize: 0`. The user's fc window
is taken as given, so a band can reach 20 kHz. **Don't spell the list out here again** — turboEQ
owns it, and a copy drifts.

On headphones the penalty and the fifth-octave smoothing were what kept exact match out of the
treble: on six of nine curves it placed no band above 10 kHz, and 8-band error went from 1.94 to
1.26 dB with both gone. On IEMs they cost almost nothing either way.

A free level — scoring the residual after removing its mean, since the preamp absorbs a constant —
was tried in turboEQ and removed. The two shelves together can then lift the whole curve at no cost,
so the fit drifted past the user's boost ceiling (5.4 dB against a 3 dB cap) for a 0.02 dB gain.

**The boost cap is the user's gain ceiling in both modes** (`maxGain` in `runOptions`). Otherwise
the gain range's maximum is a number the fit silently ignores past 6 dB. It is also what closes the
gap to the TypeScript engine, whose only boost limit was that ceiling: on the bundled sample set,
scored against the raw target from 20 Hz to 20 kHz, exact mode under AutoEq's 6 dB cap still
trailed it; with the cap at the user's 12 dB it beat it on seven of eight (e.g. 2.69 → 1.81 dB,
2.02 → 1.51 dB). The headroom this costs is `EqFilterList`'s business — it derives the preamp from
whatever filters are in the store — so nothing here touches the preamp, and the reply's `preamp`
is diagnostic only.

**Q and gain are the user's, as given, in both modes** (`bounds: 'as-given'`). turboEQ's helpers
narrow a host's range to AutoEq's defaults otherwise, which turned the UI's Q 0.1–10 into 0.18–6 and
±40 dB into ±20 without a word.

**The shelves are free in both modes** (`shelfPlacement: 'free'`): fc in the bands' window, Q inside
AutoEq's shelf window 0.4–0.7 narrowed by the user's (`shelfWindow`). Pinned at 105 Hz and 10 kHz,
as every AutoEq preset has them, they are two fixed bands out of every budget — 40% of five.

`fit: 'autoeq'` is otherwise the faithful path. It must keep bands at or below 10 kHz: with the
mean-only loss, bands up there cancel each other at extreme gains (turboEQ's exact-match guide has
a +20 dB example). `buildBanks` caps its fc window there by hand, so a user fc window entirely above
10 kHz throws and lands on the fallback.

The frequency window is _where a band may sit_, which is not the same as the band the error is
scored over. turboEQ separates them (`limits` versus `loss`); the old engine conflated them. Only
`limits` is wired to the UI — a narrow window should leave the treble unequalized, not unscored.

## Loading the package

The package ships two bit-identical wasm builds, `turboeq-simd.wasm` and a scalar `turboeq.wasm` for
engines without SIMD. `loadTurboEq` calls `TurboEQ.load()`, which picks one and resolves it with
`new URL(..., import.meta.url)`. Vite emits both from that pattern and rewrites the path when it
pre-bundles the dependency in dev, so nothing here names a wasm URL. The URL is relative to the
worker chunk, which is what keeps the CDN build fetching it from jsDelivr.

**Import only types from the package outside the worker.** Any value import — even `MAX_FILTERS` —
drags `TurboEQ.load()`'s `new URL(...)` into the main build, and Vite emits both wasm files as
orphans before tree-shaking removes the code that would fetch them. That is why `MAX_BANDS` is a
literal `32`, held to `MAX_FILTERS` by `autoeq-engine.spec.ts`. `find dist -name '*.wasm'` should
print exactly two files, both under `_app/immutable/workers/assets/`.

`NOTICE-turboeq.txt` sits beside them, emitted by the `turboeq-notice` plugin in `vite.config.ts`.
The wasm is ported from AutoEq (MIT) and SciPy (BSD-3-Clause), and both licences require their
notices to travel with the binary. Keep it next to the wasm, not at the dist root, so the CDN build
carries it too.

Under Node, `load()` reads the wasm from disk, so the node project runs the real engine:
`autoeq-engine.spec.ts` covers the mapping, and `autoeq.worker.spec.ts` stubs the package out to
pin the fallback. `autoeq-client.svelte.spec.ts` proves the browser path. Bumping the package: the `.js` and the wasm are one contract checked at instantiation, and the
npm package ships them together, so there is nothing to keep in step by hand. A failed ABI check
lands as a fallback, so run the client spec after a bump.

## Benchmarks

`scripts/bench-autoeq/` compares the algorithms — CrinGraph's, this fallback, turboEQ in both fit
modes, and upstream AutoEq in Python — over a squig.link database, **all under one constraint set**
(`--q`, `--gain`, `--fc`; Q 0.1–10 and ±20 dB by default). It is not a comparison of each tool's
shipped defaults. The results and the method are in
[autoeq-benchmarks.mdx](../../../docs/src/content/docs/features/autoeq-benchmarks.mdx); re-run it
after anything that could move a fit, and update that page with the numbers.

The turboEQ rows go through `runAutoEq`, so they measure exactly what the panel runs. That only
holds while `buildBanks` passes the user's ranges through; if it ever narrows one again, the
constraint under test narrows with it, silently.

It imports the shipped modules, not copies: Node strips the types and `ts-hooks.mjs` resolves
`$lib/`. **That only works while `autoeq-engine.ts`, `utils/data-processor.ts` and what they import stay
free of `$app/` and Svelte runes** — `utils/config.ts` is the one import that would break it, which is why the
harness averages channels itself instead of going through `fr-parser`.

Two defects of the TypeScript engine worth knowing while it remains the fallback:

- **It ignores its band budget.** Over 176 real IEMs at the app's default ranges it returned the
  count asked for 33% of the time at eight bands and 22% at ten. Both its candidate search and its prune pass drop bands.
- **It is non-monotonic in band count.** With shelves off, 10 bands scored worse than 8 (1.203 vs
  1.170 RMSE).

Its output is not broken, only less efficient per band. An earlier measurement suggesting otherwise
ignored its internal 1 kHz target alignment.

**Alignment differs between the two.** The TypeScript engine pins source to target at 1 kHz;
turboEQ uses AutoEq's `min_mean_error`, shifting to minimize mean error over 100 Hz to 10 kHz. A
unit with a wiggle at 1 kHz gets a different level from each.

## Open items

- **At five bands the TypeScript engine still fits IEMs closer** (1.16 against 1.27 dB, level
  removed), and nearly all of it is level: held to AutoEq's alignment it scores 1.74, while
  turboEQ, which fits at a fixed level, stays at 1.27. What is left is turboEQ settling in a local
  minimum from AutoEq's `init()` layout: its own objective rates the TypeScript answer better on
  48 of 176 curves at five bands, 16 at eight, one at ten. Multiple starts, or a greedy seed,
  belong in turboEQ.

- **`EqConstraintPreset` is still hand-written.** The fit no longer depends on it — `planBands`
  owns the only conversion — and it is being replaced anyway.
- **Graphic EQ gain is still intersected with AutoEq's ±20 dB.** Parametric fits take the user's
  gain as given; the graphic path was left alone.
- **"Unlimited bands" caps at 32**, turboEQ's `MAX_FILTERS`.
- **mGT pre-smooths to 1/48 octave**, so turboEQ's own curve preparation partly repeats work. If
  that ever matters, ask turboEQ for an opt-in fast path; it will not become the default.
