---
title: AutoEQ Benchmarks
description: How turboEQ compares with the CrinGraph optimizer, the older
  TypeScript one and upstream AutoEq, under the same constraints and on real
  measurements.
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool's AutoEQ runs [turboEQ](https://github.com/potatosalad775/turboEQ), a WebAssembly
port of [AutoEq](https://github.com/jaakkopasanen/AutoEq)'s optimizer. This page compares it, as
an algorithm, with the optimizers it replaces and with the one it was ported from. Every engine
fits the same 176 real IEM measurements under the same constraints.

## Summary

- **It is two orders of magnitude faster.** With eight bands, turboEQ's median run is 6.2 ms.
  CrinGraph's optimizer takes 807 ms and modernGraphTool's old TypeScript one 1.41 s.
- **It returns the number of bands you ask for, every time.** Asked for eight, CrinGraph returned
  eight for 87% of the measurements and the old optimizer for 22%.
- **Exact match fits closest from eight bands up.** At ten bands, its median error across
  20 Hz–20 kHz is 0.48 dB, against 0.74 for the old optimizer and 1.24 for CrinGraph. At eight
  it leads by less (0.77 against 0.82), and its bad cases are less bad (1.59 against 1.90 at the
  90th percentile). On headphones it leads at every band count.
- **With five bands on IEMs, the old optimizer scores better, mostly on level.** It reaches
  1.16 dB against exact match's 1.27. [Where turboEQ loses](#where-turboeq-loses) explains why.
- **Treble-safe stays close to AutoEq.** Given the same constraints, its EQ lands 0.17 dB (median)
  from AutoEq's when both run to convergence. For comparison, AutoEq's own early stopping moves
  AutoEq's answer by 0.07 dB.

## The constraints

Every engine got the same limits on each band:

| Limit                | Value         |
| -------------------- | ------------- |
| Q                    | 0.1–10        |
| Gain                 | −20 to +20 dB |
| Where a band may sit | 20 Hz–20 kHz  |
| Largest total boost  | 20 dB         |

Some differences between the engines are part of the method and stay:

- **CrinGraph has no shelf filters**, so all of its bands are peaking. The others use a low and a
  high shelf once there are four bands or more, and place them themselves. turboEQ and AutoEq keep
  shelf Q between 0.4 and 0.7.
- **Treble-safe places no band above 10 kHz**, because above that it scores only the overall
  level, not the shape.
- **The limit on total boost** only means something to the AutoEq family, which caps the whole
  EQ. CrinGraph and the TypeScript optimizer limit each band on its own.

Band counts below are totals, shelves included. Ten bands is the layout of AutoEq's
`8_PEAKING_WITH_SHELVES` preset.

## Speed

Median time for one fit, in milliseconds. The last column is the 90th percentile at ten bands.

| Engine                | 5 bands | 8 bands | 10 bands | 10 bands, p90 |
| --------------------- | ------: | ------: | -------: | ------------: |
| CrinGraph             |     482 |     807 |      993 |         1,080 |
| mGT TypeScript        |     598 |   1,410 |    2,100 |         2,440 |
| turboEQ · Exact match |     1.8 |     6.2 |       12 |            24 |
| turboEQ · Treble-safe |     2.1 |     8.2 |       19 |            39 |
| AutoEq (Python)       |      30 |      74 |      124 |           180 |

At eight bands, turboEQ is about 130× faster than CrinGraph and 230× faster than the old optimizer.
On the same work as AutoEq itself, the curve processing plus the fit, treble-safe is about 9×
faster than the Python original.

CrinGraph runs on the page's main thread, so the page freezes for as long as the fit takes.
modernGraphTool runs AutoEQ in a web worker, and the TypeScript fallback runs there too.

## Fit quality

How close the equalized curve lands to the target, as RMS error in dB after removing the overall
level offset. Lower is better. Without any EQ, the median error is 3.03 dB across 20 Hz–20 kHz
and 2.23 dB below 10 kHz.

**Across 20 Hz–20 kHz**, median with the 90th percentile in parentheses:

| Engine                | 5 bands         | 8 bands         | 10 bands        |
| --------------------- | --------------- | --------------- | --------------- |
| CrinGraph             | 2.01 (3.04)     | 1.47 (2.84)     | 1.24 (2.60)     |
| mGT TypeScript        | **1.16** (2.28) | 0.82 (1.90)     | 0.74 (1.85)     |
| turboEQ · Exact match | 1.27 (2.26)     | **0.77** (1.59) | **0.48** (1.13) |
| turboEQ · Treble-safe | 1.72 (2.54)     | 1.63 (2.43)     | 1.63 (2.38)     |
| AutoEq (Python)       | 1.74 (2.52)     | 1.69 (2.47)     | 1.70 (2.45)     |

**Below 10 kHz**, median. This leaves out the region AutoEq deliberately does not shape:

| Engine                | 5 bands  | 8 bands  | 10 bands |
| --------------------- | -------: | -------: | -------: |
| CrinGraph             |     0.81 | **0.37** | **0.27** |
| mGT TypeScript        | **0.67** |     0.49 |     0.44 |
| turboEQ · Exact match |     0.84 |     0.45 | **0.27** |
| turboEQ · Treble-safe |     0.88 |     0.79 |     0.78 |
| AutoEq (Python)       |     0.92 |     0.81 |     0.80 |

**How often the requested band count came back:**

| Engine                          | 5 bands | 8 bands | 10 bands |
| ------------------------------- | ------: | ------: | -------: |
| CrinGraph                       |     94% |     87% |      64% |
| mGT TypeScript                  |     60% |     22% |       6% |
| turboEQ (both modes) and AutoEq |    100% |    100% |     100% |

CrinGraph's search stops once it runs out of candidate peaks and dips. The TypeScript optimizer
also drops bands it judges ineffective, so its numbers above often come from fewer bands than
asked.

Treble-safe scores worse on purpose. It smooths the treble, scores only the level above 10 kHz and
places no band there. That gives up matching the graph in exchange for a correction that holds up
when the treble measurement can't be trusted.

Exact match, like the TypeScript optimizer, will use narrow, deep bands when they fit. Whether
those are an improvement you can hear is a separate question. The error here is measured against
the same measurement the EQ was fitted to, and narrow features in the treble move with fit and
seating, so a band aimed exactly at one may miss it on your head.

## Where turboEQ loses

With five bands on IEMs, the old TypeScript optimizer scores 1.16 dB against exact match's 1.27.
Almost all of that is level. The scores on this page remove the overall level offset, the most
generous way to line two curves up, and the TypeScript optimizer's answers lean on it. Line the
curves up the way AutoEq does instead, by the mean error between 100 Hz and 10 kHz before any EQ,
and it scores 1.74 while exact match stays at 1.27. turboEQ fits at a fixed level, so its score
does not move.

What is left is the optimizer itself. With so few bands, turboEQ sometimes settles in a local
minimum from the layout AutoEq's `init()` starts it in. Its own objective rates the TypeScript
answer better on 48 of the 176 curves at five bands, 16 at eight and one at ten.

## Distance from AutoEq

How different each engine's EQ is from what upstream AutoEq by jaakkopasanen produces for the 
same measurement, under the same constraints: the RMS difference between the two EQ curves 
over 20 Hz–20 kHz, level offset removed. Median, with the 90th percentile in parentheses.

| Engine                     | 8 bands         | 10 bands        |
| -------------------------- | --------------- | --------------- |
| CrinGraph                  | 1.32 (2.13)     | 1.33 (2.13)     |
| mGT TypeScript             | 1.39 (1.97)     | 1.42 (1.96)     |
| turboEQ · Exact match      | 1.39 (2.03)     | 1.57 (2.10)     |
| turboEQ · Treble-safe      | **0.22** (0.52) | **0.24** (0.53) |
| AutoEq, run to convergence | 0.07 (0.24)     | 0.08 (0.21)     |

The last row compares AutoEq with itself, with and without the preset's early stopping (`min_std`).
turboEQ always runs to convergence. Measured against converged AutoEq instead, treble-safe is
0.17 dB away at eight bands and 0.19 at ten. With the shelves pinned where AutoEq's presets put
them, the same comparison gives 0.10: letting the shelves move gives two optimizers more places to
settle apart.

Exact match is as far from AutoEq as the other engines are, and that is intended. It fits a
different target: the curve as the graph shows it.

## Headphones

The headphone set is small: nine curves from two headphones, most of them one headphone in
different EQ modes. Treat it as a consistency check rather than a second result. At eight bands:

| Engine                | Median time | Band count | 20 Hz–20 kHz | Below 10 kHz |
| --------------------- | ----------: | ---------: | -----------: | -----------: |
| CrinGraph             |      947 ms |       100% |         3.22 |         0.87 |
| mGT TypeScript        |      1.48 s |        22% |         1.38 |         0.96 |
| turboEQ · Exact match |      5.8 ms |       100% |     **1.26** |     **0.82** |
| turboEQ · Treble-safe |      6.8 ms |       100% |         1.67 |         0.90 |
| AutoEq (Python)       |       99 ms |       100% |         1.88 |         1.03 |

Exact match leads at five and ten bands too, across the full band (1.60 against 1.81, and 1.14
against 1.31). The treble of these headphones is a row of narrow peaks and notches, which exact
match can now follow: the penalty on steep bands and the extra smoothing AutoEq applies to its
target no longer apply in exact mode.

## Feature comparison

|                        | CrinGraph                                     | mGT TypeScript (fallback)                   | turboEQ in modernGraphTool                              | AutoEq (Python)                              |
| ---------------------- | --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Optimizer              | Greedy candidate search, then grid refinement | CrinGraph lineage, plus shelves and pruning | All parameters at once, with analytic gradients         | All parameters at once, SciPy SLSQP          |
| Filter types           | Peaking                                       | Peaking, low and high shelf                 | Peaking, low and high shelf placed by the fit           | Peaking, shelves (its presets pin them)      |
| Returns the band count | Often fewer                                   | Often fewer                                 | Always                                                  | Always                                       |
| Ranges                 | Clamped after the fit                         | Limit the search                            | Bounds inside the optimizer                             | Bounds inside the optimizer                  |
| Sharp filters          | Allowed                                       | Allowed                                     | Exact match: allowed. Treble-safe: penalized            | Penalized above ~18 dB/octave                |
| Level alignment        | Whatever the graph's normalization gives      | Pinned at 1 kHz                             | Minimum mean error, 100 Hz–10 kHz                       | Minimum mean error, 100 Hz–10 kHz            |
| Treble                 | First pass skips above 7 kHz                  | Fitted like everything else                 | Exact match: full shape. Treble-safe: AutoEq's handling | Smoothed, level only above 10 kHz            |
| Boost limit            | Per band                                      | Per band                                    | Whole EQ, set by the gain range's maximum               | Whole EQ, 6 dB by default                    |
| Graphic EQ presets     | No                                            | No                                          | Yes, gain only on the preset's bands                    | Yes, fixed-band EQ                           |
| Runs                   | Page's main thread                            | Web worker                                  | Web worker, WebAssembly (about 37 KB gzipped)           | Python                                       |

## How this was measured

- **Data.** The measurements of [silicagel.squig.link](https://silicagel.squig.link) database.
  One measurement per device, the first file of each `phone_book.json` entry, left and right 
  averaged: 176 IEM curves. All nine headphone curves were used, because there were so few. 
  Targets were Harman IE 2019v2 for IEMs and Harman 2018 for headphones.
- **Inputs.** Each engine got its curves the way its own app prepares them. CrinGraph: its
  1/48-octave grid and 60-phon loudness normalization. modernGraphTool: 1/48-octave smoothing and
  500 Hz normalization. AutoEq: the raw average, as its command line takes it.
- **Scoring.** Every engine's filters went through the same biquads at 48 kHz, were added to the
  raw measurement, and were compared with the raw target on a 1/48-octave grid.
- **Timing.** The engine call alone, one fit after another, after a warm-up fit. The JavaScript
  engines ran under Node 24.18 on V8, which is the engine Chrome runs. In the app, a run also pays
  a message round trip to the worker. AutoEq ran under Python 3.14.7, NumPy 2.5.3 and SciPy 1.18.1.
- **Versions.** turboEQ 0.2.0, CrinGraph from `squiglink/lab` `main` at `9ff842c`, AutoEq v4.1.2.
- **Machine.** Mac mini, Apple M4, 16 GB, macOS 27.2. Measured 2026-09-25.

Timings don't carry over to other machines. The ratios between rows should.

### Reproducing

The harness lives in
[`scripts/bench-autoeq/`](https://github.com/potatosalad775/modernGraphTool/tree/main/scripts/bench-autoeq).
It needs a checkout of `squiglink/lab`, a checkout of AutoEq, and a measurement folder with a
`phone_book.json`. The constraints default to the ones above and can be changed with `--q`,
`--gain` and `--fc`:

```sh
node scripts/bench-autoeq/run.mjs --data DATA_DIR --target TARGET.txt \
    --lab LAB_REPO --out iem.jsonl
python scripts/bench-autoeq/upstream.py --autoeq AUTOEQ_REPO \
    --curves iem.curves.json --out iem-upstream.jsonl
node scripts/bench-autoeq/score.mjs --curves iem.curves.json iem.jsonl iem-upstream.jsonl
```

`upstream.py` reads the constraints from `iem.curves.json`, so AutoEq runs under the same ones.
It needs NumPy, SciPy, Matplotlib, tabulate and PyYAML, since AutoEq imports all of them.