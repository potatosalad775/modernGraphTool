---
title: Equalizing audio
description: An overview of the Equalizer panel — parametric filters, AutoEQ,
  audio preview, and hardware device PEQ.
editUrl: true
head: []
template: doc
sidebar:
  order: 10
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

The **Equalizer panel** lets you design a parametric EQ, preview it with real audio, and optionally send it to a compatible hardware device. This page is the user-guide-level introduction. The full feature reference lives at [Equalizer](../features/equalizer.mdx), and hardware bridging is documented at [Device PEQ](../features/device-peq.mdx).

{/* TODO: screenshot of Equalizer panel with a couple of filters added and the audio player visible */}

## What EQ is for, in one paragraph

A headphone measurement shows you exactly where a device is louder or quieter than you'd like. **EQ lets you digitally counteract those differences** before the audio reaches the headphone — turning down a peak at 5 kHz, boosting the sub-bass a little, softening sibilance on vocals. It's the same principle as the bass/treble knobs on an old stereo, just more precise and more surgical.

modernGraphTool's EQ panel works on measurements, not on arbitrary audio files. You pick a loaded device, add filters, and see both the modified measurement curve on the graph and — if you enable playback — hear the filters applied to a test audio sample in your browser.

## The panel at a glance

Opening the Equalizer panel (third menu icon, or press **3** on desktop) shows you:

- A **master enable switch** at the top — flip it off to temporarily disable the whole EQ without losing your filters.
- A **phone/target selector** next to the switch — tells the EQ which loaded curve to modify.
- A **filter list** — the actual EQ bands, headed by a **channel switch** (**L+R**, **L** or **R**) that chooses which ear the list edits.
- Three collapsible sections underneath: **AutoEQ**, **Audio player**, and **Device PEQ**.

## Building an EQ by hand

In the filter list, click to add a filter. Each filter has:

- **Type** — Peaking (a bump or dip centered on a frequency), Low Shelf (everything below a corner), High Shelf (everything above a corner).
- **Frequency** — where on the X axis the filter is centered.
- **Gain** — positive values boost, negative values cut (in dB).
- **Q** — how wide or narrow the effect is. Higher Q = narrower.

As you adjust, the graph updates live — you'll see a new curve appear showing the device-plus-EQ combination, so you can compare the corrected curve against your target in real time. Preamp gain is calculated automatically to prevent digital clipping when you add lots of boosts.

The minimum viable workflow is:

1. Pick a loaded phone in the phone selector.
2. Flip the enable switch on.
3. Add a filter, set it to Peaking, drag it to the frequency you want to fix, and set the gain.
4. Check the graph to see the corrected curve land on (or close to) the target.

## Per-channel EQ (L / R)

No two drivers measure identically. Most of the time you want to leave that alone — the small
left-to-right difference is part of how your unit sounds, and correcting the average is enough. But
if one ear is noticeably quieter, or you want both ears to land on the target rather than merely
their average, you need the two channels equalized separately.

That's what the **channel switch** at the top of the filter list is for:

- **L+R** — bands that apply to both ears. This is the default and what every EQ did before this
  feature existed.
- **L** or **R** — bands for that ear only, applied *on top of* the shared ones.

Switching to **L** or **R** shows only that ear's bands, with a note underneath telling you how many
shared bands also reach it. If the graph was showing the averaged curve, it expands to draw L and R
separately so you can see what you're doing. To move an existing band between buckets, expand it and
use **Applies to**.

### Correcting channel imbalance

1. Load your headphone and select it in the Equalizer panel.
2. Pick a target in the **AutoEQ** section.
3. Switch the channel selector to **L**, run AutoEQ. Switch to **R**, run it again.

Each run only replaces its own bucket, so the two solutions coexist. Both ears now land on the
target and the imbalance is gone.

To keep the imbalance and just fix the overall tuning, stay on **L+R** — AutoEQ there works from the
average, which leaves the difference between the channels untouched.

:::note[Where per-channel EQ applies]
The graph, the audio preview and the exported filter file all carry the full per-channel EQ. **Device
PEQ does not** — hardware EQ slots have no channel concept, so a push sends the shared bands only and
tells you how many left/right bands it skipped.
:::

## AutoEQ

If you don't want to hand-design filters, open the **AutoEQ** accordion section. It walks through three steps:

1. **Pick a target** to match (any loaded target).
2. **Click the AutoEQ button**, which analyzes the difference between the device and the target and generates a set of filters that minimizes it.
3. **Apply** the filters to the filter list. Tweak further from there if you want.

AutoEQ can optionally include Low Shelf / High Shelf filters in its output as well as Peaking, which usually produces a flatter match with fewer bands.

AutoEQ follows the channel switch: on **L+R** it works from the averaged curve, and scoped to one ear it works from that ear's measurement and replaces only that ear's bands.

## Audio preview

Open the **Audio player** section to listen to the EQ applied to a test audio sample. Play/pause and a mute toggle give you a quick way to A/B the corrected vs uncorrected sound.

:::caution[Browser autoplay]
Most browsers block audio from starting automatically until you interact with the page. If the player seems dead when you hit play, click anywhere on the page first, then try again. This is a browser policy, not a tool bug.
:::

The player uses the Web Audio API, so CPU usage goes up slightly while it's running — particularly with many EQ bands.

Playback continues across panel switches — switching to the Graph or Device panel won't stop the audio. Return to the Equalizer panel and use the player's stop button when you're done.

## Device PEQ — push EQ to hardware

Some USB DACs, Bluetooth adapters, and even a few headphones have **onboard parametric EQ slots** that apply EQ in hardware instead of in software. The **Device PEQ** section lets modernGraphTool talk directly to those devices over WebUSB / WebSerial / WebHID / WebBluetooth and push your filter list into the device's own EQ memory. Unplug your computer and the EQ stays loaded.

Supported devices, connection instructions, and troubleshooting all live in [Device PEQ](../features/device-peq.mdx). In brief:

- **Chrome and Edge** have the best support for the Web APIs this feature uses.
- **Firefox** works for some device classes but not others.
- **Safari** doesn't support WebUSB at all, so Device PEQ doesn't work there.

## Import and export

You can **export** your current filter set as a text file (compatible with common EQ formats) and **import** one back in later. Useful for:

- Sharing a specific EQ with someone else.
- Keeping a library of presets for different headphones.
- Moving an EQ between modernGraphTool and a system-wide EQ application.

The import/export controls live inside the filter list. See [Equalizer](../features/equalizer.mdx) for format details.

Per-channel bands survive the round trip. The exported file uses Equalizer APO's `Channel:` syntax — a `Channel: ALL` section for the shared bands, then `Channel: L` and `Channel: R` — and import reads it back into the same buckets. An EQ with no per-channel bands exports without any `Channel:` lines at all, exactly as before, so existing presets and other tools are unaffected.

The **Graphic EQ** export is a single curve with no channel syntax, so when you have per-channel bands it writes two files instead of one — an `L` and an `R`, each combining the shared bands with that ear's own.

---

Next: [Sharing and exporting](./sharing-and-exporting.mdx).