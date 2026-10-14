---
title: Preference Bound
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

The Preference Bound draws a shaded band on the graph showing the range of frequency responses most listeners prefer, based on listening-preference research. It answers "how far from the middle of the road is this tuning" rather than "does it match one exact line".

Visitors pick it from the **Pref. Bound** row at the bottom of the target list. The row is single-select: clicking a bound shows it, clicking the active one again hides the band. For how to read it, see [Targets and preferences](../guide-for-users/targets-and-preferences.mdx#preference-bound).

## How the band is aligned

The band follows the graph's alignment setting (Hz or Avg), smoothing and baseline, like every other curve. It is aligned by its **center** — the midpoint of the upper and lower bounds — not by the diffuse field target it is defined against. This matters because the DF target does not sit inside the band everywhere: in the bass, the preferred range lies several dB above it.

Aligning the band the way you align a measurement means a headphone in the middle of the preference range lands in the middle of the band, whichever frequency you align at. At the default 500 Hz alignment the band's center and the DF target nearly coincide, so the band looks the same as it would if it were anchored to the DF.

If you display the base DF target and align at a low frequency such as 50 Hz, the band will not sit where the DF-relative bound values would put it — the band keeps its alignment to the curves you're comparing, not to the DF.

:::tip
The band is widest in the bass (about 6 dB at 50 Hz versus 2 dB at 500 Hz). Aligning in the midrange gives the most reliable read of whether a measurement falls inside the preference range.
:::

## Setting it up

The row only appears once the operator has shipped the data and configured it under [`PREFERENCE_BOUND`](../guide-for-admins/customize-page.mdx#preference_bound).

It needs three files:

- **`Bounds U.txt`** and **`Bounds D.txt`** — the upper and lower bounds, as offsets in dB from the base target. They sit directly in `data/`, alongside `phones/` and `target/`:

  ```
  20.0	2.5
  25.0	2.8
  31.5	3.1
  ...
  ```

- **The base diffuse field target**, named by a `BOUND_LIST` entry's `target` without its `.txt` extension. It is read from your regular target folder (`PATH.TARGET_MEASUREMENT`, `./data/target/` by default), so don't copy it anywhere else. `"KEMAR DF (KB006x)"` loads `./data/target/KEMAR DF (KB006x) Target.txt` — the ` Target` suffix is added when missing, as in `TARGET_MANIFEST`.

```javascript
PREFERENCE_BOUND: {
  BOUND_LIST: [{ target: "KEMAR DF (KB006x)" }],
},
```

## Offering more than one bound

`BOUND_LIST` can hold several entries, and each becomes a chip in the row. Use it when your database spans more than one measurement rig — each rig's measurements need a base target of their own — or to let visitors compare different bound files against the same target.

```javascript
PREFERENCE_BOUND: {
  ENABLE_BOUND_ON_INITIAL_LOAD: true, // selects the first entry
  BOUND_LIST: [
    { target: "KEMAR DF (KB006x)" },
    { target: "5128 DF", upper: "Bounds U 5128.txt", lower: "Bounds D 5128.txt" },
    { name: "KEMAR (wide)", target: "KEMAR DF (KB006x)", upper: "Bounds U wide.txt", lower: "Bounds D wide.txt" },
  ],
},
```

- `target` — the base target, as above. Required.
- `name` — the chip label. Defaults to the target name without ` Target`. Names must be unique; a repeated one is skipped. Supports the same `{ default, i18n }` form as other operator strings.
- `upper` / `lower` — the bound files, relative to `data/`. Default to `Bounds U.txt` and `Bounds D.txt`.

With two or more entries, the graph names the active bound in its top-left corner, one line below the baseline label, so a screenshot shows which bound it was taken with.

:::caution
The bound files are offsets from the base they were derived against. Pairing a set of bounds with an unrelated target — a Harman curve instead of a diffuse field target, say — draws a band the research behind those bounds doesn't support. Keep each entry's target the one its bounds were made for.
:::

:::note[Upgrading]
`BASE_DF_TARGET_FILE` from earlier configs still works: when `BOUND_LIST` is absent, it becomes a single entry with the default bound files.
:::