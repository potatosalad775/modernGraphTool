---
title: Equalizer
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

The Equalizer panel is a parametric EQ that works on loaded measurements: Peaking, Low Shelf and High Shelf bands with automatic preamp, AutoEQ against any target, per-channel bands, an in-browser audio preview, and filter import/export. [Device PEQ](./device-peq.mdx) pushes the result to hardware.

This page covers the behavior worth knowing in detail. For a walkthrough of the panel, see [Equalizing audio](../guide-for-users/equalizing.mdx); operators can set defaults under [`EQUALIZER`](../guide-for-admins/customize-page.mdx#equalizer).

## The panel tour

The first time the panel opens, a five-step tour points out the source picker, the band list,
AutoEQ, the audio player with History & Compare, and Hardware EQ. If the welcome tour is still
showing, it waits for that one to close. Replay it with the **?** button at the right end of the
panel's top bar; **Show tutorial again** in the Misc panel replays the welcome tour.

## The Equalizer toggle

Nothing in the panel reaches the graph or the audio player until the master **Equalizer** switch at
the top of the panel is on. Actions that only make sense with EQ live turn it on for you:

- Importing a filter file
- Running AutoEQ
- Pulling filters from a connected device (Hardware EQ)
- Adding the **first** band to an empty filter list
- Giving a band gain while every band is still flat — where a graphic-EQ preset leaves you, with
  its bands laid out at 0 dB

Other edits to bands you already have do not touch the switch. Turning EQ off to compare against the raw
curve while you tweak is a deliberate workflow — hold <kbd>\\</kbd> for a momentary A/B flip in
either direction — so nothing re-enables it under you.

## Per-channel EQ

At the top of the filter list is a **Channel** switch with three positions — **L+R**, **L** and **R**.
It chooses which bands the list below is editing:

- **L+R** — shared bands. They apply to both ears, which is how every EQ behaved before this
  existed, and it preserves whatever channel imbalance the unit has.
- **L** / **R** — bands for that ear alone, stacked on top of the shared ones.

The count beside each label is how many bands live in that bucket. While scoped to one ear the list
shows only that ear's bands, with a line underneath reporting how many shared bands also reach it.
A band's **Applies to** control (expand the band to see it) moves it between buckets.

What each ear actually plays is *shared + that ear's own bands*. The preamp is a single number sized
for whichever ear needs the most headroom, and the on-graph average is recomputed as the mean of the
two equalized channels — so a left-only correction visibly moves the average too.

Two things to know:

- **AutoEQ follows the switch.** In **L+R** it optimizes against the average, preserving the unit's
  natural imbalance. Scoped to one ear it optimizes against that ear's measurement and replaces only
  that bucket, leaving the shared bands and the other ear alone. Running it once per ear is how you
  correct imbalance and match a target at the same time.
- **Hardware EQ is shared-only.** Hardware EQ slots have no channel concept, so pushing to a device
  sends the shared bands and warns you about the left/right bands it had to skip. The graph, the
  audio preview and file export all carry the full per-channel EQ.

See [Equalizing audio](../guide-for-users/equalizing.mdx#per-channel-eq-l--r) for the workflow.

## EQ one run of a sample set

A [sample set](../guide-for-admins/manage-data.mdx#sample-sets) draws as the average of its runs, and by default
that average is what the EQ applies to. When the runs are different fits — insertion depths, pad
positions — the average is a fit nobody actually wears: it blurs the treble peaks that move with
depth into one gentle bump, and AutoEQ fits to that blur.

The source picker at the top of the panel lists a sample set's runs under it. Pick one and the EQ
curve, AutoEQ, the band handles and the hover readout all use that run; the device row itself
(marked **Average**) goes back to the average. While EQ is on, the dimmed "before" curve is the
picked run, and the EQ curve's label names it — `IEM (EQ · Deep)`.

The pick belongs to the variant it was made on. Switch the device to another variant and the EQ
returns to the average, since run 2 of one set has nothing to do with run 2 of another. Share links
don't record the source at all, so a shared EQ opens on the average.

## EQ constraints

An EQ constraint limits the band list to what a particular EQ engine accepts — a DAC's hardware EQ,
a music player's equalizer, a fixed 10-band graphic EQ. The **constraint** button at the end of the
band list's toolbar picks one:

- **Built-in** — *Default (unlimited)*, which constrains nothing, and a generic 10-band graphic EQ.
- **Connected device** — the device [Hardware EQ](./device-peq.mdx) is connected to, while it is.
- **Recently picked**, **Software EQs** and **Hardware** — profiles from
  [eqcaps](https://github.com/potatosalad775/eqcaps), an open database of EQ limits, for planning an
  EQ for an app or a device you don't have plugged in. Profiles not yet checked against the real
  thing are marked *draft*. The database is fetched the first time the picker opens; the built-ins
  work without it.

A constraint can do more than cap the band count. Each band slot has its own filter types and its own
frequency, Q and gain range — a device whose first band is a low shelf from 20 to 300 Hz, say — and
ranges can be stepped (gain in 0.5 dB steps) or a list of allowed values. The band list follows the
slot each band sits in: number boxes and sliders span its range and step by its grid, only its filter
types are offered, and a value it fixes is shown read-only. Hover a box to see what is allowed.

- **Picking a constraint** folds the bands onto it, as one undoable step: values move to the nearest
  allowed ones and bands past the cap are dropped. A graphic EQ always gets one row per band,
  each with its gain slider in the row, ready to drag.
- **Connecting a device** doesn't touch the bands. Whatever the device can't hold is marked, and
  **Fit** in the bar above the list folds them when you choose to.
- **Editing** snaps each value onto what its slot allows, as you type or drag.
- While a constraint is active, a bar above the band list names it; its **×** returns to unlimited.

Importing a filter file switches back to *Default (unlimited)* first, so the file lands as written.

## History & Compare \{#history-and-compare\}

The **History & Compare** section of the panel keeps earlier versions of your EQ so you can go back
to one, keep it, or listen to two side by side.

- **History** logs your edits automatically. A burst of changes — dragging a slider — becomes one
  entry. It lasts for the session and starts over when you pick another source device. The trash
  button clears it; an entry's **⋯** menu deletes just that one.
- **Bookmarks** keep an entry for good. Star a History entry to bookmark it; it is named after its
  strongest band and the date, and **⋯ → Rename** changes that. Bookmarks are stored in this browser
  only, separately on each site, and are listed for every device — your current device's come first.
  They are removed one at a time from the Bookmarks tab, never by clearing History, and a browser
  keeps at most 200.

### A/B comparison

Press **A** or **B** on any two entries — in either tab, so A can be a bookmark and B a recent edit —
then switch between them with the **A** and **B** buttons at the top. Two options appear once both
are picked:

- **Match loudness** plays the louder of the two at the quieter one's level, so you compare tone
  rather than volume. It measures loudness the way streaming services do (K-weighted) and only ever
  turns the sound down. It applies to the audio player on this page only — not to
  [Hardware EQ](./device-peq.mdx) or the uniPEQ link, where the device or app owns the preamp — and
  it stops as soon as you edit a band, since you are no longer comparing A with B.
- **Show on graph** draws the side that isn't playing as a dashed line on top of the graph, so you
  can see what a switch changes.

To keep an entry on the graph for longer, **⋯ → Add to graph** inserts it as a curve of its own: the
current source device with that entry's bands, which you can hide, recolor or remove like any other.

### Entries that don't fit the constraint

An entry made under a looser [EQ constraint](#eq-constraints) — more bands, or values outside the
active one's ranges — is marked **Doesn't fit** with the constraint's name, and its A/B buttons are
unavailable. Nothing reshapes it to fit: applying it would silently change what you saved. Switch
back to a constraint it fits, or rebuild it under the new one.

## Importing filter files

**Import EQ** reads Equalizer APO's parametric format, the text AutoEq, squig.link tools and APO
itself write:

```
Preamp: -6.0 dB
Channel: L
Filter 1: ON PK Fc 40 Hz Gain 5.0 dB Q 1.41
Channel: R
Filter: ON PK Fc 45 Hz BW Oct 0.7 Gain 4.5 dB
```

- **Channels** — `Channel: L` or `Channel: 1` sends the filters that follow to the left ear,
  `R` or `2` to the right; `ALL`, `L R` and `1 2` mean both. Other layouts import as both ears.
- **Filters** — `PK`, plus low and high shelves (`LSC`/`LS`, `HSC`/`HS`). Bandwidth (`BW Oct`) and a
  shelf slope (`LSC 12 dB Fc …`) convert to Q exactly; a shelf with neither gets APO's default
  12 dB/oct. The filter number is optional, as in APO, and `OFF` imports as a disabled band.
- **Skipped** — filter types the equalizer can't model (band-pass, notch, all-pass, low/high-pass,
  the corner-frequency `LS 6dB` / `HS 12dB` shelves) are left out, and a warning says how many.
  `Preamp:` is ignored; the preamp is always derived from the filters.

## AutoEQ band count

**Run AutoEQ** generates as many bands as the filter list already holds, so adding five bands before
running is how you ask for a five-band result. With an empty list it falls back to **8** bands.

Operators can change that fallback with `EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT` — see
[Customizing the Page](../guide-for-admins/customize-page.mdx#equalizer). Either way, the active
[constraint](#eq-constraints)'s band cap wins: a connected 5-band device gets 5, and a constraint
with no cap at all is held to 32. AutoEQ also stays inside the constraint's frequency, Q and gain
ranges, gives the shelves their own gain range where the constraint does, and leaves the shelves
out where it has no slot for them.

The count is the total. With **Use shelf filters** on, two of those bands are the low and high
shelf: ten bands is eight peaking filters plus the pair. Below four bands the shelves are dropped,
because spending the whole budget on them corrects nothing but overall tilt.

AutoEQ makes peaking and shelf filters only. Any other band in the list — a high or low pass, a
band pass, a notch or an all-pass, from an imported config or read from a device — stays where it
is, and the fit corrects around it: its response counts as part of the source curve, and its slot
comes out of the band count.

## Auto-apply

Once a run lands, **Run AutoEQ** becomes **Recalculate**, and the **Auto-apply** switch beside it
keeps the result current. While it is on, AutoEQ runs again whenever the source or target curve
changes — a tilt or bass shelf from the target customizer, say — or when an AutoEQ option does.
Switching it on runs once straight away.

- It re-runs with the band count and channel it was switched on with. Scoping the list to one ear
  doesn't change what it fits; to change the band count, add or remove bands and press
  **Recalculate**.
- The re-runs fold into one undo entry, so a single undo returns to the filters from before AutoEQ.
- An auto-applied run leaves the Equalizer toggle alone, so you can switch EQ off to compare while
  nudging the target.
- It keeps running from other panels, which is how you tilt a target in the Graph panel and watch
  the EQ follow.

It switches itself off, and says why, rather than overwrite something it can no longer vouch for:

- the filters are edited by hand — adding, removing or dragging a band, undo, import, or a History &
  Compare switch;
- a different source device, sample run or target is selected, or the target is removed;
- the source switches to another variant while a sample run was being fitted;
- the EQ preset changes;
- the fallback optimizer answered (see [The optimizer](#the-optimizer)). It is too slow to follow
  every change, so the switch stays unavailable until a run succeeds with turboEQ.

## The optimizer

AutoEQ runs [turboEQ](https://github.com/potatosalad775/turboEQ), a WebAssembly port of
[AutoEq](https://github.com/jaakkopasanen/AutoEq)'s optimizer, which fits every filter at once. A
run with the default eight bands takes a few milliseconds, over a hundred times faster than the
optimizer it replaced, and returns exactly the bands it was asked for. See
[AutoEQ Benchmarks](./autoeq-benchmarks.mdx) for measurements against CrinGraph and AutoEq itself.

### Fit mode

**Exact match** is the default. It fits the curve the way the graph shows it: the full shape up to
20 kHz, with bands allowed anywhere in the frequency range. Narrow, deep bands are allowed when the
curve calls for them, up to the Q range you set.

**Treble-safe** is jaakkopasanen AutoEQ's own, more cautious fit. AutoEq smooths the treble above about 8 kHz, judges
only its overall level above 10 kHz and places no band above 10 kHz. Treble measurements can vary a lot depending
on a fit, seating, and physical characteristic of every rig, so this corrects only what a measurement can be trusted for. 
Choose it when you don't trust your treble data, or when the EQ is for listening rather than for matching the exact graph.

In either mode, the gain range's maximum caps the largest boost the whole EQ may apply, not only
each band. The preamp follows automatically, so a bigger boost costs loudness rather than clipping.
Lower the maximum if you would rather keep the level up.

The frequency, Q and gain ranges are **bounds the fit works within**, exactly as you set them, not
a clamp applied to the result afterwards: narrowing them changes what the optimizer looks for rather
than trimming what it found. The frequency range says where a band may sit — the fit is still judged across the whole
axis, so a narrow range leaves the rest of the curve alone instead of pretending it is already
correct.

With **Use shelf filters** on, the fit places the low and high shelf itself, choosing their
frequency and Q as well as their gain. Shelf Q stays between 0.4 and 0.7, since a steeper shelf
overshoots into a bump that a peaking band does better.

Graphic-EQ presets fit too. Frequency and Q come from the preset's own bands and only gain is
optimized, so every band lands exactly on its slider.

If the module cannot load for any reason, the older JavaScript optimizer answers instead, and the
AutoEQ panel says so. It is slower and fits less well, and it sometimes returns fewer bands than 
it was asked for, but a failed load never costs you a working AutoEQ. It has only one way to fit,
the same as Exact match, so the fit mode is hidden until turboEQ loads again. It cannot keep bands
on a graphic EQ's sliders, so with a graphic-EQ preset AutoEQ leaves the filters as they are and
says why.

turboEQ can also turn down a particular request while loading fine — Treble-safe with a frequency
range entirely above 10 kHz, for example, since that mode places no band there. The older optimizer
answers that request too, and the panel says the settings were the problem; the fit mode stays, so
you can switch to Exact match.